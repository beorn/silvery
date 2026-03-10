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
 *   Esc/q - Quit
 */

import React, { useState, useCallback } from "react";
import { Box, Text } from "../../src/index.js";
import { run, useInput, type Key } from "../../src/runtime/index.js";
import { ExampleBanner, type ExampleMeta } from "../_banner.js";

export const meta: ExampleMeta = {
  name: "Run Counter",
  description: "Layer 2: run() with React hooks and useRuntimeInput",
  features: ["run()", "useState", "useInput"],
};

function Counter() {
  const [count, setCount] = useState(0);

  useInput(
    useCallback((input: string, key: Key) => {
      if (input === "j") setCount((c) => c + 1);
      if (input === "k") setCount((c) => c - 1);
      if (input === "r") setCount(0);
      if (input === "q" || key.escape) return "exit";
    }, []),
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text>Count: </Text>
        <Text bold color={count >= 0 ? "green" : "red"}>
          {count}
        </Text>
      </Box>
      <Text> </Text>
      <Text dimColor>j/k: increment/decrement • r: reset • Esc/q: quit</Text>
    </Box>
  );
}

async function main() {
  const handle = await run(
    <ExampleBanner meta={meta} controls="j/k inc/dec  r reset  Esc/q quit">
      <Counter />
    </ExampleBanner>,
  );

  // Wait until user presses q
  await handle.waitUntilExit();

  console.log("\nGoodbye!");
}

if (import.meta.main) {
  main().catch(console.error);
}
