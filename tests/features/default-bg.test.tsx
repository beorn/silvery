import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Scrollbar, Text } from "silvery"
import { ThemeProvider } from "@silvery/ag-react"
import { deriveTheme } from "@silvery/ansi"
import { nord } from "@silvery/theme/schemes"
import { DEFAULT_BG, isDefaultBg } from "@silvery/ag-term"
import { createBuffer, type Color, type TerminalBuffer } from "@silvery/ag-term/buffer"
import { outputPhase } from "@silvery/ag-term/pipeline/output-phase"
import { parseColor } from "@silvery/ag-term/pipeline/render-helpers"

describe("$default background", () => {
  test("parseColor('$default') returns DEFAULT_BG sentinel", () => {
    const color = parseColor("$default")
    expect(isDefaultBg(color)).toBe(true)
    expect(color).toBe(DEFAULT_BG)
  })

  test("DEFAULT_BG is not equal to null", () => {
    expect(DEFAULT_BG).not.toBeNull()
    expect(isDefaultBg(null)).toBe(false)
  })

  test("isDefaultBg rejects normal colors", () => {
    expect(isDefaultBg({ r: 0, g: 0, b: 0 })).toBe(false)
    expect(isDefaultBg({ r: 255, g: 255, b: 255 })).toBe(false)
    expect(isDefaultBg(42)).toBe(false)
  })

  const render = createRenderer({ cols: 20, rows: 5 })

  test("Box with $default bg renders text content", () => {
    const app = render(
      <Box backgroundColor="$default" width={20} height={3}>
        <Text>Default BG</Text>
      </Box>,
    )
    expect(app.text).toContain("Default BG")
  })

  test("$default bg produces no 48;2; or 48;5; in ANSI output", () => {
    const app = render(
      <Box backgroundColor="$default" width={20} height={3}>
        <Text>Hello</Text>
      </Box>,
    )
    const ansi = app.ansi
    // $default bg means "use terminal default" — no explicit bg code should be emitted
    expect(ansi).not.toMatch(/48;2;/)
    expect(ansi).not.toMatch(/48;5;/)
  })

  test("$default bg cell has DEFAULT_BG, not null", () => {
    const app = render(
      <Box backgroundColor="$default" width={10} height={1}>
        <Text>X</Text>
      </Box>,
    )
    const buffer = app.lastBuffer()
    expect(buffer).toBeDefined()
    const cell = buffer!.getCell(0, 0)
    expect(isDefaultBg(cell.bg)).toBe(true)
  })

  test("$default bg makes overlay opaque", () => {
    const app = render(
      <Box flexDirection="column" width={20} height={5}>
        <Text>Background text here</Text>
        <Box backgroundColor="$default" position="absolute" width={10} height={1}>
          <Text>Over</Text>
        </Box>
      </Box>,
    )
    // The overlay covers the first 10 columns of row 0
    const buffer = app.lastBuffer()
    expect(buffer).toBeDefined()
    // Cell at (0,0) should have DEFAULT_BG (from overlay), not null (transparent)
    const cell = buffer!.getCell(0, 0)
    expect(isDefaultBg(cell.bg)).toBe(true)
  })
})

