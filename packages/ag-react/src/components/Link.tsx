/**
 * Link Component — OSC 8 Terminal Hyperlinks
 *
 * Renders clickable hyperlinks using the OSC 8 terminal escape sequence.
 * Text inside `<Link>` is underlined by default and wrapped in OSC 8 sequences,
 * making it clickable in supporting terminals (iTerm2, Ghostty, Kitty, etc.).
 *
 * Two arming variants:
 * - `arm-on-cmd-hover` (default): Arms on Cmd+hover (Kitty protocol) or Ctrl+click (SGR)
 * - `arm-on-hover`: Arms on plain hover (no modifier needed)
 *
 * On click (when armed), emits a `"link:open"` event via RuntimeContext. The app
 * handles the actual URL opening (keeps silvery runtime-agnostic).
 *
 * @example
 * ```tsx
 * <Link href="https://example.com">Visit Example</Link>
 * <Link href="https://example.com" variant="arm-on-hover">Always Clickable</Link>
 * <Link href="km://node/abc123" onClick={(e) => navigate(e)}>Internal Link</Link>
 * ```
 */

import { type ReactNode, useCallback, useContext, useState } from "react"
import type { TextProps } from "./Text"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { Text } from "./Text"
import { useModifierKeys } from "../hooks/useModifierKeys"
import { useMouseCursor } from "../hooks/useMouseCursor"
import { ChainAppContext } from "../context"

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
  /**
   * How the link arms (shows underline + pointer cursor):
   * - `'arm-on-cmd-hover'` (default): Arms when hovered while holding Cmd/Super
   * - `'arm-on-hover'`: Arms on plain hover (no modifier needed)
   */
  variant?: "arm-on-cmd-hover" | "arm-on-hover"
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
export function Link({
  href,
  children,
  color = "$link",
  variant = "arm-on-cmd-hover",
  onClick,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: LinkProps) {
  const [hovered, setHovered] = useState(false)
  const chain = useContext(ChainAppContext)
  // Only subscribe to modifiers when hovered and variant needs it — zero cost for non-hovered links
  const needsModifier = variant === "arm-on-cmd-hover"
  const { super: cmdHeld } = useModifierKeys({ enabled: hovered && needsModifier })
  // Determine armed state based on variant
  const armed = hovered && (needsModifier ? cmdHeld : true)
  if (armed) rest.underline = true
  // Pointer cursor when armed
  useMouseCursor(armed ? "pointer" : null)

  // Click emits "link:open" when armed. For arm-on-cmd-hover, e.metaKey is accurate
  // thanks to keyboard modifier tracking merged into mouse events by silvery's runtime.
  const handleClick = useCallback(
    (e: SilveryMouseEvent) => {
      const isArmed = armed || (needsModifier && hovered && e.metaKey)
      if (isArmed) {
        chain?.events.emit("link:open", href)
        e.preventDefault()
      }
      onClick?.(e)
    },
    [armed, needsModifier, hovered, href, onClick, chain],
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
