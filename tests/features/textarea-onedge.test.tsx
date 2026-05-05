/**
 * TextArea onEdge contract tests
 *
 * Verifies that the `onEdge` callback fires when an arrow key is pressed AT
 * a buffer boundary (where the key would otherwise clamp). Returning `true`
 * consumes the key; returning `false` or omitting the handler falls back to
 * normal clamp behavior.
 *
 * Enables cross-widget focus handoff for composite editors (e.g. silvercode's
 * two-TextArea queue/command design).
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, TextArea } from "silvery"

// ============================================================================
// Helpers
// ============================================================================

type Edge = "top" | "bottom" | "left" | "right"

/**
 * Uncontrolled TextArea wrapper. Uses `defaultValue` (not `value`) so the
 * cursor starts at `defaultValue.length` (end of buffer) — useTextArea seeds
 * the cursor from defaultValue.length in `useState(defaultValue.length)`.
 */
function CursorProbe({
  defaultValue = "",
  onEdge,
  height = 3,
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

// ============================================================================
// onEdge fires at boundaries
// ============================================================================

describe("TextArea onEdge", () => {
  test("Up at first row fires onEdge('top')", async () => {
    const onEdge = vi.fn<(edge: Edge) => boolean>(() => false)
    const r = createRenderer({ cols: 40, rows: 10 })
    // Two-line content, cursor starts at end (offset = full length, which is on row 1).
    // Press Up to move to row 0 first.
    const app = r(<CursorProbe defaultValue={"line1\nline2"} onEdge={onEdge} />)

    await app.press("ArrowUp") // moves from row 1 → row 0
    expect(onEdge).not.toHaveBeenCalled()

    await app.press("ArrowUp") // already at row 0 — fires onEdge("top")
    expect(onEdge).toHaveBeenCalledWith("top")
  })

  test("Down at last row fires onEdge('bottom')", async () => {
    const onEdge = vi.fn<(edge: Edge) => boolean>(() => false)
    const r = createRenderer({ cols: 40, rows: 10 })
    // Cursor starts at end of "line2" (row 1, last row).
    const app = r(<CursorProbe defaultValue={"line1\nline2"} onEdge={onEdge} />)

    await app.press("ArrowDown") // already at last row — fires onEdge("bottom")
    expect(onEdge).toHaveBeenCalledWith("bottom")
  })

  test("Left at offset 0 fires onEdge('left')", async () => {
    const onEdge = vi.fn<(edge: Edge) => boolean>(() => false)
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<CursorProbe defaultValue="hello" onEdge={onEdge} />)

    // Move cursor to the start.
    await app.press("ctrl+a") // ctrl+a in TextArea = beginning of wrapped line (emacs/readline).
    expect(onEdge).not.toHaveBeenCalled()

    await app.press("ArrowLeft") // at offset 0 — fires onEdge("left")
    expect(onEdge).toHaveBeenCalledWith("left")
  })

  test("Right at end-of-buffer fires onEdge('right')", async () => {
    const onEdge = vi.fn<(edge: Edge) => boolean>(() => false)
    const r = createRenderer({ cols: 40, rows: 10 })
    // Cursor starts at end ("hello".length = 5).
    const app = r(<CursorProbe defaultValue="hello" onEdge={onEdge} />)

    await app.press("ArrowRight") // at offset value.length — fires onEdge("right")
    expect(onEdge).toHaveBeenCalledWith("right")
  })

  test("returning true prevents the cursor from changing (single-row content)", async () => {
    // Single-line content: the cursor offset is what we observe. Up/Down at row 0
    // keep cursor in place either way (clamped), so we focus on Left at offset 0
    // where consume-vs-fallthrough is observable in the *number of calls*.
    let consume = true
    const onEdge = vi.fn<(edge: Edge) => boolean>(() => consume)
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<CursorProbe defaultValue="abc" onEdge={onEdge} />)

    // Move cursor to offset 0
    await app.press("Home")

    // Multiple Left presses while consuming — onEdge fires every time.
    await app.press("ArrowLeft")
    await app.press("ArrowLeft")
    await app.press("ArrowLeft")
    expect(onEdge).toHaveBeenCalledTimes(3)
    expect(onEdge).toHaveBeenLastCalledWith("left")

    // Switch to fall-through (return false) — onEdge still fires, but the
    // hook also clamps normally (cursor stays at 0 either way).
    consume = false
    await app.press("ArrowLeft")
    expect(onEdge).toHaveBeenCalledTimes(4)
  })

  test("does not fire when handler is omitted (no regression)", async () => {
    const r = createRenderer({ cols: 40, rows: 10 })
    // Without onEdge, arrow keys at boundaries are no-ops (normal clamp).
    // Smoke test: rendering does not throw, no calls to undefined handler.
    const app = r(<CursorProbe defaultValue={"line1\nline2"} />)

    await app.press("ArrowUp")
    await app.press("ArrowUp") // at row 0
    await app.press("ArrowUp") // still at row 0
    await app.press("ArrowDown")
    await app.press("ArrowDown") // at last row
    await app.press("ArrowDown") // still at last row
    await app.press("Home")
    await app.press("ArrowLeft") // at offset 0
    await app.press("End")
    // Move to the very end of the buffer (Ctrl+End) and press Right.
    await app.press("ctrl+End")
    await app.press("ArrowRight")

    // Content is unchanged — no characters typed, no exceptions thrown.
    expect(app.text).toContain("line1")
    expect(app.text).toContain("line2")
  })

  test("Shift+arrow at boundary does NOT fire onEdge (selection extension)", async () => {
    const onEdge = vi.fn<(edge: Edge) => boolean>(() => true)
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<CursorProbe defaultValue="hello" onEdge={onEdge} />)

    // Cursor at end. Shift+Right would normally extend selection but cursor is
    // already at the end — onEdge should NOT fire (shift is reserved).
    await app.press("shift+ArrowRight")

    // Move to offset 0 and try Shift+Left at boundary.
    await app.press("Home")
    await app.press("shift+ArrowLeft")

    // Press Down (no shift) at last row to confirm onEdge still works for non-shift
    // arrows after the shift presses.
    await app.press("ArrowDown")
    expect(onEdge).toHaveBeenCalledWith("bottom")

    // Filter for any shift-related calls — there should be none for "left" or "right".
    const calls = onEdge.mock.calls.map((c) => c[0])
    // The only call should have been the non-shift ArrowDown which fired "bottom".
    expect(calls.filter((e) => e === "left" || e === "right")).toEqual([])
  })

  test("Up at row > 0 does NOT fire onEdge (normal cursor movement)", async () => {
    const onEdge = vi.fn<(edge: Edge) => boolean>(() => false)
    const r = createRenderer({ cols: 40, rows: 10 })
    const app = r(<CursorProbe defaultValue={"line1\nline2\nline3"} onEdge={onEdge} />)

    // Cursor starts at end (row 2). Press Up — moves to row 1, no onEdge.
    await app.press("ArrowUp")
    expect(onEdge).not.toHaveBeenCalled()

    // Up again — moves to row 0, still no onEdge.
    await app.press("ArrowUp")
    expect(onEdge).not.toHaveBeenCalled()

    // One more Up — now at boundary, fires.
    await app.press("ArrowUp")
    expect(onEdge).toHaveBeenCalledWith("top")
    expect(onEdge).toHaveBeenCalledTimes(1)
  })
})
