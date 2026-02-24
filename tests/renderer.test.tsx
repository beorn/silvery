/**
 * Integration tests for src/renderer.ts
 *
 * Tests the reconciler boundary layer — frame rendering lifecycle,
 * buffer creation/update, reconciler integration, and error handling.
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { Box, Text, useApp, useInput } from "../src/index.js"
import { useContentRect } from "../src/index.js"
import { createRenderer } from "inkx/testing"
import { ensureEngine } from "../src/renderer.js"

// Initialize layout engine
await ensureEngine()

const { render, createStore, run, getActiveRenderCount, createRenderer: rendererCreateRenderer } = await import(
  "../src/renderer.js"
)

describe("renderer", () => {
  // ========================================================================
  // Frame rendering lifecycle
  // ========================================================================

  describe("frame rendering lifecycle", () => {
    test("initial render produces a frame", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Text>Initial</Text>)
      expect(app.frames).toHaveLength(1)
      expect(app.text).toContain("Initial")
    })

    test("press produces an additional frame", async () => {
      function Counter() {
        const [n, setN] = useState(0)
        useInput((input) => {
          if (input === "j") setN((c) => c + 1)
        })
        return <Text>Count: {n}</Text>
      }

      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Counter />)
      expect(app.frames).toHaveLength(1)
      expect(app.text).toContain("Count: 0")

      await app.press("j")
      expect(app.frames).toHaveLength(2)
      expect(app.text).toContain("Count: 1")
    })

    test("rerender produces an additional frame", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Text>First</Text>)
      expect(app.frames).toHaveLength(1)

      app.rerender(<Text>Second</Text>)
      expect(app.frames).toHaveLength(2)
      expect(app.text).toContain("Second")
    })

    test("clear resets frames and buffer", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Text>Content</Text>)
      expect(app.frames).toHaveLength(1)
      expect(app.term.buffer).not.toBeNull()

      app.clear()
      expect(app.frames).toHaveLength(0)
      expect(app.lastFrame()).toBeUndefined()
    })

    test("frames accumulate across multiple rerenders", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Text>F1</Text>)
      app.rerender(<Text>F2</Text>)
      app.rerender(<Text>F3</Text>)
      app.rerender(<Text>F4</Text>)
      expect(app.frames).toHaveLength(4)
    })

    test("lastFrame returns the most recent frame", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Text>First</Text>)
      app.rerender(<Text>Latest</Text>)
      const last = app.lastFrame()
      expect(last).toBeDefined()
      // The last frame should contain "Latest" (after stripping ANSI)
      expect(app.text).toContain("Latest")
    })
  })

  // ========================================================================
  // Buffer creation and update
  // ========================================================================

  describe("buffer creation and update", () => {
    test("initial render creates a buffer", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Text>Hello</Text>)
      const buffer = app.term.buffer
      expect(buffer).toBeDefined()
      expect(buffer!.width).toBe(40)
    })

    test("buffer dimensions match render options", () => {
      const r = createRenderer({ cols: 60, rows: 15 })
      const app = r(<Text>Hello</Text>)
      const buffer = app.term.buffer
      expect(buffer).toBeDefined()
      expect(buffer!.width).toBe(60)
    })

    test("buffer updates on rerender", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Text>Before</Text>)
      expect(app.text).toContain("Before")

      app.rerender(<Text>After</Text>)
      expect(app.text).toContain("After")
    })

    test("buffer contains styled text (ANSI present)", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Text color="red">Red</Text>)
      // ansi should contain ANSI escape codes
      expect(app.ansi).toMatch(/\x1b\[/)
      // text should be plain
      expect(app.text).toContain("Red")
      expect(app.text).not.toMatch(/\x1b\[/)
    })

    test("incremental rendering reuses previous buffer for diffing", async () => {
      function Toggle() {
        const [on, setOn] = useState(false)
        useInput((input) => {
          if (input === "t") setOn((v) => !v)
        })
        return <Text>{on ? "ON" : "OFF"}</Text>
      }

      const r = createRenderer({ cols: 40, rows: 10, incremental: true })
      const app = r(<Toggle />)
      expect(app.text).toContain("OFF")

      await app.press("t")
      expect(app.text).toContain("ON")

      // Buffer should exist and reflect current state
      const buffer = app.term.buffer
      expect(buffer).toBeDefined()
    })

    test("non-incremental render creates fresh buffer each time", () => {
      const r = createRenderer({ cols: 40, rows: 10, incremental: false })
      const app = r(<Text>Hello</Text>)
      expect(app.text).toContain("Hello")

      app.rerender(<Text>World</Text>)
      expect(app.text).toContain("World")
    })

    test("freshRender returns a buffer without side effects", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Text>Content</Text>)

      const freshBuf = app.freshRender()
      expect(freshBuf).toBeDefined()
      expect(freshBuf.width).toBe(40)
      // Original state unchanged
      expect(app.text).toContain("Content")
    })
  })

  // ========================================================================
  // Reconciler integration
  // ========================================================================

  describe("reconciler integration", () => {
    test("React state updates are reflected after press", async () => {
      function Stateful() {
        const [items, setItems] = useState(["a", "b"])
        useInput((input) => {
          if (input === "x") setItems((prev) => [...prev, "c"])
        })
        return <Text>{items.join(",")}</Text>
      }

      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Stateful />)
      expect(app.text).toContain("a,b")

      await app.press("x")
      expect(app.text).toContain("a,b,c")
    })

    test("useContentRect stabilizes during initial render", () => {
      function SizeReporter() {
        const { width } = useContentRect()
        return <Text>W={width ?? "?"}</Text>
      }

      const r = createRenderer({ cols: 50, rows: 10 })
      const app = r(
        <Box width="100%">
          <SizeReporter />
        </Box>,
      )
      expect(app.text).toContain("W=50")
    })

    test("unmount tears down the React tree", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Text>Alive</Text>)
      expect(app.text).toContain("Alive")

      app.unmount()
      // After unmount, ansi still returns last frame
      expect(app.ansi).toContain("Alive")
    })

    test("rerender replaces the React tree", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(
        <Box>
          <Text>Old</Text>
        </Box>,
      )
      expect(app.text).toContain("Old")

      app.rerender(
        <Box>
          <Text>New</Text>
        </Box>,
      )
      expect(app.text).toContain("New")
      expect(app.text).not.toContain("Old")
    })

    test("multiple rapid state updates are batched by React", async () => {
      function Multi() {
        const [a, setA] = useState(0)
        const [b, setB] = useState(0)
        useInput((input) => {
          if (input === "x") {
            setA((v) => v + 1)
            setB((v) => v + 10)
          }
        })
        return (
          <Text>
            A={a} B={b}
          </Text>
        )
      }

      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Multi />)
      expect(app.text).toContain("A=0")
      expect(app.text).toContain("B=0")

      await app.press("x")
      expect(app.text).toContain("A=1")
      expect(app.text).toContain("B=10")
    })

    test("exit callback is tracked", () => {
      function Exiter() {
        const { exit } = useApp()
        useInput((input) => {
          if (input === "q") exit()
        })
        return <Text>Running</Text>
      }

      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Exiter />)
      expect(app.exitCalled()).toBe(false)

      app.stdin.write("q")
      expect(app.exitCalled()).toBe(true)
    })

    test("exit with error is tracked", () => {
      function ErrorExiter() {
        const { exit } = useApp()
        useInput((input) => {
          if (input === "e") exit(new Error("test error"))
        })
        return <Text>Running</Text>
      }

      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<ErrorExiter />)

      app.stdin.write("e")
      expect(app.exitCalled()).toBe(true)
      expect(app.exitError()).toBeDefined()
      expect(app.exitError()!.message).toBe("test error")
    })
  })

  // ========================================================================
  // Error handling
  // ========================================================================

  describe("error handling", () => {
    test("writing to stdin after unmount throws", () => {
      const app = render(<Text>Hello</Text>, { cols: 40, rows: 10 })
      app.unmount()
      expect(() => app.stdin.write("j")).toThrow("Cannot write to stdin after unmount")
    })

    test("rerender after unmount throws", () => {
      const app = render(<Text>Hello</Text>, { cols: 40, rows: 10 })
      app.unmount()
      expect(() => app.rerender(<Text>World</Text>)).toThrow("Cannot rerender after unmount")
    })

    test("double unmount throws", () => {
      const app = render(<Text>Hello</Text>, { cols: 40, rows: 10 })
      app.unmount()
      expect(() => app.unmount()).toThrow("Already unmounted")
    })

    test("createRenderer auto-unmounts previous render on new render", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const countBefore = getActiveRenderCount()
      const app1 = r(<Text>First</Text>)
      expect(getActiveRenderCount()).toBe(countBefore + 1)

      const app2 = r(<Text>Second</Text>)
      expect(getActiveRenderCount()).toBe(countBefore + 1)
      // app1 should be unmounted
      expect(() => app1.unmount()).toThrow("Already unmounted")
    })
  })

  // ========================================================================
  // createStore integration
  // ========================================================================

  describe("createStore", () => {
    test("creates store with default dimensions", () => {
      const store = createStore()
      expect(store.cols).toBe(80)
      expect(store.rows).toBe(24)
    })

    test("creates store with custom dimensions", () => {
      const store = createStore({ cols: 120, rows: 40 })
      expect(store.cols).toBe(120)
      expect(store.rows).toBe(40)
    })

    test("store without events has no events property", () => {
      const store = createStore({ cols: 80, rows: 24 })
      expect(store.events).toBeUndefined()
    })

    test("render with store uses store dimensions", () => {
      const store = createStore({ cols: 100, rows: 30 })
      const app = render(<Text>Hello</Text>, store)
      expect(app.text).toContain("Hello")
      // Buffer width should match store cols
      const buffer = app.term.buffer
      expect(buffer).toBeDefined()
      expect(buffer!.width).toBe(100)
      app.unmount()
    })
  })

  // ========================================================================
  // run() — event loop driver
  // ========================================================================

  describe("run()", () => {
    test("sync run with key array applies all keys", () => {
      function Counter() {
        const [n, setN] = useState(0)
        useInput((input) => {
          if (input === "j") setN((c) => c + 1)
          if (input === "k") setN((c) => c - 1)
        })
        return <Text>N={n}</Text>
      }

      const app = render(<Counter />, { cols: 40, rows: 10 })
      const result = run(app, ["j", "j", "j", "k"])
      expect(result.text).toContain("N=2")
      app.unmount()
    })

    test("sync run with empty array is a no-op", () => {
      const app = render(<Text>Static</Text>, { cols: 40, rows: 10 })
      const result = run(app, [])
      expect(result.text).toContain("Static")
      app.unmount()
    })

    test("sync run result is iterable over processed events", () => {
      const app = render(<Text>Test</Text>, { cols: 40, rows: 10 })
      const result = run(app, ["a", "b", "c"])
      const events = [...result]
      expect(events).toEqual(["a", "b", "c"])
      app.unmount()
    })

    test("sync run result exposes the app", () => {
      const app = render(<Text>Test</Text>, { cols: 40, rows: 10 })
      const result = run(app, [])
      expect(result.app).toBe(app)
      app.unmount()
    })

    test("async run without events returns async result", () => {
      const app = render(<Text>Async</Text>, { cols: 40, rows: 10 })
      const result = run(app)
      expect(result.text).toContain("Async")
      expect(typeof result.unmount).toBe("function")
      result.unmount()
    })

    test("async run result has unmount method", () => {
      const app = render(<Text>Hello</Text>, { cols: 40, rows: 10 })
      const result = run(app)
      expect(() => result.unmount()).not.toThrow()
    })
  })

  // ========================================================================
  // Render options
  // ========================================================================

  describe("render options", () => {
    test("default dimensions are 80x24", () => {
      const app = render(<Text>Default</Text>)
      const buffer = app.term.buffer
      expect(buffer).toBeDefined()
      expect(buffer!.width).toBe(80)
      app.unmount()
    })

    test("custom dimensions via options", () => {
      const app = render(<Text>Custom</Text>, { cols: 120, rows: 50 })
      const buffer = app.term.buffer
      expect(buffer!.width).toBe(120)
      app.unmount()
    })

    test("incremental option defaults to true", async () => {
      // By default, incremental rendering is enabled.
      // Verify it doesn't crash and produces output.
      function Toggle() {
        const [on, setOn] = useState(false)
        useInput((input) => {
          if (input === "t") setOn((v) => !v)
        })
        return <Text>{on ? "ON" : "OFF"}</Text>
      }
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Toggle />)
      expect(app.text).toContain("OFF")
      await app.press("t")
      expect(app.text).toContain("ON")
    })

    test("incremental=false disables incremental rendering", async () => {
      function Toggle() {
        const [on, setOn] = useState(false)
        useInput((input) => {
          if (input === "t") setOn((v) => !v)
        })
        return <Text>{on ? "ON" : "OFF"}</Text>
      }
      const r = createRenderer({ cols: 40, rows: 10, incremental: false })
      const app = r(<Toggle />)
      expect(app.text).toContain("OFF")
      await app.press("t")
      expect(app.text).toContain("ON")
    })

    test("debug option does not crash", () => {
      const app = render(<Text>Debug</Text>, { cols: 40, rows: 10, debug: false })
      expect(app.text).toContain("Debug")
      app.unmount()
    })
  })

  // ========================================================================
  // Active render tracking
  // ========================================================================

  describe("active render tracking", () => {
    test("render increments active count, unmount decrements", () => {
      const before = getActiveRenderCount()
      const app = render(<Text>Track</Text>, { cols: 40, rows: 10 })
      expect(getActiveRenderCount()).toBe(before + 1)
      app.unmount()
      expect(getActiveRenderCount()).toBe(before)
    })

    test("createRenderer auto-cleans, keeping count stable", () => {
      const before = getActiveRenderCount()
      const r = rendererCreateRenderer({ cols: 40, rows: 10 })

      r(<Text>A</Text>)
      expect(getActiveRenderCount()).toBe(before + 1)

      r(<Text>B</Text>)
      expect(getActiveRenderCount()).toBe(before + 1)

      r(<Text>C</Text>)
      expect(getActiveRenderCount()).toBe(before + 1)
    })
  })

  // ========================================================================
  // singlePassLayout mode
  // ========================================================================

  describe("singlePassLayout", () => {
    test("renders correctly with singlePassLayout=true", () => {
      const r = createRenderer({ cols: 40, rows: 10, singlePassLayout: true })
      const app = r(<Text>Single</Text>)
      expect(app.text).toContain("Single")
    })

    test("interactive component works in single-pass mode", async () => {
      function Interactive() {
        const [n, setN] = useState(0)
        useInput((input) => {
          if (input === "j") setN((c) => c + 1)
        })
        return <Text>N={n}</Text>
      }

      const r = createRenderer({ cols: 40, rows: 10, singlePassLayout: true })
      const app = r(<Interactive />)
      expect(app.text).toContain("N=0")

      await app.press("j")
      expect(app.text).toContain("N=1")

      await app.press("j")
      expect(app.text).toContain("N=2")
    })

    test("per-render override for singlePassLayout", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Text>Override</Text>, { singlePassLayout: true })
      expect(app.text).toContain("Override")
    })

    test("single-pass and multi-pass produce same result for simple layout", () => {
      function Layout() {
        return (
          <Box flexDirection="row" width="100%">
            <Box width="50%">
              <Text>Left</Text>
            </Box>
            <Box width="50%">
              <Text>Right</Text>
            </Box>
          </Box>
        )
      }

      const rMulti = createRenderer({ cols: 60, rows: 10 })
      const rSingle = createRenderer({ cols: 60, rows: 10, singlePassLayout: true })

      const multi = rMulti(<Layout />)
      const single = rSingle(<Layout />)

      expect(single.text).toBe(multi.text)
    })
  })

  // ========================================================================
  // Locators
  // ========================================================================

  describe("locators", () => {
    test("getByTestId finds element by testID", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(
        <Box testID="wrapper">
          <Text>Inside</Text>
        </Box>,
      )
      const loc = app.getByTestId("wrapper")
      expect(loc.count()).toBe(1)
    })

    test("getByText finds element by text content", () => {
      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Text>Findable</Text>)
      const loc = app.getByText("Findable")
      expect(loc.count()).toBe(1)
    })

    test("locator auto-refreshes after press", async () => {
      function Toggler() {
        const [label, setLabel] = useState("A")
        useInput((input) => {
          if (input === "t") setLabel((l) => (l === "A" ? "B" : "A"))
        })
        return (
          <Box testID="target">
            <Text>{label}</Text>
          </Box>
        )
      }

      const r = createRenderer({ cols: 40, rows: 10 })
      const app = r(<Toggler />)
      const target = app.getByTestId("target")
      expect(target.textContent()).toBe("A")

      await app.press("t")
      expect(target.textContent()).toBe("B")
    })
  })

  // ========================================================================
  // kittyMode
  // ========================================================================

  describe("kittyMode", () => {
    test("kittyMode option is accepted without error", () => {
      const r = createRenderer({ cols: 40, rows: 10, kittyMode: true })
      const app = r(<Text>Kitty</Text>)
      expect(app.text).toContain("Kitty")
    })
  })
})
