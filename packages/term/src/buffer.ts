/**
 * Terminal buffer implementation for Silvery.
 *
 * Uses packed Uint32Array for efficient cell metadata storage,
 * with separate string array for character storage (needed for
 * multi-byte Unicode graphemes and combining characters).
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Underline style variants (SGR 4:x codes).
 * - false: no underline
 * - 'single': standard underline (SGR 4 or 4:1)
 * - 'double': double underline (SGR 4:2)
 * - 'curly': curly/wavy underline (SGR 4:3)
 * - 'dotted': dotted underline (SGR 4:4)
 * - 'dashed': dashed underline (SGR 4:5)
 */
export type UnderlineStyle = false | "single" | "double" | "curly" | "dotted" | "dashed"

/**
 * Text attributes that can be applied to a cell.
 */
export interface CellAttrs {
  bold?: boolean
  dim?: boolean
  italic?: boolean
  /** Simple underline flag (for backwards compatibility) */
  underline?: boolean
  /**
   * Underline style: 'single' | 'double' | 'curly' | 'dotted' | 'dashed'.
   * When set, takes precedence over the underline boolean.
   */
  underlineStyle?: UnderlineStyle
  blink?: boolean
  inverse?: boolean
  hidden?: boolean
  strikethrough?: boolean
}

/**
 * Color representation.
 * - number: 256-color index (0-255)
 * - RGB object: true color
 * - null: default/inherit
 * - DEFAULT_BG: terminal's default background (SGR 49), opaque but uses terminal's own bg color
 */
export type Color = number | { r: number; g: number; b: number } | null

/**
 * Sentinel color representing the terminal's default background (SGR 49).
 * Unlike `null` (transparent/inherit), this actively fills cells with the
 * terminal's configured background, making the element opaque.
 */
export const DEFAULT_BG: Color = Object.freeze({ r: -1, g: -1, b: -1 })

/** Check if a color is the default bg sentinel. */
export function isDefaultBg(color: Color): boolean {
  return color !== null && typeof color === "object" && color.r === -1
}

/**
 * A single cell in the terminal buffer.
 */
export interface Cell {
  /** The character/grapheme in this cell */
  char: string
  /** Foreground color */
  fg: Color
  /** Background color */
  bg: Color
  /**
   * Underline color (independent of fg).
   * Uses SGR 58. If null, underline uses fg color.
   */
  underlineColor: Color
  /** Text attributes */
  attrs: CellAttrs
  /** True if this is a wide character (CJK, emoji, etc.) */
  wide: boolean
  /** True if this is the continuation cell after a wide character */
  continuation: boolean
  /**
   * OSC 8 hyperlink URL.
   * When set, the cell is part of a clickable hyperlink in supporting terminals.
   */
  hyperlink?: string
}

/**
 * Style information for a cell (excludes char and position flags).
 */
export interface Style {
  fg: Color
  bg: Color
  /**
   * Underline color (independent of fg).
   * Uses SGR 58. If null, underline uses fg color.
   */
  underlineColor?: Color
  attrs: CellAttrs
  /**
   * OSC 8 hyperlink URL.
   * When set, the cell is part of a clickable hyperlink in supporting terminals.
   */
  hyperlink?: string
}

// ============================================================================
// Constants
// ============================================================================

// Bit packing layout for cell metadata in Uint32Array:
// [0-7]:   foreground color index (8 bits)
// [8-15]:  background color index (8 bits)
// [16-23]: attributes (8 bits): bold, dim, italic, blink, inverse, hidden, strikethrough + 1 spare
// [24-26]: underline style (3 bits): 0=none, 1=single, 2=double, 3=curly, 4=dotted, 5=dashed
// [27-31]: flags (5 bits): wide, continuation, true_color_fg, true_color_bg + 1 spare

// Attribute bit positions (within bits 16-23)
const ATTR_BOLD = 1 << 16
const ATTR_DIM = 1 << 17
const ATTR_ITALIC = 1 << 18
const ATTR_BLINK = 1 << 19
const ATTR_INVERSE = 1 << 20
const ATTR_HIDDEN = 1 << 21
const ATTR_STRIKETHROUGH = 1 << 22
// bit 23 spare

// Underline style (3 bits in positions 24-26)
// 0 = no underline, 1 = single, 2 = double, 3 = curly, 4 = dotted, 5 = dashed
const UNDERLINE_STYLE_SHIFT = 24
const UNDERLINE_STYLE_MASK = 0x7 << UNDERLINE_STYLE_SHIFT // 3 bits

// Flag bit positions (in bits 27-31)
const WIDE_FLAG = 1 << 27
const CONTINUATION_FLAG = 1 << 28
const TRUE_COLOR_FG_FLAG = 1 << 29
const TRUE_COLOR_BG_FLAG = 1 << 30
// bit 31 spare

// Default empty cell
const EMPTY_CELL: Cell = {
  char: " ",
  fg: null,
  bg: null,
  underlineColor: null,
  attrs: {},
  wide: false,
  continuation: false,
  hyperlink: undefined,
}

/** Frozen empty attrs object, shared across zero-allocation reads for OOB cells */
const EMPTY_ATTRS: CellAttrs = Object.freeze({})

// ============================================================================
// Packing/Unpacking Helpers
// ============================================================================

/**
 * Map UnderlineStyle to numeric value for bit packing.
 */
function underlineStyleToNumber(style: UnderlineStyle | undefined): number {
  switch (style) {
    case false:
      return 0
    case "single":
      return 1
    case "double":
      return 2
    case "curly":
      return 3
    case "dotted":
      return 4
    case "dashed":
      return 5
    default:
      return 0 // undefined or unknown = no underline
  }
}

/**
 * Map numeric value back to UnderlineStyle.
 */
function numberToUnderlineStyle(n: number): UnderlineStyle | undefined {
  switch (n) {
    case 0:
      return undefined // No underline
    case 1:
      return "single"
    case 2:
      return "double"
    case 3:
      return "curly"
    case 4:
      return "dotted"
    case 5:
      return "dashed"
    default:
      return undefined
  }
}

/**
 * Convert CellAttrs to bits for packing (used internally by packCell).
 * Note: This packs into the full 32-bit word, not just the attrs byte.
 */
export function attrsToNumber(attrs: CellAttrs): number {
  let n = 0
  if (attrs.bold) n |= ATTR_BOLD
  if (attrs.dim) n |= ATTR_DIM
  if (attrs.italic) n |= ATTR_ITALIC
  if (attrs.blink) n |= ATTR_BLINK
  if (attrs.inverse) n |= ATTR_INVERSE
  if (attrs.hidden) n |= ATTR_HIDDEN
  if (attrs.strikethrough) n |= ATTR_STRIKETHROUGH

  // Pack underline style (3 bits)
  // If underlineStyle is set, use it. Otherwise, check underline boolean.
  const ulStyle = attrs.underlineStyle ?? (attrs.underline ? "single" : undefined)
  n |= underlineStyleToNumber(ulStyle) << UNDERLINE_STYLE_SHIFT

  return n
}

/**
 * Convert a number back to CellAttrs.
 */
