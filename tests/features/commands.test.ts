/**
 * Tests for @silvery/commands — command registry, keymaps, invocation.
 */
import { describe, test, expect, vi } from "vitest"
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

describe("parseHotkey", () => {
  test("parses simple key", () => {
    const result = parseHotkey("j")
    expect(result).toBeDefined()
  })
})
