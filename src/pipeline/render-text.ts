/**
 * Text Rendering - Functions for rendering text content to the buffer.
 *
 * Contains:
 * - ANSI text line rendering (renderAnsiTextLine)
 * - Plain text line rendering (renderTextLine)
 * - Text formatting (formatTextLines)
 * - Text truncation (truncateText)
 * - Text content collection (collectTextContent)
 */

import wrapAnsi from 'wrap-ansi';
import type { Color, Style, TerminalBuffer } from '../buffer.js';
import type { InkxNode, TextProps } from '../types.js';
import {
	type StyledSegment,
	graphemeWidth,
	hasAnsi,
	parseAnsiText,
	splitGraphemes,
} from '../unicode.js';
import { getTextStyle, getTextWidth, sliceByWidth, sliceByWidthFromEnd } from './render-helpers.js';

// ============================================================================
// Background Conflict Detection
// ============================================================================

/**
 * Background conflict detection mode.
 * Set via INKX_BG_CONFLICT env var: 'ignore' | 'warn' | 'throw'
 * Default: 'throw'
 *
 * - ignore: no detection (for performance or when you know what you're doing)
 * - warn: log warning once per unique conflict (deduplicated)
 * - throw: throw Error immediately (catches programming errors in dev)
 */
type BgConflictMode = 'ignore' | 'warn' | 'throw';

/**
 * Get the current background conflict detection mode.
 * Evaluated at runtime to allow tests to change the env var.
 */
function getBgConflictMode(): BgConflictMode {
	const env = process.env.INKX_BG_CONFLICT?.toLowerCase();
	if (env === 'ignore' || env === 'warn' || env === 'throw') return env;
	return 'throw'; // default - fail fast on programming errors
}

// Track warned conflicts to avoid spam (only used in 'warn' mode)
const warnedBgConflicts = new Set<string>();

/**
 * Clear the background conflict warning cache.
 * Call this at the start of each render cycle to:
 * - Prevent memory leaks in long-running apps
 * - Allow warnings to repeat after user fixes issues
 */
export function clearBgConflictWarnings(): void {
	warnedBgConflicts.clear();
}

// ============================================================================
// Text Content Collection
// ============================================================================

/**
 * Style context for nested Text elements.
 * Tracks cumulative styles through the tree to enable proper push/pop behavior.
 */
interface StyleContext {
	color?: string;
	backgroundColor?: string;
	bold?: boolean;
	dim?: boolean;
	italic?: boolean;
	underline?: boolean;
	inverse?: boolean;
	strikethrough?: boolean;
}

/**
 * Build ANSI escape sequence for a style context.
 */
function styleToAnsi(style: StyleContext): string {
	const codes: number[] = [];

	// Foreground color
	if (style.color) {
		const color = getTextStyle({ color: style.color } as TextProps).fg;
		if (color !== null) {
			if (typeof color === 'number') {
				codes.push(38, 5, color);
			} else {
				codes.push(38, 2, color.r, color.g, color.b);
			}
		}
	}

	// Background color
	if (style.backgroundColor) {
		const color = getTextStyle({
			backgroundColor: style.backgroundColor,
		} as TextProps).bg;
		if (color !== null) {
			if (typeof color === 'number') {
				codes.push(48, 5, color);
			} else {
				codes.push(48, 2, color.r, color.g, color.b);
			}
		}
	}

	// Attributes
	if (style.bold) codes.push(1);
	if (style.dim) codes.push(2);
	if (style.italic) codes.push(3);
	if (style.underline) codes.push(4);
	if (style.inverse) codes.push(7);
	if (style.strikethrough) codes.push(9);

	if (codes.length === 0) {
		return '';
	}

	return `\x1b[${codes.join(';')}m`;
}

/**
 * Merge child props into parent context.
 * Child values override parent values when specified.
 */
function mergeStyleContext(parent: StyleContext, childProps: TextProps): StyleContext {
	return {
		color: childProps.color ?? parent.color,
		backgroundColor: childProps.backgroundColor ?? parent.backgroundColor,
		bold: childProps.bold ?? parent.bold,
		dim: childProps.dim ?? childProps.dimColor ?? parent.dim,
		italic: childProps.italic ?? parent.italic,
		underline: childProps.underline ?? parent.underline,
		inverse: childProps.inverse ?? parent.inverse,
		strikethrough: childProps.strikethrough ?? parent.strikethrough,
	};
}

