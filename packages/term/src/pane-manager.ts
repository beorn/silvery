/**
 * Pane Manager - Pure functions for manipulating split layout trees.
 *
 * All functions are pure: they return new layout trees, never mutate.
 * The layout tree is a binary tree where leaves are panes and internal
 * nodes are splits (horizontal or vertical) with a ratio.
 */

// ============================================================================
// Types
// ============================================================================

export type LayoutNode =
  | { type: "leaf"; id: string }
  | {
      type: "split";
      direction: "horizontal" | "vertical";
      ratio: number;
      first: LayoutNode;
      second: LayoutNode;
    };

// ============================================================================
// Construction
// ============================================================================

/** Create a single-pane layout */
export function createLeaf(id: string): LayoutNode {
  return { type: "leaf", id };
}

// ============================================================================
// Tree Queries
// ============================================================================

/** Get all leaf pane IDs in depth-first left-to-right order */
export function getPaneIds(layout: LayoutNode): string[] {
  if (layout.type === "leaf") return [layout.id];
  return [...getPaneIds(layout.first), ...getPaneIds(layout.second)];
}

/** Find the next/previous pane in tab order (depth-first left-to-right) */
export function getTabOrder(layout: LayoutNode): string[] {
  return getPaneIds(layout);
}

// ============================================================================
// Tree Mutations (Pure)
// ============================================================================

/**
 * Split a pane into two. Returns new layout tree with the target pane split.
 * The original pane becomes the first child; the new pane becomes the second.
 */
export function splitPane(
  layout: LayoutNode,
  targetPaneId: string,
  direction: "horizontal" | "vertical",
  newPaneId: string,
  ratio = 0.5,
): LayoutNode {
  const clampedRatio = clampRatio(ratio);

  if (layout.type === "leaf") {
    if (layout.id === targetPaneId) {
      return {
        type: "split",
        direction,
        ratio: clampedRatio,
        first: { type: "leaf", id: targetPaneId },
        second: { type: "leaf", id: newPaneId },
      };
    }
    return layout;
  }

  // Recurse into children
  const newFirst = splitPane(layout.first, targetPaneId, direction, newPaneId, ratio);
  const newSecond = splitPane(layout.second, targetPaneId, direction, newPaneId, ratio);

  if (newFirst === layout.first && newSecond === layout.second) return layout;

  return { ...layout, first: newFirst, second: newSecond };
}

/**
 * Remove a pane from the layout. The sibling takes the full space.
 * Returns null if the removed pane was the last one.
 */
export function removePane(layout: LayoutNode, paneId: string): LayoutNode | null {
  if (layout.type === "leaf") {
    return layout.id === paneId ? null : layout;
  }

  // Check if either direct child is the target leaf
  if (layout.first.type === "leaf" && layout.first.id === paneId) {
    return layout.second;
  }
  if (layout.second.type === "leaf" && layout.second.id === paneId) {
    return layout.first;
  }

  // Recurse
  const newFirst = removePane(layout.first, paneId);
  const newSecond = removePane(layout.second, paneId);

  // If a subtree collapsed, promote the survivor
  if (newFirst === null) return newSecond;
  if (newSecond === null) return newFirst;

  if (newFirst === layout.first && newSecond === layout.second) return layout;

  return { ...layout, first: newFirst, second: newSecond };
}

/** Swap two panes' positions in the layout */
export function swapPanes(layout: LayoutNode, paneId1: string, paneId2: string): LayoutNode {
  if (layout.type === "leaf") {
    if (layout.id === paneId1) return { type: "leaf", id: paneId2 };
    if (layout.id === paneId2) return { type: "leaf", id: paneId1 };
    return layout;
  }

  const newFirst = swapPanes(layout.first, paneId1, paneId2);
  const newSecond = swapPanes(layout.second, paneId1, paneId2);

  if (newFirst === layout.first && newSecond === layout.second) return layout;

  return { ...layout, first: newFirst, second: newSecond };
}

/**
 * Resize a split: adjust the ratio of the nearest ancestor split
 * that contains the target pane as its first child.
 * Positive delta = grow (first child gets more), negative = shrink.
 */
export function resizeSplit(layout: LayoutNode, paneId: string, delta: number): LayoutNode {
  if (layout.type === "leaf") return layout;

  const firstIds = getPaneIds(layout.first);

  if (firstIds.includes(paneId)) {
    // Pane is in the first child — adjust this split's ratio
    const newRatio = clampRatio(layout.ratio + delta);
    if (newRatio === layout.ratio) return layout;

    return { ...layout, ratio: newRatio };
  }

  const secondIds = getPaneIds(layout.second);

  if (secondIds.includes(paneId)) {
    // Pane is in the second child — shrink ratio (give less to first)
    const newRatio = clampRatio(layout.ratio - delta);
    if (newRatio === layout.ratio) return layout;

    return { ...layout, ratio: newRatio };
  }

  return layout;
}

// ============================================================================
// Navigation
// ============================================================================

/**
 * Find the pane adjacent to the given pane in a direction.
 *
 * For left/right: looks for siblings in horizontal splits.
 * For up/down: looks for siblings in vertical splits.
 *
 * Returns null if no adjacent pane exists in that direction.
 */
export function findAdjacentPane(
  layout: LayoutNode,
  paneId: string,
  direction: "left" | "right" | "up" | "down",
): string | null {
  const path = findPath(layout, paneId);
  if (!path) return null;

  const splitDirection = direction === "left" || direction === "right" ? "horizontal" : "vertical";
  const goToSecond = direction === "right" || direction === "down";

  // Walk up the path looking for a relevant split
  for (let i = path.length - 1; i >= 0; i--) {
    const step = path[i]!;
    if (step.node.type !== "split") continue;
    if (step.node.direction !== splitDirection) continue;

    // We came from 'first' and want to go to second (right/down)
    if (step.side === "first" && goToSecond) {
      return firstLeaf(step.node.second);
    }

    // We came from 'second' and want to go to first (left/up)
    if (step.side === "second" && !goToSecond) {
      return lastLeaf(step.node.first);
    }
  }

  return null;
}

// ============================================================================
// Internal Helpers
// ============================================================================

function clampRatio(ratio: number): number {
  return Math.max(0.1, Math.min(0.9, ratio));
}

/** Get the first (leftmost/topmost) leaf ID */
function firstLeaf(node: LayoutNode): string {
  if (node.type === "leaf") return node.id;
  return firstLeaf(node.first);
}

/** Get the last (rightmost/bottommost) leaf ID */
function lastLeaf(node: LayoutNode): string {
  if (node.type === "leaf") return node.id;
  return lastLeaf(node.second);
}

interface PathStep {
  node: LayoutNode;
  side: "first" | "second";
}

/** Find the path from root to a leaf, recording which side we took at each split */
function findPath(layout: LayoutNode, paneId: string): PathStep[] | null {
  if (layout.type === "leaf") {
    return layout.id === paneId ? [] : null;
  }

  const firstPath = findPath(layout.first, paneId);
  if (firstPath !== null) {
    return [{ node: layout, side: "first" }, ...firstPath];
  }

  const secondPath = findPath(layout.second, paneId);
  if (secondPath !== null) {
    return [{ node: layout, side: "second" }, ...secondPath];
  }

  return null;
}
