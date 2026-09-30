/**
 * @failure  Regression suite for the no-background fg-slot-15 bug (#26795 v3):
 *
 *           When no background was set anywhere (no own bg, no ancestor bg,
 *           `$default`, or `$bg` stripped by mono), renderScrollIndicators
 *           painted fg=15 (bright white) on the terminal default bg — invisible
 *           on a light terminal.  The v2 suite caught the regression only
 *           partially:
 *
 *           1. The no-bg test asserted `fg !== null`, not `fg !== 15`.
 *              At the broken HEAD fg was the number 15, which `cellToFrameCell`
 *              resolves to an RGB (192,192,192) — non-null — so the assertion
 *              passed vacuously.
 *           2. The ancestor-bg rerender passed identical props on every step,
 *              so the incremental check compared a frame against itself.
 *           3. The named-colour test checked `r === 255` for `"white"`, but
 *              ANSI slot 7 resolves to (192,192,192), so it never caught the
 *              wrong fg.
 *           4. Lime (#00ff00) was not tested.
 *
 *           These four tests FAIL at silvery 9318538bb7 (fg=15 HEAD) and PASS
 *           after the inheritedFg fix (fg=null when no bg, contrastFg otherwise).
 *
 * @level    l1 (createRenderer; pipeline via renderScrollIndicators)
 * @consumer every scroll container with overflowIndicator, any terminal theme
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
// ANSI slot 7 ("white") resolves to (192,192,192), not (255,255,255).
const ANSI_WHITE: Rgb = { r: 192, g: 192, b: 192 }
const LIME: Rgb = { r: 0, g: 255, b: 0 }

type SceneProps = Readonly<{ scrollBg?: string; rootBg?: string; rootColor?: string }>

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

describe("scroll indicator colours — v3 regression (#26795 inheritedFg)", () => {
  /**
   * Regression 1: fg must be null (terminal default), not the number 15.
   *
   * At 9318538bb7 the code returned `fg: 15`.  cellToFrameCell resolves slot
   * 15 to (192,192,192) on a standard palette, so `fg !== null` passed
   * vacuously.  The correct value is null — the terminal default fg, which is
   * legible on the terminal default bg under every theme.
   */
  describe("no background anywhere: fg is null (terminal default), not slot 15", () => {
    test("nothing sets a colour: fg is exactly null, not bright-white slot 15", () => {
      const app = createRenderer({ cols: COLS, rows: ROWS })(<ScrollScene />)
      const cell = glyph(app)
      // bg is null because nothing sets a background
      expect(cell.bg, "no bg anywhere: indicator bg is null").toBeNull()
      // fg must be null — the terminal's own default fg — not the RGB that
      // slot 15 (bright white) resolves to.  On a light terminal slot 15 is
      // often light-coloured and invisible against the default bg.
      expect(cell.fg, "no bg anywhere: indicator fg is null, not slot 15").toBeNull()
    })

    test('backgroundColor="$default" is the terminal default bg: fg is also null', () => {
      const app = createRenderer({ cols: COLS, rows: ROWS })(<ScrollScene scrollBg="$default" />)
      const cell = glyph(app)
      expect(cell.bg, "$default: bg is null").toBeNull()
      expect(cell.fg, "$default: fg is null").toBeNull()
    })

    test("ancestor sets color: indicator fg matches that colour (not slot 15)", () => {
      const app = createRenderer({ cols: COLS, rows: ROWS })(<ScrollScene rootColor="#336699" />)
      const cell = glyph(app)
      expect(cell.bg, "ancestor color only: no bg").toBeNull()
      // fg should be the inherited colour, matching the item text
      expect(cell.fg, "indicator fg is the ancestor colour").toMatchObject(INK)
      expect(cell.fg, "indicator fg matches item text").toEqual(itemText(app).fg)
    })
  })

  /**
   * Regression 3: named colour "white" is ANSI slot 7 = (192,192,192).
   *
   * The v2 test checked `r === 255`, which is never true for slot 7.  The
   * contrastFg of (192,192,192) is black (#000000), and the cell must pass
   * WCAG AA against the resolved bg.
   */
  describe('named colour "white" (ANSI slot 7 = 192,192,192): fg is black, meets WCAG AA', () => {
    test('scrollBg="white" resolves to (192,192,192) and fg is the AA contrast colour', () => {
      const app = createRenderer({ cols: COLS, rows: ROWS })(<ScrollScene scrollBg="white" />)
      const cell = glyph(app)
      // ANSI slot 7 resolves to (192,192,192), not (255,255,255)
      expect(cell.bg, 'named "white" bg is (192,192,192)').toMatchObject(ANSI_WHITE)
      if (cell.fg === null)
        expect.unreachable('named "white": fg must not be null on a resolved bg')
      if (cell.bg === null) expect.unreachable('named "white": bg must not be null')
      const bgHex = hexOf(cell.bg)
      const fgHex = hexOf(cell.fg)
      expect(fgHex, `fg on bg ${bgHex} is contrastFg(bg)`).toBe(contrastFg(bgHex))
      const contrast = checkContrast(fgHex, bgHex)
      expect(
        contrast?.aa,
        `fg ${fgHex} on bg ${bgHex} meets WCAG AA (ratio ${contrast?.ratio.toFixed(2)})`,
      ).toBe(true)
    })
  })

  /**
   * Regression 4: lime (#00ff00) was not tested in v2.
   *
   * contrastFg("#00ff00") is "#000000" (black), which meets WCAG AA.
   */
  describe("lime #00ff00: fg is the WCAG contrast colour (black), meets WCAG AA", () => {
    test('scrollBg="#00ff00" produces a black fg that meets WCAG AA against lime', () => {
      const app = createRenderer({ cols: COLS, rows: ROWS })(<ScrollScene scrollBg="#00ff00" />)
      const cell = glyph(app)
      expect(cell.bg, "lime bg").toMatchObject(LIME)
      if (cell.fg === null) expect.unreachable("lime: fg must not be null on a resolved bg")
      if (cell.bg === null) expect.unreachable("lime: bg must not be null")
      const bgHex = hexOf(cell.bg)
      const fgHex = hexOf(cell.fg)
      expect(fgHex, `fg on lime bg is contrastFg(bg)`).toBe(contrastFg(bgHex))
      const contrast = checkContrast(fgHex, bgHex)
      expect(
        contrast?.aa,
        `fg ${fgHex} on lime bg meets WCAG AA (ratio ${contrast?.ratio.toFixed(2)})`,
      ).toBe(true)
    })
  })

  /**
   * Regression 2: ancestor-bg rerender — incremental must equal fresh.
   *
   * The v2 rerenders passed identical props, so the incremental frame was
   * compared against itself (no-op diff), masking discrepancies.  Here each
   * step changes the ancestor's bg so the indicator must actually repaint.
   */
  describe("ancestor bg change: incremental frame equals fresh after each step", () => {
    type Step = Readonly<{ props: SceneProps; bg: Rgb | null; fg: Rgb | null }>

    test("dark → light → none: each rerender gives the right colours and incremental=fresh", () => {
      const steps: readonly Step[] = [
        { props: { rootBg: "#202020" }, bg: DARK, fg: WHITE },
        { props: { rootBg: "#f0f0f0" }, bg: LIGHT, fg: BLACK },
        { props: {}, bg: null, fg: null },
      ]
      const [first, ...rest] = steps
      if (!first) expect.unreachable("sequence needs a first step")
      const app = createRenderer({ cols: COLS, rows: ROWS })(<ScrollScene {...first.props} />)

      const checkStep = (step: Step, key: string): void => {
        const cell = glyph(app)
        if (step.bg === null) {
          expect(cell.bg, `${key}: bg`).toBeNull()
          // fg must be null — not slot 15 resolved to an RGB
          expect(cell.fg, `${key}: fg is null (not slot 15)`).toBeNull()
        } else {
          expect(cell.bg, `${key}: bg`).toMatchObject(step.bg)
          expect(cell.fg, `${key}: fg`).toMatchObject(step.fg!)
        }
        expectIncrementalMatchesFresh(app, key)
      }

      checkStep(first, "dark (initial)")
      rest.forEach((step, i) => {
        app.rerender(<ScrollScene {...step.props} />)
        checkStep(step, `step ${i + 1}: ${JSON.stringify(step.props)}`)
      })
    })

    test("none → dark → light → none: incremental=fresh, fg=null on no-bg steps", () => {
      const steps: readonly Step[] = [
        { props: {}, bg: null, fg: null },
        { props: { rootBg: "#202020" }, bg: DARK, fg: WHITE },
        { props: { rootBg: "#f0f0f0" }, bg: LIGHT, fg: BLACK },
        { props: {}, bg: null, fg: null },
      ]
      const [first, ...rest] = steps
      if (!first) expect.unreachable("sequence needs a first step")
      const app = createRenderer({ cols: COLS, rows: ROWS })(<ScrollScene {...first.props} />)

      // Initial: no bg anywhere — fg must be null, not a resolved RGB
      const initCell = glyph(app)
      expect(initCell.bg, "initial: no bg").toBeNull()
      expect(initCell.fg, "initial: fg is null, not slot 15").toBeNull()

      rest.forEach((step, i) => {
        const key = `step ${i + 1}: ${JSON.stringify(step.props)}`
        app.rerender(<ScrollScene {...step.props} />)
        const cell = glyph(app)
        if (step.bg === null) {
          expect(cell.bg, `${key}: bg`).toBeNull()
          expect(cell.fg, `${key}: fg is null (not slot 15)`).toBeNull()
        } else {
          expect(cell.bg, `${key}: bg`).toMatchObject(step.bg)
          expect(cell.fg, `${key}: fg`).toMatchObject(step.fg!)
        }
        expectIncrementalMatchesFresh(app, key)
      })
    })

    test("ancestor color + bg change: fg follows inheritedFg when bg removed", () => {
      // rootColor="#336699" is always set; rootBg changes.
      // When bg is present, fg is contrastFg(bg).
      // When bg is removed, fg must be the inherited colour (INK), not slot 15.
      const app = createRenderer({ cols: COLS, rows: ROWS })(
        <ScrollScene rootColor="#336699" rootBg="#f0f0f0" />,
      )
      expect(glyph(app).bg, "initial: light bg").toMatchObject(LIGHT)
      expect(glyph(app).fg, "initial: fg is black on light").toMatchObject(BLACK)

      app.rerender(<ScrollScene rootColor="#336699" />)
      const cell = glyph(app)
      expect(cell.bg, "after removing bg: null").toBeNull()
      // fg must be the inherited colour from rootColor, not slot 15
      expect(cell.fg, "after removing bg: inherited fg from ancestor color").toMatchObject(INK)
      expect(cell.fg, "after removing bg: fg matches item text").toEqual(itemText(app).fg)
      expectIncrementalMatchesFresh(app, "ancestor color + bg removed")
    })
  })

  /**
   * Mono + $bg: the token resolves to null (no RGB), so fg takes the theme fg.
   * This ensures parseColor receives ctx.colorLevel so mono strips the token.
   */
  describe("mono + $bg token: indicator takes the theme's inherited fg", () => {
    test("mono strips $bg to null: fg is the theme fg (not slot 15)", () => {
      const app = createRenderer({ cols: COLS, rows: ROWS, colorLevel: "mono" })(
        <ThemedScrollScene scrollBg="$bg" theme={ansi16LightTheme} />,
      )
      // ansi16LightTheme fg is #4c4f69. At mono the buffer keeps the RGB but
      // the output phase emits no colour escape — same as all other cells.
      const cell = glyph(app)
      expect(cell.bg, "mono $bg: bg is null").toBeNull()
      expect(cell.fg, "mono $bg: fg is the theme fg, not slot 15").toMatchObject({
        r: 0x4c,
        g: 0x4f,
        b: 0x69,
      })
      expect(cell.fg, "mono $bg: fg matches item text fg").toEqual(itemText(app).fg)
    })
  })
})
