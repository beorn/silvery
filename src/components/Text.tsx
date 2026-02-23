/**
 * Inkx Text Component
 *
 * The primitive for rendering text content in Inkx. Text supports styling
 * (colors, bold, italic, etc.) and text wrapping/truncation modes.
 *
 * Text renders to an 'inkx-text' host element that the reconciler converts
 * to an InkxNode containing the text content.
 *
 * Supports forwardRef for imperative access to the underlying node.
 */

import { type ForwardedRef, type JSX, type ReactNode, forwardRef } from "react"
import { useTheme } from "../contexts/ThemeContext.js"
import { resolveThemeColor } from "../theme-defs.js"
import type { InkxNode, TextProps as TextPropsType } from "../types.js"

// ============================================================================
// Props
// ============================================================================

export interface TextProps extends TextPropsType {
  /** Text content (string, number, or nested Text elements) */
  children?: ReactNode
}

/**
 * Methods exposed via ref on Text component.
 */
export interface TextHandle {
  /** Get the underlying InkxNode */
  getNode(): InkxNode | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * Text rendering component for terminal UIs.
 *
 * Supports forwardRef for imperative access to the underlying node.
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
 *
 * // With ref
 * const textRef = useRef<TextHandle>(null);
 * <Text ref={textRef}>Hello</Text>
 * ```
 */
export const Text = forwardRef(function Text(props: TextProps, ref: ForwardedRef<TextHandle>): JSX.Element {
  const { children, color, backgroundColor, ...styleProps } = props
  const theme = useTheme()

  // Resolve $token color props against the active theme
  const resolvedColor = resolveThemeColor(color, theme)
  const resolvedBg = resolveThemeColor(backgroundColor, theme)

  // For Text, we need to pass the ref through to the host element
  // The reconciler's getPublicInstance will return the InkxNode
  // We wrap it in a TextHandle for type safety
  return (
    <inkx-text
      ref={(node: InkxNode | null) => {
        // Handle both callback refs and RefObjects
        if (typeof ref === "function") {
          ref(node ? { getNode: () => node } : null)
        } else if (ref) {
          ref.current = node ? { getNode: () => node } : null
        }
      }}
      color={resolvedColor}
      backgroundColor={resolvedBg}
      {...styleProps}
    >
      {children}
    </inkx-text>
  )
})
