/**
 * Terminal buffer implementation for Inkx.
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
export type UnderlineStyle = false | 'single' | 'double' | 'curly' | 'dotted' | 'dashed';

/**
 * Text attributes that can be applied to a cell.
 */
export interface CellAttrs {
	bold?: boolean;
	dim?: boolean;
	italic?: boolean;
	/** Simple underline flag (for backwards compatibility) */
	underline?: boolean;
	/**
	 * Underline style: 'single' | 'double' | 'curly' | 'dotted' | 'dashed'.
	 * When set, takes precedence over the underline boolean.
	 */
	underlineStyle?: UnderlineStyle;
	blink?: boolean;
	inverse?: boolean;
	hidden?: boolean;
	strikethrough?: boolean;
}

/**
 * Color representation.
 * - number: 256-color index (0-255)
 * - RGB object: true color
 * - null: default/inherit
 */
export type Color = number | { r: number; g: number; b: number } | null;

/**
 * A single cell in the terminal buffer.
 */
export interface Cell {
	/** The character/grapheme in this cell */
	char: string;
	/** Foreground color */
	fg: Color;
	/** Background color */
	bg: Color;
	/**
	 * Underline color (independent of fg).
	 * Uses SGR 58. If null, underline uses fg color.
	 */
	underlineColor: Color;
	/** Text attributes */
	attrs: CellAttrs;
	/** True if this is a wide character (CJK, emoji, etc.) */
	wide: boolean;
	/** True if this is the continuation cell after a wide character */
	continuation: boolean;
}

/**
 * Style information for a cell (excludes char and position flags).
 */
