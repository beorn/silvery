/**
 * In-memory {@link CellBuffer} implementation for `<Viewport>` instances.
 *
 * The MVP backing buffer for the v1 viewport: a flat `Cell[]` of size
 * `cols × rows` with default-blank cells. {@link ForeignSource} adapters and
 * `<Viewport ref={...}>` callers write into it via {@link MutableCellBuffer}
 * (the read-only {@link CellBuffer} contract is upcast for the pipeline's
 * blit consumer).
 *
 * See {@link viewport-types.ts} and bead
 * `@km/silvery/15513-surface-nested-composition-primitive`.
 */

import type { Cell, CellAttrs } from "./types"
import type { CellBuffer, ViewportRect } from "./viewport-types"

/**
 * Mutable variant of {@link CellBuffer} — the pipeline-facing read API is
 * {@link CellBuffer} (immutable), the writer-facing API adds cell-level
 * mutation + bulk blit helpers used by `<Viewport>`'s `writeCells` /
 * `setCursor` paths.
 */
export interface MutableCellBuffer extends CellBuffer {
  setCell(col: number, row: number, cell: Cell): void
  /** Clear the buffer to default blanks. */
  clear(): void
  /**
   * Copy cells from `source` into this buffer at each `dirtyRects` rect.
   * Out-of-bounds writes are dropped (no exception); rect coordinates
   * outside the buffer's own grid are clipped to `[0, cols) × [0, rows)`.
   *
   * The `source` is assumed to be addressable at the same Viewport-local
   * coordinates as the rects — `source.getCell(col, row)` for every
   * `(col, row)` in each rect.
   */
  blit(dirtyRects: readonly ViewportRect[], source: CellBuffer): void
  /** Read a snapshot of the current buffer (detached deep copy). */
  snapshot(): CellBuffer
}

const EMPTY_ATTRS: Readonly<CellAttrs> = Object.freeze({})

function blankCell(): Cell {
  return {
    char: " ",
    fg: null,
    bg: null,
    attrs: EMPTY_ATTRS,
    wide: false,
    continuation: false,
  }
}

/**
 * Create a `cols × rows` mutable cell buffer initialised to blank cells.
 *
 * The buffer's `cols` / `rows` are immutable for the buffer's lifetime —
 * resize is modeled by the caller allocating a fresh buffer (the cheap path
 * for a v1 Viewport that almost always resizes through the React layer).
 */
export function createCellBuffer(cols: number, rows: number): MutableCellBuffer {
  if (!Number.isInteger(cols) || cols < 0) {
    throw new Error(`createCellBuffer: cols must be a non-negative integer (got ${cols})`)
  }
  if (!Number.isInteger(rows) || rows < 0) {
    throw new Error(`createCellBuffer: rows must be a non-negative integer (got ${rows})`)
  }

  const cells: Cell[] = new Array(cols * rows)
  for (let i = 0; i < cells.length; i++) cells[i] = blankCell()

  function indexOf(col: number, row: number): number {
    return row * cols + col
  }

  function inBounds(col: number, row: number): boolean {
    return col >= 0 && col < cols && row >= 0 && row < rows
  }

  const buffer: MutableCellBuffer = {
    cols,
    rows,
    getCell(col, row) {
      if (!inBounds(col, row)) return blankCell()
      return cells[indexOf(col, row)]!
    },
    setCell(col, row, cell) {
      if (!inBounds(col, row)) return
      cells[indexOf(col, row)] = cell
    },
    clear() {
      for (let i = 0; i < cells.length; i++) cells[i] = blankCell()
    },
    blit(dirtyRects, source) {
      for (const rect of dirtyRects) {
        const c0 = Math.max(0, rect.col)
        const r0 = Math.max(0, rect.row)
        const c1 = Math.min(cols, rect.col + rect.width)
        const r1 = Math.min(rows, rect.row + rect.height)
        for (let r = r0; r < r1; r++) {
          for (let c = c0; c < c1; c++) {
            cells[indexOf(c, r)] = source.getCell(c, r)
          }
        }
      }
    },
    snapshot() {
      const copy: Cell[] = new Array(cells.length)
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i]!
        copy[i] = {
          char: c.char,
          fg: c.fg,
          bg: c.bg,
          attrs: c.attrs,
          wide: c.wide,
          continuation: c.continuation,
        }
      }
      const snapCols = cols
      const snapRows = rows
      return {
        cols: snapCols,
        rows: snapRows,
        getCell(col, row) {
          if (col < 0 || col >= snapCols || row < 0 || row >= snapRows) return blankCell()
          return copy[row * snapCols + col]!
        },
      }
    },
  }
  return buffer
}
