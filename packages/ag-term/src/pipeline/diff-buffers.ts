/**
 * Buffer diffing for the output phase.
 *
 * Compares two TerminalBuffers and returns a list of changed cells via a
 * pre-allocated pool (zero per-frame allocation). Handles dimension changes
 * (growth and shrink) and wide→narrow character transitions.
 */

import type { TerminalBuffer } from "../buffer"
import type { CellChange } from "./types"

// ============================================================================
// Pre-allocated diff pool
// ============================================================================

/**
 * Create a fresh CellChange with empty cell data.
 * Used to populate the pre-allocated pool.
 */
function createEmptyCellChange(): CellChange {
  return {
    x: 0,
    y: 0,
    cell: {
      char: " ",
      fg: null,
      bg: null,
      underlineColor: null,
      attrs: {},
      wide: false,
      continuation: false,
      hyperlink: undefined,
    },
  }
}

/** Pre-allocated pool of CellChange objects, reused across frames. */
const diffPool: CellChange[] = []

/** Current pool capacity. */
let diffPoolCapacity = 0

/**
 * Ensure the diff pool has at least `capacity` entries.
 * Grows the pool if needed; never shrinks.
 */
function ensureDiffPoolCapacity(capacity: number): void {
  if (capacity <= diffPoolCapacity) return
  for (let i = diffPoolCapacity; i < capacity; i++) {
    diffPool.push(createEmptyCellChange())
  }
  diffPoolCapacity = capacity
}

/**
 * Write cell data from a buffer into a pre-allocated CellChange entry.
 * Uses readCellInto for zero-allocation reads.
 */
function writeCellChange(change: CellChange, x: number, y: number, buffer: TerminalBuffer): void {
  change.x = x
  change.y = y
  buffer.readCellInto(x, y, change.cell)
}

/**
 * Write empty cell data into a pre-allocated CellChange entry.
 * Used for shrink regions where cells need to be cleared.
 */
function writeEmptyCellChange(change: CellChange, x: number, y: number): void {
  change.x = x
  change.y = y
  const cell = change.cell
  cell.char = " "
  cell.fg = null
  cell.bg = null
  cell.underlineColor = null
  // Reset attrs fields
  const attrs = cell.attrs
  attrs.bold = undefined
  attrs.dim = undefined
  attrs.italic = undefined
  attrs.underline = undefined
  attrs.underlineStyle = undefined
  attrs.blink = undefined
  attrs.inverse = undefined
  attrs.hidden = undefined
  attrs.strikethrough = undefined
  attrs.overline = undefined
  cell.wide = false
  cell.continuation = false
  cell.hyperlink = undefined
}

/**
 * Diff result: pool reference + count (avoids per-frame array allocation).
 */
export interface DiffResult {
  pool: CellChange[]
  count: number
}

/** Reusable diff result object (avoids allocating a new one per frame). */
const diffResult: DiffResult = { pool: diffPool, count: 0 }

/**
 * Diff two buffers and return changes via pre-allocated pool.
 *
 * Optimization: Uses a pre-allocated pool of CellChange objects to avoid
 * allocating new objects per changed cell. Uses readCellInto for
 * zero-allocation cell reads. The pool grows as needed but is reused
 * between frames. Returns a pool+count pair instead of slicing the array.
 */
