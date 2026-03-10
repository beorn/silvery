/**
 * @deprecated Use `App.locator()` instead (from `auto-locator.ts`). This module will be removed
 * in a future version. The auto-locator provides the same API with auto-refreshing queries that
 * re-evaluate against the current tree on each access, eliminating stale reference bugs.
 *
 * SilveryLocator - Playwright-inspired DOM queries for SilveryNode tree
 *
 * Provides lazy query evaluation - queries don't resolve until you call
 * count(), resolve(), resolveAll(), textContent(), or boundingBox().
 *
 * @example
 * ```typescript
 * const render = createRenderer({ cols: 80, rows: 24 });
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

import type { TeaNode, Rect } from "@silvery/tea/types";

/**
 * Locator interface - lazy reference to nodes matching a query
 */
export interface SilveryLocator {
  // Core queries (return new Locators)
  getByText(text: string | RegExp): SilveryLocator;
  getByTestId(id: string): SilveryLocator;

  // Attribute selector (CSS-like: '[data-selected="true"]')
  locator(selector: string): SilveryLocator;

  // Narrowing
  first(): SilveryLocator;
  last(): SilveryLocator;
  nth(index: number): SilveryLocator;

  // Resolution (actually finds nodes)
  resolve(): TeaNode | null;
  resolveAll(): TeaNode[];
  count(): number;

  // Utilities
  textContent(): string;
  getAttribute(name: string): string | undefined;
  boundingBox(): Rect | null;
  isVisible(): boolean;
}

// Query predicate type
type NodePredicate = (node: TeaNode) => boolean;

/**
 * Create a locator rooted at the given container node
 */
export function createLocator(root: TeaNode): SilveryLocator {
  return new LocatorImpl(root, []);
}

/**
 * Internal locator implementation
 */
class LocatorImpl implements SilveryLocator {
  constructor(
    private root: TeaNode,
    private predicates: NodePredicate[],
    private indexSelector?: { type: "first" | "last" | "nth"; index?: number },
  ) {}

  getByText(text: string | RegExp): SilveryLocator {
    const predicate: NodePredicate = (node) => {
      // Match nodes that have text content directly (raw text nodes)
      // OR Text nodes that contain text (but not their parent containers)
      const content = getNodeTextContent(node);
      if (!content) return false;

      // Only match if this node directly contains text or is an silvery-text
      // Skip silvery-box and silvery-root which contain text via children
      if (node.type !== "silvery-text") {
        return false;
      }

      // Skip raw text nodes if their parent also matches (match parent Text instead)
      // This prevents matching both the Text component AND its raw text child
      if (node.isRawText && node.parent?.type === "silvery-text") {
        return false;
      }

      if (typeof text === "string") {
        return content.includes(text);
      }
      return text.test(content);
    };
    return new LocatorImpl(this.root, [...this.predicates, predicate]);
  }

  getByTestId(id: string): SilveryLocator {
    const predicate: NodePredicate = (node) => {
      return getNodeProp(node, "testID") === id;
    };
    return new LocatorImpl(this.root, [...this.predicates, predicate]);
  }

  locator(selector: string): SilveryLocator {
    const predicate = parseSelector(selector);
    if (!predicate) {
      // Invalid selector - return locator that matches nothing
      return new LocatorImpl(this.root, [() => false]);
    }
    return new LocatorImpl(this.root, [...this.predicates, predicate]);
  }

  first(): SilveryLocator {
    return new LocatorImpl(this.root, this.predicates, { type: "first" });
  }

  last(): SilveryLocator {
    return new LocatorImpl(this.root, this.predicates, { type: "last" });
  }

  nth(index: number): SilveryLocator {
    return new LocatorImpl(this.root, this.predicates, {
      type: "nth",
      index,
    });
  }

  resolve(): TeaNode | null {
    const nodes = this.resolveAll();
    if (this.indexSelector) {
      switch (this.indexSelector.type) {
        case "first":
          return nodes[0] ?? null;
        case "last":
          return nodes[nodes.length - 1] ?? null;
        case "nth":
          return nodes[this.indexSelector.index ?? 0] ?? null;
      }
    }
    return nodes[0] ?? null;
  }

