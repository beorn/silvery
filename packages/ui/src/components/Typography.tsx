/**
 * Typography Preset Components
 *
 * Semantic text hierarchy for TUIs. Since terminals can't vary font size,
 * these presets use color + bold/dim/italic to create clear visual levels.
 *
 * All components accept an optional `color` prop to override the default.
 * Headings default to semantic theme colors; pass a custom color for
 * panel differentiation (e.g., <H1 color="$success">Panel A</H1>).
 *
 * ## Color inheritance
 *
 * Body-text components (P, Strong, Em, H3) inherit foreground color from
 * the nearest ancestor Box with a `color` or `theme` prop — just like CSS.
 * They do NOT hardcode `$fg`, so `<Box color="$error"><P>red text</P></Box>` works.
 *
 * `Box theme={}` auto-inherits `$fg` for all text and auto-fills `$bg`:
 * ```tsx
 * <Box theme={lightTheme}>
 *   <P>This text uses the light theme's fg on its bg</P>
 * </Box>
 * ```
 *
 * Lists support nesting via UL/OL containers:
 * ```tsx
 * <UL>
 *   <LI>First item</LI>
 *   <LI>Second item
 *     <UL>
 *       <LI>Nested bullet</LI>
 *     </UL>
 *   </LI>
 * </UL>
 * ```
 */
import type { ReactNode } from "react"
import { createContext, useContext, Children, cloneElement, isValidElement } from "react"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"
import type { TextProps } from "@silvery/react/components/Text"

export interface TypographyProps extends Omit<TextProps, "children"> {
  children?: ReactNode
}

// ============================================================================
// Headings
// ============================================================================

/** Page title — $primary + bold. Maximum emphasis. */
export function H1({ children, color, ...rest }: TypographyProps) {
  return (
    <Text bold color={color ?? "$primary"} {...rest}>
      {children}
    </Text>
  )
}

/** Section heading — $accent + bold. Contrasts with H1. */
export function H2({ children, color, ...rest }: TypographyProps) {
  return (
    <Text bold color={color ?? "$accent"} {...rest}>
      {children}
    </Text>
  )
}

/** Group heading — $primary, not bold. Same hue as H1 but lighter weight. */
export function H3({ children, color, ...rest }: TypographyProps) {
  return (
    <Text color={color ?? "$primary"} {...rest}>
      {children}
    </Text>
  )
}

// ============================================================================
// Body Text
// ============================================================================

/** Paragraph — plain body text. Inherits foreground from parent. */
export function P({ children, color, ...rest }: TypographyProps) {
  return (
    <Text color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Introductory/lead text — $muted + italic. Slightly elevated, slightly receded. */
export function Lead({ children, color, ...rest }: TypographyProps) {
  return (
    <Text italic color={color ?? "$muted"} {...rest}>
      {children}
    </Text>
  )
}

/** Secondary/supporting text — $muted. Recedes from body text. */
export function Muted({ children, color, ...rest }: TypographyProps) {
  return (
    <Text color={color ?? "$muted"} {...rest}>
      {children}
    </Text>
  )
}

/** Fine print — $muted + dim. Captions, footnotes, text that recedes even more than Muted. */
export function Small({ children, color, ...rest }: TypographyProps) {
  return (
    <Text dimColor color={color ?? "$muted"} {...rest}>
      {children}
    </Text>
  )
}

/** Bold emphasis — inline strong text. Inherits foreground from parent. */
export function Strong({ children, color, ...rest }: TypographyProps) {
  return (
    <Text bold color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Italic emphasis — inline emphasized text. Inherits foreground from parent. */
export function Em({ children, color, ...rest }: TypographyProps) {
  return (
    <Text italic color={color} {...rest}>
      {children}
    </Text>
  )
}

// ============================================================================
// Inline Elements
// ============================================================================

/** Inline code — $mutedbg background with padding. Inherits foreground from parent. */
export function Code({ children, color, ...rest }: TypographyProps) {
  return (
    <Text backgroundColor="$mutedbg" color={color} {...rest}>
      {` ${children} `}
    </Text>
  )
}

/** Keyboard shortcut badge — $mutedbg background + bold. Inherits foreground from parent. */
export function Kbd({ children, color, ...rest }: TypographyProps) {
  return (
    <Text backgroundColor="$mutedbg" bold color={color} {...rest}>
      {` ${children} `}
    </Text>
  )
}

// ============================================================================
// Block Elements
// ============================================================================

/** Blockquote — │ border in $muted + italic content. Wrapped text stays indented. */
export function Blockquote({ children, color }: TypographyProps) {
  return (
    <Box>
      <Text color={color ?? "$muted"}>│ </Text>
      <Box flexShrink={1}>
        <Text italic>{children}</Text>
      </Box>
    </Box>
  )
}

/** Code block — │ border in $border + monospace content. Distinct from Blockquote. */
export function CodeBlock({ children, color }: TypographyProps) {
  return (
    <Box>
      <Text color={color ?? "$border"}>│ </Text>
      <Box flexShrink={1}>
        <Text>{children}</Text>
      </Box>
    </Box>
  )
}

/** Horizontal rule — thin line across the available width. */
export function HR({ color, ...rest }: Omit<TypographyProps, "children">) {
  return (
    <Text color={color ?? "$border"} wrap="truncate" {...rest}>
      {"─".repeat(200)}
    </Text>
  )
}

// ============================================================================
// Lists
// ============================================================================

interface ListContextValue {
  level: number
  ordered: boolean
}

const ListContext = createContext<ListContextValue>({ level: 0, ordered: false })

/** Unordered list container. Nest inside another UL/OL for indented sub-lists. */
export function UL({ children }: TypographyProps) {
  const parent = useContext(ListContext)
  return (
    <ListContext.Provider value={{ level: parent.level + 1, ordered: false }}>
      <Box flexDirection="column">{children}</Box>
    </ListContext.Provider>
  )
}

/** Ordered list container. Auto-numbers LI children. Nest for sub-lists. */
export function OL({ children }: TypographyProps) {
  const parent = useContext(ListContext)
  let index = 0
  const numbered = Children.map(children, (child) => {
    if (isValidElement(child) && child.type === LI) {
      index++
      return cloneElement(child as React.ReactElement<{ _index?: number }>, { _index: index })
    }
    return child
  })
  return (
    <ListContext.Provider value={{ level: parent.level + 1, ordered: true }}>
      <Box flexDirection="column">{numbered}</Box>
    </ListContext.Provider>
  )
}

const BULLETS = ["•", "◦", "▸", "-"]

/** List item with hanging indent. Use inside UL or OL. 2-char marker (bullet + space). */
export function LI({ children, color, _index }: TypographyProps & { _index?: number }) {
  const { level, ordered } = useContext(ListContext)
  const effectiveLevel = Math.max(level, 1)
  const indent = "  ".repeat(effectiveLevel - 1)
  const bullet = BULLETS[Math.min(effectiveLevel - 1, BULLETS.length - 1)]
  const marker = ordered && _index != null ? `${_index}. ` : `${bullet} `

  return (
    <Box>
      <Text color={color ?? "$muted"}>
        {indent}
        {marker}
      </Text>
      <Box flexShrink={1}>
        <Text color={color}>{children}</Text>
      </Box>
    </Box>
  )
}
