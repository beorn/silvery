/**
 * Cascade Predicates — Pure boolean logic extracted from renderNodeToBuffer.
 *
 * TEST/STRICT-ONLY ORACLE: In production, the reactive system (alien-signals)
 * drives cascade computation. This module is only used as a verification oracle
 * when SILVERY_REACTIVE_VERIFY=1 or SILVERY_REACTIVE=0 (fallback mode). The
 * bundler tree-shakes it when STRICT is off since all call sites are gated
 * behind `_reactiveVerifyEnabled` or `!_reactiveEnabled`.
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
 * │   Excludes border-only paint changes for BOX nodes. Outlines are NOT       │
 * │   tracked here — they're handled by a separate decoration pass.            │
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

// ============================================================================
// COMPLETE INVALIDATION MODEL
// ============================================================================
//
// This section documents EVERY condition that affects skip/render/clear/buffer
// decisions in the silvery render pipeline. The 14 CascadeInputs below model the
// core boolean algebra, but the real pipeline has additional conditions checked
// inline in render-phase.ts that are not captured in computeCascade(). This
// document is the authoritative inventory.
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ PART 1: ALL INVALIDATION INPUTS                                           │
// │                                                                           │
// │ Input                     │ Owner      │ Set by              │ Cleared by                 │ Lifetime        │ In computeCascade? │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ contentDirtyEpoch         │ reconciler │ commitUpdate,       │ advanceRenderEpoch (O(1))  │ per-render-pass │ YES (contentDirty) │
// │                           │            │ commitTextUpdate,   │ clearNodeDirtyFlags (skip) │                 │                    │
// │                           │            │ appendChild, etc.   │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ stylePropsDirtyEpoch      │ reconciler │ commitUpdate        │ advanceRenderEpoch         │ per-render-pass │ YES (stylePropsDirty)│
// │                           │            │ (always for visual  │ clearNodeDirtyFlags (skip) │                 │                    │
// │                           │            │ changes; survives   │                            │                 │                    │
// │                           │            │ measure phase       │                            │                 │                    │
// │                           │            │ clearing of         │                            │                 │                    │
// │                           │            │ contentDirty)       │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ bgDirtyEpoch              │ reconciler │ commitUpdate (when  │ advanceRenderEpoch         │ per-render-pass │ YES (bgDirty)      │
// │                           │            │ backgroundColor,    │ clearNodeDirtyFlags (skip) │                 │                    │
// │                           │            │ borderStyle removed,│                            │                 │                    │
// │                           │            │ outlineStyle        │                            │                 │                    │
// │                           │            │ removed, or theme   │                            │                 │                    │
// │                           │            │ changed)            │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ subtreeDirtyEpoch         │ reconciler │ markSubtreeDirty    │ advanceRenderEpoch         │ per-render-pass │ YES (subtreeDirty) │
// │                           │ + layout   │ (walks up from any  │ clearNodeDirtyFlags (skip) │                 │                    │
// │                           │            │ dirty descendant);  │                            │                 │                    │
// │                           │            │ propagateLayout     │                            │                 │                    │
// │                           │            │ (when child rect    │                            │                 │                    │
// │                           │            │ changes); scrollPhase│                           │                 │                    │
// │                           │            │ (on offset/range    │                            │                 │                    │
// │                           │            │ change); stickyPhase│                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ childrenDirtyEpoch        │ reconciler │ appendChild,        │ advanceRenderEpoch         │ per-render-pass │ YES (childrenDirty)│
// │                           │            │ removeChild,        │ clearNodeDirtyFlags (skip) │                 │                    │
// │                           │            │ insertBefore,       │                            │                 │                    │
// │                           │            │ clearContainer      │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ layoutChangedThisFrame    │ layout     │ propagateLayout     │ advanceRenderEpoch         │ per-render-pass │ YES (layoutChanged)│
// │                           │            │ (when rect differs  │ clearNodeDirtyFlags (skip) │                 │ via isCurrentEpoch │
// │                           │            │ from prevLayout)    │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ Flexily isDirty           │ reconciler │ commitUpdate (when  │ cleared by Flexily after   │ per-layout-pass │ NO — consumed by   │
// │ (via markDirty())         │            │ layout props change)│ calculateLayout() runs     │                 │ layout phase only  │
// │                           │            │                     │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ childPositionChanged      │ render     │ hasChildPositionChanged│ implicit (per-frame    │ per-render-frame│ YES                │
// │ (computed inline)         │            │ compares child      │ computation, not stored)   │                 │                    │
// │                           │            │ boxRect.x/y vs      │                            │                 │                    │
// │                           │            │ prevLayout.x/y      │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ ancestorLayoutChanged     │ render     │ propagated top-down │ implicit (per-frame        │ per-render-frame│ YES                │
// │ (threaded state)          │            │ via NodeRenderState │ propagation via nodeState)  │                 │                    │
// │                           │            │ = isCurrentEpoch(   │                            │                 │                    │
// │                           │            │ node.layoutChanged  │                            │                 │                    │
// │                           │            │ ThisFrame) ||       │                            │                 │                    │
// │                           │            │ parent's value      │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ ancestorCleared           │ render     │ propagated top-down │ implicit (per-frame        │ per-render-frame│ YES                │
// │ (threaded state)          │            │ = contentRegion-    │ propagation via nodeState)  │                 │                    │
// │                           │            │ Cleared || (parent  │                            │                 │                    │
// │                           │            │ ancestorCleared &&  │                            │                 │                    │
// │                           │            │ !effectiveBg)       │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ hasPrevBuffer             │ render     │ top-level: prevBuf  │ implicit (per-frame        │ per-render-frame│ YES                │
// │ (threaded state)          │            │ && same dimensions; │ propagation via nodeState)  │                 │                    │
// │                           │            │ per-child: false    │                            │                 │                    │
// │                           │            │ when childrenDirty  │                            │                 │                    │
// │                           │            │ || childPosition-   │                            │                 │                    │
// │                           │            │ Changed || children-│                            │                 │                    │
// │                           │            │ NeedFreshRender     │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ isTextNode                │ inherent   │ node.type at        │ never (immutable)          │ node lifetime   │ YES                │
// │                           │            │ creation            │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ hasBgColor                │ render     │ getEffectiveBg(     │ implicit (per-frame        │ per-render-frame│ YES                │
// │ (computed inline)         │            │ props): explicit    │ computation from props)     │                 │                    │
// │                           │            │ backgroundColor or  │                            │                 │                    │
// │                           │            │ theme.bg            │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ absoluteChildMutated      │ render     │ buildCascadeInputs: │ implicit (per-frame        │ per-render-frame│ YES                │
// │ (computed inline)         │            │ any absolute child  │ computation)                │                 │                    │
// │                           │            │ has childrenDirty,  │                            │                 │                    │
// │                           │            │ layoutChanged, or   │                            │                 │                    │
// │                           │            │ childPositionChanged│                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ descendantOverflowChanged │ render     │ buildCascadeInputs  │ implicit (per-frame        │ per-render-frame│ YES                │
// │ (computed inline)         │            │ → hasDescendant-    │ computation)                │                 │                    │
// │                           │            │ OverflowChanged:    │                            │                 │                    │
// │                           │            │ recursive check if  │                            │                 │                    │
// │                           │            │ descendant prev-    │                            │                 │                    │
// │                           │            │ Layout overflows    │                            │                 │                    │
// │                           │            │ this node's rect    │                            │                 │                    │
// │                           │            │ AND layoutChanged-  │                            │                 │                    │
// │                           │            │ ThisFrame is current │                           │                 │                    │
// ├──────────────────────────┼────────────┼─────────────────────┼────────────────────────────┼─────────────────┼────────────────────┤
// │                                                                                                                                │
// │ THE FOLLOWING INPUTS ARE NOT IN computeCascade — CHECKED INLINE IN render-phase.ts                                             │
// │                                                                                                                                │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ scrollOffsetChanged       │ render     │ inline comparison:  │ implicit (per-frame        │ per-render-frame│ NO — checked in    │
// │                           │            │ node.scrollState.   │ computation)                │                 │ canSkipEntireSub-  │
// │                           │            │ offset !== node.    │                            │                 │ tree (prevents skip│
// │                           │            │ scrollState.        │                            │                 │ when scroll offset │
// │                           │            │ prevOffset          │                            │                 │ changed)           │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ node.hidden               │ reconciler │ hideInstance /       │ unhideInstance             │ until unhidden   │ NO — early return  │
// │                           │            │ hideTextInstance     │                            │                 │ before cascade     │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ display="none"            │ reconciler │ commitUpdate (prop)  │ commitUpdate (prop change) │ until prop change│ NO — early return  │
// │                           │            │                     │                            │                 │ before cascade     │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ !node.layoutNode          │ reconciler │ node creation        │ never (immutable)          │ node lifetime   │ NO — early return  │
// │ (virtual text node)       │            │ (virtual text has   │                            │                 │ (rendered by parent │
// │                           │            │ no Yoga layout)     │                            │                 │ collectTextContent) │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ off-screen (viewport      │ render     │ inline: screenY >=  │ implicit (per-frame        │ per-render-frame│ NO — early return  │
// │ clipping)                 │            │ buffer.height ||    │ computation)                │                 │ (dirty flags       │
// │                           │            │ screenY + height    │                            │                 │ preserved for when │
// │                           │            │ <= 0                │                            │                 │ scrolled into view)│
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ prevBuffer dimension      │ render     │ renderPhase entry:  │ implicit (per-frame)       │ per-render-pass │ NO — sets top-level│
// │ mismatch                  │            │ prevBuffer.width    │                            │                 │ hasPrevBuffer=false│
// │                           │            │ !== layout.width    │                            │                 │ (full fresh render)│
// │                           │            │ || height mismatch  │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ bufferIsCloned            │ render     │ set once at render- │ implicit (per-frame)       │ per-render-pass │ NO — guards        │
// │ (threaded state)          │            │ Phase entry from    │                            │                 │ clearExcessArea    │
// │                           │            │ hasPrevBuffer       │                            │                 │ (no stale pixels   │
// │                           │            │                     │                            │                 │ on fresh buffer)   │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ hasDescendantWithBg       │ render     │ inline tree walk    │ implicit (per-frame)       │ per-render-frame│ NO — disables      │
// │ (computed inline)         │            │ when bgOnlyChange   │                            │                 │ bgOnlyChange fast  │
// │                           │            │ is true             │                            │                 │ path               │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ isStyleOnlyDirty          │ reconciler │ trackStyleOnlyDirty │ clearDirtyTracking (post-  │ per-render-pass │ NO — enables text  │
// │ (module set)              │            │ in commitUpdate     │ render)                    │                 │ restyle fast path  │
// │                           │            │ when contentChanged │                            │                 │ (CURRENTLY DISABLED)│
// │                           │            │ ="style" && no      │                            │                 │                    │
// │                           │            │ layout/content/bg   │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ hasChildWithBg            │ render     │ inline tree walk    │ implicit (per-frame)       │ per-render-frame│ NO — disables text │
// │ (computed inline)         │            │ when text style-    │                            │                 │ restyle fast path  │
// │                           │            │ only path active    │                            │                 │ (CURRENTLY DISABLED)│
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ scroll container tier     │ render     │ planScrollRender()  │ implicit (per-frame)       │ per-render-frame│ NO — separate tier │
// │ (shift/clear/subtree)     │            │ pure function from  │                            │                 │ planner with own   │
// │                           │            │ scrollOffsetChanged,│                            │                 │ inputs (see below) │
// │                           │            │ visibleRangeChanged,│                            │                 │                    │
// │                           │            │ hasStickyChildren,  │                            │                 │                    │
// │                           │            │ childrenNeedFresh-  │                            │                 │                    │
// │                           │            │ Render, childrenDirty│                           │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ stickyForceRefresh        │ render     │ scroll: planScroll- │ implicit (per-frame)       │ per-render-frame│ NO — forces all    │
// │                           │            │ Render (Tier 3 +    │                            │                 │ first-pass children│
// │                           │            │ hasStickyChildren); │                            │                 │ to hasPrevBuffer=  │
// │                           │            │ normal: hasPrev &&  │                            │                 │ false              │
// │                           │            │ hasStickyChildren   │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ visibleRangeChanged       │ render     │ inline comparison:  │ implicit (per-frame)       │ per-render-frame│ NO — input to      │
// │ (scroll containers)       │            │ firstVisibleChild   │                            │                 │ planScrollRender   │
// │                           │            │ !== prev or last    │                            │                 │                    │
// │                           │            │ !== prev            │                            │                 │                    │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ nodeTheme (theme prop)    │ reconciler │ commitUpdate (prop) │ per-frame (read from props)│ per-render-frame│ NO — pushContext-  │
// │                           │            │                     │                            │                 │ Theme/popContext-  │
// │                           │            │                     │                            │                 │ Theme during render│
// │                           │            │                     │                            │                 │ (bgDirtyEpoch set  │
// │                           │            │                     │                            │                 │ on theme change)   │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ clipBounds                │ render     │ computeChildClip-   │ implicit (per-frame)       │ per-render-frame│ NO — passed through│
// │ (threaded state)          │            │ Bounds from         │                            │                 │ nodeState; used for│
// │                           │            │ overflow=hidden/    │                            │                 │ clipping fills and │
// │                           │            │ scroll containers   │                            │                 │ text rendering     │
// │──────────────────────────│────────────│─────────────────────│────────────────────────────│─────────────────│────────────────────│
// │ inheritedBg / inheritedFg │ render     │ threaded top-down:  │ implicit (per-frame)       │ per-render-frame│ NO — used for text │
// │ (threaded state)          │            │ computed from       │                            │                 │ bg inheritance and │
// │                           │            │ effectiveBg/color/  │                            │                 │ region clearing    │
// │                           │            │ theme at each node  │                            │                 │                    │
// └──────────────────────────┴────────────┴─────────────────────┴────────────────────────────┴─────────────────┴────────────────────┘
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ PART 2: NON-LOCAL DEPENDENCIES THAT CAN FORCE REPAINT                     │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// 1. ANCESTOR BACKGROUND CHANGE
//    When an ancestor's backgroundColor changes, the ancestor's bgDirty triggers
//    contentAreaAffected, which cascades childrenNeedFreshRender=true to all
//    descendants. Descendants get hasPrevBuffer=false, forcing full re-render.
//    If bgOnlyChange were enabled (currently disabled), the fillBg() path would
//    update bg in-place, but only when no descendant has its own bg
//    (hasDescendantWithBg check).
//
// 2. ANCESTOR LAYOUT CHANGE
//    When an ancestor moves or resizes, ancestorLayoutChanged propagates down
//    through the entire subtree. Even if a descendant has no dirty flags, its
//    pixels in the cloned buffer are at wrong absolute coordinates. The skip
//    condition checks !ancestorLayoutChanged. Additionally, the parent's
//    childrenNeedFreshRender cascade sets childHasPrev=false.
//    Key: ancestorLayoutChanged does NOT break at backgroundColor boundaries
//    (unlike ancestorCleared), because bg fill doesn't fix wrong coordinates.
//
// 3. SIBLING POSITION SHIFT
//    When a sibling resizes, other siblings shift positions (flexbox reflow).
//    hasChildPositionChanged detects this at the parent level by comparing each
//    child's boxRect.x/y to prevLayout.x/y. Triggers childrenNeedRepaint=true,
//    setting childHasPrev=false for all children.
//
// 4. ANCESTOR CLEAR CASCADE
//    When an ancestor without backgroundColor clears its region (contentRegion-
//    Cleared=true), ancestorCleared propagates down. This cascade BREAKS at
//    nodes with backgroundColor — their bg fill covers the stale pixels, so
//    their children don't see stale buffer content.
//
// 5. ABSOLUTE CHILD MUTATION → PARENT CLEAR
//    When an absolute-positioned child changes structure (children mount/unmount,
//    layout shift), absoluteChildMutated forces the PARENT's contentAreaAffected
//    =true. This clears the parent's entire region and re-renders all normal-flow
//    children, removing stale overlay pixels from gap areas.
//
// 6. DESCENDANT OVERFLOW → ANCESTOR CLEAR
//    When a descendant overflows beyond an ancestor's rect and then shrinks,
//    the stale overflow pixels are OUTSIDE the descendant's parent's content
//    area. hasDescendantOverflowChanged recursively detects this at the ancestor
//    level and triggers contentAreaAffected + clearDescendantOverflowRegions.
//
// 7. SCROLL OFFSET CHANGE → SUBTREE RE-RENDER
//    The scroll phase sets subtreeDirty on the scroll container when offset or
//    visible range changes. The render phase then plans a scroll tier:
//    - Tier 1 (shift): buffer.scrollRegion shifts pixels; only edges re-render
//    - Tier 2 (clear): full viewport clear; all children get hasPrevBuffer=false
//    - Tier 3 (subtree): only dirty descendants re-render
//    Tier 1 is UNSAFE with sticky children (sticky overwrite + shift = corruption).
//
// 8. STICKY CHILDREN → stickyForceRefresh
//    When sticky children exist in Tier 3 (or in normal containers), all
//    first-pass children are forced to re-render (hasPrevBuffer=false). The
//    cloned buffer has stale content from previous frames' sticky positions.
//    A pre-clear to null bg ensures fresh render baseline.
//
// 9. THEME CHANGE CASCADE
//    When a node's `theme` prop changes, bgDirtyEpoch is set (because theme
//    contains bg). pushContextTheme/popContextTheme during rendering ensures
//    all $token-based colors resolve to new values. Children re-render because
//    bgDirty → contentAreaAffected → childrenNeedFreshRender.
//
// 10. VISIBLE RANGE CHANGE (scroll containers)
//     When firstVisibleChild/lastVisibleChild changes (scroll phase detects
//     this), the scroll container's subtreeDirtyEpoch is set and
//     visibleRangeChanged feeds into planScrollRender to select the tier.
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ PART 3: BUFFER VALIDITY STATES AND TRANSITIONS                            │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// A node's cached buffer (pixels in the cloned TerminalBuffer) can be in one of
// these validity states:
//
// VALID (canSkipEntireSubtree = true)
//   All of: hasPrevBuffer=true, no dirty flags, no ancestorLayoutChanged,
//   no scrollOffsetChanged. The cloned buffer has correct pixels at correct
//   positions. Node is skipped entirely.
//
// STALE_CONTENT (hasPrevBuffer=true, some dirty flag set)
//   The buffer has pixels from the previous frame but they're wrong:
//   - contentDirty: text content or content-affecting props changed
//   - stylePropsDirty: visual style changed (color, border, etc.)
//   - bgDirty: background color changed
//   - childrenDirty: children added/removed/reordered
//   - layoutChanged: node moved or resized
//   - subtreeDirty: some descendant changed (node itself may be skippable)
//   - childPositionChanged: siblings shifted positions
//   - absoluteChildMutated: overlay child changed
//   - descendantOverflowChanged: overflow descendant changed
//   Action: re-render with clearing as appropriate.
//
// STALE_POSITION (hasPrevBuffer=true, ancestorLayoutChanged=true)
//   The buffer has correct content but at WRONG coordinates because an
//   ancestor moved/resized. The node itself has no dirty flags.
//   Action: must re-render at new position; can't skip.
//
// STALE_SCROLL (hasPrevBuffer=true, scrollOffsetChanged=true)
//   The buffer has correct content but scroll offset changed, so visible
//   children may have shifted. Defensive check in canSkipEntireSubtree.
//   Action: apply scroll tier strategy (shift/clear/subtree).
//
// CLEARED (hasPrevBuffer=false or true, ancestorCleared=true)
//   An ancestor erased this node's buffer region. The buffer at this
//   position contains inherited bg (spaces), not previous content.
//   - If hasPrevBuffer=false: fresh render, no clearing needed.
//   - If ancestorCleared=true: parent cleared, descendants may still need
//     their own clearing for sub-regions.
//   Breaks at backgroundColor boundaries (bg fill covers cleared area).
//
// FRESH (hasPrevBuffer=false, ancestorCleared=false)
//   First render or dimension change. Buffer is a blank TerminalBuffer
//   (all cells empty). No clearing needed, no skipping possible.
//   contentRegionCleared=false and childrenNeedFreshRender=false because
//   both are gated on (hasPrevBuffer || ancestorCleared).
//
// FRESH_OVERLAY (hasPrevBuffer=false, ancestorCleared=false, absolute/sticky)
//   Buffer at this position contains first-pass content from normal-flow
//   siblings (not "previous frame" content). Used for absolute and sticky
//   children in the second/third rendering pass.
//   - ancestorCleared=false prevents transparent overlays from clearing
//     the normal-flow content underneath.
//
// State transitions per frame:
//   VALID --[dirty flag set]--> STALE_*
//   VALID --[ancestor layout]--> STALE_POSITION
//   VALID --[scroll change]---> STALE_SCROLL
//   STALE_* --[re-render]-----> VALID (dirty flags cleared)
//   FRESH --[first render]----> VALID (buffer populated)
//   any --[dimension change]--> FRESH (new buffer allocated)
//   any --[parent cascade]----> CLEARED (parent cleared region)
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ PART 4: REASONS A CACHED BUFFER CAN BE INVALID                            │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// The cloned buffer can have stale pixels for these reasons:
//
//  1. Text content changed (contentDirtyEpoch) — old chars in buffer
//  2. Style props changed (stylePropsDirtyEpoch) — old colors/attrs in buffer
//  3. Background changed (bgDirtyEpoch) — old bg color, or removed bg leaving
//     stale colored pixels that need clearing
//  4. Children restructured (childrenDirtyEpoch) — old children's pixels remain;
//     gap areas may have orphaned content
//  5. Layout changed (layoutChangedThisFrame) — pixels at wrong position;
//     node may have grown (new area uninitialized) or shrunk (excess area stale)
//  6. Child position shifted (childPositionChanged) — siblings moved, gap areas
//     between children have stale pixels from old positions
//  7. Absolute child mutated (absoluteChildMutated) — overlay pixels in gap areas
//     between current children are stale from old overlay positions
//  8. Descendant overflow changed (descendantOverflowChanged) — pixels beyond this
//     node's rect are stale from previous overflow that no longer extends there
//  9. Scroll offset changed (scrollOffsetChanged) — children's visual positions
//     shifted; buffer has content at old scroll positions
// 10. Ancestor layout changed (ancestorLayoutChanged) — this node's absolute
//     position in the buffer is wrong even though its own layout didn't change
// 11. Ancestor cleared (ancestorCleared) — an ancestor erased this area; buffer
//     has inherited bg, not this node's content
// 12. Sticky children stale positioning — cloned buffer has pixels from previous
//     frames' sticky render positions; stickyForceRefresh pre-clears and forces
//     all first-pass children to re-render
// 13. Node shrunk (clearExcessArea) — old bounds were larger; excess pixels remain
//     in the right/bottom margin of the old rect
// 14. Node hidden/unhidden — Suspense boundary toggled visibility
// 15. display="none" toggled — node occupies 0x0 space but old pixels may remain
// 16. Border/outline removed (bgDirtyEpoch) — stale border/outline characters
//     persist in the clone; bgDirty ensures contentAreaAffected triggers clearing
// 17. Theme changed (bgDirtyEpoch) — all $token colors resolve differently;
//     the entire subtree's colors are stale
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ PART 5: PIPELINE PHASE OWNERSHIP SUMMARY                                  │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// RECONCILER (host-config.ts):
//   Sets: contentDirtyEpoch, stylePropsDirtyEpoch, bgDirtyEpoch,
//         childrenDirtyEpoch, hidden
//   Calls: layoutNode.markDirty() (Flexily's isDirty propagates to root)
//   Propagates: subtreeDirtyEpoch (upward via markSubtreeDirty)
//   Tracks: contentDirtyNodes, styleOnlyDirtyNodes,
//           scrollDirtyNodes (in dirty-tracking.ts)
//
// LAYOUT PHASE (layout-phase.ts):
//   Sets: layoutChangedThisFrame (via propagateLayout)
//   Propagates: subtreeDirtyEpoch (upward when layout changes)
//   Checks: root.layoutNode.isDirty() — sole gate for running layout
//   Computes: boxRect, prevLayout, scrollState (scroll phase),
//             stickyChildren (sticky phase), scrollRect/screenRect
//
// RENDER PHASE (render-phase.ts):
//   Reads: ALL epoch flags, layoutChangedThisFrame, scrollState, stickyChildren
//   Computes: childPositionChanged, absoluteChildMutated, descendantOverflow-
//             Changed, scrollOffsetChanged, clipBounds, inheritedBg/Fg
//   Threads: hasPrevBuffer, ancestorCleared, ancestorLayoutChanged,
//            bufferIsCloned, scrollOffset, clipBounds, inheritedBg, inheritedFg
//   Calls: computeCascade() for core boolean algebra
//   Clears: all dirty epoch flags via advanceRenderEpoch() (O(1))
//   Syncs: prevLayout = boxRect via syncPrevLayout() (post-render)
//
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ PART 6: DISABLED FAST PATHS (currently hardcoded false)                    │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// bgOnlyChange (line 180 in this file):
//   DISABLED — hardcoded `const bgOnlyChange = false`.
//   When only backgroundColor changed on a Box with bg, fillBg() would preserve
//   child chars. Disabled because it causes incremental rendering mismatches
//   (fg colors lost on child nodes). Additional safety conditions exist even
//   in the enabled path:
//   - hasDescendantWithBg: descendant bg would be overwritten by fillBg
//   - !ancestorLayoutChanged: children positions may have shifted
//   - !ancestorCleared: parent cleared stale pixels, children must re-render
//
// useTextStyleFastPath (render-phase.ts):
//   DISABLED — hardcoded `const useTextStyleFastPath = false`.
//   When only visual style props changed on a Text node (isStyleOnlyDirty),
//   buffer.restyleRegion() would update fg/bg/attrs in-place without re-
//   collecting text. Disabled because it causes incremental rendering mismatches
//   (fg colors lost). Additional safety conditions:
//   - !contentDirty, !childrenDirty, !bgDirty
//   - !ancestorCleared, !ancestorLayoutChanged
//   - !hasChildWithBg (nested children with own bg)
//   - hasPrevBuffer=true
//
// ============================================================================

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
