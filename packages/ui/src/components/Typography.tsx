/**
 * Typography Preset Components
 *
 * Semantic text hierarchy for TUIs. Since terminals can't vary font size,
 * these presets use color + bold/dim/italic to create clear visual levels.
 *
 * Usage:
 * ```tsx
 * <H1>Settings</H1>           // $primary + bold
 * <H2>General</H2>             // $accent + bold
 * <H3>Appearance</H3>          // $fg + bold
 * <Muted>Requires restart</Muted>  // $muted
 * <Lead>Welcome to the app</Lead>  // italic
 * <Code>npm install silvery</Code>  // $mutedbg background
 * <Blockquote>Less is more.</Blockquote>  // │ border + italic
 * <P>Body text paragraph.</P>       // plain $fg
 * <LI>First item</LI>                // • bullet + indent
 * ```
 */
import type { ReactNode } from "react"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

export interface TypographyProps {
  children?: ReactNode
}

/** Page title — $primary + bold. Maximum emphasis. */
export function H1({ children }: TypographyProps) {
  return (
    <Text bold color="$primary">
      {children}
    </Text>
  )
}

/** Section heading — $accent + bold. Contrasts with H1. */
export function H2({ children }: TypographyProps) {
  return (
    <Text bold color="$accent">
      {children}
    </Text>
  )
}

/** Group heading — bold only. Stands out without accent color. */
export function H3({ children }: TypographyProps) {
  return <Text bold>{children}</Text>
}

/** Secondary/supporting text — $muted. Recedes from body text. */
export function Muted({ children }: TypographyProps) {
  return <Text color="$muted">{children}</Text>
}

/** Introductory/lead text — italic. Slightly elevated body text. */
export function Lead({ children }: TypographyProps) {
  return <Text italic>{children}</Text>
}

/** Inline code — $mutedbg background + monospace appearance. */
export function Code({ children }: TypographyProps) {
  return <Text backgroundColor="$mutedbg">{` ${children} `}</Text>
}

/** Blockquote — $muted border character + italic content. Wrapped text stays indented. */
export function Blockquote({ children }: TypographyProps) {
  return (
    <Box>
      <Text color="$muted">│ </Text>
      <Box flexShrink={1}>
        <Text italic>{children}</Text>
      </Box>
    </Box>
  )
}

/** Paragraph — plain body text with no special styling. Semantic wrapper for readability. */
export function P({ children }: TypographyProps) {
  return <Text>{children}</Text>
}

/** List item — bullet with hanging indent. Wrapped text aligns under content, not the bullet. */
export function LI({ children }: TypographyProps) {
  return (
    <Box>
      <Text> • </Text>
      <Box flexShrink={1}>
        <Text>{children}</Text>
      </Box>
    </Box>
  )
}
