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
import { createRenderer } from "../src/testing/index.tsx"

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
  submitKey?: "ctrl+enter" | "enter"
  placeholder?: string
  isActive?: boolean
  initialValue?: string
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
    app.stdin.write("\x01") // Ctrl+A (home)
    app.stdin.write("\x1b[A") // Up
    app.stdin.write("\x01") // Ctrl+A (home)
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

  test("Ctrl+A moves to start of line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\x01") // Ctrl+A
    app.stdin.write("X")

    expect(onChange).toHaveBeenLastCalledWith("Xhello")
  })

  test("Ctrl+E moves to end of line", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "hello")
    app.stdin.write("\x01") // Ctrl+A
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
    app.stdin.write("\x01") // Ctrl+A
    // Backspace should delete the newline
    app.stdin.write("\x7f")

    expect(onChange).toHaveBeenLastCalledWith("helloworld")
  })

  test("Ctrl+D deletes character at cursor", () => {
    const onChange = vi.fn()
    const app = render(<ControlledTextArea onChange={onChange} />)

    typeString(app, "abc")
    app.stdin.write("\x01") // Ctrl+A (home)
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
