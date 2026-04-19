/**
 * Silvery Text Component
 *
 * The primitive for rendering text content in Silvery. Text supports styling
 * (colors, bold, italic, etc.) and text wrapping/truncation modes.
 *
 * Text renders to an 'silvery-text' host element that the reconciler converts
 * to an SilveryNode containing the text content.
 *
 * Supports forwardRef for imperative access to the underlying node.
 */

import { type ForwardedRef, type JSX, type ReactNode, forwardRef, useContext } from "react"
import type { AgNode, TextProps as TextPropsType } from "@silvery/ag/types"
import type { KnownVariant } from "@silvery/ansi"
import { KNOWN_VARIANTS } from "@silvery/ansi"
import { ThemeContext } from "@silvery/theme/ThemeContext"

// ============================================================================
// Runtime variant warning — fires once per unknown variant name per session.
// Warns the developer that a variant lookup returned undefined (typo, etc.).
// Does NOT throw — silent no-op rendering is still the correct behavior.
// ============================================================================

/** Variant names that have already triggered a warning this session. */
const _warnedVariants = new Set<string>()

// ============================================================================
// Props
// ============================================================================

export interface TextProps extends TextPropsType {
  /** Text content (string, number, or nested Text elements) */
  children?: ReactNode
  /**
   * Typography variant — pulls defaults from `theme.variants[variant]`.
   * Caller props always win over variant values (variant is the *default*).
   *
   * @example
   * ```tsx
   * <Text variant="h1">Title</Text>
   * // → uses theme.variants.h1 as defaults ({ color: "$primary", bold: true })
   *
   * <Text variant="h1" color="$success">Done</Text>
   * // → color="$success" wins; bold still comes from variant
   * ```
   */
  variant?: KnownVariant
}

/**
 * Methods exposed via ref on Text component.
 */
export interface TextHandle {
  /** Get the underlying SilveryNode */
  getNode(): AgNode | null
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
 *
 * // With variant — typography presets from theme
 * <Text variant="h1">Page Title</Text>
 * <Text variant="body-muted">Caption text</Text>
 * <Text variant="h1" color="$success">Done</Text>  // caller color wins
 * ```
 */
export const Text = forwardRef(function Text(
  props: TextProps,
  ref: ForwardedRef<TextHandle>,
): JSX.Element {
  const { children, variant, ...callerProps } = props
  const theme = useContext(ThemeContext)

  // Resolve variant defaults. Variant is the DEFAULT; caller props always win.
  //
  // Merge strategy (three passes):
  //   1. callerProps — base layer: all caller props including undefined values
  //                    (preserves non-style props like wrap, data-*, etc.)
  //   2. variantDefaults — overwrite only where callerProps was undefined
  //                        (fills in color/bold/etc when caller didn't specify)
  //   3. definedCallerProps — restore any explicitly provided caller overrides
  //                           (e.g. color="$success", bold={false} win over variant)
  //
  // Example: `<Text variant="h1">T</Text>` (color not passed → undefined)
  //   callerProps = { color: undefined }
  //   variantDefaults = { color: "$primary", bold: true }
  //   definedCallerProps = {} (color=undefined excluded)
  //   → { color: "$primary", bold: true } ✓
  //
  // Example: `<Text variant="h1" color="$success">T</Text>`
  //   callerProps = { color: "$success" }
  //   variantDefaults = { color: "$primary", bold: true }
  //   definedCallerProps = { color: "$success" }
  //   → { color: "$success", bold: true } ✓ (caller color wins)
  let styleProps = callerProps
  if (variant != null) {
    const resolved = theme.variants?.[variant]
    if (resolved === undefined && !_warnedVariants.has(variant)) {
      _warnedVariants.add(variant)
      const known = KNOWN_VARIANTS.join(", ")
      console.warn(
        `[silvery] Unknown variant "${variant}". Known variants: ${known}. ` +
          `Check the theme.variants object or the variant name spelling.`,
      )
    }
    const variantDefaults = resolved ?? {}
    const definedCallerProps: Record<string, unknown> = {}
    for (const key of Object.keys(callerProps)) {
      const v = (callerProps as Record<string, unknown>)[key]
      if (v !== undefined) definedCallerProps[key] = v
    }
    styleProps = { ...callerProps, ...variantDefaults, ...definedCallerProps } as typeof callerProps
  }

  // For Text, we need to pass the ref through to the host element
  // The reconciler's getPublicInstance will return the SilveryNode
  // We wrap it in a TextHandle for type safety
  return (
    <silvery-text
      ref={(node: AgNode | null) => {
        // Handle both callback refs and RefObjects
        if (typeof ref === "function") {
          ref(node ? { getNode: () => node } : null)
        } else if (ref) {
          ref.current = node ? { getNode: () => node } : null
        }
      }}
      {...styleProps}
    >
      {children}
    </silvery-text>
  )
})
