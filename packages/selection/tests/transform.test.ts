/**
 * @reach fs-walk <fixture-only: walk order refers to in-memory node ordering of a mock selection tree, not a directory walk.>
 */
import { describe, expect, it } from "vitest"
import type { ID, SelectionSnapshot } from "../src/types.ts"
import type { SelectionTree, TreeOp } from "../src/transform.ts"
import { transformSelection } from "../src/transform.ts"

// --- Test helpers ---

const id = (s: string) => s as ID
const A = id("A")
const B = id("B")
const C = id("C")
const D = id("D")
const E = id("E")

function makeState(overrides: Partial<SelectionSnapshot> = {}): SelectionSnapshot {
  return {
    cursor: null,
    anchor: null,
    ids: [],
    sub: null,
    root: null,
    ...overrides,
  }
}

/**
 * Create a simple tree from a flat list of nodes with parent relationships.
 * nodes: all node IDs in walk order
 * parents: map of nodeId -> parentId (root nodes omit or map to null)
 */
function makeTree(nodes: ID[], parents: Map<ID, ID | null> = new Map()): SelectionTree {
  const nodeSet = new Set(nodes)
  return {
    walkOrder(root: ID | null): readonly ID[] {
      if (root === null) return nodes
      // Return only descendants of root (including root itself)
      return nodes.filter((n) => n === root || isDescendant(n, root, parents))
    },
    has(nodeId: ID): boolean {
      return nodeSet.has(nodeId)
    },
    contains(ancestor: ID, descendant: ID): boolean {
      if (ancestor === descendant) return true
      return isDescendant(descendant, ancestor, parents)
    },
  }
}

function isDescendant(node: ID, ancestor: ID, parents: Map<ID, ID | null>): boolean {
  let current = parents.get(node)
  while (current !== undefined && current !== null) {
    if (current === ancestor) return true
    current = parents.get(current)
  }
  return false
}

// --- deleteNode ---

describe("transformSelection — deleteNode", () => {
  it("delete selected node => cursor repairs to nearest", () => {
    const sel = makeState({ cursor: B, anchor: B, ids: [A, B, C] })
    const prevTree = makeTree([A, B, C, D, E])
    const nextTree = makeTree([A, C, D, E])
    const op: TreeOp = { type: "deleteNode", id: B }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.ids).toEqual([A, C])
    // Cursor should repair to nearest surviving node to B in prev order
    // B was at index 1, A is at 0 (dist 1), C is at 2 (dist 1) — first found wins
    expect(result.cursor).toBe(A)
    expect(result.anchor).toBe(A) // anchor resets to cursor when anchor was deleted
  })

  it("delete cursor node with anchor surviving => anchor preserved, cursor repairs", () => {
    const sel = makeState({ cursor: B, anchor: D, ids: [A, B, C, D] })
    const prevTree = makeTree([A, B, C, D, E])
    const nextTree = makeTree([A, C, D, E])
    const op: TreeOp = { type: "deleteNode", id: B }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.ids).toEqual([A, C, D])
    expect(result.cursor).toBe(A) // nearest to B
    expect(result.anchor).toBe(D) // preserved
  })

  it("delete non-selected node => no change", () => {
    const sel = makeState({ cursor: A, anchor: A, ids: [A] })
    const prevTree = makeTree([A, B, C, D])
    const nextTree = makeTree([A, C, D])
    const op: TreeOp = { type: "deleteNode", id: B }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result).toBe(sel) // same reference — no change
  })

  it("delete all selected nodes => deselect", () => {
    const sel = makeState({ cursor: B, anchor: B, ids: [B] })
    const prevTree = makeTree([A, B, C])
    const nextTree = makeTree([A, C])
    const op: TreeOp = { type: "deleteNode", id: B }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.cursor).toBeNull()
    expect(result.anchor).toBeNull()
    expect(result.ids).toEqual([])
  })

  it("delete node being text-edited => clear sub", () => {
    const sel = makeState({
      cursor: B,
      anchor: B,
      ids: [B],
      sub: { kind: "text", nodeId: B, cursor: 5 },
    })
    const prevTree = makeTree([A, B, C])
    const nextTree = makeTree([A, C])
    const op: TreeOp = { type: "deleteNode", id: B }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.sub).toBeNull()
    expect(result.cursor).toBeNull()
    expect(result.ids).toEqual([])
  })

  it("delete non-selected node that has text-edit sub => clear sub, keep selection", () => {
    // Edge case: sub references a node that isn't in ids (shouldn't normally happen,
    // but if it does, sub should still be cleared when that node is deleted)
    const sel = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
      sub: { kind: "text", nodeId: B, cursor: 3 },
    })
    const prevTree = makeTree([A, B, C])
    const nextTree = makeTree([A, C])
    const op: TreeOp = { type: "deleteNode", id: B }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.sub).toBeNull()
    expect(result.cursor).toBe(A)
    expect(result.ids).toEqual([A])
  })

  it("preserves root across delete", () => {
    const root = id("root")
    const sel = makeState({ cursor: B, anchor: B, ids: [B], root })
    const parents = new Map<ID, ID | null>([
      [A, root],
      [B, root],
      [C, root],
    ])
    const prevTree = makeTree([root, A, B, C], parents)
    const nextTree = makeTree([root, A, C], parents)
    const op: TreeOp = { type: "deleteNode", id: B }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.root).toBe(root)
    expect(result.ids).toEqual([])
    expect(result.cursor).toBeNull()
  })
})

