/**
 * `truncateMarkerColor` — elision-marker chrome styled separately from text.
 *
 * The inserted "…" of the built-in truncate modes, and any marker ranges a
 * `truncate` hook returns via `TextTruncateResult.markers`, render with
 * `TextProps.truncateMarkerColor` (default `"$fg-muted"`) so the elision reads
 * as quiet chrome, not content. The surrounding text keeps its own color.
 *
 * Cell-level assertions via `app.cell(col, row).fg` — never raw ANSI bytes.
 * Realistic-scale fixtures (50+ Text rows) per silvery's new-prop rule, so the
 * default flip is exercised through the incremental cascade at scale.
 *
 * 19788 follow-up (km bead @km/inbox/19788-km-f330).
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import { formatTextLines, truncateText } from "@silvery/ag-term/pipeline/render-text"
import { parseColor } from "@silvery/ag-term/pipeline/render-helpers"
import { displayWidth } from "@silvery/ag-term"
import type { TextTruncateHook, TextMeasure } from "@silvery/ag"

const CMD = "git commit --message 'a very long commit message here' --no-verify"

/**
 * Find the DISPLAY column of the first cell whose char is `ch` in row `row`.
 * Scans cells (not the string) so wide-glyph rows map correctly — a string
 * index is NOT a display column when the line contains 2-cell graphemes.
 */
function colOf(
  app: { cell: (c: number, r: number) => { char: string }; width: number },
  ch: string,
  row = 0,
): number {
  for (let c = 0; c < app.width; c++) {
    if (app.cell(c, row).char === ch) return c
  }
  return -1
}

/** A hook that elides the middle and MARKS the " … " separator as chrome. */
function markedElision(line: string, width: number, m: TextMeasure) {
  const sep = " … "
  const sepW = m.width(sep)
  const avail = width - sepW
  if (avail <= 0) return null
  const tailCap = Math.min(Math.floor(avail / 3), 28)
  const lastSpace = line.lastIndexOf(" ")
  if (lastSpace <= 0) return null
  const tail = line.slice(lastSpace)
  if (m.width(tail) > tailCap) return null
  const headBudget = avail - m.width(tail)
  const head = m.sliceByWidth(line, headBudget)
  const text = head + sep + tail
  // Mark the separator span as marker chrome.
  const start = head.length
  return { text, markers: [{ start, end: start + sep.length }] }
}

describe("truncateMarkerColor — built-in ellipsis", () => {
  // The built-in "…" gets the $fg-muted default while surrounding text keeps
  // its own color. 50-row fixture so the cascade is exercised at scale.
  test("default $fg-muted: ellipsis cell fg differs from text cell fg (50 rows)", () => {
    const WIDTH = 30
    const ROWS = 50
    function App() {
      return (
        <Box flexDirection="column" width={WIDTH} height={ROWS}>
          {Array.from({ length: ROWS }, (_, i) => (
            <Box key={i} width={WIDTH} height={1}>
              <Text color="#ffffff" minWidth={0} wrap="truncate-end">
                {`row-${i} ${CMD}`}
              </Text>
            </Box>
          ))}
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: ROWS })
    const app = render(<App />)

    const ellipsisCol = colOf(app, "…", 0)
    expect(ellipsisCol).toBeGreaterThan(0)

    const textFg = app.cell(0, 0).fg // first visible char — the row's #ffffff
    const markerFg = app.cell(ellipsisCol, 0).fg
    expect(textFg).toEqual({ r: 255, g: 255, b: 255 })
    // Chrome ≠ content: the marker carries the muted token, not the text color.
    expect(markerFg).not.toEqual(textFg)
    expect(markerFg).not.toBeNull()

    // Every row truncated the same way → marker on every row is muted chrome.
    for (let r = 0; r < 5; r++) {
      const c = colOf(app, "…", r)
      expect(c).toBeGreaterThan(0)
      expect(app.cell(c, r).fg).toEqual(markerFg)
      expect(app.cell(0, r).fg).toEqual({ r: 255, g: 255, b: 255 })
    }
  })

  // Explicit color: the marker carries exactly that color, text is untouched.
  test("explicit truncateMarkerColor paints the marker with that exact color", () => {
    const WIDTH = 30
    function App() {
      return (
        <Box width={WIDTH} height={1}>
          <Text color="#ffffff" truncateMarkerColor="#ff0000" wrap="truncate-middle">
            {CMD}
          </Text>
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: 1 })
    const app = render(<App />)
    const c = colOf(app, "…", 0)
    expect(c).toBeGreaterThan(0)
    expect(app.cell(c, 0).fg).toEqual({ r: 255, g: 0, b: 0 })
    // Surrounding text keeps #ffffff on both sides of the marker.
    expect(app.cell(0, 0).fg).toEqual({ r: 255, g: 255, b: 255 })
    expect(app.cell(c + 1, 0).fg).toEqual({ r: 255, g: 255, b: 255 })
  })

  // truncate-start: marker at the front, tail text keeps its color.
  test("truncate-start: leading marker is colored, trailing text is not", () => {
    const WIDTH = 24
    function App() {
      return (
        <Box width={WIDTH} height={1}>
          <Text color="#00ff00" truncateMarkerColor="#ff0000" wrap="truncate-start">
            {CMD}
          </Text>
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: 1 })
    const app = render(<App />)
    const c = colOf(app, "…", 0)
    expect(c).toBe(0) // leading marker
    expect(app.cell(0, 0).fg).toEqual({ r: 255, g: 0, b: 0 })
    expect(app.cell(1, 0).fg).toEqual({ r: 0, g: 255, b: 0 })
  })
})

