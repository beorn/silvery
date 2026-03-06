/**
 * Tests for TextArea component
 *
 * Covers:
 * - Basic typing and display
 * - Multi-line editing (Enter to insert newlines)
 * - Cursor movement (arrows, Home/End, Ctrl+A/E)
 * - Word wrapping at component width
 * - Scrolling when content exceeds viewport
 * - Kill line shortcuts (Ctrl+K, Ctrl+U)
 * - Controlled vs uncontrolled modes
 * - Placeholder display
 * - Submit handling
 * - PageUp/PageDown
 */
import React, { useState } from "react"
import { describe, expect, test, vi } from "vitest"
import { Box, Text, type App } from "../src/index.ts"
import { TextArea } from "../src/components/TextArea.tsx"
import { createRenderer } from "@hightea/term/testing"

// ============================================================================
// Test helpers
// ============================================================================

/** Type a string character-by-character using app.press() */
function typeString(app: App, s: string) {
  for (const ch of s) {
    app.stdin.write(ch)
  }
}

/** Controlled TextArea wrapper for testing */
function ControlledTextArea(props: {
  onChange?: (v: string) => void
  onSubmit?: (v: string) => void
  height?: number
  submitKey?: "ctrl+enter" | "enter" | "meta+enter"
  placeholder?: string
  isActive?: boolean
  initialValue?: string
  scrollMargin?: number
  disabled?: boolean
  maxLength?: number
}) {
  const [value, setValue] = useState(props.initialValue ?? "")
  return (
    <Box flexDirection="column" width={20}>
      <TextArea
        value={value}
        onChange={(v) => {
          setValue(v)
          props.onChange?.(v)
        }}
        onSubmit={props.onSubmit}
        height={props.height ?? 5}
        submitKey={props.submitKey}
        placeholder={props.placeholder}
        isActive={props.isActive}
        scrollMargin={props.scrollMargin}
        disabled={props.disabled}
        maxLength={props.maxLength}
      />
      <Text>len:{value.length}</Text>
    </Box>
  )
}

/** Uncontrolled TextArea wrapper */
function UncontrolledTextArea(props: { defaultValue?: string; onChange?: (v: string) => void; height?: number }) {
  return (
    <Box width={20}>
      <TextArea defaultValue={props.defaultValue} onChange={props.onChange} height={props.height ?? 5} />
    </Box>
  )
}

// ============================================================================
// Basic Typing
// ============================================================================

describe("TextArea: basic typing", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("types characters", () => {
    const app = render(<ControlledTextArea />)

    typeString(app, "hi")

    expect(app.text).toContain("hi")
    expect(app.text).toContain("len:2")
  })

  test("shows placeholder when empty", () => {
    const app = render(<ControlledTextArea placeholder="Type here..." />)

    expect(app.text).toContain("Type here...")
  })

  test("placeholder disappears on typing", () => {
    const app = render(<ControlledTextArea placeholder="Type here..." />)

    app.stdin.write("a")

    expect(app.text).not.toContain("Type here...")
    expect(app.text).toContain("a")
  })

  test("calls onChange for each character", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    app.stdin.write("a")
    app.stdin.write("b")
    app.stdin.write("c")

    expect(onChange).toHaveBeenCalledTimes(3)
    expect(onChange).toHaveBeenLastCalledWith("abc")
  })
})

// ============================================================================
// Multi-line Editing
// ============================================================================

describe("TextArea: multi-line editing", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("Enter inserts newline", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\r") // Enter
    typeString(app, "world")

    expect(onChange).toHaveBeenLastCalledWith("hello\nworld")
  })

  test("multiple newlines create multiple lines", () => {
    const app = render(<ControlledTextArea />)

    app.stdin.write("a")
    app.stdin.write("\r")
    app.stdin.write("b")
    app.stdin.write("\r")
    app.stdin.write("c")

    expect(app.text).toContain("a")
    expect(app.text).toContain("b")
    expect(app.text).toContain("c")
  })
})

// ============================================================================
// Cursor Movement
// ============================================================================

