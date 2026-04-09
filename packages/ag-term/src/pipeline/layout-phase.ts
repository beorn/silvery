/**
 * Phase 2: Layout Phase
 *
 * Run Yoga layout calculation and propagate dimensions to all nodes.
 */

import { createLogger } from "loggily"
import { measureStats } from "./measure-stats"
import { type BoxProps, type AgNode, type Rect, rectEqual } from "@silvery/ag/types"
import { hasLayoutDirty, clearLayoutDirtyTracking } from "@silvery/ag/dirty-tracking"
import { getBorderSize, getPadding } from "./helpers"

const log = createLogger("silvery:layout")

/**
 * Run Yoga layout calculation and propagate dimensions to all nodes.
 *
 * @param root The root SilveryNode
 * @param width Terminal width in columns
 * @param height Terminal height in rows
 */
export function layoutPhase(root: AgNode, width: number, height: number): void {
  // Check if dimensions changed from previous layout
  const prevLayout = root.contentRect
  const dimensionsChanged = prevLayout && (prevLayout.width !== width || prevLayout.height !== height)

  // Only recalculate if something changed (dirty nodes or dimensions).
  // hasLayoutDirty() is O(1) via the module-level dirty set, replacing
  // the previous O(N) hasLayoutDirtyNodes() tree walk.
  if (!dimensionsChanged && !hasLayoutDirty()) {
    return
  }

  // Clear layout dirty tracking now that we've committed to running layout.
  // This prevents stale entries from persisting if layout runs but the
  // reconciler doesn't set new flags before the next frame.
  clearLayoutDirtyTracking()

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
  // They are notified in executeRender AFTER scrollrectPhase completes,
  // so useScrollRectCallback can read the correct screen positions.
}

/**
 * Count total nodes in tree.
 */
function countNodes(node: AgNode): number {
  let count = 1
  for (const child of node.children) {
    count += countNodes(child)
  }
  return count
}

/**
 * Check if any node in the tree has layoutDirty flag set.
 * @deprecated Replaced by hasLayoutDirty() from @silvery/ag/dirty-tracking for O(1) checks.
 *   Kept for debugging — walks the full tree and logs dirty nodes.
 */
