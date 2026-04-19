/**
 * Tests for copy-mode state machine.
 */
import { describe, test, expect } from "vitest"
import { createCopyModeState, copyModeUpdate } from "@silvery/headless/copy-mode"

// ============================================================================
// enter / exit
// ============================================================================

describe("copyModeUpdate — enter/exit", () => {
  test("enter activates copy-mode at given position", () => {
    const state = createCopyModeState()
    const [next, effects] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      state,
    )

    expect(next.active).toBe(true)
    expect(next.cursor).toEqual({ col: 5, row: 3 })
    expect(next.visual).toBe(false)
    expect(next.visualLine).toBe(false)
    expect(next.anchor).toBeNull()
    expect(next.bufferWidth).toBe(80)
    expect(next.bufferHeight).toBe(24)
    expect(effects).toEqual([{ type: "render" }])
  })

  test("exit deactivates copy-mode", () => {
    const [active] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next, effects] = copyModeUpdate({ type: "exit" }, active)

    expect(next.active).toBe(false)
    expect(next.cursor).toEqual({ col: 0, row: 0 })
    expect(effects).toEqual([{ type: "render" }])
  })
})

// ============================================================================
// move
// ============================================================================

describe("copyModeUpdate — move", () => {
  test("move right", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next] = copyModeUpdate({ type: "move", direction: "right" }, state)
    expect(next.cursor).toEqual({ col: 6, row: 3 })
  })

  test("move left", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next] = copyModeUpdate({ type: "move", direction: "left" }, state)
    expect(next.cursor).toEqual({ col: 4, row: 3 })
  })

  test("move up", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next] = copyModeUpdate({ type: "move", direction: "up" }, state)
    expect(next.cursor).toEqual({ col: 5, row: 2 })
  })

  test("move down", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next] = copyModeUpdate({ type: "move", direction: "down" }, state)
    expect(next.cursor).toEqual({ col: 5, row: 4 })
  })

  test("move clamps at left edge", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 0, row: 0, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next] = copyModeUpdate({ type: "move", direction: "left" }, state)
    expect(next.cursor).toEqual({ col: 0, row: 0 })
  })

  test("move clamps at top edge", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 0, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next] = copyModeUpdate({ type: "move", direction: "up" }, state)
    expect(next.cursor).toEqual({ col: 5, row: 0 })
  })

  test("move clamps at right edge", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 79, row: 0, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next] = copyModeUpdate({ type: "move", direction: "right" }, state)
    expect(next.cursor).toEqual({ col: 79, row: 0 })
  })

  test("move clamps at bottom edge", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 23, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next] = copyModeUpdate({ type: "move", direction: "down" }, state)
    expect(next.cursor).toEqual({ col: 5, row: 23 })
  })

  test("move is no-op when not active", () => {
    const state = createCopyModeState()
    const [next, effects] = copyModeUpdate({ type: "move", direction: "right" }, state)
    expect(next).toBe(state)
    expect(effects).toEqual([])
  })
})

// ============================================================================
// moveToLineStart / moveToLineEnd
// ============================================================================

describe("copyModeUpdate — moveToLineStart/End", () => {
  test("moveToLineStart goes to col 0", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 15, row: 5, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next] = copyModeUpdate({ type: "moveToLineStart" }, state)
    expect(next.cursor).toEqual({ col: 0, row: 5 })
  })

  test("moveToLineEnd goes to last column", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 15, row: 5, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next] = copyModeUpdate({ type: "moveToLineEnd" }, state)
    expect(next.cursor).toEqual({ col: 79, row: 5 })
  })
})

// ============================================================================
// visual mode
// ============================================================================