describe("TextArea: cursor movement", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("left arrow moves cursor left", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    app.stdin.write("a")
    app.stdin.write("b")
    app.stdin.write("\x1b[D") // Left arrow
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("aXb")
  })

  test("right arrow moves cursor right", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    app.stdin.write("a")
    app.stdin.write("b")
    app.stdin.write("\x1b[D") // Left
    app.stdin.write("\x1b[D") // Left
    app.stdin.write("\x1b[C") // Right
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("aXb")
  })

  test("up arrow moves to previous line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\r") // Enter
    typeString(app, "world")
    app.stdin.write("\x1b[A") // Up arrow
    app.stdin.write("X")

    // Cursor should be on line 0, at col 5 (end of "hello"), so X inserts at end of "hello"
    expect(onChange).toHaveBeenLastCalledWith("helloX\nworld")
  })

  test("down arrow moves to next line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\r")
    typeString(app, "world")
    app.stdin.write("\x1b[H") // Home
    app.stdin.write("\x1b[A") // Up
    app.stdin.write("\x1b[H") // Home
    // Now at beginning of first line, go down
    app.stdin.write("\x1b[B") // Down
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("hello\nXworld")
  })

  test("Home moves to start of line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\x1b[H") // Home
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("Xhello")
  })

  test("End moves to end of line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\x1b[H") // Home
    app.stdin.write("\x1b[F") // End
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("helloX")
  })

  test("Ctrl+A selects all text", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\x01") // Ctrl+A (select all)
    // Typing replaces selection
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("X")
  })

  test("Ctrl+E moves to end of line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\x1b[H") // Home
    app.stdin.write("\x05") // Ctrl+E
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("helloX")
  })
})

// ============================================================================
// Word Wrapping
// ============================================================================

describe("TextArea: word wrapping", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("wraps long text at component width", () => {
    const app = render(
      <Box width={10}>
        <TextArea value={"abcdefghijklmno"} height={5} />
      </Box>,
    )

    // The text "abcdefghijklmno" (15 chars) should wrap at width 10
    const text = app.text
    expect(text).toContain("abcdefghij")
    expect(text).toContain("klmno")
  })

  test("cursor movement works across wrapped lines", () => {
    const onChange = vi.fn()

    function NarrowTextArea() {
      const [value, setValue] = useState("")
      return (
        <Box width={10}>
          <TextArea
            value={value}
            onChange={(v) => {
              setValue(v)
              onChange(v)
            }}
            height={5}
          />
        </Box>
      )
    }

    const app = render(<NarrowTextArea />)

    // Type more than the width to force wrapping
    typeString(app, "abcdefghijkl")

    // Cursor should be at end; move up should go to first wrapped line
    app.stdin.write("\x1b[A") // Up arrow
    app.stdin.write("X")

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0]
    expect(lastCall).toContain("X")
    // X should be within the first wrapped portion (before position 10)
    expect(lastCall.indexOf("X")).toBeLessThan(10)
  })
})

// ============================================================================
// Scrolling
// ============================================================================

describe("TextArea: scrolling", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("scrolls down when cursor goes below viewport", () => {
    const app = render(<ControlledTextArea height={3} />)

    // Create 5 lines
    for (const line of ["line1", "line2", "line3", "line4", "line5"]) {
      if (line !== "line1") app.stdin.write("\r")
      typeString(app, line)
    }

    // With height=3, we should see the last 3 lines (cursor is on line5)
    const text = app.text
    expect(text).toContain("line5")
    expect(text).toContain("line4")
    expect(text).toContain("line3")
    // line1 should be scrolled out of view
    expect(text).not.toContain("line1")
  })

  test("scrolls up when cursor moves above viewport", () => {
    const app = render(<ControlledTextArea height={3} />)

    // Create 5 lines
    for (const line of ["line1", "line2", "line3", "line4", "line5"]) {
      if (line !== "line1") app.stdin.write("\r")
      typeString(app, line)
    }

    // Move cursor up to line1
    app.stdin.write("\x1b[A") // up
    app.stdin.write("\x1b[A") // up
    app.stdin.write("\x1b[A") // up
    app.stdin.write("\x1b[A") // up

    // Now cursor is on line1, viewport should scroll to show it
    const text = app.text
    expect(text).toContain("line1")
  })

  test("PageDown scrolls by viewport height", () => {
    const app = render(<ControlledTextArea height={3} />)

    // Create 10 lines
    for (let i = 1; i <= 10; i++) {
      if (i > 1) app.stdin.write("\r")
      typeString(app, `L${i}`)
    }

    // Go to top
    for (let i = 0; i < 10; i++) app.stdin.write("\x1b[A")

    // PageDown should jump by viewport height (3)
    app.stdin.write("\x1b[6~") // PageDown

    const text = app.text
    // After PageDown from line 0 with height 3, cursor should be at row 3
    expect(text).toContain("L4")
  })

  test("PageUp scrolls up by viewport height", () => {
    const app = render(<ControlledTextArea height={3} />)

    // Create 10 lines
    for (let i = 1; i <= 10; i++) {
      if (i > 1) app.stdin.write("\r")
      typeString(app, `L${i}`)
    }

    // Cursor is at last line (L10), PageUp should jump up by 3
    app.stdin.write("\x1b[5~") // PageUp

    const text = app.text
    expect(text).toContain("L7")
  })
})

