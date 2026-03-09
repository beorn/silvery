/**
 * Focus Queries — pure tree query functions for the silvery focus system.
 *
 * All functions are pure: no state, no React, no side effects.
 * They operate on the SilveryNode tree to resolve focusable elements,
 * tab order, spatial navigation targets, and explicit focus links.
 */

import type { TeaNode, Rect } from "./types"

// ============================================================================
// Focusable Detection
// ============================================================================

/** Check if a node has the focusable prop set to true (or truthy). */
function isFocusable(node: TeaNode): boolean {
  const props = node.props as Record<string, unknown>
  return Boolean(props.focusable) && props.display !== "none"
}

/** Check if a node creates a focus scope (isolated Tab cycle). */
function isFocusScope(node: TeaNode): boolean {
  const props = node.props as Record<string, unknown>
  return Boolean(props.focusScope)
}

// ============================================================================
// Tree Queries
// ============================================================================

/**
 * Walk up from node to nearest ancestor (or self) with focusable prop.
 * Useful for mouse clicks — find the focusable target from a deep text node.
 */
export function findFocusableAncestor(node: TeaNode): TeaNode | null {
  let current: TeaNode | null = node
  while (current) {
    if (isFocusable(current)) return current
    current = current.parent
  }
  return null
}

/**
 * DFS traversal of focusable nodes in tab order, optionally scoped.
 *
 * When scope is provided, only nodes within that scope subtree are included.
 * If a focusScope node is encountered during traversal, its children are
 * skipped (they belong to a different scope), unless that scope IS the
 * provided scope node.
 */
export function getTabOrder(root: TeaNode, scope?: TeaNode): TeaNode[] {
  const result: TeaNode[] = []
  const walkRoot = scope ?? root

  function walk(node: TeaNode): void {
    // Skip nodes with display: none
    const props = node.props as Record<string, unknown>
    if (props.display === "none") return

    // If this node is a focusScope boundary and it's NOT the walk root,
    // skip its children — they belong to a different Tab cycle.
    // The focusScope node itself may still be focusable (included below).
    if (node !== walkRoot && isFocusScope(node)) {
      // Include the scope node itself if it's focusable, but don't descend
      if (isFocusable(node)) {
        result.push(node)
      }
      return
    }

    if (isFocusable(node)) {
      result.push(node)
    }

    for (const child of node.children) {
      walk(child)
    }
  }

  walk(walkRoot)
  return result
}

/**
 * Walk up from a node to find the nearest ancestor (or self) with focusScope prop.
 * Returns the testID of the enclosing scope, or null if none found.
 */
export function findEnclosingScope(node: TeaNode): string | null {
  let current: TeaNode | null = node
  while (current) {
    if (isFocusScope(current)) {
      const props = current.props as Record<string, unknown>
      return typeof props.testID === "string" ? props.testID : null
    }
    current = current.parent
  }
  return null
}

/**
 * Find a node by testID in the subtree rooted at root.
 * DFS, returns the first match.
 */
export function findByTestID(root: TeaNode, testID: string): TeaNode | null {
  const props = root.props as Record<string, unknown>
  if (props.testID === testID) return root

  for (const child of root.children) {
    const found = findByTestID(child, testID)
    if (found) return found
  }
  return null
}

// ============================================================================
// Spatial Navigation
// ============================================================================

/**
 * Compute center point of a Rect.
 */
function rectCenter(rect: Rect): { cx: number; cy: number } {
  return {
    cx: rect.x + rect.width / 2,
    cy: rect.y + rect.height / 2,
  }
}

/**
 * Check if a candidate point falls within a 45-degree cone from source
 * in the given direction (tvOS-style spatial navigation).
 *
 * The cone extends from the center of the source rect in the specified
 * direction with a 45-degree half-angle (90-degree total aperture).
 */
function isInCone(
  source: { cx: number; cy: number },
  candidate: { cx: number; cy: number },
  direction: "up" | "down" | "left" | "right",
): boolean {
  const dx = candidate.cx - source.cx
  const dy = candidate.cy - source.cy

  // Must be in the correct general direction
  switch (direction) {
    case "up":
      if (dy >= 0) return false
      // Within 45-degree cone: |dx| <= |dy|
      return Math.abs(dx) <= Math.abs(dy)
    case "down":
      if (dy <= 0) return false
      return Math.abs(dx) <= Math.abs(dy)
    case "left":
      if (dx >= 0) return false
      return Math.abs(dy) <= Math.abs(dx)
    case "right":
      if (dx <= 0) return false
      return Math.abs(dy) <= Math.abs(dx)
  }
}

/**
 * Euclidean distance between two points.
 */
function distance(a: { cx: number; cy: number }, b: { cx: number; cy: number }): number {
  const dx = a.cx - b.cx
  const dy = a.cy - b.cy
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Find the nearest focusable candidate in a given direction using
 * 45-degree cone heuristic (tvOS-style spatial navigation).
 *
 * From the center of the source rect, draw a cone in the target direction.
 * Filter candidates whose center falls within the cone. Pick the closest
 * by Euclidean distance.
 *
 * @param from - The currently focused node
 * @param direction - Direction to search
 * @param candidates - All focusable nodes to consider
 * @param layoutFn - Function to get screen rect for a node (null if not laid out)
 */
export function findSpatialTarget(
  from: TeaNode,
  direction: "up" | "down" | "left" | "right",
  candidates: TeaNode[],
  layoutFn: (node: TeaNode) => Rect | null,
): TeaNode | null {
  const sourceRect = layoutFn(from)
  if (!sourceRect) return null

  const source = rectCenter(sourceRect)

  let best: TeaNode | null = null
  let bestDist = Infinity

  for (const candidate of candidates) {
    if (candidate === from) continue

    const candidateRect = layoutFn(candidate)
    if (!candidateRect) continue

    const target = rectCenter(candidateRect)

    if (!isInCone(source, target, direction)) continue

    const dist = distance(source, target)
    if (dist < bestDist) {
      bestDist = dist
      best = candidate
    }
  }

  return best
}

// ============================================================================
// Explicit Focus Links
// ============================================================================

/**
 * Check if a node has an explicit nextFocus{Direction} override prop.
 *
 * These props allow components to declare explicit focus targets for
 * spatial navigation, overriding the cone heuristic.
 *
 * @param node - The node to check
 * @param direction - Direction string: "up", "down", "left", "right"
 * @returns The testID of the explicit target, or null
 */
export function getExplicitFocusLink(node: TeaNode, direction: string): string | null {
  const props = node.props as Record<string, unknown>
  // Props follow the pattern: nextFocusUp, nextFocusDown, nextFocusLeft, nextFocusRight
  const propName = `nextFocus${direction.charAt(0).toUpperCase()}${direction.slice(1)}`
  const value = props[propName]
  return typeof value === "string" ? value : null
}
