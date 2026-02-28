/**
 * Wide Terminal Cursor Drift Reproduction Test
 *
 * Bug: At wide terminal widths (204+ columns), INKX_STRICT_OUTPUT detects
 * a mismatch at (204,5) with incremental='│' fresh=' '. The incremental
 * render is shifted right ~2 positions vs the fresh render.
 *
 * This happened after a refactoring that replaced global setOutputCaps() /
 * setTextEmojiWide() with factory-based createOutputPhase(caps) and
 * createPipeline({caps}). The factory delegates to module-level outputPhase
 * which swaps _caps via closure:
 *
 *   scopedOutputPhase → sets _caps → calls outputPhase → calls
 *   verifyOutputEquivalence → calls bufferToAnsi (reads _caps) → restores _caps
 *
 * Existing tests all pass (cols 40-80), so this is a width-specific issue.
 *
 * Results:
 * - Output phase (changesToAnsi, bufferToAnsi) handles wide columns correctly.
 *   All raw TerminalBuffer tests pass with INKX_STRICT_OUTPUT=1 at cols 200-250.
 * - createOutputPhase caps swapping works correctly during verification.
 * - Content phase has an unrelated dirty-flag propagation bug with
 *   conditionally-styled column headers at wide widths (headers not re-rendered
 *   when inverse prop changes). This manifests as an INKX_CHECK_INCREMENTAL
 *   mismatch, NOT INKX_STRICT_OUTPUT. See the "content phase" describe block.
 *
 * The original INKX_STRICT_OUTPUT cursor drift bug may require the actual
 * km-tui board component (with its specific outline/scroll/sticky structure)
 * to reproduce. The simplified board layouts here don't trigger it.
 */
import React from "react"
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "../tests/setup.js"
import { outputPhase, createOutputPhase } from "../src/pipeline/output-phase.js"
import { TerminalBuffer, bufferToText } from "../src/buffer.js"
import { compareBuffers, formatMismatch } from "inkx/testing"

// ============================================================================
// Output Phase: Direct buffer tests (all pass, confirming no cursor drift)
// ============================================================================