// ============================================================================
// Kill Line Operations
// ============================================================================

describe("TextArea: kill operations", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("Ctrl+K kills to end of line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello world")
    // Move cursor to after "hello"
    for (let i = 0; i < 6; i++) app.stdin.write("\x1b[D") // left 6 times
    app.stdin.write("\x0b") // Ctrl+K

    expect(onChange).toHaveBeenLastCalledWith("hello")
  })

  test("Ctrl+U kills to beginning of line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello world")
    // Move cursor to after "hello "
    for (let i = 0; i < 5; i++) app.stdin.write("\x1b[D") // left 5 times
    app.stdin.write("\x15") // Ctrl+U

    expect(onChange).toHaveBeenLastCalledWith("world")
  })
})

// ============================================================================
// Backspace / Delete
// ============================================================================

describe("TextArea: delete operations", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("backspace deletes character before cursor", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "abc")
    app.stdin.write("\x7f") // Backspace

    expect(onChange).toHaveBeenLastCalledWith("ab")
  })

  test("backspace at newline joins lines", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\r") // Enter
    typeString(app, "world")
    // Go to start of second line
    app.stdin.write("\x1b[H") // Home
    // Backspace should delete the newline
    app.stdin.write("\x7f")

    expect(onChange).toHaveBeenLastCalledWith("helloworld")
  })

  test("Ctrl+D deletes character at cursor", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "abc")
    app.stdin.write("\x1b[H") // Home
    app.stdin.write("\x04") // Ctrl+D

    expect(onChange).toHaveBeenLastCalledWith("bc")
  })
})

// ============================================================================
// Submit
// ============================================================================

describe("TextArea: submit", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("Enter inserts newline by default (submitKey=ctrl+enter)", () => {
    const onSubmit = vi.fn()
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onSubmit={onSubmit} onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\r") // Enter

    expect(onSubmit).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenLastCalledWith("hello\n")
  })

  test("Enter submits when submitKey=enter", () => {
    const onSubmit = vi.fn()
    const app = render(<ControlledTextArea onSubmit={onSubmit} submitKey="enter" />)

    typeString(app, "hello")
    app.stdin.write("\r") // Enter

    expect(onSubmit).toHaveBeenCalledWith("hello")
  })
})

// ============================================================================
// Controlled vs Uncontrolled
// ============================================================================

describe("TextArea: controlled vs uncontrolled", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("uncontrolled mode works with defaultValue", () => {
    const onChange = vi.fn()
    const app = render(<UncontrolledTextArea defaultValue="initial" onChange={onChange} />)

    expect(app.text).toContain("initial")

    app.stdin.write("X")
    expect(onChange).toHaveBeenLastCalledWith("initialX")
  })

  test("uncontrolled mode starts empty by default", () => {
    const app = render(<UncontrolledTextArea />)

    typeString(app, "abc")
    expect(app.text).toContain("abc")
  })
})

// ============================================================================
// Multi-character Input (rapid typing / paste)
// ============================================================================

