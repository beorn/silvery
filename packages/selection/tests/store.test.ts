/**
 * @reach fs-walk <fixture-only: walkOrder is a mock method for an in-memory selection-tree traversal, not a filesystem walk.>
 */
import { describe, expect, it } from "vitest"
import { effect } from "alien-signals"
import { createSelection } from "../src/store.ts"
import type { ID, SelectionApp } from "../src/types.ts"

// --- Test helpers ---

const id = (s: string) => s as ID
const A = id("A")
const B = id("B")
const C = id("C")
const D = id("D")
const E = id("E")

/** Simple tree: flat list A-E, all children of root */
function flatApp(nodes: ID[] = [A, B, C, D, E]): SelectionApp {
  const nodeSet = new Set(nodes)
  return {
    tree: {
      walkOrder(_root: ID | null) {
        return nodes
      },
      parent(_id: ID) {
        return undefined
      },
      children(_id: ID) {
        return []
      },
      contains(nid: ID) {
        return nodeSet.has(nid)
      },
    },
  }
}

/** Hierarchical tree: root -> [A, B], A -> [C, D], B -> [E] */
function hierarchicalApp(): SelectionApp {
  const childMap = new Map<string, ID[]>([
    ["root", [A, B]],
    ["A", [C, D]],
    ["B", [E]],
  ])
  const parentMap = new Map<string, ID>([
    ["A", id("root")],
    ["B", id("root")],
    ["C", A],
    ["D", A],
    ["E", B],
  ])
  const order = [A, C, D, B, E]
  const existing = new Set<ID>([id("root"), A, B, C, D, E])

  return {
    tree: {
      walkOrder(_root: ID | null) {
        return order
      },
      parent(nodeId: ID) {
        return parentMap.get(nodeId)
      },
      children(nodeId: ID) {
        return childMap.get(nodeId) ?? []
      },
      contains(nid: ID) {
        return existing.has(nid)
      },
    },
  }
}

// --- createSelection ---

