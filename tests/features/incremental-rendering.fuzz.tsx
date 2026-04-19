/**
 * Incremental Rendering Fuzz Tests
 *
 * Verifies that incremental rendering produces identical output to fresh
 * rendering across random state transitions. The invariant:
 *
 *   incrementalBuffer === freshBuffer after every state change
 *
 * Incremental rendering skips unchanged subtrees and reuses buffer regions.
 * This is a correctness optimization — if the incremental result ever differs
 * from a from-scratch render, we have a ghost pixel / stale region bug.
 *
 * ## What This Tests
 *
 * The render phase incremental path:
 *   ag.render({ prevBuffer }) vs ag.render() (incremental vs fresh)
 *
 * Bugs targeted:
 *   - Ghost pixels from stale buffer regions not overwritten
 *   - Dirty flag propagation misses (parent not marked dirty when child changes)
 *   - Unmounted component content persisting in buffer
 *   - Clipping rect changes not invalidating affected cells
 *   - Style inheritance changes not propagating to cached subtrees
 *
 * ## Running
 *
 * ```bash
 * bun vitest run tests/features/incremental-rendering.fuzz.tsx
 * FUZZ=1 bun vitest run tests/features/incremental-rendering.fuzz.tsx
 * ```
 */

import React, { useState } from "react"
import { describe, expect } from "vitest"
import { test, gen, take } from "vimonkey/fuzz"
import { createRenderer, compareBuffers, formatMismatch, bufferToText } from "@silvery/test"
import { Box, Text, useInput } from "silvery"

// ============================================================================
// Test Components — simple stateful components that exercise various
// rendering paths: text changes, structural changes, style changes,
// visibility changes, and nesting.
// ============================================================================

/** Simple counter — text content changes on every increment */
function Counter() {
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "k") setCount((c) => Math.max(0, c - 1))
  })
  return (
    <Box flexDirection="column">
      <Text>Count: {count}</Text>
      <Text>{count % 2 === 0 ? "even" : "odd"}</Text>
    </Box>
  )
}

