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
import { reconciler, createContainer, getContainerRoot } from "../src/reconciler.js"
import { executeRender } from "../src/pipeline/index.js"
import { AppContext, StdoutContext, TermContext, InputContext, EventsContext } from "../src/context.js"
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
function LayoutReporter({ label, onLayoutChange }: { label: string; onLayoutChange: (rect: Rect) => void }) {
  return (
    <Box borderStyle="round" flexGrow={1} onLayout={(layout) => onLayoutChange(layout)}>
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
        <LayoutReporter label="Pane A" onLayoutChange={handleLayoutChange("a")} />
        <LayoutReporter label="Pane B" onLayoutChange={handleLayoutChange("b")} />
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
function ViewerShell({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column" flexGrow={1} borderStyle="round" overflow="hidden">
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
function createProductionSimulator(element: React.ReactElement, cols = 60, rows = 20) {
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
     * Run the render pipeline with layout feedback loop.
     * executeRender must run inside act() so that forceUpdate/setState from
     * notifyLayoutSubscribers (Phase 2.7) are properly captured by React.
     * Loops until React has no more pending work from layout notifications.
     */
    renderPipeline() {
      const MAX_ITERATIONS = 5
      let result!: {
        text: string
        buffer: import("../src/buffer.js").TerminalBuffer
      }

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        onRenderCalled = false
        const prev = globalThis.IS_REACT_ACT_ENVIRONMENT
        globalThis.IS_REACT_ACT_ENVIRONMENT = true
        act(() => {
          const root = getContainerRoot(container)
          const { buffer } = executeRender(root, cols, rows, prevBuffer)
          prevBuffer = buffer
          result = { text: bufferToText(buffer), buffer }
        })
        globalThis.IS_REACT_ACT_ENVIRONMENT = prev as boolean

        if (!onRenderCalled) break
      }

      return result
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
  it("useContentRect shows real dimensions after layout feedback loop", () => {
    // The test renderer's doRender() includes a layout feedback loop:
    // executeRender() fires notifyLayoutSubscribers (Phase 2.7) which queues
    // forceUpdate() from useContentRect. The loop flushes React and re-renders
    // until stable, so dimensions are available on first render.
    const app = render(
      <Box flexDirection="row" gap={1}>
        <SelfMeasuring label="A" />
        <SelfMeasuring label="B" />
      </Box>,
    )

    const text = app.text
    expect(text).toContain("A:")
    expect(text).toContain("B:")

    // Dimensions should be real values, not stuck at 0x0
    expect(text).not.toContain("0x0")
  })

  it("onLayout setState is flushed by layout feedback loop", () => {
    // The test renderer's layout feedback loop flushes React after
    // executeRender fires onLayout callbacks that call setState.
    const app = render(<LayoutContainer />)

    const text = app.text
    expect(text).toContain("Layout Results:")

    // Layout data should be available, not stuck at placeholder
    expect(text).not.toContain("No layout yet")
  })

  it("production cycle: useContentRect shows real dimensions with feedback loop", () => {
    // The production simulator now includes a layout feedback loop in
    // renderPipeline(). executeRender runs inside act(), so forceUpdate from
    // useContentRect is properly captured and flushed.
    const sim = createProductionSimulator(
      <Box flexDirection="row" gap={1}>
        <SelfMeasuring label="A" />
        <SelfMeasuring label="B" />
      </Box>,
    )

    try {
      // renderPipeline includes the feedback loop: executeRender fires
      // layout notifications, React flushes, re-renders until stable.
      const result = sim.renderPipeline()

      // Verify real dimensions (not stuck at 0x0)
      expect(result.text).not.toContain("0x0")
      expect(result.text).toContain("A:")
      expect(result.text).toContain("B:")

      // Compare incremental against fresh render — no corruption
      const fresh = sim.freshRender()
      const mismatches: string[] = []
      for (let y = 0; y < result.buffer.height; y++) {
        for (let x = 0; x < result.buffer.width; x++) {
          const inc = result.buffer.getCell(x, y)
          const fr = fresh.buffer.getCell(x, y)
          if (!cellEquals(inc, fr)) {
            mismatches.push(`(${x},${y}): inc='${inc.char}' fresh='${fr.char}'`)
          }
        }
      }

      expect(mismatches).toHaveLength(0)
    } finally {
      sim.unmount()
    }
  })

  it("production cycle: onLayout setState takes effect with feedback loop", () => {
    const sim = createProductionSimulator(<LayoutContainer />)

    try {
      // renderPipeline includes the feedback loop
      const result = sim.renderPipeline()

      // Layout data should be resolved (not stuck at placeholder)
      expect(result.text).toContain("Layout Results:")
      expect(result.text).not.toContain("No layout yet")

      // Compare incremental against fresh render — no corruption
      const fresh = sim.freshRender()
      const mismatches: string[] = []
      for (let y = 0; y < result.buffer.height; y++) {
        for (let x = 0; x < result.buffer.width; x++) {
          const inc = result.buffer.getCell(x, y)
          const fr = fresh.buffer.getCell(x, y)
          if (!cellEquals(inc, fr)) {
            mismatches.push(`(${x},${y}): inc='${inc.char}' fresh='${fr.char}'`)
          }
        }
      }

      expect(mismatches).toHaveLength(0)
    } finally {
      sim.unmount()
    }
  })
})