describe("truncateMarkerColor — hook-returned markers", () => {
  // A hook that marks its " … " separator renders muted; rescued tail keeps
  // the text color.
  test("hook marker range renders muted, surrounding text keeps its color", () => {
    const WIDTH = 44
    function App() {
      return (
        <Box width={WIDTH} height={1}>
          <Text
            color="#ffffff"
            truncateMarkerColor="#ff0000"
            wrap="truncate-middle"
            truncate={markedElision}
          >
            {CMD}
          </Text>
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: 1 })
    const app = render(<App />)
    const row = app.lines[0]!
    expect(row).toContain(" … ")
    // The middle dot of the " … " separator is marker chrome → red.
    const dotCol = colOf(app, "…", 0)
    expect(app.cell(dotCol, 0).fg).toEqual({ r: 255, g: 0, b: 0 })
    // The space immediately before the dot is part of the marked separator span.
    expect(app.cell(dotCol - 1, 0).fg).toEqual({ r: 255, g: 0, b: 0 })
    // First head char and the rescued trailing token keep the text color.
    expect(app.cell(0, 0).fg).toEqual({ r: 255, g: 255, b: 255 })
    expect(row.trimEnd().endsWith("--no-verify")).toBe(true)
    const lastCol = row.trimEnd().length - 1
    expect(app.cell(lastCol, 0).fg).toEqual({ r: 255, g: 255, b: 255 })
  })

  // The exact km shape that caught the $muted-aliases-$fg bug: hook-returned
  // markers + DEFAULT marker color (prop OMITTED) + a $token TEXT color. With
  // the wrong default ($fg-muted == $fg), the marker fg would equal the text fg
  // and the elision would not dim at all. Assert the default marker dims.
  test("default marker + $token text color: marker fg dims vs text fg (km shape)", () => {
    const WIDTH = 44
    function App() {
      return (
        <Box width={WIDTH} height={1}>
          {/* truncateMarkerColor OMITTED → default. color is the $fg token. */}
          <Text color="$fg" wrap="truncate-middle" truncate={markedElision}>
            {CMD}
          </Text>
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: 1 })
    const app = render(<App />)
    expect(app.lines[0]!).toContain(" … ")

    const textFg = parseColor("$fg")
    const dotCol = colOf(app, "…", 0)
    // The marked separator is the DEFAULT ($fg-muted) — it must NOT equal the
    // $fg text color (the regression: $fg-muted resolved to the same RGB as $fg).
    const markerFg = app.cell(dotCol, 0).fg
    expect(markerFg).not.toEqual(textFg)
    expect(markerFg).toEqual(parseColor("$fg-muted"))
    // Head + rescued tail keep the $fg text color.
    expect(app.cell(0, 0).fg).toEqual(textFg)
  })

  // A bare-string hook return gets NO marker styling — the " … " stays the
  // text color (proves bare-string is the no-marker path, unchanged behavior).
  test("bare-string hook return: separator NOT styled as marker", () => {
    const WIDTH = 44
    const bareElision: TextTruncateHook = (line, width, m) => {
      const r = markedElision(line, width, m)
      return r ? r.text : null // drop markers → bare string
    }
    function App() {
      return (
        <Box width={WIDTH} height={1}>
          <Text
            color="#ffffff"
            truncateMarkerColor="#ff0000"
            wrap="truncate-middle"
            truncate={bareElision}
          >
            {CMD}
          </Text>
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: 1 })
    const app = render(<App />)
    const dotCol = colOf(app, "…", 0)
    expect(dotCol).toBeGreaterThan(0)
    // No markers → the separator keeps the text color, not the marker color.
    expect(app.cell(dotCol, 0).fg).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe("truncateMarkerColor — wide glyphs (CJK)", () => {
  // A CJK line (each glyph 2 cells) truncated middle: the marker is muted and
  // the surrounding wide glyphs keep their color; nothing paints past the box.
  test("CJK line: marker colored, wide glyphs keep color, width within budget", () => {
    const WIDTH = 16
    const CJK = "深圳市南山区科技园路一号科技大厦" // 16 wide chars = 32 cells
    expect(displayWidth(CJK)).toBe(32)
    function App() {
      return (
        <Box width={WIDTH} height={1}>
          <Text color="#ffffff" truncateMarkerColor="#ff0000" wrap="truncate-middle">
            {CJK}
          </Text>
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: 1 })
    const app = render(<App />)
    const c = colOf(app, "…", 0)
    expect(c).toBeGreaterThan(0)
    expect(app.cell(c, 0).fg).toEqual({ r: 255, g: 0, b: 0 })
    expect(app.cell(0, 0).fg).toEqual({ r: 255, g: 255, b: 255 })
    expect(displayWidth(app.lines[0]!.trimEnd())).toBeLessThanOrEqual(WIDTH)
  })
})

describe("truncateMarkerColor — bare formatTextLines/truncateText unchanged", () => {
  // Direct callers (no markerSgr arg) are byte-identical to today — the 11
  // existing hook tests rely on this. Re-pin the canonical strings here.
  test("formatTextLines / truncateText with no markerSgr arg are byte-identical", () => {
    const mid = formatTextLines(CMD, 30, "truncate-middle", undefined, true)[0]
    expect(mid).toBe("git commit --m…re' --no-verify")
    expect(truncateText(CMD, 30, "middle")).toBe("git commit --m…re' --no-verify")
    expect(truncateText(CMD, 20, "end")).toBe("git commit --messag…")
    // No escape bytes when markerSgr is the default "".
    expect(truncateText(CMD, 30, "middle")).not.toContain("\x1b")
  })
})

describe("truncateMarkerColor — incremental cascade", () => {
  // Toggling truncateMarkerColor re-renders the marker cell (it is a STYLE_PROPS
  // prop → invalidates collected+format cache). 50-row fixture under STRICT.
  test("changing truncateMarkerColor restyles the marker (50 rows)", () => {
    const WIDTH = 30
    const ROWS = 50
    function App({ marker }: { marker: string }) {
      return (
        <Box flexDirection="column" width={WIDTH} height={ROWS}>
          {Array.from({ length: ROWS }, (_, i) => (
            <Box key={i} width={WIDTH} height={1}>
              <Text color="#ffffff" truncateMarkerColor={marker} minWidth={0} wrap="truncate-end">
                {`row-${i} ${CMD}`}
              </Text>
            </Box>
          ))}
        </Box>
      )
    }
    const render = createRenderer({ cols: WIDTH, rows: ROWS })
    const app = render(<App marker="#ff0000" />)
    const c = colOf(app, "…", 0)
    expect(app.cell(c, 0).fg).toEqual({ r: 255, g: 0, b: 0 })

    app.rerender(<App marker="#0000ff" />)
    const c2 = colOf(app, "…", 0)
    expect(app.cell(c2, 0).fg).toEqual({ r: 0, g: 0, b: 255 })
    // Text untouched by the marker change.
    expect(app.cell(0, 0).fg).toEqual({ r: 255, g: 255, b: 255 })
  })
})
