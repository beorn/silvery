/**
 * Ag — tree + layout engine + renderer.
 *
 * The sole pipeline entry point. Two independent phases:
 * - ag.layout(dims) — measure + flexbox → positions/sizes
 * - ag.render() — positioned tree → cell grid → TextFrame
 *
 * The output phase (buffer → ANSI) is NOT part of ag — it lives in term.paint().
 *
 * @example
 * ```ts
 * const ag = createAg(root, { measurer })
 * ag.layout({ cols: 80, rows: 24 })
 * const { frame, buffer } = ag.render()
 * const output = term.paint(buffer, prevBuffer)
 * ```
 */

import { createLogger } from "loggily"
import type { AgNode, AgNodeType } from "@silvery/ag/types"
import { getRenderEpoch, INITIAL_EPOCH, ALL_RECONCILER_BITS, CONTENT_BIT, STYLE_PROPS_BIT } from "@silvery/ag/epoch"
import { getLayoutEngine } from "./layout-engine"
import type { TextFrame } from "@silvery/ag/text-frame"
import { type TerminalBuffer, createTextFrame } from "./buffer"
import { runWithMeasurer, type Measurer } from "./unicode"
import { measurePhase, fitContentCorrectionPass } from "./pipeline/measure-phase"
import {
  layoutPhase,
  scrollPhase,
  stickyPhase,
  scrollrectPhase,
  scrollrectPhaseSimple,
  notifyLayoutSubscribers,
  detectPipelineFeatures,
  strictLayoutOverflowCheck,
} from "./pipeline/layout-phase"
import { renderPhase, clearBgConflictWarnings } from "./pipeline/render-phase"
import { clearDirtyTracking, hasScrollDirty } from "@silvery/ag/dirty-tracking"
import type { PipelineContext } from "./pipeline/types"

const log = createLogger("silvery:render")
const baseLog = createLogger("@silvery/ag-react")

// =============================================================================
// Types
// =============================================================================

export interface AgLayoutOptions {
  skipLayoutNotifications?: boolean
  skipScrollStateUpdates?: boolean
}

export interface AgRenderOptions {
  /** Force fresh render — no incremental, doesn't update internal prevBuffer. */
  fresh?: boolean
  /** Override prevBuffer for this render (bypasses internal tracking). */
  prevBuffer?: TerminalBuffer | null
}

export interface AgRenderResult {
  /** Immutable TextFrame snapshot of the rendered output. */
  readonly frame: TextFrame
  /** Raw buffer for output-phase diffing. Internal — prefer frame for reading. */
  readonly buffer: TerminalBuffer
  /** Previous frame's buffer (null on first render). For output-phase diffing. */
  readonly prevBuffer: TerminalBuffer | null
}

export interface Ag {
  /** The root AgNode tree. */
  readonly root: AgNode

  // -------------------------------------------------------------------------
  // Pipeline
  // -------------------------------------------------------------------------

  /**
   * Run layout phases: measure → flexbox → scroll → sticky → scrollRect → notify.
   * Mutates layout nodes in place.
   */
  layout(dims: { cols: number; rows: number }, options?: AgLayoutOptions): void

  /**
   * Run the render phase: positioned tree → cell grid → TextFrame.
   * Uses internal prevBuffer for incremental rendering.
   * Returns frame (public read API) + buffer/prevBuffer (for output phase).
   */
  render(options?: AgRenderOptions): AgRenderResult

  /** Reset internal prevBuffer (call on resize — forces fresh render next frame). */
  resetBuffer(): void

  // -------------------------------------------------------------------------
  // Tree Mutation API (Phase 4)
  // -------------------------------------------------------------------------

  /** Create a new AgNode with a layout node. */
  createNode(type: AgNodeType, props: Record<string, unknown>): AgNode

  /** Insert child at index in both ag tree and layout tree. */
  insertChild(parent: AgNode, child: AgNode, index: number): void

  /** Remove child from both ag tree and layout tree. */
  removeChild(parent: AgNode, child: AgNode): void

  /** Update node props (applies to layout node if layout-affecting). */
  updateProps(node: AgNode, props: Record<string, unknown>, oldProps?: Record<string, unknown>): void

  /** Update text content on a node. */
  setText(node: AgNode, text: string): void

  /** Structural text representation (no layout). */
  toString(): string
}

export interface CreateAgOptions {
  /** Width measurer scoped to terminal capabilities. */
  measurer?: Measurer
}

// =============================================================================
// Factory
// =============================================================================

