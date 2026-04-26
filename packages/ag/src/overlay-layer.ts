/**
 * OverlayLayer — per-frame snapshot of every overlay output the renderer
 * paints this frame. Phase 4c of `km-silvery.view-as-layout-output`
 * (overlay-anchor v1).
 *
 * Today's render pipeline reads three signals independently:
 *   - `findActiveCursorRect(root)` for caret
 *   - `findActiveFocusedNodeId(root)` for focus
 *   - `findActiveSelectionFragments(root)` for selection bg
 *
 * Phase 4c adds two more:
 *   - `findActiveDecorationRects(root)` for popover / tooltip / highlight
 *   - anchor map (every `anchorRef` registered this frame, by id)
 *
 * The frame artifact bundles all five into a single immutable snapshot. Paint
 * order is fixed (no z-index): caret > focus > selection > decorations >
 * anchors. The anchor map is debug-only — the renderer paints decorations
 * (which already carry resolved rects from `placeFloating`), not the anchor
 * map directly.
 *
 * **Cross-check invariant**: `OverlayLayer.{caret, focus, selection}` MUST
 * equal `findActive*` reads on the same frame. The cross-check property test
 * (`tests/features/overlay-layer.test.tsx`) randomizes tree fixtures and
 * asserts the equality holds. If it ever drifts, the property test catches
 * it before the next pipeline release ships.
 *
 * Today's pipeline keeps reading the per-feature signals directly. The
 * OverlayLayer is offered as a peer artifact — Cycle 2 (per the design doc)
 * migrates the scheduler / selection-renderer / focus-renderer to read
 * `OverlayLayer.{caret, focus, selection}` instead of N independent walks.
 * The substrate is in place; the migration is a non-breaking follow-up.
 */

import type { AgNode, Rect } from "./types"
import {
  findActiveCursorRect,
  findActiveDecorationRects,
  findActiveFocusedNodeId,
  findActiveSelectionFragments,
  computeAnchorRect,
  type CursorRect,
  type DecorationRect,
} from "./layout-signals"

/**
 * Immutable per-frame snapshot of every overlay output. Built post-layout by
 * `collectOverlayLayer(root)`.
 *
 * Fields:
 *   - `caret`: result of `findActiveCursorRect(root)` — the caret to paint
 *     this frame (or null when no caret is declared / clipped / hidden).
 *   - `focus`: focused-node id from `findActiveFocusedNodeId(root)`. The
 *     OverlayLayer doesn't expose the focus rect — focused-node painting is
 *     a per-renderer concern (the renderer reads the node's `boxRect` via
 *     the id). v1 keeps the field shape lightweight: just the id.
 *   - `selection`: rects from `findActiveSelectionFragments(root)`.
 *   - `decorations`: rects from `findActiveDecorationRects(root)`. List
 *     order is paint order (later entries paint on top of earlier ones).
 *   - `anchors`: map of `anchorRef` id → contentRect, populated by walking
 *     every node with an `anchorRef` BoxProp. Debug-only — the renderer
 *     paints decorations (which already carry resolved rects), not anchors.
 *
 * Built fresh every frame (no incremental delta). The cost is one tree walk
 * per `findActive*` call (4 walks total) — consumers that previously walked
 * independently can collapse onto this artifact.
 */
export interface OverlayLayer {
  readonly caret: CursorRect | null
  readonly focus: { readonly id: string } | null
  readonly selection: { readonly rects: readonly Rect[] }
  readonly decorations: readonly DecorationRect[]
  readonly anchors: ReadonlyMap<string, Rect>
}

/**
 * Build the per-frame `OverlayLayer` snapshot from a layout tree. Call AFTER
 * the layout phase has populated rect signals (i.e., after
 * `notifyLayoutSubscribers(root)` returns).
 *
 * Five independent walks:
 *   1. cursor — `findActiveCursorRect`
 *   2. focus — `findActiveFocusedNodeId`
 *   3. selection — `findActiveSelectionFragments`
 *   4. decorations — `findActiveDecorationRects`
 *   5. anchors — local walk that collects every `anchorRef` → contentRect
 *
 * Cycle 2 of the design (post-impl-v1) collapses these onto a single
 * post-order walk. v1 favors simplicity + zero risk of behavioral drift —
 * five walks of a single tree are cheap relative to the render phase.
 */
export function collectOverlayLayer(root: AgNode): OverlayLayer {
  const caret = findActiveCursorRect(root)
  const focusId = findActiveFocusedNodeId(root)
  const focus = focusId !== null ? { id: focusId } : null
  const selectionFragments = findActiveSelectionFragments(root)
  const decorations = findActiveDecorationRects(root)

  // Anchor map — walk the tree and gather every `anchorRef` → contentRect.
  // Same shape as `findAnchor` but collects all ids in one pass. We resolve
  // the rect via `computeAnchorRect` (rather than reading the signal map)
  // so the function works even on trees that haven't allocated signals.
  const anchors = new Map<string, Rect>()
  function walkAnchors(node: AgNode): void {
    const props = node.props as { anchorRef?: string | { id: string } } | undefined
    const ref = props?.anchorRef
    if (ref) {
      const id = typeof ref === "string" ? ref : ref.id
      if (typeof id === "string" && id.length > 0) {
        const rect = computeAnchorRect(node)
        if (rect) {
          // Last-write-wins (deepest in post-order) — matches findAnchor's
          // duplicate-id resolution.
          anchors.set(id, rect)
        }
      }
    }
    for (const child of node.children) {
      walkAnchors(child)
    }
  }
  walkAnchors(root)

  return {
    caret,
    focus,
    selection: { rects: selectionFragments },
    decorations,
    anchors,
  }
}
