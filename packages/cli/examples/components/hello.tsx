/**
 * Hello — The simplest silvery app
 *
 * Renders styled text and exits on any keypress.
 *
 * Usage: bun examples/components/hello.tsx
 */

import React from "react"
import { Box, Text } from "../../src/index.js"
import { run, useInput } from "@silvery/ag-term/runtime"

function Hello() {
  useInput(() => "exit" as const)

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="$primary">
        Hello, Silvery!
      </Text>
      <Text color="$muted">Press any key to exit.</Text>
    </Box>
  )
}

export const meta = {
  name: "Hello",
  description: "The simplest silvery app — styled text, exit on keypress",
}

if (import.meta.main) {
  const handle = await run(<Hello />)
  await handle.waitUntilExit()
}
