/**
 * Phase 4: Output Phase
 *
 * Diff two buffers and produce minimal ANSI output.
 *
 * Debug: Set INKX_DEBUG_OUTPUT=1 to log diff changes and ANSI sequences.
 */

import {
  type Style,
  type TerminalBuffer,
  type UnderlineStyle,
  createMutableCell,
  hasActiveAttrs,
  styleEquals,
} from "../buffer.js"
import type { CellChange } from "./types.js"

const DEBUG_OUTPUT = !!process.env.INKX_DEBUG_OUTPUT

// ============================================================================
// Style Interning + SGR Cache
// ============================================================================

/**
 * Intern table mapping serialized style keys to pre-computed SGR strings.
 * In a typical TUI, there are only ~15-50 unique style combinations.
 * This eliminates per-cell string concatenation in styleToAnsi().
 */
const sgrCache = new Map<string, string>()

/**
 * Serialize a Style into a cache key string.
 * Fast path: most styles are simple (256-color or null fg/bg, no true color).
 */
function styleToKey(style: Style): string {
  const fg = style.fg
  const bg = style.bg
  const attrs = style.attrs

  // Fast path: common case of simple colors + few attrs
  let key = ""

  // fg
  if (fg === null) {
    key = "n"
  } else if (typeof fg === "number") {
    key = `${fg}`
  } else {
    key = `r${fg.r},${fg.g},${fg.b}`
  }

  key += "|"

  // bg
  if (bg === null) {
    key += "n"
  } else if (typeof bg === "number") {
    key += `${bg}`
  } else {
    key += `r${bg.r},${bg.g},${bg.b}`
  }

  // attrs packed as bitmask for speed
  let attrBits = 0
  if (attrs.bold) attrBits |= 1
  if (attrs.dim) attrBits |= 2
  if (attrs.italic) attrBits |= 4
  if (attrs.underline) attrBits |= 8
  if (attrs.inverse) attrBits |= 16
  if (attrs.strikethrough) attrBits |= 32
  if (attrs.blink) attrBits |= 64
  if (attrs.hidden) attrBits |= 128

  key += `|${attrBits}`

  // Underline style (rare)
  if (attrs.underlineStyle) {
    key += `|u${attrs.underlineStyle}`
  }

  // Underline color (rare)
  const ul = style.underlineColor
  if (ul !== null && ul !== undefined) {
    if (typeof ul === "number") {
      key += `|l${ul}`
    } else {
      key += `|lr${ul.r},${ul.g},${ul.b}`
    }
  }

  return key
}

/**
 * Get the SGR escape string for a style, using the intern cache.
 * Cache hit: O(1) Map lookup + key serialization.
 * Cache miss: builds the SGR string and caches it.
 */
function cachedStyleToAnsi(style: Style): string {
  const key = styleToKey(style)
  let sgr = sgrCache.get(key)
  if (sgr !== undefined) return sgr
  sgr = styleToAnsi(style)
  sgrCache.set(key, sgr)
  return sgr
}

/**
 * Map underline style to SGR 4:x subparameter.
 */
function underlineStyleToSgr(style: UnderlineStyle | undefined): number | null {
  switch (style) {
    case false:
      return 0 // SGR 4:0 = no underline
    case "single":
      return 1 // SGR 4:1 = single underline
    case "double":
      return 2 // SGR 4:2 = double underline
    case "curly":
      return 3 // SGR 4:3 = curly underline
    case "dotted":
      return 4 // SGR 4:4 = dotted underline
    case "dashed":
      return 5 // SGR 4:5 = dashed underline
    default:
      return null // Use simple SGR 4 or no underline
  }
}

/**
 * Diff two buffers and produce minimal ANSI output.
 *
 * @param prev Previous buffer (null on first render)
 * @param next Current buffer
 * @param mode Render mode: fullscreen or inline
 * @param scrollbackOffset Lines written to stdout between renders (inline mode)
 * @param termRows Terminal height in rows (inline mode) — caps output to prevent
 *   scrollback corruption when content exceeds terminal height
 * @returns ANSI escape sequence string
 */
