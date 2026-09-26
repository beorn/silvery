/**
 * createApp() - Layer 3 entry point for silvery-loop
 *
 * Provides signal-backed store integration with a Term-driven event loop.
 * The event loop subscribes directly to the Term's `input` + `size`
 * sub-owners — no async-iterator `events()` pipeline.
 *
 * @example
 * ```tsx
 * import { createApp, useApp } from '@silvery/create/create-app'
 * import { createTerm } from '@silvery/ag-term/ansi'
 *
 * const app = createApp(
 *   // Store factory
 *   ({ term }) => (set, get) => ({
 *     count: 0,
 *     increment: () => set(s => ({ count: s.count + 1 })),
 *   }),
 *   // Event handlers — namespaced as 'provider:event'
 *   {
 *     'term:key': ({ input, key }, { set }) => {
 *       if (input === 'j') set(s => ({ count: s.count + 1 }))
 *       if (input === 'q') return 'exit'
 *     },
 *     'term:resize': ({ cols, rows }, { set }) => {
 *       // handle resize
 *     },
 *   }
 * )
 *
 * function Counter() {
 *   const count = useApp(s => s.count)
 *   return <Text>Count: {count}</Text>
 * }
 *
 * using term = createTerm()
 * await app.run(<Counter />, { term })
 *
 * // Frame iteration:
 * for await (const frame of app.run(<Counter />, { term })) {
 *   expect(frame.text).toContain('Count:')
 * }
 * ```
 */

import { writeSync } from "node:fs"
import { writeStderrDurably } from "./stderr-durable"
import { writeDumpFile, dumpGlob } from "./dump-file"
import process from "node:process"
import React, { createContext, useContext, useEffect, useRef, type ReactElement } from "react"
import { type StateCreator, type StoreApi, createStore } from "@silvery/create/signal-store"
import { watch } from "@silvery/signals"

import { createTerm } from "../ansi"
import { NOTIFICATION_WRITER_AVAILABLE } from "../ansi/notification"
import {
  CacheBackendContext,
  CapabilityRegistryContext,
  ChainAppContext,
  type ChainAppContextValue,
  FocusManagerContext,
  RuntimeContext,
  type PanicOptions,
  type RuntimeContextValue,
  StdoutContext,
  StderrContext,
  TermContext,
  type TerminalFrameArtifact,
} from "@silvery/ag-react/context"
import { SilveryErrorBoundary } from "@silvery/ag-react/error-boundary"
import { ScopeProvider } from "@silvery/ag-react/ScopeProvider"
import { createScope, reportDisposeError, type Scope } from "@silvery/scope"
import { createFocusManager } from "@silvery/ag/focus-manager"
import { createCursorStore, CursorProvider } from "@silvery/ag-react/hooks/useCursor"
import { createFocusEvent, dispatchFocusEvent } from "@silvery/ag/focus-events"
import type { AgNode } from "@silvery/ag/types"
import type { IslandModesOwner, IslandProtocolModes } from "@silvery/ag/island-types"
import { createPipeline } from "../measurer"
import {
  detectTextSizingSupport,
  getCachedProbeResult,
  getTerminalFingerprint,
} from "../text-sizing"
import { applyWidthConfig, detectWidthConfigWithProbe } from "../ansi/width-detection"
import { isStrictEnabled } from "../strict-mode.js"
import { recordOutputCursorDiagnostics } from "../cursor-diagnostics"
import { computeManagedFrame, protectManagedCursorSuffix } from "../managed-caret"
import { createBytesOutMonitor } from "../bytes-out-monitor"
import { createMemMonitor } from "../mem-monitor"
import { resolveTerminalLinkAt, type TerminalLinksOptions } from "../terminal-links"
import {
  clearLastOutputPhaseDiagnostics,
  getLastOutputPhaseDiagnostics,
} from "../pipeline/output-phase"
import {
  emitRenderOutputFrame,
  isRenderTraceEnabled,
  type RenderOutputFrameDiagnostics,
} from "./render-trace"
import { _sharedResizeRefcount } from "./devices/size"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
  setContainerNodeLifecycle,
} from "@silvery/ag-react/reconciler"
import { map, merge, takeUntil } from "@silvery/create/streams"
import { createRuntime } from "./create-runtime"
import { setInputOwnerMouseOptions } from "./input-owner"
import {
  canRouteKeyToFocusedIsland,
  createHandlerContext,
  dispatchKeyToHandlers,
  handleFocusNavigation,
  isFocusedIslandHostInputBarrier,
  invokeEventHandler,
  routePasteToFocusedIsland,
  type NamespacedEvent,
} from "./event-handlers"
import { keyToAnsi, keyToKittyAnsi, isModifierOnlyEvent } from "@silvery/ag/keys"
import { isAnyDirty } from "@silvery/ag/epoch"
import { parseKey, type Key } from "./keys"
import { ensureLayoutEngine } from "./layout"
import {
  createMouseEventProcessor,
  updateKeyboardModifiers,
  hitTest,
  refreshHoverPath,
  resolveSelectionAnchorFromPoint,
  contentSelectionPointFromPoint,
  dispatchMouseEvent,
  createWheelEvent,
  extractContentSelectionText,
  findSelectionScrollOwner,
  projectContentSelectionRange,
  orientContentSelectionRange,
  selectionEdgeScrollDirection,
  createClickCountState,
  checkClickCount,
  type ContentSelectionEndpoint,
  type ContentSelectionPoint,
  type SelectionAnchorResolution,
  type SelectionBoundary,
} from "../mouse-events"
import { createClsMonitor } from "./cls-monitor"
import type { ParsedMouse, ParseMouseOptions } from "../mouse"
import { setArmed } from "@silvery/ag/interactive-signals"
import {
  ANSI,
  enableKittyKeyboard,
  disableKittyKeyboard,
  KittyFlags,
  enableMouse,
  disableMouse,
  setMouseCursorShape,
  resetMouseCursorShape,
  resetCursorStyle,
  enterAlternateScreen,
  leaveAlternateScreen,
} from "../output"
import { detectKittyWithProbe } from "../kitty-detect"
import { captureTerminalState, performSuspend } from "./terminal-lifecycle"
import type { Buffer, Dims, Provider, RenderTarget } from "./types"
import {
  createTerminalSelectionState,
  terminalSelectionUpdate,
  extractText,
  type SelectionScope,
} from "@silvery/headless/selection"
import { createSelectionBridge, type SelectionFeature } from "../features/selection"
import { createDragFeature, type DragFeature } from "../features/drag"
import {
  createCapabilityRegistry,
  type CapabilityRegistry,
} from "@silvery/create/internal/capability-registry"
import { DRAG_CAPABILITY, SELECTION_CAPABILITY } from "@silvery/create/internal/capabilities"
import {
  createBaseApp,
  withCustomEvents,
  withTerminalChain,
  withPasteChain,
  withInputChain,
  withFocusChain,
  type BaseApp,
  type CustomEventStore,
  type InputStore,
  type PasteStore,
  type TerminalStore,
  type FocusChainStore,
} from "@silvery/create/plugins"
import { isDragChainEffect, withDragChain } from "./with-drag-chain"
import { createVirtualScrollback } from "../virtual-scrollback"
import { createSearchState, searchUpdate } from "../search-overlay"
import { createOutput, type Output } from "./devices/output"
import { createModes, type MouseTrackingMode } from "./devices/modes"
import { deriveProtocolModesFromFocusSubtree } from "./island-aggregator"
import type { Term } from "../ansi/term"
import { perfLog, checkBudget, logExitSummary, startTracking } from "./perf"
import {
  addWriter,
  createFileWriter,
  createLogger,
  getLogLevel,
  setLogLevel,
  type LogLevel,
} from "loggily"
import {
  createRenderer,
  createSearchScrollback,
  pushToScrollback as pushToScrollbackFn,
  renderVirtualScrollbackView as renderVirtualScrollbackViewFn,
  applySearchBarToPaintBuffer as applySearchBarToPaintBufferFn,
  applySearchHighlightsToPaintBuffer as applySearchHighlightsToPaintBufferFn,
  applySelectionToPaintBuffer as applySelectionToPaintBufferFn,
} from "./renderer"
import { createBuffer as wrapBuffer } from "./create-buffer"
import {
  beginConvergenceLoop,
  beginPass,
  notePassCommit,
  logPass,
  recordPassRing,
  formatPassRingBreakdown,
  printPassHistogram,
  appendHistogramJson,
  resetPassHistogram,
  assertBoundedConvergence,
  MAX_CONVERGENCE_PASSES,
  INSTRUMENT,
} from "./pass-cause"

const log = createLogger("silvery:app")
const traceLog = createLogger("silvery:trace")

// Above this many consecutive standalone frames that hit the convergence cap,
// the teardown summary escalates from debug to a loud warn: the follow-up-frame
// recovery is repeatedly exhausting its fresh budget, which indicates a feedback
// edge that still needs bounding at the source. Total lifetime hits are kept as
// debug telemetry because long streams can legitimately produce many separate
// recovered ListView size changes without being one persistent loop. Bead:
// @km/silvercode/19383.
const STANDALONE_CAP_EXCEED_WARN_STREAK_THRESHOLD = 8

// STRICT-only fail-loud bound on CONSECUTIVE standalone convergence cap-exceeds.
// A handful of consecutive cap-exceeds is a legit growing-stream transient (a
// ListView re-measuring a steadily-growing assistant block frame after frame).
// An UNBOUNDED streak is a perpetual feedback edge the non-lossy follow-up-frame
// recovery would otherwise paper over forever — so under SILVERY_STRICT
// (incremental tier >=2) we escalate past this bound to the SAME hard
// `assertBoundedConvergence` fail-loud the press/event-batch production-flush
// loop uses. Set below the teardown WARN threshold (8) so STRICT surfaces the
// edge sooner and louder (throw) than the production telemetry (warn). Non-STRICT
// runs are unaffected: `assertBoundedConvergence` is a no-op outside STRICT, so
// the follow-up-frame recovery stays the production safety net.
// Bead: @km/silvercode/19383.
const STANDALONE_CAP_STREAK_LIMIT = 5

// ============================================================================
// Feature-detection flags — hoisted to module scope.
//
// These env var checks were historically evaluated on every doRender() call,
// adding ~10μs/frame overhead to production renders. They are all static for
// the lifetime of the process, so we compute them once at module load.
//
// When the instrumentation flag is off (the common case), branches guarded by
// these constants are dead-code eliminated by V8's optimizer — turning them
// into no-ops on the hot path.
// ============================================================================
const ENV = typeof process !== "undefined" ? process.env : undefined
const NO_INCREMENTAL = ENV?.SILVERY_NO_INCREMENTAL === "1"
const PANIC_STDIN_DRAIN_MS = 75
const STARTUP_SCOPE_DISPOSE_TIMEOUT_MS = 1_000
const FOCUS_DAMAGE_REPAINT_INTERVAL_MS = 500

type RuntimeWheelMouseEvent = {
  action?: string
  delta?: number
  deltaX?: number
  inputBatchId?: number
  x?: number
  y?: number
  clientX?: number
  clientY?: number
  coordinateMode?: string
  shift?: boolean
  meta?: boolean
  ctrl?: boolean
}

function isWheelEvent(event: NamespacedEvent): event is NamespacedEvent & {
  data: RuntimeWheelMouseEvent
} {
  return (
    event.event === "mouse" &&
    (event.data as RuntimeWheelMouseEvent | undefined)?.action === "wheel"
  )
}

function isMouseEvent(event: NamespacedEvent): boolean {
  return event.event === "mouse"
}

function inputBatchIdForMouseEvent(event: NamespacedEvent): number | undefined {
  if (!isMouseEvent(event)) return undefined
  return (event.data as { inputBatchId?: number } | undefined)?.inputBatchId
}

function takeNextFrameBatch(events: NamespacedEvent[]): NamespacedEvent[] {
  const firstMouseIndex = events.findIndex(isMouseEvent)
  if (firstMouseIndex === -1) return events.splice(0)
  if (firstMouseIndex > 0) return events.splice(0, firstMouseIndex)

  const first = events[0]
  if (!first || !isMouseEvent(first)) return events.splice(0, 1)

  const inputBatchId = inputBatchIdForMouseEvent(first)
  let count = 1
  while (count < events.length) {
    const next = events[count]!
    if (!isMouseEvent(next)) break
    if (inputBatchIdForMouseEvent(next) !== inputBatchId) break
    count++
  }
  return events.splice(0, count)
}

function canCoalesceWheelEvent(prev: NamespacedEvent, next: NamespacedEvent): boolean {
  if (!isWheelEvent(prev) || !isWheelEvent(next)) return false
  const a = prev.data
  const b = next.data
  const vA = a.delta ?? 0
  const vB = b.delta ?? 0
  const hA = a.deltaX ?? 0
  const hB = b.deltaX ?? 0
  // A wheel tick moves on exactly one axis. Coalesce only same-axis, same-sign
  // runs — vertical ticks merge with vertical, horizontal with horizontal, and
  // never across axes (that would collapse an L-shaped scroll into one vector).
  const vertical = hA === 0 && hB === 0 && Math.sign(vA) !== 0 && Math.sign(vA) === Math.sign(vB)
  const horizontal = vA === 0 && vB === 0 && Math.sign(hA) !== 0 && Math.sign(hA) === Math.sign(hB)
  if (!vertical && !horizontal) return false
  const sameInputBatch = a.inputBatchId === b.inputBatchId
  return (
    prev.type === next.type &&
    prev.provider === next.provider &&
    sameInputBatch &&
    a.x === b.x &&
    a.y === b.y &&
    a.clientX === b.clientX &&
    a.clientY === b.clientY &&
    a.coordinateMode === b.coordinateMode &&
    a.shift === b.shift &&
    a.meta === b.meta &&
    a.ctrl === b.ctrl
  )
}

function coalesceWheelEvents(events: NamespacedEvent[]): NamespacedEvent[] {
  const coalesced: NamespacedEvent[] = []
  for (const event of events) {
    const prev = coalesced[coalesced.length - 1]
    if (prev && canCoalesceWheelEvent(prev, event)) {
      const prevData = prev.data as RuntimeWheelMouseEvent
      const nextData = event.data as RuntimeWheelMouseEvent
      prev.data = {
        ...prevData,
        delta: (prevData.delta ?? 0) + (nextData.delta ?? 0),
        deltaX: (prevData.deltaX ?? 0) + (nextData.deltaX ?? 0),
      }
      continue
    }
    coalesced.push(event)
  }
  return coalesced
}

/**
 * Auto-panic circuit-breaker — caps dump-file writes when panic loops.
 *
 * Without this, a recurrent crash (component throwing on every render,
 * fixture bug, infinite render loop reaching the boundary) writes one
 * `silvery-panic-*.txt` per panic invocation indefinitely. Observed
 * 2026-05-13 overnight: 1,139 dumps / 5.6 GB / 2h 25m / sustained 100%
 * CPU on a single vitest worker after a fixture bug
 * (`workspace.panes undefined`) made every test panic on render. The
 * panic feature was designed as a safety net, not a DoS multiplier.
 *
 * State is *module-level* (process-scoped), not per-App, because in
 * vitest workers many App instances run sequentially in the same
 * process — a per-instance counter would reset on every test and
 * never reach the threshold.
 *
 * - `SILVERY_AUTO_PANIC_MAX_DUMPS=N` (default 10) — dump cap.
 * - `SILVERY_AUTO_PANIC_TEST_NO_EXIT=1` — skip the hard `process.exit(2)`
 *   that fires after the cap is hit. ONLY for the regression test;
 *   real callers want the hard-exit so a runaway loop terminates.
 *
 * Reset via `_resetPanicCircuitBreaker()` from test infrastructure.
 *
 * Bead: @km/silvery/auto-panic-circuit-break.
 */
const MAX_PANIC_DUMPS_PER_RUN = (() => {
  const v = ENV?.SILVERY_AUTO_PANIC_MAX_DUMPS
  if (v === undefined) return 10
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n > 0 ? n : 10
})()
/** Read the test-only hard-exit override fresh on every panic so tests
 *  can flip it via `vi.stubEnv` between cases without re-importing the
 *  module. Static-const capture would freeze the value at module load. */
function isPanicTestNoExit(): boolean {
  return process.env.SILVERY_AUTO_PANIC_TEST_NO_EXIT === "1"
}
let _processPanicDumpCount = 0
let _processPanicCircuitBroken = false

/**
 * Test helper — reset the process-level panic circuit-break state.
 * Call in `beforeEach` of any test that exercises the panic flow more
 * than `MAX_PANIC_DUMPS_PER_RUN` times within one suite. Not part of
 * the public runtime API.
 */
export function _resetPanicCircuitBreaker(): void {
  _processPanicDumpCount = 0
  _processPanicCircuitBroken = false
}
const STRICT_MODE = (() => {
  return isStrictEnabled("incremental", 1)
})()
const CELL_DEBUG = (() => {
  const v = ENV?.SILVERY_CELL_DEBUG
  if (!v || !v.includes(",")) return null
  const [cx, cy] = v.split(",").map(Number)
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
  return { x: cx, y: cy }
})()
// INSTRUMENTED = any diagnostic is on. When false, the per-frame resets of
// diagnostic globals can be skipped entirely — they are only consumed by the
// STRICT/CELL_DEBUG paths. This is the primary hot-path win: when no
// instrumentation is active (production), doRender skips ~8 global ops/frame.
//
// SILVERY_TRACE_FRAMES (Phase 4 of the Visual Eyes epic) also turns this on:
// the render-trace event's `signalDelta` is sourced from the render-phase
// stats that only populate when instrumentation is active. Opting into
// frame tracing is an explicit diagnostic choice, so the per-frame cost is
// expected — production (no env var) still constant-folds the cost away.
const RENDER_TRACE_ON = ENV?.SILVERY_TRACE_FRAMES != null && ENV.SILVERY_TRACE_FRAMES.trim() !== ""
const INSTRUMENTED = STRICT_MODE || CELL_DEBUG !== null || RENDER_TRACE_ON

// ============================================================================
// Types
// ============================================================================

/**
 * Check if value is a Provider usable by the event loop.
 *
 * Two accepted shapes:
 *   - Term umbrella: has `.size` + `.modes` sub-owners. The event loop
 *     subscribes directly via `term.input.on*` and `watch(term.size.snapshot())`.
 *   - Legacy custom Provider: has `events()`/`getState()`/`subscribe()`. The
 *     event loop iterates `events()` into the queue.
 */
function isFullProvider(value: unknown): value is Provider<unknown, Record<string, unknown>> {
  if (value === null || value === undefined) return false
  // Term is a Proxy wrapping chalk, so typeof is "function" not "object"
  if (typeof value !== "object" && typeof value !== "function") return false
  const o = value as Record<string, unknown>
  // Term-shape: has `size` sub-owner.
  if (
    typeof o.size === "object" &&
    o.size !== null &&
    typeof (o.size as Record<string, unknown>).cols === "function"
  ) {
    return true
  }
  // Legacy Provider shape.
  return (
    "getState" in o &&
    "subscribe" in o &&
    "events" in o &&
    typeof o.getState === "function" &&
    typeof o.subscribe === "function" &&
    typeof o.events === "function"
  )
}

/**
 * Check if value is a basic Provider (just getState/subscribe, Zustand-compatible).
 */
function isBasicProvider(value: unknown): value is {
  getState(): unknown
  subscribe(l: (s: unknown) => void): () => void
} {
  if (value === null || value === undefined) return false
  // Term is a Proxy wrapping chalk, so typeof is "function" not "object"
  if (typeof value !== "object" && typeof value !== "function") return false
  return (
    "getState" in value &&
    "subscribe" in value &&
    typeof (value as { getState: unknown }).getState === "function" &&
    typeof (value as { subscribe: unknown }).subscribe === "function"
  )
}

/**
 * Event handler context passed to handlers.
 *
 * When the store uses `tea()` middleware, `dispatch` is available with the
 * correct Op type inferred from the store. For non-tea stores it's `undefined`.
 */
export interface EventHandlerContext<S> {
  set: StoreApi<S>["setState"]
  get: StoreApi<S>["getState"]
  /** The tree-based focus manager */
  focusManager: import("@silvery/ag/focus-manager").FocusManager
  /** Convenience: focus a node by testID */
  focus(testID: string): void
  /** Activate a peer focus scope (saves/restores focus per scope) */
  activateScope(scopeId: string): void
  /** Get the focus path from focused node to root */
  getFocusPath(): string[]
  /**
   * Dispatch an operation through the tea() reducer.
   *
   * Available when the store was created with `tea()` middleware from `silvery/tea`.
   * Type-safe: the Op type is inferred from the store's TeaSlice.
   * For non-tea stores, this is `undefined`.
   */
  dispatch?: "dispatch" extends keyof S ? S["dispatch"] : undefined
  /** Hit-test the render tree at (x, y). Returns the deepest SilveryNode at that point, or null. */
  hitTest(x: number, y: number): import("@silvery/create/types").AgNode | null
}

/**
 * Generic event handler function.
 * Return 'exit' to exit the app.
 */
export type EventHandler<T, S> = (data: T, ctx: EventHandlerContext<S>) => void | "exit" | "flush"

/**
 * Event handlers map.
 * Keys are namespaced as 'provider:event' (e.g., 'term:key', 'term:resize').
 */
export type EventHandlers<S> = {
  [event: `${string}:${string}`]: EventHandler<unknown, S> | undefined
}

/**
 * Options for app.run().
 */
export interface AppRunOptions {
  /** Terminal dimensions (default: from process.stdout) */
  cols?: number
  rows?: number
  /** Produce link:open events from visible terminal cells. */
  terminalLinks?: TerminalLinksOptions
  /** Standard output (default: process.stdout) */
  stdout?: NodeJS.WriteStream
  /** Standard input (default: process.stdin) */
  stdin?: NodeJS.ReadStream
  /**
   * Plain writable sink for ANSI output. Headless mode with active output.
   * Requires cols and rows. Input via handle.press().
   */
  writable?: { write(data: string): void }
  /**
   * Subscribe to resize events in headless mode.
   * Called with a handler that should be invoked when dimensions change.
   * Returns an unsubscribe function.
   */
  onResize?: (handler: (dims: { cols: number; rows: number }) => void) => () => void
  /**
   * Trailing-edge debounce for stdout `resize` events on the internally-
   * created autoTerm, in milliseconds.
   *
   * Only applies when the caller does NOT pass a `term` provider (i.e. the
   * autoTerm fallback is used). Real-PTY callers inject their own Term via
   * the run.tsx Term branch and bring their own size policy.
   *
   * Default: `undefined` (use `createSize`'s built-in default, 200 ms — coalesces
   * SIGWINCH bursts from tmux/cmux/Ghostty multiplexer resizes). Tests and
   * emulator paths that drive resize explicitly via `term.resize(...)` should
   * pass `0` so the snapshot updates synchronously and the layout reflows
   * within the test's settle window. See
   * `@km/silvery/termless-resize-reflow-4-fails`.
   */
  resizeCoalesceMs?: number
  /** Abort signal for external cleanup */
  signal?: AbortSignal
  /** Enter alternate screen buffer (clean slate, restore on exit). Default: false */
  alternateScreen?: boolean
  /** Use Kitty keyboard protocol encoding for press(). Default: false */
  kittyMode?: boolean
  /**
   * Enable Kitty keyboard protocol.
   * - `true`: auto-detect and enable with DISAMBIGUATE flag (1)
   * - number: enable with specific KittyFlags bitfield
   * - `false`/undefined: don't enable (default)
   */
  kitty?: boolean | number
  /**
   * Enable SGR mouse tracking.
   * - `true`: xterm all-motion SGR cell mode (1003 + 1006).
   * - `{ coordinateMode: "pixel", cellSize }`: SGR-Pixels mode
   *   (1003 + 1006 + 1016) with fractional Silvery layout coordinates.
   * Default: false
   */
  mouse?: boolean | ParseMouseOptions
  /**
   * Enable virtual inline mode: alt screen with virtual scrollback buffer.
   * Provides scrollable history + search (Ctrl+F) while using fullscreen rendering.
   * Default: false
   */
  virtualInline?: boolean
  /**
   * Handle Ctrl+Z by suspending the process (save terminal state,
   * send SIGTSTP, restore on SIGCONT). Default: true
   */
  suspendOnCtrlZ?: boolean
  /**
   * Handle Ctrl+C by restoring terminal and exiting.
   * Default: true
   */
  exitOnCtrlC?: boolean
  /** Called before suspend. Return false to prevent. */
  onSuspend?: () => boolean | void
  /** Called after resume from suspend. */
  onResume?: () => void
  /** Called on Ctrl+C. Return false to prevent exit. */
  onInterrupt?: () => boolean | void
  /**
   * Enable Kitty text sizing protocol (OSC 66) for PUA characters.
   * When enabled, nerdfont/powerline icons are measured as 2-wide and
   * wrapped in OSC 66 sequences so the terminal renders them at the
   * correct width.
   * - `true`: force enable
   * - `"auto"`: use heuristic, then probe to verify (progressive enhancement)
   * - `"probe"`: start disabled, probe async, enable on confirmation
   * - `false`/undefined: disabled (default)
   */
  textSizing?: boolean | "auto" | "probe"
  /**
   * Enable DEC width mode detection (modes 1020-1023).
   * Queries the terminal for its actual character width settings (emoji,
   * CJK, private-use area) and updates the measurer accordingly.
   * - `true`: always run width detection probe
   * - `"auto"`: run probe when caps are provided (default for real terminals)
   * - `false`/undefined: disabled (default)
   */
  widthDetection?: boolean | "auto"
  /**
   * Enable terminal focus reporting (CSI ?1004h).
   * When enabled, the terminal sends focus-in/focus-out events that are
   * dispatched as 'term:focus' events with `{ focused: boolean }`.
   * Default: false
   */
  focusReporting?: boolean
  /**
   * Enable buffer-level text selection via mouse drag.
   * When enabled, left mouse drag selects text, and mouse up copies
   * selected text to clipboard via OSC 52.
   * Default: true when mouse is enabled
   */
  selection?: boolean
  /**
   * Auto-copy selection to clipboard on mouse-up.
   *
   * When `selection` is active, the runtime fires OSC 52 with the
   * finalized selection text on every drag-finish and on double / triple
   * click. Inside tmux that writes to tmux's own paste buffer (use
   * `set -g set-clipboard on` to forward to the host clipboard); over
   * SSH the host terminal consumes the same OSC 52 directly.
   *
   * Set to `false` to suppress the auto-copy — selection still
   * highlights and copy-mode `y` still copies on demand. Useful for
   * apps that prefer explicit copy gestures only.
   *
   * Default: true (when selection is enabled).
   */
  copyOnSelect?: boolean
  /**
   * Terminal capabilities for width measurement and output suppression.
   * When provided, configures the render pipeline to use these caps
   * (scoped width measurer + output phase). Typically from term.caps.
   */
  caps?: import("../terminal-caps").TerminalCaps
  /**
   * Pre-built {@link TerminalProfile} produced by `createTerminalProfile()`.
   * When supplied, `caps` is read from `profile.caps` — the run pipeline
   * uses the profile's caps directly, skipping any additional detection.
   * Phase 4 of `km-silvery.terminal-profile-plateau` — lets `run()` /
   * `createApp()` / `createTerminalProfile()` share one resolution pass.
   *
   * When both `caps` and `profile` are supplied, the profile wins. A
   * caller who only has `caps` and not a profile can still pass `caps`
   * directly — the pipeline behaves identically to pre-Phase-4.
   */
  profile?: import("@silvery/ansi").TerminalProfile
  /**
   * Guard stdout/stderr in alt screen mode. When true (the default for
   * alternateScreen), intercepts process.stdout.write and process.stderr.write
   * so that only silvery's render pipeline can write to stdout. Non-silvery
   * stderr writes are redirected to DEBUG_LOG if set, otherwise suppressed.
   * This prevents display corruption from libraries that write directly to
   * process.stdout/stderr (e.g., loggily, debug).
   *
   * - `true`: enable output guard (default when alternateScreen is true)
   * - `false`: disable output guard
   */
  guardOutput?: boolean
  /**
   * Root component that wraps the element tree with additional providers.
   * Set by plugins (e.g., withInk) via the `app.Root` pattern.
   * The Root component receives children and wraps them with providers.
   */
  Root?: React.ComponentType<{ children: React.ReactNode }>
  /**
   * Capability registry from the composition layer (e.g., withDomEvents, withTerminal).
   * When provided, exposed to React components via CapabilityRegistryContext so
   * hooks like useSelection() can discover interaction features.
   */
  capabilityRegistry?: import("@silvery/ag-react/context").CapabilityLookup
  /**
   * Opt out of silvery's stdin ownership for this run.
   *
   * When `false`, the runtime skips:
   *   - flipping `stdin` raw mode
   *   - constructing the canonical InputOwner (including terminal probes)
   *   - the term provider's input subscription (`useInput`, `usePaste`,
   *     focus key dispatch all become no-ops)
   *
   * The host process is then free to own stdin itself — typically by
   * piping it to a child PTY (recording overlays, in-app shells, debugger
   * surfaces). The runtime still owns stdout, alt screen, cursor, paint,
   * size, signals, modes.
   *
   * Default: undefined (silvery owns stdin via term.input — the canonical
   * Term-I/O contract). Only `false` is meaningful — `true` matches the
   * default and is therefore not accepted.
   *
   * See `docs/design/terminal-component.md` § "render({ input: false })".
   */
  input?: false
  /** Providers and plain values to inject */
  [key: string]: unknown
}