export function numberToAttrs(n: number): CellAttrs {
  const attrs: CellAttrs = {}
  if (n & ATTR_BOLD) attrs.bold = true
  if (n & ATTR_DIM) attrs.dim = true
  if (n & ATTR_ITALIC) attrs.italic = true
  if (n & ATTR_BLINK) attrs.blink = true
  if (n & ATTR_INVERSE) attrs.inverse = true
  if (n & ATTR_HIDDEN) attrs.hidden = true
  if (n & ATTR_STRIKETHROUGH) attrs.strikethrough = true

  // Unpack underline style
  const ulStyleNum = (n & UNDERLINE_STYLE_MASK) >> UNDERLINE_STYLE_SHIFT
  const ulStyle = numberToUnderlineStyle(ulStyleNum)
  if (ulStyle) {
    attrs.underlineStyle = ulStyle
    attrs.underline = true
  }

  return attrs
}

/**
 * Convert a color to an index value for packing.
 * Returns 0 for null (default), or (index + 1) for 256-color.
 * This +1 offset allows distinguishing null from black (color index 0).
 * True color is handled separately via flags and auxiliary storage.
 */
function colorToIndex(color: Color): number {
  if (color === null) return 0
  if (typeof color === "number") return (color & 0xff) + 1 // +1 to distinguish from null
  // True color - return 0, handle via flag
  return 0
}

/**
 * Check if a color is true color (RGB).
 */
function isTrueColor(color: Color): color is { r: number; g: number; b: number } {
  return color !== null && typeof color === "object"
}

/**
 * Pack cell metadata into a 32-bit number.
 */
export function packCell(cell: Cell): number {
  let packed = 0

  // Foreground color index (bits 0-7)
  packed |= colorToIndex(cell.fg) & 0xff

  // Background color index (bits 8-15)
  packed |= (colorToIndex(cell.bg) & 0xff) << 8

  // Attributes (bits 16-22) and underline style (bits 24-26)
  // attrsToNumber returns bits already in their final positions
  packed |= attrsToNumber(cell.attrs)

  // Flags (bits 27-30)
  if (cell.wide) packed |= WIDE_FLAG
  if (cell.continuation) packed |= CONTINUATION_FLAG
  if (isTrueColor(cell.fg)) packed |= TRUE_COLOR_FG_FLAG
  if (isTrueColor(cell.bg)) packed |= TRUE_COLOR_BG_FLAG

  return packed
}

/**
 * Unpack foreground color index from packed value.
 */
function unpackFgIndex(packed: number): number {
  return packed & 0xff
}

/**
 * Unpack background color index from packed value.
 */
function unpackBgIndex(packed: number): number {
  return (packed >> 8) & 0xff
}

/**
 * Unpack attributes from packed value.
 * Extracts both the boolean attrs (bits 16-22) and underline style (bits 24-26).
 */
function unpackAttrs(packed: number): CellAttrs {
  // numberToAttrs expects the full packed value with attrs in bits 16-22
  // and underline style in bits 24-26
  return numberToAttrs(packed)
}

/**
 * Check if wide flag is set.
 */
function unpackWide(packed: number): boolean {
  return (packed & WIDE_FLAG) !== 0
}

/**
 * Check if continuation flag is set.
 */
function unpackContinuation(packed: number): boolean {
  return (packed & CONTINUATION_FLAG) !== 0
}

/**
 * Check if true color foreground flag is set.
 */
function unpackTrueColorFg(packed: number): boolean {
  return (packed & TRUE_COLOR_FG_FLAG) !== 0
}

/**
 * Check if true color background flag is set.
 */
function unpackTrueColorBg(packed: number): boolean {
  return (packed & TRUE_COLOR_BG_FLAG) !== 0
}

// ============================================================================
// TerminalBuffer Class
// ============================================================================

/**
 * Efficient terminal cell buffer.
 *
 * Uses packed Uint32Array for cell metadata and separate string array
 * for characters. This allows efficient diffing while supporting
 * full Unicode grapheme clusters.
 */
export class TerminalBuffer {
  /** Packed cell metadata */
  private cells: Uint32Array
  /** Character storage (one per cell, may be multi-byte grapheme) */
  private chars: string[]
  /** True color foreground storage (only for cells with true color fg) */
  private fgColors: Map<number, { r: number; g: number; b: number }>
  /** True color background storage (only for cells with true color bg) */
  private bgColors: Map<number, { r: number; g: number; b: number }>
  /** Underline color storage (independent of fg, for SGR 58) */
  private underlineColors: Map<number, Color>
  /** OSC 8 hyperlink URL storage (only for cells that are part of a hyperlink) */
  private hyperlinks: Map<number, string>
  /**
   * Per-row dirty tracking for diff optimization.
   * When set, diffBuffers() can skip clean rows entirely.
   * 0 = clean (unchanged since last resetDirtyRows), 1 = dirty (modified).
   */
  private _dirtyRows: Uint8Array
  /** Bounding box: first dirty row (inclusive). -1 when no rows are dirty. */
  private _minDirtyRow: number
  /** Bounding box: last dirty row (inclusive). -1 when no rows are dirty. */
  private _maxDirtyRow: number

