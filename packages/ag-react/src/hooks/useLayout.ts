/**
 * Layout Hooks
 *
 * Hooks for accessing element positions in silvery components.
 *
 * Two coordinate systems:
 * - Content rect: Position within scrollable content (like CSS offsetTop/offsetLeft)
 * - Screen rect: Position on terminal screen (like CSS getBoundingClientRect)
 */

import { useContext, useLayoutEffect, useReducer, useRef } from "react"
import { NodeContext } from "../context"
import { type AgNode, type BoxProps, type Rect, rectEqual } from "@silvery/ag/types"

export type { Rect }

/**
 * Get the inner content dimensions of a node (border-box minus padding and border).
 * This is the space available for the node's children.
 */
function getInnerRect(node: AgNode): Rect {
  const rect = node.contentRect
  if (!rect) return { x: 0, y: 0, width: 0, height: 0 }

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

// ============================================================================
// Content Rect Hooks (position within scrollable content)
// ============================================================================

/**
 * Returns the inner content dimensions for the current component's nearest Box.
 * Width and height reflect the space available for children (border-box minus
 * padding and border), like CSS `clientWidth`/`clientHeight`.
 *
 * On first render, returns { x: 0, y: 0, width: 0, height: 0 }.
 * After layout completes, automatically re-renders with actual dimensions.
 *
 * @example
 * ```tsx
 * function Header() {
 *   const { width } = useContentRect();
 *   return <Text>{'='.repeat(width)}</Text>;
 * }
 * ```
 */
export function useContentRect(): Rect {
  const node = useContext(NodeContext)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  useLayoutEffect(() => {
    if (!node) return

    const handleLayoutComplete = () => {
      if (!rectEqual(node.prevLayout, node.contentRect)) {
        forceUpdate()
      }
    }

    node.layoutSubscribers.add(handleLayoutComplete)
    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete)
    }
  }, [node])

  if (!node) return { x: 0, y: 0, width: 0, height: 0 }
  return getInnerRect(node)
}

/**
 * Callback invoked with content-relative position after render.
 * Does NOT cause re-renders - use for position registration in large lists.
 *
 * @example
 * ```tsx
 * function Card({ id, onLayout }) {
 *   useContentRectCallback((rect) => {
 *     onLayout(id, rect);
 *   });
 *   return <Box>...</Box>;
 * }
 * ```
 */
export function useContentRectCallback(callback: (rect: Rect) => void): void {
  const node = useContext(NodeContext)

  // Use ref to always have current callback without re-subscribing
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useLayoutEffect(() => {
    if (!node) return

    const handleLayoutComplete = () => {
      if (node.contentRect) {
        callbackRef.current(node.contentRect)
      }
    }

    node.layoutSubscribers.add(handleLayoutComplete)

    // Also call immediately if layout already computed
    if (node.contentRect) {
      callbackRef.current(node.contentRect)
    }

    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete)
    }
  }, [node])
}

// ============================================================================
// Screen Rect Hooks (position on terminal screen)
// ============================================================================

/**
 * Returns the screen-relative position for the current component.
 * Like CSS getBoundingClientRect - actual position on terminal screen.
 *
 * Accounts for scroll offsets of all ancestor containers.
 * Use this for visual navigation between columns with different scroll positions.
 *
 * On first render, returns { x: 0, y: 0, width: 0, height: 0 }.
 * After layout completes, automatically re-renders with actual dimensions.
 *
 * @example
 * ```tsx
 * function Card({ id }) {
 *   const { y } = useScrollRect();
 *   // y is the actual screen row, accounting for scroll
 *   return <Box>Card at screen row {y}</Box>;
 * }
 * ```
 */
export function useScrollRect(): Rect {
  const node = useContext(NodeContext)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const prevScrollRectRef = useRef<Rect | null>(null)

  useLayoutEffect(() => {
    if (!node) return

    const handleLayoutComplete = () => {
      // Re-render when scrollRect changes (can happen from scroll offset changes
      // even when contentRect stays the same)
      if (!rectEqual(prevScrollRectRef.current, node.scrollRect)) {
        prevScrollRectRef.current = node.scrollRect
        forceUpdate()
      }
    }

    node.layoutSubscribers.add(handleLayoutComplete)
    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete)
    }
  }, [node])

  return node?.scrollRect ?? { x: 0, y: 0, width: 0, height: 0 }
}

