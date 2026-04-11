/**
 * ListView — Efficient scrollable list
 *
 * Renders 200 items but only materializes visible rows.
 * Built-in j/k navigation, page up/down, Home/End.
 *
 * Usage: bun examples/components/virtual-list.tsx
 */

import React from "react"
import { Box, Text, ListView } from "silvery"
import { run, useInput } from "silvery/runtime"

const items = Array.from({ length: 200 }, (_, i) => ({
  id: i,
  name: `Item ${i + 1}`,
}))

function ListViewDemo() {
  useInput((input, key) => {
    if (input === "q" || key.escape) return "exit"
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold>200 items (virtualized)</Text>
      <ListView
        items={items}
        height={12}
        estimateHeight={1}
        nav
        renderItem={(item, _index, meta) => (
          <Text key={item.id} color={meta.isCursor ? "$primary" : undefined} bold={meta.isCursor}>
            {meta.isCursor ? "> " : "  "}
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

export async function main() {
  const handle = await run(<ListViewDemo />)
  await handle.waitUntilExit()
}

if (import.meta.main) {
  await main()
}
