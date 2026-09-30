/**
 * Phase 2: Layout Phase
 *
 * Run Yoga layout calculation and propagate dimensions to all nodes.
 */

import { createLogger } from "loggily"
import { measureStats } from "./measure-stats"
import { type BoxProps, type AgNode, type Rect, rectEqual } from "@silvery/ag/types"
import {
  findApportionBandViolation,
  parseTrackBand,
  TRACK_BAND_ATTR,
  type RealizedTrack,
} from "@silvery/ag/apportion"
// Layout dirty gate: Flexily's root.layoutNode.isDirty() is the sole source
// of truth. No silvery-side layout dirty tracking needed.
import {
  getRenderEpoch,
  markDirty,
  setDirty,
  INITIAL_EPOCH,
  isCurrentEpoch,
  isDirty,
  SUBTREE_BIT,
  CHILDREN_BIT,
  ABS_CHILD_BIT,
  DESC_OVERFLOW_BIT,
} from "@silvery/ag/epoch"
import { getBorderSize, getPadding } from "./helpers"
import {
  syncDecorationRects,
  syncRectSignals,
  hasLayoutSignals,
  hasObservedLayoutSignal,
} from "@silvery/ag/layout-signals"
import { logPass, recordPassRing, INSTRUMENT } from "../runtime/pass-cause"
import { isStrictEnabled } from "../strict-mode"

const log = createLogger("silvery:layout")

// ============================================================================
// SILVERY_STRICT slugs for the layout-phase self-consistency invariants.
//
// These checks predated the slug system: they read `process.env.SILVERY_STRICT`
// directly and gated `throw` on `strict === "2"` (exact string match), so any
// compound tier spec (`incremental,2`, `1,2`, `2,3`) silently downgraded them to
// warn-only. Routing through `isStrictEnabled(slug, minTier)` fixes composability
// (they now throw under any tier >= their minTier, and honor `!slug` disables)
// WITHOUT changing plain tier-1 / tier-2 default behavior.
//
// Tiers match each check's historical effective tier:
//   - layout-flag       tier 1 — always threw at any truthy SILVERY_STRICT
//   - layout-overflow   tier 2 — threw only at "2", warned otherwise
//   - scroll-invariants tier 2 — threw only at "2", warned otherwise
// ============================================================================

/** layoutChangedThisFrame vs prevLayout!=boxRect consistency (throws on violation). */
export const LAYOUT_FLAG_STRICT_SLUG = "layout-flag"
export const LAYOUT_FLAG_STRICT_MIN_TIER = 1

/** Child overflows parent inner width (warn at tier 1, throw at tier 2). */
export const LAYOUT_OVERFLOW_STRICT_SLUG = "layout-overflow"
export const LAYOUT_OVERFLOW_STRICT_MIN_TIER = 2

/** Scroll/sticky offset + visibility invariants (warn at tier 1, throw at tier 2). */
export const SCROLL_INVARIANTS_STRICT_SLUG = "scroll-invariants"
export const SCROLL_INVARIANTS_STRICT_MIN_TIER = 2

/**
 * `apportion-bands` (tier 2): no track below its band minimum while a sibling
 * exceeds its band maximum, over REALIZED widths, every frame. Warn at tier 1,
 * throw at tier 2 — the layout-invariant convention.
 *
 * Why the check lives HERE and not inside `apportion()`: the allocator's own
 * postcondition is provable, so checking it against itself is a tautology that
 * can never fire. Every branch returns `min_i <= w_i <= max_i` (or `>= max_i`
 * for ALL tracks under `stretch`, which cannot starve anyone), so the
 * conjunction is unreachable by construction. What is NOT provable is what
 * happens to those widths afterwards: they become flex props and the engine has
 * the final say — `flexGrow` with no `maxWidth`, a shrink fallback floored at
 * the author's `minWidth` rather than the track's min-content, a measurement
 * round-trip that lags a frame. And a surface that still splits width with its
 * own arithmetic — the fifth splitter `@si/apportion-consolidation` exists to
 * prevent — breaks the contract without going near the allocator at all.
 *
 * Realized geometry lives in the layout phase, so the check does too. That also
 * dissolves the layering question the allocator's placement raises: `@silvery/ag`
 * does not import `@silvery/ag-term`, and it does not need to. It owns the
 * band marker and the pure predicate (target-agnostic integer math); the
 * strictness gate stays where every other strictness gate is.
 */