  readonly width: number
  readonly height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    const size = width * height
    this.cells = new Uint32Array(size)
    this.chars = new Array<string>(size).fill(" ")
    this.fgColors = new Map()
    this.bgColors = new Map()
    this.underlineColors = new Map()
    this.hyperlinks = new Map()
    // All rows start dirty (fresh buffer needs full diff on first comparison)
    this._dirtyRows = new Uint8Array(height).fill(1)
    this._minDirtyRow = 0
    this._maxDirtyRow = height - 1
  }

  /**
   * Get the index for a cell position.
   */
  private index(x: number, y: number): number {
    return y * this.width + x
  }

  /**
   * Check if coordinates are within bounds.
   */
  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height
  }

  /**
   * Get a cell at the given position.
   */
  getCell(x: number, y: number): Cell {
    if (!this.inBounds(x, y)) {
      return { ...EMPTY_CELL }
    }

    const idx = this.index(x, y)
    const packed = this.cells[idx]
    const char = this.chars[idx]

    // Determine foreground color
    // Color indices are stored with +1 offset (0=null, 1=black, 2=red, etc.)
    let fg: Color = null
    if (unpackTrueColorFg(packed!)) {
      fg = this.fgColors.get(idx) ?? null
    } else {
      const fgIndex = unpackFgIndex(packed!)
      fg = fgIndex > 0 ? fgIndex - 1 : null // -1 to restore actual color index
    }

    // Determine background color
    let bg: Color = null
    if (unpackTrueColorBg(packed!)) {
      bg = this.bgColors.get(idx) ?? null
    } else {
      const bgIndex = unpackBgIndex(packed!)
      bg = bgIndex > 0 ? bgIndex - 1 : null // -1 to restore actual color index
    }

    const hyperlink = this.hyperlinks.get(idx)
    return {
      char: char!,
      fg,
      bg,
      underlineColor: this.underlineColors.get(idx) ?? null,
      attrs: unpackAttrs(packed!),
      wide: unpackWide(packed!),
      continuation: unpackContinuation(packed!),
      ...(hyperlink !== undefined ? { hyperlink } : {}),
    }
  }

  // --------------------------------------------------------------------------
  // Zero-allocation cell accessors for hot paths
  // --------------------------------------------------------------------------

  /**
   * Get just the character at a cell position (no object allocation).
   * Returns " " for out-of-bounds positions.
   */
  getCellChar(x: number, y: number): string {
    if (!this.inBounds(x, y)) return " "
    return this.chars[this.index(x, y)]!
  }

  /**
   * Get just the background color at a cell position (no object allocation).
   * Returns null for out-of-bounds positions.
   */
  getCellBg(x: number, y: number): Color {
    if (!this.inBounds(x, y)) return null
    const idx = this.index(x, y)
    const packed = this.cells[idx]!
    if (unpackTrueColorBg(packed)) {
      return this.bgColors.get(idx) ?? null
    }
    const bgIndex = unpackBgIndex(packed)
    return bgIndex > 0 ? bgIndex - 1 : null
  }

  /**
   * Get just the foreground color at a cell position (no object allocation).
   * Returns null for out-of-bounds positions.
   */
  getCellFg(x: number, y: number): Color {
    if (!this.inBounds(x, y)) return null
    const idx = this.index(x, y)
    const packed = this.cells[idx]!
    if (unpackTrueColorFg(packed)) {
      return this.fgColors.get(idx) ?? null
    }
    const fgIndex = unpackFgIndex(packed)
    return fgIndex > 0 ? fgIndex - 1 : null
  }

  /**
   * Get the raw packed metadata at a cell position (no unpackAttrs allocation).
   * Returns 0 for out-of-bounds positions. The packed value contains color
   * indices, attr bits, underline style, and flags in a single Uint32.
   */
  getCellAttrs(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0
    return this.cells[this.index(x, y)]!
  }

  /**
   * Check if a cell is a wide character (no object allocation).
   * Returns false for out-of-bounds positions.
   */
  isCellWide(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false
    return unpackWide(this.cells[this.index(x, y)]!)
  }

  /**
   * Check if a cell is a continuation of a wide character (no object allocation).
   * Returns false for out-of-bounds positions.
   */
  isCellContinuation(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false
    return unpackContinuation(this.cells[this.index(x, y)]!)
  }

  /**
   * Read cell data into a caller-provided Cell object (zero-allocation).
   * For hot loops that need the full Cell, reuse a single object:
   *
   *   const cell = createMutableCell()
   *   for (...) { buffer.readCellInto(x, y, cell) }
   *
   * Returns the same `out` object for chaining convenience.
   */
  readCellInto(x: number, y: number, out: Cell): Cell {
    if (!this.inBounds(x, y)) {
      out.char = " "
      out.fg = null
      out.bg = null
      out.underlineColor = null
      out.attrs = EMPTY_ATTRS
      out.wide = false
      out.continuation = false
      out.hyperlink = undefined
      return out
    }

    const idx = this.index(x, y)
    const packed = this.cells[idx]!

    out.char = this.chars[idx]!

    // Foreground color
    if (unpackTrueColorFg(packed)) {
      out.fg = this.fgColors.get(idx) ?? null
    } else {
      const fgIndex = unpackFgIndex(packed)
      out.fg = fgIndex > 0 ? fgIndex - 1 : null
    }

    // Background color
    if (unpackTrueColorBg(packed)) {
      out.bg = this.bgColors.get(idx) ?? null
    } else {
      const bgIndex = unpackBgIndex(packed)
      out.bg = bgIndex > 0 ? bgIndex - 1 : null
    }

    out.underlineColor = this.underlineColors.get(idx) ?? null

    // Unpack attrs inline to avoid allocating a new CellAttrs object.
    // We reuse the existing out.attrs object when possible.
    const attrs = out.attrs === EMPTY_ATTRS ? ((out.attrs = {}), out.attrs) : out.attrs
    attrs.bold = (packed & ATTR_BOLD) !== 0 ? true : undefined
    attrs.dim = (packed & ATTR_DIM) !== 0 ? true : undefined
    attrs.italic = (packed & ATTR_ITALIC) !== 0 ? true : undefined
    attrs.blink = (packed & ATTR_BLINK) !== 0 ? true : undefined
    attrs.inverse = (packed & ATTR_INVERSE) !== 0 ? true : undefined
    attrs.hidden = (packed & ATTR_HIDDEN) !== 0 ? true : undefined
    attrs.strikethrough = (packed & ATTR_STRIKETHROUGH) !== 0 ? true : undefined

    const ulStyleNum = (packed & UNDERLINE_STYLE_MASK) >> UNDERLINE_STYLE_SHIFT
    const ulStyle = numberToUnderlineStyle(ulStyleNum)
    if (ulStyle) {
      attrs.underlineStyle = ulStyle
      attrs.underline = true
    } else {
      attrs.underlineStyle = undefined
      attrs.underline = undefined
    }

    out.wide = (packed & WIDE_FLAG) !== 0
    out.continuation = (packed & CONTINUATION_FLAG) !== 0
    out.hyperlink = this.hyperlinks.get(idx)

    return out
  }

  /**
   * Set a cell at the given position.
   *
   * Optimized: resolves defaults and packs metadata inline to avoid
   * allocating an intermediate Cell object.
   */
  setCell(x: number, y: number, cell: Partial<Cell>): void {
    if (!this.inBounds(x, y)) {
      return
    }

    // Write trap for SILVERY_STRICT mismatch diagnosis
    const trap = (globalThis as any).__silvery_write_trap
    if (trap && x === trap.x && y === trap.y) {
      const char = cell.char ?? " "
      const stack = new Error().stack?.split("\n").slice(1, 6).join("\n") ?? ""
      trap.log.push(
        `  char="${char}" fg=${cell.fg ?? "null"} bg=${cell.bg ?? "null"} dim=${cell.attrs?.dim} ul=${cell.attrs?.underline}\n${stack}`,
      )
    }

    this._dirtyRows[y] = 1
    if (this._minDirtyRow === -1 || y < this._minDirtyRow) this._minDirtyRow = y
    if (y > this._maxDirtyRow) this._maxDirtyRow = y

    const idx = this.index(x, y)

    // Resolve properties with defaults (no intermediate object)
    const char = cell.char ?? " "
    const fg = cell.fg ?? null
    const bg = cell.bg ?? null
    const underlineColor = cell.underlineColor ?? null
    const attrs = cell.attrs ?? EMPTY_ATTRS
    const wide = cell.wide ?? false
    const continuation = cell.continuation ?? false

    // Store character
    this.chars[idx] = char

    // Handle true color storage
    if (isTrueColor(fg)) {
      this.fgColors.set(idx, fg)
    } else {
      this.fgColors.delete(idx)
    }

    if (isTrueColor(bg)) {
      this.bgColors.set(idx, bg)
    } else {
      this.bgColors.delete(idx)
    }

    // Handle underline color storage
    if (underlineColor !== null) {
      this.underlineColors.set(idx, underlineColor)
    } else {
      this.underlineColors.delete(idx)
    }

    // Handle hyperlink storage
    const hyperlink = cell.hyperlink
    if (hyperlink !== undefined && hyperlink !== "") {
      this.hyperlinks.set(idx, hyperlink)
    } else {
      this.hyperlinks.delete(idx)
    }

    // Pack metadata inline (avoids packCell's fullCell parameter overhead)
    let packed = 0
    packed |= colorToIndex(fg) & 0xff
    packed |= (colorToIndex(bg) & 0xff) << 8
    packed |= attrsToNumber(attrs)
    if (wide) packed |= WIDE_FLAG
    if (continuation) packed |= CONTINUATION_FLAG
    if (isTrueColor(fg)) packed |= TRUE_COLOR_FG_FLAG
    if (isTrueColor(bg)) packed |= TRUE_COLOR_BG_FLAG
    this.cells[idx] = packed
  }

  /**
   * Fill a region with a cell.
   *
   * Optimized: packs cell metadata once and assigns directly to arrays,
   * avoiding O(width*height) intermediate object allocations from setCell().
   */
  fill(x: number, y: number, width: number, height: number, cell: Partial<Cell>): void {
    const endX = Math.min(x + width, this.width)
    const endY = Math.min(y + height, this.height)
    const startX = Math.max(0, x)
    const startY = Math.max(0, y)

    if (startX >= endX || startY >= endY) return

    // Resolve cell properties once (instead of per-cell in setCell)
    const char = cell.char ?? " "
    const fg = cell.fg ?? null
    const bg = cell.bg ?? null
    const underlineColor = cell.underlineColor ?? null
    const attrs = cell.attrs ?? {}
    const wide = cell.wide ?? false
    const continuation = cell.continuation ?? false

    // Pack metadata once for the entire fill region
    const fullCell: Cell = {
      char,
      fg,
      bg,
      underlineColor,
      attrs,
      wide,
      continuation,
    }
    const packed = packCell(fullCell)

    // Determine true color values once
    const hasTrueColorFg = isTrueColor(fg)
    const hasTrueColorBg = isTrueColor(bg)
    const trueColorFg = hasTrueColorFg ? (fg as { r: number; g: number; b: number }) : null
    const trueColorBg = hasTrueColorBg ? (bg as { r: number; g: number; b: number }) : null
    const hasUnderlineColor = underlineColor !== null
    const hyperlink = cell.hyperlink
    const hasHyperlink = hyperlink !== undefined && hyperlink !== ""

    // Mark affected rows dirty + update bounding box
    for (let cy = startY; cy < endY; cy++) {
      this._dirtyRows[cy] = 1
    }
    if (startY < endY) {
      if (this._minDirtyRow === -1 || startY < this._minDirtyRow) this._minDirtyRow = startY
      if (endY - 1 > this._maxDirtyRow) this._maxDirtyRow = endY - 1
    }

    // Determine which Map operations are actually needed.
    // Skip delete() calls when the map is already empty (common case: no true colors).
    const needFgDelete = !hasTrueColorFg && this.fgColors.size > 0
    const needBgDelete = !hasTrueColorBg && this.bgColors.size > 0
    const needUlDelete = !hasUnderlineColor && this.underlineColors.size > 0
    const needHlDelete = !hasHyperlink && this.hyperlinks.size > 0

    for (let cy = startY; cy < endY; cy++) {
      const rowBase = cy * this.width
      for (let cx = startX; cx < endX; cx++) {
        const idx = rowBase + cx

        // Direct array assignment (no setCell overhead)
        this.cells[idx] = packed
        this.chars[idx] = char

        // Handle true color maps — skip delete when map is empty
        if (hasTrueColorFg) {
          this.fgColors.set(idx, trueColorFg!)
        } else if (needFgDelete) {
          this.fgColors.delete(idx)
        }

        if (hasTrueColorBg) {
          this.bgColors.set(idx, trueColorBg!)
        } else if (needBgDelete) {
          this.bgColors.delete(idx)
        }

        if (hasUnderlineColor) {
          this.underlineColors.set(idx, underlineColor)
        } else if (needUlDelete) {
          this.underlineColors.delete(idx)
        }

        if (hasHyperlink) {
          this.hyperlinks.set(idx, hyperlink!)
        } else if (needHlDelete) {
          this.hyperlinks.delete(idx)
        }
      }
    }
  }

  /**
   * Clear the buffer (fill with empty cells).
   */
  clear(): void {
    this.cells.fill(0)
    this.chars.fill(" ")
    this.fgColors.clear()
    this.bgColors.clear()
    this.underlineColors.clear()
    this.hyperlinks.clear()
    this._dirtyRows.fill(1)
    this._minDirtyRow = 0
    this._maxDirtyRow = this.height - 1
  }

  /**
   * Copy a region from another buffer.
   */
  copyFrom(
    source: TerminalBuffer,
    srcX: number,
    srcY: number,
    destX: number,
    destY: number,
    width: number,
    height: number,
  ): void {
    const cell = createMutableCell()
    for (let dy = 0; dy < height; dy++) {
      const dstY = destY + dy
      if (dstY >= 0 && dstY < this.height) {
        this._dirtyRows[dstY] = 1
        if (this._minDirtyRow === -1 || dstY < this._minDirtyRow) this._minDirtyRow = dstY
        if (dstY > this._maxDirtyRow) this._maxDirtyRow = dstY
      }
      for (let dx = 0; dx < width; dx++) {
        const sx = srcX + dx
        const sy = srcY + dy
        const dX = destX + dx

        if (source.inBounds(sx, sy) && this.inBounds(dX, dstY)) {
          source.readCellInto(sx, sy, cell)
          this.setCell(dX, dstY, cell)
        }
      }
    }
  }

  /**
   * Shift content within a rectangular region vertically by `delta` rows.
   * Positive delta = shift content UP (scroll down), negative = shift DOWN (scroll up).
   * Exposed rows (at the bottom for positive delta, top for negative) are filled
   * with the given background cell.
   *
   * Uses Uint32Array.copyWithin for the packed cells (native memcpy) and
   * Array splice for the character array.
   */
  scrollRegion(
    x: number,
    y: number,
    regionWidth: number,
    regionHeight: number,
    delta: number,
    clearCell: Partial<Cell> = {},
  ): void {
    if (delta === 0 || regionHeight <= 0 || regionWidth <= 0) return

    const startX = Math.max(0, x)
    const endX = Math.min(x + regionWidth, this.width)
    const startY = Math.max(0, y)
    const endY = Math.min(y + regionHeight, this.height)
    const clampedWidth = endX - startX
    const clampedHeight = endY - startY

    if (clampedWidth <= 0 || clampedHeight <= 0) return

    // Mark all rows in the scroll region dirty + update bounding box
    for (let r = startY; r < endY; r++) {
      this._dirtyRows[r] = 1
    }
    if (this._minDirtyRow === -1 || startY < this._minDirtyRow) this._minDirtyRow = startY
    if (endY - 1 > this._maxDirtyRow) this._maxDirtyRow = endY - 1

    if (Math.abs(delta) >= clampedHeight) {
      // Scroll amount exceeds region — just clear everything
      this.fill(startX, startY, clampedWidth, clampedHeight, {
        char: clearCell.char ?? " ",
        bg: clearCell.bg ?? null,
      })
      return
    }

    const absDelta = Math.abs(delta)
    const w = this.width

    if (delta > 0) {
      // Shift content UP: copy rows [startY + delta .. endY) to [startY .. endY - delta)
      for (let row = startY; row < endY - absDelta; row++) {
        const dstBase = row * w
        const srcBase = (row + absDelta) * w
        // Copy cells and chars for the region columns
        this.cells.copyWithin(dstBase + startX, srcBase + startX, srcBase + endX)
        for (let cx = startX; cx < endX; cx++) {
          this.chars[dstBase + cx] = this.chars[srcBase + cx]!
          // Move true color maps
          const srcIdx = srcBase + cx
          const dstIdx = dstBase + cx
          const fgc = this.fgColors.get(srcIdx)
          if (fgc) {
            this.fgColors.set(dstIdx, fgc)
            this.fgColors.delete(srcIdx)
          } else {
            this.fgColors.delete(dstIdx)
          }
          const bgc = this.bgColors.get(srcIdx)
          if (bgc) {
            this.bgColors.set(dstIdx, bgc)
            this.bgColors.delete(srcIdx)
          } else {
            this.bgColors.delete(dstIdx)
          }
          const ulc = this.underlineColors.get(srcIdx)
          if (ulc) {
            this.underlineColors.set(dstIdx, ulc)
            this.underlineColors.delete(srcIdx)
          } else {
            this.underlineColors.delete(dstIdx)
          }
          const hl = this.hyperlinks.get(srcIdx)
          if (hl) {
            this.hyperlinks.set(dstIdx, hl)
            this.hyperlinks.delete(srcIdx)
          } else {
            this.hyperlinks.delete(dstIdx)
          }
        }
      }
      // Clear exposed rows at bottom
      this.fill(startX, endY - absDelta, clampedWidth, absDelta, {
        char: clearCell.char ?? " ",
        bg: clearCell.bg ?? null,
      })
    } else {
      // Shift content DOWN: copy rows [startY .. endY - absDelta) to [startY + absDelta .. endY)
      for (let row = endY - 1; row >= startY + absDelta; row--) {
        const dstBase = row * w
        const srcBase = (row - absDelta) * w
        this.cells.copyWithin(dstBase + startX, srcBase + startX, srcBase + endX)
        for (let cx = startX; cx < endX; cx++) {
          this.chars[dstBase + cx] = this.chars[srcBase + cx]!
          const srcIdx = srcBase + cx
          const dstIdx = dstBase + cx
          const fgc = this.fgColors.get(srcIdx)
          if (fgc) {
            this.fgColors.set(dstIdx, fgc)
            this.fgColors.delete(srcIdx)
          } else {
            this.fgColors.delete(dstIdx)
          }
          const bgc = this.bgColors.get(srcIdx)
          if (bgc) {
            this.bgColors.set(dstIdx, bgc)
            this.bgColors.delete(srcIdx)
          } else {
            this.bgColors.delete(dstIdx)
          }
          const ulc = this.underlineColors.get(srcIdx)
          if (ulc) {
            this.underlineColors.set(dstIdx, ulc)
            this.underlineColors.delete(srcIdx)
          } else {
            this.underlineColors.delete(dstIdx)
          }
          const hl = this.hyperlinks.get(srcIdx)
          if (hl) {
            this.hyperlinks.set(dstIdx, hl)
            this.hyperlinks.delete(srcIdx)
          } else {
            this.hyperlinks.delete(dstIdx)
          }
        }
      }
      // Clear exposed rows at top
      this.fill(startX, startY, clampedWidth, absDelta, {
        char: clearCell.char ?? " ",
        bg: clearCell.bg ?? null,
      })
    }
  }

  /**
   * Clone this buffer.
   */
  clone(): TerminalBuffer {
    const copy = new TerminalBuffer(this.width, this.height)
    copy.cells.set(this.cells)
    copy.chars = [...this.chars]
    copy.fgColors = new Map(this.fgColors)
    copy.bgColors = new Map(this.bgColors)
    copy.underlineColors = new Map(this.underlineColors)
    copy.hyperlinks = new Map(this.hyperlinks)
    // Clone starts with all rows CLEAN. The content phase will mark only
    // the rows it modifies as dirty. diffBuffers() then skips clean rows,
    // which are guaranteed identical to the prev buffer (since this is a clone).
    copy._dirtyRows.fill(0)
    copy._minDirtyRow = -1
    copy._maxDirtyRow = -1
    return copy
  }

  /**
   * Check if a row has been modified since the last resetDirtyRows() call.
   * Used by diffBuffers() to skip unchanged rows.
   */
  isRowDirty(y: number): boolean {
    if (y < 0 || y >= this.height) return false
    return this._dirtyRows[y] !== 0
  }

  /** First dirty row (inclusive), or -1 if no rows are dirty. */
  get minDirtyRow(): number {
    return this._minDirtyRow
  }

  /** Last dirty row (inclusive), or -1 if no rows are dirty. */
  get maxDirtyRow(): number {
    return this._maxDirtyRow
  }

  /**
   * Reset all dirty row flags to clean.
   * Call after diffing to prepare for the next frame's modifications.
   */
  resetDirtyRows(): void {
    this._dirtyRows.fill(0)
    this._minDirtyRow = -1
    this._maxDirtyRow = -1
  }

  /**
   * Mark all rows as dirty.
   * Used when the buffer's dirty rows may not cover all changes relative
   * to a different prev buffer (e.g., after multiple doRender calls where
   * the runtime's prevBuffer skipped intermediate buffers).
   */
  markAllRowsDirty(): void {
    this._dirtyRows.fill(1)
    this._minDirtyRow = 0
    this._maxDirtyRow = this.height - 1
  }

  /**
   * Check if two cells at given positions are equal.
   * Used for diffing.
   */
  cellEquals(x: number, y: number, other: TerminalBuffer): boolean {
    if (!this.inBounds(x, y) || !other.inBounds(x, y)) {
      return false
    }

    const idx = this.index(x, y)
    const otherIdx = other.index(x, y)

    // Quick check: packed metadata must match
    if (this.cells[idx] !== other.cells[otherIdx]) {
      return false
    }

    // Character must match
    if (this.chars[idx] !== other.chars[otherIdx]) {
      return false
    }

    // If true color flags are set, check the color values
    const packed = this.cells[idx]!
    if (unpackTrueColorFg(packed)) {
      const a = this.fgColors.get(idx)
      const b = other.fgColors.get(otherIdx)
      if (!colorEquals(a, b)) return false
    }
    if (unpackTrueColorBg(packed!)) {
      const a = this.bgColors.get(idx)
      const b = other.bgColors.get(otherIdx)
      if (!colorEquals(a, b)) return false
    }

    // Check underline colors
    const ulA = this.underlineColors.get(idx) ?? null
    const ulB = other.underlineColors.get(otherIdx) ?? null
    if (!colorEquals(ulA, ulB)) return false

    // Check hyperlinks
    const hlA = this.hyperlinks.get(idx)
    const hlB = other.hyperlinks.get(otherIdx)
    if (hlA !== hlB) return false

    return true
  }

  /**
   * Fast check: are all packed metadata values identical for a row?
   * This is a bulk pre-check before per-cell comparison. If metadata differs,
   * we still need per-cell diffing. If metadata matches, we only need to
   * check chars, true color maps, underline colors, and hyperlinks.
   * Returns true if all packed 32-bit values in the row are identical.
   */
  rowMetadataEquals(y: number, other: TerminalBuffer): boolean {
    if (y < 0 || y >= this.height || y >= other.height) return false
    const start = y * this.width
    const otherStart = y * other.width
    const w = Math.min(this.width, other.width)
    for (let i = 0; i < w; i++) {
      if (this.cells[start + i] !== other.cells[otherStart + i]) return false
    }
    return true
  }

  /**
   * Fast check: are all characters identical for a row?
   * Companion to rowMetadataEquals for a two-phase row comparison.
   */
  rowCharsEquals(y: number, other: TerminalBuffer): boolean {
    if (y < 0 || y >= this.height || y >= other.height) return false
    const start = y * this.width
    const otherStart = y * other.width
    const w = Math.min(this.width, other.width)
    for (let i = 0; i < w; i++) {
      if (this.chars[start + i] !== other.chars[otherStart + i]) return false
    }
    return true
  }

  /**
   * Check Map-based extras for a row: true color fg/bg, underline colors, hyperlinks.
   * Must be called AFTER rowMetadataEquals confirms packed metadata matches.
   * Only checks cells that have true color flags set (the Maps are only populated
   * for those cells). Also checks underline colors and hyperlinks for all cells.
   */
  rowExtrasEquals(y: number, other: TerminalBuffer): boolean {
    if (y < 0 || y >= this.height || y >= other.height) return false
    const start = y * this.width
    const w = Math.min(this.width, other.width)
    const otherStart = y * other.width
    for (let i = 0; i < w; i++) {
      const idx = start + i
      const otherIdx = otherStart + i
      const packed = this.cells[idx]!

      // Check true color fg values
      if ((packed & TRUE_COLOR_FG_FLAG) !== 0) {
        const a = this.fgColors.get(idx)
        const b = other.fgColors.get(otherIdx)
        if (!colorEquals(a, b)) return false
      }

      // Check true color bg values
      if ((packed & TRUE_COLOR_BG_FLAG) !== 0) {
        const a = this.bgColors.get(idx)
        const b = other.bgColors.get(otherIdx)
        if (!colorEquals(a, b)) return false
      }

      // Check underline colors
      const ulA = this.underlineColors.get(idx) ?? null
      const ulB = other.underlineColors.get(otherIdx) ?? null
      if (!colorEquals(ulA, ulB)) return false

      // Check hyperlinks
      const hlA = this.hyperlinks.get(idx)
      const hlB = other.hyperlinks.get(otherIdx)
      if (hlA !== hlB) return false
    }
    return true
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compare two colors for equality.
 */
export function colorEquals(a: Color | undefined, b: Color | undefined): boolean {
  if (a === b) return true
  if (a === null || a === undefined) return b === null || b === undefined
  if (b === null || b === undefined) return false
  if (typeof a === "number") return a === b
  if (typeof b === "number") return false
  return a.r === b.r && a.g === b.g && a.b === b.b
}

/**
 * Compare two cells for equality.
 */
export function cellEquals(a: Cell, b: Cell): boolean {
  return (
    a.char === b.char &&
    colorEquals(a.fg, b.fg) &&
    colorEquals(a.bg, b.bg) &&
    colorEquals(a.underlineColor, b.underlineColor) &&
    a.wide === b.wide &&
    a.continuation === b.continuation &&
    attrsEquals(a.attrs, b.attrs) &&
    (a.hyperlink ?? undefined) === (b.hyperlink ?? undefined)
  )
}

/**
 * Compare two CellAttrs for equality.
 */
export function attrsEquals(a: CellAttrs, b: CellAttrs): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.dim) === Boolean(b.dim) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    (a.underlineStyle ?? false) === (b.underlineStyle ?? false) &&
    Boolean(a.blink) === Boolean(b.blink) &&
    Boolean(a.inverse) === Boolean(b.inverse) &&
    Boolean(a.hidden) === Boolean(b.hidden) &&
    Boolean(a.strikethrough) === Boolean(b.strikethrough)
  )
}

