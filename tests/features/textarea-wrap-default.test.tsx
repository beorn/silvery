/**
 * TextArea soft-wrap-by-default tests
 *
 * Bead: km-silvery.textarea-wrap-by-default
 *
 * Verifies that TextArea soft-wraps long single-line input by default. Long
 * input should produce multiple visual rows in `wrappedLines` (computed from
 * `wrapWidth`), and the cursor row position should reflect the wrapped row,
 * not stay glued to row 0.
 *
 * Also verifies the `wrap="off"` opt-out for terminal-style single-row inputs
 * where wrapping is undesirable.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, TextArea, useTextArea } from "silvery"
import { useBoxRect } from "@silvery/ag-react"

describe("TextArea wrap default", () => {
  test("long single-line input wraps to multiple visual rows by default", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    // 30 chars of "a" inside a 10-wide content box should wrap to 3 visual rows.
    // Box width=10 → contentWidth=10 → wrapWidth=10 → 30 chars wraps to 3 rows.
    function App() {
      return (
        <Box width={10}>
          <TextArea defaultValue={"a".repeat(30)} height={5} />
        </Box>
      )
    }

    const app = r(<App />)

    // The text is rendered across multiple rows.
    // If wrap were disabled, we'd see all 30 chars on one row but width=10
    // would clip to 10. With wrap on, three rows of "aaaaaaaaaa" each.
    const lines = app.lines
    // Find the rows containing "a".
    const aRows = lines.filter((l) => /^a+\s*$/.test(l))
    expect(aRows.length).toBeGreaterThanOrEqual(3)
  })

  test("cursor visible-row reflects wrapped row position by default", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    // 25 chars in a 10-wide box → wraps to 3 rows. Cursor is at end (offset 25),
    // which is on visual row 2 (third row), col 5.
    function App() {
      return (
        <Box width={10}>
          <TextArea defaultValue={"x".repeat(25)} height={5} />
        </Box>
      )
    }

    const app = r(<App />)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    // Cursor at end of "x".repeat(25) → row 2, col 5 (25 = 2*10 + 5)
    expect(cursor!.y).toBe(2)
    expect(cursor!.x).toBe(5)
  })

  test("wrap='off' keeps long input on a single visual row", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    // With wrap="off", 30 chars of "a" should NOT wrap — they stay on row 0,
    // and the cursor row is 0.
    function App() {
      return (
        <Box width={10}>
          <TextArea defaultValue={"a".repeat(30)} height={3} wrap="off" />
        </Box>
      )
    }

    const app = r(<App />)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    // With wrap off, cursor stays on row 0 (long line not split into multiple rows).
    expect(cursor!.y).toBe(0)
  })

  test("useTextArea exposes wrappedLines.length so callers can compute height", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    let observedWrappedLineCount = 0

    function HookProbe() {
      const { width } = useBoxRect()
      const ta = useTextArea({
        defaultValue: "a".repeat(30),
        height: 5,
        wrapWidth: width || 1,
      })
      observedWrappedLineCount = ta.wrappedLines.length
      return null
    }

    function App() {
      return (
        <Box width={10}>
          <HookProbe />
        </Box>
      )
    }

    r(<App />)
    // 30 chars / 10-wide → 3 visual rows
    expect(observedWrappedLineCount).toBeGreaterThanOrEqual(3)
  })
})