export interface Style {
	fg: Color;
	bg: Color;
	/**
	 * Underline color (independent of fg).
	 * Uses SGR 58. If null, underline uses fg color.
	 */
	underlineColor?: Color;
	attrs: CellAttrs;
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
const ATTR_BOLD = 1 << 16;
const ATTR_DIM = 1 << 17;
const ATTR_ITALIC = 1 << 18;
const ATTR_BLINK = 1 << 19;
const ATTR_INVERSE = 1 << 20;
const ATTR_HIDDEN = 1 << 21;
const ATTR_STRIKETHROUGH = 1 << 22;
// bit 23 spare

// Underline style (3 bits in positions 24-26)
// 0 = no underline, 1 = single, 2 = double, 3 = curly, 4 = dotted, 5 = dashed
const UNDERLINE_STYLE_SHIFT = 24;
const UNDERLINE_STYLE_MASK = 0x7 << UNDERLINE_STYLE_SHIFT; // 3 bits

// Flag bit positions (in bits 27-31)
const WIDE_FLAG = 1 << 27;
const CONTINUATION_FLAG = 1 << 28;
const TRUE_COLOR_FG_FLAG = 1 << 29;
const TRUE_COLOR_BG_FLAG = 1 << 30;
// bit 31 spare

// Default empty cell
const EMPTY_CELL: Cell = {
	char: ' ',
	fg: null,
	bg: null,
	underlineColor: null,
	attrs: {},
	wide: false,
	continuation: false,
};

// ============================================================================
// Packing/Unpacking Helpers
// ============================================================================

/**
 * Map UnderlineStyle to numeric value for bit packing.
 */
function underlineStyleToNumber(style: UnderlineStyle | undefined): number {
	switch (style) {
		case false:
			return 0;
		case 'single':
			return 1;
		case 'double':
			return 2;
		case 'curly':
			return 3;
		case 'dotted':
			return 4;
		case 'dashed':
			return 5;
		default:
			return 0; // undefined or unknown = no underline
	}
}

/**
 * Map numeric value back to UnderlineStyle.
 */
function numberToUnderlineStyle(n: number): UnderlineStyle | undefined {
	switch (n) {
		case 0:
			return undefined; // No underline
		case 1:
			return 'single';
		case 2:
			return 'double';
		case 3:
			return 'curly';
		case 4:
			return 'dotted';
		case 5:
			return 'dashed';
		default:
			return undefined;
	}
}

/**
 * Convert CellAttrs to bits for packing (used internally by packCell).
 * Note: This packs into the full 32-bit word, not just the attrs byte.
 */
export function attrsToNumber(attrs: CellAttrs): number {
	let n = 0;
	if (attrs.bold) n |= ATTR_BOLD;
	if (attrs.dim) n |= ATTR_DIM;
	if (attrs.italic) n |= ATTR_ITALIC;
	if (attrs.blink) n |= ATTR_BLINK;
	if (attrs.inverse) n |= ATTR_INVERSE;
	if (attrs.hidden) n |= ATTR_HIDDEN;
	if (attrs.strikethrough) n |= ATTR_STRIKETHROUGH;

	// Pack underline style (3 bits)
	// If underlineStyle is set, use it. Otherwise, check underline boolean.
	const ulStyle = attrs.underlineStyle ?? (attrs.underline ? 'single' : undefined);
	n |= underlineStyleToNumber(ulStyle) << UNDERLINE_STYLE_SHIFT;

	return n;
}

/**
 * Convert a number back to CellAttrs.
 */
export function numberToAttrs(n: number): CellAttrs {
	const attrs: CellAttrs = {};
	if (n & ATTR_BOLD) attrs.bold = true;
	if (n & ATTR_DIM) attrs.dim = true;
	if (n & ATTR_ITALIC) attrs.italic = true;
	if (n & ATTR_BLINK) attrs.blink = true;
	if (n & ATTR_INVERSE) attrs.inverse = true;
	if (n & ATTR_HIDDEN) attrs.hidden = true;
	if (n & ATTR_STRIKETHROUGH) attrs.strikethrough = true;

	// Unpack underline style
	const ulStyleNum = (n & UNDERLINE_STYLE_MASK) >> UNDERLINE_STYLE_SHIFT;
	const ulStyle = numberToUnderlineStyle(ulStyleNum);
	if (ulStyle) {
		attrs.underlineStyle = ulStyle;
		attrs.underline = true;
	}

	return attrs;
}

/**
 * Convert a color to an index value for packing.
 * Returns 0 for null (default), or (index + 1) for 256-color.
 * This +1 offset allows distinguishing null from black (color index 0).
 * True color is handled separately via flags and auxiliary storage.
 */
function colorToIndex(color: Color): number {
	if (color === null) return 0;
	if (typeof color === 'number') return (color & 0xff) + 1; // +1 to distinguish from null
	// True color - return 0, handle via flag
	return 0;
}

/**
 * Check if a color is true color (RGB).
 */
function isTrueColor(color: Color): color is { r: number; g: number; b: number } {
	return color !== null && typeof color === 'object';
}

/**
 * Pack cell metadata into a 32-bit number.
 */
export function packCell(cell: Cell): number {
	let packed = 0;

	// Foreground color index (bits 0-7)
	packed |= colorToIndex(cell.fg) & 0xff;

	// Background color index (bits 8-15)
	packed |= (colorToIndex(cell.bg) & 0xff) << 8;

	// Attributes (bits 16-22) and underline style (bits 24-26)
	// attrsToNumber returns bits already in their final positions
	packed |= attrsToNumber(cell.attrs);

	// Flags (bits 27-30)
	if (cell.wide) packed |= WIDE_FLAG;
	if (cell.continuation) packed |= CONTINUATION_FLAG;
	if (isTrueColor(cell.fg)) packed |= TRUE_COLOR_FG_FLAG;
	if (isTrueColor(cell.bg)) packed |= TRUE_COLOR_BG_FLAG;

	return packed;
}

/**
 * Unpack foreground color index from packed value.
 */
function unpackFgIndex(packed: number): number {
	return packed & 0xff;
}

/**
 * Unpack background color index from packed value.
 */
function unpackBgIndex(packed: number): number {
	return (packed >> 8) & 0xff;
}

/**
 * Unpack attributes from packed value.
 * Extracts both the boolean attrs (bits 16-22) and underline style (bits 24-26).
 */
function unpackAttrs(packed: number): CellAttrs {
	// numberToAttrs expects the full packed value with attrs in bits 16-22
	// and underline style in bits 24-26
	return numberToAttrs(packed);
}

/**
 * Check if wide flag is set.
 */
function unpackWide(packed: number): boolean {
	return (packed & WIDE_FLAG) !== 0;
}

/**
 * Check if continuation flag is set.
 */
function unpackContinuation(packed: number): boolean {
	return (packed & CONTINUATION_FLAG) !== 0;
}

/**
 * Check if true color foreground flag is set.
 */
function unpackTrueColorFg(packed: number): boolean {
	return (packed & TRUE_COLOR_FG_FLAG) !== 0;
}

/**
 * Check if true color background flag is set.
 */
function unpackTrueColorBg(packed: number): boolean {
	return (packed & TRUE_COLOR_BG_FLAG) !== 0;
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
	private cells: Uint32Array;
	/** Character storage (one per cell, may be multi-byte grapheme) */
	private chars: string[];
	/** True color foreground storage (only for cells with true color fg) */
	private fgColors: Map<number, { r: number; g: number; b: number }>;
	/** True color background storage (only for cells with true color bg) */
	private bgColors: Map<number, { r: number; g: number; b: number }>;
	/** Underline color storage (independent of fg, for SGR 58) */
	private underlineColors: Map<number, Color>;

	readonly width: number;
	readonly height: number;

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		const size = width * height;
		this.cells = new Uint32Array(size);
		this.chars = new Array<string>(size).fill(' ');
		this.fgColors = new Map();
		this.bgColors = new Map();
		this.underlineColors = new Map();
	}

