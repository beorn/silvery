/**
 * Hello Runtime - Minimal createRuntime Example
 *
 * The simplest possible example using the inkx-loop runtime.
 * Shows basic setup, rendering, and cleanup.
 *
 * Usage: bun examples/hello-runtime.tsx
 */

import React from "react"
import { Box, Text } from "../../src/index.js"
import { createRuntime, ensureLayoutEngine, layout, type Dims, type RenderTarget } from "../../src/runtime/index.js"
import type { ExampleMeta } from "../_banner.js"

export const meta: ExampleMeta = {
  name: "Hello Runtime",
  description: "Simplest Layer 1 API: createRuntime(), layout(), Symbol.dispose",
  features: ["createRuntime()", "layout()", "renderString()"],
}

// Simple terminal target
const termTarget: RenderTarget = {
  write: (frame) => process.stdout.write(frame),
  getDims: () => ({
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  }),
}

// Simple view
function HelloView({ name }: { name: string }): React.ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="green">
        Hello, {name}!
      </Text>
      <Text dimColor>Welcome to inkx-loop</Text>
    </Box>
  )
}

async function main() {
  // Initialize layout engine (required once)
  await ensureLayoutEngine()

  // Create runtime
  const runtime = createRuntime({ target: termTarget })

  // Render
  const buffer = layout(<HelloView name="World" />, runtime.getDims())
  runtime.render(buffer)

  // Wait a moment to see the output
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Update with new content
  const buffer2 = layout(<HelloView name="inkx-loop" />, runtime.getDims())
  runtime.render(buffer2)

  // Wait again
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Cleanup
  runtime[Symbol.dispose]()

  console.log("\nDone!")
}

if (import.meta.main) {
  main().catch(console.error)
}
