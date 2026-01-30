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

import { BG_OVERRIDE_CODE } from 'chalkx';
import Graphemer from 'graphemer';
import stringWidth from 'string-width';
import type { Style, TerminalBuffer, UnderlineStyle } from './buffer.js';

// Re-export for consumers of inkx
export { BG_OVERRIDE_CODE };

// ============================================================================
// Grapheme Segmentation
// ============================================================================

// Singleton graphemer instance (it's stateless)
const graphemer = new Graphemer();

// ============================================================================
// Performance: LRU Cache for displayWidth
// ============================================================================

/**
 * Simple LRU cache for displayWidth results.
 * String width calculation is expensive (~8us for ASCII text),
 * but the same strings are often measured repeatedly.
 */
class DisplayWidthCache {
	private cache = new Map<string, number>();
	private maxSize: number;

	constructor(maxSize = 1000) {
		this.maxSize = maxSize;
	}

	get(text: string): number | undefined {
		const cached = this.cache.get(text);
		if (cached !== undefined) {
			// Move to end (most recently used)
			this.cache.delete(text);
			this.cache.set(text, cached);
		}
		return cached;
	}

	set(text: string, width: number): void {
		// Evict oldest if at capacity
		if (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(text, width);
	}

	clear(): void {
		this.cache.clear();
	}
}

const displayWidthCache = new DisplayWidthCache();

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
 *
 * Results are cached for performance (string-width is expensive).
 */
export function displayWidth(text: string): number {
	// Check cache first
	const cached = displayWidthCache.get(text);
	if (cached !== undefined) {
		return cached;
	}

	const width = stringWidth(text);
	displayWidthCache.set(text, width);
	return width;
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
 * Constrain text to width and height limits.
 * Combines wrapping and truncation to fit text in a box.
 *
 * @param text - Text to constrain (may contain ANSI codes)
 * @param width - Maximum display width per line
 * @param maxLines - Maximum number of lines
 * @param pad - If true, pad lines to full width
 * @param ellipsis - Custom ellipsis character (default: "…")
 * @returns Object with lines array and truncated flag
 */
export function constrainText(
	text: string,
	width: number,
	maxLines: number,
	pad = false,
	ellipsis = '…',
): { lines: string[]; truncated: boolean } {
	const allLines = wrapText(text, width);
	const truncated = allLines.length > maxLines;
	let lines = allLines.slice(0, maxLines);

	if (truncated && lines.length > 0) {
		const lastIdx = lines.length - 1;
		const lastLine = lines[lastIdx];
		if (lastLine) {
			const ellipsisLen = displayWidth(ellipsis);
			const lastLineLen = displayWidth(lastLine);
			if (lastLineLen + ellipsisLen <= width) {
				lines[lastIdx] = lastLine + ellipsis;
			} else {
				lines[lastIdx] = truncateText(lastLine, width, ellipsis);
			}
		}
	}

	if (pad) {
		lines = lines.map((line) => padText(line, width));
	}

	return { lines, truncated };
}

/**
 * Check if a grapheme is a word boundary character (space, hyphen, etc.)
 */
function isWordBoundary(grapheme: string): boolean {
	// Common word boundary characters
	return grapheme === ' ' || grapheme === '-' || grapheme === '\t';
}

/**
 * Check if a grapheme can break anywhere (CJK characters).
 * CJK text doesn't use spaces between words, so any character boundary is valid.
 */
function canBreakAnywhere(grapheme: string): boolean {
	return isCJK(grapheme);
}

/**
 * Wrap text to fit within a given width.
 *
 * Implements word-boundary wrapping:
 * 1. Breaks at word boundaries (spaces, hyphens) when possible
 * 2. Falls back to character wrap only when necessary (very long words)
 * 3. Handles CJK text properly (can break anywhere since CJK has no word spaces)
 * 4. Preserves intentional line breaks
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

		// Track the last valid break point
		let lastBreakIndex = -1; // Index in currentLine (character position)
		let lastBreakWidth = 0; // Width at break point
		let lastBreakGraphemeIndex = -1; // Index in graphemes array

		for (let i = 0; i < graphemes.length; i++) {
			const grapheme = graphemes[i]!;
			const gWidth = graphemeWidth(grapheme);

			// Handle zero-width characters
			if (gWidth === 0) {
				currentLine += grapheme;
				continue;
			}

			// Check if this grapheme is a break point
			// Break AFTER spaces/hyphens, or BEFORE CJK characters
			if (isWordBoundary(grapheme)) {
				// Include the boundary character, then mark as break point
				if (currentWidth + gWidth <= width) {
					currentLine += grapheme;
					currentWidth += gWidth;
					lastBreakIndex = currentLine.length;
					lastBreakWidth = currentWidth;
					lastBreakGraphemeIndex = i + 1;
					continue;
				}
			} else if (canBreakAnywhere(grapheme)) {
				// CJK: can break before this character
				lastBreakIndex = currentLine.length;
				lastBreakWidth = currentWidth;
				lastBreakGraphemeIndex = i;
			}

			// Would this grapheme overflow?
			if (currentWidth + gWidth > width) {
				if (lastBreakIndex > 0) {
					// We have a valid break point - use it
					const lineToAdd = currentLine.slice(0, lastBreakIndex);
					lines.push(lineToAdd);

					// Reset and continue from break point
					currentLine = currentLine.slice(lastBreakIndex);
					currentWidth = currentWidth - lastBreakWidth;

					// Rewind to process graphemes after the break
					i = lastBreakGraphemeIndex - 1;
					currentLine = '';
					currentWidth = 0;
					lastBreakIndex = -1;
					lastBreakWidth = 0;
					lastBreakGraphemeIndex = -1;
				} else {
					// No break point found - must do character wrap
					if (currentLine) {
						lines.push(currentLine);
					}
					currentLine = grapheme;
					currentWidth = gWidth;
					lastBreakIndex = -1;
					lastBreakWidth = 0;
					lastBreakGraphemeIndex = -1;
				}
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
		writeTextToBuffer(buffer, x, y + i, lines[i]!, style);
	}
}

// ============================================================================
// ANSI-Aware Operations
// ============================================================================

/**
 * Strip all ANSI escape codes from a string.
 *
 * Handles:
 * - CSI sequences (cursor movement, colors, SGR, etc.)
 * - OSC sequences (window titles, hyperlinks)
 * - Single-character escape sequences
 * - Character set selection
 */
export function stripAnsi(text: string): string {
	return text
		.replace(/\x1b\[[0-9;:?]*[A-Za-z]/g, '') // CSI sequences (including SGR with colons)
		.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC sequences
		.replace(/\x1b[DME78]/g, '') // Single-char sequences
		.replace(/\x1b\(B/g, ''); // Character set selection
}

/**
 * Regex for SGR sequences (colors and attributes) plus OSC 8 hyperlinks.
 * Used by parseAnsiText() for parsing. For stripping, use stripAnsi().
 * @deprecated Use stripAnsi() for stripping; this regex doesn't cover all ANSI codes
 */
export const ANSI_REGEX = /\x1b\[[0-9;:]*m|\x1b\]8;;[^\x1b]*\x1b\\/g;

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
// ANSI Parsing
// ============================================================================

// BG_OVERRIDE_CODE is imported from chalkx and re-exported at top of file

/** Styled text segment with associated ANSI colors/attributes */
export interface StyledSegment {
	text: string;
	fg?: number | null; // SGR color code (30-37, 90-97, or 38;5;N / 38;2;r;g;b)
	bg?: number | null; // SGR color code (40-47, 100-107, or 48;5;N / 48;2;r;g;b)
	/**
	 * Underline color (SGR 58).
	 * Same format as fg/bg: packed RGB with 0x1000000 marker, or 256-color index.
	 */
	underlineColor?: number | null;
	bold?: boolean;
	dim?: boolean;
	italic?: boolean;
	underline?: boolean;
	/**
	 * Underline style variant (SGR 4:x).
	 * Uses UnderlineStyle from buffer.ts.
	 */
	underlineStyle?: UnderlineStyle;
	inverse?: boolean;
	bgOverride?: boolean; // Set when BG_OVERRIDE_CODE (9999) is present
}

/**
 * Map SGR 4:x subparameter to underline style.
 * 0=none, 1=single, 2=double, 3=curly, 4=dotted, 5=dashed
 */
function parseUnderlineStyle(subparam: number): UnderlineStyle {
	switch (subparam) {
		case 0:
			return false;
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
			return 'single'; // Unknown, default to single
	}
}

/**
 * Parse text with ANSI escape sequences into styled segments.
 * Handles basic SGR (Select Graphic Rendition) codes including:
 * - Standard colors (30-37, 40-47, 90-97, 100-107)
 * - Extended colors (38;5;N, 48;5;N for 256-color, 38;2;r;g;b, 48;2;r;g;b for RGB)
 * - Underline styles (4:x where x = 0-5)
 * - Underline color (58;5;N for 256-color, 58;2;r;g;b for RGB)
 */
export function parseAnsiText(text: string): StyledSegment[] {
	const segments: StyledSegment[] = [];
	// Extended pattern: matches SGR with semicolons AND colons (for 4:x, 58:2::r:g:b)
	const ansiPattern = /\x1b\[([0-9;:]*)m/g;

	let currentStyle: Omit<StyledSegment, 'text'> = {};
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec pattern
	while ((match = ansiPattern.exec(text)) !== null) {
		// Add text before this escape sequence
		if (match.index > lastIndex) {
			const content = text.slice(lastIndex, match.index);
			if (content.length > 0) {
				segments.push({ text: content, ...currentStyle });
			}
		}

		// Parse SGR codes - split by semicolon first, then handle colon subparams
		const rawParams = match[1]!;

		// Handle colon-separated sequences (like 4:3 for curly underline, 58:2::r:g:b)
		// Split by semicolon first to get top-level params
		const params = rawParams.split(';');

		for (let i = 0; i < params.length; i++) {
			const param = params[i]!;

			// Check if this param has colon subparameters (e.g., "4:3", "58:2::255:0:0")
			if (param.includes(':')) {
				const subparts = param.split(':').map((s) => (s === '' ? 0 : Number(s)));
				const mainCode = subparts[0]!;

				if (mainCode === 4) {
					// SGR 4:x - underline style
					const styleCode = subparts[1] ?? 1;
					currentStyle.underlineStyle = parseUnderlineStyle(styleCode);
					currentStyle.underline = currentStyle.underlineStyle !== false;
				} else if (mainCode === 58) {
					// SGR 58 - underline color
					// Format: 58:5:N (256-color) or 58:2::r:g:b (RGB, note double colon)
					if (subparts[1] === 5 && subparts[2] !== undefined) {
						currentStyle.underlineColor = subparts[2];
					} else if (subparts[1] === 2) {
						// RGB: 58:2::r:g:b (indices 3,4,5 after the empty slot)
						// or 58:2:r:g:b (indices 2,3,4)
						// Handle both formats by looking for valid RGB values
						const r = subparts[3] ?? subparts[2] ?? 0;
						const g = subparts[4] ?? subparts[3] ?? 0;
						const b = subparts[5] ?? subparts[4] ?? 0;
						currentStyle.underlineColor =
							0x1000000 | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
					}
				} else if (mainCode === 38) {
					// SGR 38:2::r:g:b or 38:5:N format
					if (subparts[1] === 5 && subparts[2] !== undefined) {
						currentStyle.fg = subparts[2];
					} else if (subparts[1] === 2) {
						const r = subparts[3] ?? subparts[2] ?? 0;
						const g = subparts[4] ?? subparts[3] ?? 0;
						const b = subparts[5] ?? subparts[4] ?? 0;
						currentStyle.fg =
							0x1000000 | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
					}
				} else if (mainCode === 48) {
					// SGR 48:2::r:g:b or 48:5:N format
					if (subparts[1] === 5 && subparts[2] !== undefined) {
						currentStyle.bg = subparts[2];
					} else if (subparts[1] === 2) {
						const r = subparts[3] ?? subparts[2] ?? 0;
						const g = subparts[4] ?? subparts[3] ?? 0;
						const b = subparts[5] ?? subparts[4] ?? 0;
						currentStyle.bg =
							0x1000000 | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
					}
				}
				continue;
			}

			// Standard semicolon-separated params
			const code = Number(param);
			switch (code) {
				case 0:
					// Reset
					currentStyle = {};
					break;
				case 1:
					currentStyle.bold = true;
					break;
				case 2:
					currentStyle.dim = true;
					break;
				case 3:
					currentStyle.italic = true;
					break;
				case 4:
					// Plain SGR 4 - simple underline (no subparam)
					currentStyle.underline = true;
					currentStyle.underlineStyle = 'single';
					break;
				case 7:
					currentStyle.inverse = true;
					break;
				case 22:
					currentStyle.bold = false;
					currentStyle.dim = false;
					break;
				case 23:
					currentStyle.italic = false;
					break;
				case 24:
					// SGR 24 - underline off
					currentStyle.underline = false;
					currentStyle.underlineStyle = false;
					break;
				case 27:
					currentStyle.inverse = false;
					break;
				case 30:
				case 31:
				case 32:
				case 33:
				case 34:
				case 35:
				case 36:
				case 37:
					currentStyle.fg = code;
					break;
				case 38: {
					// Extended color: 38;5;N (256 color) or 38;2;r;g;b (true color)
					const nextParams = params.slice(i + 1).map(Number);
					if (nextParams[0] === 5 && nextParams[1] !== undefined) {
						currentStyle.fg = nextParams[1];
						i += 2;
					} else if (nextParams[0] === 2 && nextParams[3] !== undefined) {
						// True color - store as RGB values packed
						currentStyle.fg =
							0x1000000 |
							((nextParams[1]! & 0xff) << 16) |
							((nextParams[2]! & 0xff) << 8) |
							(nextParams[3]! & 0xff);
						i += 4;
					}
					break;
				}
				case 39:
					currentStyle.fg = null; // Default foreground
					break;
				case 40:
				case 41:
				case 42:
				case 43:
				case 44:
				case 45:
				case 46:
				case 47:
					currentStyle.bg = code;
					break;
				case 48: {
					// Extended color: 48;5;N (256 color) or 48;2;r;g;b (true color)
					const nextParams = params.slice(i + 1).map(Number);
					if (nextParams[0] === 5 && nextParams[1] !== undefined) {
						currentStyle.bg = nextParams[1];
						i += 2;
					} else if (nextParams[0] === 2 && nextParams[3] !== undefined) {
						// True color - store as RGB values packed
						currentStyle.bg =
							0x1000000 |
							((nextParams[1]! & 0xff) << 16) |
							((nextParams[2]! & 0xff) << 8) |
							(nextParams[3]! & 0xff);
						i += 4;
					}
					break;
				}
				case 49:
					currentStyle.bg = null; // Default background
					break;
				case 58: {
					// Underline color: 58;5;N (256 color) or 58;2;r;g;b (true color)
					const nextParams = params.slice(i + 1).map(Number);
					if (nextParams[0] === 5 && nextParams[1] !== undefined) {
						currentStyle.underlineColor = nextParams[1];
						i += 2;
					} else if (nextParams[0] === 2 && nextParams[3] !== undefined) {
						// True color - store as RGB values packed
						currentStyle.underlineColor =
							0x1000000 |
							((nextParams[1]! & 0xff) << 16) |
							((nextParams[2]! & 0xff) << 8) |
							(nextParams[3]! & 0xff);
						i += 4;
					}
					break;
				}
				case 59:
					currentStyle.underlineColor = null; // Default underline color
					break;
				case 90:
				case 91:
				case 92:
				case 93:
				case 94:
				case 95:
				case 96:
				case 97:
					currentStyle.fg = code; // Bright foreground colors
					break;
				case 100:
				case 101:
				case 102:
				case 103:
				case 104:
				case 105:
				case 106:
				case 107:
					currentStyle.bg = code; // Bright background colors
					break;
				case BG_OVERRIDE_CODE:
					// Private code: signals intentional bg override, skip conflict detection
					currentStyle.bgOverride = true;
					break;
			}
		}

		lastIndex = match.index + match[0].length;
	}

	// Add remaining text
	if (lastIndex < text.length) {
		const content = text.slice(lastIndex);
		if (content.length > 0) {
			segments.push({ text: content, ...currentStyle });
		}
	}

	return segments;
}

const ANSI_TEST_REGEX = /\x1b\[[0-9;]*[A-Za-z]/;

/**
 * Check if text contains ANSI escape sequences.
 */
export function hasAnsi(text: string): boolean {
	// Use a non-global regex for testing to avoid lastIndex issues
	return ANSI_TEST_REGEX.test(text);
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
