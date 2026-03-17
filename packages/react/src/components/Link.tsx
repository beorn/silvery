/**
 * Link Component — OSC 8 Terminal Hyperlinks
 *
 * Renders clickable hyperlinks using the OSC 8 terminal escape sequence.
 * Text inside `<Link>` is underlined by default and wrapped in OSC 8 sequences,
 * making it clickable in supporting terminals (iTerm2, Ghostty, Kitty, etc.).
 *
 * Supports Cmd+hover armed state: when the user hovers over a link while
 * holding Cmd (Super), the link shows an underline. Only the hovered link
 * subscribes to modifier state, so this is O(1) regardless of link count.
 *
 * On Cmd+click, emits a `"link:open"` event via RuntimeContext. The app
 * handles the actual URL opening (keeps silvery runtime-agnostic).
 *
 * @example
 * ```tsx
 * <Link href="https://example.com">Visit Example</Link>
 * <Link href="https://example.com" color="blue">Blue Link</Link>
 * <Link href="km://node/abc123" onClick={(e) => navigate(e)}>Internal Link</Link>
 * ```
 */

import { type ReactNode, useCallback, useContext, useState } from "react"
import type { TextProps } from "./Text"
import type { SilveryMouseEvent } from "@silvery/term/mouse-events"
import { Text } from "./Text"
import { useModifierKeys } from "../hooks/useModifierKeys"
import { useMouseCursor } from "../hooks/useMouseCursor"
import { RuntimeContext } from "../context"

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

export interface LinkProps extends Omit<TextProps, "children"> {
  /** The URL to link to (http/https for external, custom schemes for internal) */
  href: string
  /** Link text content */
  children?: ReactNode
}

// ============================================================================
// Component
// ============================================================================

/**
 * Renders a terminal hyperlink using OSC 8 escape sequences.
 *
 * The text is wrapped in OSC 8 open/close sequences so supporting terminals
 * render it as a clickable link. The component also registers an onClick
 * handler for mouse-driven interaction within silvery.
 *
 * Supports Cmd+hover armed state: when hovered and Cmd is held, shows underline.
 * Only the hovered link subscribes to modifier keys — zero cost for others.
 */
export function Link({ href, children, color = "$link", onClick, onMouseEnter, onMouseLeave, ...rest }: LinkProps) {
  const [hovered, setHovered] = useState(false)
  const rt = useContext(RuntimeContext)
  // Only subscribe to modifiers when hovered — zero cost for non-hovered links
  const { super: cmdHeld } = useModifierKeys({ enabled: hovered })
  // Cmd+hover → underline as hover feedback (overrides even explicit underline={false})
  const armed = hovered && cmdHeld
  if (armed) rest.underline = true
  // Pointer cursor when armed (Cmd+hover)
  useMouseCursor(armed ? "pointer" : null)

  // Cmd+click emits "link:open" event for the app to handle (keeps silvery runtime-agnostic)
  const handleClick = useCallback(
    (e: SilveryMouseEvent) => {
      if (armed) {
        rt?.emit("link:open", href)
        e.preventDefault()
      }
      onClick?.(e)
    },
    [armed, href, onClick, rt],
  )

  return (
    <Text
      color={color}
      {...rest}
      onClick={handleClick}
      onMouseEnter={(e: SilveryMouseEvent) => {
        setHovered(true)
        onMouseEnter?.(e)
      }}
      onMouseLeave={(e: SilveryMouseEvent) => {
        setHovered(false)
        onMouseLeave?.(e)
      }}
    >
      {osc8Open(href)}
      {children}
      {OSC8_CLOSE}
    </Text>
  )
}
