/**
 * Layout Hooks — three coordinate systems for positioning in silvery.
 *
 * Every silvery node has three rects that differ only by how scroll and
 * sticky offsets are applied. Pick the one that matches your use case:
 *
 * - `useBoxRect()`    — layout position (border-box sized). Use for responsive
 *                       sizing inside a component. Matches CSS offset-like
 *                       semantics for the content area.
 * - `useScrollRect()` — scroll-adjusted position, **pre** sticky clamping.
 *                       Use when you need the "natural" position of a node
 *                       in scrolled coordinates (can go off-screen).
 * - `useScreenRect()` — actual paint position on the terminal screen.
 *                       Use for hit testing, cursor positioning, and
 *                       cross-component visual navigation. The CSS
 *                       `getBoundingClientRect()` analogue.
 *
 * Each hook has two call signatures:
 *
 *   const rect = useBoxRect()                 // reactive — re-renders on change
 *   useBoxRect((rect) => register(id, rect))  // callback — zero re-renders
 *
 * The callback form is the right choice for hot paths like large lists where
 * re-rendering on every layout change is prohibitive.
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
 */
function getInnerRect(node: AgNode): Rect {
  const rect = node.boxRect
  if (!rect) return EMPTY_RECT

  const props = node.props as BoxProps
  if (!props || node.type === "silvery-text") return rect

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
    x: rect.x + pLeft + bLeft,
    y: rect.y + pTop + bTop,
    width: Math.max(0, rect.width - pLeft - pRight - bLeft - bRight),
    height: Math.max(0, rect.height - pTop - pBottom - bTop - bBottom),
  }
}

type RectCallback = (rect: Rect) => void

/** Selector that picks which rect signal to subscribe to. */
type RectSignalKey = "boxRect" | "scrollRect" | "screenRect"

/**
 * Reactive rect hook: subscribes to a rect signal via alien-signals effect()
 * and forces a React re-render whenever the derived rect changes.
 *
 * `signalKey` identifies which rect signal to track (boxRect, scrollRect, or
 * screenRect). `getRect` derives the final value from the node (e.g.,
 * computing inner rect from boxRect by subtracting padding/border).
 *
 * The effect() creates a reactive dependency on the signal — when
 * syncRectSignals writes a new value, the effect re-runs, compares via
 * rectEqual, and triggers forceUpdate only when the derived rect changed.
 */
function useReactiveRect(
  getRect: (node: AgNode) => Rect | null | undefined,
  signalKey: RectSignalKey,
): Rect {
  const node = useContext(NodeContext)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const prevRef = useRef<Rect | null>(null)

  useLayoutEffect(() => {
    if (!node) return

    const signals = getLayoutSignals(node)
    const rectSignal = signals[signalKey]

    // effect() subscribes to the signal — re-runs when the signal value changes.
    // Reading rectSignal() inside effect creates the reactive dependency.
    const dispose = effect(() => {
      // Read the signal to establish the dependency
      rectSignal()

      // Derive the final rect from the node (may compute inner rect, etc.)
      const next = getRect(node) ?? null
      if (!rectEqual(prevRef.current, next)) {
        prevRef.current = next
        forceUpdate()
      }
    })

    return dispose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node])

  if (!node) return EMPTY_RECT
  return getRect(node) ?? EMPTY_RECT
}

/**
 * Callback rect hook: subscribes via alien-signals effect() without
 * triggering React re-renders. The callback is invoked after layout
 * completes whenever the selected rect is available.
 *
 * Uses refs to keep the subscription stable across renders — the `getRect`
 * and `callback` functions are typically created inline and would otherwise
 * invalidate the effect on every render.
 */
function useCallbackRect(
  getRect: (node: AgNode) => Rect | null | undefined,
  callback: RectCallback,
  signalKey: RectSignalKey,
): void {
  const node = useContext(NodeContext)

  const callbackRef = useRef(callback)
  callbackRef.current = callback
  const getRectRef = useRef(getRect)
  getRectRef.current = getRect

  useLayoutEffect(() => {
    if (!node) return

    const signals = getLayoutSignals(node)
    const rectSignal = signals[signalKey]

    // effect() subscribes to the signal — re-runs when the signal value changes.
    const dispose = effect(() => {
      // Read the signal to establish the dependency
      rectSignal()

      const rect = getRectRef.current(node)
      if (rect) callbackRef.current(rect)
    })

    return dispose
  }, [node])
}

// ============================================================================
// boxRect — layout position (border-box)
// ============================================================================