/**
 * Apply text styles as ANSI escape codes with proper push/pop behavior.
 * After the child text, restores the parent context's styles.
 *
 * @param text - The text content to wrap
 * @param childStyle - The merged style for this child (child overrides parent)
 * @param parentStyle - The parent's style context to restore after
 */
function applyTextStyleAnsi(
	text: string,
	childStyle: StyleContext,
	parentStyle: StyleContext,
): string {
	if (!text) {
		return text;
	}

	const childAnsi = styleToAnsi(childStyle);
	const parentAnsi = styleToAnsi(parentStyle);

	// If child has no style changes, just return text
	if (!childAnsi) {
		return text;
	}

	// Apply child style, then reset and re-apply parent style
	// We use \x1b[0m to reset, then re-apply parent styles
	return `${childAnsi}${text}\x1b[0m${parentAnsi}`;
}

/**
 * Recursively collect text content from a node and its children.
 * Handles both raw text nodes (textContent set directly) and
 * Text component wrappers (text in children).
 *
 * For nested Text nodes with style props (color, bold, etc.),
 * applies ANSI codes so the styles are preserved when rendered.
 * Uses a style stack to properly restore parent styles after nested elements.
 *
 * @param node - The node to collect text from
 * @param parentContext - The inherited style context from parent (used for restoration)
 */
export function collectTextContent(node: InkxNode, parentContext: StyleContext = {}): string {
	// If this node has direct text content, return it
	if (node.textContent !== undefined) {
		return node.textContent;
	}

	// Otherwise, collect from children
	let result = '';
	for (const child of node.children) {
		// If child is a Text node (virtual/nested) with style props, apply ANSI codes
		if (child.type === 'inkx-text' && child.props && !child.layoutNode) {
			const childProps = child.props as TextProps;
			// Merge child props with parent context to get effective child style
			const childContext = mergeStyleContext(parentContext, childProps);
			// Recursively collect with child's context
			const childContent = collectTextContent(child, childContext);
			// Apply styles with proper push/pop (child style, then restore parent)
			result += applyTextStyleAnsi(childContent, childContext, parentContext);
		} else {
			// Not a styled Text node, just collect recursively
			result += collectTextContent(child, parentContext);
		}
	}
	return result;
}

// ============================================================================
// Text Formatting
// ============================================================================

/**
 * Format text into lines based on wrap mode.
 */
export function formatTextLines(text: string, width: number, wrap: TextProps['wrap']): string[] {
	// Guard against width <= 0 to prevent infinite loops
	// This can happen with display="none" nodes (0x0 dimensions)
	if (width <= 0) {
		return [];
	}

	// Convert tabs to spaces (tabs have 0 display width in string-width library)
	const normalizedText = text.replace(/\t/g, '    ');
	const lines = normalizedText.split('\n');

	// No wrapping, just truncate at end
	if (wrap === false || wrap === 'truncate-end' || wrap === 'truncate') {
		return lines.map((line) => truncateText(line, width, 'end'));
	}

	if (wrap === 'truncate-start') {
		return lines.map((line) => truncateText(line, width, 'start'));
	}

	if (wrap === 'truncate-middle') {
		return lines.map((line) => truncateText(line, width, 'middle'));
	}

	// wrap === true or wrap === 'wrap' - word-aware wrapping using wrap-ansi
	// This breaks at word boundaries when possible, preserving ANSI styles
	// trim: true removes leading/trailing spaces from wrapped lines
	// This prevents extra leading spaces on continuation lines when wrapping
	// mid-sentence (e.g., "word1 word2" wrapped → "word1" and "word2", not " word2")
	const wrapped = wrapAnsi(normalizedText, width, { hard: true, trim: true });
	return wrapped.split('\n');
}

/**
 * Truncate text to fit within width.
 */
export function truncateText(
	text: string,
	width: number,
	mode: 'start' | 'middle' | 'end',
): string {
	const textWidth = getTextWidth(text);
	if (textWidth <= width) return text;

	const ellipsis = '\u2026'; // ...
	const availableWidth = width - 1; // Reserve space for ellipsis

	if (availableWidth <= 0) {
		return width > 0 ? ellipsis : '';
	}

	if (mode === 'end') {
		return sliceByWidth(text, availableWidth) + ellipsis;
	}

	if (mode === 'start') {
		return ellipsis + sliceByWidthFromEnd(text, availableWidth);
	}

	// middle
	const halfWidth = Math.floor(availableWidth / 2);
	const startPart = sliceByWidth(text, halfWidth);
	const endPart = sliceByWidthFromEnd(text, availableWidth - halfWidth);
	return startPart + ellipsis + endPart;
}

