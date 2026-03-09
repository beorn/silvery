/**
 * Phase 3: Content Phase
 *
 * Render all nodes to a terminal buffer.
 *
 * This module orchestrates the rendering process by traversing the node tree
 * and delegating to specialized rendering functions for boxes and text.
 *
 * Layout (top-down):
 *   contentPhase → renderNodeToBuffer → renderScrollContainerChildren
 *                                     → renderNormalChildren
 *   Helpers: clearDirtyFlags, hasChildPositionChanged, computeChildClipBounds
 *   Region clearing: findInheritedBg, clearNodeRegion, clippedFill
 */

import type { Color } from "../buffer"
import { TerminalBuffer } from "../buffer"
import type { BoxProps, TeaNode, TextProps } from "@silvery/tea/types"
import { getBorderSize, getPadding } from "./helpers"
import { renderBox, renderOutline, renderScrollIndicators } from "./render-box"
import { parseColor } from "./render-helpers"
import { clearBgConflictWarnings, renderText, setBgConflictMode } from "./render-text"
import { pushContextTheme, popContextTheme } from "swatch"
import type { Theme } from "swatch"
import type { ClipBounds, ContentPhaseStats, NodeRenderState, NodeTraceEntry, PipelineContext } from "./types"

/**
 * Render all nodes to a terminal buffer.
 *
 * @param root The root SilveryNode
 * @param prevBuffer Previous buffer for incremental rendering (optional)
 * @returns A TerminalBuffer with the rendered content
 */
export function contentPhase(root: TeaNode, prevBuffer?: TerminalBuffer | null, ctx?: PipelineContext): TerminalBuffer {
  const layout = root.contentRect
  if (!layout) {
    throw new Error("contentPhase called before layout phase")
  }

  // Resolve instrumentation from ctx (if provided) or module-level globals
  const instrumentEnabled = ctx?.instrumentEnabled ?? _instrumentEnabled
  const stats = ctx?.stats ?? _contentPhaseStats
  const nodeTrace = ctx?.nodeTrace ?? _nodeTrace
  const nodeTraceEnabled = ctx?.nodeTraceEnabled ?? _nodeTraceEnabled

  // Clone prevBuffer if same dimensions, else create fresh
  const hasPrevBuffer = prevBuffer && prevBuffer.width === layout.width && prevBuffer.height === layout.height

  if (instrumentEnabled) {
    _contentPhaseCallCount++
    stats._prevBufferNull = prevBuffer == null ? 1 : 0
    stats._prevBufferDimMismatch = prevBuffer && !hasPrevBuffer ? 1 : 0
    stats._hasPrevBuffer = hasPrevBuffer ? 1 : 0
    stats._layoutW = layout.width
    stats._layoutH = layout.height
    stats._prevW = prevBuffer?.width ?? 0
    stats._prevH = prevBuffer?.height ?? 0
    stats._callCount = _contentPhaseCallCount
  }

  const t0 = instrumentEnabled ? performance.now() : 0
  const buffer = hasPrevBuffer ? prevBuffer.clone() : new TerminalBuffer(layout.width, layout.height)
  const tClone = instrumentEnabled ? performance.now() - t0 : 0

  const t1 = instrumentEnabled ? performance.now() : 0
  renderNodeToBuffer(
    root,
    buffer,
    { scrollOffset: 0, clipBounds: undefined, hasPrevBuffer: !!hasPrevBuffer, ancestorCleared: false },
    ctx,
  )
  const tRender = instrumentEnabled ? performance.now() - t1 : 0

  if (instrumentEnabled) {
    // Expose sub-phase timing for profiling
    const snap = {
      clone: tClone,
      render: tRender,
      ...structuredClone(stats),
    }
    ;(globalThis as any).__silvery_content_detail = snap
    const arr = ((globalThis as any).__silvery_content_all ??= [] as (typeof snap)[])
    arr.push(snap)
    for (const key of Object.keys(stats) as (keyof ContentPhaseStats)[]) {
      ;(stats as any)[key] = 0
    }
    stats.cascadeMinDepth = 999
    stats.cascadeNodes = ""
    stats.scrollClearReason = ""
    stats.normalRepaintReason = ""
  }

  // Export node trace for SILVERY_STRICT diagnosis
  if (nodeTraceEnabled && nodeTrace.length > 0) {
    const traceArr = ((globalThis as any).__silvery_node_trace ??= [] as NodeTraceEntry[][])
    traceArr.push([...nodeTrace])
    nodeTrace.length = 0
  }

  // Sync prevLayout after content phase to prevent staleness on subsequent frames.
  // Without this, prevLayout stays at the old value from propagateLayout, causing
  // hasChildPositionChanged and clearExcessArea to use stale coordinates.
  syncPrevLayout(root)

  return buffer
}

/**
 * Sync prevLayout to contentRect for all nodes in the tree.
 *
 * Called at the end of each contentPhase pass. This prevents:
 * 1. The O(N) staleness bug where prevLayout drifts from contentRect
 *    causing !rectEqual to always be true on subsequent frames.
 * 2. Stale old-bounds references in clearExcessArea on doRender iteration 2+.
 * 3. Asymmetry between incremental and fresh renders — doFreshRender's layout
 *    phase syncs prevLayout before content, so without this, the real render
 *    has null/stale prevLayout while fresh has synced prevLayout, causing
 *    different cascade behavior (layoutChanged true vs false).
 */
function syncPrevLayout(node: TeaNode): void {
  node.prevLayout = node.contentRect
  for (const child of node.children) {
    syncPrevLayout(child)
  }
}

/** Instrumentation enabled when SILVERY_STRICT, SILVERY_CHECK_INCREMENTAL, or SILVERY_INSTRUMENT is set */
const _instrumentEnabled =
  typeof process !== "undefined" &&
  !!(process.env?.SILVERY_STRICT || process.env?.SILVERY_CHECK_INCREMENTAL || process.env?.SILVERY_INSTRUMENT)

/** Mutable stats counters — reset after each contentPhase call */
const _contentPhaseStats: ContentPhaseStats = {
  nodesVisited: 0,
  nodesRendered: 0,
  nodesSkipped: 0,
  textNodes: 0,
  boxNodes: 0,
  clearOps: 0,
  noPrevBuffer: 0,
  flagContentDirty: 0,
  flagPaintDirty: 0,
  flagLayoutChanged: 0,
  flagSubtreeDirty: 0,
  flagChildrenDirty: 0,
  flagChildPositionChanged: 0,
  scrollContainerCount: 0,
  scrollViewportCleared: 0,
  scrollClearReason: "",
  normalChildrenRepaint: 0,
  normalRepaintReason: "",
  cascadeMinDepth: 999,
  cascadeNodes: "",
  _prevBufferNull: 0,
  _prevBufferDimMismatch: 0,
  _hasPrevBuffer: 0,
  _layoutW: 0,
  _layoutH: 0,
  _prevW: 0,
  _prevH: 0,
  _callCount: 0,
}

let _contentPhaseCallCount = 0

/** Module-level node trace (fallback when ctx.nodeTrace is not provided) */
const _nodeTrace: NodeTraceEntry[] = []
const _nodeTraceEnabled =
  typeof process !== "undefined" && !!(process.env?.SILVERY_STRICT || process.env?.SILVERY_CHECK_INCREMENTAL)

