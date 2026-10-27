/**
 * @failure  Scrollbar's optional track rail leaks into the default rendering, or
 *           the rail ignores the rows the thumb covers.
 * @level    l2 — createRenderer.
 * @consumer @i/22-harness-waist/30366-hab-deck-traffic-light-buttons
 * @testonly none — Scrollbar's track option is production API; the test only
 *           drives it.
 *
 * The deck asks for the quiet "rail on the pane border, lighter thumb" look. The
 * general option lives here: `track={{ color, glyph }}` paints rail cells ONLY on
 * the rows the thumb does not cover. Omitting it keeps the transparent track the
 * decision @km/silvery/15404-scrollbar-track-bg-renders-as-black-bar-on-idle
 * requires, so km's ListView does not change.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "../src/components/Box"
import { Scrollbar } from "../src/ui/components/Scrollbar"

const THUMB_GLYPHS = "▁▂▃▄▅▆▇█"

function renderScrollbar(track?: { color: string; glyph?: string }): string[] {
  const app = createRenderer({ cols: 2, rows: 10 })(
    <Box width={2} height={10}>
      <Scrollbar
        trackHeight={10}
        scrollableRows={10}
        scrollOffset={5}
        onScrollOffsetChange={() => undefined}
        {...(track === undefined ? {} : { track })}
      />
    </Box>,
  )
  return app.text.split("\n")
}

describe("Scrollbar track option", () => {
  test("default rendering stays byte-identical: transparent track, thumb only", () => {
    const lines = renderScrollbar()
    const painted = lines.filter((line) => /[▁▂▃▄▅▆▇█│]/u.test(line))
    expect(
      painted.length,
      `only thumb rows paint by default:\n${lines.join("\n")}`,
    ).toBeGreaterThan(0)
    expect(lines.join("\n"), "no rail glyph may appear without the track option").not.toContain("│")
  })

  test("track paints the rail only on the rows the thumb does not cover", () => {
    const lines = renderScrollbar({ color: "$border", glyph: "│" })
    const railRows = lines.flatMap((line, row) => (line.includes("│") ? [row] : []))
    const thumbRows = lines.flatMap((line, row) =>
      [...line].some((char) => THUMB_GLYPHS.includes(char)) ? [row] : [],
    )
    expect(railRows.length, `the rail must render:\n${lines.join("\n")}`).toBeGreaterThan(0)
    expect(thumbRows.length, `the thumb must render:\n${lines.join("\n")}`).toBeGreaterThan(0)
    for (const row of railRows) {
      expect(
        thumbRows,
        `row ${row} cannot be both rail and thumb:\n${lines.join("\n")}`,
      ).not.toContain(row)
    }
    expect(
      railRows.length + thumbRows.length,
      `every row is painted exactly once:\n${lines.join("\n")}`,
    ).toBe(10)
  })

  test("a custom rail glyph is honoured", () => {
    const lines = renderScrollbar({ color: "$border", glyph: "║" })
    expect(lines.join("\n")).toContain("║")
    expect(lines.join("\n")).not.toContain("│")
  })

  test("the rail is clickable: a click low on the track scrolls toward the end", async () => {
    const offsets: number[] = []
    const render = createRenderer({ cols: 2, rows: 10 })
    const app = render(
      <Box width={2} height={10}>
        <Scrollbar
          trackHeight={10}
          scrollableRows={10}
          scrollOffset={0}
          onScrollOffsetChange={(offset) => offsets.push(offset)}
          track={{ color: "$border", glyph: "│" }}
        />
      </Box>,
    )
    await app.click(1, 9)
    expect(offsets.length, "clicking the rail must request a new offset").toBeGreaterThan(0)
    expect(offsets.at(-1)!, "a click near the bottom scrolls near the end").toBeGreaterThan(5)
  })
})