/** List that grows and shrinks — structural changes (add/remove children) */
function DynamicList() {
  const [items, setItems] = useState<string[]>(["alpha", "bravo"])
  useInput((input) => {
    if (input === "a") setItems((prev) => [...prev, `item-${prev.length + 1}`])
    if (input === "d") setItems((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
    if (input === "r")
      setItems((prev) => {
        if (prev.length < 2) return prev
        const copy = [...prev]
        const i = Math.min(1, copy.length - 1)
        ;[copy[0], copy[i]] = [copy[i]!, copy[0]!]
        return copy
      })
  })
  return (
    <Box flexDirection="column" borderStyle="round">
      <Text bold>Items ({items.length}):</Text>
      {items.map((item, i) => (
        <Text key={i}>
          {i + 1}. {item}
        </Text>
      ))}
    </Box>
  )
}

/** Nested boxes with conditional styling — style inheritance changes */
function StyledBoxes() {
  const [variant, setVariant] = useState(0)
  useInput((input) => {
    if (input === "n") setVariant((v) => (v + 1) % 4)
    if (input === "p") setVariant((v) => (v - 1 + 4) % 4)
  })

  const styles = [
    { border: "single" as const, bold: false, dim: false },
    { border: "round" as const, bold: true, dim: false },
    { border: "double" as const, bold: false, dim: true },
    { border: "single" as const, bold: true, dim: true },
  ]
  const s = styles[variant]!

  return (
    <Box flexDirection="column" borderStyle={s.border}>
      <Text bold={s.bold} dimColor={s.dim}>
        Variant {variant}
      </Text>
      <Box paddingX={1}>
        <Text>inner content {variant}</Text>
      </Box>
    </Box>
  )
}

/** Component with conditional children — tests unmount/remount paths */
function ConditionalContent() {
  const [mode, setMode] = useState<"a" | "b" | "empty">("a")
  useInput((input) => {
    if (input === "1") setMode("a")
    if (input === "2") setMode("b")
    if (input === "3") setMode("empty")
  })
  return (
    <Box flexDirection="column">
      <Text>Mode: {mode}</Text>
      {mode === "a" && (
        <Box borderStyle="single">
          <Text>Content A with some text</Text>
        </Box>
      )}
      {mode === "b" && (
        <Box borderStyle="round">
          <Text bold>Content B is different</Text>
          <Text>And has two lines</Text>
        </Box>
      )}
      {mode === "empty" && <Text>Nothing here</Text>}
    </Box>
  )
}

/** Multi-column layout — tests horizontal layout + width redistribution */
function MultiColumn() {
  const [cols, setCols] = useState(2)
  const [content, setContent] = useState("hello")
  useInput((input) => {
    if (input === "+") setCols((c) => Math.min(4, c + 1))
    if (input === "-") setCols((c) => Math.max(1, c - 1))
    if (input === "x") setContent((c) => c + "!")
    if (input === "z") setContent((c) => (c.length > 1 ? c.slice(0, -1) : c))
  })
  return (
    <Box>
      {Array.from({ length: cols }, (_, i) => (
        <Box key={i} borderStyle="single" flexGrow={1}>
          <Text>
            Col {i}: {content}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

// ============================================================================
// Assertion helper
// ============================================================================

/**
 * Compare incremental buffer against fresh render. Throws with detailed
 * diagnostic on mismatch.
 */
function assertIncrementalMatchesFresh(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  context: { action: string; iteration: number },
): void {
  const incBuf = app.lastBuffer()
  if (!incBuf) return // No buffer yet (shouldn't happen after press)

  const freshBuf = app.freshRender()
  const mismatch = compareBuffers(incBuf, freshBuf)
  if (mismatch) {
    const incText = bufferToText(incBuf)
    const freshText = bufferToText(freshBuf)
    const msg = formatMismatch(mismatch, {
      incrementalText: incText,
      freshText: freshText,
      iteration: context.iteration,
      key: context.action,
    })
    expect.unreachable(`Incremental rendering mismatch:\n${msg}`)
  }
}

// ============================================================================
// Fuzz Tests
// ============================================================================

describe("incremental rendering fuzz", () => {
  // --------------------------------------------------------------------------
  // Counter — pure text content changes
  // --------------------------------------------------------------------------

  describe("Counter (text changes)", () => {
    const COUNTER_ACTIONS: [number, string][] = [
      [60, "j"], // increment (more common to accumulate changes)
      [40, "k"], // decrement
    ]

    test.fuzz(
      "incremental matches fresh after random increments/decrements",
      async () => {
        const render = createRenderer({ cols: 40, rows: 10 })
        const app = render(<Counter />)

        // Check initial render
        assertIncrementalMatchesFresh(app, { action: "initial", iteration: 0 })

        let i = 1
        for await (const action of take(gen<string>(COUNTER_ACTIONS), 100)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // DynamicList — structural changes (add/remove/reorder children)
  // --------------------------------------------------------------------------

  describe("DynamicList (structural changes)", () => {
    const LIST_ACTIONS: [number, string][] = [
      [40, "a"], // add item
      [30, "d"], // delete last item
      [30, "r"], // reorder (swap first two)
    ]

    test.fuzz(
      "incremental matches fresh after add/remove/reorder",
      async () => {
        const render = createRenderer({ cols: 50, rows: 20 })
        const app = render(<DynamicList />)

        assertIncrementalMatchesFresh(app, { action: "initial", iteration: 0 })

        let i = 1
        for await (const action of take(gen<string>(LIST_ACTIONS), 80)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // StyledBoxes — style/border changes
  // --------------------------------------------------------------------------

  describe("StyledBoxes (style changes)", () => {
    const STYLE_ACTIONS: [number, string][] = [
      [60, "n"], // next variant
      [40, "p"], // previous variant
    ]

    test.fuzz(
      "incremental matches fresh after style cycling",
      async () => {
        const render = createRenderer({ cols: 40, rows: 10 })
        const app = render(<StyledBoxes />)

        assertIncrementalMatchesFresh(app, { action: "initial", iteration: 0 })

        let i = 1
        for await (const action of take(gen<string>(STYLE_ACTIONS), 60)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // ConditionalContent — mount/unmount paths
  // --------------------------------------------------------------------------

  describe("ConditionalContent (mount/unmount)", () => {
    const CONDITIONAL_ACTIONS: [number, string][] = [
      [33, "1"], // mode a
      [33, "2"], // mode b
      [34, "3"], // mode empty
    ]

    test.fuzz(
      "incremental matches fresh after mode switches",
      async () => {
        const render = createRenderer({ cols: 50, rows: 12 })
        const app = render(<ConditionalContent />)

        assertIncrementalMatchesFresh(app, { action: "initial", iteration: 0 })

        let i = 1
        for await (const action of take(gen<string>(CONDITIONAL_ACTIONS), 80)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // MultiColumn — horizontal layout redistribution
  // --------------------------------------------------------------------------

  describe("MultiColumn (layout changes)", () => {
    const COLUMN_ACTIONS: [number, string][] = [
      [25, "+"], // add column
      [25, "-"], // remove column
      [25, "x"], // grow content
      [25, "z"], // shrink content
    ]

    test.fuzz(
      "incremental matches fresh after column/content changes",
      async () => {
        const render = createRenderer({ cols: 80, rows: 10 })
        const app = render(<MultiColumn />)

        assertIncrementalMatchesFresh(app, { action: "initial", iteration: 0 })

        let i = 1
        for await (const action of take(gen<string>(COLUMN_ACTIONS), 80)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // Combined — all components interleaved in a single layout
  // --------------------------------------------------------------------------

  describe("Combined (all patterns)", () => {
    /** App that combines multiple patterns in one layout */
    function CombinedApp() {
      const [count, setCount] = useState(0)
      const [items, setItems] = useState(["one", "two", "three"])
      const [showExtra, setShowExtra] = useState(true)
      const [borderIdx, setBorderIdx] = useState(0)

      const borders = ["single", "round", "double"] as const

      useInput((input) => {
        if (input === "j") setCount((c) => c + 1)
        if (input === "k") setCount((c) => Math.max(0, c - 1))
        if (input === "a") setItems((prev) => [...prev, `item-${prev.length + 1}`])
        if (input === "d") setItems((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
        if (input === "t") setShowExtra((v) => !v)
        if (input === "b") setBorderIdx((i) => (i + 1) % borders.length)
      })

      return (
        <Box flexDirection="column">
          <Box borderStyle={borders[borderIdx]}>
            <Text>
              Count: {count} ({count % 2 === 0 ? "even" : "odd"})
            </Text>
          </Box>
          <Box flexDirection="column" borderStyle="round">
            {items.map((item, i) => (
              <Text key={i}>- {item}</Text>
            ))}
          </Box>
          {showExtra && (
            <Box borderStyle="single">
              <Text dimColor>Extra section visible</Text>
            </Box>
          )}
        </Box>
      )
    }

    const COMBINED_ACTIONS: [number, string][] = [
      [20, "j"], // increment counter
      [10, "k"], // decrement counter
      [20, "a"], // add list item
      [15, "d"], // delete list item
      [15, "t"], // toggle extra section
      [20, "b"], // cycle border style
    ]

    test.fuzz(
      "incremental matches fresh under combined mutations",
      async () => {
        const render = createRenderer({ cols: 60, rows: 24 })
        const app = render(<CombinedApp />)

        assertIncrementalMatchesFresh(app, { action: "initial", iteration: 0 })

        let i = 1
        for await (const action of take(gen<string>(COMBINED_ACTIONS), 150)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 60_000 },
    )
  })

  // --------------------------------------------------------------------------
  // Stress: small terminal — clipping edge cases
  // --------------------------------------------------------------------------

  describe("Small terminal (clipping stress)", () => {
    test.fuzz(
      "incremental matches fresh at 20x5",
      async () => {
        const render = createRenderer({ cols: 20, rows: 5 })
        const app = render(<DynamicList />)

        const actions: [number, string][] = [
          [50, "a"],
          [50, "d"],
        ]

        let i = 0
        for await (const action of take(gen<string>(actions), 60)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // Rapid toggling — same key hammered to stress dirty propagation
  // --------------------------------------------------------------------------

  describe("Rapid toggling", () => {
    test.fuzz(
      "toggle visibility rapidly",
      async () => {
        const render = createRenderer({ cols: 50, rows: 12 })
        const app = render(<ConditionalContent />)

        // Rapidly alternate between mode a and empty
        const actions: [number, string][] = [
          [50, "1"],
          [50, "3"],
        ]

        let i = 0
        for await (const action of take(gen<string>(actions), 100)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // ==========================================================================
  // Tier 3 — Complex rendering patterns: scroll, backgrounds, wrap, overlay,
  // multi-column board layout. These exercise rendering paths the simpler
  // components above don't cover.
  // ==========================================================================

  // --------------------------------------------------------------------------
  // ScrollableList — scroll offset changes with sticky-like header/footer
  // --------------------------------------------------------------------------

  describe("ScrollableList (scroll + overflow hidden)", () => {
    function ScrollableList() {
      const [offset, setOffset] = useState(0)
      const [items, setItems] = useState(
        Array.from({ length: 30 }, (_, i) => `Item ${i}: ${"x".repeat((i * 7) % 20)}`),
      )
      useInput((input) => {
        if (input === "j") setOffset((o) => Math.min(o + 1, items.length - 1))
        if (input === "k") setOffset((o) => Math.max(o - 1, 0))
        if (input === "a") setItems((prev) => [...prev, `Item ${prev.length}: new`])
        if (input === "d") setItems((prev) => (prev.length > 5 ? prev.slice(0, -1) : prev))
      })
      return (
        <Box flexDirection="column" height={15} borderStyle="single">
          <Box height={1}>
            <Text bold>Header (sticky-like)</Text>
          </Box>
          <Box flexDirection="column" overflow="hidden" flexGrow={1}>
            {items.slice(offset, offset + 12).map((item, i) => (
              <Text key={offset + i}>{item}</Text>
            ))}
          </Box>
          <Box height={1}>
            <Text dimColor>
              {offset}/{items.length}
            </Text>
          </Box>
        </Box>
      )
    }

    const SCROLL_ACTIONS: [number, string][] = [
      [35, "j"], // scroll down
      [30, "k"], // scroll up
      [20, "a"], // add item
      [15, "d"], // delete item
    ]

    test.fuzz(
      "incremental matches fresh after scroll and list mutations",
      async () => {
        const render = createRenderer({ cols: 60, rows: 18 })
        const app = render(<ScrollableList />)

        assertIncrementalMatchesFresh(app, { action: "initial", iteration: 0 })

        let i = 1
        for await (const action of take(gen<string>(SCROLL_ACTIONS), 120)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // NestedBg — background color inheritance chain with conditional middle layer
  // --------------------------------------------------------------------------

  describe("NestedBg (background inheritance)", () => {
    function NestedBg() {
      const [outerBg, setOuterBg] = useState<string | undefined>("blue")
      const [innerBg, setInnerBg] = useState<string | undefined>(undefined)
      const [showMiddle, setShowMiddle] = useState(true)
      useInput((input) => {
        if (input === "1")
          setOuterBg((bg) => (bg === "blue" ? "red" : bg === "red" ? undefined : "blue"))
        if (input === "2")
          setInnerBg((bg) => (bg === undefined ? "green" : bg === "green" ? "yellow" : undefined))
        if (input === "3") setShowMiddle((v) => !v)
      })
      return (
        <Box flexDirection="column" backgroundColor={outerBg} padding={1}>
          <Text>Outer bg: {outerBg ?? "none"}</Text>
          {showMiddle && (
            <Box flexDirection="column" padding={1}>
              <Text>Middle (transparent)</Text>
              <Box backgroundColor={innerBg} padding={1}>
                <Text>Inner bg: {innerBg ?? "none"}</Text>
              </Box>
            </Box>
          )}
        </Box>
      )
    }

    const BG_ACTIONS: [number, string][] = [
      [30, "1"], // cycle outer bg: blue → red → none → blue
      [30, "2"], // cycle inner bg: none → green → yellow → none
      [40, "3"], // toggle middle layer
    ]

    test.fuzz(
      "incremental matches fresh after background and structure changes",
      async () => {
        const render = createRenderer({ cols: 50, rows: 14 })
        const app = render(<NestedBg />)

        assertIncrementalMatchesFresh(app, { action: "initial", iteration: 0 })

        let i = 1
        for await (const action of take(gen<string>(BG_ACTIONS), 100)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // WrapTest — text near column width boundaries
  // --------------------------------------------------------------------------

  describe("WrapTest (wrap boundary stress)", () => {
    function WrapTest() {
      const [length, setLength] = useState(38) // Just under typical column width
      const [padding, setPadding] = useState(0)
      useInput((input) => {
        if (input === "j") setLength((l) => Math.min(l + 1, 50))
        if (input === "k") setLength((l) => Math.max(l - 1, 1))
        if (input === "p") setPadding((p) => (p + 1) % 4)
      })
      return (
        <Box flexDirection="column" borderStyle="single" paddingX={padding}>
          <Text>{"A".repeat(length)}</Text>
          <Text>After long text</Text>
        </Box>
      )
    }

    const WRAP_ACTIONS: [number, string][] = [
      [35, "j"], // grow text
      [35, "k"], // shrink text
      [30, "p"], // cycle padding
    ]

    test.fuzz(
      "incremental matches fresh as text crosses wrap boundary",
      async () => {
        const render = createRenderer({ cols: 45, rows: 8 })
        const app = render(<WrapTest />)

        assertIncrementalMatchesFresh(app, { action: "initial", iteration: 0 })

        let i = 1
        for await (const action of take(gen<string>(WRAP_ACTIONS), 100)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // OverlayApp — absolute positioned box over content
  // --------------------------------------------------------------------------

  describe("OverlayApp (absolute positioning)", () => {
    function OverlayApp() {
      const [showOverlay, setShowOverlay] = useState(false)
      const [content, setContent] = useState("base content")
      useInput((input) => {
        if (input === "o") setShowOverlay((v) => !v)
        if (input === "c") setContent((c) => (c === "base content" ? "changed!" : "base content"))
      })
      return (
        <Box flexDirection="column" width={40} height={10}>
          <Text>{content}</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
          {showOverlay && (
            <Box position="absolute" top={1} left={5} backgroundColor="red" padding={1}>
              <Text bold>Overlay</Text>
            </Box>
          )}
        </Box>
      )
    }

    const OVERLAY_ACTIONS: [number, string][] = [
      [50, "o"], // toggle overlay
      [50, "c"], // toggle content
    ]

    test.fuzz(
      "incremental matches fresh with overlay toggle and content changes",
      async () => {
        const render = createRenderer({ cols: 50, rows: 12 })
        const app = render(<OverlayApp />)

        assertIncrementalMatchesFresh(app, { action: "initial", iteration: 0 })

        let i = 1
        for await (const action of take(gen<string>(OVERLAY_ACTIONS), 100)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // BoardLayout — multi-column board with varying heights, selection, add/remove
  // --------------------------------------------------------------------------

  describe("BoardLayout (complex multi-column)", () => {
    function BoardLayout() {
      const [colCount, setColCount] = useState(3)
      const [selected, setSelected] = useState(0)
      const [items, setItems] = useState([
        ["Task 1", "Task 2", "Task 3"],
        ["Done 1", "Done 2"],
        ["Backlog 1", "Backlog 2", "Backlog 3", "Backlog 4"],
      ])
      useInput((input) => {
        if (input === "h") setSelected((s) => Math.max(0, s - 1))
        if (input === "l") setSelected((s) => Math.min(colCount - 1, s + 1))
        if (input === "+") setColCount((c) => Math.min(5, c + 1))
        if (input === "-") setColCount((c) => Math.max(1, c - 1))
        if (input === "a") {
          setItems((prev) => {
            const copy = prev.map((col) => [...col])
            if (copy[selected]) copy[selected]!.push(`New ${copy[selected]!.length}`)
            return copy
          })
        }
        if (input === "d") {
          setItems((prev) => {
            const copy = prev.map((col) => [...col])
            if (copy[selected]?.length) copy[selected]!.pop()
            return copy
          })
        }
      })
      return (
        <Box>
          {items.slice(0, colCount).map((col, ci) => (
            <Box
              key={ci}
              flexDirection="column"
              borderStyle={ci === selected ? "double" : "single"}
              flexGrow={1}
            >
              <Text bold>
                {ci === selected ? "\u25b6" : " "} Col {ci}
              </Text>
              {col.map((item, ii) => (
                <Text key={ii}> {item}</Text>
              ))}
            </Box>
          ))}
        </Box>
      )
    }

    const BOARD_ACTIONS: [number, string][] = [
      [20, "h"], // select left
      [20, "l"], // select right
      [15, "+"], // add column
      [15, "-"], // remove column
      [15, "a"], // add item to selected column
      [15, "d"], // delete item from selected column
    ]

    test.fuzz(
      "incremental matches fresh under board mutations",
      async () => {
        const render = createRenderer({ cols: 100, rows: 20 })
        const app = render(<BoardLayout />)

        assertIncrementalMatchesFresh(app, { action: "initial", iteration: 0 })

        let i = 1
        for await (const action of take(gen<string>(BOARD_ACTIONS), 150)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // BoardLayout at small terminal — clipping + multi-column stress
  // --------------------------------------------------------------------------

  describe("BoardLayout small terminal (clipping + columns)", () => {
    function SmallBoard() {
      const [selected, setSelected] = useState(0)
      const [items, setItems] = useState([
        ["A1", "A2", "A3"],
        ["B1", "B2"],
      ])
      useInput((input) => {
        if (input === "h") setSelected((s) => Math.max(0, s - 1))
        if (input === "l") setSelected((s) => Math.min(1, s + 1))
        if (input === "a") {
          setItems((prev) => {
            const copy = prev.map((col) => [...col])
            copy[selected]!.push(`${selected ? "B" : "A"}${copy[selected]!.length + 1}`)
            return copy
          })
        }
        if (input === "d") {
          setItems((prev) => {
            const copy = prev.map((col) => [...col])
            if (copy[selected]!.length > 0) copy[selected]!.pop()
            return copy
          })
        }
      })
      return (
        <Box>
          {items.map((col, ci) => (
            <Box
              key={ci}
              flexDirection="column"
              borderStyle={ci === selected ? "double" : "single"}
              flexGrow={1}
            >
              <Text bold>Col {ci}</Text>
              {col.map((item, ii) => (
                <Text key={ii}> {item}</Text>
              ))}
            </Box>
          ))}
        </Box>
      )
    }

    const SMALL_BOARD_ACTIONS: [number, string][] = [
      [25, "h"],
      [25, "l"],
      [25, "a"],
      [25, "d"],
    ]

    test.fuzz(
      "incremental matches fresh at 30x8",
      async () => {
        const render = createRenderer({ cols: 30, rows: 8 })
        const app = render(<SmallBoard />)

        assertIncrementalMatchesFresh(app, { action: "initial", iteration: 0 })

        let i = 1
        for await (const action of take(gen<string>(SMALL_BOARD_ACTIONS), 80)) {
          await app.press(action)
          assertIncrementalMatchesFresh(app, { action, iteration: i })
          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })
})
