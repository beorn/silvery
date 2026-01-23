/**
 * Inkx Text Component
 *
 * The primitive for rendering text content in Inkx. Text supports styling
 * (colors, bold, italic, etc.) and text wrapping/truncation modes.
 *
 * Text renders to an 'inkx-text' host element that the reconciler converts
 * to an InkxNode containing the text content.
 */

import type { JSX, ReactNode } from "react";
import type { TextProps as TextPropsType } from "../types.js";

// ============================================================================
// Props
// ============================================================================

export interface TextProps extends TextPropsType {
  /** Text content (string, number, or nested Text elements) */
  children?: ReactNode;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Text rendering component for terminal UIs.
 *
 * @example
 * ```tsx
 * // Basic text
 * <Text>Hello, world!</Text>
 *
 * // Colored text
 * <Text color="green">Success!</Text>
 * <Text color="#ff6600">Orange text</Text>
 *
 * // Styled text
 * <Text bold>Important</Text>
 * <Text italic underline>Emphasized</Text>
 *
 * // Combined styles
 * <Text color="red" bold inverse>Alert!</Text>
 *
 * // Nested text with different styles
 * <Text>
 *   Normal <Text bold>bold</Text> normal
 * </Text>
 *
 * // Truncation modes
 * <Text wrap="truncate">This long text will be truncated...</Text>
 * <Text wrap="truncate-middle">Long...text</Text>
 * ```
 */
export function Text(props: TextProps): JSX.Element {
  const { children, ...styleProps } = props;

  // Render as inkx-text host element
  // The reconciler will create an InkxNode and store text content
  return <inkx-text {...styleProps}>{children}</inkx-text>;
}
