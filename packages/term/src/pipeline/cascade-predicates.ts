/**
 * Cascade Predicates — Pure boolean logic extracted from renderNodeToBuffer.
 *
 * These 6 computed values (plus 1 intermediate: textPaintDirty) control the
 * entire incremental rendering cascade. Extracted here for exhaustive testing.
 *
 * The actual rendering code in content-phase.ts computes some inputs inline
 * (absoluteChildMutated, descendantOverflowChanged require node tree access),
 * but the boolean algebra is identical.
 *
 * TRUTH TABLE (key invariants):
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ skipFastPath                                                               │
 * │   = hasPrevBuffer && !contentDirty && !paintDirty && !layoutChanged        │
 * │     && !subtreeDirty && !childrenDirty && !childPositionChanged            │
 * │     && !ancestorLayoutChanged                                              │
 * │   True only when hasPrevBuffer=true AND all 7 dirty flags are false.       │
 * │   When true, the node is skipped entirely (clone has correct pixels).      │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ textPaintDirty (intermediate)                                              │
 * │   = isTextNode && paintDirty                                               │
 * │   For TEXT nodes, paintDirty IS a content area change (no borders).        │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ contentAreaAffected                                                        │
 * │   = contentDirty || layoutChanged || childPositionChanged                  │
 * │     || childrenDirty || bgDirty || textPaintDirty                          │
 * │     || absoluteChildMutated || descendantOverflowChanged                   │
 * │   True when anything changed that affects the node's content area.         │
 * │   Excludes border-only paint changes for BOX nodes.                        │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ subtreeDirtyWithBg                                                         │
 * │   = hasPrevBuffer && !contentAreaAffected && subtreeDirty && hasBgColor    │
 * │   Descendant changed inside a bg-bearing Box. Forces bg refill.           │
 * │   Mutually exclusive with contentAreaAffected (gated on !contentAreaAffected).│
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ parentRegionCleared                                                        │
 * │   = (hasPrevBuffer || ancestorCleared) && contentAreaAffected              │
 * │     && !hasBgColor                                                         │
 * │   Clear region with inherited bg when content changed but no own bg fill.  │
 * │   False when hasPrevBuffer=false AND ancestorCleared=false (fresh buffer). │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ skipBgFill                                                                 │
 * │   = hasPrevBuffer && !ancestorCleared && !contentAreaAffected              │
 * │     && !subtreeDirtyWithBg                                                 │
 * │   Clone already has correct bg. Skip redundant fill.                       │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │ parentRegionChanged                                                        │
 * │   = (hasPrevBuffer || ancestorCleared) && (contentAreaAffected             │
 * │     || subtreeDirtyWithBg)                                                 │
 * │   Children must re-render (childHasPrev=false).                            │
 * │   False when hasPrevBuffer=false AND ancestorCleared=false (fresh buffer). │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * KEY INVARIANTS:
 *   1. contentAreaAffected && subtreeDirtyWithBg can never both be true
 *      (subtreeDirtyWithBg is gated on !contentAreaAffected)
 *   2. parentRegionCleared && skipBgFill can never both be true
 *      (parentRegionCleared requires contentAreaAffected; skipBgFill requires !contentAreaAffected)
 *   3. When !hasPrevBuffer && !ancestorCleared: parentRegionCleared=false, parentRegionChanged=false
 *      (both gated on hasPrevBuffer || ancestorCleared)
 *   4. skipFastPath requires hasPrevBuffer=true
 */

/** Inputs to the cascade predicates (all boolean flags from renderNodeToBuffer) */
export interface CascadeInputs {
  hasPrevBuffer: boolean
  contentDirty: boolean
  paintDirty: boolean
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
  skipFastPath: boolean
  contentAreaAffected: boolean
  subtreeDirtyWithBg: boolean
  parentRegionCleared: boolean
  skipBgFill: boolean
  parentRegionChanged: boolean
}

/**
 * Compute all cascade predicate values from boolean inputs.
 *
 * This is a pure function — no side effects, no node dependencies.
 * The formulas exactly match those in content-phase.ts renderNodeToBuffer.
 */
export function computeCascade(inputs: CascadeInputs): CascadeOutputs {
  const {
    hasPrevBuffer,
    contentDirty,
    paintDirty,
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
  const skipFastPath =
    hasPrevBuffer &&
    !contentDirty &&
    !paintDirty &&
    !layoutChanged &&
    !subtreeDirty &&
    !childrenDirty &&
    !childPositionChanged &&
    !ancestorLayoutChanged

  // Intermediate: for TEXT nodes, paintDirty IS a content area change (no borders).
  const textPaintDirty = isTextNode && paintDirty

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

  // Descendant changed inside a bg-bearing Box (forces bg refill).
  const subtreeDirtyWithBg = hasPrevBuffer && !contentAreaAffected && subtreeDirty && hasBgColor

  // Clear region with inherited bg when content changed but no own bg fill.
  const parentRegionCleared = (hasPrevBuffer || ancestorCleared) && contentAreaAffected && !hasBgColor

  // Skip bg fill when clone already has correct bg at this position.
  const skipBgFill = hasPrevBuffer && !ancestorCleared && !contentAreaAffected && !subtreeDirtyWithBg

  // Children must re-render (content area modified OR bg needs refresh).
  const parentRegionChanged = (hasPrevBuffer || ancestorCleared) && (contentAreaAffected || subtreeDirtyWithBg)

  return {
    skipFastPath,
    contentAreaAffected,
    subtreeDirtyWithBg,
    parentRegionCleared,
    skipBgFill,
    parentRegionChanged,
  }
}
