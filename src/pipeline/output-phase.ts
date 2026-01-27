/**
 * Phase 4: Output Phase
 *
 * Diff two buffers and produce minimal ANSI output.
 */

import {
	type CellAttrs,
	type Color,
	type Style,
	type TerminalBuffer,
	styleEquals,
} from '../buffer.js';
import type { CellChange } from './types.js';

/**
 * Check if any text attributes are active.
 */
function hasActiveAttrs(attrs: CellAttrs): boolean {
	return !!(
		attrs.bold ||
		attrs.dim ||
		attrs.italic ||
		attrs.underline ||
		attrs.blink ||
		attrs.inverse ||
		attrs.hidden ||
		attrs.strikethrough
	);
}

/**
 * Diff two buffers and produce minimal ANSI output.
 *
 * @param prev Previous buffer (null on first render)
 * @param next Current buffer
 * @param mode Render mode: fullscreen or inline
 * @returns ANSI escape sequence string
 */
export function outputPhase(
	prev: TerminalBuffer | null,
	next: TerminalBuffer,
	mode: 'fullscreen' | 'inline' = 'fullscreen',
): string {
	// First render: output entire buffer
	if (!prev) {
		return bufferToAnsi(next, mode);
	}

	// Diff and emit only changes
	const changes = diffBuffers(prev, next);

	if (changes.length === 0) {
		return ''; // No changes
	}

	return changesToAnsi(changes, mode);
}

/**
 * Check if a line has any non-space content.
 */
function lineHasContent(buffer: TerminalBuffer, y: number): boolean {
	for (let x = 0; x < buffer.width; x++) {
		const cell = buffer.getCell(x, y);
		if (cell.char !== ' ' && cell.char !== '') {
			return true;
		}
	}
	return false;
}

/**
 * Find the last line with content in the buffer.
 */
function findLastContentLine(buffer: TerminalBuffer): number {
	for (let y = buffer.height - 1; y >= 0; y--) {
		if (lineHasContent(buffer, y)) {
			return y;
		}
	}
	return 0; // At least render first line
}

/**
 * Convert entire buffer to ANSI string.
 */
function bufferToAnsi(
	buffer: TerminalBuffer,
	mode: 'fullscreen' | 'inline' = 'fullscreen',
): string {
	let output = '';
	let currentStyle: Style | null = null;

	// For inline mode, only render up to the last line with content
	const maxLine = mode === 'inline' ? findLastContentLine(buffer) : buffer.height - 1;

	// Move cursor to start position based on mode
	if (mode === 'fullscreen') {
		// Fullscreen: Move cursor to home position (top-left)
		output += '\x1b[H';
	} else {
		// Inline: Hide cursor, start from current position
		output += '\x1b[?25l';
	}

	for (let y = 0; y <= maxLine; y++) {
		// Move to start of line
		if (y > 0 || mode === 'inline') {
			output += '\r';
		}

		// Render the line content
		for (let x = 0; x < buffer.width; x++) {
			const cell = buffer.getCell(x, y);

			// Skip continuation cells
			if (cell.continuation) continue;

			// Update style if changed
			const cellStyle: Style = { fg: cell.fg, bg: cell.bg, attrs: cell.attrs };
			if (!styleEquals(currentStyle, cellStyle)) {
				output += styleToAnsi(cellStyle);
				currentStyle = cellStyle;
			}

			output += cell.char;
		}

		// Clear to end of line (removes any leftover content)
		output += '\x1b[K';

		// Move to next line (except for last line)
		if (y < maxLine) {
			// Reset style before newline to prevent background color bleeding
			if (currentStyle && (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))) {
				output += '\x1b[0m';
				currentStyle = null;
			}
			output += '\n';
		}
	}

	// Reset style at end
	output += '\x1b[0m';

	return output;
}

/**
 * Diff two buffers and return list of changes.
 *
 * Optimization: Uses buffer's cellEquals method which can do fast
 * packed integer comparison before falling back to full cell comparison.
 */
function diffBuffers(prev: TerminalBuffer, next: TerminalBuffer): CellChange[] {
	const changes: CellChange[] = [];

	// Dimension mismatch means we need to re-render everything visible
	const height = Math.min(prev.height, next.height);
	const width = Math.min(prev.width, next.width);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			// Use buffer's optimized cellEquals which compares packed metadata first
			if (!next.cellEquals(x, y, prev)) {
				changes.push({ x, y, cell: next.getCell(x, y) });
			}
		}
	}

	// Handle size changes: add all cells in new areas
	if (next.width > prev.width) {
		for (let y = 0; y < next.height; y++) {
			for (let x = prev.width; x < next.width; x++) {
				changes.push({ x, y, cell: next.getCell(x, y) });
			}
		}
	}
	if (next.height > prev.height) {
		for (let y = prev.height; y < next.height; y++) {
			for (let x = 0; x < next.width; x++) {
				changes.push({ x, y, cell: next.getCell(x, y) });
			}
		}
	}

	return changes;
}

