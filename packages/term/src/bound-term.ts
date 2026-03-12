/**
 * BoundTerm - Terminal buffer with node awareness
 *
 * Bridges the terminal buffer (screen space) with the SilveryNode tree.
 * Provides screen-coordinate queries that return nodes.
 *
 * @example
 * ```tsx
 * const app = render(<Board />)
 *
 * // Screen-space access
 * const cell = app.term.cell(10, 5)
 * const node = app.term.nodeAt(10, 5)
 * console.log(app.term.text)
 * ```
 */

import type { Cell, TerminalBuffer } from "./buffer"
import type { TeaNode } from "@silvery/tea/types"

/**
 * BoundTerm interface - terminal with node awareness
 */
export interface BoundTerm {
  /** Get cell at screen coordinates */
  cell(x: number, y: number): Cell

  /** Get node at screen coordinates */
  nodeAt(x: number, y: number): TeaNode | null

  /** Get visible text (plain, no ANSI) */
  readonly text: string

  /** Terminal dimensions */
  readonly columns: number
  readonly rows: number

  /** Access underlying buffer */
  readonly buffer: TerminalBuffer
}

/**
 * Create a BoundTerm from a buffer and root node getter
 */
export function createBoundTerm(
  buffer: TerminalBuffer,
  getRoot: () => TeaNode,
  getText: () => string,
): BoundTerm {
  return {
    cell(x: number, y: number): Cell {
      return buffer.getCell(x, y)
    },

    nodeAt(x: number, y: number): TeaNode | null {
      const root = getRoot()
      return findNodeAtScreenPosition(root, x, y)
    },

    get text(): string {
      return getText()
    },

    get columns(): number {
      return buffer.width
    },

    get rows(): number {
      return buffer.height
    },

    get buffer(): TerminalBuffer {
      return buffer
    },
  }
}

/**
 * Find the deepest node at the given screen coordinates
 */
function findNodeAtScreenPosition(node: TeaNode, x: number, y: number): TeaNode | null {
  const rect = node.screenRect
  if (!rect) return null

  // Check if point is within this node's bounds
  if (x < rect.x || x >= rect.x + rect.width || y < rect.y || y >= rect.y + rect.height) {
    return null
  }

  // Check children (deepest match wins)
  for (const child of node.children) {
    const found = findNodeAtScreenPosition(child, x, y)
    if (found) return found
  }

  // No child matched, this node is the deepest match
  return node
}
