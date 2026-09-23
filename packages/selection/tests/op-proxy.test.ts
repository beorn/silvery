/**
 * @reach fs-walk <fixture-only: walkOrder is a mock method, in-memory tree, not fs walk>
 */
import { describe, expect, it } from "vitest"
import { op } from "../src/op-proxy.ts"
import type { OpDescriptor } from "../src/op-proxy.ts"
import { createSelection } from "../src/store.ts"
import type { ID, SelectionApp } from "../src/types.ts"

// --- Test helpers ---

const id = (s: string) => s as ID
const A = id("A")
const B = id("B")
const C = id("C")

function flatApp(nodes: ID[] = [A, B, C]): SelectionApp {
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

/** Collect op descriptors and execute them. Returns the calls array. */
function collector() {
  const calls: OpDescriptor[] = []
  const apply: (desc: OpDescriptor) => unknown = (desc) => {
    calls.push(desc)
    return desc.run()
  }
  return { calls, apply, last: () => calls[calls.length - 1]! }
}

// --- op() proxy unit tests ---

describe("op() proxy", () => {
  it("intercepts method calls with correct path and args", () => {
    const { calls, apply } = collector()
    const target = {
      greet(name: string) {
        return `hello ${name}`
      },
    }

    const proxied = op(target, apply)
    const result = proxied.greet("world")

    expect(calls).toHaveLength(1)
    const call = calls[calls.length - 1]!
    expect(call.type).toBe("model-op")
    expect(call.path).toEqual(["greet"])
    expect(call.args).toEqual(["world"])
    expect(result).toBe("hello world")
  })

  it("passes through primitive property reads", () => {
    const { calls, apply } = collector()
    const target = { count: 42, name: "test", active: true }

    const proxied = op(target, apply)

    expect(proxied.count).toBe(42)
    expect(proxied.name).toBe("test")
    expect(proxied.active).toBe(true)
    // No calls — property reads are not intercepted
    expect(calls).toHaveLength(0)
  })

  it("accumulates nested paths", () => {
    const { calls, apply, last } = collector()
    const target = {
      node: {
        select(ids: string[]) {
          return ids.length
        },
      },
    }

    const proxied = op(target, apply)
    const result = proxied.node.select(["A", "B"])

    expect(calls).toHaveLength(1)
    expect(last().path).toEqual(["node", "select"])
    expect(last().args).toEqual([["A", "B"]])
    expect(result).toBe(2)
  })

  it("handles deeply nested paths (3+ levels)", () => {
    const { calls, apply, last } = collector()
    const target = {
      a: {
        b: {
          c: {
            action(x: number) {
              return x * 2
            },
          },
        },
      },
    }

    const proxied = op(target, apply)
    const result = proxied.a.b.c.action(5)

    expect(calls).toHaveLength(1)
    expect(last().path).toEqual(["a", "b", "c", "action"])
    expect(result).toBe(10)
  })

  it("applies operations in order", () => {
    const order: string[] = []
    const target = {
      first() {
        order.push("first")
      },
      second() {
        order.push("second")
      },
      third() {
        order.push("third")
      },
    }

    const proxied = op(target, (desc) => {
      order.push(`apply:${desc.path[0]}`)
      return desc.run()
    })

    proxied.first()
    proxied.second()
    proxied.third()

    expect(order).toEqual([
      "apply:first",
      "first",
      "apply:second",
      "second",
      "apply:third",
      "third",
    ])
  })

  it("run() invokes the original method with correct this binding", () => {
    const state = { value: 0 }
    const target = {
      state,
      increment() {
        this.state.value += 1
      },
    }

    const proxied = op(target, (desc) => desc.run())

    proxied.increment()
    expect(state.value).toBe(1)

    proxied.increment()
    expect(state.value).toBe(2)
  })

  it("passes through symbol properties unchanged", () => {
    const sym = Symbol("test")
    const target = { [sym]: 42 }

    const proxied = op(target, () => {
      throw new Error("should not be called")
    })

    expect((proxied as Record<symbol, unknown>)[sym]).toBe(42)
  })

  it("handles methods with multiple arguments", () => {
    const { apply, last } = collector()
    const target = {
      add(a: number, b: number, c: number) {
        return a + b + c
      },
    }

    const proxied = op(target, apply)

    expect(proxied.add(1, 2, 3)).toBe(6)
    expect(last().args).toEqual([1, 2, 3])
  })

  it("handles methods with no arguments", () => {
    const { apply, last } = collector()
    const target = {
      noop() {
        return "done"
      },
    }

    const proxied = op(target, apply)

    expect(proxied.noop()).toBe("done")
    expect(last().args).toEqual([])
  })

  it("apply can modify or cancel the operation", () => {
    const target = {
      getValue() {
        return "original"
      },
    }

    // Apply returns a different value — overriding the result
    const proxied = op(target, () => "intercepted")

    expect(proxied.getValue()).toBe("intercepted")
  })

  it("passes through null and undefined properties", () => {
    const { calls, apply } = collector()
    const target: { a: null; b: undefined } = { a: null, b: undefined }

    const proxied = op(target, apply)

    expect(proxied.a).toBeNull()
    expect(proxied.b).toBeUndefined()
    expect(calls).toHaveLength(0)
  })
})

// --- op() with selection store ---

describe("op() with selection store", () => {
  it("captures node.select path and args", () => {
    const { calls, apply, last } = collector()
    const sel = createSelection(flatApp())

    const proxied = op(sel, apply)
    proxied.node.select([C])

    expect(calls).toHaveLength(1)
    expect(last().type).toBe("model-op")
    expect(last().path).toEqual(["node", "select"])
    expect(last().args).toEqual([[C]])

    // The operation actually ran
    expect(sel.node.cursor()).toBe(C)
  })

  it("captures node.extend path and args", () => {
    const { calls, apply, last } = collector()
    const sel = createSelection(flatApp())
    sel.node.select([A]) // direct — set up initial state

    const proxied = op(sel, apply)
    proxied.node.extend(C)

    expect(calls).toHaveLength(1)
    expect(last().path).toEqual(["node", "extend"])
    expect(last().args).toEqual([C])
  })

  it("captures deselect at top level", () => {
    const { calls, apply, last } = collector()
    const sel = createSelection(flatApp())
    sel.node.select([A])

    const proxied = op(sel, apply)
    proxied.deselect()

    expect(calls).toHaveLength(1)
    expect(last().path).toEqual(["deselect"])
    expect(last().args).toEqual([])
    expect(sel.node.cursor()).toBeNull()
  })

  it("captures root.set path and args", () => {
    const { calls, apply, last } = collector()
    const sel = createSelection(flatApp())

    const proxied = op(sel, apply)
    proxied.root.set(A)

    expect(calls).toHaveLength(1)
    expect(last().path).toEqual(["root", "set"])
    expect(last().args).toEqual([A])
  })

  it("apply captures before/after state for undo", () => {
    const log: Array<{ path: string[]; args: unknown[]; before: unknown; after: unknown }> = []
    const sel = createSelection(flatApp())

    const proxied = op(sel, (desc) => {
      const before = sel.snapshot()
      const result = desc.run()
      const after = sel.snapshot()
      log.push({ path: desc.path, args: desc.args, before, after })
      return result
    })

    proxied.node.select([C])

    expect(log).toHaveLength(1)
    const entry = log[log.length - 1]!
    expect(entry.path).toEqual(["node", "select"])
    expect(entry.args).toEqual([[C]])
    // before: nothing selected
    expect((entry.before as { cursor: unknown }).cursor).toBeNull()
    // after: C selected
    expect((entry.after as { cursor: unknown }).cursor).toBe(C)
  })

  it("multiple operations through op() all get tracked", () => {
    const { calls, apply } = collector()
    const sel = createSelection(flatApp())

    const proxied = op(sel, apply)

    proxied.node.select([A])
    proxied.node.extend(C)
    proxied.deselect()

    expect(calls).toHaveLength(3)
    expect(calls.map((c) => c.path.join("."))).toEqual(["node.select", "node.extend", "deselect"])
  })
})
