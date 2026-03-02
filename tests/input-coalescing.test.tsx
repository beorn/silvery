/**
 * Input coalescing tests.
 *
 * Verifies that multiple key events are batched together with a single
 * render pass, avoiding redundant renders during rapid input (auto-repeat,
 * pasted sequences, fast typing).
 */

import { EventEmitter } from "node:events"
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

// ============================================================================
// Rapid typing: event queue drain with batched rendering
// ============================================================================

/** Create a mock stdin EventEmitter that looks like a TTY */
function createMockTtyStdin() {
  const stdin = new EventEmitter() as NodeJS.ReadStream & {
    isTTY: boolean
    isRaw: boolean
    setRawMode: (mode: boolean) => void
    resume: () => void
    pause: () => void
    setEncoding: (enc: string) => void
  }
  stdin.isTTY = true
  stdin.isRaw = false
  stdin.setRawMode = (mode: boolean) => {
    stdin.isRaw = mode
  }
  stdin.resume = () => {}
  stdin.pause = () => {}
  stdin.setEncoding = () => {}
  return stdin
}

// ============================================================================
// Incremental content rendering verification
// ============================================================================

describe("incremental content rendering — run() Layer 2", () => {
  it("uses incremental rendering after first frame (content phase skips clean nodes)", async () => {
    const mockStdin = createMockTtyStdin()

    function App() {
      const [text, setText] = useState("")

      useInput((input) => {
        setText((t) => t + input)
      })

      return (
        <Box flexDirection="column">
          <Text>Header line 1</Text>
          <Text>Header line 2</Text>
          <Text>Header line 3</Text>
          <Text>Input: {text}</Text>
        </Box>
      )
    }

    const handle = await run(<App />, {
      cols: 40,
      rows: 10,
      stdin: mockStdin as any,
    })

    // Type a character to trigger an incremental render
    mockStdin.emit("data", "x")
    await new Promise((r) => setTimeout(r, 30))

    // Verify incremental rendering is active — __inkx_last_pipeline.incremental
    // is true when prevBuffer was passed to executeRender (not null).
    // Without prevBuffer tracking, this would be false on every frame.
    const pipeline = (globalThis as any).__inkx_last_pipeline
    expect(pipeline).toBeDefined()
    expect(pipeline.incremental).toBe(true)

    // Verify correctness
    expect(handle.text).toContain("Input: x")
    expect(handle.text).toContain("Header line 1")

    handle.unmount()
  })

  it("invalidates prevBuffer on resize so content renders fresh", async () => {
    const mockStdin = createMockTtyStdin()
    const mockStdout = Object.assign(new EventEmitter(), {
      columns: 40,
      rows: 10,
      isTTY: true,
      write: () => true,
    }) as any

    function App() {
      const [text, setText] = useState("hello")

      useInput((input) => {
        setText((t) => t + input)
      })

      return <Text>Text: {text}</Text>
    }

    const handle = await run(<App />, {
      stdin: mockStdin as any,
      stdout: mockStdout,
    })

    expect(handle.text).toContain("Text: hello")

    // Type something to establish incremental rendering
    mockStdin.emit("data", "a")
    await new Promise((r) => setTimeout(r, 30))
    expect(handle.text).toContain("Text: helloa")

    // Simulate resize — should not crash and should render correctly
    mockStdout.columns = 60
    mockStdout.rows = 15
    mockStdout.emit("resize")
    await new Promise((r) => setTimeout(r, 30))

    // Type after resize — should still work (prevBuffer was invalidated)
    mockStdin.emit("data", "b")
    await new Promise((r) => setTimeout(r, 30))
    expect(handle.text).toContain("Text: helloab")

    handle.unmount()
  })
})

describe("rapid typing — event queue batch cap", () => {
  it("100 rapid keystrokes do not crash (no Maximum update depth exceeded)", async () => {
    const mockStdin = createMockTtyStdin()
    const inputs: string[] = []

    function App() {
      const [text, setText] = useState("")

      useInput((input) => {
        inputs.push(input)
        setText((t) => t + input)
      })

      return <Text>Text: {text}</Text>
    }

    const handle = await run(<App />, {
      cols: 120,
      rows: 10,
      stdin: mockStdin as any,
    })

    // Emit 100 characters in a single 'data' event (simulates buffered rapid typing).
    // Before the batch cap fix, this would trigger ~300 setState calls
    // (3 per event × 100 events) in a single flushSyncWork(), exceeding
    // React's NESTED_UPDATE_LIMIT of 50.
    const chars = "abcdefghij".repeat(10) // 100 characters
    mockStdin.emit("data", chars)

    // Wait for event loop to drain all batches
    await new Promise((r) => setTimeout(r, 50))

    // All 100 characters should have been processed
    expect(inputs).toHaveLength(100)
    expect(inputs.join("")).toBe(chars)

    // Final render should contain all characters
    expect(handle.text).toContain(chars)

    handle.unmount()
  })

  it("50 characters across multiple data events all process correctly", async () => {
    const mockStdin = createMockTtyStdin()
    const inputs: string[] = []

    function App() {
      const [count, setCount] = useState(0)

      useInput((input) => {
        inputs.push(input)
        setCount((c) => c + 1)
      })

      return <Text>Count: {count}</Text>
    }

    const handle = await run(<App />, {
      cols: 40,
      rows: 10,
      stdin: mockStdin as any,
    })

    // Emit 5 bursts of 10 chars, spaced by microtask yields so the
    // keyboard source can register its next 'data' listener between bursts.
    for (let i = 0; i < 5; i++) {
      mockStdin.emit("data", "aaaaaaaaaa") // 10 'a' chars
      await new Promise((r) => setTimeout(r, 5))
    }

    await new Promise((r) => setTimeout(r, 50))

    expect(inputs).toHaveLength(50)
    expect(handle.text).toContain("Count: 50")

    handle.unmount()
  })
})