/**
 * Callback invoked with screen-relative position after render.
 * Does NOT cause re-renders - use for position registration in large lists.
 *
 * This is the recommended hook for cross-column visual navigation:
 * register card positions with screen coordinates to find cards at
 * the same visual Y position regardless of column scroll state.
 *
 * @example
 * ```tsx
 * function Card({ id, onLayout }) {
 *   useScrollRectCallback((rect) => {
 *     // rect.y is screen position, accounting for scroll
 *     onLayout(id, rect.y);
 *   });
 *   return <Box>...</Box>;
 * }
 * ```
 */
export function useScrollRectCallback(callback: (rect: Rect) => void): void {
  const node = useContext(NodeContext)

  // Use ref to always have current callback without re-subscribing
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useLayoutEffect(() => {
    if (!node) return

    const handleLayoutComplete = () => {
      if (node.scrollRect) {
        callbackRef.current(node.scrollRect)
      }
    }

    node.layoutSubscribers.add(handleLayoutComplete)

    // Also call immediately if screen rect already computed
    if (node.scrollRect) {
      callbackRef.current(node.scrollRect)
    }

    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete)
    }
  }, [node])
}

// ============================================================================
// Render Rect Hooks (actual render position, accounting for sticky offsets)
// ============================================================================

/**
 * Returns the actual render position for the current component.
 * For non-sticky nodes, this equals `useScrollRect()`.
 * For sticky nodes (position="sticky"), this accounts for sticky render
 * offsets — the position where pixels are actually painted on screen.
 *
 * Use this for hit testing, cursor positioning, and any feature that
 * needs to know where a node visually appears on screen.
 *
 * On first render, returns { x: 0, y: 0, width: 0, height: 0 }.
 * After layout completes, automatically re-renders with actual dimensions.
 *
 * @example
 * ```tsx
 * function StickyHeader() {
 *   const { y } = useRenderRect();
 *   // y is the actual render row, accounting for sticky offset
 *   return <Box position="sticky" stickyTop={0}>Header at row {y}</Box>;
 * }
 * ```
 */
export function useRenderRect(): Rect {
  const node = useContext(NodeContext)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const prevRenderRectRef = useRef<Rect | null>(null)

  useLayoutEffect(() => {
    if (!node) return

    const handleLayoutComplete = () => {
      // Re-render when renderRect changes (can happen from sticky offset
      // changes even when scrollRect stays the same)
      if (!rectEqual(prevRenderRectRef.current, node.renderRect)) {
        prevRenderRectRef.current = node.renderRect
        forceUpdate()
      }
    }

    node.layoutSubscribers.add(handleLayoutComplete)
    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete)
    }
  }, [node])

  return node?.renderRect ?? { x: 0, y: 0, width: 0, height: 0 }
}

/**
 * Callback invoked with actual render position after render.
 * Does NOT cause re-renders - use for position registration in large lists.
 *
 * For non-sticky nodes, the rect equals scrollRect. For sticky nodes,
 * it reflects the actual render position accounting for sticky offsets.
 *
 * @example
 * ```tsx
 * function Card({ id, onLayout }) {
 *   useRenderRectCallback((rect) => {
 *     // rect.y is actual render row, accounting for sticky
 *     onLayout(id, rect.y);
 *   });
 *   return <Box>...</Box>;
 * }
 * ```
 */
export function useRenderRectCallback(callback: (rect: Rect) => void): void {
  const node = useContext(NodeContext)

  // Use ref to always have current callback without re-subscribing
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useLayoutEffect(() => {
    if (!node) return

    const handleLayoutComplete = () => {
      if (node.renderRect) {
        callbackRef.current(node.renderRect)
      }
    }

    node.layoutSubscribers.add(handleLayoutComplete)

    // Also call immediately if render rect already computed
    if (node.renderRect) {
      callbackRef.current(node.renderRect)
    }

    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete)
    }
  }, [node])
}