export const APPORTION_BANDS_STRICT_SLUG = "apportion-bands"
export const APPORTION_BANDS_STRICT_MIN_TIER = 2

/**
 * `fresh-layout` (tier 2): the STRICT incremental oracle's fresh-render baseline
 * force-recomputes layout from scratch (see markLayoutTreeDirty) instead of
 * sharing the incremental path's cleaned flexily tree. Catches a stale rect from
 * a layout-affecting change that failed to markDirty flexily — invisible to the
 * plain `incremental` check because its fresh path skips calculateLayout via the
 * ag.ts layout-on-demand gate. Tier 2: it doubles the fresh-render layout cost,
 * and flexily determinism (expectRelayoutMatchesFresh fuzz) keeps it false-
 * positive-free on clean code. Consumed by scheduler.ts / renderer.ts fresh paths.
 */
export const FRESH_LAYOUT_STRICT_SLUG = "fresh-layout"
export const FRESH_LAYOUT_STRICT_MIN_TIER = 2

/**
 * Force every layout node in the tree dirty so the next `calculateLayout()`
 * recomputes every node from its current style/measure inputs — defeating both
 * the ag.ts layout-on-demand skip gate AND flexily's per-node fingerprint cache.
 *
 * Root-first traversal: each non-root `markDirty()` hits an already-dirty
 * ancestor and stops propagating immediately, so the whole walk is O(N).
 *
 * Used ONLY by the `fresh-layout` STRICT slug to build an independent
 * from-scratch layout baseline for the incremental-vs-fresh comparison. On clean
 * code the recompute is bit-identical to the cached layout (flexily's
 * expectRelayoutMatchesFresh fuzz guarantees incremental≡fresh), so this neither
 * false-positives nor drifts the shared tree; a genuine stale rect surfaces as a
 * buffer mismatch and the frame throws before a next frame observes the tree.
 */
export function markLayoutTreeDirty(root: AgNode): void {
  const stack: AgNode[] = [root]
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    node.layoutNode?.markDirty()
    for (const child of node.children) stack.push(child)
  }
}

/**
 * Explicit identity props (testid / id / name / nodeId) when present.
 * Returns undefined for anonymous nodes so callers can decide how to
 * disambiguate (structural tag, named-ancestor walk).
 */
function explicitIdent(node: AgNode): string | undefined {
  const props = node.props as Record<string, unknown> | undefined
  return (
    (props?.["data-component"] as string | undefined) ??
    (props?.["testID"] as string | undefined) ??
    (props?.["testid"] as string | undefined) ??
    (props?.["id"] as string | undefined) ??
    (props?.["name"] as string | undefined) ??
    (props?.["nodeId"] as string | undefined)
  )
}

/**
 * Compact structural tag for an anonymous node — the layout props that make
 * one anonymous `silvery-box` distinguishable from another. Keeps only the
 * fields that meaningfully shape a feedback edge (a measured/scrolled box).
 * Example: `silvery-box[overflow=scroll,flexGrow=1]`.
 */
function structuralTag(node: AgNode): string {
  const props = (node.props ?? {}) as Record<string, unknown>
  const parts: string[] = []
  if (props.overflow !== undefined && props.overflow !== "visible") {
    parts.push(`overflow=${String(props.overflow)}`)
  }
  if (props.position !== undefined && props.position !== "relative") {
    parts.push(`position=${String(props.position)}`)
  }
  if (props.flexGrow) parts.push(`flexGrow=${String(props.flexGrow)}`)
  if (props.flexDirection !== undefined) parts.push(`dir=${String(props.flexDirection)}`)
  return parts.length > 0 ? `${node.type}[${parts.join(",")}]` : node.type
}

/**
 * Stable-ish identity string for an AgNode used by pass-cause records.
 *
 * Most boxes in a real app are anonymous (no testid/id/name/nodeId), so the
 * bare `node.type` collapses every feedback edge into the useless
 * `"silvery-box"` bucket — the attribution gap behind @km/silvercode/19383.
 *
 * When a node is anonymous we attribute the edge to a *component-ish path*:
 * the nearest named ancestor (a host component that DID set an identity prop)
 * plus the offending node's structural tag, e.g.
 * `silvery-box#chat-transcript > silvery-box[overflow=scroll]`. That is enough
 * to name which subscriber re-fires `boxSize` on every standalone batch even
 * when the leaf box itself carries no id.
 *
 * Gated by `INSTRUMENT` at every call site (inert no-op in `logPass`), so the
 * ancestor walk never runs in production when SILVERY_INSTRUMENT is unset.
 */