export function outputPhase(
  prev: TerminalBuffer | null,
  next: TerminalBuffer,
  mode: "fullscreen" | "inline" = "fullscreen",
  scrollbackOffset = 0,
  termRows?: number,
): string {
  // First render: output entire buffer
  if (!prev) {
    // In inline mode, cap output to terminal height to prevent scrollback corruption.
    // Content taller than the terminal would push lines into scrollback where they
    // can never be overwritten on re-render (cursor-up is clamped at terminal row 0).
    return bufferToAnsi(next, mode, mode === "inline" ? termRows : undefined)
  }

  // Inline mode: always full re-render (no incremental diffing).
  // Inline content is typically small (< 10 lines) so the cost is minimal,
  // and it avoids complex cursor/scrollback offset tracking that's fragile
  // with external stdout.write() calls (e.g., useScrollback).
  if (mode === "inline") {
    return inlineFullRender(prev, next, scrollbackOffset, termRows)
  }

  // Fullscreen mode: diff and emit only changes
  const { pool, count } = diffBuffers(prev, next)

  if (DEBUG_OUTPUT) {
    // eslint-disable-next-line no-console
    console.error(`[INKX_DEBUG_OUTPUT] diffBuffers: ${count} changes`)
    const debugLimit = Math.min(count, 10)
    for (let i = 0; i < debugLimit; i++) {
      const change = pool[i]!
      // eslint-disable-next-line no-console
      console.error(`  (${change.x},${change.y}): "${change.cell.char}"`)
    }
    if (count > 10) {
      // eslint-disable-next-line no-console
      console.error(`  ... and ${count - 10} more`)
    }
  }

  if (count === 0) {
    return "" // No changes
  }

  return changesToAnsi(pool, count, mode)
}

/**
 * Check if a line has any non-space content.
 */
function lineHasContent(buffer: TerminalBuffer, y: number): boolean {
  for (let x = 0; x < buffer.width; x++) {
    const ch = buffer.getCellChar(x, y)
    if (ch !== " " && ch !== "") {
      return true
    }
  }
  return false
}

/**
 * Find the last line with content in the buffer.
 */
function findLastContentLine(buffer: TerminalBuffer): number {
  for (let y = buffer.height - 1; y >= 0; y--) {
    if (lineHasContent(buffer, y)) {
      return y
    }
  }
  return 0 // At least render first line
}

/**
 * Full re-render for inline mode.
 *
 * Moves cursor to the start of the render region, writes the entire
 * buffer fresh, and erases any leftover lines from the previous render.
 * This is simpler and more reliable than incremental diffing for inline
 * mode, which has external writes (useScrollback) that shift the cursor.
 *
 * When content exceeds terminal height, output is capped to termRows lines.
 * Lines beyond the terminal can't be managed (cursor-up is clamped at row 0),
 * so we truncate to prevent scrollback corruption.
 */
function inlineFullRender(
  prev: TerminalBuffer,
  next: TerminalBuffer,
  scrollbackOffset: number,
  termRows?: number,
): string {
  const rawPrevLine = findLastContentLine(prev)
  const rawNextLine = findLastContentLine(next)

  // Cap content lines to terminal height. Content beyond the terminal would
  // push lines into scrollback where they can never be overwritten.
  const prevContentLine = termRows != null ? Math.min(rawPrevLine, termRows - 1) : rawPrevLine
  const nextContentLine = termRows != null ? Math.min(rawNextLine, termRows - 1) : rawNextLine

  // How far the cursor is below the start of the render region:
  // previous content height + any lines written to stdout between renders.
  const cursorOffset = prevContentLine + scrollbackOffset

  // Quick check: if nothing changed and no scrollback displacement, skip
  if (scrollbackOffset === 0) {
    const { count } = diffBuffers(prev, next)
    if (count === 0) return ""
  }

  // Move cursor up to the start of the render region
  let prefix = ""
  if (cursorOffset > 0) {
    prefix = `\x1b[${cursorOffset}A\r`
  }

  // bufferToAnsi handles: hide cursor, render content lines with
  // \x1b[K (clear to EOL) on each line, and reset style at end.
  // Pass termRows to cap output lines.
  let output = prefix + bufferToAnsi(next, "inline", termRows)

  // Erase leftover lines if content shrank
  if (prevContentLine > nextContentLine) {
    for (let y = nextContentLine + 1; y <= prevContentLine; y++) {
      output += "\n\r\x1b[K"
    }
    // Move back up to the end of new content
    const up = prevContentLine - nextContentLine
    if (up > 0) output += `\x1b[${up}A`
  }

  // Show cursor (bufferToAnsi hides it for inline mode)
  output += "\x1b[?25h"
  return output
}

