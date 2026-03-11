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
 * ```
 */
import type { ReactNode } from "react"
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
