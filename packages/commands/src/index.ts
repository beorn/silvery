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
  command,
  defineCommands,
  flattenCommandTree,
  isCommandNode,
  resolveInvocation,
  type Availability,
  type CommandMetadata,
  type CommandNode,
  type CommandTree,
  type FlattenedCommand,
  type Invocation,
  type ParamSchema,
  type ParseParamSchema,
  type StandardParamSchema,
} from "./command-tree"

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

// Key parsing (canonical: @silvery/ag/keys)
export { parseHotkey } from "@silvery/ag/keys"