/**
 * Convert entire buffer to ANSI string.
 *
 * @param maxRows Optional cap on number of rows to output (inline mode).
 *   When content exceeds terminal height, this prevents scrollback corruption.
 */
function bufferToAnsi(
  buffer: TerminalBuffer,
  mode: "fullscreen" | "inline" = "fullscreen",
  maxRows?: number,
): string {
  let output = ""
  let currentStyle: Style | null = null

  // For inline mode, only render up to the last line with content.
  // Cap to maxRows to prevent content taller than the terminal from
  // pushing lines into scrollback (where they can't be overwritten).
  let maxLine = mode === "inline" ? findLastContentLine(buffer) : buffer.height - 1
  if (maxRows != null && maxLine >= maxRows) {
    maxLine = maxRows - 1
  }

  // Move cursor to start position based on mode
  if (mode === "fullscreen") {
    // Fullscreen: Move cursor to home position (top-left)
    output += "\x1b[H"
  } else {
    // Inline: Hide cursor, start from current position
    output += "\x1b[?25l"
  }

  // Reusable objects to avoid per-cell allocation in the inner loop
  const cell = createMutableCell()
  const cellStyle: Style = {
    fg: null,
    bg: null,
    underlineColor: null,
    attrs: {},
  }

  for (let y = 0; y <= maxLine; y++) {
    // Move to start of line
    if (y > 0 || mode === "inline") {
      output += "\r"
    }

    // Render the line content
    for (let x = 0; x < buffer.width; x++) {
      buffer.readCellInto(x, y, cell)

      // Skip continuation cells
      if (cell.continuation) continue

      // Build style from cell and check if changed.
      // readCellInto mutates cell.attrs in place, so we must snapshot attrs
      // only when the style actually changes (which is rare -- most adjacent
      // cells share the same style). This avoids per-cell object allocation.
      cellStyle.fg = cell.fg
      cellStyle.bg = cell.bg
      cellStyle.underlineColor = cell.underlineColor
      cellStyle.attrs = cell.attrs
      if (!styleEquals(currentStyle, cellStyle)) {
        // Snapshot: copy attrs so currentStyle isn't invalidated by next readCellInto
        const saved: Style = {
          fg: cell.fg,
          bg: cell.bg,
          underlineColor: cell.underlineColor,
          attrs: { ...cell.attrs },
        }
        output += cachedStyleToAnsi(saved)
        currentStyle = saved
      }

      output += cell.char
    }

    // Clear to end of line (removes any leftover content)
    output += "\x1b[K"

    // Move to next line (except for last line)
    if (y < maxLine) {
      // Reset style before newline to prevent background color bleeding
      if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
        output += "\x1b[0m"
        currentStyle = null
      }
      output += "\n"
    }
  }

  // Reset style at end
  output += "\x1b[0m"

  return output
}

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
  cell.wide = false
  cell.continuation = false
}

/**
 * Diff result: pool reference + count (avoids per-frame array allocation).
 */
