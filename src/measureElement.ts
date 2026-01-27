/**
 * Inkx measureElement
 *
 * Backward-compatible API for measuring element dimensions.
 * This is provided for Ink compatibility - prefer using the useLayout() hook instead.
 *
 * @example
 * ```tsx
 * import { measureElement, Box } from 'inkx';
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
 * Note: The useLayout() hook is preferred as it automatically re-renders
 * when dimensions change:
 *
 * ```tsx
 * function MyComponent() {
 *   const { width } = useLayout();
 *   return <Text>Width: {width}</Text>;
 * }
 * ```
 */

import type { InkxNode } from './types.js';

/**
 * Output from measureElement.
 */
export interface MeasureElementOutput {
	/** Element width in terminal columns */
	width: number;
	/** Element height in terminal rows */
	height: number;
}

/**
 * Measure the dimensions of an Inkx element.
 *
 * @param node - The InkxNode to measure (obtained via ref)
 * @returns The computed width and height of the element
 *
 * Note: Returns { width: 0, height: 0 } if the element hasn't been laid out yet.
 * For automatic re-rendering on dimension changes, use the useLayout() hook instead.
 */
export function measureElement(node: InkxNode): MeasureElementOutput {
	// Prefer computedLayout (set by inkx pipeline after layout phase)
	// This is the canonical source of truth after a render
	if (node.computedLayout) {
		return {
			width: node.computedLayout.width,
			height: node.computedLayout.height,
		};
	}

	// Fall back to layoutNode for backward compatibility
	// (handles case where measureElement is called before inkx pipeline runs)
	const width = node.layoutNode?.getComputedWidth() ?? 0;
	const height = node.layoutNode?.getComputedHeight() ?? 0;

	return {
		// Handle NaN from Yoga (returned before calculateLayout is called)
		width: Number.isNaN(width) ? 0 : width,
		height: Number.isNaN(height) ? 0 : height,
	};
}
