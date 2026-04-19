/**
 * withApp() — Composition preset for full silvery apps.
 *
 * Installs:
 * - app.models — domain state registry
 * - app.commands — discoverable command tree
 * - app.keymap() — register keybindings
 * - app.command() — typed dispatch convenience
 *
 * This is infrastructure — domain plugins populate the registries.
 * withScope() is separate (installed before withApp in the pipe).
 *
 * @example
 * ```ts
 * const app = pipe(
 *   create(),
 *   withScope(),
 *   withAg(),
 *   withApp(),
 *   withTodo(), // domain plugin
 *   withTerm(term),
 *   withReact({ view: <App /> }),
 * )
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export interface CommandEntry {
  /** Display title */
  title: string
  /** Execute the command */
  fn: (...args: any[]) => any
  /** Availability guard — returns false if command shouldn't be available */
  when?: () => boolean
}

export interface CommandNamespace {
  [commandName: string]: CommandEntry
}

export interface CommandTree {
  [namespace: string]: CommandNamespace
}

export interface KeybindingEntry {
  /** Key sequence (e.g., "j", "ctrl+s", "g g") */
  key: string
  /** Command to invoke */
  command: CommandEntry
  /** Optional override when() for this binding */
  when?: () => boolean
}

export interface AppWithApp {
  /** Domain state registry — populated by domain plugins */
  readonly models: Record<string, unknown>
  /** Discoverable command tree — populated by domain plugins */
  readonly commands: CommandTree
  /** Register keybindings (no-op in headless) */
  keymap(bindings: Record<string, CommandEntry>): void
  /** Get all registered keybindings */
  getKeybindings(): KeybindingEntry[]
  /** Invoke a command by namespace.name path */
  command(path: string, ...args: any[]): unknown
}

// =============================================================================
// Plugin
// =============================================================================

export function withApp() {
  return <
    A extends {
      dispatch(op: { type: string; [key: string]: unknown }): void
      apply(op: { type: string; [key: string]: unknown }): void
    },
  >(
    app: A,
  ) => {
    const models: Record<string, unknown> = {}
    const commands: CommandTree = {}
    const keybindings: KeybindingEntry[] = []

    const appExt: AppWithApp = {
      models,
      commands,

      keymap(bindings: Record<string, CommandEntry>) {
        for (const [key, command] of Object.entries(bindings)) {
          keybindings.push({ key, command })
        }
      },

      getKeybindings() {
        return keybindings
      },

      command(path: string, ...args: any[]) {
        const [ns, name] = path.split(".")
        if (!ns || !name)
          throw new Error(`Invalid command path: ${path} (expected "namespace.command")`)
        const cmd = commands[ns]?.[name]
        if (!cmd) throw new Error(`Command not found: ${path}`)
        if (cmd.when && !cmd.when()) throw new Error(`Command not available: ${path}`)
        return cmd.fn(...args)
      },
    }

    return { ...app, ...appExt } as A & AppWithApp
  }
}
