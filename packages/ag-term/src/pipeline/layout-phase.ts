/**
 * Phase 2: Layout Phase
 *
 * Run Yoga layout calculation and propagate dimensions to all nodes.
 */

import { createLogger } from "loggily"
import { measureStats } from "./measure-stats"
import { type BoxProps, type AgNode, type Rect, rectEqual } from "@silvery/ag/types"
// Layout dirty gate: Flexily's root.layoutNode.isDirty() is the sole source
// of truth. No silvery-side layout dirty tracking needed.
import {
  getRenderEpoch,
  INITIAL_EPOCH,
  isCurrentEpoch,
  isDirty,
  SUBTREE_BIT,
  CHILDREN_BIT,
  ABS_CHILD_BIT,
  DESC_OVERFLOW_BIT,
} from "@silvery/ag/epoch"
import { getBorderSize, getPadding } from "./helpers"
import { syncDecorationRects, syncRectSignals } from "@silvery/ag/layout-signals"
import { recordPassCause, INSTRUMENT } from "../runtime/pass-cause"

const log = createLogger("silvery:layout")

/**
 * Stable-ish identity string for an AgNode used by pass-cause records.
 * Prefers explicit identity props (testid / id / name / nodeId) and falls
 * back to type. Keeps the histogram readable without paying a Map lookup
 * per node when SILVERY_INSTRUMENT is unset (call site is gated by the
 * inert no-op in `recordPassCause`).
 */
function nodeIdent(node: AgNode): string {
  const props = node.props as Record<string, unknown> | undefined
  const ident =
    (props?.["testid"] as string | undefined) ??
    (props?.["id"] as string | undefined) ??
    (props?.["name"] as string | undefined) ??
    (props?.["nodeId"] as string | undefined)
  return ident ? `${node.type}#${ident}` : node.type
}

/**
 * Run Yoga layout calculation and propagate dimensions to all nodes.
 *
 * @param root The root SilveryNode
 * @param width Terminal width in columns
 * @param height Terminal height in rows
 */
