/**
 * InkxLocator - Playwright-inspired DOM queries for InkxNode tree
 *
 * Provides lazy query evaluation - queries don't resolve until you call
 * count(), resolve(), resolveAll(), textContent(), or boundingBox().
 *
 * @example
 * ```typescript
 * const render = createTestRenderer({ columns: 80, rows: 24 });
 * const { getContainer } = render(<MyComponent />);
 *
 * // Query by text content
 * const task = createLocator(getContainer()).getByText("Task 1");
 * expect(task.count()).toBe(1);
 *
 * // Query by testID prop
 * const sidebar = createLocator(getContainer()).getByTestId("sidebar");
 * expect(sidebar.boundingBox()?.width).toBe(20);
 *
 * // Attribute selectors
 * const selected = createLocator(getContainer()).locator('[data-selected="true"]');
 * expect(selected.count()).toBe(1);
 * ```
 */

import type { InkxNode, Rect } from '../types.ts';

/**
 * Locator interface - lazy reference to nodes matching a query
 */
export interface InkxLocator {
	// Core queries (return new Locators)
	getByText(text: string | RegExp): InkxLocator;
	getByTestId(id: string): InkxLocator;

	// Attribute selector (CSS-like: '[data-selected="true"]')
	locator(selector: string): InkxLocator;

	// Narrowing
	first(): InkxLocator;
	last(): InkxLocator;
	nth(index: number): InkxLocator;

	// Resolution (actually finds nodes)
	resolve(): InkxNode | null;
	resolveAll(): InkxNode[];
	count(): number;

	// Utilities
	textContent(): string;
	getAttribute(name: string): string | undefined;
	boundingBox(): Rect | null;
	isVisible(): boolean;
}

// Query predicate type
type NodePredicate = (node: InkxNode) => boolean;

/**
 * Create a locator rooted at the given container node
 */
export function createLocator(root: InkxNode): InkxLocator {
	return new LocatorImpl(root, []);
}

/**
 * Internal locator implementation
 */
class LocatorImpl implements InkxLocator {
	constructor(
		private root: InkxNode,
		private predicates: NodePredicate[],
		private indexSelector?: { type: 'first' | 'last' | 'nth'; index?: number },
	) {}

	getByText(text: string | RegExp): InkxLocator {
		const predicate: NodePredicate = (node) => {
			// Match nodes that have text content directly (raw text nodes)
			// OR Text nodes that contain text (but not their parent containers)
			const content = getNodeTextContent(node);
			if (!content) return false;

			// Only match if this node directly contains text or is an inkx-text
			// Skip inkx-box and inkx-root which contain text via children
			if (node.type !== 'inkx-text') {
				return false;
			}

			// Skip raw text nodes if their parent also matches (match parent Text instead)
			// This prevents matching both the Text component AND its raw text child
			if (node.isRawText && node.parent?.type === 'inkx-text') {
				return false;
			}

			if (typeof text === 'string') {
				return content.includes(text);
			}
			return text.test(content);
		};
		return new LocatorImpl(this.root, [...this.predicates, predicate]);
	}

	getByTestId(id: string): InkxLocator {
		const predicate: NodePredicate = (node) => {
			return getNodeProp(node, 'testID') === id;
		};
		return new LocatorImpl(this.root, [...this.predicates, predicate]);
	}

	locator(selector: string): InkxLocator {
		const predicate = parseAttributeSelector(selector);
		if (!predicate) {
			// Invalid selector - return locator that matches nothing
			return new LocatorImpl(this.root, [() => false]);
		}
		return new LocatorImpl(this.root, [...this.predicates, predicate]);
	}

	first(): InkxLocator {
		return new LocatorImpl(this.root, this.predicates, { type: 'first' });
	}

	last(): InkxLocator {
		return new LocatorImpl(this.root, this.predicates, { type: 'last' });
	}

	nth(index: number): InkxLocator {
		return new LocatorImpl(this.root, this.predicates, {
			type: 'nth',
			index,
		});
	}

	resolve(): InkxNode | null {
		const nodes = this.resolveAll();
		if (this.indexSelector) {
			switch (this.indexSelector.type) {
				case 'first':
					return nodes[0] ?? null;
				case 'last':
					return nodes[nodes.length - 1] ?? null;
				case 'nth':
					return nodes[this.indexSelector.index ?? 0] ?? null;
			}
		}
		return nodes[0] ?? null;
	}

	resolveAll(): InkxNode[] {
		if (this.predicates.length === 0) {
			// No predicates - return root's children (or root if querying root)
			return [this.root];
		}

		const matches: InkxNode[] = [];
		walkTree(this.root, (node) => {
			if (this.predicates.every((p) => p(node))) {
				matches.push(node);
			}
		});
		return matches;
	}

	count(): number {
		return this.resolveAll().length;
	}

	textContent(): string {
		const node = this.resolve();
		if (!node) return '';
		return getNodeTextContent(node);
	}

	getAttribute(name: string): string | undefined {
		const node = this.resolve();
		if (!node) return undefined;
		return getNodeProp(node, name);
	}

	boundingBox(): Rect | null {
		const node = this.resolve();
		if (!node) return null;
		return node.screenRect ?? null;
	}

	isVisible(): boolean {
		const box = this.boundingBox();
		if (!box) return false;
		// Check if any part of the node is within viewport
		// Note: We don't have viewport bounds here, so just check if it has dimensions
		return box.width > 0 && box.height > 0;
	}
}

/**
 * Walk tree depth-first, calling visitor for each node
 */
function walkTree(node: InkxNode, visitor: (node: InkxNode) => void): void {
	visitor(node);
	for (const child of node.children) {
		walkTree(child, visitor);
	}
}

/**
 * Get text content of a node (concatenated from all text descendants)
 */
function getNodeTextContent(node: InkxNode): string {
	// Raw text nodes have textContent set directly
	if (node.textContent !== undefined) {
		return node.textContent;
	}
	// Concatenate children's text content
	return node.children.map(getNodeTextContent).join('');
}

/**
 * Get a prop value from node
 */
function getNodeProp(node: InkxNode, name: string): string | undefined {
	const props = node.props as Record<string, unknown>;
	const value = props[name];
	if (value === undefined || value === null) return undefined;
	return String(value);
}

/**
 * Parse CSS-like attribute selector into predicate
 * Supports: [attr], [attr="value"], [attr^="prefix"], [attr$="suffix"], [attr*="contains"]
 */
function parseAttributeSelector(selector: string): NodePredicate | null {
	// Match [attr] for presence check
	const presenceMatch = selector.match(/^\[([a-zA-Z_][a-zA-Z0-9_-]*)\]$/);
	if (presenceMatch) {
		const attr = presenceMatch[1]!;
		return (node: InkxNode) => getNodeProp(node, attr) !== undefined;
	}

	// Match [attr="value"], [attr^="prefix"], [attr$="suffix"], [attr*="contains"]
	const valueMatch = selector.match(/^\[([a-zA-Z_][a-zA-Z0-9_-]*)([~^$*]?)=["']([^"']*)["']\]$/);
	if (!valueMatch) return null;

	const [, attr, op, value] = valueMatch;
	if (!attr) return null;

	return (node: InkxNode) => {
		const nodeValue = getNodeProp(node, attr);
		if (nodeValue === undefined) return false;

		// op is empty string for [attr="value"] (exact match)
		switch (op) {
			case '':
				return nodeValue === value;
			case '^':
				return nodeValue.startsWith(value ?? '');
			case '$':
				return nodeValue.endsWith(value ?? '');
			case '*':
				return nodeValue.includes(value ?? '');
			default:
				return false;
		}
	};
}
