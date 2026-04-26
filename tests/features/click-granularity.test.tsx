/**
 * Click-granularity selection — integration tests.
 *
 * Verifies the full pipeline for double-click → word selection and
 * triple-click → line selection:
 *
 *   - mouseDown+mouseUp #1               → idle (no selection)
 *   - mouseDown+mouseUp #2 within 300ms  → word selection at click point
 *                                          + granularity flips to "word"
 *   - mouseDown+mouseUp #3 within 300ms  → line selection at click point
 *                                          + granularity flips to "line"
 *   - drag after dblclick                → extends by word boundaries
 *   - drag after tripleclick             → extends by line boundaries
 *   - single click after dbl/triple      → granularity resets to "character"
 *
 * The wiring lives in create-app.tsx (mouseup interception) where it
 * dispatches `startWord` / `startLine` actions on the headless selection
 * machine and copies the resulting range via OSC 52 just like a finished
 * drag.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run } from "../../packages/ag-term/src/runtime/run"
import { Box, Text } from "../../src/index.js"
import { checkClickCount, createClickCountState } from "../../packages/ag-term/src/mouse-events"

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

function SelectableContent() {
  return (
    <Box flexDirection="column">
      <Text>Hello World of Selection</Text>
      <Text>Second row here</Text>
      <Text>Third row content</Text>
    </Box>
  )
}

// ============================================================================
// Click-count detection (unit tests for mouse-events.ts)
// ============================================================================

describe("checkClickCount — triple-click detection", () => {
  test("first click returns count=1", () => {
    const state = createClickCountState()
    expect(checkClickCount(state, 10, 5, 0, 1000)).toBe(1)
  })

  test("two clicks within 300ms / 2 cells return count=2 then 3", () => {
    const state = createClickCountState()
    expect(checkClickCount(state, 10, 5, 0, 1000)).toBe(1)
    expect(checkClickCount(state, 10, 5, 0, 1100)).toBe(2)
    expect(checkClickCount(state, 10, 5, 0, 1200)).toBe(3)
  })

  test("count wraps back to 1 after a triple-click", () => {
    const state = createClickCountState()
    checkClickCount(state, 10, 5, 0, 1000)
    checkClickCount(state, 10, 5, 0, 1100)
    checkClickCount(state, 10, 5, 0, 1200)
    // Fourth click: starts a new count.
    expect(checkClickCount(state, 10, 5, 0, 1300)).toBe(1)
  })

  test("click farther than 2 cells resets to count=1", () => {
    const state = createClickCountState()
    checkClickCount(state, 10, 5, 0, 1000)
    expect(checkClickCount(state, 20, 5, 0, 1100)).toBe(1)
  })

  test("click after 300ms resets to count=1", () => {
    const state = createClickCountState()
    checkClickCount(state, 10, 5, 0, 1000)
    expect(checkClickCount(state, 10, 5, 0, 1500)).toBe(1)
  })

  test("different button resets to count=1", () => {
    const state = createClickCountState()
    checkClickCount(state, 10, 5, 0, 1000)
    expect(checkClickCount(state, 10, 5, 1, 1100)).toBe(1)
  })
})

// ============================================================================
// E2E — double-click selects a word
// ============================================================================

describe("double-click → word selection", () => {
  test("dblclick on 'World' selects the word and copies via OSC 52", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<SelectableContent />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    // "Hello World of Selection" — 'W' is at col 6.
    // Double-click on col 8 (inside "World") → expect word "World" selected.
    await term.mouse.dblclick(8, 0)
    await settle(200)

    expect(term.clipboard.last).toBe("World")

    handle.unmount()
  })

  test("dblclick on 'Hello' selects first word", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<SelectableContent />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    await term.mouse.dblclick(2, 0)
    await settle(200)

    expect(term.clipboard.last).toBe("Hello")

    handle.unmount()
  })
})

// ============================================================================
// E2E — triple-click selects a line
// ============================================================================

describe("triple-click → line selection", () => {
  test("triple-click selects the entire content of the line and copies it", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<SelectableContent />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    // Three consecutive clicks at the same coordinate within ~300ms.
    // The TermlessMouse helper does no awaits between sub-clicks beyond a
    // microtask — well below the 300ms threshold.
    await term.mouse.click(8, 0)
    await term.mouse.click(8, 0)
    await term.mouse.click(8, 0)
    await settle(200)

    // Line 0 reads "Hello World of Selection". With character-tight
    // findLineBoundary the selection covers cols [0..23] which extracts
    // exactly that text.
    expect(term.clipboard.last).toBe("Hello World of Selection")

    handle.unmount()
  })

  test("triple-click on a different row selects that row", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<SelectableContent />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    await term.mouse.click(3, 1)
    await term.mouse.click(3, 1)
    await term.mouse.click(3, 1)
    await settle(200)

    expect(term.clipboard.last).toBe("Second row here")

    handle.unmount()
  })
})

// ============================================================================
// E2E — drag after dbl/triple-click extends by word/line
// ============================================================================

describe("drag after dblclick → extends by words", () => {
  test("dblclick then drag right snaps the head to the next word boundary", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<SelectableContent />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    // "Hello World of Selection"
    //  0     6     12 15
    // Double-click on "World" (col 8), then HOLD and drag to col 17 (inside
    // "Selection"). With word granularity, the head should snap to the END
    // of "Selection" (col 23).
    //
    // We simulate this as: click, click+down, move, up.
    await term.mouse.click(8, 0)
    await term.mouse.down(8, 0)
    await term.mouse.move(17, 0)
    await term.mouse.up(17, 0)
    await settle(200)

    // Final selection should run from start of "World" to end of "Selection".
    expect(term.clipboard.last).toBe("World of Selection")

    handle.unmount()
  })
})

describe("drag after tripleclick → extends by lines", () => {
  test("triple-click then drag down selects whole-line ranges", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<SelectableContent />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()
    term.clipboard.clear()

    // Triple-click on line 0, then drag the third click down to line 1 and
    // release. The line-granularity extend snaps the head to the end of
    // line 1 → selection covers line 0 + line 1.
    await term.mouse.click(8, 0)
    await term.mouse.click(8, 0)
    await term.mouse.down(8, 0)
    await term.mouse.move(8, 1)
    await term.mouse.up(8, 1)
    await settle(200)

    const clip = term.clipboard.last
    expect(clip).not.toBeNull()
    expect(clip).toContain("Hello World of Selection")
    expect(clip).toContain("Second row here")

    handle.unmount()
  })
})

// ============================================================================
// E2E — granularity resets after a fresh single click
// ============================================================================

describe("granularity reset", () => {
  test("a fresh click after a dblclick reverts to character granularity", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    const handle = await run(<SelectableContent />, term, {
      selection: true,
      mouse: true,
    } as any)
    await settle()

    // Dbl-click selects "World"
    await term.mouse.dblclick(8, 0)
    await settle(150)
    expect(term.clipboard.last).toBe("World")

    term.clipboard.clear()

    // Wait > 300ms so the next click is treated as a fresh single click.
    await settle(400)

    // Plain click + drag should produce a CHARACTER-granular selection,
    // not snap to word boundaries. Drag from col 0 to col 4 → "Hello".
    // (If granularity persisted at "word", this would snap to col 4 = end
    // of "Hello" — the same result. To prove character-granular, we drag
    // to col 2 which only word-extends to col 4 but character-extends to
    // exactly col 2, giving "Hel".)
    await term.mouse.down(0, 0)
    await term.mouse.move(2, 0)
    await term.mouse.up(2, 0)
    await settle(200)

    expect(term.clipboard.last).toBe("Hel")

    handle.unmount()
  })
})
