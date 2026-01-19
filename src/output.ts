/**
 * ANSI output generation for Inkx.
 *
 * Converts terminal buffers to ANSI escape sequences with:
 * - Full buffer rendering
 * - Efficient diffing between frames
 * - Cursor movement optimization
 * - Style coalescing
 */

import {
	type Cell,
	type CellAttrs,
	type Color,
	type Style,
	type TerminalBuffer,
	colorEquals,
	styleEquals,
} from './buffer.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A cell change for incremental updates.
 */
export interface CellChange {
	x: number;
	y: number;
	cell: Cell;
}

// ============================================================================
// ANSI Escape Codes
// ============================================================================

const ESC = '\x1b';
const CSI = `${ESC}[`;

// Cursor control
const CURSOR_HIDE = `${CSI}?25l`;
const CURSOR_SHOW = `${CSI}?25h`;
const CURSOR_HOME = `${CSI}H`;

// Style reset
const RESET = `${CSI}0m`;

// SGR (Select Graphic Rendition) codes
const SGR = {
	// Attributes
	bold: 1,
	dim: 2,
	italic: 3,
	underline: 4,
	blink: 5,
	inverse: 7,
	hidden: 8,
	strikethrough: 9,

	// Attribute resets
	boldOff: 22, // Also resets dim
	italicOff: 23,
	underlineOff: 24,
	blinkOff: 25,
	inverseOff: 27,
	hiddenOff: 28,
	strikethroughOff: 29,

	// Colors (foreground)
	fgDefault: 39,
	fgBlack: 30,
	fgRed: 31,
	fgGreen: 32,
	fgYellow: 33,
	fgBlue: 34,
	fgMagenta: 35,
	fgCyan: 36,
	fgWhite: 37,
	fgBrightBlack: 90,
	fgBrightRed: 91,
	fgBrightGreen: 92,
	fgBrightYellow: 93,
	fgBrightBlue: 94,
	fgBrightMagenta: 95,
	fgBrightCyan: 96,
	fgBrightWhite: 97,

	// Colors (background)
	bgDefault: 49,
	bgBlack: 40,
	bgRed: 41,
	bgGreen: 42,
	bgYellow: 43,
	bgBlue: 44,
	bgMagenta: 45,
	bgCyan: 46,
	bgWhite: 47,
	bgBrightBlack: 100,
	bgBrightRed: 101,
	bgBrightGreen: 102,
	bgBrightYellow: 103,
	bgBrightBlue: 104,
	bgBrightMagenta: 105,
	bgBrightCyan: 106,
	bgBrightWhite: 107,
} as const;

// ============================================================================
// Style to ANSI Conversion
// ============================================================================

/**
 * Convert a color to ANSI escape sequence parameters.
 *
 * @param color - The color to convert
 * @param isForeground - True for foreground, false for background
 * @returns Array of SGR parameters
 */
function colorToSgrParams(color: Color, isForeground: boolean): number[] {
	if (color === null) {
		// Default color
		return [isForeground ? SGR.fgDefault : SGR.bgDefault];
	}

	if (typeof color === 'number') {
		// 256-color palette
		if (color < 0 || color > 255) {
			return [isForeground ? SGR.fgDefault : SGR.bgDefault];
		}

		// Standard colors (0-7)
		if (color < 8) {
			return [isForeground ? 30 + color : 40 + color];
		}

		// Bright colors (8-15)
		if (color < 16) {
			return [isForeground ? 82 + color : 92 + color]; // 90-97 or 100-107
		}

		// Extended 256 colors
		return [isForeground ? 38 : 48, 5, color];
	}

	// RGB true color
	return [isForeground ? 38 : 48, 2, color.r, color.g, color.b];
}

/**
 * Convert attributes to ANSI SGR parameters.
 */
