/**
 * silvery/plugins -- Composable plugin system for silvery apps.
 *
 * Plugins are functions `(app) => enhancedApp` that compose via `pipe()`:
 *
 * ```tsx
 * import { pipe, withCommands, withKeybindings, withFocus, withDomEvents } from '@silvery/create/plugins'
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

export { pipe } from "@silvery/create/pipe"
export type { AppPlugin } from "@silvery/create/pipe"

// =============================================================================
// withReact — React reconciler mounting
// =============================================================================

export { withReact } from "@silvery/ag-react/with-react"
export type { AppWithReact } from "@silvery/ag-react/with-react"

// =============================================================================
// withTerminal — Terminal I/O
// =============================================================================

export { withTerminal } from "./with-terminal"
export type { WithTerminalOptions, AppWithTerminal, ProcessLike } from "./with-terminal"

export { withTerminalLinks } from "./with-terminal-links"
export type {
  AppWithTerminalLinks,
  TerminalLinkDetector,
  TerminalLinkSpan,
  TerminalLinksOptions,
} from "./with-terminal-links"

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

export { createCommandRegistry } from "@silvery/commands/create-command-registry"
export type { CommandDefInput, CommandDefs } from "@silvery/commands/create-command-registry"

// =============================================================================
// withCommands — Command system (canonical: @silvery/commands)
// =============================================================================

export { withCommands } from "@silvery/commands/with-commands"
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
} from "@silvery/commands/with-commands"

// =============================================================================
// withKeybindings — Keybinding resolution (canonical: @silvery/commands)
// =============================================================================

export { withKeybindings } from "@silvery/commands/with-keybindings"
export type {
  WithKeybindingsOptions,
  KeybindingContext,
  ExtendedKeybindingDef,
} from "@silvery/commands/with-keybindings"

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
// withRender — Render pipeline plugin
// =============================================================================

export { withRender } from "./with-render"
export type { RenderTerm } from "./with-render"

// Scheduler errors (for catching incremental render mismatches)
export { IncrementalRenderMismatchError } from "../scheduler"
