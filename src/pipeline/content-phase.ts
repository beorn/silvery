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

import type { Color } from "../buffer.js"
import { TerminalBuffer } from "../buffer.js"
import type { BoxProps, InkxNode, TextProps } from "../types.js"
import { rectEqual } from "../types.js"
import { getBorderSize, getPadding } from "./helpers.js"
import { renderBox, renderOutline, renderScrollIndicators } from "./render-box.js"
import { parseColor } from "./render-helpers.js"
import { clearBgConflictWarnings, renderText, setBgConflictMode } from "./render-text.js"

/**
 * Render all nodes to a terminal buffer.
 *
 * @param root The root InkxNode
 * @param prevBuffer Previous buffer for incremental rendering (optional)
 * @returns A TerminalBuffer with the rendered content
 */
export function contentPhase(root: InkxNode, prevBuffer?: TerminalBuffer | null): TerminalBuffer {
  const layout = root.contentRect
  if (!layout) {
    throw new Error("contentPhase called before layout phase")
  }

  // Clone prevBuffer if same dimensions, else create fresh
  const hasPrevBuffer = prevBuffer && prevBuffer.width === layout.width && prevBuffer.height === layout.height

  if (_instrumentEnabled) {
    _contentPhaseCallCount++
    _contentPhaseStats._prevBufferNull = prevBuffer == null ? 1 : 0
    _contentPhaseStats._prevBufferDimMismatch = prevBuffer && !hasPrevBuffer ? 1 : 0
    _contentPhaseStats._hasPrevBuffer = hasPrevBuffer ? 1 : 0
    _contentPhaseStats._layoutW = layout.width
    _contentPhaseStats._layoutH = layout.height
    _contentPhaseStats._prevW = prevBuffer?.width ?? 0
    _contentPhaseStats._prevH = prevBuffer?.height ?? 0
    _contentPhaseStats._callCount = _contentPhaseCallCount
  }

  const t0 = _instrumentEnabled ? performance.now() : 0
  const buffer = hasPrevBuffer ? prevBuffer.clone() : new TerminalBuffer(layout.width, layout.height)
  const tClone = _instrumentEnabled ? performance.now() - t0 : 0

  const t1 = _instrumentEnabled ? performance.now() : 0
  renderNodeToBuffer(root, buffer, 0, undefined, !!hasPrevBuffer)
  const tRender = _instrumentEnabled ? performance.now() - t1 : 0

  if (_instrumentEnabled) {
    // Expose sub-phase timing for profiling
    const snap = {
      clone: tClone,
      render: tRender,
      ...structuredClone(_contentPhaseStats),
    }
    ;(globalThis as any).__inkx_content_detail = snap
    const arr = ((globalThis as any).__inkx_content_all ??= [] as (typeof snap)[])
    arr.push(snap)
    for (const key of Object.keys(_contentPhaseStats) as (keyof typeof _contentPhaseStats)[]) {
      ;(_contentPhaseStats as any)[key] = 0
    }
    _contentPhaseStats.cascadeMinDepth = 999
    _contentPhaseStats.cascadeNodes = ""
    _contentPhaseStats.scrollClearReason = ""
    _contentPhaseStats.normalRepaintReason = ""
  }

  // Export node trace for INKX_STRICT diagnosis
  if (_nodeTraceEnabled && _nodeTrace.length > 0) {
    const traceArr = ((globalThis as any).__inkx_node_trace ??= [] as NodeTraceEntry[][])
    traceArr.push([..._nodeTrace])
    _nodeTrace.length = 0
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
function syncPrevLayout(node: InkxNode): void {
  node.prevLayout = node.contentRect
  for (const child of node.children) {
    syncPrevLayout(child)
  }
}

/** Instrumentation enabled when INKX_STRICT, INKX_CHECK_INCREMENTAL, or INKX_INSTRUMENT is set */
const _instrumentEnabled =
  typeof process !== "undefined" &&
  !!(process.env?.INKX_STRICT || process.env?.INKX_CHECK_INCREMENTAL || process.env?.INKX_INSTRUMENT)

/** Mutable stats counters — reset after each contentPhase call */
const _contentPhaseStats = {
  nodesVisited: 0,
  nodesRendered: 0,
  nodesSkipped: 0,
  textNodes: 0,
  boxNodes: 0,
  clearOps: 0,
  // Per-flag breakdown: why nodes weren't skipped
  noPrevBuffer: 0,
  flagContentDirty: 0,
  flagPaintDirty: 0,
  flagLayoutChanged: 0,
  flagSubtreeDirty: 0,
  flagChildrenDirty: 0,
  flagChildPositionChanged: 0,
  // Scroll container diagnostics
  scrollContainerCount: 0,
  scrollViewportCleared: 0,
  scrollClearReason: "" as string,
  // Normal container diagnostics
  normalChildrenRepaint: 0,
  normalRepaintReason: "" as string,
  // Cascade diagnostics: shallowest node with parentRegionChanged=true
  cascadeMinDepth: 999,
  cascadeNodes: "" as string, // "type:id@depth" of cascade sources
  // Top-level prevBuffer diagnostics
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

/** Per-node trace entries (populated when INKX_STRICT is set) */
interface NodeTraceEntry {
  id: string
  type: string
  depth: number
  rect: string
  prevLayout: string
  hasPrev: boolean
  ancestorCleared: boolean
  flags: string
  decision: string
  layoutChanged: boolean
  contentAreaAffected?: boolean
  parentRegionCleared?: boolean
  parentRegionChanged?: boolean
  childHasPrev?: boolean
  childAncestorCleared?: boolean
  skipBgFill?: boolean
  bgColor?: string
}
const _nodeTrace: NodeTraceEntry[] = []
const _nodeTraceEnabled =
  typeof process !== "undefined" && !!(process.env?.INKX_STRICT || process.env?.INKX_CHECK_INCREMENTAL)

/** DIAG: compute node depth in tree */
function _getNodeDepth(node: InkxNode): number {
  let depth = 0
  let n: InkxNode | null = node.parent
  while (n) {
    depth++
    n = n.parent
  }
  return depth
}

// Re-export for consumers who need to clear bg conflict warnings
export { clearBgConflictWarnings, setBgConflictMode }

type ClipBounds = { top: number; bottom: number; left?: number; right?: number }

// ============================================================================
// Core Rendering
// ============================================================================

/**
 * Render a single node to the buffer.
 */
function renderNodeToBuffer(
  node: InkxNode,
  buffer: TerminalBuffer,
  scrollOffset = 0,
  clipBounds?: ClipBounds,
  hasPrevBuffer = false,
  /** True when an ancestor already cleared this node's region (pixels were erased).
   *  Separate from hasPrevBuffer because scroll containers pass childHasPrev=false
   *  but the buffer is still a clone with stale pixels — the parent's clear handled
   *  its own region, but descendants may still need to clear their sub-regions. */
  ancestorCleared = false,
): void {
  if (_instrumentEnabled) _contentPhaseStats.nodesVisited++
  const layout = node.contentRect
  if (!layout) return

  // Skip nodes without Yoga (raw text and virtual text nodes)
  // Their content is rendered by their parent inkx-text via collectTextContent()
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

  // CORRECTNESS CATCH-ALL: Never skip any node in the content phase.
  //
  // The dirty flag propagation system has latent bugs where nodes that should
  // be dirty (due to cursor movement, scroll changes, etc.) aren't properly
  // marked. With correct dirty flags, we could skip clean nodes for O(1)
  // content phase. Without them, skipping causes garbled output.
  //
  // The old catch-all (!rectEqual(prevLayout, contentRect)) was unreliable:
  // propagateLayout() syncs prevLayout = contentRect on every frame where
  // the layout phase runs, breaking the catch-all for subsequent frames.
  //
  // Instead of manipulating layoutChanged (which cascades through
  // contentAreaAffected/parentRegionCleared/skipBgFill), we disable the
  // skip decision directly. This forces all nodes to re-render while
  // preserving correct cascade behavior for region clearing and bg fills.
  //
  // TODO: Fix dirty flag propagation bugs, then re-enable skipping.
  // See bead km-inkx.content-phase-skip.
  const skipFastPath = false

  // Node ID for tracing (only trace named nodes to keep compact)
  const _nodeId = _instrumentEnabled ? ((props.id as string | undefined) ?? "") : ""
  const _traceThis = _instrumentEnabled && _nodeTraceEnabled && _nodeId

  if (skipFastPath) {
    if (_instrumentEnabled) {
      _contentPhaseStats.nodesSkipped++
      if (_traceThis) {
        _nodeTrace.push({
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
  if (_instrumentEnabled) {
    _contentPhaseStats.nodesRendered++
    if (!hasPrevBuffer) _contentPhaseStats.noPrevBuffer++
    if (node.contentDirty) _contentPhaseStats.flagContentDirty++
    if (node.paintDirty) _contentPhaseStats.flagPaintDirty++
    if (layoutChanged) _contentPhaseStats.flagLayoutChanged++
    if (node.subtreeDirty) _contentPhaseStats.flagSubtreeDirty++
    if (node.childrenDirty) _contentPhaseStats.flagChildrenDirty++
    if (childPositionChanged) _contentPhaseStats.flagChildPositionChanged++
  }

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
  const textPaintDirty = node.type === "inkx-text" && node.paintDirty
  const contentAreaAffected =
    node.contentDirty || layoutChanged || childPositionChanged || node.childrenDirty || node.bgDirty || textPaintDirty

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
  if (_instrumentEnabled) {
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
      _nodeTrace.push({
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
      if (depth < _contentPhaseStats.cascadeMinDepth) {
        _contentPhaseStats.cascadeMinDepth = depth
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
      _contentPhaseStats.cascadeNodes += (_contentPhaseStats.cascadeNodes ? " " : "") + entry
    }
  }

  if (parentRegionCleared) {
    if (_instrumentEnabled) _contentPhaseStats.clearOps++
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

  // Render based on node type
  if (node.type === "inkx-box") {
    if (_instrumentEnabled) _contentPhaseStats.boxNodes++
    renderBox(node, buffer, layout, props, clipBounds, scrollOffset, skipBgFill)
  } else if (node.type === "inkx-text") {
    if (_instrumentEnabled) _contentPhaseStats.textNodes++
    // Pass inherited bg from nearest ancestor with backgroundColor.
    // This decouples text bg inheritance from buffer state, which is critical
    // for incremental rendering: getCellBg on a cloned buffer may return stale
    // bg at positions outside the parent's bg-filled region (overflow text).
    const textInheritedBg = findInheritedBg(node).color
    renderText(node, buffer, layout, props, scrollOffset, clipBounds, textInheritedBg)
  }

  // Render children
  if (isScrollContainer) {
    renderScrollContainerChildren(
      node,
      buffer,
      props,
      clipBounds,
      hasPrevBuffer,
      parentRegionCleared,
      parentRegionChanged,
      ancestorCleared,
    )

    // Render overflow indicators AFTER children so they survive viewport clear.
    // renderScrollContainerChildren may clear the viewport (Tier 2) which would
    // overwrite indicators drawn before children.
    renderScrollIndicators(node, buffer, layout, props, node.scrollState!)
  } else {
    renderNormalChildren(
      node,
      buffer,
      scrollOffset,
      props,
      clipBounds,
      hasPrevBuffer,
      childPositionChanged,
      parentRegionCleared,
      parentRegionChanged,
      ancestorCleared,
    )
  }

  // Render outline AFTER children — outline overlaps content at edges
  if (node.type === "inkx-box" && props.outlineStyle) {
    const { x, width, height } = layout
    const y = layout.y - scrollOffset
    renderOutline(buffer, x, y, width, height, props, clipBounds)
  }

  // Clear dirty flags
  node.contentDirty = false
  node.paintDirty = false
  node.bgDirty = false
  node.subtreeDirty = false
  node.childrenDirty = false
  node.layoutChangedThisFrame = false
}

/**
 * Render children of a scroll container with proper clipping and offset.
 */
function renderScrollContainerChildren(
  node: InkxNode,
  buffer: TerminalBuffer,
  props: BoxProps,
  clipBounds?: ClipBounds,
  hasPrevBuffer = false,
  parentRegionCleared = false,
  parentRegionChanged = false,
  ancestorCleared = false,
): void {
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

  if (_instrumentEnabled) {
    _contentPhaseStats.scrollContainerCount++
    if (needsViewportClear || scrollOnly) {
      _contentPhaseStats.scrollViewportCleared++
      const reasons: string[] = []
      if (scrollOnly) reasons.push("SHIFT")
      if (scrollOffsetChanged) reasons.push(`scrollOffset(${ss.prevOffset}->${ss.offset})`)
      if (node.childrenDirty) reasons.push("childrenDirty")
      if (parentRegionChanged) reasons.push("parentRegionChanged")
      reasons.push(
        `vp=${ss.viewportHeight} content=${ss.contentHeight} vis=${ss.firstVisibleChild}-${ss.lastVisibleChild}`,
      )
      _contentPhaseStats.scrollClearReason = reasons.join("+")
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
    renderNodeToBuffer(child, buffer, ss.offset, childClipBounds, thisChildHasPrev, thisChildAncestorCleared)
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
      renderNodeToBuffer(child, buffer, stickyScrollOffset, childClipBounds, false, false)
    }
  }
}

/**
 * Render children of a normal (non-scroll) container.
 */
function renderNormalChildren(
  node: InkxNode,
  buffer: TerminalBuffer,
  scrollOffset: number,
  props: BoxProps,
  clipBounds?: ClipBounds,
  hasPrevBuffer = false,
  childPositionChanged = false,
  parentRegionCleared = false,
  parentRegionChanged = false,
  ancestorCleared = false,
): void {
  const layout = node.contentRect
  if (!layout) return

  // For overflow='hidden' containers, clip children to content area (both vertical and horizontal)
  const effectiveClipBounds =
    props.overflow === "hidden" ? computeChildClipBounds(layout, props, clipBounds, scrollOffset) : clipBounds

  // Force children to re-render when parent's region was modified on a clone,
  // children were restructured, or sibling positions shifted.
  const childrenNeedRepaint = node.childrenDirty || childPositionChanged || parentRegionChanged
  if (_instrumentEnabled && childrenNeedRepaint && hasPrevBuffer) {
    _contentPhaseStats.normalChildrenRepaint++
    const reasons: string[] = []
    if (node.childrenDirty) reasons.push("childrenDirty")
    if (childPositionChanged) reasons.push("childPositionChanged")
    if (parentRegionChanged) reasons.push("parentRegionChanged")
    _contentPhaseStats.normalRepaintReason = reasons.join("+")
  }
  const childHasPrev = childrenNeedRepaint ? false : hasPrevBuffer
  // childAncestorCleared: tells descendants that STALE pixels exist in the buffer.
  // Only parentRegionCleared (no bg fill → stale pixels remain) propagates this.
  // parentRegionChanged WITHOUT parentRegionCleared means the parent filled its bg,
  // so children's positions have correct bg — NOT stale. Setting ancestorCleared
  // there would cause children to re-fill, overwriting border cells at boundaries.
  // When this node has backgroundColor, its renderBox fill covers any stale
  // pixels from ancestor clears — so children don't need ancestorCleared.
  const childAncestorCleared = parentRegionCleared || (ancestorCleared && !props.backgroundColor)

  // Two-pass rendering to match CSS paint order: normal-flow first, then
  // absolute on top. This ensures absolute children's pixels (bg fills, text)
  // are never overwritten by normal-flow siblings' clearNodeRegion/render.
  //
  // Without two-pass, an absolute child rendered before a dirty normal-flow
  // sibling gets its bg wiped by the sibling's clearNodeRegion. The old
  // single-pass anySiblingWasDirty flag only caught absolute children AFTER
  // dirty siblings, not before.
  //
  // Pre-scan: detect if any non-absolute sibling is dirty. When true, absolute
  // children in the second pass must force-repaint because the first pass may
  // have overwritten their pixels in the cloned buffer.
  let hasAbsoluteChildren = false
  let anyNormalFlowDirty = false

  // First pass: render normal-flow children, track dirty state
  for (const child of node.children) {
    const childProps = child.props as BoxProps
    if (childProps.position === "absolute") {
      hasAbsoluteChildren = true
      continue // Skip — rendered in second pass
    }

    const childIsDirty =
      child.layoutNode &&
      !child.hidden &&
      (child.contentDirty ||
        child.paintDirty ||
        child.subtreeDirty ||
        child.childrenDirty ||
        (child.contentRect && child.prevLayout && !rectEqual(child.prevLayout, child.contentRect)))

    if (childIsDirty) anyNormalFlowDirty = true

    renderNodeToBuffer(child, buffer, scrollOffset, effectiveClipBounds, childHasPrev, childAncestorCleared)
  }

  // Second pass: render absolute children on top (CSS paint order)
  if (hasAbsoluteChildren) {
    const forceRepaint = childHasPrev && anyNormalFlowDirty
    for (const child of node.children) {
      const childProps = child.props as BoxProps
      if (childProps.position !== "absolute") continue

      // ancestorCleared must be false for absolute children in the second pass.
      // After the first pass, the buffer at the absolute child's position contains
      // correct normal-flow content (not stale pixels). Propagating ancestorCleared
      // causes transparent absolute overlays (no backgroundColor) to run
      // clearNodeRegion, erasing the normal-flow content just painted.
      // When forceRepaint is true (normal-flow siblings overwrote the absolute
      // child's previous pixels), hasPrevBuffer=false ensures it re-renders fully
      // without needing ancestorCleared to trigger clearing.
      renderNodeToBuffer(child, buffer, scrollOffset, effectiveClipBounds, forceRepaint ? false : childHasPrev, false)
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Clear dirty flags on a subtree that was skipped during incremental rendering.
 */
function clearDirtyFlags(node: InkxNode): void {
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
function clearVirtualTextFlags(node: InkxNode): void {
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
function hasChildPositionChanged(node: InkxNode): boolean {
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
  layout: NonNullable<InkxNode["contentRect"]>,
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
function findInheritedBg(node: InkxNode): InheritedBgResult {
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
 * Clear a node's region with inherited bg when it has no backgroundColor.
 * Also clears excess area when the node shrank (previous layout was larger).
 *
 * Clipping: clips to parent's contentRect (prevents overflow) and to the
 * colored ancestor's bounds (prevents bg color bleeding into siblings).
 */
function clearNodeRegion(
  node: InkxNode,
  buffer: TerminalBuffer,
  layout: NonNullable<InkxNode["contentRect"]>,
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
  node: InkxNode,
  buffer: TerminalBuffer,
  layout: NonNullable<InkxNode["contentRect"]>,
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
    const parentBottom = parent.contentRect.y - scrollOffset + parent.contentRect.height - border.bottom - padding.bottom
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