/**
 * Compare two styles for equality.
 */
export function styleEquals(a: Style | null, b: Style | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    colorEquals(a.fg, b.fg) &&
    colorEquals(a.bg, b.bg) &&
    colorEquals(a.underlineColor, b.underlineColor) &&
    attrsEquals(a.attrs, b.attrs) &&
    (a.hyperlink ?? undefined) === (b.hyperlink ?? undefined)
  )
}

/**
 * Create a mutable Cell object for use with readCellInto().
 * The returned object is reusable -- readCellInto() overwrites all fields.
 */
export function createMutableCell(): Cell {
  return {
    char: " ",
    fg: null,
    bg: null,
    underlineColor: null,
    attrs: {},
    wide: false,
    continuation: false,
    hyperlink: undefined,
  }
}

/**
 * Create a buffer initialized with a specific character.
 */
export function createBuffer(width: number, height: number, char = " "): TerminalBuffer {
  const buffer = new TerminalBuffer(width, height)
  if (char !== " ") {
    buffer.fill(0, 0, width, height, { char })
  }
  return buffer
}

// ============================================================================
// Buffer Conversion Utilities
// ============================================================================

/**
 * Convert a terminal buffer to plain text (no ANSI codes).
 * Useful for snapshot testing and text-based assertions.
 *
 * @param buffer The buffer to convert
 * @param options.trimTrailingWhitespace Remove trailing spaces from each line (default: true)
 * @param options.trimEmptyLines Remove trailing empty lines (default: true)
 * @returns Plain text representation of the buffer
 */