// ============================================================================
// Text Line Rendering
// ============================================================================

/**
 * Render a single line of text to the buffer.
 */
export function renderTextLine(
	buffer: TerminalBuffer,
	x: number,
	y: number,
	text: string,
	baseStyle: Style,
): void {
	// Check if text contains ANSI escape sequences
	if (hasAnsi(text)) {
		renderAnsiTextLine(buffer, x, y, text, baseStyle);
		return;
	}

	// Regular text without ANSI codes
	// Use grapheme segmentation to properly handle:
	// - Emoji (width 2)
	// - Combining characters (width 0, merged with base char)
	// - CJK characters (width 2)
	let col = x;
	const graphemes = splitGraphemes(text);

	for (const grapheme of graphemes) {
		if (col >= buffer.width) break;

		const width = graphemeWidth(grapheme);

		// Skip zero-width graphemes (should be merged by graphemer, but just in case)
		if (width === 0) continue;

		// Preserve existing background color if text style doesn't specify one
		// This allows Text inside Box with backgroundColor to inherit the bg
		const existingBg = baseStyle.bg === null ? buffer.getCell(col, y).bg : baseStyle.bg;

		buffer.setCell(col, y, {
			char: grapheme,
			fg: baseStyle.fg,
			bg: existingBg,
			attrs: baseStyle.attrs,
			wide: width === 2,
			continuation: false,
		});

		if (width === 2 && col + 1 < buffer.width) {
			// Wide character continuation cell
			const existingBg2 = baseStyle.bg === null ? buffer.getCell(col + 1, y).bg : baseStyle.bg;
			buffer.setCell(col + 1, y, {
				char: '',
				fg: baseStyle.fg,
				bg: existingBg2,
				attrs: baseStyle.attrs,
				wide: false,
				continuation: true,
			});
			col += 2;
		} else {
			col += width;
		}
	}
}

/**
 * Render text line with ANSI escape sequences.
 * Parses ANSI codes and applies styles to individual segments.
 */
export function renderAnsiTextLine(
	buffer: TerminalBuffer,
	x: number,
	y: number,
	text: string,
	baseStyle: Style,
): void {
	const segments = parseAnsiText(text);
	let col = x;

	for (const segment of segments) {
		// Merge segment style with base style
		const style = mergeAnsiStyle(baseStyle, segment);

		// Detect background conflict: chalk.bg* overwrites existing inkx background
		// Check both: 1) Text's own backgroundColor, 2) Parent Box's bg already in buffer
		// Skip if segment has bgOverride flag (explicit opt-out via chalkx.bgOverride)
		const bgConflictMode = getBgConflictMode();
		if (
			bgConflictMode !== 'ignore' &&
			!segment.bgOverride &&
			segment.bg !== undefined &&
			segment.bg !== null
		) {
			// Check if there's an existing background (from Text prop or parent Box fill)
			const existingBufBg = col < buffer.width ? buffer.getCell(col, y).bg : null;
			const hasExistingBg = baseStyle.bg !== null || existingBufBg !== null;

			if (hasExistingBg) {
				const preview = segment.text.slice(0, 30);
				const msg = `[inkx] Background conflict: chalk.bg* on text that already has inkx background. Chalk bg will override only text characters, causing visual gaps in padding. Use chalkx.bgOverride() to suppress if intentional. Text: "${preview}${segment.text.length > 30 ? '...' : ''}"`;

				if (bgConflictMode === 'throw') {
					throw new Error(msg);
				}
				// 'warn' mode - deduplicate
				const key = `${JSON.stringify(existingBufBg)}-${segment.bg}-${preview}`;
				if (!warnedBgConflicts.has(key)) {
					warnedBgConflicts.add(key);
					console.warn(msg);
				}
			}
		}

		// Use grapheme segmentation for proper Unicode handling
		const graphemes = splitGraphemes(segment.text);

		for (const grapheme of graphemes) {
			if (col >= buffer.width) break;

			const width = graphemeWidth(grapheme);

			// Skip zero-width graphemes
			if (width === 0) continue;

			// Preserve existing background color if style doesn't specify one
			// This allows Text inside Box with backgroundColor to inherit the bg
			const existingBg = style.bg === null ? buffer.getCell(col, y).bg : style.bg;

			buffer.setCell(col, y, {
				char: grapheme,
				fg: style.fg,
				bg: existingBg,
				attrs: style.attrs,
				wide: width === 2,
				continuation: false,
			});

			if (width === 2 && col + 1 < buffer.width) {
				const existingBg2 = style.bg === null ? buffer.getCell(col + 1, y).bg : style.bg;
				buffer.setCell(col + 1, y, {
					char: '',
					fg: style.fg,
					bg: existingBg2,
					attrs: style.attrs,
					wide: false,
					continuation: true,
				});
				col += 2;
			} else {
				col += width;
			}
		}
	}
}

