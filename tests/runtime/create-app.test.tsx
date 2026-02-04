/**
 * Tests for createApp() - Layer 3 Store integration.
 */

import React from "react"
import { describe, expect, it } from "vitest"
import { Text } from "../../src/index.js"
import { type Key, createApp, useApp } from "../../src/runtime/index.js"

describe("createApp() - Layer 3", () => {
  describe("basic rendering", () => {
    it("renders a simple component with store", async () => {
      const app = createApp(() => () => ({
        message: "Hello from createApp",
      }))

      function App() {
        const message = useApp((s: { message: string }) => s.message)
        return <Text>{message}</Text>
      }

      const handle = await app.run(<App />, {
        cols: 80,
        rows: 24,
      })

      expect(handle.text).toContain("Hello from createApp")
      handle.unmount()
    })

    it("provides store access via handle", async () => {
      const app = createApp(() => () => ({
        count: 42,
      }))

      function App() {
        const count = useApp((s: { count: number }) => s.count)
        return <Text>Count: {count}</Text>
      }

      const handle = await app.run(<App />, {
        cols: 80,
        rows: 24,
      })

      expect(handle.store.getState().count).toBe(42)
      handle.unmount()
    })
  })

  describe("event handlers", () => {
    it("handles key events via handlers", async () => {
      const inputs: string[] = []

      const app = createApp(
        () => () => ({
          count: 0,
        }),
        {
          key: (input, key, { set }) => {
            inputs.push(input)
            if (input === "j") set((s) => ({ count: s.count + 1 }))
          },
        },
      )

      function App() {
        const count = useApp((s: { count: number }) => s.count)
        return <Text>Count: {count}</Text>
      }

      const handle = await app.run(<App />, {
        cols: 80,
        rows: 24,
      })

      await handle.press("a")
      await handle.press("j")
      await handle.press("j")

      expect(inputs).toEqual(["a", "j", "j"])
      expect(handle.store.getState().count).toBe(2)

      handle.unmount()
    })

    it("provides Key object with parsed modifiers", async () => {
      const keys: Key[] = []

      const app = createApp(() => () => ({}), {
        key: (input, key) => {
          keys.push({ ...key })
        },
      })

      function App() {
        return <Text>Press keys</Text>
      }

      const handle = await app.run(<App />, {
        cols: 80,
        rows: 24,
      })

      await handle.press("\x1b[A") // up arrow
      await handle.press("\r") // return

      expect(keys[0]?.upArrow).toBe(true)
      expect(keys[1]?.return).toBe(true)

      handle.unmount()
    })

    it("exits when handler returns exit", async () => {
      const app = createApp(() => () => ({}), {
        key: (input) => {
          if (input === "q") return "exit"
        },
      })

      function App() {
        return <Text>Press q to exit</Text>
      }

      const handle = await app.run(<App />, {
        cols: 80,
        rows: 24,
      })

      await handle.press("q")
      await handle.waitUntilExit()
    })
  })

  describe("store updates", () => {
    it("re-renders on state change", async () => {
      const app = createApp(
        () => (set) => ({
          count: 0,
          increment: () => set((s) => ({ count: s.count + 1 })),
        }),
        {
          key: (input, key, { get }) => {
            if (input === "j") get().increment()
          },
        },
      )

      function App() {
        const count = useApp((s: { count: number }) => s.count)
        return <Text>Count: {count}</Text>
      }

      const handle = await app.run(<App />, {
        cols: 80,
        rows: 24,
      })

      expect(handle.text).toContain("Count: 0")

      await handle.press("j")
      // Give store time to update and re-render
      await new Promise((r) => setTimeout(r, 10))
      expect(handle.text).toContain("Count: 1")

      await handle.press("j")
      await new Promise((r) => setTimeout(r, 10))
      expect(handle.text).toContain("Count: 2")

      handle.unmount()
    })
  })

  describe("injected values", () => {
    it("passes plain values to factory", async () => {
      const app = createApp(({ maxCount }: { maxCount: number }) => () => ({
        maxCount,
        count: 0,
      }))

      function App() {
        const maxCount = useApp((s: { maxCount: number }) => s.maxCount)
        return <Text>Max: {maxCount}</Text>
      }

      const handle = await app.run(<App />, {
        cols: 80,
        rows: 24,
        maxCount: 100,
      })

      expect(handle.text).toContain("Max: 100")
      expect(handle.store.getState().maxCount).toBe(100)

      handle.unmount()
    })
  })

  describe("cleanup", () => {
    it("unmount stops the app", async () => {
      const app = createApp(() => () => ({}))

      function App() {
        return <Text>Running</Text>
      }

      const handle = await app.run(<App />, {
        cols: 80,
        rows: 24,
      })

      expect(handle.text).toContain("Running")

      handle.unmount()
      await handle.waitUntilExit()
    })
  })
})
