/**
 * Cascade Predicates — Pure boolean logic extracted from renderNodeToBuffer.
 *
 * These 6 computed values (plus 1 intermediate: textPaintDirty) control the
 * entire incremental rendering cascade. Extracted here for exhaustive testing.
 *
 * The actual rendering code in render-phase.ts computes some inputs inline
 * (absoluteChildMutated, descendantOverflowChanged require node tree access),
 * but the boolean algebra is identical.
 *
 * TRUTH TABLE (key invariants):
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ canSkipEntireSubtree                                                               │
 * │   = hasPrevBuffer && !contentDirty && !stylePropsDirty && !layoutChanged        │
 * │     && !subtreeDirty && !childrenDirty && !childPositionChanged            │
 * │     && !ancestorLayoutChanged                                              │
 * │   True only when hasPrevBuffer=true AND all 7 dirty flags are false.       │
 * │   When true, the node is skipped entirely (clone has correct pixels).      │
 * │   NOTE: render-phase.ts also checks !scrollOffsetChanged (node-level      │
 * │   defensive check for scroll containers — not modeled here).               │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ textPaintDirty (intermediate)                                              │
 * │   = isTextNode && stylePropsDirty                                               │
 * │   For TEXT nodes, stylePropsDirty IS a content area change (no borders).        │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ contentAreaAffected                                                        │
 * │   = contentDirty || layoutChanged || childPositionChanged                  │
 * │     || childrenDirty || bgDirty || textPaintDirty                          │
 * │     || absoluteChildMutated || descendantOverflowChanged                   │
 * │   True when anything changed that affects the node's content area.         │
 * │   Excludes border-only paint changes for BOX nodes.                        │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ bgRefillNeeded                                                         │
 * │   = hasPrevBuffer && !contentAreaAffected && subtreeDirty && hasBgColor    │
 * │   Descendant changed inside a bg-bearing Box. Forces bg refill.           │
 * │   Mutually exclusive with contentAreaAffected (gated on !contentAreaAffected).│
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ contentRegionCleared                                                        │
 * │   = (hasPrevBuffer || ancestorCleared) && contentAreaAffected              │
 * │     && !hasBgColor                                                         │
 * │   Clear region with inherited bg when content changed but no own bg fill.  │
 * │   False when hasPrevBuffer=false AND ancestorCleared=false (fresh buffer). │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ skipBgFill                                                                 │
 * │   = hasPrevBuffer && !ancestorCleared && !contentAreaAffected              │
 * │     && !bgRefillNeeded                                                 │
 * │   Clone already has correct bg. Skip redundant fill.                       │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ childrenNeedFreshRender                                                        │
 * │   = (hasPrevBuffer || ancestorCleared) && (contentAreaAffected             │
 * │     || bgRefillNeeded)                                                 │
 * │   Children must re-render (childHasPrev=false).                            │
 * │   False when hasPrevBuffer=false AND ancestorCleared=false (fresh buffer). │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * KEY INVARIANTS:
 *   1. contentAreaAffected && bgRefillNeeded can never both be true
 *      (bgRefillNeeded is gated on !contentAreaAffected)
 *   2. contentRegionCleared && skipBgFill can never both be true
 *      (contentRegionCleared requires contentAreaAffected; skipBgFill requires !contentAreaAffected)
 *   3. When !hasPrevBuffer && !ancestorCleared: contentRegionCleared=false, childrenNeedFreshRender=false
 *      (both gated on hasPrevBuffer || ancestorCleared)
 *   4. canSkipEntireSubtree requires hasPrevBuffer=true
 */

/** Inputs to the cascade predicates (all boolean flags from renderNodeToBuffer) */
export interface CascadeInputs {
  hasPrevBuffer: boolean
  contentDirty: boolean
  stylePropsDirty: boolean
  layoutChanged: boolean
  subtreeDirty: boolean
  childrenDirty: boolean
  childPositionChanged: boolean
  ancestorLayoutChanged: boolean
  ancestorCleared: boolean
  bgDirty: boolean
  isTextNode: boolean
  hasBgColor: boolean
  absoluteChildMutated: boolean
  descendantOverflowChanged: boolean
}

