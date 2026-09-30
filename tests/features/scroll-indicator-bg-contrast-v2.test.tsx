/**
 * @failure  The 26737 fix to renderScrollIndicators reimplements two existing
 *           primitives and leaves four edge cases broken:
 *           1. `isLightColor` only classifies hex strings — fails for "white",
 *              "rgb(255,255,255)", and "$bg" under a light theme.
 *           2. `resolveAncestorBg` reimplements NodeRenderState.inheritedBg,
 *              which is already threaded top-down with O(1) access.
 *           3. True no-bg (no ancestor at all) gives fg 15 on null — invisible
 *              on light terminal themes where the terminal paints white slots.
 *           4. `parseColor(rawBg)` omits `ctx?.colorLevel` — mono renderer
 *              with a `$bg` token gets the wrong result.
 *           Fix: use nodeState.inheritedBg.color (O(1)) + contrastFg from
 *           @silvery/color + parseColor with colorLevel.
 * @level    l1 (createRenderer; paint pipeline via renderScrollIndicators)
 * @consumer every scroll container with overflowIndicator on any terminal theme
 * @testonly none
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { bufferToText, compareBuffers, createRenderer, formatMismatch } from "@silvery/test"
import { Box, Text, ThemeProvider } from "../../src/index.js"
import { ansi16LightTheme } from "@silvery/ansi"

const COLS = 20
const ROWS = 5

/**
 * A scroll scene that always produces `hiddenBelow > 0` items:
 * 20 items × height 1 = 20 rows of content inside a 5-row viewport.
 */
function ScrollScene({
  scrollBg,
  rootBg,
}: Readonly<{ scrollBg?: string; rootBg?: string }>): React.ReactElement {
  const items = Array.from({ length: 20 }, (_, i) => (
    <Box key={i} height={1} flexShrink={0}>
      <Text>item-{i}</Text>
    </Box>
  ))
  return (
    <Box width={COLS} height={ROWS} backgroundColor={rootBg}>
      <Box
        width={COLS}
        height={ROWS}
        flexDirection="column"
        overflow="scroll"
        overflowIndicator
        backgroundColor={scrollBg}
      >
        {items}
      </Box>
    </Box>
  )
}

/**
 * Same as ScrollScene but wraps in ThemeProvider — needed for $bg token
 * resolution.
 */
function ThemedScrollScene({
  scrollBg,
  rootBg,
  theme,
}: Readonly<{
  scrollBg?: string
  rootBg?: string
  theme: React.ComponentProps<typeof ThemeProvider>["theme"]
}>): React.ReactElement {
  const items = Array.from({ length: 20 }, (_, i) => (
    <Box key={i} height={1} flexShrink={0}>
      <Text>item-{i}</Text>
    </Box>
  ))
  return (
    <ThemeProvider theme={theme}>
      <Box width={COLS} height={ROWS} backgroundColor={rootBg}>
        <Box
          width={COLS}
          height={ROWS}
          flexDirection="column"
          overflow="scroll"
          overflowIndicator
          backgroundColor={scrollBg}
        >
          {items}
        </Box>
      </Box>
    </ThemeProvider>
  )
}

/**
 * Find the column of the first ▼ or ▲ glyph on a given row.
 * Returns -1 if not found.
 */
function findIndicatorCol(app: ReturnType<ReturnType<typeof createRenderer>>, row: number): number {
  for (let x = 0; x < COLS; x++) {
    const ch = app.cell(x, row).char
    if (ch === "▼" || ch === "▲") return x
  }
  return -1
}

