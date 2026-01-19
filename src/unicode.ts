/**
 * Unicode handling for Inkx.
 *
 * Uses graphemer for proper grapheme cluster segmentation and
 * string-width for accurate terminal width calculation.
 *
 * Key concepts:
 * - Grapheme: A user-perceived character (may be multiple code points)
 * - Display width: How many terminal columns a character occupies (0, 1, or 2)
 * - Wide characters: CJK ideographs, emoji, etc. that take 2 columns
 * - Combining characters: Diacritics, emoji modifiers that take 0 columns
 */

import Graphemer from 'graphemer';
import stringWidth from 'string-width';
import type { Style, TerminalBuffer } from './buffer.js';

// ============================================================================
// Grapheme Segmentation
// ============================================================================

// Singleton graphemer instance (it's stateless)
const graphemer = new Graphemer();

/**
 * Split a string into grapheme clusters.
 * Each grapheme is a user-perceived character that may consist of
 * multiple Unicode code points.
 *
 * Examples:
 * - "cafe\u0301" (café with combining accent) -> ["c", "a", "f", "e\u0301"]
 * - "👨‍👩‍👧" (family emoji) -> ["👨‍👩‍👧"]
 * - "한국어" -> ["한", "국", "어"]
 */
export function splitGraphemes(text: string): string[] {
	return graphemer.splitGraphemes(text);
}

/**
 * Count the number of graphemes in a string.
 */
export function graphemeCount(text: string): number {
	return graphemer.countGraphemes(text);
}

// ============================================================================
// Display Width Calculation
// ============================================================================

/**
 * Get the display width of a string (number of terminal columns).
 * Uses string-width which handles:
 * - Wide characters (CJK) -> 2 columns
 * - Regular ASCII -> 1 column
 * - Zero-width characters (combining, ZWJ) -> 0 columns
 * - Emoji -> varies (1 or 2)
 * - ANSI escape sequences -> 0 columns (stripped)
 */
export function displayWidth(text: string): number {
	return stringWidth(text);
}

/**
 * Get the display width of a single grapheme.
 */
export function graphemeWidth(grapheme: string): number {
	return stringWidth(grapheme);
}

/**
 * Check if a grapheme is a wide character (takes 2 columns).
 */
export function isWideGrapheme(grapheme: string): boolean {
	return stringWidth(grapheme) === 2;
}

/**
 * Check if a grapheme is zero-width (combining character, ZWJ, etc.).
 */
export function isZeroWidthGrapheme(grapheme: string): boolean {
	return stringWidth(grapheme) === 0;
}

// ============================================================================
// Text Manipulation
// ============================================================================

/**
 * Truncate a string to fit within a given display width.
 * Handles wide characters correctly.
 *
 * @param text - The text to truncate
 * @param maxWidth - Maximum display width
 * @param ellipsis - Ellipsis to append if truncated (default: "...")
 * @returns Truncated string
 */
export function truncateText(
	text: string,
	maxWidth: number,
	ellipsis = '\u2026', // Unicode ellipsis (single character)
): string {
	const textWidth = displayWidth(text);

	// No truncation needed
	if (textWidth <= maxWidth) {
		return text;
	}

	const ellipsisWidth = displayWidth(ellipsis);
	const targetWidth = maxWidth - ellipsisWidth;

	if (targetWidth <= 0) {
		// Not enough space for even the ellipsis
		return maxWidth > 0 ? ellipsis.slice(0, maxWidth) : '';
	}

	const graphemes = splitGraphemes(text);
	let result = '';
	let currentWidth = 0;

	for (const grapheme of graphemes) {
		const gWidth = graphemeWidth(grapheme);
		if (currentWidth + gWidth > targetWidth) {
			break;
		}
		result += grapheme;
		currentWidth += gWidth;
	}

	return result + ellipsis;
}

/**
 * Pad a string to a given display width.
 *
 * @param text - The text to pad
 * @param width - Target display width
 * @param align - Alignment: 'left', 'right', or 'center'
 * @param padChar - Character to use for padding (default: space)
 * @returns Padded string
 */
