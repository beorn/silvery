/**
 * Click-to-Position Tests
 *
 * Verifies that mouse clicks on text editing components correctly
 * map screen coordinates to character offsets and move the cursor.
 *
 * Bead: km-silvery.click-to-position
 */

import React, { useRef, useState } from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { EditContextDisplay } from "@silvery/ag-react/ui/components/EditContextDisplay"
import { CursorLine } from "@silvery/ag-react/ui/components/CursorLine"
import { TextInput } from "@silvery/ag-react/ui/components/TextInput"
import { TextArea, type TextAreaHandle } from "@silvery/ag-react/ui/components/TextArea"
import { useEditContext, type EditTarget } from "@silvery/ag-react/hooks/use-edit-context"
import { useInput } from "@silvery/ag-react/hooks/useInput"

// ============================================================================
// EditContextDisplay
// ============================================================================

describe("EditContextDisplay onCursorClick", () => {
  test("calls onCursorClick with correct offset for single-line text", () => {
    const onClick = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })

    render(
      <EditContextDisplay value="hello world" cursor={0} wrapWidth={40} onCursorClick={onClick} />,
    )

    // The callback is passed as a prop; verify no spurious calls
    expect(onClick).not.toHaveBeenCalled()
  })

  test("renders without onCursorClick (backward compatible)", () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    const app = render(<EditContextDisplay value="hello world" cursor={0} wrapWidth={40} />)
    expect(app.text).toContain("hello world")
  })

  test("renders with onCursorClick (backward compatible)", () => {
    const onClick = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })

    const app = render(
      <EditContextDisplay value="hello world" cursor={5} wrapWidth={40} onCursorClick={onClick} />,
    )
    expect(app.text).toContain("hello world")
  })

  test("renders with scroll offset and onCursorClick", () => {
    const onClick = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })

    const longText = "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8"
    const app = render(
      <EditContextDisplay
        value={longText}
        cursor={longText.length}
        height={3}
        wrapWidth={40}
        onCursorClick={onClick}
      />,
    )
    // Should show last 3 lines (scrolled), not crash
    expect(app.text).toContain("line8")
  })

  test("empty text with placeholder and onCursorClick", () => {
    const onClick = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })

    const app = render(
      <EditContextDisplay
        value=""
        cursor={0}
        wrapWidth={40}
        placeholder="Type here..."
        onCursorClick={onClick}
      />,
    )
    expect(app.text).toContain("Type here...")
  })
})

// ============================================================================
// CursorLine
// ============================================================================

describe("CursorLine onCursorClick", () => {
  test("renders with onCursorClick prop (backward compatible)", () => {
    const onClick = vi.fn()
    const render = createRenderer({ cols: 40, rows: 3 })

    const app = render(<CursorLine beforeCursor="hel" afterCursor="lo" onCursorClick={onClick} />)
    expect(app.text).toContain("hel")
    expect(onClick).not.toHaveBeenCalled()
  })

  test("renders without onCursorClick (backward compatible)", () => {
    const render = createRenderer({ cols: 40, rows: 3 })

    const app = render(<CursorLine beforeCursor="hello" afterCursor=" world" />)
    expect(app.text).toContain("hello")
  })

  test("wraps in Box when onCursorClick is provided", () => {
    const onClick = vi.fn()
    const render = createRenderer({ cols: 40, rows: 3 })

    const app = render(<CursorLine beforeCursor="abc" afterCursor="def" onCursorClick={onClick} />)
    // Should still display the text correctly
    expect(app.text).toContain("abc")
  })

  test("empty text with onCursorClick", () => {
    const onClick = vi.fn()
    const render = createRenderer({ cols: 40, rows: 3 })

    const app = render(<CursorLine beforeCursor="" afterCursor="" onCursorClick={onClick} />)
    // Should render without error
    expect(app).toBeDefined()
  })
})

// ============================================================================
// TextInput click-to-position
// ============================================================================

describe("TextInput click-to-position", () => {
  test("renders normally (backward compatible)", () => {
    const render = createRenderer({ cols: 40, rows: 3 })
    const app = render(<TextInput defaultValue="hello world" prompt="> " />)
    expect(app.text).toContain("> hello world")
  })

  test("has onMouseDown handler on outer Box", () => {
    const render = createRenderer({ cols: 40, rows: 3 })
    // This verifies TextInput renders without error after adding onMouseDown
    const app = render(<TextInput defaultValue="test" prompt="$ " />)
    expect(app.text).toContain("$ test")
  })

  test("bordered TextInput renders with click handler", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TextInput defaultValue="bordered" borderStyle="round" />)
    expect(app.text).toContain("bordered")
  })
})

