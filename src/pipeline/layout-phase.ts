/**
 * Phase 2: Layout Phase
 *
 * Run Yoga layout calculation and propagate dimensions to all nodes.
 */

import { createLogger } from "@beorn/logger"
import { measureStats } from "../reconciler/nodes.js"
import { type BoxProps, type InkxNode, type Rect, rectEqual } from "../types.js"
import { getBorderSize, getPadding } from "./helpers.js"

const log = createLogger("inkx:layout")

/**
 * Run Yoga layout calculation and propagate dimensions to all nodes.
 *
 * @param root The root InkxNode
 * @param width Terminal width in columns
 * @param height Terminal height in rows
 */
export function layoutPhase(root: InkxNode, width: number, height: number): void {
  // Check if dimensions changed from previous layout
  const prevLayout = root.contentRect
  const dimensionsChanged = prevLayout && (prevLayout.width !== width || prevLayout.height !== height)

  // Only recalculate if something changed (dirty nodes or dimensions)
  if (!dimensionsChanged && !hasLayoutDirtyNodes(root)) {
    return
  }

  // Run layout calculation (root always has a layoutNode)
  if (root.layoutNode) {
    const nodeCount = countNodes(root)
    measureStats.reset()
    const t0 = Date.now()
    root.layoutNode.calculateLayout(width, height)
    const elapsed = Date.now() - t0
    log.debug?.(
      `calculateLayout: ${elapsed}ms (${nodeCount} nodes) measure: calls=${measureStats.calls} hits=${measureStats.cacheHits} collects=${measureStats.textCollects} displayWidth=${measureStats.displayWidthCalls}`,
    )
  }

  // Propagate computed dimensions to all nodes
  propagateLayout(root, 0, 0)

  // NOTE: Subscribers are NOT notified here anymore.
  // They are notified in executeRender AFTER screenRectPhase completes,
  // so useScreenRectCallback can read the correct screen positions.
}

/**
 * Count total nodes in tree.
 */
function countNodes(node: InkxNode): number {
  let count = 1
  for (const child of node.children) {
    count += countNodes(child)
  }
  return count
}

/**
 * Check if any node in the tree has layoutDirty flag set.
 */
function hasLayoutDirtyNodes(node: InkxNode, path = "root"): boolean {
  if (node.layoutDirty) {
    const props = node.props as BoxProps
    log.debug?.(`dirty node found: ${path} (id=${props.id ?? "?"}, type=${node.type})`)
    return true
  }
  for (let i = 0; i < node.children.length; i++) {
    if (hasLayoutDirtyNodes(node.children[i]!, `${path}[${i}]`)) return true
  }
  return false
}

/**
 * Propagate computed layout from Yoga nodes to InkxNodes.
 * Sets contentRect (content-relative position) on each node.
 *
 * @param node The node to process
 * @param parentX Absolute X position of parent
 * @param parentY Absolute Y position of parent
 */
function propagateLayout(node: InkxNode, parentX: number, parentY: number): void {
  // Save previous layout for change detection
  node.prevLayout = node.contentRect

  // Virtual/raw text nodes (no layoutNode) inherit parent's position
  if (!node.layoutNode) {
    const rect: Rect = {
      x: parentX,
      y: parentY,
      width: 0,
      height: 0,
    }
    node.contentRect = rect
    node.layoutDirty = false
    // Still recurse to children (virtual text nodes can have raw text children)
    for (const child of node.children) {
      propagateLayout(child, parentX, parentY)
    }
    return
  }

  // Compute absolute position from Yoga (content-relative)
  const rect: Rect = {
    x: parentX + node.layoutNode.getComputedLeft(),
    y: parentY + node.layoutNode.getComputedTop(),
    width: node.layoutNode.getComputedWidth(),
    height: node.layoutNode.getComputedHeight(),
  }
  node.contentRect = rect

  // Clear layout dirty flag
  node.layoutDirty = false

  // Set authoritative "layout changed this frame" flag.
  // Unlike !rectEqual(prevLayout, contentRect) which becomes stale when
  // layout phase skips on subsequent frames, this flag is explicitly set
  // each time propagateLayout runs and cleared by the content phase.
  node.layoutChangedThisFrame = !!(node.prevLayout && !rectEqual(node.prevLayout, node.contentRect))

  // When layout changes, mark ancestors subtreeDirty so contentPhase doesn't
  // fast-path skip them. Without this, a deeply nested node whose dimensions
  // change (e.g., width 3→4) would never be re-rendered because all ancestors
  // appear clean — their own layout didn't change, just a descendant's did.
  if (node.layoutChangedThisFrame) {
    let ancestor = node.parent
    while (ancestor && !ancestor.subtreeDirty) {
      ancestor.subtreeDirty = true
      ancestor = ancestor.parent
    }
  }

  // Recurse to children
  for (const child of node.children) {
    propagateLayout(child, rect.x, rect.y)
  }
}

