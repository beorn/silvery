/**
 * AutoFit — intrinsic-measurement lane primitive.
 *
 * Renders `children` once at unconstrained width to measure their intrinsic
 * `max-content` width, then snaps to the smallest lane in `lanes` that
 * fits. Children are then visually rendered with `maxWidth` set to the
 * chosen lane.
 *
 * The 80% case is consuming-app sugar (e.g. silvercode's `Content.Body
 * width="auto"`); reach for `<AutoFit>` directly when you need lane
 * semantics outside that surface or with a custom lane set.
 *
 * ```tsx
 * <AutoFit lanes={[40, 88, 120]}>
 *   {expensiveMarkdownTree}
 * </AutoFit>
 * ```
 *
 * ## Invariants
 *
 * Codified from the lessons in
 * `@km/silvery/auto-fit-intrinsic-measurement-primitive` (R1-R9):
 *
 * - **R1 / R5 — shape stable.** The visible subtree's React shape is
 *   identical across the `intrinsic = unknown → measured` transition. Lane
 *   choice is communicated via the outer Box's `maxWidth` prop, NOT by
 *   conditionally rendering a different tree. Container resizes don't
 *   structurally remount the visible tree.
 * - **R2 — `maxWidth`, not `width`.** The chosen lane is a ceiling; flexily
 *   owns the final resolved width. AutoFit never sets authoritative pixel
 *   widths on the visible Box.
 * - **R3 — monotonic against intrinsic, not constrained.** Lane choice is
 *   driven only by the phantom's intrinsic measurement. Re-rendering the
 *   visible Box at the chosen lane never feeds back into the lane decision.
 * - **R4 — stable identities.** Cached intrinsic width / chosen lane are
 *   memoized; re-renders with unchanged inputs don't churn child contexts.
 * - **R6 — bootstrap-largest.** Until intrinsic is known, the visible tree
 *   renders at `lanes[lanes.length - 1]` (largest). Picking the smallest
 *   first risks horizontal overflow that R3 then forbids re-correcting.
 * - **R7 — per-instance content.** Lane is decided from the actual rendered
 *   content's intrinsic width, not from the component type.
 * - **R8 — phantom render is memoized on children identity.** Large
 *   subtrees aren't re-measured on every parent re-render.
 * - **R9 — sibling independence.** Each `<AutoFit>` instance owns its own
 *   intrinsic state; one instance changing lanes does not cause sibling
 *   `<AutoFit>` instances to re-measure or remount.
 *
 * ## Two-tree model
 *
 * The component renders two subtrees under one outer Box:
 *
 * 1. A **phantom** Box, `position="absolute"` and parked off-screen with
 *    `width="fit-content"`. Yoga sizes it to its children's max-content
 *    width; a child component reads that via `useBoxRect()` and reports
 *    it back via a stable callback. Off-screen render is skipped by the
 *    paint pipeline (see `render-phase.ts` viewport clip), so the phantom
 *    never lights pixels.
 * 2. A **visible** Box, `maxWidth={chosenLane}`, holding the same children.
 *    Shape-stable across measurement transitions.
 *
 * Children render twice (once per subtree). For AutoFit's primary use case
 * (markdown / code blocks / tables — content that's stateless or whose
 * state is owned by the parent) this is invisible. Stateful children that
 * cannot tolerate two mounts should not be wrapped in `<AutoFit>` directly.
 *
 * Source: bead `@km/silvery/auto-fit-intrinsic-measurement-primitive`.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { Box } from "./Box"
import { useBoxRect } from "../hooks/useLayout"

/**
 * Internal context — true inside the visible subtree, false (default)
 * inside the phantom-measure subtree. Test probes use this to
 * distinguish which mount fired (children render twice — once per
 * subtree). Not exported on the public API surface; consumed only by
 * `useAutoFitVisible()` below.
 */
const AutoFitVisibleContext = createContext<boolean>(false)

/**
 * Internal hook: returns `true` when called from inside the visible
 * subtree of an enclosing `<AutoFit>`. Returns `false` when called from
 * outside any `<AutoFit>` OR from inside the phantom-measure subtree.
 *
 * Provided for tests and downstream silvery primitives that need to
 * gate side effects to one subtree (e.g., focus registration that
 * shouldn't fire twice).
 */
export function useAutoFitVisible(): boolean {
  return useContext(AutoFitVisibleContext)
}

// ============================================================================
// Props
// ============================================================================

export interface AutoFitProps {
  /** Subtree to lane-snap. */
  children: React.ReactNode
  /**
   * Available lane widths in cells, ordered smallest → largest. The
   * smallest lane whose width is ≥ the children's intrinsic width is
   * chosen. If no lane fits, the largest lane is used. Must contain at
   * least one entry.
   */
  lanes: number[]
  /**
   * How the visible (lane-snapped) Box aligns within its parent's
   * cross-axis slack. Defaults to `"start"` (flush left), preserving
   * historical behavior. Use `"center"` to center the chosen lane within
   * a wider parent (matches `Content.Layout align="center"`); `"stretch"`
   * disables the lane ceiling visually by stretching to parent width.
   *
   * Applied to the visible Box's `alignSelf` only — the AutoFit root keeps
   * `width="100%"` (R2: lane is a ceiling, not authoritative). Without
   * this prop, a centered parent cannot center an AutoFit child because
   * `width="100%"` claims the full row.
   */
  align?: "start" | "center" | "stretch"
}