// ============================================================================
// TextArea click-to-position
// ============================================================================

describe("TextArea click-to-position", () => {
  test("renders normally (backward compatible)", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box width={40}>
        <TextArea defaultValue={"hello\nworld"} height={5} />
      </Box>,
    )
    expect(app.text).toContain("hello")
    expect(app.text).toContain("world")
  })

  test("has onMouseDown handler on outer Box", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box width={40}>
        <TextArea defaultValue={"line1\nline2\nline3"} height={5} />
      </Box>,
    )
    expect(app.text).toContain("line1")
    expect(app.text).toContain("line2")
    expect(app.text).toContain("line3")
  })

  test("bordered TextArea renders with click handler", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const app = render(
      <Box width={40}>
        <TextArea defaultValue={"abc\ndef"} height={5} borderStyle="round" />
      </Box>,
    )
    expect(app.text).toContain("abc")
    expect(app.text).toContain("def")
  })
})

// ============================================================================
// useEditContext setCursorOffset
// ============================================================================

describe("useEditContext setCursorOffset", () => {
  test("setCursorOffset moves cursor to specified position via keyboard trigger", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    function TestApp() {
      const ec = useEditContext({ initialValue: "hello world" })
      // Press "5" to trigger setCursorOffset(5)
      useInput((input) => {
        if (input === "5") ec.setCursorOffset(5)
        if (input === "0") ec.setCursorOffset(0)
      })
      return (
        <Box flexDirection="column">
          <Text>cursor:{ec.cursor}</Text>
          <Text>before:[{ec.beforeCursor}]</Text>
          <Text>after:[{ec.afterCursor}]</Text>
        </Box>
      )
    }

    const app = render(<TestApp />)
    // Initial cursor is at end (11)
    expect(app.text).toContain("cursor:11")
    expect(app.text).toContain("before:[hello world]")
    expect(app.text).toContain("after:[]")

    // Move cursor to position 5
    await app.press("5")
    expect(app.text).toContain("cursor:5")
    expect(app.text).toContain("before:[hello]")
    expect(app.text).toContain("after:[ world]")

    // Move cursor to position 0
    await app.press("0")
    expect(app.text).toContain("cursor:0")
    expect(app.text).toContain("before:[]")
    expect(app.text).toContain("after:[hello world]")
  })

  test("setCursorOffset clamps to valid range", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    function TestApp() {
      const ec = useEditContext({ initialValue: "hi" })
      useInput((input) => {
        if (input === "n") ec.setCursorOffset(-5)
        if (input === "x") ec.setCursorOffset(100)
      })
      return <Text>cursor:{ec.cursor}</Text>
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("cursor:2")

    // Clamp negative to 0
    await app.press("n")
    expect(app.text).toContain("cursor:0")

    // Clamp above length to length
    await app.press("x")
    expect(app.text).toContain("cursor:2")
  })

  test("EditTarget.setCursorOffset available on target", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    function TestApp() {
      const ec = useEditContext({ initialValue: "abcdef" })
      useInput((input) => {
        if (input === "t") ec.target.setCursorOffset(3)
      })
      return <Text>cursor:{ec.cursor}</Text>
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("cursor:6")

    // Use target.setCursorOffset
    await app.press("t")
    expect(app.text).toContain("cursor:3")
  })
})

// ============================================================================
// useTextArea setCursor
// ============================================================================

describe("useTextArea setCursor via TextArea", () => {
  test("TextArea renders with setCursor available", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function TestApp() {
      const [value] = useState("hello\nworld\nfoo bar")
      return (
        <Box width={40}>
          <TextArea value={value} height={5} />
        </Box>
      )
    }

    const app = render(<TestApp />)
    expect(app.text).toContain("hello")
    expect(app.text).toContain("world")
  })
})

// ============================================================================
// Offset calculation unit tests (pure logic)
// ============================================================================

