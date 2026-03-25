/**
 * Tests for withApp() — composition preset.
 */
import { describe, test, expect, vi } from "vitest"
import { withApp } from "@silvery/create/with-app"

function createBase() {
  return {
    dispatch(op: { type: string; [key: string]: unknown }) {
      this.apply(op)
    },
    apply(_op: { type: string; [key: string]: unknown }) {},
  }
}

describe("withApp()", () => {
  test("adds models, commands, keymap, command to app", () => {
    const app = withApp()(createBase())
    expect(app.models).toEqual({})
    expect(app.commands).toEqual({})
    expect(typeof app.keymap).toBe("function")
    expect(typeof app.command).toBe("function")
    expect(typeof app.getKeybindings).toBe("function")
  })

  test("domain plugins can populate models", () => {
    const app = withApp()(createBase())
    app.models.todo = { items: [] }
    expect(app.models.todo).toEqual({ items: [] })
  })

  test("domain plugins can register commands", () => {
    const fn = vi.fn()
    const app = withApp()(createBase())
    app.commands.todo = {
      add: { title: "Add Todo", fn },
    }
    expect(app.commands.todo!.add!.title).toBe("Add Todo")
  })

  test("command() invokes by path", () => {
    const fn = vi.fn(() => "result")
    const app = withApp()(createBase())
    app.commands.todo = {
      add: { title: "Add", fn },
    }
    const result = app.command("todo.add", "arg1")
    expect(fn).toHaveBeenCalledWith("arg1")
    expect(result).toBe("result")
  })

  test("command() throws for invalid path", () => {
    const app = withApp()(createBase())
    expect(() => app.command("invalid")).toThrow("Invalid command path")
  })

  test("command() throws for missing command", () => {
    const app = withApp()(createBase())
    expect(() => app.command("todo.add")).toThrow("Command not found")
  })

  test("command() respects when() guard", () => {
    const app = withApp()(createBase())
    app.commands.todo = {
      add: { title: "Add", fn: () => {}, when: () => false },
    }
    expect(() => app.command("todo.add")).toThrow("Command not available")
  })

  test("keymap() registers bindings", () => {
    const cmd = { title: "Add", fn: () => {} }
    const app = withApp()(createBase())
    app.keymap({ j: cmd, k: cmd })
    const bindings = app.getKeybindings()
    expect(bindings).toHaveLength(2)
    expect(bindings[0]!.key).toBe("j")
    expect(bindings[1]!.key).toBe("k")
  })

  test("preserves base app properties", () => {
    const base = { ...createBase(), customProp: 42 }
    const app = withApp()(base)
    expect(app.customProp).toBe(42)
  })

  test("full domain plugin pattern works", () => {
    const app = withApp()(createBase())

    // Domain plugin: withTodo
    const items: string[] = []
    app.models.todo = { items }
    app.commands.todo = {
      add: {
        title: "Add Item",
        fn: (text: string) => items.push(text),
      },
      clear: {
        title: "Clear",
        fn: () => {
          items.length = 0
        },
      },
    }
    app.keymap({
      a: app.commands.todo!.add!,
      c: app.commands.todo!.clear!,
    })

    // Verify
    app.command("todo.add", "Buy milk")
    expect(items).toEqual(["Buy milk"])

    app.command("todo.clear")
    expect(items).toEqual([])

    expect(app.getKeybindings()).toHaveLength(2)
  })
})
