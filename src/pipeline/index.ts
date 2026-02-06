/**
 * Inkx Render Pipeline
 *
 * The 5-phase rendering architecture:
 *
 * Phase 0: RECONCILIATION (React)
 *   React reconciliation builds the InkxNode tree.
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
 *   Notify useLayout() subscribers
 *
 * Phase 3: CONTENT RENDER
 *   Render each node to the TerminalBuffer
 *   Handle text truncation, styling, borders
 *
 * Phase 4: DIFF & OUTPUT
 *   Compare current buffer with previous
 *   Emit minimal ANSI sequences for changes
 */

import { createLogger } from "@beorn/logger"
import type { TerminalBuffer } from "../buffer.js"
import type { InkxNode } from "../types.js"

const log = createLogger("inkx:pipeline")
const baseLog = createLogger("inkx")

// Re-export types
export type { CellChange, BorderChars } from "./types.js"

// Re-export phase functions
export { measurePhase } from "./measure-phase.js"
export {
  layoutPhase,
  rectEqual,
  scrollPhase,
  screenRectPhase,
  notifyLayoutSubscribers,
} from "./layout-phase.js"
export {
  contentPhase,
  clearBgConflictWarnings,
  setBgConflictMode,
} from "./content-phase.js"
export { contentPhaseAdapter } from "./content-phase-adapter.js"
export { outputPhase } from "./output-phase.js"

import { contentPhaseAdapter } from "./content-phase-adapter.js"
import { clearBgConflictWarnings, contentPhase } from "./content-phase.js"
import {
  layoutPhase,
  notifyLayoutSubscribers,
  screenRectPhase,
  scrollPhase,
} from "./layout-phase.js"
// Import for orchestration
import { measurePhase } from "./measure-phase.js"
import { outputPhase } from "./output-phase.js"

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
   * Use for fresh render comparisons (INKX_STRICT) to avoid mutating state.
   * Default: false
   */
  skipScrollStateUpdates?: boolean
}

/**
 * Execute the full render pipeline.
 *
 * @param root The root InkxNode
 * @param width Terminal width
 * @param height Terminal height
 * @param prevBuffer Previous buffer for diffing (null on first render)
 * @param options Render options
 * @returns Object with ANSI output and current buffer
 */
export function executeRender(
  root: InkxNode,
  width: number,
  height: number,
  prevBuffer: TerminalBuffer | null,
  options: ExecuteRenderOptions | "fullscreen" | "inline" = "fullscreen",
): { output: string; buffer: TerminalBuffer } {
  // Normalize options (string shorthand for mode)
  const opts: ExecuteRenderOptions =
    typeof options === "string" ? { mode: options } : options
  const {
    mode = "fullscreen",
    skipLayoutNotifications = false,
    skipScrollStateUpdates = false,
  } = opts
  const start = Date.now()

  using render = baseLog.span("pipeline", { width, height, mode })

  // Clear per-render caches
  clearBgConflictWarnings()

  // Phase 1: Measure (for fit-content nodes)
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

  // Phase 2.5: Scroll calculation (for overflow='scroll' containers)
  {
    using _scroll = render.span("scroll")
    scrollPhase(root, { skipStateUpdates: skipScrollStateUpdates })
  }

  // Phase 2.6: Screen rect calculation (screen-relative positions)
  {
    using _screenRect = render.span("screenRect")
    screenRectPhase(root)
  }

  // Phase 2.7: Notify layout subscribers
  // This runs AFTER screenRectPhase so useScreenRectCallback reads correct positions
  // Skip for static renders where no one will respond to the feedback
  if (!skipLayoutNotifications) {
    using _notify = render.span("notify")
    notifyLayoutSubscribers(root)
  }

  // Phase 3: Content render (incremental if we have prevBuffer)
  let buffer: TerminalBuffer
  {
    using _content = render.span("content")
    const t3 = Date.now()
    buffer = contentPhase(root, prevBuffer)
    log.debug?.(`content: ${Date.now() - t3}ms`)
  }

  // Phase 4: Diff and output
  let output: string
  {
    using outputSpan = render.span("output")
    const t4 = Date.now()
    output = outputPhase(prevBuffer, buffer, mode)
    outputSpan.spanData.bytes = output.length
    log.debug?.(`output: ${Date.now() - t4}ms (${output.length} bytes)`)
  }

  log.debug?.(`total pipeline: ${Date.now() - start}ms`)

  return { output, buffer }
}

// ============================================================================
// Execute Render (Adapter-aware)
// ============================================================================

import {
  type RenderBuffer,
  getRenderAdapter,
  hasRenderAdapter,
} from "../render-adapter.js"

/**
 * Execute the full render pipeline using the current RenderAdapter.
 *
 * This version works with any adapter (terminal, canvas, etc.) and returns
 * a RenderBuffer instead of a TerminalBuffer.
 *
 * @param root The root InkxNode
 * @param width Width in adapter units (cells for terminal, pixels for canvas)
 * @param height Height in adapter units
 * @param prevBuffer Previous buffer for diffing (null on first render)
 * @param options Render options
 * @returns Object with output (if any) and current buffer
 */
export function executeRenderAdapter(
  root: InkxNode,
  width: number,
  height: number,
  prevBuffer: RenderBuffer | null,
  options: ExecuteRenderOptions | "fullscreen" | "inline" = "fullscreen",
): { output: string | void; buffer: RenderBuffer } {
  if (!hasRenderAdapter()) {
    throw new Error("executeRenderAdapter called without a render adapter set")
  }

  const opts: ExecuteRenderOptions =
    typeof options === "string" ? { mode: options } : options
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
