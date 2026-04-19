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
 *   Notify useBoxRect() subscribers
 *
 * Phase 3: CONTENT RENDER
 *   Render each node to the TerminalBuffer
 *   Handle text truncation, styling, borders
 *
 * Phase 4: DIFF & OUTPUT
 *   Compare current buffer with previous
 *   Emit minimal ANSI sequences for changes
 */

import type { CursorState } from "@silvery/ag-react/hooks/useCursor"
import type { Measurer } from "../unicode"
import type { OutputPhaseFn } from "./output-phase"

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
  scrollrectPhase,
  scrollrectPhaseSimple,
  notifyLayoutSubscribers,
  detectPipelineFeatures,
  type PipelineFeatures,
} from "./layout-phase"
export { renderPhase, clearBgConflictWarnings, setBgConflictMode } from "./render-phase"
export { renderPhaseAdapter } from "./render-phase-adapter"
export { outputPhase } from "./output-phase"
export { applyBackdropFade, hasBackdropMarkers } from "./backdrop-phase"
export type { BackdropColorLevel, BackdropFadeOptions } from "./backdrop-phase"
// Active theme + color level state (pipeline-internal, exposed for out-of-tree consumers)
export {
  getActiveTheme,
  pushContextTheme,
  popContextTheme,
  getActiveColorLevel,
  setActiveColorLevel,
} from "./state"
export type { ActiveColorLevel } from "./state"

// Layout signals — unified module (backward compat re-exports)
export {
  getLayoutSignals,
  hasLayoutSignals,
  syncRectSignals,
  type LayoutSignals,
} from "@silvery/ag/layout-signals"
export { getLayoutSignals as getRectSignals } from "@silvery/ag/layout-signals"

// ============================================================================
// Render Options & Pipeline Config (types only — functions deleted in Phase 2)
// ============================================================================

/**
 * Options for render pipeline callers.
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
  scrollRect: number
  /** Phase 2.7 — layout subscriber notifications */
  notify: number
  /** Sum of all layout-side phases (measure + layout + scroll + scrollRect + notify) */
  layoutTotal: number
  /** Phase 3 — content render (tree → buffer) */
  content: number
  /** Phase 4 — buffer diff → ANSI output */
  output: number
  /** Total pipeline time: layout + content + output */
  total: number
  /** Reconcile time — filled in by create-app.tsx, not pipeline/index.ts */
  reconcile: number
  /** Number of pipeline runs during the measurement window */
  pipelineCalls: number
  /** Number of times ag.render() ran (matches pipelineCalls in normal use) */
  renderCalls: number
}

/**
 * Start accumulating per-phase pipeline timings. Subsequent calls to
 * Pipeline callers and `ag.render()` will add their phase timings to the
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
    scrollRect: 0,
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
  phases.scrollRect = 0
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

// Re-export executeRenderAdapter from its own module
export { executeRenderAdapter } from "./adapter-pipeline"