describe("TextArea: multi-character input", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("handles multi-character stdin chunk (rapid typing)", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    // Simulate rapid typing where multiple chars arrive in one stdin.read()
    app.stdin.write("hello")

    expect(onChange).toHaveBeenCalledTimes(5)
    expect(onChange).toHaveBeenLastCalledWith("hello")
  })

  test("handles multi-character chunk with spaces", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    app.stdin.write("hello world")

    expect(onChange).toHaveBeenLastCalledWith("hello world")
    expect(app.text).toContain("hello world")
  })

  test("handles mixed characters and escape sequences", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    // Type "ab", then ArrowLeft, then "X" — all in one chunk
    app.stdin.write("ab\x1b[DX")

    // "ab" typed, ArrowLeft moves cursor between a and b, then X inserted
    expect(onChange).toHaveBeenLastCalledWith("aXb")
  })

  test("handles paste with newlines", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    // Paste "line1\nline2" as one chunk
    app.stdin.write("line1\rline2")

    // \r = Enter = newline insertion
    expect(onChange).toHaveBeenLastCalledWith("line1\nline2")
  })
})

// ============================================================================
// isActive
// ============================================================================

describe("TextArea: isActive", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("ignores input when isActive=false", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea isActive={false} onChange={onChange} />)

    app.stdin.write("a")
    app.stdin.write("b")
    app.stdin.write("c")
    expect(onChange).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Scroll Margin
// ============================================================================

describe("TextArea: scroll margin", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("scrolls to keep margin lines above cursor when moving down", () => {
    // height=5, scrollMargin=1 (default): when cursor moves to the bottom,
    // viewport should scroll so there's 1 line below the cursor visible.
    const app = render(<ControlledTextArea height={5} />)

    // Create 8 lines
    for (let i = 1; i <= 8; i++) {
      if (i > 1) app.stdin.write("\r")
      typeString(app, `L${i}`)
    }

    // Cursor is on L8 (row 7). With height=5 and margin=1, the viewport
    // should show rows 3-7 (L4 through L8), with cursor on L8.
    // Without margin, it would show rows 3-7 the same since cursor is at the bottom.
    // Move cursor up to the top of viewport
    app.stdin.write("\x1b[A") // up to L7
    app.stdin.write("\x1b[A") // up to L6
    app.stdin.write("\x1b[A") // up to L5
    app.stdin.write("\x1b[A") // up to L4

    // Cursor is now on L4 (row 3). With margin=1, moving up should scroll
    // so there's 1 line above cursor visible.
    app.stdin.write("\x1b[A") // up to L3 (row 2)

    // With margin=1: scroll should adjust so L3 is not at the top edge.
    // L2 should be visible above L3.
    const text = app.text
    expect(text).toContain("L2")
    expect(text).toContain("L3")
  })

  test("scrolls to keep margin lines below cursor when moving up", () => {
    const app = render(<ControlledTextArea height={5} />)

    // Create 8 lines, then go to top
    for (let i = 1; i <= 8; i++) {
      if (i > 1) app.stdin.write("\r")
      typeString(app, `L${i}`)
    }

    // Go to top
    for (let i = 0; i < 8; i++) app.stdin.write("\x1b[A")

    // Cursor on L1 (row 0), viewport shows L1-L5
    // Move down past the margin threshold
    app.stdin.write("\x1b[B") // down to L2
    app.stdin.write("\x1b[B") // down to L3
    app.stdin.write("\x1b[B") // down to L4

    // With margin=1 and height=5, cursor on L4 (row 3) should still show L5
    // visible (1 line below cursor).
    app.stdin.write("\x1b[B") // down to L5 (row 4)

    // With margin=1: viewport should scroll so L5 isn't at the very bottom edge.
    // L6 should now be visible below L5.
    const text = app.text
    expect(text).toContain("L5")
    expect(text).toContain("L6")
  })

  test("scroll margin does not apply when content fits in viewport", () => {
    const app = render(<ControlledTextArea height={5} />)

    // Create 3 lines (fits in viewport of height 5)
    typeString(app, "L1")
    app.stdin.write("\r")
    typeString(app, "L2")
    app.stdin.write("\r")
    typeString(app, "L3")

    // All lines should be visible, no scrolling needed
    const text = app.text
    expect(text).toContain("L1")
    expect(text).toContain("L2")
    expect(text).toContain("L3")
  })

  test("scrollMargin=0 allows cursor at viewport edge", () => {
    const app = render(<ControlledTextArea height={3} scrollMargin={0} />)

    // Create 5 lines
    for (let i = 1; i <= 5; i++) {
      if (i > 1) app.stdin.write("\r")
      typeString(app, `L${i}`)
    }

    // Cursor on L5, viewport shows L3-L5
    // Move up to L3 (top of viewport)
    app.stdin.write("\x1b[A") // L4
    app.stdin.write("\x1b[A") // L3

    // With margin=0, L3 should be at the top edge, L1 and L2 should NOT be visible
    const text = app.text
    expect(text).toContain("L3")
    expect(text).toContain("L4")
    expect(text).toContain("L5")
    expect(text).not.toContain("L1")
  })

  test("scrollMargin=2 keeps 2 context lines", () => {
    const app = render(<ControlledTextArea height={7} scrollMargin={2} />)

    // Create 12 lines
    for (let i = 1; i <= 12; i++) {
      if (i > 1) app.stdin.write("\r")
      typeString(app, `L${i}`)
    }

    // Go to top
    for (let i = 0; i < 12; i++) app.stdin.write("\x1b[A")

    // Cursor on L1. Move down until scroll kicks in.
    // With height=7 and margin=2, scroll should kick in when cursor
    // reaches row 4 (viewport position), so the bottom 2 rows stay visible.
    for (let i = 0; i < 5; i++) app.stdin.write("\x1b[B") // down to L6

    // L6 is cursor position. With margin=2 and height=7, we should see
    // at least 2 lines after L6 (L7, L8).
    const text = app.text
    expect(text).toContain("L6")
    expect(text).toContain("L7")
    expect(text).toContain("L8")
  })

  test("cursor can reach first and last line despite margin", () => {
    const app = render(<ControlledTextArea height={5} scrollMargin={2} />)

    // Create 8 lines
    for (let i = 1; i <= 8; i++) {
      if (i > 1) app.stdin.write("\r")
      typeString(app, `L${i}`)
    }

    // Go to very top
    for (let i = 0; i < 8; i++) app.stdin.write("\x1b[A")

    // Cursor should be on L1 and L1 should be visible
    expect(app.text).toContain("L1")

    // Go to very bottom
    for (let i = 0; i < 8; i++) app.stdin.write("\x1b[B")

    // Cursor should be on L8 and L8 should be visible
    expect(app.text).toContain("L8")
  })
})

