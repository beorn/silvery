/**
 * React Select component for silvery/Ink TUI apps
 *
 * Single-choice selection list with keyboard navigation.
 */

import React, { useState, useEffect, useCallback } from "react"
import type { SelectProps, SelectOption } from "../types.js"

/**
 * Scrollable single-choice selection list
 *
 * @example
 * ```tsx
 * import { Select } from "@silvery/ui/input";
 *
 * function SettingsView() {
 *   const [theme, setTheme] = useState("light");
 *
 *   return (
 *     <Select
 *       options={[
 *         { label: "Light", value: "light" },
 *         { label: "Dark", value: "dark" },
 *         { label: "System", value: "system" },
 *       ]}
 *       value={theme}
 *       onChange={setTheme}
 *     />
 *   );
 * }
 * ```
 */
export function Select<T>({
  options,
  value,
  onChange,
  maxVisible = 10,
  highlightIndex: controlledHighlightIndex,
  onHighlightChange,
}: SelectProps<T>): React.ReactElement {
  // Find the index of the currently selected value
  const selectedIndex = options.findIndex((opt) => opt.value === value)

  // Internal highlight state (for uncontrolled mode)
  const [internalHighlightIndex, setInternalHighlightIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : 0,
  )

  // Use controlled or internal highlight index
  const highlightIndex = controlledHighlightIndex ?? internalHighlightIndex

  // Calculate scroll window
  const scrollOffset = Math.max(
    0,
    Math.min(highlightIndex - Math.floor(maxVisible / 2), options.length - maxVisible),
  )
  const visibleOptions = options.slice(scrollOffset, scrollOffset + maxVisible)
  const hasMoreAbove = scrollOffset > 0
  const hasMoreBelow = scrollOffset + maxVisible < options.length

  // Sync internal highlight when value changes externally
  useEffect(() => {
    if (controlledHighlightIndex === undefined && selectedIndex >= 0) {
      setInternalHighlightIndex(selectedIndex)
    }
  }, [selectedIndex, controlledHighlightIndex])

  return (
    <div data-silvery-select>
      {hasMoreAbove && <div data-silvery-select-scroll-indicator="up">...</div>}
      {visibleOptions.map((option, visibleIdx) => {
        const actualIndex = scrollOffset + visibleIdx
        const isSelected = option.value === value
        const isHighlighted = actualIndex === highlightIndex

        return (
          <div
            key={actualIndex}
            data-silvery-select-option
            data-selected={isSelected}
            data-highlighted={isHighlighted}
          >
            <span data-silvery-select-indicator>{isSelected ? ">" : " "}</span>
            <span data-silvery-select-label>{option.label}</span>
          </div>
        )
      })}
      {hasMoreBelow && <div data-silvery-select-scroll-indicator="down">...</div>}
    </div>
  )
}

/**
 * Hook for managing select state with keyboard navigation
 *
 * @example
 * ```tsx
 * function MySelect() {
 *   const options = [
 *     { label: "Option A", value: "a" },
 *     { label: "Option B", value: "b" },
 *   ];
 *
 *   const { highlightIndex, moveUp, moveDown, select, value } = useSelect({
 *     options,
 *     initialValue: "a",
 *   });
 *
 *   useInput((input, key) => {
 *     if (key.upArrow) moveUp();
 *     if (key.downArrow) moveDown();
 *     if (key.return) select();
 *   });
 *
 *   return <Select options={options} value={value} highlightIndex={highlightIndex} />;
 * }
 * ```
 */
export function useSelect<T>({
  options,
  initialValue,
  onChange,
}: {
  options: SelectOption<T>[]
  initialValue?: T
  onChange?: (value: T) => void
}): {
  value: T | undefined
  highlightIndex: number
  moveUp: () => void
  moveDown: () => void
  select: () => void
  setHighlightIndex: (index: number) => void
} {
  const initialIndex =
    initialValue !== undefined ? options.findIndex((opt) => opt.value === initialValue) : 0

  const [highlightIndex, setHighlightIndex] = useState(Math.max(0, initialIndex))
  const [value, setValue] = useState<T | undefined>(initialValue)

  const moveUp = useCallback(() => {
    setHighlightIndex((i) => Math.max(0, i - 1))
  }, [])

  const moveDown = useCallback(() => {
    setHighlightIndex((i) => Math.min(options.length - 1, i + 1))
  }, [options.length])

  const select = useCallback(() => {
    const option = options[highlightIndex]
    if (option) {
      setValue(option.value)
      onChange?.(option.value)
    }
  }, [highlightIndex, options, onChange])

  return {
    value,
    highlightIndex,
    moveUp,
    moveDown,
    select,
    setHighlightIndex,
  }
}
