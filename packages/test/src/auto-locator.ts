/**
 * AutoLocator - Self-refreshing Playwright-style locator (canonical implementation)
 *
 * This is the primary locator API. Prefer `App.locator()` / `App.getByTestId()` /
 * `App.getByText()` which use AutoLocator internally.
 *
 * Unlike the static SilveryLocator in `testing/locator.ts` (legacy, deprecated),
 * AutoLocator re-evaluates queries against the current tree on each access.
 * This eliminates the stale locator problem in tests.
 *
 * @example
 * ```tsx
 * const app = render(<Board />)
 * const cursor = app.locator('[data-cursor]')
 *
 * // Same locator, fresh result after state change
 * expect(cursor.textContent()).toBe('item1')
 * await app.press('j')
 * expect(cursor.textContent()).toBe('item2')  // Auto-refreshed!
 * ```
 */

import type { TeaNode, Rect } from "@silvery/tea/types"

/**
 * Filter options for locator narrowing
 */
export interface FilterOptions {
  /** Match nodes containing this text */
  hasText?: string | RegExp
  /** Match nodes with this testID */
  hasTestId?: string
  /** Match nodes with this attribute value */
  has?: { attr: string; value?: string }
}

/**
 * AutoLocator interface - lazy, self-refreshing reference to nodes
 */
export interface AutoLocator {
  // Core queries (return new AutoLocators)
  getByText(text: string | RegExp): AutoLocator
  getByTestId(id: string): AutoLocator
  locator(selector: string): AutoLocator

  // Filtering
  filter(options: FilterOptions): AutoLocator
  filter(predicate: (node: TeaNode) => boolean): AutoLocator

  // Narrowing
  first(): AutoLocator
  last(): AutoLocator
  nth(index: number): AutoLocator

  // Resolution (actually finds nodes - re-evaluates on each call)
  resolve(): TeaNode | null
  resolveAll(): TeaNode[]
  count(): number

  // Utilities (resolve then read)
  textContent(): string
  getAttribute(name: string): string | undefined
  boundingBox(): Rect | null
  isVisible(): boolean
}

// Query predicate type
type NodePredicate = (node: TeaNode) => boolean

/**
 * Create an AutoLocator from a container getter function.
 * The getter is called fresh on each resolution.
 */
export function createAutoLocator(getContainer: () => TeaNode): AutoLocator {
  return new AutoLocatorImpl(getContainer, [])
}

/**
 * AutoLocator implementation
 */
class AutoLocatorImpl implements AutoLocator {
  constructor(
    private getContainer: () => TeaNode,
    private predicates: NodePredicate[],
    private indexSelector?: { type: "first" | "last" | "nth"; index?: number },
  ) {}

  getByText(text: string | RegExp): AutoLocator {
    const predicate: NodePredicate = (node) => {
      const content = getNodeTextContent(node)
      if (!content) return false

      // Only match silvery-text nodes (not containers)
      if (node.type !== "silvery-text") {
        return false
      }

      // Skip raw text nodes if their parent also matches
      if (node.isRawText && node.parent?.type === "silvery-text") {
        return false
      }

      if (typeof text === "string") {
        return content.includes(text)
      }
      return text.test(content)
    }
    return new AutoLocatorImpl(this.getContainer, [...this.predicates, predicate])
  }

  getByTestId(id: string): AutoLocator {
    const predicate: NodePredicate = (node) => {
      return getNodeProp(node, "testID") === id
    }
    return new AutoLocatorImpl(this.getContainer, [...this.predicates, predicate])
  }

  locator(selector: string): AutoLocator {
    const predicate = parseSelector(selector)
    if (!predicate) {
      // Invalid selector - return locator that matches nothing
      return new AutoLocatorImpl(this.getContainer, [() => false])
    }
    return new AutoLocatorImpl(this.getContainer, [...this.predicates, predicate])
  }

