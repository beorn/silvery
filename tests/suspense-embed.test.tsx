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
 * ## Root Cause
 *
 * `hideInstance`/`unhideInstance` in host-config.ts only set `contentDirty`
 * and call `markSubtreeDirty`, but do NOT:
 * - Set `paintDirty` (needed for stale pixel clearing in cloned buffer)
 * - Set `layoutDirty` or call `layoutNode.markDirty()` (needed when the
 *   hidden content has different dimensions than the fallback)
 * - Set `childrenDirty` on the parent (needed to force child re-render
 *   so sibling content at shifted positions gets repainted)
 *
 * Additionally, hidden nodes still participate in layout calculation
 * (no `display: none` on Yoga node), and when hidden nodes are skipped
 * in content-phase.ts line 93, their dirty flags are NOT cleared, leading
 * to stale flag accumulation.
 *
 * ## Test Strategy
 *
 * Three approaches:
 * 1. Sync path (createRenderer + rerender): baseline showing it works with full reconciliation
 * 2. Direct dirty-flag simulation: manually set hidden + dirty flags exactly as
 *    hideInstance/unhideInstance do, then run incremental pipeline to expose mismatch
 * 3. Production cycle via createProductionSimulator: realistic async Suspense resolution
 */

import React, { Suspense, act } from "react"
import { describe, expect, it } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "../src/testing/index.js"
import {
  reconciler,
  createContainer,
  getContainerRoot,
} from "../src/reconciler.js"
import { executeRender } from "../src/pipeline/index.js"
import {
  AppContext,
  StdoutContext,
  TermContext,
  InputContext,
  EventsContext,
} from "../src/context.js"
import { createTerm } from "chalkx"
import { EventEmitter } from "node:events"
import { bufferToText, cellEquals, type TerminalBuffer } from "../src/buffer.js"
import type { InkxNode } from "../src/types.js"

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a controllable suspending resource.
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

function SuspendingComponent({ read }: { read: () => string }) {
  const value = read()
  return <Text>{value}</Text>
}

/**
 * Compare two buffers cell by cell, collecting mismatches.
 */
function findMismatches(
  inc: TerminalBuffer,
  fresh: TerminalBuffer,
): string[] {
  const mismatches: string[] = []
  for (let y = 0; y < inc.height; y++) {
    for (let x = 0; x < inc.width; x++) {
      const a = inc.getCell(x, y)
      const b = fresh.getCell(x, y)
      if (!cellEquals(a, b)) {
        mismatches.push(
          `(${x},${y}): inc='${a.char}' fresh='${b.char}'`,
        )
      }
    }
  }
  return mismatches
}

/**
 * Walk the node tree and find a node by predicate.
 */
function findNode(
  root: InkxNode,
  predicate: (node: InkxNode) => boolean,
): InkxNode | null {
  if (predicate(root)) return root
  for (const child of root.children) {
    const found = findNode(child, predicate)
    if (found) return found
  }
  return null
}

/**
 * Walk the node tree and find all nodes matching a predicate.
 */
