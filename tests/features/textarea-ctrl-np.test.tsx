/**
 * TextArea Emacs Ctrl-N/Ctrl-P aliases for Up/Down
 *
 * Bead: km-silvery.emacs-ctrl-np
 *
 * Verifies that Ctrl-P moves the cursor up one visual line (alias for Up),
 * Ctrl-N moves the cursor down one visual line (alias for Down), and that
 * both fire `onEdge` at buffer boundaries — same as the arrow keys.
 *
 * Note: Ctrl-N and Ctrl-P are not in `readline-ops` because they need
 * stateful history in classic shells. Inside a multi-line TextArea they're
 * unambiguous line-nav aliases.
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, TextArea } from "silvery"

function CursorProbe({
  defaultValue = "",
  onEdge,
  height = 5,
}: {
  defaultValue?: string
  onEdge?: (edge: "top" | "bottom" | "left" | "right") => boolean
  height?: number
}) {
  return (
    <Box flexDirection="column" width={40}>
      <TextArea defaultValue={defaultValue} fieldSizing="fixed" rows={height} onEdge={onEdge} />
    </Box>
  )
}

describe("TextArea Ctrl-P / Ctrl-N aliases", () => {
  test("Ctrl-P from second line moves cursor to first line", async () => {
    const r = createRenderer({ cols: 40, rows: 10 })
    // Cursor starts at end of "line2" (row 1, col 5).
    const app = r(<CursorProbe defaultValue={"line1\nline2"} />)

    let cursor = app.getCursorState()
    expect(cursor!.y).toBe(1)

    await app.press("ctrl+p")
    cursor = app.getCursorState()
    // Cursor now on row 0 (first line). Sticky col preserved (col 5 → "line1" len = 5).
    expect(cursor!.y).toBe(0)
  })

  test("Ctrl-N from first line moves cursor to second line", async () => {
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<CursorProbe defaultValue={"line1\nline2"} />)

    // Move to first line first.
    await app.press("ArrowUp")
    let cursor = app.getCursorState()
    expect(cursor!.y).toBe(0)

    await app.press("ctrl+n")
    cursor = app.getCursorState()
    expect(cursor!.y).toBe(1)
  })

  test("Ctrl-P at first row fires onEdge('top')", async () => {
    const onEdge = vi.fn(() => false)
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<CursorProbe defaultValue={"line1\nline2"} onEdge={onEdge} />)

    // Move to first row.
    await app.press("ctrl+p")
    expect(onEdge).not.toHaveBeenCalled()

    // Already at first row — Ctrl-P fires onEdge("top").
    await app.press("ctrl+p")
    expect(onEdge).toHaveBeenCalledWith("top")
  })

  test("Ctrl-N at last row fires onEdge('bottom')", async () => {
    const onEdge = vi.fn(() => false)
    const r = createRenderer({ cols: 40, rows: 10 })
    // Cursor starts at end of "line2" (row 1 = last row).
    const app = r(<CursorProbe defaultValue={"line1\nline2"} onEdge={onEdge} />)

    // Already at last row — Ctrl-N fires onEdge("bottom").
    await app.press("ctrl+n")
    expect(onEdge).toHaveBeenCalledWith("bottom")
  })

  test("Ctrl-N consumed by onEdge handler doesn't move cursor", async () => {
    const onEdge = vi.fn(() => true)
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<CursorProbe defaultValue={"line1\nline2"} onEdge={onEdge} />)

    // Cursor at row 1 (end). Ctrl-N at last row — onEdge consumes.
    await app.press("ctrl+n")
    expect(onEdge).toHaveBeenCalledWith("bottom")

    const cursor = app.getCursorState()
    // Cursor stays on row 1 (consumed).
    expect(cursor!.y).toBe(1)
  })
})
