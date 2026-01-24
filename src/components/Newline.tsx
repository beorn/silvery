/**
 * Inkx Newline Component
 *
 * Renders a newline character. Useful for adding vertical spacing in text.
 */

import type { JSX } from 'react';

export interface NewlineProps {
	/** Number of newlines to render (default: 1) */
	count?: number;
}

/**
 * Renders one or more newline characters.
 *
 * @example
 * ```tsx
 * <Text>Line 1</Text>
 * <Newline />
 * <Text>Line 3 (after blank line)</Text>
 *
 * <Newline count={2} />
 * ```
 */
export function Newline({ count = 1 }: NewlineProps): JSX.Element {
	return <inkx-text>{'\n'.repeat(count)}</inkx-text>;
}
