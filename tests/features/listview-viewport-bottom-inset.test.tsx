import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { Box, ListView, Text } from "@silvery/ag-react"
import { run } from "../../packages/ag-term/src/runtime/run"

const ITEMS = Array.from({ length: 20 }, (_, i) => `item ${i}`)

function hasTextOnRows(
  lines: readonly string[],
  fromRow: number,
  toRow: number,
  text: string,
): boolean {
  for (let row = fromRow; row <= toRow; row++) {
    if ((lines[row] ?? "").includes(text)) return true
  }
  return false
}

describe("ListView viewportBottomInset", () => {
  test("reserves bottom rows for content while keeping overscroll chrome full height", async () => {
    const rows = 8
    const inset = 3
    const render = createRenderer({ cols: 40, rows })
    const app = render(
      <Box width={40} height={rows} flexDirection="column">
        <ListView
          items={ITEMS}
          height={rows}
          viewportBottomInset={inset}
          nav
          cursorKey={ITEMS.length - 1}
          renderItem={(item) => <Text>{item}</Text>}
        />
      </Box>,
    )

    expect(hasTextOnRows(app.lines, rows - inset, rows - 1, "item")).toBe(false)
    expect(hasTextOnRows(app.lines, 0, rows - inset - 1, "item 19")).toBe(true)

    await app.press("j")

    expect(app.lines[rows - 1], app.text).toContain("▄")
    expect(app.lines[rows - inset - 1], app.text).not.toContain("▄")
  })

  test("hovering the bottom inset portion of the scrollbar column reveals the thumb", async () => {
    const rows = 8
    const inset = 3
    using term = createTermless({ cols: 40, rows })
    const handle = await run(
      <Box width={40} height={rows} flexDirection="column">
        <ListView
          items={ITEMS}
          height={rows}
          viewportBottomInset={inset}
          renderItem={(item) => <Text>{item}</Text>}
        />
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    await new Promise((r) => setTimeout(r, 50))

    await term.mouse.move(39, rows - 1)
    await new Promise((r) => setTimeout(r, 50))

    let found = false
    for (let row = 0; row < rows; row++) {
      if (/[█▁▂▃▄▅▆▇]/.test(term.cell(row, 39).char)) found = true
    }
    expect(found).toBe(true)
    handle.unmount()
  })
})
