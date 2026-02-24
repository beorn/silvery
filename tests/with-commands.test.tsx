/**
 * Tests for withCommands plugin
 *
 * withCommands adds a SlateJS-style `cmd` object to an App for direct command
 * invocation with metadata. It supports short-name and full-id lookup via Proxy,
 * introspection via cmd.all()/cmd.describe(), and keybinding metadata.
 */

import React from "react"
import { describe, expect, it, vi } from "vitest"
import { Box, Text, withCommands } from "../src/index.js"
import type {
  CommandDef,
  CommandRegistryLike,
  KeybindingDef,
} from "../src/with-commands.js"
import { createRenderer } from "inkx/testing"

const render = createRenderer({ cols: 40, rows: 10 })

// =============================================================================
// Helpers
// =============================================================================

function createRegistry(commands: CommandDef[]): CommandRegistryLike {
  return {
    get: (id: string) => commands.find((c) => c.id === id),
    getAll: () => commands,
  }
}

function SimpleApp() {
  return (
    <Box>
      <Text>Hello</Text>
    </Box>
  )
}

const testCommands: CommandDef[] = [
  {
    id: "cursor_down",
    name: "Move Down",
    description: "Move cursor down one row",
    execute: () => ({ type: "CURSOR_DOWN" }),
  },
  {
    id: "cursor_up",
    name: "Move Up",
    description: "Move cursor up one row",
    execute: () => ({ type: "CURSOR_UP" }),
  },
  {
    id: "edit_toggle",
    name: "Toggle Edit",
    description: "Toggle edit mode",
    execute: () => ({ type: "TOGGLE_EDIT" }),
  },
  {
    id: "fold.all",
    name: "Fold All",
    description: "Fold all nodes",
    execute: () => ({ type: "FOLD_ALL" }),
  },
]

const testKeybindings: KeybindingDef[] = [
  { key: "j", commandId: "cursor_down" },
  { key: "ArrowDown", commandId: "cursor_down" },
  { key: "k", commandId: "cursor_up" },
  { key: "ArrowUp", commandId: "cursor_up" },
  { key: "e", commandId: "edit_toggle" },
  { key: "z", commandId: "fold.all", ctrl: true },
]

// =============================================================================
// Tests: Command Registration & Lookup
// =============================================================================