	/**
	 * Get the index for a cell position.
	 */
	private index(x: number, y: number): number {
		return y * this.width + x;
	}

	/**
	 * Check if coordinates are within bounds.
	 */
	inBounds(x: number, y: number): boolean {
		return x >= 0 && x < this.width && y >= 0 && y < this.height;
	}

	/**
	 * Get a cell at the given position.
	 */
	getCell(x: number, y: number): Cell {
		if (!this.inBounds(x, y)) {
			return { ...EMPTY_CELL };
		}

		const idx = this.index(x, y);
		const packed = this.cells[idx];
		const char = this.chars[idx];

		// Determine foreground color
		// Color indices are stored with +1 offset (0=null, 1=black, 2=red, etc.)
		let fg: Color = null;
		if (unpackTrueColorFg(packed!)) {
			fg = this.fgColors.get(idx) ?? null;
		} else {
			const fgIndex = unpackFgIndex(packed!);
			fg = fgIndex > 0 ? fgIndex - 1 : null; // -1 to restore actual color index
		}

		// Determine background color
		let bg: Color = null;
		if (unpackTrueColorBg(packed!)) {
			bg = this.bgColors.get(idx) ?? null;
		} else {
			const bgIndex = unpackBgIndex(packed!);
			bg = bgIndex > 0 ? bgIndex - 1 : null; // -1 to restore actual color index
		}

		return {
			char: char!,
			fg,
			bg,
			underlineColor: this.underlineColors.get(idx) ?? null,
			attrs: unpackAttrs(packed!),
			wide: unpackWide(packed!),
			continuation: unpackContinuation(packed!),
		};
	}

	/**
	 * Set a cell at the given position.
	 */
	setCell(x: number, y: number, cell: Partial<Cell>): void {
		if (!this.inBounds(x, y)) {
			return;
		}

		const idx = this.index(x, y);

		// Merge with defaults for any missing properties
		const fullCell: Cell = {
			char: cell.char ?? ' ',
			fg: cell.fg ?? null,
			bg: cell.bg ?? null,
			underlineColor: cell.underlineColor ?? null,
			attrs: cell.attrs ?? {},
			wide: cell.wide ?? false,
			continuation: cell.continuation ?? false,
		};

		// Store character
		this.chars[idx] = fullCell.char;

		// Handle true color storage
		if (isTrueColor(fullCell.fg)) {
			this.fgColors.set(idx, fullCell.fg);
		} else {
			this.fgColors.delete(idx);
		}

		if (isTrueColor(fullCell.bg)) {
			this.bgColors.set(idx, fullCell.bg);
		} else {
			this.bgColors.delete(idx);
		}

		// Handle underline color storage
		if (fullCell.underlineColor !== null) {
			this.underlineColors.set(idx, fullCell.underlineColor);
		} else {
			this.underlineColors.delete(idx);
		}

		// Pack and store metadata
		this.cells[idx] = packCell(fullCell);
	}

	/**
	 * Fill a region with a cell.
	 */
	fill(x: number, y: number, width: number, height: number, cell: Partial<Cell>): void {
		const endX = Math.min(x + width, this.width);
		const endY = Math.min(y + height, this.height);
		const startX = Math.max(0, x);
		const startY = Math.max(0, y);

		for (let cy = startY; cy < endY; cy++) {
			for (let cx = startX; cx < endX; cx++) {
				this.setCell(cx, cy, cell);
			}
		}
	}