  filter(optionsOrPredicate: FilterOptions | ((node: TeaNode) => boolean)): AutoLocator {
    let predicate: NodePredicate

    if (typeof optionsOrPredicate === "function") {
      predicate = optionsOrPredicate
    } else {
      const opts = optionsOrPredicate
      predicate = (node: TeaNode) => {
        if (opts.hasText !== undefined) {
          const content = getNodeTextContent(node)
          if (typeof opts.hasText === "string") {
            if (!content.includes(opts.hasText)) return false
          } else {
            if (!opts.hasText.test(content)) return false
          }
        }
        if (opts.hasTestId !== undefined) {
          if (getNodeProp(node, "testID") !== opts.hasTestId) return false
        }
        if (opts.has !== undefined) {
          const value = getNodeProp(node, opts.has.attr)
          if (opts.has.value !== undefined) {
            if (value !== opts.has.value) return false
          } else {
            if (value === undefined) return false
          }
        }
        return true
      }
    }

    return new AutoLocatorImpl(this.getContainer, [...this.predicates, predicate])
  }

  first(): AutoLocator {
    return new AutoLocatorImpl(this.getContainer, this.predicates, {
      type: "first",
    })
  }

  last(): AutoLocator {
    return new AutoLocatorImpl(this.getContainer, this.predicates, {
      type: "last",
    })
  }

  nth(index: number): AutoLocator {
    return new AutoLocatorImpl(this.getContainer, this.predicates, {
      type: "nth",
      index,
    })
  }

  resolve(): TeaNode | null {
    const nodes = this.resolveAll()
    if (this.indexSelector) {
      switch (this.indexSelector.type) {
        case "first":
          return nodes[0] ?? null
        case "last":
          return nodes[nodes.length - 1] ?? null
        case "nth":
          return nodes[this.indexSelector.index ?? 0] ?? null
      }
    }
    return nodes[0] ?? null
  }

  resolveAll(): TeaNode[] {
    // Get fresh container on each resolution
    const container = this.getContainer()

    if (this.predicates.length === 0) {
      return [container]
    }

    const matches: TeaNode[] = []
    walkTree(container, (node) => {
      if (this.predicates.every((p) => p(node))) {
        matches.push(node)
      }
    })
    return matches
  }

  count(): number {
    return this.resolveAll().length
  }

  textContent(): string {
    const node = this.resolve()
    if (!node) return ""
    return getNodeTextContent(node)
  }

  getAttribute(name: string): string | undefined {
    const node = this.resolve()
    if (!node) return undefined
    return getNodeProp(node, name)
  }

  boundingBox(): Rect | null {
    const node = this.resolve()
    if (!node) return null
    return node.screenRect ?? null
  }

  isVisible(): boolean {
    const box = this.boundingBox()
    if (!box) return false
    return box.width > 0 && box.height > 0
  }
}

// ============================================================================
// Tree Walking Helpers
// ============================================================================

/**
 * Walk tree depth-first, calling visitor for each node
 */
function walkTree(node: TeaNode, visitor: (node: TeaNode) => void): void {
  visitor(node)
  for (const child of node.children) {
    walkTree(child, visitor)
  }
}

/**
 * Get text content of a node (concatenated from all text descendants)
 */
function getNodeTextContent(node: TeaNode): string {
  if (node.textContent !== undefined) {
    return node.textContent
  }
  return node.children.map(getNodeTextContent).join("")
}

/**
 * Get a prop value from node
 */
function getNodeProp(node: TeaNode, name: string): string | undefined {
  const props = node.props as Record<string, unknown>
  const value = props[name]
  if (value === undefined || value === null) return undefined
  return String(value)
}

// ============================================================================
// Selector Parsing (from locator.ts)
// ============================================================================

/**
 * Parse CSS-like selector into predicate
 */