// ============================================================================
// Disabled
// ============================================================================

describe("TextArea: disabled", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("ignores all input when disabled", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea disabled onChange={onChange} />)

    app.stdin.write("a")
    app.stdin.write("b")
    app.stdin.write("\r") // Enter
    app.stdin.write("\x7f") // Backspace

    expect(onChange).not.toHaveBeenCalled()
  })

  test("dims text when disabled", () => {
    const app = render(<ControlledTextArea disabled initialValue="hello" />)

    // The text should be rendered with dimColor (SGR 2)
    expect(app.text).toContain("hello")
    expect(app.ansi).toMatch(/\x1b\[[\d;]*2m/)
  })

  test("ignores cursor movement when disabled", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea disabled initialValue="hello" onChange={onChange} />)

    app.stdin.write("\x1b[D") // Left arrow
    app.stdin.write("\x1b[C") // Right arrow
    app.stdin.write("\x1b[A") // Up arrow
    app.stdin.write("X")

    expect(onChange).not.toHaveBeenCalled()
  })
})

// ============================================================================
// maxLength
// ============================================================================

describe("TextArea: maxLength", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("prevents typing beyond maxLength", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea maxLength={5} onChange={onChange} />)

    typeString(app, "abcde")
    expect(onChange).toHaveBeenLastCalledWith("abcde")

    // Try to type one more character — should be rejected
    app.stdin.write("f")
    expect(onChange).toHaveBeenLastCalledWith("abcde")
    expect(app.text).toContain("len:5")
  })

  test("allows deletion when at maxLength", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea maxLength={5} onChange={onChange} />)

    typeString(app, "abcde")
    app.stdin.write("\x7f") // Backspace

    expect(onChange).toHaveBeenLastCalledWith("abcd")
  })

  test("allows newlines (they count toward maxLength)", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea maxLength={5} onChange={onChange} />)

    typeString(app, "ab")
    app.stdin.write("\r") // Enter (newline)
    typeString(app, "cd")

    // "ab\ncd" = 5 chars
    expect(onChange).toHaveBeenLastCalledWith("ab\ncd")

    // One more char should be rejected
    app.stdin.write("e")
    expect(onChange).toHaveBeenLastCalledWith("ab\ncd")
  })

  test("works without maxLength (unlimited)", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    const longText = "a".repeat(100)
    typeString(app, longText)

    expect(onChange).toHaveBeenLastCalledWith(longText)
  })
})

