/**
 * Phase 3: Content Phase
 *
 * Render all nodes to a terminal buffer.
 *
 * This module orchestrates the rendering process by traversing the node tree
 * and delegating to specialized rendering functions for boxes and text.
 */

import type { Color } from "../buffer.js"
import { TerminalBuffer } from "../buffer.js"
import type { BoxProps, InkxNode, TextProps } from "../types.js"
import { rectEqual } from "../types.js"
import { getBorderSize, getPadding } from "./helpers.js"
import { renderBox, renderScrollIndicators } from "./render-box.js"
import { parseColor } from "./render-helpers.js"
import {
  clearBgConflictWarnings,
  renderText,
  setBgConflictMode,
} from "./render-text.js"

/**
 * Render all nodes to a terminal buffer.
 *
 * @param root The root InkxNode
 * @param prevBuffer Previous buffer for incremental rendering (optional)
 * @returns A TerminalBuffer with the rendered content
 */
export function contentPhase(
  root: InkxNode,
  prevBuffer?: TerminalBuffer | null,
): TerminalBuffer {
  const layout = root.contentRect
  if (!layout) {
    throw new Error("contentPhase called before layout phase")
  }

  // Clone prevBuffer if same dimensions, else create fresh
  const canReuse =
    prevBuffer &&
    prevBuffer.width === layout.width &&
    prevBuffer.height === layout.height

  const buffer = canReuse
    ? prevBuffer.clone()
    : new TerminalBuffer(layout.width, layout.height)

  renderNodeToBuffer(root, buffer, 0, undefined, canReuse)

  return buffer
}

// Re-export for consumers who need to clear bg conflict warnings
export { clearBgConflictWarnings, setBgConflictMode }

/**
 * Clear dirty flags on a subtree that was skipped during incremental rendering.
 */
function clearDirtyFlags(node: InkxNode): void {
  node.contentDirty = false
  node.paintDirty = false
  node.subtreeDirty = false
  node.childrenDirty = false
  for (const child of node.children) {
    if (child.layoutNode) clearDirtyFlags(child)
  }
}

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
 * Render a single node to the buffer.
 */