export function createAg(root: AgNode, options?: CreateAgOptions): Ag {
  const measurer = options?.measurer
  const ctx: PipelineContext | undefined = measurer ? { measurer } : undefined
  let _prevBuffer: TerminalBuffer | null = null

  // Feature flags — one-way: once true, stays true for the lifetime of this Ag.
  // This ensures dynamically mounted scroll/sticky components enable their phases
  // and never get skipped again.
  let hasScroll = false
  let hasSticky = false

  function doLayout(
    cols: number,
    rows: number,
    opts?: AgLayoutOptions,
  ): { tMeasure: number; tLayout: number; tScroll: number; tScrollRect: number; tNotify: number } {
    // Layout-on-demand gate: skip ALL layout phases when Flexily reports
    // no dirty nodes, no scroll offset changed, and dimensions haven't changed.
    // This eliminates ~38% of per-frame pipeline cost for cursor/style-only changes.
    // First render always has isDirty (Flexily nodes start dirty on creation).
    // scrollTo/scrollOffset changes don't affect Flexily (they don't change
    // dimensions) but DO need scroll/sticky/scrollRect/notify phases to run.
    const prevRootLayout = root.boxRect
    const dimensionsChanged = prevRootLayout && (prevRootLayout.width !== cols || prevRootLayout.height !== rows)
    if (!dimensionsChanged && !root.layoutNode?.isDirty() && !hasScrollDirty()) {
      log.debug?.("layout: skipped (Flexily clean, no scrollDirty, dimensions unchanged)")
      return { tMeasure: 0, tLayout: 0, tScroll: 0, tScrollRect: 0, tNotify: 0 }
    }

    using render = baseLog.span("pipeline", { width: cols, height: rows })

    let tMeasure: number
    {
      using _m = render.span("measure")
      const t = performance.now()
      measurePhase(root, ctx)
      tMeasure = performance.now() - t
      log.debug?.(`measure: ${tMeasure.toFixed(2)}ms`)
    }

    let tLayout: number
    {
      using _l = render.span("layout")
      const t = performance.now()
      layoutPhase(root, cols, rows)
      tLayout = performance.now() - t
      log.debug?.(`layout: ${tLayout.toFixed(2)}ms`)
    }

    // Post-layout correction: if fit-content/snug-content boxes overflow
    // their parent's computed width, clamp and re-run layout.
    if (fitContentCorrectionPass(root, ctx)) {
      layoutPhase(root, cols, rows)
    }

    // STRICT invariant: verify no child overflows its parent's inner width.
    // Catches fit-content/snug-content/measure-phase bugs at the source.
    strictLayoutOverflowCheck(root)

    // Detect features for phase skipping. One-way merge: false → true only.
    // This scan runs every layout pass to catch newly mounted components.
    if (!hasScroll || !hasSticky) {
      const features = detectPipelineFeatures(root)
      if (features.hasScroll) hasScroll = true
      if (features.hasSticky) hasSticky = true
    }

    let tScroll: number
    if (hasScroll) {
      using _s = render.span("scroll")
      const t = performance.now()
      scrollPhase(root, { skipStateUpdates: opts?.skipScrollStateUpdates })
      tScroll = performance.now() - t
    } else {
      tScroll = 0
    }

    if (hasSticky) {
      stickyPhase(root)
    }

    let tScrollRect: number
    {
      using _r = render.span("scrollRect")
      const t = performance.now()
      if (hasScroll || hasSticky) {
        scrollrectPhase(root)
      } else {
        // Fast path: no scroll offsets or sticky positions to account for.
        // scrollRect === boxRect, screenRect === scrollRect.
        scrollrectPhaseSimple(root)
      }
      tScrollRect = performance.now() - t
    }

    let tNotify = 0
    if (!opts?.skipLayoutNotifications) {
      using _n = render.span("notify")
      const t = performance.now()
      notifyLayoutSubscribers(root)
      tNotify = performance.now() - t
    }

    // Bench instrumentation: accumulate per-phase timings in a global counter
    // that a harness can read + reset between iterations. Cheap: five `+=` ops.
    // See __silvery_bench_accumulate / __silvery_bench_reset helpers below.
    const acc = (globalThis as any).__silvery_bench_phases
    if (acc) {
      acc.measure += tMeasure
      acc.layout += tLayout
      acc.scroll += tScroll
      acc.scrollRect += tScrollRect
      acc.notify += tNotify
      acc.layoutTotal += tMeasure + tLayout + tScroll + tScrollRect + tNotify
    }

    return { tMeasure, tLayout, tScroll, tScrollRect, tNotify }
  }

  function doRender(opts?: AgRenderOptions): AgRenderResult & { tContent: number } {
    clearBgConflictWarnings()
    const prevBuffer = opts?.fresh ? null : opts?.prevBuffer !== undefined ? opts.prevBuffer : _prevBuffer

    let tContent: number
    let buffer: TerminalBuffer
    {
      const t = performance.now()
      buffer = renderPhase(root, prevBuffer, ctx)
      tContent = performance.now() - t
      log.debug?.(`content: ${tContent.toFixed(2)}ms`)
    }

    // Only save for incremental — fresh renders (STRICT comparison) don't update state
    if (!opts?.fresh) {
      _prevBuffer = buffer
    }

    // Clear the module-level dirty tracking after each render pass.
    // Content dirty nodes were processed by renderPhase; layout dirty is
    // managed by Flexily internally (isDirty cleared after calculateLayout).
    clearDirtyTracking()

    // Bench instrumentation: accumulate content-phase timing.
    const acc = (globalThis as any).__silvery_bench_phases
    if (acc) {
      acc.content += tContent
      acc.renderCalls += 1
    }

    const frame = createTextFrame(buffer)
    return { frame, buffer, prevBuffer, tContent }
  }

  // -------------------------------------------------------------------------
  // Tree Mutation
  // -------------------------------------------------------------------------

  function agCreateNode(type: AgNodeType, props: Record<string, unknown>): AgNode {
    const engine = getLayoutEngine()
    const layoutNode = engine.createNode()
    return {
      type,
      props,
      children: [],
      parent: null,
      layoutNode,
      boxRect: null,
      scrollRect: null,
      screenRect: null,
      prevLayout: null,
      prevScrollRect: null,
      prevScreenRect: null,
      layoutChangedThisFrame: INITIAL_EPOCH,
      layoutDirty: false,
      dirtyBits: ALL_RECONCILER_BITS,
      dirtyEpoch: getRenderEpoch(),
      layoutSubscribers: new Set(),
    }
  }

  function agInsertChild(parent: AgNode, child: AgNode, index: number): void {
    // Remove from old parent if already in a tree (keyed reorder)
    if (child.parent) {
      agRemoveChild(child.parent, child)
    }

    // Insert into children array
    parent.children.splice(index, 0, child)
    child.parent = parent

    // Sync layout tree
    if (parent.layoutNode && child.layoutNode) {
      // Layout index = count of children with layoutNode before this position
      const layoutIndex = parent.children.slice(0, index).filter((c) => c.layoutNode !== null).length
      parent.layoutNode.insertChild(child.layoutNode, layoutIndex)
    }
  }

  function agRemoveChild(parent: AgNode, child: AgNode): void {
    const index = parent.children.indexOf(child)
    if (index === -1) return

    parent.children.splice(index, 1)

    if (parent.layoutNode && child.layoutNode) {
      parent.layoutNode.removeChild(child.layoutNode)
      child.layoutNode.free()
    }

    child.parent = null
  }

  return {
    root,

    // Pipeline
    layout(dims, options) {
      if (measurer) {
        runWithMeasurer(measurer, () => doLayout(dims.cols, dims.rows, options))
      } else {
        doLayout(dims.cols, dims.rows, options)
      }
    },

    render(options) {
      const result = measurer ? runWithMeasurer(measurer, () => doRender(options)) : doRender(options)
      return { frame: result.frame, buffer: result.buffer, prevBuffer: result.prevBuffer }
    },

    resetBuffer() {
      _prevBuffer = null
    },

    // Tree mutations
    createNode: agCreateNode,
    insertChild: agInsertChild,
    removeChild: agRemoveChild,

    updateProps(node, props, oldProps) {
      node.props = props
      if (node.layoutNode) {
        node.layoutNode.markDirty()
      }
    },

    setText(node, text) {
      ;(node as any).textContent = text
      const epoch = getRenderEpoch()
      const bits = CONTENT_BIT | STYLE_PROPS_BIT
      node.dirtyBits = node.dirtyEpoch !== epoch ? bits : node.dirtyBits | bits
      node.dirtyEpoch = epoch
      if (node.layoutNode) {
        node.layoutNode.markDirty()
      }
    },

    toString() {
      return `[Ag root=${root.type} children=${root.children.length}]`
    },
  }
}