/**
 * Notify all layout subscribers of dimension changes.
 *
 * Called from executeRender AFTER screenRectPhase completes,
 * so useScreenRectCallback can read correct screen positions.
 *
 * Notifies when EITHER contentRect or screenRect changed.
 * screenRect can change from scroll offset changes even when
 * contentRect stays the same — subscribers (like useScreenRectCallback)
 * need notification in both cases.
 */
export function notifyLayoutSubscribers(node: InkxNode): void {
  // Notify if content rect OR screen rect changed
  const contentChanged = !rectEqual(node.prevLayout, node.contentRect)
  const screenChanged = !rectEqual(node.prevScreenRect, node.screenRect)
  if (contentChanged || screenChanged) {
    for (const subscriber of node.layoutSubscribers) {
      subscriber()
    }
  }

  // Recurse to children
  for (const child of node.children) {
    notifyLayoutSubscribers(child)
  }
}

// Re-export from types
export { rectEqual } from "../types.js"

// ============================================================================
// Phase 2.5: Scroll Phase (for overflow='scroll' containers)
// ============================================================================

/**
 * Options for scrollPhase.
 */
export interface ScrollPhaseOptions {
  /**
   * Skip state updates (for fresh render comparisons).
   * When true, calculates scroll positions but doesn't mutate node.scrollState.
   * Default: false
   */
  skipStateUpdates?: boolean
}

/**
 * Calculate scroll state for all overflow='scroll' containers.
 *
 * This phase runs after layout to determine which children are visible
 * within each scrollable container.
 */
export function scrollPhase(root: InkxNode, options: ScrollPhaseOptions = {}): void {
  const { skipStateUpdates = false } = options
  traverseTree(root, (node) => {
    const props = node.props as BoxProps
    if (props.overflow !== "scroll") return

    // Calculate scroll state for this container
    calculateScrollState(node, props, skipStateUpdates)
  })
}

/**
 * Calculate scroll state for a single scrollable container.
 */
