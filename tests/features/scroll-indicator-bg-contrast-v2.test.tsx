/**
 * @failure  The scroll indicator must be legible on every terminal theme, in
 *           the incremental frame as in the fresh one:
 *           1. No background anywhere (no own bg, no ancestor bg, `$default`, or
 *              `$bg` stripped by mono): the indicator painted fg 15 (bright
 *              white) on the terminal default bg, invisible on a light
 *              terminal. It must take the inherited foreground instead: null
 *              (the terminal default) when nothing sets a colour, an
 *              ancestor's `color` when one does, like the item text it labels.
 *           2. A resolved background (hex, named, rgb(), `$bg` token, lime,
 *              ancestor-only): the fg must be contrastFg(bg) and meet WCAG AA
 *              against that bg, not merely differ from pure white.
 *           3. A background change (dark -> light, bg -> none, own bg removed)
 *              must repaint the indicator so the incremental buffer equals the
 *              fresh one. The earlier rows rerendered identical props, which
 *              compared nothing.
 * @level    l1 (createRenderer; paint pipeline via renderScrollIndicators)
 * @consumer every scroll container with overflowIndicator on any terminal theme
 * @testonly none
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { checkContrast, contrastFg, rgbToHex } from "@silvery/color"
import { bufferToText, compareBuffers, createRenderer, formatMismatch } from "@silvery/test"
import { Box, Text, ThemeProvider } from "../../src/index.js"
import { ansi16LightTheme } from "@silvery/ansi"

const COLS = 20
const ROWS = 5

type App = ReturnType<ReturnType<typeof createRenderer>>
type Cell = ReturnType<App["cell"]>
type Rgb = NonNullable<Cell["fg"]>

const BLACK: Rgb = { r: 0, g: 0, b: 0 }
const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const DARK: Rgb = { r: 0x20, g: 0x20, b: 0x20 }
const LIGHT: Rgb = { r: 0xf0, g: 0xf0, b: 0xf0 }
const INK: Rgb = { r: 0x33, g: 0x66, b: 0x99 }

type SceneProps = Readonly<{ scrollBg?: string; rootBg?: string; rootColor?: string }>

/**
 * A scroll scene that always produces `hiddenBelow > 0` items:
 * 20 items × height 1 = 20 rows of content inside a 5-row viewport.
 */
