/**
 * Terminal buffer implementation for Silvery.
 *
 * Uses packed Uint32Array for efficient cell metadata storage,
 * with separate string array for character storage (needed for
 * multi-byte Unicode graphemes and combining characters).
 */

import { fgColorCode, bgColorCode } from "./ansi/sgr-codes"

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
  /**
   * Overline (SGR 53/55). A line ABOVE the character cell, independent of
   * underline. Used for top-edge indicators where underline would read as
   * "this row is underlined content" instead of "you're at the top".
   */
  overline?: boolean
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
// [16-23]: attributes (8 bits): bold, dim, italic, blink, inverse, hidden, strikethrough, overline
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
const ATTR_OVERLINE = 1 << 23

// Underline style (3 bits in positions 24-26)
// 0 = no underline, 1 = single, 2 = double, 3 = curly, 4 = dotted, 5 = dashed
const UNDERLINE_STYLE_SHIFT = 24
const UNDERLINE_STYLE_MASK = 0x7 << UNDERLINE_STYLE_SHIFT // 3 bits

// Flag bit positions (in bits 27-31)
const WIDE_FLAG = 1 << 27
const CONTINUATION_FLAG = 1 << 28
const TRUE_COLOR_FG_FLAG = 1 << 29
const TRUE_COLOR_BG_FLAG = 1 << 30
/**
 * Selection mask flag — bit 31 in the packed cell metadata.
 * Set during render phase based on resolved `userSelect` prop.
 * Read during selection to determine which cells participate.
 *
 * Uses `>>> 0` to avoid JS signed 32-bit integer issues.
 */
export const SELECTABLE_FLAG = 0x80000000 >>> 0

/**
 * Check if a cell is selectable (SELECTABLE_FLAG is set in packed metadata).
 */
export function isCellSelectable(packed: number): boolean {
  return ((packed >>> 0) & SELECTABLE_FLAG) !== 0
}

/**
 * Set the SELECTABLE_FLAG on a packed cell value.
 */
export function setSelectableFlag(packed: number): number {
  return (packed | SELECTABLE_FLAG) >>> 0
}

/**
 * Clear the SELECTABLE_FLAG on a packed cell value.
 */
export function clearSelectableFlag(packed: number): number {
  return (packed & ~SELECTABLE_FLAG) >>> 0
}

/**
 * Packed attribute bits that make a space character visually meaningful.
 * Inverse makes spaces visible (block of color), underline draws a line under spaces,
 * strikethrough draws a line through spaces, overline draws a line above spaces.
 * Other attrs (bold, dim, italic) don't visually affect space characters.
 */
export const VISIBLE_SPACE_ATTR_MASK =
  ATTR_INVERSE | ATTR_STRIKETHROUGH | ATTR_OVERLINE | UNDERLINE_STYLE_MASK

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
// Row Metadata
// ============================================================================

/**
 * Per-row metadata for text extraction correctness.
 * Maintained by the render phase during text rendering.
 */