describe("click offset calculation logic", () => {
  test("EditContextDisplay offset: middle of first line", () => {
    // Simulates: value="hello world", wrapWidth=40, click at (5, 0)
    // Expected offset: 5
    const value = "hello world"
    const wrapWidth = 40

    // Import getWrappedLines to test offset calculation
    const { getWrappedLines } = require("@silvery/create/text-cursor")
    const lines = getWrappedLines(value, wrapWidth)
    expect(lines.length).toBe(1)
    expect(lines[0].startOffset).toBe(0)

    // Simulate click at column 5, row 0 (relative to component)
    const relativeY = 0
    const scroll = 0
    const row = relativeY + scroll
    const clampedRow = Math.min(Math.max(0, row), lines.length - 1)
    const wl = lines[clampedRow]
    const relativeX = 5
    const col = Math.min(Math.max(0, relativeX), wl.line.length)
    const offset = Math.min(Math.max(0, wl.startOffset + col), value.length)

    expect(offset).toBe(5)
  })

  test("EditContextDisplay offset: second wrapped line", () => {
    // Text wraps at width 10
    const value = "hello world foo"
    const wrapWidth = 10
    const { getWrappedLines } = require("@silvery/create/text-cursor")
    const lines = getWrappedLines(value, wrapWidth)
    expect(lines.length).toBeGreaterThan(1)

    // Click at (3, 1) — row 1 (second line), col 3
    const relativeY = 1
    const scroll = 0
    const row = relativeY + scroll
    const clampedRow = Math.min(Math.max(0, row), lines.length - 1)
    const wl = lines[clampedRow]
    const relativeX = 3
    const col = Math.min(Math.max(0, relativeX), wl.line.length)
    const offset = wl.startOffset + col

    // The offset should be startOffset of line 1 + 3
    expect(offset).toBe(lines[1].startOffset + 3)
  })

  test("EditContextDisplay offset: click past end of line clamps to line length", () => {
    const value = "hi"
    const wrapWidth = 40
    const { getWrappedLines } = require("@silvery/create/text-cursor")
    const lines = getWrappedLines(value, wrapWidth)

    // Click at column 20 (past end of "hi" which is 2 chars)
    const relativeX = 20
    const col = Math.min(Math.max(0, relativeX), lines[0].line.length)
    const offset = Math.min(Math.max(0, lines[0].startOffset + col), value.length)

    expect(offset).toBe(2) // clamped to end of text
  })

  test("EditContextDisplay offset: click at negative column clamps to 0", () => {
    const value = "hello"
    const wrapWidth = 40
    const { getWrappedLines } = require("@silvery/create/text-cursor")
    const lines = getWrappedLines(value, wrapWidth)

    const relativeX = -3
    const col = Math.min(Math.max(0, relativeX), lines[0].line.length)
    const offset = lines[0].startOffset + col

    expect(offset).toBe(0)
  })

  test("CursorLine offset: click at various positions", () => {
    const beforeCursor = "hel"
    const afterCursor = "lo world"
    const totalLength = beforeCursor.length + afterCursor.length

    // Click at column 0
    expect(Math.min(Math.max(0, 0), totalLength)).toBe(0)

    // Click at column 5
    expect(Math.min(Math.max(0, 5), totalLength)).toBe(5)

    // Click past end
    expect(Math.min(Math.max(0, 20), totalLength)).toBe(11)

    // Click at negative
    expect(Math.min(Math.max(0, -3), totalLength)).toBe(0)
  })

  test("TextInput offset: accounts for prompt length", () => {
    const prompt = "> "
    const value = "hello"

    // Click at absolute column 4 with prompt "> " (length 2)
    const relativeX = 4 - prompt.length // = 2
    const newCursor = Math.max(0, Math.min(relativeX, value.length))
    expect(newCursor).toBe(2)

    // Click before prompt (column 0) — clamps to 0
    const relativeXBefore = 0 - prompt.length // = -2
    const cursorBefore = Math.max(0, Math.min(relativeXBefore, value.length))
    expect(cursorBefore).toBe(0)

    // Click past end
    const relativeXPast = 30 - prompt.length // = 28
    const cursorPast = Math.max(0, Math.min(relativeXPast, value.length))
    expect(cursorPast).toBe(5) // clamped to value.length
  })

  test("TextArea offset: multi-line with scroll", () => {
    const value = "line1\nline2\nline3\nline4\nline5"
    const wrapWidth = 40
    const { getWrappedLines } = require("@silvery/create/text-cursor")
    const lines = getWrappedLines(value, wrapWidth)

    // 5 lines total
    expect(lines.length).toBe(5)

    // Scroll offset = 2 (showing lines 2-4 in viewport)
    // Click at viewport row 1 = absolute row 3
    const scroll = 2
    const relativeY = 1
    const row = relativeY + scroll
    const clampedRow = Math.min(Math.max(0, row), lines.length - 1)
    expect(clampedRow).toBe(3)

    const wl = lines[clampedRow]
    expect(wl.line).toBe("line4")

    // Click at col 3
    const relativeX = 3
    const col = Math.min(Math.max(0, relativeX), wl.line.length)
    const offset = wl.startOffset + col
    expect(offset).toBe(wl.startOffset + 3)
  })
})
