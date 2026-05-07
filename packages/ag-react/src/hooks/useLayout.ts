/**
 * Layout Hooks — three coordinate systems for positioning in silvery.
 *
 * Every silvery node has three rects that differ only by how scroll and
 * sticky offsets are applied. Pick the one that matches your use case:
 *
 * - `useBoxRect()`    — layout position (border-box sized, minus padding/border).
 *                       Use for responsive sizing inside a component. Matches
 *                       CSS `clientWidth`/`clientHeight` for the content area.
 * - `useScrollRect()` — scroll-adjusted position, **pre** sticky clamping.
 *                       Use when you need the "natural" position of a node
 *                       in scrolled coordinates (can go off-screen).
 * - `useScreenRect()` — actual paint position on the terminal screen.
 *                       Use for hit testing, cursor positioning, and
 *                       cross-component visual navigation. The CSS
 *                       `getBoundingClientRect()` analogue.
 *
 * ## Deferred semantics (the only contract)
 *
 * Each hook returns the rect as of the **most recent committed layout** —
 * the value as of the last event-batch commit boundary. Within a single
 * batch, the returned value is invariant across every convergence pass;
 * React renders see one value per batch. After the batch's commit boundary
 * fires, the next batch sees the new value.
 *
 * This is the structural fix for the "render reads useBoxRect AND writes
 * a layout-affecting prop based on it" feedback loop. Under the in-flight
 * model that preceded this hook (pre 2026-05-06), the read returned the
 * latest measurement during the same batch, which could differ between
 * the first and second convergence passes — causing the write to flip
 * between branches and the loop to ping-pong until `MAX_CONVERGENCE_PASSES`
 * capped it. Under deferred semantics the read is invariant for the
 * batch, so the loop completes in one pass.
 *
 * **One-frame-late by design.** A component that mounts shows the
 * empty-rect fallback (`{ x: 0, y: 0, width: 0, height: 0 }`) on its
 * first render and the real rect on the next commit boundary. Layout
 * effects that run on the second render see the real rect and can write
 * positioned terminal escapes (Image, decorations) into the next
 * paintFrame.
 *
 * Components that need same-frame measurements must read `node.boxRect`
 * etc. directly via `useAgNode()` and gate on `useLayoutEffect` —
 * recommended only for leaf primitives in the silvery framework itself.
 *
 * For breakpoint logic, prefer `useResponsiveValue()` or
 * `useResponsiveBoxProps()` — bucketing into stable zones gives more
 * predictable behavior than branching on raw widths.
 *
 * See bead `@km/silvery/use-deferred-box-rect-and-post-commit-observers`.
 */

import { useContext, useLayoutEffect, useReducer, useRef } from "react"
import { effect } from "@silvery/signals"
import { NodeContext } from "../context"
import { type AgNode, type BoxProps, type Rect, rectEqual } from "@silvery/ag/types"
import { getLayoutSignals } from "@silvery/ag/layout-signals"

export type { Rect }

const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 }

/**
 * Get the inner content dimensions of a node (border-box minus padding and border).
 * This is the space available for the node's children.
 *
 * `boxRect` is passed in explicitly so the helper derives the inner rect
 * from the committed signal value rather than re-reading `node.boxRect`
 * (which holds the in-flight value mid-batch).
 */
function deriveInnerRect(node: AgNode, boxRect: Rect | null | undefined): Rect | null {
  if (!boxRect) return null

  const props = node.props as BoxProps
  if (!props || node.type === "silvery-text") return boxRect

  // Compute padding
  const pTop = props.paddingTop ?? props.paddingY ?? props.padding ?? 0
  const pBottom = props.paddingBottom ?? props.paddingY ?? props.padding ?? 0
  const pLeft = props.paddingLeft ?? props.paddingX ?? props.padding ?? 0
  const pRight = props.paddingRight ?? props.paddingX ?? props.padding ?? 0

  // Compute border (1px per side if borderStyle is set)
  let bTop = 0
  let bBottom = 0
  let bLeft = 0
  let bRight = 0
  if (props.borderStyle) {
    bTop = props.borderTop !== false ? 1 : 0
    bBottom = props.borderBottom !== false ? 1 : 0
    bLeft = props.borderLeft !== false ? 1 : 0
    bRight = props.borderRight !== false ? 1 : 0
  }

  return {
    x: boxRect.x + pLeft + bLeft,
    y: boxRect.y + pTop + bTop,
    width: Math.max(0, boxRect.width - pLeft - pRight - bLeft - bRight),
    height: Math.max(0, boxRect.height - pTop - pBottom - bTop - bBottom),
  }
}

/** Selector that picks which committed rect signal to subscribe to. */
type CommittedRectSignalKey = "boxRectCommitted" | "scrollRectCommitted" | "screenRectCommitted"