export interface RowMetadata {
  /** True if this row continues on the next row (soft wrap, not hard break) */
  softWrapped: boolean
  /** Rightmost column with non-space content (for trailing space trimming) */
  lastContentCol: number
}

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
  if (attrs.overline) n |= ATTR_OVERLINE

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
  if (n & ATTR_OVERLINE) attrs.overline = true

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
  /**
   * Per-row metadata for text extraction (soft wrap, last content column).
   * Set by the render phase, read by extractText.
   */
  private _rowMetadata: RowMetadata[]
  /**
   * When true, setCell and fill automatically stamp SELECTABLE_FLAG on written cells.
   * Set/cleared by the render phase as it traverses nodes with different userSelect values.
   * This avoids modifying every individual setCell call — zero overhead (single OR per cell).
   */
  private _selectableMode = false
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
    // Row metadata: default to not soft-wrapped, no content
    this._rowMetadata = Array.from({ length: height }, () => ({
      softWrapped: false,
      lastContentCol: -1,
    }))
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
   * Count cells that are not default-empty.
   *
   * A cell is "painted" iff any of these differs from default-empty:
   *   - char !== " "
   *   - packed metadata is non-zero (any fg, bg, attr, wide/cont/truecolor flag)
   *
   * Used by the degenerate-frame canary in `render()` (renderer.ts) and by
   * test helpers that want to assert a fixture renders meaningful content.
   *
   * O(W*H) — single pass over the packed Uint32Array + chars array.
   */
  countPaintedCells(): number {
    let n = 0
    const len = this.cells.length
    for (let i = 0; i < len; i++) {
      if (this.cells[i]! !== 0 || this.chars[i]! !== " ") n++
    }
    return n
  }

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
   * Check if a cell is selectable (SELECTABLE_FLAG is set, no object allocation).
   * Returns false for out-of-bounds positions.
   */
  isCellSelectable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false
    return ((this.cells[this.index(x, y)]! >>> 0) & SELECTABLE_FLAG) !== 0
  }

  // --------------------------------------------------------------------------
  // Row Metadata (for text extraction)
  // --------------------------------------------------------------------------

  /**
   * Set metadata for a row (soft wrap, last content column).
   * Called by the render phase during text rendering.
   */
  setRowMeta(row: number, meta: Partial<RowMetadata>): void {
    if (row < 0 || row >= this.height) return
    const existing = this._rowMetadata[row]!
    if (meta.softWrapped !== undefined) existing.softWrapped = meta.softWrapped
    if (meta.lastContentCol !== undefined) existing.lastContentCol = meta.lastContentCol
  }

  /**
   * Get metadata for a row. Returns default values for out-of-bounds rows.
   */
  getRowMeta(row: number): RowMetadata {
    if (row < 0 || row >= this.height) return { softWrapped: false, lastContentCol: -1 }
    return this._rowMetadata[row]!
  }

  /**
   * Get the full row metadata array (for bulk access during text extraction).
   */
  getRowMetadataArray(): readonly RowMetadata[] {
    return this._rowMetadata
  }

  // --------------------------------------------------------------------------
  // Selectable Mode (for render-phase SELECTABLE_FLAG stamping)
  // --------------------------------------------------------------------------

  /**
   * Enable/disable automatic SELECTABLE_FLAG stamping on cell writes.
   * When true, all setCell/fill calls stamp SELECTABLE_FLAG on the packed metadata.
   * Zero overhead: a single OR per cell when enabled.
   */
  setSelectableMode(selectable: boolean): void {
    this._selectableMode = selectable
  }

  /**
   * Get the current selectable mode.
   */
  getSelectableMode(): boolean {
    return this._selectableMode
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
    attrs.overline = (packed & ATTR_OVERLINE) !== 0 ? true : undefined

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

    // Wide character consistency: when overwriting a continuation cell (second
    // half of a wide char), the leading main cell at x-1 must be replaced with
    // a space (matching Ink's overlay boundary clearing — see ink/output.ts).
    // Otherwise the buffer would have a wide-char glyph with no continuation,
    // and the terminal would render a half-visible wide character past the
    // overlay. When overwriting a wide char's main cell with a non-wide char,
    // clear the continuation cell at x+1 the same way.
    if (!(cell.continuation ?? false)) {
      const prevPacked = this.cells[idx]
      if (prevPacked !== undefined && (prevPacked & CONTINUATION_FLAG) !== 0 && x > 0) {
        // Overwriting a continuation cell — replace the leading wide-char cell
        // at x-1 with a space and clear its wide flag. This matches Ink's
        // pre-write boundary cleanup (ink/output.ts: currentLine[offsetX-1] = spaceCell).
        const prevIdx = idx - 1
        this.cells[prevIdx] = this.cells[prevIdx]! & ~WIDE_FLAG
        this.chars[prevIdx] = " "
      }
    }
    if (!(cell.wide ?? false)) {
      const prevPacked = this.cells[idx]
      if (prevPacked !== undefined && (prevPacked & WIDE_FLAG) !== 0 && x + 1 < this.width) {
        // Overwriting a wide cell with a non-wide char — clear continuation at x+1
        const nextIdx = idx + 1
        this.cells[nextIdx] = this.cells[nextIdx]! & ~CONTINUATION_FLAG
        this.chars[nextIdx] = " "
      }
    }

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
    if (this._selectableMode) packed = (packed | SELECTABLE_FLAG) >>> 0
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

    // Write trap for SILVERY_STRICT mismatch diagnosis (fill path)
    const trap = (globalThis as any).__silvery_write_trap
    if (trap && trap.x >= startX && trap.x < endX && trap.y >= startY && trap.y < endY) {
      const stack = new Error().stack?.split("\n").slice(1, 6).join("\n") ?? ""
      const ch = cell.char ?? " "
      trap.log.push(
        `  FILL char="${ch}" fg=${cell.fg ?? "null"} bg=${cell.bg ?? "null"} rect=(${x},${y},${width},${height})\n${stack}`,
      )
    }

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
    let packed = packCell(fullCell)
    if (this._selectableMode) packed = (packed | SELECTABLE_FLAG) >>> 0

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
   * Restyle a rectangular region — update fg, bg, and attrs on existing cells
   * without changing character content (char, wide, continuation, hyperlink).
   *
   * This is the style-only fast path: when only visual props changed (color,
   * bold, dim, inverse, etc.) but text content and layout are identical, we
   * can skip text collection/formatting and just update the style metadata.
   *
   * @param x      Left column (inclusive)
   * @param y      Top row (inclusive)
   * @param width  Region width
   * @param height Region height
   * @param style  New style to apply (fg, bg, attrs, underlineColor)
   */
  restyleRegion(x: number, y: number, width: number, height: number, style: Style): void {
    const endX = Math.min(x + width, this.width)
    const endY = Math.min(y + height, this.height)
    const startX = Math.max(0, x)
    const startY = Math.max(0, y)

    if (startX >= endX || startY >= endY) return

    // Pre-compute style-related packed bits
    const fgIndex = colorToIndex(style.fg) & 0xff
    const bgIndex = (colorToIndex(style.bg) & 0xff) << 8
    const attrBits = attrsToNumber(style.attrs)
    const hasTrueColorFg = isTrueColor(style.fg)
    const hasTrueColorBg = isTrueColor(style.bg)
    const trueColorFgFlag = hasTrueColorFg ? TRUE_COLOR_FG_FLAG : 0
    const trueColorBgFlag = hasTrueColorBg ? TRUE_COLOR_BG_FLAG : 0
    const trueColorFg = hasTrueColorFg ? (style.fg as { r: number; g: number; b: number }) : null
    const trueColorBg = hasTrueColorBg ? (style.bg as { r: number; g: number; b: number }) : null
    const underlineColor = style.underlineColor ?? null
    const hasUnderlineColor = underlineColor !== null

    // Style bits to apply (everything except char position flags)
    const styleBits = fgIndex | bgIndex | attrBits | trueColorFgFlag | trueColorBgFlag

    // Mask to preserve: wide, continuation, selectable
    // Clear: fg index (0-7), bg index (8-15), attrs (16-26), true color flags (29-30)
    const PRESERVE_MASK = WIDE_FLAG | CONTINUATION_FLAG | SELECTABLE_FLAG
    const needFgDelete = !hasTrueColorFg && this.fgColors.size > 0
    const needBgDelete = !hasTrueColorBg && this.bgColors.size > 0
    const needUlDelete = !hasUnderlineColor && this.underlineColors.size > 0

    // Mark affected rows dirty
    for (let cy = startY; cy < endY; cy++) {
      this._dirtyRows[cy] = 1
    }
    if (this._minDirtyRow === -1 || startY < this._minDirtyRow) this._minDirtyRow = startY
    if (endY - 1 > this._maxDirtyRow) this._maxDirtyRow = endY - 1

    for (let cy = startY; cy < endY; cy++) {
      const rowBase = cy * this.width
      for (let cx = startX; cx < endX; cx++) {
        const idx = rowBase + cx

        // Preserve char position flags, replace style bits
        const oldPacked = this.cells[idx]!
        this.cells[idx] = ((oldPacked & PRESERVE_MASK) >>> 0) | styleBits

        // Handle true color maps
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
      }
    }
  }

  /**
   * Fill only the background color of a region — update bg on existing cells
   * without changing character content, foreground, or attributes.
   *
   * Unlike fill() which writes space characters, this preserves existing chars.
   * Used by the style-only fast path: when a Box's backgroundColor changes but
   * children are unchanged, fillBg() paints the new bg without destroying child
   * chars. Clean children can then be skipped (their chars are correct from the
   * clone, their bg was updated by fillBg).
   *
   * @param x      Left column (inclusive)
   * @param y      Top row (inclusive)
   * @param width  Region width
   * @param height Region height
   * @param bg     New background color
   */
  fillBg(x: number, y: number, width: number, height: number, bg: Color): void {
    const endX = Math.min(x + width, this.width)
    const endY = Math.min(y + height, this.height)
    const startX = Math.max(0, x)
    const startY = Math.max(0, y)

    if (startX >= endX || startY >= endY) return

    const bgIndex = (colorToIndex(bg) & 0xff) << 8
    const hasTrueColorBg = isTrueColor(bg)
    const trueColorBg = hasTrueColorBg ? (bg as { r: number; g: number; b: number }) : null
    const needBgDelete = !hasTrueColorBg && this.bgColors.size > 0

    // Mask to clear: bg index (bits 8-15) and TRUE_COLOR_BG_FLAG (bit 30)
    const BG_CLEAR_MASK = ~((0xff << 8) | TRUE_COLOR_BG_FLAG)
    const trueColorBgFlag = hasTrueColorBg ? TRUE_COLOR_BG_FLAG : 0

    // Mark affected rows dirty
    for (let cy = startY; cy < endY; cy++) {
      this._dirtyRows[cy] = 1
    }
    if (startY < endY) {
      if (this._minDirtyRow === -1 || startY < this._minDirtyRow) this._minDirtyRow = startY
      if (endY - 1 > this._maxDirtyRow) this._maxDirtyRow = endY - 1
    }

    for (let cy = startY; cy < endY; cy++) {
      const rowBase = cy * this.width
      for (let cx = startX; cx < endX; cx++) {
        const idx = rowBase + cx

        // Clear old bg bits, set new bg bits (preserve everything else)
        const oldPacked = this.cells[idx]!
        this.cells[idx] = ((oldPacked & BG_CLEAR_MASK) >>> 0) | bgIndex | trueColorBgFlag

        // Handle true color bg map
        if (hasTrueColorBg) {
          this.bgColors.set(idx, trueColorBg!)
        } else if (needBgDelete) {
          this.bgColors.delete(idx)
        }
      }
    }
  }

  /**
   * OR-combine SGR attribute bits into every cell in a rectangular region —
   * WITHOUT modifying glyphs, fg, bg, wide flags, selectable flag, or any
   * other per-cell state.
   *
   * This is the transparent-overlay primitive. It lets a Box (or any caller)
   * layer an underline / strikethrough / bold / etc. onto existing content
   * without overwriting what's underneath.
   *
   * Semantics:
   * - `attrs.underlineStyle` (or `attrs.underline: true` via attrsToNumber)
   *   REPLACES any existing underline style on each cell — 3-bit field, one
   *   value wins. This matches CSS `text-decoration` overlay semantics where
   *   a decoration container sets the decoration.
   * - All other attr bits (bold/dim/italic/blink/inverse/hidden/strikethrough)
   *   OR-in — existing attrs are preserved, new attrs add to them.
   * - `underlineColor` is applied only when explicitly provided; otherwise
   *   each cell keeps its existing underline color.
   *
   * Use cases:
   * - Overscroll indicator: `<Box underline="single" position="absolute" />`
   *   overlays an underline on the last row without touching the text.
   * - Error squiggly across a paragraph: `<Box underline="curly">`.
   * - Heading visual emphasis: `<Box underline="double">`.
   *
   * @param x      Left column (inclusive)
   * @param y      Top row (inclusive)
   * @param width  Region width
   * @param height Region height
   * @param attrs  Attributes to merge onto every cell
   * @param underlineColor Optional underline color — when provided, replaces the
   *   existing underlineColor on each cell. `null` clears it. `undefined`
   *   leaves it untouched.
   */
  mergeAttrsInRect(
    x: number,
    y: number,
    width: number,
    height: number,
    attrs: CellAttrs,
    underlineColor?: Color,
  ): void {
    const endX = Math.min(x + width, this.width)
    const endY = Math.min(y + height, this.height)
    const startX = Math.max(0, x)
    const startY = Math.max(0, y)

    if (startX >= endX || startY >= endY) return

    const attrBits = attrsToNumber(attrs)
    if (attrBits === 0 && underlineColor === undefined) return

    // Separate the underline-style bits (bits 24-26) from the OR-in bits
    // (bits 16-22 — bold, dim, italic, blink, inverse, hidden, strikethrough).
    // Underline REPLACES rather than OR-combines so callers can request a
    // specific style without accumulating with existing ones.
    const UL_MASK = UNDERLINE_STYLE_MASK
    const orInBits = attrBits & ~UL_MASK
    const newUlBits = attrBits & UL_MASK
    const setUnderline = newUlBits !== 0
    const setUnderlineColor = underlineColor !== undefined

    // Mark affected rows dirty
    for (let cy = startY; cy < endY; cy++) {
      this._dirtyRows[cy] = 1
    }
    if (this._minDirtyRow === -1 || startY < this._minDirtyRow) this._minDirtyRow = startY
    if (endY - 1 > this._maxDirtyRow) this._maxDirtyRow = endY - 1

    const hasTrueColorUl = setUnderlineColor && isTrueColor(underlineColor)
    const trueColorUl = hasTrueColorUl
      ? (underlineColor as { r: number; g: number; b: number })
      : null

    for (let cy = startY; cy < endY; cy++) {
      const rowBase = cy * this.width
      for (let cx = startX; cx < endX; cx++) {
        const idx = rowBase + cx
        const oldPacked = this.cells[idx]!

        let newPacked = (oldPacked | orInBits) >>> 0
        if (setUnderline) {
          // Clear old underline bits, set new ones
          newPacked = (((newPacked & ~UL_MASK) >>> 0) | newUlBits) >>> 0
        }
        this.cells[idx] = newPacked

        if (setUnderlineColor) {
          if (underlineColor === null) {
            this.underlineColors.delete(idx)
          } else if (hasTrueColorUl) {
            this.underlineColors.set(idx, trueColorUl!)
          } else {
            // 256-color / palette index
            this.underlineColors.set(idx, underlineColor!)
          }
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
    // Clone starts with all rows CLEAN. The render phase will mark only
    // the rows it modifies as dirty. diffBuffers() then skips clean rows,
    // which are guaranteed identical to the prev buffer (since this is a clone).
    copy._dirtyRows.fill(0)
    copy._minDirtyRow = -1
    copy._maxDirtyRow = -1
    // Deep-copy row metadata
    copy._rowMetadata = this._rowMetadata.map((m) => ({ ...m }))
    // Phase 2 Step 5 of paint-clear-invariant L5: outline snapshots no
    // longer live on `TerminalBuffer`. Cross-frame outline state is now
    // owned by `createAg` via `RenderPostState` (see render-post-state.ts).
    // The buffer is now a pure cell store with no across-frame coupling
    // beyond the cells themselves.
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

    // Quick check: packed metadata must match (mask out SELECTABLE_FLAG — it's
    // selection metadata, not visual output, and must not trigger output diffs)
    const mask = ~SELECTABLE_FLAG
    if ((this.cells[idx]! & mask) !== (other.cells[otherIdx]! & mask)) {
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
    // Mask out SELECTABLE_FLAG — it's selection metadata, not visual output
    const mask = ~SELECTABLE_FLAG
    for (let i = 0; i < w; i++) {
      if ((this.cells[start + i]! & mask) !== (other.cells[otherStart + i]! & mask)) return false
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
    Boolean(a.overline) === Boolean(b.overline) &&
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
    // Track string offset for each column (needed because continuation cells
    // are skipped, making string length != column count for wide chars)
    let strOffset = 0
    let contentEdgeStrOffset = 0
    const contentEdge = trimTrailingWhitespace ? getContentEdge(buffer, y) : 0
    for (let x = 0; x < buffer.width; x++) {
      // Use zero-allocation accessors instead of getCell()
      if (buffer.isCellContinuation(x, y)) continue
      line += buffer.getCellChar(x, y)
      strOffset++
      // Track the string offset corresponding to the content edge column
      if (x < contentEdge) {
        contentEdgeStrOffset = strOffset
      }
    }
    if (trimTrailingWhitespace) {
      // Smart trim: use content edge to preserve styled trailing spaces
      // while removing unstyled buffer padding.
      const trimmed = line.trimEnd()
      line =
        trimmed.length >= contentEdgeStrOffset ? trimmed : line.substring(0, contentEdgeStrOffset)
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
  // Mask out structural flags (wide, continuation) that don't indicate actual content.
  // Also mask SELECTABLE_FLAG (bit 31) — it's selection metadata, not styling.
  // True-color flags DO indicate styled content (they mean fg/bg is set in Maps).
  const FLAG_MASK = ~(WIDE_FLAG | CONTINUATION_FLAG | SELECTABLE_FLAG)
  for (let x = buffer.width - 1; x >= 0; x--) {
    // Skip continuation cells (trailing half of wide chars) — the main cell covers them
    if (buffer.isCellContinuation(x, y)) continue
    // Check if cell has any actual styling (fg, bg, text attrs) after masking structural flags
    const attrs = buffer.getCellAttrs(x, y) & FLAG_MASK
    if (attrs !== 0) return x + 1
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
          // Close previous hyperlink using the same format as the open
          line += emitHyperlinkClose(currentHyperlink)
        }
        if (cellHyperlink) {
          line += emitHyperlinkOpen(cellHyperlink)
        }
        currentHyperlink = cellHyperlink
      }

      // Check if style changed — emit minimal transition (chalk-compatible)
      const cellStyle: Style = {
        fg: cell.fg,
        bg: cell.bg,
        underlineColor: cell.underlineColor,
        attrs: cell.attrs,
      }
      if (!styleEquals(currentStyle, cellStyle)) {
        line += styleTransitionCodes(currentStyle, cellStyle)
        currentStyle = cellStyle
      }

      line += cell.char
    }

    // Close any open hyperlink at end of line
    if (currentHyperlink) {
      line += emitHyperlinkClose(currentHyperlink)
      currentHyperlink = undefined
    }

    // Reset style at end of line using per-attribute resets (chalk-compatible)
    if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
      line += styleResetCodes(currentStyle)
      currentStyle = null
    }

    if (trimTrailingWhitespace) {
      // Need to be careful not to strip ANSI codes
      // Only trim actual whitespace at the end
      line = trimTrailingWhitespacePreservingAnsi(line)
    }
    lines.push(line)
  }

  // Final per-attribute reset (chalk-compatible)
  let result = lines.join("\n")
  if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
    result += styleResetCodes(currentStyle)
  }

  if (trimEmptyLines) {
    // Remove empty lines at the end (but preserve ANSI resets)
    result = result.replace(/\n+$/, "")
  }

  return result
}

// ============================================================================
// Hyperlink Format Helpers
// ============================================================================

/**
 * Decode hyperlink format metadata from URL prefix.
 * parseAnsiText encodes the original OSC format (C1 vs ESC, BEL vs ST)
 * as a prefix: \x01<tag>\x02<url>
 *
 * Tags:
 *   c1b = C1 OSC (\x9d) + BEL (\x07) terminator
 *   c1s = C1 OSC (\x9d) + ST (\x1b\\) terminator
 *   e7b = ESC OSC (\x1b]) + BEL (\x07) terminator
 *   (no prefix) = ESC OSC + ST (default)
 */
function decodeHyperlinkFormat(encoded: string): {
  url: string
  oscIntro: string
  oscClose: string
  closeIntro: string
  closeTerminator: string
} {
  if (encoded.charCodeAt(0) === 1) {
    const sepIdx = encoded.indexOf("\x02")
    if (sepIdx > 0) {
      const tag = encoded.slice(1, sepIdx)
      const url = encoded.slice(sepIdx + 1)
      if (tag === "c1b") {
        return {
          url,
          oscIntro: "\x9d",
          oscClose: "\x9d",
          closeIntro: "\x9d",
          closeTerminator: "\x07",
        }
      }
      if (tag === "c1s") {
        return {
          url,
          oscIntro: "\x9d",
          oscClose: "\x9d",
          closeIntro: "\x9d",
          closeTerminator: "\x1b\\",
        }
      }
      if (tag === "e7b") {
        return {
          url,
          oscIntro: "\x1b]",
          oscClose: "\x1b]",
          closeIntro: "\x1b]",
          closeTerminator: "\x07",
        }
      }
    }
  }
  // Default: ESC OSC + ST
  return {
    url: encoded,
    oscIntro: "\x1b]",
    oscClose: "\x1b]",
    closeIntro: "\x1b]",
    closeTerminator: "\x1b\\",
  }
}

/** Emit OSC 8 hyperlink open sequence, respecting format metadata in URL. */
function emitHyperlinkOpen(encoded: string): string {
  const fmt = decodeHyperlinkFormat(encoded)
  return `${fmt.oscIntro}8;;${fmt.url}${fmt.closeTerminator}`
}

/** Emit OSC 8 hyperlink close sequence, respecting format metadata in URL. */
function emitHyperlinkClose(encoded: string): string {
  const fmt = decodeHyperlinkFormat(encoded)
  return `${fmt.closeIntro}8;;${fmt.closeTerminator}`
}

// ============================================================================
// xterm-256 Color Palette
// ============================================================================

/** Standard xterm-256 color palette as hex strings. */
const XTERM_256_PALETTE: string[] = (() => {
  const palette: string[] = new Array(256)

  // Colors 0-7: standard colors
  const standard = [
    "#000000",
    "#cd0000",
    "#00cd00",
    "#cdcd00",
    "#0000ee",
    "#cd00cd",
    "#00cdcd",
    "#e5e5e5",
  ]
  // Colors 8-15: bright colors
  const bright = [
    "#7f7f7f",
    "#ff0000",
    "#00ff00",
    "#ffff00",
    "#5c5cff",
    "#ff00ff",
    "#00ffff",
    "#ffffff",
  ]
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
      "#" +
      r.toString(16).padStart(2, "0") +
      g.toString(16).padStart(2, "0") +
      b.toString(16).padStart(2, "0")
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
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
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
    attrs.overline ||
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
// =============================================================================
// Color code helpers (imported from ansi/sgr-codes.ts)
// =============================================================================

/**
 * Convert style to ANSI escape sequence (chalk-compatible format).
 *
 * Emits only non-default attributes with no reset prefix. Called when there
 * is no previous style context (first cell), so the terminal is already in
 * reset state. Each attribute gets its own \x1b[Xm sequence.
 */
export function styleToAnsiCodes(style: Style): string {
  const fg = style.fg
  const bg = style.bg

  let result = ""

  // Foreground color
  if (fg !== null) {
    result += `\x1b[${fgColorCode(fg)}m`
  }

  // Background color (DEFAULT_BG sentinel = terminal default, skip)
  if (bg !== null && !isDefaultBg(bg)) {
    result += `\x1b[${bgColorCode(bg)}m`
  }

  // Attributes
  if (style.attrs.bold) result += "\x1b[1m"
  if (style.attrs.dim) result += "\x1b[2m"
  if (style.attrs.italic) result += "\x1b[3m"

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
      result += `\x1b[4:${subparam}m`
    }
  } else if (style.attrs.underline) {
    result += "\x1b[4m" // Simple underline
  }

  // Use SGR 7 for inverse — lets the terminal correctly swap fg/bg
  if (style.attrs.inverse) result += "\x1b[7m"
  if (style.attrs.strikethrough) result += "\x1b[9m"
  if (style.attrs.overline) result += "\x1b[53m"

  // Underline color (SGR 58)
  if (style.underlineColor !== null && style.underlineColor !== undefined) {
    if (typeof style.underlineColor === "number") {
      result += `\x1b[58;5;${style.underlineColor}m`
    } else {
      result += `\x1b[58;2;${style.underlineColor.r};${style.underlineColor.g};${style.underlineColor.b}m`
    }
  }

  return result
}

/**
 * Compute the minimal SGR transition between two styles (chalk-compatible).
 *
 * When oldStyle is null (first cell or after reset), falls through to
 * full generation via styleToAnsiCodes. Otherwise, diffs attribute
 * by attribute and emits only changed SGR codes as individual \x1b[Xm sequences.
 */
export function styleTransitionCodes(oldStyle: Style | null, newStyle: Style): string {
  // First cell or after reset — full generation
  if (!oldStyle) return styleToAnsiCodes(newStyle)

  // Same style — nothing to emit
  if (styleEquals(oldStyle, newStyle)) return ""

  let result = ""
  const oa = oldStyle.attrs
  const na = newStyle.attrs

  // Bold and dim share SGR 22 as their off-code
  const boldChanged = Boolean(oa.bold) !== Boolean(na.bold)
  const dimChanged = Boolean(oa.dim) !== Boolean(na.dim)
  if (boldChanged || dimChanged) {
    const boldOff = boldChanged && !na.bold
    const dimOff = dimChanged && !na.dim
    if (boldOff || dimOff) {
      result += "\x1b[22m"
      if (na.bold) result += "\x1b[1m"
      if (na.dim) result += "\x1b[2m"
    } else {
      if (boldChanged && na.bold) result += "\x1b[1m"
      if (dimChanged && na.dim) result += "\x1b[2m"
    }
  }
  if (Boolean(oa.italic) !== Boolean(na.italic)) {
    result += na.italic ? "\x1b[3m" : "\x1b[23m"
  }

  // Underline
  const oldUl = Boolean(oa.underline)
  const newUl = Boolean(na.underline)
  const oldUlStyle = oa.underlineStyle ?? false
  const newUlStyle = na.underlineStyle ?? false
  if (oldUl !== newUl || oldUlStyle !== newUlStyle) {
    if (typeof na.underlineStyle === "string") {
      const styleMap: Record<string, number> = {
        single: 1,
        double: 2,
        curly: 3,
        dotted: 4,
        dashed: 5,
      }
      const sub = styleMap[na.underlineStyle]
      if (sub !== undefined && sub !== 0) {
        result += `\x1b[4:${sub}m`
      } else if (newUl) {
        result += "\x1b[4m"
      } else {
        result += "\x1b[24m"
      }
    } else if (newUl) {
      result += "\x1b[4m"
    } else {
      result += "\x1b[24m"
    }
  }

  if (Boolean(oa.inverse) !== Boolean(na.inverse)) {
    result += na.inverse ? "\x1b[7m" : "\x1b[27m"
  }
  if (Boolean(oa.strikethrough) !== Boolean(na.strikethrough)) {
    result += na.strikethrough ? "\x1b[9m" : "\x1b[29m"
  }
  // Overline (SGR 53/55)
  if (Boolean(oa.overline) !== Boolean(na.overline)) {
    result += na.overline ? "\x1b[53m" : "\x1b[55m"
  }

  // Foreground color
  if (!colorEquals(oldStyle.fg, newStyle.fg)) {
    if (newStyle.fg === null) {
      result += "\x1b[39m"
    } else {
      result += `\x1b[${fgColorCode(newStyle.fg)}m`
    }
  }

  // Background color
  if (!colorEquals(oldStyle.bg, newStyle.bg)) {
    if (newStyle.bg === null) {
      result += "\x1b[49m"
    } else {
      result += `\x1b[${bgColorCode(newStyle.bg)}m`
    }
  }

  // Underline color (SGR 58/59)
  if (!colorEquals(oldStyle.underlineColor, newStyle.underlineColor)) {
    if (newStyle.underlineColor === null || newStyle.underlineColor === undefined) {
      result += "\x1b[59m"
    } else if (typeof newStyle.underlineColor === "number") {
      result += `\x1b[58;5;${newStyle.underlineColor}m`
    } else {
      result += `\x1b[58;2;${newStyle.underlineColor.r};${newStyle.underlineColor.g};${newStyle.underlineColor.b}m`
    }
  }

  return result
}

/**
 * Emit per-attribute reset codes for all active attributes in a style.
 * Returns empty string if no attributes are active.
 * Uses individual \x1b[Xm sequences to match chalk's format.
 */
export function styleResetCodes(style: Style): string {
  let result = ""
  // Attributes (order: underline, bold/dim, italic, strikethrough, inverse — matches chalk close order)
  if (style.attrs.underline || style.attrs.underlineStyle) result += "\x1b[24m"
  if (style.attrs.bold || style.attrs.dim) result += "\x1b[22m"
  if (style.attrs.italic) result += "\x1b[23m"
  if (style.attrs.strikethrough) result += "\x1b[29m"
  if (style.attrs.inverse) result += "\x1b[27m"
  if (style.attrs.overline) result += "\x1b[55m"
  // Colors
  if (style.bg !== null && !isDefaultBg(style.bg)) result += "\x1b[49m"
  if (style.fg !== null) result += "\x1b[39m"
  // Underline color
  if (style.underlineColor !== null && style.underlineColor !== undefined) result += "\x1b[59m"
  return result
}

/**
 * Trim trailing whitespace from a string while preserving ANSI codes.
 */
export function trimTrailingWhitespacePreservingAnsi(str: string): string {
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

// ============================================================================
// TextFrame — Immutable Snapshot
// ============================================================================

import type { TextFrame, FrameCell, RGB } from "@silvery/ag/text-frame"

/**
 * Standard ANSI 256-color palette → RGB lookup.
 * Colors 0-15: standard + bright colors (approximate).
 * Colors 16-231: 6×6×6 color cube.
 * Colors 232-255: grayscale ramp.
 *
 * Exported for the backdrop-fade pipeline pass, which needs to resolve
 * palette-indexed cells to RGB before blending via `@silvery/color`.
 */
export function ansi256ToRgb(idx: number): RGB {
  if (idx < 16) {
    // Standard 16 colors (same values used by xterm)
    const table: [number, number, number][] = [
      [0, 0, 0],
      [128, 0, 0],
      [0, 128, 0],
      [128, 128, 0],
      [0, 0, 128],
      [128, 0, 128],
      [0, 128, 128],
      [192, 192, 192],
      [128, 128, 128],
      [255, 0, 0],
      [0, 255, 0],
      [255, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [0, 255, 255],
      [255, 255, 255],
    ]
    const [r, g, b] = table[idx]!
    return { r, g, b }
  }
  if (idx < 232) {
    // 6×6×6 color cube (indices 16-231)
    const i = idx - 16
    const r = Math.floor(i / 36)
    const g = Math.floor((i % 36) / 6)
    const b = i % 6
    return {
      r: r ? r * 40 + 55 : 0,
      g: g ? g * 40 + 55 : 0,
      b: b ? b * 40 + 55 : 0,
    }
  }
  // Grayscale ramp (indices 232-255)
  const v = (idx - 232) * 10 + 8
  return { r: v, g: v, b: v }
}

/** Resolve a buffer Color (number | RGB | null) to FrameCell RGB (RGB | null). */
function resolveColor(color: Color): RGB | null {
  if (color === null) return null
  if (typeof color === "number") return ansi256ToRgb(color)
  // RGB object — check for DEFAULT_BG sentinel
  if (color.r === -1) return null
  return color
}

/** Convert a buffer Cell to an immutable FrameCell with resolved RGB colors. */
export function cellToFrameCell(c: Cell): FrameCell {
  const ulStyle =
    c.attrs.underlineStyle ?? (c.attrs.underline ? ("single" as const) : (false as const))
  return {
    char: c.char,
    fg: resolveColor(c.fg),
    bg: resolveColor(c.bg),
    bold: c.attrs.bold ?? false,
    dim: c.attrs.dim ?? false,
    italic: c.attrs.italic ?? false,
    underline: ulStyle,
    underlineColor: resolveColor(c.underlineColor ?? null),
    overline: c.attrs.overline ?? false,
    strikethrough: c.attrs.strikethrough ?? false,
    inverse: c.attrs.inverse ?? false,
    blink: c.attrs.blink ?? false,
    hidden: c.attrs.hidden ?? false,
    wide: c.wide,
    continuation: c.continuation,
    hyperlink: c.hyperlink ?? null,
  }
}

/** Empty FrameCell returned for out-of-bounds access. */
export const EMPTY_FRAME_CELL: FrameCell = Object.freeze({
  char: " ",
  fg: null,
  bg: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false as const,
  underlineColor: null,
  overline: false,
  strikethrough: false,
  inverse: false,
  blink: false,
  hidden: false,
  wide: false,
  continuation: false,
  hyperlink: null,
})

/**
 * Create an immutable TextFrame snapshot from a TerminalBuffer.
 *
 * The snapshot is detached from the source buffer — mutations to the buffer
 * after this call do not affect the frame. Text and ANSI are lazily computed
 * on first access.
 *
 * This is the primary public read API for rendered output. Internal pipeline
 * code (diff-buffers, render phases) continues to use TerminalBuffer directly.
 */
export function createTextFrame(buffer: TerminalBuffer): TextFrame {
  const width = buffer.width
  const height = buffer.height

  // Snapshot: lazy clone — only on first text/ansi/cell access. Hot test
  // paths create frames they never read, so eager cloning charges every
  // caller for an 80K-cell buffer copy that's discarded immediately.
  // Callers who need true construction-time detachment (i.e. the frame
  // must be safe across buffer mutations between createTextFrame() and
  // first read) should request an eager/COW snapshot via a dedicated path
  // instead of relying on createTextFrame()'s default.
  let _snapshot: TerminalBuffer | undefined
  function getSnapshot(): TerminalBuffer {
    if (!_snapshot) _snapshot = buffer.clone()
    return _snapshot
  }

  // Cell data: lazy — only built on first cell() access.
  // At 400x200, eager construction creates 80,000 Cell objects (~10ms).
  // Most frames only access .text or .ansi, never individual cells.
  let _cellData: Cell[] | undefined
  function getCellData(): Cell[] {
    if (!_cellData) {
      const snap = getSnapshot()
      _cellData = new Array(width * height)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          _cellData[y * width + x] = snap.getCell(x, y)
        }
      }
    }
    return _cellData
  }

  // Lazy caches
  let _text: string | undefined
  let _ansi: string | undefined
  let _lines: string[] | undefined

  const frame: TextFrame = {
    width,
    height,

    get text(): string {
      if (_text === undefined) _text = bufferToText(getSnapshot())
      return _text
    },

    get ansi(): string {
      if (_ansi === undefined) _ansi = bufferToStyledText(getSnapshot())
      return _ansi
    },

    get lines(): string[] {
      if (_lines === undefined) _lines = frame.text.split("\n")
      return _lines
    },

    cell(col: number, row: number): FrameCell {
      if (col < 0 || col >= width || row < 0 || row >= height) {
        return EMPTY_FRAME_CELL
      }
      return cellToFrameCell(getCellData()[row * width + col]!)
    },

    containsText(text: string): boolean {
      return frame.text.includes(text)
    },
  }

  return frame
}