// ============================================================================
// ANSI Style Helpers
// ============================================================================

/**
 * Merge ANSI segment style with base style.
 * ANSI styles override base styles where specified.
 */
function mergeAnsiStyle(base: Style, segment: StyledSegment): Style {
	let fg = base.fg;
	let bg = base.bg;

	// Convert ANSI SGR code to our color format
	if (segment.fg !== undefined && segment.fg !== null) {
		fg = ansiColorToColor(segment.fg, false);
	}
	if (segment.bg !== undefined && segment.bg !== null) {
		bg = ansiColorToColor(segment.bg, true);
	}

	// Merge attributes - start with base, then apply ANSI overrides
	const attrs = {
		...base.attrs,
		bold: segment.bold || base.attrs.bold,
		dim: segment.dim || base.attrs.dim,
		italic: segment.italic || base.attrs.italic,
		underline: segment.underline || base.attrs.underline,
		inverse: segment.inverse || base.attrs.inverse,
	};

	return { fg, bg, attrs };
}

/**
 * Convert ANSI SGR color code to our Color type.
 * Color is: number (256-color index) | { r, g, b } (true color) | null
 */
function ansiColorToColor(code: number, _isBg: boolean): Color {
	// True color (packed RGB with 0x1000000 marker from parseAnsiText)
	if (code >= 0x1000000) {
		const r = (code >> 16) & 0xff;
		const g = (code >> 8) & 0xff;
		const b = code & 0xff;
		return { r, g, b };
	}

	// 256 color palette index (0-255)
	if (code < 30 || (code >= 38 && code < 40) || (code >= 48 && code < 90)) {
		// Direct palette index - map common ones
		const paletteMap: Record<number, number> = {
			0: 0, // black
			1: 1, // red
			2: 2, // green
			3: 3, // yellow
			4: 4, // blue
			5: 5, // magenta
			6: 6, // cyan
			7: 7, // white
			8: 8, // gray
			9: 9, // redBright
			10: 10, // greenBright
			11: 11, // yellowBright
			12: 12, // blueBright
			13: 13, // magentaBright
			14: 14, // cyanBright
			15: 15, // whiteBright
		};
		return paletteMap[code] ?? code;
	}

	// Standard foreground colors (30-37) map to palette 0-7
	if (code >= 30 && code <= 37) {
		return code - 30;
	}

	// Standard background colors (40-47) map to palette 0-7
	if (code >= 40 && code <= 47) {
		return code - 40;
	}

	// Bright foreground colors (90-97) map to palette 8-15
	if (code >= 90 && code <= 97) {
		return code - 90 + 8;
	}

	// Bright background colors (100-107) map to palette 8-15
	if (code >= 100 && code <= 107) {
		return code - 100 + 8;
	}

	return null;
}

// ============================================================================
// Render Text Node (Main Entry Point)
// ============================================================================

/**
 * Render a Text node.
 */
export function renderText(
	node: InkxNode,
	buffer: TerminalBuffer,
	layout: { x: number; y: number; width: number; height: number },
	props: TextProps,
	scrollOffset = 0,
	clipBounds?: { top: number; bottom: number },
): void {
	const { x, width, height } = layout;
	let { y } = layout;

	// Apply scroll offset
	y -= scrollOffset;

	// Clip to bounds if specified
	if (clipBounds) {
		if (y + height <= clipBounds.top || y >= clipBounds.bottom) {
			return; // Completely outside clip bounds
		}
	}

	// Collect text content from this node and all children
	// This handles both raw text nodes and <Text>content</Text> wrapper nodes
	const text = collectTextContent(node);

	// Get style
	const style = getTextStyle(props);

	// Handle wrapping/truncation
	const lines = formatTextLines(text, width, props.wrap);

	// Render each line
	for (let lineIdx = 0; lineIdx < lines.length && lineIdx < height; lineIdx++) {
		const lineY = y + lineIdx;
		// Skip lines outside clip bounds
		if (clipBounds && (lineY < clipBounds.top || lineY >= clipBounds.bottom)) {
			continue;
		}
		const line = lines[lineIdx];
		renderTextLine(buffer, x, lineY, line, style);
	}
}