function attrsToSgrParams(attrs: CellAttrs): number[] {
	const params: number[] = [];
	if (attrs.bold) params.push(SGR.bold);
	if (attrs.dim) params.push(SGR.dim);
	if (attrs.italic) params.push(SGR.italic);
	if (attrs.underline) params.push(SGR.underline);
	if (attrs.blink) params.push(SGR.blink);
	if (attrs.inverse) params.push(SGR.inverse);
	if (attrs.hidden) params.push(SGR.hidden);
	if (attrs.strikethrough) params.push(SGR.strikethrough);
	return params;
}

/**
 * Convert a style to ANSI escape sequence.
 *
 * @param style - The style to convert
 * @returns ANSI escape sequence string
 */
export function styleToAnsi(style: Style): string {
	const params: number[] = [];

	// Add attribute codes
	params.push(...attrsToSgrParams(style.attrs));

	// Add foreground color
	params.push(...colorToSgrParams(style.fg, true));

	// Add background color
	params.push(...colorToSgrParams(style.bg, false));

	if (params.length === 0) {
		return '';
	}

	return `${CSI}${params.join(';')}m`;
}

/**
 * Generate ANSI codes to transition from one style to another.
 * Attempts to emit minimal codes by only changing what's different.
 */
function styleTransition(from: Style | null, to: Style): string {
	// If no previous style, emit full style
	if (!from) {
		return RESET + styleToAnsi(to);
	}

	// If styles are equal, no change needed
	if (styleEquals(from, to)) {
		return '';
	}

	// Check if we need a full reset
	// Reset is needed when turning OFF attributes (except color)
	const needsReset =
		(from.attrs.bold && !to.attrs.bold) ||
		(from.attrs.dim && !to.attrs.dim) ||
		(from.attrs.italic && !to.attrs.italic) ||
		(from.attrs.underline && !to.attrs.underline) ||
		(from.attrs.blink && !to.attrs.blink) ||
		(from.attrs.inverse && !to.attrs.inverse) ||
		(from.attrs.hidden && !to.attrs.hidden) ||
		(from.attrs.strikethrough && !to.attrs.strikethrough);

	if (needsReset) {
		// Reset and reapply all styles
		return RESET + styleToAnsi(to);
	}

	// Build incremental changes
	const params: number[] = [];

	// Add new attributes
	if (to.attrs.bold && !from.attrs.bold) params.push(SGR.bold);
	if (to.attrs.dim && !from.attrs.dim) params.push(SGR.dim);
	if (to.attrs.italic && !from.attrs.italic) params.push(SGR.italic);
	if (to.attrs.underline && !from.attrs.underline) params.push(SGR.underline);
	if (to.attrs.blink && !from.attrs.blink) params.push(SGR.blink);
	if (to.attrs.inverse && !from.attrs.inverse) params.push(SGR.inverse);
	if (to.attrs.hidden && !from.attrs.hidden) params.push(SGR.hidden);
	if (to.attrs.strikethrough && !from.attrs.strikethrough) params.push(SGR.strikethrough);

	// Change foreground color if different
	if (!colorEquals(from.fg, to.fg)) {
		params.push(...colorToSgrParams(to.fg, true));
	}

	// Change background color if different
	if (!colorEquals(from.bg, to.bg)) {
		params.push(...colorToSgrParams(to.bg, false));
	}

	if (params.length === 0) {
		return '';
	}

	return `${CSI}${params.join(';')}m`;
}

// ============================================================================
// Cursor Movement
// ============================================================================

/**
 * Generate ANSI sequence to move cursor to position.
 * Terminal positions are 1-indexed.
 */
function moveCursor(x: number, y: number): string {
	return `${CSI}${y + 1};${x + 1}H`;
}

/**
 * Generate ANSI sequence to move cursor up N lines.
 */
function cursorUp(n: number): string {
	if (n <= 0) return '';
	if (n === 1) return `${CSI}A`;
	return `${CSI}${n}A`;
}

/**
 * Generate ANSI sequence to move cursor down N lines.
 */
function cursorDown(n: number): string {
	if (n <= 0) return '';
	if (n === 1) return `${CSI}B`;
	return `${CSI}${n}B`;
}

/**
 * Generate ANSI sequence to move cursor right N columns.
 */
