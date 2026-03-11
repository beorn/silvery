/**
 * PickerList Component
 *
 * Standalone scrolling result list with selection highlighting. Extracted from
 * PickerDialog so it can be composed independently by callers that manage their
 * own input (e.g., km-tui command-system dialogs).
 *
 * Handles:
 * - Scroll offset calculation (centers selected item in view)
 * - Visible items slicing
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
 *   keyExtractor={(item) => item.id}
 * />
 * ```
 */
import React from "react"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

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
  keyExtractor: (item: T) => string
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
 * Centers the selected item in the visible window. When there are fewer items
 * than maxVisible, all items are shown without scrolling.
 */
export function PickerList<T>({
  items,
  selectedIndex,
  renderItem,
  keyExtractor,
  emptyMessage = "No items",
  maxVisible = 10,
}: PickerListProps<T>): React.ReactElement {
  const clampedIndex = items.length > 0 ? Math.min(selectedIndex, items.length - 1) : 0
  const effectiveMaxVisible = Math.min(maxVisible, items.length)

  // Scroll offset: center the selected item in the visible window
  const scrollOffset =
    items.length > effectiveMaxVisible
      ? Math.max(0, Math.min(clampedIndex - Math.floor(effectiveMaxVisible / 2), items.length - effectiveMaxVisible))
      : 0

  const visibleItems = items.slice(scrollOffset, scrollOffset + effectiveMaxVisible)

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
      {items.length === 0 ? (
        <Text dimColor>{emptyMessage}</Text>
      ) : (
        visibleItems.map((item, i) => {
          const actualIndex = scrollOffset + i
          const isSelected = actualIndex === clampedIndex
          return <React.Fragment key={keyExtractor(item)}>{renderItem(item, isSelected)}</React.Fragment>
        })
      )}
    </Box>
  )
}
