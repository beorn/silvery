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
import { is as cssIs, type Options } from "css-select"

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
    const predicate: NodePredicate = (node) => {
      try {
        return cssIs(node, selector, cssSelectOptions)
      } catch {
        return false // Invalid selector → match nothing
      }
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
// css-select Adapter for AgNode
// ============================================================================

/**
 * Adapter that maps AgNode tree operations to css-select's DOM interface.
 * This gives us full CSS3 selector support: combinators (>, +, ~, space),
 * pseudo-classes (:first-child, :last-child, :nth-child, :not, :has, :empty),
 * attribute selectors ([attr], [attr=val], [attr^=val], [attr$=val], [attr*=val]),
 * and more — all handled by the battle-tested css-select engine.
 */
const agNodeAdapter = {
  isTag: (node: AgNode): node is AgNode => !node.isRawText,

  getAttributeValue: (element: AgNode, name: string): string | undefined => getNodeProp(element, name),

  getChildren: (node: AgNode): AgNode[] => [...node.children],

  getName: (element: AgNode): string => element.type ?? "unknown",

  getParent: (node: AgNode): AgNode | null => node.parent,

  getSiblings: (node: AgNode): AgNode[] => (node.parent ? [...node.parent.children] : [node]),

  getText: (node: AgNode): string => getNodeTextContent(node),

  hasAttrib: (element: AgNode, name: string): boolean => getNodeProp(element, name) !== undefined,

  removeSubsets: (nodes: AgNode[]): AgNode[] => {
    return nodes.filter((node, i) => {
      for (let j = 0; j < nodes.length; j++) {
        if (i !== j) {
          let ancestor = node.parent
          while (ancestor) {
            if (ancestor === nodes[j]) return false
            ancestor = ancestor.parent
          }
        }
      }
      return true
    })
  },

  prevElementSibling: (node: AgNode): AgNode | null => {
    if (!node.parent) return null
    const siblings = node.parent.children
    const index = siblings.indexOf(node)
    for (let i = index - 1; i >= 0; i--) {
      if (!siblings[i]!.isRawText) return siblings[i]!
    }
    return null
  },
}

/** Shared css-select options — case-sensitive tags, no caching (tree changes between queries) */
const cssSelectOptions: Options<AgNode, AgNode> = { adapter: agNodeAdapter, xmlMode: true, cacheResults: false }
