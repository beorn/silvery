/**
 * render-trace.ts — Render-boundary instrumentation for the Visual Eyes epic.
 *
 * Phase 4 of the Visual Eyes epic. Each silvery render-pass becomes an
 * observable `RENDER_DISPATCHED` event annotated with WHY it rendered:
 *
 *   { ts, reason, dirtyRegions, signalDelta, fiberHash }
 *
 * A frame-trace consumer (e.g. termless's `createFrameTracer`) joins these
 * events onto its numbered frames by timestamp, so a trace frame's metadata
 * answers "what made this render happen" instead of just "the buffer changed".
 *
 * ## Design — additive instrumentation only
 *
 * This module emits an event AFTER the existing reconciler-flush + render
 * pipeline boundary in `renderer.ts`'s `doRender()`. It changes NO rendering
 * behavior, NO dirty-flag logic, NO pipeline ordering. It only reads state
 * the renderer already computed and writes it to an opt-in sink.
 *
 * ## Zero-cost when disabled
 *
 * The whole module is gated by the `SILVERY_TRACE_FRAMES` env var. When
 * unset, `isRenderTraceEnabled()` is `false`, `emitRenderDispatched()`
 * returns immediately, and the renderer's call site is a single boolean
 * check — production rendering pays nothing.
 *
 * ## Channel choice — sidecar JSONL + in-process bus
 *
 * `SILVERY_TRACE_FRAMES` names a directory (the same dir a termless
 * frame-trace writes its `index.jsonl` into). silvery appends render
 * events to `<dir>/render-events.jsonl`, one JSON object per line. termless
 * reads + joins on `ts`. This is the simplest robust channel for
 * `bun km view <vault>` — silvery and termless run in one process but are
 * separate packages with no shared module; a filesystem sidecar needs no
 * cross-package wiring and survives process boundaries too. Terminal-output
 * events are written to `<dir>/render-output-events.jsonl` with bytes,
 * changed-cell counts, dirty-row counts, and output-phase reason.
 *
 * A process-global in-memory ring buffer (`globalThis.__silvery_render_events`)
 * is also maintained so a same-process consumer can read events without
 * touching the filesystem.
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { createLogger } from "loggily"
import type { OutputPhaseDiagnostics } from "../pipeline/output-phase"

const renderLog = createLogger("silvery:render")
const outputLog = createLogger("silvery:render:output")

/**
 * A render-boundary event. Emitted once per `doRender()` flush when render
 * tracing is enabled.
 */
export interface RenderDispatchedEvent {
  /** Event type discriminator. */
  type: "RENDER_DISPATCHED"
  /** Wall-clock ms epoch — the join key for frame-trace consumers. */
  ts: number
  /** Monotonic render counter from the renderer (1-based). */
  renderCount: number
  /**
   * Why this render ran. Human-readable, derived from the dirty bits that
   * were set on the root node + dimension changes. E.g.
   * `"content,subtree"`, `"dims-changed"`, `"initial"`.
   */
  reason: string
  /**
   * Dirty regions of the produced buffer — contiguous row ranges that the
   * render pipeline marked dirty. `[]` when nothing was dirty (skip render).
   */
  dirtyRegions: { row: number; height: number }[]
  /**
   * What the render pipeline did this pass — a compact "signal delta":
   * how many nodes were visited / rendered / skipped. Sourced from the
   * render-phase stats the pipeline already computes. This is the
   * cheapest faithful proxy for "what changed since the last flush" —
   * the render phase only re-renders nodes whose layout/content signals
   * actually changed.
   */
  signalDelta: {
    nodesVisited: number
    nodesRendered: number
    nodesSkipped: number
    incremental: boolean
  }
  /**
   * A cheap structural hash of the fiber tree as committed this pass:
   * `<rootNodeCount>:<rootDirtyEpoch>`. Two renders with the same fiberHash
   * committed the same tree shape at the same epoch. Not a cryptographic
   * hash — a fast change-detector.
   */
  fiberHash: string
}

/**
 * Output-phase diagnostics attached to an emitted terminal frame. This is
 * deliberately a compact clone of the bytes_out monitor's frame summary:
 * render traces need the same changed-cell explanation without waiting for
 * bytes_out thresholds to trip.
 */