/**
 * Convert cell changes to optimized ANSI output.
 */
function changesToAnsi(
	changes: CellChange[],
	mode: 'fullscreen' | 'inline' = 'fullscreen',
): string {
	if (changes.length === 0) return '';

	// Sort by position for optimal cursor movement
	changes.sort((a, b) => a.y - b.y || a.x - b.x);

	let output = '';
	let currentStyle: Style | null = null;

	if (mode === 'inline') {
		// Inline mode: move cursor to start of the render region
		const maxY = Math.max(...changes.map((c) => c.y));

		// Hide cursor
		output += '\x1b[?25l';

		// Move up to the top line of the render region if we have multiple lines
		if (maxY > 0) {
			output += `\x1b[${maxY}A`;
		}

		// Move to start of line
		output += '\r';

		// Track current line for multi-line support
		let currentY = 0;

		// Apply changes
		for (const { x, y, cell } of changes) {
			// Skip continuation cells
			if (cell.continuation) continue;

			// Move to correct line if needed
			while (currentY < y) {
				output += '\n';
				currentY++;
			}

			// Move to correct column
			output += `\x1b[${x + 1}G`;

			// Update style if changed
			const cellStyle: Style = { fg: cell.fg, bg: cell.bg, attrs: cell.attrs };
			if (!styleEquals(currentStyle, cellStyle)) {
				output += styleToAnsi(cellStyle);
				currentStyle = cellStyle;
			}

			// Write character
			output += cell.char;
		}
	} else {
		// Fullscreen mode: use absolute positioning
		let cursorX = -1;
		let cursorY = -1;

		for (const { x, y, cell } of changes) {
			// Skip continuation cells
			if (cell.continuation) continue;

			// Move cursor if needed (cursor must be exactly at target position)
			if (y !== cursorY || x !== cursorX) {
				// Use \r\n optimization only if cursor is initialized AND we're moving
				// to the next line at column 0. Don't use it when cursorY is -1
				// (uninitialized) because that would incorrectly emit a newline at start.
				// Bug km-x7ih: This was causing the first row to appear at the bottom.
				if (cursorY >= 0 && y === cursorY + 1 && x === 0) {
					// Next line at column 0, use newline (more efficient)
					output += '\r\n';
				} else {
					// Absolute position (1-indexed)
					output += `\x1b[${y + 1};${x + 1}H`;
				}
			}

			// Update style if changed
			const cellStyle: Style = { fg: cell.fg, bg: cell.bg, attrs: cell.attrs };
			if (!styleEquals(currentStyle, cellStyle)) {
				output += styleToAnsi(cellStyle);
				currentStyle = cellStyle;
			}

			// Write character
			output += cell.char;
			cursorX = x + (cell.wide ? 2 : 1);
			cursorY = y;
		}
	}

	// Reset style at end
	if (currentStyle) {
		output += '\x1b[0m';
	}

	return output;
}

/**
 * Convert style to ANSI escape sequence.
 */
function styleToAnsi(style: Style): string {
	const codes: number[] = [0]; // Reset first

	// Foreground color
	if (style.fg !== null) {
		const fgCode = colorToAnsiFg(style.fg);
		if (fgCode) codes.push(...fgCode);
	}

	// Background color
	if (style.bg !== null) {
		const bgCode = colorToAnsiBg(style.bg);
		if (bgCode) codes.push(...bgCode);
	}

	// Attributes
	if (style.attrs.bold) codes.push(1);
	if (style.attrs.dim) codes.push(2);
	if (style.attrs.italic) codes.push(3);
	if (style.attrs.underline) codes.push(4);
	if (style.attrs.inverse) codes.push(7);
	if (style.attrs.strikethrough) codes.push(9);

	return `\x1b[${codes.join(';')}m`;
}

/**
 * Convert color to ANSI foreground codes.
 */
function colorToAnsiFg(color: Color): number[] | null {
	if (color === null) return null;

	if (typeof color === 'number') {
		// 256-color
		return [38, 5, color];
	}

	// True color
	return [38, 2, color.r, color.g, color.b];
}

/**
 * Convert color to ANSI background codes.
 */
function colorToAnsiBg(color: Color): number[] | null {
	if (color === null) return null;

	if (typeof color === 'number') {
		// 256-color
		return [48, 5, color];
	}

	// True color
	return [48, 2, color.r, color.g, color.b];
}