function renderNodeToBuffer(
  node: InkxNode,
  buffer: TerminalBuffer,
  scrollOffset = 0,
  clipBounds?: { top: number; bottom: number },
  hasPrevBuffer = false,
  /** True when an ancestor already cleared this node's region (pixels were erased).
   *  Separate from hasPrevBuffer because scroll containers pass childHasPrev=false
   *  but the buffer is still a clone with stale pixels — the parent's clear handled
   *  its own region, but descendants may still need to clear their sub-regions. */
  ancestorCleared = false,
): void {
  const layout = node.contentRect
  if (!layout) return

  // Skip nodes without Yoga (raw text and virtual text nodes)
  // Their content is rendered by their parent inkx-text via collectTextContent()
  if (!node.layoutNode) return

  // Skip hidden nodes (Suspense support)
  // When a Suspense boundary shows a fallback, the hidden subtree is not rendered
  if (node.hidden) return

  const props = node.props as BoxProps & TextProps

  // Skip display="none" nodes - they have 0x0 dimensions and shouldn't render
  // Also skip their children since the entire subtree is hidden
  if (props.display === "none") return

  // FAST PATH: Skip entire subtree if unchanged and we have a previous buffer
  // The buffer was cloned from prevBuffer, so skipped nodes keep their rendered output
  const layoutChanged = !rectEqual(node.prevLayout, node.contentRect)

  // Check if any child's position changed (sibling shift). When one child changes
  // size, other children may shift positions. The gap space between children belongs
  // to this container, so we need to re-render if children shifted.
  // Note: We check this even when subtreeDirty=true because subtreeDirty only means
  // descendants are dirty, not that this container's gap regions need clearing.
  let childPositionChanged = false
  if (hasPrevBuffer && !layoutChanged && node.children.length > 0) {
    for (const child of node.children) {
      if (child.contentRect && child.prevLayout) {
        if (
          child.contentRect.x !== child.prevLayout.x ||
          child.contentRect.y !== child.prevLayout.y
        ) {
          childPositionChanged = true
          break
        }
      }
    }
  }

  const skipFastPath =
    hasPrevBuffer &&
    !node.contentDirty &&
    !node.paintDirty &&
    !layoutChanged &&
    !node.subtreeDirty &&
    !node.childrenDirty &&
    !childPositionChanged

  if (skipFastPath) {
    clearDirtyFlags(node)
    return
  }

  // Check if this is a scrollable container
  const isScrollContainer = props.overflow === "scroll" && node.scrollState

  // When re-rendering a dirty node on a cloned buffer, clear its region first.
  // The cloned buffer has pixels from the previous frame that must be erased
  // before re-rendering. We need to clear when:
  //
  // - contentDirty: text/structure changed (Note: measure phase may clear this
  //   flag for its text-collection cache, so paintDirty acts as a surviving
  //   witness that style props changed)
  // - paintDirty: visual style changed (e.g., backgroundColor removed). This
  //   is critical because when backgroundColor changes from "cyan" to undefined,
  //   the old cyan pixels must be cleared from the cloned buffer. Without this,
  //   renderGraphemes reads stale bg from the buffer (it preserves existing bg
  //   when style.bg is null to support bg inheritance from parent Box).
  // - childrenDirty: children added/removed/reordered
  // - layoutChanged: node moved or resized
  // - childPositionChanged: sibling shift
  //
  // IMPORTANT: When we clear the parent's region, children must re-render too
  // (even if they have clean flags) because their pixels were erased.
  const needsInteriorClear =
    node.contentDirty ||
    node.paintDirty ||
    node.childrenDirty ||
    layoutChanged ||
    childPositionChanged
  // Clear when the node's own content/style changed but has no backgroundColor.
  // Without backgroundColor, renderBox won't fill, so stale pixels from the
  // cloned buffer remain visible. We must explicitly clear.
  //
  // We gate on (hasPrevBuffer || ancestorCleared) because:
  // - hasPrevBuffer=true: normal incremental path, buffer is a clone with stale pixels
  // - ancestorCleared=true: an ancestor already cleared its region, which means
  //   hasPrevBuffer=false was passed for "render fresh" semantics, but the buffer
  //   is still a clone. The ancestor's clear covered its own region, but this node
  //   may need to clear its sub-region (e.g., a card whose bg changed from yellow
  //   to undefined inside a scroll container whose wrapper already cleared).
  // On a truly fresh buffer (first render), both are false, so no wasteful clear.
  const parentRegionCleared =
    (hasPrevBuffer || ancestorCleared) &&
    needsInteriorClear &&
    !props.backgroundColor

  // Determine whether the box's background fill will overwrite children's pixels.
  // renderBox always fills when backgroundColor is set, but we only need to
  // force child repaint when the fill actually changes the buffer. In incremental
  // mode, if only subtreeDirty is set (descendants changed, not the box itself),
  // the cloned buffer already has the correct bg fill — skip to preserve children.
  //
  // needsOwnRepaint: the box's OWN visual properties changed (not just descendants)
  const needsOwnRepaint =
    node.contentDirty ||
    node.paintDirty ||
    node.childrenDirty ||
    layoutChanged ||
    childPositionChanged
  // skipBgFill: in incremental mode, skip the bg fill when the cloned buffer
  // already has the correct bg at this node's position. That's ONLY when:
  // - hasPrevBuffer=true (buffer is a clone with previous frame's pixels)
  // - ancestorCleared=false (no ancestor erased our region)
  // - needsOwnRepaint=false (our own properties didn't change)
  //
  // When ancestorCleared=true, the buffer at our position was erased to the
  // inherited bg, NOT our bg — so we must re-fill.
  // When hasPrevBuffer=false AND ancestorCleared=false, it's a fresh render.
  const skipBgFill = hasPrevBuffer && !ancestorCleared && !needsOwnRepaint
  const parentWasPainted =
    parentRegionCleared ||
    ((hasPrevBuffer || ancestorCleared) &&
      needsOwnRepaint &&
      !!props.backgroundColor)

  if (parentRegionCleared) {
    const inherited = findInheritedBg(node)
    const clearBg = inherited.color
    const screenY = layout.y - scrollOffset

    // Clip to parent's contentRect to prevent oversized children (e.g., text nodes
    // with layout height exceeding their parent box) from clearing beyond their
    // parent's bounds and bleeding inherited background into sibling regions.
    const parentRect = node.parent?.contentRect
    const parentBottom = parentRect
      ? parentRect.y - scrollOffset + parentRect.height
      : undefined

    const clearY = clipBounds ? Math.max(screenY, clipBounds.top) : screenY
    let clearBottom = clipBounds
      ? Math.min(screenY + layout.height, clipBounds.bottom)
      : screenY + layout.height
    if (parentBottom !== undefined) {
      clearBottom = Math.min(clearBottom, parentBottom)
    }
    const clearHeight = clearBottom - clearY
    if (clearHeight > 0) {
      buffer.fill(layout.x, clearY, layout.width, clearHeight, {
        char: " ",
        bg: clearBg,
      })
    }

    // Bug 3: When a node shrinks, clear the old bounds' excess area
    // IMPORTANT: We clip to the COLORED ANCESTOR's bounds (not immediate parent).
    // Using the inherited color but the immediate parent's bounds causes the
    // color to bleed into sibling areas that should have different backgrounds.
    // For example, if a text node inside a cyan row shrinks, clearing with cyan
    // must not extend beyond the cyan row into an adjacent black dialog.
    if (layoutChanged && node.prevLayout) {
      const prev = node.prevLayout
      const prevScreenY = prev.y - scrollOffset

      // Use colored ancestor's bounds for clipping, fallback to immediate parent
      const clipRect = inherited.ancestorRect ?? node.parent?.contentRect
      if (!clipRect) return // No bounds to clip to

      const clipRectScreenY = clipRect.y - scrollOffset
      const clipRectBottom = clipRectScreenY + clipRect.height

      // Clear right margin (old was wider than new)
      if (prev.width > layout.width) {
        const rightClearY = clipBounds
          ? Math.max(prevScreenY, clipBounds.top)
          : prevScreenY
        const rightClearBottom = clipBounds
          ? Math.min(prevScreenY + prev.height, clipBounds.bottom)
          : prevScreenY + prev.height
        // Clip to colored ancestor's bounds
        const clippedClearBottom = Math.min(rightClearBottom, clipRectBottom)
        const rightClearHeight = clippedClearBottom - rightClearY
        if (rightClearHeight > 0) {
          buffer.fill(
            layout.x + layout.width,
            rightClearY,
            prev.width - layout.width,
            rightClearHeight,
            { char: " ", bg: clearBg },
          )
        }
      }
      // Clear bottom margin (old was taller than new)
      if (prev.height > layout.height) {
        const bottomY = layout.y - scrollOffset + layout.height
        const bottomClearY = clipBounds
          ? Math.max(bottomY, clipBounds.top)
          : bottomY
        const bottomClearBottom = clipBounds
          ? Math.min(prevScreenY + prev.height, clipBounds.bottom)
          : prevScreenY + prev.height
        // Clip to colored ancestor's bounds - prevents color bleeding
        const clippedClearBottom = Math.min(bottomClearBottom, clipRectBottom)
        const bottomClearHeight = clippedClearBottom - bottomClearY
        if (bottomClearHeight > 0) {
          buffer.fill(layout.x, bottomClearY, prev.width, bottomClearHeight, {
            char: " ",
            bg: clearBg,
          })
        }
      }
    }
  }
  // Render based on node type
  if (node.type === "inkx-box") {
    renderBox(node, buffer, layout, props, clipBounds, scrollOffset, skipBgFill)

    // If scrollable, render overflow indicators
    if (isScrollContainer && node.scrollState) {
      renderScrollIndicators(node, buffer, layout, props, node.scrollState)
    }
  } else if (node.type === "inkx-text") {
    renderText(node, buffer, layout, props, scrollOffset, clipBounds)
  }

  // Render children
  // Pass parentWasPainted so children know they must re-render even if clean.
  // Pass ancestorCleared (or set it based on parentRegionCleared) so descendants
  // can distinguish "buffer is a clone with stale pixels" from "truly fresh buffer".
  if (isScrollContainer && node.scrollState) {
    renderScrollContainerChildren(
      node,
      buffer,
      props,
      clipBounds,
      hasPrevBuffer,
      parentRegionCleared,
      parentWasPainted,
      ancestorCleared,
    )
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
      parentWasPainted,
      ancestorCleared,
    )
  }

  // Clear dirty flags
  node.contentDirty = false
  node.paintDirty = false
  node.subtreeDirty = false
  node.childrenDirty = false
}

