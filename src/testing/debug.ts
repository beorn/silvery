/**
 * Debug Tree Inspection
 *
 * Pretty-prints InkxNode trees for debugging TUI tests.
 * Similar to React DevTools component tree or browser DOM inspection.
 *
 * @example
 * ```tsx
 * import { debugTree } from 'inkx/testing'
 *
 * const { getContainer } = render(<MyComponent />)
 * console.log(debugTree(getContainer()))
 * // Output:
 * // <inkx-root [0,0 80×24]>
 * //   <inkx-box testID="main" [0,0 80×24]>
 * //     <inkx-text "Hello World" [0,0 11×1]>
 * ```
 */

import type { InkxNode } from '../types.js';

export interface DebugTreeOptions {
	/** Maximum depth to traverse (default: unlimited) */
	depth?: number;
	/** Include layout rectangles (default: true) */
	showRects?: boolean;
	/** Include text content (default: true) */
	showText?: boolean;
}

/**
 * Pretty-print InkxNode tree for debugging.
 *
 * @param node - Root node to inspect
 * @param options - Display options
 * @returns Formatted tree string
 */
export function debugTree(node: InkxNode, options: DebugTreeOptions = {}): string {
	const { depth = Number.POSITIVE_INFINITY, showRects = true, showText = true } = options;
	const lines: string[] = [];

	// Safe JSON.stringify that handles cyclic references
	function safeStringify(value: unknown): string {
		try {
			return JSON.stringify(value);
		} catch {
			// Handle cyclic structures or other stringify errors
			if (typeof value === 'object' && value !== null) {
				return '[object]';
			}
			return String(value);
		}
	}

	function walk(n: InkxNode, indent: number, currentDepth: number): void {
		if (currentDepth > depth) return;

		// Build props string (exclude children and internal props)
		const props = Object.entries(n.props ?? {})
			.filter(([k]) => !['children'].includes(k))
			.filter(([, v]) => v !== undefined && v !== null && v !== false)
			.map(([k, v]) => {
				if (typeof v === 'string') return `${k}="${v}"`;
				if (typeof v === 'boolean') return k;
				return `${k}=${safeStringify(v)}`;
			})
			.join(' ');

		// Build rect string
		let rect = '';
		if (showRects && n.screenRect) {
			const { x, y, width, height } = n.screenRect;
			rect = ` [${x},${y} ${width}×${height}]`;
		}

		// Build text content string
		let text = '';
		if (showText && n.textContent) {
			// Truncate long text
			const content =
				n.textContent.length > 40 ? n.textContent.slice(0, 37) + '...' : n.textContent;
			text = ` "${content}"`;
		}

		// Format line
		const propsStr = props ? ' ' + props : '';
		lines.push('  '.repeat(indent) + `<${n.type}${propsStr}${text}${rect}>`);

		// Recurse into children
		for (const child of n.children) {
			walk(child, indent + 1, currentDepth + 1);
		}
	}

	walk(node, 0, 0);
	return lines.join('\n');
}