// 21624: an unanswered palette probe points the canvas tokens at `$default`, so
// a whole screen is DEFAULT_BG and every explicit background sits next to it.
// A cell that leaves an explicit background for the terminal default must be
// reset with SGR 49. Emitting the sentinel as truecolor (`48;2;-1;-1;-1`) is a
// CSI no terminal applies, so the explicit background bleeds on (STRICT on
// main: `STRICT_OUTPUT style mismatch ... bg rgb(76,86,106) vs default`).
describe("$default background — the style transition into it", () => {
  /** Nord3, the explicit background in the 21624 STRICT failure. */
  const EXPLICIT_BG = { r: 76, g: 86, b: 106 }

  /** A `$default` canvas: every cell paints the terminal's own background. */
  function defaultCanvas(cols: number, rows: number): TerminalBuffer {
    const buf = createBuffer(cols, rows)
    buf.fill(0, 0, cols, rows, { char: " ", bg: DEFAULT_BG })
    return buf
  }

  function paint(buf: TerminalBuffer, x: number, y: number, text: string, bg: Color): void {
    for (let i = 0; i < text.length; i++) buf.setCell(x + i, y, { char: text[i]!, bg })
  }

  /** Parameters of every SGR in `ansi`, malformed ones included (`48;2;-1;-1;-1`). */
  function sgrParams(ansi: string): string[] {
    return [...ansi.matchAll(/\x1b\[([^\x40-\x7e]*)m/g)].map((m) => m[1]!)
  }

  /** The SGR emitted immediately before `text`: the style the terminal paints it in. */
  function sgrBefore(ansi: string, text: string): string[] | undefined {
    const at = ansi.indexOf(text)
    if (at < 0) return undefined
    return /\x1b\[([^\x40-\x7e]*)m$/.exec(ansi.slice(0, at))?.[1]?.split(";")
  }

  // Each row reaches styleTransition through a different emitter: the sparse
  // cell diff, the dense-row diff, the cursor jump between changed cells (CUP
  // carries the previous style across rows), and the full render. In every
  // one, "abcde" is on the explicit background and "plain" is the next cell
  // painted, on the terminal default.
  const cases: Array<{
    name: string
    frames: () => { prev: TerminalBuffer | null; next: TerminalBuffer }
  }> = [
    {
      name: "a sparse incremental run moves from an explicit bg into the default",
      frames: () => {
        const prev = defaultCanvas(40, 3)
        paint(prev, 0, 1, "abcde", DEFAULT_BG)
        paint(prev, 5, 1, "plain", EXPLICIT_BG)
        const next = defaultCanvas(40, 3)
        paint(next, 0, 1, "abcde", EXPLICIT_BG)
        paint(next, 5, 1, "plain", DEFAULT_BG)
        return { prev, next }
      },
    },
    {
      name: "a dense incremental row moves from an explicit bg into the default",
      frames: () => {
        const prev = defaultCanvas(12, 3)
        paint(prev, 0, 1, "abcde", DEFAULT_BG)
        paint(prev, 5, 1, "plain", EXPLICIT_BG)
        const next = defaultCanvas(12, 3)
        paint(next, 0, 1, "abcde", EXPLICIT_BG)
        paint(next, 5, 1, "plain", DEFAULT_BG)
        return { prev, next }
      },
    },
    {
      name: "an incremental jump to the next changed cell lands on the default",
      frames: () => {
        const prev = defaultCanvas(40, 4)
        paint(prev, 30, 1, "abcde", DEFAULT_BG)
        paint(prev, 5, 2, "PLAIN", DEFAULT_BG)
        const next = defaultCanvas(40, 4)
        paint(next, 30, 1, "abcde", EXPLICIT_BG)
        paint(next, 5, 2, "plain", DEFAULT_BG)
        return { prev, next }
      },
    },
    {
      name: "a full render moves from an explicit bg into the default",
      frames: () => {
        const next = defaultCanvas(40, 3)
        paint(next, 0, 1, "abcde", EXPLICIT_BG)
        paint(next, 5, 1, "plain", DEFAULT_BG)
        return { prev: null, next }
      },
    },
  ]

  test.each(cases)("$name: SGR 49, never a negative color", ({ frames }) => {
    const { prev, next } = frames()
    const out = outputPhase(prev, next, "fullscreen")

    expect(sgrParams(out).filter((params) => params.includes("-"))).toEqual([])
    expect(sgrBefore(out, "plain")).toContain("49")
  })

  test("a 60-row list on a $default canvas moves its highlight (realistic scale, STRICT)", () => {
    const COLS = 40
    const ROWS = 64
    const render = createRenderer({ cols: COLS, rows: ROWS })
    function List({ cursor }: { cursor: number }) {
      return (
        <Box flexDirection="column" width={COLS} height={ROWS} backgroundColor="$default">
          {Array.from({ length: 60 }, (_, i) => (
            <Box key={i} flexDirection="row">
              <Box width={24} backgroundColor={i === cursor ? "#4c566a" : undefined}>
                <Text>{`item ${String(i).padStart(2, "0")}`}</Text>
              </Box>
              <Text>{`detail ${i}`}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<List cursor={5} />)
    const firstFrames = app.frames.length
    app.rerender(<List cursor={6} />)
    const incremental = app.frames.slice(firstFrames).join("")

    // Repainted guard: a frame that emitted nothing would pass both checks below.
    expect(incremental).toContain("item 06")
    expect(sgrParams(incremental).filter((params) => params.includes("-"))).toEqual([])
    // Row 6 is the highlight (cols 0-23) then "detail 6" on the canvas default.
    expect(sgrBefore(incremental, "detail 6")).toContain("49")
  })

  // The same sentinel reaches the FOREGROUND when a canvas token is painted as
  // one: Scrollbar draws its fractional thumb edge with color="$bg" over the
  // thumb, and an unanswered probe resolves `$bg` to `$default`. The fg channel
  // has no code for "the terminal's background", so the sentinel is the fg
  // default, SGR 39, exactly like null (`38;2;-1;-1;-1` crashed the dutiful
  // pane under STRICT on its first wheel frame).
  const THUMB_BG = { r: 158, g: 163, b: 171 }

  test("an incremental run whose foreground moves onto the sentinel resets it with SGR 39", () => {
    const prev = defaultCanvas(40, 3)
    paint(prev, 0, 1, "abcdeplain", DEFAULT_BG)
    const next = defaultCanvas(40, 3)
    for (let i = 0; i < 5; i++) {
      next.setCell(i, 1, { char: "abcde"[i]!, fg: { r: 236, g: 239, b: 244 }, bg: DEFAULT_BG })
      next.setCell(5 + i, 1, { char: "plain"[i]!, fg: DEFAULT_BG, bg: THUMB_BG })
    }
    const out = outputPhase(prev, next, "fullscreen")

    expect(sgrParams(out).filter((params) => params.includes("-"))).toEqual([])
    expect(sgrBefore(out, "plain")).toContain("39")
  })

  test("a run that starts on a sentinel foreground sets no foreground code", () => {
    const next = defaultCanvas(40, 3)
    for (let i = 0; i < 5; i++) {
      next.setCell(i, 1, { char: "plain"[i]!, fg: DEFAULT_BG, bg: THUMB_BG })
    }
    const out = outputPhase(null, next, "fullscreen")

    expect(sgrParams(out).filter((params) => params.includes("-"))).toEqual([])
    // From the reset state the fg default needs no code; only the thumb bg is set.
    expect(sgrBefore(out, "plain")).toEqual(["48", "2", "158", "163", "171"])
  })

  test("a scrollbar thumb edge on a $default canvas theme (realistic scale, STRICT)", () => {
    const COLS = 40
    const ROWS = 24
    const LINES = 60
    // What an unanswered palette probe does to the theme: the canvas tokens
    // point at the terminal default (withTerminalDefaultCanvas in
    // packages/ansi/src/theme/detect.ts). `bg` is the one Scrollbar reads.
    const theme = { ...deriveTheme(nord, "truecolor"), bg: "$default" }
    const render = createRenderer({ cols: COLS, rows: ROWS })
    function Pane({ offset }: { offset: number }) {
      return (
        <ThemeProvider theme={theme}>
          <Box width={COLS} height={ROWS} position="relative" backgroundColor="$bg">
            <Box flexDirection="column" width={COLS - 1}>
              {Array.from({ length: ROWS }, (_, i) => (
                <Box key={i} flexDirection="row">
                  <Text>{`row-${String(offset + i + 1).padStart(3, "0")}`}</Text>
                  <Text color="$muted">{" · detail"}</Text>
                </Box>
              ))}
            </Box>
            <Scrollbar
              trackHeight={ROWS}
              scrollableRows={LINES - ROWS}
              scrollOffset={offset}
              onScrollOffsetChange={() => {}}
            />
          </Box>
        </ThemeProvider>
      )
    }

    // Offsets 10 and 11 both leave the thumb's bottom edge mid-cell, so the
    // `$bg`-colored fractional glyph is painted on both frames.
    const app = render(<Pane offset={10} />)
    const firstFrames = app.frames.length
    app.rerender(<Pane offset={11} />)

    const buffer = app.lastBuffer()!
    const sentinelFgRows = Array.from({ length: ROWS }, (_, y) => y).filter((y) =>
      isDefaultBg(buffer.getCell(COLS - 1, y).fg),
    )
    // Non-vacuous: the frame really paints a foreground on the sentinel.
    expect(sentinelFgRows.length).toBeGreaterThan(0)
    // Repainted guard (the diff re-emits only changed cells, so check the buffer
    // text and that an incremental frame was written), then no frame, first or
    // incremental, carries a negative color.
    expect(app.text).toContain("row-012")
    expect(app.frames.slice(firstFrames).join("")).not.toBe("")
    expect(sgrParams(app.frames.join("")).filter((params) => params.includes("-"))).toEqual([])
  })
})