function ScrollScene({ scrollBg, rootBg, rootColor }: SceneProps): React.ReactElement {
  const items = Array.from({ length: 20 }, (_, i) => (
    <Box key={i} height={1} flexShrink={0}>
      <Text>item-{i}</Text>
    </Box>
  ))
  return (
    <Box width={COLS} height={ROWS} backgroundColor={rootBg} color={rootColor}>
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
 * Same as ScrollScene but wrapped in ThemeProvider, for `$bg` token resolution.
 * ThemeProvider's Box also threads the theme's fg down as the inherited fg.
 */
function ThemedScrollScene({
  scrollBg,
  theme,
}: Readonly<{
  scrollBg?: string
  theme: React.ComponentProps<typeof ThemeProvider>["theme"]
}>): React.ReactElement {
  return (
    <ThemeProvider theme={theme}>
      <ScrollScene scrollBg={scrollBg} />
    </ThemeProvider>
  )
}

/** The ▼ glyph cell on the last row. Fails loudly when the indicator is missing. */
function glyph(app: App): Cell {
  const row = ROWS - 1
  for (let x = 0; x < COLS; x++) {
    const cell = app.cell(x, row)
    if (cell.char === "▼") return cell
  }
  expect.unreachable(`expected a ▼ indicator on row ${row}`)
}

/** The first item's first cell: text with no colour of its own. */
function itemText(app: App): Cell {
  const cell = app.cell(0, 0)
  expect(cell.char, "item-0 starts at (0, 0)").toBe("i")
  return cell
}

const hexOf = (c: Rgb): string => rgbToHex(c.r, c.g, c.b)

/** On a resolved bg the fg is the WCAG pick for that bg, and meets AA against it. */
function expectContrastFgOn(cell: Cell): void {
  if (cell.bg === null) expect.unreachable("indicator bg must resolve")
  if (cell.fg === null) expect.unreachable("indicator fg must be explicit on a resolved bg")
  const bgHex = hexOf(cell.bg)
  const fgHex = hexOf(cell.fg)
  expect(fgHex, `fg on bg ${bgHex} is contrastFg(bg)`).toBe(contrastFg(bgHex))
  const contrast = checkContrast(fgHex, bgHex)
  expect(
    contrast?.aa,
    `fg ${fgHex} on bg ${bgHex} meets WCAG AA (ratio ${contrast?.ratio.toFixed(2)})`,
  ).toBe(true)
}

function expectGlyphColours(
  app: App,
  expected: Readonly<{ bg: Rgb | null; fg: Rgb | null }>,
  key: string,
): void {
  const cell = glyph(app)
  if (expected.bg === null) expect(cell.bg, `${key}: indicator bg`).toBeNull()
  else expect(cell.bg, `${key}: indicator bg`).toMatchObject(expected.bg)
  expect(cell.fg, `${key}: indicator fg`).toEqual(expected.fg)
}

function expectIncrementalMatchesFresh(app: App, key: string): void {
  const incremental = app.lastBuffer()
  if (!incremental) expect.unreachable(`${key}: no incremental buffer`)
  const fresh = app.freshRender()
  const mismatch = compareBuffers(incremental, fresh)
  if (mismatch) {
    expect.unreachable(
      formatMismatch(mismatch, {
        incrementalText: bufferToText(incremental),
        freshText: bufferToText(fresh),
        key,
      }),
    )
  }
}

describe("scroll indicator colours (#26795)", () => {
  describe("no background anywhere: the indicator takes the inherited fg", () => {
    test("nothing sets a colour: fg and bg are the terminal default (null), not bright white", () => {
      const app = createRenderer({ cols: COLS, rows: ROWS })(<ScrollScene />)
      // Bright white (15) on the terminal default bg vanishes on a light
      // terminal. The terminal default fg is legible on the terminal default
      // bg under every theme.
      expectGlyphColours(app, { bg: null, fg: null }, "no bg anywhere")
    })

    test('backgroundColor="$default" is the terminal default bg: fg is the terminal default too', () => {
      const app = createRenderer({ cols: COLS, rows: ROWS })(<ScrollScene scrollBg="$default" />)
      expectGlyphColours(app, { bg: null, fg: null }, "$default bg")
    })

    test("an ancestor sets color: the indicator takes that colour, like the item text", () => {
      const app = createRenderer({ cols: COLS, rows: ROWS })(<ScrollScene rootColor="#336699" />)
      expectGlyphColours(app, { bg: null, fg: INK }, "ancestor color")
      expect(glyph(app).fg, "indicator fg matches the item text").toEqual(itemText(app).fg)
    })

    test("mono strips a $bg token to null: the indicator takes the inherited theme fg", () => {
      const app = createRenderer({ cols: COLS, rows: ROWS, colorLevel: "mono" })(
        <ThemedScrollScene scrollBg="$bg" theme={ansi16LightTheme} />,
      )
      // ansi16LightTheme's fg is #4c4f69. The buffer keeps it and the mono
      // output phase emits no colour, like every other cell at this tier.
      expectGlyphColours(app, { bg: null, fg: { r: 0x4c, g: 0x4f, b: 0x69 } }, "mono $bg")
      expect(glyph(app).fg, "indicator fg matches the item text").toEqual(itemText(app).fg)
    })
  })

  describe("a resolved background: the fg is contrastFg(bg) and meets WCAG AA", () => {
    test.each<{ label: string; scene: () => React.ReactElement; bg: Rgb }>([
      { label: "hex #ffffff", scene: () => <ScrollScene scrollBg="#ffffff" />, bg: WHITE },
      {
        label: 'named "white" (ANSI 7)',
        scene: () => <ScrollScene scrollBg="white" />,
        bg: { r: 192, g: 192, b: 192 },
      },
      {
        label: "rgb(255,255,255)",
        scene: () => <ScrollScene scrollBg="rgb(255,255,255)" />,
        bg: WHITE,
      },
      {
        label: "lime #00ff00",
        scene: () => <ScrollScene scrollBg="#00ff00" />,
        bg: { r: 0, g: 255, b: 0 },
      },
      {
        label: "$bg token under a light theme",
        scene: () => <ThemedScrollScene scrollBg="$bg" theme={ansi16LightTheme} />,
        bg: { r: 0xef, g: 0xf1, b: 0xf5 },
      },
      { label: "dark ancestor bg only", scene: () => <ScrollScene rootBg="#202020" />, bg: DARK },
    ])("$label", ({ scene, bg }) => {
      const app = createRenderer({ cols: COLS, rows: ROWS })(scene())
      const cell = glyph(app)
      expect(cell.bg, "indicator bg").toMatchObject(bg)
      expectContrastFgOn(cell)
    })
  })

  describe("a background change repaints the indicator in the incremental frame", () => {
    type Step = Readonly<{ props: SceneProps; bg: Rgb | null; fg: Rgb | null }>
    test.each<{ label: string; steps: readonly Step[] }>([
      {
        label: "ancestor bg: dark -> light -> none -> dark",
        steps: [
          { props: { rootBg: "#202020" }, bg: DARK, fg: WHITE },
          { props: { rootBg: "#f0f0f0" }, bg: LIGHT, fg: BLACK },
          { props: {}, bg: null, fg: null },
          { props: { rootBg: "#202020" }, bg: DARK, fg: WHITE },
        ],
      },
      {
        label: "ancestor bg under an ancestor color: light -> none -> dark",
        steps: [
          { props: { rootColor: "#336699", rootBg: "#f0f0f0" }, bg: LIGHT, fg: BLACK },
          { props: { rootColor: "#336699" }, bg: null, fg: INK },
          { props: { rootColor: "#336699", rootBg: "#202020" }, bg: DARK, fg: WHITE },
        ],
      },
      {
        label: "own bg: white -> none",
        steps: [
          { props: { scrollBg: "#ffffff" }, bg: WHITE, fg: BLACK },
          { props: {}, bg: null, fg: null },
        ],
      },
    ])("$label", ({ label, steps }) => {
      const [first, ...rest] = steps
      if (!first) expect.unreachable("a sequence needs a first step")
      const app = createRenderer({ cols: COLS, rows: ROWS })(<ScrollScene {...first.props} />)
      expectGlyphColours(app, first, `${label} / initial`)
      rest.forEach((step, i) => {
        const key = `${label} / step ${i + 1}`
        app.rerender(<ScrollScene {...step.props} />)
        expectGlyphColours(app, step, key)
        expectIncrementalMatchesFresh(app, key)
      })
    })
  })
})
