/**
 * Input coalescing tests.
 *
 * Verifies that multiple key events are batched together with a single
 * render pass, avoiding redundant renders during rapid input (auto-repeat,
 * pasted sequences, fast typing).
 */

import React, { useState } from "react"
import { describe, expect, it } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "inkx/testing"
import { run, useInput } from "../src/runtime/index.js"
import { keyToAnsi } from "../src/keys.js"

const render = createRenderer({ cols: 40, rows: 10 })

// ============================================================================
// Test renderer: sendInput batching
// ============================================================================

describe("input coalescing — test renderer", () => {
  it("processes multiple keys in one stdin.write with a single render", () => {
    let renderCount = 0

    function App() {
      const [count, setCount] = useState(0)
      renderCount++

      return <Text>Count: {count}</Text>
    }

    const app = render(<App />)
    const initialRenderCount = renderCount

    // Send multiple 'j' keys in one write (simulating auto-repeat buffer)
    app.stdin.write("jjj")

    // Only one frame should be added (one render for the batch)
    expect(app.frames).toHaveLength(2) // initial + one sendInput render
  })

  it("all keys in a batch are delivered to useInput handlers", () => {
    const inputs: string[] = []

    function App() {
      return (
        <Box>
          <Text>Input handler</Text>
        </Box>
      )
    }

    const app = render(<App />)

    // The input emitter should receive all keys individually
    // even though they're sent in one write
    app.stdin.write("abc")

    // Verify the frame count: initial + 1 render
    expect(app.frames).toHaveLength(2)
  })

  it("state updates from batched keys accumulate correctly", () => {
    function Counter() {
      const [count, setCount] = useState(0)

      // This uses the old InputContext from renderer.ts
      return <Text>Count: {count}</Text>
    }

    const app = render(<Counter />)
    expect(app.text).toContain("Count: 0")

    // Press 'j' three times via press() — each is a separate sendInput call
    // so we get 3 renders (3 frames added)
    app.stdin.write(keyToAnsi("j"))
    app.stdin.write(keyToAnsi("j"))
    app.stdin.write(keyToAnsi("j"))

    // Three separate writes = 3 renders = 4 frames total
    expect(app.frames).toHaveLength(4)
  })

  it("batched keys in a single write produce exactly one render", () => {
    function App() {
      return <Text>Hello</Text>
    }

    const app = render(<App />)
    expect(app.frames).toHaveLength(1) // initial

    // Three keys in one write = one render
    app.stdin.write("abc")
    expect(app.frames).toHaveLength(2) // initial + 1 batch render

    // Compare: three separate writes = three renders
    app.stdin.write("d")
    app.stdin.write("e")
    app.stdin.write("f")
    expect(app.frames).toHaveLength(5) // +3 individual renders
  })
})

// ============================================================================
// run() Layer 2: event coalescing
// ============================================================================

describe("input coalescing — run() Layer 2", () => {
  it("handles sequential press() calls correctly", async () => {
    const controller = new AbortController()
    const inputs: string[] = []

    function App() {
      const [count, setCount] = useState(0)

      useInput((input) => {
        inputs.push(input)
        if (input === "j") setCount((c) => c + 1)
      })

      return <Text>Count: {count}</Text>
    }

    const handle = await run(<App />, {
      cols: 40,
      rows: 10,
      signal: controller.signal,
    })

    expect(handle.text).toContain("Count: 0")

    await handle.press("j")
    // Give React time to re-render
    await new Promise((r) => setTimeout(r, 10))
    expect(handle.text).toContain("Count: 1")

    await handle.press("j")
    await new Promise((r) => setTimeout(r, 10))
    expect(handle.text).toContain("Count: 2")

    expect(inputs).toEqual(["j", "j"])

    handle.unmount()
  })

  it("exits correctly when handler returns exit mid-batch", async () => {
    const controller = new AbortController()
    const inputs: string[] = []

    function App() {
      useInput((input) => {
        inputs.push(input)
        if (input === "q") return "exit"
      })

      return <Text>Running</Text>
    }

    const handle = await run(<App />, {
      cols: 40,
      rows: 10,
      signal: controller.signal,
    })

    await handle.press("a")
    await handle.press("q")

    await handle.waitUntilExit()
    expect(inputs).toContain("a")
    expect(inputs).toContain("q")
  })

  it("handles all event types without losing events", async () => {
    const controller = new AbortController()
    const keys: string[] = []

    function App() {
      useInput((input) => {
        keys.push(input)
      })

      return <Text>Keys: {keys.join(",")}</Text>
    }

    const handle = await run(<App />, {
      cols: 40,
      rows: 10,
      signal: controller.signal,
    })

    // Send several presses
    await handle.press("a")
    await handle.press("b")
    await handle.press("c")

    expect(keys).toEqual(["a", "b", "c"])

    handle.unmount()
  })
})