describe("createSelection", () => {
  it("starts in idle state", () => {
    const sel = createSelection(flatApp())
    expect(sel.kind()).toBe("idle")
    expect(sel.node.cursor()).toBeNull()
    expect(sel.node.anchor()).toBeNull()
    expect(sel.node.ids().length).toBe(0)
    expect(sel.sub).toBeNull()
    expect(sel.text()).toBeNull()
    expect(sel.drag()).toBeNull()
    expect(sel.root.id()).toBeNull()
  })

  // --- node.select ---

  describe("node.select", () => {
    it("selects a single node", () => {
      const sel = createSelection(flatApp())
      sel.node.select([B])
      expect(sel.node.cursor()).toBe(B)
      expect(sel.node.anchor()).toBe(B)
      expect(sel.node.ids().length).toBe(1)
      expect(sel.node.ids().has(B)).toBe(true)
      expect(sel.kind()).toBe("node")
    })

    it("selects multiple nodes preserving input order", () => {
      const sel = createSelection(flatApp())
      sel.node.select([D, B])
      expect(sel.node.cursor()).toBe(D) // first in input
      expect(sel.node.anchor()).toBe(B) // last in input
      expect(sel.node.ids().length).toBe(2)
    })

    it("replaces existing selection", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.node.select([C])
      expect(sel.node.cursor()).toBe(C)
      expect(sel.node.ids().has(A)).toBe(false)
    })

    it("toggle adds to selection", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.node.select([C], true)
      expect(sel.node.ids().has(A)).toBe(true)
      expect(sel.node.ids().has(C)).toBe(true)
    })

    it("toggle removes from selection", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A, B, C])
      sel.node.select([B], true)
      expect(sel.node.ids().has(B)).toBe(false)
      expect(sel.node.ids().has(A)).toBe(true)
      expect(sel.node.ids().has(C)).toBe(true)
    })

    it("empty select deselects", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.node.select([])
      expect(sel.kind()).toBe("idle")
    })

    it("clears sub-selection on node select", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.text.edit(A, 0)
      expect(sel.kind()).toBe("text")
      sel.node.select([B])
      expect(sel.kind()).toBe("node")
      expect(sel.text()).toBeNull()
    })
  })

  // --- node.extend ---

  describe("node.extend", () => {
    it("extends range from anchor to new cursor", () => {
      const sel = createSelection(flatApp())
      sel.node.select([B])
      sel.node.extend(D)
      expect(sel.node.cursor()).toBe(D)
      expect(sel.node.anchor()).toBe(B) // preserved
      expect(sel.node.ids().length).toBe(3) // B, C, D
      expect(sel.node.ids().has(C)).toBe(true)
    })

    it("extends backwards", () => {
      const sel = createSelection(flatApp())
      sel.node.select([D])
      sel.node.extend(B)
      expect(sel.node.cursor()).toBe(B)
      expect(sel.node.anchor()).toBe(D)
      expect(sel.node.ids().length).toBe(3)
    })
  })

  // --- node.collapse ---

  describe("node.collapse", () => {
    it("collapses multi to single (cursor)", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A, B, C])
      sel.node.collapse()
      expect(sel.node.ids().length).toBe(1)
      expect(sel.node.cursor()).toBe(A)
      expect(sel.node.anchor()).toBe(A)
    })

    it("no-op on idle", () => {
      const sel = createSelection(flatApp())
      sel.node.collapse() // should not throw
      expect(sel.kind()).toBe("idle")
    })
  })

  // --- node.remove ---

  describe("node.remove", () => {
    it("removes non-cursor node", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A, B, C])
      sel.node.remove(B)
      expect(sel.node.ids().has(B)).toBe(false)
      expect(sel.node.cursor()).toBe(A)
    })

    it("removes cursor -> repairs", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A, B, C])
      sel.node.remove(A)
      expect(sel.node.cursor()).not.toBe(A)
      expect(sel.node.ids().length).toBe(2)
    })

    it("removes last id -> deselect", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.node.remove(A)
      expect(sel.kind()).toBe("idle")
    })
  })

  // --- node.selectableAncestor ---

  describe("node.selectableAncestor", () => {
    it("returns the id itself if in walk order", () => {
      const sel = createSelection(flatApp())
      expect(sel.node.selectableAncestor(B)).toBe(B)
    })

    it("walks up to find selectable parent", () => {
      // Only [A, B] in walk order, C is child of A
      const app = hierarchicalApp()
      const sel = createSelection(app)
      expect(sel.node.selectableAncestor(C)).toBe(C) // C is in walkOrder
    })

    it("returns undefined for unknown node", () => {
      const sel = createSelection(flatApp())
      expect(sel.node.selectableAncestor(id("Z"))).toBeUndefined()
    })
  })

  // --- deselect ---

  describe("deselect", () => {
    it("clears all selection", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A, B])
      sel.deselect()
      expect(sel.kind()).toBe("idle")
      expect(sel.node.cursor()).toBeNull()
    })

    it("preserves root", () => {
      const sel = createSelection(flatApp())
      sel.root.set(A)
      sel.node.select([B])
      sel.deselect()
      expect(sel.root.id()).toBe(A)
    })
  })

  // --- selectAll ---

  describe("selectAll", () => {
    it("selects all nodes from root", () => {
      const sel = createSelection(flatApp())
      sel.selectAll()
      expect(sel.node.ids().length).toBe(5)
    })

    it("selects children of specific parent", () => {
      const app = hierarchicalApp()
      const sel = createSelection(app)
      sel.node.select([C])
      sel.selectAll(A)
      expect(sel.node.ids().has(C)).toBe(true)
      expect(sel.node.ids().has(D)).toBe(true)
    })
  })

  // --- root ---

  describe("root", () => {
    it("set and read root", () => {
      const sel = createSelection(flatApp())
      sel.root.set(B)
      expect(sel.root.id()).toBe(B)
    })

    it("up pops root to parent", () => {
      const app = hierarchicalApp()
      const sel = createSelection(app)
      sel.root.set(C)
      sel.root.up()
      expect(sel.root.id()).toBe(A) // parent of C
    })

    it("up from null is no-op", () => {
      const sel = createSelection(flatApp())
      sel.root.up()
      expect(sel.root.id()).toBeNull()
    })
  })

  // --- drag ---

  describe("drag", () => {
    it("starts drag with snapshot", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.drag.start({ kind: "node", nodeId: A }, { x: 10, y: 20 })
      expect(sel.drag()).not.toBeNull()
      expect(sel.drag()!.hit).toEqual({ kind: "node", nodeId: A })
      expect(sel.drag()!.origin).toEqual({ x: 10, y: 20 })
      expect(sel.drag()!.startState.cursor).toBe(A)
    })

    it("end commits drag (keeps current state)", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.drag.start({ kind: "node", nodeId: A }, { x: 0, y: 0 })
      // Modify selection during drag
      sel.node.select([B])
      sel.drag.end()
      expect(sel.drag()).toBeNull()
      expect(sel.node.cursor()).toBe(B) // kept
    })

    it("cancel reverts to start state", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.drag.start({ kind: "node", nodeId: A }, { x: 0, y: 0 })
      // Modify selection during drag
      sel.node.select([C, D])
      sel.drag.cancel()
      expect(sel.drag()).toBeNull()
      expect(sel.node.cursor()).toBe(A) // reverted
      expect(sel.node.ids().length).toBe(1)
    })

    it("end on no-drag is no-op", () => {
      const sel = createSelection(flatApp())
      sel.drag.end() // should not throw
      expect(sel.drag()).toBeNull()
    })

    it("cancel on no-drag is no-op", () => {
      const sel = createSelection(flatApp())
      sel.drag.cancel() // should not throw
      expect(sel.drag()).toBeNull()
    })
  })

  // --- kind ---

  describe("kind", () => {
    it("idle when no selection", () => {
      const sel = createSelection(flatApp())
      expect(sel.kind()).toBe("idle")
    })

    it("node when node selected", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      expect(sel.kind()).toBe("node")
    })

    it("text when in text mode", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      sel.text.edit(A, 0)
      expect(sel.kind()).toBe("text")
    })
  })

  // --- reconcile ---

  describe("reconcile", () => {
    it("prunes deleted nodes", () => {
      const nodes = [A, B, C, D, E]
      const sel = createSelection(flatApp(nodes))
      sel.node.select([A, B, C])
      // Now remove B from the tree
      nodes.splice(1, 1) // [A, C, D, E]
      sel.reconcile()
      expect(sel.node.ids().has(B)).toBe(false)
      expect(sel.node.ids().has(A)).toBe(true)
      expect(sel.node.ids().has(C)).toBe(true)
    })
  })

  // --- snapshot ---

  describe("snapshot", () => {
    it("returns the effective snapshot", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])
      const snap = sel.snapshot()
      expect(snap.cursor).toBe(A)
      expect(snap.ids).toEqual([A])
    })
  })

  // --- Signal reactivity ---

  describe("signal reactivity", () => {
    it("computed signals update on change", () => {
      const sel = createSelection(flatApp())
      const cursors: (ID | null)[] = []

      const cleanup = effect(() => {
        cursors.push(sel.node.cursor())
      })

      sel.node.select([A])
      sel.node.select([B])

      expect(cursors).toEqual([null, A, B])
      cleanup()
    })

    it("no-op writes don't trigger effects", () => {
      const sel = createSelection(flatApp())
      sel.node.select([A])

      let callCount = 0
      const cleanup = effect(() => {
        sel.node.cursor()
        callCount++
      })

      const before = callCount
      // Select same node again (no-op)
      sel.node.select([A])
      expect(callCount).toBe(before) // no additional notification
      cleanup()
    })

    it("kind signal updates on transitions", () => {
      const sel = createSelection(flatApp())
      const kinds: string[] = []

      const cleanup = effect(() => {
        kinds.push(sel.kind())
      })

      sel.node.select([A])
      sel.text.edit(A, 0)
      sel.deselect()

      expect(kinds).toEqual(["idle", "node", "text", "idle"])
      cleanup()
    })
  })

  // --- transform (SlateJS pattern) ---

  describe("transform", () => {
    function makeTreeSnap(nodes: ID[]) {
      const set = new Set(nodes)
      return {
        walkOrder: (_root: ID | null) => nodes,
        has: (n: ID) => set.has(n),
        contains: (_anc: ID, desc: ID) => set.has(desc),
      }
    }

    it("deleteNode repairs cursor to nearest surviving node", () => {
      const sel = createSelection(flatApp([A, B, C, D, E]))
      // Multi-select including B so there are survivors after delete
      sel.node.select([A, B, C])
      expect(sel.node.cursor()).toBe(A)

      const prevTree = makeTreeSnap([A, B, C, D, E])
      const nextTree = makeTreeSnap([A, C, D, E])
      sel.transform({ type: "deleteNode", id: B }, prevTree, nextTree)

      // B is gone; A and C survive; cursor still on a valid node
      expect(sel.node.ids().has(B)).toBe(false)
      expect(sel.node.cursor()).not.toBe(B)
      expect(sel.node.cursor()).not.toBeNull()
    })

    it("deleteNode of only selected node clears selection", () => {
      const sel = createSelection(flatApp([A, B, C, D, E]))
      sel.node.select([B])

      const prevTree = makeTreeSnap([A, B, C, D, E])
      const nextTree = makeTreeSnap([A, C, D, E])
      sel.transform({ type: "deleteNode", id: B }, prevTree, nextTree)

      // Selection cleared since the only selected node is gone
      expect(sel.node.cursor()).toBeNull()
      expect(sel.node.ids().length).toBe(0)
    })

    it("deleteNode preserves multi-selection survivors", () => {
      const sel = createSelection(flatApp([A, B, C, D, E]))
      sel.node.select([A, B, C])

      const prevTree = makeTreeSnap([A, B, C, D, E])
      const nextTree = makeTreeSnap([A, C, D, E])
      sel.transform({ type: "deleteNode", id: B }, prevTree, nextTree)

      // A and C survive; B removed
      expect(sel.node.ids().has(A)).toBe(true)
      expect(sel.node.ids().has(C)).toBe(true)
      expect(sel.node.ids().has(B)).toBe(false)
    })

    it("insertNode is a no-op (new nodes aren't selected)", () => {
      const sel = createSelection(flatApp([A, B, C]))
      sel.node.select([A])
      const before = sel.node.ids()

      const prevTree = makeTreeSnap([A, B, C])
      const nextTree = makeTreeSnap([A, B, C, D])
      sel.transform({ type: "insertNode", id: D, parent: A }, prevTree, nextTree)

      expect(sel.node.ids()).toBe(before)
      expect(sel.node.cursor()).toBe(A)
    })
  })
})
