/**
 * Test: onLayout callback causes incremental render corruption
 *
 * Bug: km-inkx.onlayout-corruption
 *
 * When a component uses onLayout or useContentRect (which triggers re-renders
 * via forceUpdate), embedding it inside another app causes rendering artifacts:
 * overlapping borders, garbled text, frame bleed-through.
 *
 * ## Root Cause Analysis
 *
 * The render pipeline (executeRender) has Phase 2.7: notifyLayoutSubscribers.
 * This runs DURING the render pipeline, after layout but before content phase.
 * It fires subscriber callbacks synchronously:
 *
 * - useContentRect: calls forceUpdate() via useReducer
 * - onLayout (Box prop): calls user's callback which may call setState
 *
 * These React state updates are queued but NOT flushed during the current
 * executeRender() call. The pipeline continues with the content phase using
 * the OLD React tree state (before the layout-triggered updates).
 *
 * ### In the test renderer:
 * 1. act() -> React reconciles -> doRender() -> executeRender()
 * 2. Phase 2.7 fires notifyLayoutSubscribers
 * 3. useContentRect's forceUpdate() queues a React update
 * 4. doRender() finishes with the OLD tree (0x0 dimensions)
 * 5. The queued React update is NEVER flushed (no subsequent act())
 * 6. Result: useContentRect always shows {0,0,0,0}
 *
 * ### In the production scheduler:
 * 1. resetAfterCommit -> scheduleRender() -> queueMicrotask -> executeRender()
 * 2. Phase 2.7 fires notifyLayoutSubscribers
 * 3. forceUpdate()/setState queue React updates
 * 4. executeRender() finishes, prevBuffer saved
 * 5. React flushes pending updates -> resetAfterCommit -> scheduleRender()
 * 6. SECOND executeRender() runs with NEW tree but uses prevBuffer from step 4
 * 7. Dirty flags from step 2 were CLEARED by step 4's content phase
 * 8. The incremental renderer skips nodes that actually changed -> corruption
 *
 * ## Demonstration
 *
 * Tests 1-2: Show useContentRect/onLayout updates are orphaned (never flushed)
 * Tests 3-4: Show incremental corruption by simulating the production render
 *            cycle using the low-level reconciler + pipeline APIs directly
 */

import React, { useState, act } from "react"
import { describe, expect, it } from "vitest"
import { Box, Text, useContentRect, type Rect } from "../src/index.js"
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
import { bufferToText, cellEquals } from "../src/buffer.js"

const render = createRenderer({ cols: 60, rows: 20 })

// ============================================================================
// Test Components
// ============================================================================

/**
 * A component that uses useContentRect to display its own dimensions.
 * useContentRect calls forceUpdate() when layout changes, triggering a
 * re-render cycle.
 */
function SelfMeasuring({ label }: { label: string }) {
  const rect = useContentRect()
  return (
    <Box borderStyle="single" flexGrow={1}>
      <Text>
        {label}: {rect.width}x{rect.height}
      </Text>
    </Box>
  )
}

/**
 * A component that uses onLayout to store layout info in parent state.
 * The onLayout callback calls setState on the parent, scheduling a re-render.
 */
function LayoutReporter({
  label,
  onLayoutChange,
}: {
  label: string
  onLayoutChange: (rect: Rect) => void
}) {
  return (
    <Box
      borderStyle="round"
      flexGrow={1}
      onLayout={(layout) => onLayoutChange(layout)}
    >
      <Text>{label}</Text>
    </Box>
  )
}

/**
 * Parent component that embeds LayoutReporter children and displays
 * their reported dimensions.
 */
function LayoutContainer() {
  const [layouts, setLayouts] = useState<Record<string, Rect>>({})

  const handleLayoutChange = (pane: string) => (info: Rect) => {
    setLayouts((prev) => ({ ...prev, [pane]: info }))
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1} height={6}>
        <LayoutReporter
          label="Pane A"
          onLayoutChange={handleLayoutChange("a")}
        />
        <LayoutReporter
          label="Pane B"
          onLayoutChange={handleLayoutChange("b")}
        />
      </Box>
      <Box borderStyle="single" padding={1}>
        <Box flexDirection="column">
          <Text bold>Layout Results:</Text>
          {Object.entries(layouts).map(([pane, info]) => (
            <Text key={pane}>
              {pane}: {info.width}x{info.height}
            </Text>
          ))}
          {Object.keys(layouts).length === 0 && <Text dim>No layout yet</Text>}
        </Box>
      </Box>
    </Box>
  )
}

