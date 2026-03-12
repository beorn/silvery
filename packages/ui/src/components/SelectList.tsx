/**
 * SelectList Component
 *
 * A keyboard-navigable single-select list. Supports controlled and uncontrolled modes.
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
import { useInput } from "@silvery/react/hooks/useInput"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

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
  /** Called when highlight changes (controlled mode) */
  onHighlight?: (index: number) => void
  /** Called when user confirms selection (Enter) */
  onSelect?: (option: SelectOption, index: number) => void
  /** Initial index for uncontrolled mode */
  initialIndex?: number
  /** Max visible items (rest scrolled) */
  maxVisible?: number
  /** Whether this list captures input (default: true) */
  isActive?: boolean
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

  // All items disabled; stay put
  return current
}

function findFirstEnabled(items: SelectOption[]): number {
  for (let i = 0; i < items.length; i++) {
    if (!items[i]!.disabled) return i
  }
  return 0
}

function findLastEnabled(items: SelectOption[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
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
}: SelectListProps): React.ReactElement {
  const isControlled = controlledIndex !== undefined

  const [uncontrolledIndex, setUncontrolledIndex] = useState(
    initialIndex ?? findFirstEnabled(items),
  )

  const currentIndex = isControlled ? controlledIndex : uncontrolledIndex

  const setIndex = useCallback(
    (index: number) => {
      if (!isControlled) {
        setUncontrolledIndex(index)
      }
      onHighlight?.(index)
    },
    [isControlled, onHighlight],
  )

  useInput(
    (input, key) => {
      if (items.length === 0) return

      if (key.upArrow || input === "k") {
        setIndex(findNextEnabled(items, currentIndex, -1))
        return
      }

      if (key.downArrow || input === "j") {
        setIndex(findNextEnabled(items, currentIndex, 1))
        return
      }

      if (key.return) {
        const item = items[currentIndex]
        if (item && !item.disabled) {
          onSelect?.(item, currentIndex)
        }
        return
      }

      // Home: Ctrl+A
      if (key.ctrl && input === "a") {
        setIndex(findFirstEnabled(items))
        return
      }

      // End: Ctrl+E
      if (key.ctrl && input === "e") {
        setIndex(findLastEnabled(items))
        return
      }
    },
    { isActive },
  )

  // Compute visible window
  const showAll = !maxVisible || items.length <= maxVisible
  let startIdx = 0
  let visibleItems = items

  if (!showAll) {
    // Center the highlighted item in the visible window
    const half = Math.floor(maxVisible / 2)
    startIdx = Math.max(0, Math.min(currentIndex - half, items.length - maxVisible))
    visibleItems = items.slice(startIdx, startIdx + maxVisible)
  }

  return (
    <Box flexDirection="column">
      {visibleItems.map((item, i) => {
        const actualIndex = showAll ? i : startIdx + i
        const isHighlighted = actualIndex === currentIndex

        return (
          <Text key={item.value} inverse={isHighlighted} dimColor={item.disabled}>
            {isHighlighted ? "▸ " : "  "}
            {item.label}
          </Text>
        )
      })}
    </Box>
  )
}