// ============================================================================
// meta+enter submit
// ============================================================================

describe("TextArea: meta+enter submit", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("meta+enter submits when submitKey=meta+enter", () => {
    const onSubmit = vi.fn()
    const app = render(<ControlledTextArea onSubmit={onSubmit} submitKey="meta+enter" />)

    typeString(app, "hello")
    // Send Kitty protocol Meta+Enter: CSI 13;3u (codepoint=13 CR, modifier=3 = meta+1)
    app.stdin.write("\x1b[13;3u")

    expect(onSubmit).toHaveBeenCalledWith("hello")
  })

  test("plain Enter inserts newline when submitKey=meta+enter", () => {
    const onSubmit = vi.fn()
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onSubmit={onSubmit} onChange={onChange} submitKey="meta+enter" />)

    typeString(app, "hello")
    app.stdin.write("\r") // Plain Enter

    expect(onSubmit).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenLastCalledWith("hello\n")
  })
})

// ============================================================================
// Ctrl+Home / Ctrl+End
// ============================================================================

describe("TextArea: Ctrl+Home/End navigation", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("Ctrl+Home moves cursor to document start", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "line1")
    app.stdin.write("\r")
    typeString(app, "line2")
    app.stdin.write("\r")
    typeString(app, "line3")

    // Ctrl+Home: CSI 1;5H (Ctrl+Home)
    app.stdin.write("\x1b[1;5H")
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("Xline1\nline2\nline3")
  })

  test("Ctrl+End moves cursor to document end", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "line1")
    app.stdin.write("\r")
    typeString(app, "line2")
    app.stdin.write("\r")
    typeString(app, "line3")

    // Move to beginning first
    app.stdin.write("\x1b[1;5H") // Ctrl+Home
    // Then Ctrl+End: CSI 1;5F (Ctrl+End)
    app.stdin.write("\x1b[1;5F")
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("line1\nline2\nline3X")
  })
})

// ============================================================================
// Text Selection
// ============================================================================