function calculateScrollState(node: InkxNode, props: BoxProps, skipStateUpdates: boolean): void {
  const layout = node.contentRect
  if (!layout || !node.layoutNode) return

  // Calculate viewport (container minus borders/padding)
  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
  const padding = getPadding(props)

  const rawViewportHeight = layout.height - border.top - border.bottom - padding.top - padding.bottom

  // Calculate total content height and child positions
  let contentHeight = 0
  const childPositions: {
    child: InkxNode
    top: number
    bottom: number
    index: number
    isSticky: boolean
    stickyTop?: number
    stickyBottom?: number
  }[] = []

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!
    if (!child.layoutNode || !child.contentRect) continue

    const childTop = child.contentRect.y - layout.y - border.top - padding.top
    const childBottom = childTop + child.contentRect.height
    const childProps = child.props as BoxProps

    childPositions.push({
      child: child!,
      top: childTop,
      bottom: childBottom,
      index: i,
      isSticky: childProps.position === "sticky",
      stickyTop: childProps.stickyTop,
      stickyBottom: childProps.stickyBottom,
    })

    contentHeight = Math.max(contentHeight, childBottom)
  }

  const viewportHeight = rawViewportHeight

  // Reserve 1 row at the bottom for the overflow indicator when:
  // 1. Container uses borderless overflow indicators (overflowIndicator prop)
  // 2. Content exceeds viewport (there will be hidden items below or above)
  // This ensures the indicator doesn't overlay the last visible child's content.
  const showBorderlessIndicator = props.overflowIndicator === true && !props.borderStyle
  const hasOverflow = contentHeight > rawViewportHeight
  const indicatorReserve = showBorderlessIndicator && hasOverflow ? 1 : 0

  // Calculate scroll offset based on scrollTo prop
  // Use "ensure visible" scrolling: only scroll when target would be off-screen
  // Preserve previous offset when target is already visible
  //
  // Priority:
  // 1. If scrollTo is defined: use edge-based scrolling to ensure child is visible
  // 2. If scrollOffset is defined: use explicit offset (for frozen scroll state)
  // 3. Otherwise: use previous offset or default to 0
  const prevOffset = node.scrollState?.offset
  const explicitOffset = props.scrollOffset
  let scrollOffset = explicitOffset ?? prevOffset ?? 0
  const scrollTo = props.scrollTo

  if (scrollTo !== undefined && scrollTo >= 0 && scrollTo < childPositions.length) {
    // Find the target child
    const target = childPositions.find((c) => c.index === scrollTo)
    if (target) {
      // Calculate current visible range, accounting for indicator reserve.
      // The effective visible height is reduced by indicatorReserve so the
      // scrollTo target is fully visible ABOVE the overflow indicator row.
      const effectiveHeight = viewportHeight - indicatorReserve
      const visibleTop = scrollOffset
      const visibleBottom = scrollOffset + effectiveHeight

      // Only scroll if target is outside visible range
      if (target.top < visibleTop) {
        // Target is above viewport - scroll up to show it at top
        scrollOffset = target.top
      } else if (target.bottom > visibleBottom) {
        // Target is below viewport - scroll down to show it at bottom
        scrollOffset = target.bottom - effectiveHeight
      }
      // Otherwise, keep current scroll position (target is visible)

      // Clamp to valid range
      scrollOffset = Math.max(0, scrollOffset)
      scrollOffset = Math.min(scrollOffset, Math.max(0, contentHeight - viewportHeight))
    }
  }

  // Determine visible children.
  // When the overflow indicator reserves a row (indicatorReserve=1), reduce the
  // visible bottom by 1 so the indicator has its own row after the last visible child.
  const visibleTop = scrollOffset
  const visibleBottom = scrollOffset + viewportHeight - indicatorReserve

  let firstVisible = -1
  let lastVisible = -1
  let hiddenAbove = 0
  let hiddenBelow = 0

  for (const cp of childPositions) {
    // Sticky children are always considered "visible" for rendering purposes
    if (cp.isSticky) {
      if (firstVisible === -1) firstVisible = cp.index
      lastVisible = Math.max(lastVisible, cp.index)
      continue
    }

    // Skip zero-height children from hidden counts — they have no visual
    // presence and would produce spurious overflow indicators (e.g., a
    // zero-height child at position 0 has top=0, bottom=0, and 0 <= 0
    // would incorrectly count it as "hidden above").
    if (cp.top === cp.bottom) {
      continue
    }

    if (cp.bottom <= visibleTop) {
      hiddenAbove++
    } else if (cp.top >= visibleBottom) {
      hiddenBelow++
    } else if (cp.top < visibleTop) {
      // Child is partially visible at top — render it (clipped by scroll
      // container's clip bounds) so partial content is visible instead of blank space
      if (firstVisible === -1) firstVisible = cp.index
      lastVisible = Math.max(lastVisible, cp.index)
    } else if (cp.bottom > visibleBottom) {
      // Child is partially visible at bottom — render it (clipped by scroll
      // container's clip bounds) so partial content is visible instead of blank space.
      // When indicatorReserve is active, this child extends past the reserved row,
      // but we still render it — the overflow indicator renders AFTER children and
      // overlays the appropriate row.
      if (firstVisible === -1) firstVisible = cp.index
      lastVisible = cp.index
      // When indicator reserve is active, count partially visible bottom children
      // in hiddenBelow so the indicator shows the correct count.
      if (indicatorReserve > 0) {
        hiddenBelow++
      }
    } else {
      // This child is fully visible within the viewport
      if (firstVisible === -1) firstVisible = cp.index
      lastVisible = cp.index
    }
  }

  // Calculate sticky children render positions
  const stickyChildren: NonNullable<InkxNode["scrollState"]>["stickyChildren"] = []

  for (const cp of childPositions) {
    if (!cp.isSticky) continue

    const childHeight = cp.bottom - cp.top
    const stickyTop = cp.stickyTop ?? 0
    const stickyBottom = cp.stickyBottom

    // Natural position: where it would be without sticking (relative to viewport)
    const naturalRenderY = cp.top - scrollOffset

    let renderOffset: number

    if (stickyBottom !== undefined) {
      // Sticky to bottom: element pins to bottom edge when scrolled past
      const bottomPinPosition = viewportHeight - stickyBottom - childHeight
      // Use natural position if it's below the pin point, otherwise pin
      renderOffset = Math.min(naturalRenderY, bottomPinPosition)
    } else if (naturalRenderY >= stickyTop) {
      // Child hasn't reached stick point: use natural position
      renderOffset = naturalRenderY
    } else if (childHeight > viewportHeight) {
      // Oversized sticky-top child scrolled past stick point: progressively
      // scroll the child so its bottom aligns with viewport bottom when
      // scrolled far enough. Clamp between bottom-align and stick point.
      renderOffset = Math.max(viewportHeight - childHeight, naturalRenderY)
    } else {
      // Normal sticky-top child scrolled past stick point: pin at stickyTop
      renderOffset = stickyTop
    }

    // Clamp to viewport bounds — only when element is actually sticking.
    // Elements at their natural position below the viewport must NOT be
    // pulled up into view by clamping (that would overwrite other children's
    // pixels, corrupting incremental rendering's buffer shift).
    const isSticking = renderOffset !== naturalRenderY
    if (isSticking) {
      if (childHeight > viewportHeight) {
        renderOffset = Math.max(viewportHeight - childHeight, renderOffset)
      } else {
        renderOffset = Math.max(0, Math.min(renderOffset, viewportHeight - childHeight))
      }
    }

    // Skip off-screen sticky children — they're not visible and shouldn't
    // be rendered (would corrupt other children's pixels in the buffer).
    if (renderOffset + childHeight <= 0 || renderOffset >= viewportHeight) continue

    stickyChildren.push({
      index: cp.index,
      renderOffset,
      naturalTop: cp.top,
      height: childHeight,
    })
  }

  // Skip state updates for fresh render comparisons (INKX_STRICT)
  if (skipStateUpdates) return

  // Track previous visible range for incremental rendering
  const prevFirstVisible = node.scrollState?.firstVisibleChild ?? firstVisible
  const prevLastVisible = node.scrollState?.lastVisibleChild ?? lastVisible

  // Mark node dirty if scroll offset or visible range changed (for incremental rendering)
  // Without this, contentPhase would skip the container and children would
  // remain at their old pixel positions in the cloned buffer
  if (scrollOffset !== prevOffset || firstVisible !== prevFirstVisible || lastVisible !== prevLastVisible) {
    node.subtreeDirty = true
  }

  // Store scroll state (preserve previous offset and visible range for incremental rendering)
  node.scrollState = {
    offset: scrollOffset,
    prevOffset: prevOffset ?? scrollOffset,
    contentHeight,
    viewportHeight,
    firstVisibleChild: firstVisible,
    lastVisibleChild: lastVisible,
    prevFirstVisibleChild: prevFirstVisible,
    prevLastVisibleChild: prevLastVisible,
    hiddenAbove,
    hiddenBelow,
    stickyChildren: stickyChildren.length > 0 ? stickyChildren : undefined,
  }
}

