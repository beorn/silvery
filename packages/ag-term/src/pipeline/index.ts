/**
 * Silvery Render Pipeline
 *
 * The 5-phase rendering architecture:
 *
 * Phase 0: RECONCILIATION (React)
 *   React reconciliation builds the SilveryNode tree.
 *   Components register layout constraints via props.
 *
 * Phase 1: MEASURE (for fit-content nodes)
 *   Traverse nodes with width/height="fit-content"
 *   Measure intrinsic content size
 *   Set Yoga constraints based on measurement
 *
 * Phase 2: LAYOUT
 *   Run yoga.calculateLayout()
 *   Propagate computed dimensions to all nodes
 *   Notify useContentRect() subscribers
 *
 * Phase 3: CONTENT RENDER
 *   Render each node to the TerminalBuffer
 *   Handle text truncation, styling, borders
 *
 * Phase 4: DIFF & OUTPUT
 *   Compare current buffer with previous
 *   Emit minimal ANSI sequences for changes
 */

import { createLogger } from "loggily"
import type { TerminalBuffer } from "../buffer"
import type { CursorState } from "@silvery/ag-react/hooks/useCursor"
import type { AgNode } from "@silvery/ag/types"
import { runWithMeasurer, type Measurer } from "../unicode"
import type { OutputPhaseFn } from "./output-phase"
import type { PipelineContext } from "./types"
import { createAg } from "../ag"

const log = createLogger("silvery:render")
const baseLog = createLogger("@silvery/ag-react")

// Re-export types
export type {
  CellChange,
  BorderChars,
  PipelineContext,
  NodeRenderState,
  ClipBounds,
  RenderPhaseStats,
  NodeTraceEntry,
  BgConflictMode,
} from "./types"

// Re-export phase functions
export { measurePhase } from "./measure-phase"
export {
  layoutPhase,
  rectEqual,
  scrollPhase,
  stickyPhase,
  screenRectPhase,
  notifyLayoutSubscribers,
} from "./layout-phase"
export { renderPhase, clearBgConflictWarnings, setBgConflictMode } from "./render-phase"
export { renderPhaseAdapter } from "./render-phase-adapter"
export { outputPhase } from "./output-phase"

import { renderPhaseAdapter } from "./render-phase-adapter"
import { clearBgConflictWarnings, renderPhase } from "./render-phase"
import { layoutPhase, notifyLayoutSubscribers, screenRectPhase, scrollPhase, stickyPhase } from "./layout-phase"
// Import for orchestration
import { measurePhase } from "./measure-phase"
import { outputPhase } from "./output-phase"

// ============================================================================
// Execute Render (Orchestration)
// ============================================================================

/**
 * Options for executeRender.
 */
export interface ExecuteRenderOptions {
  /**
   * Render mode: fullscreen or inline.
   * Default: 'fullscreen'
   */
  mode?: "fullscreen" | "inline"

  /**
   * Skip notifying layout subscribers.
   * Use for static/one-shot renders where layout feedback isn't needed.
   * Default: false
   */
  skipLayoutNotifications?: boolean

  /**
   * Skip scroll state updates.
   * Use for fresh render comparisons (SILVERY_STRICT) to avoid mutating state.
   * Default: false
   */
  skipScrollStateUpdates?: boolean

  /**
   * Number of lines written to stdout between renders (inline mode only).
   * Used to adjust cursor positioning when external code (e.g., useScrollback)
   * writes directly to stdout between renders.
   * Default: 0
   */
  scrollbackOffset?: number

  /**
   * Terminal height in rows (inline mode only).
   * Used to clamp cursor-up offset when content exceeds terminal height.
   * Without this, content taller than the terminal causes rendering corruption
   * because cursor-up can't reach lines that scrolled off screen.
   */
  termRows?: number

  /**
   * Cursor position from useCursor() (inline mode only).
   * When provided, the output phase positions the real terminal cursor
   * at this location instead of leaving it at the end of content.
   */
  cursorPos?: CursorState | null
}

/**
 * Pipeline configuration from withRender().
 * Carries term-scoped width measurer and output phase.
 */
