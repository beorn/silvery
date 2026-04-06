/**
 * Heading Component — Semantic headings with OSC 66 text sizing.
 *
 * Uses the kitty text sizing protocol (OSC 66 s= parameter) for real
 * font size variation in terminals that support it (Kitty v0.40+).
 * Graceful degradation: on unsupported terminals, renders as bold text
 * at normal size with semantic theme colors — still readable hierarchy.
 *
 * @example
 * ```tsx
 * <Heading>Page Title</Heading>           // h1: 2.0x, bold, $primary
 * <Heading level={2}>Section</Heading>    // h2: 1.5x, bold, $accent
 * <Heading level={3}>Subsection</Heading> // h3: 1.25x, bold, $primary
 * <Heading level={4}>Group</Heading>      // h4: 1.0x, bold only
 * <Heading level={5}>Minor</Heading>      // h5: 0.9x, bold
 * <Heading level={6}>Smallest</Heading>   // h6: 0.8x, bold
 * ```
 */
import type { ReactNode } from "react"
import { Text } from "@silvery/ag-react/components/Text"
import type { TextProps } from "@silvery/ag-react/components/Text"

// =============================================================================
// Types
// =============================================================================

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export interface HeadingProps extends Omit<TextProps, "children"> {
  /** Heading level (1-6). Default: 1 */
  level?: HeadingLevel
  children?: ReactNode
}

// =============================================================================
// Constants
// =============================================================================

/** OSC 66 scale multiplier per heading level */
const LEVEL_SCALES: Record<HeadingLevel, number> = {
  1: 2.0,
  2: 1.5,
  3: 1.25,
  4: 1.0,
  5: 0.9,
  6: 0.8,
}

/** Default semantic color per heading level */
const LEVEL_COLORS: Record<HeadingLevel, string | undefined> = {
  1: "$primary",
  2: "$accent",
  3: "$primary",
  4: undefined, // inherit fg
  5: undefined,
  6: "$muted",
}

// =============================================================================
// Component
// =============================================================================

export function Heading({ level = 1, children, color, ...rest }: HeadingProps) {
  const scale = LEVEL_SCALES[level]
  const defaultColor = LEVEL_COLORS[level]

  return (
    <Text bold textSize={scale} color={color ?? defaultColor} {...rest}>
      {children}
    </Text>
  )
}