  resolveAll(): TeaNode[] {
    if (this.predicates.length === 0) {
      // No predicates - return root's children (or root if querying root)
      return [this.root];
    }

    const matches: TeaNode[] = [];
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
    if (!node) return "";
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
function walkTree(node: TeaNode, visitor: (node: TeaNode) => void): void {
  visitor(node);
  for (const child of node.children) {
    walkTree(child, visitor);
  }
}

/**
 * Get text content of a node (concatenated from all text descendants)
 */
function getNodeTextContent(node: TeaNode): string {
  // Raw text nodes have textContent set directly
  if (node.textContent !== undefined) {
    return node.textContent;
  }
  // Concatenate children's text content
  return node.children.map(getNodeTextContent).join("");
}

/**
 * Get a prop value from node
 */
function getNodeProp(node: TeaNode, name: string): string | undefined {
  const props = node.props as Record<string, unknown>;
  const value = props[name];
  if (value === undefined || value === null) return undefined;
  return String(value);
}

/**
 * Parse CSS-like selector into predicate
 * Supports:
 * - ID selectors: #id
 * - Attribute selectors: [attr], [attr="value"], [attr^="prefix"], [attr$="suffix"], [attr*="contains"]
 * - Combinators: > (child), + (adjacent sibling), space (descendant)
 */
function parseSelector(selector: string): NodePredicate | null {
  const trimmed = selector.trim();

  // Detect unsupported selectors and throw helpful errors
  detectUnsupportedSelectors(trimmed);

  // Check for combinators
  if (trimmed.includes(">")) {
    return parseChildCombinator(trimmed);
  }
  if (trimmed.includes("+")) {
    return parseAdjacentSiblingCombinator(trimmed);
  }
  if (trimmed.includes(" ") && !trimmed.startsWith("[")) {
    return parseDescendantCombinator(trimmed);
  }

  // Single selector
  return parseSingleSelector(trimmed);
}

/**
 * Detect unsupported CSS selector patterns and throw informative errors
 */
function detectUnsupportedSelectors(selector: string): void {
  // Pseudo-elements (::before, ::after) - check BEFORE pseudo-classes
  if (selector.includes("::")) {
    throw new Error(
      `Unsupported selector: pseudo-elements like "${selector}" are not supported.\nThe custom selector engine only supports: #id, [attr], [attr="value"], and basic combinators (>, +, space).\nIf you need pseudo-element support, see bead km-silvery-css-select for discussion about switching to css-select library.`,
    );
  }

  // Pseudo-classes (:hover, :nth-child, :not, etc.)
  if (selector.includes(":")) {
    throw new Error(
      `Unsupported selector: pseudo-classes like "${selector}" are not supported.\nThe custom selector engine only supports: #id, [attr], [attr="value"], and basic combinators (>, +, space).\nIf you need pseudo-class support, see bead km-silvery-css-select for discussion about switching to css-select library.`,
    );
  }

  // Class selectors (.class)
  if (/\.[a-zA-Z]/.test(selector)) {
    throw new Error(
      `Unsupported selector: class selectors like "${selector}" are not supported.\nThe custom selector engine only supports: #id, [attr], [attr="value"], and basic combinators (>, +, space).\nTip: Use [class="myclass"] or [class*="myclass"] instead, or see bead km-silvery-css-select for css-select library.`,
    );
  }

  // Tag/type selectors (div, span, etc.)
  // Allow single character selectors (might be valid IDs or edge cases)
  if (/^[a-z][a-z0-9-]*$/i.test(selector) && selector.length > 1) {
    throw new Error(
      `Unsupported selector: tag/type selectors like "${selector}" are not supported.\nThe custom selector engine only supports: #id, [attr], [attr="value"], and basic combinators (>, +, space).\nTip: Use [data-view="${selector}"] or similar attribute selector, or see bead km-silvery-css-select for css-select library.`,
    );
  }

  // Universal selector (*)
  if (selector.trim() === "*") {
    throw new Error(
      `Unsupported selector: universal selector "*" is not supported.\n` +
        `The custom selector engine only supports: #id, [attr], [attr="value"], and basic combinators (>, +, space).\n` +
        "If you need universal selector support, see bead km-silvery-css-select for css-select library.",
    );
  }
}

/**
 * Parse a single selector (no combinators)
 * Supports compound selectors: #id[attr="value"][attr2]
 */
function parseSingleSelector(selector: string): NodePredicate | null {
  // Parse compound selector into parts
  const parts: NodePredicate[] = [];
  let remaining = selector;

  // Extract ID if present
  const idMatch = remaining.match(/^#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    const id = idMatch[1]!;
    parts.push((node: TeaNode) => getNodeProp(node, "id") === id);
    // Remove ID from selector string
    remaining = remaining.slice(idMatch[0].length);
  }

  // Extract all attribute selectors
  const attrRegex = /\[([a-zA-Z_][a-zA-Z0-9_-]*)(?:([~^$*]?)=["']([^"']*)["'])?\]/g;
  for (const match of remaining.matchAll(attrRegex)) {
    const [, attr, op, value] = match;
    if (!attr) continue;

    if (value === undefined) {
      // Presence check [attr] - value group didn't match
      parts.push((node: TeaNode) => getNodeProp(node, attr) !== undefined);
    } else {
      // Value check [attr="value"] - value group matched
      parts.push((node: TeaNode) => {
        const nodeValue = getNodeProp(node, attr);
        if (nodeValue === undefined) return false;
        switch (op) {
          case "":
            return nodeValue === value;
          case "^":
            return nodeValue.startsWith(value ?? "");
          case "$":
            return nodeValue.endsWith(value ?? "");
          case "*":
            return nodeValue.includes(value ?? "");
          default:
            return false;
        }
      });
    }
  }

  // If no parts matched, invalid selector
  if (parts.length === 0) return null;

  // Compound selector - all parts must match
  return (node: TeaNode) => parts.every((pred) => pred(node));
}

/**
 * Parse child combinator: A > B (B is direct child of A)
 */
function parseChildCombinator(selector: string): NodePredicate | null {
  const parts = selector.split(">").map((s) => s.trim());
  if (parts.length !== 2) return null;

  const [parentSel, childSel] = parts;
  const parentPred = parseSingleSelector(parentSel!);
  const childPred = parseSingleSelector(childSel!);

  if (!parentPred || !childPred) return null;

  return (node: TeaNode) => {
    if (!childPred(node)) return false;
    // Check if parent matches
    return node.parent !== null && parentPred(node.parent);
  };
}

/**
 * Parse adjacent sibling combinator: A + B (B immediately follows A)
 */
function parseAdjacentSiblingCombinator(selector: string): NodePredicate | null {
  const parts = selector.split("+").map((s) => s.trim());
  if (parts.length !== 2) return null;

  const [prevSel, nextSel] = parts;
  const prevPred = parseSingleSelector(prevSel!);
  const nextPred = parseSingleSelector(nextSel!);

  if (!prevPred || !nextPred) return null;

  return (node: TeaNode) => {
    if (!nextPred(node)) return false;
    if (!node.parent) return false;

    // Find this node's index in parent's children
    const siblings = node.parent.children;
    const index = siblings.indexOf(node);
    if (index <= 0) return false;

    // Check if previous sibling matches
    const prevSibling = siblings[index - 1];
    return prevSibling !== undefined && prevPred(prevSibling);
  };
}

/**
 * Parse descendant combinator: A B (B is descendant of A)
 */
function parseDescendantCombinator(selector: string): NodePredicate | null {
  const parts = selector.split(/\s+/).filter((s) => s.length > 0);
  if (parts.length !== 2) return null;

  const [ancestorSel, descendantSel] = parts;
  const ancestorPred = parseSingleSelector(ancestorSel!);
  const descendantPred = parseSingleSelector(descendantSel!);

  if (!ancestorPred || !descendantPred) return null;

  return (node: TeaNode) => {
    if (!descendantPred(node)) return false;

    // Walk up the tree to find ancestor
    let current = node.parent;
    while (current) {
      if (ancestorPred(current)) return true;
      current = current.parent;
    }
    return false;
  };
}