export interface PipelineConfig {
  /** Width measurer scoped to terminal capabilities */
  readonly measurer: Measurer
  /** Output phase function scoped to terminal capabilities */
  readonly outputPhaseFn: OutputPhaseFn
}

/**
 * Execute the full render pipeline.
 *
 * Pass null for prevBuffer on the first render; pass the returned buffer on
 * subsequent renders to enable incremental content rendering (<1ms vs 20-30ms).
 * SILVERY_DEV=1 warns at runtime if prevBuffer is null after the first frame.
 */
export function executeRender(
  root: AgNode,
  width: number,
  height: number,
  prevBuffer: TerminalBuffer | null,
  options: ExecuteRenderOptions | "fullscreen" | "inline" = "fullscreen",
  config?: PipelineConfig,
): { output: string; buffer: TerminalBuffer } {
  // runWithMeasurer for backward compat: output-phase reads the scoped measurer global.
  // createAg handles measurer internally for layout/render phases.
  if (config?.measurer) {
    return runWithMeasurer(config.measurer, () => {
      return executeRenderCore(root, width, height, prevBuffer, options, config)
    })
  }
  return executeRenderCore(root, width, height, prevBuffer, options, config)
}

/** Internal: runs the full pipeline, delegating layout + render to createAg. */
function executeRenderCore(
  root: AgNode,
  width: number,
  height: number,
  prevBuffer: TerminalBuffer | null,
  options: ExecuteRenderOptions | "fullscreen" | "inline" = "fullscreen",
  config?: PipelineConfig,
): { output: string; buffer: TerminalBuffer } {
  // Normalize options (string shorthand for mode)
  const opts: ExecuteRenderOptions = typeof options === "string" ? { mode: options } : options
  const {
    mode = "fullscreen",
    skipLayoutNotifications = false,
    skipScrollStateUpdates = false,
    scrollbackOffset = 0,
    termRows,
    cursorPos,
  } = opts
  // Dev warning: prevBuffer null after first render means incremental is disabled.
  if (process?.env?.SILVERY_DEV && prevBuffer === null && root.prevLayout !== null && !skipLayoutNotifications) {
    log.warn?.(
      "executeRender called with prevBuffer=null on frame 2+ — " +
        "incremental content rendering is disabled (full render every frame). " +
        "Track the returned buffer and pass it as prevBuffer on subsequent renders.",
    )
  }

  const start = performance.now()

  // Delegate layout + render to ag
  const ag = createAg(root, { measurer: config?.measurer })
  ag.layout({ cols: width, rows: height }, { skipLayoutNotifications, skipScrollStateUpdates })
  const { buffer } = ag.render({ prevBuffer })

  const tLayout = performance.now() - start

  // Phase 4: Diff and output (not part of ag — lives in term.paint)
  let output: string
  let tOutput: number
  {
    const t4 = performance.now()
    const outputFn = config?.outputPhaseFn ?? outputPhase
    try {
      output = outputFn(prevBuffer, buffer, mode, scrollbackOffset, termRows, cursorPos)
    } catch (e) {
      if (e instanceof Error) {
        ;(e as any).__silvery_buffer = buffer
      }
      throw e
    }
    tOutput = performance.now() - t4
    log.debug?.(`output: ${tOutput.toFixed(2)}ms (${output.length} bytes)`)
  }

  const total = performance.now() - start

  // Expose timing for diagnostics
  ;(globalThis as any).__silvery_last_pipeline = {
    layout: tLayout,
    output: tOutput,
    total,
    incremental: prevBuffer !== null,
  }
  ;(globalThis as any).__silvery_render_count = ((globalThis as any).__silvery_render_count ?? 0) + 1

  // Bench instrumentation: accumulate output-phase timing.
  // ag.ts handles measure/layout/content accumulation; we add output + total here
  // since the output phase lives outside createAg.
  const acc = (globalThis as any).__silvery_bench_phases
  if (acc) {
    acc.output += tOutput
    acc.total += total
    acc.pipelineCalls += 1
  }

  log.debug?.(
    `pipeline: layout+render=${tLayout.toFixed(1)}ms output=${tOutput.toFixed(1)}ms total=${total.toFixed(1)}ms`,
  )

  return { output, buffer }
}

// ============================================================================
// Bench Instrumentation — per-phase timing accumulator
// ============================================================================

