/**
 * Tests for advanced copy-mode features:
 * - Word end motion (e)
 * - Auto-scroll effects
 * - Word motion with visual mode
 */
import { describe, test, expect } from "vitest"
import {
  createCopyModeState,
  copyModeUpdate,
  type CopyModeBuffer,
} from "@silvery/headless/copy-mode"

// ============================================================================
// Helpers
// ============================================================================

function createMockBuffer(lines: string[]): CopyModeBuffer & { width: number; height: number } {
  const height = lines.length
  const width = Math.max(...lines.map((l) => l.length), 40)
  return {
    width,
    height,
    getCell(col: number, row: number) {
      const line = lines[row] ?? ""
      return { char: col < line.length ? line[col]! : " " }
    },
  }
}

function enterCopyMode(col: number, row: number, width = 80, height = 24) {
  const [state] = copyModeUpdate(
    { type: "enter", col, row, bufferWidth: width, bufferHeight: height },
    createCopyModeState(),
  )
  return state
}

// ============================================================================
// moveWordEnd (e motion)
// ============================================================================

describe("copyModeUpdate — moveWordEnd", () => {
  test("moves to end of current word", () => {
    const buffer = createMockBuffer(["hello world"])
    const state = enterCopyMode(0, 0, buffer.width, buffer.height)
    const [next] = copyModeUpdate({ type: "moveWordEnd", buffer }, state)

    // "hello" ends at col 4
    expect(next.cursor).toEqual({ col: 4, row: 0 })
  })

  test("moves from inside word to end of word", () => {
    const buffer = createMockBuffer(["hello world"])
    const state = enterCopyMode(2, 0, buffer.width, buffer.height)
    const [next] = copyModeUpdate({ type: "moveWordEnd", buffer }, state)

    // From col 2 in "hello", moves forward past 'l' then to end of "hello" = 4
    // Actually, 'e' first moves one forward (to col 3), then
    // skips non-word (none), then goes to end of word -> 4
    expect(next.cursor).toEqual({ col: 4, row: 0 })
  })

  test("moves from space to end of next word", () => {
    const buffer = createMockBuffer(["hello world"])
    const state = enterCopyMode(4, 0, buffer.width, buffer.height)
    const [next] = copyModeUpdate({ type: "moveWordEnd", buffer }, state)

    // From col 4 (end of 'hello'), move +1 to col 5 (space)
    // Skip non-word -> col 6 ('w')
    // Go to end of "world" -> col 10
    expect(next.cursor).toEqual({ col: 10, row: 0 })
  })

  test("stays at end of buffer", () => {
    const buffer = createMockBuffer(["ab"])
    const state = enterCopyMode(1, 0, buffer.width, buffer.height)
    const [next] = copyModeUpdate({ type: "moveWordEnd", buffer }, state)

    // Already at nearly the end; limited by buffer width
    expect(next.cursor.row).toBe(0)
  })

  test("is no-op when not active", () => {
    const buffer = createMockBuffer(["hello world"])
    const state = createCopyModeState()
    const [next, effects] = copyModeUpdate({ type: "moveWordEnd", buffer }, state)
    expect(next).toBe(state)
    expect(effects).toEqual([])
  })

  test("without buffer is no-op", () => {
    const state = enterCopyMode(0, 0)
    const [next, effects] = copyModeUpdate({ type: "moveWordEnd" }, state)
    expect(next).toBe(state)
    expect(effects).toEqual([])
  })

  test("emits setSelection in visual mode", () => {
    const buffer = createMockBuffer(["hello world"])
    let state = enterCopyMode(0, 0, buffer.width, buffer.height)
    ;[state] = copyModeUpdate({ type: "visual" }, state)

    const [next, effects] = copyModeUpdate({ type: "moveWordEnd", buffer }, state)

    expect(next.cursor).toEqual({ col: 4, row: 0 })
    expect(effects).toContainEqual({
      type: "setSelection",
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
      lineWise: false,
    })
  })
})

// ============================================================================
// Auto-scroll effects
// ============================================================================