/**
 * Outer "viewer" shell for embedding.
 */
function ViewerShell({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold>{title}</Text>
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="round"
        overflow="hidden"
      >
        {children}
      </Box>
      <Text dim>Press q to quit</Text>
    </Box>
  )
}

// ============================================================================
// Helper: Simulate the production render cycle
// ============================================================================

/**
 * Set up a low-level render environment that mirrors the production
 * InkxInstance + RenderScheduler cycle. This allows us to control
 * when React flushes and when the render pipeline runs, exposing
 * the race condition between layout notifications and incremental rendering.
 */
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

  // Initial React reconciliation (inside act to flush effects)
  const prev = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  act(() => {
    reconciler.updateContainerSync(wrapElement(element), fiberRoot, null, null)
    reconciler.flushSyncWork()
  })
  globalThis.IS_REACT_ACT_ENVIRONMENT = prev as boolean

  let prevBuffer: import("../src/buffer.js").TerminalBuffer | null = null

  return {
    /**
     * Run the render pipeline (like scheduler.executeRender).
     * This is where notifyLayoutSubscribers fires, queuing React updates.
     */
    renderPipeline() {
      const root = getContainerRoot(container)
      const { buffer } = executeRender(root, cols, rows, prevBuffer)
      prevBuffer = buffer
      return { text: bufferToText(buffer), buffer }
    },

    /**
     * Flush any pending React work (simulates what happens when React's
     * scheduler processes the forceUpdate/setState from layout notifications).
     * Returns true if onRender was called (meaning React committed new work).
     */
    flushReact() {
      onRenderCalled = false
      const prev = globalThis.IS_REACT_ACT_ENVIRONMENT
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      act(() => {
        // act() will flush any pending React state updates
        reconciler.flushSyncWork()
      })
      globalThis.IS_REACT_ACT_ENVIRONMENT = prev as boolean
      return onRenderCalled
    },

    /**
     * Do a fresh render (no prevBuffer) for comparison.
     */
    freshRender() {
      const root = getContainerRoot(container)
      const { buffer } = executeRender(root, cols, rows, null, {
        skipLayoutNotifications: true,
        skipScrollStateUpdates: true,
      })
      return { text: bufferToText(buffer), buffer }
    },

    /**
     * Clean up.
     */
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
// Tests
// ============================================================================

describe("onLayout corruption", () => {
  it("useContentRect forceUpdate is never flushed - stuck at 0x0", () => {
    // BUG: useContentRect's forceUpdate() fires during executeRender's Phase 2.7
    // but the React state update is never flushed in the test renderer.
    // The component is permanently stuck showing 0x0 dimensions.
    const app = render(
      <Box flexDirection="row" gap={1}>
        <SelfMeasuring label="A" />
        <SelfMeasuring label="B" />
      </Box>,
    )

    const text = app.text
    expect(text).toContain("A:")
    expect(text).toContain("B:")

    // BUG: dimensions are stuck at 0x0 because forceUpdate from
    // notifyLayoutSubscribers (Phase 2.7) is never flushed.
    // This SHOULD show real dimensions like "A: 28x3" but shows "A: 0x0".
    expect(text).toContain("0x0")
  })

  it("onLayout setState is never flushed - always shows placeholder", () => {
    // BUG: onLayout fires during executeRender Phase 2.7, calling setState,
    // but the state update is never flushed.
    const app = render(<LayoutContainer />)

    const text = app.text
    expect(text).toContain("Layout Results:")

    // BUG: onLayout fires and calls setLayouts(), but the setState is
    // never flushed by the test renderer. Always shows "No layout yet".
    expect(text).toContain("No layout yet")
  })

  it.fails("production cycle: useContentRect should show real dimensions after flush", () => {
    // Simulate the production render cycle:
    // 1. React reconciles + render pipeline (layout notifications fire)
    // 2. React flushes pending updates from layout notifications
    // 3. Render pipeline again (incremental, using prevBuffer from step 1)
    // 4. Compare incremental result against fresh render

    const sim = createProductionSimulator(
      <Box flexDirection="row" gap={1}>
        <SelfMeasuring label="A" />
        <SelfMeasuring label="B" />
      </Box>,
    )

    try {
      // Step 1: First render pipeline run
      // This fires notifyLayoutSubscribers -> useContentRect's forceUpdate()
      const first = sim.renderPipeline()
      expect(first.text).toContain("0x0") // Still shows initial values

      // Step 2: Flush React - this processes the forceUpdate from Phase 2.7
      const hadPendingWork = sim.flushReact()

      // Step 3: Second render pipeline run (incremental, using prevBuffer from step 1)
      // THIS is where corruption happens: the React tree now has real dimensions
      // but the incremental renderer may not detect the change because dirty flags
      // were cleared by step 1.
      const second = sim.renderPipeline()

      // Step 4: Compare against fresh render
      const fresh = sim.freshRender()

      // Find any mismatches between incremental and fresh
      const mismatches: string[] = []
      for (let y = 0; y < second.buffer.height; y++) {
        for (let x = 0; x < second.buffer.width; x++) {
          const inc = second.buffer.getCell(x, y)
          const fr = fresh.buffer.getCell(x, y)
          if (!cellEquals(inc, fr)) {
            mismatches.push(`(${x},${y}): inc='${inc.char}' fresh='${fr.char}'`)
          }
        }
      }

      if (mismatches.length > 0) {
        throw new Error(
          `Incremental/fresh render mismatch: ${mismatches.length} cells differ.\n` +
            `Incremental text:\n${second.text}\n` +
            `Fresh text:\n${fresh.text}\n` +
            `Had pending React work: ${hadPendingWork}\n` +
            `First 10 mismatches:\n${mismatches.slice(0, 10).join("\n")}`,
        )
      }

      // If no mismatches, verify that layout data actually propagated
      // (if it didn't propagate, both incremental and fresh show 0x0 = no corruption
      // but the feature is broken)
      if (second.text.includes("0x0")) {
        // Layout updates were lost entirely - the feature is broken
        // even though there's no incremental corruption
        expect.fail(
          "useContentRect never received real dimensions.\n" +
            `hadPendingWork=${hadPendingWork}\n` +
            `Text after flush+re-render: ${second.text}`,
        )
      }
    } finally {
      sim.unmount()
    }
  })

  it.fails("production cycle: onLayout setState should take effect after flush", () => {
    const sim = createProductionSimulator(<LayoutContainer />)

    try {
      // Step 1: First render - onLayout fires, setState queued
      const first = sim.renderPipeline()
      expect(first.text).toContain("No layout yet")

      // Step 2: Flush pending React state updates
      const hadPendingWork = sim.flushReact()

      // Step 3: Incremental render with new tree state
      const second = sim.renderPipeline()

      // Step 4: Fresh render for comparison
      const fresh = sim.freshRender()

      const mismatches: string[] = []
      for (let y = 0; y < second.buffer.height; y++) {
        for (let x = 0; x < second.buffer.width; x++) {
          const inc = second.buffer.getCell(x, y)
          const fr = fresh.buffer.getCell(x, y)
          if (!cellEquals(inc, fr)) {
            mismatches.push(`(${x},${y}): inc='${inc.char}' fresh='${fr.char}'`)
          }
        }
      }

      if (mismatches.length > 0) {
        throw new Error(
          `Incremental/fresh render mismatch: ${mismatches.length} cells differ.\n` +
            `Incremental text:\n${second.text}\n` +
            `Fresh text:\n${fresh.text}\n` +
            `Had pending React work: ${hadPendingWork}\n` +
            `First 10 mismatches:\n${mismatches.slice(0, 10).join("\n")}`,
        )
      }

      // Verify the feature actually works
      if (second.text.includes("No layout yet")) {
        expect.fail(
          "onLayout setState never took effect.\n" +
            `hadPendingWork=${hadPendingWork}\n` +
            `Text: ${second.text}`,
        )
      }
    } finally {
      sim.unmount()
    }
  })
})
