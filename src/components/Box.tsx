/**
 * Inkx Box Component
 *
 * The primary layout primitive for Inkx. Box is a flexbox container that can hold
 * other Box or Text components. It supports all standard flexbox properties,
 * dimensions, spacing, and borders.
 *
 * Box renders to an 'inkx-box' host element that the reconciler converts to an
 * InkxNode with an associated Yoga layout node.
 */

import type { JSX, ReactNode } from "react";
import type { BoxProps as BoxPropsType, ComputedLayout } from "../types.js";

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

  // Render as inkx-box host element
  // The reconciler will create an InkxNode and apply props to the Yoga node
  return <inkx-box {...restProps}>{children}</inkx-box>;
}

// Re-export ComputedLayout for convenience
export type { ComputedLayout };
