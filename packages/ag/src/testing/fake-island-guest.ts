/**
 * @fakes @silvery/ag
 *
 * A uniform-fill {@link IslandGuest}: every cell is `fill` on a bg colour,
 * sized to the context at `init()`. The owner's stand-in for a real guest
 * (e.g. xtermGuest) when a test asserts what the HOST paints around an island
 * — host-cell coverage, chrome letterbox, no overflow — independent of which
 * guest supplies the inner cells. Modelled on the fill-buffer guest km's
 * termless overlay regression carried inline.
 *
 * No cast: every member an IslandGuest / IslandHandle / IslandOutputOwner
 * adds fails to compile here.
 */
import type { Cell } from "../types.ts"
import { createCellBuffer, type MutableCellBuffer } from "../viewport-buffer.ts"
import type {
  IslandContext,
  IslandGuest,
  IslandHandle,
  IslandOutputOwner,
  IslandSizeOwner,
} from "../island-types.ts"

function fillBuffer(buf: MutableCellBuffer, fill: string): MutableCellBuffer {
  const cell: Cell = {
    char: fill,
    fg: null,
    bg: "#008000",
    attrs: {},
    wide: false,
    continuation: false,
  }
  for (let r = 0; r < buf.rows; r++) {
    for (let c = 0; c < buf.cols; c++) buf.setCell(c, r, cell)
  }
  return buf
}

export function createFakeIslandGuest(fill = "X"): IslandGuest {
  const subscribers = new Set<() => void>()
  return {
    init(ctx: IslandContext): Promise<IslandHandle> {
      let cols = ctx.cols
      let rows = ctx.rows
      const buffer = fillBuffer(createCellBuffer(cols, rows), fill)
      const size: IslandSizeOwner = {
        get cols() {
          return cols
        },
        get rows() {
          return rows
        },
        subscribe: () => () => {},
        requestResize(nextCols, nextRows) {
          cols = nextCols
          rows = nextRows
        },
      }
      const output: IslandOutputOwner = {
        buffer,
        cursor: null,
        cursorVisible: false,
        subscribe(listener) {
          subscribers.add(listener)
          return () => subscribers.delete(listener)
        },
        writeCells() {},
        invalidateAll() {
          for (const listener of subscribers) listener()
        },
      }
      const handle: IslandHandle = { size, output, dispose() {} }
      ctx.emit({ type: "ready" })
      return Promise.resolve(handle)
    },
  } satisfies IslandGuest
}