// --- moveNode ---

describe("transformSelection — moveNode", () => {
  it("move selected node outside root => removed from selection", () => {
    const root = id("root")
    const other = id("other")
    const parents = new Map<ID, ID | null>([
      [A, root],
      [B, root],
      [C, root],
    ])
    const sel = makeState({ cursor: B, anchor: B, ids: [A, B, C], root })
    const prevTree = makeTree([root, A, B, C], parents)

    // After move: B is under "other", not under "root"
    const nextParents = new Map<ID, ID | null>([
      [A, root],
      [B, other],
      [C, root],
    ])
    const nextTree = makeTree([root, A, C, other, B], nextParents)
    const op: TreeOp = { type: "moveNode", id: B, newParent: other }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.ids).toEqual([A, C])
    expect(result.cursor).toBe(A) // nearest surviving
    expect(result.anchor).toBe(A) // reset to cursor
  })

  it("move selected node within root => stays selected", () => {
    const root = id("root")
    const parents = new Map<ID, ID | null>([
      [A, root],
      [B, root],
      [C, root],
    ])
    const sel = makeState({ cursor: B, anchor: B, ids: [B], root })
    const prevTree = makeTree([root, A, B, C], parents)

    // After move: B is still under root but in a different position
    const nextTree = makeTree([root, A, C, B], parents)
    const op: TreeOp = { type: "moveNode", id: B, newParent: root }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.ids).toEqual([B])
    expect(result.cursor).toBe(B)
  })

  it("move selected node within root => reorders ids to match new tree walk", () => {
    const root = id("root")
    const parents = new Map<ID, ID | null>([
      [A, root],
      [B, root],
      [C, root],
    ])
    const sel = makeState({ cursor: B, anchor: C, ids: [A, B, C], root })
    const prevTree = makeTree([root, A, B, C], parents)

    // After move: C is now before A in walk order
    const nextTree = makeTree([root, C, A, B], parents)
    const op: TreeOp = { type: "moveNode", id: C, newParent: root }

    const result = transformSelection(sel, op, prevTree, nextTree)

    // ids should be reordered to match next tree walk
    expect(result.ids).toEqual([C, A, B])
  })

  it("move non-selected node => no change", () => {
    const sel = makeState({ cursor: A, anchor: A, ids: [A] })
    const prevTree = makeTree([A, B, C, D])
    const nextTree = makeTree([A, C, B, D])
    const op: TreeOp = { type: "moveNode", id: B, newParent: C }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result).toBe(sel) // same reference
  })

  it("move node with text-edit sub outside root => clear sub", () => {
    const root = id("root")
    const other = id("other")
    const parents = new Map<ID, ID | null>([
      [A, root],
      [B, root],
    ])
    const sel = makeState({
      cursor: A,
      anchor: A,
      ids: [A, B],
      sub: { kind: "text", nodeId: B, cursor: 10 },
      root,
    })
    const prevTree = makeTree([root, A, B], parents)

    const nextParents = new Map<ID, ID | null>([
      [A, root],
      [B, other],
    ])
    const nextTree = makeTree([root, A, other, B], nextParents)
    const op: TreeOp = { type: "moveNode", id: B, newParent: other }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.sub).toBeNull()
    expect(result.ids).toEqual([A])
    expect(result.cursor).toBe(A)
  })

  it("move node with text-edit sub within root => preserve sub", () => {
    const root = id("root")
    const parents = new Map<ID, ID | null>([
      [A, root],
      [B, root],
    ])
    const sel = makeState({
      cursor: B,
      anchor: B,
      ids: [B],
      sub: { kind: "text", nodeId: B, cursor: 7 },
      root,
    })
    const prevTree = makeTree([root, A, B], parents)
    const nextTree = makeTree([root, B, A], parents)
    const op: TreeOp = { type: "moveNode", id: B, newParent: root }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.sub).toEqual({ kind: "text", nodeId: B, cursor: 7 })
    expect(result.ids).toEqual([B])
  })
})

