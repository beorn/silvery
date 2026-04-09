/**
 * Dirty Node Tracking
 *
 * Module-level Set<AgNode> that enables O(1) dirty checks for pipeline phases.
 * The reconciler adds nodes when dirty flags are set; pipeline phases query
 * the set to skip unnecessary work; the set is cleared after each render pass.
 *
 * Two categories tracked separately:
 * - layoutDirtyNodes: nodes with layoutDirty flag (need Yoga recalculation)
 * - contentDirtyNodes: nodes with any content/style dirty flag (need re-render)
 *
 * This replaces O(N) tree walks like hasLayoutDirtyNodes() with O(1) set checks.
 */

import type { AgNode } from "./types"

/**
 * Nodes with layoutDirty=true. Replaces hasLayoutDirtyNodes() tree walk.
 * Written by reconciler (host-config.ts), read by layoutPhase.
 */
const layoutDirtyNodes: Set<AgNode> = new Set()

/**
 * Nodes with any content/style dirty flag. Written by reconciler,
 * read by render phase for targeted subtree entry.
 */
const contentDirtyNodes: Set<AgNode> = new Set()

// ---------------------------------------------------------------------------
// Write API (reconciler)
// ---------------------------------------------------------------------------

/** Mark a node as layout-dirty. Called when layoutDirty is set to true. */
export function trackLayoutDirty(node: AgNode): void {
  layoutDirtyNodes.add(node)
}

/** Mark a node as content-dirty. Called when content/style flags are set. */
export function trackContentDirty(node: AgNode): void {
  contentDirtyNodes.add(node)
}

// ---------------------------------------------------------------------------
// Read API (pipeline phases)
// ---------------------------------------------------------------------------

/** O(1) check: are there any layout-dirty nodes? */
export function hasLayoutDirty(): boolean {
  return layoutDirtyNodes.size > 0
}

/** O(1) check: are there any content-dirty nodes? */
export function hasContentDirty(): boolean {
  return contentDirtyNodes.size > 0
}

/** Get the set of layout-dirty nodes (for iteration). */
export function getLayoutDirtyNodes(): ReadonlySet<AgNode> {
  return layoutDirtyNodes
}

/** Get the set of content-dirty nodes (for iteration). */
export function getContentDirtyNodes(): ReadonlySet<AgNode> {
  return contentDirtyNodes
}

// ---------------------------------------------------------------------------
// Clear API (after render pass)
// ---------------------------------------------------------------------------

/** Clear all dirty tracking. Called after each render pass completes. */
export function clearDirtyTracking(): void {
  layoutDirtyNodes.clear()
  contentDirtyNodes.clear()
}

/** Clear only layout-dirty tracking. Called after layout phase. */
export function clearLayoutDirtyTracking(): void {
  layoutDirtyNodes.clear()
}
