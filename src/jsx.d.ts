/**
 * JSX type declarations for Inkx custom host elements.
 *
 * This declares the 'inkx-box' and 'inkx-text' intrinsic elements that the
 * React reconciler handles. These are custom host elements, not DOM elements.
 */

import type { BoxProps, TextProps } from './types.js';

declare global {
	namespace JSX {
		interface IntrinsicElements {
			'inkx-box': BoxProps & { children?: React.ReactNode };
			'inkx-text': TextProps & { children?: React.ReactNode };
		}
	}
}
