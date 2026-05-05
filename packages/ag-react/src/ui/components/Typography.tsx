/**
 * Typography Preset Components
 *
 * Semantic text hierarchy for TUIs. Since terminals can't vary font size,
 * these presets use color + bold/dim/italic to create clear visual levels.
 *
 * All components accept an optional `color` prop to override the default.
 * Headings default to semantic theme colors; pass a custom color for
 * panel differentiation (e.g., <H1 color="$fg-success">Panel A</H1>).
 *
 * ## Color inheritance
 *
 * Body-text components (P, Strong, Em, H3) inherit foreground color from
 * the nearest ancestor Box with a `color` or `theme` prop — just like CSS.
 * They do NOT hardcode `$fg`, so `<Box color="$fg-error"><P>red text</P></Box>` works.
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
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import type { TextProps } from "../../components/Text"

export interface TypographyProps extends Omit<TextProps, "children"> {
  children?: ReactNode
}

// ============================================================================
// Headings
// ============================================================================

/** Page title — $fg-accent + bold. Maximum emphasis. */
export function H1({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="h1" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Section heading — $fg-accent + bold. Contrasts with H1. */
export function H2({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="h2" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Group heading — bold, no color override. Same hue as theme's primary but no bold means lighter weight than H1. */
export function H3({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="h3" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Sub-group heading — bold + $fg-muted. Recedes from H3. */
export function H4({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="h4" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Minor heading — italic + $fg-muted. A step further down the hierarchy. */
export function H5({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="h5" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Deepest heading — $fg-muted + dim. Minimum weight before body text. */
export function H6({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="h6" color={color} {...rest}>
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
    <Text variant="body" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Introductory/lead text — $fg-muted + italic. Slightly elevated, slightly receded. */
export function Lead({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="body-muted" italic color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Secondary/supporting text — $fg-muted. Recedes from body text. */
export function Muted({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="body-muted" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Fine print — $fg-muted + dim. Captions, footnotes, text that recedes even more than Muted. */
export function Small({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="fine-print" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Bold emphasis — inline strong text. Inherits foreground from parent. */
export function Strong({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="strong" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Italic emphasis — inline emphasized text. Inherits foreground from parent. */
export function Em({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="em" color={color} {...rest}>
      {children}
    </Text>
  )
}

// ============================================================================
// Inline Elements
// ============================================================================

/** Inline code — $bg-muted background with padding. Inherits foreground from parent. */
export function Code({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="code" color={color} {...rest}>
      {` ${children} `}
    </Text>
  )
}

/** Keyboard shortcut badge — $bg-muted background + bold. Inherits foreground from parent. */
export function Kbd({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="kbd" color={color} {...rest}>
      {` ${children} `}
    </Text>
  )
}

// ============================================================================
// Block Elements
// ============================================================================

/** Blockquote — `│` prefix in `$fg-muted` plus italic muted body. The
 * left bar is the conventional markdown quote indicator and lets wrapped
 * lines stay visually nested under the same prefix. */
export function Blockquote({ children, color }: TypographyProps) {
  const muted = color ?? "$fg-muted"
  return (
    <Box>
      <Text color={muted}>│ </Text>
      <Box flexShrink={1}>
        <Text color={muted} italic wrap="wrap">
          {children}
        </Text>
      </Box>
    </Box>
  )
}

/** Code block — │ border in $border-default + monospace content. Distinct from Blockquote. */
export function CodeBlock({ children, color }: TypographyProps) {
  return (
    <Box>
      <Text color={color ?? "$border-default"}>│ </Text>
      <Box flexShrink={1}>
        <Text>{children}</Text>
      </Box>
    </Box>
  )
}

/** Horizontal rule — thin line across the available width. */
export function HR({ color, ...rest }: Omit<TypographyProps, "children">) {
  return (
    <Text color={color ?? "$border-default"} wrap="truncate" {...rest}>
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
      <Text color={color ?? "$fg-muted"}>
        {indent}
        {marker}
      </Text>
      <Box flexShrink={1}>
        <Text color={color}>{children}</Text>
      </Box>
    </Box>
  )
}
