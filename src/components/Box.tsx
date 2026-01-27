/**
 * Inkx Box Component
 *
 * The primary layout primitive for Inkx. Box is a flexbox container that can hold
 * other Box or Text components. It supports all standard flexbox properties,
 * dimensions, spacing, and borders.
 *
 * Box renders to an 'inkx-box' host element that the reconciler converts to an
 * InkxNode with an associated Yoga layout node.
 *
 * Box provides NodeContext to its children, enabling useLayout/useScreenRect hooks.
 */

import { type JSX, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { NodeContext } from '../context.js';
import type { BoxProps as BoxPropsType, ComputedLayout, InkxNode } from '../types.js';

// ============================================================================
// Props
// ============================================================================

export interface BoxProps extends BoxPropsType {
	/** Child elements */
	children?: ReactNode;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Flexbox container component for terminal UIs.
 *
 * Provides NodeContext to children, enabling useLayout/useScreenRect hooks.
 *
 * @example
 * ```tsx
 * // Basic vertical layout (default)
 * <Box>
 *   <Text>Line 1</Text>
 *   <Text>Line 2</Text>
 * </Box>
 *
 * // Horizontal layout with spacing
 * <Box flexDirection="row" gap={2}>
 *   <Box width={10}><Text>Left</Text></Box>
 *   <Box flexGrow={1}><Text>Center</Text></Box>
 *   <Box width={10}><Text>Right</Text></Box>
 * </Box>
 *
 * // With border
 * <Box borderStyle="single" borderColor="green" padding={1}>
 *   <Text>Boxed content</Text>
 * </Box>
 * ```
 */
export function Box(props: BoxProps): JSX.Element {
	const { children, ...restProps } = props;
	const nodeRef = useRef<InkxNode | null>(null);
	const [node, setNode] = useState<InkxNode | null>(null);

	// After mount, ref points to the InkxNode (via getPublicInstance in reconciler).
	// Update state to provide the node to children via context.
	useLayoutEffect(() => {
		if (nodeRef.current && nodeRef.current !== node) {
			setNode(nodeRef.current);
		}
	});

	// Render inkx-box with ref, wrap children in NodeContext
	// The reconciler creates an InkxNode, ref gives us access to it
	return (
		<inkx-box ref={nodeRef} {...restProps}>
			<NodeContext.Provider value={node}>{children}</NodeContext.Provider>
		</inkx-box>
	);
}

// Re-export ComputedLayout for convenience
export type { ComputedLayout };