// ============================================================================
// Phase 2.55: Sticky Phase (for non-scroll containers with sticky children)
// ============================================================================

/**
 * Compute sticky offsets for non-scroll containers that have sticky children.
 *
 * Scroll containers handle their own sticky logic in calculateScrollState().
 * This phase handles the remaining case: parents that are NOT overflow="scroll"
 * but still contain position="sticky" children with stickyBottom.
 *
 * For non-scroll containers, sticky means: pin the child to the parent's bottom
 * edge when content is shorter than the parent. When content fills the parent,
 * the child stays at its natural position.
 */
export function stickyPhase(root: InkxNode): void {
  traverseTree(root, (node) => {
    const props = node.props as BoxProps
    // Skip scroll containers — they handle sticky in scrollPhase
    if (props.overflow === "scroll") return

    // Check if any children are sticky with stickyBottom
    let hasStickyChildren = false
    for (const child of node.children) {
      const childProps = child.props as BoxProps
      if (childProps.position === "sticky" && childProps.stickyBottom !== undefined) {
        hasStickyChildren = true
        break
      }
    }

    if (!hasStickyChildren) {
      // Clear stale data if previously had sticky children
      if (node.stickyChildren !== undefined) {
        node.stickyChildren = undefined
        node.subtreeDirty = true
      }
      return
    }

    const layout = node.contentRect
    if (!layout || !node.layoutNode) return

    const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
    const padding = getPadding(props)
    const parentContentHeight = layout.height - border.top - border.bottom - padding.top - padding.bottom

    const newStickyChildren: NonNullable<InkxNode["stickyChildren"]> = []

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]!
      const childProps = child.props as BoxProps
      if (childProps.position !== "sticky") continue
      if (childProps.stickyBottom === undefined) continue

      if (!child.contentRect) continue

      // Natural position relative to parent content area
      const naturalY = child.contentRect.y - layout.y - border.top - padding.top
      const childHeight = child.contentRect.height
      const stickyBottom = childProps.stickyBottom

      // Pin position: where the child would be if pinned to parent bottom
      const bottomPin = parentContentHeight - stickyBottom - childHeight
      // Child pins to bottom when content is short (naturalY < bottomPin)
      // Stays at natural position when content fills parent (naturalY >= bottomPin)
      const renderOffset = Math.max(naturalY, bottomPin)

      newStickyChildren.push({
        index: i,
        renderOffset,
        naturalTop: naturalY,
        height: childHeight,
      })
    }

    // Compare with previous value to detect changes
    const prev = node.stickyChildren
    const next = newStickyChildren.length > 0 ? newStickyChildren : undefined

    const changed = !stickyChildrenEqual(prev, next)
    node.stickyChildren = next

    if (changed) {
      node.subtreeDirty = true
    }
  })
}

