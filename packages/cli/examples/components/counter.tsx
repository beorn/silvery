/**
 * Counter — Interactive state with useInput
 *
 * The "Hello World" of interactive TUIs: a counter you
 * increment/decrement with j/k.
 *
 * Usage: bun examples/components/counter.tsx
 */

import React, { useState } from "react"
import { Box, Text } from "../../src/index.js"
import { run, useInput } from "@silvery/ag-term/runtime"

function Counter() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "j" || key.downArrow) setCount((c) => c + 1)
    if (input === "k" || key.upArrow) setCount((c) => c - 1)
    if (input === "r") setCount(0)
    if (input === "q" || key.escape) return "exit"
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box gap={1}>
        <Text>Count:</Text>
        <Text bold color={count >= 0 ? "$success" : "$error"}>
          {count}
        </Text>
      </Box>
      <Text color="$muted">j/k: +/- r: reset q: quit</Text>
    </Box>
  )
}

export const meta = {
  name: "Counter",
  description: "Interactive counter with useState + useInput",
}

if (import.meta.main) {
  const handle = await run(<Counter />)
  await handle.waitUntilExit()
}
