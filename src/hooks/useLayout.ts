import { useContext, useLayoutEffect, useReducer } from "react";
import { NodeContext } from "../context.js";
import type { InkxNode } from "../types.js";

export interface ComputedLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Returns the computed layout dimensions for the current component.
 *
 * On first render, returns { x: 0, y: 0, width: 0, height: 0 }.
 * After layout completes, automatically re-renders with actual dimensions.
 *
 * @example
 * ```tsx
 * function Header() {
 *   const { width } = useLayout();
 *   return <Text>{'='.repeat(width)}</Text>;
 * }
 * ```
 */
export function useLayout(): ComputedLayout {
  const node = useInkxNode();
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useLayoutEffect(() => {
    // Subscribe to layout changes
    const handleLayoutComplete = () => {
      if (!layoutEqual(node.prevLayout, node.computedLayout)) {
        forceUpdate();
      }
    };

    node.layoutSubscribers.add(handleLayoutComplete);
    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete);
    };
  }, [node]);

  // Return current dimensions (may be zeros on first render)
  return node.computedLayout ?? { x: 0, y: 0, width: 0, height: 0 };
}

function useInkxNode(): InkxNode {
  const node = useContext(NodeContext);
  if (!node) {
    throw new Error("useLayout must be used within an Inkx component");
  }
  return node;
}

function layoutEqual(
  a: ComputedLayout | null,
  b: ComputedLayout | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

/**
 * Callback invoked with computed layout after render.
 * Does NOT cause re-renders - use for position registration in large lists.
 *
 * Unlike useLayout() which re-renders when dimensions change (problematic with
 * 100+ cards), this hook just calls your callback after layout completes.
 *
 * @example
 * ```tsx
 * function Card({ id, onLayout }) {
 *   useLayoutCallback((layout) => {
 *     onLayout(id, layout);
 *   });
 *   return <Box>...</Box>;
 * }
 * ```
 */
export function useLayoutCallback(
  callback: (layout: ComputedLayout) => void,
): void {
  const node = useContext(NodeContext);

  useLayoutEffect(() => {
    if (!node) return;

    // Call callback after each layout with current dimensions
    const handleLayoutComplete = () => {
      if (node.computedLayout) {
        callback(node.computedLayout);
      }
    };

    // Subscribe to layout changes
    node.layoutSubscribers.add(handleLayoutComplete);

    // Also call immediately if layout already computed
    if (node.computedLayout) {
      callback(node.computedLayout);
    }

    return () => {
      node.layoutSubscribers.delete(handleLayoutComplete);
    };
  }, [node, callback]);
}
