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

import type { AgNode, Rect } from "@silvery/ag/types"

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
  filter(predicate: (node: AgNode) => boolean): AutoLocator

  // Narrowing
  first(): AutoLocator
  last(): AutoLocator
  nth(index: number): AutoLocator

  // Resolution (actually finds nodes - re-evaluates on each call)
  resolve(): AgNode | null
  resolveAll(): AgNode[]
  count(): number

  // Utilities (resolve then read)
  textContent(): string
  getAttribute(name: string): string | undefined
  boundingBox(): Rect | null
  isVisible(): boolean
}

// Query predicate type
type NodePredicate = (node: AgNode) => boolean

/**
 * Create an AutoLocator from a container getter function.
 * The getter is called fresh on each resolution.
 */
export function createAutoLocator(getContainer: () => AgNode): AutoLocator {
  return new AutoLocatorImpl(getContainer, [])
}

/**
 * AutoLocator implementation
 */
class AutoLocatorImpl implements AutoLocator {
  constructor(
    private getContainer: () => AgNode,
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

  filter(optionsOrPredicate: FilterOptions | ((node: AgNode) => boolean)): AutoLocator {
    let predicate: NodePredicate

    if (typeof optionsOrPredicate === "function") {
      predicate = optionsOrPredicate
    } else {
      const opts = optionsOrPredicate
      predicate = (node: AgNode) => {
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

  resolve(): AgNode | null {
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

  resolveAll(): AgNode[] {
    // Get fresh container on each resolution
    const container = this.getContainer()

    if (this.predicates.length === 0) {
      return [container]
    }

    const matches: AgNode[] = []
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
    return node.scrollRect ?? null
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
function walkTree(node: AgNode, visitor: (node: AgNode) => void): void {
  visitor(node)
  for (const child of node.children) {
    walkTree(child, visitor)
  }
}

/**
 * Get text content of a node (concatenated from all text descendants)
 */
function getNodeTextContent(node: AgNode): string {
  if (node.textContent !== undefined) {
    return node.textContent
  }
  return node.children.map(getNodeTextContent).join("")
}

/**
 * Get a prop value from node
 */
function getNodeProp(node: AgNode, name: string): string | undefined {
  const props = node.props as Record<string, unknown>
  const value = props[name]
  if (value === undefined || value === null) return undefined
  return String(value)
}

// ============================================================================
// Selector Parsing
// ============================================================================

/**
 * Combinator types used in CSS selector chains
 */
type CombinatorType = ">" | "+" | "~" | " "

/**
 * A token in a parsed selector chain: a simple selector string paired with
 * the combinator that connects it to the next token.
 */
interface SelectorToken {
  selector: string
  combinator: CombinatorType | null // null for the last token
}

/**
 * Tokenize a CSS selector into segments separated by combinators.
 *
 * Splits on `>`, `+`, `~`, and whitespace (descendant combinator) while
 * preserving which combinator separates each pair. Attribute selectors
 * containing spaces (e.g. `[data-x="a b"]`) are kept intact.
 */
function tokenizeSelector(selector: string): SelectorToken[] {
  const tokens: SelectorToken[] = []
  const trimmed = selector.trim()
  let i = 0
  let current = ""

  // Track whether we're inside brackets (attribute selectors can contain spaces)
  let bracketDepth = 0
  // Track whether we're inside quotes within brackets
  let inQuote: string | null = null

  while (i < trimmed.length) {
    const ch = trimmed[i]!

    // Handle quotes inside brackets
    if (bracketDepth > 0 && (ch === '"' || ch === "'")) {
      if (inQuote === ch) {
        inQuote = null
      } else if (inQuote === null) {
        inQuote = ch
      }
      current += ch
      i++
      continue
    }

    // Don't parse combinators inside brackets/quotes
    if (ch === "[") {
      bracketDepth++
      current += ch
      i++
      continue
    }
    if (ch === "]") {
      bracketDepth--
      current += ch
      i++
      continue
    }

    if (bracketDepth > 0 || inQuote !== null) {
      current += ch
      i++
      continue
    }

    // Check for explicit combinators: >, +, ~
    if (ch === ">" || ch === "+" || ch === "~") {
      if (current.trim()) {
        tokens.push({ selector: current.trim(), combinator: ch })
      }
      current = ""
      i++
      // Skip whitespace after combinator
      while (i < trimmed.length && trimmed[i] === " ") i++
      continue
    }

    // Whitespace = descendant combinator (only if not adjacent to an explicit combinator)
    if (ch === " ") {
      // Skip all whitespace
      let j = i
      while (j < trimmed.length && trimmed[j] === " ") j++

      // Check if the whitespace is followed by an explicit combinator
      if (j < trimmed.length && (trimmed[j] === ">" || trimmed[j] === "+" || trimmed[j] === "~")) {
        // The explicit combinator handler will pick this up
        i = j
        continue
      }

      // It's a descendant combinator (space)
      if (current.trim()) {
        tokens.push({ selector: current.trim(), combinator: " " })
      }
      current = ""
      i = j
      continue
    }

    current += ch
    i++
  }

  // Push the final selector (no combinator after it)
  if (current.trim()) {
    tokens.push({ selector: current.trim(), combinator: null })
  }

  return tokens
}

/**
 * Parse CSS-like selector into predicate.
 *
 * Supports multi-level combinator chains (e.g. `#a > #b > #c`),
 * mixed combinators (`#a > #b #c`), and all combinator types:
 *   - `>` (child), `+` (adjacent sibling), `~` (general sibling), ` ` (descendant)
 */
function parseSelector(selector: string): NodePredicate | null {
  const tokens = tokenizeSelector(selector.trim())
  if (tokens.length === 0) return null
  if (tokens.length === 1) return parseSingleSelector(tokens[0]!.selector)

  // Build predicate chain right-to-left.
  // The rightmost token is the node being matched. Each preceding token
  // constrains a relationship (parent, ancestor, sibling) that must hold.
  return buildPredicateChain(tokens)
}

/**
 * Build a predicate from a chain of selector tokens.
 *
 * The rightmost token matches the candidate node. Each preceding token
 * constrains a relationship (parent, ancestor, sibling) via its combinator.
 *
 * For ancestor/parent combinators (>, space), we walk up the tree to find
 * a node matching the left selector, then continue the chain from that node.
 *
 * For sibling combinators (+, ~), we check siblings of the same node.
 */
function buildPredicateChain(tokens: SelectorToken[]): NodePredicate | null {
  // Parse all single-selector predicates up front
  const preds: (NodePredicate | null)[] = tokens.map((t) => parseSingleSelector(t.selector))
  if (preds.some((p) => p === null)) return null

  const validPreds = preds as NodePredicate[]

  return (node: AgNode) => {
    // The rightmost selector must match the candidate node
    if (!validPreds[validPreds.length - 1]!(node)) return false

    // Walk the chain right-to-left, tracking the "current context node"
    // that each subsequent combinator operates relative to.
    let contextNode: AgNode = node

    for (let i = tokens.length - 2; i >= 0; i--) {
      const leftPred = validPreds[i]!
      const combinator = tokens[i]!.combinator!
      const found = findCombinatorMatch(contextNode, combinator, leftPred)
      if (!found) return false
      contextNode = found
    }

    return true
  }
}

/**
 * Given a context node and a combinator, find a node matching `leftPred`
 * that satisfies the combinator relationship relative to `contextNode`.
 *
 * Returns the matching node (so the chain can continue from it) or null.
 */
function findCombinatorMatch(
  contextNode: AgNode,
  combinator: CombinatorType,
  leftPred: NodePredicate,
): AgNode | null {
  switch (combinator) {
    case ">": {
      // Direct parent must match
      if (contextNode.parent && leftPred(contextNode.parent)) {
        return contextNode.parent
      }
      return null
    }

    case " ": {
      // Any ancestor must match
      let current = contextNode.parent
      while (current) {
        if (leftPred(current)) return current
        current = current.parent
      }
      return null
    }

    case "+": {
      // Immediately preceding sibling must match
      if (!contextNode.parent) return null
      const siblings = contextNode.parent.children
      const index = siblings.indexOf(contextNode)
      if (index <= 0) return null
      const prevSibling = siblings[index - 1]!
      return leftPred(prevSibling) ? prevSibling : null
    }

    case "~": {
      // Any earlier sibling must match
      if (!contextNode.parent) return null
      const siblings = contextNode.parent.children
      const index = siblings.indexOf(contextNode)
      if (index <= 0) return null
      for (let j = 0; j < index; j++) {
        if (leftPred(siblings[j]!)) return siblings[j]!
      }
      return null
    }
  }
}

/**
 * Parse a single selector segment (no combinators).
 *
 * Supports:
 *   - `*` (universal)
 *   - `#id` (ID selector)
 *   - `[attr]`, `[attr=val]`, `[attr^=val]`, `[attr$=val]`, `[attr*=val]`
 *   - `:first-child`, `:last-child`, `:nth-child(n)`, `:empty`
 */
function parseSingleSelector(selector: string): NodePredicate | null {
  const parts: NodePredicate[] = []
  let remaining = selector

  // Universal selector — matches all nodes
  if (remaining === "*") {
    return () => true
  }

  // Extract ID if present
  const idMatch = remaining.match(/^#([a-zA-Z0-9_-]+)/)
  if (idMatch) {
    const id = idMatch[1]!
    parts.push((node: AgNode) => getNodeProp(node, "id") === id)
    remaining = remaining.slice(idMatch[0].length)
  }

  // Extract all attribute selectors
  const attrRegex = /\[([a-zA-Z_][a-zA-Z0-9_-]*)(?:([~^$*]?)=["']([^"']*)["'])?\]/g
  for (const match of remaining.matchAll(attrRegex)) {
    const [fullMatch, attr, op, value] = match
    if (!attr) continue

    if (value === undefined) {
      parts.push((node: AgNode) => getNodeProp(node, attr) !== undefined)
    } else {
      parts.push((node: AgNode) => {
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

    // Remove matched attribute selector from remaining for pseudo parsing
    remaining = remaining.replace(fullMatch!, "")
  }

  // Extract pseudo-selectors
  const pseudoRegex = /:(first-child|last-child|nth-child\((\d+)\)|empty)/g
  for (const match of remaining.matchAll(pseudoRegex)) {
    const pseudo = match[1]!

    if (pseudo === "first-child") {
      parts.push((node: AgNode) => {
        if (!node.parent) return false
        return node.parent.children[0] === node
      })
    } else if (pseudo === "last-child") {
      parts.push((node: AgNode) => {
        if (!node.parent) return false
        const children = node.parent.children
        return children[children.length - 1] === node
      })
    } else if (pseudo.startsWith("nth-child")) {
      const n = Number.parseInt(match[2]!, 10)
      parts.push((node: AgNode) => {
        if (!node.parent) return false
        const index = node.parent.children.indexOf(node)
        return index === n - 1 // CSS nth-child is 1-indexed
      })
    } else if (pseudo === "empty") {
      parts.push((node: AgNode) => node.children.length === 0)
    }
  }

  if (parts.length === 0) return null

  return (node: AgNode) => parts.every((pred) => pred(node))
}
