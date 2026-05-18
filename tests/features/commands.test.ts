/**
 * Tests for @silvery/commands — command registry, keymaps, invocation.
 */
import { describe, test, expect } from "vitest"
import { command, defineCommands, flattenCommandTree, resolveInvocation } from "@silvery/commands"
import { createCommandRegistry } from "@silvery/commands/create-command-registry"
import { parseHotkey } from "@silvery/ag/keys"

describe("createCommandRegistry", () => {
  test("creates registry from definition object", () => {
    const registry = createCommandRegistry({
      cursor_down: {
        name: "Move Down",
        shortcuts: ["j", "ArrowDown"],
        execute: () => ({ type: "move", delta: 1 }),
      },
      cursor_up: {
        name: "Move Up",
        shortcuts: ["k"],
        execute: () => ({ type: "move", delta: -1 }),
      },
    })

    expect(registry.get("cursor_down")).toBeDefined()
    expect(registry.get("cursor_down")!.name).toBe("Move Down")
    expect(registry.get("cursor_down")!.id).toBe("cursor_down")
    expect(registry.get("cursor_down")!.shortcuts).toEqual(["j", "ArrowDown"])
  })

  test("getAll returns all commands", () => {
    const registry = createCommandRegistry({
      a: { name: "A", execute: () => null },
      b: { name: "B", execute: () => null },
      c: { name: "C", execute: () => null },
    })

    expect(registry.getAll()).toHaveLength(3)
  })

  test("get returns undefined for missing command", () => {
    const registry = createCommandRegistry({
      a: { name: "A", execute: () => null },
    })

    expect(registry.get("nonexistent")).toBeUndefined()
  })

  test("execute receives context and returns action", () => {
    const registry = createCommandRegistry<{ cursor: number }, { type: string; index: number }>({
      toggle: {
        name: "Toggle",
        execute: (ctx) => ({ type: "toggle", index: ctx.cursor }),
      },
    })

    const cmd = registry.get("toggle")!
    const result = cmd.execute({ cursor: 5 })
    expect(result).toEqual({ type: "toggle", index: 5 })
  })

  test("description defaults to name", () => {
    const registry = createCommandRegistry({
      a: { name: "Alpha", execute: () => null },
    })

    expect(registry.get("a")!.description).toBe("Alpha")
  })

  test("explicit description overrides default", () => {
    const registry = createCommandRegistry({
      a: { name: "Alpha", description: "Custom desc", execute: () => null },
    })

    expect(registry.get("a")!.description).toBe("Custom desc")
  })
})

describe("command tree model", () => {
  test("flattenCommandTree derives stable dotted ids and preserves command identity", () => {
    const toggleDone = command({
      title: "Toggle Done",
      run: ({ toggled }: { toggled: string[] }, params: { nodeId: string }) => {
        toggled.push(params.nodeId)
      },
    })
    const setPriority = command({
      title: "Set Priority",
      run: () => null,
    })

    const tree = defineCommands({
      task: {
        toggleDone,
        setPriority,
      },
      nav: {
        moveDown: command({
          title: "Move Down",
          run: () => null,
        }),
      },
    })

    const flat = flattenCommandTree(tree)

    expect(flat.map((entry) => entry.id)).toEqual([
      "task.toggleDone",
      "task.setPriority",
      "nav.moveDown",
    ])
    expect(flat[0]!.path).toEqual(["task", "toggleDone"])
    expect(flat[0]!.command).toBe(toggleDone)
    expect(flat[1]!.command).toBe(setPriority)
  })

  test("resolveInvocation returns ready with parsed params", () => {
    const toggle = command({
      title: "Toggle Done",
      params: {
        parse(value: unknown) {
          const input = value as { nodeId?: unknown }
          if (typeof input.nodeId !== "string") throw new Error("nodeId must be a string")
          return { nodeId: input.nodeId }
        },
      },
      run: () => null,
    })

    expect(resolveInvocation(toggle, {}, { nodeId: "abc" })).toEqual({
      state: "ready",
      params: { nodeId: "abc" },
    })
  })

  test("resolveInvocation accepts Standard Schema compatible params", () => {
    const setPriority = command({
      title: "Set Priority",
      params: {
        "~standard": {
          version: 1 as const,
          vendor: "test",
          validate(value: unknown) {
            const input = value as { priority?: unknown }
            if (typeof input.priority !== "number") {
              return { issues: [{ message: "priority must be a number" }] }
            }
            return { value: { priority: input.priority } }
          },
        },
      },
      run: () => null,
    })

    expect(resolveInvocation(setPriority, {}, { priority: 2 })).toEqual({
      state: "ready",
      params: { priority: 2 },
    })
    expect(resolveInvocation(setPriority, {}, { priority: "high" })).toMatchObject({
      state: "invalid",
    })
  })

  test("resolveInvocation distinguishes prompt, invalid, unavailable, and unknown", () => {
    const needsNode = command({
      title: "Needs Node",
      params: {
        missing(value: unknown) {
          const input = value as { nodeId?: unknown }
          return typeof input?.nodeId === "string" ? [] : ["nodeId"]
        },
        parse(value: unknown) {
          const input = value as { nodeId: string }
          return { nodeId: input.nodeId }
        },
      },
      run: () => null,
    })
    const invalid = command({
      title: "Invalid",
      params: {
        parse() {
          throw new Error("bad params")
        },
      },
      run: () => null,
    })
    const unavailable = command({
      title: "Unavailable",
      isAvailable: () => ({ available: false, reason: "no selection" }),
      run: () => null,
    })

    expect(resolveInvocation(needsNode, {}, {})).toEqual({
      state: "prompt",
      missing: ["nodeId"],
    })
    expect(resolveInvocation(invalid, {}, {})).toMatchObject({
      state: "invalid",
    })
    expect(resolveInvocation(unavailable, {}, {})).toEqual({
      state: "unavailable",
      reason: "no selection",
    })
    expect(resolveInvocation(undefined, {}, {})).toEqual({
      state: "unknown",
    })
  })

  test("legacy flat registry remains compatible", () => {
    const registry = createCommandRegistry<{ cursor: number }, { type: "move"; delta: number }>({
      down: {
        name: "Move Down",
        execute: () => ({ type: "move", delta: 1 }),
      },
    })

    expect(registry.get("down")!.execute({ cursor: 0 })).toEqual({ type: "move", delta: 1 })
    expect(registry.getAll().map((cmd) => cmd.id)).toEqual(["down"])
  })
})

describe("parseHotkey", () => {
  test("parses simple key", () => {
    const result = parseHotkey("j")
    expect(result).toBeDefined()
  })
})