// --- insertNode / updateNode (no-ops) ---

describe("transformSelection — insertNode", () => {
  it("insert node => no selection change", () => {
    const sel = makeState({ cursor: A, anchor: A, ids: [A] })
    const prevTree = makeTree([A, B, C])
    const nextTree = makeTree([A, B, id("new"), C])
    const op: TreeOp = { type: "insertNode", id: id("new"), parent: A }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result).toBe(sel) // same reference
  })
})

describe("transformSelection — updateNode", () => {
  it("update node => no selection change", () => {
    const sel = makeState({
      cursor: B,
      anchor: B,
      ids: [B],
      sub: { kind: "text", nodeId: B, cursor: 3 },
    })
    const prevTree = makeTree([A, B, C])
    const nextTree = makeTree([A, B, C])
    const op: TreeOp = { type: "updateNode", id: B }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result).toBe(sel) // same reference
  })
})

// --- Edge cases ---

describe("transformSelection — edge cases", () => {
  it("no-op when tree change does not affect selection", () => {
    // Delete a node that's not selected and not in sub
    const sel = makeState({ cursor: A, anchor: C, ids: [A, B, C] })
    const prevTree = makeTree([A, B, C, D, E])
    const nextTree = makeTree([A, B, C, E])
    const op: TreeOp = { type: "deleteNode", id: D }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result).toBe(sel) // same reference — no change
  })

  it("empty selection is unaffected by any op", () => {
    const sel = makeState() // empty
    const prevTree = makeTree([A, B, C])
    const nextTree = makeTree([A, C])
    const op: TreeOp = { type: "deleteNode", id: B }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result).toBe(sel)
  })

  it("delete with null root => returns EMPTY_STATE singleton", () => {
    const sel = makeState({ cursor: A, anchor: A, ids: [A] })
    const prevTree = makeTree([A, B])
    const nextTree = makeTree([B])
    const op: TreeOp = { type: "deleteNode", id: A }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.cursor).toBeNull()
    expect(result.anchor).toBeNull()
    expect(result.ids).toEqual([])
    expect(result.sub).toBeNull()
    expect(result.root).toBeNull()
  })

  it("move all selected nodes outside scope => deselect with root preserved", () => {
    const root = id("root")
    const other = id("other")
    const parents = new Map<ID, ID | null>([[B, root]])
    const sel = makeState({ cursor: B, anchor: B, ids: [B], root })
    const prevTree = makeTree([root, B], parents)

    const nextParents = new Map<ID, ID | null>([[B, other]])
    const nextTree = makeTree([root, other, B], nextParents)
    const op: TreeOp = { type: "moveNode", id: B, newParent: other }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.cursor).toBeNull()
    expect(result.ids).toEqual([])
    expect(result.root).toBe(root) // root preserved
  })

  it("delete anchor (not cursor) => anchor repairs to cursor", () => {
    const sel = makeState({ cursor: A, anchor: C, ids: [A, B, C] })
    const prevTree = makeTree([A, B, C, D])
    const nextTree = makeTree([A, B, D])
    const op: TreeOp = { type: "deleteNode", id: C }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.cursor).toBe(A) // preserved
    expect(result.anchor).toBe(A) // anchor was C (deleted), resets to cursor
    expect(result.ids).toEqual([A, B])
  })

  it("path sub-selection cleared when shape node deleted", () => {
    const sel = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
      sub: { kind: "path", nodeId: B, pointIds: [C] },
    })
    const prevTree = makeTree([A, B, C])
    const nextTree = makeTree([A, C])
    const op: TreeOp = { type: "deleteNode", id: B }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.sub).toBeNull()
    expect(result.cursor).toBe(A)
  })

  it("crop sub-selection cleared when object node deleted", () => {
    const sel = makeState({
      cursor: A,
      anchor: A,
      ids: [A],
      sub: { kind: "crop", nodeId: B, rect: { x: 0, y: 0, w: 10, h: 10 } },
    })
    const prevTree = makeTree([A, B, C])
    const nextTree = makeTree([A, C])
    const op: TreeOp = { type: "deleteNode", id: B }

    const result = transformSelection(sel, op, prevTree, nextTree)

    expect(result.sub).toBeNull()
    expect(result.cursor).toBe(A)
  })
})