function nodeIdent(node: AgNode): string {
  const own = explicitIdent(node)
  if (own) return `${node.type}#${own}`

  // Anonymous node: find the nearest NAMED ancestor for context, capping the
  // walk so a deep tree doesn't pay an unbounded climb per record.
  let ancestor: AgNode | null = node.parent
  let hops = 0
  const MAX_HOPS = 12
  while (ancestor && hops < MAX_HOPS) {
    const named = explicitIdent(ancestor)
    if (named) return `${ancestor.type}#${named} > ${structuralTag(node)}`
    ancestor = ancestor.parent
    hops += 1
  }
  // No named ancestor within reach — fall back to a structural tag plus the
  // immediate parent's type so sibling anonymous boxes don't fully collide.
  const parentType = node.parent?.type
  return parentType ? `${parentType} > ${structuralTag(node)}` : structuralTag(node)
}

function nodePath(node: AgNode): string {
  const path: string[] = []
  let current: AgNode | null = node
  while (current) {
    path.push(nodeIdent(current))
    current = current.parent
  }
  return path.reverse().join(" > ")
}

function layoutPropsForLog(node: AgNode): Record<string, unknown> {
  const props = (node.props ?? {}) as Record<string, unknown>
  return {
    width: props.width,
    maxWidth: props.maxWidth,
    minWidth: props.minWidth,
    flexGrow: props.flexGrow,
    flexShrink: props.flexShrink,
    flexBasis: props.flexBasis,
    alignSelf: props.alignSelf,
    position: props.position,
    overflow: props.overflow,
    borderStyle: props.borderStyle,
    padding: props.padding,
    paddingLeft: props.paddingLeft,
    paddingRight: props.paddingRight,
  }
}

function normalizeScrollOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0
  return Math.round(offset)
}

/**
 * Run Yoga layout calculation and propagate dimensions to all nodes.
 *
 * @param root The root SilveryNode
 * @param width Terminal width in columns
 * @param height Terminal height in rows
 */
