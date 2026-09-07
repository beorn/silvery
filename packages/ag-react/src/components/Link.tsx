/**
 * Link Component — URLs and App Actions
 *
 * Renders clickable text that brightens and underlines on plain hover. When `href`
 * is present, Link also paints an OSC 8 terminal hyperlink; action-only links
 * omit `href` and leave activation entirely to `onClick`.
 *
 * Activation policy is derived from semantic role: content hyperlinks arm on
 * Cmd+hover, while app controls arm on plain hover. Foreground hover does not
 * change activation, cursor policy, or an explicit caller underline choice.
 *
 * A revealed URL click emits `"link:open"` through the app event chain. App-owned
 * actions run their `onClick` handler without emitting a destination.
 *
 * @example
 * ```tsx
 * <Link href="https://example.com">Visit Example</Link>
 * <Link onClick={() => navigate()}>Action-only control</Link>
 * ```
 */

import { type ReactNode, useCallback, useContext } from "react"
import { textPair, type InteractionRole } from "@silvery/ag"
import type { TextProps } from "./Text"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { Text } from "./Text"
import { useInteractionTreatment } from "../hooks/useInteractionTreatment"
import { ChainAppContext } from "../context"

// ============================================================================
// Props
// ============================================================================

interface LinkSharedProps extends Omit<TextProps, "children" | "onClick"> {
  /** Link text content */
  children?: ReactNode
  /** Semantic role. Omit to derive content-link from href, control otherwise. */
  role?: InteractionRole
  /** Foreground used while hovered, independently of the activation gesture. */
  revealColor?: TextProps["color"]
}

/** A URL link may also intercept activation; an action-only link must handle it. */
export type LinkProps = LinkSharedProps &
  (
    | { href: string; onClick?: TextProps["onClick"] }
    | { href?: undefined; onClick: NonNullable<TextProps["onClick"]> }
  )

// ============================================================================
// Component
// ============================================================================

export function Link({
  href,
  children,
  color = "$fg-link",
  role = href === undefined ? "control" : "content-link",
  revealColor = "$fg-link-hover",
  underline,
  onClick,
  onMouseEnter,
  onMouseLeave,
  ...rest
}: LinkProps) {
  const chain = useContext(ChainAppContext)
  const interaction = useInteractionTreatment(role, textPair(color, revealColor))
  const handleClick = useCallback(
    (event: SilveryMouseEvent) => {
      const isRevealed = interaction.isRevealActive || (role === "content-link" && event.metaKey)
      onClick?.(event)
      if (isRevealed && href !== undefined && !event.defaultPrevented) {
        chain?.events.emit("link:open", href)
        event.preventDefault()
      }
    },
    [interaction.isRevealActive, role, href, onClick, chain],
  )

  return (
    <Text
      // Empty string is the explicit "no destination" value: it blocks
      // hyperlink inheritance while remaining falsey to OSC 8 emission.
      internal_hyperlink={href ?? ""}
      {...rest}
      color={interaction.isHovered ? revealColor : interaction.treatment.color}
      underline={underline ?? interaction.isHovered}
      mouseCursor={interaction.treatment.mouseCursor}
      onClick={handleClick}
      onMouseEnter={(event) => {
        interaction.onMouseEnter(event)
        onMouseEnter?.(event)
      }}
      onMouseLeave={(event) => {
        interaction.onMouseLeave(event)
        onMouseLeave?.(event)
      }}
    >
      {children}
    </Text>
  )
}