/**
 * Handle returned by app.run().
 *
 * Also AsyncIterable<Buffer> — iterate to get frames after each event:
 * ```typescript
 * for await (const frame of app.run(<App />)) {
 *   expect(frame.text).toContain('expected')
 * }
 * ```
 */
export interface AppHandle<S> {
  /** Current rendered text (no ANSI) */
  readonly text: string
  /** Live reconciler root node (for locator queries) */
  readonly root: import("@silvery/ag/types").AgNode
  /** Current terminal buffer (cell-level access) */
  readonly buffer: import("../buffer").TerminalBuffer | null
  /** Access to the Zustand store */
  readonly store: StoreApi<S>
  /**
   * Root app scope — all `useScope()` / `useAppScope()` reads at the app
   * root resolve to this same value. Disposed (LIFO over `defer`/`use`
   * registrations and any fiber-attached child scopes) when the app
   * unmounts, on SIGINT/SIGTERM (via `term.signals` if a real Term is
   * present), or when callers `await scope[Symbol.asyncDispose]()` it
   * directly. See `km-silvery.lifecycle-scope`.
   */
  readonly scope: Scope
  /** Wait until the event loop has stopped and app-scope disposal has settled. */
  waitUntilExit(): Promise<void>
  /**
   * Drain additional commit / layout cycles until layout reports stable
   * (no pending React commit, no dirty layout nodes) OR a budget cap is
   * reached (default 20 passes / 50ms wall clock).
   *
   * The default frame exposed by `run()` matches what production silvery
   * commits on first paint — bounded by `MAX_CONVERGENCE_PASSES`. Tests
   * asserting layout that needs more passes to settle call this method
   * to explicitly wait for full convergence:
   *
   * ```ts
   * const handle = await run(<App />, term)
   * await handle.waitForLayoutStable()
   * expect(term.screen).toContainText("Item 1")
   * ```
   *
   * Resolves without throwing when the cap is reached — an infinitely
   * non-converging app is a structural bug surfaced by SILVERY_STRICT's
   * convergence assertions, not a test-author concern here.
   *
   * Bead: `@km/silvery/test-harness-convergence-cap-parity`.
   */
  waitForLayoutStable(opts?: { timeoutMs?: number; maxPasses?: number }): Promise<void>
  /** Exit fullscreen, restore terminal state, and print a copyable diagnostic to stderr */
  panic(reason: unknown, options?: PanicOptions): void
  /** Unmount and cleanup */
  unmount(): void
  /** Dispose (alias for unmount) — enables `using` */
  [Symbol.dispose](): void
  /** Send a key press (simulates term:key event) */
  press(key: string): Promise<void>
  /** Iterate frames yielded after each event */
  [Symbol.asyncIterator](): AsyncIterator<Buffer>
}

/**
 * App definition returned by createApp().
 */
export interface AppDefinition<S> {
  run(element: ReactElement, options?: AppRunOptions): AppRunner<S>
}

/**
 * Result of app.run() — both a Promise<AppHandle> and an AsyncIterable<Buffer>.
 *
 * - `await app.run(el)` → AppHandle (backward compat)
 * - `for await (const frame of app.run(el))` → iterate frames
 */
export interface AppRunner<S> extends AsyncIterable<Buffer>, PromiseLike<AppHandle<S>> {}

// ============================================================================
// Store Context
// ============================================================================

export const StoreContext = createContext<StoreApi<unknown> | null>(null)

/**
 * Hook for accessing app state with selectors.
 *
 * @example
 * ```tsx
 * const count = useApp(s => s.count)
 * const { count, increment } = useApp(s => ({ count: s.count, increment: s.increment }))
 * ```
 */
export function useApp<S, T>(selector: (state: S) => T): T {
  const store = useContext(StoreContext) as StoreApi<S> | null
  if (!store) throw new Error("useApp must be used within createApp().run()")

  const [state, setState] = React.useState(() => selector(store.getState()))
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  useEffect(() => {
    return store.subscribe((newState) => {
      const next = selectorRef.current(newState)
      // Only update if the selected value actually changed (avoids
      // unnecessary re-renders when unrelated store slices change)
      setState((prev) => (Object.is(prev, next) ? prev : next))
    })
  }, [store])

  return state
}

/**
 * Shallow comparison for plain objects.
 * Returns true if objects have same keys with Object.is() equal values.
 */
function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false
  }
  const keysA = Object.keys(a as Record<string, unknown>)
  const keysB = Object.keys(b as Record<string, unknown>)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false
    }
  }
  return true
}

/**
 * Hook for accessing app state with shallow comparison.
 *
 * Like useApp, but uses shallow object comparison instead of Object.is().
 * Use when your selector returns a new object on each call — this prevents
 * re-renders when all individual fields are unchanged.
 *
 * @example
 * ```tsx
 * const { cursor, mode } = useAppShallow(s => ({
 *   cursor: s.cursorNodeId,
 *   mode: s.viewMode,
 * }))
 * ```
 */