export type RenderOutputFrameDiagnostics = Partial<OutputPhaseDiagnostics> & {
  /**
   * Where these bytes came from. Omitted for the ordinary render-frame path
   * to preserve existing trace shape; terminal side-channel writes set this.
   */
  source?: "terminal-artifact" | "post-paint-write" | "terminal-protocol"
  /** Protocol/component owner for terminal artifacts, e.g. image:kitty:transmit. */
  owner?: string
  /** Flush phase for terminal artifacts. */
  phase?: "setup" | "runtime" | "cleanup" | "pre-paint" | "post-paint"
  /** Artifact discriminator from the runtime queue. */
  artifactKind?: string
  /** UTF-16 string length written before terminal-output wrapping. */
  outputChars?: number
  /** Extra hardware-cursor suffix length appended outside outputPhase(). */
  cursorChars?: number
  /** True when the frame was wrapped in DEC synchronized-output markers. */
  syncWrapped?: boolean
}

/**
 * Output-frame event. Emitted once per terminal write when render tracing is
 * enabled. Stored in a dedicated sidecar so existing `render-events.jsonl`
 * consumers keep seeing only RENDER_DISPATCHED events.
 */
export interface RenderOutputFrameEvent {
  /** Event type discriminator. */
  type: "RENDER_OUTPUT"
  /** Wall-clock ms epoch — the join key for frame-trace consumers. */
  ts: number
  /**
   * Render counter from the current renderer/scheduler at write time. In
   * createApp this counter is local to the current event batch; use
   * outputFrame for monotonic ordering.
   */
  renderCount: number
  /** Monotonic output-write counter, 1-based for this process/app handle. */
  outputFrame: number
  /** Bytes actually written for this frame. */
  bytes: number
  /** Output-phase reason, dimensions, changed-cell counts, and write shape. */
  diagnostics: RenderOutputFrameDiagnostics
}

/**
 * Source values the renderer hands to `emitRenderDispatched`. The renderer
 * already has all of these in scope at the flush boundary; this module just
 * shapes them into the event.
 */
export interface RenderTraceInput {
  renderCount: number
  /** Dirty-bit names captured BEFORE the pipeline consumed the flags. */
  dirtyReasons: string[]
  /** True when this render ran because terminal dims changed. */
  dimsChanged: boolean
  /** Height of the produced buffer (rows). */
  bufferHeight: number
  /** Per-row dirty predicate over the produced buffer. */
  isRowDirty: (y: number) => boolean
  /** Render-phase signal delta (visited/rendered/skipped). */
  signalDelta: RenderDispatchedEvent["signalDelta"]
  /** Root node count for the fiber hash. */
  rootNodeCount: number
  /** Root dirty epoch for the fiber hash. */
  rootDirtyEpoch: number
}

// ── Env gate ────────────────────────────────────────────────────────────────
//
// `SILVERY_TRACE_FRAMES` names the trace directory. `DEBUG=silvery:render*`
// enables the same in-process/loggily trace without a sidecar. Both gates
// are read lazily so the trace surface is testable and opt-in.

// The sidecar each stream last opened. A trace dir seen for the first time starts its file empty, so a changed
// SILVERY_TRACE_FRAMES opens a fresh sidecar instead of appending to the old dir's.
let sidecarFile: string | null = null
let outputSidecarFile: string | null = null

function openSidecar(traceDir: string, name: string, open: string | null): string {
  const file = join(traceDir, name)
  if (file === open) return file
  if (!existsSync(traceDir)) mkdirSync(traceDir, { recursive: true })
  appendFileSync(file, "", { flag: "w" })
  return file
}

/** The configured trace directory, or `null` when `SILVERY_TRACE_FRAMES` is unset. */
export function renderTraceDir(): string | null {
  return process.env.SILVERY_TRACE_FRAMES?.trim() || null
}

/** True when sidecar or loggily render tracing is active. */
export function isRenderTraceEnabled(): boolean {
  return renderTraceDir() !== null || renderLog.debug !== undefined || outputLog.debug !== undefined
}

// ── In-process event bus ────────────────────────────────────────────────────
//
// A bounded ring of recent events on globalThis so a same-process consumer
// (km-tui wiring both silvery + termless) can read events without filesystem
// round-trips. Bounded so a long-running app can't leak.

const MAX_BUFFERED_EVENTS = 4096

interface RenderEventBus {
  events: RenderDispatchedEvent[]
  outputEvents: RenderOutputFrameEvent[]
}

function bus(): RenderEventBus {
  const g = globalThis as { __silvery_render_events?: RenderEventBus }
  if (!g.__silvery_render_events) {
    g.__silvery_render_events = { events: [], outputEvents: [] }
  } else if (!g.__silvery_render_events.outputEvents) {
    g.__silvery_render_events.outputEvents = []
  }
  return g.__silvery_render_events
}

/**
 * Recent render events from the in-process bus. Consumers running in the
 * same process as silvery (e.g. a km-tui-wired termless tracer) can poll
 * this instead of reading the sidecar file.
 */
export function recentRenderEvents(): readonly RenderDispatchedEvent[] {
  return bus().events
}

