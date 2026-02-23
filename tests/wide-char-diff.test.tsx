/**
 * Wide Character Cell-Level Diff Tests
 *
 * Tests that wide characters (CJK, emoji) are handled correctly during
 * cell-level diffing in the output phase, without falling back to
 * full-row rendering. Wide chars occupy 2 cells: a main cell (wide:true)
 * and a continuation cell (continuation:true, char:"").
 *
 * The output phase handles wide chars atomically in changesToAnsi():
 * - Main cells emit the character and advance the cursor by 2
 * - Continuation cells are skipped (handled with their main cell)
 * - Orphaned continuation cells (style changed, main cell unchanged)
 *   trigger a re-emit of the main cell from the buffer
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { TerminalBuffer, bufferToText, createMutableCell } from "../src/buffer.js"
import { Box, Text, useInput } from "../src/index.js"
import { outputPhase } from "../src/pipeline/output-phase.js"
import { createRenderer } from "../src/testing/index.js"
import { compareBuffers, formatMismatch } from "../src/testing/compare-buffers.js"

// ============================================================================
// Low-level buffer diff tests (output-phase directly)
// ============================================================================

describe("Wide char cell-level diff", () => {
  test("wide emoji renders correctly in initial render", () => {
    const buffer = new TerminalBuffer(20, 1)
    // Write "Hi " + 🌍 (wide) + " ok"
    buffer.setCell(0, 0, { char: "H" })
    buffer.setCell(1, 0, { char: "i" })
    buffer.setCell(2, 0, { char: " " })
    buffer.setCell(3, 0, { char: "🌍", wide: true })
    buffer.setCell(4, 0, { char: "", continuation: true })
    buffer.setCell(5, 0, { char: " " })
    buffer.setCell(6, 0, { char: "o" })
    buffer.setCell(7, 0, { char: "k" })

    const output = outputPhase(null, buffer)

    // Should contain the text characters
    expect(output).toContain("H")
    expect(output).toContain("i")
    expect(output).toContain("🌍")
    expect(output).toContain("o")
    expect(output).toContain("k")
  })

  test("changing a wide char to another wide char uses cell diff", () => {
    const prev = new TerminalBuffer(20, 1)
    prev.setCell(0, 0, { char: "A" })
    prev.setCell(1, 0, { char: "🌍", wide: true })
    prev.setCell(2, 0, { char: "", continuation: true })
    prev.setCell(3, 0, { char: "B" })

    const next = new TerminalBuffer(20, 1)
    next.setCell(0, 0, { char: "A" }) // unchanged
    next.setCell(1, 0, { char: "🎉", wide: true }) // different wide char
    next.setCell(2, 0, { char: "", continuation: true })
    next.setCell(3, 0, { char: "B" }) // unchanged

    const output = outputPhase(prev, next)

    // Should only contain the changed wide char, not unchanged cells
    expect(output).toContain("🎉")
    expect(output).not.toContain("A")
    expect(output).not.toContain("B")

    // Should be shorter than a full render (cell diff, not full row)
    const fullOutput = outputPhase(null, next)
    expect(output.length).toBeLessThan(fullOutput.length)
  })

  test("replacing wide char with narrow chars clears continuation cell", () => {
    const prev = new TerminalBuffer(10, 1)
    prev.setCell(0, 0, { char: "🌍", wide: true })
    prev.setCell(1, 0, { char: "", continuation: true })
    prev.setCell(2, 0, { char: "X" })

    const next = new TerminalBuffer(10, 1)
    next.setCell(0, 0, { char: "a" }) // narrow replaces wide main
    next.setCell(1, 0, { char: "b" }) // narrow replaces continuation
    next.setCell(2, 0, { char: "X" }) // unchanged

    const output = outputPhase(prev, next)

    // Both narrow chars should appear in the output
    expect(output).toContain("a")
    expect(output).toContain("b")
    // Unchanged cell should not appear
    expect(output).not.toContain("X")
  })

  test("replacing narrow chars with wide char works correctly", () => {
    const prev = new TerminalBuffer(10, 1)
    prev.setCell(0, 0, { char: "a" })
    prev.setCell(1, 0, { char: "b" })
    prev.setCell(2, 0, { char: "X" })

    const next = new TerminalBuffer(10, 1)
    next.setCell(0, 0, { char: "🌍", wide: true }) // wide replaces narrow
    next.setCell(1, 0, { char: "", continuation: true }) // continuation replaces narrow
    next.setCell(2, 0, { char: "X" }) // unchanged

    const output = outputPhase(prev, next)

    // Wide char should appear
    expect(output).toContain("🌍")
    // Unchanged cell should not appear
    expect(output).not.toContain("X")
  })

  test("adjacent wide chars both render", () => {
    const prev = new TerminalBuffer(10, 1)
    // Fill with spaces
    for (let x = 0; x < 10; x++) {
      prev.setCell(x, 0, { char: " " })
    }

    const next = new TerminalBuffer(10, 1)
    // Two adjacent wide chars: 🌍 at cols 0-1, 🎉 at cols 2-3
    next.setCell(0, 0, { char: "🌍", wide: true })
    next.setCell(1, 0, { char: "", continuation: true })
    next.setCell(2, 0, { char: "🎉", wide: true })
    next.setCell(3, 0, { char: "", continuation: true })
    for (let x = 4; x < 10; x++) {
      next.setCell(x, 0, { char: " " })
    }

    const output = outputPhase(prev, next)

    // Both wide chars should appear in the output
    expect(output).toContain("🌍")
    expect(output).toContain("🎉")
  })

  test("wide char at end of row (continuation at last column)", () => {
    const prev = new TerminalBuffer(6, 1)
    for (let x = 0; x < 6; x++) {
      prev.setCell(x, 0, { char: " " })
    }

    const next = new TerminalBuffer(6, 1)
    for (let x = 0; x < 4; x++) {
      next.setCell(x, 0, { char: " " })
    }
    // Wide char at cols 4-5 (last two columns)
    next.setCell(4, 0, { char: "🌍", wide: true })
    next.setCell(5, 0, { char: "", continuation: true })

    const output = outputPhase(prev, next)

    expect(output).toContain("🌍")
  })

  test("mixed narrow and wide chars on same row use cell diff", () => {
    const prev = new TerminalBuffer(20, 1)
    prev.setCell(0, 0, { char: "H" })
    prev.setCell(1, 0, { char: "i" })
    prev.setCell(2, 0, { char: "🌍", wide: true })
    prev.setCell(3, 0, { char: "", continuation: true })
    prev.setCell(4, 0, { char: "!" })

    const next = new TerminalBuffer(20, 1)
    next.setCell(0, 0, { char: "H" }) // unchanged
    next.setCell(1, 0, { char: "i" }) // unchanged
    next.setCell(2, 0, { char: "🌍", wide: true }) // unchanged
    next.setCell(3, 0, { char: "", continuation: true }) // unchanged
    next.setCell(4, 0, { char: "?", fg: 1 }) // changed: different char + color

    const output = outputPhase(prev, next)

    // Only the changed cell should appear
    expect(output).toContain("?")
    // Wide char and other unchanged cells should NOT appear
    expect(output).not.toContain("🌍")
    // Note: "H" can appear in CUP escape sequences (\x1b[row;colH),
    // so check that the literal character "H" at position 0 is not emitted.
    // We verify this by checking that "Hi" (the unchanged text) is absent.
    expect(output).not.toContain("Hi")
    expect(output).not.toContain("!")
  })

  test("no output when wide char row is unchanged", () => {
    const prev = new TerminalBuffer(10, 1)
    prev.setCell(0, 0, { char: "🌍", wide: true })
    prev.setCell(1, 0, { char: "", continuation: true })
    prev.setCell(2, 0, { char: "X" })

    const next = prev.clone()

    const output = outputPhase(prev, next)

    // No changes — empty output
    expect(output).toBe("")
  })

  test("wide char on different row than narrow char changes", () => {
    const prev = new TerminalBuffer(10, 3)
    prev.setCell(0, 0, { char: "🌍", wide: true })
    prev.setCell(1, 0, { char: "", continuation: true })
    prev.setCell(0, 1, { char: "A" })
    prev.setCell(0, 2, { char: "B" })

    const next = new TerminalBuffer(10, 3)
    next.setCell(0, 0, { char: "🌍", wide: true }) // unchanged
    next.setCell(1, 0, { char: "", continuation: true }) // unchanged
    next.setCell(0, 1, { char: "C" }) // changed
    next.setCell(0, 2, { char: "B" }) // unchanged

    const output = outputPhase(prev, next)

    // Only the changed narrow char should appear
    expect(output).toContain("C")
    // Wide char row and other unchanged cells should NOT appear
    expect(output).not.toContain("🌍")
    expect(output).not.toContain("A")
    expect(output).not.toContain("B")
  })

  test("wide char style change produces correct output", () => {
    const prev = new TerminalBuffer(10, 1)
    prev.setCell(0, 0, { char: "🌍", wide: true, fg: 1 }) // red
    prev.setCell(1, 0, { char: "", continuation: true, fg: 1 })

    const next = new TerminalBuffer(10, 1)
    next.setCell(0, 0, { char: "🌍", wide: true, fg: 2 }) // green
    next.setCell(1, 0, { char: "", continuation: true, fg: 2 })

    const output = outputPhase(prev, next)

    // Should contain the wide char with new style
    expect(output).toContain("🌍")
    // Should have green fg (38;5;2)
    expect(output).toContain("38;5;2")
  })

  test("orphaned continuation cell (bg change) triggers main cell re-emit", () => {
    // Scenario: wide char at (0,0) with continuation at (1,0).
    // Only the continuation cell's bg changes. The main cell is unchanged.
    // The output phase should detect this and re-emit the main cell.
    const prev = new TerminalBuffer(10, 1)
    prev.setCell(0, 0, { char: "🌍", wide: true, bg: 4 }) // blue bg
    prev.setCell(1, 0, { char: "", continuation: true, bg: 4 }) // blue bg
    prev.setCell(2, 0, { char: "X" })

    const next = new TerminalBuffer(10, 1)
    next.setCell(0, 0, { char: "🌍", wide: true, bg: 4 }) // unchanged
    next.setCell(1, 0, { char: "", continuation: true, bg: 6 }) // bg changed to cyan
    next.setCell(2, 0, { char: "X" }) // unchanged

    const output = outputPhase(prev, next)

    // Should contain the wide char (re-emitted due to continuation bg change)
    expect(output).toContain("🌍")
    // Should NOT contain unchanged cells
    expect(output).not.toContain("X")
  })

  test("CJK characters handled atomically", () => {
    // CJK characters are width 2, same as emoji
    const prev = new TerminalBuffer(10, 1)
    prev.setCell(0, 0, { char: "中", wide: true })
    prev.setCell(1, 0, { char: "", continuation: true })
    prev.setCell(2, 0, { char: "X" })

    const next = new TerminalBuffer(10, 1)
    next.setCell(0, 0, { char: "国", wide: true }) // different CJK char
    next.setCell(1, 0, { char: "", continuation: true })
    next.setCell(2, 0, { char: "X" }) // unchanged

    const output = outputPhase(prev, next)

    expect(output).toContain("国")
    expect(output).not.toContain("中")
    expect(output).not.toContain("X")
  })

  test("multiple wide chars changing on same row", () => {
    const prev = new TerminalBuffer(12, 1)
    prev.setCell(0, 0, { char: "🌍", wide: true })
    prev.setCell(1, 0, { char: "", continuation: true })
    prev.setCell(2, 0, { char: " " })
    prev.setCell(3, 0, { char: "🎉", wide: true })
    prev.setCell(4, 0, { char: "", continuation: true })

    const next = new TerminalBuffer(12, 1)
    next.setCell(0, 0, { char: "🎈", wide: true }) // changed
    next.setCell(1, 0, { char: "", continuation: true })
    next.setCell(2, 0, { char: " " }) // unchanged
    next.setCell(3, 0, { char: "🎊", wide: true }) // changed
    next.setCell(4, 0, { char: "", continuation: true })

    const output = outputPhase(prev, next)

    expect(output).toContain("🎈")
    expect(output).toContain("🎊")
    expect(output).not.toContain("🌍")
    expect(output).not.toContain("🎉")
  })
})

// ============================================================================
// Component-level tests (via createRenderer with incremental rendering)
// ============================================================================

const render = createRenderer({ incremental: true, cols: 40, rows: 10 })

function assertBuffersMatch(app: ReturnType<typeof render>, context?: string): void {
  const fresh = app.freshRender()
  const current = app.lastBuffer()!
  const mismatch = compareBuffers(current, fresh)
  if (mismatch) {
    const msg = formatMismatch(mismatch, {
      incrementalText: bufferToText(current),
      freshText: bufferToText(fresh),
    })
    expect.unreachable(`${context ? context + ": " : ""}${msg}`)
  }
}

describe("Wide char incremental rendering", () => {
  test("wide emoji renders correctly via component", () => {
    const app = render(<Text>Hello 🌍 World</Text>)
    expect(app.text).toContain("Hello")
    expect(app.text).toContain("World")
    assertBuffersMatch(app, "initial render")
  })

  test("changing text with wide chars uses cell diff", async () => {
    function App() {
      const [emoji, setEmoji] = useState("🌍")

      useInput((input) => {
        if (input === "t") setEmoji((e) => (e === "🌍" ? "🎉" : "🌍"))
      })

      return <Text>Hello {emoji} World</Text>
    }

    const app = render(<App />)
    assertBuffersMatch(app, "initial")

    await app.press("t")
    assertBuffersMatch(app, "after changing emoji")

    await app.press("t")
    assertBuffersMatch(app, "after changing back")
  })

  test("wide char to narrow transition renders correctly", async () => {
    function App() {
      const [useWide, setUseWide] = useState(true)

      useInput((input) => {
        if (input === "t") setUseWide((v) => !v)
      })

      return <Text>{useWide ? "🌍🌍" : "abcd"}</Text>
    }

    const app = render(<App />)
    assertBuffersMatch(app, "initial with wide chars")

    await app.press("t")
    assertBuffersMatch(app, "after switching to narrow")

    await app.press("t")
    assertBuffersMatch(app, "after switching back to wide")
  })

  test("narrow to wide transition renders correctly", async () => {
    function App() {
      const [useWide, setUseWide] = useState(false)

      useInput((input) => {
        if (input === "t") setUseWide((v) => !v)
      })

      return <Text>{useWide ? "🌍🎉" : "test"}</Text>
    }

    const app = render(<App />)
    assertBuffersMatch(app, "initial with narrow chars")

    await app.press("t")
    assertBuffersMatch(app, "after switching to wide")

    await app.press("t")
    assertBuffersMatch(app, "after switching back to narrow")
  })

  test("wide chars in Box with background", async () => {
    function App() {
      const [count, setCount] = useState(0)

      useInput((input) => {
        if (input === "j") setCount((c) => c + 1)
      })

      return (
        <Box backgroundColor="blue" width={20}>
          <Text>🌍 Count: {count}</Text>
        </Box>
      )
    }

    const app = render(<App />)
    assertBuffersMatch(app, "initial")

    await app.press("j")
    assertBuffersMatch(app, "after increment")

    await app.press("j")
    assertBuffersMatch(app, "after second increment")
  })

  test("wide chars adjacent to changing narrow content", async () => {
    function App() {
      const [text, setText] = useState("abc")

      useInput((input) => {
        if (input === "t") setText((t) => (t === "abc" ? "xyz" : "abc"))
      })

      return <Text>🌍{text}🎉</Text>
    }

    const app = render(<App />)
    assertBuffersMatch(app, "initial")

    await app.press("t")
    assertBuffersMatch(app, "after text change")

    await app.press("t")
    assertBuffersMatch(app, "after reverting text")
  })

  test("multiple wide chars across columns", async () => {
    function App() {
      const [active, setActive] = useState(0)

      useInput((input) => {
        if (input === "l") setActive((a) => (a + 1) % 3)
      })

      const emojis = ["🌍", "🎉", "🎈"]

      return (
        <Box flexDirection="row" width={40}>
          {emojis.map((emoji, i) => (
            <Box key={i} width={10} backgroundColor={i === active ? "cyan" : undefined}>
              <Text>
                {emoji} {i}
              </Text>
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<App />)
    assertBuffersMatch(app, "initial")

    await app.press("l")
    assertBuffersMatch(app, "after moving to column 1")

    await app.press("l")
    assertBuffersMatch(app, "after moving to column 2")

    await app.press("l")
    assertBuffersMatch(app, "after wrapping to column 0")
  })
})