export function padText(
	text: string,
	width: number,
	align: 'left' | 'right' | 'center' = 'left',
	padChar = ' ',
): string {
	const textWidth = displayWidth(text);
	const padWidth = width - textWidth;

	if (padWidth <= 0) {
		return text;
	}

	const padCharWidth = displayWidth(padChar);
	if (padCharWidth === 0) {
		// Can't pad with zero-width characters
		return text;
	}

	// Calculate number of pad characters needed
	const padCount = Math.floor(padWidth / padCharWidth);

	switch (align) {
		case 'left':
			return text + padChar.repeat(padCount);
		case 'right':
			return padChar.repeat(padCount) + text;
		case 'center': {
			const leftPad = Math.floor(padCount / 2);
			const rightPad = padCount - leftPad;
			return padChar.repeat(leftPad) + text + padChar.repeat(rightPad);
		}
	}
}

/**
 * Wrap text to fit within a given width.
 *
 * @param text - The text to wrap
 * @param width - Maximum display width per line
 * @param preserveNewlines - Whether to preserve existing newlines
 * @returns Array of wrapped lines
 */
export function wrapText(text: string, width: number, preserveNewlines = true): string[] {
	if (width <= 0) {
		return [];
	}

	const lines: string[] = [];

	// Split by newlines first if preserving
	const inputLines = preserveNewlines ? text.split('\n') : [text.replace(/\n/g, ' ')];

	for (const line of inputLines) {
		// Handle empty lines
		if (line === '') {
			lines.push('');
			continue;
		}

		const graphemes = splitGraphemes(line);
		let currentLine = '';
		let currentWidth = 0;

		for (const grapheme of graphemes) {
			const gWidth = graphemeWidth(grapheme);

			// Handle zero-width characters
			if (gWidth === 0) {
				currentLine += grapheme;
				continue;
			}

			// Would this grapheme overflow?
			if (currentWidth + gWidth > width) {
				// Push current line and start new one
				if (currentLine) {
					lines.push(currentLine);
				}
				currentLine = grapheme;
				currentWidth = gWidth;
			} else {
				currentLine += grapheme;
				currentWidth += gWidth;
			}
		}

		// Push remaining content
		if (currentLine) {
			lines.push(currentLine);
		}
	}

	return lines;
}

/**
 * Slice a string by display width.
 * Like string.slice() but works with display columns.
 *
 * @param text - The text to slice
 * @param start - Start display column (inclusive)
 * @param end - End display column (exclusive)
 * @returns Sliced string
 */
export function sliceByWidth(text: string, start: number, end?: number): string {
	const graphemes = splitGraphemes(text);
	let result = '';
	let currentCol = 0;
	const endCol = end ?? Number.POSITIVE_INFINITY;

	for (const grapheme of graphemes) {
		const gWidth = graphemeWidth(grapheme);

		// Haven't reached start yet
		if (currentCol + gWidth <= start) {
			currentCol += gWidth;
			continue;
		}

		// Past the end
		if (currentCol >= endCol) {
			break;
		}

		// This grapheme is at least partially in range
		result += grapheme;
		currentCol += gWidth;
	}

	return result;
}

// ============================================================================
// Buffer Writing
// ============================================================================

/**
 * Write styled text to a terminal buffer.
 *
 * Handles:
 * - Multi-byte graphemes (emoji, combining characters)
 * - Wide characters (CJK) that take 2 cells
 * - Zero-width characters (appended to previous cell)
 *
 * @param buffer - The buffer to write to
 * @param x - Starting column
 * @param y - Row
 * @param text - Text to write
 * @param style - Style to apply
 * @returns The ending column (x + display_width)
 */