describe("TextArea: selection", () => {
  const render = createRenderer({ cols: 40, rows: 20 })

  test("Shift+Right extends selection one character", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\x1b[H") // Home
    // Shift+Right: CSI 1;2C
    app.stdin.write("\x1b[1;2C") // Shift+Right
    app.stdin.write("\x1b[1;2C") // Shift+Right
    app.stdin.write("\x1b[1;2C") // Shift+Right
    // Selection is "hel", typing replaces it
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("Xlo")
  })

  test("Shift+Left extends selection backwards", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    // Shift+Left: CSI 1;2D
    app.stdin.write("\x1b[1;2D") // Shift+Left
    app.stdin.write("\x1b[1;2D") // Shift+Left
    // Selection is "lo", typing replaces it
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("helX")
  })

  test("Shift+Up extends selection to previous line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\r")
    typeString(app, "world")
    // Shift+Up: CSI 1;2A
    app.stdin.write("\x1b[1;2A") // Shift+Up (selects from end of "world" to end of "hello")
    // Delete selection
    app.stdin.write("\x7f") // Backspace

    expect(onChange).toHaveBeenLastCalledWith("hello")
  })

  test("Shift+Down extends selection to next line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\r")
    typeString(app, "world")
    app.stdin.write("\x1b[H") // Home
    app.stdin.write("\x1b[A") // Up to line 1
    app.stdin.write("\x1b[H") // Home of line 1
    // Shift+Down: CSI 1;2B
    app.stdin.write("\x1b[1;2B") // Shift+Down
    // Typing replaces selection
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("Xworld")
  })

  test("Shift+Home selects to start of line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello world")
    // Move cursor to middle
    for (let i = 0; i < 5; i++) app.stdin.write("\x1b[D") // Left 5 times, cursor at "hello |world"
    // Shift+Home: CSI 1;2H
    app.stdin.write("\x1b[1;2H") // Shift+Home
    // Delete selection
    app.stdin.write("\x7f") // Backspace

    expect(onChange).toHaveBeenLastCalledWith("world")
  })

  test("Shift+End selects to end of line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello world")
    app.stdin.write("\x1b[H") // Home
    // Move cursor to after "hello "
    for (let i = 0; i < 6; i++) app.stdin.write("\x1b[C") // Right 6 times
    // Shift+End: CSI 1;2F
    app.stdin.write("\x1b[1;2F") // Shift+End
    // Replace selection
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("hello X")
  })

  test("Ctrl+A selects all text", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\r")
    typeString(app, "world")
    app.stdin.write("\x01") // Ctrl+A
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("X")
  })

  test("Ctrl+Shift+Right selects word forward", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello world")
    app.stdin.write("\x1b[H") // Home
    // Ctrl+Shift+Right: CSI 1;6C
    app.stdin.write("\x1b[1;6C") // Ctrl+Shift+Right (select "hello")
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("X world")
  })

  test("Ctrl+Shift+Left selects word backward", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello world")
    // Ctrl+Shift+Left: CSI 1;6D
    app.stdin.write("\x1b[1;6D") // Ctrl+Shift+Left (select "world")
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("hello X")
  })

  test("backspace deletes selection", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello world")
    // Select "world"
    for (let i = 0; i < 5; i++) app.stdin.write("\x1b[1;2D") // Shift+Left x5
    app.stdin.write("\x7f") // Backspace

    expect(onChange).toHaveBeenLastCalledWith("hello ")
  })

  test("delete key deletes selection", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello world")
    // Select "world"
    for (let i = 0; i < 5; i++) app.stdin.write("\x1b[1;2D") // Shift+Left x5
    app.stdin.write("\x1b[3~") // Delete key

    expect(onChange).toHaveBeenLastCalledWith("hello ")
  })

  test("typing replaces selection", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello world")
    app.stdin.write("\x01") // Ctrl+A (select all)
    typeString(app, "bye")

    expect(onChange).toHaveBeenLastCalledWith("bye")
  })

  test("Enter replaces selection with newline", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello world")
    // Select "world"
    for (let i = 0; i < 5; i++) app.stdin.write("\x1b[1;2D") // Shift+Left x5
    app.stdin.write("\r") // Enter

    expect(onChange).toHaveBeenLastCalledWith("hello \n")
  })

  test("arrow key without shift collapses selection", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    // Select "llo"
    for (let i = 0; i < 3; i++) app.stdin.write("\x1b[1;2D") // Shift+Left x3
    // Right arrow without shift collapses selection
    app.stdin.write("\x1b[C") // Right
    app.stdin.write("X")

    // After collapsing, cursor should be at position 3 (after "hel"), then right moves to 4
    // Actually: selection was from cursor=2 to anchor=5. Right arrow clears selection but cursor moves right.
    // Cursor was at position 2, right moves it to 3.
    expect(onChange).toHaveBeenLastCalledWith("helXlo")
  })

  test("selected text renders with inverse", () => {
    const app = render(<ControlledTextArea initialValue="hello" />)

    // Select all
    app.stdin.write("\x01") // Ctrl+A

    // Check that inverse ANSI codes appear (SGR 7 = inverse, may be prefixed with reset)
    expect(app.ansi).toMatch(/\x1b\[[\d;]*7m/)
    expect(app.text).toContain("hello")
  })

  test("selection across multiple lines renders correctly", () => {
    const app = render(<ControlledTextArea />)

    typeString(app, "line1")
    app.stdin.write("\r")
    typeString(app, "line2")
    app.stdin.write("\r")
    typeString(app, "line3")

    // Select all
    app.stdin.write("\x01") // Ctrl+A

    // All text should be visible
    expect(app.text).toContain("line1")
    expect(app.text).toContain("line2")
    expect(app.text).toContain("line3")
    // Should have inverse rendering
    expect(app.ansi).toMatch(/\x1b\[[\d;]*7m/)
  })
})