// ============================================================================
// Lane decision
// ============================================================================

/**
 * Pick the smallest lane that fits `intrinsic`. When `intrinsic` is null
 * (no measurement yet — first frame), returns the largest lane (R6 —
 * bootstrap-largest avoids horizontal overflow that R3 would forbid
 * correcting).
 *
 * Pure function of inputs. The lane decision feeds only on intrinsic
 * width, never on the constrained render width of the visible tree (R3 —
 * monotonic against intrinsic).
 */
function pickLane(lanes: readonly number[], intrinsic: number | null): number {
  // Caller guarantees lanes.length > 0 (validated at component entry).
  const last = lanes[lanes.length - 1] as number
  if (intrinsic === null) return last
  for (const lane of lanes) {
    if (lane >= intrinsic) return lane
  }
  return last
}

// ============================================================================
// Phantom subtree — measures intrinsic width off-screen
// ============================================================================

/**
 * Reads the enclosing Box's inner width via `useBoxRect()` and reports it
 * to the parent through a stable callback. The enclosing Box (the phantom)
 * sets `width="fit-content"` so flexily reports the children's max-content
 * width.
 *
 * The callback ref is invoked from a layout effect rather than during
 * render to avoid setState-during-render warnings. Identity changes only
 * when the reported width changes.
 */
function PhantomReader({
  onMeasure,
}: {
  onMeasure: (width: number) => void
}): React.ReactElement | null {
  const rect = useBoxRect()
  const lastReported = useRef<number | null>(null)

  // Use a layout effect so the parent's setState lands before paint and
  // the visible subtree picks the right lane on the next commit.
  React.useLayoutEffect(() => {
    if (rect.width <= 0) return
    if (lastReported.current === rect.width) return
    lastReported.current = rect.width
    onMeasure(rect.width)
  }, [rect.width, onMeasure])

  return null
}

// ============================================================================
// AutoFit
// ============================================================================

/**
 * Lane-snap layout primitive. See file header for invariants and design.
 */
export function AutoFit({ children, lanes, align = "start" }: AutoFitProps): React.ReactElement {
  if (lanes.length === 0) {
    throw new Error("AutoFit: `lanes` must contain at least one width")
  }

  const [intrinsic, setIntrinsic] = useState<number | null>(null)

  // R3 — chosen lane derives ONLY from intrinsic + lane set. Never reads
  // the visible Box's constrained rect. Memoized so identity is stable for
  // unchanged inputs (R4).
  const chosenLane = useMemo(() => pickLane(lanes, intrinsic), [lanes, intrinsic])

  // Stable callback identity — PhantomReader's effect dep on `onMeasure`
  // would otherwise re-fire every parent render.
  const onMeasure = useCallback((width: number) => {
    setIntrinsic((prev) => (prev === width ? prev : width))
  }, [])

  // R8 — phantom subtree memoized on children identity. Large subtrees
  // (long stdout, big tables) are not re-rendered on every parent
  // re-render; they only re-render when `children` actually change.
  const phantom = useMemo(
    () => (
      <Box position="absolute" top={-99999} left={-99999} width="fit-content">
        <PhantomReader onMeasure={onMeasure} />
        {children}
      </Box>
    ),
    [children, onMeasure],
  )

  // R1 / R5 — visible tree shape is stable across measurement transitions.
  // The only thing that changes between bootstrap-largest (R6) and the
  // settled lane is the `maxWidth` prop on this outer Box.
  //
  // R2 — `maxWidth` is the authoritative lane ceiling. `width="100%"`
  // claims the parent's available width up to that ceiling, so the
  // visible Box's resolved width is `min(parentWidth, chosenLane)`. This
  // gives lane-wide visual consistency across instances with different
  // content widths (lanes line up across a transcript) without making
  // AutoFit set authoritative pixel widths — flexily still owns the
  // resolved width via the min(width%, maxWidth, parent slack) cascade.
  // align — how the visible Box positions itself within the parent's
  // cross-axis slack. `width="100%"` on the visible Box claims the row,
  // so without alignSelf an enclosing flex centerline cannot reach the
  // lane-snapped child. Centered Content.Layout passes `align="center"`
  // so width="auto" code blocks (and other auto-snapped surfaces) line
  // up under the same centerline as the static prose/wide/full lanes.
  const visibleAlignSelf =
    align === "center" ? "center" : align === "stretch" ? "stretch" : "flex-start"

  return (
    <Box flexDirection="column" width="100%" minWidth={0}>
      {phantom}
      <Box width="100%" maxWidth={chosenLane} minWidth={0} alignSelf={visibleAlignSelf}>
        <AutoFitVisibleContext.Provider value={true}>{children}</AutoFitVisibleContext.Provider>
      </Box>
    </Box>
  )
}
