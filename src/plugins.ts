/**
 * hightea/plugins -- SlateJS-style plugin composition for command systems.
 *
 * ```tsx
 * import { withCommands, withKeybindings } from '@hightea/term/plugins'
 *
 * const app = withKeybindings(withCommands(render(<Board />), cmdOpts), kbOpts)
 * await app.cmd.down()       // Direct command invocation
 * await app.press('j')       // Key -> command -> action
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// withCommands — Command system
// =============================================================================

export { withCommands } from "./with-commands.js"
export type {
  WithCommandsOptions,
  CommandDef,
  CommandRegistryLike,
  CommandInfo,
  Command,
  Cmd,
  AppWithCommands,
  AppState,
  KeybindingDef,
} from "./with-commands.js"

// =============================================================================
// withKeybindings — Keybinding resolution
// =============================================================================

export { withKeybindings } from "./with-keybindings.js"
export type { WithKeybindingsOptions, KeybindingContext, ExtendedKeybindingDef } from "./with-keybindings.js"

// =============================================================================
// withDiagnostics — Testing invariants
// =============================================================================

export { withDiagnostics, VirtualTerminal } from "./with-diagnostics.js"
export type { DiagnosticOptions } from "./with-diagnostics.js"

// Scheduler errors (for catching incremental render mismatches)
export { IncrementalRenderMismatchError } from "./scheduler.js"
