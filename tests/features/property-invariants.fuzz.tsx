/**
 * Property-Based Invariant Fuzz Tests
 *
 * Verifies structural properties of the rendering pipeline that hold
 * regardless of the specific output. These complement the incremental-vs-fresh
 * comparison by testing invariants that should always be true:
 *
 * 1. Idempotence: render twice with no state change → identical output
 * 2. No-op: setting state to the same value → buffer unchanged
 * 3. Inverse operations: apply + undo → buffer returns to original
 * 4. Viewport clipping: offscreen-only changes don't affect visible buffer
 *
 * ## Running
 *
 * ```bash
 * bun vitest run tests/features/property-invariants.fuzz.tsx
 * FUZZ=1 bun vitest run tests/features/property-invariants.fuzz.tsx
 * ```
 */

import React, { useState } from "react"
import { describe, expect } from "vitest"
import { test, gen, take } from "vimonkey/fuzz"
import { createRenderer, compareBuffers, formatMismatch, bufferToText } from "@silvery/test"
import { Box, Text, useInput } from "silvery"

// ============================================================================
// Assertion helpers
// ============================================================================

/**
 * Assert two buffers are identical. Throws with detailed diagnostic on mismatch.
 */
function assertBuffersEqual(
  bufA: ReturnType<ReturnType<ReturnType<typeof createRenderer>>["lastBuffer"]>,
  bufB: ReturnType<ReturnType<ReturnType<typeof createRenderer>>["lastBuffer"]>,
  context: { label: string; iteration?: number; action?: string },
): void {
  if (!bufA || !bufB) {
    expect.unreachable(`${context.label}: one or both buffers are null`)
    return
  }
  const mismatch = compareBuffers(bufA, bufB)
  if (mismatch) {
    const textA = bufferToText(bufA)
    const textB = bufferToText(bufB)
    const msg = formatMismatch(mismatch, {
      incrementalText: textA,
      freshText: textB,
      iteration: context.iteration,
      key: context.action,
    })
    expect.unreachable(`${context.label}:\n${msg}`)
  }
}

// ============================================================================
// Test Components
// ============================================================================

/** Simple counter for idempotence testing */
function IdempotentApp() {
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "k") setCount((c) => Math.max(0, c - 1))
  })
  return (
    <Box flexDirection="column" borderStyle="single">
      <Text>Count: {count}</Text>
      <Text>{count % 2 === 0 ? "even" : "odd"}</Text>
    </Box>
  )
}

/** App where "s" sets text to the same value (no-op) */
function NoOpApp() {
  const [text, setText] = useState("hello")
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === "s") setText("hello") // Set to same value — should be a no-op
    if (input === "c") {
      setText("changed")
      setCount((c) => c + 1)
    }
    if (input === "r") setText("hello") // Reset
  })
  return (
    <Box flexDirection="column" borderStyle="round">
      <Text>{text}</Text>
      <Text>updates: {count}</Text>
    </Box>
  )
}

/** App with toggle visibility for inverse operation testing */
function ToggleApp() {
  const [visible, setVisible] = useState(true)
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === "t") setVisible((v) => !v) // toggle visibility
    if (input === "j") setCount((c) => c + 1) // change content
  })
  return (
    <Box flexDirection="column" borderStyle="round">
      <Text>Header</Text>
      {visible && (
        <Box borderStyle="single">
          <Text>Content {count}</Text>
        </Box>
      )}
      <Text>Footer</Text>
    </Box>
  )
}

/** App with manual scrolling for viewport clipping tests */
function ScrollApp() {
  const [items, setItems] = useState(Array.from({ length: 20 }, (_, i) => `item-${i}`))
  const [scrollOffset, setScrollOffset] = useState(0)
  useInput((input) => {
    if (input === "a") setItems((prev) => [...prev, `item-${prev.length}`]) // add at end
    if (input === "j") setScrollOffset((o) => Math.min(o + 1, items.length - 1))
    if (input === "k") setScrollOffset((o) => Math.max(o - 1, 0))
  })

  const visible = items.slice(scrollOffset, scrollOffset + 10)
  return (
    <Box flexDirection="column" height={10} overflow="hidden">
      {visible.map((item, i) => (
        <Text key={scrollOffset + i}>{item}</Text>
      ))}
    </Box>
  )
}

// ============================================================================
// Fuzz Tests
// ============================================================================

