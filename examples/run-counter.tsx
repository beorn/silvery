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
import { run, useRuntimeInput } from "../src/runtime/index.js"

function Counter() {
  const [count, setCount] = useState(0)

  // useCallback is required for useRuntimeInput to avoid re-subscriptions
  const handleInput = useCallback((key: string) => {
    if (key === "j") setCount((c) => c + 1)
    if (key === "k") setCount((c) => c - 1)
    if (key === "r") setCount(0)
    if (key === "q") return "exit" as const
  }, [])

  useRuntimeInput(handleInput)

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

main().catch(console.error)
