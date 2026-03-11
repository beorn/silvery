/**
 * createCommandRegistry() — Build a typed command registry from a definition object.
 *
 * Silvery's own command registry builder. Creates a `CommandRegistryLike`
 * from a plain object of command definitions, suitable for use with
 * `withCommands()`.
 *
 * @example
 * ```tsx
 * const registry = createCommandRegistry({
 *   cursor_down: {
 *     name: 'Move Down',
 *     description: 'Move cursor down one row',
 *     shortcuts: ['j', 'ArrowDown'],
 *     execute: (ctx) => ({ type: 'moveCursor', delta: 1 }),
 *   },
 *   cursor_up: {
 *     name: 'Move Up',
 *     description: 'Move cursor up one row',
 *     shortcuts: ['k', 'ArrowUp'],
 *     execute: (ctx) => ({ type: 'moveCursor', delta: -1 }),
 *   },
 *   toggle_done: {
 *     name: 'Toggle Done',
 *     description: 'Toggle the done state of the current item',
 *     execute: (ctx) => ({ type: 'toggleDone', index: ctx.cursor }),
 *   },
 * })
 *
 * // Use with withCommands
 * const app = withCommands(baseApp, {
 *   registry,
 *   getContext: () => buildContext(state),
 *   handleAction: (action) => dispatch(action),
 * })
 * ```
 */

import type { CommandDef, CommandRegistryLike } from "./with-commands"

// =============================================================================
// Types
// =============================================================================

/**
 * Definition for a single command in the registry builder.
 *
 * Unlike the full `CommandDef`, the `id` is inferred from the object key.
 */
export interface CommandDefInput<TContext = unknown, TAction = unknown> {
  /** Human-readable name */
  name: string
  /** Description of what the command does */
  description?: string
  /** Default keyboard shortcuts */
  shortcuts?: string[]
  /** Execute the command, returning action(s) or null */
  execute: (ctx: TContext) => TAction | TAction[] | null
}

/**
 * A record mapping command IDs to their definitions.
 */
export type CommandDefs<TContext = unknown, TAction = unknown> = Record<string, CommandDefInput<TContext, TAction>>

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a command registry from a definition object.
 *
 * Each key in the object becomes the command ID. The returned registry
 * implements `CommandRegistryLike` for use with `withCommands()`.
 *
 * @param defs - Object mapping command IDs to their definitions
 * @returns A command registry with `get()` and `getAll()`
 */
export function createCommandRegistry<TContext, TAction>(
  defs: CommandDefs<TContext, TAction>,
): CommandRegistryLike<TContext, TAction> {
  // Build the full CommandDef array with IDs
  const commands: CommandDef<TContext, TAction>[] = []
  const byId = new Map<string, CommandDef<TContext, TAction>>()

  for (const [id, def] of Object.entries(defs)) {
    const command: CommandDef<TContext, TAction> = {
      id,
      name: def.name,
      description: def.description ?? def.name,
      shortcuts: def.shortcuts,
      execute: def.execute,
    }
    commands.push(command)
    byId.set(id, command)
  }

  return {
    get(id: string): CommandDef<TContext, TAction> | undefined {
      return byId.get(id)
    },
    getAll(): CommandDef<TContext, TAction>[] {
      return commands
    },
  }
}
