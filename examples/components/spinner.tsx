/**
 * Spinner — Animated loading indicators
 *
 * Shows all four built-in spinner styles side by side.
 *
 * Usage: bun examples/components/spinner.tsx
 */

import React from "react"
import { Box, Text, Spinner } from "silvery"
import { run, useInput } from "silvery/runtime"

function SpinnerDemo() {
  useInput((input, key) => {
    if (input === "q" || key.escape) return "exit"
  })

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold>Spinner Styles</Text>
      <Box flexDirection="column">
        <Spinner type="dots" label="Loading packages..." />
        <Spinner type="line" label="Compiling..." />
        <Spinner type="arc" label="Optimizing..." />
        <Spinner type="bounce" label="Connecting..." />
      </Box>
      <Text color="$muted">q: quit</Text>
    </Box>
  )
}

export const meta = {
  name: "Spinner",
  description: "Four animated loading spinner styles",
}

export async function main() {
  const handle = await run(<SpinnerDemo />)
  await handle.waitUntilExit()
}

if (import.meta.main) {
  await main()
}