function cursorRight(n: number): string {
	if (n <= 0) return '';
	if (n === 1) return `${CSI}C`;
	return `${CSI}${n}C`;
}

/**
 * Generate ANSI sequence to move cursor left N columns.
 */
function cursorLeft(n: number): string {
	if (n <= 0) return '';
	if (n === 1) return `${CSI}D`;
	return `${CSI}${n}D`;
}

/**
 * Generate ANSI sequence to move cursor to column.
 */
function cursorToColumn(x: number): string {
	return `${CSI}${x + 1}G`;
}

/**
 * Generate optimal cursor movement from current position to target.
 */
function optimalCursorMove(fromX: number, fromY: number, toX: number, toY: number): string {
	const dx = toX - fromX;
	const dy = toY - fromY;

	// Already at position
	if (dx === 0 && dy === 0) {
		return '';
	}

	// Only horizontal movement
	if (dy === 0) {
		if (dx > 0) {
			// Moving right - check if absolute or relative is shorter
			const rel = cursorRight(dx);
			const abs = cursorToColumn(toX);
			return rel.length <= abs.length ? rel : abs;
		}
		// Moving left
		const rel = cursorLeft(-dx);
		const abs = cursorToColumn(toX);
		return rel.length <= abs.length ? rel : abs;
	}

	// Only vertical movement on same column
	if (dx === 0) {
		if (dy > 0) {
			return cursorDown(dy);
		}
		return cursorUp(-dy);
	}

	// Moving down to column 0 - newlines might be cheaper
	if (toX === 0 && dy > 0 && dy <= 3) {
		const newlines = '\n'.repeat(dy);
		const abs = moveCursor(toX, toY);
		return newlines.length <= abs.length ? newlines : abs;
	}

	// General case: use absolute positioning
	// But check if relative moves would be shorter
	let relative = '';
	if (dy > 0) {
		relative += cursorDown(dy);
	} else if (dy < 0) {
		relative += cursorUp(-dy);
	}
	if (dx > 0) {
		relative += cursorRight(dx);
	} else if (dx < 0) {
		relative += cursorLeft(-dx);
	}

	const absolute = moveCursor(toX, toY);

	return relative.length <= absolute.length ? relative : absolute;
}

// ============================================================================
// Buffer to ANSI Conversion
// ============================================================================

/**
 * Convert an entire buffer to ANSI string.
 * Used for initial render or when no previous buffer exists.
 */
export function bufferToAnsi(buffer: TerminalBuffer): string {
	let output = CURSOR_HOME + CURSOR_HIDE + RESET;
	let currentStyle: Style | null = null;

	for (let y = 0; y < buffer.height; y++) {
		for (let x = 0; x < buffer.width; x++) {
			const cell = buffer.getCell(x, y);

			// Skip continuation cells (part of wide character)
			if (cell.continuation) {
				continue;
			}

			// Apply style change if needed
			const cellStyle: Style = { fg: cell.fg, bg: cell.bg, attrs: cell.attrs };
			const styleChange = styleTransition(currentStyle, cellStyle);
			if (styleChange) {
				output += styleChange;
				currentStyle = cellStyle;
			}

			// Write character
			output += cell.char;
		}

		// Newline at end of each row (except last)
		if (y < buffer.height - 1) {
			output += '\r\n';
		}
	}

	// Reset style and show cursor
	output += RESET + CURSOR_SHOW;

	return output;
}

// ============================================================================
// Buffer Diffing
// ============================================================================

/**
 * Compute the differences between two buffers.
 *
 * @param prev - Previous buffer state
 * @param next - New buffer state
 * @returns Array of cell changes
 */