/** Outputs of the cascade predicates */
export interface CascadeOutputs {
  canSkipEntireSubtree: boolean
  contentAreaAffected: boolean
  bgRefillNeeded: boolean
  contentRegionCleared: boolean
  skipBgFill: boolean
  childrenNeedFreshRender: boolean
  /**
   * True when bgDirty is the ONLY reason contentAreaAffected is true, and the
   * node has a backgroundColor. In this case, renderBox can use fillBg() (which
   * preserves existing chars) instead of fill() (which overwrites with spaces).
   * This avoids the cascade to children — clean children keep their chars from
   * the cloned buffer with the new bg applied.
   *
   * Requirements: hasPrevBuffer, bgDirty, hasBgColor, no other contentAreaAffected triggers.
   */
  bgOnlyChange: boolean
}

/**
 * Compute all cascade predicate values from boolean inputs.
 *
 * This is a pure function — no side effects, no node dependencies.
 * The formulas exactly match those in render-phase.ts renderNodeToBuffer.
 */
export function computeCascade(inputs: CascadeInputs): CascadeOutputs {
  const {
    hasPrevBuffer,
    contentDirty,
    stylePropsDirty,
    layoutChanged,
    subtreeDirty,
    childrenDirty,
    childPositionChanged,
    ancestorLayoutChanged,
    ancestorCleared,
    bgDirty,
    isTextNode,
    hasBgColor,
    absoluteChildMutated,
    descendantOverflowChanged,
  } = inputs

  // FAST PATH: Skip unchanged subtrees when we have a valid previous buffer.
  const canSkipEntireSubtree =
    hasPrevBuffer &&
    !contentDirty &&
    !stylePropsDirty &&
    !layoutChanged &&
    !subtreeDirty &&
    !childrenDirty &&
    !childPositionChanged &&
    !ancestorLayoutChanged

  // Intermediate: for TEXT nodes, stylePropsDirty IS a content area change (no borders).
  const textPaintDirty = isTextNode && stylePropsDirty

  // Did this node's CONTENT AREA change?
  const contentAreaAffected =
    contentDirty ||
    layoutChanged ||
    childPositionChanged ||
    childrenDirty ||
    bgDirty ||
    textPaintDirty ||
    absoluteChildMutated ||
    descendantOverflowChanged

  // Is bgDirty the ONLY trigger for contentAreaAffected?
  // When true AND hasBgColor: we can use fillBg() (preserves chars) instead of
  // fill() (overwrites with spaces), eliminating the cascade to children.
  const bgOnlyAffected =
    bgDirty &&
    !contentDirty &&
    !layoutChanged &&
    !childPositionChanged &&
    !childrenDirty &&
    !textPaintDirty &&
    !absoluteChildMutated &&
    !descendantOverflowChanged

  // Style-only fast path: when only bg changed on a Box with bg, use fillBg
  // to preserve child chars. Children see hasPrevBuffer=true (skippable).
  //
  // Additional safety checks:
  // - !ancestorLayoutChanged: children's positions may have shifted in the clone
  // - !ancestorCleared: parent cleared stale pixels, children must re-render
  //
  // IMPORTANT: this is only safe when no descendant has its own explicit
  // backgroundColor that would be incorrectly overwritten by fillBg. The
  // render phase checks this condition (hasDescendantWithBg) and falls back
  // to the full path when descendants have their own bg.
  // DISABLED: bgOnlyChange fast path causes incremental rendering mismatches
  // (fg colors lost on child nodes). Needs investigation before re-enabling.
  const bgOnlyChange = false

  // Descendant changed inside a bg-bearing Box (forces bg refill).
  const bgRefillNeeded = hasPrevBuffer && !contentAreaAffected && subtreeDirty && hasBgColor

  // Clear region with inherited bg when content changed but no own bg fill.
  // bgOnlyChange on nodes WITHOUT bg still needs clearing (bg removed).
  const contentRegionCleared = (hasPrevBuffer || ancestorCleared) && contentAreaAffected && !hasBgColor

  // Skip bg fill when clone already has correct bg at this position.
  const skipBgFill = hasPrevBuffer && !ancestorCleared && !contentAreaAffected && !bgRefillNeeded

  // Children must re-render (content area modified OR bg needs refresh).
  // Exception: bgOnlyChange uses fillBg() which preserves chars, so children
  // don't need fresh render — they keep their correct chars from the clone.
  const childrenNeedFreshRender =
    (hasPrevBuffer || ancestorCleared) && (contentAreaAffected || bgRefillNeeded) && !bgOnlyChange

  return {
    canSkipEntireSubtree,
    contentAreaAffected,
    bgRefillNeeded,
    contentRegionCleared,
    skipBgFill,
    childrenNeedFreshRender,
    bgOnlyChange,
  }
}
