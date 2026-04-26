/**
 * SchemeList — left pane.
 *
 * Renders the 84 built-in color schemes as a scrollable SelectList. Selecting
 * a scheme rethemes the whole app (ThemeProvider at the root).
 *
 * MVP navigation: Tab / Shift-Tab (or j/k when the left pane is focused) cycle
 * the highlighted scheme. Enter confirms (no-op — selection is already live).
 */

import React, { useMemo } from "react"
import { Box, Text, Muted, SelectList, type SelectOption } from "silvery"

export interface SchemeListProps {
  schemes: readonly string[]
  selectedIndex: number
  onSelect: (index: number) => void
  focused: boolean
}

export function SchemeList({
  schemes,
  selectedIndex,
  onSelect,
  focused,
}: SchemeListProps): React.ReactElement {
  // Pane is width=22 (1 border + 1 padding + 2 indicator + label + 1 padding + 1 border).
  // That leaves 16 columns for the label. Truncate longer names with a middle ellipsis
  // so prefix + suffix stay readable instead of wrapping into the next row.
  const MAX_LABEL = 16
  const truncate = (name: string): string => {
    if (name.length <= MAX_LABEL) return name
    const head = Math.ceil((MAX_LABEL - 1) / 2)
    const tail = Math.floor((MAX_LABEL - 1) / 2)
    return `${name.slice(0, head)}…${name.slice(name.length - tail)}`
  }
  const items: SelectOption[] = useMemo(
    () => schemes.map((name) => ({ label: truncate(name), value: name })),
    [schemes],
  )

  // maxVisible is computed from the container height at render time.
  // Fallback for very small terminals: show at least 10.
  return (
    <Box
      flexDirection="column"
      width={22}
      borderStyle="single"
      borderColor={focused ? "$fg-accent" : "$border-default"}
      userSelect="contain"
    >
      <Box paddingX={1}>
        <Text bold color="$fg-accent">
          SCHEMES
        </Text>
      </Box>
      <Box paddingX={1}>
        <Muted>{schemes.length} palettes</Muted>
      </Box>
      <Box paddingX={1} flexGrow={1} overflow="hidden">
        <SelectList
          items={items}
          highlightedIndex={selectedIndex}
          onHighlight={onSelect}
          isActive={focused}
          indicator="▸ "
        />
      </Box>
    </Box>
  )
}
