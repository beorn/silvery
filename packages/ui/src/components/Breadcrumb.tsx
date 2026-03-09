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
import React from "react"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

// =============================================================================
// Types
// =============================================================================

export interface BreadcrumbItem {
  /** Display label */
  label: string
}

export interface BreadcrumbProps {
  /** Breadcrumb items (left to right) */
  items: BreadcrumbItem[]
  /** Separator character between items (default: "/") */
  separator?: string
}

// =============================================================================
// Component
// =============================================================================

/**
 * Horizontal breadcrumb trail.
 *
 * Renders items separated by a configurable separator character.
 * The last item is rendered in bold `$fg` as the current location;
 * preceding items are rendered in `$mutedfg`.
 */
export function Breadcrumb({ items, separator = "/" }: BreadcrumbProps): React.ReactElement {
  if (items.length === 0) {
    return <Box />
  }

  return (
    <Box>
      {items.map((item, i) => {
        const isLast = i === items.length - 1

        return (
          <React.Fragment key={i}>
            {i > 0 && <Text color="$disabledfg"> {separator} </Text>}
            <Text color={isLast ? "$fg" : "$mutedfg"} bold={isLast}>
              {item.label}
            </Text>
          </React.Fragment>
        )
      })}
    </Box>
  )
}