describe("copyModeUpdate — visual", () => {
  test("visual sets anchor at cursor and enables visual mode", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next, effects] = copyModeUpdate({ type: "visual" }, state)

    expect(next.visual).toBe(true)
    expect(next.visualLine).toBe(false)
    expect(next.anchor).toEqual({ col: 5, row: 3 })
    expect(effects).toContainEqual({ type: "render" })
    expect(effects).toContainEqual({
      type: "setSelection",
      anchor: { col: 5, row: 3 },
      head: { col: 5, row: 3 },
      lineWise: false,
    })
  })

  test("visual toggle off clears anchor", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [visual] = copyModeUpdate({ type: "visual" }, state)
    const [next] = copyModeUpdate({ type: "visual" }, visual)

    expect(next.visual).toBe(false)
    expect(next.anchor).toBeNull()
  })

  test("move during visual mode emits setSelection", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [visual] = copyModeUpdate({ type: "visual" }, state)
    const [, effects] = copyModeUpdate({ type: "move", direction: "right" }, visual)

    expect(effects).toContainEqual({
      type: "setSelection",
      anchor: { col: 5, row: 3 },
      head: { col: 6, row: 3 },
      lineWise: false,
    })
  })
})

// ============================================================================
// visualLine mode
// ============================================================================

describe("copyModeUpdate — visualLine", () => {
  test("visualLine sets anchor and enables line visual", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next, effects] = copyModeUpdate({ type: "visualLine" }, state)

    expect(next.visualLine).toBe(true)
    expect(next.visual).toBe(false)
    expect(next.anchor).toEqual({ col: 5, row: 3 })
    expect(effects).toContainEqual({
      type: "setSelection",
      anchor: { col: 5, row: 3 },
      head: { col: 5, row: 3 },
      lineWise: true,
    })
  })

  test("switching from visual to visualLine", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [visual] = copyModeUpdate({ type: "visual" }, state)
    const [next] = copyModeUpdate({ type: "visualLine" }, visual)

    expect(next.visualLine).toBe(true)
    expect(next.visual).toBe(false)
  })
})

// ============================================================================
// yank
// ============================================================================

describe("copyModeUpdate — yank", () => {
  test("yank in visual mode emits copy and exits", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [visual] = copyModeUpdate({ type: "visual" }, state)
    let [moved] = copyModeUpdate({ type: "move", direction: "right" }, visual)
    ;[moved] = copyModeUpdate({ type: "move", direction: "right" }, moved)
    ;[moved] = copyModeUpdate({ type: "move", direction: "right" }, moved)

    const [next, effects] = copyModeUpdate({ type: "yank" }, moved)

    expect(next.active).toBe(false)
    expect(effects).toContainEqual({
      type: "copy",
      anchor: { col: 5, row: 3 },
      head: { col: 8, row: 3 },
      lineWise: false,
    })
  })

  test("yank in visualLine mode emits copy with lineWise=true", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [visual] = copyModeUpdate({ type: "visualLine" }, state)
    const [moved] = copyModeUpdate({ type: "move", direction: "down" }, visual)

    const [next, effects] = copyModeUpdate({ type: "yank" }, moved)

    expect(next.active).toBe(false)
    expect(effects).toContainEqual({
      type: "copy",
      anchor: { col: 5, row: 3 },
      head: { col: 5, row: 4 },
      lineWise: true,
    })
  })

  test("yank without visual mode just exits", () => {
    const [state] = copyModeUpdate(
      { type: "enter", col: 5, row: 3, bufferWidth: 80, bufferHeight: 24 },
      createCopyModeState(),
    )
    const [next, effects] = copyModeUpdate({ type: "yank" }, state)

    expect(next.active).toBe(false)
    // No copy effect, just render
    expect(effects.filter((e) => e.type === "copy")).toHaveLength(0)
    expect(effects).toContainEqual({ type: "render" })
  })

  test("yank is no-op when not active", () => {
    const state = createCopyModeState()
    const [next, effects] = copyModeUpdate({ type: "yank" }, state)
    expect(next.active).toBe(false)
    expect(effects).toEqual([])
  })
})
