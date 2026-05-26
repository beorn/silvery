/**
 * <Terminal> bg-conflict opt-out — STRICT test.
 *
 * silvery's render pipeline enforces background coherence: when ANSI bg in
 * text content layers over an silvery `backgroundColor`, `renderAnsiTextLine`
 * `throw`s a "Background conflict" by default (`render-text.ts`). That throw
 * is the right safety net for an silvery app's own pipeline bugs — chalk bg
 * covers only glyph cells, leaving framework padding gaps.
 *
 * But `<Terminal>` mirrors arbitrary EXTERNAL ANSI by re-encoding a captured
 * terminal cell-grid. Chalk-styled status bars and selection highlights are
 * conflict-rich by nature — an ANSI bg cell over the silvery buffer bg is
 * *expected* there, not a pipeline bug. `<Terminal>` therefore sets
 * `bgConflict="ignore"` on the `<Text>` rows it paints.
 *
 * This test asserts the scope is correct:
 *   1. `<Terminal>` hosting conflict-rich foreign content inside a bg `<Box>`
 *      renders WITHOUT throwing.
 *   2. The SAME encoded rows painted via a plain `<Text>` (no `bgConflict`
 *      opt-out) STILL throw — proving the global safety net is intact for
 *      silvery's own component tree.
 *
 * Pairs with `terminal-component.test.tsx` (the synthetic-grid component
 * tests) and bead `@km/code/15551-termless-rec-bg-conflict-crash`.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import {
  Box,
  encodeTerminalRow,
  Terminal,
  Text,
  type TerminalCell,
  type TerminalCursor,
  type TerminalReadable,
} from "@silvery/ag-react"

const COLS = 24
const ROWS = 4

/**
 * A cell carrying an explicit ANSI background — the conflict trigger. When
 * such a cell is encoded into a row string and that row is painted over an
 * silvery `backgroundColor`, the pipeline's bg-conflict check fires.
 */
function bgCell(char: string): TerminalCell {
  return {
    char,
    fg: { r: 46, g: 52, b: 64 },
    bg: { r: 197, g: 203, b: 215 }, // light bg — the `📁 Vault` breadcrumb hue
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strikethrough: false,
    inverse: false,
  }
}

function blankCell(): TerminalCell {
  return {
    char: " ",
    fg: null,
    bg: null,
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    strikethrough: false,
    inverse: false,
  }
}

/**
 * A conflict-rich foreign grid: row 0 carries bg-styled content cells (a
 * chalk status bar); the rest are blank. Mirrors the `📁 Vault` breadcrumb
 * that crashed `termless rec` of `km view`.
 */
function conflictRichGrid(): TerminalReadable {
  const statusBar: TerminalCell[] = []
  for (let i = 0; i < COLS; i++) {
    const txt = " Vault > Next Actions  "
    statusBar.push(i < txt.length && txt[i] !== " " ? bgCell(txt[i]!) : bgCell(" "))
  }
  const lines: TerminalCell[][] = [statusBar]
  while (lines.length < ROWS) {
    lines.push(Array.from({ length: COLS }, () => blankCell()))
  }
  const cursor: TerminalCursor = { x: 0, y: 0, visible: true }
  return {
    cols: COLS,
    rows: ROWS,
    getLines: () => lines,
    getCursor: () => cursor,
  }
}

describe("<Terminal> bg-conflict opt-out", () => {
  test("pre-condition: the foreign grid is genuinely conflict-rich", () => {
    // Guard: if the fixture stops carrying bg-styled content cells this test
    // would silently stop exercising the conflict path.
    const grid = conflictRichGrid()
    let bgContentCells = 0
    for (const row of grid.getLines()) {
      for (const cell of row) {
        if (cell.bg != null && (cell.char ?? " ").trim() !== "") bgContentCells++
      }
    }
    expect(bgContentCells).toBeGreaterThan(0)
  })

  test("<Terminal> hosting conflict-rich foreign content inside a bg Box does NOT throw", () => {
    const grid = conflictRichGrid()
    const render = createRenderer({ cols: COLS + 4, rows: ROWS + 4 })
    // The `<Box backgroundColor>` seeds an silvery buffer bg under the cells
    // <Terminal> paints — the conflict trigger. <Terminal> sets
    // `bgConflict="ignore"` on its rows, so this must render clean.
    expect(() =>
      render(
        <Box backgroundColor="#2e3440" padding={1}>
          <Terminal terminal={grid} />
        </Box>,
      ),
    ).not.toThrow()
  })

  test("control: the SAME encoded rows via plain <Text> STILL throw (safety net intact)", () => {
    // Proves the opt-out is scoped to <Terminal> only. Encoding the foreign
    // grid by hand and painting it via a plain <Text> — with no
    // `bgConflict` prop — must reproduce the global bg-conflict throw, so
    // silvery's own component tree is still protected.
    const grid = conflictRichGrid()
    const rowStrings = grid.getLines().map((row) => encodeTerminalRow(row, COLS))
    const render = createRenderer({ cols: COLS + 4, rows: ROWS + 4 })
    expect(() =>
      render(
        <Box backgroundColor="#2e3440" padding={1} flexDirection="column">
          {rowStrings.map((line, r) => (
            // eslint-disable-next-line react/no-array-index-key
            <Text key={r}>{line}</Text>
          ))}
        </Box>,
      ),
    ).toThrow(/Background conflict/)
  })

  test('explicit bgConflict="throw" on a <Text> overrides any opt-out', () => {
    // The prop is a per-node override in both directions: a Text node can
    // also force the strict throw. Confirms precedence is the prop, not a
    // <Terminal>-only special case.
    const grid = conflictRichGrid()
    const rowStrings = grid.getLines().map((row) => encodeTerminalRow(row, COLS))
    const render = createRenderer({ cols: COLS + 4, rows: ROWS + 4 })
    expect(() =>
      render(
        <Box backgroundColor="#2e3440" padding={1} flexDirection="column">
          {rowStrings.map((line, r) => (
            // eslint-disable-next-line react/no-array-index-key
            <Text key={r} bgConflict="throw">
              {line}
            </Text>
          ))}
        </Box>,
      ),
    ).toThrow(/Background conflict/)
  })
})