export function bufferToText(
  buffer: TerminalBuffer,
  options: {
    trimTrailingWhitespace?: boolean
    trimEmptyLines?: boolean
  } = {},
): string {
  const { trimTrailingWhitespace = true, trimEmptyLines = true } = options

  const lines: string[] = []

  for (let y = 0; y < buffer.height; y++) {
    let line = ""
    for (let x = 0; x < buffer.width; x++) {
      // Use zero-allocation accessors instead of getCell()
      if (buffer.isCellContinuation(x, y)) continue
      line += buffer.getCellChar(x, y)
    }
    if (trimTrailingWhitespace) {
      // Smart trim: find the rightmost cell that has any styling (fg, bg, attrs)
      // or non-space character. This preserves styled trailing spaces (content)
      // while removing unstyled buffer padding.
      const contentEdge = getContentEdge(buffer, y)
      // Use the wider of trimEnd position and content edge — trimEnd handles
      // non-space chars, content edge handles styled spaces
      const trimmed = line.trimEnd()
      line = trimmed.length >= contentEdge ? trimmed : line.substring(0, contentEdge)
    }
    lines.push(line)
  }

  let result = lines.join("\n")
  if (trimEmptyLines) {
    // Remove trailing empty lines without stripping spaces from last content line
    while (lines.length > 0 && lines[lines.length - 1]!.length === 0) {
      lines.pop()
    }
    result = lines.join("\n")
  }
  return result
}

