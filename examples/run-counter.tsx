/**
 * Run Counter - Layer 2 Example
 *
 * Demonstrates run() with React hooks (useState, useEffect)
 * and useRuntimeInput for keyboard handling.
 *
 * This is the simplest way to build an interactive TUI app.
 *
 * Usage: bun examples/run-counter.tsx
 *
 * Controls:
 *   j/k - Increment/decrement counter
 *   r   - Reset to 0
 *   q   - Quit
 */

import React, { useState, useCallback } from "react"
import { Box, Text } from "../src/index.js"
import { run, useInput } from "../src/runtime/index.js"

function Counter() {
  const [count, setCount] = useState(0)

  useInput(
    useCallback((input: string) => {
      if (input === "j") setCount((c) => c + 1)
      if (input === "k") setCount((c) => c - 1)
      if (input === "r") setCount(0)
      if (input === "q") return "exit"
    }, []),
  )

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Layer 2 Counter (run + hooks)
      </Text>
      <Text> </Text>
      <Box>
        <Text>Count: </Text>
        <Text bold color={count >= 0 ? "green" : "red"}>
          {count}
        </Text>
      </Box>
      <Text> </Text>
      <Text dimColor>j/k: increment/decrement • r: reset • q: quit</Text>
    </Box>
  )
}

async function main() {
  const handle = await run(<Counter />)

  // Wait until user presses q
  await handle.waitUntilExit()

  console.log("\nGoodbye!")
}

if (import.meta.main) {
  main().catch(console.error)
}