/**
 * Reactive rect hook (deferred): subscribes to a committed rect signal and
 * re-renders when the value advances at a commit boundary. Returns the
 * rect derived from the committed value via `getCommittedRect`.
 *
 * Within a single event batch the committed signal does not change — every
 * convergence pass sees the same value, so a render that reads useBoxRect
 * and writes a layout-affecting prop converges in one pass. After the
 * batch's commit boundary (handled by the runtime via
 * `commitLayoutSnapshot`), the next batch's first render sees the new
 * value.
 */
function useReactiveRect(
  getCommittedRect: (committed: Rect | null, node: AgNode) => Rect | null | undefined,
  committedSignalKey: CommittedRectSignalKey,
): Rect {
  const node = useContext(NodeContext)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const prevRef = useRef<Rect | null>(null)

  useLayoutEffect(() => {
    if (!node) return

    const signals = getLayoutSignals(node)
    const rectSignal = signals[committedSignalKey]

    // effect() subscribes to the COMMITTED signal — re-runs when the signal
    // value changes. The committed signal advances only at event-batch
    // commit boundaries (see `commitLayoutSnapshot`), so this fires at most
    // once per batch — never mid-batch — making it impossible to form a
    // feedback edge with a render that branches on the read value.
    const dispose = effect(() => {
      const committed = rectSignal()
      const next = getCommittedRect(committed, node) ?? null
      if (!rectEqual(prevRef.current, next)) {
        prevRef.current = next
        forceUpdate()
      }
    })

    return dispose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node])

  if (!node) return EMPTY_RECT
  // Synchronous read (called during render): use the committed signal's
  // current value, NOT `node.boxRect` etc. The in-flight rect on the node
  // may have been updated by an earlier convergence pass within this batch
  // — reading it would re-introduce the feedback edge this hook exists to
  // eliminate. The committed signal is invariant for the batch.
  const signals = getLayoutSignals(node)
  const committed = signals[committedSignalKey]()
  return getCommittedRect(committed, node) ?? EMPTY_RECT
}

// ============================================================================
// boxRect — layout position (border-box minus padding/border)
// ============================================================================

/**
 * Returns the inner content dimensions for the current component's nearest
 * Box, as of the most recent committed layout. Width and height reflect
 * the space available for children (border-box minus padding and border),
 * like CSS `clientWidth`/`clientHeight`.
 *
 * ```tsx
 * function Header() {
 *   const { width } = useBoxRect()
 *   return <Text>{'='.repeat(Math.max(0, width))}</Text>
 * }
 * ```
 *
 * On first render returns `{ x: 0, y: 0, width: 0, height: 0 }`. After the
 * first commit boundary, automatically re-renders with the measured
 * dimensions.
 *
 * Deferred semantics — see this file's docstring for the contract and the
 * one-frame-late behavior.
 */
export function useBoxRect(): Rect {
  return useReactiveRect((committed, node) => deriveInnerRect(node, committed), "boxRectCommitted")
}

// ============================================================================
// scrollRect — scroll-adjusted position (pre-sticky clamping)
// ============================================================================

/**
 * Returns the scroll-adjusted position for the current component, as of
 * the most recent committed layout.
 *
 * This is the node's position in scroll coordinates, *before* sticky
 * clamping. For non-sticky nodes it equals `useScreenRect()`. For sticky
 * nodes, the scrollRect reflects where the node would be without sticky
 * adjustment — so it can go off-screen (negative y, etc.) when scrolled
 * past.
 *
 * ```tsx
 * function Card({ id }) {
 *   const { y } = useScrollRect()
 *   return <Box>Scroll y: {y}</Box>
 * }
 * ```
 *
 * Deferred semantics — see this file's docstring.
 */
export function useScrollRect(): Rect {
  return useReactiveRect((committed) => committed, "scrollRectCommitted")
}

// ============================================================================
// screenRect — actual paint position on the terminal screen
// ============================================================================

/**
 * Returns the actual paint position on the terminal screen as of the most
 * recent committed layout — the silvery analogue of
 * `getBoundingClientRect()`.
 *
 * For non-sticky nodes this equals `useScrollRect()`. For sticky nodes
 * (`position="sticky"`), it reflects the clamped position where pixels
 * actually land on screen.
 *
 * ```tsx
 * function StickyHeader() {
 *   const { y } = useScreenRect()
 *   return <Box position="sticky" stickyTop={0}>Header at row {y}</Box>
 * }
 * ```
 *
 * Deferred semantics — see this file's docstring.
 */
export function useScreenRect(): Rect {
  return useReactiveRect((committed) => committed, "screenRectCommitted")
}