/** DIAG: compute node depth in tree */
function _getNodeDepth(node: TeaNode): number {
  let depth = 0
  let n: TeaNode | null = node.parent
  while (n) {
    depth++
    n = n.parent
  }
  return depth
}

// Re-export for consumers who need to clear bg conflict warnings
export { clearBgConflictWarnings, setBgConflictMode }

// ============================================================================
// Core Rendering
// ============================================================================

/**
 * Render a single node to the buffer.
 */
function renderNodeToBuffer(
  node: TeaNode,
  buffer: TerminalBuffer,
  nodeState: NodeRenderState,
  ctx?: PipelineContext,
): void {
  const { scrollOffset, clipBounds, hasPrevBuffer, ancestorCleared } = nodeState
  // Resolve instrumentation from ctx or module globals
  const instrumentEnabled = ctx?.instrumentEnabled ?? _instrumentEnabled
  const stats = ctx?.stats ?? _contentPhaseStats
  const nodeTrace = ctx?.nodeTrace ?? _nodeTrace
  const nodeTraceEnabled = ctx?.nodeTraceEnabled ?? _nodeTraceEnabled
  if (instrumentEnabled) stats.nodesVisited++
  const layout = node.contentRect
  if (!layout) return

  // Skip nodes without Yoga (raw text and virtual text nodes)
  // Their content is rendered by their parent silvery-text via collectTextContent()
  if (!node.layoutNode) {
    // Clear dirty flags so markSubtreeDirty() can propagate future updates.
    // Without this, virtual text children keep stale subtreeDirty=true from
    // creation, causing markSubtreeDirty to stop early and never reach the
    // layout ancestor — producing 0-byte diffs on text content changes.
    clearVirtualTextFlags(node)
    return
  }

  // Skip hidden nodes (Suspense support)
  // When a Suspense boundary shows a fallback, the hidden subtree is not rendered
  if (node.hidden) return

  const props = node.props as BoxProps & TextProps

  // Skip display="none" nodes - they have 0x0 dimensions and shouldn't render
  // Also skip their children since the entire subtree is hidden
  if (props.display === "none") return

  // Skip nodes entirely off-screen (viewport clipping).
  // The scroll container's VirtualList already handles most culling, but this
  // catches any remaining nodes rendered below/above the visible area.
  //
  // IMPORTANT: Don't clear dirty flags on nodes that were never rendered.
  // Just skip them and leave their flags intact so they render correctly
  // when scrolled into view.
  //
  // Why this matters: clearDirtyFlags on off-screen nodes prevents them from
  // rendering when they later become visible:
  // 1. Node off-screen → clearDirtyFlags → all flags false
  // 2. Scroll brings node on-screen with hasPrevBuffer=true
  // 3. skipFastPath = true (all flags clean) → node SKIPPED
  // 4. Buffer has stale/blank pixels → blank content visible
  //
  // By preserving dirty flags, the node forces rendering when it enters
  // the visible area. The subtreeDirty flag on ancestors is maintained
  // because we don't clear it — markSubtreeDirty() already set it during
  // reconciliation/layout, and not clearing here preserves that signal.
  const screenY = layout.y - scrollOffset
  if (screenY >= buffer.height || screenY + layout.height <= 0) {
    return
  }

  // FAST PATH: Skip entire subtree if unchanged and we have a previous buffer
  // The buffer was cloned from prevBuffer, so skipped nodes keep their rendered output
  //
  // layoutChanged: did this node's layout position/size change?
  // Uses layoutChangedThisFrame (set by propagateLayout in layout phase) instead of
  // the stale !rectEqual(prevLayout, contentRect). The rect comparison is asymmetric
  // between incremental and fresh renders: doFreshRender's layout phase syncs
  // prevLayout=contentRect before content, making layoutChanged=false, while the
  // real render may have prevLayout=null (new nodes), making layoutChanged=true.
  // This asymmetry causes contentAreaAffected→clearNodeRegion to fire in incremental
  // but not fresh, wiping sibling content. layoutChangedThisFrame is symmetric.
  const layoutChanged = node.layoutChangedThisFrame

  // Check if any child shifted position (sibling shift from size changes).
  // Gap space between children belongs to this container, so must re-render.
  const childPositionChanged = hasPrevBuffer && !layoutChanged && hasChildPositionChanged(node)

  // FAST PATH: Skip unchanged subtrees when we have a valid previous buffer.
  // The cloned buffer already has correct pixels for clean nodes.
  // SILVERY_STRICT=1 verifies this by comparing incremental vs fresh renders.
  const skipFastPath =
    hasPrevBuffer &&
    !node.contentDirty &&
    !node.paintDirty &&
    !layoutChanged &&
    !node.subtreeDirty &&
    !node.childrenDirty &&
    !childPositionChanged

  // Node ID for tracing (only trace named nodes to keep compact)
  const _nodeId = instrumentEnabled ? ((props.id as string | undefined) ?? "") : ""
  const _traceThis = instrumentEnabled && nodeTraceEnabled && _nodeId

  if (skipFastPath) {
    if (instrumentEnabled) {
      stats.nodesSkipped++
      if (_traceThis) {
        nodeTrace.push({
          id: _nodeId,
          type: node.type,
          depth: _getNodeDepth(node),
          rect: `${layout.x},${layout.y} ${layout.width}x${layout.height}`,
          prevLayout: node.prevLayout
            ? `${node.prevLayout.x},${node.prevLayout.y} ${node.prevLayout.width}x${node.prevLayout.height}`
            : "null",
          hasPrev: hasPrevBuffer,
          ancestorCleared,
          flags: "",
          decision: "SKIPPED",
          layoutChanged,
        })
      }
    }
    clearDirtyFlags(node)
    return
  }
  if (instrumentEnabled) {
    stats.nodesRendered++
    if (!hasPrevBuffer) stats.noPrevBuffer++
    if (node.contentDirty) stats.flagContentDirty++
    if (node.paintDirty) stats.flagPaintDirty++
    if (layoutChanged) stats.flagLayoutChanged++
    if (node.subtreeDirty) stats.flagSubtreeDirty++
    if (node.childrenDirty) stats.flagChildrenDirty++
    if (childPositionChanged) stats.flagChildPositionChanged++
  }

  // Push per-subtree theme override (if this Box has a theme prop).
  // Placed after all early returns and fast-path skip — only active during
  // actual rendering. Popped at the end of this function after all child passes.
  const nodeTheme = (props as BoxProps).theme as Theme | undefined
  if (nodeTheme) pushContextTheme(nodeTheme)

  // Check if this is a scrollable container
  const isScrollContainer = props.overflow === "scroll" && node.scrollState

  // Does this node's OWN visual state need re-rendering?
  // True when content/style changed, children restructured, or layout shifted.
  // (Not true for subtreeDirty alone — that only means descendants changed.)
  //
  // Why paintDirty: measure phase may clear contentDirty for its text-collection
  // cache, so paintDirty acts as a surviving witness that style props changed.
  // Why this matters: when backgroundColor changes from "cyan" to undefined,
  // paintDirty ensures we clear stale pixels from the cloned buffer.
  // needsOwnRepaint = node.contentDirty || node.paintDirty || node.childrenDirty || layoutChanged || childPositionChanged

  // contentAreaAffected: did this node's CONTENT AREA change (not just border)?
  // Excludes border-only paint changes for BOX nodes: renderBox only draws border
  // chars at edges, content area pixels are untouched. This avoids cascading ~200
  // node re-renders per Card on cursor move (borderColor changes yellow↔blackBright
  // but content area is unchanged).
  //
  // For TEXT nodes, paintDirty IS included because text nodes have no borders —
  // any paint change (color, bold, inverse, or text content change) affects the
  // content area. The measure phase clears contentDirty for its text-collection
  // cache, so paintDirty acts as the surviving witness that the text node's
  // content area changed and needs region clearing. Without this, stale pixels
  // (e.g., cursor inverse attribute) persist when text content changes but
  // layout dimensions stay the same.
  //
  // Uses bgDirty (set by reconciler when backgroundColor specifically changes) rather
  // than checking current props.backgroundColor — catches bg removal (cyan → undefined)
  // where current value is falsy but stale pixels must still be cleared.
  const textPaintDirty = node.type === "silvery-text" && node.paintDirty

  // absoluteChildMutated: an absolute child had its children added/removed/reordered,
  // or its layout changed. In the two-pass rendering model (normal-flow first, absolute
  // second), the cloned buffer contains BOTH first-pass content AND stale overlay pixels
  // from the previous frame. When an absolute child's content structure changes (e.g.,
  // a dialog unmounts), its old pixels persist at positions not covered by any current
  // child. By including this in contentAreaAffected, the parent clears its region
  // (removing stale overlay pixels in gap areas) and forces normal-flow children to
  // re-render on the cleared background — matching fresh render behavior.
  //
  // Only checked when hasPrevBuffer (incremental mode) and subtreeDirty (a descendant
  // changed somewhere). The scan is cheap: only direct children are checked.
  const absoluteChildMutated =
    hasPrevBuffer &&
    node.subtreeDirty &&
    node.children !== undefined &&
    node.children.some((child) => {
      const cp = child.props as BoxProps
      return (
        cp.position === "absolute" &&
        (child.childrenDirty || child.layoutChangedThisFrame || hasChildPositionChanged(child))
      )
    })

  const contentAreaAffected =
    node.contentDirty ||
    layoutChanged ||
    childPositionChanged ||
    node.childrenDirty ||
    node.bgDirty ||
    textPaintDirty ||
    absoluteChildMutated

  // subtreeDirtyWithBg: a descendant changed inside a Box with backgroundColor.
  // When a child Text shrinks, trailing chars from the old longer text survive in
  // the cloned buffer. The parent's bg fill must re-run to clear them, and children
  // must re-render on top of the fresh fill. This is NOT added to contentAreaAffected
  // because non-bg boxes don't need region clearing for subtreeDirty — only bg-bearing
  // boxes need their fill to overwrite stale child pixels.
  const subtreeDirtyWithBg = hasPrevBuffer && !contentAreaAffected && node.subtreeDirty && !!props.backgroundColor

  // Clear this node's region when its content area changed but has no backgroundColor.
  // Without bg, renderBox won't fill, so stale pixels from the cloned buffer
  // remain visible. We must explicitly clear with inherited bg.
  //
  // Gated on (hasPrevBuffer || ancestorCleared) because:
  // - hasPrevBuffer=true: buffer is a clone with stale pixels
  // - ancestorCleared=true: buffer is a clone but hasPrevBuffer=false was passed
  //   (ancestor cleared its region, but this node may need to clear its sub-region)
  // On a truly fresh buffer (first render), both are false — no wasteful clear.
  const parentRegionCleared = (hasPrevBuffer || ancestorCleared) && contentAreaAffected && !props.backgroundColor

  // skipBgFill: in incremental mode, skip the bg fill when the cloned buffer
  // already has the correct bg at this node's position. That's ONLY when:
  // - hasPrevBuffer=true (buffer is a clone with previous frame's pixels)
  // - ancestorCleared=false (no ancestor erased our region)
  // - contentAreaAffected=false (no content-area changes)
  // - subtreeDirtyWithBg=false (no descendant change requiring bg refresh)
  //
  // Uses contentAreaAffected (not needsOwnRepaint) because border-only changes
  // (paintDirty without bgDirty) don't change the bg fill — the cloned buffer
  // already has the correct bg. Using needsOwnRepaint here caused bg fill to
  // wipe child content on borderColor changes, while parentRegionChanged=false
  // (from contentAreaAffected) prevented children from re-rendering to restore it.
  //
  // When ancestorCleared=true, the buffer at our position was erased to the
  // inherited bg, NOT our bg — so we must re-fill.
  // When hasPrevBuffer=false AND ancestorCleared=false, it's a fresh render.
  const skipBgFill = hasPrevBuffer && !ancestorCleared && !contentAreaAffected && !subtreeDirtyWithBg

  // parentRegionChanged: this node's content area was modified on a cloned buffer.
  // Children must re-render (childHasPrev=false) because their pixels may be stale.
  const parentRegionChanged = (hasPrevBuffer || ancestorCleared) && (contentAreaAffected || subtreeDirtyWithBg)

  // DIAG: Per-node trace and cascade tracking (gated on instrumentation)
  if (instrumentEnabled) {
    if (_traceThis) {
      const flagStr = [
        node.contentDirty && "C",
        node.paintDirty && "P",
        node.bgDirty && "B",
        node.subtreeDirty && "S",
        node.childrenDirty && "Ch",
        childPositionChanged && "CP",
      ]
        .filter(Boolean)
        .join(",")
      const childrenNeedRepaint_ = node.childrenDirty || childPositionChanged || parentRegionChanged
      const childHasPrev_ = childrenNeedRepaint_ ? false : hasPrevBuffer
      const childAncestorCleared_ = parentRegionCleared || ancestorCleared
      nodeTrace.push({
        id: _nodeId,
        type: node.type,
        depth: _getNodeDepth(node),
        rect: `${layout.x},${layout.y} ${layout.width}x${layout.height}`,
        prevLayout: node.prevLayout
          ? `${node.prevLayout.x},${node.prevLayout.y} ${node.prevLayout.width}x${node.prevLayout.height}`
          : "null",
        hasPrev: hasPrevBuffer,
        ancestorCleared,
        flags: flagStr,
        decision: "RENDER",
        layoutChanged,
        contentAreaAffected,
        parentRegionCleared,
        parentRegionChanged,
        childHasPrev: childHasPrev_,
        childAncestorCleared: childAncestorCleared_,
        skipBgFill,
        bgColor: props.backgroundColor as string | undefined,
      })
    }
    if (parentRegionChanged && node.children.length > 0) {
      const depth = _getNodeDepth(node)
      if (depth < stats.cascadeMinDepth) {
        stats.cascadeMinDepth = depth
      }
      const id = (node.props as Record<string, unknown>).id ?? node.type
      const flags = [
        node.contentDirty && "C",
        node.paintDirty && "P",
        node.childrenDirty && "Ch",
        layoutChanged && "L",
        childPositionChanged && "CP",
      ]
        .filter(Boolean)
        .join("")
      const entry = `${id}@${depth}[${flags}:${node.children.length}ch]`
      stats.cascadeNodes += (stats.cascadeNodes ? " " : "") + entry
    }
  }

  if (parentRegionCleared) {
    if (instrumentEnabled) stats.clearOps++
    clearNodeRegion(node, buffer, layout, scrollOffset, clipBounds, layoutChanged)
  } else if (layoutChanged && node.prevLayout) {
    // Even when parentRegionCleared is false, a shrinking node needs its excess
    // area cleared. Key scenario: absolute-positioned overlays (e.g., search dialog)
    // that shrink while normal-flow siblings are dirty — forceRepaint sets
    // hasPrevBuffer=false + ancestorCleared=false, making parentRegionCleared=false,
    // but the cloned buffer still has stale pixels from the old larger layout.
    // Also applies to nodes WITH backgroundColor: renderBox fills only the NEW
    // (smaller) region, leaving stale pixels in the excess area.
    clearExcessArea(node, buffer, layout, scrollOffset, clipBounds, layoutChanged)
  }

  // Compute inherited bg once for boxes — used by border and outline rendering
  // to preserve parent backgrounds on border cells (prevents transparent holes).
  const boxInheritedBg = node.type === "silvery-box" && !props.backgroundColor ? findInheritedBg(node).color : undefined

  // Render based on node type
  if (node.type === "silvery-box") {
    if (instrumentEnabled) stats.boxNodes++
    renderBox(node, buffer, layout, props, nodeState, skipBgFill, boxInheritedBg)
  } else if (node.type === "silvery-text") {
    if (instrumentEnabled) stats.textNodes++
    // Pass inherited bg/fg from nearest ancestor with backgroundColor/color.
    // This decouples text inheritance from buffer state, which is critical
    // for incremental rendering: getCellBg on a cloned buffer may return stale
    // bg at positions outside the parent's bg-filled region (overflow text).
    // Foreground inheritance matches CSS semantics: Box color cascades to Text children.
    const textInheritedBg = findInheritedBg(node).color
    const textInheritedFg = findInheritedFg(node)
    renderText(node, buffer, layout, props, nodeState, textInheritedBg, textInheritedFg, ctx)
  }

  // Render children
  if (isScrollContainer) {
    renderScrollContainerChildren(node, buffer, props, nodeState, parentRegionCleared, parentRegionChanged, ctx)

    // Render overflow indicators AFTER children so they survive viewport clear.
    // renderScrollContainerChildren may clear the viewport (Tier 2) which would
    // overwrite indicators drawn before children.
    renderScrollIndicators(node, buffer, layout, props, node.scrollState!, ctx)
  } else {
    renderNormalChildren(
      node,
      buffer,
      props,
      nodeState,
      childPositionChanged,
      parentRegionCleared,
      parentRegionChanged,
      ctx,
    )
  }

  // Render outline AFTER children — outline overlaps content at edges
  if (node.type === "silvery-box" && props.outlineStyle) {
    const { x, width, height } = layout
    const y = layout.y - scrollOffset
    renderOutline(buffer, x, y, width, height, props, clipBounds, boxInheritedBg)
  }

  // Clear dirty flags
  node.contentDirty = false
  node.paintDirty = false
  node.bgDirty = false
  node.subtreeDirty = false
  node.childrenDirty = false
  node.layoutChangedThisFrame = false

  // Pop per-subtree theme override (after ALL child passes including absolute/sticky)
  if (nodeTheme) popContextTheme()
}