export function writeTextToBuffer(
	buffer: TerminalBuffer,
	x: number,
	y: number,
	text: string,
	style: Style = { fg: null, bg: null, attrs: {} },
): number {
	const graphemes = splitGraphemes(text);
	let col = x;

	for (const grapheme of graphemes) {
		const width = graphemeWidth(grapheme);

		if (width === 0) {
			// Zero-width character: combine with previous cell
			if (col > 0 && buffer.inBounds(col - 1, y)) {
				const prevCell = buffer.getCell(col - 1, y);
				buffer.setCell(col - 1, y, {
					...prevCell,
					char: prevCell.char + grapheme,
				});
			}
		} else if (width === 1) {
			// Normal single-width character
			if (buffer.inBounds(col, y)) {
				buffer.setCell(col, y, {
					char: grapheme,
					fg: style.fg,
					bg: style.bg,
					attrs: style.attrs,
					wide: false,
					continuation: false,
				});
			}
			col++;
		} else if (width === 2) {
			// Wide character: takes 2 cells
			if (buffer.inBounds(col, y)) {
				buffer.setCell(col, y, {
					char: grapheme,
					fg: style.fg,
					bg: style.bg,
					attrs: style.attrs,
					wide: true,
					continuation: false,
				});
			}
			if (buffer.inBounds(col + 1, y)) {
				buffer.setCell(col + 1, y, {
					char: '',
					fg: style.fg,
					bg: style.bg,
					attrs: style.attrs,
					wide: false,
					continuation: true,
				});
			}
			col += 2;
		}

		// Stop if we've gone past the buffer edge
		if (col >= buffer.width) {
			break;
		}
	}

	return col;
}

/**
 * Write styled text to a buffer with automatic truncation.
 *
 * @param buffer - The buffer to write to
 * @param x - Starting column
 * @param y - Row
 * @param text - Text to write
 * @param maxWidth - Maximum width (truncate if exceeded)
 * @param style - Style to apply
 * @param ellipsis - Ellipsis for truncated text
 */
export function writeTextTruncated(
	buffer: TerminalBuffer,
	x: number,
	y: number,
	text: string,
	maxWidth: number,
	style: Style = { fg: null, bg: null, attrs: {} },
	ellipsis = '\u2026',
): void {
	const textWidth = displayWidth(text);

	if (textWidth <= maxWidth) {
		writeTextToBuffer(buffer, x, y, text, style);
	} else {
		const truncated = truncateText(text, maxWidth, ellipsis);
		writeTextToBuffer(buffer, x, y, truncated, style);
	}
}

/**
 * Write multiple lines of styled text to a buffer.
 *
 * @param buffer - The buffer to write to
 * @param x - Starting column
 * @param y - Starting row
 * @param lines - Lines to write
 * @param style - Style to apply
 */
export function writeLinesToBuffer(
	buffer: TerminalBuffer,
	x: number,
	y: number,
	lines: string[],
	style: Style = { fg: null, bg: null, attrs: {} },
): void {
	for (let i = 0; i < lines.length; i++) {
		if (y + i >= buffer.height) break;
		writeTextToBuffer(buffer, x, y + i, lines[i], style);
	}
}

// ============================================================================
// ANSI-Aware Operations
// ============================================================================

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences require control chars
const ANSI_REGEX = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * Strip ANSI escape sequences from a string.
 */
export function stripAnsi(text: string): string {
	return text.replace(ANSI_REGEX, '');
}

/**
 * Get display width of text with ANSI sequences.
 * ANSI sequences don't contribute to display width.
 */
export function displayWidthAnsi(text: string): number {
	return displayWidth(stripAnsi(text));
}

/**
 * Truncate text that may contain ANSI sequences.
 * Preserves ANSI codes while truncating visible characters.
 *
 * Note: This is a simplified implementation that strips ANSI before
 * truncation. For proper ANSI-aware truncation, consider using
 * slice-ansi or similar library.
 */
export function truncateAnsi(text: string, maxWidth: number, ellipsis = '\u2026'): string {
	// Simple approach: if text has ANSI, strip and truncate
	// A more sophisticated approach would preserve styles
	const stripped = stripAnsi(text);
	return truncateText(stripped, maxWidth, ellipsis);
}