describe("copyModeUpdate — auto-scroll", () => {
  test("emits scroll down when at bottom edge and moving down", () => {
    // Buffer is 24 rows, cursor at row 23 (bottom)
    const state = enterCopyMode(5, 23, 80, 24)
    const [next, effects] = copyModeUpdate({ type: "move", direction: "down" }, state)

    // Cursor stays clamped at 23
    expect(next.cursor.row).toBe(23)
    // Should emit scroll effect
    expect(effects).toContainEqual({ type: "scroll", direction: "down", amount: 1 })
  })

  test("emits scroll up when at top edge and moving up", () => {
    const state = enterCopyMode(5, 0, 80, 24)
    const [next, effects] = copyModeUpdate({ type: "move", direction: "up" }, state)

    expect(next.cursor.row).toBe(0)
    expect(effects).toContainEqual({ type: "scroll", direction: "up", amount: 1 })
  })

  test("no scroll when not at edge", () => {
    const state = enterCopyMode(5, 10, 80, 24)
    const [next, effects] = copyModeUpdate({ type: "move", direction: "down" }, state)

    expect(next.cursor.row).toBe(11)
    const scrollEffects = effects.filter((e) => e.type === "scroll")
    expect(scrollEffects).toHaveLength(0)
  })

  test("no scroll for left/right movement", () => {
    const state = enterCopyMode(0, 0, 80, 24)
    const [, effects] = copyModeUpdate({ type: "move", direction: "left" }, state)

    const scrollEffects = effects.filter((e) => e.type === "scroll")
    expect(scrollEffects).toHaveLength(0)
  })

  test("scroll down with visual mode active emits setSelection", () => {
    let state = enterCopyMode(5, 23, 80, 24)
    ;[state] = copyModeUpdate({ type: "visual" }, state)

    const [next, effects] = copyModeUpdate({ type: "move", direction: "down" }, state)

    expect(effects).toContainEqual({ type: "scroll", direction: "down", amount: 1 })
    expect(effects).toContainEqual({
      type: "setSelection",
      anchor: { col: 5, row: 23 },
      head: { col: 5, row: 23 },
      lineWise: false,
    })
  })
})

// ============================================================================
// Word motion (w/b) with visual mode (integration)
// ============================================================================

describe("copyModeUpdate — word motions with visual mode", () => {
  test("moveWordForward in visual mode extends selection", () => {
    const buffer = createMockBuffer(["hello world foo"])
    let state = enterCopyMode(0, 0, buffer.width, buffer.height)
    ;[state] = copyModeUpdate({ type: "visual" }, state)

    const [next, effects] = copyModeUpdate({ type: "moveWordForward", buffer }, state)

    // 'w' from col 0: skip 'hello', skip space, land on 'world' at col 6
    expect(next.cursor.col).toBe(6)
    expect(effects).toContainEqual({
      type: "setSelection",
      anchor: { col: 0, row: 0 },
      head: { col: 6, row: 0 },
      lineWise: false,
    })
  })

  test("moveWordBackward in visual mode extends selection", () => {
    const buffer = createMockBuffer(["hello world foo"])
    let state = enterCopyMode(10, 0, buffer.width, buffer.height)
    ;[state] = copyModeUpdate({ type: "visual" }, state)

    const [next, effects] = copyModeUpdate({ type: "moveWordBackward", buffer }, state)

    // 'b' from col 10: skip 'world' backwards to col 6
    expect(next.cursor.col).toBe(6)
    expect(effects).toContainEqual({
      type: "setSelection",
      anchor: { col: 10, row: 0 },
      head: { col: 6, row: 0 },
      lineWise: false,
    })
  })

  test("moveWordEnd in visual line mode extends line-wise selection", () => {
    const buffer = createMockBuffer(["hello world foo"])
    let state = enterCopyMode(0, 0, buffer.width, buffer.height)
    ;[state] = copyModeUpdate({ type: "visualLine" }, state)

    const [next, effects] = copyModeUpdate({ type: "moveWordEnd", buffer }, state)

    expect(effects).toContainEqual({
      type: "setSelection",
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
      lineWise: true,
    })
  })
})

// ============================================================================
// Line start/end with visual mode
// ============================================================================

describe("copyModeUpdate — line start/end with visual mode", () => {
  test("moveToLineStart in visual mode extends selection", () => {
    let state = enterCopyMode(15, 5, 80, 24)
    ;[state] = copyModeUpdate({ type: "visual" }, state)

    const [next, effects] = copyModeUpdate({ type: "moveToLineStart" }, state)

    expect(next.cursor).toEqual({ col: 0, row: 5 })
    expect(effects).toContainEqual({
      type: "setSelection",
      anchor: { col: 15, row: 5 },
      head: { col: 0, row: 5 },
      lineWise: false,
    })
  })

  test("moveToLineEnd in visual mode extends selection", () => {
    let state = enterCopyMode(15, 5, 80, 24)
    ;[state] = copyModeUpdate({ type: "visual" }, state)

    const [next, effects] = copyModeUpdate({ type: "moveToLineEnd" }, state)

    expect(next.cursor).toEqual({ col: 79, row: 5 })
    expect(effects).toContainEqual({
      type: "setSelection",
      anchor: { col: 15, row: 5 },
      head: { col: 79, row: 5 },
      lineWise: false,
    })
  })
})
