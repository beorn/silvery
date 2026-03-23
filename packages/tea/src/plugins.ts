/**
 * silvery/plugins -- Composable plugin system for silvery apps.
 *
 * Plugins are functions `(app) => enhancedApp` that compose via `pipe()`:
 *
 * ```tsx
 * import { pipe, withCommands, withKeybindings, withFocus, withDomEvents } from '@silvery/tea/plugins'
 *
 * const app = pipe(
 *   baseApp,
 *   withFocus(),
 *   withDomEvents(),
 *   withCommands(cmdOpts),
 *   withKeybindings(kbOpts),
 * )
 *
 * await app.cmd.down()       // Direct command invocation
 * await app.press('j')       // Key -> command -> action
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// pipe — Plugin composition
// =============================================================================

export { pipe } from "./pipe"
export type { AppPlugin } from "./pipe"

// =============================================================================
// withReact — React reconciler mounting
// =============================================================================

export { withReact } from "./with-react"
export type { AppWithReact } from "./with-react"

// =============================================================================
// withTerminal — Terminal I/O
// =============================================================================

export { withTerminal } from "./with-terminal"
export type { WithTerminalOptions, AppWithTerminal, ProcessLike } from "./with-terminal"

// =============================================================================
// withFocus — Focus management
// =============================================================================

export { withFocus } from "./with-focus"
export type { WithFocusOptions, AppWithFocus } from "./with-focus"

// =============================================================================
// withDomEvents — DOM-style event dispatch
// =============================================================================

export { withDomEvents } from "./with-dom-events"
export type { WithDomEventsOptions } from "./with-dom-events"

// =============================================================================
// createCommandRegistry — Command registry builder
// =============================================================================

export { createCommandRegistry } from "./create-command-registry"
export type { CommandDefInput, CommandDefs } from "./create-command-registry"

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
// withLinks — Link event handling
// =============================================================================

export { withLinks } from "./with-links"
export type { WithLinksOptions, LinkEventBus, LinkHandler, AppWithLinks } from "./with-links"

// =============================================================================
// withDiagnostics — Testing invariants
// =============================================================================

export { withDiagnostics, VirtualTerminal } from "./with-diagnostics"
export type { DiagnosticOptions } from "./with-diagnostics"

// =============================================================================
// withInk — Ink compatibility layer (from @silvery/ink)
// =============================================================================

export { withInk } from "@silvery/ink/with-ink"
export type { WithInkOptions, AppWithInk } from "@silvery/ink/with-ink"

// =============================================================================
// withInkCursor — Ink cursor compatibility adapter (from @silvery/ink)
// =============================================================================

export { withInkCursor } from "@silvery/ink/with-ink-cursor"
export type { WithInkCursorOptions, AppWithInkCursor } from "@silvery/ink/with-ink-cursor"

// =============================================================================
// withInkFocus — Ink focus compatibility adapter (from @silvery/ink)
// =============================================================================

export { withInkFocus } from "@silvery/ink/with-ink-focus"
export type { WithInkFocusOptions, AppWithInkFocus } from "@silvery/ink/with-ink-focus"

// Scheduler errors (for catching incremental render mismatches)
export { IncrementalRenderMismatchError } from "@silvery/term/scheduler"