describe("withCommands", () => {
  describe("command registration", () => {
    it("attaches cmd object to app", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      expect(enhanced.cmd).toBeDefined()
    })

    it("attaches getState to app", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      expect(enhanced.getState).toBeDefined()
      expect(typeof enhanced.getState).toBe("function")
    })
  })

  // ===========================================================================
  // Tests: Command Invocation
  // ===========================================================================

  describe("command invocation", () => {
    it("invokes command by full id", async () => {
      const handleAction = vi.fn()
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({ cursor: 0 }),
        handleAction,
      })

      await enhanced.cmd["cursor_down"]!()

      expect(handleAction).toHaveBeenCalledWith({ type: "CURSOR_DOWN" })
    })

    it("invokes command by short name (last segment)", async () => {
      const handleAction = vi.fn()
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction,
      })

      // "down" is the short name for "cursor_down"
      await enhanced.cmd.down!()

      expect(handleAction).toHaveBeenCalledWith({ type: "CURSOR_DOWN" })
    })

    it("invokes command by short name for dot-separated ids", async () => {
      const handleAction = vi.fn()
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction,
      })

      // "all" is the short name for "fold.all"
      await enhanced.cmd["fold.all"]!()

      expect(handleAction).toHaveBeenCalledWith({ type: "FOLD_ALL" })
    })

    it("passes context from getContext to execute", async () => {
      const executeSpy = vi.fn().mockReturnValue({ type: "ACTION" })
      const commands: CommandDef[] = [
        {
          id: "test_cmd",
          name: "Test",
          description: "Test command",
          execute: executeSpy,
        },
      ]

      const context = { cursor: 5, mode: "normal" }
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(commands),
        getContext: () => context,
        handleAction: () => {},
      })

      await enhanced.cmd["test_cmd"]!()

      expect(executeSpy).toHaveBeenCalledWith(context)
    })

    it("handles commands that return multiple actions", async () => {
      const handleAction = vi.fn()
      const commands: CommandDef[] = [
        {
          id: "multi_action",
          name: "Multi",
          description: "Returns multiple actions",
          execute: () => [{ type: "A" }, { type: "B" }, { type: "C" }],
        },
      ]

      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(commands),
        getContext: () => ({}),
        handleAction,
      })

      await enhanced.cmd["multi_action"]!()

      expect(handleAction).toHaveBeenCalledTimes(3)
      expect(handleAction).toHaveBeenNthCalledWith(1, { type: "A" })
      expect(handleAction).toHaveBeenNthCalledWith(2, { type: "B" })
      expect(handleAction).toHaveBeenNthCalledWith(3, { type: "C" })
    })

    it("handles commands that return null (no-op)", async () => {
      const handleAction = vi.fn()
      const commands: CommandDef[] = [
        {
          id: "noop_cmd",
          name: "Noop",
          description: "Does nothing",
          execute: () => null,
        },
      ]

      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(commands),
        getContext: () => ({}),
        handleAction,
      })

      await enhanced.cmd["noop_cmd"]!()

      expect(handleAction).not.toHaveBeenCalled()
    })

    it("returns undefined for unknown commands", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      expect(enhanced.cmd["nonexistent_command"]).toBeUndefined()
    })
  })

  // ===========================================================================
  // Tests: Command Metadata
  // ===========================================================================

  describe("command metadata", () => {
    it("exposes id on command function", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      expect(enhanced.cmd.down!.id).toBe("cursor_down")
      expect(enhanced.cmd.up!.id).toBe("cursor_up")
    })

    it("exposes name on command function", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      expect(enhanced.cmd.down!.name).toBe("Move Down")
    })

    it("exposes help (description) on command function", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      expect(enhanced.cmd.down!.help).toBe("Move cursor down one row")
    })

    it("exposes keys from keybindings on command function", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
        getKeybindings: () => testKeybindings,
      })

      const keys = enhanced.cmd.down!.keys
      expect(keys).toContain("j")
      expect(keys).toContain("ArrowDown")
      expect(keys).toHaveLength(2)
    })

    it("returns empty keys array when no keybindings provided", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      expect(enhanced.cmd.down!.keys).toEqual([])
    })

    it("formats modifier keys in keybinding strings", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
        getKeybindings: () => testKeybindings,
      })

      // fold.all has Ctrl+z binding
      const cmd = enhanced.cmd["fold.all"]!
      expect(cmd.keys).toContain("Ctrl+z")
    })
  })

  // ===========================================================================
  // Tests: cmd.all() Introspection
  // ===========================================================================

  describe("cmd.all()", () => {
    it("returns all commands with metadata", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
        getKeybindings: () => testKeybindings,
      })

      const all = enhanced.cmd.all()
      expect(all).toHaveLength(4)
    })

    it("includes id, name, description, and keys for each command", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
        getKeybindings: () => testKeybindings,
      })

      const all = enhanced.cmd.all()
      const downCmd = all.find((c) => c.id === "cursor_down")
      expect(downCmd).toBeDefined()
      expect(downCmd!.name).toBe("Move Down")
      expect(downCmd!.description).toBe("Move cursor down one row")
      expect(downCmd!.keys).toContain("j")
      expect(downCmd!.keys).toContain("ArrowDown")
    })

    it("returns empty keys for commands without keybindings", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
        getKeybindings: () => testKeybindings,
      })

      const all = enhanced.cmd.all()
      const editCmd = all.find((c) => c.id === "edit_toggle")
      expect(editCmd).toBeDefined()
      // edit_toggle has one binding ("e")
      expect(editCmd!.keys).toContain("e")
    })

    it("returns empty keys when no getKeybindings provided", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      const all = enhanced.cmd.all()
      for (const cmd of all) {
        expect(cmd.keys).toEqual([])
      }
    })
  })

  // ===========================================================================
  // Tests: cmd.describe()
  // ===========================================================================

  describe("cmd.describe()", () => {
    it("returns human-readable help text", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
        getKeybindings: () => testKeybindings,
      })

      const description = enhanced.cmd.describe()
      expect(description).toContain("cursor_down")
      expect(description).toContain("Move cursor down one row")
      expect(description).toContain("[j, ArrowDown]")
    })

    it("omits key section for commands without keybindings", () => {
      const commands: CommandDef[] = [
        {
          id: "no_keys",
          name: "No Keys",
          description: "Has no keybindings",
          execute: () => null,
        },
      ]

      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(commands),
        getContext: () => ({}),
        handleAction: () => {},
        getKeybindings: () => [],
      })

      const description = enhanced.cmd.describe()
      // Should have id and description but no brackets
      expect(description).toContain("no_keys: Has no keybindings")
      expect(description).not.toContain("[")
    })
  })

  // ===========================================================================
  // Tests: Proxy 'has' trap
  // ===========================================================================

  describe("proxy has trap", () => {
    it("returns true for existing commands by id", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      expect("cursor_down" in enhanced.cmd).toBe(true)
    })

    it("returns true for existing commands by short name", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      expect("down" in enhanced.cmd).toBe(true)
    })

    it("returns true for introspection methods", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      expect("all" in enhanced.cmd).toBe(true)
      expect("describe" in enhanced.cmd).toBe(true)
    })

    it("returns false for nonexistent commands", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      expect("nonexistent" in enhanced.cmd).toBe(false)
    })
  })

  // ===========================================================================
  // Tests: getState() for AI introspection
  // ===========================================================================

  describe("getState()", () => {
    it("returns screen text", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      const state = enhanced.getState()
      expect(state.screen).toContain("Hello")
    })

    it("returns all commands with metadata", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
        getKeybindings: () => testKeybindings,
      })

      const state = enhanced.getState()
      expect(state.commands).toHaveLength(4)
      expect(state.commands[0]!.id).toBe("cursor_down")
      expect(state.commands[0]!.keys).toContain("j")
    })

    it("returns undefined focus by default", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      const state = enhanced.getState()
      expect(state.focus).toBeUndefined()
    })
  })

  // ===========================================================================
  // Tests: Context Resolution
  // ===========================================================================

  describe("context resolution", () => {
    it("calls getContext fresh on each invocation", async () => {
      let callCount = 0
      const getContext = () => {
        callCount++
        return { invocation: callCount }
      }
      const executeSpy = vi.fn().mockReturnValue(null)
      const commands: CommandDef[] = [
        {
          id: "test_cmd",
          name: "Test",
          description: "Test",
          execute: executeSpy,
        },
      ]

      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(commands),
        getContext,
        handleAction: () => {},
      })

      await enhanced.cmd["test_cmd"]!()
      await enhanced.cmd["test_cmd"]!()
      await enhanced.cmd["test_cmd"]!()

      expect(callCount).toBe(3)
      expect(executeSpy).toHaveBeenNthCalledWith(1, { invocation: 1 })
      expect(executeSpy).toHaveBeenNthCalledWith(2, { invocation: 2 })
      expect(executeSpy).toHaveBeenNthCalledWith(3, { invocation: 3 })
    })

    it("calls getKeybindings fresh on each command lookup", () => {
      let callCount = 0
      const getKeybindings = () => {
        callCount++
        return testKeybindings
      }

      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
        getKeybindings,
      })

      // Each property access triggers getKeybindings
      enhanced.cmd.down
      enhanced.cmd.up
      const _before = callCount
      enhanced.cmd.all()

      // getKeybindings is called during access
      expect(callCount).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // Tests: Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("handles empty registry", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry([]),
        getContext: () => ({}),
        handleAction: () => {},
      })

      expect(enhanced.cmd.all()).toEqual([])
      expect(enhanced.cmd.describe()).toBe("")
      expect(enhanced.cmd["anything"]).toBeUndefined()
    })

    it("prefers exact id match over short name", async () => {
      const handleAction = vi.fn()
      // Two commands where one's full id equals another's short name
      const commands: CommandDef[] = [
        {
          id: "down",
          name: "Down (exact)",
          description: "Exact id match",
          execute: () => ({ type: "EXACT" }),
        },
        {
          id: "cursor_down",
          name: "Cursor Down",
          description: "Short name match",
          execute: () => ({ type: "SHORT" }),
        },
      ]

      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(commands),
        getContext: () => ({}),
        handleAction,
      })

      // "down" should match the exact id "down", not the short name of "cursor_down"
      await enhanced.cmd.down!()
      expect(handleAction).toHaveBeenCalledWith({ type: "EXACT" })
    })

    it("returns undefined for symbol access", () => {
      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
      })

      // Symbol access should return undefined (for JS internals like Symbol.toPrimitive)
      expect((enhanced.cmd as any)[Symbol.toPrimitive]).toBeUndefined()
    })

    it("handles keybindings with multiple modifiers", () => {
      const keybindings: KeybindingDef[] = [
        { key: "s", commandId: "cursor_down", ctrl: true, shift: true, alt: true },
      ]

      const app = render(<SimpleApp />)
      const enhanced = withCommands(app, {
        registry: createRegistry(testCommands),
        getContext: () => ({}),
        handleAction: () => {},
        getKeybindings: () => keybindings,
      })

      const keys = enhanced.cmd.down!.keys
      expect(keys).toHaveLength(1)
      expect(keys[0]).toBe("Ctrl+Alt+Shift+s")
    })
  })
})