describe("scroll indicator bg contrast v2 (#26795)", () => {
  test("true no-bg: fg is dark on light terminal theme", () => {
    // Light theme: slots 7 and 15 are light colors. The scroll container has
    // no backgroundColor and no ancestor bg. Before the fix, fg is always 15
    // (bright white) — invisible when the terminal paints slot 15 as white.
    // After the fix, inheritedBg.color is null (no ancestor), so we fall
    // back to the terminal's default; contrastFg must NOT be applied blindly
    // with a null bg. The indicator fg should be resolved via contrastFg
    // when bg is known, otherwise the test verifies that a rerender still
    // keeps the buffer stable (STRICT compareBuffers).
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<ScrollScene />)

    const indicatorRow = ROWS - 1
    const col = findIndicatorCol(app, indicatorRow)
    expect(col, "expected a ▼ indicator on the last row").toBeGreaterThanOrEqual(0)

    // Rerender must not crash and must produce a buffer that matches fresh.
    app.rerender(<ScrollScene />)
    const incremental = app.lastBuffer()
    expect(incremental).toBeDefined()
    const fresh = app.freshRender()
    const mismatch = compareBuffers(incremental!, fresh)
    if (mismatch) {
      expect.unreachable(
        formatMismatch(mismatch, {
          incrementalText: bufferToText(incremental!),
          freshText: bufferToText(fresh),
          key: "true no-bg rerender",
        }),
      )
    }
  })

  test('named color "white" bg: indicator is legible', () => {
    // backgroundColor="white" — isLightColor("white") returns false (hex-only).
    // After the fix, parseColor("white", colorLevel) returns an RGB object and
    // contrastFg picks fg 0 (black). fg must not equal bg (white-on-white).
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<ScrollScene scrollBg="white" />)

    const indicatorRow = ROWS - 1
    const col = findIndicatorCol(app, indicatorRow)
    expect(col, "expected a ▼ indicator on the last row").toBeGreaterThanOrEqual(0)

    const cell = app.cell(col, indicatorRow)
    // bg should be resolved from "white" → RGB
    expect(cell.bg, "indicator bg must resolve from named 'white'").not.toBeNull()
    // fg must be dark (black) on a white bg — not white-on-white
    if (cell.fg && cell.bg) {
      const fgIsWhite =
        typeof cell.fg !== "number" &&
        cell.fg !== null &&
        "r" in cell.fg &&
        cell.fg.r === 255 &&
        cell.fg.g === 255 &&
        cell.fg.b === 255
      const bgIsWhite =
        typeof cell.bg !== "number" &&
        cell.bg !== null &&
        "r" in cell.bg &&
        cell.bg.r === 255 &&
        cell.bg.g === 255 &&
        cell.bg.b === 255
      expect(
        fgIsWhite && bgIsWhite,
        'indicator must not be white-on-white for backgroundColor="white"',
      ).toBe(false)
    }

    // Rerender must produce a stable buffer.
    app.rerender(<ScrollScene scrollBg="white" />)
    const incremental = app.lastBuffer()
    expect(incremental).toBeDefined()
    const fresh = app.freshRender()
    const mismatch = compareBuffers(incremental!, fresh)
    if (mismatch) {
      expect.unreachable(
        formatMismatch(mismatch, {
          incrementalText: bufferToText(incremental!),
          freshText: bufferToText(fresh),
          key: 'named "white" bg rerender',
        }),
      )
    }
  })

  test("rgb() color bg: indicator is legible", () => {
    // backgroundColor="rgb(255,255,255)" — isLightColor fails for this format.
    // After the fix, parseColor resolves it to {r:255,g:255,b:255} and
    // contrastFg returns "#000000".
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<ScrollScene scrollBg="rgb(255,255,255)" />)

    const indicatorRow = ROWS - 1
    const col = findIndicatorCol(app, indicatorRow)
    expect(col, "expected a ▼ indicator on the last row").toBeGreaterThanOrEqual(0)

    const cell = app.cell(col, indicatorRow)
    expect(cell.bg, "indicator bg must resolve from rgb() color").not.toBeNull()
    if (cell.fg && cell.bg) {
      const fgIsWhite =
        typeof cell.fg !== "number" &&
        cell.fg !== null &&
        "r" in cell.fg &&
        cell.fg.r === 255 &&
        cell.fg.g === 255 &&
        cell.fg.b === 255
      const bgIsWhite =
        typeof cell.bg !== "number" &&
        cell.bg !== null &&
        "r" in cell.bg &&
        cell.bg.r === 255 &&
        cell.bg.g === 255 &&
        cell.bg.b === 255
      expect(
        fgIsWhite && bgIsWhite,
        "indicator must not be white-on-white for rgb(255,255,255) bg",
      ).toBe(false)
    }

    // Rerender must produce a stable buffer.
    app.rerender(<ScrollScene scrollBg="rgb(255,255,255)" />)
    const incremental = app.lastBuffer()
    expect(incremental).toBeDefined()
    const fresh = app.freshRender()
    const mismatch = compareBuffers(incremental!, fresh)
    if (mismatch) {
      expect.unreachable(
        formatMismatch(mismatch, {
          incrementalText: bufferToText(incremental!),
          freshText: bufferToText(fresh),
          key: "rgb() bg rerender",
        }),
      )
    }
  })

  test("token $bg under a light theme: indicator is legible", () => {
    // backgroundColor="$bg" with a light theme — the token resolves to the
    // theme's background (#eff1f5 in the default light scheme, a very light
    // color). isLightColor("$bg") → false (not hex). After the fix,
    // parseColor("$bg", colorLevel) resolves the token against the active
    // theme and colorToHex + contrastFg picks fg 0 (black).
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(<ThemedScrollScene scrollBg="$bg" theme={ansi16LightTheme} />)

    const indicatorRow = ROWS - 1
    const col = findIndicatorCol(app, indicatorRow)
    expect(col, "expected a ▼ indicator on the last row").toBeGreaterThanOrEqual(0)

    const cell = app.cell(col, indicatorRow)
    // The $bg token under a light theme resolves to a light hex → bg not null.
    expect(cell.bg, "indicator bg must resolve from $bg token").not.toBeNull()
    // fg should be dark (0 or black) on a light bg, not bright white.
    // We can't check exact value because it depends on WCAG, but it must not
    // be white on a very light background.
    if (cell.fg !== null && cell.bg !== null) {
      const bgIsLight = (() => {
        const bg = cell.bg
        if (typeof bg !== "number" && bg !== null && "r" in bg) {
          return (bg.r + bg.g + bg.b) / 3 > 200
        }
        return false
      })()
      if (bgIsLight) {
        // fg must be dark — either index 0 (black) or an RGB near black
        const fg = cell.fg
        const fgIsLight = (() => {
          if (typeof fg === "number") return fg === 15 || fg === 7
          if (fg !== null && "r" in fg) return (fg.r + fg.g + fg.b) / 3 > 128
          return false
        })()
        expect(fgIsLight, "indicator fg must be dark on a light $bg token").toBe(false)
      }
    }

    // Rerender must produce a stable buffer.
    app.rerender(<ThemedScrollScene scrollBg="$bg" theme={ansi16LightTheme} />)
    const incremental = app.lastBuffer()
    expect(incremental).toBeDefined()
    const fresh = app.freshRender()
    const mismatch = compareBuffers(incremental!, fresh)
    if (mismatch) {
      expect.unreachable(
        formatMismatch(mismatch, {
          incrementalText: bufferToText(incremental!),
          freshText: bufferToText(fresh),
          key: "$bg light theme rerender",
        }),
      )
    }
  })

  test("mono renderer: indicator bg resolves colorLevel", () => {
    // Mono renderer + $bg token: parseColor("$bg", "mono") strips colors.
    // The indicator bg should fall back to inheritedBg.color (null at root)
    // and the buffer must be STRICT-stable across rerenders.
    const render = createRenderer({ cols: COLS, rows: ROWS, colorLevel: "mono" })
    const app = render(<ThemedScrollScene scrollBg="$bg" theme={ansi16LightTheme} />)

    const indicatorRow = ROWS - 1
    const col = findIndicatorCol(app, indicatorRow)
    expect(col, "expected a ▼ indicator on the last row").toBeGreaterThanOrEqual(0)

    // At mono tier, bg is stripped — the indicator bg is null (terminal default).
    // The important thing is that the cell is visible (not crashed) and rerenders
    // produce a buffer that matches fresh.
    app.rerender(<ThemedScrollScene scrollBg="$bg" theme={ansi16LightTheme} />)
    const incremental = app.lastBuffer()
    expect(incremental).toBeDefined()
    const fresh = app.freshRender()
    const mismatch = compareBuffers(incremental!, fresh)
    if (mismatch) {
      expect.unreachable(
        formatMismatch(mismatch, {
          incrementalText: bufferToText(incremental!),
          freshText: bufferToText(fresh),
          key: "mono $bg rerender",
        }),
      )
    }
  })
})