function findNodes(
  root: InkxNode,
  predicate: (node: InkxNode) => boolean,
): InkxNode[] {
  const result: InkxNode[] = []
  function walk(node: InkxNode) {
    if (predicate(node)) result.push(node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return result
}

/**
 * Simulate what hideInstance does: set hidden=true, contentDirty=true,
 * and markSubtreeDirty (walk up ancestors setting subtreeDirty).
 * This is the EXACT logic from host-config.ts lines 562-569.
 */
function simulateHideInstance(node: InkxNode) {
  node.hidden = true
  node.contentDirty = true
  if (node.parent) {
    node.parent.contentDirty = true
  }
  // markSubtreeDirty: walk up setting subtreeDirty
  let ancestor: InkxNode | null = node
  while (ancestor && !ancestor.subtreeDirty) {
    ancestor.subtreeDirty = true
    ancestor = ancestor.parent
  }
}

/**
 * Simulate what unhideInstance does: set hidden=false, contentDirty=true,
 * and markSubtreeDirty.
 * This is the EXACT logic from host-config.ts lines 576-583.
 */
function simulateUnhideInstance(node: InkxNode) {
  node.hidden = false
  node.contentDirty = true
  if (node.parent) {
    node.parent.contentDirty = true
  }
  let ancestor: InkxNode | null = node
  while (ancestor && !ancestor.subtreeDirty) {
    ancestor.subtreeDirty = true
    ancestor = ancestor.parent
  }
}

// ============================================================================
// Production Simulator
// ============================================================================

function createProductionSimulator(
  element: React.ReactElement,
  cols = 60,
  rows = 20,
) {
  let onRenderCalled = false
  const container = createContainer(() => {
    onRenderCalled = true
  })

  const fiberRoot = reconciler.createContainer(
    container,
    1, // ConcurrentRoot
    null,
    false,
    null,
    "",
    () => {},
    () => {},
    () => {},
    null,
  )

  const mockStdout = {
    columns: cols,
    rows: rows,
    write: () => true,
    isTTY: true,
    on: () => mockStdout,
    off: () => mockStdout,
    once: () => mockStdout,
    removeListener: () => mockStdout,
    addListener: () => mockStdout,
  } as unknown as NodeJS.WriteStream

  const mockTerm = createTerm({ level: 3, columns: cols })
  const inputEmitter = new EventEmitter()
  const mockEvents: AsyncIterable<any> = {
    [Symbol.asyncIterator]: () => ({
      next: () => new Promise(() => {}),
    }),
  }

  function wrapElement(el: React.ReactElement) {
    return React.createElement(
      TermContext.Provider,
      { value: mockTerm },
      React.createElement(
        EventsContext.Provider,
        { value: mockEvents },
        React.createElement(
          AppContext.Provider,
          { value: { exit: () => {} } },
          React.createElement(
            StdoutContext.Provider,
            { value: { stdout: mockStdout, write: () => {} } },
            React.createElement(
              InputContext.Provider,
              {
                value: {
                  eventEmitter: inputEmitter,
                  exitOnCtrlC: false,
                },
              },
              el,
            ),
          ),
        ),
      ),
    )
  }

  // Initial reconciliation
  const prev = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  act(() => {
    reconciler.updateContainerSync(
      wrapElement(element),
      fiberRoot,
      null,
      null,
    )
    reconciler.flushSyncWork()
  })
  globalThis.IS_REACT_ACT_ENVIRONMENT = prev as boolean

  let prevBuffer: TerminalBuffer | null = null

  return {
    get root() {
      return getContainerRoot(container)
    },

    renderPipeline() {
      const root = getContainerRoot(container)
      const { buffer } = executeRender(root, cols, rows, prevBuffer)
      prevBuffer = buffer
      return { text: bufferToText(buffer), buffer }
    },

    async flushReact() {
      onRenderCalled = false
      const prev = globalThis.IS_REACT_ACT_ENVIRONMENT
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
        reconciler.flushSyncWork()
      })
      globalThis.IS_REACT_ACT_ENVIRONMENT = prev as boolean
      return onRenderCalled
    },

    freshRender() {
      const root = getContainerRoot(container)
      const { buffer } = executeRender(root, cols, rows, null, {
        skipLayoutNotifications: true,
        skipScrollStateUpdates: true,
      })
      return { text: bufferToText(buffer), buffer }
    },

    unmount() {
      const prev = globalThis.IS_REACT_ACT_ENVIRONMENT
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      act(() => {
        reconciler.updateContainer(null, fiberRoot, null, () => {})
      })
      globalThis.IS_REACT_ACT_ENVIRONMENT = prev as boolean
    },
  }
}

// ============================================================================
// Sync path tests (baseline)
// ============================================================================

const render = createRenderer({ cols: 60, rows: 20, incremental: true })

describe("Suspense embedded: sync path (baseline)", () => {
  it("staggered resolution with rerender: all content visible", () => {
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
    expect(app.text).toContain("Loading A...")
    expect(app.text).toContain("Loading B...")
    expect(app.text).toContain("Loading C...")

    res1.resolve("Data A loaded")
    app.rerender(<OuterApp />)
    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Data A loaded")

    res2.resolve("Data B loaded")
    app.rerender(<OuterApp />)
    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Data B loaded")

    res3.resolve("Data C loaded")
    app.rerender(<OuterApp />)
    expect(app.text).toContain("Sidebar")
    expect(app.text).toContain("Data C loaded")
    expect(app.text).not.toContain("Loading")
  })
})