export function diffBuffers(prev: TerminalBuffer, next: TerminalBuffer): DiffResult {
  // Ensure pool is large enough for worst case (all cells changed).
  // Wide→narrow transitions emit an extra change for the continuation cell,
  // so worst case is 1.5x (every other cell could be a wide→narrow transition).
  const cells = Math.max(prev.width, next.width) * Math.max(prev.height, next.height)
  const maxChanges = cells + (cells >> 1) // 1.5x
  ensureDiffPoolCapacity(maxChanges)

  let changeCount = 0

  // Dimension mismatch means we need to re-render everything visible
  const height = Math.min(prev.height, next.height)
  const width = Math.min(prev.width, next.width)

  // Use dirty row bounding box to narrow the scan range.
  // If no rows are dirty, minDirtyRow is -1 and the loop body is skipped.
  const startRow = next.minDirtyRow === -1 ? 0 : next.minDirtyRow
  const endRow = next.maxDirtyRow === -1 ? -1 : Math.min(next.maxDirtyRow, height - 1)

  for (let y = startRow; y <= endRow; y++) {
    // Skip individual clean rows within the bounding box
    if (!next.isRowDirty(y)) continue

    // Fast row-level pre-check: if all packed metadata, chars, AND Map-based
    // extras (true colors, underline colors, hyperlinks) match, skip per-cell
    // comparison entirely. This catches rows marked dirty by fill() or
    // scrollRegion() that didn't actually change content.
    // NOTE: rowExtrasEquals is essential — rowMetadataEquals only checks packed
    // flags (e.g., "has true color fg"), not the actual RGB values in the Maps.
    if (
      next.rowMetadataEquals(y, prev) &&
      next.rowCharsEquals(y, prev) &&
      next.rowExtrasEquals(y, prev)
    )
      continue

    for (let x = 0; x < width; x++) {
      // Use buffer's optimized cellEquals which compares packed metadata first
      if (!next.cellEquals(x, y, prev)) {
        writeCellChange(diffPool[changeCount]!, x, y, next)
        changeCount++

        // Wide char transition: when prev had a wide char and next doesn't,
        // we must also emit the continuation position (x+1) as a change.
        // The terminal's state at x+1 contains the second half of the wide
        // char, but the buffer may show x+1 as "unchanged" (both prev and
        // next are ' '). Without this explicit change, changesToAnsi skips
        // x+1 and the terminal retains the wide char remnant, causing
        // cursor drift.
        //
        // Skip when the next column already triggers its own change (next[x+1]
        // is itself a wide char or a continuation cell that differs from prev):
        // the normal scan at x+1 will emit it. Pushing here too would produce a
        // duplicate change at the same (x+1, y) position. changesToAnsi sorts
        // by position and processes both entries, emitting the wide char twice
        // (regression: km-silvery.wide-char-incr-render — wide char at column
        // N in prev frame, shifted to column N+1 in next frame produced
        // '🇯🇵🇯🇵' instead of ' 🇯🇵').
        if (
          x + 1 < width &&
          prev.isCellWide(x, y) &&
          !next.isCellWide(x, y) &&
          !next.isCellWide(x + 1, y) &&
          !next.isCellContinuation(x + 1, y)
        ) {
          writeCellChange(diffPool[changeCount]!, x + 1, y, next)
          changeCount++
        }
      }
    }
  }

  // Handle size growth: add all cells in new areas.
  // Width growth covers the right strip (x >= prev.width) for ALL rows.
  // Height growth covers the bottom strip (y >= prev.height) but only up to
  // prev.width to avoid double-counting the corner with width growth.
  const widthGrew = next.width > prev.width
  if (widthGrew) {
    for (let y = 0; y < next.height; y++) {
      for (let x = prev.width; x < next.width; x++) {
        writeCellChange(diffPool[changeCount]!, x, y, next)
        changeCount++
      }
    }
  }
  if (next.height > prev.height) {
    // When width also grew, only iterate x=0..prev.width (the rest was
    // already covered by width growth above). Otherwise iterate full width.
    const xEnd = widthGrew ? prev.width : next.width
    for (let y = prev.height; y < next.height; y++) {
      for (let x = 0; x < xEnd; x++) {
        writeCellChange(diffPool[changeCount]!, x, y, next)
        changeCount++
      }
    }
  }

  // Handle size shrink: clear cells in old-but-not-new areas.
  // Width shrink covers x >= next.width for the shared height.
  // Height shrink covers y >= next.height but only up to next.width when
  // width also shrank, to avoid double-counting the corner.
  const widthShrank = prev.width > next.width
  if (widthShrank) {
    for (let y = 0; y < height; y++) {
      for (let x = next.width; x < prev.width; x++) {
        writeEmptyCellChange(diffPool[changeCount]!, x, y)
        changeCount++
      }
    }
  }
  if (prev.height > next.height) {
    // When width also shrank, the corner (x >= next.width, y >= next.height)
    // was NOT covered by width shrink (which only iterates y < height =
    // min(prev.height, next.height) = next.height). So iterate full prev.width.
    for (let y = next.height; y < prev.height; y++) {
      for (let x = 0; x < prev.width; x++) {
        writeEmptyCellChange(diffPool[changeCount]!, x, y)
        changeCount++
      }
    }
  }

  if (changeCount > maxChanges) {
    throw new Error(
      `diffBuffers: changeCount ${changeCount} exceeds pool capacity ${maxChanges} ` +
        `(prev ${prev.width}x${prev.height}, next ${next.width}x${next.height})`,
    )
  }

  diffResult.pool = diffPool
  diffResult.count = changeCount
  return diffResult
}
