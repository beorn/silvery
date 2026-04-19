/**
 * @silvery/commands — Command registry, keymaps, and invocation.
 *
 * Provides the command infrastructure for silvery apps:
 * - Command registry with when() availability guards
 * - Keymap resolution with context-dependent bindings
 * - Plugin composition (withCommands, withKeybindings)
 *
 * @packageDocumentation
 */

// Command registry
export {
  createCommandRegistry,
  type CommandDefInput,
  type CommandDefs,
} from "./create-command-registry"

// withCommands plugin
export {
  withCommands,
  type CommandableApp,
  type CommandDef,
  type CommandRegistryLike,
  type AppWithCommands,
  type WithCommandsOptions,
} from "./with-commands"

// withKeybindings plugin
export { withKeybindings, type WithKeybindingsOptions } from "./with-keybindings"

// Key parsing
export { parseHotkey } from "./keys"