export function layoutPhase(
  root: AgNode,
  width: number,
  height: number,
  forceFullPropagate = false,
): void {
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
    if (isDirty(root, SUBTREE_BIT)) {
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
  //
  // `forceFullPropagate` (the `fresh-layout` STRICT slug's independent baseline)
  // also disables the skip: after markLayoutTreeDirty forces a from-scratch
  // recompute, a stale rect appears as a CHANGED child under an UNCHANGED
  // ancestor (e.g. a resized item in a fixed-width row), which the parent-match
  // prune would otherwise drop — leaving boxRect stale and hiding the divergence.
  const incrementalSkip = !dimensionsChanged && !forceFullPropagate
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
 * - No ancestor rectangle changed in this propagation branch. Descendants
 *   can depend on a resized CQ through an unchanged fixed-size wrapper, so
 *   a matching immediate parent rectangle alone is insufficient.
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
    !isDirty(node, SUBTREE_BIT) &&
    !isDirty(node, CHILDREN_BIT)
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

  // CLS instrumentation moved out of layout phase 2026-05-13 (Option C
  // consolidation, bead @km/silvery/cls-instrumentation-primitive Phase 9b).
  // The boxRect-domain hook here missed scroll- and sticky-induced shifts —
  // exactly the user-visible flicker class CLS exists to catch. CLS now
  // reads screenRect (post-scroll, sticky-aware) via cls-monitor.onCommit
  // at the renderer-level commit boundary (renderer.ts doRender).

  // Set authoritative "layout changed this frame" epoch stamp.
  // Unlike !rectEqual(prevLayout, boxRect) which becomes stale when
  // layout phase skips on subsequent frames, this epoch is explicitly set
  // each time propagateLayout runs and expires when the render epoch advances.
  const layoutDidChange = !!(node.prevLayout && !rectEqual(node.prevLayout, node.boxRect))
  node.layoutChangedThisFrame = layoutDidChange ? getRenderEpoch(node) : INITIAL_EPOCH

  // STRICT invariant: if layoutChangedThisFrame is current epoch, prevLayout must differ from boxRect.
  // This validates that the flag is consistent with the actual rect comparison. A violation
  // would mean the flag is set spuriously, causing unnecessary re-renders and cascade propagation.
  if (
    isStrictEnabled(LAYOUT_FLAG_STRICT_SLUG, LAYOUT_FLAG_STRICT_MIN_TIER) &&
    isCurrentEpoch(node, node.layoutChangedThisFrame)
  ) {
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
  if (isCurrentEpoch(node, node.layoutChangedThisFrame)) {
    let ancestor = node.parent
    while (ancestor && !isDirty(ancestor, SUBTREE_BIT)) {
      markDirty(ancestor, SUBTREE_BIT)
      ancestor = ancestor.parent
    }
  }

  // A changed ancestor can alter descendant layout through an unchanged
  // wrapper (for example, CQ units). Visit that entire branch; unrelated
  // branches can still use the incremental prune.
  for (const child of node.children) {
    propagateLayout(child, rect.x, rect.y, incrementalSkip && !layoutDidChange)
  }

  // Cache cascade inputs that render-phase would otherwise compute via tree walks.
  // Both checks require children to have finalized layoutChangedThisFrame, boxRect,
  // prevLayout, childrenDirtyEpoch, and subtreeDirtyEpoch — all set above.
  // Guard: only compute when subtreeDirty (matches buildCascadeInputs guard).
  if (isDirty(node, SUBTREE_BIT) && node.children.length > 0) {
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
    setDirty(node, bits)
  } else {
    // Clear layout-phase bits (keep reconciler bits intact)
    if (node.dirtyEpoch === getRenderEpoch(node)) {
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
  if (!isDirty(node, SUBTREE_BIT)) return
  if (!node.children || node.children.length === 0) return

  // Recurse into dirty children first (they need their own cascade inputs)
  for (const child of node.children) {
    if (isDirty(child, SUBTREE_BIT)) {
      propagateCascadeInputs(child)
    }
  }

  // Compute cascade inputs for this node (same logic as in propagateLayout)
  const absChild = _hasAbsoluteChildMutated(node.children)
  const descOverflow = node.boxRect ? _hasDescendantOverflowChanged(node, node.boxRect) : false

  let bits = node.dirtyBits
  if (absChild) bits |= ABS_CHILD_BIT
  else bits &= ~ABS_CHILD_BIT
  if (descOverflow) bits |= DESC_OVERFLOW_BIT
  else bits &= ~DESC_OVERFLOW_BIT
  setDirty(node, bits)
}

/**
 * Check if any direct child is position="absolute" and had structural changes.
 */
function _hasAbsoluteChildMutated(children: readonly AgNode[]): boolean {
  for (const child of children) {
    const cp = child.props as BoxProps
    if (
      cp.position === "absolute" &&
      (isDirty(child, CHILDREN_BIT) ||
        isCurrentEpoch(child, child.layoutChangedThisFrame) ||
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
 * Lightweight `getEffectiveBg` for the layout phase. Mirrors the
 * production helper in `render-box.ts` (Sterling-aware: `bg-surface-default`
 * → legacy `bg`). Inlined here to avoid a layout→render-box import cycle.
 *
 * The render phase still uses its own `getEffectiveBg` for the cascade
 * formulas; this duplicate exists ONLY so the layout phase can flag
 * "bg-bearing descendant moved/shrank" without dragging render-box into
 * the layout module graph.
 */
function _layoutGetEffectiveBg(props: BoxProps): string | undefined {
  if (props.backgroundColor) return props.backgroundColor as string
  const theme = props.theme as Record<string, unknown> | undefined
  if (theme) {
    const sterlingBg = theme["bg-surface-default"]
    if (typeof sterlingBg === "string") return sterlingBg
    const legacyBg = theme["bg"]
    if (typeof legacyBg === "string") return legacyBg
  }
  return undefined
}

/**
 * True iff `prev` has any cells NOT covered by `cur` (shrink, move, or any
 * combination thereof). This is the "bg residue" predicate: cells the
 * painter occupied before but doesn't occupy now. Equivalent to
 * `prev \ cur ≠ ∅`.
 */
function _prevHasResidueOutside(
  prev: Rect,
  cur: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    prev.x < cur.x ||
    prev.y < cur.y ||
    prev.x + prev.width > cur.x + cur.width ||
    prev.y + prev.height > cur.y + cur.height
  )
}

/**
 * Check if any descendant was overflowing THIS node's rect and had its layout
 * change OR if any bg-bearing descendant shrank/moved within this node's rect
 * (leaving stale bg residue inside).
 *
 * Two related cases:
 *
 *   1. **Outside-overflow** (original): descendant's prev rect extended
 *      BEYOND `node`'s current rect. The descendant either grew past
 *      `node`'s edge before and shrank back inside, or moved out and back —
 *      either way `node`'s border/padding cells outside the descendant's
 *      new rect carry stale pixels.
 *
 *   2. **Inside-bg-residue** (added 2026-05-07, bead
 *      @km/silvery/incremental-bg-residue-shrink-move): descendant has
 *      `effectiveBg` AND its prev rect has cells NOT covered by its
 *      current rect (any shrink/move). The painter's prev paint covered
 *      those cells with its bg; on this frame nothing in the painter's
 *      subtree paints them. If those cells are within `node`'s rect,
 *      `node` must clear them via its own `clearNodeRegion` (when
 *      transparent) or `renderBox` fill (when bg-bearing). Without this
 *      flag, `node`'s contentAreaAffected may be FALSE — the painter's
 *      `clearExcessArea` SKIPS due to the position-change guard, and
 *      `node`'s fast-path-with-subtreeDirty doesn't trigger any cleanup.
 *      The cell carries forward bg from the prev frame indefinitely.
 *
 *      Why on `node` and not just the immediate parent: the residue
 *      cells must be covered by SOME ancestor that clears or fills.
 *      The closest transparent ancestor that contains the residue cells
 *      must clear them; if every ancestor up to a bg-bearing one is
 *      transparent, that bg-bearing ancestor's renderBox fill suffices.
 *      Setting the flag at every ancestor whose rect contains residue
 *      cells guarantees coverage regardless of where the bg-break is.
 *
 * Recursive: follows subtreeDirty paths for efficiency. Returns early on
 * first match. Performance: only runs when subtreeDirty (matches the
 * `_hasAbsoluteChildMutated` guard); for typical UI updates the search
 * touches < 10 nodes before terminating.
 */
function _hasDescendantOverflowChanged(node: AgNode, rect: Rect): boolean {
  // Compare descendants against this node's CONTENT area (rect minus border +
  // padding), not its full rect. A descendant whose prev rect reached into the
  // node's own border/padding ring — e.g. a child that painted over the node's
  // border column — and then retreats leaves stale pixels on cells the node
  // OWNS (its border glyphs / padding bg). Those cells must be repainted by THIS
  // node, so the node must flag contentAreaAffected.
  //
  // The full-rect check (`prevRight > nodeRight`) misses the descendant that sat
  // EXACTLY on the border (prevRight === nodeRight): a transparent inner content
  // box (nodeRight = borderCol) detects + clears the border column as "its"
  // overflow strip, but the bordered ancestor (nodeRight = borderCol + 1) saw
  // the descendant as fitting inside and never repainted its border — the
  // @si/render/20529-rapid-border deck-pane border drop. Insetting by the
  // border/padding ring makes the bordered ancestor detect it, repaint its
  // border, and cascade childrenNeedFreshRender so the inner box renders fresh
  // (no second overflow clear). Borderless, unpadded nodes inset by 0 — their
  // content area equals their full rect, so this is a no-op for them.
  const props = node.props as BoxProps
  const border = getBorderSize(props)
  const padding = getPadding(props)
  return _checkDescendantOverflow(
    node.children,
    rect.x + border.left + padding.left,
    rect.y + border.top + padding.top,
    rect.x + rect.width - border.right - padding.right,
    rect.y + rect.height - border.bottom - padding.bottom,
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
    if (child.prevLayout && isCurrentEpoch(child, child.layoutChangedThisFrame)) {
      const prev = child.prevLayout
      // Case 1: prev extended outside `node`'s current rect.
      if (
        prev.x + prev.width > nodeRight ||
        prev.y + prev.height > nodeBottom ||
        prev.x < nodeLeft ||
        prev.y < nodeTop
      ) {
        return true
      }
      // Case 2: bg-bearing descendant shrank/moved within `node`'s rect,
      // leaving residue cells that nothing in its subtree will repaint.
      // The intersection of (prev \ cur) with `node`'s rect is the residue
      // inside `node`. We over-approximate with `prev \ cur ≠ ∅` AND
      // `descendant has effectiveBg` — if any residue cell is inside
      // `node`, we must flag.
      if (child.boxRect) {
        const props = child.props as BoxProps
        if (
          _layoutGetEffectiveBg(props) !== undefined &&
          _prevHasResidueOutside(prev, child.boxRect)
        ) {
          // Residue exists somewhere in `prev \ cur`. Check if any of it
          // intersects `node`'s rect. Since `prev` is the painter's old
          // rect (which was within or overlapping `node` last frame),
          // and `node`'s current rect contains the painter's CURRENT
          // rect (or at least overlaps it), the residue is almost always
          // inside `node`. Use the conservative test: prev ∩ node ≠ ∅.
          const ix1 = Math.max(prev.x, nodeLeft)
          const iy1 = Math.max(prev.y, nodeTop)
          const ix2 = Math.min(prev.x + prev.width, nodeRight)
          const iy2 = Math.min(prev.y + prev.height, nodeBottom)
          if (ix2 > ix1 && iy2 > iy1) {
            return true
          }
        }
      }
    }
    if (isDirty(child, SUBTREE_BIT) && child.children !== undefined) {
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
  const sizeChanged =
    (node.prevLayout?.width ?? 0) !== (node.boxRect?.width ?? 0) ||
    (node.prevLayout?.height ?? 0) !== (node.boxRect?.height ?? 0)
  const screenChanged = !rectEqual(node.prevScrollRect, node.scrollRect)
  const renderChanged = !rectEqual(node.prevScreenRect, node.screenRect)

  // Pass-cause emit: when a rect signal value actually changes AND a
  // subscriber is present (signals lazily allocate via getLayoutSignals
  // when useBoxRect/useScrollRect mount), useSyncExternalStore consumers
  // can forceUpdate(), which the convergence loop sees as `hadReactCommit`
  // and answers with another pass.
  //
  // The hasLayoutSignals(node) gate is the dual-pro-recommended fix for
  // the "99.83% layout-invalidate noise" problem: an unsubscribed rect
  // sync is bookkeeping volume, not a feedback edge. Without this gate
  // the bucket buries every other category. With this gate the histogram
  // measures actual subscriber-driven feedback that bounded-convergence
  // (C3b) needs to bound.
  //
  // Always-on lightweight capture for the bounded-convergence violation ring
  // (independent of INSTRUMENT, so a production violation names its cause). Uses
  // the cheap `explicitIdent` (named id or bare type) — NOT the ancestor-walk
  // `nodeIdent`, which stays INSTRUMENT-only below. Only changed-rect SUBSCRIBED
  // nodes pay (hasLayoutSignals gate); records the single dominant edge.
  if ((contentChanged || screenChanged || renderChanged) && hasLayoutSignals(node)) {
    const ringId = explicitIdent(node) ?? node.type
    if (sizeChanged && hasObservedLayoutSignal(node, "boxSize")) {
      recordPassRing("layout-invalidate", "boxSize", ringId)
    } else if (contentChanged && hasObservedLayoutSignal(node, "boxRect")) {
      recordPassRing("layout-invalidate", "boxRect", ringId)
    } else if (screenChanged && hasObservedLayoutSignal(node, "scrollRect")) {
      recordPassRing("layout-invalidate", "scrollRect", ringId)
    } else if (renderChanged && hasObservedLayoutSignal(node, "screenRect")) {
      recordPassRing("layout-invalidate", "screenRect", ringId)
    }
  }

  // Gated on INSTRUMENT (module-level constant) so V8/JSC fold the entire
  // block out of the hot path when SILVERY_INSTRUMENT is unset.
  if (INSTRUMENT) {
    if (contentChanged || screenChanged || renderChanged) {
      // hasLayoutSignals returns true iff getLayoutSignals(node) was
      // called previously — which happens lazily on first subscriber.
      const observed = hasLayoutSignals(node)
      if (observed) {
        const ident = nodeIdent(node)
        if (contentChanged && hasObservedLayoutSignal(node, "boxRect")) {
          logPass({
            cause: "layout-invalidate",
            edge: "boxRect",
            nodeId: ident,
            producerPhase: "layout",
          })
        }
        if (sizeChanged && hasObservedLayoutSignal(node, "boxSize")) {
          logPass({
            cause: "layout-invalidate",
            edge: "boxSize",
            nodeId: ident,
            producerPhase: "layout",
          })
        }
        if (screenChanged && hasObservedLayoutSignal(node, "scrollRect")) {
          logPass({
            cause: "layout-invalidate",
            edge: "scrollRect",
            nodeId: ident,
            producerPhase: "layout",
          })
        }
        if (renderChanged && hasObservedLayoutSignal(node, "screenRect")) {
          logPass({
            cause: "layout-invalidate",
            edge: "screenRect",
            nodeId: ident,
            producerPhase: "layout",
          })
        }
      }
    }
  }

  // Sync current rect values into layout signals. The signal layer also
  // tracks which rect fields were actually read, so instrumentation can
  // avoid counting measurement-only boxes as scroll/screen subscribers.
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
  // Runs at tier 1 (warn) and above; throws at the slug's min-tier (2) and above.
  if (!isStrictEnabled(LAYOUT_OVERFLOW_STRICT_SLUG, 1)) return

  const shouldThrow = isStrictEnabled(LAYOUT_OVERFLOW_STRICT_SLUG, LAYOUT_OVERFLOW_STRICT_MIN_TIER)

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
          const detail = {
            child: nodeIdent(child),
            parent: nodeIdent(node),
            childPath: nodePath(child),
            childBox: child.boxRect,
            parentBox: node.boxRect,
            parentInnerWidth,
            border,
            padding,
            childProps: layoutPropsForLog(child),
            parentProps: layoutPropsForLog(node),
          }
          const msg =
            `[SILVERY_STRICT] Layout overflow: child "${childId}" width ${child.boxRect.width} ` +
            `exceeds parent "${parentId}" inner width ${parentInnerWidth} ` +
            `(parent box: ${node.boxRect.width}, border: ${border.left}+${border.right}, padding: ${padding.left}+${padding.right}, path: ${detail.childPath})`

          if (shouldThrow) {
            throw new Error(msg)
          } else {
            log.debug?.("layout overflow", detail)
            console.warn(msg)
          }
        }
      }

      walk(child)
    }
  }

  walk(root)
}

// ============================================================================
// STRICT Apportionment Band Invariant
// ============================================================================

/**
 * Verify, per frame, that no `data-track-band` track rendered below its band
 * minimum while a sibling rendered above its band maximum.
 *
 * Tracks are grouped by parent, because "sibling" is the whole claim: a starved
 * track next to a hoarding one is a misallocation, whereas the same starvation
 * next to tracks that are all within band is deliberate degradation.
 *
 * - SILVERY_STRICT=1: console.warn on violation
 * - SILVERY_STRICT=2: throw on violation
 *
 * Only nodes that carry the marker participate — a surface opts in by stamping
 * the band it allocated under. Nodes whose layout has not been computed yet
 * (null boxRect) are skipped; there is no width to judge.
 */
export function strictApportionBandsCheck(root: AgNode): void {
  // Runs at tier 1 (warn) and above; throws at the slug's min-tier (2) and above.
  if (!isStrictEnabled(APPORTION_BANDS_STRICT_SLUG, 1)) return

  const shouldThrow = isStrictEnabled(APPORTION_BANDS_STRICT_SLUG, APPORTION_BANDS_STRICT_MIN_TIER)

  function report(parent: AgNode, group: readonly AgNode[], realized: RealizedTrack[]): void {
    const violation = findApportionBandViolation(realized)
    if (violation === null) return

    const starved = realized[violation.starved]
    const donor = realized[violation.donor]
    const starvedNode = group[violation.starved]
    const donorNode = group[violation.donor]
    if (!starved || !donor || !starvedNode || !donorNode) {
      throw new Error(
        `[SILVERY_STRICT] apportion violation indices ${violation.starved}/${violation.donor} ` +
          `do not match realized tracks and children in ${nodePath(parent)}`,
      )
    }
    const detail = {
      container: nodeIdent(parent),
      containerPath: nodePath(parent),
      containerBox: parent.boxRect,
      starved: nodeIdent(starvedNode),
      donor: nodeIdent(donorNode),
      tracks: realized,
    }
    const msg =
      `[SILVERY_STRICT] apportion band violation in "${nodeIdent(parent)}": track ` +
      `"${detail.starved}" rendered ${starved.width} cells, below its minimum ${starved.min}, ` +
      `while sibling "${detail.donor}" rendered ${donor.width} cells, above its maximum ` +
      `${donor.max} (bands ${realized.map((t) => `[${t.min},${t.max}]->${t.width}`).join(" ")}, ` +
      `path: ${detail.containerPath})`

    if (shouldThrow) {
      throw new Error(msg)
    } else {
      log.debug?.("apportion band violation", detail)
      console.warn(msg)
    }
  }

  function walk(node: AgNode): void {
    let group: AgNode[] | null = null
    let realized: RealizedTrack[] | null = null

    for (const child of node.children) {
      const props = child.props as Record<string, unknown> | undefined
      const band = parseTrackBand(props?.[TRACK_BAND_ATTR])
      if (band !== null && child.boxRect !== null) {
        group ??= []
        realized ??= []
        group.push(child)
        realized.push({ min: band.min, max: band.max, width: child.boxRect.width })
      }
      walk(child)
    }

    // A lone track has no sibling to have taken width from.
    if (group !== null && realized !== null && realized.length > 1) report(node, group, realized)
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

  for (const [i, child] of node.children.entries()) {
    if (!child.layoutNode || !child.boxRect) continue

    const childTop = child.boxRect.y - layout.y - border.top - padding.top
    const childBottom = childTop + child.boxRect.height
    const childProps = child.props as BoxProps

    childPositions.push({
      child,
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
      const scrollEdge = targetCompletelyOffscreen ? "scrollTo:recovery" : "scrollTo:newIntent"
      // Always-on violation ring (cheap id; rare path — one record per settle).
      recordPassRing("scrollto-settle", scrollEdge, explicitIdent(node) ?? node.type)
      if (INSTRUMENT) {
        logPass({
          cause: "scrollto-settle",
          edge: scrollEdge,
          nodeId: nodeIdent(node),
          producerPhase: "scroll",
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
  scrollOffset = normalizeScrollOffset(scrollOffset)
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
  const prevHiddenAbove = node.scrollState?.hiddenAbove ?? hiddenAbove
  const prevHiddenBelow = node.scrollState?.hiddenBelow ?? hiddenBelow

  // Mark node dirty if scroll offset or visible range changed (for incremental rendering)
  // Without this, renderPhase would skip the container and children would
  // remain at their old pixel positions in the cloned buffer
  if (
    scrollOffset !== prevOffset ||
    firstVisible !== prevFirstVisible ||
    lastVisible !== prevLastVisible
  ) {
    markDirty(node, SUBTREE_BIT)
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
    prevHiddenAbove,
    prevHiddenBelow,
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
  // Runs at tier 1 (warn) and above; throws at the slug's min-tier (2) and above.
  if (!isStrictEnabled(SCROLL_INVARIANTS_STRICT_SLUG, 1)) return

  const shouldThrow = isStrictEnabled(
    SCROLL_INVARIANTS_STRICT_SLUG,
    SCROLL_INVARIANTS_STRICT_MIN_TIER,
  )
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
        markDirty(node, SUBTREE_BIT)
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

    for (const [i, child] of node.children.entries()) {
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
      markDirty(node, SUBTREE_BIT)
      // Always-on violation ring (cheap id; rare path — one record per resettle).
      recordPassRing("sticky-resettle", "stickyChildren", explicitIdent(node) ?? node.type)
      if (INSTRUMENT) {
        // Sticky child offsets changed since last frame — the parent is now
        // marked dirty and a follow-on layout pass will reflow children.
        logPass({
          cause: "sticky-resettle",
          edge: "stickyChildren",
          nodeId: nodeIdent(node),
          producerPhase: "sticky",
          detail: `${prev?.length ?? 0}→${next?.length ?? 0}`,
        })
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
  for (const [i, ai] of a.entries()) {
    const bi = b[i]
    if (bi === undefined) {
      throw new Error(`Sticky layout comparison is missing entry ${i} in equal-length arrays`)
    }
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
