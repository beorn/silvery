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
  colorEquals,
  createMutableCell,
  hasActiveAttrs,
  styleEquals,
} from "../buffer.js"
import { isPrivateUseArea, textSized } from "../text-sizing.js"
import { isTextSizingEnabled } from "../unicode.js"
import type { CellChange } from "./types.js"

const DEBUG_OUTPUT = !!process.env.INKX_DEBUG_OUTPUT

/**
 * Wrap a cell character in OSC 66 if it is a PUA character and text sizing
 * is enabled. For wide PUA characters, this tells the terminal to render
 * the character in exactly 2 cells, matching the layout engine's measurement.
 */
function wrapTextSizing(char: string, wide: boolean): string {
  if (!wide || !isTextSizingEnabled()) return char
  const cp = char.codePointAt(0)
  if (cp !== undefined && isPrivateUseArea(cp)) {
    return textSized(char, 2)
  }
  return char
}

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
 * Transition cache mapping "oldKey→newKey" to the minimal SGR diff string.
 * Avoids recomputing attribute diffs for repeated style transitions.
 * With ~15-50 unique styles, there are at most ~2500 possible transitions.
 */
const transitionCache = new Map<string, string>()

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

  // Hyperlink URL (rare)
  if (style.hyperlink) {
    key += `|h${style.hyperlink}`
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
 * Compute the minimal SGR transition between two styles.
 *
 * When oldStyle is null (first cell or after reset), falls through to
 * full SGR generation via cachedStyleToAnsi. Otherwise, diffs attribute
 * by attribute and emits only changed SGR codes. Caches the result for
 * each (oldKey, newKey) pair.
 */
function styleTransition(oldStyle: Style | null, newStyle: Style): string {
  // First cell or after reset — full generation
  if (!oldStyle) return cachedStyleToAnsi(newStyle)

  // Same style — nothing to emit
  if (styleEquals(oldStyle, newStyle)) return ""

  // Check transition cache
  const oldKey = styleToKey(oldStyle)
  const newKey = styleToKey(newStyle)
  const cacheKey = `${oldKey}\x00${newKey}`
  const cached = transitionCache.get(cacheKey)
  if (cached !== undefined) return cached

  // Build minimal diff
  const codes: string[] = []

  // Check attributes that can only be "turned off" via reset or specific off-codes.
  // If an attribute was on and is now off, we need either the off-code or a full reset.
  const oa = oldStyle.attrs
  const na = newStyle.attrs

  // Bold and dim share SGR 22 as their off-code, so handle them together
  // to avoid emitting duplicate codes.
  const boldChanged = Boolean(oa.bold) !== Boolean(na.bold)
  const dimChanged = Boolean(oa.dim) !== Boolean(na.dim)
  if (boldChanged || dimChanged) {
    const boldOff = boldChanged && !na.bold
    const dimOff = dimChanged && !na.dim
    if (boldOff || dimOff) {
      // SGR 22 resets both bold and dim
      codes.push("22")
      // Re-enable whichever should stay on
      if (na.bold) codes.push("1")
      if (na.dim) codes.push("2")
    } else {
      // Only turning attributes on
      if (boldChanged && na.bold) codes.push("1")
      if (dimChanged && na.dim) codes.push("2")
    }
  }
  if (Boolean(oa.italic) !== Boolean(na.italic)) {
    codes.push(na.italic ? "3" : "23")
  }

  // Underline: compare both underline flag and underlineStyle
  const oldUl = Boolean(oa.underline)
  const newUl = Boolean(na.underline)
  const oldUlStyle = oa.underlineStyle ?? false
  const newUlStyle = na.underlineStyle ?? false
  if (oldUl !== newUl || oldUlStyle !== newUlStyle) {
    const sgrSub = underlineStyleToSgr(na.underlineStyle)
    if (sgrSub !== null && sgrSub !== 0) {
      codes.push(`4:${sgrSub}`)
    } else if (newUl) {
      codes.push("4")
    } else {
      codes.push("24")
    }
  }

  if (Boolean(oa.inverse) !== Boolean(na.inverse)) {
    codes.push(na.inverse ? "7" : "27")
  }
  if (Boolean(oa.hidden) !== Boolean(na.hidden)) {
    codes.push(na.hidden ? "8" : "28")
  }
  if (Boolean(oa.strikethrough) !== Boolean(na.strikethrough)) {
    codes.push(na.strikethrough ? "9" : "29")
  }
  if (Boolean(oa.blink) !== Boolean(na.blink)) {
    codes.push(na.blink ? "5" : "25")
  }

  // Foreground color
  if (!colorEquals(oldStyle.fg, newStyle.fg)) {
    if (newStyle.fg === null) {
      codes.push("39")
    } else if (typeof newStyle.fg === "number") {
      codes.push(`38;5;${newStyle.fg}`)
    } else {
      codes.push(`38;2;${newStyle.fg.r};${newStyle.fg.g};${newStyle.fg.b}`)
    }
  }

  // Background color
  if (!colorEquals(oldStyle.bg, newStyle.bg)) {
    if (newStyle.bg === null) {
      codes.push("49")
    } else if (typeof newStyle.bg === "number") {
      codes.push(`48;5;${newStyle.bg}`)
    } else {
      codes.push(`48;2;${newStyle.bg.r};${newStyle.bg.g};${newStyle.bg.b}`)
    }
  }

  // Underline color
  if (!colorEquals(oldStyle.underlineColor, newStyle.underlineColor)) {
    if (newStyle.underlineColor === null || newStyle.underlineColor === undefined) {
      // SGR 59 resets underline color
      codes.push("59")
    } else if (typeof newStyle.underlineColor === "number") {
      codes.push(`58;5;${newStyle.underlineColor}`)
    } else {
      codes.push(`58;2;${newStyle.underlineColor.r};${newStyle.underlineColor.g};${newStyle.underlineColor.b}`)
    }
  }

  // Hyperlink (OSC 8) is handled separately in the render loops, not here.

  let result: string
  if (codes.length === 0) {
    // Styles differ but no SGR codes emitted (e.g., hyperlink-only change).
    // Fall back to full generation to be safe.
    result = cachedStyleToAnsi(newStyle)
  } else {
    result = `\x1b[${codes.join(";")}m`
  }

  transitionCache.set(cacheKey, result)
  return result
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

  // Wide characters are handled atomically in changesToAnsi():
  // - Wide char main cells emit the character and advance cursor by 2
  // - Continuation cells are skipped (handled with their main cell)
  // - Orphaned continuation cells (main cell unchanged) trigger a
  //   re-emit of the main cell from the buffer
  return changesToAnsi(pool, count, mode, next)
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
function bufferToAnsi(buffer: TerminalBuffer, mode: "fullscreen" | "inline" = "fullscreen", maxRows?: number): string {
  let output = ""
  let currentStyle: Style | null = null
  let currentHyperlink: string | undefined

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

      // Handle OSC 8 hyperlink transitions (separate from SGR style)
      const cellHyperlink = cell.hyperlink
      if (cellHyperlink !== currentHyperlink) {
        if (currentHyperlink) {
          output += "\x1b]8;;\x1b\\" // Close previous hyperlink
        }
        if (cellHyperlink) {
          output += `\x1b]8;;${cellHyperlink}\x1b\\` // Open new hyperlink
        }
        currentHyperlink = cellHyperlink
      }

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
        output += styleTransition(currentStyle, saved)
        currentStyle = saved
      }

      output += wrapTextSizing(cell.char, cell.wide)
    }

    // Close any open hyperlink at end of row
    if (currentHyperlink) {
      output += "\x1b]8;;\x1b\\"
      currentHyperlink = undefined
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

  // Close any open hyperlink at end
  if (currentHyperlink) {
    output += "\x1b]8;;\x1b\\"
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
 * Pre-allocated cell for looking up wide char main cells from the buffer
 * when an orphaned continuation cell is encountered in changesToAnsi.
 */
const wideCharLookupCell = createMutableCell()

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
 * Wide characters are handled atomically: the main cell (wide:true) and its
 * continuation cell are treated as a single unit. When the main cell is in
 * the pool, it's emitted and the cursor advances by 2. When only the
 * continuation cell changed (e.g., bg color), the main cell is read from
 * the buffer and emitted to cover both columns.
 *
 * @param pool Pre-allocated pool of CellChange objects
 * @param count Number of valid entries in the pool
 * @param mode Render mode (only fullscreen uses incremental diff)
 * @param buffer The current buffer, used to look up main cells for orphaned
 *   continuation cells (optional for backward compatibility)
 */
function changesToAnsi(
  pool: CellChange[],
  count: number,
  _mode: "fullscreen" | "inline" = "fullscreen",
  buffer?: TerminalBuffer,
): string {
  if (count === 0) return ""

  // Sort by position for optimal cursor movement (in-place, no allocation)
  sortPoolByPosition(pool, count)

  let output = ""
  let currentStyle: Style | null = null
  let currentHyperlink: string | undefined

  // Fullscreen mode: use absolute positioning
  {
    let cursorX = -1
    let cursorY = -1
    let prevY = -1
    // Track the last emitted cell position to detect when a continuation
    // cell's main cell was already emitted in this pass.
    let lastEmittedX = -1
    let lastEmittedY = -1

    for (let i = 0; i < count; i++) {
      const change = pool[i]!
      let x = change.x
      const y = change.y
      let cell = change.cell

      // Handle continuation cells: these are the second column of a wide
      // character. If their main cell (x-1) was already emitted in this
      // pass, skip. Otherwise, look up and emit the main cell from the
      // buffer so the wide char covers both columns.
      if (cell.continuation) {
        // Main cell was already emitted — skip
        if (lastEmittedX === x - 1 && lastEmittedY === y) continue

        // Orphaned continuation cell: main cell didn't change but this
        // cell's style did. Read the main cell from the buffer and emit it.
        if (buffer && x > 0) {
          x = x - 1
          buffer.readCellInto(x, y, wideCharLookupCell)
          cell = wideCharLookupCell
          // If the looked-up cell is itself a continuation (shouldn't happen
          // with valid buffers) or not wide, fall back to skipping
          if (cell.continuation || !cell.wide) continue
        } else {
          continue
        }
      }

      // Close hyperlink on row change (hyperlinks must not span across rows)
      if (y !== prevY && currentHyperlink) {
        output += "\x1b]8;;\x1b\\"
        currentHyperlink = undefined
      }
      prevY = y

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

      // Handle OSC 8 hyperlink transitions (separate from SGR style)
      const cellHyperlink = cell.hyperlink
      if (cellHyperlink !== currentHyperlink) {
        if (currentHyperlink) {
          output += "\x1b]8;;\x1b\\" // Close previous hyperlink
        }
        if (cellHyperlink) {
          output += `\x1b]8;;${cellHyperlink}\x1b\\` // Open new hyperlink
        }
        currentHyperlink = cellHyperlink
      }

      // Update style if changed (reuse pre-allocated style object)
      reusableCellStyle.fg = cell.fg
      reusableCellStyle.bg = cell.bg
      reusableCellStyle.underlineColor = cell.underlineColor
      reusableCellStyle.attrs = cell.attrs
      if (!styleEquals(currentStyle, reusableCellStyle)) {
        // Snapshot: copy attrs so currentStyle isn't invalidated by next iteration
        const prevStyle = currentStyle
        currentStyle = {
          fg: cell.fg,
          bg: cell.bg,
          underlineColor: cell.underlineColor,
          attrs: { ...cell.attrs },
        }
        output += styleTransition(prevStyle, currentStyle)
      }

      // Write character (wrap PUA in OSC 66 when text sizing is enabled)
      output += wrapTextSizing(cell.char, cell.wide)
      cursorX = x + (cell.wide ? 2 : 1)
      cursorY = y
      lastEmittedX = x
      lastEmittedY = y
    }
  }

  // Close any open hyperlink
  if (currentHyperlink) {
    output += "\x1b]8;;\x1b\\"
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
