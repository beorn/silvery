/**
 * Test incremental rendering correctness when store changes trigger re-renders.
 *
 * Reproduces km-inkx.debug-blank: when a state change (e.g. consoleStats updating)
 * triggers a Board re-render, the incremental renderer must correctly preserve
 * all unchanged regions (like TopBar with backgroundColor).
 *
 * Uses createApp (Layer 3) to exercise the same render lifecycle as the real km app:
 * store subscription → doRender → reconcile → execute pipeline.
 */

import React, { useEffect, useState } from "react"
import { describe, expect, it, afterEach, beforeEach } from "vitest"
import { Box, Text } from "../../src/index.js"
import { createApp, useApp } from "../../src/runtime/index.js"

// Enable incremental comparison check for these tests
beforeEach(() => {
  process.env.INKX_CHECK_INCREMENTAL = "1"
})
afterEach(() => {
  delete process.env.INKX_CHECK_INCREMENTAL
})

describe("Incremental rendering with createApp store re-renders", () => {
  /**
   * Core scenario: TopBar with backgroundColor + BottomBar text changes.
   * Store update changes BottomBar text, TopBar must be preserved.
   */
  it("preserves TopBar bg after store-triggered BottomBar text change", async () => {
    interface AppStore {
      logCount: number
      setLogCount: (n: number) => void
    }

    const app = createApp<AppStore>(
      () => (set) => ({
        logCount: 0,
        setLogCount: (n: number) => set({ logCount: n }),
      }),
      {
        key: (input, _key, { get }) => {
          if (input === "l") get().setLogCount(get().logCount + 1)
          if (input === "q") return "exit"
        },
      },
    )

    function App() {
      const logCount = useApp((s: AppStore) => s.logCount)
      return (
        <Box flexDirection="column" width={60} height={20}>
          {/* TopBar with backgroundColor - like km's BoardTopBar */}
          <Box id="top-bar" flexShrink={0} backgroundColor="white">
            <Text color="gray">Header: Status Bar Content</Text>
          </Box>

          {/* Content area with flexGrow - like km's board content */}
          <Box flexGrow={1} flexDirection="column" overflow="hidden">
            <Text>Content line 1</Text>
            <Text>Content line 2</Text>
          </Box>

          {/* BottomBar - text changes when logCount updates */}
          <Box id="bottom-bar" flexShrink={0} flexDirection="row">
            <Box flexGrow={1}>
              <Text dimColor>DISK 📁 ~/path</Text>
            </Box>
            <Box flexShrink={0}>
              <Text dimColor>{logCount > 0 && `💬${logCount} `}📋1234 CARDS VIEW</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const handle = await app.run(<App />, { cols: 60, rows: 20 })

    // Initial render is full (no prevBuffer). Verify content.
    expect(handle.text).toContain("Header: Status Bar Content")
    expect(handle.text).toContain("CARDS VIEW")

    // Trigger store update: logCount 0 → 1
    // This re-renders BottomBar text only. TopBar must be preserved.
    // INKX_CHECK_INCREMENTAL will throw if incremental ≠ fresh.
    await handle.press("l")

    expect(handle.text).toContain("💬1")
    expect(handle.text).toContain("Header: Status Bar Content")

    // Trigger another update
    await handle.press("l")
    expect(handle.text).toContain("💬2")

    handle.unmount()
  })

  /**
   * Effect-driven re-render: useEffect sets state after mount.
   * This is the exact pattern in km: Board's useEffect for patchedConsole
   * calls setConsoleStats(initial) on mount, triggering a re-render.
   */
  it("preserves TopBar after effect-driven state change", async () => {
    interface AppStore {
      ready: boolean
      setReady: (r: boolean) => void
    }

    const app = createApp<AppStore>(
      () => (set) => ({
        ready: false,
        setReady: (r: boolean) => set({ ready: r }),
      }),
      {
        key: (input) => {
          if (input === "q") return "exit"
        },
      },
    )

    function App() {
      const ready = useApp((s: AppStore) => s.ready)
      const setReady = useApp((s: AppStore) => s.setReady)

      // Simulate Board's useEffect that sets consoleStats on mount
      useEffect(() => {
        setReady(true)
      }, [setReady])

      return (
        <Box flexDirection="column" width={60} height={20}>
          <Box id="top-bar" flexShrink={0} backgroundColor="white">
            <Text color="gray">Header: Board Title</Text>
          </Box>
          <Box flexGrow={1} overflow="hidden">
            <Text>{ready ? "Board content loaded" : "Loading..."}</Text>
          </Box>
          <Box id="bottom-bar" flexShrink={0}>
            <Text dimColor>{ready ? "READY" : "LOADING"}</Text>
          </Box>
        </Box>
      )
    }

    const handle = await app.run(<App />, { cols: 60, rows: 20 })

    // Wait for effect-driven re-render to settle
    await new Promise((r) => setTimeout(r, 50))

    // After effects, should show "Board content loaded" and "READY"
    expect(handle.text).toContain("Board content loaded")
    expect(handle.text).toContain("READY")
    expect(handle.text).toContain("Header: Board Title")

    handle.unmount()
  })

  /**
   * childrenDirty scenario: conditional rendering changes tree structure.
   * When ready transitions, the component tree restructures (like loading
   * skeleton → full board). All children must re-render.
   */
  it("handles tree restructure on childrenDirty without corruption", async () => {
    interface AppStore {
      phase: "loading" | "ready"
      setPhase: (p: "loading" | "ready") => void
    }

    const app = createApp<AppStore>(
      () => (set) => ({
        phase: "loading" as const,
        setPhase: (p: "loading" | "ready") => set({ phase: p }),
      }),
      {
        key: (input, _key, { get }) => {
          if (input === "r") get().setPhase("ready")
          if (input === "q") return "exit"
        },
      },
    )

    function LoadingSkeleton() {
      return (
        <Box flexDirection="column">
          <Text dimColor>{"░".repeat(20)}</Text>
          <Text dimColor>{"░".repeat(12)}</Text>
        </Box>
      )
    }

    function FullBoard() {
      return (
        <>
          <Box id="top-bar" flexShrink={0} backgroundColor="white">
            <Text color="gray">Board: My Project</Text>
          </Box>
          <Box flexGrow={1} flexDirection="column" overflow="hidden">
            <Text>Card 1: Task A</Text>
            <Text>Card 2: Task B</Text>
            <Text>Card 3: Task C</Text>
          </Box>
          <Box id="bottom-bar" flexShrink={0}>
            <Text dimColor>DISK 📁 ~/project CARDS VIEW</Text>
          </Box>
        </>
      )
    }

    function App() {
      const phase = useApp((s: AppStore) => s.phase)
      return (
        <Box flexDirection="column" width={60} height={20} overflow="hidden">
          {phase === "loading" ? <LoadingSkeleton /> : <FullBoard />}
        </Box>
      )
    }

    const handle = await app.run(<App />, { cols: 60, rows: 20 })

    // Initial: loading skeleton
    expect(handle.text).toContain("░░░")

    // Transition to full board — tree restructure, childrenDirty on parent
    // INKX_CHECK_INCREMENTAL will catch any mismatch
    await handle.press("r")

    expect(handle.text).toContain("Board: My Project")
    expect(handle.text).toContain("Card 1: Task A")
    expect(handle.text).toContain("CARDS VIEW")

    handle.unmount()
  })

  /**
   * Combined scenario: tree restructure THEN text-only update.
   * First render: loading skeleton.
   * Second render: full board (childrenDirty).
   * Third render: BottomBar text changes (subtreeDirty only).
   * The third render uses prevBuffer from the tree-restructure render.
   */
  it("correct incremental after tree restructure + text update", async () => {
    interface AppStore {
      phase: "loading" | "ready"
      logCount: number
      setPhase: (p: "loading" | "ready") => void
      setLogCount: (n: number) => void
    }

    const app = createApp<AppStore>(
      () => (set) => ({
        phase: "loading" as const,
        logCount: 0,
        setPhase: (p: "loading" | "ready") => set({ phase: p }),
        setLogCount: (n: number) => set({ logCount: n }),
      }),
      {
        key: (input, _key, { get }) => {
          if (input === "r") get().setPhase("ready")
          if (input === "l") get().setLogCount(get().logCount + 1)
          if (input === "q") return "exit"
        },
      },
    )

    function App() {
      const phase = useApp((s: AppStore) => s.phase)
      const logCount = useApp((s: AppStore) => s.logCount)

      if (phase === "loading") {
        return (
          <Box flexDirection="column" width={60} height={20}>
            <Text dimColor>{"░".repeat(20)}</Text>
          </Box>
        )
      }

      return (
        <Box flexDirection="column" width={60} height={20} overflow="hidden">
          <Box id="top-bar" flexShrink={0} backgroundColor="white">
            <Text color="gray">Header</Text>
          </Box>
          <Box flexGrow={1} overflow="hidden">
            <Text>Content</Text>
          </Box>
          <Box id="bottom-bar" flexShrink={0}>
            <Text dimColor>{logCount > 0 ? `💬${logCount} ` : ""}CARDS VIEW</Text>
          </Box>
        </Box>
      )
    }

    const handle = await app.run(<App />, { cols: 60, rows: 20 })
    expect(handle.text).toContain("░░░")

    // Phase 1: tree restructure
    await handle.press("r")
    expect(handle.text).toContain("Header")
    expect(handle.text).toContain("Content")

    // Phase 2: text-only update on prevBuffer from Phase 1
    await handle.press("l")
    expect(handle.text).toContain("💬1")
    expect(handle.text).toContain("Header") // TopBar must be preserved!

    // Phase 3: another text update
    await handle.press("l")
    expect(handle.text).toContain("💬2")
    expect(handle.text).toContain("Header")

    handle.unmount()
  })
})