/**
 * Per-phase timing accumulator for benchmarking.
 *
 * Silvery's render pipeline is usually timed as a single `total` number. When
 * a bench harness wants to understand where time is going, it needs per-phase
 * breakdowns: measure, layout, content (render), output, plus the total.
 *
 * Phases map to the pipeline stages documented in `pipeline/index.ts` and
 * `pipeline/CLAUDE.md`. `reconcile` is NOT tracked here because it happens in
 * `create-app.tsx` outside this module — harnesses in that layer can add their
 * own reconcile timing to the same accumulator.
 */
export interface SilveryBenchPhases {
  /** Phase 1 — measure pass for fit-content nodes */
  measure: number
  /** Phase 2 — flexbox layout calculation */
  layout: number
  /** Phase 2.5 — scroll offset calculation */
  scroll: number
  /** Phase 2.6 — screen-rect propagation */
  screenRect: number
  /** Phase 2.7 — layout subscriber notifications */
  notify: number
  /** Sum of all layout-side phases (measure + layout + scroll + screenRect + notify) */
  layoutTotal: number
  /** Phase 3 — content render (tree → buffer) */
  content: number
  /** Phase 4 — buffer diff → ANSI output */
  output: number
  /** Total from executeRender start to output end (layout + content + output) */
  total: number
  /** Reconcile time — filled in by create-app.tsx, not pipeline/index.ts */
  reconcile: number
  /** Number of times executeRender ran during the measurement window */
  pipelineCalls: number
  /** Number of times ag.render() ran (matches pipelineCalls in normal use) */
  renderCalls: number
}

/**
 * Start accumulating per-phase pipeline timings. Subsequent calls to
 * `executeRender()` and `ag.render()` will add their phase timings to the
 * returned accumulator (same object as `globalThis.__silvery_bench_phases`).
 *
 * Not thread-safe — bench harnesses that run benches in parallel must not
 * share an accumulator. Vitest bench runs sequentially inside a worker so this
 * is fine for our use case.
 *
 * @example
 * ```ts
 * const phases = silveryBenchStart()
 * for (let i = 0; i < 20; i++) board.command("cursor_down")
 * silveryBenchStop()
 * console.log(`content: ${phases.content.toFixed(1)}ms`)
 * ```
 */
export function silveryBenchStart(): SilveryBenchPhases {
  const phases: SilveryBenchPhases = {
    measure: 0,
    layout: 0,
    scroll: 0,
    screenRect: 0,
    notify: 0,
    layoutTotal: 0,
    content: 0,
    output: 0,
    total: 0,
    reconcile: 0,
    pipelineCalls: 0,
    renderCalls: 0,
  }
  ;(globalThis as any).__silvery_bench_phases = phases
  // Also start output-phase sub-timing accumulator
  ;(globalThis as any).__silvery_bench_output_detail = {
    diffMs: 0,
    ansiMs: 0,
    calls: 0,
    totalChanges: 0,
    dirtyRows: 0,
    outputBytes: 0,
  }
  return phases
}

/**
 * Stop accumulating per-phase timings. Detaches the accumulator from the
 * global so subsequent renders don't mutate it. The returned object is the
 * same reference returned from the matching `silveryBenchStart()` call.
 */
export function silveryBenchStop(): SilveryBenchPhases | null {
  const phases = (globalThis as any).__silvery_bench_phases as SilveryBenchPhases | undefined
  ;(globalThis as any).__silvery_bench_phases = undefined
  ;(globalThis as any).__silvery_bench_output_detail = undefined
  return phases ?? null
}

/** Output-phase sub-timing detail (populated alongside SilveryBenchPhases). */
export interface SilveryBenchOutputDetail {
  /** Time spent in diffBuffers (cell comparison) */
  diffMs: number
  /** Time spent in changesToAnsi (sorting, style transitions, string building) */
  ansiMs: number
  /** Number of output phase calls */
  calls: number
  /** Total changed cells across all calls */
  totalChanges: number
  /** Total dirty rows across all calls */
  dirtyRows: number
  /** Total ANSI output bytes across all calls */
  outputBytes: number
}

