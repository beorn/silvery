/**
 * Layout Hooks
 *
 * Hooks for accessing element positions in inkx components.
 *
 * Two coordinate systems:
 * - Content rect: Position within scrollable content (like CSS offsetTop/offsetLeft)
 * - Screen rect: Position on terminal screen (like CSS getBoundingClientRect)
 */

import { useContext, useLayoutEffect, useReducer } from "react";
import { NodeContext } from "../context.js";
import type { InkxNode, Rect } from "../types.js";

/**
 * @deprecated Use Rect instead. Alias kept for backwards compatibility.
 */
export type ComputedLayout = Rect;
export type { Rect };

// ============================================================================
// Content Rect Hooks (position within scrollable content)
// ============================================================================

/**
 * Returns the content-relative position for the current component.
 * Like CSS offsetTop/offsetLeft - position within scrollable content.
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
  const node = useInkxNode();
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useLayoutEffect(() => {
    const handleLayoutComplete = () => {
      if (!rectEqual(node.prevLayout, node.contentRect)) {
        forceUpdate();
      }
    };

    node.layoutSubscribers.add(handleLayoutComplete);
    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete);
    };
  }, [node]);

  return node.contentRect ?? { x: 0, y: 0, width: 0, height: 0 };
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
  const node = useContext(NodeContext);

  useLayoutEffect(() => {
    if (!node) return;

    const handleLayoutComplete = () => {
      if (node.contentRect) {
        callback(node.contentRect);
      }
    };

    node.layoutSubscribers.add(handleLayoutComplete);

    // Also call immediately if layout already computed
    if (node.contentRect) {
      callback(node.contentRect);
    }

    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete);
    };
  }, [node, callback]);
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
 *   const { y } = useScreenRect();
 *   // y is the actual screen row, accounting for scroll
 *   return <Box>Card at screen row {y}</Box>;
 * }
 * ```
 */
export function useScreenRect(): Rect {
  const node = useInkxNode();
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useLayoutEffect(() => {
    const handleLayoutComplete = () => {
      // Re-render when layout changes (screen rect is recomputed each frame)
      if (!rectEqual(node.prevLayout, node.contentRect)) {
        forceUpdate();
      }
    };

    node.layoutSubscribers.add(handleLayoutComplete);
    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete);
    };
  }, [node]);

  return node.screenRect ?? { x: 0, y: 0, width: 0, height: 0 };
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
 *   useScreenRectCallback((rect) => {
 *     // rect.y is screen position, accounting for scroll
 *     onLayout(id, rect.y);
 *   });
 *   return <Box>...</Box>;
 * }
 * ```
 */
export function useScreenRectCallback(callback: (rect: Rect) => void): void {
  const node = useContext(NodeContext);

  useLayoutEffect(() => {
    if (!node) return;

    const handleLayoutComplete = () => {
      if (node.screenRect) {
        callback(node.screenRect);
      }
    };

    node.layoutSubscribers.add(handleLayoutComplete);

    // Also call immediately if screen rect already computed
    if (node.screenRect) {
      callback(node.screenRect);
    }

    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete);
    };
  }, [node, callback]);
}

// ============================================================================
// Deprecated Aliases (backwards compatibility)
// ============================================================================

/**
 * @deprecated Use useContentRect instead.
 */
export const useLayout = useContentRect;

/**
 * @deprecated Use useContentRectCallback instead.
 */
export const useLayoutCallback = useContentRectCallback;

// ============================================================================
// Internal Helpers
// ============================================================================

function useInkxNode(): InkxNode {
  const node = useContext(NodeContext);
  if (!node) {
    throw new Error("useLayout must be used within an Inkx component");
  }
  return node;
}

function rectEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}
