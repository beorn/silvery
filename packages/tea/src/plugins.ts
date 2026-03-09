/**
 * silvery/plugins -- SlateJS-style plugin composition for command systems.
 *
 * ```tsx
 * import { withCommands, withKeybindings } from '@silvery/tea/plugins'
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

export { withCommands } from "./with-commands"
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
} from "./with-commands"

// =============================================================================
// withKeybindings — Keybinding resolution
// =============================================================================

export { withKeybindings } from "./with-keybindings"
export type { WithKeybindingsOptions, KeybindingContext, ExtendedKeybindingDef } from "./with-keybindings"

// =============================================================================
// withDiagnostics — Testing invariants
// =============================================================================

export { withDiagnostics, VirtualTerminal } from "./with-diagnostics"
export type { DiagnosticOptions } from "./with-diagnostics"

// Scheduler errors (for catching incremental render mismatches)
export { IncrementalRenderMismatchError } from "@silvery/term/scheduler"
