/**
 * Adapter-aware render pipeline.
 *
 * Runs the full measure → layout → scroll → render → flush pipeline
 * using the current RenderAdapter (terminal, canvas, DOM, etc.).
 *
 * Split out from pipeline/index.ts — the adapter path orchestrates
 * phases directly (no createAg) since it uses renderPhaseAdapter
 * and RenderBuffer instead of the terminal-specific renderPhase.
 */

import { createLogger } from "loggily"
import type { AgNode } from "@silvery/ag/types"
import type { ExecuteRenderOptions } from "./index"
import { type RenderBuffer, getRenderAdapter, hasRenderAdapter } from "../render-adapter"
import { renderPhaseAdapter } from "./render-phase-adapter"
import { clearBgConflictWarnings } from "./render-phase"
import {
  layoutPhase,
  notifyLayoutSubscribers,
  scrollrectPhase,
  scrollPhase,
  stickyPhase,
} from "./layout-phase"
import { measurePhase, fitContentCorrectionPass } from "./measure-phase"

const log = createLogger("silvery:render")
const baseLog = createLogger("@silvery/ag-react")

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

  using render = baseLog.span?.("pipeline-adapter", {
    width,
    height,
    adapter: adapter.name,
  })

  // Clear per-render caches
  clearBgConflictWarnings()

  // Phase 1: Measure
  {
    using _measure = render?.span("measure")
    measurePhase(root)
    log.debug?.(`measure phase complete`)
  }

  // Phase 2: Layout
  {
    using _layout = render?.span("layout")
    layoutPhase(root, width, height)
    log.debug?.(`layout phase complete`)
  }

  // Phase 2.1: Fit-content correction (post-layout)
  // After flex resolves parent widths, re-check fit-content/snug-content
  // nodes that overflow their parent. If any are found, clamp and re-layout.
  if (fitContentCorrectionPass(root)) {
    layoutPhase(root, width, height)
  }

  // Phase 2.5: Scroll calculation
  {
    using _scroll = render?.span("scroll")
    scrollPhase(root)
  }

  // Phase 2.55: Sticky phase (non-scroll container sticky children)
  stickyPhase(root)

  // Phase 2.6: Screen rect calculation
  {
    using _scrollrect = render?.span("scrollRect")
    scrollrectPhase(root)
  }

  // Phase 2.7: Notify layout subscribers
  if (!skipLayoutNotifications) {
    using _notify = render?.span("notify")
    notifyLayoutSubscribers(root)
  }

  // Phase 3: Content render (adapter-aware)
  let buffer: RenderBuffer
  {
    using _content = render?.span("content")
    buffer = renderPhaseAdapter(root)
    log.debug?.(`content phase complete`)
  }

  // Phase 4: Flush via adapter
  let output: string | void
  {
    using outputSpan = render?.span("output")
    output = adapter.flush(buffer, prevBuffer)
    if (typeof output === "string" && outputSpan) {
      outputSpan.spanData.bytes = output.length
    }
    log.debug?.(`output phase complete`)
  }

  log.debug?.(`total pipeline: ${Date.now() - start}ms`)

  return { output, buffer }
}