export function diffBuffers(prev: TerminalBuffer, next: TerminalBuffer): CellChange[] {
	const changes: CellChange[] = [];

	// If dimensions changed, we need to re-render everything
	if (prev.width !== next.width || prev.height !== next.height) {
		// Return all cells from next buffer as changes
		for (let y = 0; y < next.height; y++) {
			for (let x = 0; x < next.width; x++) {
				const cell = next.getCell(x, y);
				// Skip continuation cells
				if (!cell.continuation) {
					changes.push({ x, y, cell });
				}
			}
		}
		return changes;
	}

	// Same dimensions - compare cell by cell
	for (let y = 0; y < next.height; y++) {
		for (let x = 0; x < next.width; x++) {
			if (!prev.cellEquals(x, y, next)) {
				const cell = next.getCell(x, y);
				// Skip continuation cells (they'll be handled with their wide char)
				if (!cell.continuation) {
					changes.push({ x, y, cell });
				}
			}
		}
	}

	return changes;
}

/**
 * Convert cell changes to minimal ANSI output.
 * Optimizes cursor movement and style changes.
 */
export function changesToAnsi(changes: CellChange[]): string {
	if (changes.length === 0) {
		return '';
	}

	// Sort by position for optimal cursor movement
	changes.sort((a, b) => {
		if (a.y !== b.y) return a.y - b.y;
		return a.x - b.x;
	});

	let output = CURSOR_HIDE;
	let cursorX = 0;
	let cursorY = 0;
	let currentStyle: Style | null = null;
	let needsPositioning = true;

	for (const { x, y, cell } of changes) {
		// Move cursor to position
		if (needsPositioning || y !== cursorY || x !== cursorX) {
			// Check if cursor would naturally be here after previous write
			const expectedX = cursorX + (currentStyle ? 1 : 0);

			if (y === cursorY && x === expectedX) {
				// Cursor is already in the right place (after last character)
				// No movement needed
			} else {
				output += optimalCursorMove(cursorX, cursorY, x, y);
			}
			cursorX = x;
			cursorY = y;
			needsPositioning = false;
		}

		// Apply style change if needed
		const cellStyle: Style = { fg: cell.fg, bg: cell.bg, attrs: cell.attrs };
		const styleChange = styleTransition(currentStyle, cellStyle);
		if (styleChange) {
			output += styleChange;
			currentStyle = cellStyle;
		}

		// Write character
		output += cell.char;

		// Update cursor position (cursor advances after writing)
		cursorX = x + (cell.wide ? 2 : 1);
	}

	// Reset style and show cursor
	if (currentStyle) {
		output += RESET;
	}
	output += CURSOR_SHOW;

	return output;
}

// ============================================================================
// Full Render Helpers
// ============================================================================

/**
 * Render a buffer, using diff if previous buffer is available.
 */
export function renderBuffer(buffer: TerminalBuffer, prevBuffer: TerminalBuffer | null): string {
	if (!prevBuffer) {
		// First render: output entire buffer
		return bufferToAnsi(buffer);
	}

	// Diff and emit only changes
	const changes = diffBuffers(prevBuffer, buffer);
	return changesToAnsi(changes);
}

/**
 * Clear the screen.
 */
export function clearScreen(): string {
	return `${CSI}2J${CURSOR_HOME}`;
}

/**
 * Clear from cursor to end of screen.
 */
export function clearToEnd(): string {
	return `${CSI}0J`;
}

/**
 * Clear the current line.
 */
export function clearLine(): string {
	return `${CSI}2K`;
}

/**
 * Enter alternate screen buffer.
 */
export function enterAlternateScreen(): string {
	return `${CSI}?1049h`;
}

/**
 * Leave alternate screen buffer.
 */
export function leaveAlternateScreen(): string {
	return `${CSI}?1049l`;
}

/**
 * Enable mouse tracking.
 */
export function enableMouse(): string {
	return `${CSI}?1000h${CSI}?1002h${CSI}?1006h`;
}

/**
 * Disable mouse tracking.
 */
export function disableMouse(): string {
	return `${CSI}?1006l${CSI}?1002l${CSI}?1000l`;
}

// ============================================================================
// Export Constants
// ============================================================================

export const ANSI = {
	ESC,
	CSI,
	CURSOR_HIDE,
	CURSOR_SHOW,
	CURSOR_HOME,
	RESET,
	SGR,
	moveCursor,
	cursorUp,
	cursorDown,
	cursorLeft,
	cursorRight,
	cursorToColumn,
} as const;
