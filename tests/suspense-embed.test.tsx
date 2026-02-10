/**
 * Suspense Embedded Rendering Tests (km-inkx.suspense-embed)
 *
 * Tests that staggered Suspense resolution within an embedded component
 * does not corrupt the parent's incremental rendering.
 *
 * Bug: When a component with multiple Suspense boundaries is rendered
 * inside another layout (e.g., viewer's Preview panel), the staggered
 * resolution of promises causes multiple partial re-renders that corrupt
 * the cloned buffer. Symptoms: sidebar disappears, frames bleed through,
 * borders overlap.
 *
 * The root cause is that `hideInstance`/`unhideInstance` only set
 * `contentDirty` and call `markSubtreeDirty`, but do NOT:
 * - Set `paintDirty` (needed for stale pixel clearing in cloned buffer)
 * - Set `layoutDirty` or call `layoutNode.markDirty()` (needed when the
 *   hidden content has different dimensions than the fallback)
 * - Set `childrenDirty` on the parent (needed to force child re-render
 *   so sibling content at shifted positions gets repainted)
 *
 * Without these, the incremental renderer's fast-path skipping and
 * stale-pixel clearing logic fails for siblings of the Suspense boundary.
 */

import React, { Suspense, use, useState } from "react"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { run, useInput } from "../src/runtime/run.tsx"
import { createRenderer, bufferToText } from "../src/testing/index.js"

// ============================================================================
// Incremental rendering is enabled by default in createRenderer.
// This matches production behavior and is critical for reproducing this bug.
// ============================================================================

const render = createRenderer({ cols: 60, rows: 20, incremental: true })

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a controllable suspending resource.
 * On first call to read(), throws a promise. After resolve(), returns the value.
 */
function createResource<T>(): {
  read: () => T
  resolve: (value: T) => void
  isResolved: () => boolean
} {
  let resolved = false
  let resolvedValue: T
  let resolvePromise: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    resolvePromise = (value: T) => {
      resolved = true
      resolvedValue = value
      resolve(value)
    }
  })

  return {
    read: () => {
      if (resolved) return resolvedValue
      throw promise
    },
    resolve: (value: T) => resolvePromise(value),
    isResolved: () => resolved,
  }
}

/**
 * Component that suspends by calling read().
 */
function SuspendingComponent({ read }: { read: () => string }) {
  const value = read()
  return <Text>{value}</Text>
}

/**
 * Multi-line suspending component (to test layout shifts when resolved
 * content has different height than fallback).
 */
function SuspendingMultiLine({
  read,
  borderColor,
}: {
  read: () => string[]
  borderColor?: string
}) {
  const lines = read()
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor ?? "gray"}
    >
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  )
}

// ============================================================================
// Tests: Synchronous path (createRenderer with act())
// ============================================================================

