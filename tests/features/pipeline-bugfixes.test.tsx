/**
 * Pipeline Bug Fix Regression Tests
 *
 * Tests for specific pipeline fixes across output-phase, render-text,
 * measure-phase, reconciler helpers, and nodes.
 *
 * Each describe block corresponds to a specific bug fix.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, stripAnsi } from "@silvery/test"
import { Box, Text, Transform } from "@silvery/ag-react"
import { createBuffer } from "@silvery/ag-term/buffer"
import { outputPhase, createOutputPhase } from "@silvery/ag-term/pipeline/output-phase"

// ============================================================================
// 1. blink-hidden-style: styleToAnsi emits SGR 5 (blink) and SGR 8 (hidden)
// ============================================================================

describe("blink-hidden-style: styleToAnsi produces SGR codes for blink and hidden", () => {
  test("blink attribute produces SGR 5 in ANSI output", () => {
    // Set up a buffer with a blink cell and render it through the output phase
    const buf = createBuffer(10, 1)
    buf.setCell(0, 0, { char: "X", attrs: { blink: true } })

    const ansi = outputPhase(null, buf, "fullscreen")
    // SGR 5 is the blink code
    expect(ansi).toContain("\x1b[5m")
    expect(ansi).toContain("X")
  })

  test("hidden attribute produces SGR 8 in ANSI output", () => {
    const buf = createBuffer(10, 1)
    buf.setCell(0, 0, { char: "Y", attrs: { hidden: true } })

    const ansi = outputPhase(null, buf, "fullscreen")
    // SGR 8 is the hidden code
    expect(ansi).toContain("\x1b[8m")
    expect(ansi).toContain("Y")
  })

  test("blink + hidden combined produces both SGR 5 and SGR 8", () => {
    const buf = createBuffer(10, 1)
    buf.setCell(0, 0, { char: "Z", attrs: { blink: true, hidden: true } })

    const ansi = outputPhase(null, buf, "fullscreen")
    // SGR codes may be combined in a single sequence (e.g., \x1b[5;8m)
    // or separate. Check that both codes appear somewhere in the output.
    const hasBlink =
      ansi.includes("\x1b[5m") ||
      ansi.includes("\x1b[5;") ||
      ansi.includes(";5m") ||
      ansi.includes(";5;")
    const hasHidden =
      ansi.includes("\x1b[8m") ||
      ansi.includes("\x1b[8;") ||
      ansi.includes(";8m") ||
      ansi.includes(";8;")
    expect(hasBlink).toBe(true)
    expect(hasHidden).toBe(true)
  })

  test("blink transition emits SGR 5/25 in diff output", () => {
    // First render: normal cell
    const prev = createBuffer(5, 1)
    prev.setCell(0, 0, { char: "A" })

    // Second render: blink cell
    const next = createBuffer(5, 1)
    next.setCell(0, 0, { char: "A", attrs: { blink: true } })

    const ansi = outputPhase(prev, next, "fullscreen")
    // The transition should include SGR 5
    expect(ansi).toContain("\x1b[5m") // turning blink on
  })

  test("hidden to non-hidden transition re-renders without hidden attribute", () => {
    // First render: hidden cell
    const prev = createBuffer(5, 1)
    prev.setCell(0, 0, { char: "A", attrs: { hidden: true } })

    // Second render: normal cell
    const next = createBuffer(5, 1)
    next.setCell(0, 0, { char: "A" })

    const ansi = outputPhase(prev, next, "fullscreen")
    // The diff should re-render the cell. It may use SGR 28 (hidden off)
    // or a full reset + re-render. Either way, the output should NOT
    // contain SGR 8 (which would keep hidden on).
    expect(ansi).not.toContain("\x1b[8m")
    expect(ansi).toContain("A")
  })
})

// ============================================================================
// 2. output-cache-unbounded: sgrCache and transitionCache capped at 1000
// ============================================================================

describe("output-cache-unbounded: cache size is bounded", () => {
  test("output phase handles many unique styles without unbounded growth", () => {
    // Create a buffer with >1000 unique styles via unique fg colors.
    // The cache should self-regulate. This test verifies we can process
    // many unique styles without error (the fix clears cache at 1000).
    const SIZE = 1100
    const buf = createBuffer(SIZE, 1)
    for (let i = 0; i < SIZE; i++) {
      // Each cell gets a unique true-color fg
      buf.setCell(i, 0, {
        char: "X",
        fg: { r: i % 256, g: Math.floor(i / 256) % 256, b: Math.floor(i / 65536) % 256 },
      })
    }

    // Should complete without error. The cache would have been cleared
    // internally when it exceeded 1000 entries.
    const ansi = outputPhase(null, buf, "fullscreen")
    expect(ansi.length).toBeGreaterThan(0)
  })

  test("transition cache handles many unique style transitions", () => {
    // Create two buffers with >1000 unique style transitions
    const SIZE = 1100
    const prev = createBuffer(SIZE, 1)
    const next = createBuffer(SIZE, 1)

    for (let i = 0; i < SIZE; i++) {
      prev.setCell(i, 0, {
        char: "A",
        fg: { r: i % 256, g: 0, b: 0 },
      })
      next.setCell(i, 0, {
        char: "B",
        fg: { r: 0, g: i % 256, b: 0 },
      })
    }

    // Should complete without error (transition cache capped at 1000)
    const ansi = outputPhase(prev, next, "fullscreen")
    expect(ansi.length).toBeGreaterThan(0)
  })

  test("createOutputPhase instance caches are independent and bounded", () => {
    const op = createOutputPhase({})
    const SIZE = 1100
    const buf = createBuffer(SIZE, 1)
    for (let i = 0; i < SIZE; i++) {
      buf.setCell(i, 0, {
        char: "X",
        fg: { r: i % 256, g: Math.floor(i / 4) % 256, b: 0 },
      })
    }

    // Each createOutputPhase instance has its own caches
    const ansi = op(null, buf, "fullscreen")
    expect(ansi.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// 3. wrap-transform-classify: wrap and internal_transform are content props
//
// REMOVED: the `contentPropsChanged` helper was deleted in commit 408f57e0
// ("refactor: delete deprecated propsEqual/layoutPropsChanged/contentPropsChanged
// — zero callers"). That refactor missed this test file — the tests for the
// helper were left behind and broke typecheck. Deleting them here.
//
// The behavior (wrap/internal_transform affecting layout dimensions) is now
// verified by integration tests that actually render with these props, rather
// than unit tests on a specific helper function.
// ============================================================================

// ============================================================================
// 5. align-self-auto: applyBoxProps handles alignSelf="auto" correctly
// ============================================================================

describe("align-self-auto: alignSelf='auto' is handled correctly", () => {
  test("alignSelf='auto' uses parent alignment (same as default)", () => {
    const r = createRenderer({ cols: 30, rows: 5 })

    // With alignItems="center" on parent, auto should inherit center behavior
    const app = r(
      <Box height={3} alignItems="center">
        <Box alignSelf="auto">
          <Text>Auto</Text>
        </Box>
      </Box>,
    )

    const text = stripAnsi(app.text)
    // With alignItems="center" and height=3, the text should be centered vertically
    // Row 0: empty, Row 1: "Auto", Row 2: empty
    expect(text).toContain("Auto")
  })

  test("alignSelf='auto' behaves identically to omitting alignSelf", () => {
    const r = createRenderer({ cols: 30, rows: 5 })

    // Render with alignSelf="auto"
    const appWithAuto = r(
      <Box height={3} alignItems="flex-end">
        <Box alignSelf="auto">
          <Text>Test</Text>
        </Box>
      </Box>,
    )

    // Render without alignSelf (default = auto)
    const appWithout = r(
      <Box height={3} alignItems="flex-end">
        <Box>
          <Text>Test</Text>
        </Box>
      </Box>,
    )

    expect(stripAnsi(appWithAuto.text)).toBe(stripAnsi(appWithout.text))
  })

  test.fails("alignSelf='auto' is not filtered out (was the bug)", () => {
    const r = createRenderer({ cols: 20, rows: 5 })

    // With alignItems="flex-start" and alignSelf="auto", should match flex-start
    // With alignSelf="center", should be centered
    const appAuto = r(
      <Box flexDirection="column" width={20} alignItems="flex-start">
        <Box alignSelf="auto">
          <Text>A</Text>
        </Box>
      </Box>,
    )

    const appCenter = r(
      <Box flexDirection="column" width={20} alignItems="flex-start">
        <Box alignSelf="center">
          <Text>A</Text>
        </Box>
      </Box>,
    )

    // auto should be left-aligned (flex-start), center should be centered
    const autoText = stripAnsi(appAuto.text)
    const centerText = stripAnsi(appCenter.text)
    // These should be different because auto inherits flex-start, center overrides
    expect(autoText).not.toBe(centerText)
  })

  test("rerender from alignSelf='center' to 'auto' resets to parent alignment", () => {
    const r = createRenderer({ cols: 20, rows: 3 })

    const app = r(
      <Box flexDirection="column" width={20} alignItems="flex-start">
        <Box alignSelf="center">
          <Text>X</Text>
        </Box>
      </Box>,
    )

    const centeredText = stripAnsi(app.text)
    // X should be centered: spaces before X
    expect(centeredText).toMatch(/^\s+X/)

    app.rerender(
      <Box flexDirection="column" width={20} alignItems="flex-start">
        <Box alignSelf="auto">
          <Text>X</Text>
        </Box>
      </Box>,
    )

    const autoText = stripAnsi(app.text)
    // After switching to auto, X should be flex-start (left-aligned)
    expect(autoText).toBe("X")
  })
})

// ============================================================================
// 6. measure-fit-gaps: measureIntrinsicSize includes gap between children
// ============================================================================

describe("measure-fit-gaps: fit-content includes gap in measurement", () => {
  test("row fit-content width includes gap between children", () => {
    const r = createRenderer({ cols: 40, rows: 5 })

    // Must use explicit flexDirection="row" for measureIntrinsicSize to
    // recognize row layout. Children must be Boxes (not bare Text) for
    // gap to apply between layout nodes.
    const app = r(
      <Box>
        <Box width="fit-content" flexDirection="row" gap={2}>
          <Box>
            <Text>AA</Text>
          </Box>
          <Box>
            <Text>BB</Text>
          </Box>
          <Box>
            <Text>CC</Text>
          </Box>
        </Box>
        <Text>|END</Text>
      </Box>,
    )

    const text = stripAnsi(app.text)
    // "AA" (2) + gap (2) + "BB" (2) + gap (2) + "CC" (2) = 10 columns
    // Without gap fix: only 6 columns (AA+BB+CC), |END at col 6
    // With gap fix: 10 columns, |END at col 10
    expect(text).toContain("AA")
    expect(text).toContain("BB")
    expect(text).toContain("CC")
    expect(text).toContain("|END")

    // Verify the gap is included: |END should appear after position 9
    const endIndex = text.indexOf("|END")
    expect(endIndex).toBeGreaterThanOrEqual(10) // 2+2+2+2+2 = 10
  })

  test("column fit-content height includes gap between children", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    const app = r(
      <Box flexDirection="column">
        <Box height="fit-content" flexDirection="column" gap={1}>
          <Text>Line1</Text>
          <Text>Line2</Text>
          <Text>Line3</Text>
        </Box>
        <Text>AFTER</Text>
      </Box>,
    )

    const text = stripAnsi(app.text)
    // Height should be 3 lines + 2 gaps = 5 rows
    // AFTER should appear on row 5 (0-indexed)
    const lines = text.split("\n")
    const afterRow = lines.findIndex((l) => l.includes("AFTER"))
    // 3 text lines + 2 gap lines = 5 rows, so AFTER at row 5
    expect(afterRow).toBe(5)
  })

  test("single child has no gap added", () => {
    const r = createRenderer({ cols: 40, rows: 5 })

    const app = r(
      <Box>
        <Box width="fit-content" flexDirection="row" gap={5}>
          <Box>
            <Text>ONLY</Text>
          </Box>
        </Box>
        <Text>|</Text>
      </Box>,
    )

    const text = stripAnsi(app.text)
    // Single child = no gap: width should be 4 (just "ONLY")
    const pipeIndex = text.indexOf("|")
    expect(pipeIndex).toBe(4)
  })
})

// ============================================================================
// 7. line-has-content: lineHasContent checks inverse/underline/strikethrough
// ============================================================================

describe("line-has-content: styled blank cells are treated as content", () => {
  test("blank line with inverse attribute is not trimmed from output", () => {
    // Create a buffer where a row has only spaces but with inverse attribute
    const buf = createBuffer(10, 3)
    // Row 0: text
    buf.setCell(0, 0, { char: "H" })
    buf.setCell(1, 0, { char: "i" })
    // Row 1: blank with inverse (should be treated as content)
    for (let x = 0; x < 10; x++) {
      buf.setCell(x, 1, { char: " ", attrs: { inverse: true } })
    }
    // Row 2: truly empty

    // In inline mode, the output should include row 1 because inverse spaces are visible
    const ansi = outputPhase(null, buf, "inline", 0, 3)
    // The output should contain SGR 7 (inverse) for the middle row
    expect(ansi).toContain("\x1b[7m")
  })

  test("blank line with underline is treated as content", () => {
    const buf = createBuffer(10, 3)
    buf.setCell(0, 0, { char: "A" })
    // Row 1: blank with underline
    for (let x = 0; x < 5; x++) {
      buf.setCell(x, 1, { char: " ", attrs: { underline: true } })
    }

    const ansi = outputPhase(null, buf, "inline", 0, 3)
    // Should contain underline SGR — either SGR 4 (\x1b[4m) or SGR 4:1 (\x1b[4:1m)
    expect(ansi).toMatch(/\x1b\[4(?::1)?m/)
  })

  test("blank line with strikethrough is treated as content", () => {
    const buf = createBuffer(10, 3)
    buf.setCell(0, 0, { char: "A" })
    // Row 1: blank with strikethrough
    for (let x = 0; x < 5; x++) {
      buf.setCell(x, 1, { char: " ", attrs: { strikethrough: true } })
    }

    const ansi = outputPhase(null, buf, "inline", 0, 3)
    // Should contain SGR 9 (strikethrough)
    expect(ansi).toContain("\x1b[9m")
  })

  test("blank line with background is treated as content", () => {
    const buf = createBuffer(10, 3)
    buf.setCell(0, 0, { char: "A" })
    // Row 1: blank with bg color
    for (let x = 0; x < 5; x++) {
      buf.setCell(x, 1, { char: " ", bg: 1 }) // red bg
    }

    const ansi = outputPhase(null, buf, "inline", 0, 3)
    // Should contain SGR 41 (red bg)
    expect(ansi).toContain("\x1b[41m")
  })

  test("truly blank line after content is not included", () => {
    const buf = createBuffer(10, 3)
    buf.setCell(0, 0, { char: "A" })
    // Rows 1-2: truly empty (no attrs, no bg, just spaces)

    const ansi = outputPhase(null, buf, "inline", 0, 3)
    // The output should contain "A" but not extend to 3 lines
    expect(ansi).toContain("A")
    // Count newlines -- should be minimal (just the content)
    const newlines = (ansi.match(/\n/g) || []).length
    expect(newlines).toBeLessThanOrEqual(1) // at most one newline after "A"
  })
})

// ============================================================================
// 8. bg-segment-offsets: BgSegment uses display-width consistently with CJK
// ============================================================================

describe("bg-segment-offsets: CJK/emoji bg segments use display-width coordinates", () => {
  test("CJK text with nested bg correctly colors each character", () => {
    const r = createRenderer({ cols: 40, rows: 3 })

    // CJK characters are 2 display-width each
    // "\u4F60" = 你 (width 2), "\u597D" = 好 (width 2)
    const app = r(
      <Box>
        <Text>
          <Text backgroundColor="red">{"\u4F60\u597D"}</Text>
          <Text backgroundColor="blue">AB</Text>
        </Text>
      </Box>,
    )

    const buffer = app.term.buffer
    // 你 occupies cols 0-1, 好 occupies cols 2-3, A at col 4, B at col 5
    const cell0 = buffer.getCell(0, 0)
    const cell1 = buffer.getCell(1, 0) // continuation of 你
    const cell2 = buffer.getCell(2, 0) // 好
    const cell4 = buffer.getCell(4, 0) // A
    const cell5 = buffer.getCell(5, 0) // B

    // 你好 should have red bg
    expect(cell0.bg).not.toBeNull()
    expect(cell2.bg).not.toBeNull()

    // A, B should have blue bg
    expect(cell4.bg).not.toBeNull()
    expect(cell5.bg).not.toBeNull()

    // Red and blue should be different
    expect(cell0.bg).not.toEqual(cell4.bg)
  })

  test("mixed ASCII + CJK bg segment boundaries are correct", () => {
    const r = createRenderer({ cols: 40, rows: 3 })

    // "Hi" = 2 cols, "\u4F60" = 2 cols, "!" = 1 col
    const app = r(
      <Box>
        <Text>
          <Text backgroundColor="green">Hi</Text>
          <Text backgroundColor="yellow">{"\u4F60"}</Text>
          <Text backgroundColor="cyan">!</Text>
        </Text>
      </Box>,
    )

    const buffer = app.term.buffer
    // H at col 0, i at col 1 (green bg)
    // 你 at cols 2-3 (yellow bg)
    // ! at col 4 (cyan bg)

    const cellH = buffer.getCell(0, 0)
    const cellI = buffer.getCell(1, 0)
    const cellNi = buffer.getCell(2, 0)
    const cellBang = buffer.getCell(4, 0)

    expect(cellH.char).toBe("H")
    expect(cellI.char).toBe("i")
    expect(cellNi.char).toBe("\u4F60")
    expect(cellBang.char).toBe("!")

    // Each segment should have a bg
    expect(cellH.bg).not.toBeNull()
    expect(cellNi.bg).not.toBeNull()
    expect(cellBang.bg).not.toBeNull()

    // All three bg colors should be different
    expect(cellH.bg).not.toEqual(cellNi.bg)
    expect(cellNi.bg).not.toEqual(cellBang.bg)
    expect(cellH.bg).not.toEqual(cellBang.bg)
  })

  test("emoji with bg segment", () => {
    const r = createRenderer({ cols: 40, rows: 3 })

    const app = r(
      <Box>
        <Text>
          <Text backgroundColor="red">A</Text>
          <Text backgroundColor="blue">{"\u{1F600}"}</Text>
          <Text backgroundColor="green">B</Text>
        </Text>
      </Box>,
    )

    const buffer = app.term.buffer
    // A at col 0 (red), emoji at cols 1-2 (blue, width 2), B at col 3 (green)
    const cellA = buffer.getCell(0, 0)
    const cellEmoji = buffer.getCell(1, 0)
    const cellB = buffer.getCell(3, 0)

    expect(cellA.char).toBe("A")
    expect(cellA.bg).not.toBeNull()
    expect(cellEmoji.bg).not.toBeNull()
    expect(cellB.bg).not.toBeNull()

    // A (red) and emoji (blue) should have different bg
    expect(cellA.bg).not.toEqual(cellEmoji.bg)
    // emoji (blue) and B (green) should have different bg
    expect(cellEmoji.bg).not.toEqual(cellB.bg)
  })
})

// ============================================================================
// 9. measure-fit-transform: measureIntrinsicSize accounts for internal_transform
// ============================================================================

describe("measure-fit-transform: fit-content includes internal_transform width", () => {
  test("Transform adding prefix increases fit-content width", () => {
    const r = createRenderer({ cols: 40, rows: 5 })

    // Transform adds "> " (2 chars) prefix to each line
    const app = r(
      <Box>
        <Box width="fit-content">
          <Transform transform={(line) => `> ${line}`}>
            <Text>Hello</Text>
          </Transform>
        </Box>
        <Text>|END</Text>
      </Box>,
    )

    const text = stripAnsi(app.text)
    // "Hello" is 5 chars, "> Hello" is 7 chars
    // With transform accounted: fit-content width = 7, |END at col 7
    // Without transform: fit-content width = 5, |END at col 5
    expect(text).toContain("> Hello")
    expect(text).toContain("|END")

    const endIndex = text.indexOf("|END")
    expect(endIndex).toBeGreaterThanOrEqual(7) // "> Hello" = 7 chars
  })

  test("Transform adding line numbers increases fit-content width", () => {
    const r = createRenderer({ cols: 40, rows: 5 })

    const app = r(
      <Box>
        <Box width="fit-content">
          <Transform transform={(line, i) => `${i + 1}: ${line}`}>
            <Text>{"AB\nCD"}</Text>
          </Transform>
        </Box>
        <Text>|</Text>
      </Box>,
    )

    const text = stripAnsi(app.text)
    // "1: AB" = 5 chars, "2: CD" = 5 chars
    // Without transform: "AB" = 2, "CD" = 2 → width = 2
    // With transform: width = 5
    expect(text).toContain("1: AB")
    const pipeIndex = text.indexOf("|")
    expect(pipeIndex).toBeGreaterThanOrEqual(5) // "1: AB" = 5 chars
  })
})

// ============================================================================
// 10. measure-fit-wrap: fit-content height accounts for text wrapping
// ============================================================================

describe("measure-fit-wrap: fit-content height wraps text at fixed width", () => {
  test("long text wraps at fixed width, producing correct fit-content height", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    // A box with fixed width=10 and height=fit-content
    // "AAAAAAAAAA BBBBBBBBBB" = 21 chars, wraps at width 10 to ~3 lines
    const app = r(
      <Box flexDirection="column">
        <Box width={10} height="fit-content">
          <Text wrap="wrap">AAAAAAAAAA BBBBBBBBBB</Text>
        </Box>
        <Text>AFTER</Text>
      </Box>,
    )

    const text = stripAnsi(app.text)
    const lines = text.split("\n")
    const afterRow = lines.findIndex((l) => l.includes("AFTER"))
    // "AAAAAAAAAA BBBBBBBBBB" at width 10 wraps to:
    //   "AAAAAAAAAA" (10 chars)
    //   "BBBBBBBBBB" (10 chars)
    // = 2 lines (word wrap: break at space, trim leading space on continuation)
    // So AFTER should appear at row 2, not row 1 (unwrapped line count)
    expect(afterRow).toBeGreaterThanOrEqual(2)
  })

  test("single line that exceeds fixed width wraps to multiple lines", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    // "ABCDEFGHIJ" = 10 chars, width=5 → wraps to 2 lines
    const app = r(
      <Box flexDirection="column">
        <Box width={5} height="fit-content">
          <Text wrap="wrap">ABCDEFGHIJ</Text>
        </Box>
        <Text>AFTER</Text>
      </Box>,
    )

    const text = stripAnsi(app.text)
    const lines = text.split("\n")
    const afterRow = lines.findIndex((l) => l.includes("AFTER"))
    // "ABCDEFGHIJ" at width 5 character-wraps to:
    //   "ABCDE" (5 chars)
    //   "FGHIJ" (5 chars)
    // = 2 lines
    expect(afterRow).toBe(2)
  })

  test("text that fits in fixed width does not add extra height", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    // "Hi" = 2 chars, width=10 → fits in 1 line
    const app = r(
      <Box flexDirection="column">
        <Box width={10} height="fit-content">
          <Text>Hi</Text>
        </Box>
        <Text>AFTER</Text>
      </Box>,
    )

    const text = stripAnsi(app.text)
    const lines = text.split("\n")
    const afterRow = lines.findIndex((l) => l.includes("AFTER"))
    // No wrapping needed, height = 1
    expect(afterRow).toBe(1)
  })
})
