/**
 * withCommands - SlateJS-style plugin for command system
 *
 * Adds a `cmd` object to the App for direct command invocation with metadata.
 *
 * @example
 * ```tsx
 * const app = withCommands(render(<Board />), {
 *   registry: commandRegistry,
 *   getContext: () => buildCommandContext(state),
 *   handleAction: (action) => dispatch(action),
 *   getKeybindings: () => keybindings,
 * })
 *
 * // Direct command invocation
 * await app.cmd.down()
 * await app.cmd['cursor_down']()
 *
 * // Command metadata
 * app.cmd.down.id        // 'cursor_down'
 * app.cmd.down.name      // 'Move Down'
 * app.cmd.down.help      // 'Move cursor down'
 * app.cmd.down.keys      // ['j', 'ArrowDown']
 *
 * // Introspection
 * app.cmd.all()          // All commands with metadata
 * app.getState()         // { screen, commands, focus } for AI
 * ```
 *
 * See docs/future/inkx-command-api-research.md for design rationale.
 */

import type { App } from "./app.js"

// =============================================================================
// Types
// =============================================================================

/**
 * Generic command definition interface.
 * Compatible with @km/commands CommandDef but doesn't require the dependency.
 */
export interface CommandDef<TContext = unknown, TAction = unknown> {
  id: string
  name: string
  description: string
  shortcuts?: string[]
  execute: (ctx: TContext) => TAction | TAction[] | null
}

/**
 * Generic keybinding interface.
 * Compatible with @km/commands Keybinding.
 */
export interface KeybindingDef {
  key: string
  commandId: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  super?: boolean
}

/**
 * Generic command registry interface.
 */
export interface CommandRegistryLike<TContext = unknown, TAction = unknown> {
  get(id: string): CommandDef<TContext, TAction> | undefined
  getAll(): CommandDef<TContext, TAction>[]
}

/**
 * Command metadata exposed on the cmd object.
 */
export interface CommandInfo {
  id: string
  name: string
  description: string
  keys: readonly string[]
}

/**
 * A callable command with metadata.
 */
export interface Command {
  (): Promise<void>
  readonly id: string
  readonly name: string
  readonly help: string
  readonly keys: readonly string[]
}

/**
 * The cmd object added to the app.
 *
 * Provides both method-style (`cmd.down()`) and index-style (`cmd['cursor_down']()`)
 * access to commands. Uses Proxy for dynamic lookup.
 */
export interface Cmd {
  [key: string]: Command | (() => CommandInfo[]) | (() => string) | undefined
  /** Get all commands with metadata */
  all(): CommandInfo[]
  /** Get human/AI readable description of all commands */
  describe(): string
}

/**
 * Options for withCommands.
 *
 * @typeParam TContext - The context type passed to command execute()
 * @typeParam TAction - The action type returned by command execute()
 */
export interface WithCommandsOptions<TContext, TAction> {
  /** Command registry with get() and getAll() */
  registry: CommandRegistryLike<TContext, TAction>
  /** Build context for command execution */
  getContext: () => TContext
  /** Handle actions returned by command execution */
  handleAction: (action: TAction) => void
  /** Get keybindings for command metadata (optional) */
  getKeybindings?: () => KeybindingDef[]
}

/**
 * App state for AI introspection.
 */
export interface AppState {
  screen: string
  commands: CommandInfo[]
  focus?: { id: string; text: string }
}

/**
 * App with command system.
 */
