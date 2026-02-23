/**
 * Link Component — OSC 8 Terminal Hyperlinks
 *
 * Renders clickable hyperlinks using the OSC 8 terminal escape sequence.
 * Text inside `<Link>` is underlined by default and wrapped in OSC 8 sequences,
 * making it clickable in supporting terminals (iTerm2, Ghostty, Kitty, etc.).
 *
 * @example
 * ```tsx
 * <Link href="https://example.com">Visit Example</Link>
 * <Link href="https://example.com" color="blue">Blue Link</Link>
 * <Link href="km://node/abc123" onClick={(e) => navigate(e)}>Internal Link</Link>
 * ```
 */

import { type ReactNode } from "react"
import type { InkxMouseEvent } from "../mouse-events.js"
import { Text } from "./Text.js"

// ============================================================================
// OSC 8 Escape Sequences
// ============================================================================

/** Open an OSC 8 hyperlink. Format: ESC ] 8 ; params ; URI ST */
function osc8Open(href: string): string {
  return `\x1b]8;;${href}\x1b\\`
}

/** Close an OSC 8 hyperlink. Format: ESC ] 8 ; ; ST */
const OSC8_CLOSE = "\x1b]8;;\x1b\\"

// ============================================================================
// Props
// ============================================================================

export interface LinkProps {
  /** The URL to link to (http/https for external, custom schemes for internal) */
  href: string
  /** Link text content */
  children?: ReactNode
  /** Link text color (defaults to "blue") */
  color?: string
  /** Whether to underline the link text (defaults to true) */
  underline?: boolean
  /** Called when the link is clicked. Use preventDefault() to suppress default navigation. */
  onClick?: (event: InkxMouseEvent) => void
  /** Test ID for locator queries */
  testID?: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * Renders a terminal hyperlink using OSC 8 escape sequences.
 *
 * The text is wrapped in OSC 8 open/close sequences so supporting terminals
 * render it as a clickable link. The component also registers an onClick
 * handler for mouse-driven interaction within inkx.
 */
export function Link({ href, children, color = "blue", underline = true, onClick, testID }: LinkProps) {
  return (
    <Text color={color} underline={underline} onClick={onClick} testID={testID}>
      {osc8Open(href)}
      {children}
      {OSC8_CLOSE}
    </Text>
  )
}
