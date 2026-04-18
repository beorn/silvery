/**
 * PickerList Component
 *
 * Thin composition over ListView — scrolling result list with selection
 * highlighting. Extracted from PickerDialog so it can be composed
 * independently by callers that manage their own input (e.g., km-tui
 * command-system dialogs).
 *
 * Handles:
 * - Scroll offset calculation (centers selected item in view) — via ListView
 * - Visible items slicing — via ListView
 * - Empty state rendering
 * - Item rendering via renderItem callback
 *
 * Does NOT handle:
 * - Keyboard navigation (caller manages selectedIndex)
 * - Input/search (caller's responsibility)
 *
 * Usage:
 * ```tsx
 * <PickerList
 *   items={filteredResults}
 *   selectedIndex={selected}
 *   renderItem={(item, sel) => <Text inverse={sel}>{item.name}</Text>}
 *   getKey={(item) => item.id}
 * />
 * ```
 */
import React from "react"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { ListView } from "./ListView"

// =============================================================================
// Types
// =============================================================================

export interface PickerListProps<T> {
  /** Items to display */
  items: T[]
  /** Currently selected index (caller-managed) */
  selectedIndex: number
  /** Render function for each item. `selected` is true for the highlighted item. */
  renderItem: (item: T, selected: boolean) => React.ReactNode
  /** Unique key for each item */
  getKey: (item: T) => string
  /** Message when items list is empty (default: "No items") */
  emptyMessage?: string
  /** Maximum visible items before scrolling (default: 10) */
  maxVisible?: number
}

// =============================================================================
// Component
// =============================================================================

/**
 * Scrolling result list with selection highlighting.
 *
 * Delegates to ListView for virtualization, scroll offset, and viewport
 * management. When there are fewer items than maxVisible, all items are
 * shown without scrolling.
 */
export function PickerList<T>({
  items,
  selectedIndex,
  renderItem,
  getKey,
  emptyMessage = "No items",
  maxVisible = 10,
}: PickerListProps<T>): React.ReactElement {
  if (items.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
        <Text color="$muted">{emptyMessage}</Text>
      </Box>
    )
  }

  const clampedIndex = Math.min(selectedIndex, items.length - 1)
  const effectiveHeight = Math.min(maxVisible, items.length)

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
      <ListView
        items={items}
        height={effectiveHeight}
        nav
        active={false}
        cursorKey={clampedIndex}
        getKey={(item) => getKey(item)}
        renderItem={(item, _index, meta) => renderItem(item, meta.isCursor)}
      />
    </Box>
  )
}