/**
 * Find the rightmost column with non-default cell content on a row.
 * A default cell has packed metadata === 0 (no fg, bg, attrs) AND char === ' '.
 * Returns the column count (1-indexed), so the content edge for trimming.
 */
function getContentEdge(buffer: TerminalBuffer, y: number): number {
  for (let x = buffer.width - 1; x >= 0; x--) {
    // Check if cell has any styling (non-zero packed metadata means fg, bg, or attrs set)
    if (buffer.getCellAttrs(x, y) !== 0) return x + 1
    // Check if cell has a non-space character
    if (buffer.getCellChar(x, y) !== " ") return x + 1
  }
  return 0
}

/**
 * Convert a terminal buffer to styled ANSI text.
 * Unlike bufferToAnsi, this doesn't include cursor control sequences,
 * making it suitable for displaying in terminals or saving to files.
 *
 * @param buffer The buffer to convert
 * @param options.trimTrailingWhitespace Remove trailing spaces from each line (default: true)
 * @param options.trimEmptyLines Remove trailing empty lines (default: true)
 * @returns ANSI-styled text (no cursor control)
 */
export function bufferToStyledText(
  buffer: TerminalBuffer,
  options: {
    trimTrailingWhitespace?: boolean
    trimEmptyLines?: boolean
  } = {},
): string {
  const { trimTrailingWhitespace = true, trimEmptyLines = true } = options

  const lines: string[] = []
  let currentStyle: Style | null = null
  let currentHyperlink: string | undefined

  for (let y = 0; y < buffer.height; y++) {
    let line = ""

    for (let x = 0; x < buffer.width; x++) {
      // getCell allocates a fresh object each call, which is fine here since
      // bufferToStyledText is a utility function, not a hot render path.
      const cell = buffer.getCell(x, y)
      // Skip continuation cells (part of wide character)
      if (cell.continuation) continue

      // Check if hyperlink changed (OSC 8 is separate from SGR)
      const cellHyperlink = cell.hyperlink
      if (cellHyperlink !== currentHyperlink) {
        if (currentHyperlink) {
          line += "\x1b]8;;\x1b\\" // Close previous hyperlink
        }
        if (cellHyperlink) {
          line += `\x1b]8;;${cellHyperlink}\x1b\\` // Open new hyperlink
        }
        currentHyperlink = cellHyperlink
      }

      // Check if style changed
      const cellStyle: Style = {
        fg: cell.fg,
        bg: cell.bg,
        underlineColor: cell.underlineColor,
        attrs: cell.attrs,
      }
      if (!styleEquals(currentStyle, cellStyle)) {
        line += styleToAnsiCodes(cellStyle)
        currentStyle = cellStyle
      }

      line += cell.char
    }

    // Close any open hyperlink at end of line
    if (currentHyperlink) {
      line += "\x1b]8;;\x1b\\"
      currentHyperlink = undefined
    }

    // Reset style at end of line to prevent background color bleeding
    if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
      line += "\x1b[0m"
      currentStyle = null
    }

    if (trimTrailingWhitespace) {
      // Need to be careful not to strip ANSI codes
      // Only trim actual whitespace at the end
      line = trimTrailingWhitespacePreservingAnsi(line)
    }
    lines.push(line)
  }

  // Final reset
  let result = lines.join("\n")
  if (currentStyle) {
    result += "\x1b[0m"
  }

  if (trimEmptyLines) {
    // Remove empty lines at the end (but preserve ANSI resets)
    result = result.replace(/\n+$/, "")
  }

  return result
}