describe("Suspense embedded: staggered resolution with incremental rendering", () => {
  test("three Suspense boundaries resolving one at a time - siblings stay correct", () => {
    const res1 = createResource<string>()
    const res2 = createResource<string>()
    const res3 = createResource<string>()

    function EmbeddedApp() {
      return (
        <Box flexDirection="column">
          <Suspense fallback={<Text>Loading A...</Text>}>
            <SuspendingComponent read={res1.read} />
          </Suspense>
          <Suspense fallback={<Text>Loading B...</Text>}>
            <SuspendingComponent read={res2.read} />
          </Suspense>
          <Suspense fallback={<Text>Loading C...</Text>}>
            <SuspendingComponent read={res3.read} />
          </Suspense>
        </Box>
      )
    }

    // Outer layout: sidebar + content area (simulates viewer embedding)
    function OuterApp() {
      return (
        <Box flexDirection="row" width={60} height={20}>
          <Box
            flexDirection="column"
            width={20}
            borderStyle="round"
            borderColor="gray"
          >
            <Text bold>Sidebar</Text>
            <Text>Item 1</Text>
            <Text>Item 2</Text>
            <Text>Item 3</Text>
          </Box>
          <Box
            flexDirection="column"
            flexGrow={1}
            borderStyle="round"
            borderColor="cyan"
          >
            <Text bold>Content</Text>
            <EmbeddedApp />
          </Box>
        </Box>
      )
    }

    const app = render(<OuterApp />)

    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Item 1")
    expect(app.text).toContain("Item 2")
    expect(app.text).toContain("Item 3")
    expect(app.text).toContain("Content")
    expect(app.text).toContain("Loading A...")
    expect(app.text).toContain("Loading B...")
    expect(app.text).toContain("Loading C...")

    // Resolve one at a time
    res1.resolve("Data A loaded")
    app.rerender(<OuterApp />)

    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Item 1")
    expect(app.text).toContain("Data A loaded")
    expect(app.text).toContain("Loading B...")
    expect(app.text).toContain("Loading C...")
    expect(app.text).not.toContain("Loading A...")

    res2.resolve("Data B loaded")
    app.rerender(<OuterApp />)

    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Data A loaded")
    expect(app.text).toContain("Data B loaded")
    expect(app.text).toContain("Loading C...")

    res3.resolve("Data C loaded")
    app.rerender(<OuterApp />)

    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Data A loaded")
    expect(app.text).toContain("Data B loaded")
    expect(app.text).toContain("Data C loaded")
    expect(app.text).not.toContain("Loading")
  })

  test("INKX_STRICT: incremental matches fresh after each Suspense resolution", () => {
    const res1 = createResource<string>()
    const res2 = createResource<string>()

    function EmbeddedApp() {
      return (
        <Box flexDirection="column">
          <Suspense fallback={<Text>Loading section 1...</Text>}>
            <SuspendingComponent read={res1.read} />
          </Suspense>
          <Suspense fallback={<Text>Loading section 2...</Text>}>
            <SuspendingComponent read={res2.read} />
          </Suspense>
        </Box>
      )
    }

    function OuterApp() {
      return (
        <Box flexDirection="row" width={50} height={12}>
          <Box
            flexDirection="column"
            width={15}
            borderStyle="round"
            borderColor="gray"
          >
            <Text>Sidebar</Text>
            <Text>Nav 1</Text>
            <Text>Nav 2</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            <Text bold>Main</Text>
            <EmbeddedApp />
            <Text dim>Status bar</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<OuterApp />)

    // Helper to compare buffers
    function assertBuffersMatch(label: string) {
      const freshBuf = app.freshRender()
      const incBuf = app.lastBuffer()!
      const freshText = bufferToText(freshBuf)
      const incText = bufferToText(incBuf)
      for (let y = 0; y < incBuf.height; y++) {
        for (let x = 0; x < incBuf.width; x++) {
          const incCell = incBuf.getCell(x, y)
          const freshCell = freshBuf.getCell(x, y)
          if (incCell.char !== freshCell.char) {
            expect.fail(
              `Mismatch at (${x},${y}) ${label}: ` +
                `incremental="${incCell.char}" fresh="${freshCell.char}"\n` +
                `--- incremental ---\n${incText}\n--- fresh ---\n${freshText}`,
            )
          }
        }
      }
    }

    assertBuffersMatch("after initial render")

    res1.resolve("Section 1 data")
    app.rerender(<OuterApp />)
    assertBuffersMatch("after first resolution")

    res2.resolve("Section 2 data")
    app.rerender(<OuterApp />)
    assertBuffersMatch("after second resolution")
  })

  test("hidden fallback text does not leak through incremental buffer", () => {
    const res = createResource<string>()

    function OuterApp() {
      return (
        <Box flexDirection="column" width={40} height={10}>
          <Text>Title</Text>
          <Suspense fallback={<Text>LOADING_INDICATOR_XYZ</Text>}>
            <SuspendingComponent read={res.read} />
          </Suspense>
          <Text>Bottom</Text>
        </Box>
      )
    }

    const app = render(<OuterApp />)
    expect(app.text).toContain("LOADING_INDICATOR_XYZ")

    res.resolve("SHORT")
    app.rerender(<OuterApp />)

    expect(app.text).toContain("SHORT")
    expect(app.text).toContain("Bottom")
    expect(app.text).not.toContain("LOADING_INDICATOR_XYZ")
    expect(app.text).not.toContain("LOADING")
  })
})

// ============================================================================
// Tests: Async path (run() with real concurrent scheduler)
//
// These tests exercise the production code path where Suspense promises
// resolve asynchronously, triggering onRender -> scheduleRender -> microtask.
// This is where the incremental rendering bug manifests because:
// 1. The render happens asynchronously after dirty flags are set
// 2. Between renders, other Suspense boundaries may resolve
// 3. The dirty flag propagation from hideInstance/unhideInstance may be
//    insufficient for the incremental renderer's stale-pixel detection
// ============================================================================

describe("Suspense embedded (async, ConcurrentRoot)", () => {
  const origActEnv = globalThis.IS_REACT_ACT_ENVIRONMENT
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  })
  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = origActEnv
  })

  test("staggered Suspense resolution: sidebar survives in async path", async () => {
    // Promise cache keyed by resource ID
    const cache = new Map<
      string,
      { promise: Promise<string>; resolve: (v: string) => void; value?: string }
    >()

    function getEntry(key: string) {
      let entry = cache.get(key)
      if (!entry) {
        let resolve!: (v: string) => void
        const promise = new Promise<string>((r) => {
          resolve = r
        })
        entry = { promise, resolve }
        cache.set(key, entry)
      }
      return entry
    }

    function resolveResource(key: string, value: string) {
      const entry = getEntry(key)
      entry.value = value
      entry.resolve(value)
    }

    function SuspendingData({ id }: { id: string }) {
      const entry = getEntry(id)
      if (entry.value !== undefined) {
        return <Text>{entry.value}</Text>
      }
      throw entry.promise
    }

    function App() {
      return (
        <Box flexDirection="row">
          <Box flexDirection="column" width={15} borderStyle="round" borderColor="gray">
            <Text bold>Sidebar</Text>
            <Text>Nav A</Text>
            <Text>Nav B</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            <Text bold>Content Area</Text>
            <Suspense fallback={<Text dim>Loading 1...</Text>}>
              <SuspendingData id="res1" />
            </Suspense>
            <Suspense fallback={<Text dim>Loading 2...</Text>}>
              <SuspendingData id="res2" />
            </Suspense>
            <Suspense fallback={<Text dim>Loading 3...</Text>}>
              <SuspendingData id="res3" />
            </Suspense>
            <Text>Footer</Text>
          </Box>
        </Box>
      )
    }

    const app = await run(<App />, { cols: 60, rows: 20 })

    // Initial render: all suspended
    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Nav A")
    expect(app.text).toContain("Nav B")
    expect(app.text).toContain("Content Area")
    expect(app.text).toContain("Loading 1...")
    expect(app.text).toContain("Loading 2...")
    expect(app.text).toContain("Loading 3...")
    expect(app.text).toContain("Footer")

    // Resolve first resource and wait for React to process
    resolveResource("res1", "Data from resource 1")
    // Wait for: promise microtask -> React retry -> commit -> onRender -> scheduleRender -> microtask -> doRender
    await new Promise((r) => setTimeout(r, 500))

    // Sidebar must survive
    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Nav A")
    expect(app.text).toContain("Nav B")
    // First resolved, others still loading
    expect(app.text).toContain("Data from resource 1")
    expect(app.text).toContain("Loading 2...")
    expect(app.text).toContain("Loading 3...")
    expect(app.text).toContain("Footer")

    // Resolve second resource
    resolveResource("res2", "Data from resource 2")
    await new Promise((r) => setTimeout(r, 500))

    // Sidebar must still survive
    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Nav A")
    expect(app.text).toContain("Nav B")
    expect(app.text).toContain("Data from resource 1")
    expect(app.text).toContain("Data from resource 2")
    expect(app.text).toContain("Loading 3...")
    expect(app.text).toContain("Footer")

    // Resolve third resource
    resolveResource("res3", "Data from resource 3")
    await new Promise((r) => setTimeout(r, 500))

    // Everything must be correct
    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Nav A")
    expect(app.text).toContain("Nav B")
    expect(app.text).toContain("Data from resource 1")
    expect(app.text).toContain("Data from resource 2")
    expect(app.text).toContain("Data from resource 3")
    expect(app.text).toContain("Footer")
    expect(app.text).not.toContain("Loading")

    app.unmount()
  })

  test("staggered resolution with different-height content: no corruption", async () => {
    const cache = new Map<
      string,
      { promise: Promise<string[]>; resolve: (v: string[]) => void; value?: string[] }
    >()

    function getEntry(key: string) {
      let entry = cache.get(key)
      if (!entry) {
        let resolve!: (v: string[]) => void
        const promise = new Promise<string[]>((r) => {
          resolve = r
        })
        entry = { promise, resolve }
        cache.set(key, entry)
      }
      return entry
    }

    function resolveResource(key: string, value: string[]) {
      const entry = getEntry(key)
      entry.value = value
      entry.resolve(value)
    }

    function SuspendingPanel({ id, color }: { id: string; color: string }) {
      const entry = getEntry(id)
      if (entry.value === undefined) throw entry.promise
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={color}>
          {entry.value.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      )
    }

    function App() {
      return (
        <Box flexDirection="column">
          <Text bold>Dashboard Header</Text>
          <Box flexDirection="row" gap={1}>
            <Suspense
              fallback={
                <Box borderStyle="round" borderColor="gray">
                  <Text dim>Panel 1...</Text>
                </Box>
              }
            >
              <SuspendingPanel id="panel1" color="green" />
            </Suspense>
            <Suspense
              fallback={
                <Box borderStyle="round" borderColor="gray">
                  <Text dim>Panel 2...</Text>
                </Box>
              }
            >
              <SuspendingPanel id="panel2" color="blue" />
            </Suspense>
          </Box>
          <Text>Status: All systems operational</Text>
        </Box>
      )
    }

    const app = await run(<App />, { cols: 60, rows: 20 })

    expect(app.text).toContain("Dashboard Header")
    expect(app.text).toContain("Panel 1...")
    expect(app.text).toContain("Panel 2...")
    expect(app.text).toContain("Status: All systems operational")

    // Resolve panel 1 with 3 lines (taller than the 1-line fallback)
    resolveResource("panel1", ["User: Alice", "Role: Admin", "Active: Yes"])
    await new Promise((r) => setTimeout(r, 500))

    expect(app.text).toContain("Dashboard Header")
    expect(app.text).toContain("User: Alice")
    expect(app.text).toContain("Role: Admin")
    expect(app.text).toContain("Active: Yes")
    expect(app.text).toContain("Panel 2...")
    expect(app.text).toContain("Status: All systems operational")

    // Resolve panel 2 with 2 lines
    resolveResource("panel2", ["Commits: 847", "PRs: 156"])
    await new Promise((r) => setTimeout(r, 500))

    expect(app.text).toContain("Dashboard Header")
    expect(app.text).toContain("User: Alice")
    expect(app.text).toContain("Commits: 847")
    expect(app.text).toContain("Status: All systems operational")
    expect(app.text).not.toContain("Panel 1...")
    expect(app.text).not.toContain("Panel 2...")

    app.unmount()
  })
})