interface DiffResult {
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
function diffBuffers(prev: TerminalBuffer, next: TerminalBuffer): DiffResult {
  // Ensure pool is large enough for worst case (all cells changed)
  const maxChanges = Math.max(prev.width, next.width) * Math.max(prev.height, next.height)
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

    // Fast row-level pre-check: if all packed metadata AND all chars match,
    // skip per-cell comparison entirely. This catches rows marked dirty by
    // fill() or scrollRegion() that didn't actually change content.
    if (next.rowMetadataEquals(y, prev) && next.rowCharsEquals(y, prev)) continue

    for (let x = 0; x < width; x++) {
      // Use buffer's optimized cellEquals which compares packed metadata first
      if (!next.cellEquals(x, y, prev)) {
        writeCellChange(diffPool[changeCount]!, x, y, next)
        changeCount++
      }
    }
  }

  // Handle size growth: add all cells in new areas
  if (next.width > prev.width) {
    for (let y = 0; y < next.height; y++) {
      for (let x = prev.width; x < next.width; x++) {
        writeCellChange(diffPool[changeCount]!, x, y, next)
        changeCount++
      }
    }
  }
  if (next.height > prev.height) {
    for (let y = prev.height; y < next.height; y++) {
      for (let x = 0; x < next.width; x++) {
        writeCellChange(diffPool[changeCount]!, x, y, next)
        changeCount++
      }
    }
  }

  // Handle size shrink: clear cells in old-but-not-new areas
  if (prev.width > next.width) {
    for (let y = 0; y < height; y++) {
      for (let x = next.width; x < prev.width; x++) {
        writeEmptyCellChange(diffPool[changeCount]!, x, y)
        changeCount++
      }
    }
  }
  if (prev.height > next.height) {
    for (let y = next.height; y < prev.height; y++) {
      for (let x = 0; x < prev.width; x++) {
        writeEmptyCellChange(diffPool[changeCount]!, x, y)
        changeCount++
      }
    }
  }

  diffResult.pool = diffPool
  diffResult.count = changeCount
  return diffResult
}

/** Pre-allocated style object reused across changesToAnsi calls. */
const reusableCellStyle: Style = {
  fg: null,
  bg: null,
  underlineColor: null,
  attrs: {},
}

/**
 * Sort a sub-range of the pool by position for optimal cursor movement.
 * Uses a simple in-place sort on pool[0..count).
 */
function sortPoolByPosition(pool: CellChange[], count: number): void {
  // Insertion sort is efficient for the typical case (mostly sorted or small count)
  for (let i = 1; i < count; i++) {
    const item = pool[i]!
    const iy = item.y
    const ix = item.x
    let j = i - 1
    while (j >= 0 && (pool[j]!.y > iy || (pool[j]!.y === iy && pool[j]!.x > ix))) {
      pool[j + 1] = pool[j]!
      j--
    }
    pool[j + 1] = item
  }
}

/**
 * Convert cell changes to optimized ANSI output.
 *
 * @param pool Pre-allocated pool of CellChange objects
 * @param count Number of valid entries in the pool
 * @param mode Render mode (only fullscreen uses incremental diff)
 */
