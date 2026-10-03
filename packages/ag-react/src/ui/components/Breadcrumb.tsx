/**
 * Breadcrumb Component
 *
 * Navigation breadcrumb trail with configurable separators.
 * Highlights the last item as the current/active page.
 *
 * Usage:
 * ```tsx
 * <Breadcrumb
 *   items={[
 *     { label: "Home" },
 *     { label: "Settings" },
 *     { label: "Profile" },
 *   ]}
 *   separator=">"
 * />
 * // Renders: Home > Settings > Profile
 * ```
 */
import React, { useContext, useId } from "react"
import { Box } from "../../components/Box"
import { Link } from "../../components/Link"
import { Text } from "../../components/Text"
import { useFocusable } from "../../hooks/useFocusable"
import { useInput } from "../../hooks/useInput"
import { ChainAppContext } from "../../context"

// =============================================================================
// Types
// =============================================================================

export interface BreadcrumbItem {
  /** Display label */
  label: string
  /** Optional destination exposed as a native terminal hyperlink. */
  href?: string
  /** Cross-platform activation callback for mouse, keyboard, or future pointer targets. */
  onPress?: () => void
  /** Optional separator rendered before this item. */
  separator?: string
  /** Optional per-item text color. */
  color?: string
  /** Optional foreground while the actionable item is hovered. */
  revealColor?: string
  /** Optional per-item emphasis override. */
  bold?: boolean
}

export interface BreadcrumbProps {
  /** Breadcrumb items (left to right) */
  items: BreadcrumbItem[]
  /** Separator character between items (default: "/") */
  separator?: string
  /** Separator spacing (default: readable spaces around the glyph). */
  separatorSpacing?: "spaced" | "compact"
  /** Separator foreground, independent from segment foreground. */
  separatorColor?: string
  /** Item rendered as the current location (default: the last item). */
  currentIndex?: number
}

// =============================================================================
// Component
// =============================================================================

/**
 * Horizontal breadcrumb trail.
 *
 * Renders items separated by a configurable separator character.
 * The last item is rendered in bold `$fg` as the current location;
 * preceding items are rendered in `$fg-muted`.
 */
function BreadcrumbItemInteraction({
  item,
  isCurrent,
}: {
  item: BreadcrumbItem
  isCurrent: boolean
}): React.ReactElement {
  const { focused } = useFocusable()
  const chain = useContext(ChainAppContext)
  const activate = (): void => {
    if (item.onPress) item.onPress()
    else if (item.href) chain?.events.emit("link:open", item.href)
  }

  useInput(
    (input, key) => {
      if (key.return || (input === " " && !key.ctrl && !key.meta && !key.shift)) {
        activate()
      }
    },
    { isActive: focused && (item.onPress !== undefined || item.href !== undefined) },
  )

  return (
    <Link
      href={item.href}
      role="control"
      revealColor={item.revealColor ?? "$fg"}
      onClick={(event) => {
        if (item.onPress !== undefined) {
          event.preventDefault()
          item.onPress()
        }
      }}
      inverse={focused}
      wrap="truncate"
      color={item.color ?? (isCurrent ? "$fg" : "$fg-muted")}
      bold={item.bold ?? isCurrent}
    >
      {item.label}
    </Link>
  )
}

function ActionableBreadcrumbItem({
  item,
  isCurrent,
}: {
  item: BreadcrumbItem
  isCurrent: boolean
}): React.ReactElement {
  const focusId = useId()
  return (
    <Box
      testID={focusId}
      focusable={item.onPress !== undefined || item.href !== undefined}
      mouseCursor="pointer"
      height={1}
      minWidth={1}
      flexShrink={1}
      overflow="hidden"
    >
      <BreadcrumbItemInteraction item={item} isCurrent={isCurrent} />
    </Box>
  )
}

export function Breadcrumb({
  items,
  separator = "/",
  separatorSpacing = "spaced",
  separatorColor = "$fg-muted",
  currentIndex = items.length - 1,
}: BreadcrumbProps): React.ReactElement {
  if (items.length === 0) {
    return <Box height={1} />
  }

  return (
    <Box height={1} minWidth={0} flexShrink={1} overflow="hidden">
      {items.map((item, i) => {
        const isCurrent = i === currentIndex
        const isActionable = item.href !== undefined || item.onPress !== undefined

        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <Text color={separatorColor} wrap="truncate">
                {separatorSpacing === "spaced" ? " " : ""}
                {item.separator ?? separator}
                {separatorSpacing === "spaced" ? " " : ""}
              </Text>
            )}
            {isActionable ? (
              <ActionableBreadcrumbItem item={item} isCurrent={isCurrent} />
            ) : (
              <Text
                color={item.color ?? (isCurrent ? "$fg" : "$fg-muted")}
                bold={item.bold ?? isCurrent}
                wrap="truncate"
              >
                {item.label}
              </Text>
            )}
          </React.Fragment>
        )
      })}
    </Box>
  )
}
