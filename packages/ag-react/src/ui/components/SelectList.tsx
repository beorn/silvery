/**
 * SelectList Component
 *
 * A keyboard-navigable single-select list. Thin composition over ListView
 * that adds disabled-item skipping, indicator styling, and onChange shorthand.
 *
 * Inherits from ListView: keyboard nav (j/k, arrows, PgUp/PgDn, Home/End, G),
 * mouse wheel, virtualised scrolling, cache, and search.
 *
 * Usage:
 * ```tsx
 * const items = [
 *   { label: "Apple", value: "apple" },
 *   { label: "Banana", value: "banana" },
 *   { label: "Cherry", value: "cherry", disabled: true },
 * ]
 *
 * <SelectList items={items} onSelect={(opt) => console.log(opt.value)} />
 * ```
 */
import React, { useCallback, useState } from "react"
import { Text } from "@silvery/ag-react/components/Text"
import { ListView } from "./ListView"

// =============================================================================
// Types
// =============================================================================

export interface SelectOption {
  label: string
  value: string
  disabled?: boolean
}

export interface SelectListProps {
  /** List of options */
  items: SelectOption[]
  /** Controlled: current highlighted index */
  highlightedIndex?: number
  /** Called when highlight changes */
  onHighlight?: (index: number) => void
  /** Called when user confirms selection (Enter) */
  onSelect?: (option: SelectOption, index: number) => void
  /** Initial index for uncontrolled mode */
  initialIndex?: number
  /** Max visible items (rest scrolled) */
  maxVisible?: number
  /** Whether this list captures input (default: true) */
  isActive?: boolean
  /** Selection indicator prefix shown on highlighted item (default: "▸ "). Non-highlighted items get equal-width spaces. Pass "" to hide. */
  indicator?: string
}

// =============================================================================
// Helpers
// =============================================================================

function findNextEnabled(items: SelectOption[], current: number, direction: 1 | -1): number {
  const len = items.length
  if (len === 0) return current

  let next = current + direction
  for (let i = 0; i < len; i++) {
    if (next < 0) next = len - 1
    if (next >= len) next = 0
    if (!items[next]!.disabled) return next
    next += direction
  }

  return current
}

function findFirstEnabled(items: SelectOption[]): number {
  for (let i = 0; i < items.length; i++) {
    if (!items[i]!.disabled) return i
  }
  return 0
}

// =============================================================================
// Component
// =============================================================================

export function SelectList({
  items,
  highlightedIndex: controlledIndex,
  onHighlight,
  onSelect,
  initialIndex,
  maxVisible,
  isActive = true,
  indicator = "▸ ",
}: SelectListProps): React.ReactElement {
  // SelectList always controls ListView's cursor (for disabled-item skipping).
  // In uncontrolled mode, internal state tracks the cursor; in controlled mode,
  // the parent's highlightedIndex is the source of truth.
  const isControlled = controlledIndex !== undefined
  const [uncontrolledIndex, setUncontrolledIndex] = useState(initialIndex ?? findFirstEnabled(items))
  const currentIndex = isControlled ? controlledIndex : uncontrolledIndex

  const setIndex = useCallback(
    (index: number) => {
      if (!isControlled) setUncontrolledIndex(index)
      onHighlight?.(index)
    },
    [isControlled, onHighlight],
  )

  // Intercept cursor moves to skip disabled items
  const handleCursor = useCallback(
    (nextIndex: number) => {
      const item = items[nextIndex]
      if (item?.disabled) {
        const direction = nextIndex >= currentIndex ? 1 : -1
        setIndex(findNextEnabled(items, currentIndex, direction as 1 | -1))
      } else {
        setIndex(nextIndex)
      }
    },
    [items, currentIndex, setIndex],
  )

  // Intercept Enter to block selection of disabled items
  const handleSelect = useCallback(
    (index: number) => {
      const item = items[index]
      if (item && !item.disabled) {
        onSelect?.(item, index)
      }
    },
    [items, onSelect],
  )

  const renderItem = useCallback(
    (item: SelectOption, _index: number, meta: { isCursor: boolean }) => (
      <Text key={item.value} inverse={meta.isCursor} dimColor={item.disabled}>
        {indicator ? (meta.isCursor ? indicator : " ".repeat(indicator.length)) : ""}
        {item.label}
      </Text>
    ),
    [indicator],
  )

  return (
    <ListView
      items={items}
      height={maxVisible ?? items.length}
      estimateHeight={1}
      nav
      cursorKey={currentIndex}
      onCursor={handleCursor}
      onSelect={handleSelect}
      active={isActive}
      getKey={(item) => item.value}
      renderItem={renderItem}
    />
  )
}