	/**
	 * Clear the buffer (fill with empty cells).
	 */
	clear(): void {
		this.cells.fill(0);
		this.chars.fill(' ');
		this.fgColors.clear();
		this.bgColors.clear();
		this.underlineColors.clear();
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
		for (let dy = 0; dy < height; dy++) {
			for (let dx = 0; dx < width; dx++) {
				const sx = srcX + dx;
				const sy = srcY + dy;
				const dstX = destX + dx;
				const dstY = destY + dy;

				if (source.inBounds(sx, sy) && this.inBounds(dstX, dstY)) {
					this.setCell(dstX, dstY, source.getCell(sx, sy));
				}
			}
		}
	}

	/**
	 * Clone this buffer.
	 */
	clone(): TerminalBuffer {
		const copy = new TerminalBuffer(this.width, this.height);
		copy.cells.set(this.cells);
		copy.chars = [...this.chars];
		copy.fgColors = new Map(this.fgColors);
		copy.bgColors = new Map(this.bgColors);
		copy.underlineColors = new Map(this.underlineColors);
		return copy;
	}

	/**
	 * Check if two cells at given positions are equal.
	 * Used for diffing.
	 */
	cellEquals(x: number, y: number, other: TerminalBuffer): boolean {
		if (!this.inBounds(x, y) || !other.inBounds(x, y)) {
			return false;
		}

		const idx = this.index(x, y);
		const otherIdx = other.index(x, y);

		// Quick check: packed metadata must match
		if (this.cells[idx] !== other.cells[otherIdx]) {
			return false;
		}

		// Character must match
		if (this.chars[idx] !== other.chars[otherIdx]) {
			return false;
		}

		// If true color flags are set, check the color values
		const packed = this.cells[idx]!;
		if (unpackTrueColorFg(packed)) {
			const a = this.fgColors.get(idx);
			const b = other.fgColors.get(otherIdx);
			if (!colorEquals(a, b)) return false;
		}
		if (unpackTrueColorBg(packed!)) {
			const a = this.bgColors.get(idx);
			const b = other.bgColors.get(otherIdx);
			if (!colorEquals(a, b)) return false;
		}

		// Check underline colors
		const ulA = this.underlineColors.get(idx) ?? null;
		const ulB = other.underlineColors.get(otherIdx) ?? null;
		if (!colorEquals(ulA, ulB)) return false;

		return true;
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compare two colors for equality.
 */
export function colorEquals(a: Color | undefined, b: Color | undefined): boolean {
	if (a === b) return true;
	if (a === null || a === undefined) return b === null || b === undefined;
	if (b === null || b === undefined) return false;
	if (typeof a === 'number') return a === b;
	if (typeof b === 'number') return false;
	return a.r === b.r && a.g === b.g && a.b === b.b;
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
		attrsEquals(a.attrs, b.attrs)
	);
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
	);
}

/**
 * Compare two styles for equality.
 */
export function styleEquals(a: Style | null, b: Style | null): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return (
		colorEquals(a.fg, b.fg) &&
		colorEquals(a.bg, b.bg) &&
		colorEquals(a.underlineColor, b.underlineColor) &&
		attrsEquals(a.attrs, b.attrs)
	);
}

/**
 * Create a buffer initialized with a specific character.
 */
