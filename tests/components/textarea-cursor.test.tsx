/**
 * TextArea cursor positioning tests
 *
 * Verifies that the terminal cursor is positioned correctly relative to
 * the text content, accounting for border and padding offsets.
 *
 * Bug: km-silvery.textarea-cursor
 * The cursor was rendered ON the last typed character instead of AFTER it
 * because useCursor used the parent Box's scrollRect (which doesn't include
 * border/padding offset) instead of the content area position.
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, TextArea } from "silvery"

describe("TextArea cursor position", () => {
  test("cursor is after last character without border (uncontrolled)", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box>
          <TextArea defaultValue="X" height={3} />
        </Box>
      )
    }

    const app = r(<App />)

    // Uncontrolled with defaultValue="X" places cursor at end (position 1)
    // Without border, TextArea renders:
    // X                                        (row 0)
    //
    // The cursor should be AFTER "X", at column 1 (cursorCol=1)
    expect(app.text).toContain("X")
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    expect(cursor!.x).toBe(1)
    expect(cursor!.y).toBe(0)
  })

  test("cursor is after last character when borderStyle is set (uncontrolled)", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box>
          <TextArea defaultValue="X" height={3} borderStyle="single" />
        </Box>
      )
    }

    const app = r(<App />)

    // With borderStyle="single", TextArea renders:
    // ┌──────────────────────────────────────┐  (row 0)
    // │ X                                    │  (row 1) - border(1) + padding(1) + "X" at col 2
    // └──────────────────────────────────────┘  (row 2)
    //
    // The cursor should be AFTER "X", at column 3 (border=1 + padding=1 + cursorCol=1)
    // and row 1 (border=1 + visibleCursorRow=0)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    // Cursor col: 1 (border) + 1 (padding) + 1 (after "X") = 3
    expect(cursor!.x).toBe(3)
    // Cursor row: 1 (border) + 0 (visibleCursorRow) = 1
    expect(cursor!.y).toBe(1)
  })

  test("cursor position with border and multiple characters (uncontrolled)", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box>
          <TextArea defaultValue="Hello" height={3} borderStyle="single" />
        </Box>
      )
    }

    const app = r(<App />)

    // With borderStyle="single" and value "Hello" (cursor at end, col=5):
    // ┌──────────────────────────────────────┐
    // │ Hello                                │  - "H" at col 2, cursor after "o" at col 7
    // └──────────────────────────────────────┘
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    // Cursor col: 1 (border) + 1 (padding) + 5 (after "Hello") = 7
    expect(cursor!.x).toBe(7)
    // Cursor row: 1 (border) + 0 (visibleCursorRow) = 1
    expect(cursor!.y).toBe(1)
  })

  test("cursor inside padded parent without own border (showcase layout)", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    // Mirrors the textarea showcase: border on grandparent, padding on parent,
    // TextArea has no borderStyle of its own.
    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box borderStyle="single" flexDirection="column">
            <Box paddingX={1}>
              <TextArea defaultValue="X" height={3} />
            </Box>
          </Box>
        </Box>
      )
    }

    const app = r(<App />)

    // Structure:
    // (0,0) padding row
    // (1,1) ┌──────────────────────────────────────┐  border
    // (1,2) │ X                                    │  border + padded content
    // (1,3) │                                      │
    // (1,4) │                                      │
    // (1,5) └──────────────────────────────────────┘  border
    //
    // TextArea is inside <Box paddingX={1}>. useCursor reads that Box's
    // scrollRect (border box) and adds its paddingX=1 as content offset.
    // Parent Box is at x=2 (root padding=1 + border=1).
    // Content inside paddingX=1 starts at x=3.
    // Cursor after "X" = x=3 + 1 = 4.
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    // x: root-padding(1) + border(1) + parent-paddingX(1) + cursorCol(1) = 4
    expect(cursor!.x).toBe(4)
    // y: root-padding(1) + border(1) + visibleCursorRow(0) = 2
    expect(cursor!.y).toBe(2)
  })

  test("cursor position with border on second wrapped line (uncontrolled)", () => {
    const r = createRenderer({ cols: 20, rows: 10 })

    // With border+padding, content width = 20 - 2(border) - 2(padding) = 16
    // "AAAAAAAAAAAAAAAA" is exactly 16 chars, fills one line
    // "B" wraps to second line
    function App() {
      return (
        <Box>
          <TextArea defaultValue={"A".repeat(16) + "B"} height={5} borderStyle="single" />
        </Box>
      )
    }

    const app = r(<App />)

    // Cursor is at end of "B" on the second content line:
    // ┌──────────────────┐
    // │ AAAAAAAAAAAAAAAA │  (row 1)
    // │ B                │  (row 2) - cursor after "B" at col 3
    // │                  │
    // └──────────────────┘
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    // cursorCol = 1 (after "B"), row offset from border
    // Cursor col: 1 (border) + 1 (padding) + 1 (after "B") = 3
    expect(cursor!.x).toBe(3)
    // Cursor row: 1 (border) + 1 (second content line) = 2
    expect(cursor!.y).toBe(2)
  })
})
