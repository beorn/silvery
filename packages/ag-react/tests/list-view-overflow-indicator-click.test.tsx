/**
 * ListView: a click on the ▲N / ▼N overflow indicator is the mouse spelling
 * of Home / End (25418). The hit region is the glyph's own cells, placed by
 * the painter's one layout rule (overflowIndicatorPlacement), so a click
 * elsewhere on the indicator's row is still today's item click.
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { ListView } from "../src/ui/components/ListView"
import { Text } from "../src/components/Text"

const ITEMS = Array.from({ length: 30 }, (_, index) => `item ${String(index)}`)

function mount(overflowIndicator: boolean) {
  const onSelect = vi.fn()
  const onCursor = vi.fn()
  const render = createRenderer({ cols: 40, rows: 12 })
  const app = render(
    <ListView
      items={ITEMS}
      height={8}
      nav
      cursorKey={15}
      overflowIndicator={overflowIndicator}
      onSelect={onSelect}
      onCursor={onCursor}
      renderItem={(item) => <Text>{item}</Text>}
    />,
  )
  /** Where a glyph is on screen: its row and first column. */
  const glyph = (mark: "▲" | "▼"): { col: number; row: number } => {
    const lines = app.text.split("\n")
    const row = lines.findIndex((line) => line.includes(mark))
    return { col: row < 0 ? -1 : (lines[row] ?? "").indexOf(mark), row }
  }
  return { app, glyph, onCursor, onSelect }
}

describe("ListView: a click on an overflow indicator jumps to that end (25418)", () => {
  test("a click on ▲N moves the cursor to the first item and fires onCursor(0), selecting nothing", async () => {
    const { app, glyph, onCursor, onSelect } = mount(true)
    const top = glyph("▲")
    expect(top.row).toBeGreaterThanOrEqual(0)
    onCursor.mockClear()

    await app.click(top.col + 1, top.row)

    expect(onCursor).toHaveBeenLastCalledWith(0)
    expect(onSelect).not.toHaveBeenCalled()
  })

  test("a click on ▼N moves the cursor to the last item and fires onCursor(last), selecting nothing", async () => {
    const { app, glyph, onCursor, onSelect } = mount(true)
    const bottom = glyph("▼")
    expect(bottom.row).toBeGreaterThanOrEqual(0)
    onCursor.mockClear()

    await app.click(bottom.col, bottom.row)

    expect(onCursor).toHaveBeenLastCalledWith(ITEMS.length - 1)
    expect(onSelect).not.toHaveBeenCalled()
  })

  test("a click on the indicator's row outside the glyph is today's item click", async () => {
    const { app, glyph, onCursor, onSelect } = mount(true)
    const top = glyph("▲")
    onCursor.mockClear()

    await app.click(0, top.row)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onCursor).not.toHaveBeenCalledWith(0)
  })

  test("with no indicator drawn, the same cell is an item click", async () => {
    const withIndicator = mount(true)
    const top = withIndicator.glyph("▲")
    withIndicator.app.unmount()
    const { app, glyph, onCursor, onSelect } = mount(false)
    expect(glyph("▲").row).toBe(-1)
    onCursor.mockClear()

    await app.click(top.col, top.row)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onCursor).not.toHaveBeenCalledWith(0)
  })
})
