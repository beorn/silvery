/**
 * Silvery measureElement
 *
 * Backward-compatible API for measuring element dimensions.
 * This is provided for Ink compatibility - prefer using the useContentRect() hook instead.
 *
 * @example
 * ```tsx
 * import { measureElement, Box } from '@silvery/react';
 * import { useRef, useEffect, useState } from 'react';
 *
 * function MyComponent() {
 *   const ref = useRef(null);
 *   const [width, setWidth] = useState(0);
 *
 *   useEffect(() => {
 *     if (ref.current) {
 *       const { width } = measureElement(ref.current);
 *       setWidth(width);
 *     }
 *   }, []);
 *
 *   return <Box ref={ref}><Text>Width: {width}</Text></Box>;
 * }
 * ```
 *
 * Note: The useContentRect() hook is preferred as it automatically re-renders
 * when dimensions change:
 *
 * ```tsx
 * function MyComponent() {
 *   const { width } = useContentRect();
 *   return <Text>Width: {width}</Text>;
 * }
 * ```
 */

import type { TeaNode } from "@silvery/tea/types"

/**
 * Output from measureElement.
 */
export interface MeasureElementOutput {
  /** Element width in terminal columns */
  width: number
  /** Element height in terminal rows */
  height: number
}

/**
 * Resolve a ref value to a TeaNode. Handles both direct TeaNode refs
 * and BoxHandle refs (from silvery's Box component which uses useImperativeHandle).
 * Ink users pass ref.current which resolves to a BoxHandle, not a TeaNode directly.
 */
function resolveNode(nodeOrHandle: any): TeaNode | null {
  if (!nodeOrHandle) return null
  // BoxHandle from silvery's Box component (has getNode method)
  if (typeof nodeOrHandle.getNode === "function") {
    return nodeOrHandle.getNode()
  }
  // Direct TeaNode
  return nodeOrHandle as TeaNode
}

/**
 * Measure the dimensions of a Silvery element.
 *
 * @param nodeOrHandle - The SilveryNode or BoxHandle to measure (obtained via ref)
 * @returns The computed width and height of the element
 *
 * Note: Returns { width: 0, height: 0 } if the element hasn't been laid out yet.
 * For automatic re-rendering on dimension changes, use the useContentRect() hook instead.
 */
export function measureElement(nodeOrHandle: TeaNode | unknown): MeasureElementOutput {
  const node = resolveNode(nodeOrHandle)
  if (!node) {
    return { width: 0, height: 0 }
  }

  // Prefer contentRect (set by silvery pipeline after layout phase)
  // This is the canonical source of truth after a render
  if (node.contentRect) {
    return {
      width: node.contentRect.width,
      height: node.contentRect.height,
    }
  }

  // Fall back to layoutNode for backward compatibility
  // (handles case where measureElement is called before silvery pipeline runs)
  const width = node.layoutNode?.getComputedWidth() ?? 0
  const height = node.layoutNode?.getComputedHeight() ?? 0

  return {
    // Handle NaN from Yoga (returned before calculateLayout is called)
    width: Number.isNaN(width) ? 0 : width,
    height: Number.isNaN(height) ? 0 : height,
  }
}