/**
 * Recent output-frame events from the in-process bus. Same-process consumers
 * can join these with `recentRenderEvents()` by timestamp and frame order.
 */
export function recentRenderOutputEvents(): readonly RenderOutputFrameEvent[] {
  return bus().outputEvents
}

// ── Emit ────────────────────────────────────────────────────────────────────

/** Convert the buffer's per-row dirty predicate into contiguous ranges. */
function dirtyRegionsFromBuffer(
  height: number,
  isRowDirty: (y: number) => boolean,
): { row: number; height: number }[] {
  const regions: { row: number; height: number }[] = []
  let runStart = -1
  for (let y = 0; y < height; y++) {
    if (isRowDirty(y)) {
      if (runStart === -1) runStart = y
    } else if (runStart !== -1) {
      regions.push({ row: runStart, height: y - runStart })
      runStart = -1
    }
  }
  if (runStart !== -1) {
    regions.push({ row: runStart, height: height - runStart })
  }
  return regions
}

/**
 * Emit a `RENDER_DISPATCHED` event for the just-completed render pass.
 *
 * No-op when `SILVERY_TRACE_FRAMES` is unset. Called from `renderer.ts`'s
 * `doRender()` at the flush boundary — AFTER reconciliation + the render
 * pipeline, just before the buffer is returned. Purely additive: reads
 * already-computed state, writes to the opt-in sink, never throws into the
 * render path.
 */
export function emitRenderDispatched(input: RenderTraceInput): void {
  const traceDir = renderTraceDir()
  const logEnabled = renderLog.debug !== undefined
  if (traceDir === null && !logEnabled) return
  try {
    const reasonParts: string[] = [...input.dirtyReasons]
    if (input.dimsChanged) reasonParts.push("dims-changed")
    const event: RenderDispatchedEvent = {
      type: "RENDER_DISPATCHED",
      ts: Date.now(),
      renderCount: input.renderCount,
      reason: reasonParts.length > 0 ? reasonParts.join(",") : "initial",
      dirtyRegions: dirtyRegionsFromBuffer(input.bufferHeight, input.isRowDirty),
      signalDelta: input.signalDelta,
      fiberHash: `${input.rootNodeCount}:${input.rootDirtyEpoch}`,
    }

    // In-process bus (bounded ring).
    const b = bus()
    b.events.push(event)
    if (b.events.length > MAX_BUFFERED_EVENTS) {
      b.events.splice(0, b.events.length - MAX_BUFFERED_EVENTS)
    }

    renderLog.debug?.("render dispatched", { ...event })

    // Sidecar JSONL — lazily created on first emit so a disabled trace dir
    // never gets touched.
    if (traceDir !== null) {
      sidecarFile = openSidecar(traceDir, "render-events.jsonl", sidecarFile)
      appendFileSync(sidecarFile, JSON.stringify(event) + "\n")
    }
  } catch {
    // Tracing must never destabilise rendering. Swallow any sink error
    // (full disk, permission, race) — the in-process bus still has the
    // event if the push succeeded before the throw.
  }
}

export interface RenderOutputFrameInput {
  renderCount: number
  outputFrame: number
  bytes: number
  diagnostics?: RenderOutputFrameDiagnostics | null
}

/**
 * Emit a `RENDER_OUTPUT` event for bytes actually written to the terminal.
 *
 * No-op when `SILVERY_TRACE_FRAMES` is unset. This is intentionally separate
 * from `emitRenderDispatched`: the render pipeline produces dirty regions,
 * while the output phase later decides which cells/bytes were emitted.
 */
export function emitRenderOutputFrame(input: RenderOutputFrameInput): void {
  const traceDir = renderTraceDir()
  const logEnabled = renderLog.debug !== undefined || outputLog.debug !== undefined
  if (traceDir === null && !logEnabled) return
  try {
    const event: RenderOutputFrameEvent = {
      type: "RENDER_OUTPUT",
      ts: Date.now(),
      renderCount: input.renderCount,
      outputFrame: input.outputFrame,
      bytes: input.bytes,
      diagnostics: input.diagnostics ? { ...input.diagnostics } : {},
    }

    const b = bus()
    b.outputEvents.push(event)
    if (b.outputEvents.length > MAX_BUFFERED_EVENTS) {
      b.outputEvents.splice(0, b.outputEvents.length - MAX_BUFFERED_EVENTS)
    }

    outputLog.debug?.("render output", { ...event })

    if (traceDir !== null) {
      outputSidecarFile = openSidecar(traceDir, "render-output-events.jsonl", outputSidecarFile)
      appendFileSync(outputSidecarFile, JSON.stringify(event) + "\n")
    }
  } catch {
    // Tracing must never destabilise rendering. Swallow sink errors.
  }
}