export function layoutPhase(root: AgNode, width: number, height: number): void {
  // Check if dimensions changed from previous layout
  const prevLayout = root.boxRect
  const dimensionsChanged =
    prevLayout && (prevLayout.width !== width || prevLayout.height !== height)

  // Only recalculate if something changed (dirty nodes or dimensions).
  // Flexily's root isDirty() propagates from any markDirty() call —
  // no silvery-side tracking needed.
  if (!dimensionsChanged && !root.layoutNode?.isDirty()) {
    // Even when layout is clean, style-only changes (outline add/remove,
    // absolute child structural changes) need cascade input caching.
    // These checks run in propagateLayout normally, but when the layout
    // phase skips, they're never computed. Run a lightweight traversal
    // that follows only subtreeDirty paths to cache these inputs.
    if (isDirty(root.dirtyBits, root.dirtyEpoch, SUBTREE_BIT)) {
      propagateCascadeInputs(root)
    }
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

  // Propagate computed dimensions to all nodes.
  // When dimensions haven't changed, enable incremental skip: subtrees
  // whose Flexily-computed rect matches their existing boxRect are skipped
  // entirely (O(1) rect comparison prunes O(subtree) walk).
  // On dimension change, the root constraint changed so all nodes may get
  // new results — skip nothing, propagate the full tree.
  const incrementalSkip = !dimensionsChanged
  propagateLayout(root, 0, 0, incrementalSkip)

  // NOTE: Subscribers are NOT notified here anymore.
  // They are notified by the pipeline AFTER scrollrectPhase completes,
  // so useScrollRect can read the correct screen positions.
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
 * Propagate computed layout from Yoga nodes to SilveryNodes.
 * Sets boxRect (content-relative position) on each node.
 *
 * When `incrementalSkip` is true, nodes whose Flexily-computed rect matches
 * their existing boxRect can skip the entire subtree — their layout is
 * unchanged. This converts the O(N) tree walk into O(dirty) for frames
 * where only a few nodes changed layout.
 *
 * The skip is safe because:
 * - Flexily's internal fingerprint caching guarantees identical output for
 *   subtrees whose inputs didn't change
 * - If the parent's rect matches, all descendants' rects also match
 *   (Flexily computes absolute positions from parent dimensions)
 * - prevLayout and layoutChangedThisFrame (stale epoch, won't match
 *   current) all retain correct values
 *
 * @param node The node to process
 * @param parentX Absolute X position of parent
 * @param parentY Absolute Y position of parent
 * @param incrementalSkip When true, skip subtrees where Flexily results match existing boxRect
 */
function propagateLayout(
  node: AgNode,
  parentX: number,
  parentY: number,
  incrementalSkip: boolean,
): void {
  // Virtual/raw text nodes (no layoutNode) inherit parent's position
  if (!node.layoutNode) {
    // Save previous layout for change detection
    node.prevLayout = node.boxRect
    const rect: Rect = {
      x: parentX,
      y: parentY,
      width: 0,
      height: 0,
    }
    node.boxRect = rect
    // Still recurse to children (virtual text nodes can have raw text children)
    for (const child of node.children) {
      propagateLayout(child, parentX, parentY, incrementalSkip)
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

  // Container-level layout skip: if incremental mode is enabled and this
  // node's Flexily-computed rect matches the existing boxRect, the entire
  // subtree is unchanged. Skip propagation — all descendants retain correct
  // prevLayout, boxRect, and layoutChangedThisFrame (stale epoch) from the
  // previous frame.
  //
  // This check is O(1) per node (4 number comparisons + 1 epoch check) and
  // prunes entire subtrees, converting propagateLayout from O(N) to O(changed).
  // Note: prevLayout is already synced to boxRect by syncPrevLayout() at
  // the end of the previous render pass, so skipping is safe.
  //
  // subtreeDirtyEpoch guard: even when this node's rect is unchanged, a
  // descendant may need processing (e.g., new child mounted via appendChild).
  // The reconciler's markSubtreeDirty propagates the current epoch upward,
  // so checking subtreeDirtyEpoch ensures we don't skip over dirty descendants.
  if (
    incrementalSkip &&
    node.boxRect &&
    !isDirty(node.dirtyBits, node.dirtyEpoch, SUBTREE_BIT) &&
    !isDirty(node.dirtyBits, node.dirtyEpoch, CHILDREN_BIT)
  ) {
    if (
      rect.x === node.boxRect.x &&
      rect.y === node.boxRect.y &&
      rect.width === node.boxRect.width &&
      rect.height === node.boxRect.height
    ) {
      return
    }
  }

  // Save previous layout for change detection (must happen AFTER the skip
  // check above — skipped nodes don't need prevLayout updated since
  // syncPrevLayout already set prevLayout = boxRect after the previous frame)
  node.prevLayout = node.boxRect
  node.boxRect = rect

  // Set authoritative "layout changed this frame" epoch stamp.
  // Unlike !rectEqual(prevLayout, boxRect) which becomes stale when
  // layout phase skips on subsequent frames, this epoch is explicitly set
  // each time propagateLayout runs and expires when the render epoch advances.
  const layoutDidChange = !!(node.prevLayout && !rectEqual(node.prevLayout, node.boxRect))
  node.layoutChangedThisFrame = layoutDidChange ? getRenderEpoch() : INITIAL_EPOCH

  // STRICT invariant: if layoutChangedThisFrame is current epoch, prevLayout must differ from boxRect.
  // This validates that the flag is consistent with the actual rect comparison. A violation
  // would mean the flag is set spuriously, causing unnecessary re-renders and cascade propagation.
  if (process?.env?.SILVERY_STRICT && isCurrentEpoch(node.layoutChangedThisFrame)) {
    if (rectEqual(node.prevLayout, node.boxRect)) {
      const props = node.props as BoxProps
      throw new Error(
        `[SILVERY_STRICT] layoutChangedThisFrame=true but prevLayout equals boxRect ` +
          `(node: ${props.id ?? node.type}, rect: ${JSON.stringify(node.boxRect)})`,
      )
    }
  }

  // When layout changes, mark ancestors subtreeDirty so renderPhase doesn't
  // fast-path skip them. Without this, a deeply nested node whose dimensions
  // change (e.g., width 3→4) would never be re-rendered because all ancestors
  // appear clean — their own layout didn't change, just a descendant's did.
  if (isCurrentEpoch(node.layoutChangedThisFrame)) {
    const epoch = getRenderEpoch()
    let ancestor = node.parent
    while (ancestor && !isDirty(ancestor.dirtyBits, ancestor.dirtyEpoch, SUBTREE_BIT)) {
      if (ancestor.dirtyEpoch !== epoch) {
        ancestor.dirtyBits = SUBTREE_BIT
        ancestor.dirtyEpoch = epoch
      } else {
        ancestor.dirtyBits |= SUBTREE_BIT
      }
      ancestor = ancestor.parent
    }
  }

  // Recurse to children
  for (const child of node.children) {
    propagateLayout(child, rect.x, rect.y, incrementalSkip)
  }

  // Cache cascade inputs that render-phase would otherwise compute via tree walks.
  // Both checks require children to have finalized layoutChangedThisFrame, boxRect,
  // prevLayout, childrenDirtyEpoch, and subtreeDirtyEpoch — all set above.
  // Guard: only compute when subtreeDirty (matches buildCascadeInputs guard).
  if (isDirty(node.dirtyBits, node.dirtyEpoch, SUBTREE_BIT) && node.children.length > 0) {
    const epoch = getRenderEpoch()

    // absoluteChildMutated: check direct children for absolute-positioned nodes
    // that had structural changes (children mount/unmount/reorder, layout change,
    // child position shift).
    const absChild = _hasAbsoluteChildMutated(node.children)

    // descendantOverflowChanged: recursive check for descendants whose prevLayout
    // extended beyond THIS node's rect and had layoutChangedThisFrame.
    const descOverflow = _hasDescendantOverflowChanged(node, rect)

    // Set or clear the layout-phase bits
    let bits = node.dirtyBits
    if (absChild) bits |= ABS_CHILD_BIT
    else bits &= ~ABS_CHILD_BIT
    if (descOverflow) bits |= DESC_OVERFLOW_BIT
    else bits &= ~DESC_OVERFLOW_BIT
    node.dirtyBits = bits
    node.dirtyEpoch = epoch
  } else {
    // Clear layout-phase bits (keep reconciler bits intact)
    if (node.dirtyEpoch === getRenderEpoch()) {
      node.dirtyBits &= ~(ABS_CHILD_BIT | DESC_OVERFLOW_BIT)
    }
  }
}

/**
 * Lightweight cascade input caching when the layout phase skips.
 *
 * When no layout nodes are dirty and dimensions haven't changed,
 * `layoutPhase` returns early and `propagateLayout` never runs.
 * But structural changes (absolute child mount/unmount, descendant overflow)
 * still need cascade input bits (ABS_CHILD_BIT, DESC_OVERFLOW_BIT) to be
 * computed for the render phase.
 *
 * This traversal follows only subtreeDirty paths (O(changed) not O(N))
 * and computes the same cascade inputs as propagateLayout's caching block.
 * No layout changes, no prevLayout updates, no layoutChangedThisFrame.
 */
function propagateCascadeInputs(node: AgNode): void {
  if (!isDirty(node.dirtyBits, node.dirtyEpoch, SUBTREE_BIT)) return
  if (!node.children || node.children.length === 0) return

  // Recurse into dirty children first (they need their own cascade inputs)
  for (const child of node.children) {
    if (isDirty(child.dirtyBits, child.dirtyEpoch, SUBTREE_BIT)) {
      propagateCascadeInputs(child)
    }
  }

  // Compute cascade inputs for this node (same logic as in propagateLayout)
  const epoch = getRenderEpoch()
  const absChild = _hasAbsoluteChildMutated(node.children)
  const descOverflow = node.boxRect ? _hasDescendantOverflowChanged(node, node.boxRect) : false

  let bits = node.dirtyBits
  if (absChild) bits |= ABS_CHILD_BIT
  else bits &= ~ABS_CHILD_BIT
  if (descOverflow) bits |= DESC_OVERFLOW_BIT
  else bits &= ~DESC_OVERFLOW_BIT
  node.dirtyBits = bits
  node.dirtyEpoch = epoch
}

/**
 * Check if any direct child is position="absolute" and had structural changes.
 */
function _hasAbsoluteChildMutated(children: readonly AgNode[]): boolean {
  for (const child of children) {
    const cp = child.props as BoxProps
    if (
      cp.position === "absolute" &&
      (isDirty(child.dirtyBits, child.dirtyEpoch, CHILDREN_BIT) ||
        isCurrentEpoch(child.layoutChangedThisFrame) ||
        _hasChildPositionChanged(child))
    ) {
      return true
    }
  }
  return false
}

/**
 * Check if any child's position changed (boxRect vs prevLayout).
 */
function _hasChildPositionChanged(node: AgNode): boolean {
  for (const child of node.children) {
    if (child.boxRect && child.prevLayout) {
      if (child.boxRect.x !== child.prevLayout.x || child.boxRect.y !== child.prevLayout.y) {
        return true
      }
    }
  }
  return false
}

/**
 * Check if any descendant was overflowing THIS node's rect and had its layout change.
 * Recursive: follows subtreeDirty paths for efficiency.
 */
function _hasDescendantOverflowChanged(node: AgNode, rect: Rect): boolean {
  return _checkDescendantOverflow(
    node.children,
    rect.x,
    rect.y,
    rect.x + rect.width,
    rect.y + rect.height,
  )
}

function _checkDescendantOverflow(
  children: readonly AgNode[],
  nodeLeft: number,
  nodeTop: number,
  nodeRight: number,
  nodeBottom: number,
): boolean {
  for (const child of children) {
    if (child.prevLayout && isCurrentEpoch(child.layoutChangedThisFrame)) {
      const prev = child.prevLayout
      if (
        prev.x + prev.width > nodeRight ||
        prev.y + prev.height > nodeBottom ||
        prev.x < nodeLeft ||
        prev.y < nodeTop
      ) {
        return true
      }
    }
    if (isDirty(child.dirtyBits, child.dirtyEpoch, SUBTREE_BIT) && child.children !== undefined) {
      if (_checkDescendantOverflow(child.children, nodeLeft, nodeTop, nodeRight, nodeBottom)) {
        return true
      }
    }
  }
  return false
}

/**
 * Notify all layout subscribers of dimension changes.
 *
 * Called by the pipeline AFTER scrollrectPhase completes,
 * so useScrollRect can read correct screen positions.
 *
 * Notifies when EITHER boxRect, scrollRect, or screenRect changed.
 * scrollRect can change from scroll offset changes even when
 * boxRect stays the same — subscribers (like useScrollRect)
 * need notification in both cases. screenRect can change from sticky
 * offset changes even when scrollRect stays the same.
 */
export function notifyLayoutSubscribers(node: AgNode): void {
  // Notify if content rect, screen rect, or render rect changed
  const contentChanged = !rectEqual(node.prevLayout, node.boxRect)
  const screenChanged = !rectEqual(node.prevScrollRect, node.scrollRect)
  const renderChanged = !rectEqual(node.prevScreenRect, node.screenRect)

  // Pass-cause emit: when a rect signal value actually changes, useBoxRect
  // / useScrollRect subscribers may forceUpdate(), which the convergence
  // loop sees as `hadReactCommit` and answers with another pass.
  //
  // Gated on INSTRUMENT (module-level constant) so V8/JSC fold the entire
  // block out of the hot path when SILVERY_INSTRUMENT is unset. nodeIdent()
  // and the record-object allocations only run under the gate.
  if (INSTRUMENT) {
    if (contentChanged || screenChanged || renderChanged) {
      const ident = nodeIdent(node)
      if (contentChanged) {
        recordPassCause({ cause: "layout-invalidate", edge: "boxRect", nodeId: ident })
      }
      if (screenChanged) {
        recordPassCause({ cause: "layout-invalidate", edge: "scrollRect", nodeId: ident })
      }
      if (renderChanged) {
        recordPassCause({ cause: "layout-invalidate", edge: "screenRect", nodeId: ident })
      }
    }
  }

  // Sync rect values into alien-signals (for signal-based hooks).
  // Always sync — even when no rect changed — because the signal may
  // have been created after the last sync (lazy initialization).
  syncRectSignals(node)

  // Recurse to children
  for (const child of node.children) {
    notifyLayoutSubscribers(child)
  }

  // After every node's rect signals (including anchorRect) are populated,
  // run a second pass at the ROOT to resolve `decorations`. The two-pass
  // shape is required because decoration resolution calls
  // `findAnchor(root, id)`, which needs every anchorRect populated for the
  // current frame. A single recursive pass would let a popover declared
  // shallow in the tree miss an anchor declared deeper. Phase 4c of
  // `km-silvery.view-as-layout-output` (overlay-anchor v1).
  if (node.parent === null) {
    syncDecorationRects(node)
  }
}

// ============================================================================
// STRICT Layout Overflow Invariant
// ============================================================================

/**
 * Verify that no child's boxRect.width exceeds its parent's inner content width.
 *
 * This catches fit-content/snug-content bugs at the source — any measure-phase
 * or correction-pass error fires immediately.
 *
 * - SILVERY_STRICT=1: console.warn on violation
 * - SILVERY_STRICT=2: throw on violation
 *
 * Exceptions:
 * - Parent has overflow: "scroll" or "hidden" (overflow is allowed)
 * - Child has position: "absolute" (absolute nodes can overflow)
 */
export function strictLayoutOverflowCheck(root: AgNode): void {
  const strict = process?.env?.SILVERY_STRICT
  if (!strict) return

  const shouldThrow = strict === "2"

  function walk(node: AgNode): void {
    for (const child of node.children) {
      if (child.boxRect && node.boxRect) {
        const childProps = child.props as BoxProps

        // Skip absolute-positioned children — they're allowed to overflow
        if (childProps.position === "absolute") {
          walk(child)
          continue
        }

        const parentProps = node.props as BoxProps

        // Skip if parent allows overflow (scroll or hidden)
        if (parentProps.overflow === "scroll" || parentProps.overflow === "hidden") {
          walk(child)
          continue
        }

        // Compute parent's inner content width
        const border = parentProps.borderStyle
          ? getBorderSize(parentProps)
          : { top: 0, bottom: 0, left: 0, right: 0 }
        const padding = getPadding(parentProps)
        const parentInnerWidth =
          node.boxRect.width - padding.left - padding.right - border.left - border.right

        if (child.boxRect.width > parentInnerWidth) {
          const childId = (childProps as any).id ?? child.type
          const parentId = (parentProps as any).id ?? node.type
          const msg =
            `[SILVERY_STRICT] Layout overflow: child "${childId}" width ${child.boxRect.width} ` +
            `exceeds parent "${parentId}" inner width ${parentInnerWidth} ` +
            `(parent box: ${node.boxRect.width}, border: ${border.left}+${border.right}, padding: ${padding.left}+${padding.right})`

          if (shouldThrow) {
            throw new Error(msg)
          } else {
            console.warn(msg)
          }
        }
      }

      walk(child)
    }
  }

  walk(root)
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
 * Snap scroll offset so the first visible child (after the top overflow
 * indicator's reserved row) aligns with a child-top boundary.
 *
 * When scrolling "down to show the target at the bottom," the raw offset
 * `target.bottom - effectiveHeight` assumes the entire viewport above the
 * bottom-indicator is usable content. But the TOP overflow indicator also
 * consumes a row when `hiddenAbove > 0`, rendering at viewport row 0 on top
 * of whatever child starts there. If that row is a card's top border, the
 * border is overwritten — users see a "headless" card and perceive the
 * column as "gotten shorter" (see km-tui `column-top-disappears`).
 *
 * This snap shifts the offset so `offset + 1 === firstFullyVisibleChild.top`:
 * the top-indicator row coincides with the 1-row gap ABOVE the first child,
 * not with that child's content. When children have heterogeneous heights,
 * this means moving the viewport DOWN by a few rows (so an earlier, shorter
 * child scrolls fully off-screen and the next child starts cleanly).
 *
 * Guardrails:
 * - Never snap past the target's own top (keeps the target visible).
 * - If no suitable boundary exists above `rawOffset + 1` and ≤ `target.top`,
 *   returns `rawOffset` unchanged (scroll behaves as before).
 * - Returns 0 unchanged — offset=0 means no top indicator, no conflict.
 */
function snapOffsetToChildTop(
  rawOffset: number,
  childPositions: {
    child: AgNode
    top: number
    bottom: number
    index: number
    isSticky: boolean
  }[],
  target: { top: number; bottom: number; index: number },
): number {
  if (rawOffset <= 0) return rawOffset
  // Desired: first-visible-child.top === offset + 1 (leaving row 0 for indicator).
  // Find the smallest child-top in the range (rawOffset + 1, target.top] and
  // set offset = that child-top - 1. This places the child-top one row below
  // the viewport top — exactly the row the top indicator occupies.
  let bestChildTop = -1
  for (const cp of childPositions) {
    if (cp.isSticky) continue
    if (cp.top === cp.bottom) continue // skip zero-height
    if (cp.top > rawOffset && cp.top <= target.top) {
      if (bestChildTop === -1 || cp.top < bestChildTop) {
        bestChildTop = cp.top
      }
    }
  }
  if (bestChildTop === -1) return rawOffset
  // Reserve one row for the top indicator: scrollOffset = childTop - 1.
  // This keeps the child at viewport row 1 (just below the indicator row).
  const snapped = bestChildTop - 1
  // Safety: never reduce offset below rawOffset (would hide target.bottom).
  return snapped >= rawOffset ? snapped : rawOffset
}

/**
 * Calculate scroll state for a single scrollable container.
 */
function calculateScrollState(node: AgNode, props: BoxProps, skipStateUpdates: boolean): void {
  const layout = node.boxRect
  if (!layout || !node.layoutNode) return

  // Calculate viewport (container minus borders/padding)
  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
  const padding = getPadding(props)

  const rawViewportHeight =
    layout.height - border.top - border.bottom - padding.top - padding.bottom

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
    if (!child.layoutNode || !child.boxRect) continue

    const childTop = child.boxRect.y - layout.y - border.top - padding.top
    const childBottom = childTop + child.boxRect.height
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
  const prevScrollTo = node.scrollState?.prevScrollTo
  const explicitOffset = props.scrollOffset
  let scrollOffset = explicitOffset ?? prevOffset ?? 0
  const scrollTo = props.scrollTo

  // Distinguish "new intent" from "same intent":
  //
  //   NEW intent  — scrollTo changed since last frame (user pressed a key,
  //                 cursor moved, external setter jumped target). Fire the
  //                 full edge-based ensure-visible so the new target lands
  //                 inside the viewport. First render is also NEW intent
  //                 (prevScrollTo === undefined, scrollTo is defined → differ).
  //
  //   SAME intent — scrollTo unchanged from last frame. This render was
  //                 triggered by something else (state change, content
  //                 growth, theme flip, wheel scroll, etc.). Skip ensure-
  //                 visible entirely — the offset persists from prevOffset
  //                 (or explicitOffset wins). This is the critical guard
  //                 that prevents "viewport jumps on click-to-expand" —
  //                 growing a visible item must not shift the viewport.
  //
  // This mirrors the already-landed fix in `useVirtualizer` (commit
  // 50d13d41 — `scrollToChanged` guard). Box's ensure-visible is the
  // sibling layer; same pattern, same rationale.
  //
  // For imperative "scroll to this index NOW (even if it's the same value)",
  // callers should toggle scrollTo off and on, or use an imperative API.
  const scrollToChanged = prevScrollTo !== scrollTo

  // "Same intent" recovery: even when scrollToChanged is false, fire ensure-
  // visible if the cached offset has the target COMPLETELY off-screen. This
  // happens during multi-pass layout convergence — the first pass sets offset
  // based on partial measurements (small contentHeight), then later passes
  // grow contentHeight as items measure, leaving the cached offset clamped
  // far away from the now-correctly-positioned target. Without this recovery,
  // the offset stays stuck and STRICT invariants (scrollTo target intersects
  // viewport) fire correctly-detected violations.
  //
  // Conservative: only re-fires when target has NO intersection with the raw
  // viewport. Partial visibility (target grew, target.bottom > visibleBottom
  // but target.top < visibleBottom) is left alone — that's the
  // "click-to-expand should not yank viewport" guarantee.
  let targetCompletelyOffscreen = false
  if (
    !scrollToChanged &&
    scrollTo !== undefined &&
    scrollTo >= 0 &&
    scrollTo < childPositions.length
  ) {
    const target = childPositions.find((c) => c.index === scrollTo)
    if (target && target.top !== target.bottom) {
      const visTop = scrollOffset
      const visBottom = scrollOffset + viewportHeight
      const intersects = target.bottom > visTop && target.top < visBottom
      if (!intersects) targetCompletelyOffscreen = true
    }
  }

  if (
    scrollTo !== undefined &&
    scrollTo >= 0 &&
    scrollTo < childPositions.length &&
    (scrollToChanged || targetCompletelyOffscreen)
  ) {
    // Find the target child
    const target = childPositions.find((c) => c.index === scrollTo)
    if (target) {
      // scrollTo settle: an offset adjustment may shift child layout, which
      // in turn may invalidate rect signals for descendants. Attribute to
      // the originating scrollTo prop so C3b can bound this edge.
      if (INSTRUMENT) {
        recordPassCause({
          cause: "scrollto-settle",
          edge: targetCompletelyOffscreen ? "scrollTo:recovery" : "scrollTo:newIntent",
          nodeId: nodeIdent(node),
          detail: `target=${scrollTo}`,
        })
      }
      // Calculate current visible range, accounting for indicator reserve.
      // The effective visible height is reduced by indicatorReserve so the
      // scrollTo target is fully visible ABOVE the overflow indicator row.
      const effectiveHeight = viewportHeight - indicatorReserve
      const visibleTop = scrollOffset
      const visibleBottom = scrollOffset + effectiveHeight

      // Only scroll if target is outside visible range.
      //
      // "Too tall to fit" must be handled FIRST: when the target is taller
      // than the effective viewport, no offset can satisfy both
      // `target.top >= visibleTop` AND `target.bottom <= visibleBottom`.
      // Without this branch, the two branches below alternate across
      // iterations of the layout loop — `target.top - 1` exposes the top
      // edge, which then makes `target.bottom > visibleBottom` true, so
      // the next iteration flips to the snap-to-bottom branch, whose offset
      // makes `target.top < visibleTop` true again, and so on. The offset
      // pingpongs, exhausting the 5-iteration budget and forcing downstream
      // consumers (e.g. the virtualizer) to route around the instability.
      //
      // Show the TOP of the oversized target. That matches "cursor on tall
      // outlier" intent (the user wants to see the card they moved to) and
      // is stable — no subsequent branch fires because only one is eligible.
      const targetHeight = target.bottom - target.top
      if (targetHeight > effectiveHeight) {
        scrollOffset = target.top > 0 ? target.top - 1 : 0
      } else if (target.top < visibleTop) {
        // Target is above viewport - scroll up to show it at top.
        //
        // Reserve one row for the TOP overflow indicator so it doesn't
        // overwrite the target's top border. When target.top > 0 there
        // will be a top indicator (target isn't the first child, so items
        // above exist). Shifting scrollOffset one row up places the
        // indicator at viewport row 0 (over the preceding card's bottom
        // row — typically its bottom border) and leaves target.top at
        // viewport row 1, rendering its top border cleanly.
        scrollOffset = target.top > 0 ? target.top - 1 : 0
      } else if (target.bottom > visibleBottom) {
        // Target is below viewport - scroll down to show it at bottom.
        //
        // Snap to a child-top boundary when a pixel-exact offset would land
        // inside a child (clipping its top border). Without snapping, mixed-
        // height children produce a "headless card" at the viewport top —
        // users perceive it as "column got shorter" (see km-tui bug
        // `column-top-disappears`). Snap DOWN (toward a larger offset) so the
        // target remains visible at the bottom of the viewport.
        const rawOffset = target.bottom - effectiveHeight
        scrollOffset = snapOffsetToChildTop(rawOffset, childPositions, target)
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

  // Read `representsItems` from a child's props — defaults to 1 (a single
  // visual item). Virtualized lists set this on their leading/trailing
  // placeholder Boxes so the parent's hiddenAbove/hiddenBelow count reflects
  // real items rather than placeholder boxes.
  const logicalCount = (cp: { child: AgNode }): number => {
    const cps = cp.child.props as BoxProps
    const r = cps.representsItems
    return r !== undefined && r >= 0 ? r : 1
  }

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
      hiddenAbove += logicalCount(cp)
    } else if (cp.top >= visibleBottom) {
      hiddenBelow += logicalCount(cp)
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
      // in hiddenBelow so the indicator shows the correct count. But discriminate
      // three cases for the LAST child:
      //   (a) cp.bottom > raw viewport bottom → content is truly truncated,
      //       indicator should fire (e.g. 10 cards × 3 rows in viewport=29 →
      //       last card's bottom row is cut off; ▼N expected)
      //   (b) cp.bottom ≤ raw viewport bottom but > effective (reserve-adjusted)
      //       bottom → the reserve row "steals" from an otherwise-visible last
      //       card, producing a PHANTOM ▼1 at scrollTo=lastIndex when nothing
      //       lies beyond. Skip the increment in this case.
      //   (c) childHeight > viewportHeight AND scrollTo === last index → the
      //       too-tall-to-fit branch above placed the oversized target's top at
      //       row 1 (below the top indicator reserve), so its bottom extends
      //       far past rawViewportBottom. Case (a)'s check fires, but the user
      //       IS at the last item — nothing lies beyond. Skip the increment
      //       (the bottom reserve is legitimately stealing from the target's
      //       tail, not from a hidden below-item).
      const isLastChild = cp.index === childPositions[childPositions.length - 1]?.index
      const rawViewportBottom = scrollOffset + viewportHeight
      const childHeight = cp.bottom - cp.top
      const isPhantomReserveCut = isLastChild && cp.bottom <= rawViewportBottom
      const isOversizedLastAtEnd =
        isLastChild && childHeight > viewportHeight && scrollTo === cp.index
      if (indicatorReserve > 0 && !isPhantomReserveCut && !isOversizedLastAtEnd) {
        hiddenBelow += logicalCount(cp)
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

  // STRICT invariants (run BEFORE skipStateUpdates so fresh-render comparisons
  // catch violations too).
  //
  // Rationale: the column-top-disappears bug class (2026-04-20, ≥4 sessions)
  // arose because scroll state carried subtly illegal values (offset past max,
  // firstVisibleChild pointing at a child that didn't actually intersect the
  // viewport, sticky render offset clipped beyond legal bounds). STRICT mode
  // verifies incremental==fresh but cannot catch drift that's consistent
  // between both passes. Per-coordination-point invariants plug that gap.
  //
  // SILVERY_STRICT=1 → console.warn on violation
  // SILVERY_STRICT=2 → throw on violation (regression test gate)
  //
  // All invariants are generic (no virtualizer knowledge) — ListView-specific
  // invariants live in ListView itself.
  strictScrollInvariants(
    node,
    props,
    scrollOffset,
    contentHeight,
    viewportHeight,
    indicatorReserve,
    childPositions,
    firstVisible,
    lastVisible,
    stickyChildren,
  )

  // Skip state updates for fresh render comparisons (SILVERY_STRICT)
  if (skipStateUpdates) return

  // Track previous visible range for incremental rendering
  const prevFirstVisible = node.scrollState?.firstVisibleChild ?? firstVisible
  const prevLastVisible = node.scrollState?.lastVisibleChild ?? lastVisible

  // Mark node dirty if scroll offset or visible range changed (for incremental rendering)
  // Without this, renderPhase would skip the container and children would
  // remain at their old pixel positions in the cloned buffer
  const visibleRangeChanged =
    firstVisible !== prevFirstVisible || lastVisible !== prevLastVisible
  if (scrollOffset !== prevOffset || visibleRangeChanged) {
    const epoch = getRenderEpoch()
    if (node.dirtyEpoch !== epoch) {
      node.dirtyBits = SUBTREE_BIT
      node.dirtyEpoch = epoch
    } else {
      node.dirtyBits |= SUBTREE_BIT
    }
  }

  // Pass-cause emit: visible-range shifted post-layout. Virtualizer consumers
  // (`useScrollState`/`useVirtualizer`) read scrollState's firstVisibleChild
  // / lastVisibleChild and re-render when the window changes — that re-render
  // mounts/unmounts items, requiring one settle pass to re-layout. By
  // construction, viewport-dependent is bounded to **1 extra pass** per
  // window shift: pass N picks new visible range, pass N+1 lays out the new
  // items. Emit only when the window actually shifted (offset-only changes
  // don't trigger virtualizer re-renders — useScrollState's per-field equality
  // check filters them out).
  if (INSTRUMENT && visibleRangeChanged) {
    recordPassCause({
      cause: "viewport-dependent",
      edge: "visibleRange",
      nodeId: nodeIdent(node),
      detail: `[${prevFirstVisible},${prevLastVisible}] -> [${firstVisible},${lastVisible}]`,
    })
  }

  // Store scroll state (preserve previous offset and visible range for incremental rendering)
  node.scrollState = {
    offset: scrollOffset,
    prevOffset: prevOffset ?? scrollOffset,
    // Remember the scrollTo value we processed this frame so next frame can
    // distinguish "new intent" (scrollTo changed) from "same intent" (same
    // value, re-render for another reason). See the guard above.
    prevScrollTo: scrollTo,
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

/**
 * Runtime invariants for scroll state. Gated on SILVERY_STRICT.
 *
 * Invariant set (all violations use `[SILVERY_STRICT]` prefix, L1 warn / L2 throw):
 *   1. scrollOffset is clamped: 0 ≤ scrollOffset ≤ max(0, contentHeight - viewportHeight).
 *   2. If scrollTo is a valid index, the target child intersects the effective
 *      viewport (viewport minus indicatorReserve) after the offset calc.
 *   3. firstVisibleChild / lastVisibleChild correspond to children that actually
 *      intersect the effective viewport (not spacer indices outside).
 *   4. Sticky child renderOffset stays within legal viewport bounds — specifically
 *      `renderOffset + height > 0 && renderOffset < viewportHeight` (sticky row
 *      not clipped entirely out, which `calculateScrollState` already filters,
 *      but we also verify the sticky row's bottom doesn't sit ABOVE 0 for
 *      isSticking=true entries since clamping should have prevented that).
 *
 * These are GENERIC scroll invariants — no virtualizer knowledge. Any divergence
 * points to a bug in the scroll/sticky math itself.
 */
function strictScrollInvariants(
  node: AgNode,
  props: BoxProps,
  scrollOffset: number,
  contentHeight: number,
  viewportHeight: number,
  indicatorReserve: number,
  childPositions: {
    child: AgNode
    top: number
    bottom: number
    index: number
    isSticky: boolean
    stickyTop?: number
    stickyBottom?: number
  }[],
  firstVisible: number,
  lastVisible: number,
  stickyChildren: NonNullable<AgNode["scrollState"]>["stickyChildren"] & object,
): void {
  const strict = process?.env?.SILVERY_STRICT
  if (!strict) return

  const shouldThrow = strict === "2"
  const nodeId = (props as any).id ?? node.type
  const report = (msg: string): void => {
    const full = `[SILVERY_STRICT] ${msg} (node: ${nodeId})`
    if (shouldThrow) throw new Error(full)
    else console.warn(full)
  }

  // Invariant 1: scrollOffset clamping
  const maxOffset = Math.max(0, contentHeight - viewportHeight)
  if (scrollOffset < 0) {
    report(`scrollOffset ${scrollOffset} < 0`)
  } else if (scrollOffset > maxOffset) {
    report(
      `scrollOffset ${scrollOffset} exceeds max ${maxOffset} ` +
        `(contentHeight=${contentHeight}, viewportHeight=${viewportHeight})`,
    )
  }

  // Invariant 2: scrollTo target intersects the RAW viewport (not the
  // indicator-reserved effective viewport). The indicator overlays the
  // reserved row rather than hiding content, so a target whose top lands
  // exactly at the reserved row is still visible through the overlay —
  // a legitimate edge case at scrollTo=last-item.
  const scrollTo = props.scrollTo
  if (scrollTo !== undefined && scrollTo >= 0 && scrollTo < childPositions.length) {
    const target = childPositions.find((c) => c.index === scrollTo)
    if (target && target.top !== target.bottom) {
      // Zero-height children are exempt — they can't intersect anything.
      const visibleTop = scrollOffset
      const visibleBottom = scrollOffset + viewportHeight
      const intersects = target.bottom > visibleTop && target.top < visibleBottom
      if (!intersects) {
        report(
          `scrollTo target index=${scrollTo} does not intersect viewport ` +
            `(target [${target.top},${target.bottom}), visible [${visibleTop},${visibleBottom}), ` +
            `indicatorReserve=${indicatorReserve})`,
        )
      }
    }
  }

  // Invariant 3: firstVisible / lastVisible correspond to intersecting children
  const visibleTop = scrollOffset
  const visibleBottom = scrollOffset + viewportHeight - indicatorReserve
  const checkVisible = (label: string, idx: number): void => {
    if (idx < 0) return // -1 = nothing visible, legal
    const cp = childPositions.find((c) => c.index === idx)
    if (!cp) {
      report(`${label}=${idx} but no child at that index`)
      return
    }
    if (cp.isSticky) return // sticky children are always "visible" by design
    if (cp.top === cp.bottom) {
      // Zero-height children shouldn't be chosen as first/last visible.
      report(`${label}=${idx} references zero-height child`)
      return
    }
    // Child must actually intersect the effective viewport (partial counts).
    const intersects = cp.bottom > visibleTop && cp.top < visibleBottom
    if (!intersects) {
      report(
        `${label}=${idx} does not intersect effective viewport ` +
          `(child [${cp.top},${cp.bottom}), visible [${visibleTop},${visibleBottom}))`,
      )
    }
  }
  checkVisible("firstVisibleChild", firstVisible)
  checkVisible("lastVisibleChild", lastVisible)

  // Invariant 4: sticky child renderOffset is within legal viewport bounds.
  // calculateScrollState already filters out sticky children that end up entirely
  // off-screen (renderOffset+h ≤ 0 or renderOffset ≥ viewportHeight), so every
  // entry here MUST at least partially intersect [0, viewportHeight).
  for (const sc of stickyChildren) {
    const topRow = sc.renderOffset
    const bottomRow = sc.renderOffset + sc.height
    if (bottomRow <= 0 || topRow >= viewportHeight) {
      report(
        `sticky child index=${sc.index} renderOffset=${topRow} height=${sc.height} ` +
          `outside viewport [0,${viewportHeight})`,
      )
    }
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
        const epoch = getRenderEpoch()
        if (node.dirtyEpoch !== epoch) {
          node.dirtyBits = SUBTREE_BIT
          node.dirtyEpoch = epoch
        } else {
          node.dirtyBits |= SUBTREE_BIT
        }
      }
      return
    }

    const layout = node.boxRect
    if (!layout || !node.layoutNode) return

    const border = props.borderStyle
      ? getBorderSize(props)
      : { top: 0, bottom: 0, left: 0, right: 0 }
    const padding = getPadding(props)
    const parentContentHeight =
      layout.height - border.top - border.bottom - padding.top - padding.bottom

    const newStickyChildren: NonNullable<AgNode["stickyChildren"]> = []

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]!
      const childProps = child.props as BoxProps
      if (childProps.position !== "sticky") continue
      if (childProps.stickyBottom === undefined) continue

      if (!child.boxRect) continue

      // Natural position relative to parent content area
      const naturalY = child.boxRect.y - layout.y - border.top - padding.top
      const childHeight = child.boxRect.height
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
      const epoch = getRenderEpoch()
      if (node.dirtyEpoch !== epoch) {
        node.dirtyBits = SUBTREE_BIT
        node.dirtyEpoch = epoch
      } else {
        node.dirtyBits |= SUBTREE_BIT
      }
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
 * Fast path for scrollrectPhase when no scroll containers or sticky nodes exist.
 *
 * When there are no scroll containers and no sticky nodes, ancestorScrollOffset
 * is always 0, so scrollRect === boxRect and screenRect === scrollRect. This
 * avoids the overhead of accumulating scroll offsets through the tree.
 */
export function scrollrectPhaseSimple(root: AgNode): void {
  propagateScrollRectSimple(root)
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

  const content = node.boxRect
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

// ============================================================================
// Simple scrollRect propagation (no scroll/sticky)
// ============================================================================

/**
 * Simple scrollRect propagation for trees without scroll containers or sticky nodes.
 * When ancestorScrollOffset is always 0, scrollRect === boxRect and screenRect === scrollRect.
 * Saves the overhead of accumulating scroll offsets and computing sticky screen rects.
 */
function propagateScrollRectSimple(node: AgNode): void {
  node.prevScrollRect = node.scrollRect
  node.prevScreenRect = node.screenRect

  const content = node.boxRect
  if (!content) {
    node.scrollRect = null
    node.screenRect = null
    for (const child of node.children) {
      propagateScrollRectSimple(child)
    }
    return
  }

  // No scroll offset — scrollRect equals boxRect
  node.scrollRect = {
    x: content.x,
    y: content.y,
    width: content.width,
    height: content.height,
  }
  node.screenRect = node.scrollRect

  for (const child of node.children) {
    propagateScrollRectSimple(child)
  }
}

// ============================================================================
// Feature Detection
// ============================================================================

/**
 * Pipeline feature flags — tracks which optional phases the tree needs.
 *
 * Flags are one-way: once set to true, they stay true for the lifetime
 * of the Ag instance. This ensures that if a component dynamically mounts
 * a scroll container or sticky child, the phase starts running immediately
 * and never gets skipped again.
 */
export interface PipelineFeatures {
  /** Tree contains at least one `overflow="scroll"` node. */
  hasScroll: boolean
  /** Tree contains at least one `position="sticky"` node. */
  hasSticky: boolean
}

/**
 * Scan the tree for features that require optional pipeline phases.
 *
 * Returns feature flags. This is called on every layout pass so newly
 * mounted components are detected. The caller should merge flags with
 * one-way semantics (false → true, never true → false).
 */
export function detectPipelineFeatures(root: AgNode): PipelineFeatures {
  let hasScroll = false
  let hasSticky = false

  function scan(node: AgNode): void {
    const props = node.props as BoxProps
    if (props.overflow === "scroll") hasScroll = true
    if (props.position === "sticky") hasSticky = true
    // Early exit if both features detected
    if (hasScroll && hasSticky) return
    for (const child of node.children) {
      scan(child)
      if (hasScroll && hasSticky) return
    }
  }

  scan(root)
  return { hasScroll, hasSticky }
}