// ============================================================================
// xterm-256 Color Palette
// ============================================================================

/** Standard xterm-256 color palette as hex strings. */
const XTERM_256_PALETTE: string[] = (() => {
  const palette: string[] = new Array(256)

  // Colors 0-7: standard colors
  const standard = ["#000000", "#cd0000", "#00cd00", "#cdcd00", "#0000ee", "#cd00cd", "#00cdcd", "#e5e5e5"]
  // Colors 8-15: bright colors
  const bright = ["#7f7f7f", "#ff0000", "#00ff00", "#ffff00", "#5c5cff", "#ff00ff", "#00ffff", "#ffffff"]
  for (let i = 0; i < 8; i++) {
    palette[i] = standard[i]!
    palette[i + 8] = bright[i]!
  }

  // Colors 16-231: 6x6x6 RGB cube
  const cubeValues = [0, 95, 135, 175, 215, 255]
  for (let i = 0; i < 216; i++) {
    const r = cubeValues[Math.floor(i / 36)]!
    const g = cubeValues[Math.floor((i % 36) / 6)]!
    const b = cubeValues[i % 6]!
    palette[16 + i] =
      "#" + r.toString(16).padStart(2, "0") + g.toString(16).padStart(2, "0") + b.toString(16).padStart(2, "0")
  }

  // Colors 232-255: grayscale ramp
  for (let i = 0; i < 24; i++) {
    const v = 8 + i * 10
    const hex = v.toString(16).padStart(2, "0")
    palette[232 + i] = "#" + hex + hex + hex
  }

  return palette
})()

/**
 * Convert a Color value to a CSS color string.
 * Returns null for default/inherit colors.
 */
function colorToCSS(color: Color): string | null {
  if (color === null) return null
  if (typeof color === "number") {
    return XTERM_256_PALETTE[color] ?? null
  }
  // DEFAULT_BG sentinel → no CSS color (use inherited/default)
  if (color.r === -1) return null
  return `rgb(${color.r},${color.g},${color.b})`
}

// ============================================================================
// Buffer to HTML Conversion
// ============================================================================

/**
 * Convert a terminal buffer to a full HTML document.
 * Suitable for rendering as a screenshot via headless browser.
 *
 * @param buffer The buffer to convert
 * @param options.fontFamily CSS font-family (default: 'JetBrains Mono, Menlo, monospace')
 * @param options.fontSize CSS font-size in px (default: 14)
 * @param options.theme Color scheme (default: 'dark')
 * @returns Complete HTML document string
 */