// ============================================================================
// Measurement Utilities
// ============================================================================

/**
 * Measure the dimensions of multi-line text.
 *
 * @param text - Text to measure (may contain newlines)
 * @returns { width, height } in display columns and rows
 */
export function measureText(text: string): { width: number; height: number } {
	const lines = text.split('\n');
	let maxWidth = 0;

	for (const line of lines) {
		const lineWidth = displayWidth(line);
		if (lineWidth > maxWidth) {
			maxWidth = lineWidth;
		}
	}

	return {
		width: maxWidth,
		height: lines.length,
	};
}

/**
 * Check if a string contains any wide characters.
 */
export function hasWideCharacters(text: string): boolean {
	const graphemes = splitGraphemes(text);
	return graphemes.some(isWideGrapheme);
}

/**
 * Check if a string contains any combining/zero-width characters.
 */
export function hasZeroWidthCharacters(text: string): boolean {
	const graphemes = splitGraphemes(text);
	return graphemes.some(isZeroWidthGrapheme);
}

/**
 * Normalize string for consistent handling.
 * Applies Unicode NFC normalization.
 */
export function normalizeText(text: string): string {
	return text.normalize('NFC');
}

// ============================================================================
// Character Detection
// ============================================================================

/**
 * Common character ranges for quick checks.
 */
const CHAR_RANGES = {
	// Basic Latin (ASCII)
	isBasicLatin: (cp: number) => cp >= 0x0020 && cp <= 0x007f,

	// CJK Unified Ideographs
	isCJK: (cp: number) =>
		(cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
		(cp >= 0x3400 && cp <= 0x4dbf) || // CJK Unified Ideographs Extension A
		(cp >= 0x20000 && cp <= 0x2a6df) || // CJK Unified Ideographs Extension B
		(cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
		(cp >= 0x2f800 && cp <= 0x2fa1f), // CJK Compatibility Ideographs Supplement

	// Japanese Hiragana/Katakana
	isJapaneseKana: (cp: number) =>
		(cp >= 0x3040 && cp <= 0x309f) || // Hiragana
		(cp >= 0x30a0 && cp <= 0x30ff), // Katakana

	// Korean Hangul
	isHangul: (cp: number) =>
		(cp >= 0xac00 && cp <= 0xd7a3) || // Hangul Syllables
		(cp >= 0x1100 && cp <= 0x11ff), // Hangul Jamo

	// Emoji ranges (simplified)
	isEmoji: (cp: number) =>
		(cp >= 0x1f600 && cp <= 0x1f64f) || // Emoticons
		(cp >= 0x1f300 && cp <= 0x1f5ff) || // Misc Symbols and Pictographs
		(cp >= 0x1f680 && cp <= 0x1f6ff) || // Transport and Map
		(cp >= 0x1f700 && cp <= 0x1f77f) || // Alchemical Symbols
		(cp >= 0x1f900 && cp <= 0x1f9ff) || // Supplemental Symbols and Pictographs
		(cp >= 0x2600 && cp <= 0x26ff) || // Misc symbols
		(cp >= 0x2700 && cp <= 0x27bf), // Dingbats
} as const;

/**
 * Get the first code point of a string.
 */
export function getFirstCodePoint(str: string): number {
	const cp = str.codePointAt(0);
	return cp ?? 0;
}

/**
 * Check if a grapheme is likely an emoji.
 * Note: This is a heuristic, not comprehensive.
 */
export function isLikelyEmoji(grapheme: string): boolean {
	const cp = getFirstCodePoint(grapheme);
	return CHAR_RANGES.isEmoji(cp) || grapheme.includes('\u200d'); // Contains ZWJ
}

/**
 * Check if a grapheme is a CJK character.
 */
export function isCJK(grapheme: string): boolean {
	const cp = getFirstCodePoint(grapheme);
	return CHAR_RANGES.isCJK(cp) || CHAR_RANGES.isJapaneseKana(cp) || CHAR_RANGES.isHangul(cp);
}
