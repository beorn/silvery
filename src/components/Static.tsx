/**
 * Inkx Static Component
 *
 * Renders items that are written to the terminal once and never updated.
 * Useful for logs, progress outputs, or any content that should remain
 * visible after being rendered.
 */

import type { ReactNode } from 'react';

export interface StaticProps<T> {
	/** Items to render */
	items: T[];
	/** Render function for each item */
	children: (item: T, index: number) => ReactNode;
	/** Style to apply to the container */
	style?: Record<string, unknown>;
}

/**
 * Renders a list of items that are written once and never updated.
 *
 * Static content is rendered above the main UI and remains visible
 * even as the main UI updates. Each item is rendered only once.
 *
 * @example
 * ```tsx
 * const [logs, setLogs] = useState<string[]>([]);
 *
 * // Logs appear above the main UI and stay visible
 * <Static items={logs}>
 *   {(log, index) => <Text key={index}>{log}</Text>}
 * </Static>
 *
 * // Main UI continues below
 * <Box>
 *   <Text>Current status: processing...</Text>
 * </Box>
 * ```
 */
export function Static<T>({ items, children, style }: StaticProps<T>): JSX.Element {
	return (
		<inkx-box flexDirection="column" {...style}>
			{items.map((item, index) => children(item, index))}
		</inkx-box>
	);
}
