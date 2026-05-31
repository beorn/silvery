/**
 * Runtime checks for the `<Island>` tier-2 SILVERY_STRICT slugs.
 *
 * The sibling `island-slugs.contract.test.ts` proves the seven slug names are
 * routable through the umbrella parser. This file pins the six non-mode-leak
 * runtime checks at their terminal-target call sites.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  assertIslandRenderInvariants,
  ensureIslandStrictInstrumentation,
  ISLAND_PAINT_BUDGET_CELLS,
} from "@silvery/ag-term/strict-island"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import type { AgNode, Cell } from "@silvery/ag/types"
import type {
  IslandHandle,
  IslandInputOwner,
  IslandMouseEvent,
  IslandNodeState,
  IslandOutputOwner,
  IslandSizeOwner,
} from "@silvery/ag/island-types"
import type { CellBuffer, ViewportRect } from "@silvery/ag/viewport-types"

const CELL: Cell = Object.freeze({
  char: "X",
  fg: null,
  bg: null,
  attrs: Object.freeze({}),
  wide: false,
  continuation: false,
})

let prevStrict: string | undefined

beforeEach(() => {
  prevStrict = process.env.SILVERY_STRICT
})

afterEach(() => {
  if (prevStrict === undefined) {
    delete process.env.SILVERY_STRICT
  } else {
    process.env.SILVERY_STRICT = prevStrict
  }
  resetStrictCache()
})

function setStrict(value: string): void {
  process.env.SILVERY_STRICT = value
  resetStrictCache()
}

function buffer(cols: number, rows: number, cell: Cell = CELL): CellBuffer {
  return {
    cols,
    rows,
    getCell() {
      return cell
    },
  }
}

function sizeOwner(cols: number, rows: number): IslandSizeOwner {
  return {
    get cols() {
      return cols
    },
    get rows() {
      return rows
    },
    subscribe: () => () => {},
    requestResize: () => {},
  }
}

function outputOwner(source: CellBuffer): IslandOutputOwner {
  return {
    buffer: source,
    cursor: null,
    cursorVisible: false,
    subscribe: () => () => {},
    writeCells: () => {},
    invalidateAll: () => {},
  }
}

function cursorOutputOwner(source: CellBuffer, col: number, row: number): IslandOutputOwner {
  return {
    buffer: source,
    cursor: { col, row, style: "block" },
    cursorVisible: true,
    subscribe: () => () => {},
    writeCells: () => {},
    invalidateAll: () => {},
  }
}

function makeNode(handle: IslandHandle): AgNode {
  const state: IslandNodeState = {
    handle,
    guest: {
      async init() {
        return handle
      },
    },
    capabilities: {},
    focusable: false,
    focused: false,
    palettePolicy: "freeze",
    frozenPalette: null,
    hydrate: "load",
    lifecycle: "ready",
    lastError: null,
    abortController: new AbortController(),
  }
  return {
    type: "silvery-island",
    props: {},
    children: [],
    parent: null,
    layoutNode: null,
    boxRect: null,
    scrollRect: null,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: 0,
    dirtyBits: 0,
    dirtyEpoch: 0,
    islandState: state,
  }
}

function makeHandle(source: CellBuffer, opts: { cols?: number; rows?: number } = {}): IslandHandle {
  return {
    size: sizeOwner(opts.cols ?? source.cols, opts.rows ?? source.rows),
    output: outputOwner(source),
    dispose() {},
  }
}

describe("island runtime SILVERY_STRICT checks", () => {
  test("instrumentation leaves frozen guest owners alone when tier-2 island slugs are disabled", () => {
    setStrict("1")
    const output = Object.freeze(outputOwner(buffer(2, 1)))
    const handle: IslandHandle = {
      size: Object.freeze(sizeOwner(2, 1)),
      output,
      dispose() {},
    }
    const node = makeNode(handle)
    expect(() => ensureIslandStrictInstrumentation(node)).not.toThrow()
  })

  test("island-paint-oob rejects dirty rects outside the guest size", () => {
    setStrict("island-paint-oob")
    const handle = makeHandle(buffer(4, 2))
    const node = makeNode(handle)
    ensureIslandStrictInstrumentation(node)
    const badRect: ViewportRect = { col: -1, row: 0, width: 2, height: 1 }
    expect(() => handle.output.writeCells([badRect], handle.output.buffer)).toThrow(
      /SILVERY_STRICT=island-paint-oob/,
    )
  })

  test("island-grapheme-width rejects inconsistent wide-cell metadata", () => {
    setStrict("island-grapheme-width")
    const wideButUnmarked: Cell = { ...CELL, char: "あ", wide: false, continuation: false }
    const handle = makeHandle(buffer(2, 1, wideButUnmarked))
    const node = makeNode(handle)
    expect(() => assertIslandRenderInvariants(node, { x: 0, y: 0, width: 2, height: 1 })).toThrow(
      /SILVERY_STRICT=island-grapheme-width/,
    )
  })

  test("island-resize-race rejects output written before the size owner acknowledges", () => {
    setStrict("island-resize-race")
    const handle = makeHandle(buffer(5, 2), { cols: 4, rows: 2 })
    const node = makeNode(handle)
    expect(() => assertIslandRenderInvariants(node, { x: 0, y: 0, width: 5, height: 2 })).toThrow(
      /SILVERY_STRICT=island-resize-race/,
    )
  })

  test("island-dispose-leak rejects output callbacks after disposal", () => {
    setStrict("island-dispose-leak")
    let listener: (() => void) | null = null
    const source = buffer(2, 1)
    const output: IslandOutputOwner = {
      buffer: source,
      cursor: null,
      cursorVisible: false,
      subscribe(next) {
        listener = next
        return () => {
          listener = null
        }
      },
      writeCells: () => {},
      invalidateAll: () => {},
    }
    const handle: IslandHandle = { size: sizeOwner(2, 1), output, dispose() {} }
    const node = makeNode(handle)
    ensureIslandStrictInstrumentation(node)
    handle.output.subscribe(() => {})
    node.islandState!.lifecycle = "disposed"
    expect(() => listener?.()).toThrow(/SILVERY_STRICT=island-dispose-leak/)
  })

  test("island-paint-budget rejects a single island that exceeds the per-frame budget", () => {
    setStrict("island-paint-budget")
    const handle = makeHandle(buffer(ISLAND_PAINT_BUDGET_CELLS + 1, 1))
    const node = makeNode(handle)
    expect(() =>
      assertIslandRenderInvariants(node, {
        x: 0,
        y: 0,
        width: ISLAND_PAINT_BUDGET_CELLS + 1,
        height: 1,
      }),
    ).toThrow(/SILVERY_STRICT=island-paint-budget/)
  })

  test("island-boundary-limits rejects mouse coordinates outside the island", () => {
    setStrict("island-boundary-limits")
    let emit: ((event: IslandMouseEvent) => void) | null = null
    const input: IslandInputOwner = {
      onMouse(handler) {
        emit = handler
        return () => {
          emit = null
        }
      },
    }
    const handle: IslandHandle = {
      size: sizeOwner(4, 2),
      output: outputOwner(buffer(4, 2)),
      input,
      dispose() {},
    }
    const node = makeNode(handle)
    ensureIslandStrictInstrumentation(node)
    handle.input!.onMouse?.(() => {})
    expect(() => emit?.({ row: 2, col: 0, button: "left" })).toThrow(
      /SILVERY_STRICT=island-boundary-limits/,
    )
  })

  test("island-boundary-limits allows the right-margin (pending-wrap) cursor at col == cols", () => {
    // DECAWM: after writing the last column with autowrap on, the logical
    // cursor holds at col == width before the next char wraps it to the next
    // row. tmux's capture (cursor_x) / xterm.js's cursorX both report
    // width for that state. It is a legitimate terminal position, not a
    // boundary escape — the render blit clips at < cols and never paints
    // there. Regression: the 19466 silvermux resize-window fix made the guest
    // actually resize, so after a resize the cursor can land at the right
    // margin of the new width (cursor 20,1 in a 20x19 island).
    setStrict("island-boundary-limits")
    const handle: IslandHandle = {
      size: sizeOwner(20, 19),
      output: cursorOutputOwner(buffer(20, 19), /* col */ 20, /* row */ 1),
      dispose() {},
    }
    const node = makeNode(handle)
    expect(() =>
      assertIslandRenderInvariants(node, { x: 0, y: 0, width: 20, height: 19 }),
    ).not.toThrow()
  })

  test("island-boundary-limits still rejects a cursor genuinely past the right margin (col > cols)", () => {
    // col == cols is the pending-wrap right margin (allowed); col == cols + 1
    // is a genuine escape — the guest reported a cursor a full column outside
    // its own grid. Detection must NOT be weakened for this case.
    setStrict("island-boundary-limits")
    const handle: IslandHandle = {
      size: sizeOwner(20, 19),
      output: cursorOutputOwner(buffer(20, 19), /* col */ 21, /* row */ 1),
      dispose() {},
    }
    const node = makeNode(handle)
    expect(() => assertIslandRenderInvariants(node, { x: 0, y: 0, width: 20, height: 19 })).toThrow(
      /SILVERY_STRICT=island-boundary-limits/,
    )
  })

  test("island-boundary-limits keeps the row axis strict (no pending-wrap on rows)", () => {
    // There is no row-axis equivalent of pending-wrap: a cursor on the
    // phantom row below the last (row == rows) is a genuine escape, even at
    // a valid column.
    setStrict("island-boundary-limits")
    const handle: IslandHandle = {
      size: sizeOwner(20, 19),
      output: cursorOutputOwner(buffer(20, 19), /* col */ 0, /* row */ 19),
      dispose() {},
    }
    const node = makeNode(handle)
    expect(() => assertIslandRenderInvariants(node, { x: 0, y: 0, width: 20, height: 19 })).toThrow(
      /SILVERY_STRICT=island-boundary-limits/,
    )
  })
})
