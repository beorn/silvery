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
import { NodeContext } from "../context"
import { type AgNode, type BoxProps, type Rect, rectEqual } from "@silvery/ag/types"

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

/**
 * Reactive rect hook: subscribes to the node's layoutSubscribers and forces a
 * re-render whenever the selected rect changes. `getRect` pulls the current
 * rect from the node for each render and change check.
 */
function useReactiveRect(getRect: (node: AgNode) => Rect | null | undefined): Rect {
  const node = useContext(NodeContext)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const prevRef = useRef<Rect | null>(null)

  useLayoutEffect(() => {
    if (!node) return

    const handleLayoutComplete = () => {
      const next = getRect(node) ?? null
      if (!rectEqual(prevRef.current, next)) {
        prevRef.current = next
        forceUpdate()
      }
    }

    node.layoutSubscribers.add(handleLayoutComplete)
    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node])

  if (!node) return EMPTY_RECT
  return getRect(node) ?? EMPTY_RECT
}

/**
 * Callback rect hook: subscribes without triggering re-renders. The callback
 * is invoked after layout completes whenever the selected rect is available.
 * Uses a ref so the hook doesn't re-subscribe when the caller passes a fresh
 * function each render.
 */
function useCallbackRect(getRect: (node: AgNode) => Rect | null | undefined, callback: RectCallback): void {
  const node = useContext(NodeContext)

  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useLayoutEffect(() => {
    if (!node) return

    const handleLayoutComplete = () => {
      const rect = getRect(node)
      if (rect) callbackRef.current(rect)
    }

    node.layoutSubscribers.add(handleLayoutComplete)

    // Call immediately if the rect is already computed
    const rect = getRect(node)
    if (rect) callbackRef.current(rect)

    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
 */
export function useBoxRect(): Rect
export function useBoxRect(callback: RectCallback): void
export function useBoxRect(callback?: RectCallback): Rect | void {
  if (callback) {
    return useCallbackRect((node) => getInnerRect(node), callback)
  }
  return useReactiveRect((node) => getInnerRect(node))
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
    return useCallbackRect((node) => node.scrollRect, callback)
  }
  return useReactiveRect((node) => node.scrollRect)
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
    return useCallbackRect((node) => node.screenRect, callback)
  }
  return useReactiveRect((node) => node.screenRect)
}
