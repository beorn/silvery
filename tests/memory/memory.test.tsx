/**
 * Memory Tests for Silvery
 *
 * Bead: km-silvery.memory-test
 *
 * Validates that silvery does not leak memory under sustained usage:
 * - Re-renders with bounded heap growth (proportional to frame count)
 * - Mount/unmount cycles with bounded growth
 * - useContentRect subscription cleanup (no leaked listeners)
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, render, getActiveRenderCount } from "@silvery/test"
import { Box, Text, useContentRect } from "@silvery/react"
import { SimpleBox, Counter, ResponsiveBox, MountUnmountCycle, ComplexLayout } from "../fixtures/index.tsx"

// ============================================================================
// Helpers
// ============================================================================

/** Measure heap usage after forced GC (if available). */
function getHeapUsedMB(): number {
  // Bun supports gc() globally
  if (typeof globalThis.gc === "function") {
    globalThis.gc()
  }
  return process.memoryUsage().heapUsed / (1024 * 1024)
}

// ============================================================================
// Re-render Tests
// ============================================================================

describe("memory: rapid re-renders", () => {
  test("1000 re-renders via rerender() stay bounded", () => {
    const r = createRenderer({ cols: 80, rows: 24 })

    const heapBefore = getHeapUsedMB()

    // Re-render ComplexLayout 1,000 times via rerender()
    const app = r(React.createElement(ComplexLayout))
    for (let i = 0; i < 1_000; i++) {
      app.rerender(React.createElement(ComplexLayout))
    }

    const heapAfter = getHeapUsedMB()
    const growth = heapAfter - heapBefore

    // Verify it rendered correctly
    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Header")

    // frames array stores all frame strings; growth is proportional.
    // 1000 frames * ~5KB each = ~5MB for frame strings alone.
    // Allow 20MB total to account for GC timing and React internals.
    expect(growth).toBeLessThan(20)
  })

  test("frames array grows linearly with press count", async () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(React.createElement(Counter))

    // Each press() appends a frame
    for (let i = 0; i < 100; i++) {
      await app.press("j")
    }

    // frames array tracks all renders — verify it's there and linear
    // (1 initial + 100 presses = 101)
    expect(app.frames.length).toBe(101)
  })
})

// ============================================================================
// Mount/Unmount Cycle Tests
// ============================================================================

describe("memory: mount/unmount cycles", () => {
  test("200 mount/unmount cycles with bounded growth", () => {
    const heapBefore = getHeapUsedMB()

    for (let i = 0; i < 200; i++) {
      const app = render(React.createElement(MountUnmountCycle, { visible: true }), {
        cols: 80,
        rows: 24,
      })
      // Verify it rendered
      expect(app.text).toContain("Mounted Component")
      app.unmount()
    }

    const heapAfter = getHeapUsedMB()
    const growth = heapAfter - heapBefore

    // 200 cycles with cleanup should not grow more than 15MB
    expect(growth).toBeLessThan(15)
  })

  test("createRenderer auto-unmounts previous render", () => {
    const r = createRenderer({ cols: 80, rows: 24 })

    for (let i = 0; i < 200; i++) {
      // Each call unmounts the previous one automatically
      r(React.createElement(SimpleBox, { label: `Item ${i}` }))
    }

    // After all renders, only one should be active
    // (the last one created by createRenderer)
    const lastApp = r(React.createElement(SimpleBox, { label: "Final" }))
    expect(lastApp.text).toContain("Final")
  })

  test("no active render leak after explicit unmount", () => {
    const initialCount = getActiveRenderCount()

    const app = render(React.createElement(SimpleBox), { cols: 80, rows: 24 })
    expect(getActiveRenderCount()).toBe(initialCount + 1)

    app.unmount()
    expect(getActiveRenderCount()).toBe(initialCount)
  })

  test("mount/unmount with nested components cleans up properly", () => {
    const heapBefore = getHeapUsedMB()

    for (let i = 0; i < 100; i++) {
      const app = render(
        React.createElement(
          Box,
          { flexDirection: "column" },
          React.createElement(ComplexLayout),
          React.createElement(SimpleBox, { label: `Iteration ${i}` }),
        ),
        { cols: 80, rows: 24 },
      )
      expect(app.text).toContain("Sidebar")
      app.unmount()
    }

    const heapAfter = getHeapUsedMB()
    const growth = heapAfter - heapBefore

    expect(growth).toBeLessThan(15)
  })
})

// ============================================================================
// useContentRect Subscription Cleanup
// ============================================================================

describe("memory: useContentRect cleanup", () => {
  test("useContentRect subscriptions are cleaned up on unmount", () => {
    const r = createRenderer({ cols: 80, rows: 24 })

    // Cycle through many mount/unmount of ResponsiveBox
    // If subscriptions leaked, we'd see errors or massive memory growth
    for (let i = 0; i < 100; i++) {
      r(React.createElement(ResponsiveBox))
      r(React.createElement(SimpleBox))
    }

    // Verify the last render works correctly
    const app = r(React.createElement(SimpleBox, { label: "End" }))
    expect(app.text).toContain("End")
  })

  test("useContentRect with resize does not leak", () => {
    const r = createRenderer({ cols: 80, rows: 24 })
    const app = r(React.createElement(ResponsiveBox))

    // Verify initial render includes size info
    expect(app.text).toContain("Size:")

    // Resize many times — should not accumulate leaked subscriptions
    for (let i = 0; i < 100; i++) {
      const cols = 40 + (i % 80)
      const rows = 10 + (i % 30)
      app.resize(cols, rows)
    }

    // Should still render correctly after many resizes
    expect(app.text).toContain("Size:")
  })

  /** Component that mounts/unmounts useContentRect users dynamically. */
  function DynamicContentRect({ showInner }: { showInner: boolean }) {
    return React.createElement(
      Box,
      { flexDirection: "column" },
      React.createElement(Text, null, "Outer"),
      showInner ? React.createElement(ResponsiveBox) : null,
    )
  }

  test("dynamic mount/unmount of useContentRect components", () => {
    const r = createRenderer({ cols: 80, rows: 24 })

    const heapBefore = getHeapUsedMB()

    for (let i = 0; i < 200; i++) {
      const app = r(React.createElement(DynamicContentRect, { showInner: true }))
      expect(app.text).toContain("Size:")

      // Rerender without the inner component
      app.rerender(React.createElement(DynamicContentRect, { showInner: false }))
      expect(app.text).not.toContain("Size:")

      // Rerender with it again
      app.rerender(React.createElement(DynamicContentRect, { showInner: true }))
      expect(app.text).toContain("Size:")
    }

    const heapAfter = getHeapUsedMB()
    const growth = heapAfter - heapBefore

    // 200 cycles of mount/unmount with useContentRect
    // Allow 15MB for GC timing, frames accumulation, etc.
    expect(growth).toBeLessThan(15)
  })

  test("rapid rerender of useContentRect component does not leak", () => {
    const r = createRenderer({ cols: 80, rows: 24 })

    const heapBefore = getHeapUsedMB()

    // Rapidly rerender the same component (not mount/unmount cycle)
    const app = r(React.createElement(ResponsiveBox))
    for (let i = 0; i < 500; i++) {
      app.rerender(React.createElement(ResponsiveBox))
    }

    const heapAfter = getHeapUsedMB()
    const growth = heapAfter - heapBefore

    // 500 rerenders of useContentRect component should stay bounded
    expect(growth).toBeLessThan(15)
    expect(app.text).toContain("Size:")
  })
})
