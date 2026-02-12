/**
 * Test incremental rendering with standalone store re-renders (case 3).
 *
 * Regression tests for km-inkx.debug-blank: when debug logging triggers a
 * microtask-based store change (case 3 = standalone immediate render),
 * the incremental renderer must produce the same output as a fresh render.
 *
 * Root cause: ancestorCleared propagated through nodes with backgroundColor,
 * causing Text children to clear their region and wipe out the parent's
 * opaque bg fill. Fix: backgroundColor acts as a barrier for ancestorCleared.
 */

import React from "react"
import { describe, expect, it, afterEach, beforeEach } from "vitest"
import { Box, Text } from "../../src/index.js"
import { createApp, useApp } from "../../src/runtime/index.js"

// Enable incremental comparison check — throws IncrementalRenderMismatchError
// if incremental and fresh renders produce different cell values.
beforeEach(() => {
  process.env.INKX_CHECK_INCREMENTAL = "1"
})
afterEach(() => {
  delete process.env.INKX_CHECK_INCREMENTAL
})

describe("ancestorCleared propagation through backgroundColor nodes", () => {
  /**
   * Core regression: standalone store change triggers case 3 render.
   * Root clears region (prevLayout staleness → layoutChanged=true).
   * TopBar fills bg=white. Without fix, ancestorCleared leaks through
   * TopBar to Text child, which clears its region back to bg=null.
   */
  it("preserves parent backgroundColor after ancestor clear", async () => {
    interface AppStore {
      count: number
      setCount: (n: number) => void
    }

    const app = createApp<AppStore>(
      () => (set) => ({
        count: 0,
        setCount: (n: number) => set({ count: n }),
      }),
      {
        key: (input) => {
          if (input === "q") return "exit"
        },
      },
    )

    function App() {
      const count = useApp((s: AppStore) => s.count)
      return (
        <Box flexDirection="column" width={60} height={20}>
          {/* Parent with backgroundColor — must survive ancestor clear */}
          <Box id="top-bar" flexShrink={0} backgroundColor="white">
            <Text color="gray">Header: Status Bar</Text>
          </Box>

          <Box flexGrow={1} flexDirection="column" overflow="hidden">
            <Text>Content</Text>
          </Box>

          {/* Text changes on store update → triggers incremental render */}
          <Box id="bottom-bar" flexShrink={0}>
            <Text dimColor>{count > 0 && `n:${count} `}VIEW</Text>
          </Box>
        </Box>
      )
    }

    const handle = await app.run(<App />, { cols: 60, rows: 20 })
    expect(handle.text).toContain("Header: Status Bar")
    expect(handle.text).toContain("VIEW")

    // Standalone store change (case 3): triggers incremental render
    // with prevBuffer. INKX_CHECK_INCREMENTAL compares against fresh.
    await new Promise<void>((resolve) => {
      queueMicrotask(() => {
        handle.store.getState().setCount(1)
        resolve()
      })
    })
    await new Promise((r) => setTimeout(r, 50))

    // If ancestorCleared leaked through TopBar's bg, the incremental
    // render would have cleared (0,0) to bg=null — mismatch throws above.
    expect(handle.text).toContain("n:1")
    expect(handle.text).toContain("Header: Status Bar")

    handle.unmount()
  })

  /**
   * Nested backgroundColor barrier: two layers of opaque bg.
   * Both should stop ancestorCleared propagation independently.
   */
  it("handles nested backgroundColor nodes correctly", async () => {
    interface AppStore {
      value: string
      setValue: (v: string) => void
    }

    const app = createApp<AppStore>(
      () => (set) => ({
        value: "initial",
        setValue: (v: string) => set({ value: v }),
      }),
      {
        key: (input) => {
          if (input === "q") return "exit"
        },
      },
    )

    function App() {
      const value = useApp((s: AppStore) => s.value)
      return (
        <Box flexDirection="column" width={40} height={10}>
          {/* Outer opaque bg */}
          <Box backgroundColor="blue" flexShrink={0}>
            {/* Inner opaque bg */}
            <Box backgroundColor="white">
              <Text color="black">Nested: {value}</Text>
            </Box>
          </Box>
          <Box flexGrow={1}>
            <Text>Body</Text>
          </Box>
        </Box>
      )
    }

    const handle = await app.run(<App />, { cols: 40, rows: 10 })
    expect(handle.text).toContain("Nested: initial")

    await new Promise<void>((resolve) => {
      queueMicrotask(() => {
        handle.store.getState().setValue("updated")
        resolve()
      })
    })
    await new Promise((r) => setTimeout(r, 50))

    expect(handle.text).toContain("Nested: updated")
    handle.unmount()
  })

  /**
   * Rapid-fire standalone changes (simulates DEBUG='*' logging storms).
   */
  it("survives rapid standalone store changes", async () => {
    interface AppStore {
      counter: number
      increment: () => void
    }

    const app = createApp<AppStore>(
      () => (set, get) => ({
        counter: 0,
        increment: () => set({ counter: get().counter + 1 }),
      }),
      {
        key: (input) => {
          if (input === "q") return "exit"
        },
      },
    )

    function App() {
      const counter = useApp((s: AppStore) => s.counter)
      return (
        <Box flexDirection="column" width={60} height={20}>
          <Box id="header" flexShrink={0} backgroundColor="cyan">
            <Text color="black">Dashboard</Text>
          </Box>
          <Box flexGrow={1} overflow="hidden">
            <Text>Counter: {counter}</Text>
          </Box>
        </Box>
      )
    }

    const handle = await app.run(<App />, { cols: 60, rows: 20 })
    expect(handle.text).toContain("Dashboard")

    for (let i = 0; i < 5; i++) {
      await new Promise<void>((resolve) => {
        queueMicrotask(() => {
          handle.store.getState().increment()
          resolve()
        })
      })
      await new Promise((r) => setTimeout(r, 10))
    }

    expect(handle.text).toContain("Dashboard")
    expect(handle.text).toContain("Counter: 5")

    handle.unmount()
  })
})
