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
import type { CursorState } from "@silvery/react/hooks/useCursor"
import type { TeaNode } from "@silvery/tea/types"
import { runWithMeasurer, type Measurer } from "../unicode"
import type { OutputPhaseFn } from "./output-phase"
import type { PipelineContext } from "./types"

const log = createLogger("silvery:pipeline")
const baseLog = createLogger("@silvery/react")

// Re-export types
export type {
  CellChange,
  BorderChars,
  PipelineContext,
  NodeRenderState,
  ClipBounds,
  ContentPhaseStats,
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
export { contentPhase, clearBgConflictWarnings, setBgConflictMode } from "./content-phase"
export { contentPhaseAdapter } from "./content-phase-adapter"
export { outputPhase } from "./output-phase"

import { contentPhaseAdapter } from "./content-phase-adapter"
import { clearBgConflictWarnings, contentPhase } from "./content-phase"
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
  root: TeaNode,
  width: number,
  height: number,
  prevBuffer: TerminalBuffer | null,
  options: ExecuteRenderOptions | "fullscreen" | "inline" = "fullscreen",
  config?: PipelineConfig,
): { output: string; buffer: TerminalBuffer } {
  // Create PipelineContext from config measurer (if provided).
  // The context is threaded explicitly through the pipeline, eliminating
  // the need for pipeline functions to read the _scopedMeasurer global.
  const ctx: PipelineContext | undefined = config?.measurer ? { measurer: config.measurer } : undefined

  if (config?.measurer) {
    // Keep runWithMeasurer for backward compat: output-phase and other
    // non-pipeline consumers still read the scoped measurer global.
    return runWithMeasurer(config.measurer, () => {
      return executeRenderCore(root, width, height, prevBuffer, options, config, ctx)
    })
  }
  return executeRenderCore(root, width, height, prevBuffer, options, config, ctx)
}

/** Internal: runs the full pipeline. */
function executeRenderCore(
  root: TeaNode,
  width: number,
  height: number,
  prevBuffer: TerminalBuffer | null,
  options: ExecuteRenderOptions | "fullscreen" | "inline" = "fullscreen",
  config?: PipelineConfig,
  ctx?: PipelineContext,
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
  // Intentional null (SILVERY_STRICT, static/one-shot) passes skipLayoutNotifications.
  // console.warn (not loggily) — must fire regardless of logger config.
  if (process?.env?.SILVERY_DEV && prevBuffer === null && root.prevLayout !== null && !skipLayoutNotifications) {
    console.warn(
      "[silvery] executeRender called with prevBuffer=null on frame 2+ — " +
        "incremental content rendering is disabled (full render every frame). " +
        "Track the returned buffer and pass it as prevBuffer on subsequent renders.",
    )
  }

  const start = performance.now()

  using render = baseLog.span("pipeline", { width, height, mode })

  // Clear per-render caches
  clearBgConflictWarnings()

  // Phase 1: Measure (for fit-content nodes)
  let tMeasure: number
  {
    using _measure = render.span("measure")
    const t1 = performance.now()
    measurePhase(root, ctx)
    tMeasure = performance.now() - t1
    log.debug?.(`measure: ${tMeasure.toFixed(2)}ms`)
  }

  // Phase 2: Layout
  let tLayout: number
  {
    using _layout = render.span("layout")
    const t2 = performance.now()
    layoutPhase(root, width, height)
    tLayout = performance.now() - t2
    log.debug?.(`layout: ${tLayout.toFixed(2)}ms`)
  }

  // Phase 2.5: Scroll calculation (for overflow='scroll' containers)
  let tScroll: number
  {
    using _scroll = render.span("scroll")
    const t2s = performance.now()
    scrollPhase(root, { skipStateUpdates: skipScrollStateUpdates })
    tScroll = performance.now() - t2s
  }

  // Phase 2.55: Sticky phase (non-scroll container sticky children)
  stickyPhase(root)

  // Phase 2.6: Screen rect calculation (screen-relative positions)
  let tScreenRect: number
  {
    using _screenRect = render.span("screenRect")
    const t2r = performance.now()
    screenRectPhase(root)
    tScreenRect = performance.now() - t2r
  }

  // Phase 2.7: Notify layout subscribers
  // This runs AFTER screenRectPhase so useScreenRectCallback reads correct positions
  // Skip for static renders where no one will respond to the feedback
  let tNotify = 0
  if (!skipLayoutNotifications) {
    using _notify = render.span("notify")
    const t2n = performance.now()
    notifyLayoutSubscribers(root)
    tNotify = performance.now() - t2n
  }

  // Phase 3: Content render (incremental if we have prevBuffer)
  let buffer: TerminalBuffer
  let tContent: number
  {
    using _content = render.span("content")
    const t3 = performance.now()
    buffer = contentPhase(root, prevBuffer, ctx)
    tContent = performance.now() - t3
    log.debug?.(`content: ${tContent.toFixed(2)}ms`)
  }

  // Phase 4: Diff and output
  let output: string
  let tOutput: number
  {
    using outputSpan = render.span("output")
    const t4 = performance.now()
    const outputFn = config?.outputPhaseFn ?? outputPhase
    output = outputFn(prevBuffer, buffer, mode, scrollbackOffset, termRows, cursorPos)
    tOutput = performance.now() - t4
    outputSpan.spanData.bytes = output.length
    log.debug?.(`output: ${tOutput.toFixed(2)}ms (${output.length} bytes)`)
  }

  const total = performance.now() - start
  log.debug?.(`total pipeline: ${total.toFixed(2)}ms`)

  // Expose phase timing and render count for benchmarking and diagnostics
  ;(globalThis as any).__silvery_last_pipeline = {
    measure: tMeasure,
    layout: tLayout,
    scroll: tScroll,
    screenRect: tScreenRect,
    notify: tNotify,
    content: tContent,
    output: tOutput,
    total,
    incremental: prevBuffer !== null,
  }
  ;(globalThis as any).__silvery_render_count = ((globalThis as any).__silvery_render_count ?? 0) + 1

  return { output, buffer }
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
  root: TeaNode,
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
    buffer = contentPhaseAdapter(root)
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