/**
 * Render children of a scroll container with proper clipping and offset.
 */
function renderScrollContainerChildren(
  node: TeaNode,
  buffer: TerminalBuffer,
  props: BoxProps,
  nodeState: NodeRenderState,
  parentRegionCleared = false,
  parentRegionChanged = false,
  ctx?: PipelineContext,
): void {
  const { clipBounds, hasPrevBuffer, ancestorCleared } = nodeState
  // Resolve instrumentation from ctx or module globals
  const instrumentEnabled = ctx?.instrumentEnabled ?? _instrumentEnabled
  const stats = ctx?.stats ?? _contentPhaseStats
  const layout = node.contentRect
  const ss = node.scrollState
  if (!layout || !ss) return

  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
  const padding = getPadding(props)
  // Scroll containers clip vertically (for scrolling) but NOT horizontally.
  // Horizontal clipping is only for overflow="hidden" containers (e.g., HVL).
  const childClipBounds = computeChildClipBounds(layout, props, clipBounds, 0, /* horizontal */ false)

  // Determine if scroll offset changed since last render.
  const scrollOffsetChanged = ss.offset !== ss.prevOffset

  // Three-tier strategy for scroll container updates:
  //
  // 1. Buffer shift (scrollOnly): scroll offset changed but nothing else.
  //    Shift buffer contents by scroll delta, then re-render only newly
  //    visible children. Previously visible children keep their shifted pixels.
  //    This avoids re-rendering the entire viewport on every scroll.
  //
  // 2. Full viewport clear: children restructured or parent region changed.
  //    Must clear viewport and re-render all visible children.
  //    NOTE: subtreeDirty alone does NOT require viewport clear — dirty
  //    descendants handle their own region clearing. Clearing for subtreeDirty
  //    caused a 12ms regression (re-rendering ~50 children vs 2 dirty ones).
  //
  // 3. No clear needed: only subtreeDirty (some descendants changed).
  //    Children use hasPrevBuffer=true and skip via fast-path if clean.
  //
  // IMPORTANT: Buffer shift is unsafe when sticky children exist. Sticky
  // children render in a second pass that overwrites first-pass content.
  // After a shift, these overwritten pixels corrupt items at new positions
  // that skip rendering (hasPrevBuffer=true, no dirty flags). Fall back
  // to full viewport clear (tier 2) when sticky children are present.
  const hasStickyChildren = !!(ss.stickyChildren && ss.stickyChildren.length > 0)
  // Detect when visible range changed (items became hidden or newly visible).
  // When lastVisibleChild decreases, stale pixels from now-hidden items remain
  // in the cloned buffer and must be cleared.
  const visibleRangeChanged =
    ss.firstVisibleChild !== ss.prevFirstVisibleChild || ss.lastVisibleChild !== ss.prevLastVisibleChild
  const scrollOnly =
    hasPrevBuffer &&
    scrollOffsetChanged &&
    !node.childrenDirty &&
    !parentRegionChanged &&
    !hasStickyChildren &&
    !visibleRangeChanged
  const needsViewportClear =
    hasPrevBuffer &&
    !scrollOnly &&
    (scrollOffsetChanged || node.childrenDirty || parentRegionChanged || visibleRangeChanged)

  if (instrumentEnabled) {
    stats.scrollContainerCount++
    if (needsViewportClear || scrollOnly) {
      stats.scrollViewportCleared++
      const reasons: string[] = []
      if (scrollOnly) reasons.push("SHIFT")
      if (scrollOffsetChanged) reasons.push(`scrollOffset(${ss.prevOffset}->${ss.offset})`)
      if (node.childrenDirty) reasons.push("childrenDirty")
      if (parentRegionChanged) reasons.push("parentRegionChanged")
      reasons.push(
        `vp=${ss.viewportHeight} content=${ss.contentHeight} vis=${ss.firstVisibleChild}-${ss.lastVisibleChild}`,
      )
      stats.scrollClearReason = reasons.join("+")
    }
  }

  // Compute viewport geometry (shared by both paths)
  const clearY = childClipBounds.top
  const clearHeight = childClipBounds.bottom - childClipBounds.top
  const contentX = layout.x + border.left + padding.left
  const contentWidth = layout.width - border.left - border.right - padding.left - padding.right
  const scrollBg =
    needsViewportClear || scrollOnly
      ? props.backgroundColor
        ? parseColor(props.backgroundColor)
        : findInheritedBg(node).color
      : null

  // Buffer shift: shift viewport contents instead of full clear.
  // After shift, previously-visible children's pixels are at correct positions.
  // Exposed rows (top/bottom edge) are filled with scrollBg (null = no bg).
  const scrollDelta = ss.offset - (ss.prevOffset ?? ss.offset)
  if (scrollOnly && clearHeight > 0) {
    // Clear scroll indicator rows before shifting. Borderless scroll indicators
    // (overflowIndicator) paint a full-width bar (fg=15/bg=8) on the first/last
    // content rows. Children may be narrower than the indicator bar, so after a
    // shift, stale indicator pixels at the edges (columns not covered by children)
    // persist and cause incremental vs fresh render mismatches.
    // Clearing these rows to scrollBg before the shift ensures the shift carries
    // correct bg. The indicators are re-rendered after children by
    // renderScrollIndicators.
    const showBorderless = props.overflowIndicator === true
    if (showBorderless && !border.top && !border.bottom) {
      const topIndicatorY = clearY
      const bottomIndicatorY = clearY + clearHeight - 1
      if (ss.prevOffset != null && ss.prevOffset > 0) {
        // Previous frame had items hidden above → top indicator was showing
        buffer.fill(contentX, topIndicatorY, contentWidth, 1, { char: " ", bg: scrollBg })
      }
      // Previous frame had items hidden below → bottom indicator was showing
      // (safe to always clear bottom row since it will be re-rendered)
      buffer.fill(contentX, bottomIndicatorY, contentWidth, 1, { char: " ", bg: scrollBg })
    }
    buffer.scrollRegion(contentX, clearY, contentWidth, clearHeight, scrollDelta, { char: " ", bg: scrollBg })
  }

  // Full viewport clear (tier 2)
  if (needsViewportClear && clearHeight > 0) {
    buffer.fill(contentX, clearY, contentWidth, clearHeight, {
      char: " ",
      bg: scrollBg,
    })
  }

  // Determine per-child hasPrev and ancestorCleared.
  // - scrollOnly: per-child based on previous visibility
  // - needsViewportClear: all false (full re-render)
  // - otherwise: preserve parent's hasPrevBuffer
  const defaultChildHasPrev = needsViewportClear ? false : hasPrevBuffer
  const defaultChildAncestorCleared = needsViewportClear ? true : ancestorCleared || parentRegionCleared

  // For buffer shift: children that were fully visible in BOTH the previous
  // and current frames have correct pixels after the shift (childHasPrev=true).
  // Newly visible children need full rendering (childHasPrev=false).
  const prevVisTop = ss.prevOffset ?? ss.offset
  const prevVisBottom = prevVisTop + ss.viewportHeight

  // When sticky children exist and we're in tier 3 (subtreeDirty only, no
  // viewport clear), force ALL first-pass items to re-render. This is needed
  // because sticky headers render in a second pass where Text inherits bg from
  // the buffer via getCellBg (render-text.ts:600). On a fresh render, the buffer
  // has correct first-pass content. On incremental renders, the cloned buffer may
  // have stale bg from PREVIOUS frames' sticky headers at various positions —
  // both current AND former sticky positions. Forcing all items to re-render
  // ensures the buffer matches fresh render state before the sticky pass.
  //
  // Performance: this re-renders all visible items (~20-50) instead of just
  // dirty ones (~2-3). Only applies to scroll containers with sticky children
  // in tier 3 (not tier 1/2 which already handle this via shift/viewport clear).
  const stickyForceRefresh = hasStickyChildren && hasPrevBuffer && !needsViewportClear

  // Full viewport clear for sticky containers: clear to blank (bg=null) to
  // match fresh buffer state. The cloned buffer has stale sticky header content
  // from previous frames at positions that may have moved. Pre-clearing only
  // current sticky positions is insufficient because Text nodes at ANY position
  // inherit bg via getCellBg (render-text.ts:600) — stale bg from old sticky
  // positions leaks through. Clearing the entire viewport ensures Text reads
  // null bg everywhere, matching fresh render behavior.
  //
  // Uses bg=null (not scrollBg/inherited bg) because fresh render starts with
  // a blank buffer — the viewport has null bg before any content renders.
  if (stickyForceRefresh && clearHeight > 0) {
    buffer.fill(contentX, clearY, contentWidth, clearHeight, { char: " ", bg: null })
  }

  // First pass: render non-sticky visible children with scroll offset
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    if (!child) continue
    const childProps = child.props as BoxProps

    // Skip sticky children - they're rendered in second pass
    if (childProps.position === "sticky") {
      continue
    }

    // Skip children that are completely outside the visible range
    if (i < ss.firstVisibleChild || i > ss.lastVisibleChild) {
      continue
    }

    // Determine per-child hasPrev for buffer shift mode
    let thisChildHasPrev = defaultChildHasPrev
    let thisChildAncestorCleared = defaultChildAncestorCleared
    if (scrollOnly) {
      // Check if child was fully visible in the previous frame
      const childRect = child.contentRect
      if (childRect) {
        const childTop = childRect.y - layout.y - border.top - padding.top
        const childBottom = childTop + childRect.height
        const wasFullyVisible = childTop >= prevVisTop && childBottom <= prevVisBottom
        thisChildHasPrev = wasFullyVisible
        // Shifted children: their pixels are intact (not cleared)
        // Newly visible: exposed region was filled by scrollRegion
        thisChildAncestorCleared = wasFullyVisible ? ancestorCleared || parentRegionCleared : true
      }
    }

    // Force fresh rendering when sticky children exist (see stickyForceRefresh).
    if (stickyForceRefresh && thisChildHasPrev) {
      thisChildHasPrev = false
      thisChildAncestorCleared = false
    }

    // Render visible children with scroll offset applied.
    renderNodeToBuffer(
      child,
      buffer,
      {
        scrollOffset: ss.offset,
        clipBounds: childClipBounds,
        hasPrevBuffer: thisChildHasPrev,
        ancestorCleared: thisChildAncestorCleared,
      },
      ctx,
    )
  }

  // Second pass: render sticky children at their computed positions
  // Rendered last so they appear on top of other content
  if (ss.stickyChildren) {
    for (const sticky of ss.stickyChildren) {
      const child = node.children[sticky.index]
      if (!child?.contentRect) continue

      // Calculate the scroll offset that would place the child at its sticky position
      // stickyOffset = naturalTop - renderOffset
      // This makes the child render at renderOffset instead of its natural position
      const stickyScrollOffset = sticky.naturalTop - sticky.renderOffset

      // Sticky children always re-render (hasPrevBuffer=false) since their
      // effective scroll offset may change even when the container's doesn't.
      //
      // ancestorCleared=false matches fresh render semantics: on a fresh render,
      // the buffer at sticky positions has first-pass content (not "cleared").
      // Using ancestorCleared=true would cause transparent spacer Boxes to clear
      // their region (via layoutChanged=true from prevLayout=null → cascading
      // parentRegionCleared), wiping overlapping sticky headers rendered earlier
      // in this pass.
      //
      // Stale bg from previous frames is handled by the first-pass overlap
      // forcing above, which ensures correct bg is in the buffer before sticky
      // Text nodes inherit it via getCellBg (render-text.ts:600).
      renderNodeToBuffer(
        child,
        buffer,
        { scrollOffset: stickyScrollOffset, clipBounds: childClipBounds, hasPrevBuffer: false, ancestorCleared: false },
        ctx,
      )
    }
  }
}

