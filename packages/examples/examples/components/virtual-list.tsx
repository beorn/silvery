/**
 * VirtualList — Efficient scrollable list
 *
 * Renders 200 items but only materializes visible rows.
 * Built-in j/k navigation, page up/down, Home/End.
 *
 * Usage: bun examples/components/virtual-list.tsx
 */

import React from "react"
import { Box, Text, VirtualList } from "silvery"
import { run, useInput } from "silvery/runtime"

const items = Array.from({ length: 200 }, (_, i) => ({
  id: i,
  name: `Item ${i + 1}`,
}))

function VirtualListDemo() {
  useInput((input, key) => {
    if (input === "q" || key.escape) return "exit"
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold>200 items (virtualized)</Text>
      <VirtualList
        items={items}
        height={12}
        itemHeight={1}
        interactive
        renderItem={(item, _index, meta) => (
          <Text key={item.id} color={meta?.isSelected ? "$primary" : undefined} bold={meta?.isSelected}>
            {meta?.isSelected ? "> " : "  "}
            {item.name}
          </Text>
        )}
      />
      <Text color="$muted">j/k: navigate q: quit</Text>
    </Box>
  )
}

export const meta = {
  name: "Virtual List",
  description: "Efficient scrollable list with 200 virtualized items",
}

if (import.meta.main) {
  const handle = await run(<VirtualListDemo />)
  await handle.waitUntilExit()
}