function changesToAnsi(pool: CellChange[], count: number, mode: "fullscreen" | "inline" = "fullscreen"): string {
  if (count === 0) return ""

  // Sort by position for optimal cursor movement (in-place, no allocation)
  sortPoolByPosition(pool, count)

  let output = ""
  let currentStyle: Style | null = null

  // Fullscreen mode: use absolute positioning
  {
    let cursorX = -1
    let cursorY = -1

    for (let i = 0; i < count; i++) {
      const change = pool[i]!
      const x = change.x
      const y = change.y
      const cell = change.cell

      // Skip continuation cells
      if (cell.continuation) continue

      // Move cursor if needed (cursor must be exactly at target position)
      if (y !== cursorY || x !== cursorX) {
        // Use \r\n optimization only if cursor is initialized AND we're moving
        // to the next line at column 0. Don't use it when cursorY is -1
        // (uninitialized) because that would incorrectly emit a newline at start.
        // Bug km-x7ih: This was causing the first row to appear at the bottom.
        if (cursorY >= 0 && y === cursorY + 1 && x === 0) {
          // Next line at column 0, use newline (more efficient)
          // Reset style before newline to prevent background color bleeding
          if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
            output += "\x1b[0m"
            currentStyle = null
          }
          output += "\r\n"
        } else if (cursorY >= 0 && y === cursorY && x > cursorX) {
          // Same row, forward: use CUF (Cursor Forward) for small jumps
          const dx = x - cursorX
          output += dx === 1 ? "\x1b[C" : `\x1b[${dx}C`
        } else if (cursorY >= 0 && y > cursorY && x === 0) {
          // Same column (0), down N rows: use \r + CUD
          const dy = y - cursorY
          if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
            output += "\x1b[0m"
            currentStyle = null
          }
          output += dy === 1 ? "\r\n" : `\r\x1b[${dy}B`
        } else {
          // Absolute position (1-indexed)
          output += `\x1b[${y + 1};${x + 1}H`
        }
      }

      // Update style if changed (reuse pre-allocated style object)
      reusableCellStyle.fg = cell.fg
      reusableCellStyle.bg = cell.bg
      reusableCellStyle.underlineColor = cell.underlineColor
      reusableCellStyle.attrs = cell.attrs
      if (!styleEquals(currentStyle, reusableCellStyle)) {
        // Snapshot: copy attrs so currentStyle isn't invalidated by next iteration
        currentStyle = {
          fg: cell.fg,
          bg: cell.bg,
          underlineColor: cell.underlineColor,
          attrs: { ...cell.attrs },
        }
        output += cachedStyleToAnsi(currentStyle)
      }

      // Write character
      output += cell.char
      cursorX = x + (cell.wide ? 2 : 1)
      cursorY = y
    }
  }

  // Reset style at end
  if (currentStyle) {
    output += "\x1b[0m"
  }

  return output
}

/**
 * Convert style to ANSI escape sequence.
 *
 * Optimized: builds the escape string via concatenation instead of
 * allocating intermediate arrays. This avoids per-call array allocations
 * for the codes[], colorToAnsiFg(), and colorToAnsiBg() arrays.
 *
 * Emits SGR codes including:
 * - Basic colors (30-37, 40-47)
 * - 256-color (38;5;N, 48;5;N)
 * - True color (38;2;r;g;b, 48;2;r;g;b)
 * - Underline styles (4:x where x = 0-5)
 * - Underline color (58;5;N or 58;2;r;g;b)
 * - Inverse uses SGR 7 so terminals swap fg/bg correctly (including default colors)
 */
function styleToAnsi(style: Style): string {
  const fg = style.fg
  const bg = style.bg

  // Build escape string via concatenation (no array allocation)
  let result = "\x1b[0" // Reset first

  // Foreground color
  if (fg !== null) {
    if (typeof fg === "number") {
      result += `;38;5;${fg}`
    } else {
      result += `;38;2;${fg.r};${fg.g};${fg.b}`
    }
  }

  // Background color
  if (bg !== null) {
    if (typeof bg === "number") {
      result += `;48;5;${bg}`
    } else {
      result += `;48;2;${bg.r};${bg.g};${bg.b}`
    }
  }

  // Attributes
  if (style.attrs.bold) result += ";1"
  if (style.attrs.dim) result += ";2"
  if (style.attrs.italic) result += ";3"

  // Underline: use SGR 4:x if style specified, otherwise simple SGR 4
  const underlineStyle = style.attrs.underlineStyle
  const sgrSubparam = underlineStyleToSgr(underlineStyle)
  if (sgrSubparam !== null && sgrSubparam !== 0) {
    result += `;4:${sgrSubparam}`
  } else if (style.attrs.underline) {
    result += ";4"
  }

  // Use SGR 7 for inverse — lets the terminal correctly swap fg/bg
  // (including default terminal colors that have no explicit ANSI code)
  if (style.attrs.inverse) result += ";7"
  if (style.attrs.strikethrough) result += ";9"

  // Append underline color if specified (SGR 58)
  if (style.underlineColor !== null && style.underlineColor !== undefined) {
    if (typeof style.underlineColor === "number") {
      result += `;58;5;${style.underlineColor}`
    } else {
      result += `;58;2;${style.underlineColor.r};${style.underlineColor.g};${style.underlineColor.b}`
    }
  }

  result += "m"
  return result
}