// ============================================================================
// Direct dirty-flag simulation tests
//
// These tests render a tree, run the pipeline to get a prevBuffer, then
// MANUALLY toggle hidden flags with the SAME dirty-flag logic that
// hideInstance/unhideInstance use. This simulates the Suspense
// hide/unhide code path without depending on React's internal scheduling.
//
// The test then runs the pipeline incrementally and compares against a
// fresh render. If hideInstance/unhideInstance set insufficient dirty flags,
// the incremental render will not clear stale fallback pixels or will
// render at wrong positions.
// ============================================================================

describe("Suspense embedded: dirty-flag simulation", () => {
  it(
    "unhideInstance dirty flags: incremental must clear fallback pixels",
    () => {
      // Set up a tree with a "fallback" text node that's visible
      // and a "content" text node that's hidden.
      // This mirrors what Suspense does: fallback shown, content hidden.

      function App() {
        return (
          <Box flexDirection="row" width={60} height={10}>
            <Box
              flexDirection="column"
              width={20}
              borderStyle="round"
              borderColor="gray"
              id="sidebar"
            >
              <Text bold>Sidebar</Text>
              <Text>Nav 1</Text>
              <Text>Nav 2</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} id="content-area">
              <Text bold>Content</Text>
              {/* Two text nodes in a column - we'll hide/unhide them manually */}
              <Text testID="fallback">FALLBACK_TEXT_HERE</Text>
              <Text testID="real-content">REAL_CONTENT_DATA</Text>
              <Text>Footer</Text>
            </Box>
          </Box>
        )
      }

      const sim = createProductionSimulator(<App />)

      try {
        // Step 1: Initial render - both texts visible
        const initial = sim.renderPipeline()
        expect(initial.text).toContain("Sidebar")
        expect(initial.text).toContain("FALLBACK_TEXT_HERE")
        expect(initial.text).toContain("REAL_CONTENT_DATA")
        expect(initial.text).toContain("Footer")

        // Step 2: Simulate Suspense state: hide real-content, keep fallback visible
        // (This is what happens when content first suspends)
        const realContentNode = findNode(sim.root, (n) => {
          const props = n.props as any
          return props.testID === "real-content"
        })
        expect(realContentNode).toBeTruthy()
        simulateHideInstance(realContentNode!)

        // Run pipeline (incremental) - should show fallback, hide real-content
        const suspended = sim.renderPipeline()
        expect(suspended.text).toContain("FALLBACK_TEXT_HERE")
        expect(suspended.text).not.toContain("REAL_CONTENT_DATA")

        // Step 3: Now simulate Suspense resolution:
        // unhide real-content, hide fallback
        // This is EXACTLY what hideInstance/unhideInstance do
        const fallbackNode = findNode(sim.root, (n) => {
          const props = n.props as any
          return props.testID === "fallback"
        })
        expect(fallbackNode).toBeTruthy()

        simulateHideInstance(fallbackNode!)
        simulateUnhideInstance(realContentNode!)

        // Step 4: Run pipeline (incremental, uses prevBuffer from step 2)
        const resolved = sim.renderPipeline()

        // Step 5: Compare against fresh render
        const fresh = sim.freshRender()

        const mismatches = findMismatches(resolved.buffer, fresh.buffer)

        if (mismatches.length > 0) {
          throw new Error(
            `Incremental/fresh render mismatch after simulated unhide:\n` +
              `${mismatches.length} cells differ.\n` +
              `Incremental:\n${resolved.text}\n` +
              `Fresh:\n${fresh.text}\n` +
              `First 10 mismatches:\n${mismatches.slice(0, 10).join("\n")}`,
          )
        }

        // Verify content correctness
        expect(resolved.text).toContain("Sidebar")
        expect(resolved.text).toContain("REAL_CONTENT_DATA")
        expect(resolved.text).toContain("Footer")
        expect(resolved.text).not.toContain("FALLBACK_TEXT_HERE")
      } finally {
        sim.unmount()
      }
    },
  )

  it(
    "unhideInstance without layoutDirty: layout not recalculated after size change",
    () => {
      // The hidden node participates in layout (no display:none on Yoga).
      // When unhidden, its dimensions are whatever the layout engine last
      // calculated. If hideInstance didn't mark layoutDirty, the layout
      // engine won't recalculate, and nodes may be at wrong positions.

      function App() {
        return (
          <Box flexDirection="column" width={40} height={15}>
            <Text bold>Header</Text>
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor="green"
              testID="panel"
            >
              <Text>Panel Line 1</Text>
              <Text>Panel Line 2</Text>
              <Text>Panel Line 3</Text>
            </Box>
            <Text testID="fallback-text">Loading panel...</Text>
            <Text>Footer stays here</Text>
          </Box>
        )
      }

      const sim = createProductionSimulator(<App />, 40, 15)

      try {
        // Step 1: Render with all visible
        const initial = sim.renderPipeline()
        expect(initial.text).toContain("Header")
        expect(initial.text).toContain("Panel Line 1")
        expect(initial.text).toContain("Loading panel...")
        expect(initial.text).toContain("Footer stays here")

        // Step 2: Simulate Suspense state: hide panel, keep fallback
        const panelNode = findNode(sim.root, (n) => {
          const props = n.props as any
          return props.testID === "panel"
        })
        expect(panelNode).toBeTruthy()
        simulateHideInstance(panelNode!)

        const afterHide = sim.renderPipeline()
        expect(afterHide.text).toContain("Header")
        expect(afterHide.text).not.toContain("Panel Line 1")
        expect(afterHide.text).toContain("Loading panel...")

        // Step 3: Simulate resolution: unhide panel, hide fallback
        const fallbackNode = findNode(sim.root, (n) => {
          const props = n.props as any
          return props.testID === "fallback-text"
        })
        expect(fallbackNode).toBeTruthy()

        simulateUnhideInstance(panelNode!)
        simulateHideInstance(fallbackNode!)

        // Step 4: Incremental render
        const resolved = sim.renderPipeline()

        // Step 5: Fresh render for comparison
        const fresh = sim.freshRender()

        const mismatches = findMismatches(resolved.buffer, fresh.buffer)

        if (mismatches.length > 0) {
          throw new Error(
            `Layout shift mismatch after unhide (no layoutDirty):\n` +
              `${mismatches.length} cells differ.\n` +
              `Incremental:\n${resolved.text}\n` +
              `Fresh:\n${fresh.text}\n` +
              `First 10 mismatches:\n${mismatches.slice(0, 10).join("\n")}`,
          )
        }

        // Verify content correctness
        expect(resolved.text).toContain("Header")
        expect(resolved.text).toContain("Panel Line 1")
        expect(resolved.text).toContain("Panel Line 2")
        expect(resolved.text).toContain("Panel Line 3")
        expect(resolved.text).toContain("Footer stays here")
        expect(resolved.text).not.toContain("Loading panel...")
      } finally {
        sim.unmount()
      }
    },
  )

  it(
    "staggered unhide: accumulated stale pixels from multiple resolutions",
    () => {
      // Three "Suspense boundaries" that resolve one at a time.
      // Each resolution shows content + hides fallback.
      // After 3 staggered incremental renders, compare against fresh.

      function App() {
        return (
          <Box flexDirection="row" width={60} height={15}>
            <Box
              flexDirection="column"
              width={20}
              borderStyle="round"
              borderColor="gray"
              id="sidebar"
            >
              <Text bold>Sidebar</Text>
              <Text>Item A</Text>
              <Text>Item B</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="cyan">
              <Text bold>Content</Text>
              <Text testID="fallback-1">Loading 1...</Text>
              <Text testID="content-1">Content One</Text>
              <Text testID="fallback-2">Loading 2...</Text>
              <Text testID="content-2">Content Two</Text>
              <Text testID="fallback-3">Loading 3...</Text>
              <Text testID="content-3">Content Three</Text>
              <Text>Status bar</Text>
            </Box>
          </Box>
        )
      }

      const sim = createProductionSimulator(<App />)

      try {
        // Initial render: all visible
        const initial = sim.renderPipeline()
        expect(initial.text).toContain("Sidebar")

        // Simulate initial Suspense state: hide all content, show all fallbacks
        for (let i = 1; i <= 3; i++) {
          const contentNode = findNode(sim.root, (n) => {
            const props = n.props as any
            return props.testID === `content-${i}`
          })
          expect(contentNode).toBeTruthy()
          simulateHideInstance(contentNode!)
        }

        const suspended = sim.renderPipeline()
        expect(suspended.text).toContain("Loading 1...")
        expect(suspended.text).toContain("Loading 2...")
        expect(suspended.text).toContain("Loading 3...")
        expect(suspended.text).not.toContain("Content One")

        // Resolution 1: unhide content-1, hide fallback-1
        const content1 = findNode(sim.root, (n) => (n.props as any).testID === "content-1")!
        const fallback1 = findNode(sim.root, (n) => (n.props as any).testID === "fallback-1")!
        simulateUnhideInstance(content1)
        simulateHideInstance(fallback1)
        const after1 = sim.renderPipeline()

        // Resolution 2: unhide content-2, hide fallback-2
        const content2 = findNode(sim.root, (n) => (n.props as any).testID === "content-2")!
        const fallback2 = findNode(sim.root, (n) => (n.props as any).testID === "fallback-2")!
        simulateUnhideInstance(content2)
        simulateHideInstance(fallback2)
        const after2 = sim.renderPipeline()

        // Resolution 3: unhide content-3, hide fallback-3
        const content3 = findNode(sim.root, (n) => (n.props as any).testID === "content-3")!
        const fallback3 = findNode(sim.root, (n) => (n.props as any).testID === "fallback-3")!
        simulateUnhideInstance(content3)
        simulateHideInstance(fallback3)
        const after3 = sim.renderPipeline()

        // Compare final incremental vs fresh
        const fresh = sim.freshRender()
        const mismatches = findMismatches(after3.buffer, fresh.buffer)

        if (mismatches.length > 0) {
          throw new Error(
            `Staggered unhide mismatch:\n` +
              `${mismatches.length} cells differ.\n` +
              `Incremental:\n${after3.text}\n` +
              `Fresh:\n${fresh.text}\n` +
              `First 10 mismatches:\n${mismatches.slice(0, 10).join("\n")}`,
          )
        }

        // Verify all content visible, all fallbacks hidden
        expect(after3.text).toContain("Sidebar")
        expect(after3.text).toContain("Content One")
        expect(after3.text).toContain("Content Two")
        expect(after3.text).toContain("Content Three")
        expect(after3.text).toContain("Status bar")
        expect(after3.text).not.toContain("Loading 1...")
        expect(after3.text).not.toContain("Loading 2...")
        expect(after3.text).not.toContain("Loading 3...")
      } finally {
        sim.unmount()
      }
    },
  )
})