export function bufferToHTML(
  buffer: TerminalBuffer,
  options: {
    fontFamily?: string
    fontSize?: number
    theme?: "dark" | "light"
  } = {},
): string {
  const { fontFamily = "JetBrains Mono, Menlo, monospace", fontSize = 14, theme = "dark" } = options

  const defaultFg = theme === "dark" ? "#d4d4d4" : "#1e1e1e"
  const defaultBg = theme === "dark" ? "#1e1e1e" : "#ffffff"

  const htmlLines: string[] = []

  for (let y = 0; y < buffer.height; y++) {
    let lineHTML = ""
    let currentStyle: Style | null = null
    let spanOpen = false
    let linkOpen = false
    let currentHyperlink: string | undefined

    for (let x = 0; x < buffer.width; x++) {
      const cell = buffer.getCell(x, y)
      if (cell.continuation) continue

      // Handle hyperlink transitions
      const cellHyperlink = cell.hyperlink
      if (cellHyperlink !== currentHyperlink) {
        if (linkOpen) {
          if (spanOpen) {
            lineHTML += "</span>"
            spanOpen = false
          }
          lineHTML += "</a>"
          linkOpen = false
        }
        if (cellHyperlink) {
          lineHTML += `<a href="${escapeHTML(cellHyperlink)}">`
          linkOpen = true
        }
        currentHyperlink = cellHyperlink
      }

      const cellStyle: Style = {
        fg: cell.fg,
        bg: cell.bg,
        underlineColor: cell.underlineColor,
        attrs: cell.attrs,
      }

      if (!styleEquals(currentStyle, cellStyle)) {
        if (spanOpen) {
          lineHTML += "</span>"
          spanOpen = false
        }
        const css = styleToCSSProperties(cellStyle, defaultFg, defaultBg)
        if (css) {
          lineHTML += `<span style="${css}">`
          spanOpen = true
        }
        currentStyle = cellStyle
      }

      lineHTML += escapeHTML(cell.char)
    }

    if (spanOpen) {
      lineHTML += "</span>"
    }
    if (linkOpen) {
      lineHTML += "</a>"
      currentHyperlink = undefined
    }

    htmlLines.push(`<div>${lineHTML}</div>`)
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${defaultBg};color:${defaultFg};font-family:${fontFamily};font-size:${fontSize}px;line-height:1.2;white-space:pre">
${htmlLines.join("\n")}
</body>
</html>`
}

/**
 * Convert a Style to CSS inline style properties.
 * Returns null if the style is entirely default.
 */
function styleToCSSProperties(style: Style, defaultFg: string, defaultBg: string): string | null {
  const parts: string[] = []

  // Handle inverse: swap fg/bg
  let fgColor: string | null
  let bgColor: string | null
  if (style.attrs.inverse) {
    fgColor = colorToCSS(style.bg) ?? defaultBg
    bgColor = colorToCSS(style.fg) ?? defaultFg
  } else {
    fgColor = colorToCSS(style.fg)
    bgColor = colorToCSS(style.bg)
  }

  if (fgColor) parts.push(`color:${fgColor}`)
  if (bgColor) parts.push(`background:${bgColor}`)
  if (style.attrs.bold) parts.push("font-weight:bold")
  if (style.attrs.dim) parts.push("opacity:0.5")
  if (style.attrs.italic) parts.push("font-style:italic")
  if (style.attrs.hidden) parts.push("visibility:hidden")

  // Text decoration: underline and/or strikethrough
  const decorations: string[] = []
  const underlineStyle = style.attrs.underlineStyle
  if (typeof underlineStyle === "string") {
    const cssStyleMap: Record<string, string> = {
      single: "solid",
      double: "double",
      curly: "wavy",
      dotted: "dotted",
      dashed: "dashed",
    }
    decorations.push("underline")
    const cssStyle = cssStyleMap[underlineStyle]
    if (cssStyle) parts.push(`text-decoration-style:${cssStyle}`)
    const ulColor = colorToCSS(style.underlineColor ?? null)
    if (ulColor) parts.push(`text-decoration-color:${ulColor}`)
  } else if (style.attrs.underline) {
    decorations.push("underline")
  }
  if (style.attrs.strikethrough) decorations.push("line-through")
  if (decorations.length > 0) parts.push(`text-decoration:${decorations.join(" ")}`)

  return parts.length > 0 ? parts.join(";") : null
}

/** Escape special HTML characters. */
function escapeHTML(str: string): string {
  if (str === " " || str.length === 0) return str
  return str.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

/**
 * Check if any text attributes are active.
 */
export function hasActiveAttrs(attrs: CellAttrs): boolean {
  return !!(
    attrs.bold ||
    attrs.dim ||
    attrs.italic ||
    attrs.underline ||
    attrs.underlineStyle ||
    attrs.blink ||
    attrs.inverse ||
    attrs.hidden ||
    attrs.strikethrough
  )
}

/**
 * Convert style to ANSI escape sequence.
 *
 * Uses SGR 7 for inverse so terminals correctly swap fg/bg
 * (including default terminal colors that have no explicit ANSI code).
 */
function styleToAnsiCodes(style: Style): string {
  const fg = style.fg
  const bg = style.bg

  const codes: number[] = [0] // Reset first

  // Foreground color
  if (fg !== null) {
    if (typeof fg === "number") {
      codes.push(38, 5, fg)
    } else {
      codes.push(38, 2, fg.r, fg.g, fg.b)
    }
  }

  // Background color (DEFAULT_BG sentinel = terminal default, skip after reset)
  if (bg !== null && !isDefaultBg(bg)) {
    if (typeof bg === "number") {
      codes.push(48, 5, bg)
    } else {
      codes.push(48, 2, bg.r, bg.g, bg.b)
    }
  }

  // Attributes
  if (style.attrs.bold) codes.push(1)
  if (style.attrs.dim) codes.push(2)
  if (style.attrs.italic) codes.push(3)

  // Build base escape sequence
  let result = `\x1b[${codes.join(";")}`

  // Underline: use SGR 4:x if style specified, otherwise simple SGR 4
  const underlineStyle = style.attrs.underlineStyle
  if (typeof underlineStyle === "string") {
    const styleMap: Record<string, number> = {
      single: 1,
      double: 2,
      curly: 3,
      dotted: 4,
      dashed: 5,
    }
    const subparam = styleMap[underlineStyle]
    if (subparam !== undefined && subparam !== 0) {
      result += `;4:${subparam}`
    }
  } else if (style.attrs.underline) {
    result += ";4" // Simple underline
  }

  // Underline color (SGR 58)
  if (style.underlineColor !== null && style.underlineColor !== undefined) {
    if (typeof style.underlineColor === "number") {
      result += `;58;5;${style.underlineColor}`
    } else {
      result += `;58;2;${style.underlineColor.r};${style.underlineColor.g};${style.underlineColor.b}`
    }
  }

  // Use SGR 7 for inverse — lets the terminal correctly swap fg/bg
  if (style.attrs.inverse) result += ";7"
  if (style.attrs.strikethrough) result += ";9"

  return result + "m"
}

/**
 * Trim trailing whitespace from a string while preserving ANSI codes.
 */
function trimTrailingWhitespacePreservingAnsi(str: string): string {
  // Find the last non-whitespace character or ANSI escape
  let lastContentIndex = -1
  let i = 0

  while (i < str.length) {
    if (str[i] === "\x1b") {
      // Check for OSC sequence (ESC ] ... ST or BEL)
      if (str[i + 1] === "]") {
        // Find the terminator: ST (\x1b\\) or BEL (\x07)
        let end = -1
        for (let j = i + 2; j < str.length; j++) {
          if (str[j] === "\x07") {
            end = j
            break
          }
          if (str[j] === "\x1b" && str[j + 1] === "\\") {
            end = j + 1
            break
          }
        }
        if (end !== -1) {
          lastContentIndex = end
          i = end + 1
          continue
        }
      }
      // Found SGR escape - skip the entire sequence
      const end = str.indexOf("m", i)
      if (end !== -1) {
        lastContentIndex = end
        i = end + 1
        continue
      }
    }
    if (str[i] !== " " && str[i] !== "\t") {
      lastContentIndex = i
    }
    i++
  }

  return str.slice(0, lastContentIndex + 1)
}