export function createBuffer(width: number, height: number, char = ' '): TerminalBuffer {
	const buffer = new TerminalBuffer(width, height);
	if (char !== ' ') {
		buffer.fill(0, 0, width, height, { char });
	}
	return buffer;
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
		trimTrailingWhitespace?: boolean;
		trimEmptyLines?: boolean;
	} = {},
): string {
	const { trimTrailingWhitespace = true, trimEmptyLines = true } = options;

	const lines: string[] = [];

	for (let y = 0; y < buffer.height; y++) {
		let line = '';
		for (let x = 0; x < buffer.width; x++) {
			const cell = buffer.getCell(x, y);
			// Skip continuation cells (part of wide character)
			if (cell.continuation) continue;
			line += cell.char;
		}
		if (trimTrailingWhitespace) {
			line = line.trimEnd();
		}
		lines.push(line);
	}

	let result = lines.join('\n');
	if (trimEmptyLines) {
		result = result.trimEnd();
	}
	return result;
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
		trimTrailingWhitespace?: boolean;
		trimEmptyLines?: boolean;
	} = {},
): string {
	const { trimTrailingWhitespace = true, trimEmptyLines = true } = options;

	const lines: string[] = [];
	let currentStyle: Style | null = null;

	for (let y = 0; y < buffer.height; y++) {
		let line = '';

		for (let x = 0; x < buffer.width; x++) {
			const cell = buffer.getCell(x, y);
			// Skip continuation cells (part of wide character)
			if (cell.continuation) continue;

			// Check if style changed
			const cellStyle: Style = {
				fg: cell.fg,
				bg: cell.bg,
				underlineColor: cell.underlineColor,
				attrs: cell.attrs,
			};
			if (!styleEquals(currentStyle, cellStyle)) {
				line += styleToAnsiCodes(cellStyle);
				currentStyle = cellStyle;
			}

			line += cell.char;
		}

		// Reset style at end of line to prevent background color bleeding
		if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
			line += '\x1b[0m';
			currentStyle = null;
		}

		if (trimTrailingWhitespace) {
			// Need to be careful not to strip ANSI codes
			// Only trim actual whitespace at the end
			line = trimTrailingWhitespacePreservingAnsi(line);
		}
		lines.push(line);
	}

	// Final reset
	let result = lines.join('\n');
	if (currentStyle) {
		result += '\x1b[0m';
	}

	if (trimEmptyLines) {
		// Remove empty lines at the end (but preserve ANSI resets)
		result = result.replace(/\n+$/, '');
	}

	return result;
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
	);
}

/**
 * Convert style to ANSI escape sequence.
 *
 * Handles inverse by swapping fg/bg colors (same as output-phase.ts).
 * This ensures consistent visual output.
 */
function styleToAnsiCodes(style: Style): string {
	// Handle inverse by swapping colors (consistent with output-phase.ts)
	let fg = style.fg;
	let bg = style.bg;
	if (style.attrs.inverse) {
		[fg, bg] = [bg, fg];
	}

	const codes: number[] = [0]; // Reset first

	// Foreground color
	if (fg !== null) {
		if (typeof fg === 'number') {
			codes.push(38, 5, fg);
		} else {
			codes.push(38, 2, fg.r, fg.g, fg.b);
		}
	}

	// Background color
	if (bg !== null) {
		if (typeof bg === 'number') {
			codes.push(48, 5, bg);
		} else {
			codes.push(48, 2, bg.r, bg.g, bg.b);
		}
	}

	// Attributes
	if (style.attrs.bold) codes.push(1);
	if (style.attrs.dim) codes.push(2);
	if (style.attrs.italic) codes.push(3);

	// Build base escape sequence
	let result = `\x1b[${codes.join(';')}`;

	// Underline: use SGR 4:x if style specified, otherwise simple SGR 4
	const underlineStyle = style.attrs.underlineStyle;
	if (typeof underlineStyle === 'string') {
		const styleMap: Record<string, number> = {
			single: 1,
			double: 2,
			curly: 3,
			dotted: 4,
			dashed: 5,
		};
		const subparam = styleMap[underlineStyle];
		if (subparam !== undefined && subparam !== 0) {
			result += `;4:${subparam}`;
		}
	} else if (style.attrs.underline) {
		result += ';4'; // Simple underline
	}

	// Underline color (SGR 58)
	if (style.underlineColor !== null && style.underlineColor !== undefined) {
		if (typeof style.underlineColor === 'number') {
			result += `;58;5;${style.underlineColor}`;
		} else {
			result += `;58;2;${style.underlineColor.r};${style.underlineColor.g};${style.underlineColor.b}`;
		}
	}

	// Note: inverse is handled above by swapping colors, don't emit SGR 7
	if (style.attrs.strikethrough) result += ';9';

	return result + 'm';
}

/**
 * Trim trailing whitespace from a string while preserving ANSI codes.
 */
function trimTrailingWhitespacePreservingAnsi(str: string): string {
	// Find the last non-whitespace character or ANSI escape
	let lastContentIndex = -1;
	let i = 0;

	while (i < str.length) {
		if (str[i] === '\x1b') {
			// Found ANSI escape - skip the entire sequence
			const end = str.indexOf('m', i);
			if (end !== -1) {
				lastContentIndex = end;
				i = end + 1;
				continue;
			}
		}
		if (str[i] !== ' ' && str[i] !== '\t') {
			lastContentIndex = i;
		}
		i++;
	}

	return str.slice(0, lastContentIndex + 1);
}
