/**
 * Render Epoch + Bit-Packed Dirty Flags
 *
 * A monotonically increasing counter that replaces boolean dirty flags.
 * Instead of setting `node.contentDirty = true` and later clearing with
 * `node.contentDirty = false`, the reconciler stamps `node.dirtyEpoch = renderEpoch`
 * and sets the appropriate bit in `node.dirtyBits`. The render phase checks
 * `node.dirtyEpoch === renderEpoch && (node.dirtyBits & BIT) !== 0`.
 *
 * Clearing all flags is O(1): just `renderEpoch++`. The old O(N) tree walk
 * in clearDirtyFlags becomes unnecessary — stale epoch stamps automatically
 * read as "not dirty" once the epoch advances.
 *
 * INITIAL_EPOCH (-1) is the sentinel for "never dirty". New nodes use the
 * current epoch so they appear dirty on first render.
 *
 * ## Bit-Packed Dirty Flags (S-MEM)
 *
 * Seven dirty flags are packed into a single `dirtyBits` number field:
 *   bit 0: content      (text content or content-affecting props changed)
 *   bit 1: styleProps   (visual props changed: color, bg, border, etc.)
 *   bit 2: bg           (backgroundColor specifically changed)
 *   bit 3: children     (direct children added/removed/reordered)
 *   bit 4: subtree      (this node or any descendant has dirty content/layout)
 *   bit 5: absoluteChildMutated   (absolute child had structural changes)
 *   bit 6: descendantOverflow     (descendant overflow changed)
 *
 * Note: outlines do NOT get a dirty bit — they're handled by the separate
 * decoration phase (see pipeline/decoration-phase.ts) which redraws them
 * every frame using per-cell snapshots.
 *
 * Combined with `dirtyEpoch`, this reduces per-node memory from 56 bytes
 * (7 separate epoch fields × 8 bytes) to 16 bytes (2 fields × 8 bytes).
 */

/** Sentinel value: node has never been marked dirty for this flag. */
export const INITIAL_EPOCH = -1

// ============================================================================
// Dirty Bit Constants
// ============================================================================

/** Content changed (text content or content-affecting props). */
export const CONTENT_BIT = 1 << 0 // 0b0000001
/** Visual style props changed (color, bg, border, etc.). */
export const STYLE_PROPS_BIT = 1 << 1 // 0b0000010
/** backgroundColor specifically changed. */
export const BG_BIT = 1 << 2 // 0b0000100
/** Direct children added, removed, or reordered. */
export const CHILDREN_BIT = 1 << 3 // 0b0001000
/** This node or any descendant has dirty content/layout. */
export const SUBTREE_BIT = 1 << 4 // 0b0010000
/** Absolute-positioned child had structural changes. */
export const ABS_CHILD_BIT = 1 << 5 // 0b0100000
/** Descendant overflow changed. */
export const DESC_OVERFLOW_BIT = 1 << 6 // 0b1000000

/** All reconciler-owned bits (content + styleProps + bg + children + subtree). */
export const ALL_RECONCILER_BITS = CONTENT_BIT | STYLE_PROPS_BIT | BG_BIT | CHILDREN_BIT | SUBTREE_BIT

/** All bits combined. */
export const ALL_BITS =
  CONTENT_BIT | STYLE_PROPS_BIT | BG_BIT | CHILDREN_BIT | SUBTREE_BIT | ABS_CHILD_BIT | DESC_OVERFLOW_BIT

/**
 * The current render epoch. Incremented after each render pass.
 * Reconciler stamps dirty nodes with this value; render phase checks equality.
 */
let renderEpoch = 0

/** Get the current render epoch value. */
export function getRenderEpoch(): number {
  return renderEpoch
}

/**
 * Advance the render epoch. Called once at the end of each render pass.
 * All nodes stamped with the old epoch instantly become "not dirty".
 */
export function advanceRenderEpoch(): void {
  renderEpoch++
}

/**
 * Check if an epoch stamp matches the current render epoch (i.e., "is dirty").
 */
export function isCurrentEpoch(epoch: number): boolean {
  return epoch === renderEpoch
}

// ============================================================================
// Bit-Packed Dirty Flag Helpers
// ============================================================================

/**
 * Check if a specific dirty bit is set for the current epoch.
 * Returns true if dirtyEpoch matches the current render epoch AND the bit is set.
 */
export function isDirty(dirtyBits: number, dirtyEpoch: number, bit: number): boolean {
  return dirtyEpoch === renderEpoch && (dirtyBits & bit) !== 0
}

/**
 * Check if ANY dirty bit is set for the current epoch.
 */
export function isAnyDirty(dirtyBits: number, dirtyEpoch: number): boolean {
  return dirtyEpoch === renderEpoch && dirtyBits !== 0
}

/**
 * Set a dirty bit on a node. If the epoch has changed since last write,
 * resets all bits and starts fresh with only the new bit.
 *
 * @returns The new dirtyBits value (caller must assign to node.dirtyBits).
 */
export function setDirtyBit(dirtyBits: number, dirtyEpoch: number, bit: number): number {
  if (dirtyEpoch !== renderEpoch) {
    return bit // new epoch — reset to just this bit
  }
  return dirtyBits | bit // same epoch — add bit
}