/**
 * Compare two stickyChildren arrays for equality.
 */
function stickyChildrenEqual(
  a: InkxNode["stickyChildren"],
  b: InkxNode["stickyChildren"],
): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    const bi = b[i]!
    if (
      ai.index !== bi.index ||
      ai.renderOffset !== bi.renderOffset ||
      ai.naturalTop !== bi.naturalTop ||
      ai.height !== bi.height
    ) {
      return false
    }
  }
  return true
}

/**
 * Traverse tree in depth-first order.
 */
function traverseTree(node: InkxNode, callback: (node: InkxNode) => void): void {
  callback(node)
  for (const child of node.children) {
    traverseTree(child, callback)
  }
}

// ============================================================================
// Phase 2.6: Screen Rect Phase
// ============================================================================

/**
 * Calculate screen-relative positions for all nodes.
 *
 * This phase runs after scroll phase to compute where each node actually
 * appears on the terminal screen, accounting for all ancestor scroll offsets.
 *
 * Screen position = content position - sum of ancestor scroll offsets
 */
export function screenRectPhase(root: InkxNode): void {
  propagateScreenRect(root, 0)
}

/**
 * Propagate screen-relative positions through the tree.
 *
 * @param node The node to process
 * @param ancestorScrollOffset Sum of all ancestor scroll offsets
 */
function propagateScreenRect(node: InkxNode, ancestorScrollOffset: number): void {
  // Save previous screen rect for change detection in notifyLayoutSubscribers
  node.prevScreenRect = node.screenRect

  const content = node.contentRect
  if (!content) {
    node.screenRect = null
    for (const child of node.children) {
      propagateScreenRect(child, ancestorScrollOffset)
    }
    return
  }

  // Compute screen position by subtracting ancestor scroll offsets
  node.screenRect = {
    x: content.x,
    y: content.y - ancestorScrollOffset,
    width: content.width,
    height: content.height,
  }

  // If this node is a scroll container, add its offset for children
  const scrollOffset = node.scrollState?.offset ?? 0
  const childScrollOffset = ancestorScrollOffset + scrollOffset

  // Recurse to children
  for (const child of node.children) {
    propagateScreenRect(child, childScrollOffset)
  }
}