/** Get the current output detail accumulator (null if not started). */
export function silveryBenchOutputDetail(): SilveryBenchOutputDetail | null {
  return (globalThis as any).__silvery_bench_output_detail ?? null
}

/** Reset an existing accumulator to zero (keeps it attached). */
export function silveryBenchReset(): void {
  const phases = (globalThis as any).__silvery_bench_phases as SilveryBenchPhases | undefined
  if (!phases) return
  phases.measure = 0
  phases.layout = 0
  phases.scroll = 0
  phases.screenRect = 0
  phases.notify = 0
  phases.layoutTotal = 0
  phases.content = 0
  phases.output = 0
  phases.total = 0
  phases.reconcile = 0
  phases.pipelineCalls = 0
  phases.renderCalls = 0
  // Reset output detail accumulator too
  const detail = (globalThis as any).__silvery_bench_output_detail
  if (detail) {
    detail.diffMs = 0
    detail.ansiMs = 0
    detail.calls = 0
    detail.totalChanges = 0
    detail.dirtyRows = 0
    detail.outputBytes = 0
  }
}

// ============================================================================
// Execute Render (Adapter-aware)
// ============================================================================

import { type RenderBuffer, getRenderAdapter, hasRenderAdapter } from "../render-adapter"

/**
 * Execute the full render pipeline using the current RenderAdapter.
 *
 * This version works with any adapter (terminal, canvas, etc.) and returns
 * a RenderBuffer instead of a TerminalBuffer.
 *
 * @param root The root SilveryNode
 * @param width Width in adapter units (cells for terminal, pixels for canvas)
 * @param height Height in adapter units
 * @param prevBuffer Previous buffer for diffing (null on first render)
 * @param options Render options
 * @returns Object with output (if any) and current buffer
 */
export function executeRenderAdapter(
  root: AgNode,
  width: number,
  height: number,
  prevBuffer: RenderBuffer | null,
  options: ExecuteRenderOptions | "fullscreen" | "inline" = "fullscreen",
): { output: string | void; buffer: RenderBuffer } {
  if (!hasRenderAdapter()) {
    throw new Error("executeRenderAdapter called without a render adapter set")
  }

  const opts: ExecuteRenderOptions = typeof options === "string" ? { mode: options } : options
  const { skipLayoutNotifications = false } = opts
  const start = Date.now()
  const adapter = getRenderAdapter()

  using render = baseLog.span("pipeline-adapter", {
    width,
    height,
    adapter: adapter.name,
  })

  // Clear per-render caches
  clearBgConflictWarnings()

  // Phase 1: Measure
  {
    using _measure = render.span("measure")
    const t1 = Date.now()
    measurePhase(root)
    log.debug?.(`measure: ${Date.now() - t1}ms`)
  }

  // Phase 2: Layout
  {
    using _layout = render.span("layout")
    const t2 = Date.now()
    layoutPhase(root, width, height)
    log.debug?.(`layout: ${Date.now() - t2}ms`)
  }

  // Phase 2.5: Scroll calculation
  {
    using _scroll = render.span("scroll")
    scrollPhase(root)
  }

  // Phase 2.55: Sticky phase (non-scroll container sticky children)
  stickyPhase(root)

  // Phase 2.6: Screen rect calculation
  {
    using _screenRect = render.span("screenRect")
    screenRectPhase(root)
  }

  // Phase 2.7: Notify layout subscribers
  if (!skipLayoutNotifications) {
    using _notify = render.span("notify")
    notifyLayoutSubscribers(root)
  }

  // Phase 3: Content render (adapter-aware)
  let buffer: RenderBuffer
  {
    using _content = render.span("content")
    const t3 = Date.now()
    buffer = renderPhaseAdapter(root)
    log.debug?.(`content: ${Date.now() - t3}ms`)
  }

  // Phase 4: Flush via adapter
  let output: string | void
  {
    using outputSpan = render.span("output")
    const t4 = Date.now()
    output = adapter.flush(buffer, prevBuffer)
    if (typeof output === "string") {
      outputSpan.spanData.bytes = output.length
    }
    log.debug?.(`output: ${Date.now() - t4}ms`)
  }

  log.debug?.(`total pipeline: ${Date.now() - start}ms`)

  return { output, buffer }
}