/**
 * Render children of a scroll container with proper clipping and offset.
 */
function renderScrollContainerChildren(
  node: InkxNode,
  buffer: TerminalBuffer,
  props: BoxProps,
  clipBounds?: { top: number; bottom: number },
  hasPrevBuffer = false,
  parentRegionCleared = false,
  parentWasPainted = false,
  ancestorCleared = false,
): void {
  const layout = node.contentRect
  const ss = node.scrollState
  if (!layout || !ss) return

  const border = props.borderStyle
    ? getBorderSize(props)
    : { top: 0, bottom: 0, left: 0, right: 0 }
  const padding = getPadding(props)

  // Set up clip bounds for children
  const nodeClip = {
    top: layout.y + border.top + padding.top,
    bottom: layout.y + layout.height - border.bottom - padding.bottom,
  }
  // Intersect with parent clip bounds if present
  const childClipBounds = clipBounds
    ? {
        top: Math.max(clipBounds.top, nodeClip.top),
        bottom: Math.min(clipBounds.bottom, nodeClip.bottom),
      }
    : nodeClip

  // Determine if scroll offset changed since last render.
  const scrollOffsetChanged = ss.offset !== ss.prevOffset

  // Two-tier strategy for scroll container updates:
  //
  // 1. needsViewportClear: scroll offset changed, children restructured, or
  //    parent region was cleared. Must clear viewport and re-render children.
  //    NOTE: subtreeDirty alone does NOT require viewport clear — dirty
  //    descendants handle their own region clearing. Clearing for subtreeDirty
  //    caused a 12ms regression (re-rendering ~50 children vs 2 dirty ones).
  //
  // 2. No clear needed: only subtreeDirty (some descendants changed).
  //    Children use hasPrevBuffer=true and skip via fast-path if clean.
  // Clear viewport when scroll offset changed, children restructured, or
  // parent region was cleared/painted. Both parentRegionCleared and
  // parentWasPainted mean children's pixels were overwritten.
  const needsViewportClear =
    hasPrevBuffer &&
    (scrollOffsetChanged ||
      node.childrenDirty ||
      parentRegionCleared ||
      parentWasPainted)

  const childHasPrev = needsViewportClear ? false : hasPrevBuffer
  // When viewport was cleared, children need to know the buffer is a clone
  // with stale pixels even though hasPrevBuffer=false. This allows descendants
  // to clear their own sub-regions when needed (e.g., card bg changed).
  // NOTE: needsViewportClear already gates on hasPrevBuffer, so when it's true,
  // we know the buffer is a clone (not fresh).
  const childAncestorCleared = needsViewportClear
    ? true
    : ancestorCleared || parentRegionCleared

  if (needsViewportClear) {
    const clearY = childClipBounds.top
    const clearHeight = childClipBounds.bottom - childClipBounds.top
    if (clearHeight > 0) {
      const contentX = layout.x + border.left + padding.left
      const contentWidth =
        layout.width - border.left - border.right - padding.left - padding.right
      const scrollBg = props.backgroundColor
        ? parseColor(props.backgroundColor)
        : findInheritedBg(node).color
      buffer.fill(contentX, clearY, contentWidth, clearHeight, {
        char: " ",
        bg: scrollBg,
      })
    }
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

    // Render visible children with scroll offset applied.
    // Use fast-path (childHasPrev) when scroll offset is unchanged.
    renderNodeToBuffer(
      child,
      buffer,
      ss.offset,
      childClipBounds,
      childHasPrev,
      childAncestorCleared,
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

      // Sticky children always re-render since their effective scroll offset
      // may change even when the container's scroll offset doesn't
      renderNodeToBuffer(
        child,
        buffer,
        stickyScrollOffset,
        childClipBounds,
        false,
        // ancestorCleared: only set when we know the buffer is a clone.
        // On initial render (hasPrevBuffer=false), the buffer is fresh.
        hasPrevBuffer || ancestorCleared,
      )
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
  clipBounds?: { top: number; bottom: number },
  hasPrevBuffer = false,
  childPositionChanged = false,
  parentRegionCleared = false,
  parentWasPainted = false,
  ancestorCleared = false,
): void {
  const layout = node.contentRect
  if (!layout) return

  // For overflow='hidden' containers, calculate clip bounds
  // Must account for scrollOffset since clip checks happen in screen coordinates
  let effectiveClipBounds = clipBounds
  if (props.overflow === "hidden") {
    const border = props.borderStyle
      ? getBorderSize(props)
      : { top: 0, bottom: 0, left: 0, right: 0 }
    const padding = getPadding(props)
    // Adjust layout position by scrollOffset to get screen coordinates
    const adjustedY = layout.y - scrollOffset
    const nodeClip = {
      top: adjustedY + border.top + padding.top,
      bottom: adjustedY + layout.height - border.bottom - padding.bottom,
    }
    // Intersect with parent clip bounds if present
    if (clipBounds) {
      effectiveClipBounds = {
        top: Math.max(clipBounds.top, nodeClip.top),
        bottom: Math.min(clipBounds.bottom, nodeClip.bottom),
      }
    } else {
      effectiveClipBounds = nodeClip
    }
  }

  // Force children to re-render when:
  // - childrenDirty: children added/removed/reordered — old pixels erased
  // - childPositionChanged: sibling shift — gap regions cleared
  // - parentRegionCleared: parent's region was explicitly cleared (no bg fill)
  // - parentWasPainted: parent filled its bg — children's old pixels overwritten
  const parentDidClear =
    node.childrenDirty ||
    childPositionChanged ||
    parentRegionCleared ||
    parentWasPainted
  const childHasPrev = parentDidClear ? false : hasPrevBuffer
  // ancestorCleared tells descendants the buffer has STALE pixels that need
  // clearing. Only set when actual stale pixels exist:
  // - parentRegionCleared: parent cleared (no bg fill) — stale pixels remain
  // - ancestorCleared already true: stale pixels from higher up the tree
  //
  // Do NOT include parentWasPainted: when a parent fills its bg, children's
  // positions have the correct bg (parent's color), not stale pixels.
  // Setting ancestorCleared would cause children to re-fill their regions,
  // which can overwrite parent border cells at boundary positions.
  const childAncestorCleared =
    parentRegionCleared || ancestorCleared

  // Normal rendering - render all children with effective clip bounds.
  // Track whether any sibling was dirty (will be rendered, not skipped).
  // Absolute-positioned children that come after a dirty sibling must repaint
  // because the sibling's render may have overwritten pixels in the cloned buffer
  // that the absolute child also occupies.
  let anySiblingWasDirty = false
  for (const child of node.children) {
    // Check dirty flags BEFORE rendering (render clears them)
    const childIsDirty =
      child.layoutNode &&
      !child.hidden &&
      (child.contentDirty ||
        child.paintDirty ||
        child.subtreeDirty ||
        child.childrenDirty ||
        (child.contentRect &&
          child.prevLayout &&
          !rectEqual(child.prevLayout, child.contentRect)))

    const childProps = child.props as BoxProps
    const isAbsolute = childProps.position === "absolute"

    // Absolute-positioned children must repaint after any dirty sibling
    // because their pixels may have been overwritten in the cloned buffer
    const forceRepaint = childHasPrev && isAbsolute && anySiblingWasDirty

    renderNodeToBuffer(
      child,
      buffer,
      scrollOffset,
      effectiveClipBounds,
      forceRepaint ? false : childHasPrev,
      forceRepaint ? true : childAncestorCleared,
    )

    if (childIsDirty) {
      anySiblingWasDirty = true
    }
  }
}
