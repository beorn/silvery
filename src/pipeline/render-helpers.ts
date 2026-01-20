/**
 * Render Helpers - Pure utility functions for content rendering.
 *
 * Contains:
 * - Color parsing (parseColor)
 * - Border character definitions (getBorderChars)
 * - Style extraction (getTextStyle)
 * - Text width utilities (getTextWidth, sliceByWidth, sliceByWidthFromEnd)
 *
 * Re-exports layout helpers from helpers.ts:
 * - getPadding, getBorderSize
 */

import { type Color, type Style } from '../buffer.js';
import type { BoxProps, TextProps } from '../types.js';
import { displayWidthAnsi, graphemeWidth, splitGraphemes } from '../unicode.js';
import type { BorderChars } from './types.js';

// Re-export shared layout helpers
export { getBorderSize, getPadding } from './helpers.js';

// ============================================================================
// Color Parsing
// ============================================================================

/**
 * Parse color string to Color type.
 * Supports: named colors, hex (#rgb, #rrggbb), rgb(r,g,b)
 */
export function parseColor(color: string): Color {
	// Named colors map to 256-color indices
	const namedColors: Record<string, number> = {
		black: 0,
		red: 1,
		green: 2,
		yellow: 3,
		blue: 4,
		magenta: 5,
		cyan: 6,
		white: 7,
		gray: 8,
		grey: 8,
		blackBright: 8,
		redBright: 9,
		greenBright: 10,
		yellowBright: 11,
		blueBright: 12,
		magentaBright: 13,
		cyanBright: 14,
		whiteBright: 15,
	};

	if (color in namedColors) {
		return namedColors[color];
	}

	// Hex color
	if (color.startsWith('#')) {
		const hex = color.slice(1);
		if (hex.length === 3) {
			const r = Number.parseInt(hex[0] + hex[0], 16);
			const g = Number.parseInt(hex[1] + hex[1], 16);
			const b = Number.parseInt(hex[2] + hex[2], 16);
			return { r, g, b };
		}
		if (hex.length === 6) {
			const r = Number.parseInt(hex.slice(0, 2), 16);
			const g = Number.parseInt(hex.slice(2, 4), 16);
			const b = Number.parseInt(hex.slice(4, 6), 16);
			return { r, g, b };
		}
	}

	// rgb(r,g,b)
	const rgbMatch = color.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
	if (rgbMatch) {
		return {
			r: Number.parseInt(rgbMatch[1], 10),
			g: Number.parseInt(rgbMatch[2], 10),
			b: Number.parseInt(rgbMatch[3], 10),
		};
	}

	return null;
}

// ============================================================================
// Border Characters
// ============================================================================

/**
 * Get border characters for a style.
 */
export function getBorderChars(style: BoxProps['borderStyle']): BorderChars {
	const borders: Record<NonNullable<BoxProps['borderStyle']>, BorderChars> = {
		single: {
			topLeft: '\u250c',
			topRight: '\u2510',
			bottomLeft: '\u2514',
			bottomRight: '\u2518',
			horizontal: '\u2500',
			vertical: '\u2502',
		},
		double: {
			topLeft: '\u2554',
			topRight: '\u2557',
			bottomLeft: '\u255a',
			bottomRight: '\u255d',
			horizontal: '\u2550',
			vertical: '\u2551',
		},
		round: {
			topLeft: '\u256d',
			topRight: '\u256e',
			bottomLeft: '\u2570',
			bottomRight: '\u256f',
			horizontal: '\u2500',
			vertical: '\u2502',
		},
		bold: {
			topLeft: '\u250f',
			topRight: '\u2513',
			bottomLeft: '\u2517',
			bottomRight: '\u251b',
			horizontal: '\u2501',
			vertical: '\u2503',
		},
		singleDouble: {
			topLeft: '\u2553',
			topRight: '\u2556',
			bottomLeft: '\u2559',
			bottomRight: '\u255c',
			horizontal: '\u2500',
			vertical: '\u2551',
		},
		doubleSingle: {
			topLeft: '\u2552',
			topRight: '\u2555',
			bottomLeft: '\u2558',
			bottomRight: '\u255b',
			horizontal: '\u2550',
			vertical: '\u2502',
		},
		classic: {
			topLeft: '+',
			topRight: '+',
			bottomLeft: '+',
			bottomRight: '+',
			horizontal: '-',
			vertical: '|',
		},
	};

	return borders[style ?? 'single'];
}

// ============================================================================
// Style Extraction
// ============================================================================

/**
 * Get text style from props.
 */
export function getTextStyle(props: TextProps): Style {
	return {
		fg: props.color ? parseColor(props.color) : null,
		bg: props.backgroundColor ? parseColor(props.backgroundColor) : null,
		attrs: {
			bold: props.bold,
			dim: props.dim || props.dimColor, // dimColor is Ink compatibility alias
			italic: props.italic,
			underline: props.underline,
			strikethrough: props.strikethrough,
			inverse: props.inverse,
		},
	};
}

// ============================================================================
// Text Width Utilities
// ============================================================================

/**
 * Get text display width (accounting for wide characters and ANSI codes).
 * Uses ANSI-aware width calculation to handle styled text.
 */
export function getTextWidth(text: string): number {
	return displayWidthAnsi(text);
}

/**
 * Slice text by display width (from start).
 * Uses grapheme segmentation for proper Unicode handling.
 */
export function sliceByWidth(text: string, maxWidth: number): string {
	let width = 0;
	let result = '';
	const graphemes = splitGraphemes(text);

	for (const grapheme of graphemes) {
		const gWidth = graphemeWidth(grapheme);
		if (width + gWidth > maxWidth) break;
		result += grapheme;
		width += gWidth;
	}

	return result;
}

/**
 * Slice text by display width (from end).
 * Uses grapheme segmentation for proper Unicode handling.
 */
export function sliceByWidthFromEnd(text: string, maxWidth: number): string {
	const graphemes = splitGraphemes(text);
	let width = 0;
	let startIdx = graphemes.length;

	for (let i = graphemes.length - 1; i >= 0; i--) {
		const gWidth = graphemeWidth(graphemes[i]);
		if (width + gWidth > maxWidth) break;
		width += gWidth;
		startIdx = i;
	}

	return graphemes.slice(startIdx).join('');
}