export function useAppShallow<S, T>(selector: (state: S) => T): T {
  const store = useContext(StoreContext) as StoreApi<S> | null
  if (!store) throw new Error("useAppShallow must be used within createApp().run()")

  const [state, setState] = React.useState(() => selector(store.getState()))
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  useEffect(() => {
    return store.subscribe((newState) => {
      const next = selectorRef.current(newState)
      setState((prev) => (shallowEqual(prev, next) ? prev : next))
    })
  }, [store])

  return state
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Snapshot of the five terminal protocol modes that the focused-island
 * aggregation must keep the real terminal in sync with. `actual` is read from
 * the live `modes` store; `desired` is `resolveDesiredProtocolModes(...)`.
 */
export interface ProtocolModeSnapshot {
  altScreen: boolean
  bracketedPaste: boolean
  kittyKeyboard: number | false
  mouse: MouseTrackingMode
  focusReporting: boolean
}

/**
 * Pure comparison body of `assertNoIslandModeLeak`: returns one descriptor
 * string per protocol mode whose ACTUAL terminal state diverges from the
 * DESIRED state derived from the focused island subtree. Empty array === no
 * leak. Extracted so the island-mode-leak FIRE case is unit-testable without
 * standing up a full app + terminal (bead: island-mode-leak STRICT seam). The
 * descriptor strings are the exact wording `assertNoIslandModeLeak` joins into
 * its thrown message, so its external behavior is unchanged.
 */
export function collectProtocolModeLeaks(
  actual: ProtocolModeSnapshot,
  desired: ProtocolModeSnapshot,
): string[] {
  const leaks: string[] = []
  if (actual.altScreen !== desired.altScreen) {
    leaks.push(`altScreen=${String(actual.altScreen)}, wanted ${String(desired.altScreen)}`)
  }
  if (actual.bracketedPaste !== desired.bracketedPaste) {
    leaks.push(
      `bracketedPaste=${String(actual.bracketedPaste)}, wanted ${String(desired.bracketedPaste)}`,
    )
  }
  if (actual.kittyKeyboard !== desired.kittyKeyboard) {
    leaks.push(`kittyKeyboard=${String(actual.kittyKeyboard)}, wanted ${desired.kittyKeyboard}`)
  }
  if (actual.mouse !== desired.mouse) {
    leaks.push(`mouse=${String(actual.mouse)}, wanted ${String(desired.mouse)}`)
  }
  if (actual.focusReporting !== desired.focusReporting) {
    leaks.push(
      `focusReporting=${String(actual.focusReporting)}, wanted ${String(desired.focusReporting)}`,
    )
  }
  return leaks
}

/**
 * Create an app with Zustand store and provider integration.
 *
 * This is Layer 3 - it provides:
 * - Zustand store with fine-grained subscriptions
 * - Providers as unified stores + event sources
 * - Event handlers namespaced as 'provider:event'
 *
 * @param factory Store factory function that receives providers
 * @param handlers Optional event handlers (namespaced as 'provider:event')
 */
export function createApp<I extends Record<string, unknown>, S extends Record<string, unknown>>(
  factory: (inject: I) => StateCreator<S>,
  handlers?: EventHandlers<S & I>,
): AppDefinition<S & I> {
  return {
    run(element: ReactElement, options: AppRunOptions = {}): AppRunner<S & I> {
      // Lazy-init: the actual setup happens once, on first access
      let handlePromise: Promise<AppHandle<S & I>> | null = null

      const init = (): Promise<AppHandle<S & I>> => {
        if (handlePromise) return handlePromise
        handlePromise = initApp(factory, handlers, element, options)
        return handlePromise
      }

      return {
        // PromiseLike — makes `await app.run(el)` work
        then<TResult1 = AppHandle<S & I>, TResult2 = never>(
          onfulfilled?: ((value: AppHandle<S & I>) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> {
          return init().then(onfulfilled, onrejected)
        },

        // AsyncIterable — makes `for await (const frame of app.run(el))` work
        [Symbol.asyncIterator](): AsyncIterator<Buffer> {
          let handle: AppHandle<S & I> | null = null
          let iterator: AsyncIterator<Buffer> | null = null
          let started = false

          return {
            async next(): Promise<IteratorResult<Buffer>> {
              if (!started) {
                started = true
                handle = await init()
                iterator = handle[Symbol.asyncIterator]()
              }
              return iterator!.next()
            },
            async return(): Promise<IteratorResult<Buffer>> {
              if (handle) handle.unmount()
              return { done: true, value: undefined as unknown as Buffer }
            },
          }
        },
      }
    },
  }
}

/**
 * Initialize the app — extracted from run() for clarity.
 */
async function initApp<I extends Record<string, unknown>, S extends Record<string, unknown>>(
  factory: (inject: I) => StateCreator<S>,
  handlers: EventHandlers<S & I> | undefined,
  element: ReactElement,
  options: AppRunOptions,
): Promise<AppHandle<S & I>> {
  const {
    cols: explicitCols,
    rows: explicitRows,
    stdout: explicitStdout,
    stdin = process.stdin,
    signal: externalSignal,
    alternateScreen = false,
    kittyMode: explicitKittyMode,
    kitty: kittyOption,
    // Mouse defaults to the alternate-screen mode: ON in fullscreen, OFF
    // inline. This mirrors run()'s `mode !== "inline"` rule (run.tsx) so a
    // direct `createApp().run({ alternateScreen: true })` gets mouse tracking
    // like `run()` does — without it, wheel events on the alt screen get
    // translated to cursor keys and "the wheel moves the cursor". An explicit
    // `mouse` (true / false / ParseMouseOptions) always wins. `alternateScreen`
    // is destructured just above, so this default reads its resolved value.
    mouse: mouseOption = alternateScreen,
    virtualInline: virtualInlineOption = false,
    suspendOnCtrlZ: suspendOption = true,
    exitOnCtrlC: exitOnCtrlCOption = true,
    onSuspend: onSuspendHook,
    onResume: onResumeHook,
    onInterrupt: onInterruptHook,
    textSizing: textSizingOption,
    widthDetection: widthDetectionOption,
    focusReporting: focusReportingOption = false,
    selection: selectionOption,
    copyOnSelect: copyOnSelectOption,
    caps: capsOptionRaw,
    profile: profileOption,
    guardOutput: guardOutputOption,
    Root: RootComponent,
    capabilityRegistry: capabilityRegistryOption,
    writable: explicitWritable,
    onResize: explicitOnResize,
    resizeCoalesceMs: explicitResizeCoalesceMs,
    input: inputOption,
    terminalLinks: terminalLinksOption,
    ...injectValues
  } = options
  // When the caller opts out (`input: false`), the runtime treats stdin
  // as if it weren't a TTY: no raw-mode flip, no canonical InputOwner
  // (including terminal probes), no term-provider input subscription.
  // The host process keeps stdin
  // for its own use (typically piping to a child PTY). See
  // `docs/design/terminal-component.md` § "render({ input: false })".
  const inputDisabled = inputOption === false
  const hostOwnsStdin = inputOption !== false
  const mouseParseOptions = typeof mouseOption === "object" ? mouseOption : undefined
  const mouseTrackingEnabled = mouseOption === true || mouseParseOptions != null
  const legacyMouseMode: MouseTrackingMode =
    hostOwnsStdin && mouseTrackingEnabled
      ? mouseParseOptions?.coordinateMode === "pixel"
        ? "pixel"
        : true
      : false

  // Phase 4 of km-silvery.terminal-profile-plateau: a caller-supplied
  // `profile` wins over `caps`. Both paths converge on `capsOption` — the
  // rest of initApp stays identical, so every existing code site that reads
  // `capsOption?.textSizing` / `capsOption?.kittyKeyboard` sees the
  // same shape whether caps came from `caps` or `profile.caps`.
  const capsOption = profileOption?.caps ?? capsOptionRaw
  // Post km-silvery.plateau-naming-polish (2026-04-23): profile identity lives
  // on `profile.emulator` (program/version/TERM). createApp's probe-cache
  // fingerprint reads off the emulator when a profile is supplied.
  const emulatorOption = profileOption?.emulator

  // Derive kitty mode for press(): use explicit kittyMode if set, otherwise
  // auto-enable when kitty protocol is active (so press() encodes modifier keys correctly)
  const useKittyMode = explicitKittyMode ?? !!kittyOption

  const stdout = explicitStdout ?? process.stdout
  const headless =
    (explicitCols != null && explicitRows != null && !explicitStdout) || explicitWritable != null
  const resolveTerminalDimension = (
    explicitValue: number | undefined,
    detectedValue: number | undefined,
    fallback: number,
  ): number => {
    const value = explicitValue ?? detectedValue
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
  }
  const cols = resolveTerminalDimension(explicitCols, stdout.columns, 80)
  const rows = resolveTerminalDimension(explicitRows, stdout.rows, 24)

  // If the caller passed `term` (from run()'s Term path), its `modes` sub-owner
  // is the single authority for protocol mode toggles — raw, alt-screen, paste,
  // kitty keyboard, mouse, focus reporting. Otherwise we construct a local
  // Modes owner over the raw streams to get the same consolidation for
  // createApp-direct callers. Either way, every enable*/disable* call in this
  // function goes through an owner — no scattered raw ANSI toggles.
  // See km-silvery.term-sub-owners Phase 4.
  const injectedTerm = (injectValues as { term?: Term }).term

  // Output guard: created after protocol setup (see below).
  // Only guard when using real process.stdout — mock stdouts don't benefit from
  // the guard (which patches process.stdout.write), and it would route render
  // output to the real stdout instead of the mock.
  const isRealStdout = stdout === process.stdout
  const shouldGuardOutput = guardOutputOption ?? (alternateScreen && !headless && isRealStdout)
  // Output owner — mediates stdout/stderr/console writes. Stable across the
  // session; toggled via activate()/deactivate() for pause/resume cycles.
  // If an injected Term exposes `.output`, we reuse it (one writer per
  // resource). Otherwise we construct a local one and own its lifetime.
  //
  // Declared BEFORE `modes` so the local Modes owner's writer can close over
  // it lazily. Without that, modes captures `stdout.write` at construction
  // time; once `output.activate()` later monkey-patches `process.stdout.write`
  // into the suppress sink, every mode-toggle ANSI (alt-screen enter, mouse,
  // kitty keyboard, focus reporting) silently lands in the sink and never
  // reaches the terminal. Same shape as the Pro-review 2026-04-22 P0-1 fix
  // for `term.modes` (which already routes through `ownedWrite`); this
  // mirrors that for createApp's local-modes fallback.
  let output: Output | null = null
  let ownsOutput = false

  // Startup is a resource-acquisition transaction until the fully initialized
  // handle is returned. Register each sync owner in this temporary stack as it
  // is acquired; once cleanup() exists, rollback delegates to that canonical
  // path and only awaits its root-scope disposal. At that handoff the temporary
  // registrations are disarmed and the handle becomes the sole owner.
  const controller = new AbortController()
  const signal = controller.signal
  const providerCleanups: (() => void)[] = []
  const stateUnsubscribes: (() => void)[] = []
  const startupResources = new DisposableStack()
  let startupResourcesTransferred = false
  let startupCommitted = false
  let startupCleanup: (() => void) | null = null
  let startupScopeDispose: (() => Promise<void>) | null = null
  let shouldExit = false

  const registerStartupCleanup = (cleanup: () => void): void => {
    if (startupResourcesTransferred) return
    startupResources.defer(() => {
      if (!startupResourcesTransferred) cleanup()
    })
  }
  const registerProviderCleanup = (cleanup: () => void): void => {
    providerCleanups.push(cleanup)
    registerStartupCleanup(cleanup)
  }
  const registerStateUnsubscribe = (unsubscribe: () => void): void => {
    stateUnsubscribes.push(unsubscribe)
    registerStartupCleanup(unsubscribe)
  }

  await using _startupRollback = {
    async [Symbol.asyncDispose]() {
      if (startupCommitted) return
      shouldExit = true
      controller.abort()

      if (startupCleanup) {
        try {
          startupCleanup()
        } finally {
          await startupScopeDispose?.()
        }
        return
      }

      // No terminal protocol has been enabled before the canonical cleanup
      // handoff, but locally-created modes/providers/runtime may already own
      // process listeners. Release every sync owner before awaiting the scope.
      try {
        startupResources.dispose()
      } finally {
        await startupScopeDispose?.()
      }
    },
  }

  const writeTerminalControl = (data: string): void => {
    if (headless) return
    try {
      if (output && output.active()) output.write(data)
      else stdout.write(data)
    } catch (error) {
      if (error instanceof Error && error.message === "Terminal is closed") return
      throw error
    }
  }

  const modes =
    injectedTerm?.modes ??
    createModes({
      write: (s) => (output && output.active() ? output.write(s) : stdout.write(s)),
      stdin,
    })
  if (!injectedTerm) registerStartupCleanup(() => modes[Symbol.dispose]())

  // Initialize layout engine
  await ensureLayoutEngine()

  // Root app scope (km-silvery.lifecycle-scope Phase 1).
  //
  // Owns every resource that should live for the duration of this app:
  //   - components register child scopes via `useScopeEffect`
  //   - host-config disposes fiber-attached scopes when subtrees unmount
  //   - SIGINT/SIGTERM (when an injected Term exposes `term.signals`) start
  //     root disposal — fire-and-forget, errors via `reportDisposeError`.
  //
  // The same value is exposed to React via both `ScopeContext` and
  // `AppScopeContext` so `useScope()` and `useAppScope()` resolve to it
  // when no inner provider is present. Disposal is wired into `cleanup()`
  // below so it runs after React unmount but before terminal protocol
  // cleanup — child scopes get a chance to release resources before we
  // tear down stdin/stdout.
  const appScope = createScope("app")
  let appScopeDisposalPromise: Promise<void> | null = null
  const signalExit = { requested: false, handler: undefined as (() => void) | undefined }
  const disposeAppScope = (phase: "signal" | "app-exit"): Promise<void> => {
    appScopeDisposalPromise ??= appScope[Symbol.asyncDispose]().catch((error) => {
      reportDisposeError(error, { phase, scope: appScope })
    })
    return appScopeDisposalPromise
  }
  const awaitStartupScopeDisposal = async (): Promise<void> => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        disposeAppScope("app-exit"),
        new Promise<void>((resolve) => {
          timeout = setTimeout(() => {
            reportDisposeError(
              new Error(
                `app scope disposal did not settle within ${STARTUP_SCOPE_DISPOSE_TIMEOUT_MS}ms during startup rollback`,
              ),
              { phase: "app-exit", scope: appScope },
            )
            resolve()
          }, STARTUP_SCOPE_DISPOSE_TIMEOUT_MS)
        }),
      ])
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }
  startupScopeDispose = awaitStartupScopeDisposal

  // Wire external signal
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      const onExternalAbort = () => controller.abort()
      externalSignal.addEventListener("abort", onExternalAbort, { once: true })
      registerProviderCleanup(() => externalSignal.removeEventListener("abort", onExternalAbort))
    }
  }

  // Separate providers from plain values
  const providers: Record<string, Provider<unknown, Record<string, unknown>>> = {}
  const plainValues: Record<string, unknown> = {}

  // Create Term if not provided. In headless mode we pass mock streams so the
  // Term doesn't touch real stdin/stdout; `onResize` drives the mock stdout's
  // resize listeners so `term.size` observes dim changes.
  let autoTerm: Term | null = null
  if (!("term" in injectValues) || !isFullProvider(injectValues.term)) {
    const resizeListeners = new Set<() => void>()
    const termStdout = headless
      ? ({
          columns: cols,
          rows,
          [NOTIFICATION_WRITER_AVAILABLE]: explicitWritable !== undefined,
          write(data: string | Uint8Array) {
            if (explicitWritable) {
              explicitWritable.write(
                typeof data === "string" ? data : new TextDecoder().decode(data),
              )
            }
            return true
          },
          isTTY: false,
          on(event: string, handler: () => void) {
            if (event === "resize") resizeListeners.add(handler)
            return termStdout
          },
          off(event: string, handler: () => void) {
            if (event === "resize") resizeListeners.delete(handler)
            return termStdout
          },
        } as unknown as NodeJS.WriteStream)
      : stdout
    const termStdin = headless
      ? ({
          isTTY: false,
          on: () => termStdin,
          off: () => termStdin,
          setRawMode: () => {},
          resume: () => {},
          pause: () => {},
          setEncoding: () => {},
        } as unknown as NodeJS.ReadStream)
      : stdin
    // `resizeCoalesceMs` flows through from the caller (run.tsx emulator branch
    // passes `0` so `term.resize(...)` reflows layout synchronously; the
    // options-path with a fake real-stream defers to the createSize default of
    // 200 ms so SIGWINCH burst tests still see coalescing). Bead:
    // `@km/silvery/termless-resize-reflow-4-fails`.
    autoTerm = createTerm({
      stdin: termStdin,
      stdout: termStdout,
      mouse: mouseParseOptions,
      ...(capsOption ? { caps: capsOption } : {}),
      // Propagate `input: false` to the auto-created Term so its lazy
      // `.input` accessor returns undefined instead of constructing an
      // InputOwner on first access. Without this, createApp's input
      // subscription is gated by `inputDisabled` but the term-provider
      // subscription at line ~3902 reads `maybeTerm.input` and triggers
      // InputOwner construction — which calls `stdin.setEncoding("utf8")` +
      // `stdin.setRawMode(true)` and steals stdin out from under a host
      // process that's piping its own stdin to a child PTY (e.g. termless
      // `rec`). See `@km/termless/15541-rec-recording-mode-ux`.
      ...(inputDisabled ? { input: false as const } : {}),
      ...(explicitResizeCoalesceMs !== undefined
        ? { resizeCoalesceMs: explicitResizeCoalesceMs }
        : {}),
    })
    providers.term = autoTerm as unknown as Provider<unknown, Record<string, unknown>>
    registerProviderCleanup(() => autoTerm![Symbol.dispose]())

    if (headless && explicitOnResize) {
      const unsub = explicitOnResize((dims) => {
        currentDims = dims
        ;(termStdout as { columns: number; rows: number }).columns = dims.cols
        ;(termStdout as { columns: number; rows: number }).rows = dims.rows
        for (const listener of resizeListeners) listener()
      })
      registerProviderCleanup(unsub)
    }
  }

  // Wire SIGINT/SIGTERM into the canonical app exit request.
  //
  // The terminal Term owns the actual `process.on(...)` registrations via
  // `term.signals` — we just mediate one handler per signal that requests the
  // same abort + terminal cleanup + joined completion as unmount().
  // `term.signals.on(...)` returns a `SignalUnregister`
  // which is `Disposable & AsyncDisposable`, so we adopt it into `appScope`
  // and the unregister fires when the scope disposes (idempotent on a
  // process exiting after a real signal). Skipped for headless because
  // there's no real terminal for SIGINT to come from, and tests routinely
  // create+dispose Terms in tight loops without wanting global handlers.
  const effectiveTerm = injectedTerm ?? autoTerm
  // Claim stdin before any protocol mode is enabled. Detection and normal
  // key/mouse delivery use this same owner for the entire session; terminal
  // replies therefore cannot fall through a listener handoff or reach a
  // competing ad-hoc reader.
  const sessionInput = hostOwnsStdin ? effectiveTerm?.input : undefined
  if (sessionInput) setInputOwnerMouseOptions(sessionInput, mouseParseOptions)
  if (!headless && effectiveTerm?.signals) {
    const onSignal = (): void => {
      signalExit.requested = true
      signalExit.handler?.()
    }
    appScope.use(
      effectiveTerm.signals.on("SIGINT", onSignal, {
        priority: 5,
        name: "scope-root-sigint",
      }),
    )
    appScope.use(
      effectiveTerm.signals.on("SIGTERM", onSignal, {
        priority: 5,
        name: "scope-root-sigterm",
      }),
    )
  }

  // Categorize injected values
  for (const [name, value] of Object.entries(injectValues)) {
    if (isFullProvider(value)) {
      providers[name] = value
    } else {
      plainValues[name] = value
    }
  }

  // Build inject object (providers + plain values)
  const inject = { ...providers, ...plainValues } as I

  // Create store
  const store = createStore<S & I>((set, get, api) => {
    // Get base state from factory
    const baseState = factory(inject)(
      set as StoreApi<S>["setState"],
      get as StoreApi<S>["getState"],
      api as StoreApi<S>,
    )

    // Merge provider references into state (for access via selectors)
    const mergedState: Record<string, unknown> = { ...baseState }

    for (const [name, provider] of Object.entries(providers)) {
      mergedState[name] = provider

      // Subscribe to provider state changes (basic providers only)
      if (isBasicProvider(provider)) {
        const unsub = provider.subscribe((_providerState) => {
          // Could flatten provider state here if desired
          // For now, just trigger a re-check
        })
        registerStateUnsubscribe(unsub)
      }
    }

    // Add plain values
    for (const [name, value] of Object.entries(plainValues)) {
      mergedState[name] = value
    }

    return mergedState as S & I
  })

  // Track current dimensions
  let currentDims: Dims = { cols, rows }

  // Subscribe to resize events so currentDims stays in sync.
  // In headless mode this is handled by explicitOnResize above.
  // When a Term with a `size` sub-owner is injected, subscribe through the
  // owner so create-app sees the SAME coalesced geometry as the rest of the
  // pipeline. Otherwise fall back to direct stdout "resize" events for
  // standalone callers. See km-silvery.term-sub-owners Phase 5.
  if (!headless) {
    const termSize = effectiveTerm?.size
    if (termSize) {
      // Change-only subscription: `watch` swallows the seed fire so
      // mockTermSubscribers only see real resizes.
      const stop = watch(
        () => termSize.snapshot(),
        (next) => {
          currentDims = { cols: next.cols, rows: next.rows }
          for (const listener of mockTermSubscribers) listener(currentDims)
        },
      )
      registerProviderCleanup(stop)
    } else {
      const onStdoutResize = () => {
        currentDims = {
          cols: resolveTerminalDimension(undefined, stdout.columns, 80),
          rows: resolveTerminalDimension(undefined, stdout.rows, 24),
        }
        for (const listener of mockTermSubscribers) listener(currentDims)
      }
      stdout.on("resize", onStdoutResize)
      registerProviderCleanup(() => stdout.off("resize", onStdoutResize))
    }
  }

  let renderPaused = false
  let isRendering = false // Re-entrancy guard for store subscription
  let inEventHandler = false // True during processEvent/press — suppresses subscription renders
  let pendingRerender = false // Deferred render flag for re-entrancy
  // Armed by drainStandaloneCommitRerenders when the standalone convergence
  // loop hits its cap with a React-requested rerender still pending. Instead of
  // silently dropping that rerender (the @km/silvercode/19383 freeze), we paint
  // the current frame and schedule EXACTLY ONE follow-up standalone frame on the
  // next tick. Self-limiting: the follow-up gets its own fresh convergence
  // budget, so a steadily-growing stream converges one frame later instead of
  // stranding the buffer behind committed React state. The flag dedupes so a
  // burst of cap-exceeds within one frame schedules only one follow-up.
  let followupFrameScheduled = false
  // Lifetime count of standalone convergence cap-exceeds for this app session.
  // The per-occurrence breadcrumb is debug-level (DEBUG_LOG-routed, see
  // drainStandaloneCommitRerenders). The teardown summary escalates to a loud
  // warn only when cap-exceeds are consecutive, because the total lifetime count
  // grows during legitimate streaming ListView measurement updates too. Together
  // with the STRICT assert these are the NO-SILENT-ERRORS rails for the
  // dropped-paint class. Bead: @km/silvercode/19383.
  let standaloneCapExceedCount = 0
  let standaloneCapExceedStreak = 0
  let standaloneCapExceedMaxStreak = 0
  let standaloneCapExceededThisFrame = false

  // ========================================================================
  // ANSI Trace: SILVERY_TRACE=1 logs all stdout writes with decoded sequences
  // ========================================================================
  const _ansiTrace = !headless && process.env?.SILVERY_TRACE === "1"

  let _traceSeq = 0
  const _traceStart = performance.now()
  let _origStdoutWrite: typeof process.stdout.write | undefined

  if (_ansiTrace) {
    const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs")
    fs.writeFileSync("/tmp/silvery-trace.log", `=== SILVERY TRACE START ===\n`)

    _origStdoutWrite = stdout.write.bind(stdout) as typeof stdout.write

    const symbolize = (s: string): string =>
      s
        .replace(/\x1b\[\?1049h/g, "⟨ALT_ON⟩")
        .replace(/\x1b\[\?1049l/g, "⟨ALT_OFF⟩")
        .replace(/\x1b\[2J/g, "⟨CLEAR⟩")
        .replace(/\x1b\[H/g, "⟨HOME⟩")
        .replace(/\x1b\[\?25l/g, "⟨CUR_HIDE⟩")
        .replace(/\x1b\[\?25h/g, "⟨CUR_SHOW⟩")
        .replace(/\x1b\[\?2026h/g, "⟨SYNC_ON⟩")
        .replace(/\x1b\[\?2026l/g, "⟨SYNC_OFF⟩")
        .replace(/\x1b\[\?2004h/g, "⟨BPASTE_ON⟩")
        .replace(/\x1b\[\?2004l/g, "⟨BPASTE_OFF⟩")
        .replace(/\x1b\[0m/g, "⟨RST⟩")
        .replace(/\x1b\[(\d+);(\d+)H/g, "⟨GO $1,$2⟩")
        .replace(/\x1b\[38;5;(\d+)m/g, "⟨F$1⟩")
        .replace(/\x1b\[48;5;(\d+)m/g, "⟨B$1⟩")
        .replace(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g, "⟨FR$1,$2,$3⟩")
        .replace(/\x1b\[48;2;(\d+);(\d+);(\d+)m/g, "⟨BR$1,$2,$3⟩")
        .replace(/\x1b\[1m/g, "⟨BOLD⟩")
        .replace(/\x1b\[2m/g, "⟨DIM⟩")
        .replace(/\x1b\[3m/g, "⟨ITAL⟩")
        .replace(/\x1b\[4m/g, "⟨UL⟩")
        .replace(/\x1b\[7m/g, "⟨INV⟩")
        .replace(/\x1b\[22m/g, "⟨/BOLD⟩")
        .replace(/\x1b\[23m/g, "⟨/ITAL⟩")
        .replace(/\x1b\[24m/g, "⟨/UL⟩")
        .replace(/\x1b\[27m/g, "⟨/INV⟩")
        .replace(/\x1b\[39m/g, "⟨/FG⟩")
        .replace(/\x1b\[49m/g, "⟨/BG⟩")
        // Catch remaining CSI sequences
        .replace(/\x1b\[([0-9;]*)([A-Za-z])/g, "⟨CSI $1$2⟩")
        // Catch remaining ESC sequences
        .replace(/\x1b([^[])/, "⟨ESC $1⟩")

    const traceWrite = function (this: typeof stdout, chunk: unknown, ...args: unknown[]): boolean {
      const str = typeof chunk === "string" ? chunk : String(chunk)
      const seq = ++_traceSeq
      const ms = (performance.now() - _traceStart).toFixed(0)
      const decoded = symbolize(str)
      // Truncate for readability but keep enough to identify content
      const preview =
        decoded.length > 400
          ? decoded.slice(0, 200) + ` ...[${decoded.length}ch]... ` + decoded.slice(-100)
          : decoded
      fs.appendFileSync(
        "/tmp/silvery-trace.log",
        `[${String(seq).padStart(4, "0")}] +${ms}ms (${str.length}b): ${preview}\n`,
      )
      return (_origStdoutWrite as Function).call(this, chunk, ...args)
    } as typeof stdout.write

    stdout.write = traceWrite
    // Restore original stdout.write on cleanup (providerCleanups runs during cleanup())
    registerProviderCleanup(() => {
      if (_origStdoutWrite) stdout.write = _origStdoutWrite
    })

    // Pipe `silvery:trace`-namespaced loggily records to the trace log file.
    // The `{ ns: "silvery:trace" }` config routes only that namespace through
    // the writer — other silvery namespaces (silvery:app, silvery:render,
    // etc.) don't pollute the file.
    // Auto-lowers global log level to "debug" when above, so traceLog.debug?.()
    // banner records actually emit; restored on cleanup.
    const traceFileWriter = createFileWriter("/tmp/silvery-trace.log")
    const unsubscribeTraceWriter = addWriter({ ns: "silvery:trace" }, (formatted) =>
      traceFileWriter.write(formatted),
    )
    const _prevLogLevel: LogLevel = getLogLevel()
    if (_prevLogLevel !== "trace" && _prevLogLevel !== "debug") {
      setLogLevel("debug")
    }
    registerProviderCleanup(() => {
      unsubscribeTraceWriter()
      traceFileWriter.close()
      if (_prevLogLevel !== "trace" && _prevLogLevel !== "debug") {
        setLogLevel(_prevLogLevel)
      }
    })
  }

  // SILVERY_CAPTURE_OUTPUT: append every emitted frame to a file for ANSI
  // post-mortem analysis. Same contract as scheduler.ts so callers using
  // createApp().run() (km, etc.) get parity with run() consumers.
  const _captureFile = process.env.SILVERY_CAPTURE_OUTPUT
  let _captureFrame = 0
  let _outputFrame = 0

  const bytesOutMonitor = isStrictEnabled("bytes_out", 1) ? createBytesOutMonitor() : null
  const memMonitor = isStrictEnabled("mem", 1) ? createMemMonitor() : null
  if (bytesOutMonitor) registerStartupCleanup(() => bytesOutMonitor.dispose())
  if (memMonitor) registerStartupCleanup(() => memMonitor.dispose())
  const syncUpdateEnabled =
    process.env.SILVERY_SYNC_UPDATE === "1" || process.env.SILVERY_SYNC_UPDATE === "true"

  function recordOutputFrame(
    frame: string,
    sideChannelDiagnostics?: RenderOutputFrameDiagnostics,
  ): void {
    const traceOutputEnabled = RENDER_TRACE_ON || isRenderTraceEnabled()
    if (!bytesOutMonitor && !traceOutputEnabled) return
    _outputFrame += 1
    const bytes = Buffer.byteLength(frame)
    const syncWrapped = frame.startsWith(ANSI.SYNC_BEGIN) && frame.endsWith(ANSI.SYNC_END)
    const diagnostics =
      sideChannelDiagnostics !== undefined
        ? {
            ...sideChannelDiagnostics,
            outputChars: frame.length,
            syncWrapped,
          }
        : {
            ...getLastOutputPhaseDiagnostics(),
            outputChars: frame.length,
            syncWrapped,
          }
    bytesOutMonitor?.recordWrite(_outputFrame, bytes, diagnostics)
    if (traceOutputEnabled) {
      emitRenderOutputFrame({
        renderCount: renderer.renderCount(),
        outputFrame: _outputFrame,
        bytes,
        diagnostics,
      })
    }
  }

  type TerminalProtocolPhase = NonNullable<RenderOutputFrameDiagnostics["phase"]>
  const terminalProtocolDiagnostics = (
    owner: string,
    phase: TerminalProtocolPhase,
  ): RenderOutputFrameDiagnostics => ({
    source: "terminal-protocol",
    owner,
    phase,
    artifactKind: "terminal-sequence",
  })

  const recordTerminalProtocolWrite = (
    data: string,
    owner: string,
    phase: TerminalProtocolPhase,
  ): void => {
    if (data.length === 0) return
    recordOutputFrame(data, terminalProtocolDiagnostics(owner, phase))
  }

  // Create render target
  const target: RenderTarget = headless
    ? {
        write(frame: string) {
          if (explicitWritable) {
            explicitWritable.write(frame)
            recordOutputFrame(frame)
          }
        },
        getDims: () => currentDims,
      }
    : {
        write(frame: string): void {
          if (_perfLog) {
            process
              .getBuiltinModule("node:fs")
              .appendFileSync(
                "/tmp/silvery-perf.log",
                `TARGET.write: ${frame.length} bytes (paused=${renderPaused})\n`,
              )
          }
          if (_captureFile) {
            _captureFrame += 1
            const fs = process.getBuiltinModule("node:fs")
            fs.appendFileSync(
              _captureFile,
              `--- FRAME ${_captureFrame} (${Buffer.byteLength(frame)} bytes) ---\n`,
            )
            fs.appendFileSync(_captureFile, frame)
            fs.appendFileSync(_captureFile, "\n")
          }
          if (!renderPaused) {
            if (output) {
              output.write(frame)
            } else {
              stdout.write(frame)
            }
            recordOutputFrame(frame)
          }
        },
        getDims(): Dims {
          return currentDims
        },
        onResize(handler: (dims: Dims) => void): () => void {
          // Prefer the injected Term's Size owner (coalesced) when present;
          // fall back to direct stdout "resize" for standalone callers.
          const termSize = effectiveTerm?.size
          if (termSize) {
            return watch(
              () => termSize.snapshot(),
              (next) => {
                currentDims = { cols: next.cols, rows: next.rows }
                handler(currentDims)
              },
            )
          }
          const onResize = () => {
            currentDims = {
              cols: resolveTerminalDimension(undefined, stdout.columns, 80),
              rows: resolveTerminalDimension(undefined, stdout.rows, 24),
            }
            handler(currentDims)
          }
          stdout.on("resize", onResize)
          return () => stdout.off("resize", onResize)
        },
      }

  const postPaintWrites: string[] = []
  const frameArtifacts: TerminalFrameArtifact[] = []
  const writeOutOfBand = (data: string, diagnostics?: RenderOutputFrameDiagnostics): void => {
    if (headless) return
    if (output) {
      output.write(data)
    } else {
      stdout.write(data)
    }
    if (diagnostics) recordOutputFrame(data, diagnostics)
  }
  const queuePostPaintWrite = (data: string): void => {
    if (headless) return
    postPaintWrites.push(data)
  }
  const queueFrameArtifact = (artifact: TerminalFrameArtifact): void => {
    if (headless) return
    frameArtifacts.push(artifact)
  }
  const restoreFrameCursor = (): void => {
    if (!currentBuffer) return
    // Single source of truth for managed-frame cursor handling
    // (managed-caret.ts). This is a post-paint, out-of-band cursor RESTORE — it
    // emits only the park-then-hide suffix (the buffer was already composited by
    // runtime.render). Using computeManagedFrame keeps the restore suffix
    // identical to the frame's, and inherits the @km/code/v0.2/19702 focus-gate
    // (a non-focused fallback caret strands nothing). A bare `?25l` (no move)
    // would leave the hardware cursor at the last out-of-band write position; a
    // dropped/overridden hide then strands a visible cursor in transcript/chrome
    // rows. The presentation buffer is discarded — only the cursor controls are
    // used out-of-band.
    const managed = computeManagedFrame(currentBuffer._buffer, currentBuffer.nodes, "fullscreen", {
      windowFocused: chainApp.terminal.focused,
    })
    const output = protectManagedCursorSuffix(managed.cursorSuffix)
    recordOutputCursorDiagnostics({
      reason: "post-paint-cursor-restore",
      mode: "fullscreen",
      width: currentDims.cols,
      height: currentDims.rows,
      termRows: currentDims.rows,
      output,
      target: managed.cursorTarget,
      expectedTerminal: managed.expectedTerminal,
      promptBounds: managed.promptBounds,
      composerBounds: managed.composerBounds,
    })
    writeOutOfBand(output)
  }
  const flushFrameArtifacts = (phase: "pre-paint" | "post-paint"): boolean => {
    let flushed = false
    if (frameArtifacts.length > 0) {
      for (let i = frameArtifacts.length - 1; i >= 0; i--) {
        if (frameArtifacts[i]!.valid?.() === false) frameArtifacts.splice(i, 1)
      }
      const selected = frameArtifacts.filter((artifact) =>
        phase === "post-paint" ? artifact.kind === "terminal-sequence" : false,
      )
      if (selected.length > 0) {
        const selectedSet = new Set(selected)
        for (let i = frameArtifacts.length - 1; i >= 0; i--) {
          if (selectedSet.has(frameArtifacts[i]!)) frameArtifacts.splice(i, 1)
        }
      }
      const artifacts = selected
      artifacts.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
      for (const artifact of artifacts) {
        switch (artifact.kind) {
          case "terminal-sequence":
            writeOutOfBand(artifact.sequence, {
              source: "terminal-artifact",
              owner: artifact.owner,
              phase,
              artifactKind: artifact.kind,
            })
            flushed = true
            break
        }
      }
    }
    return flushed
  }
  const flushPostPaintWrites = (): void => {
    const flushedPostPaintArtifacts = flushFrameArtifacts("post-paint")
    if (flushedPostPaintArtifacts) restoreFrameCursor()
    if (postPaintWrites.length === 0) return
    const writes = postPaintWrites.splice(0)
    for (const data of writes) {
      writeOutOfBand(data, { source: "post-paint-write", phase: "post-paint" })
    }
    restoreFrameCursor()
  }

  // Resolve textSizing from caps + option
  // For "auto": use caps flag first, probe to verify if caps says yes
  // For "probe": start disabled, probe async to determine
  // For true/false: use directly
  // Post km-silvery.unicode-plateau Phase 2: read `caps.textSizing`
  // directly — profile.ts already computed the authoritative flag from
  // TERM=xterm-kitty + TERM_PROGRAM_VERSION. No second env probe.
  const heuristicSupported = capsOption?.textSizing ?? false
  const shouldProbe =
    textSizingOption === "probe" || (textSizingOption === "auto" && heuristicSupported)
  // Probe-cache fingerprint: program@version, derived from caps. Computed
  // once so the initial cache check and the async-probe path share one key.
  const probeFingerprint = getTerminalFingerprint(emulatorOption ?? { program: "", version: "" })
  // If we have a cached probe result, use it immediately instead of probing again
  const cachedProbe = shouldProbe ? getCachedProbeResult(probeFingerprint) : undefined
  let textSizing: boolean
  if (textSizingOption === true) {
    textSizing = true
  } else if (textSizingOption === "probe") {
    // "probe": start disabled unless cache says supported
    textSizing = cachedProbe?.supported ?? false
  } else if (textSizingOption === "auto") {
    if (cachedProbe !== undefined) {
      // Cache available: use definitive probe result
      textSizing = cachedProbe.supported
    } else {
      // No cache: use heuristic for first render, probe will verify
      textSizing = heuristicSupported
    }
  } else {
    textSizing = false
  }

  // Whether we still need to run the async probe (no cache hit).
  // `input: false` short-circuits any stdin-touching probe: the host
  // owns stdin and we must not race for it.
  const needsProbe = shouldProbe && cachedProbe === undefined && !headless && hostOwnsStdin

  // Resolve width detection: "auto" enables when caps are provided and not headless.
  // Same `input: false` short-circuit applies — width detection reads CPR
  // responses from stdin, which the host owns when input is opted out.
  const needsWidthDetection =
    !headless &&
    hostOwnsStdin &&
    (widthDetectionOption === true || (widthDetectionOption === "auto" && capsOption != null))

  // Track effective caps — may be updated by width detection and text sizing
  // probes. Heuristic fields (`maybeWideEmojis` etc.) live on caps now (post
  // km-silvery.plateau-naming-polish), so width detection toggles them
  // directly on the same object.
  let effectiveCaps = capsOption ? { ...capsOption, textSizing: textSizing } : undefined

  // Create pipeline config from caps (scoped width measurer + output phase).
  // Use `let` because the pipeline may be recreated after a probe changes
  // textSizing or width detection flips `caps.maybeWideEmojis`.
  let pipelineConfig = effectiveCaps ? createPipeline({ caps: effectiveCaps }) : undefined

  // Create runtime (pass scoped output phase to ensure measurer/caps are threaded)
  // mode must match alternateScreen: inline apps (alternateScreen=false) need
  // inline output phase rendering (relative cursor) + scrollback offset tracking.
  const runtime = createRuntime({
    target,
    signal,
    mode: alternateScreen ? "fullscreen" : "inline",
    syncUpdate: syncUpdateEnabled,
    outputPhaseFn: pipelineConfig?.outputPhaseFn,
    // @km/code/v0.2/19702: focus-aware caret. The window-focus STATE is owned by
    // the terminal chain (`chainApp.terminal.focused`, updated by the `term:focus`
    // op from standard `?1004` focus events via `input.onFocus`); the runtime
    // reads it once per frame: focused → filled block, unfocused → NO caret.
    // Lazy closure — `chainApp` is constructed below; the reader is only invoked
    // per-frame inside `runtime.render()`, well after construction, so there is
    // no TDZ hazard. Single source of truth: no parallel focus derivation.
    windowFocused: () => chainApp.terminal.focused,
  })
  registerStartupCleanup(() => runtime[Symbol.dispose]())

  // Cleanup state
  let cleanedUp = false
  let storeUnsubscribeFn: (() => void) | null = null
  let processUncaughtHandler:
    | ((error: Error, origin: NodeJS.UncaughtExceptionOrigin) => void)
    | null = null
  let processUnhandledRejectionHandler:
    | ((reason: unknown, promise: Promise<unknown>) => void)
    | null = null

  // Errors caught by SilveryErrorBoundary — flushed to stderr on cleanup so
  // the user sees them after the alt screen exits. Also dumped to a temp file
  // (path included in the stderr message) for full stack/component trace.
  //
  // Per `@km/silvery/auto-panic-on-render-error`: react render errors must
  // panic. The boundary still RECORDS for cleanup-time flushing (so any error
  // path that doesn't reach `panicApp` still surfaces something), but the
  // primary disposition is `panicApp(error)` — restore the terminal, dump the
  // stack to stderr on the user's normal screen, exit non-zero. Without the
  // panic call, the boundary's `log.error?.()` goes through silvery's console
  // capture which surfaces the error as an altscreen overlay (invisible after
  // process exit, not copy-pasteable, not in scrollback).
  const caughtErrors: Array<{ error: Error; dumpPath?: string }> = []
  function recordBoundaryError(error: Error) {
    // Circuit-break: when the per-process panic dump cap has been hit,
    // skip the side-effect of writing a render-error dump. panicApp()
    // below still routes through recordPanic which honours the same
    // cap (and, in non-test mode, triggers a hard process.exit). See
    // MAX_PANIC_DUMPS_PER_RUN.
    const skipDumpWrite =
      _processPanicCircuitBroken || _processPanicDumpCount >= MAX_PANIC_DUMPS_PER_RUN
    let dumpPath: string | undefined
    if (!skipDumpWrite) {
      dumpPath = writeDumpFile(
        "render-error",
        `${error.message}\n\n${error.stack ?? "(no stack)"}\n`,
      )
    }
    caughtErrors.push({ error, dumpPath })
    // panicApp is declared later in this same closure (line ~1973). The body
    // of recordBoundaryError only runs once React calls it, well after every
    // `const` in this scope has initialized.
    panicApp(error, { title: "react" })
  }

  type PanicReport = {
    title: string
    message: string
    details: ReadonlyArray<string>
    dumpPath?: string
    stack?: string
  }

  const panicReports: PanicReport[] = []
  let panicReportsFlushed = false

  function normalizePanicReason(reason: unknown): { message: string; stack?: string } {
    if (reason instanceof Error) {
      return { message: reason.message || reason.name || "panic", stack: reason.stack }
    }
    if (typeof reason === "string") return { message: reason }
    try {
      return { message: JSON.stringify(reason) ?? String(reason) }
    } catch {
      return { message: String(reason) }
    }
  }

  function normalizePanicDetails(details: PanicOptions["details"]): ReadonlyArray<string> {
    if (details === undefined) return []
    if (typeof details === "string") return [details]
    return details
  }

  function recordPanic(reason: unknown, options: PanicOptions = {}): void {
    const { message, stack } = normalizePanicReason(reason)
    const title = options.title?.trim() || "silvery"

    // Auto-panic circuit-break — refuse further dump-writes once the
    // per-process cap is hit. The FIRST overage emits the circuit-break
    // line on stderr; subsequent ones silently push a dump-less report
    // so cleanup-time flush still surfaces something. See
    // MAX_PANIC_DUMPS_PER_RUN and bead
    // @km/silvery/auto-panic-circuit-break.
    if (_processPanicCircuitBroken || _processPanicDumpCount >= MAX_PANIC_DUMPS_PER_RUN) {
      if (!_processPanicCircuitBroken) {
        _processPanicCircuitBroken = true
        try {
          process.stderr.write(
            `\n[silvery] auto-panic circuit-break: ${_processPanicDumpCount} dump(s) ` +
              `written to ${dumpGlob("panic")}. Refusing further dumps to ` +
              `prevent disk + CPU bleed. Set SILVERY_AUTO_PANIC_MAX_DUMPS to override ` +
              `(default: ${MAX_PANIC_DUMPS_PER_RUN}).\n`,
          )
        } catch {
          /* best-effort */
        }
      }
      panicReports.push({
        title,
        message,
        details: normalizePanicDetails(options.details),
        dumpPath: undefined,
        stack,
      })
      process.exitCode = options.exitCode ?? 2
      return
    }

    let dumpPath: string | undefined
    if (stack) {
      // Best-effort: panic must still restore the terminal and print a summary.
      dumpPath = writeDumpFile("panic", `${message}\n\n${stack}\n`)
      if (dumpPath) _processPanicDumpCount++
    }
    panicReports.push({
      title,
      message,
      details: normalizePanicDetails(options.details),
      dumpPath,
      stack,
    })
    process.exitCode = options.exitCode ?? 1
  }

  function flushPanicReports(): void {
    if (panicReportsFlushed || panicReports.length === 0) return
    panicReportsFlushed = true
    try {
      // Inline the full stack on stderr so a non-interactive caller
      // (CI, scripts, screenshots) sees the cause without having to open
      // the dump file. The dump path is still printed for convenience and
      // for cases where the stack is too long to scroll back through.
      // Per `@km/silvery/auto-panic-on-render-error`: "dump the full
      // exception to stderr — message + stack + component stack."
      const lines: string[] = [""]
      for (const report of panicReports) {
        lines.push(
          `${report.title}: ${report.message}${report.dumpPath ? ` (dump: ${report.dumpPath})` : ""}`,
        )
        for (const detail of report.details) {
          lines.push(`  ${detail}`)
        }
        if (report.stack) {
          lines.push(report.stack)
        }
      }
      lines.push("")
      // Durable write: a queued stream write can be reordered against sync
      // writes in `process.on("exit")` handlers (host resume hints) and its
      // tail dropped at exit. See stderr-durable.ts (@km/silvercode/19767).
      writeStderrDurably(lines.join("\n"))
    } catch {
      // Best-effort — stderr may already be torn down
    }
  }

  function disableInteractiveProtocolsEarly(): void {
    if (headless || !stdout.isTTY) return
    // Kitty keyboard, mouse tracking, and focus reporting are all
    // host-input-protocol toggles — they change how the terminal encodes
    // stdin. Disable exactly the protocols this runtime enabled, including
    // focused-island requests under `input: false`. Alt-screen / cursor /
    // colour cleanup (genuine stdout-only output state) is unconditional.
    // See `@km/termless/15575-rec-input-broken` (keyboard) and
    // `@km/termless/15586-rec-mouse-garble` (mouse + focus).
    const earlyDisable = [
      kittyEnabled ? disableKittyKeyboard() : "", // Stop Kitty release events when enabled.
      resetMouseCursorShape(), // Reset semantic mouse cursor shape before disabling mouse events.
      mouseEnabled ? disableMouse() : "", // Stop mouse events when enabled.
      focusReportingEnabled ? "\x1b[?1004l" : "", // Stop focus reporting when enabled.
    ].join("")
    try {
      writeSync((stdout as unknown as { fd: number }).fd, earlyDisable)
    } catch {
      try {
        stdout.write(earlyDisable)
      } catch {
        /* terminal may be gone */
      }
    }
  }

  function drainBufferedStdinBytes(): void {
    if (headless || !stdin.isTTY || inputDisabled) return
    try {
      stdin.resume()
      while (stdin.read() !== null) {
        /* discard Node-buffered data */
      }
      stdin.pause()
    } catch {
      // Drain failed — best-effort, continue cleanup
    }
  }

  async function drainLateStdinBytes(delayMs = 15): Promise<void> {
    if (headless || !stdin.isTTY || inputDisabled) return
    try {
      stdin.removeAllListeners("data")
      stdin.resume()
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      while (stdin.read() !== null) {
        /* discard late arrivals */
      }
      stdin.pause()
    } catch {
      // Best-effort — continue cleanup
    }
  }
  // Track protocol state for cleanup and suspend/resume
  let kittyEnabled = false
  const defaultKittyFlags =
    KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS | KittyFlags.REPORT_ALL_KEYS
  let kittyFlags: number = defaultKittyFlags
  let legacyKittyFlags: number | false = false
  let legacyAltScreenEnabled = false
  let legacyBracketedPasteEnabled = false
  let mouseEnabled = false
  let focusReportingEnabled = false
  let inputPumpStarted = false

  function setAltScreenMode(enabled: boolean, phase: TerminalProtocolPhase = "runtime"): void {
    const changed = modes.altScreen() !== enabled
    modes.altScreen(enabled)
    if (changed) {
      recordTerminalProtocolWrite(enabled ? "\x1b[?1049h" : "\x1b[?1049l", "mode:alt-screen", phase)
    }
  }

  function setBracketedPasteMode(enabled: boolean, phase: TerminalProtocolPhase = "runtime"): void {
    const changed = modes.bracketedPaste() !== enabled
    modes.bracketedPaste(enabled)
    if (changed) {
      recordTerminalProtocolWrite(
        enabled ? "\x1b[?2004h" : "\x1b[?2004l",
        "mode:bracketed-paste",
        phase,
      )
    }
  }

  function setKittyKeyboardMode(
    flags: number | false,
    phase: TerminalProtocolPhase = "runtime",
  ): void {
    const changed = modes.kittyKeyboard() !== flags
    modes.kittyKeyboard(flags)
    if (changed) {
      recordTerminalProtocolWrite(
        flags === false ? disableKittyKeyboard() : enableKittyKeyboard(flags),
        "mode:kitty-keyboard",
        phase,
      )
    }
    kittyEnabled = flags !== false
    if (flags !== false) kittyFlags = flags
  }

  function setMouseMode(mode: MouseTrackingMode, phase: TerminalProtocolPhase = "runtime"): void {
    const changed = modes.mouse() !== mode
    modes.mouse(mode)
    if (changed) {
      recordTerminalProtocolWrite(
        mode ? enableMouse({ pixels: mode === "pixel" }) : disableMouse(),
        "mode:mouse",
        phase,
      )
    }
    mouseEnabled = mode !== false
  }

  function setFocusReportingMode(enabled: boolean, phase: TerminalProtocolPhase = "runtime"): void {
    const changed = modes.focusReporting() !== enabled
    modes.focusReporting(enabled)
    if (changed) {
      recordTerminalProtocolWrite(
        enabled ? "\x1b[?1004h" : "\x1b[?1004l",
        "mode:focus-reporting",
        phase,
      )
    }
    focusReportingEnabled = enabled
  }
  // Selection follows mouse: when mouse tracking is enabled, drag-to-select +
  // OSC 52 copy should work without requiring explicit opt-in. (The comment
  // here used to say "don't hijack mouse clicks by default" but the
  // documented default is "true when mouse is enabled" — the old `?? false`
  // made every consumer set selection:true manually.) Callers that really
  // want mouse-without-selection pass `selection:false`.
  const selectionEnabled = selectionOption ?? mouseTrackingEnabled
  // copyOnSelect inherits "auto-copy on selection finish" from the
  // documented default (true when selection is enabled). Setting this
  // to false keeps selection highlighting + copy-mode yank but
  // suppresses the OSC 52 emission on drag-finish / double / triple
  // click. Pairs with the contract test in
  // `tests/contracts/run-defaults.contract.test.tsx`.
  const copyOnSelectEnabled = (copyOnSelectOption ?? true) && selectionEnabled
  let selectionState = createTerminalSelectionState()

  // --- Selection drag-vs-click state machine ---
  //
  //   idle     --mouseDown--> armed      (store anchor, NO selection started yet)
  //   armed    --mouseMove(|Δ|>=1)--> dragging (dispatch start then extend)
  //   armed    --mouseUp-->   idle       (plain click — click dispatches
  //                                       normally, no selection created;
  //                                       on 2nd / 3rd click in a chain
  //                                       dispatch startWord / startLine
  //                                       so the upcoming drag extends by
  //                                       word / line granularity)
  //   dragging --mouseMove--> dragging   (dispatch extend with current pos;
  //                                       extend uses the current granularity
  //                                       so word / line drags snap)
  //   dragging --mouseUp-->   idle       (dispatch finish + OSC 52,
  //                                       SUPPRESS subsequent onClick)
  //
  // `pendingSelectionDown` holds the armed anchor + scope between mousedown
  // and the first move-past-threshold. It is null in every other state.
  // `selectionState.selecting` is true only while dragging.
  //
  // Threshold: selection activates on the first move to a different cell
  // than the original pointer-down cell. Same-cell jitter (mouse reports
  // at same (x,y)) stays in `armed` and ends as a plain click on mouseUp.
  // The selection anchor can differ from the pointer-down cell when a click
  // lands in padding around text and snaps to the nearest selectable cell.
  let pendingSelectionDown: {
    col: number
    row: number
    downCol: number
    downRow: number
    boundaries: SelectionBoundary[]
    forceBufferSelection: boolean
    contentOrigin: ContentSelectionPoint | null
    /** Click-count this mousedown belongs to (1, 2, or 3).
     *  Determines what action to dispatch on the corresponding mouseUp:
     *  1 → no selection (plain click), 2 → startWord, 3 → startLine.
     *  Also determines drag granularity if the down is followed by a move:
     *  count=2 starts a word-granular drag, count=3 a line-granular drag. */
    clickCount: 1 | 2 | 3
  } | null = null

  // Deferred word/line auto-select intent — captured on mouseup-from-armed
  // (clickCount >= 2) and applied AFTER the component-tree dispatch so that
  // a downstream onClick / onDoubleClick / onTripleClick handler that calls
  // `event.preventDefault()` can opt out. See the gating comment in the
  // mouseup branch below.
  let pendingAutoSelect: {
    col: number
    row: number
    scope: SelectionScope | null
    clickCount: 2 | 3
    /** Raw-buffer (Shift) selection — copy verbatim, skip SELECTABLE_FLAG. */
    forceBufferSelection: boolean
  } | null = null
  let activeSelectionBoundaries: SelectionBoundary[] = []
  let activeForceBufferSelection = false
  let activeContentSelection: {
    root: AgNode
    origin: ContentSelectionPoint
    anchor: ContentSelectionEndpoint
    head: ContentSelectionEndpoint
    scrolled: boolean
  } | null = null
  let activeSelectionPointer: { x: number; y: number } | null = null
  let selectionAutoScrollTimer: ReturnType<typeof setInterval> | null = null
  let selectionAutoScrollDirection: -1 | 0 | 1 = 0

  function stopSelectionAutoScroll(): void {
    if (selectionAutoScrollTimer !== null) clearInterval(selectionAutoScrollTimer)
    selectionAutoScrollTimer = null
    selectionAutoScrollDirection = 0
    activeSelectionPointer = null
  }

  function dispatchSelectionAutoScrollTick(): void {
    if (!selectionState.selecting || !activeContentSelection || !activeSelectionPointer) {
      stopSelectionAutoScroll()
      return
    }
    const owner = findSelectionScrollOwner(
      activeContentSelection.head.node,
      activeContentSelection.root,
    )
    if (!owner) {
      stopSelectionAutoScroll()
      return
    }
    const direction = selectionEdgeScrollDirection(owner, activeSelectionPointer.y)
    const scroll = owner.scrollState
    const maxScroll = scroll ? Math.max(0, scroll.contentHeight - scroll.viewportHeight) : 0
    if (
      direction === 0 ||
      !scroll ||
      (direction < 0 && scroll.offset <= 0) ||
      (direction > 0 && scroll.offset >= maxScroll)
    ) {
      stopSelectionAutoScroll()
      return
    }
    const parsed: ParsedMouse = {
      button: 0,
      x: activeSelectionPointer.x,
      y: activeSelectionPointer.y,
      coordinateMode: "cell",
      action: "wheel",
      delta: direction,
      deltaX: 0,
      shift: false,
      meta: false,
      ctrl: false,
      receivedAt: performance.now(),
    }
    const wheel = createWheelEvent(
      parsed.x,
      parsed.y,
      owner,
      parsed,
      mouseEventState.keyboardModifiers,
    )
    dispatchMouseEvent(wheel)
    if (wheel.defaultPrevented) activeContentSelection.scrolled = true
  }

  function updateSelectionAutoScroll(x: number, y: number): void {
    activeSelectionPointer = { x, y }
    if (!selectionState.selecting || !activeContentSelection) {
      stopSelectionAutoScroll()
      return
    }
    const owner = findSelectionScrollOwner(
      activeContentSelection.head.node,
      activeContentSelection.root,
    )
    const direction = owner ? selectionEdgeScrollDirection(owner, y) : 0
    if (direction === 0) {
      stopSelectionAutoScroll()
      return
    }
    if (selectionAutoScrollTimer !== null && selectionAutoScrollDirection === direction) return
    if (selectionAutoScrollTimer !== null) clearInterval(selectionAutoScrollTimer)
    selectionAutoScrollDirection = direction
    selectionAutoScrollTimer = setInterval(dispatchSelectionAutoScrollTick, 50)
    dispatchSelectionAutoScrollTick()
  }

  /**
   * The drag's one pointer→node resolution. The content head and the scope both
   * read this result: when the scope re-hit-tested the pointer on its own, a
   * text-free pointer left it on the anchor's text rect while the head snapped
   * to other rows, and every row clipped to a column block (25962).
   */
  function selectionFocusAt(x: number, y: number, raw = false): SelectionAnchorResolution | null {
    // A Shift/raw drag bypasses document scopes, so it has no document focus.
    const root = raw ? null : getContainerRoot(container)
    if (!root) return null
    return resolveSelectionAnchorFromPoint({ root, buffer: currentBuffer?._buffer ?? null, x, y })
  }

  function resolveContentRangeAtPointer(
    contentRoot: AgNode,
    origin: ContentSelectionPoint,
    focus: SelectionAnchorResolution | null,
    x: number,
    y: number,
  ): { anchor: ContentSelectionEndpoint; head: ContentSelectionEndpoint } | null {
    const point = focus?.node ? contentSelectionPointFromPoint(focus.node, x, y) : null
    const range = point
      ? orientContentSelectionRange(contentRoot, {
          anchorBefore: origin.before,
          anchorAfter: origin.after,
          headBefore: point.before,
          headAfter: point.after,
        })
      : null
    if (!range) return null
    const originOwner = findSelectionScrollOwner(origin.before.node, contentRoot)
    const headOwner = findSelectionScrollOwner(range.head.node, contentRoot)
    return headOwner === originOwner ? range : null
  }

  appScope.defer(stopSelectionAutoScroll)

  function selectionCellFromPointer(x: number, y: number): { col: number; row: number } {
    return {
      col: Math.max(0, Math.floor(x)),
      row: Math.max(0, Math.floor(y)),
    }
  }

  function hardContainScope(boundaries: readonly SelectionBoundary[]): SelectionScope | null {
    return boundaries.find((boundary) => boundary.hardContain)?.scope ?? null
  }

  function nearestCommonSelectionScope(
    anchorBoundaries: readonly SelectionBoundary[],
    focusBoundaries: readonly SelectionBoundary[],
  ): SelectionScope | null {
    const focusNodes = new Set(focusBoundaries.map((boundary) => boundary.node))
    return anchorBoundaries.find((boundary) => focusNodes.has(boundary.node))?.scope ?? null
  }

  function selectionScopeForFocus(
    anchorBoundaries: readonly SelectionBoundary[],
    focus: SelectionAnchorResolution | null,
    forceBufferSelection: boolean,
    // The kept head's scope. Before a drag has one, the anchor's widest: its own
    // text rect would clamp a head over chrome back onto the anchor's row.
    retained: SelectionScope | null = anchorBoundaries.at(-1)?.scope ?? null,
  ): SelectionScope | null {
    if (forceBufferSelection) return null
    const hardScope = hardContainScope(anchorBoundaries)
    if (hardScope) return hardScope
    // No selectable focus (e.g. userSelect="none" chrome): the head is kept, so its scope is too.
    if (!focus?.node) return retained
    return nearestCommonSelectionScope(anchorBoundaries, focus.boundaries)
  }
  // Click-count tracker dedicated to selection (separate from
  // mouseEventState.doubleClick which drives onDoubleClick / onTripleClick
  // dispatch on the component tree). Updated on every mousedown so we
  // arm `pendingSelectionDown` with the right granularity intent. Without
  // a dedicated state, peeking mouseEventState.doubleClick on mousedown
  // would race the down-stream call inside processMouseEvent.
  const selectionClickCount = createClickCountState()

  // --- Selection bridge ---
  // Listeners for the bridge's subscribe mechanism (used by useSelection)
  const selectionListeners = new Set<() => void>()

  /** Notify useSelection() subscribers that selection state changed. */
  function notifySelectionListeners(): void {
    for (const listener of selectionListeners) {
      listener()
    }
  }

  // Capability registry: use provided one or create our own so the bridge
  // can be registered and useSelection() works even without withDomEvents().
  const capabilityRegistry: CapabilityRegistry =
    (capabilityRegistryOption as CapabilityRegistry | undefined) ?? createCapabilityRegistry()

  // The bridge exposes create-app's selection state via the SelectionFeature
  // interface. React hooks (useSelection) and copy-mode read/write through it.
  let selectionBridge: SelectionFeature | undefined
  if (selectionEnabled) {
    selectionBridge = createSelectionBridge({
      getState: () => selectionState,
      subscribe: (listener) => {
        selectionListeners.add(listener)
        return () => {
          selectionListeners.delete(listener)
        }
      },
      setRange: (range) => {
        activeContentSelection = null
        stopSelectionAutoScroll()
        if (range === null) {
          const [next] = terminalSelectionUpdate({ type: "clear" }, selectionState)
          selectionState = next
        } else {
          // Start at anchor, extend to head, finish
          const [s1] = terminalSelectionUpdate(
            { type: "start", col: range.anchor.col, row: range.anchor.row, source: "keyboard" },
            selectionState,
          )
          const [s2] = terminalSelectionUpdate(
            { type: "extend", col: range.head.col, row: range.head.row },
            s1,
          )
          const [s3] = terminalSelectionUpdate({ type: "finish" }, s2)
          selectionState = s3
        }
        notifySelectionListeners()
        // Force re-render to show/clear overlay
        if (currentBuffer) {
          runtime.invalidate()
        }
      },
      clear: () => {
        const [next] = terminalSelectionUpdate({ type: "clear" }, selectionState)
        selectionState = next
        activeContentSelection = null
        stopSelectionAutoScroll()
        notifySelectionListeners()
        if (currentBuffer) {
          runtime.invalidate()
        }
      },
      copy: () => {
        // Keyboard copy-mode yank: extract the current selection and write it
        // via OSC 52 — the same path mouse drag-copy uses (semantic by default;
        // copy-mode has no Shift raw-rectangle mode). km-silvery 19761.
        if (!copyOnSelectEnabled || !selectionState.range || !currentBuffer) return
        const text = extractText(currentBuffer._buffer, selectionState.range, {
          scope: selectionState.scope,
          rowMetadata: currentBuffer._buffer.getRowMetadataArray(),
        })
        if (text.length > 0) {
          const base64 = globalThis.Buffer.from(text).toString("base64")
          target.write(`\x1b]52;c;${base64}\x07`)
        }
      },
    })
    capabilityRegistry.register(SELECTION_CAPABILITY, selectionBridge)
  }

  // --- Node drag capability ---
  // Mouse-enabled runtimes install one DragFeature. The typed apply-chain
  // below owns gesture routing; React observes this same instance through
  // useDragState(), so input and presentation cannot drift onto parallel
  // authorities.
  const dragFeature: DragFeature | undefined = mouseTrackingEnabled
    ? createDragFeature({ invalidate: () => runtime.invalidate() })
    : undefined
  if (dragFeature) {
    capabilityRegistry.register(DRAG_CAPABILITY, dragFeature)
    appScope.defer(() => dragFeature.dispose())
  }

  // Virtual inline mode state
  const scrollback = virtualInlineOption ? createVirtualScrollback() : null
  let virtualScrollOffset = 0 // 0 = live (bottom), >0 = scrolled up
  let searchState = createSearchState()
  // A focus-out means the terminal/compositor may reflow or drop visible
  // alt-screen pixels while Silvery's shadow buffer stays internally correct.
  // Arm one repair clear on the next live paint. Focus-in and same-size resize
  // still force their own clears; repeated clears while a visible sibling pane
  // keeps streaming output are perceived as flicker.
  let fullscreenDamageRiskFromBlur = false
  let fullscreenDamageRepairRequested = false
  let fullscreenDamageLastRepaintMs = -Infinity

  // Focus manager (tree-based focus system) with event dispatch wiring
  const focusManager = createFocusManager({
    onFocusChange(oldNode, newNode, _origin) {
      // Dispatch blur event on the old element
      if (oldNode) {
        const blurEvent = createFocusEvent("blur", oldNode, newNode)
        dispatchFocusEvent(blurEvent)
      }
      // Dispatch focus event on the new element
      if (newNode) {
        const focusEvent = createFocusEvent("focus", newNode, oldNode)
        dispatchFocusEvent(focusEvent)
      }
      applyFocusedIslandProtocolModes("focus-change")
    },
  })

  const islandModeSubscriptions = new Map<
    AgNode,
    { modes: IslandModesOwner; unsubscribe: () => void }
  >()

  function walkAgTree(node: AgNode | null, visit: (node: AgNode) => void): void {
    if (!node) return
    visit(node)
    for (const child of node.children) walkAgTree(child, visit)
  }

  function containsAgNode(root: AgNode, target: AgNode): boolean {
    if (root === target) return true
    for (const child of root.children) {
      if (containsAgNode(child, target)) return true
    }
    return false
  }

  function releaseIslandModeSubscriptionsInSubtree(root: AgNode): void {
    for (const [node, sub] of islandModeSubscriptions) {
      if (containsAgNode(root, node)) {
        sub.unsubscribe()
        islandModeSubscriptions.delete(node)
      }
    }
  }

  function syncIslandModeSubscriptions(): void {
    const root = getContainerRoot(container)
    const seen = new Set<AgNode>()
    walkAgTree(root, (node) => {
      if (node.type !== "silvery-island") return
      const islandModes = node.islandState?.handle?.modes
      if (!islandModes) return
      seen.add(node)
      const existing = islandModeSubscriptions.get(node)
      if (existing?.modes === islandModes) return
      existing?.unsubscribe()
      const unsubscribe = islandModes.subscribe(() => {
        applyFocusedIslandProtocolModes("island-modes-change")
      })
      islandModeSubscriptions.set(node, { modes: islandModes, unsubscribe })
    })

    for (const [node, sub] of islandModeSubscriptions) {
      if (seen.has(node) && node.islandState?.handle?.modes === sub.modes) continue
      sub.unsubscribe()
      islandModeSubscriptions.delete(node)
    }
  }

  function syncFocusedIslandState(focusedNode: AgNode | null): void {
    const focusedIslands = new Set<AgNode>()
    let node: AgNode | null = focusedNode
    while (node) {
      if (node.type === "silvery-island") focusedIslands.add(node)
      node = node.parent
    }

    walkAgTree(getContainerRoot(container), (candidate) => {
      if (candidate.type !== "silvery-island" || !candidate.islandState) return
      candidate.islandState.focused = focusedIslands.has(candidate)
    })
  }

  function resolveDesiredProtocolModes(aggregated: IslandProtocolModes): {
    altScreen: boolean
    bracketedPaste: boolean
    kittyKeyboard: number | false
    mouse: MouseTrackingMode
    focusReporting: boolean
  } {
    const islandRequestsAltScreen = aggregated.altScreen === true
    const islandRequestsBracketedPaste = aggregated.bracketedPaste === true
    const islandRequestsKitty = aggregated.kittyKeyboard === true
    const islandRequestsMouse =
      aggregated.mouseTracking !== undefined && aggregated.mouseTracking !== "off"
    const islandRequestsFocusReporting = aggregated.focusReporting === true

    return {
      altScreen: legacyAltScreenEnabled || islandRequestsAltScreen,
      bracketedPaste: legacyBracketedPasteEnabled || islandRequestsBracketedPaste,
      kittyKeyboard: islandRequestsKitty ? defaultKittyFlags : legacyKittyFlags,
      mouse:
        legacyMouseMode === "pixel"
          ? "pixel"
          : legacyMouseMode || islandRequestsMouse
            ? true
            : false,
      focusReporting:
        inputPumpStarted &&
        ((hostOwnsStdin && focusReportingOption) || islandRequestsFocusReporting),
    }
  }

  function assertNoIslandModeLeak(
    desired: ReturnType<typeof resolveDesiredProtocolModes>,
    reason: string,
  ): void {
    if (!isStrictEnabled("island-mode-leak", 2)) return
    const actual: ProtocolModeSnapshot = {
      altScreen: modes.altScreen(),
      bracketedPaste: modes.bracketedPaste(),
      kittyKeyboard: modes.kittyKeyboard(),
      mouse: modes.mouse(),
      focusReporting: modes.focusReporting(),
    }
    const leaks = collectProtocolModeLeaks(actual, desired)
    if (leaks.length === 0) return
    throw new Error(
      `[SILVERY_STRICT=island-mode-leak] terminal protocol mode mismatch after ${reason}: ${leaks.join(
        "; ",
      )}`,
    )
  }

  function applyFocusedIslandProtocolModes(reason: string): void {
    if (headless) return
    syncIslandModeSubscriptions()
    syncFocusedIslandState(focusManager.activeElement)
    const aggregated = deriveProtocolModesFromFocusSubtree(focusManager.activeElement)
    const desired = resolveDesiredProtocolModes(aggregated)
    setAltScreenMode(desired.altScreen)
    setBracketedPasteMode(desired.bracketedPaste)
    setKittyKeyboardMode(desired.kittyKeyboard)
    setMouseMode(desired.mouse)
    setFocusReportingMode(desired.focusReporting)
    assertNoIslandModeLeak(desired, reason)
  }

  // Per-instance cursor state (replaces module-level globals)
  const cursorStore = createCursorStore()

  // Mouse event processor for DOM-level dispatch (with click-to-focus)
  const mouseEventState = createMouseEventProcessor({
    focusManager,
    onMouseCursorChange: (shape) => {
      writeTerminalControl(shape ? setMouseCursorShape(shape) : resetMouseCursorShape())
    },
  })

  // Layout-shift (CLS) monitor — runs post-paintFrame to detect
  // unstable layout (rect changes without scroll/resize cause) and
  // unreasonable sizes (degenerate / overflows-terminal). Gated by
  // `DEBUG=silvery:cls` for per-shift logs; `warn` channel always
  // active for size violations + reflow storms. Bead:
  // @km/silvery/layout-shift-instrumentation-cls.
  const clsMonitor = createClsMonitor()

  // Cleanup function - idempotent, can be called from exit() or finally
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true

    if (processUncaughtHandler) {
      process.off("uncaughtException", processUncaughtHandler)
      processUncaughtHandler = null
    }
    if (processUnhandledRejectionHandler) {
      process.off("unhandledRejection", processUnhandledRejectionHandler)
      processUnhandledRejectionHandler = null
    }

    // Log keypress performance summary before teardown (only emits when TRACE was active)
    logExitSummary()

    // Surface recovered standalone convergence cap-exceeds at teardown so they
    // never go silent (NO SILENT ERRORS). A high lifetime total can be normal
    // for long streams: each token batch can legitimately grow a ListView row,
    // then recover non-lossily via one follow-up frame. A high CONSECUTIVE
    // streak means the fresh follow-up budget keeps exhausting frame after
    // frame — that is the persistent feedback edge worth a loud warn.
    // Routed through loggily (DEBUG_LOG file in fullscreen).
    if (standaloneCapExceedCount > 0) {
      const summary =
        `standalone convergence cap exceeded ${standaloneCapExceedCount}× this session ` +
        `(max consecutive streak ${standaloneCapExceedMaxStreak}×; each handled non-lossily ` +
        `via a follow-up frame — no dropped paint). ` +
        `Bead: @km/silvercode/19383.`
      if (standaloneCapExceedMaxStreak >= STANDALONE_CAP_EXCEED_WARN_STREAK_THRESHOLD) {
        log.warn?.(
          `${summary} This consecutive streak is high enough to indicate a feedback edge that needs ` +
            `bounding at the source (re-run with SILVERY_INSTRUMENT=1 for the breakdown).`,
        )
      } else {
        log.debug?.(summary)
      }
    }

    // Pass-cause histogram (only emits when SILVERY_INSTRUMENT=1; no-op
    // otherwise). Aggregates across the lifetime of this app instance.
    //
    // - SILVERY_INSTRUMENT_FILE set: append a JSON record per app teardown.
    //   Suitable for vitest worker threads where `process.on("exit")` may
    //   not fire (each test still produces a teardown via app cleanup).
    // - SILVERY_INSTRUMENT_PRINT=1: also emit the formatted text summary
    //   (to stderr by default; to file if SILVERY_INSTRUMENT_FILE is set).
    //
    // Reset after emission so the next app's histogram doesn't double-count.
    if (INSTRUMENT) {
      const file = process.env.SILVERY_INSTRUMENT_FILE
      if (file) appendHistogramJson(file)
      if (process.env.SILVERY_INSTRUMENT_PRINT === "1") printPassHistogram()
      resetPassHistogram()
    }

    bytesOutMonitor?.dispose()
    memMonitor?.dispose()

    // Unmount React tree first — this runs effect cleanups (clears intervals,
    // cancels subscriptions) before we tear down the infrastructure.
    //
    // Fiber teardown also disposes any per-fiber scopes attached via
    // `attachNodeScope` (host-config) and any child scopes owned by
    // `useScopeEffect`. After this step every component-owned resource
    // should have started disposal.
    try {
      reconciler.updateContainerSync(null, fiberRoot, null, () => {})
      reconciler.flushSyncWork()
      reconciler.flushPassiveEffects()
      reconciler.flushSyncWork()
    } catch (error) {
      reportDisposeError(error, { phase: "react-unmount", scope: appScope })
    }

    // Dispose the root app scope — runs every resource that registered
    // through `useAppScope().use(...)` / `appScope.defer(...)` (LIFO),
    // and cascades into any child scopes that haven't already disposed
    // via fiber teardown above. cleanup() stays synchronous so terminal
    // restoration cannot wait behind user async disposers; startup rollback
    // awaits the memoized promise after this function has restored the terminal.
    void disposeAppScope("app-exit")

    // Unregister node lifecycle hooks
    setContainerNodeLifecycle(container, null)

    // Unsubscribe from store
    if (storeUnsubscribeFn) {
      storeUnsubscribeFn()
    }

    // Unsubscribe from provider state changes
    stateUnsubscribes.forEach((unsub) => {
      try {
        unsub()
      } catch {
        // Ignore
      }
    })

    // === Terminal protocol cleanup ===
    //
    // Order is critical to avoid escape sequence leaks on exit:
    //
    // 1. Stop consuming stdin — remove data listeners so no more events process
    // 2. Send all protocol disable sequences via writeSync (synchronous, reliable)
    // 3. Drain any in-flight stdin bytes (terminal may have queued events before
    //    processing our disable sequences — especially Kitty key release events)
    // 4. Disable raw mode and pause stdin
    //
    // Without the drain, Kitty release events (e.g., CSI 113;1:3u for 'q' release)
    // and SGR mouse events appear as garbled text on the shell prompt after exit.

    if (!headless && stdin.isTTY) {
      // Step 1: Stop consuming stdin — prevent any more event processing.
      // Skipped when `input: false`: the host owns stdin; we never attached
      // listeners and must not remove anything the host installed.
      if (hostOwnsStdin) {
        stdin.removeAllListeners("data")
        stdin.pause()
      }

      // Step 2: Send ALL protocol disable sequences unconditionally.
      // Sending a disable for an inactive protocol is harmless, and unconditional
      // cleanup is more robust than tracking enable/disable state.
      //
      // Exception: the three host-input-protocol toggles — Kitty keyboard,
      // mouse tracking, and focus reporting — are restored only when this
      // runtime enabled them. Focused islands can request them even when the
      // host opted out of owning stdin, so the input flag is not the cleanup
      // authority; the mode state is.
      const sequences = [
        focusReportingEnabled ? "\x1b[?1004l" : "", // Disable focus reporting if enabled.
        resetMouseCursorShape(), // Reset semantic mouse cursor shape.
        mouseEnabled ? disableMouse() : "", // Disable SGR mouse tracking if enabled.
        kittyEnabled ? disableKittyKeyboard() : "", // Pop Kitty keyboard protocol if enabled.
        "\x1b[?2004l", // Disable bracketed paste
        "\x1b[0m", // Reset SGR attributes
        resetCursorStyle(), // Reset cursor shape to terminal default (DECSCUSR 0)
        "\x1b[?25h", // Show cursor
        alternateScreen ? "\x1b[?1049l" : "", // Exit alternate screen
      ].join("")

      // Use writeSync for reliability — async write may not flush before exit.
      // For mock/test stdouts, writeSync(fd) bypasses the mock, so fall back.
      const isRealStdout = stdout === process.stdout
      if (isRealStdout) {
        try {
          writeSync((stdout as unknown as { fd: number }).fd, sequences)
        } catch {
          try {
            if (output) output.write(sequences)
            else stdout.write(sequences)
          } catch {
            /* terminal may be gone */
          }
        }
      } else {
        try {
          stdout.write(sequences)
        } catch {
          /* terminal may be gone */
        }
      }
      // Step 3: Drain in-flight stdin bytes. The terminal may have already
      // queued events (Kitty release, mouse moves) before processing our
      // disable sequences. Read and discard them so they don't leak to shell.
      // (drainBufferedStdinBytes() already short-circuits when input is opted out.)
      drainBufferedStdinBytes()

      // Step 4: Disable raw mode — only when we owned stdin in the first
      // place. With `input: false` the host owns it and may want raw
      // mode for its child PTY pipe; flipping it off here would break the host.
      if (hostOwnsStdin) {
        try {
          stdin.setRawMode(false)
        } catch {
          // Ignore — stdin may be closed
        }
      }
    } else if (!headless) {
      // Non-TTY cleanup: just send disable sequences
      const sequences = [
        focusReportingEnabled ? "\x1b[?1004l" : "",
        resetMouseCursorShape(),
        mouseEnabled ? disableMouse() : "",
        kittyEnabled ? disableKittyKeyboard() : "",
        "\x1b[?2004l",
        "\x1b[0m",
        resetCursorStyle(),
        "\x1b[?25h",
        alternateScreen ? "\x1b[?1049l" : "",
      ].join("")
      try {
        if (stdout === process.stdout && output) output.write(sequences)
        else stdout.write(sequences)
      } catch {
        /* terminal may be gone */
      }
    }

    // Cleanup providers — stdin is already cleaned up above for TTY,
    // but provider cleanup handles other resources (resize listeners, etc.)
    for (const sub of islandModeSubscriptions.values()) sub.unsubscribe()
    islandModeSubscriptions.clear()
    providerCleanups.forEach((fn) => {
      try {
        fn()
      } catch {
        // Ignore
      }
    })

    // Dispose the Modes owner — restores any protocols it activated.
    // This runs AFTER the writeSync safety sequences above, so modes'
    // dispose is a no-op for the common exit path (state has already been
    // cleared). When createApp was invoked without a terminal Term (e.g.
    // tests that exit without the writeSync block running), Modes handles
    // its own cleanup.
    if (!injectedTerm) {
      // Only dispose locally-owned Modes. A Term-owned Modes is disposed by
      // the Term's own Symbol.dispose (see term.ts).
      modes[Symbol.dispose]()
    }

    // Dispose runtime
    runtime[Symbol.dispose]()

    // SILVERY_STRICT canary — bound `process.stdout` resize listener count.
    //
    // Slug: `resize-listener-bound` (tier 1+). Default `SILVERY_STRICT=1`
    // catches the regression that prompted bead
    // `@km/silvery/resize-listener-leak` (P2): pre-fix every
    // `createTerm(process)` module-level singleton stacked a fresh
    // `process.stdout.on("resize")` attachment, surfacing as
    // `MaxListenersExceededWarning: 11 resize listeners ...` on `bun km
    // view` startup. Post-fix, all `createSize` instances share one
    // refcounted listener per stream — count is bounded by N (refcount-of-
    // active-Sizes) regardless of how many Terms were built.
    //
    // We assert two things at app teardown (after providerCleanups, which
    // disposed autoTerm and any Term-owned Size):
    //   1. `process.stdout.listenerCount("resize")` <= 1 — a single
    //      installed listener is fine (other Sizes from outside this app
    //      may still be active); the previous pathology was N>10.
    //   2. The shared refcount equals what `listenerCount` reports for our
    //      installation — proves the registry is the only attacher.
    //
    // Per `vendor/silvery/CLAUDE.md` mandate: no new SILVERY_* env vars —
    // the check threads through `isStrictEnabled(slug, minTier)`.
    if (isStrictEnabled("resize-listener-bound", 1)) {
      try {
        const sharedCount = _sharedResizeRefcount(process.stdout)
        const totalCount =
          typeof process.stdout.listenerCount === "function"
            ? process.stdout.listenerCount("resize")
            : 0
        // Hard upper bound: 10 (Node's default warning threshold). The
        // shared-listener fix bounds the silvery contribution to 1 per
        // stream regardless of N Sizes, so any breach signals a regression.
        if (totalCount > 10) {
          // eslint-disable-next-line no-console
          console.error(
            `[SILVERY_STRICT] resize-listener-bound: process.stdout has ${totalCount} ` +
              `resize listeners after app teardown (silvery shared refcount: ${sharedCount}). ` +
              `Slug: SILVERY_STRICT=resize-listener-bound. Per-test opt-out: ` +
              `SILVERY_STRICT=1,!resize-listener-bound. ` +
              `Likely regression of @km/silvery/resize-listener-leak — ` +
              `every createSize() instance is attaching its own listener instead of ` +
              `sharing the refcounted one in devices/size.ts:subscribeShared.`,
          )
        }
      } catch {
        // Diagnostic must never crash teardown
      }
    }

    // Restore guarded process output only AFTER leaving the alternate screen.
    // Output.deactivate() replays buffered stderr/console lines through the
    // original stderr; doing that before ?1049l writes the replay into the
    // alternate buffer and erases it from the user's normal screen. Cleanup
    // protocol bytes bypass the guard above via writeSync/output.write.
    // Only dispose if we constructed the Output; an injected Term owns its
    // final disposal, but this app still deactivates its interception cycle.
    if (output) {
      if (ownsOutput) output.dispose()
      else output.deactivate()
      output = null
    }

    // Flush explicit app panics after terminal cleanup so the diagnostic lands
    // on the normal screen instead of disappearing with alt-screen contents.
    flushPanicReports()

    // Flush any React render errors caught by SilveryErrorBoundary to stderr.
    // The boundary renders them inside the alt screen — once we leave alt
    // screen the message is gone. Print here so the user actually sees what
    // crashed, with a path to the full dump for stack/component info.
    if (caughtErrors.length > 0) {
      try {
        const lines: string[] = []
        lines.push("")
        lines.push(
          `silvery: ${caughtErrors.length} React render error${caughtErrors.length === 1 ? "" : "s"} caught during this session:`,
        )
        for (const { error, dumpPath } of caughtErrors) {
          lines.push(`  - ${error.message}${dumpPath ? ` (dump: ${dumpPath})` : ""}`)
        }
        lines.push("")
        // Durable for the same reason as flushPanicReports — see stderr-durable.ts.
        writeStderrDurably(lines.join("\n"))
      } catch {
        // Best-effort — stderr may already be torn down
      }
    }
  }

  // Exit promise
  let exitResolve: () => void
  let exitResolved = false
  let panicExitRequested = false
  const exitPromise = new Promise<void>((resolve) => {
    exitResolve = () => {
      if (!exitResolved) {
        exitResolved = true
        resolve()
      }
    }
  })

  // Now define exit function (needs cleanup)
  //
  // When called from within the event pump (key handler returns "exit"),
  // we send protocol disable sequences immediately but defer the full
  // cleanup (drain + raw mode) to the pump's finally block. This gives
  // the event loop time to receive late-arriving bytes (e.g., Kitty
  // keyboard release events) before we hand stdin back to the shell.
  //
  // When called from outside the pump (signal handler, direct call),
  // we do sync cleanup immediately (best-effort).
  const exit = () => {
    if (shouldExit) return // Already exiting
    shouldExit = true

    // Immediately disable protocols that generate async responses.
    // This is the earliest possible moment — before the terminal
    // sends any more events in response to the exit key.
    disableInteractiveProtocolsEarly()

    controller.abort()

    // If we're inside the event pump, defer cleanup — the pump's
    // finally block will call cleanupAfterDrain() with an async drain.
    // If we're outside (signal handler, etc.), do sync cleanup now.
    if (!inEventHandler) {
      cleanup()
    }
    // The pump's finally block is the sole exitPromise resolver. It joins
    // root-scope async disposal before waitUntilExit() may complete.
  }
  signalExit.handler = exit
  if (signalExit.requested) exit()

  const panicApp = (reason: unknown, options?: PanicOptions) => {
    recordPanic(reason, options)

    // Circuit-break hard-exit: once the per-process dump cap fires, force
    // terminal cleanup and process.exit(2) so a runaway panic loop in a
    // long-lived process (vitest worker, daemon, server) terminates
    // cleanly instead of pinning CPU forever. Skipped under the test-only
    // SILVERY_AUTO_PANIC_TEST_NO_EXIT env (see module-level docstring).
    if (_processPanicCircuitBroken && !isPanicTestNoExit()) {
      try {
        disableInteractiveProtocolsEarly()
      } catch {
        /* best-effort */
      }
      try {
        flushPanicReports()
      } catch {
        /* best-effort */
      }
      try {
        cleanup()
      } catch {
        /* best-effort */
      }
      process.exit(2)
    }

    if (cleanedUp) {
      flushPanicReports()
      return
    }
    if (shouldExit) return
    panicExitRequested = true
    if (inEventHandler) {
      exit()
      return
    }
    shouldExit = true
    disableInteractiveProtocolsEarly()
    controller.abort()
    void (async () => {
      await drainLateStdinBytes(PANIC_STDIN_DRAIN_MS)
      cleanup()
    })()
  }

  if (!headless) {
    processUncaughtHandler = (error: Error) => {
      panicApp(error, { title: "uncaughtException" })
    }
    processUnhandledRejectionHandler = (reason: unknown) => {
      panicApp(reason, { title: "unhandledRejection" })
    }
    registerStartupCleanup(() => {
      if (processUncaughtHandler) process.off("uncaughtException", processUncaughtHandler)
      if (processUnhandledRejectionHandler) {
        process.off("unhandledRejection", processUnhandledRejectionHandler)
      }
    })
    process.on("uncaughtException", processUncaughtHandler)
    process.on("unhandledRejection", processUnhandledRejectionHandler)
  }

  const standaloneFrameTasks = new Set<Promise<void>>()
  const startStandaloneFrame = (): void => {
    const task = renderStandaloneFrame()
    standaloneFrameTasks.add(task)
    void task.then(
      () => standaloneFrameTasks.delete(task),
      (error: unknown) => {
        standaloneFrameTasks.delete(task)
        panicApp(error, { title: "standalone render" })
      },
    )
  }
  const joinStandaloneFrames = async (): Promise<void> => {
    while (standaloneFrameTasks.size > 0) {
      await Promise.allSettled(standaloneFrameTasks)
    }
  }

  // Create SilveryNode container.
  // onRender fires during React's resetAfterCommit — inside the commit phase.
  // Calling doRender from there would be re-entrant (doRender calls updateContainerSync
  // which triggers commit which calls onRender again). Always defer via microtask.
  // Without this callback, setInterval/setTimeout-driven setState never flushes to terminal.
  const container = createContainer(() => {
    if (shouldExit) return
    if (inEventHandler) {
      // During processEvent/press: just flag, caller's flush loop handles it.
      pendingRerender = true
      return
    }
    // Always defer — onRender fires during React commit, re-entry is unsafe.
    if (!pendingRerender) {
      pendingRerender = true
      queueMicrotask(() => {
        if (!pendingRerender) return
        if (isRendering) return
        pendingRerender = false
        startStandaloneFrame()
      })
    }
  })
  registerStartupCleanup(() => setContainerNodeLifecycle(container, null))

  // Wire up focus cleanup for this render root — when React unmounts a subtree,
  // the host-config calls this to clear focus if the active element was removed.
  setContainerNodeLifecycle(container, {
    onNodeRemoved: (removedNode) => {
      releaseIslandModeSubscriptionsInSubtree(removedNode)
      focusManager.handleSubtreeRemoved(removedNode)
      applyFocusedIslandProtocolModes("subtree-removed")
    },
    onNodeUpdated: (updatedNode) => focusManager.handleNodeUpdated(updatedNode),
    onSubtreeAttached: (attachedRoot) => focusManager.handleSubtreeAttached(attachedRoot),
  })

  // Create React fiber root.
  //
  // `onUncaughtError` wires React's render-error path to `panicApp` so a
  // thrown render or effect (`Rendered more hooks than during the previous
  // render`, `throw new Error(...)` in a component, etc.) restores the
  // terminal, dumps the stack to stderr on the user's normal screen, and
  // exits non-zero. Before this wiring the callback was `() => {}` and
  // render errors only surfaced via `console.error` capture — visible only
  // in the altscreen overlay, not copyable, not scrollbackable. See
  // `@km/silvery/auto-panic-on-render-error`.
  const fiberRoot = createFiberRoot(container, {
    onUncaughtError: (error) => {
      panicApp(error, { title: "react" })
    },
  })

  // cleanup() can now safely touch every dependency it closes over. Transfer
  // ownership from the pre-initialization transaction to the canonical handle
  // path before any rendering or terminal protocol activation can throw.
  startupCleanup = cleanup
  startupResourcesTransferred = true
  startupResources.dispose()

  // Track current buffer for text access
  let currentBuffer: Buffer

  // Create mock stdout for contexts
  const mockStdout = {
    columns: cols,
    rows: rows,
    write: () => true,
    isTTY: false,
    on: () => mockStdout,
    off: () => mockStdout,
    once: () => mockStdout,
    removeListener: () => mockStdout,
    addListener: () => mockStdout,
  } as unknown as NodeJS.WriteStream

  // Create mock term — override getState to return the app's actual dimensions
  // rather than process.stdout dimensions (which may differ in test/emulator contexts).
  // Also override subscribe to notify listeners on resize so useSyncExternalStore
  // (used by useTerm/useWindowSize) triggers re-renders when dimensions change.
  //
  // CRITICAL: we seed the mock term with `{ cols, rows }` so it routes through
  // `createHeadlessTerm`, which uses `createFixedSize(dims)` — the resulting
  // `term.size.cols()` / `.rows()` reflect the app's *actual* viewport. If we
  // called `createTerm({ color: "truecolor" })` here, it would route through
  // `createNodeTerm` and read `process.stdout.columns/rows`, which in
  // termless/emulator/test contexts is the host's stdout (often 80×24) —
  // NOT the caller's emulator dims. That mismatch cascades into
  // `useWindowSize()` consumers: apps laying out `height={termRows}` above
  // an overflow-scroll container (e.g. ListView) would oversize the column,
  // pushing siblings below the viewport — the Composer-off-screen bug
  // (km-silvery.listview-flex-sibling).
  //
  // We still override `.size.cols()` / `.rows()` / `.snapshot()` to read
  // `currentDims` so resizes propagate through the same subscriber fanout.
  // TermContext needs app-controlled dimensions, but consumers also read the
  // runtime profile caps (e.g. Kitty graphics). Preserve those caps when
  // creating the dimension-controlled context term.
  const termContextCaps = effectiveCaps ?? effectiveTerm?.caps
  const baseMockTerm = createTerm({
    cols: currentDims.cols,
    rows: currentDims.rows,
    ...(termContextCaps ? { caps: termContextCaps } : {}),
  })
  const mockTermSubscribers = new Set<(state: { cols: number; rows: number }) => void>()
  // Bridge resize notifications into the baseMockTerm.size signal, so any
  // `useTerm(t => t.size.cols())` consumer re-renders on resize. The headless
  // Term's size is a `createFixedSize` with an `update(cols, rows)` method.
  const mockSizeUpdate = (
    baseMockTerm.size as unknown as {
      update?: (cols: number, rows: number) => void
    }
  ).update
  if (mockSizeUpdate) {
    mockTermSubscribers.add((next) => mockSizeUpdate(next.cols, next.rows))
  }
  const mockTerm = Object.create(baseMockTerm, {
    getState: { value: (): { cols: number; rows: number } => currentDims },
    notify: {
      value: effectiveTerm
        ? effectiveTerm.notify.bind(effectiveTerm)
        : baseMockTerm.notify.bind(baseMockTerm),
    },
    onNotificationActivation: {
      value: effectiveTerm
        ? effectiveTerm.onNotificationActivation.bind(effectiveTerm)
        : baseMockTerm.onNotificationActivation.bind(baseMockTerm),
    },
    subscribe: {
      value: (listener: (state: { cols: number; rows: number }) => void): (() => void) => {
        mockTermSubscribers.add(listener)
        return () => mockTermSubscribers.delete(listener)
      },
    },
  }) as typeof baseMockTerm

  // Apply-chain substrate (TEA Phase 2) — see
  // @silvery/create/runtime/{base-app,with-*-chain,event-loop}.
  //
  // Input / paste / terminal-focus events flow through the chain directly
  // (see `processEventBatch` and the `press()` path). The chain exposes
  // plugin stores on `ChainAppContext` that ag-react hooks subscribe to.
  //
  // withFocusChain.dispatchKey does the focus-tree dispatch inline — the
  // legacy `handleFocusNavigation(…) + runtimeInputListeners` decision
  // point is now a single chain call per event.
  const baseApp = createBaseApp()
  const terminalChainApp = withTerminalChain({
    cols: currentDims.cols,
    rows: currentDims.rows,
  })(baseApp)
  const pasteChainApp = withPasteChain({})(terminalChainApp)
  const inputChainApp = withInputChain(pasteChainApp)
  const focusChainApp = withFocusChain({
    dispatchKey: (input, key) => {
      const focusResult = handleFocusNavigation(input, key as Key, focusManager, container, {
        handleTabCycling: (options as { handleTabCycling?: boolean }).handleTabCycling ?? true,
      })
      return focusResult === "consumed"
    },
    hasActiveFocus: () => focusManager.activeElement !== null,
  })(inputChainApp)
  const dragChainApp = dragFeature
    ? withDragChain({
        feature: dragFeature,
        hitTest: (x, y) => {
          const root = getContainerRoot(container)
          return root ? hitTest(root, x, y) : null
        },
      })(focusChainApp)
    : focusChainApp
  // Custom events — replaces the legacy RuntimeContext.on/emit surface
  // for app-defined channels (e.g. km-tui's `link:open`).
  const app = withCustomEvents(dragChainApp)
  // Focus event slice — mirrors the withTerminalChain `focused` snapshot
  // into a pub/sub store shaped like InputStore/PasteStore. Used by the
  // ChainAppContext `focusEvents` accessor (hooks useTerminalFocused,
  // useModifierKeys).
  const focusEventListeners: Array<(focused: boolean) => void> = []
  const appFocusEvents = {
    register(handler: (focused: boolean) => void): () => void {
      focusEventListeners.push(handler)
      return () => {
        const i = focusEventListeners.indexOf(handler)
        if (i >= 0) focusEventListeners.splice(i, 1)
      }
    },
    notify(focused: boolean): void {
      for (const h of focusEventListeners) h(focused)
    },
  }

  // Raw-key observer slice — hooks that need unfiltered access to key events
  // (useModifierKeys is the canonical consumer). Fired for every key event
  // including release and modifier-only, regardless of focus consumption.
  const rawKeyListeners: Array<(input: string, key: Key) => void> = []
  const appRawKeys = {
    register(handler: (input: string, key: Key) => void): () => void {
      rawKeyListeners.push(handler)
      return () => {
        const i = rawKeyListeners.indexOf(handler)
        if (i >= 0) rawKeyListeners.splice(i, 1)
      }
    },
    notify(input: string, key: Key): void {
      for (const h of rawKeyListeners) h(input, key)
    },
  }
  // Expose on the BaseApp so ag-react hooks can reach the slice once migrated.
  // Keep typing loose here — BaseApp extensions are added by plugins.
  type AppWithChains = BaseApp & {
    input: InputStore
    paste: PasteStore
    terminal: TerminalStore
    focusChain: FocusChainStore
    events: CustomEventStore
    focusEvents: typeof appFocusEvents
    rawKeys: typeof appRawKeys
  }
  const chainApp: AppWithChains = Object.assign(app, {
    focusEvents: appFocusEvents,
    rawKeys: appRawKeys,
  })

  // ChainAppContext value — the ag-react-visible slice of the chain.
  const chainAppContextValue: ChainAppContextValue = {
    input: chainApp.input,
    paste: chainApp.paste,
    focusEvents: chainApp.focusEvents,
    rawKeys: chainApp.rawKeys,
    events: chainApp.events,
  }

  // Runtime handle — trimmed to `exit()` only. Input / paste / focus
  // subscriptions live on `ChainAppContext` (see chainAppContextValue
  // above); app-defined view ↔ runtime events ride on
  // `ChainAppContext.events` (withCustomEvents).
  const runtimeContextValue: RuntimeContextValue = {
    exit: () => exit(),
    panic: (reason, options) => panicApp(reason, options),
  }

  // Wrap element with all required providers
  // SilveryErrorBoundary is always the outermost wrapper — catches render errors gracefully.
  // If a Root component is provided (e.g., from withInk), wrap the element with it
  // inside silvery's contexts so it can access Term, Stdout, FocusManager, Runtime.
  const Root = RootComponent ?? React.Fragment
  // Cache backend selection:
  // - inline: "terminal" — items promoted to real terminal scrollback
  // - fullscreen + virtualInline: "virtual" — items stored in HistoryBuffer,
  //   viewable via virtual scroll overlay
  // - plain fullscreen: "retain" — items cached but kept in the render tree
  //   (no scrollback to display unmounted items, virtualizer handles windowing)
  const cacheBackend = !alternateScreen ? "terminal" : virtualInlineOption ? "virtual" : "retain"
  const wrappedElement = (
    <SilveryErrorBoundary onError={recordBoundaryError}>
      <ScopeProvider scope={appScope} appScope={appScope}>
        <CursorProvider store={cursorStore}>
          <CacheBackendContext.Provider value={cacheBackend}>
            <TermContext.Provider value={mockTerm}>
              <StdoutContext.Provider
                value={{
                  // Headless backends: keep the mock stdout (no real terminal to write to).
                  // Real terminals: expose the actual stdout so consumers (e.g., Image)
                  // can read columns/rows and receive Kitty/Sixel escapes via `write`.
                  stdout: headless ? mockStdout : stdout,
                  // The render pipeline owns the silvery frame; out-of-band writes
                  // (image escapes, hyperlink protocol, etc.) need a path that
                  // bypasses the Output guard's stdout intercept. Prefer the Output
                  // owner's `write` (bypasses the intercept by design) when active;
                  // otherwise fall back to direct `stdout.write`. Headless = no-op.
                  write: headless
                    ? () => {}
                    : (data: string) => {
                        writeOutOfBand(data)
                      },
                  queueFrameArtifact: headless ? undefined : queueFrameArtifact,
                  writeAfterFrame: headless ? () => {} : queuePostPaintWrite,
                  notifyScrollback: (lines: number) => runtime.addScrollbackLines(lines),
                  promoteScrollback: (content: string, lines: number) =>
                    runtime.promoteScrollback(content, lines),
                  resetInlineCursor: () => runtime.resetInlineCursor(),
                  getInlineCursorRow: () => runtime.getInlineCursorRow(),
                }}
              >
                <StderrContext.Provider
                  value={{
                    stderr: process.stderr,
                    write: (data: string) => {
                      process.stderr.write(data)
                    },
                  }}
                >
                  <FocusManagerContext.Provider value={focusManager}>
                    <RuntimeContext.Provider value={runtimeContextValue}>
                      <ChainAppContext.Provider value={chainAppContextValue}>
                        <CapabilityRegistryContext.Provider value={capabilityRegistry}>
                          <Root>
                            <StoreContext.Provider value={store as StoreApi<unknown>}>
                              {element}
                            </StoreContext.Provider>
                          </Root>
                        </CapabilityRegistryContext.Provider>
                      </ChainAppContext.Provider>
                    </RuntimeContext.Provider>
                  </FocusManagerContext.Provider>
                </StderrContext.Provider>
              </StdoutContext.Provider>
            </TermContext.Provider>
          </CacheBackendContext.Provider>
        </CursorProvider>
      </ScopeProvider>
    </SilveryErrorBoundary>
  )

  // Performance instrumentation — count renders per event
  let _eventStart = 0
  const _perfLog: boolean = !!(
    typeof process !== "undefined" && process.env?.DEBUG?.includes("silvery:perf")
  )

  // Renderer factory — owns the long-lived Ag instance, prevBuffer tracking,
  // SILVERY_STRICT comparison, and perf logging. See renderer.ts.
  const rendererCellDebug =
    CELL_DEBUG && typeof CELL_DEBUG.x === "number" && typeof CELL_DEBUG.y === "number"
      ? { x: CELL_DEBUG.x, y: CELL_DEBUG.y }
      : null
  const renderer = createRenderer({
    wrappedElement,
    fiberRoot,
    container,
    runtime,
    alternateScreen,
    pipelineConfig,
    noIncremental: NO_INCREMENTAL,
    strictMode: STRICT_MODE,
    cellDebug: rendererCellDebug,
    instrumented: INSTRUMENTED,
    ansiTrace: _ansiTrace,
    perfLog: _perfLog,
  })
  const doRender = renderer.doRender

  // Startup ordering — both invariants must hold:
  //
  //   (1) Output owner activates BEFORE alt-screen entry so any
  //       stderr/console write during startup (React render, accountly
  //       init, recall index, loggily startup ticks, etc.) is captured
  //       by buffer-and-replay instead of flashing on the user's main
  //       screen for one frame and then being wiped by `\x1b[2J\x1b[H`.
  //       (Bug: silvercode startup log line briefly visible then lost.)
  //
  //   (2) Alt-screen entry happens BEFORE the initial doRender() so that
  //       React effects fired during reconcile (e.g., <Image>'s
  //       useEffect writing Kitty graphics escapes) land on the alt
  //       screen rather than the main screen and then get wiped when
  //       alt-screen entry clears its buffer.
  //
  // Sequence: output.activate() → alt-screen ON → clear → cursor hide →
  // first doRender (effects write to alt screen, surviving subsequent
  // cell paints after the text frame so terminal graphics are not
  // immediately overwritten by the frame's reserved cells.
  //
  // Capture model (Output owner):
  //   - DEBUG_LOG set       → mirror stderr/console writes to that file
  //   - DEBUG_LOG unset     → buffer stderr/console writes; replay to the
  //                           normal terminal on exit so the operator sees
  //                           what was logged (no silent drop, no sidecar
  //                           file by default)
  //   - SILVERY_NO_CAPTURE  → opt out for debugging, leave streams as-is
  //
  // Once active, process.stdout.write is patched to suppress non-silvery
  // writes — every silvery-owned write below (alt-screen sequences,
  // paintFrame target.write) must therefore go through `output.write`,
  // which toggles the silveryWriting flag so it bypasses the suppress
  // sink. The render `target` already routes through `output.write` when
  // `output` is set (see RenderTarget.write above), and the explicit
  // alt-screen sequences below mirror that via `writeOwned`.
  if (shouldGuardOutput && process.env.SILVERY_NO_CAPTURE !== "1") {
    // Prefer the effective Term's Output sub-owner (single writer per
    // resource). Fall back to constructing a local one when the Term has no
    // Output (headless / emulator backends).
    const termOutput = effectiveTerm?.output
    if (termOutput) {
      output = termOutput
      ownsOutput = false
    } else {
      output = createOutput()
      ownsOutput = true
    }
    // Default: buffer-and-replay when DEBUG_LOG isn't set. The buffer
    // flushes to the original stderr on deactivate(), so the operator
    // sees the captured output on exit instead of silently losing it.
    output.activate({ bufferStderr: !process.env.DEBUG_LOG })
  }

  // Local helper: route a transient write through the output owner when
  // active (so the suppress sink doesn't eat it), else through the raw
  // stdout. Used by the alt-screen entry block below for sequences that
  // don't naturally go through `target.write` or the modes owner.
  const writeOwned = (data: string, diagnostics?: RenderOutputFrameDiagnostics): void => {
    if (output) output.write(data)
    else stdout.write(data)
    if (diagnostics) recordOutputFrame(data, diagnostics)
  }

  // Enter alternate screen if requested, then clear and hide cursor —
  // BEFORE initial render so reconciler effects land on alt screen.
  if (!headless) {
    if (_ansiTrace) {
      traceLog.debug?.("=== ALT SCREEN + CLEAR ===")
    }
    if (alternateScreen) {
      // Route through modes so the owner tracks state for race-free dispose.
      // Clear + home still go through stdout — they're transient cursor moves,
      // not mode toggles. Use the owned writer so the (now-active) Output
      // sink doesn't suppress them.
      legacyAltScreenEnabled = true
      setAltScreenMode(true, "setup")
      writeOwned("\x1b[2J\x1b[H", terminalProtocolDiagnostics("startup:clear-screen", "setup"))
    }
    writeOwned("\x1b[?25l", terminalProtocolDiagnostics("startup:cursor-hide", "setup"))
  }

  // Initial render — must run AFTER alt-screen entry so reconciler effects
  // (Image, Static, etc.) write to the correct screen surface.
  //
  // Keep `isRendering` true across the full initial settle loop. React commits
  // call `container.onRender()`, which defers a standalone microtask render;
  // startup must absorb that as `pendingRerender` and settle before first
  // paint, otherwise a resumed transcript can publish an intermediate layout
  // before the startup convergence loop reaches the stable bottom pin.
  if (_ansiTrace) {
    traceLog.debug?.("=== INITIAL RENDER ===")
  }
  isRendering = true
  try {
    currentBuffer = doRender()

    if (!headless) {
      // Legacy app-level Kitty keyboard protocol. Focused islands are applied
      // by applyFocusedIslandProtocolModes() on focus / mode-owner changes.
      // With `input: false`, legacy app-level requests are suppressed, but a
      // focused island can still request the host mode structurally.
      if (hostOwnsStdin && kittyOption != null && kittyOption !== false) {
        if (kittyOption === true) {
          // Auto-detect: probe terminal, enable if supported.
          // If caller already detected Kitty support synchronously (via caps from
          // detectTerminalCaps — $TERM-based), skip the 200ms stdio roundtrip and
          // enable directly. The synchronous heuristic is reliable for the four
          // Kitty-protocol terminals (kitty/ghostty/wezterm/foot); the probe only
          // adds value when caps weren't provided.
          if (capsOption?.kittyKeyboard) {
            legacyKittyFlags = defaultKittyFlags
            setKittyKeyboardMode(defaultKittyFlags, "setup")
          } else {
            const result = sessionInput
              ? await detectKittyWithProbe(sessionInput)
              : { supported: false }
            if (result.supported) {
              legacyKittyFlags = defaultKittyFlags
              setKittyKeyboardMode(defaultKittyFlags, "setup")
            }
          }
        } else {
          // Explicit flags — enable directly without detection
          legacyKittyFlags = kittyOption as number
          setKittyKeyboardMode(kittyOption as number, "setup")
        }
      } else if (hostOwnsStdin && kittyOption == null) {
        // No option specified: legacy behavior — always enable Kitty with full fidelity
        legacyKittyFlags = defaultKittyFlags
        setKittyKeyboardMode(defaultKittyFlags, "setup")
      }

      // Legacy app-level mouse tracking. Focused islands are OR'd in by the
      // aggregator path below; `input: false` suppresses only the legacy app
      // request, not focused-island requests.
      if (legacyMouseMode !== false) {
        setMouseMode(legacyMouseMode, "setup")
      }

      // Alt-screen + mouse-off defense (DEC private mode 1007, alternate-scroll).
      // On the alternate screen with mouse tracking OFF, terminals that have
      // alternate-scroll enabled translate wheel events into cursor (arrow)
      // keys — the recurring "wheel moves the cursor/selection" bug. Disable
      // 1007 so the wheel is a benign no-op instead. One-way (disable-and-leave):
      // `modes.disableAlternateScroll()` never re-enables on teardown because
      // 1007's prior state is unknowable and it is moot once we leave the alt
      // screen. When mouse tracking IS on, 1003/1006 already capture the wheel
      // as SGR events regardless of 1007, so this only fires for mouse-off apps.
      if (alternateScreen && !mouseEnabled) {
        modes.disableAlternateScroll()
        recordTerminalProtocolWrite("\x1b[?1007l", "mode:alternate-scroll", "setup")
      }

      // Focus reporting is deferred to after the event loop starts (see below).
      // The InputOwner is already attached, but typed subscribers are not; an
      // immediate CSI I/O response enabled here could otherwise be parsed and
      // dropped before the event loop subscribes.
    }
    if (_ansiTrace) {
      process
        .getBuiltinModule("node:fs")
        .appendFileSync("/tmp/silvery-trace.log", "=== RUNTIME.RENDER (initial) ===\n")
    }
    // Settle the deferred-rect convergence BEFORE the first user-visible
    // paintFrame. Each iteration:
    //   1. commitLayoutSnapshot promotes in-flight rects to committed.
    //   2. Reactive useBoxRect/useScrollRect/useScreenRect subscribers may
    //      forceUpdate.
    //   3. await drains microtasks so React processes those forceUpdates.
    //   4. If pendingRerender, doRender, then loop.
    //
    // Bounded by MAX_CONVERGENCE_PASSES — multi-layer-measurement trees
    // (e.g. MeasuredBox inside a flex container that also reads useBoxRect)
    // need one iteration per layer to settle. Steady state converges in 1.
    //
    // Per-event renders use a single settle (see processEventBatch / press)
    // because in-batch idempotence already guarantees single-layer
    // convergence; the initial render is the one place where multi-layer
    // chains genuinely need a few iterations.
    //
    // **Why settle BEFORE the first paintFrame** (Phase 1b of the
    // layout-feedback-regression-epic): the deferred-only useBoxRect
    // contract returns 0 on first render and the measured rect on the next
    // commit boundary. If paintFrame fires BEFORE the commit loop runs, the
    // first user-visible frame paints with zero rects, then a second frame
    // snaps to the settled layout — that's the visible "first-frame zero,
    // second-frame snap" flicker (scrollbar-invisible-on-first-paint,
    // codeblock-not-centered-then-reflow). The
    // test renderer settles before publishing its frame; production must do
    // the same so live behavior matches what unit tests assert.
    //
    // See bead `@km/silvery/runtime-settle-before-first-paint` and
    // `@km/silvery/use-deferred-box-rect-and-post-commit-observers`.
    let initCommitLoops = 0
    while (initCommitLoops < MAX_CONVERGENCE_PASSES) {
      renderer.commitLayout()
      await Promise.resolve()
      if (!pendingRerender) break
      pendingRerender = false
      currentBuffer = doRender()
      pendingRerender = false
      initCommitLoops++
    }
  } finally {
    isRendering = false
  }
  paintFrame()
  if (_perfLog) {
    process
      .getBuiltinModule("node:fs")
      .appendFileSync(
        "/tmp/silvery-perf.log",
        `STARTUP: initial render done (render #${renderer.renderCount()}, incremental=${!renderer.isIncrementalOff()})\n`,
      )
  }

  // (Output owner is now activated earlier — before alt-screen entry — so
  // pre-render stderr writes are buffered. See the activate block above.)

  // Assign pause/resume now that doRender and runtime are available.
  // Update runtimeContextValue in-place so useApp()/useRuntime() sees the latest values.
  if (!headless) {
    runtimeContextValue.pause = () => {
      renderPaused = true
      // Deactivate the output owner so console-mode writes (e.g., log dump)
      // reach the terminal directly. Owner is retained — resume() re-activates.
      if (output) output.deactivate()
      if (alternateScreen) stdout.write(leaveAlternateScreen())
    }
    runtimeContextValue.resume = () => {
      if (alternateScreen) stdout.write(enterAlternateScreen())
      renderPaused = false
      // Re-activate the output owner (deactivated during pause)
      if (shouldGuardOutput && output) output.activate({ bufferStderr: !process.env.DEBUG_LOG })
      // Reset diff state so next render outputs a full frame.
      // The screen was cleared when entering console mode, so
      // incremental diffing would produce an incomplete frame.
      runtime.invalidate()
      renderer.resetAg()
      // Force full re-render to restore display, but only if we're not
      // already inside a doRender() call (e.g. when resume() is called
      // from a React effect cleanup during reconciliation).
      if (!isRendering) {
        currentBuffer = doRender()
        paintFrame()
      }
      // If isRendering is true, the outer doRender()/paintFrame() will
      // handle the re-render after effects complete, with renderPaused=false.
    }
  }

  // Frame listeners for async iteration
  let frameResolve: ((buffer: Buffer) => void) | null = null
  let framesDone = false

  // Notify frame listeners
  function emitFrame(buf: Buffer) {
    if (frameResolve) {
      const resolve = frameResolve
      frameResolve = null
      resolve(buf)
    }
  }

  // Schedule EXACTLY ONE follow-up standalone frame after the current frame
  // unwinds. Used when the convergence loop hits its cap with work still
  // pending — instead of dropping that work, we converge it on a fresh frame
  // next tick. Deduped via `followupFrameScheduled`; `setImmediate` runs after
  // the current `renderStandaloneFrame`'s `finally` clears `isRendering`, so
  // the follow-up takes the normal (non-reentrant) render path.
  function scheduleFollowupStandaloneFrame(): void {
    if (followupFrameScheduled || shouldExit) return
    followupFrameScheduled = true
    setImmediate(() => {
      followupFrameScheduled = false
      if (shouldExit) return
      startStandaloneFrame()
    })
  }

  async function drainStandaloneCommitRerenders(): Promise<number> {
    let commitRerenders = 0
    for (;;) {
      // Standalone async store updates (timers, session hydration, resource
      // probes) need the same "settle before paint" contract as startup.
      // One post-commit rerender is not enough for nested layout feedback:
      // pass N can discover a measurement that only becomes readable after
      // the next commit boundary. Painting between those passes is the
      // visible no-input bounce seen during resumed transcript startup.
      const committedAdvanced = renderer.commitLayout()
      // Layout-signal subscribers (useScrollState/useBoxRect/etc.) schedule
      // React work synchronously during commitLayout(), but the container
      // onRender flag is raised only when that React work is flushed. Flush
      // before deciding stability so we do not paint the pre-subscriber frame.
      // Some signal subscribers are installed from layout effects and enqueue
      // their React update one microtask later, so yield once after advancing
      // the layout snapshot before checking the pending-rerender flag.
      // eslint-disable-next-line no-await-in-loop -- each iteration is one layout-commit boundary
      await Promise.resolve()
      if (shouldExit) return commitRerenders
      reconciler.flushSyncWork()
      // `committedAdvanced` covers deferred-lane subscriber forceUpdates that
      // commitLayout fired but neither set `pendingRerender` nor surfaced via
      // flushSyncWork — draining on it too keeps the standalone path from
      // painting a stale pre-subscriber frame (the @si/render/19436 signature)
      // when a board action / store update resizes a measured node.
      if (!pendingRerender && !committedAdvanced) return commitRerenders
      if (commitRerenders >= MAX_CONVERGENCE_PASSES) {
        // Cap hit with a React-requested rerender STILL pending. The committed
        // React tree is ahead of `currentBuffer` by one pass. Historically we
        // cleared `pendingRerender` and returned here — silently discarding the
        // rerender. Under a steadily-growing stream (ListView re-measuring a
        // growing assistant block — the boxSize feedback edge in
        // @km/silvercode/19383) that drop strands the buffer behind committed
        // state: a blank hole where layout allocated rows whose paint was
        // dropped. NO SILENT ERRORS — converge instead of dropping.
        //
        // Render ONE final pass so this frame paints the latest committed
        // state, then schedule a follow-up frame (fresh budget) to absorb any
        // residual feedback. We do NOT loop again here (that would be the
        // unbounded loop the cap exists to prevent) — the follow-up frame is
        // the bounded, self-limiting continuation.
        pendingRerender = false
        // Mark the standalone-drain exhaustion in the always-on ring so the
        // breakdown below names a cause even with SILVERY_INSTRUMENT off.
        recordPassRing("unknown", "standalone-flush-exhaustion")
        currentBuffer = doRender()
        commitRerenders++
        standaloneCapExceedCount++
        standaloneCapExceededThisFrame = true
        standaloneCapExceedStreak++
        standaloneCapExceedMaxStreak = Math.max(
          standaloneCapExceedMaxStreak,
          standaloneCapExceedStreak,
        )
        // Per-occurrence breadcrumb, routed through loggily at DEBUG level so it
        // lands in DEBUG_LOG (never raw stdout in fullscreen) and is visible via
        // `DEBUG=silvery:app`. This is a HANDLED, RECOVERED condition (the
        // follow-up frame below converges the committed state), so it must not
        // cry wolf on every large stream — hence debug, not warn. The loud
        // signal is the teardown summary when the count is PERSISTENT (a real
        // edge that the non-lossy recovery is papering over). NO SILENT ERRORS:
        // the condition is observable without using the generic strict warning
        // path reserved for unhandled bounded-convergence failures.
        log.debug?.(
          `standalone convergence cap (${MAX_CONVERGENCE_PASSES}) hit with rerender still ` +
            `pending (occurrence ${standaloneCapExceedCount}); painting latest committed ` +
            `frame + scheduling one follow-up frame (non-lossy — no dropped paint). ` +
            `Per-cause breakdown: ${formatPassRingBreakdown() || "(ring empty)"}. ` +
            `(SILVERY_INSTRUMENT=1 adds the full per-node histogram.) ` +
            `Bead: @km/silvercode/19383.`,
        )
        // A handful of consecutive cap-exceeds is a legit growing-stream
        // transient; an UNBOUNDED streak is a perpetual feedback edge the
        // non-lossy recovery above would otherwise paper over frame after frame.
        // Under SILVERY_STRICT (incremental tier >=2) escalate past a small
        // bound to the same hard `assertBoundedConvergence` fail-loud used by
        // the press/event-batch production-flush loop. STRICT must gate this
        // edge, not silently soft-recover it forever. `assertBoundedConvergence`
        // is a no-op outside STRICT, so production keeps the follow-up-frame
        // recovery below unchanged. The standalone drain has its own loop name
        // so diagnostics identify the exact loop that exhausted its streak.
        if (
          isStrictEnabled("incremental", 2) &&
          standaloneCapExceedStreak > STANDALONE_CAP_STREAK_LIMIT
        ) {
          assertBoundedConvergence(
            standaloneCapExceedStreak,
            "standalone-flush",
            STANDALONE_CAP_STREAK_LIMIT,
          )
        }
        scheduleFollowupStandaloneFrame()
        return commitRerenders
      }
      pendingRerender = false
      currentBuffer = doRender()
      commitRerenders++
    }
  }

  async function renderStandaloneFrame(): Promise<void> {
    if (shouldExit) return
    if (isRendering) {
      pendingRerender = true
      return
    }

    isRendering = true
    standaloneCapExceededThisFrame = false
    try {
      let rerenderedBeforePaint = false
      currentBuffer = doRender()
      reconciler.flushSyncWork()
      // React layout effects may schedule sync work after doRender() returns
      // (for example ListView measuring a row and setting measurement state).
      // Give those microtasks a chance to raise pendingRerender before the
      // commit drain decides the frame is stable.
      await Promise.resolve()
      if (shouldExit) return
      const commitRerenders = await drainStandaloneCommitRerenders()
      if (shouldExit) return
      rerenderedBeforePaint ||= commitRerenders > 0
      // One additional macrotask catches layout-feedback updates that React
      // schedules after layout effects have installed signal subscriptions.
      // This path is outside direct input handling; user input uses
      // processEventBatch and never pays this pre-paint coalescing delay.
      await new Promise<void>((resolve) => setImmediate(resolve))
      if (shouldExit) return
      if (pendingRerender) {
        pendingRerender = false
        currentBuffer = doRender()
        reconciler.flushSyncWork()
        rerenderedBeforePaint = true
        const lateCommitRerenders = await drainStandaloneCommitRerenders()
        rerenderedBeforePaint ||= lateCommitRerenders > 0
      }
      if (rerenderedBeforePaint) currentBuffer._buffer.markAllRowsDirty()
      paintFrame()
      // Re-resolve hover at the last known pointer coordinates so content
      // that scrolled / shifted under a stationary cursor gets proper
      // mouseenter/mouseleave dispatch.
      refreshHoverPath(mouseEventState, container.root)
      // CLS instrumentation — post-commit layout-shift detection. The
      // microtask path is post-paint commits driven by setState / async
      // settlement, not direct scroll/resize input.
      const clsDims = target.getDims()
      clsMonitor.onCommit(container.root, clsDims.cols, clsDims.rows, false)
    } finally {
      if (!standaloneCapExceededThisFrame) standaloneCapExceedStreak = 0
      isRendering = false
    }
  }

  // Subscribe to store for re-renders.
  //
  // Three cases:
  // 1. inEventHandler=true (during processEvent/press): ONLY flag pendingRerender.
  //    The caller's flush loop will handle all deferred renders. No microtask.
  // 2. isRendering=true (during doRender effects): defer via pendingRerender flag.
  //    Queue a microtask to render after the current render completes — but only
  //    if NOT in an event handler (the flush loop handles it).
  // 3. Neither: render immediately (standalone setState from timeout/interval).
  storeUnsubscribeFn = store.subscribe(() => {
    if (shouldExit) return
    if (_ansiTrace) {
      const _case = inEventHandler ? "1:event" : isRendering ? "2:rendering" : "3:standalone"
      const stack = new Error().stack?.split("\n").slice(1, 5).join("\n") ?? ""
      process
        .getBuiltinModule("node:fs")
        .appendFileSync(
          "/tmp/silvery-trace.log",
          `=== SUBSCRIPTION (case ${_case}, render #${renderer.renderCount() + 1}) ===\n${stack}\n`,
        )
    }
    if (inEventHandler) {
      // During processEvent/press: just flag, caller's flush loop handles it.
      pendingRerender = true
      return
    }
    if (isRendering) {
      // During doRender (outside event handler): defer to microtask.
      if (!pendingRerender) {
        pendingRerender = true
        queueMicrotask(() => {
          if (!pendingRerender) return
          if (isRendering) return
          pendingRerender = false
          if (!shouldExit && !isRendering) {
            if (_perfLog) {
              process
                .getBuiltinModule("node:fs")
                .appendFileSync(
                  "/tmp/silvery-perf.log",
                  `SUBSCRIPTION: deferred microtask render (case 2, render #${renderer.renderCount() + 1})\n`,
                )
            }
            startStandaloneFrame()
          }
        })
      }
      return
    }
    if (_perfLog) {
      process
        .getBuiltinModule("node:fs")
        .appendFileSync(
          "/tmp/silvery-perf.log",
          `SUBSCRIPTION: immediate render (case 3, render #${renderer.renderCount() + 1})\n`,
        )
    }
    startStandaloneFrame()
  })

  // Create namespaced event streams from all providers
  function createProviderEventStream(
    name: string,
    provider: Provider<unknown, Record<string, unknown>>,
  ): AsyncIterable<NamespacedEvent> {
    return map(provider.events(), (event) => ({
      type: `${name}:${String(event.type)}`,
      provider: name,
      event: String(event.type),
      data: event.data,
    }))
  }

  // Overlay helpers — thin wrappers over the pure functions in ./renderer.ts.
  // These bridge the closure state (currentBuffer, selectionState, scrollback,
  // virtualScrollOffset, searchState) into the pure functional API.

  /**
   * Paint the current frame, baking selection-highlight styling into the
   * buffer cells (when a selection is active) before handing off to runtime.
   *
   * Selection styling is applied to a CLONE of `currentBuffer`, never the
   * canonical buffer itself. Mutating `currentBuffer` would pollute Ag's
   * internal `_prevBuffer` reference (Ag uses the same buffer object for
   * incremental render's clone-and-skip fast path — see pipeline/CLAUDE.md).
   * Keeping the canonical buffer clean preserves the incremental invariant
   * that fast-path-skipped subtrees carry forward CONTENT pixels, not
   * accidental selection-colored ones.
   *
   * Replaces the legacy `runtime.render(currentBuffer) + writeSelectionOverlay()`
   * sequence which wrote inverse ANSI past the buffer. That approach kept
   * the buffer clean (good for Ag) but the diff engine couldn't track
   * overlay-painted cells, so on shrink the stale inverse pixels would
   * persist on screen.
   *
   * Tracking: km-silvery.delete-render-selection-overlay
   */
  // Function declaration (not arrow const) so it hoists to top-of-scope —
  // the initial render at startup calls paintFrame BEFORE this point in
  // source order. Closures over `currentBuffer` / `selectionState` /
  // `selectionEnabled` / `runtime` are by-reference, evaluated at call time.
  function refreshContentSelectionProjection(): void {
    if (!activeContentSelection || !currentBuffer) return

    if (selectionState.selecting && activeSelectionPointer) {
      const { x, y } = activeSelectionPointer
      const focus = selectionFocusAt(x, y)
      const nextRange = resolveContentRangeAtPointer(
        activeContentSelection.root,
        activeContentSelection.origin,
        focus,
        x,
        y,
      )
      if (nextRange) {
        activeContentSelection.anchor = nextRange.anchor
        activeContentSelection.head = nextRange.head
        // Autoscroll moves content under a still pointer: the scope follows the head.
        const scope = selectionScopeForFocus(
          activeSelectionBoundaries,
          focus,
          activeForceBufferSelection,
          selectionState.scope,
        )
        selectionState = { ...selectionState, scope }
      }
    }

    const projected = projectContentSelectionRange(
      activeContentSelection.root,
      activeContentSelection.anchor,
      activeContentSelection.head,
      currentBuffer._buffer.width,
      currentBuffer._buffer.height,
    )
    if (!projected) {
      const [cleared] = terminalSelectionUpdate({ type: "clear" }, selectionState)
      selectionState = cleared
      activeContentSelection = null
      stopSelectionAutoScroll()
      notifySelectionListeners()
      return
    }
    selectionState = { ...selectionState, range: projected }
  }

  function paintFrame(): void {
    if (!currentBuffer) return
    refreshContentSelectionProjection()
    let fullscreenDamageRepairThisFrame = false
    if (fullscreenDamageRiskFromBlur && alternateScreen) {
      const now = performance.now()
      if (
        !fullscreenDamageRepairRequested &&
        now - fullscreenDamageLastRepaintMs >= FOCUS_DAMAGE_REPAINT_INTERVAL_MS
      ) {
        fullscreenDamageLastRepaintMs = now
        fullscreenDamageRepairRequested = true
        fullscreenDamageRepairThisFrame = true
        runtime.invalidate({ clearScreen: true })
      }
    }
    const hasSelection = selectionEnabled && !!selectionState.range
    const hasSearchHighlight = searchState.active && searchState.currentMatch >= 0
    const hasSearchBar = searchState.active
    flushFrameArtifacts("pre-paint")
    if (hasSelection || hasSearchHighlight || hasSearchBar) {
      const cloned = currentBuffer._buffer.clone()
      const paintBuf = wrapBuffer(cloned, currentBuffer.nodes, currentBuffer.overlay)
      // Force diff coverage — the clone starts with all rows clean, but
      // selection / search-highlight / search-bar styling will mutate cells.
      // Mark all rows so diffBuffers does the per-cell pre-check
      // (rowMetadataEquals/rowCharsEquals/rowExtrasEquals) and emits ANSI
      // for any row that actually changed relative to runtime.prevBuffer.
      cloned.markAllRowsDirty()
      // Apply search highlights FIRST so selection wins on overlap (drag
      // over a search match should look "selected", not "found").
      if (hasSearchHighlight) {
        applySearchHighlightsToPaintBufferFn({
          searchState,
          scrollback,
          virtualScrollOffset,
          paintBuffer: paintBuf,
          theme: profileOption?.theme,
        })
      }
      if (hasSelection) {
        applySelectionToPaintBufferFn({
          selectionEnabled,
          selectionState,
          paintBuffer: paintBuf,
          theme: profileOption?.theme,
        })
      }
      // Search bar wins LAST — it's the modal UI element. When the bar
      // closes (`hasSearchBar` false) the clone's last row carries the React
      // tree's content for that row and the diff engine repaints it cleanly.
      if (hasSearchBar) {
        applySearchBarToPaintBufferFn({ searchState, paintBuffer: paintBuf })
      }
      clearLastOutputPhaseDiagnostics()
      runtime.render(paintBuf)
    } else {
      clearLastOutputPhaseDiagnostics()
      runtime.render(currentBuffer)
    }
    flushPostPaintWrites()
    if (fullscreenDamageRepairThisFrame) {
      fullscreenDamageRiskFromBlur = false
      fullscreenDamageRepairRequested = false
    }
  }
  const pushToScrollback = (): void =>
    pushToScrollbackFn({ scrollback, currentBuffer: currentBuffer ?? null })
  const renderVirtualScrollbackView = (): void =>
    renderVirtualScrollbackViewFn({ scrollback, virtualScrollOffset, target })
  // Search highlights AND the search bar are folded into paintFrame() —
  // they live on the paint clone's cells, not as ANSI past the buffer.
  // See applySearchHighlightsToPaintBufferFn / applySearchBarToPaintBufferFn.
  const searchScrollback = createSearchScrollback(scrollback)

  /**
   * Run a single event's handler (state mutation only, no render).
   * Returns true if processing should continue, false if app should exit.
   *
   * Intercepts mouse events for selection and virtual inline mode.
   */
  function runEventHandler(
    event: NamespacedEvent,
    { skipSelection = false }: { skipSelection?: boolean } = {},
  ): boolean | "flush" {
    const mouseDataForTerminalLink =
      terminalLinksOption && event.type === "term:mouse" && event.data
        ? (event.data as { action: string; button: number; x: number; y: number })
        : null
    const terminalLinkReleaseArmed =
      mouseDataForTerminalLink?.action === "up" &&
      mouseDataForTerminalLink.button === 0 &&
      mouseEventState.mouseDownTarget !== null &&
      mouseEventState.keyboardModifiers.super
    // Virtual inline: intercept search key events
    if (scrollback && searchState.active && event.type === "term:key") {
      const data = event.data as { input: string; key: Key }
      if (data.key.escape) {
        const [next] = searchUpdate({ type: "close" }, searchState)
        searchState = next
        virtualScrollOffset = 0 // Return to live view
        return true // Consume
      }
      if (data.key.return && !data.key.shift) {
        const [next, effects] = searchUpdate({ type: "nextMatch" }, searchState, searchScrollback)
        searchState = next
        for (const eff of effects) {
          if (eff.type === "scrollTo") {
            virtualScrollOffset = Math.max(
              0,
              scrollback.totalLines - eff.row - target.getDims().rows,
            )
          }
        }
        return true
      }
      if (data.key.return && data.key.shift) {
        const [next, effects] = searchUpdate({ type: "prevMatch" }, searchState, searchScrollback)
        searchState = next
        for (const eff of effects) {
          if (eff.type === "scrollTo") {
            virtualScrollOffset = Math.max(
              0,
              scrollback.totalLines - eff.row - target.getDims().rows,
            )
          }
        }
        return true
      }
      if (data.key.backspace) {
        const [next, effects] = searchUpdate({ type: "backspace" }, searchState, searchScrollback)
        searchState = next
        for (const eff of effects) {
          if (eff.type === "scrollTo") {
            virtualScrollOffset = Math.max(
              0,
              scrollback.totalLines - eff.row - target.getDims().rows,
            )
          }
        }
        return true
      }
      if (data.key.leftArrow) {
        const [next] = searchUpdate({ type: "cursorLeft" }, searchState)
        searchState = next
        return true
      }
      if (data.key.rightArrow) {
        const [next] = searchUpdate({ type: "cursorRight" }, searchState)
        searchState = next
        return true
      }
      if (data.input && !data.key.ctrl && !data.key.meta) {
        const [next, effects] = searchUpdate(
          { type: "input", char: data.input },
          searchState,
          searchScrollback,
        )
        searchState = next
        for (const eff of effects) {
          if (eff.type === "scrollTo") {
            virtualScrollOffset = Math.max(
              0,
              scrollback.totalLines - eff.row - target.getDims().rows,
            )
          }
        }
        return true
      }
    }

    // Virtual inline: Ctrl+F opens search
    if (scrollback && event.type === "term:key") {
      const data = event.data as { input: string; key: Key }
      if (data.input === "f" && data.key.ctrl) {
        const [next] = searchUpdate({ type: "open" }, searchState)
        searchState = next
        return true
      }
    }

    // Virtual inline: intercept wheel events for scrolling
    if (scrollback && event.event === "mouse" && event.data) {
      const mouseData = event.data as {
        button: number
        x: number
        y: number
        action: string
        delta?: number
        deltaX?: number
      }
      if (mouseData.action === "wheel") {
        // A pure-horizontal wheel (deltaX only, delta === 0) carries no vertical
        // intent — there is no horizontal history to scroll, so consume it
        // without moving the vertical scrollback. Without this guard a
        // horizontal tick (delta 0) falls through to the "scroll down" branch.
        if (mouseData.delta === 0) return true
        const scrollLines = 3 * Math.max(1, Math.abs(mouseData.delta ?? 1))
        if (mouseData.delta && mouseData.delta < 0) {
          // Scroll up (into history)
          virtualScrollOffset = Math.min(
            virtualScrollOffset + scrollLines,
            Math.max(0, scrollback.totalLines - target.getDims().rows),
          )
        } else {
          // Scroll down (toward live)
          virtualScrollOffset = Math.max(0, virtualScrollOffset - scrollLines)
        }
        return true // Consume wheel events
      }
    }

    // Selection: intercept mouse events (drag-vs-click state machine)
    //
    // See the state-machine comment at the top of this function (near
    // `pendingSelectionDown`). Summary:
    //   down              → armed      (store anchor, no selection yet)
    //   move past anchor  → dragging   (start + extend — first extend draws)
    //   move              → dragging'  (extend — shrinks or grows)
    //   up from dragging  → idle       (finish, OSC 52 copy, CONSUME event
    //                                   so onClick/onSelect does NOT fire)
    //   up from armed     → idle       (plain click — event propagates,
    //                                   no selection created, no clipboard)
    if (!skipSelection && selectionEnabled && event.event === "mouse" && event.data) {
      const mouseData = event.data as {
        button: number
        x: number
        y: number
        action: string
        shift?: boolean
      }

      // Left button (button 0) drag for selection
      if (mouseData.button === 0) {
        if (mouseData.action === "down") {
          // idle/dragging → armed. Clear any existing selection (visual
          // feedback: old overlay disappears), then arm with the anchor.
          // DO NOT call `start` — that would set `selecting: true` and a
          // same-cell mouseUp would leave a 1-char range (Bug 3).
          if (selectionState.range || selectionState.selecting) {
            const [cleared] = terminalSelectionUpdate({ type: "clear" }, selectionState)
            selectionState = cleared
            activeSelectionBoundaries = []
            activeForceBufferSelection = false
            activeContentSelection = null
            stopSelectionAutoScroll()
            notifySelectionListeners()
            // Force full re-render so the freshly cleared selection's
            // styling is removed from screen. Without runtime.invalidate(),
            // the diff might skip selection-styled cells if buffer content
            // hasn't changed (selection was applied to a clone — runtime's
            // prevBuffer holds the styled clone, currentBuffer is clean,
            // diff would emit unstyled cells correctly — but invalidating
            // is the safer/explicit path here matching the previous
            // semantics).
            if (currentBuffer) {
              runtime.invalidate()
              currentBuffer = doRender()
              paintFrame()
            }
          }
          const agRoot = getContainerRoot(container)
          const resolvedAnchor = resolveSelectionAnchorFromPoint({
            root: agRoot,
            buffer: currentBuffer?._buffer ?? null,
            x: mouseData.x,
            y: mouseData.y,
            forceBufferSelection: mouseData.shift === true,
          })
          // No selectable hit target — the click landed in a `userSelect="none"`
          // subtree (scrollbar, toolbar buttons, etc.) or text-free layout space.
          // Don't arm a selection drag: a subsequent mousemove would otherwise
          // steal the gesture from the component's own handlers.
          if (resolvedAnchor === null) {
            pendingSelectionDown = null
          } else {
            // Resolve click-count for THIS mousedown (1=fresh, 2=double-
            // click, 3=triple-click). Used by the up branch to decide
            // whether to dispatch startWord / startLine, and by the
            // move branch to pick the drag granularity.
            const clickCount = checkClickCount(
              selectionClickCount,
              resolvedAnchor.cell.col,
              resolvedAnchor.cell.row,
              mouseData.button,
            )
            pendingSelectionDown = {
              col: resolvedAnchor.cell.col,
              row: resolvedAnchor.cell.row,
              downCol: resolvedAnchor.downCell.col,
              downRow: resolvedAnchor.downCell.row,
              boundaries: resolvedAnchor.boundaries,
              forceBufferSelection: resolvedAnchor.forceBufferSelection,
              contentOrigin:
                resolvedAnchor.node && !resolvedAnchor.forceBufferSelection
                  ? contentSelectionPointFromPoint(resolvedAnchor.node, mouseData.x, mouseData.y)
                  : null,
              clickCount,
            }
          }
          // Don't consume — let the component tree handle mousedown
          // (click-to-focus, onMouseDown handlers, etc.)
        } else if (mouseData.action === "move") {
          if (pendingSelectionDown) {
            const pointerCell = selectionCellFromPointer(mouseData.x, mouseData.y)
            // armed → dragging (first move past threshold starts the drag).
            // Threshold: different cell than the original pointer-down
            // location. The anchor can be a snapped text cell, so using it
            // for thresholding would turn same-cell padding jitter into a
            // bogus drag.
            const dx = pointerCell.col - pendingSelectionDown.downCol
            const dy = pointerCell.row - pendingSelectionDown.downRow
            if (dx !== 0 || dy !== 0) {
              const anchor = pendingSelectionDown
              pendingSelectionDown = null
              activeSelectionBoundaries = anchor.boundaries
              activeForceBufferSelection = anchor.forceBufferSelection
              const focus = selectionFocusAt(mouseData.x, mouseData.y, anchor.forceBufferSelection)
              const scope = selectionScopeForFocus(
                anchor.boundaries,
                focus,
                anchor.forceBufferSelection,
              )
              // Pick the start action based on the click chain that armed
              // this drag:
              //   1 → start  (character-granular drag)
              //   2 → startWord (word-granular drag — snaps to word edges)
              //   3 → startLine (line-granular drag — snaps to line edges)
              // The headless machine sets `granularity` accordingly, and
              // `terminalSelectionUpdate({ type: "extend", buffer })` snaps
              // the head on every extend.
              let started: typeof selectionState
              if (anchor.clickCount === 2 && currentBuffer) {
                ;[started] = terminalSelectionUpdate(
                  {
                    type: "startWord",
                    col: anchor.col,
                    row: anchor.row,
                    scope,
                    buffer: currentBuffer._buffer,
                  },
                  selectionState,
                )
              } else if (anchor.clickCount === 3 && currentBuffer) {
                ;[started] = terminalSelectionUpdate(
                  {
                    type: "startLine",
                    col: anchor.col,
                    row: anchor.row,
                    scope,
                    buffer: currentBuffer._buffer,
                  },
                  selectionState,
                )
              } else {
                ;[started] = terminalSelectionUpdate(
                  { type: "start", col: anchor.col, row: anchor.row, scope },
                  selectionState,
                )
              }
              const [extended] = terminalSelectionUpdate(
                {
                  type: "extend",
                  col: pointerCell.col,
                  row: pointerCell.row,
                  buffer: currentBuffer?._buffer,
                  scope,
                },
                started,
              )
              selectionState = extended
              if (anchor.clickCount === 1 && anchor.contentOrigin) {
                const root = getContainerRoot(container)
                const contentRoot =
                  anchor.boundaries.find((boundary) => boundary.hardContain)?.node ?? root
                const contentRange = resolveContentRangeAtPointer(
                  contentRoot,
                  anchor.contentOrigin,
                  focus,
                  mouseData.x,
                  mouseData.y,
                )
                if (contentRange) {
                  activeContentSelection = {
                    root: contentRoot,
                    origin: anchor.contentOrigin,
                    anchor: contentRange.anchor,
                    head: contentRange.head,
                    scrolled: false,
                  }
                  updateSelectionAutoScroll(mouseData.x, mouseData.y)
                } else {
                  activeContentSelection = null
                }
              }
              notifySelectionListeners()
              if (currentBuffer) {
                paintFrame()
              }
              // Consume move events during selection — don't dispatch to the
              // component tree (prevents onMouseEnter from firing on every
              // row under the drag, which would move ListView's cursor).
              return true
            }
            // Same-cell move — stay armed, don't consume (safe no-op).
          } else if (selectionState.selecting) {
            // dragging → dragging (extend with current pos; head follows
            // the cursor regardless of direction, so selection shrinks on
            // reverse drag — Bug 1 protection).
            // Buffer is forwarded so word / line granularity drags snap
            // the head to the right boundary on every move.
            const pointerCell = selectionCellFromPointer(mouseData.x, mouseData.y)
            const focus = selectionFocusAt(mouseData.x, mouseData.y, activeForceBufferSelection)
            const scope = selectionScopeForFocus(
              activeSelectionBoundaries,
              focus,
              activeForceBufferSelection,
              selectionState.scope,
            )
            const [next] = terminalSelectionUpdate(
              {
                type: "extend",
                col: pointerCell.col,
                row: pointerCell.row,
                buffer: currentBuffer?._buffer,
                scope,
              },
              selectionState,
            )
            selectionState = next
            if (activeContentSelection) {
              const contentRange = resolveContentRangeAtPointer(
                activeContentSelection.root,
                activeContentSelection.origin,
                focus,
                mouseData.x,
                mouseData.y,
              )
              if (contentRange) {
                activeContentSelection.anchor = contentRange.anchor
                activeContentSelection.head = contentRange.head
              }
              updateSelectionAutoScroll(mouseData.x, mouseData.y)
            }
            notifySelectionListeners()
            if (currentBuffer) {
              paintFrame()
            }
            return true
          }
        } else if (mouseData.action === "up") {
          if (selectionState.selecting) {
            // dragging → idle. Finish selection, copy via OSC 52, and
            // CONSUME the event so onClick/onSelect does NOT fire (Bug 2).
            // Capture the raw-buffer (Shift+drag) flag BEFORE it is reset
            // below — the copy extraction uses it to choose semantic vs raw.
            const forceBufferSelection = activeForceBufferSelection
            const [next] = terminalSelectionUpdate({ type: "finish" }, selectionState)
            selectionState = next
            pendingSelectionDown = null
            activeSelectionBoundaries = []
            activeForceBufferSelection = false
            stopSelectionAutoScroll()
            notifySelectionListeners()

            // Copy selected text via OSC 52 — gated on copyOnSelect.
            if (copyOnSelectEnabled && next.range && currentBuffer) {
              const retainedText = activeContentSelection?.scrolled
                ? extractContentSelectionText(
                    activeContentSelection.root,
                    activeContentSelection.anchor,
                    activeContentSelection.head,
                  )
                : null
              const text =
                retainedText ??
                extractText(currentBuffer._buffer, next.range, {
                  scope: next.scope,
                  // Semantic copy: skip non-selectable margins/gutters/padding so
                  // the clipboard matches the highlight, which already filters by
                  // SELECTABLE_FLAG (renderer.ts). Shift+drag raw-buffer selection
                  // opts out and copies the screen rectangle verbatim.
                  respectSelectableFlag: !forceBufferSelection,
                  // Join soft-wrapped rows into their logical line + precise
                  // trailing-space trimming via per-row metadata.
                  rowMetadata: currentBuffer._buffer.getRowMetadataArray(),
                })
              if (text.length > 0) {
                const base64 = globalThis.Buffer.from(text).toString("base64")
                target.write(`\x1b]52;c;${base64}\x07`)
              }
            }
            // Re-render with final selection styling baked in
            if (currentBuffer) {
              paintFrame()
            }
            // Clear armed state on the mousedown target so the next
            // interaction starts cleanly. We'd otherwise skip this because
            // we're consuming the event (processMouseEvent won't run).
            if (mouseEventState.mouseDownTarget) {
              setArmed(mouseEventState.mouseDownTarget, false)
              mouseEventState.mouseDownTarget = null
              mouseEventState.mouseCaptureTarget = null
            }
            // Consume the mouseup — suppresses mouseup + click dispatch in
            // processMouseEvent (which would otherwise fire ListView's
            // onClick → onSelect, opening a detail view after a drag).
            return true
          }
          // armed → idle. Distinguish three cases:
          //  - clickCount === 1 → plain click. Let the event flow through
          //    to processMouseEvent normally so onClick / onSelect runs;
          //    no selection is created (Bug 3 protection).
          //  - clickCount === 2 → double-click. Select the word at the
          //    click point (granularity = word) and copy via OSC 52.
          //  - clickCount === 3 → triple-click. Select the line at the
          //    click point (granularity = line) and copy via OSC 52.
          //
          // The component-tree dispatch (onClick / onDoubleClick / onTripleClick)
          // is independent of this selection logic — that runs in
          // processMouseEvent unless we explicitly consume the event by
          // returning true. We keep dispatch flowing on multi-click so
          // app code can listen to onDoubleClick etc.
          //
          // defaultPrevented gating: we DEFER auto-select until AFTER the
          // component-tree dispatch runs (in invokeEventHandler), so that
          // an interactive widget that calls `event.preventDefault()` in
          // its onClick / onDoubleClick / onTripleClick handler can opt out
          // of the runtime's word/line selection. Without this gate, a
          // click-to-toggle button would simultaneously toggle AND grab the
          // word under the cursor — a UX collision. The pending intent is
          // captured here, then resolved at the bottom of runEventHandler
          // after `invokeEventHandler` writes `mouseEventState.lastClickPrevented`.
          if (pendingSelectionDown) {
            const anchor = pendingSelectionDown
            pendingSelectionDown = null
            if ((anchor.clickCount === 2 || anchor.clickCount === 3) && currentBuffer) {
              pendingAutoSelect = {
                col: anchor.col,
                row: anchor.row,
                scope: selectionScopeForFocus(
                  anchor.boundaries,
                  selectionFocusAt(anchor.col, anchor.row, anchor.forceBufferSelection),
                  anchor.forceBufferSelection,
                ),
                clickCount: anchor.clickCount,
                forceBufferSelection: anchor.forceBufferSelection,
              }
            }
            // Don't consume — let the click event reach the component
            // tree so onDoubleClick / onTripleClick handlers fire. The
            // auto-select is applied (or skipped) below based on the
            // dispatch's defaultPrevented signal.
          }
        }
      }
    }

    // Selection: clear on any keypress
    if (selectionEnabled && event.type === "term:key" && selectionState.range) {
      const [next] = terminalSelectionUpdate({ type: "clear" }, selectionState)
      selectionState = next
      activeSelectionBoundaries = []
      activeForceBufferSelection = false
      activeContentSelection = null
      stopSelectionAutoScroll()
      notifySelectionListeners()
      // Force full re-render. Selection just cleared, so paintFrame() goes
      // through the no-selection branch — runtime.render writes unstyled
      // cells, removing any prior selection styling from screen.
      if (currentBuffer) {
        runtime.invalidate()
        currentBuffer = doRender()
        paintFrame()
      }
    }

    // When scrolled up in virtual inline mode, don't dispatch events to component tree
    // (except for search which is handled above)
    if (scrollback && virtualScrollOffset > 0 && event.type === "term:key") {
      // Any non-search keypress returns to live view
      virtualScrollOffset = 0
      return true
    }

    const ctx = createHandlerContext(store, focusManager, container)
    const result = invokeEventHandler(event, handlers, ctx, mouseEventState, container)

    // Apply deferred word/line auto-select gated on the component tree's
    // defaultPrevented. Captured on mouseup-from-armed (clickCount >= 2);
    // resolved here AFTER `invokeEventHandler` ran the click/dblclick/
    // tripleclick dispatch and recorded `lastClickPrevented` on
    // `mouseEventState`. Skipping when prevented avoids the UX collision
    // where a click-to-toggle widget would also grab the word under the
    // cursor.
    if (pendingAutoSelect && currentBuffer) {
      const anchor = pendingAutoSelect
      pendingAutoSelect = null
      if (!mouseEventState.lastClickPrevented) {
        const [next] = terminalSelectionUpdate(
          anchor.clickCount === 2
            ? {
                type: "startWord",
                col: anchor.col,
                row: anchor.row,
                scope: anchor.scope,
                buffer: currentBuffer._buffer,
              }
            : {
                type: "startLine",
                col: anchor.col,
                row: anchor.row,
                scope: anchor.scope,
                buffer: currentBuffer._buffer,
              },
          selectionState,
        )
        const [finished] = terminalSelectionUpdate({ type: "finish" }, next)
        selectionState = finished
        notifySelectionListeners()
        // Copy via OSC 52, mirroring the drag-finish branch above —
        // gated on copyOnSelect.
        if (copyOnSelectEnabled && finished.range) {
          const text = extractText(currentBuffer._buffer, finished.range, {
            scope: finished.scope,
            // Semantic copy (skip non-selectable margins/gutters/padding) unless
            // this is a Shift raw-buffer selection. Mirrors the drag-finish path.
            respectSelectableFlag: !anchor.forceBufferSelection,
            rowMetadata: currentBuffer._buffer.getRowMetadataArray(),
          })
          if (text.length > 0) {
            const base64 = globalThis.Buffer.from(text).toString("base64")
            target.write(`\x1b]52;c;${base64}\x07`)
          }
        }
        paintFrame()
      }
    }

    // Terminal-cell links are a fallback producer on the existing link:open
    // rail. This runs after selection and component dispatch: a drag returned
    // above, while a Link/component that handled the click set
    // lastClickPrevented. Only the pointed visible row is inspected.
    if (
      mouseDataForTerminalLink &&
      currentBuffer &&
      terminalLinksOption &&
      (mouseDataForTerminalLink.action === "move" || terminalLinkReleaseArmed)
    ) {
      const href = resolveTerminalLinkAt(
        currentBuffer._buffer,
        mouseDataForTerminalLink.x,
        mouseDataForTerminalLink.y,
        terminalLinksOption,
      )
      if (
        mouseDataForTerminalLink.action === "move" &&
        mouseEventState.keyboardModifiers.super &&
        href &&
        mouseEventState.lastMouseCursor !== "pointer"
      ) {
        mouseEventState.lastMouseCursor = "pointer"
        mouseEventState.onMouseCursorChange?.("pointer")
      }
      if (terminalLinkReleaseArmed && !mouseEventState.lastClickPrevented && href) {
        chainApp.events.emit("link:open", href)
      }
    }

    return result
  }

  /**
   * Process a batch of events — run all handlers, then render once.
   *
   * This is the key optimization for press-and-hold / auto-repeat keys.
   * When events arrive faster than renders (e.g., 30/sec auto-repeat vs
   * 50ms renders), we batch all pending handlers into a single render pass.
   *
   * For a batch of 3 'j' presses: handler1 → handler2 → handler3 → render.
   * The cursor moves 3 positions, but we only pay one render cost.
   */
  async function processEventBatch(events: NamespacedEvent[]): Promise<Buffer | null> {
    if (shouldExit || events.length === 0) return null
    // A real input/resize event breaks an autonomous standalone-frame chain.
    // Preserve lifetime/max telemetry, but require consecutive autonomous
    // frames before warning or panicking about a perpetual feedback edge.
    // Without this reset, repeated Tab/wheel events each followed by a bounded
    // layout recovery accumulate into one false "perpetual" incident.
    standaloneCapExceedStreak = 0
    renderer.resetCount()
    _eventStart = performance.now()

    // Keypress performance span — wraps the entire batch cycle.
    // perfLog.span?.() short-circuits all argument evaluation when TRACE is off.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    using _perfSpan = perfLog.span?.(
      "keypress",
      (() => {
        startTracking()
        const keyEvents = events.filter((e) => e.type === "term:key")
        return {
          key:
            keyEvents.length > 0
              ? keyEvents.map((e) => (e.data as { input: string }).input).join(",")
              : (events[0]?.type ?? "unknown"),
        }
      })(),
    )

    // Intercept lifecycle keys (Ctrl+Z, Ctrl+C) BEFORE they reach app handlers.
    // These must be handled at the runtime level, not by individual components.
    if (!headless) {
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i]!
        if (event.type !== "term:key") continue
        const data = event.data as { input: string; key: Key }

        // Ctrl+Z: suspend (parseKey returns input="z" with key.ctrl=true)
        if (
          data.input === "z" &&
          data.key.ctrl &&
          suspendOption &&
          !canRouteKeyToFocusedIsland(data.input, data.key, focusManager)
        ) {
          const prevented = onSuspendHook?.() === false
          if (!prevented) {
            // Remove this event from the batch
            events.splice(i, 1)
            const state = captureTerminalState({
              alternateScreen,
              cursorHidden: true,
              mouse: mouseEnabled
                ? mouseParseOptions?.coordinateMode === "pixel"
                  ? "pixel"
                  : true
                : false,
              kitty: kittyEnabled,
              kittyFlags,
              bracketedPaste: true,
              rawMode: true,
              focusReporting: focusReportingEnabled,
            })
            performSuspend(state, stdout, stdin, () => {
              // After resume, trigger a full re-render
              runtime.invalidate()
              onResumeHook?.()
            })
          } else {
            events.splice(i, 1)
          }
        }

        // Ctrl+C: exit (parseKey returns input="c" with key.ctrl=true)
        if (
          data.input === "c" &&
          data.key.ctrl &&
          exitOnCtrlCOption &&
          !canRouteKeyToFocusedIsland(data.input, data.key, focusManager)
        ) {
          const prevented = onInterruptHook?.() === false
          if (!prevented) {
            exit()
            return null
          }
          events.splice(i, 1)
        }
      }
      if (events.length === 0) return null
    }

    // Suppress subscription renders — the flush loop below handles everything.
    inEventHandler = true
    isRendering = true

    // Input pipeline Stage 3: Event Loop — see docs/guide/input-architecture.md
    //
    // All key/paste/focus events flow through the apply chain:
    //
    //   withFocusChain → withInputChain → withPasteChain → withTerminalChain
    //
    // withFocusChain owns the focused-target dispatch (formerly
    // handleFocusNavigation). withInputChain runs useInput fallbacks only
    // when focus didn't consume. withTerminalChain observes modifiers and
    // resize. The chain's effects (render / exit) are drained and re-routed
    // into this runner's render pipeline.
    //
    // Node-drag mouse events also enter the chain; unclaimed mouse events and
    // resize / other namespaced events continue to runEventHandler.
    for (const event of events) {
      let hostInputOwnershipBarrier = false
      let dragPointerOwned = false
      let suppressEvent = false
      if (event.type === "term:key") {
        const { input, key: parsedKey } = event.data as { input: string; key: Key }
        hostInputOwnershipBarrier = isFocusedIslandHostInputBarrier(input, parsedKey, focusManager)

        // Raw lane: Always update keyboard modifier state (Super/Cmd, Hyper) for
        // mouse events. SGR mouse protocol can't report these — Kitty fills the gap.
        updateKeyboardModifiers(mouseEventState, parsedKey)

        // Raw-key observer: fire unconditionally (useModifierKeys tracks state
        // from every key event, including release and modifier-only).
        chainApp.rawKeys.notify(input, parsedKey)

        // Dispatch into the chain. withInputChain filters release / modifier-only
        // events internally so useInput handlers aren't spammed; withFocusChain
        // drives focus precedence via the injected handleFocusNavigation.
        chainApp.dispatch({ type: "input:key", input, key: parsedKey })
        // Drain chain effects — render/exit are re-emitted via the legacy
        // render orchestration below (doRender + flush loop). Capture exit
        // intent so we can short-circuit before the app handler fires.
        const chainEffects = chainApp.drainEffects()
        for (const eff of chainEffects) {
          if (eff.type === "exit") shouldExit = true
          if (isDragChainEffect(eff)) suppressEvent = eff.suppressEvent
        }
        if (shouldExit) {
          inEventHandler = false
          return null
        }
        // Release / modifier-only events skip the app handler path (matches
        // pre-refactor behaviour: those never produced app-level commands).
        if (parsedKey.eventType === "release" || isModifierOnlyEvent(input, parsedKey)) {
          continue
        }
      } else if (dragFeature && event.event === "mouse" && event.data) {
        const mouse = event.data as {
          action: "down" | "up" | "move" | "wheel"
          button: number
          x: number
          y: number
        }
        chainApp.dispatch({ type: "term:mouse", ...mouse })
        const chainEffects = chainApp.drainEffects()
        for (const effect of chainEffects) {
          if (!isDragChainEffect(effect)) continue
          suppressEvent ||= effect.suppressEvent
          if (effect.type === "drag:pointer") dragPointerOwned = effect.ownsPointer
        }
      } else if (event.type === "term:paste") {
        const { text } = event.data as { text: string }
        // Route paste to the focused input-capable island's guest FIRST — the
        // paste sibling of routeKeyToFocusedIsland. A focused shell pane's pty
        // must receive Cmd-V paste (bracketed-paste re-wrapped when the guest
        // enabled DECSET 2004). Only when NO focused island consumes it do we
        // dispatch the app-level React `term:paste` event, so React apps
        // without a focused island still get their `usePaste` handlers.
        if (!routePasteToFocusedIsland(text, focusManager)) {
          chainApp.dispatch({ type: "term:paste", text })
          chainApp.drainEffects()
        }
      } else if (event.type === "term:focus") {
        const { focused } = event.data as { focused: boolean }
        chainApp.dispatch({ type: "term:focus", focused })
        chainApp.drainEffects()
        if (alternateScreen) {
          if (focused) {
            runtime.invalidate({ clearScreen: true })
            fullscreenDamageRiskFromBlur = false
            fullscreenDamageRepairRequested = false
            fullscreenDamageLastRepaintMs = -Infinity
          } else {
            fullscreenDamageRiskFromBlur = true
            fullscreenDamageRepairRequested = false
            fullscreenDamageLastRepaintMs = performance.now()
          }
        }
        // withTerminalChain is an observer — fan out to the chain
        // focusEvents store so useTerminalFocused / useModifierKeys
        // subscribers see the transition.
        chainApp.focusEvents.notify(focused)
      }

      // If a listener called exit() (e.g., useInput handler returned "exit"),
      // stop processing events immediately — don't render or flush.
      if (shouldExit) {
        inEventHandler = false
        return null
      }

      if (suppressEvent) {
        // The DOM event processor armed the drag source on mousedown. An
        // active drag consumes mouseup, so release that capture explicitly
        // instead of leaving a stale armed/capture target behind.
        const mouse = event.event === "mouse" ? (event.data as { action?: string }) : null
        if (mouse?.action === "up" && mouseEventState.mouseDownTarget) {
          setArmed(mouseEventState.mouseDownTarget, false)
          mouseEventState.mouseDownTarget = null
          mouseEventState.mouseCaptureTarget = null
        }
        continue
      }

      const result = runEventHandler(event, { skipSelection: dragPointerOwned })
      if (result === false) {
        isRendering = false
        inEventHandler = false
        exit()
        return null
      }

      // Render barrier: if handler requested flush, render now before next event.
      // This ensures newly mounted components (e.g., InlineEditField) have their
      // refs set up before the next event handler runs.
      //
      // IMPORTANT: runtime.render() must be called here to keep the runtime's
      // prevBuffer in sync with the Ag's internal prevBuffer. Without this,
      // the post-batch doRender's dirty-row tracking would be stale relative
      // to runtime.prevBuffer, causing diffBuffers() to skip all rows and
      // produce an empty diff (0 bytes output).
      if (result === "flush" || hostInputOwnershipBarrier) {
        pendingRerender = false
        currentBuffer = doRender()
        paintFrame()
        // Flush effects so mounted components can set up refs
        await Promise.resolve()
        if (pendingRerender) {
          pendingRerender = false
          currentBuffer = doRender()
          paintFrame()
        }
      }
    }

    // Clear deferred renders from handlers' setState calls — the explicit
    // doRender below picks up all state changes in one pass.
    pendingRerender = false

    // Explicit render — batches all handler state changes + flushes effects
    try {
      currentBuffer = doRender()
    } finally {
      isRendering = false
    }

    // Flush deferred re-renders from effects.
    // React's passive effects (useEffect) are scheduled during doRender
    // but flushed at the START of the next doRender (flushPassiveEffects).
    // The await drains the microtask queue so React's internally-queued
    // effect flush runs. Since inEventHandler=true, any setState from
    // effects just sets pendingRerender (no microtask render).
    //
    // Bound: MAX_CONVERGENCE_PASSES — see pass-cause.ts. Same convergence
    // structure as the renderer's loops; replaces the prior magic 5.
    let flushCount = 0
    if (INSTRUMENT) beginConvergenceLoop()
    while (flushCount < MAX_CONVERGENCE_PASSES) {
      if (INSTRUMENT) beginPass(flushCount)
      await Promise.resolve() // Drain microtask queue → passive effects flush
      if (!pendingRerender) break
      pendingRerender = false
      isRendering = true
      // Always-on exhaustion marker → never-empty violation ring.
      if (flushCount === MAX_CONVERGENCE_PASSES - 1) {
        recordPassRing("unknown", "production-flush-exhaustion")
      }
      if (INSTRUMENT) {
        notePassCommit(flushCount)
        if (flushCount === MAX_CONVERGENCE_PASSES - 1) {
          logPass({ cause: "unknown", detail: "production-flush-exhaustion" })
        }
      }
      try {
        currentBuffer = doRender()
      } finally {
        isRendering = false
      }
      flushCount++
    }
    if (flushCount >= MAX_CONVERGENCE_PASSES && pendingRerender) {
      assertBoundedConvergence(flushCount, "production-flush", MAX_CONVERGENCE_PASSES)
    }

    // Commit boundary for deferred `useBoxRect()` / `useScrollRect()` /
    // `useScreenRect()` reactive consumers. Promotes in-flight rect signals
    // (written by every layout pass within the convergence loop) to their
    // committed peers (read by reactive subscribers). Within the loop above
    // every pass saw the SAME committed value, so a render that branches on
    // useBoxRect can't form a feedback edge with the loop. Now — at the
    // batch boundary — we advance committed by one frame; subscribers fire
    // forceUpdate exactly once per genuine layout change, and the resulting
    // render runs in EXACTLY ONE additional pass below (it cannot reopen
    // the convergence loop because committed == in-flight after this call).
    // See bead `@km/silvery/use-deferred-box-rect-and-post-commit-observers`.
    // `commitLayout` returns whether it advanced any committed rect — i.e.
    // fired a useBoxRect/useScrollRect/useScreenRect subscriber forceUpdate.
    // Those forceUpdates are React-SCHEDULED (deferred-lane): they do NOT set
    // the runtime `pendingRerender` flag and are NOT drained by
    // `flushSyncWork()`; only a doRender() (updateContainerSync) processes them.
    // Gating the post-commit pass on `pendingRerender` alone therefore leaked
    // the converged frame past the event boundary — this batch painted the
    // pre-commit (stale) frame and the new committed rect surfaced ~1 macrotask
    // later via the standalone fallback (the @si/render/19436 boxSize
    // signature). Run the documented "exactly one additional pass" whenever the
    // commit advanced a subscribed rect (or a normal pendingRerender is set).
    const committedAdvanced = renderer.commitLayout()
    await Promise.resolve()
    reconciler.flushSyncWork()
    if (pendingRerender || committedAdvanced) {
      // The commit fired a useBoxRect/useScrollRect/useScreenRect reactive
      // subscriber → forceUpdate → React queued a re-render. Drain it once;
      // do NOT loop again — any further in-flight rect changes produced by
      // this final pass intentionally defer to the next event batch (the
      // "one-frame-late" contract).
      pendingRerender = false
      isRendering = true
      try {
        await Promise.resolve()
        currentBuffer = doRender()
      } finally {
        isRendering = false
      }
      // Non-lossy tail (NO SILENT ERRORS). The drain doRender's OWN commit
      // re-raises `pendingRerender` via onRender — that is a self-induced flag,
      // not residual work, so clear it. The genuine residual to recover is a
      // DEEPER measurement layer: a SECOND commit that still advances a
      // subscribed rect means a multi-layer useBoxRect chain the single drain
      // didn't reach. Per the one-frame-late contract we do NOT loop in-event;
      // instead recover it non-lossily on ONE follow-up frame (fresh budget) +
      // record the edge, rather than stranding the buffer behind committed
      // state (the defect the standalone path fixed in @km/silvercode/19383).
      pendingRerender = false
      if (renderer.commitLayout()) {
        recordPassRing("unknown", "production-flush-exhaustion")
        scheduleFollowupStandaloneFrame()
      }
    }

    // The render phase's dirty rows are relative to the Ag's internal prevBuffer.
    // But runtime.render() diffs against its own prevBuffer, which may differ
    // when: (a) multiple doRender calls shifted the Ag's prevBuffer ahead, or
    // (b) the Z chord timeout causes the zoom render to arrive as a deferred
    // event where intermediate renders have updated the Ag's prevBuffer.
    // Always mark all rows dirty to ensure runtime.render() does a full diff.
    // The cost is negligible (diffBuffers still skips identical rows via
    // rowMetadataEquals/rowCharsEquals pre-check), but correctness is guaranteed.
    currentBuffer._buffer.markAllRowsDirty()

    inEventHandler = false
    const runtimeStart = performance.now()
    // paintFrame() applies selection + search-highlight + search-bar
    // styling to a clone before runtime.render, so the diff engine sees
    // overlay state and repaints correctly when selection grows / shrinks /
    // moves, when the search currentMatch shifts, and when the search bar
    // opens / closes.
    paintFrame()
    // Post-render: push to scrollback (uses currentBuffer's clean content)
    // + overlay scrollback view (still legacy ANSI-past-buffer — different
    // bug class, virtualScrollOffset > 0 forces full screen rewrite each
    // frame so stale-cell drift isn't observable).
    pushToScrollback()
    if (virtualScrollOffset > 0) {
      renderVirtualScrollbackView()
    }
    const runtimeMs = performance.now() - runtimeStart
    if (_perfLog) {
      const totalMs = performance.now() - _eventStart
      process
        .getBuiltinModule("node:fs")
        .appendFileSync(
          "/tmp/silvery-perf.log",
          `EVENT batch(${events.length} ${events[0]?.type}): ${totalMs.toFixed(1)}ms total, ${renderer.renderCount()} doRender() calls, runtime.render=${runtimeMs.toFixed(1)}ms\n---\n`,
        )
    }
    // Budget check — warn if batch took longer than one frame (16ms)
    if (_perfSpan) {
      checkBudget(events[0]?.type ?? "batch", performance.now() - _eventStart)
    }
    return currentBuffer
  }

  // Start event loop
  //
  // Event coalescing: when events arrive faster than renders, we batch
  // consecutive handler calls into a single render pass. This prevents
  // the "event backlog" problem where auto-repeat keys queue up faster
  // than they can be rendered (e.g., 30/sec auto-repeat vs 50ms renders).
  //
  // Strategy: collect events into a shared queue, run all pending handlers,
  // render once. This means pressing and holding 'j' processes 2-3 cursor
  // moves per render instead of 1, keeping up with auto-repeat.
  const eventQueue: NamespacedEvent[] = []
  let eventQueueResolve: (() => void) | null = null
  let continuePointerBacklog = false

  const eventLoop = async () => {
    // Direct subscriptions for providers that are Terms (have .input + .size).
    // These skip the async-iterator pipeline and push straight into the shared
    // queue — the canonical path since `term.events()` was retired.
    const streamProviders: [string, Provider<unknown, Record<string, unknown>>][] = []

    const nudge = () => {
      if (eventQueueResolve) {
        const resolve = eventQueueResolve
        eventQueueResolve = null
        resolve()
      }
    }

    for (const [name, provider] of Object.entries(providers)) {
      const maybeTerm = provider as unknown as { input?: Term["input"]; size?: Term["size"] }
      // Any Term-like provider (has `.size`) drives events through direct
      // subscriptions. Input is optional — headless Terms have `.size` but
      // no `.input`; they still need the resize subscription for re-renders.
      if (maybeTerm.size) {
        const size = maybeTerm.size
        const input = maybeTerm.input
        if (input) {
          providerCleanups.push(
            input.onKey((e) => {
              eventQueue.push({ type: `${name}:key`, provider: name, event: "key", data: e })
              nudge()
            }),
          )
          providerCleanups.push(
            input.onMouse((e) => {
              eventQueue.push({ type: `${name}:mouse`, provider: name, event: "mouse", data: e })
              nudge()
            }),
          )
          providerCleanups.push(
            input.onPaste((e) => {
              eventQueue.push({ type: `${name}:paste`, provider: name, event: "paste", data: e })
              nudge()
            }),
          )
          providerCleanups.push(
            input.onFocus((e) => {
              eventQueue.push({ type: `${name}:focus`, provider: name, event: "focus", data: e })
              nudge()
            }),
          )
        }
        providerCleanups.push(
          watch(
            () => size.snapshot(),
            (next) => {
              eventQueue.push({
                type: `${name}:resize`,
                provider: name,
                event: "resize",
                data: { cols: next.cols, rows: next.rows },
              })
              nudge()
            },
          ),
        )
      } else {
        streamProviders.push([name, provider])
      }
    }

    // Merge non-Term provider event streams (user-injected custom providers).
    const providerEventStreams = streamProviders.map(([name, provider]) =>
      createProviderEventStream(name, provider),
    )

    const allEvents = merge(...providerEventStreams)

    // Pump events from async iterables (empty stream when no non-Term
    // providers exist) into the shared queue.
    const pumpEvents = async () => {
      try {
        for await (const event of takeUntil(allEvents, signal)) {
          eventQueue.push(event)
          nudge()
          if (shouldExit) break
        }
      } finally {
        nudge()
      }
    }

    // Probes run through the canonical InputOwner's probe lane. Its stdin
    // listener is already active, and matching replies are consumed before
    // the normal typed-event parser sees any leftovers.
    if (needsProbe && sessionInput) {
      try {
        const probeResult = await detectTextSizingWithInput(sessionInput, probeFingerprint, 500)

        // If probe result differs from initial heuristic, recreate pipeline
        if (probeResult.supported !== textSizing) {
          textSizing = probeResult.supported
          if (effectiveCaps) {
            effectiveCaps = { ...effectiveCaps, textSizing: textSizing }
            pipelineConfig = createPipeline({ caps: effectiveCaps })
            // Update runtime's output phase to use the new measurer
            runtime.setOutputPhaseFn(pipelineConfig.outputPhaseFn)
          }
          // Invalidate pipeline and runtime diff state for full redraw.
          // Recreate Ag with updated measurer (text sizing support changed).
          renderer.resetAg()
          runtime.invalidate()
          // Force full re-render with updated measurer
          if (!isRendering) {
            isRendering = true
            try {
              currentBuffer = doRender()
              paintFrame()
            } finally {
              isRendering = false
            }
          }
        }
      } catch {
        // Probe failed — keep current textSizing setting (safe fallback)
      }
    }

    // Query DEC modes 1020-1023 through that same owner.
    if (needsWidthDetection && sessionInput) {
      try {
        const widthConfig = await detectWidthConfigWithProbe(sessionInput, 200)

        // Apply detected width config to caps and recreate pipeline if
        // changed. Post km-silvery.plateau-naming-polish: `maybeWideEmojis`
        // and `textSizing` both live on caps — one overlay, one object.
        if (effectiveCaps) {
          const updatedCaps = applyWidthConfig(effectiveCaps, widthConfig)
          const capsChanged =
            updatedCaps.maybeWideEmojis !== effectiveCaps.maybeWideEmojis ||
            updatedCaps.textSizing !== effectiveCaps.textSizing
          if (capsChanged) {
            effectiveCaps = updatedCaps
            pipelineConfig = createPipeline({ caps: effectiveCaps })
            runtime.setOutputPhaseFn(pipelineConfig.outputPhaseFn)
            // Recreate Ag with updated measurer (caps changed text sizing/emoji width)
            renderer.resetAg()
            runtime.invalidate()
            if (!isRendering) {
              isRendering = true
              try {
                currentBuffer = doRender()
                paintFrame()
              } finally {
                isRendering = false
              }
            }
          }
        }
      } catch {
        // Width detection failed — keep default caps (safe fallback)
      }
    }

    // Start pump in background — this synchronously runs the term-provider
    // generator body, which attaches the stdin data listener. After this call,
    // stdin is being consumed, so terminal responses won't leak as raw text.
    const inputPumpPromise = pumpEvents().catch((err: unknown) => {
      log.error?.(`pumpEvents failed: ${err}`)
    })
    inputPumpStarted = true
    legacyBracketedPasteEnabled = hostOwnsStdin && modes.bracketedPaste()

    // Focus reporting must wait until after the stdin listener is attached;
    // bracketed paste's legacy default is also known only after the Input
    // owner is constructed. The shared island aggregator then handles both
    // legacy app-level modes and focused-island requests.
    applyFocusedIslandProtocolModes("startup")

    try {
      while (!shouldExit && !signal.aborted) {
        // Wait for at least one event
        if (eventQueue.length === 0) {
          await new Promise<void>((resolve) => {
            eventQueueResolve = resolve
            signal.addEventListener("abort", () => resolve(), { once: true })
          })
        }

        if (shouldExit || signal.aborted) break
        if (eventQueue.length === 0) continue

        // Drain-then-render: yield to the event loop repeatedly so the pump
        // (async-iterator chain: term-provider → merge → map → takeUntil →
        // pumpEvents) can push ALL pending events into eventQueue before we
        // process the batch. Each hop through the async iterator pipeline
        // costs several microtask ticks per event, so a single
        // `Promise.resolve()` yield is not enough to drain a burst of 10+
        // events from the term-provider's internal queue. We use
        // `setImmediate` (which runs after ALL pending microtasks) so that a
        // full async-iterator round-trip has time to complete. Then we loop
        // until the queue is stable across two consecutive yields, meaning
        // the pipeline has delivered everything it had ready.
        //
        // This ensures rapid keypresses (e.g., jumping from fold level 1 to
        // 10, or OS auto-repeat buffering "jjjjj...") coalesce into ONE
        // render cycle instead of N.
        //
        // Pointer streams are different from key-repeat bursts: terminal
        // trackpads and mouse drags can keep producing packets while the
        // user is actively moving. Waiting for the queue to become stable
        // before rendering makes the viewport/selection lag behind the
        // fingers. For mouse batches we do one event-loop yield to collect
        // already-ready packets, then render immediately; later packets form
        // the next frame.
        //
        // Safety: bounded by maxDrainSpins to prevent pathological stalls
        // if an event source is producing faster than we can drain. Under
        // realistic auto-repeat (30-60 keys/sec), events arrive in a short
        // burst then go quiet — maxDrainSpins=32 is plenty of headroom.
        const maxDrainSpins = 32
        let drainSpins = 0
        const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve))
        // First mandatory yield — lets events already in-flight land. When
        // the previous loop intentionally split a pointer burst into multiple
        // render-sized chunks, the remaining events are already in memory; an
        // extra setImmediate between those chunks adds latency without adding
        // signal fidelity.
        const skipInitialDrainYield = continuePointerBacklog && eventQueue.some(isMouseEvent)
        continuePointerBacklog = false
        if (!skipInitialDrainYield) await yieldToEventLoop()
        const pointerBatch = eventQueue.some(isMouseEvent)
        if (!pointerBatch) {
          let prevLen = eventQueue.length
          while (drainSpins < maxDrainSpins) {
            // eslint-disable-next-line no-await-in-loop -- intentional: sequential yields drain the async iterator pipeline
            await yieldToEventLoop()
            const curLen = eventQueue.length
            if (curLen === prevLen) break
            prevLen = curLen
            drainSpins++
          }
        }
        if (_perfLog) {
          process
            .getBuiltinModule("node:fs")
            .appendFileSync(
              "/tmp/silvery-perf.log",
              `DRAIN: spins=${drainSpins}, batch=${eventQueue.length}\n`,
            )
        }
        // Expose diagnostic counters on globalThis for test assertions.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _g = globalThis as any
        _g.__silvery_last_drain_spins = drainSpins
        const batch = takeNextFrameBatch(eventQueue)
        continuePointerBacklog = batch.some(isMouseEvent) && eventQueue.some(isMouseEvent)
        _g.__silvery_last_batch_size = batch.length
        _g.__silvery_last_queued_event_count = eventQueue.length
        _g.__silvery_batch_count = (_g.__silvery_batch_count ?? 0) + 1

        // Process the next render batch — run handlers without rendering.
        // Keyboard repeat still drains all pending events into one frame.
        // Pointer streams keep one terminal input batch per frame so a
        // trackpad cannot collapse several delivered motion chunks into one
        // visible jump.
        // Wheel packets from terminal trackpads often arrive as same-turn
        // bursts. Coalesce only consecutive same-direction packets from
        // the same terminal input batch with identical geometry/modifiers:
        // this preserves the total input distance without erasing cadence
        // between separately delivered trackpad chunks.
        const buf = await processEventBatch(coalesceWheelEvents(batch))
        if (buf) emitFrame(buf)
      }
    } finally {
      // Error exits reach this path without going through exit(). Stop every
      // producer before beginning the joined teardown below.
      controller.abort()

      // Mark frames as done and notify waiters
      framesDone = true
      if (frameResolve) {
        const resolve = frameResolve
        frameResolve = null
        // Signal completion — resolve with a sentinel that next() will detect
        resolve(null as unknown as Buffer)
      }

      // Async drain: give the event loop 1 tick + 15ms to receive any
      // late-arriving bytes (Kitty release events, mouse events) that were
      // in the kernel TTY buffer when we sent the disable sequences.
      // This is the async path — signal handlers use the sync fallback in exit().
      // Skipped when `input: false`: the host owns stdin and we never
      // had a listener to remove or kernel bytes to drain.
      if (shouldExit && !cleanedUp && !headless && stdin.isTTY && hostOwnsStdin) {
        try {
          // Remove data listener but keep raw mode on — we're still consuming
          stdin.removeAllListeners("data")
          stdin.resume()
          // Let the event loop tick to deliver kernel-buffered bytes
          await new Promise((resolve) =>
            setTimeout(resolve, panicExitRequested ? PANIC_STDIN_DRAIN_MS : 15),
          )
          // Drain whatever arrived
          while (stdin.read() !== null) {
            /* discard late arrivals */
          }
          stdin.pause()
        } catch {
          // Best-effort — continue to cleanup
        }
      }

      // Synchronous cleanup restores the terminal and starts app-scope
      // disposal. The memoized promise is the join for an in-flight disposal;
      // calling Scope.asyncDispose() again would return early after `disposed`
      // flips and therefore is not a barrier.
      try {
        cleanup()
        await Promise.all([inputPumpPromise, disposeAppScope("app-exit"), joinStandaloneFrames()])
      } finally {
        exitResolve()
      }
    }
  }

  // Start loop in background
  eventLoop().catch((err: unknown) => {
    cleanup() // exit alt screen so error is visible in normal terminal
    const errObj = err instanceof Error ? err : new Error(String(err))
    const msg = errObj.message
    const stack = errObj.stack ?? "(no stack)"

    // Dump the full error + stack to a temp file — alt screen clears
    // stderr, and for deep stacks (e.g. "Maximum call stack size exceeded")
    // the user needs the recursive frame to diagnose. Same pattern as the
    // SILVERY_STRICT mismatch dump and the React render-error dump.
    // Best-effort
    const dumpPath = writeDumpFile("eventloop-failure", `${msg}\n\n${stack}\n`)

    const summaryLine = dumpPath
      ? `eventLoop failed: ${msg.split("\n")[0]}\n  dump: ${dumpPath}`
      : `eventLoop failed: ${msg.split("\n")[0]}`
    log.error?.(summaryLine)
    process.stderr.write(`\n${summaryLine}\n`)
    process.exitCode = 1
  })

  // Return handle with async iteration
  const handle: AppHandle<S & I> = {
    get text() {
      return currentBuffer.text
    },
    get root() {
      return getContainerRoot(container)
    },
    get buffer() {
      return currentBuffer?._buffer ?? null
    },
    get store() {
      return store
    },
    get scope() {
      return appScope
    },
    waitUntilExit() {
      return exitPromise
    },
    async waitForLayoutStable(opts?: { timeoutMs?: number; maxPasses?: number }): Promise<void> {
      // Drain additional commit / layout cycles until stable OR cap.
      //
      // Implementation note: production's processEventBatch runs its own
      // bounded-convergence flush loop after every event. Calling this
      // method on a `run()` handle simply drives the same loop one extra
      // time — `renderer.commitLayout()` to promote in-flight rect signals,
      // then await a microtask to drain React's passive-effect queue, then
      // check `pendingRerender`. Loops until stable or cap.
      //
      // Bead: `@km/silvery/test-harness-convergence-cap-parity`.
      if (shouldExit) return
      const timeoutMs = opts?.timeoutMs ?? 50
      const maxPasses = opts?.maxPasses ?? 20
      const start = performance.now()
      for (let pass = 0; pass < maxPasses; pass++) {
        if (performance.now() - start >= timeoutMs) return
        pendingRerender = false
        // `commitLayout` returns whether it advanced a committed rect — those
        // subscriber forceUpdates are deferred-lane and do NOT set
        // `pendingRerender` nor drain via `flushSyncWork`, so a stable check on
        // `pendingRerender` alone would return one pass too early and leave the
        // subscriber update unpainted (the @si/render/19436 boxSize signature).
        // Drain another pass when the commit advanced a subscribed rect.
        const committedAdvanced = renderer.commitLayout()
        await Promise.resolve()
        reconciler.flushSyncWork()
        if (!pendingRerender && !committedAdvanced) {
          // Also verify no node is epoch-dirty — a render could be pending
          // outside React's commit pipeline (e.g., signal subscribers that
          // forceUpdate after the microtask drained).
          try {
            const root = getContainerRoot(container)
            if (root && !isAnyDirty(root)) return
          } catch {
            return
          }
          return
        }
        pendingRerender = false
        isRendering = true
        try {
          currentBuffer = doRender()
        } finally {
          isRendering = false
        }
      }
      // Budget exhausted — resolve without throwing. Structural non-
      // convergence is caught by SILVERY_STRICT's bounded-convergence
      // assertions in the event-loop's own flush; this method is the
      // test-author opt-in for post-convergence assertions, not a
      // determinism check.
    },
    panic(reason: unknown, options?: PanicOptions) {
      panicApp(reason, options)
    },
    unmount() {
      exit()
    },
    [Symbol.dispose]() {
      exit()
    },
    async press(rawKey: string) {
      // `press()` is the headless/test host's external-input boundary, parallel
      // to processEventBatch() in the terminal event loop. Do not join bounded
      // recoveries from separate synthetic keypresses into an autonomous streak.
      standaloneCapExceedStreak = 0
      // perfLog.span is always defined; the cost of performance.now() is negligible.
      const pressStart = performance.now()
      // Convert named keys to ANSI bytes (Kitty protocol when enabled)
      const ansiKey = useKittyMode ? keyToKittyAnsi(rawKey) : keyToAnsi(rawKey)
      const [input, parsedKey] = parseKey(ansiKey)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      using _perfSpan = perfLog.span?.(
        "keypress",
        (() => {
          startTracking()
          return { key: input || rawKey }
        })(),
      )

      // Intercept lifecycle keys (Ctrl+C) — same as processEventBatch but for
      // headless/press() path. parseKey returns input="c" with key.ctrl=true
      // for Ctrl+C (not the raw "\x03" byte).
      if (input === "c" && parsedKey.ctrl && exitOnCtrlCOption) {
        const prevented = onInterruptHook?.() === false
        if (!prevented) {
          exit()
          return
        }
      }

      // Raw-key observer: fire unconditionally (useModifierKeys tracks state
      // from every key event, including release and modifier-only).
      chainApp.rawKeys.notify(input, parsedKey)

      // Suppress subscription renders — flush loop below handles everything.
      inEventHandler = true
      isRendering = true

      // Dispatch into the apply chain: withFocusChain handles the focus-tree
      // dispatch (formerly handleFocusNavigation), withInputChain fires the
      // useInput fallback when focus didn't consume. Same precedence as the
      // batched path.
      chainApp.dispatch({ type: "input:key", input, key: parsedKey })
      const pressEffects = chainApp.drainEffects()
      let focusConsumed = false
      for (const eff of pressEffects) {
        if (eff.type === "exit") shouldExit = true
        if (eff.type === "render") {
          // withFocusChain emits a single `render` effect when the focused
          // tree consumed the key. We use that as the "focus consumed"
          // signal — a single render here short-circuits the rest of the
          // press() pipeline, matching the pre-refactor behaviour.
          focusConsumed = true
        }
      }
      if (shouldExit) {
        isRendering = false
        inEventHandler = false
        return
      }
      if (focusConsumed) {
        pendingRerender = false
        isRendering = false
        inEventHandler = false
        doRender()
        await Promise.resolve()
        if (_perfSpan) checkBudget(input || rawKey, performance.now() - pressStart)
        return
      }

      // Dispatch to app handlers (namespaced + legacy)
      const handlerCtx = createHandlerContext(store, focusManager, container)
      if (dispatchKeyToHandlers(input, parsedKey, handlers, handlerCtx) === "exit") {
        isRendering = false
        inEventHandler = false
        exit()
        return
      }

      // Clear deferred renders — explicit render below batches all changes
      pendingRerender = false

      // Trigger re-render (batches handler state changes + flushes effects)
      try {
        currentBuffer = doRender()
      } finally {
        isRendering = false
      }
      // Flush deferred re-renders from effects.
      // await drains microtask queue → React passive effects flush.
      // Since inEventHandler=true, setState from effects just flags
      // pendingRerender (no microtask render). Bound: MAX_CONVERGENCE_PASSES.
      let flushCount = 0
      while (flushCount < MAX_CONVERGENCE_PASSES) {
        await Promise.resolve()
        if (!pendingRerender) break
        pendingRerender = false
        isRendering = true
        try {
          currentBuffer = doRender()
        } finally {
          isRendering = false
        }
        flushCount++
      }
      // Commit boundary — see processEventBatch (≈line 3160) for full
      // rationale. Promotes in-flight rect signals to committed; reactive
      // useBoxRect/useScrollRect/useScreenRect consumers see one stable
      // value across all passes within this press cycle.
      // The commit promotes in-flight rect signals to committed; that write
      // fires layout-signal subscribers (useBoxRect/useScrollRect/useScreenRect)
      // whose forceUpdate is a React-SCHEDULED (deferred-lane) update — it does
      // NOT set the runtime `pendingRerender` flag and is NOT drained by
      // `reconciler.flushSyncWork()`. Only a subsequent doRender()
      // (updateContainerSync) processes it. So gating the post-commit pass on
      // `pendingRerender` alone leaks the converged frame past the press
      // boundary: this press paints the pre-commit (stale) frame and the new
      // committed rect only surfaces ~1 macrotask later via the standalone
      // fallback. That is the @si/render/19436 boxSize signature. `commitLayout`
      // now reports whether it advanced any committed rect; run the documented
      // "exactly one additional pass" whenever it did (or a normal pendingRerender
      // is set) so the subscriber update is painted in THIS event.
      const committedAdvanced = renderer.commitLayout()
      await Promise.resolve()
      reconciler.flushSyncWork()
      if (pendingRerender || committedAdvanced) {
        pendingRerender = false
        isRendering = true
        try {
          await Promise.resolve()
          currentBuffer = doRender()
        } finally {
          isRendering = false
        }
        flushCount++
        // Non-lossy tail (NO SILENT ERRORS). The drain doRender's OWN commit
        // re-raises `pendingRerender` via onRender — a self-induced flag, not
        // residual work, so clear it. The genuine residual to recover is a
        // DEEPER measurement layer: a SECOND commit that still advances a
        // subscribed rect means a multi-layer useBoxRect chain the single drain
        // didn't reach. Per the one-frame-late contract we do NOT loop in-event;
        // recover it non-lossily on ONE follow-up frame (fresh budget) + record
        // the edge, rather than stranding the buffer behind committed state (the
        // defect the standalone path fixed in @km/silvercode/19383).
        pendingRerender = false
        if (renderer.commitLayout()) {
          recordPassRing("unknown", "press-flush-exhaustion")
          scheduleFollowupStandaloneFrame()
        }
      }
      // Mark all rows dirty — same safety net as processEventBatch. The render
      // phase's dirty rows are relative to Ag's internal prevBuffer, while
      // runtime.render() diffs against the last painted runtime buffer. A direct
      // press/wheel can update rendered rows without an effect flush (for example
      // ListView wheel anchoring), so keep the runtime diff coverage unconditional.
      currentBuffer._buffer.markAllRowsDirty()
      inEventHandler = false
      paintFrame()
      if (_perfSpan) checkBudget(input || rawKey, performance.now() - pressStart)
    },

    [Symbol.asyncIterator](): AsyncIterator<Buffer> {
      return {
        async next(): Promise<IteratorResult<Buffer>> {
          if (framesDone || shouldExit) {
            return { done: true, value: undefined as unknown as Buffer }
          }

          // Wait for next frame from event loop
          const buf = await new Promise<Buffer>((resolve) => {
            // If already done, resolve immediately
            if (framesDone || shouldExit) {
              resolve(null as unknown as Buffer)
              return
            }
            frameResolve = resolve
          })

          // null sentinel means done
          if (!buf) {
            return { done: true, value: undefined as unknown as Buffer }
          }

          return { done: false, value: buf }
        },
        async return(): Promise<IteratorResult<Buffer>> {
          exit()
          return { done: true, value: undefined as unknown as Buffer }
        },
      }
    },
  }

  startupCommitted = true
  return handle
}

/**
 * Adapt the legacy text-sizing detector to the session InputOwner without
 * opening another stdin subscription. The detector still owns the support
 * decision and cache; this adapter only turns its write/read pair into one
 * atomic owner probe (register parser, then write query).
 */
function detectTextSizingWithInput(
  input: NonNullable<Term["input"]>,
  fingerprint: string,
  timeoutMs: number,
): Promise<import("../text-sizing").TextSizingProbeResult> {
  let response: Promise<string | null> | undefined
  return detectTextSizingSupport(
    (query) => {
      response = input.probe({
        query,
        timeoutMs,
        parse: (acc) => {
          const start = acc.indexOf("\x1b[")
          const end = start < 0 ? -1 : acc.indexOf("R", start + 2)
          if (end < 0) return null
          const body = acc.slice(start + 2, end)
          if (!/^\d+;\d+$/.test(body)) return null
          return {
            result: acc.slice(start, end + 1),
            consumed: end + 1,
          }
        },
      })
    },
    async () => (response ? ((await response) ?? "") : ""),
    fingerprint,
    timeoutMs,
  )
}
