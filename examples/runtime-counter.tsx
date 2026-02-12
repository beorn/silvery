/**
 * Runtime Counter Example
 *
 * Demonstrates the createRuntime() API (Layer 1):
 * - Runtime handles diffing internally
 * - events() provides AsyncIterable event stream
 * - schedule() for async effects
 * - Clean disposal with Symbol.dispose
 *
 * This is the recommended way to build custom event loops.
 *
 * Usage: bun examples/runtime-counter.tsx
 */

import React from "react"
import { Box, Text } from "../src/index.js"
import {
  createRuntime,
  ensureLayoutEngine,
  layout,
  type Dims,
  type Event,
  type RenderTarget,
} from "../src/runtime/index.js"

// ============================================================================
// State & Types
// ============================================================================

interface State {
  count: number
}

// ============================================================================
// Reducer (pure function)
// ============================================================================

function reducer(state: State, event: Event): State {
  switch (event.type) {
    case "resize":
      // Just trigger re-render, state unchanged
      return state
    case "effect":
      // Effect completed - increment count
      // Note: event.id is auto-generated ("effect-0", "effect-1", ...),
      // event.result is whatever schedule() callback returned
      if (event.result === "increment") {
        return { ...state, count: state.count + 1 }
      }
      return state
    default:
      return state
  }
}

// ============================================================================
// View (pure function)
// ============================================================================

function view(state: State, dims: Dims): React.ReactElement {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Runtime Counter Example</Text>
      <Text> </Text>
      <Text>
        Count: <Text color="green">{state.count}</Text>
      </Text>
      <Text> </Text>
      <Text dimColor>
        Terminal: {dims.cols}x{dims.rows}
      </Text>
      <Text dimColor>Press Ctrl+C to quit</Text>
    </Box>
  )
}

// ============================================================================
// Terminal Target
// ============================================================================

function createTerminalTarget(): RenderTarget & { cleanup: () => void } {
  const resizeHandlers = new Set<(dims: Dims) => void>()

  const onResizeHandler = () => {
    const dims = {
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
    }
    for (const handler of resizeHandlers) {
      handler(dims)
    }
  }

  process.stdout.on("resize", onResizeHandler)

  return {
    write(frame: string): void {
      process.stdout.write(frame)
    },

    getDims(): Dims {
      return {
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
      }
    },

    onResize(handler: (dims: Dims) => void): () => void {
      resizeHandlers.add(handler)
      return () => resizeHandlers.delete(handler)
    },

    cleanup(): void {
      process.stdout.off("resize", onResizeHandler)
    },
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  // Initialize layout engine
  await ensureLayoutEngine()

  // Create terminal target
  const target = createTerminalTarget()

  // Create runtime with abort signal for cleanup
  const controller = new AbortController()
  const runtime = createRuntime({ target, signal: controller.signal })

  // Handle Ctrl+C
  process.on("SIGINT", () => {
    controller.abort()
  })

  // Initial state
  let state: State = { count: 0 }

  // Clear screen and hide cursor
  process.stdout.write("\x1b[2J\x1b[H\x1b[?25l")

  try {
    // Initial render
    runtime.render(layout(view(state, runtime.getDims()), runtime.getDims()))

    // Schedule periodic increments using effects
    const scheduleIncrement = () => {
      runtime.schedule(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return "increment"
      })
    }

    // Start first increment
    scheduleIncrement()

    // Event loop
    for await (const event of runtime.events()) {
      // Update state
      const newState = reducer(state, event)

      // Re-render if state changed or resize occurred
      if (newState !== state || event.type === "resize") {
        state = newState
        runtime.render(
          layout(view(state, runtime.getDims()), runtime.getDims()),
        )
      }

      // Schedule next increment after effect completes
      if (event.type === "effect" && event.id.startsWith("effect-")) {
        scheduleIncrement()
      }
    }
  } finally {
    // Cleanup
    runtime[Symbol.dispose]()
    target.cleanup()

    // Show cursor and reset
    process.stdout.write("\x1b[?25h\x1b[0m\n")
    console.log("Final count:", state.count)
  }
}

// Run
if (import.meta.main) {
  main().catch(console.error)
}