describe("property invariants fuzz", () => {
  // --------------------------------------------------------------------------
  // 1. Idempotence: render twice with no state change → identical output
  // --------------------------------------------------------------------------

  describe("Idempotence", () => {
    const ACTIONS: [number, string][] = [
      [60, "j"], // increment
      [40, "k"], // decrement
    ]

    test.fuzz(
      "rendering twice without state change produces identical buffer",
      async () => {
        const render = createRenderer({ cols: 40, rows: 10 })
        const app = render(<IdempotentApp />)

        // Verify idempotence on initial render
        const initialBuffer = app.lastBuffer()
        const initialFresh = app.freshRender()
        assertBuffersEqual(initialBuffer, initialFresh, {
          label: "initial render not idempotent",
          iteration: 0,
        })

        let i = 1
        for await (const action of take(gen<string>(ACTIONS), 80)) {
          await app.press(action)

          // After each action, the incremental buffer should match fresh
          const incBuffer = app.lastBuffer()
          const freshBuffer = app.freshRender()
          assertBuffersEqual(incBuffer, freshBuffer, {
            label: "Idempotence: incremental vs first fresh",
            iteration: i,
            action,
          })

          // Second fresh render should also be identical (no side effects from freshRender)
          const freshBuffer2 = app.freshRender()
          assertBuffersEqual(freshBuffer, freshBuffer2, {
            label: "Idempotence: fresh vs second fresh",
            iteration: i,
            action,
          })

          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // 2. No-op: setting text to the same value → buffer unchanged
  // --------------------------------------------------------------------------

  describe("No-op invariant", () => {
    test.fuzz(
      "setting state to the same value does not change the buffer",
      async () => {
        const render = createRenderer({ cols: 40, rows: 10 })
        const app = render(<NoOpApp />)

        // Interleave real changes with no-op "s" presses
        const ACTIONS: [number, string][] = [
          [30, "s"], // no-op: set text to same value
          [30, "c"], // real change
          [20, "r"], // reset text to "hello"
          [20, "s"], // no-op again
        ]

        let i = 1
        for await (const action of take(gen<string>(ACTIONS), 80)) {
          // Capture buffer before action
          const bufferBefore = app.lastBuffer()

          await app.press(action)

          // After a no-op ("s" when text is already "hello"), buffer should be unchanged.
          // We can only check this when the action is "s" AND text was already "hello".
          // Since we can't easily query state, we check: if buffer text still shows "hello",
          // the buffer should match. For real changes, just verify incremental=fresh.
          const bufferAfter = app.lastBuffer()
          const freshAfter = app.freshRender()

          // Incremental should always match fresh (baseline correctness)
          assertBuffersEqual(bufferAfter, freshAfter, {
            label: "No-op: incremental vs fresh after action",
            iteration: i,
            action,
          })

          // If the action was "s" (set same value) and text didn't change,
          // the before and after buffers should be identical
          if (action === "s" && bufferBefore && bufferAfter) {
            const textBefore = bufferToText(bufferBefore)
            const textAfter = bufferToText(bufferAfter)
            if (textBefore.includes("hello") && textAfter.includes("hello")) {
              assertBuffersEqual(bufferBefore, bufferAfter, {
                label: "No-op: buffer should be unchanged after setting same value",
                iteration: i,
                action,
              })
            }
          }

          i++
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // 3. Inverse operations: toggle off + toggle on → buffer returns to original
  // --------------------------------------------------------------------------

  describe("Inverse operations", () => {
    test.fuzz(
      "toggle off then on returns buffer to original state",
      async () => {
        const render = createRenderer({ cols: 50, rows: 15 })
        const app = render(<ToggleApp />)

        // Apply some random content changes, then test toggle inverse
        const CONTENT_ACTIONS: [number, string][] = [
          [70, "j"], // change content
          [30, "t"], // toggle (we'll handle inverse explicitly)
        ]

        let i = 1
        for await (const action of take(gen<string>(CONTENT_ACTIONS), 60)) {
          await app.press(action)

          // After any action, verify incremental matches fresh (baseline)
          const incBuffer = app.lastBuffer()
          const freshBuffer = app.freshRender()
          assertBuffersEqual(incBuffer, freshBuffer, {
            label: "Inverse: baseline incremental vs fresh",
            iteration: i,
            action,
          })

          i++
        }

        // Now explicitly test the inverse property:
        // Capture current state, toggle off, toggle on → should match
        const beforeToggle = app.freshRender()
        const beforeText = bufferToText(beforeToggle)

        // If content is currently visible, toggle off then on
        // If content is currently hidden, toggle on then off
        await app.press("t") // first toggle
        await app.press("t") // second toggle (inverse)

        const afterInverse = app.lastBuffer()
        const afterInverseFresh = app.freshRender()

        // Incremental should match fresh after inverse
        assertBuffersEqual(afterInverse, afterInverseFresh, {
          label: "Inverse: incremental vs fresh after double toggle",
          iteration: i,
        })

        // The fresh render after inverse should match fresh render before
        // (since toggle+toggle is identity)
        const afterText = bufferToText(afterInverseFresh)
        if (beforeText !== afterText) {
          // Use text comparison since buffer objects may differ in identity
          expect.unreachable(
            `Inverse: double toggle changed output.\n--- before ---\n${beforeText}\n--- after ---\n${afterText}`,
          )
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )

    test.fuzz(
      "interleaved toggles preserve inverse property",
      async () => {
        const render = createRenderer({ cols: 50, rows: 15 })
        const app = render(<ToggleApp />)

        const ACTIONS: [number, string][] = [
          [40, "j"], // change content
          [60, "t"], // toggle
        ]

        let toggleCount = 0
        let i = 1

        for await (const action of take(gen<string>(ACTIONS), 80)) {
          if (action === "t") toggleCount++

          await app.press(action)

          // Always verify incremental matches fresh
          const incBuffer = app.lastBuffer()
          const freshBuffer = app.freshRender()
          assertBuffersEqual(incBuffer, freshBuffer, {
            label: "Inverse interleaved: incremental vs fresh",
            iteration: i,
            action,
          })

          i++
        }

        // After all random actions, ensure even number of toggles returns
        // to visible state. Apply compensating toggle if needed, then verify.
        if (toggleCount % 2 !== 0) {
          await app.press("t")
        }

        // Now content should be visible — apply toggle pair and verify identity
        const before = app.freshRender()
        await app.press("t")
        await app.press("t")
        const after = app.freshRender()

        const beforeText = bufferToText(before)
        const afterText = bufferToText(after)
        if (beforeText !== afterText) {
          expect.unreachable(
            `Inverse interleaved: toggle pair changed output.\n--- before ---\n${beforeText}\n--- after ---\n${afterText}`,
          )
        }

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // 4. Viewport clipping: offscreen-only changes don't affect visible buffer
  // --------------------------------------------------------------------------

  describe("Viewport clipping", () => {
    test.fuzz(
      "adding items beyond viewport does not change visible buffer",
      async () => {
        const render = createRenderer({ cols: 40, rows: 10 })
        const app = render(<ScrollApp />)

        // The viewport shows items 0-9 (10 items visible in height=10).
        // scrollOffset starts at 0, so items 0-9 are visible.
        // Adding items at the end (item-20, item-21, ...) should not change
        // the visible buffer since they're beyond the viewport.

        // First, verify initial state
        const initialBuffer = app.lastBuffer()
        const initialFresh = app.freshRender()
        assertBuffersEqual(initialBuffer, initialFresh, {
          label: "Viewport: initial incremental vs fresh",
          iteration: 0,
        })

        // Capture the buffer text with scrollOffset=0 showing items 0-9
        const beforeText = bufferToText(app.freshRender())

        // Add several items at the end — all beyond the visible viewport
        const ADD_COUNT = 10
        for (let i = 0; i < ADD_COUNT; i++) {
          await app.press("a") // adds item at end
        }

        const afterText = bufferToText(app.freshRender())

        // The visible portion should be identical since new items are offscreen
        // (scrollOffset is still 0, showing items 0-9, new items are 20+)
        if (beforeText !== afterText) {
          expect.unreachable(
            `Viewport: offscreen additions changed visible buffer.\n--- before ---\n${beforeText}\n--- after ---\n${afterText}`,
          )
        }

        // Also verify incremental matches fresh after all additions
        const incBuffer = app.lastBuffer()
        const freshBuffer = app.freshRender()
        assertBuffersEqual(incBuffer, freshBuffer, {
          label: "Viewport: incremental vs fresh after offscreen additions",
          iteration: ADD_COUNT,
        })

        app.unmount()
      },
      { timeout: 30_000 },
    )

    test.fuzz(
      "scrolling then adding offscreen items preserves visible buffer",
      async () => {
        const render = createRenderer({ cols: 40, rows: 10 })
        const app = render(<ScrollApp />)

        // Scroll down a random amount, then add items at the end.
        // If the added items are beyond the current viewport window,
        // the visible buffer should remain unchanged.

        const SCROLL_ACTIONS: [number, string][] = [
          [60, "j"], // scroll down
          [40, "k"], // scroll up
        ]

        // Do some random scrolling first
        let i = 1
        for await (const action of take(gen<string>(SCROLL_ACTIONS), 5)) {
          await app.press(action)

          // Baseline: incremental matches fresh
          const incBuffer = app.lastBuffer()
          const freshBuffer = app.freshRender()
          assertBuffersEqual(incBuffer, freshBuffer, {
            label: "Viewport scroll: incremental vs fresh",
            iteration: i,
            action,
          })

          i++
        }

        // Capture current visible state
        const beforeAdd = bufferToText(app.freshRender())
        const currentText = app.text

        // Check if the viewport text mentions any of the last few items
        // (items 15-19). If not, adding more items at the end is offscreen.
        const lastVisibleIndex = currentText.includes("item-9") ? 9 : -1

        // Add items at the end
        for (let j = 0; j < 5; j++) {
          await app.press("a")
        }

        const afterAdd = bufferToText(app.freshRender())

        // If we know the scroll position shows only early items (0-9),
        // the visible buffer should be unchanged. Even if we don't know
        // the exact scroll position, incremental must match fresh.
        if (lastVisibleIndex >= 0 && lastVisibleIndex < 15) {
          // We're viewing early items — additions at index 20+ are offscreen
          if (beforeAdd !== afterAdd) {
            expect.unreachable(
              `Viewport scroll: offscreen additions changed visible buffer.\n--- before ---\n${beforeAdd}\n--- after ---\n${afterAdd}`,
            )
          }
        }

        // Always verify incremental matches fresh
        const incBuffer = app.lastBuffer()
        const freshBuffer = app.freshRender()
        assertBuffersEqual(incBuffer, freshBuffer, {
          label: "Viewport scroll: incremental vs fresh after additions",
          iteration: i,
        })

        app.unmount()
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // Combined: all invariants under random interleaved mutations
  // --------------------------------------------------------------------------

  describe("Combined invariants", () => {
    /** App that supports multiple invariant checks in one component */
    function CombinedApp() {
      const [count, setCount] = useState(0)
      const [visible, setVisible] = useState(true)
      const [items, setItems] = useState(["alpha", "bravo", "charlie"])
      const [style, setStyle] = useState(0)

      const borders = ["single", "round", "double"] as const

      useInput((input) => {
        if (input === "j") setCount((c) => c + 1)
        if (input === "k") setCount((c) => Math.max(0, c - 1))
        if (input === "t") setVisible((v) => !v)
        if (input === "a") setItems((prev) => [...prev, `item-${prev.length}`])
        if (input === "d") setItems((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
        if (input === "b") setStyle((s) => (s + 1) % borders.length)
      })

      return (
        <Box flexDirection="column" borderStyle={borders[style]}>
          <Text>Count: {count}</Text>
          {visible && (
            <Box flexDirection="column" borderStyle="single">
              <Text bold>Visible section</Text>
              {items.map((item, i) => (
                <Text key={i}>
                  {i + 1}. {item}
                </Text>
              ))}
            </Box>
          )}
          <Text color="$fg-muted">Footer</Text>
        </Box>
      )
    }

    const COMBINED_ACTIONS: [number, string][] = [
      [20, "j"], // increment
      [10, "k"], // decrement
      [15, "t"], // toggle visibility
      [15, "a"], // add item
      [10, "d"], // delete item
      [15, "b"], // cycle border
    ]

    test.fuzz(
      "all invariants hold under combined random mutations",
      async () => {
        const render = createRenderer({ cols: 60, rows: 24 })
        const app = render(<CombinedApp />)

        // Verify idempotence on initial render
        const fresh1 = app.freshRender()
        const fresh2 = app.freshRender()
        assertBuffersEqual(fresh1, fresh2, {
          label: "Combined: initial fresh renders not idempotent",
          iteration: 0,
        })

        let i = 1
        for await (const action of take(gen<string>(COMBINED_ACTIONS), 120)) {
          await app.press(action)

          // Invariant 1: Incremental always matches fresh (correctness)
          const incBuffer = app.lastBuffer()
          const freshBuffer = app.freshRender()
          assertBuffersEqual(incBuffer, freshBuffer, {
            label: "Combined: incremental vs fresh",
            iteration: i,
            action,
          })

          // Invariant 2: Fresh render is idempotent (no side effects)
          const freshBuffer2 = app.freshRender()
          assertBuffersEqual(freshBuffer, freshBuffer2, {
            label: "Combined: fresh render idempotence",
            iteration: i,
            action,
          })

          i++
        }

        // Invariant 3: Toggle inverse at the end
        const beforeToggle = bufferToText(app.freshRender())
        await app.press("t")
        await app.press("t")
        const afterToggle = bufferToText(app.freshRender())
        if (beforeToggle !== afterToggle) {
          expect.unreachable(
            `Combined: toggle pair changed output.\n--- before ---\n${beforeToggle}\n--- after ---\n${afterToggle}`,
          )
        }

        app.unmount()
      },
      { timeout: 60_000 },
    )
  })
})