/**
 * Render children of a normal (non-scroll) container.
 */
function renderNormalChildren(
  node: TeaNode,
  buffer: TerminalBuffer,
  props: BoxProps,
  nodeState: NodeRenderState,
  childPositionChanged = false,
  parentRegionCleared = false,
  parentRegionChanged = false,
  ctx?: PipelineContext,
): void {
  const { scrollOffset, clipBounds, hasPrevBuffer, ancestorCleared } = nodeState
  // Resolve instrumentation from ctx or module globals
  const instrumentEnabled = ctx?.instrumentEnabled ?? _instrumentEnabled
  const stats = ctx?.stats ?? _contentPhaseStats
  const layout = node.contentRect
  if (!layout) return

  // For overflow='hidden' containers, clip children to content area (both vertical and horizontal)
  const effectiveClipBounds =
    props.overflow === "hidden" ? computeChildClipBounds(layout, props, clipBounds, scrollOffset) : clipBounds

  // Non-scroll sticky children support. When the layout phase computes
  // node.stickyChildren, we use the same two-pass pattern as scroll containers:
  // first pass renders non-sticky children, second pass renders sticky children
  // at their computed renderOffset positions.
  const hasStickyChildren = !!(node.stickyChildren && node.stickyChildren.length > 0)

  // When sticky children exist and hasPrevBuffer is true, force all first-pass
  // children to re-render. The cloned buffer may have stale pixels from previous
  // frames' sticky positions. This matches the stickyForceRefresh pattern from
  // scroll containers (Tier 3).
  const stickyForceRefresh = hasStickyChildren && hasPrevBuffer

  // Pre-clear the content area to bg=null when stickyForceRefresh is true.
  // Fresh renders start with a blank buffer (null bg everywhere). The cloned
  // buffer has stale bg from old sticky positions — Text nodes inherit bg via
  // getCellBg/inheritedBg, so stale bg leaks through. Clearing to null matches
  // fresh render state before any content renders.
  if (stickyForceRefresh) {
    const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
    const padding = getPadding(props)
    const contentX = layout.x + border.left + padding.left
    const contentY = layout.y + border.top + padding.top
    const contentWidth = layout.width - border.left - border.right - padding.left - padding.right
    const contentHeight = layout.height - border.top - border.bottom - padding.top - padding.bottom
    buffer.fill(contentX, contentY, contentWidth, contentHeight, { char: " ", bg: null })
  }

  // Force children to re-render when parent's region was modified on a clone,
  // children were restructured, or sibling positions shifted.
  const childrenNeedRepaint = node.childrenDirty || childPositionChanged || parentRegionChanged
  if (instrumentEnabled && childrenNeedRepaint && hasPrevBuffer) {
    stats.normalChildrenRepaint++
    const reasons: string[] = []
    if (node.childrenDirty) reasons.push("childrenDirty")
    if (childPositionChanged) reasons.push("childPositionChanged")
    if (parentRegionChanged) reasons.push("parentRegionChanged")
    stats.normalRepaintReason = reasons.join("+")
  }
  let childHasPrev = childrenNeedRepaint ? false : hasPrevBuffer
  // childAncestorCleared: tells descendants that STALE pixels exist in the buffer.
  // Only parentRegionCleared (no bg fill → stale pixels remain) propagates this.
  // parentRegionChanged WITHOUT parentRegionCleared means the parent filled its bg,
  // so children's positions have correct bg — NOT stale. Setting ancestorCleared
  // there would cause children to re-fill, overwriting border cells at boundaries.
  // When this node has backgroundColor, its renderBox fill covers any stale
  // pixels from ancestor clears — so children don't need ancestorCleared.
  let childAncestorCleared = parentRegionCleared || (ancestorCleared && !props.backgroundColor)

  // Override child flags when sticky force refresh is active — all first-pass
  // children must re-render fresh (matching the scroll container pattern).
  if (stickyForceRefresh) {
    childHasPrev = false
    childAncestorCleared = false
  }

  // Multi-pass rendering to match CSS paint order:
  // 1. Normal-flow children (skip sticky and absolute)
  // 2. Sticky children at computed positions (on top of normal-flow)
  // 3. Absolute children on top of everything
  //
  // This ensures absolute children's pixels (bg fills, text) are never
  // overwritten by normal-flow siblings' clearNodeRegion/render.
  //
  // Pre-scan: detect if any non-absolute, non-sticky sibling is dirty. When
  // true, absolute children in the third pass must force-repaint because the
  // first pass may have overwritten their pixels in the cloned buffer.
  let hasAbsoluteChildren = false

  // First pass: render normal-flow children (skip sticky + absolute), track dirty state
  for (const child of node.children) {
    const childProps = child.props as BoxProps
    if (childProps.position === "absolute") {
      hasAbsoluteChildren = true
      continue // Skip — rendered in third pass
    }
    if (hasStickyChildren && childProps.position === "sticky") {
      continue // Skip — rendered in second pass
    }

    renderNodeToBuffer(
      child,
      buffer,
      {
        scrollOffset,
        clipBounds: effectiveClipBounds,
        hasPrevBuffer: childHasPrev,
        ancestorCleared: childAncestorCleared,
      },
      ctx,
    )
  }

  // Second pass: render sticky children at their computed positions.
  // Rendered after normal-flow so they appear on top of other content.
  if (node.stickyChildren) {
    for (const sticky of node.stickyChildren) {
      const child = node.children[sticky.index]
      if (!child?.contentRect) continue

      // Calculate the scroll offset that would place the child at its sticky position.
      // stickyScrollOffset = naturalTop - renderOffset
      // This makes the child render at renderOffset instead of its natural position.
      const stickyScrollOffset = sticky.naturalTop - sticky.renderOffset

      // Sticky children always re-render (hasPrevBuffer=false) since their
      // effective position may change between frames.
      //
      // ancestorCleared=false matches fresh render semantics: on a fresh render,
      // the buffer at sticky positions has first-pass content (not "cleared").
      // Using ancestorCleared=true would cause transparent spacer Boxes to clear
      // their region, wiping overlapping sticky headers rendered earlier in this pass.
      renderNodeToBuffer(
        child,
        buffer,
        {
          scrollOffset: stickyScrollOffset,
          clipBounds: effectiveClipBounds,
          hasPrevBuffer: false,
          ancestorCleared: false,
        },
        ctx,
      )
    }
  }

  // Third pass: render absolute children on top (CSS paint order)
  if (hasAbsoluteChildren) {
    for (const child of node.children) {
      const childProps = child.props as BoxProps
      if (childProps.position !== "absolute") continue

      // Both hasPrevBuffer and ancestorCleared must be false for absolute children
      // in the second pass. The buffer at the absolute child's position contains
      // first-pass content (normal-flow siblings), not "previous frame" content.
      // This is conceptually a fresh render at the absolute child's position:
      //
      // - hasPrevBuffer=false: prevents parentRegionCleared from firing.
      //   Without this, a transparent overlay (no backgroundColor) that changes
      //   (contentAreaAffected=true) would clear its entire region, wiping the
      //   normal-flow content painted in the first pass. On a fresh render,
      //   hasPrevBuffer=false prevents clearing, so this matches.
      //
      // - ancestorCleared=false: prevents transparent descendants from clearing
      //   their regions, which would also wipe first-pass content.
      renderNodeToBuffer(
        child,
        buffer,
        { scrollOffset, clipBounds: effectiveClipBounds, hasPrevBuffer: false, ancestorCleared: false },
        ctx,
      )
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Clear dirty flags on a subtree that was skipped during incremental rendering.
 */
function clearDirtyFlags(node: TeaNode): void {
  node.contentDirty = false
  node.paintDirty = false
  node.bgDirty = false
  node.subtreeDirty = false
  node.childrenDirty = false
  node.layoutChangedThisFrame = false
  for (const child of node.children) {
    if (child.layoutNode) {
      clearDirtyFlags(child)
    } else {
      // Virtual text children also need flags cleared — they're rendered by
      // their parent's collectTextContent(), not by renderNodeToBuffer().
      clearVirtualTextFlags(child)
    }
  }
}

/**
 * Clear dirty flags on a virtual text node and its descendants.
 * Virtual text nodes (no layoutNode) are rendered by their parent layout
 * ancestor via collectTextContent(). Their dirty flags must be cleared
 * after the parent renders, otherwise stale subtreeDirty blocks
 * markSubtreeDirty() propagation on future updates.
 */
function clearVirtualTextFlags(node: TeaNode): void {
  node.contentDirty = false
  node.paintDirty = false
  node.bgDirty = false
  node.subtreeDirty = false
  node.childrenDirty = false
  node.layoutChangedThisFrame = false
  for (const child of node.children) {
    clearVirtualTextFlags(child)
  }
}

/**
 * Check if any child's position changed since last render (sibling shift).
 * Checked even when subtreeDirty=true because subtreeDirty only means
 * descendants are dirty, not that this container's gap regions need clearing.
 */
function hasChildPositionChanged(node: TeaNode): boolean {
  for (const child of node.children) {
    if (child.contentRect && child.prevLayout) {
      if (child.contentRect.x !== child.prevLayout.x || child.contentRect.y !== child.prevLayout.y) {
        return true
      }
    }
  }
  return false
}

/**
 * Compute clip bounds for a container's children by insetting for border+padding,
 * then intersecting with parent clip bounds.
 */
function computeChildClipBounds(
  layout: NonNullable<TeaNode["contentRect"]>,
  props: BoxProps,
  parentClip: ClipBounds | undefined,
  scrollOffset = 0,
  /** When true, compute left/right clip bounds (for overflow="hidden" containers).
   *  When false, only compute vertical bounds and pass through parent's horizontal bounds.
   *  Scroll containers should use horizontal=false — they clip vertically but not horizontally. */
  horizontal = true,
): ClipBounds {
  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
  const padding = getPadding(props)
  const adjustedY = layout.y - scrollOffset
  const nodeClip: ClipBounds = {
    top: adjustedY + border.top + padding.top,
    bottom: adjustedY + layout.height - border.bottom - padding.bottom,
  }
  if (horizontal) {
    nodeClip.left = layout.x + border.left + padding.left
    nodeClip.right = layout.x + layout.width - border.right - padding.right
  }
  if (!parentClip) return nodeClip
  const result: ClipBounds = {
    top: Math.max(parentClip.top, nodeClip.top),
    bottom: Math.min(parentClip.bottom, nodeClip.bottom),
  }
  if (horizontal && nodeClip.left !== undefined && nodeClip.right !== undefined) {
    result.left = Math.max(parentClip.left ?? 0, nodeClip.left)
    result.right = Math.min(parentClip.right ?? Infinity, nodeClip.right)
  } else if (parentClip.left !== undefined && parentClip.right !== undefined) {
    // Pass through parent's horizontal clip bounds without adding own
    result.left = parentClip.left
    result.right = parentClip.right
  }
  return result
}

// ============================================================================
// Region Clearing
// ============================================================================

/**
 * Result of finding inherited background - includes both color and ancestor bounds.
 */
interface InheritedBgResult {
  color: Color
  /** The rect of the ancestor that has the background color (for clipping) */
  ancestorRect: { x: number; y: number; width: number; height: number } | null
}

/**
 * Find the nearest ancestor with a backgroundColor and return the parsed color
 * along with the ancestor's rect for proper clipping.
 *
 * When clearing excess area after a node shrinks, we need to clip to the colored
 * ancestor's bounds - not just the immediate parent. Otherwise the inherited
 * color can bleed into sibling areas that should have different backgrounds.
 */
function findInheritedBg(node: TeaNode): InheritedBgResult {
  let current = node.parent
  while (current) {
    const bg = (current.props as BoxProps).backgroundColor
    if (bg) {
      return {
        color: parseColor(bg),
        ancestorRect: current.contentRect,
      }
    }
    current = current.parent
  }
  return { color: null, ancestorRect: null }
}

/**
 * Find the nearest ancestor Box with a `color` prop and return the parsed color.
 * Implements CSS-style foreground color inheritance: Text children without an
 * explicit `color` prop inherit from the nearest Box ancestor that sets one.
 */
function findInheritedFg(node: TeaNode): Color {
  let current = node.parent
  while (current) {
    const fg = (current.props as BoxProps).color
    if (fg) return parseColor(fg)
    current = current.parent
  }
  return null
}

/**
 * Clear a node's region with inherited bg when it has no backgroundColor.
 * Also clears excess area when the node shrank (previous layout was larger).
 *
 * Clipping: clips to parent's contentRect (prevents overflow) and to the
 * colored ancestor's bounds (prevents bg color bleeding into siblings).
 */
function clearNodeRegion(
  node: TeaNode,
  buffer: TerminalBuffer,
  layout: NonNullable<TeaNode["contentRect"]>,
  scrollOffset: number,
  clipBounds: ClipBounds | undefined,
  layoutChanged: boolean,
): void {
  const inherited = findInheritedBg(node)
  const clearBg = inherited.color
  const screenY = layout.y - scrollOffset

  // Clip to parent's contentRect to prevent oversized children from clearing
  // beyond their parent's bounds and bleeding inherited bg into sibling regions.
  const parentRect = node.parent?.contentRect
  const parentBottom = parentRect ? parentRect.y - scrollOffset + parentRect.height : undefined

  const clearY = clipBounds ? Math.max(screenY, clipBounds.top) : screenY
  let clearBottom = clipBounds ? Math.min(screenY + layout.height, clipBounds.bottom) : screenY + layout.height
  if (parentBottom !== undefined) {
    clearBottom = Math.min(clearBottom, parentBottom)
  }

  // Clip horizontally to clipBounds (overflow:hidden containers) and to the
  // colored ancestor's bounds (prevents inherited bg bleeding into siblings).
  let clearX = layout.x
  let clearWidth = layout.width
  if (clipBounds?.left !== undefined && clipBounds.right !== undefined) {
    if (clearX < clipBounds.left) {
      clearWidth -= clipBounds.left - clearX
      clearX = clipBounds.left
    }
    if (clearX + clearWidth > clipBounds.right) {
      clearWidth = Math.max(0, clipBounds.right - clearX)
    }
  }
  if (inherited.ancestorRect) {
    const ancestorRight = inherited.ancestorRect.x + inherited.ancestorRect.width
    const ancestorLeft = inherited.ancestorRect.x
    if (clearX < ancestorLeft) {
      clearWidth -= ancestorLeft - clearX
      clearX = ancestorLeft
    }
    if (clearX + clearWidth > ancestorRight) {
      clearWidth = Math.max(0, ancestorRight - clearX)
    }
  }

  const clearHeight = clearBottom - clearY
  if (clearHeight > 0 && clearWidth > 0) {
    buffer.fill(clearX, clearY, clearWidth, clearHeight, {
      char: " ",
      bg: clearBg,
    })
  }

  // Delegate excess area clearing to shared helper
  clearExcessArea(node, buffer, layout, scrollOffset, clipBounds, layoutChanged, inherited)
}

/**
 * Clear the excess area when a node shrinks (old bounds were larger than new).
 *
 * This is separated from clearNodeRegion because excess area clearing must happen
 * even when parentRegionCleared is false. Key scenario: absolute-positioned overlays
 * (e.g., search dialog) that shrink while normal-flow siblings are dirty. The
 * forceRepaint path sets hasPrevBuffer=false + ancestorCleared=false, making
 * parentRegionCleared=false — but the cloned buffer still has stale pixels from
 * the old larger layout that must be cleared.
 *
 * Clips to the COLORED ANCESTOR's content area (not immediate parent's full rect)
 * to prevent inherited color from bleeding into sibling areas with different bg.
 *
 * IMPORTANT: Uses content area (inside border/padding), not full contentRect.
 * Without this, excess clearing of a child that previously filled the parent's
 * content area will extend into the parent's border row, overwriting border chars.
 */
function clearExcessArea(
  node: TeaNode,
  buffer: TerminalBuffer,
  layout: NonNullable<TeaNode["contentRect"]>,
  scrollOffset: number,
  clipBounds: ClipBounds | undefined,
  layoutChanged: boolean,
  inherited?: InheritedBgResult,
): void {
  if (!layoutChanged || !node.prevLayout) return
  const prev = node.prevLayout

  // Only clear if the node actually shrank in at least one dimension
  if (prev.width <= layout.width && prev.height <= layout.height) return

  // Skip excess clearing when the node MOVED (changed x or y position).
  // The right/bottom excess formulas use new-x + old-y coordinates, which
  // creates a phantom rectangle at wrong positions when the node moved.
  // Example: text at old=(30,7,23,1) → new=(22,8,14,2) computes excess at
  // (36,7) which overwrites a sibling's border character.
  //
  // When the node moved, the parent handles old-pixel cleanup:
  // - Parent's clearNodeRegion covers old pixels within parent's current rect
  // - Parent's clearExcessArea covers old pixels outside parent's rect
  if (prev.x !== layout.x || prev.y !== layout.y) return

  if (!inherited) inherited = findInheritedBg(node)
  const clearBg = inherited.color
  const screenY = layout.y - scrollOffset
  const prevScreenY = prev.y - scrollOffset

  // Clip to prevent excess clearing from bleeding outside valid bounds.
  // Start with the colored ancestor's rect (prevents bg color bleed),
  // then further restrict to the immediate parent's content area (prevents
  // overwriting parent's border characters).
  const clipRect = inherited.ancestorRect ?? node.parent?.contentRect
  if (!clipRect) return

  const clipRectScreenY = clipRect.y - scrollOffset
  let clipRectBottom = clipRectScreenY + clipRect.height
  let clipRectRight = clipRect.x + clipRect.width

  // Always inset by the immediate parent's border/padding.
  // Without this, a child's excess clearing extends into the parent's
  // border row, overwriting border characters with spaces.
  // (The old code skipped inset when clip rect came from a colored ancestor,
  // assuming "its bg fill covers its border area" — but bg fill only covers
  // the inside, while renderBorder draws characters on the border row.)
  const parent = node.parent
  if (parent?.contentRect) {
    const parentProps = parent.props as BoxProps
    const border = getBorderSize(parentProps)
    const padding = getPadding(parentProps)
    const parentRight = parent.contentRect.x + parent.contentRect.width - border.right - padding.right
    const parentBottom =
      parent.contentRect.y - scrollOffset + parent.contentRect.height - border.bottom - padding.bottom
    clipRectRight = Math.min(clipRectRight, parentRight)
    clipRectBottom = Math.min(clipRectBottom, parentBottom)
  }

  // Clear right margin (old was wider than new)
  if (prev.width > layout.width) {
    let excessX = layout.x + layout.width
    let excessWidth = prev.width - layout.width
    // Clip horizontally to parent's content area (inside border/padding).
    // Without this, excess clearing of a child that previously filled a wider
    // layout extends into the parent's right border, overwriting border chars.
    if (excessX + excessWidth > clipRectRight) {
      excessWidth = Math.max(0, clipRectRight - excessX)
    }
    if (excessWidth > 0) {
      clippedFill(
        buffer,
        excessX,
        excessWidth,
        prevScreenY,
        prevScreenY + prev.height,
        clipBounds,
        clipRectBottom,
        clearBg,
      )
    }
  }

  // Clear bottom margin (old was taller than new)
  if (prev.height > layout.height) {
    let bottomWidth = prev.width
    // Clip horizontally to parent's content area
    if (layout.x + bottomWidth > clipRectRight) {
      bottomWidth = Math.max(0, clipRectRight - layout.x)
    }
    clippedFill(
      buffer,
      layout.x,
      bottomWidth,
      screenY + layout.height,
      prevScreenY + prev.height,
      clipBounds,
      clipRectBottom,
      clearBg,
    )
  }
}

/** Fill a rectangular region, clipping to clipBounds and an outer bottom limit. */
function clippedFill(
  buffer: TerminalBuffer,
  x: number,
  width: number,
  top: number,
  bottom: number,
  clipBounds: ClipBounds | undefined,
  outerBottom: number,
  bg: Color,
): void {
  const clippedTop = clipBounds ? Math.max(top, clipBounds.top) : top
  const clippedBottom = Math.min(clipBounds ? Math.min(bottom, clipBounds.bottom) : bottom, outerBottom)
  let clippedX = x
  let clippedWidth = width
  if (clipBounds?.left !== undefined && clipBounds.right !== undefined) {
    if (clippedX < clipBounds.left) {
      clippedWidth -= clipBounds.left - clippedX
      clippedX = clipBounds.left
    }
    if (clippedX + clippedWidth > clipBounds.right) {
      clippedWidth = Math.max(0, clipBounds.right - clippedX)
    }
  }
  const height = clippedBottom - clippedTop
  if (height > 0 && clippedWidth > 0) {
    buffer.fill(clippedX, clippedTop, clippedWidth, height, { char: " ", bg })
  }
}