export type AppWithCommands = App & {
  cmd: Cmd
  getState(): AppState
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Find command by short name or full id.
 *
 * Supports both:
 * - Exact id match: `cmd['cursor_down']`
 * - Short name match: `cmd.down` (matches 'cursor_down', 'navigation_down', etc.)
 */
function findCommand<TContext, TAction>(
  registry: CommandRegistryLike<TContext, TAction>,
  key: string,
): CommandDef<TContext, TAction> | undefined {
  // Try exact id match first
  const byId = registry.get(key)
  if (byId) return byId

  // Try short name (last segment after underscore or dot)
  const all = registry.getAll()
  return all.find((c) => {
    const shortName = c.id.split(/[._]/).pop()
    return shortName === key
  })
}

/**
 * Get keys bound to a command.
 */
function getKeysForCommand(commandId: string, keybindings?: KeybindingDef[]): readonly string[] {
  if (!keybindings) return []
  return keybindings
    .filter((kb) => kb.commandId === commandId)
    .map((kb) => {
      const parts: string[] = []
      if (kb.ctrl) parts.push("Ctrl")
      if (kb.meta) parts.push("Meta")
      if (kb.alt) parts.push("Alt")
      if (kb.shift) parts.push("Shift")
      parts.push(kb.key)
      return parts.join("+")
    })
}

/**
 * Format help text for all commands.
 */
function formatHelp<TContext, TAction>(
  registry: CommandRegistryLike<TContext, TAction>,
  keybindings?: KeybindingDef[],
): string {
  const commands = registry.getAll()
  const lines = commands.map((cmd) => {
    const keys = getKeysForCommand(cmd.id, keybindings)
    const keyStr = keys.length > 0 ? ` [${keys.join(", ")}]` : ""
    return `${cmd.id}${keyStr}: ${cmd.description}`
  })
  return lines.join("\n")
}

/**
 * Add command system to an App.
 *
 * @example
 * ```tsx
 * const app = withCommands(render(<Board />), {
 *   registry: commandRegistry,
 *   getContext: () => buildContext(state),
 *   handleAction: (action) => dispatch(action),
 * })
 *
 * await app.cmd.down()
 * console.log(app.cmd.down.help)
 * ```
 */
export function withCommands<TContext, TAction>(
  app: App,
  options: WithCommandsOptions<TContext, TAction>,
): AppWithCommands {
  const { registry, getContext, handleAction, getKeybindings } = options

  const cmd = new Proxy({} as Cmd, {
    get(_, prop: string | symbol): unknown {
      // Handle symbol access (for JS internals)
      if (typeof prop === "symbol") return undefined

      // Introspection methods
      if (prop === "all") {
        return () => {
          const commands = registry.getAll()
          const keybindings = getKeybindings?.()
          return commands.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            keys: getKeysForCommand(c.id, keybindings),
          }))
        }
      }

      if (prop === "describe") {
        return () => formatHelp(registry, getKeybindings?.())
      }

      // Look up command by short name or full id
      const def = findCommand(registry, prop)
      if (!def) return undefined

      // Build callable with metadata
      const fn = async () => {
        const ctx = getContext()
        const result = def.execute(ctx)
        if (result) {
          const actions = Array.isArray(result) ? result : [result]
          for (const action of actions) {
            handleAction(action)
          }
        }
        // Allow microtask to flush for test synchronization
        await Promise.resolve()
      }

      // Attach metadata
      const keybindings = getKeybindings?.()
      Object.defineProperties(fn, {
        id: { value: def.id, enumerable: true },
        name: { value: def.name, enumerable: true },
        help: { value: def.description, enumerable: true },
        keys: {
          value: getKeysForCommand(def.id, keybindings),
          enumerable: true,
        },
      })

      return fn as Command
    },

    has(_, prop): boolean {
      if (typeof prop === "symbol") return false
      if (prop === "all" || prop === "describe") return true
      return !!findCommand(registry, prop)
    },
  })

  // Build getState for AI introspection
  const getState = (): AppState => {
    const commands = registry.getAll()
    const keybindings = getKeybindings?.()
    return {
      screen: app.text,
      commands: commands.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        keys: getKeysForCommand(c.id, keybindings),
      })),
      // Focus info would require DOM query - leave undefined for now
      focus: undefined,
    }
  }

  return Object.assign(app, { cmd, getState }) as AppWithCommands
}