function parseSelector(selector: string): NodePredicate | null {
  const trimmed = selector.trim()

  // Check for combinators
  if (trimmed.includes(">")) {
    return parseChildCombinator(trimmed)
  }
  if (trimmed.includes("+")) {
    return parseAdjacentSiblingCombinator(trimmed)
  }
  if (trimmed.includes(" ") && !trimmed.startsWith("[")) {
    return parseDescendantCombinator(trimmed)
  }

  return parseSingleSelector(trimmed)
}

/**
 * Parse a single selector (no combinators)
 */
function parseSingleSelector(selector: string): NodePredicate | null {
  const parts: NodePredicate[] = []
  let remaining = selector

  // Universal selector - matches all nodes
  if (remaining === "*") {
    return () => true
  }

  // Extract ID if present
  const idMatch = remaining.match(/^#([a-zA-Z0-9_-]+)/)
  if (idMatch) {
    const id = idMatch[1]!
    parts.push((node: TeaNode) => getNodeProp(node, "id") === id)
    remaining = remaining.slice(idMatch[0].length)
  }

  // Extract all attribute selectors
  const attrRegex = /\[([a-zA-Z_][a-zA-Z0-9_-]*)(?:([~^$*]?)=["']([^"']*)["'])?\]/g
  for (const match of remaining.matchAll(attrRegex)) {
    const [, attr, op, value] = match
    if (!attr) continue

    if (value === undefined) {
      parts.push((node: TeaNode) => getNodeProp(node, attr) !== undefined)
    } else {
      parts.push((node: TeaNode) => {
        const nodeValue = getNodeProp(node, attr)
        if (nodeValue === undefined) return false
        switch (op) {
          case "":
            return nodeValue === value
          case "^":
            return nodeValue.startsWith(value ?? "")
          case "$":
            return nodeValue.endsWith(value ?? "")
          case "*":
            return nodeValue.includes(value ?? "")
          default:
            return false
        }
      })
    }
  }

  if (parts.length === 0) return null

  return (node: TeaNode) => parts.every((pred) => pred(node))
}

/**
 * Parse child combinator: A > B
 */
function parseChildCombinator(selector: string): NodePredicate | null {
  const parts = selector.split(">").map((s) => s.trim())
  if (parts.length !== 2) return null

  const [parentSel, childSel] = parts
  const parentPred = parseSingleSelector(parentSel!)
  const childPred = parseSingleSelector(childSel!)

  if (!parentPred || !childPred) return null

  return (node: TeaNode) => {
    if (!childPred(node)) return false
    return node.parent !== null && parentPred(node.parent)
  }
}

/**
 * Parse adjacent sibling combinator: A + B
 */
function parseAdjacentSiblingCombinator(selector: string): NodePredicate | null {
  const parts = selector.split("+").map((s) => s.trim())
  if (parts.length !== 2) return null

  const [prevSel, nextSel] = parts
  const prevPred = parseSingleSelector(prevSel!)
  const nextPred = parseSingleSelector(nextSel!)

  if (!prevPred || !nextPred) return null

  return (node: TeaNode) => {
    if (!nextPred(node)) return false
    if (!node.parent) return false

    const siblings = node.parent.children
    const index = siblings.indexOf(node)
    if (index <= 0) return false

    const prevSibling = siblings[index - 1]
    return prevSibling !== undefined && prevPred(prevSibling)
  }
}

/**
 * Parse descendant combinator: A B
 */
function parseDescendantCombinator(selector: string): NodePredicate | null {
  const parts = selector.split(/\s+/).filter((s) => s.length > 0)
  if (parts.length !== 2) return null

  const [ancestorSel, descendantSel] = parts
  const ancestorPred = parseSingleSelector(ancestorSel!)
  const descendantPred = parseSingleSelector(descendantSel!)

  if (!ancestorPred || !descendantPred) return null

  return (node: TeaNode) => {
    if (!descendantPred(node)) return false

    let current = node.parent
    while (current) {
      if (ancestorPred(current)) return true
      current = current.parent
    }
    return false
  }
}