describe("wide terminal output phase", () => {
  beforeEach(() => {
    process.env.INKX_STRICT_OUTPUT = "1"
  })
  afterEach(() => {
    delete process.env.INKX_STRICT_OUTPUT
  })

  test("createOutputPhase caps are active during verification", () => {
    // Create two output phases with different caps to verify isolation
    const phase1 = createOutputPhase({
      underlineStyles: true,
      underlineColor: true,
      colorLevel: "truecolor",
    })
    const phase2 = createOutputPhase({
      underlineStyles: false,
      underlineColor: false,
      colorLevel: "256",
    })

    // Build a buffer with styled content at wide columns
    const width = 210
    const height = 10
    const prev = new TerminalBuffer(width, height)
    const next = new TerminalBuffer(width, height)

    // Fill prev with content
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        prev.setCell(x, y, { char: " " })
        next.setCell(x, y, { char: " " })
      }
    }

    // Add border-like content near column 204
    for (let y = 0; y < height; y++) {
      prev.setCell(200, y, { char: "│", fg: 8 })
      prev.setCell(204, y, { char: "│", fg: 8 })
      next.setCell(200, y, { char: "│", fg: 8 })
      next.setCell(204, y, { char: "│", fg: 8 })
    }

    // Change content between borders to trigger incremental update
    for (let x = 201; x < 204; x++) {
      prev.setCell(x, 5, { char: "a" })
      next.setCell(x, 5, { char: "B", fg: 3 })
    }

    // Both phases should produce equivalent output without error
    const out1 = phase1(prev, next)
    expect(out1.length).toBeGreaterThan(0)

    const out2 = phase2(prev, next)
    expect(out2.length).toBeGreaterThan(0)
  })

  test("changesToAnsi cursor tracking at column 200+", () => {
    const width = 210
    const height = 10

    const prev = new TerminalBuffer(width, height)
    const next = new TerminalBuffer(width, height)

    // Fill both buffers with identical content
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        prev.setCell(x, y, { char: " " })
        next.setCell(x, y, { char: " " })
      }
    }

    // Create a board-like pattern with borders at high column numbers
    for (let y = 1; y < 9; y++) {
      prev.setCell(150, y, { char: "│" })
      prev.setCell(205, y, { char: "│" })
      next.setCell(150, y, { char: "│" })
      next.setCell(205, y, { char: "│" })
    }

    // Top and bottom borders
    for (let x = 150; x <= 205; x++) {
      prev.setCell(x, 0, { char: x === 150 ? "╭" : x === 205 ? "╮" : "─" })
      prev.setCell(x, 9, { char: x === 150 ? "╰" : x === 205 ? "╯" : "─" })
      next.setCell(x, 0, { char: x === 150 ? "╭" : x === 205 ? "╮" : "─" })
      next.setCell(x, 9, { char: x === 150 ? "╰" : x === 205 ? "╯" : "─" })
    }

    // Change border color (simulating selection)
    for (let y = 1; y < 9; y++) {
      next.setCell(150, y, { char: "│", fg: 3 })
      next.setCell(205, y, { char: "│", fg: 3 })
    }
    for (let x = 150; x <= 205; x++) {
      next.setCell(x, 0, {
        char: x === 150 ? "╭" : x === 205 ? "╮" : "─",
        fg: 3,
      })
      next.setCell(x, 9, {
        char: x === 150 ? "╰" : x === 205 ? "╯" : "─",
        fg: 3,
      })
    }

    // INKX_STRICT_OUTPUT will verify equivalence
    const output = outputPhase(prev, next)
    expect(output.length).toBeGreaterThan(0)
  })

  test("scattered changes across wide row", () => {
    const width = 210
    const height = 6

    const prev = new TerminalBuffer(width, height)
    const next = new TerminalBuffer(width, height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        prev.setCell(x, y, { char: " " })
        next.setCell(x, y, { char: " " })
      }
    }

    // Multiple borders (4-column board): x=0, 52, 104, 156, 209
    const borderPositions = [0, 52, 104, 156, 209]
    for (let y = 0; y < height; y++) {
      for (const bx of borderPositions) {
        if (bx < width) {
          prev.setCell(bx, y, { char: "│", fg: 8 })
          next.setCell(bx, y, { char: "│", fg: 8 })
        }
      }
    }

    // Change content near right edge
    for (let x = 157; x < 209; x++) {
      prev.setCell(x, 2, { char: " " })
      next.setCell(x, 2, {
        char: x === 157 ? ">" : " ",
        fg: x === 157 ? 3 : undefined,
      })
    }
    next.setCell(156, 2, { char: "│", fg: 3 })
    next.setCell(209, 2, { char: "│", fg: 3 })

    const output = outputPhase(prev, next)
    expect(output.length).toBeGreaterThan(0)
  })

  test("style resets at high columns dont cause cursor drift", () => {
    const width = 210
    const height = 8

    const prev = new TerminalBuffer(width, height)
    const next = new TerminalBuffer(width, height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        prev.setCell(x, y, { char: " " })
        next.setCell(x, y, { char: " " })
      }
    }

    // Alternating bg-color cells near column 200 (forces style resets before CUF)
    for (let x = 195; x < 210; x++) {
      const hasBg = x % 3 === 0
      prev.setCell(x, 3, {
        char: String.fromCharCode(65 + (x % 26)),
        bg: hasBg ? 4 : undefined,
      })
      next.setCell(x, 3, {
        char: String.fromCharCode(65 + (x % 26)),
        bg: hasBg ? (x > 200 ? 2 : 4) : undefined,
      })
    }

    // Change at low column on same row (forces cursor jump)
    prev.setCell(10, 3, { char: "X", fg: 1 })
    next.setCell(10, 3, { char: "Y", fg: 2 })

    const output = outputPhase(prev, next)
    expect(output.length).toBeGreaterThan(0)
  })

  test("many style transitions on same row at column 200+", () => {
    const width = 210
    const height = 3

    const prev = new TerminalBuffer(width, height)
    const next = new TerminalBuffer(width, height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        prev.setCell(x, y, { char: " " })
        next.setCell(x, y, { char: " " })
      }
    }

    // Many style transitions near column 200
    for (let x = 190; x < 210; x++) {
      const color = (x - 190) % 8
      prev.setCell(x, 1, { char: "x", fg: color })
      next.setCell(x, 1, {
        char: x % 2 === 0 ? "O" : "x",
        fg: x % 2 === 0 ? color + 8 : color,
      })
    }

    const output = outputPhase(prev, next)
    expect(output.length).toBeGreaterThan(0)
  })

  test("absolute positioning (CUP) at 3-digit columns", () => {
    const width = 210
    const height = 10

    const prev = new TerminalBuffer(width, height)
    const next = new TerminalBuffer(width, height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        prev.setCell(x, y, { char: " " })
        next.setCell(x, y, { char: " " })
      }
    }

    // Scatter single-cell changes across rows at high columns
    const changes = [
      { x: 204, y: 1 },
      { x: 200, y: 3 },
      { x: 208, y: 5 },
      { x: 203, y: 7 },
      { x: 199, y: 9 },
    ]

    for (const { x, y } of changes) {
      prev.setCell(x, y, { char: " " })
      next.setCell(x, y, { char: "│", fg: 3 })
    }

    const output = outputPhase(prev, next)
    expect(output.length).toBeGreaterThan(0)

    // Verify CUP sequences (1-indexed)
    expect(output).toContain("\x1b[2;205H") // y=1,x=204
    expect(output).toContain("\x1b[4;201H") // y=3,x=200
    expect(output).toContain("\x1b[6;209H") // y=5,x=208
  })

  test("CUF (cursor forward) at high column numbers", () => {
    const width = 210
    const height = 3

    const prev = new TerminalBuffer(width, height)
    const next = new TerminalBuffer(width, height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        prev.setCell(x, y, { char: " " })
        next.setCell(x, y, { char: " " })
      }
    }

    // Changes on same row with gaps (forces CUF)
    for (const x of [190, 195, 200, 205]) {
      prev.setCell(x, 1, { char: "." })
      next.setCell(x, 1, { char: "#", fg: 2 })
    }

    const output = outputPhase(prev, next)
    expect(output.length).toBeGreaterThan(0)
  })

  test("border char at exact column 204, row 5", () => {
    const width = 210
    const height = 10

    const prev = new TerminalBuffer(width, height)
    const next = new TerminalBuffer(width, height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        prev.setCell(x, y, { char: " " })
        next.setCell(x, y, { char: " " })
      }
    }

    // Card border at column 150 and 204 (matches bug report position)
    for (let y = 2; y <= 8; y++) {
      prev.setCell(150, y, { char: "│", fg: 8 })
      prev.setCell(204, y, { char: "│", fg: 8 })
      next.setCell(150, y, { char: "│", fg: 8 })
      next.setCell(204, y, { char: "│", fg: 8 })
    }
    for (let x = 150; x <= 204; x++) {
      prev.setCell(x, 2, { char: x === 150 ? "╭" : x === 204 ? "╮" : "─", fg: 8 })
      prev.setCell(x, 8, { char: x === 150 ? "╰" : x === 204 ? "╯" : "─", fg: 8 })
      next.setCell(x, 2, { char: x === 150 ? "╭" : x === 204 ? "╮" : "─", fg: 8 })
      next.setCell(x, 8, { char: x === 150 ? "╰" : x === 204 ? "╯" : "─", fg: 8 })
    }

    // Text inside the card
    const text = "Card Title - Some content here"
    for (let i = 0; i < text.length && 152 + i < 204; i++) {
      prev.setCell(152 + i, 4, { char: text[i]! })
      next.setCell(152 + i, 4, { char: text[i]! })
    }

    // Select: change border color gray -> yellow
    for (let y = 2; y <= 8; y++) {
      next.setCell(150, y, { char: y === 2 ? "╭" : y === 8 ? "╰" : "│", fg: 3 })
      next.setCell(204, y, { char: y === 2 ? "╮" : y === 8 ? "╯" : "│", fg: 3 })
    }
    for (let x = 151; x < 204; x++) {
      next.setCell(x, 2, { char: "─", fg: 3 })
      next.setCell(x, 8, { char: "─", fg: 3 })
    }

    // Highlight text inside
    const newText = "> Selected Card Title"
    for (let i = 0; i < newText.length && 152 + i < 204; i++) {
      next.setCell(152 + i, 5, { char: newText[i]!, fg: 3, bold: true })
    }

    const output = outputPhase(prev, next)
    expect(output.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// Content Phase: React component tests
// These found an unrelated dirty-flag propagation bug where column headers
// with conditional inverse/bold are not re-rendered after cursor moves.
// This is a content-phase bug, not the output-phase cursor drift.
// ============================================================================

describe("wide terminal content phase (board layout)", () => {
  beforeEach(() => {
    process.env.INKX_STRICT_OUTPUT = "1"
  })
  afterEach(() => {
    delete process.env.INKX_STRICT_OUTPUT
  })

  // Simple card without conditional styling in header (avoids dirty flag bug)
  function SimpleCard({
    title,
    selected,
    width: cardWidth,
  }: {
    title: string
    selected: boolean
    width: number
  }) {
    return (
      <Box
        flexDirection="column"
        width={cardWidth}
        borderStyle="round"
        borderColor={selected ? "yellow" : "gray"}
        paddingRight={1}
      >
        <Text bold={selected}>{title}</Text>
        <Text> Content here</Text>
      </Box>
    )
  }

  function SimpleBoard({
    cols,
    rows,
    cursor,
  }: {
    cols: number
    rows: number
    cursor: [number, number]
  }) {
    const colWidth = Math.floor(cols / 4)
    const columns = [
      { cards: Array.from({ length: 10 }, (_, i) => `Task A-${i}`) },
      { cards: Array.from({ length: 10 }, (_, i) => `Task B-${i}`) },
      { cards: Array.from({ length: 10 }, (_, i) => `Task C-${i}`) },
      { cards: Array.from({ length: 10 }, (_, i) => `Task D-${i}`) },
    ]

    return (
      <Box flexDirection="row" width={cols} height={rows}>
        {columns.map((col, colIdx) => (
          <Box
            key={colIdx}
            flexDirection="column"
            width={colIdx < 3 ? colWidth : cols - colWidth * 3}
            height={rows}
          >
            <Box overflow="scroll" flexDirection="column" height={rows}>
              {col.cards.map((card, i) => (
                <SimpleCard
                  key={i}
                  title={card}
                  selected={cursor[0] === colIdx && cursor[1] === i}
                  width={colIdx < 3 ? colWidth : cols - colWidth * 3}
                />
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    )
  }

  function assertBuffersMatch(
    app: ReturnType<ReturnType<typeof createRenderer>>,
  ): void {
    const fresh = app.freshRender()
    const current = app.lastBuffer()!
    const mismatch = compareBuffers(current, fresh)
    if (mismatch) {
      const msg = formatMismatch(mismatch, {
        incrementalText: bufferToText(current),
        freshText: bufferToText(fresh),
      })
      throw new Error(`Incremental/fresh mismatch:\n${msg}`)
    }
  }

  test("210 cols: card selection triggers border color change", () => {
    const cols = 210
    const rows = 25
    const render = createRenderer({ cols, rows })

    const app = render(
      <SimpleBoard cols={cols} rows={rows} cursor={[0, 0]} />,
    )
    assertBuffersMatch(app)

    // Select card in rightmost column
    app.rerender(
      <SimpleBoard cols={cols} rows={rows} cursor={[3, 0]} />,
    )
    assertBuffersMatch(app)

    // Move to different card in same column
    app.rerender(
      <SimpleBoard cols={cols} rows={rows} cursor={[3, 2]} />,
    )
    assertBuffersMatch(app)
  })

  test("210 cols: navigation through all columns", () => {
    const cols = 210
    const rows = 20
    const render = createRenderer({ cols, rows })

    const app = render(
      <SimpleBoard cols={cols} rows={rows} cursor={[0, 0]} />,
    )
    assertBuffersMatch(app)

    const moves: [number, number][] = [
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 2],
      [2, 2],
      [1, 2],
      [0, 2],
    ]
    for (const cursor of moves) {
      app.rerender(
        <SimpleBoard cols={cols} rows={rows} cursor={cursor} />,
      )
      assertBuffersMatch(app)
    }
  })

  test("widths 200-220: border changes near right edge", () => {
    for (const cols of [200, 204, 210, 215, 220]) {
      const rows = 15
      const render = createRenderer({ cols, rows })

      const app = render(
        <SimpleBoard cols={cols} rows={rows} cursor={[0, 0]} />,
      )
      assertBuffersMatch(app)

      app.rerender(
        <SimpleBoard cols={cols} rows={rows} cursor={[3, 0]} />,
      )
      assertBuffersMatch(app)

      app.rerender(
        <SimpleBoard cols={cols} rows={rows} cursor={[0, 0]} />,
      )
      assertBuffersMatch(app)
    }
  })

  // Outline-style borders (used by km-tui cards)
  test("outline borders at wide widths", () => {
    function OutlineBoard({
      cols,
      rows,
      cursor,
    }: {
      cols: number
      rows: number
      cursor: [number, number]
    }) {
      const colWidth = Math.floor(cols / 3)
      return (
        <Box flexDirection="row" width={cols} height={rows}>
          {[0, 1, 2].map((colIdx) => (
            <Box
              key={colIdx}
              flexDirection="column"
              width={colIdx < 2 ? colWidth : cols - colWidth * 2}
              height={rows}
            >
              <Box overflow="scroll" flexDirection="column" height={rows}>
                {Array.from({ length: 10 }, (_, i) => (
                  <Box
                    key={i}
                    height={3}
                    outlineStyle={
                      cursor[0] === colIdx && cursor[1] === i
                        ? "round"
                        : undefined
                    }
                    outlineColor={
                      cursor[0] === colIdx && cursor[1] === i
                        ? "yellow"
                        : undefined
                    }
                  >
                    <Text>
                      {" "}
                      Card {colIdx}-{i}: {"content ".repeat(5)}
                    </Text>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )
    }

    const cols = 210
    const rows = 25
    const render = createRenderer({ cols, rows })

    const app = render(
      <OutlineBoard cols={cols} rows={rows} cursor={[0, 0]} />,
    )
    assertBuffersMatch(app)

    app.rerender(
      <OutlineBoard cols={cols} rows={rows} cursor={[2, 0]} />,
    )
    assertBuffersMatch(app)

    app.rerender(
      <OutlineBoard cols={cols} rows={rows} cursor={[2, 3]} />,
    )
    assertBuffersMatch(app)

    app.rerender(
      <OutlineBoard cols={cols} rows={rows} cursor={[1, 3]} />,
    )
    assertBuffersMatch(app)
  })

  // Mixed border + backgroundColor
  test("border + backgroundColor at 210 cols", () => {
    function ColorBoard({
      cols,
      rows,
      selected,
    }: {
      cols: number
      rows: number
      selected: number
    }) {
      const cardWidth = Math.floor(cols / 4)
      return (
        <Box flexDirection="row" width={cols} height={rows}>
          {Array.from({ length: 4 }, (_, i) => (
            <Box
              key={i}
              width={i < 3 ? cardWidth : cols - cardWidth * 3}
              height={rows}
              borderStyle="round"
              borderColor={i === selected ? "yellow" : "gray"}
              backgroundColor={i === selected ? "blue" : undefined}
            >
              <Text color={i === selected ? "white" : undefined}>
                Panel {i}: {"text content ".repeat(5)}
              </Text>
            </Box>
          ))}
        </Box>
      )
    }

    const cols = 210
    const rows = 15
    const render = createRenderer({ cols, rows })

    const app = render(
      <ColorBoard cols={cols} rows={rows} selected={0} />,
    )
    assertBuffersMatch(app)

    for (let i = 1; i <= 3; i++) {
      app.rerender(<ColorBoard cols={cols} rows={rows} selected={i} />)
      assertBuffersMatch(app)
    }

    app.rerender(<ColorBoard cols={cols} rows={rows} selected={0} />)
    assertBuffersMatch(app)
  })
})