/**
 * Returns the inner content dimensions for the current component's nearest Box.
 * Width and height reflect the space available for children (border-box minus
 * padding and border), like CSS `clientWidth`/`clientHeight`.
 *
 * Two signatures:
 *
 * ```tsx
 * // Reactive — re-renders when the rect changes
 * function Header() {
 *   const { width } = useBoxRect()
 *   return <Text>{'='.repeat(width)}</Text>
 * }
 *
 * // Callback — zero re-renders, use for hot paths like large lists
 * function Card({ id, onLayout }) {
 *   useBoxRect((rect) => onLayout(id, rect))
 *   return <Box>...</Box>
 * }
 * ```
 *
 * On first render (reactive form), returns `{ x: 0, y: 0, width: 0, height: 0 }`.
 * After layout completes, automatically re-renders with actual dimensions.
 *
 * **Layout decisions must be idempotent.** The renderer runs measure → layout →
 * render in a bounded convergence loop, so a component that reads the reactive
 * form and renders something whose width feeds back into the parent's layout
 * must produce the same decision on the next pass. Branching on raw width
 * (e.g. `width >= 90 ? <Wide/> : <Narrow/>`) at a structural mount/unmount
 * boundary will ping-pong under bursty resizes; route the measurement through
 * `useResponsiveValue()` (or a debounced zone) instead. For pure observation
 * (registries, debug overlays), prefer the callback form. See the API doc
 * "Layout decisions vs. observation" section.
 */
export function useBoxRect(): Rect
export function useBoxRect(callback: RectCallback): void
export function useBoxRect(callback?: RectCallback): Rect | void {
  if (callback) {
    return useCallbackRect((node) => getInnerRect(node), callback, "boxRect")
  }
  return useReactiveRect((node) => getInnerRect(node), "boxRect")
}

// ============================================================================
// scrollRect — scroll-adjusted position (pre-sticky clamping)
// ============================================================================

/**
 * Returns the scroll-adjusted position for the current component.
 *
 * This is the node's position in scroll coordinates, *before* sticky clamping.
 * For non-sticky nodes it equals `useScreenRect()`. For sticky nodes, the
 * scrollRect reflects where the node would be without sticky adjustment —
 * so it can go off-screen (negative y, etc.) when scrolled past.
 *
 * Use this when you need to reason about the node's "natural" position in the
 * scrolled document. For hit testing or cursor positioning, use
 * `useScreenRect()` instead.
 *
 * Two signatures:
 *
 * ```tsx
 * // Reactive — re-renders when scroll changes
 * function Card({ id }) {
 *   const { y } = useScrollRect()
 *   return <Box>Scroll y: {y}</Box>
 * }
 *
 * // Callback — zero re-renders
 * function Card({ id, onLayout }) {
 *   useScrollRect((rect) => onLayout(id, rect.y))
 *   return <Box>...</Box>
 * }
 * ```
 */
export function useScrollRect(): Rect
export function useScrollRect(callback: RectCallback): void
export function useScrollRect(callback?: RectCallback): Rect | void {
  if (callback) {
    return useCallbackRect((node) => node.scrollRect, callback, "scrollRect")
  }
  return useReactiveRect((node) => node.scrollRect, "scrollRect")
}

// ============================================================================
// screenRect — actual paint position on the terminal screen
// ============================================================================

/**
 * Returns the actual paint position on the terminal screen — the silvery
 * analogue of `getBoundingClientRect()`.
 *
 * For non-sticky nodes this equals `useScrollRect()`. For sticky nodes
 * (`position="sticky"`), it reflects the clamped position where pixels
 * actually land on screen.
 *
 * Use this for hit testing, cursor positioning, and any feature that needs
 * to know where a node visually appears on the terminal.
 *
 * Two signatures:
 *
 * ```tsx
 * // Reactive — re-renders when the screen position changes
 * function StickyHeader() {
 *   const { y } = useScreenRect()
 *   return <Box position="sticky" stickyTop={0}>Header at row {y}</Box>
 * }
 *
 * // Callback — zero re-renders, recommended for cross-component visual
 * // navigation (e.g. registering card positions for arrow-key navigation
 * // across columns with independent scroll state).
 * function Card({ id, onLayout }) {
 *   useScreenRect((rect) => onLayout(id, rect.y))
 *   return <Box>...</Box>
 * }
 * ```
 */
export function useScreenRect(): Rect
export function useScreenRect(callback: RectCallback): void
export function useScreenRect(callback?: RectCallback): Rect | void {
  if (callback) {
    return useCallbackRect((node) => node.screenRect, callback, "screenRect")
  }
  return useReactiveRect((node) => node.screenRect, "screenRect")
}
