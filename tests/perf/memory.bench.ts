/**
 * Silvery Memory Benchmarks
 *
 * Measures memory usage under load: buffer allocation, layout node
 * creation, and render pipeline memory footprint. Uses vitest bench
 * mode but focuses on memory metrics rather than throughput.
 *
 * Key concern: Silvery uses pure JS (Flexily) — no WASM linear memory
 * that can't shrink. Memory should stay constant across re-renders
 * and shrink when component trees shrink.
 *
 * Run: bun vitest bench vendor/silvery/tests/perf/memory.bench.ts
 */

import React from "react"
import { bench, describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { createBuffer } from "@silvery/term/buffer"
import { ensureDefaultLayoutEngine, getLayoutEngine } from "@silvery/term/layout-engine"
import { FlatList, CursorList } from "./fixtures"

// Top-level await — beforeAll with async is unreliable in vitest bench mode
await ensureDefaultLayoutEngine()
const engine = getLayoutEngine()

// ============================================================================
// Memory Measurement Utility
// ============================================================================

/**
 * Force GC and measure heap usage. Returns bytes.
 * Note: Bun's gc() is synchronous; Node's --expose-gc too.
 */
function measureHeapBytes(): number {
  if (typeof globalThis.gc === "function") {
    globalThis.gc()
  }
  // Bun and Node both support process.memoryUsage()
  return process.memoryUsage().heapUsed
}

// ============================================================================
// Buffer Allocation
// ============================================================================

describe("Memory: Buffer Allocation", () => {
  bench("Create 80x24 buffer", () => {
    createBuffer(80, 24)
  })

  bench("Create 200x50 buffer", () => {
    createBuffer(200, 50)
  })

  bench("Clone 80x24 buffer", () => {
    const buf = createBuffer(80, 24)
    buf.clone()
  })

  bench("Clone 200x50 buffer", () => {
    const buf = createBuffer(200, 50)
    buf.clone()
  })
})

// ============================================================================
// Layout Node Creation
// ============================================================================

describe("Memory: Layout Nodes", () => {
  bench("Create 100 flat nodes", () => {
    const root = engine.createNode()
    root.setWidth(80)
    root.setHeight(24)
    for (let i = 0; i < 100; i++) {
      const child = engine.createNode()
      child.setHeight(1)
      root.insertChild(child, i)
    }
  })

  bench("Create 1000 flat nodes", () => {
    const root = engine.createNode()
    root.setWidth(120)
    root.setHeight(40)
    for (let i = 0; i < 1000; i++) {
      const child = engine.createNode()
      child.setHeight(1)
      root.insertChild(child, i)
    }
  })
})

// ============================================================================
// Render Pipeline Memory (render + re-render stability)
// ============================================================================

describe("Memory: Render Pipeline", () => {
  // Hoist createRenderer() outside bench to prevent render leak —
  // auto-unmounts previous render on each call.
  const renderFlat = createRenderer({ cols: 80, rows: 24 })
  const renderCursor = createRenderer({ cols: 80, rows: 24 })

  bench("Initial render 100 items", () => {
    renderFlat(React.createElement(FlatList, { count: 100 }))
  })

  bench("Render + 10 re-renders (100 items)", () => {
    const app = renderCursor(React.createElement(CursorList, { count: 100, cursor: 0 }))
    for (let i = 1; i <= 10; i++) {
      app.rerender(React.createElement(CursorList, { count: 100, cursor: i % 100 }))
    }
  })
})

// ============================================================================
// Memory Stability Tests (non-bench, assertion-based)
// ============================================================================

describe("Memory: Stability", () => {
  test("heap does not grow during 50 re-renders of 100-item list", () => {
    const render = createRenderer({ cols: 80, rows: 24 })
    const app = render(React.createElement(CursorList, { count: 100, cursor: 0 }))

    // Warm up and stabilize
    for (let i = 0; i < 10; i++) {
      app.rerender(React.createElement(CursorList, { count: 100, cursor: i % 100 }))
    }

    const heapBefore = measureHeapBytes()

    // Run 50 more re-renders
    for (let i = 0; i < 50; i++) {
      app.rerender(React.createElement(CursorList, { count: 100, cursor: i % 100 }))
    }

    const heapAfter = measureHeapBytes()

    // Allow up to 2MB growth (GC timing makes exact measurement noisy)
    const growth = heapAfter - heapBefore
    expect(growth).toBeLessThan(2 * 1024 * 1024)
  })

  test("buffer clone does not leak when overwritten", () => {
    const heapBefore = measureHeapBytes()

    // Create and discard 100 buffer clones
    const base = createBuffer(80, 24)
    for (let i = 0; i < 100; i++) {
      const clone = base.clone()
      // Overwrite to simulate render pipeline usage
      clone.setCell(0, 0, {
        char: String(i % 10),
        fg: null,
        bg: null,
        underlineColor: null,
        attrs: {},
        wide: false,
        continuation: false,
      })
      // Let GC collect it
    }

    const heapAfter = measureHeapBytes()
    const growth = heapAfter - heapBefore

    // Should not grow significantly (buffers should be GC'd)
    expect(growth).toBeLessThan(1 * 1024 * 1024)
  })
})