// ============================================================================
// Production cycle with real Suspense
// ============================================================================

describe("Suspense embedded: production cycle (real Suspense)", () => {
  it("async Suspense resolution via act: content appears after promise resolves", async () => {
    const res = createResource<string>()

    function App() {
      return (
        <Box flexDirection="row" width={60} height={15}>
          <Box
            flexDirection="column"
            width={20}
            borderStyle="round"
            borderColor="gray"
          >
            <Text bold>Sidebar</Text>
            <Text>Nav 1</Text>
            <Text>Nav 2</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1}>
            <Text bold>Content</Text>
            <Suspense fallback={<Text>Loading...</Text>}>
              <SuspendingComponent read={res.read} />
            </Suspense>
            <Text>Footer</Text>
          </Box>
        </Box>
      )
    }

    const sim = createProductionSimulator(<App />)

    try {
      // Initial render
      const initial = sim.renderPipeline()
      expect(initial.text).toContain("Sidebar")
      expect(initial.text).toContain("Loading...")
      expect(initial.text).toContain("Footer")

      // Resolve and flush
      res.resolve("Data loaded")
      await sim.flushReact()
      const resolved = sim.renderPipeline()

      // Verify content appeared
      expect(resolved.text).toContain("Sidebar")
      expect(resolved.text).toContain("Data loaded")
      expect(resolved.text).toContain("Footer")
      expect(resolved.text).not.toContain("Loading...")

      // Compare incremental vs fresh
      const fresh = sim.freshRender()
      const mismatches = findMismatches(resolved.buffer, fresh.buffer)
      expect(mismatches).toHaveLength(0)
    } finally {
      sim.unmount()
    }
  })
})
