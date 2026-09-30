/**
 * Dirty Node Tracking
 *
 * Per-render-tree `Set<AgNode>`s that enable O(1) dirty checks for pipeline
 * phases. The reconciler adds nodes when dirty flags are set; pipeline phases
 * query the sets to skip unnecessary work; the sets are cleared after each
 * render pass.
 *
 * Four categories tracked:
 * - contentDirtyNodes: nodes with any content/style dirty flag (need re-render)
 * - styleOnlyDirtyNodes: nodes where ONLY style changed (no content, no layout,
 *   no children) — eligible for the style-only fast path
 * - scrollDirtyNodes: nodes whose scrollTo/scrollOffset changed
 * - notifyDirtyNodes: nodes whose notify-synced props changed (the props the
 *   notify step reads to write layout signals)
 *
 * The sets hang off the tree's {@link EpochOwner}, reached from any node as
 * `node.epochOwner`, for the same reason the epoch itself does: they are
 * cleared once per completed render pass, so process-global sets let a peer
 * renderer's frame discard work another renderer has not rendered yet. That is
 * not hypothetical for `hasScrollDirty()` — it gates the layout phase in
 * `ag.ts`, so losing it means a tree keeps painting at stale scroll offsets.
 * See `epoch.ts` for the full account of the residue this produces.
 *
 * Layout dirty tracking is NOT here — Flexily owns it via isDirty() propagation.
 * The layout gate in ag.ts / layout-phase.ts checks root.layoutNode.isDirty().
 */

import type { EpochOwner } from "./epoch"
import type { AgNode } from "./types"

interface TreeDirtySets {
  /**
   * Nodes with any content/style dirty flag. Written by reconciler,
   * read by render phase for targeted subtree entry.
   */
  content: Set<AgNode>
  /**
   * Nodes where ONLY style props changed (no content, layout, or children
   * changes). These are eligible for the style-only fast path in the render
   * phase, which updates cell styles without re-collecting text or
   * re-computing layout.
   *
   * A node is style-only when commitUpdate classifies contentChanged="style"
   * AND layoutChanged=false. The render phase checks this set to decide whether
   * to use restyleRegion() instead of full renderText()/renderBox().
   */
  styleOnly: Set<AgNode>
  /**
   * Nodes where scrollTo/scrollOffset changed. These don't affect Flexily
   * layout dimensions, but the scroll, sticky, scrollRect, and notify phases
   * must still run to update visible children positions.
   *
   * Written by reconciler (host-config.ts commitUpdate), read by ag.ts
   * layout-on-demand gate.
   */
  scroll: Set<AgNode>
  /**
   * Nodes where a notify-synced prop changed: `decorations`, `cursorOffset`,
   * `focused`, `selectionIntent`, `anchorRef` or `parkOffset`. The notify step
   * (`syncRectSignals` / `syncDecorationRects`) reads these straight from props
   * to write the node's layout signals. They change no dimension, so Flexily
   * stays clean, and without this set the layout-on-demand gate skipped the
   * notify step and the signals kept last frame's values.
   *
   * Written by reconciler (host-config.ts commitUpdate), read by the ag.ts
   * layout-on-demand gate, which then runs the notify step alone.
   */
  notify: Set<AgNode>
}

/**
 * Sets are attached lazily and keyed by the tree's epoch owner, so they are
 * collected with the tree and no two trees can reach each other's.
 */
const treeSets = new WeakMap<EpochOwner, TreeDirtySets>()

function setsFor(node: AgNode): TreeDirtySets {
  let sets = treeSets.get(node.epochOwner)
  if (!sets) {
    sets = { content: new Set(), styleOnly: new Set(), scroll: new Set(), notify: new Set() }
    treeSets.set(node.epochOwner, sets)
  }
  return sets
}

const EMPTY: ReadonlySet<AgNode> = new Set()

function peek(node: AgNode): TreeDirtySets | undefined {
  return treeSets.get(node.epochOwner)
}

// ---------------------------------------------------------------------------
// Write API (reconciler)
// ---------------------------------------------------------------------------

/** Mark a node as content-dirty. Called when content/style flags are set. */
export function trackContentDirty(node: AgNode): void {
  setsFor(node).content.add(node)
}

/**
 * Mark a node as style-only dirty. Called when commitUpdate sees
 * contentChanged="style" AND layoutChanged=false.
 * If a node is later marked with contentDirty, the render phase ignores
 * the style-only flag (full path takes precedence).
 */
export function trackStyleOnlyDirty(node: AgNode): void {
  setsFor(node).styleOnly.add(node)
}

/** Mark a node as scroll-dirty. Called when scrollTo/scrollOffset props change. */
export function trackScrollDirty(node: AgNode): void {
  setsFor(node).scroll.add(node)
}

/** Mark a node as notify-dirty. Called when a notify-synced prop changes. */
export function trackNotifyDirty(node: AgNode): void {
  setsFor(node).notify.add(node)
}

// ---------------------------------------------------------------------------
// Read API (pipeline phases)
// ---------------------------------------------------------------------------

/** O(1) check: does `node`'s tree have any content-dirty nodes? */
export function hasContentDirty(node: AgNode): boolean {
  return (peek(node)?.content.size ?? 0) > 0
}

/** O(1) check: does `node`'s tree have any scroll-dirty nodes? */
export function hasScrollDirty(node: AgNode): boolean {
  return (peek(node)?.scroll.size ?? 0) > 0
}

/** O(1) check: does `node`'s tree have any notify-dirty nodes? */
export function hasNotifyDirty(node: AgNode): boolean {
  return (peek(node)?.notify.size ?? 0) > 0
}

/** O(1) check: is this node style-only dirty (eligible for fast path)? */
export function isStyleOnlyDirty(node: AgNode): boolean {
  return peek(node)?.styleOnly.has(node) ?? false
}

/** Get `node`'s tree's set of content-dirty nodes (for iteration). */
export function getContentDirtyNodes(node: AgNode): ReadonlySet<AgNode> {
  return peek(node)?.content ?? EMPTY
}

// ---------------------------------------------------------------------------
// Clear API (after render pass)
// ---------------------------------------------------------------------------

/**
 * Clear dirty tracking for `node`'s tree. Called after each render pass of THAT
 * tree completes — never for anyone else's.
 */
export function clearDirtyTracking(node: AgNode): void {
  const sets = peek(node)
  if (!sets) return
  sets.content.clear()
  sets.styleOnly.clear()
  sets.scroll.clear()
  sets.notify.clear()
}