function hasLayoutDirtyNodes(node: AgNode, path = "root"): boolean {
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
 * Propagate computed layout from Yoga nodes to SilveryNodes.
 * Sets contentRect (content-relative position) on each node.
 *
 * @param node The node to process
 * @param parentX Absolute X position of parent
 * @param parentY Absolute Y position of parent
 */
function propagateLayout(node: AgNode, parentX: number, parentY: number): void {
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
  // each time propagateLayout runs and cleared by the render phase.
  node.layoutChangedThisFrame = !!(node.prevLayout && !rectEqual(node.prevLayout, node.contentRect))

  // STRICT invariant: if layoutChangedThisFrame is true, prevLayout must differ from contentRect.
  // This validates that the flag is consistent with the actual rect comparison. A violation
  // would mean the flag is set spuriously, causing unnecessary re-renders and cascade propagation.
  if (process?.env?.SILVERY_STRICT && node.layoutChangedThisFrame) {
    if (rectEqual(node.prevLayout, node.contentRect)) {
      const props = node.props as BoxProps
      throw new Error(
        `[SILVERY_STRICT] layoutChangedThisFrame=true but prevLayout equals contentRect ` +
          `(node: ${props.id ?? node.type}, rect: ${JSON.stringify(node.contentRect)})`,
      )
    }
  }

  // When layout changes, mark ancestors subtreeDirty so renderPhase doesn't
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
 * Called from executeRender AFTER scrollrectPhase completes,
 * so useScrollRectCallback can read correct screen positions.
 *
 * Notifies when EITHER contentRect, scrollRect, or screenRect changed.
 * scrollRect can change from scroll offset changes even when
 * contentRect stays the same — subscribers (like useScrollRectCallback)
 * need notification in both cases. screenRect can change from sticky
 * offset changes even when scrollRect stays the same.
 */
export function notifyLayoutSubscribers(node: AgNode): void {
  // Notify if content rect, screen rect, or render rect changed
  const contentChanged = !rectEqual(node.prevLayout, node.contentRect)
  const screenChanged = !rectEqual(node.prevScrollRect, node.scrollRect)
  const renderChanged = !rectEqual(node.prevScreenRect, node.screenRect)
  if (contentChanged || screenChanged || renderChanged) {
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
export { rectEqual } from "@silvery/ag/types"

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
export function scrollPhase(root: AgNode, options: ScrollPhaseOptions = {}): void {
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
function calculateScrollState(node: AgNode, props: BoxProps, skipStateUpdates: boolean): void {
  const layout = node.contentRect
  if (!layout || !node.layoutNode) return

  // Calculate viewport (container minus borders/padding)
  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
  const padding = getPadding(props)

  const rawViewportHeight = layout.height - border.top - border.bottom - padding.top - padding.bottom

  // Calculate total content height and child positions
  let contentHeight = 0
  const childPositions: {
    child: AgNode
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
    }
  }

  // Clamp to valid range — applies to both scrollTo and explicit scrollOffset.
  // Without this, explicit scrollOffset can scroll past content into blank space.
  scrollOffset = Math.max(0, scrollOffset)
  scrollOffset = Math.min(scrollOffset, Math.max(0, contentHeight - viewportHeight))

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
  const stickyChildren: NonNullable<AgNode["scrollState"]>["stickyChildren"] = []

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

  // Skip state updates for fresh render comparisons (SILVERY_STRICT)
  if (skipStateUpdates) return

  // Track previous visible range for incremental rendering
  const prevFirstVisible = node.scrollState?.firstVisibleChild ?? firstVisible
  const prevLastVisible = node.scrollState?.lastVisibleChild ?? lastVisible

  // Mark node dirty if scroll offset or visible range changed (for incremental rendering)
  // Without this, renderPhase would skip the container and children would
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
export function stickyPhase(root: AgNode): void {
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

    const newStickyChildren: NonNullable<AgNode["stickyChildren"]> = []

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
function stickyChildrenEqual(a: AgNode["stickyChildren"], b: AgNode["stickyChildren"]): boolean {
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
function traverseTree(node: AgNode, callback: (node: AgNode) => void): void {
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
 * Also computes `screenRect` which accounts for sticky render offsets.
 * For non-sticky nodes, screenRect === scrollRect. For sticky nodes,
 * screenRect reflects the actual pixel position where the node is painted.
 *
 * Screen position = content position - sum of ancestor scroll offsets
 */
export function scrollrectPhase(root: AgNode): void {
  propagateScrollRect(root, 0)
}

/**
 * Propagate screen-relative positions through the tree.
 *
 * @param node The node to process
 * @param ancestorScrollOffset Sum of all ancestor scroll offsets
 */
function propagateScrollRect(node: AgNode, ancestorScrollOffset: number): void {
  // Save previous rects for change detection in notifyLayoutSubscribers
  node.prevScrollRect = node.scrollRect
  node.prevScreenRect = node.screenRect

  const content = node.contentRect
  if (!content) {
    node.scrollRect = null
    node.screenRect = null
    for (const child of node.children) {
      propagateScrollRect(child, ancestorScrollOffset)
    }
    return
  }

  // Compute screen position by subtracting ancestor scroll offsets
  node.scrollRect = {
    x: content.x,
    y: content.y - ancestorScrollOffset,
    width: content.width,
    height: content.height,
  }

  // Default: screenRect equals scrollRect (overridden below for sticky nodes)
  node.screenRect = node.scrollRect

  // If this node is a scroll container, add its offset for children
  const scrollOffset = node.scrollState?.offset ?? 0
  const childScrollOffset = ancestorScrollOffset + scrollOffset

  // Compute screenRect for sticky children.
  // Sticky nodes render at a computed offset instead of their layout position.
  // The offset data lives on the parent (this node) in either scrollState.stickyChildren
  // (for scroll containers) or node.stickyChildren (for non-scroll parents).
  computeStickyScreenRects(node)

  // Recurse to children
  for (const child of node.children) {
    propagateScrollRect(child, childScrollOffset)
  }
}

/**
 * Compute screenRect for sticky children of a node.
 *
 * For sticky children, the actual render position differs from the layout
 * position (scrollRect). The renderOffset from the scroll/sticky phase
 * determines where pixels are actually painted. This function sets
 * screenRect on those children to reflect the true screen position.
 *
 * @param parent The parent node whose sticky children need screenRect computation
 */
function computeStickyScreenRects(parent: AgNode): void {
  // Determine which sticky children list to use
  const stickyList = parent.scrollState?.stickyChildren ?? parent.stickyChildren
  if (!stickyList || stickyList.length === 0) return

  // Calculate the parent's content area origin on screen (inside border/padding)
  const parentScrollRect = parent.scrollRect
  if (!parentScrollRect) return

  const props = parent.props as BoxProps
  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
  const padding = getPadding(props)
  const contentOriginY = parentScrollRect.y + border.top + padding.top

  for (const sticky of stickyList) {
    const child = parent.children[sticky.index]
    if (!child?.scrollRect) continue

    // screenRect has the same x, width, height as scrollRect,
    // but Y is adjusted to the sticky render position
    child.screenRect = {
      x: child.scrollRect.x,
      y: contentOriginY + sticky.renderOffset,
      width: child.scrollRect.width,
      height: child.scrollRect.height,
    }
  }
}
