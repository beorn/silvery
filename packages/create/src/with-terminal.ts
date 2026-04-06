/**
 * withTerminal(process, opts?) — Plugin: ALL terminal I/O
 *
 * This plugin represents the terminal I/O layer in silvery's plugin
 * composition model. It wraps all terminal concerns:
 * - stdin → typed events (term:key, term:mouse, term:paste)
 * - stdout → alternate screen, raw mode, incremental diff output
 * - SIGWINCH → term:resize
 * - Lifecycle (Ctrl+Z suspend/resume, Ctrl+C exit)
 * - Protocols (SGR mouse, Kitty keyboard, bracketed paste)
 *
 * In the current architecture, terminal I/O is handled by createApp()
 * and the TermProvider. This plugin provides the declarative interface
 * for pipe() composition:
 *
 * ```tsx
 * const app = pipe(
 *   createApp(store),
 *   withReact(<Board />),
 *   withTerminal(process, { mouse: true, kitty: true }),
 *   withFocus(),
 *   withDomEvents(),
 * )
 * ```
 *
 * @example
 * ```tsx
 * import { pipe, withTerminal } from '@silvery/create'
 *
 * // All protocols enabled by default
 * const app = pipe(baseApp, withTerminal(process))
 *
 * // Customize terminal options
 * const app = pipe(baseApp, withTerminal(process, {
 *   mouse: true,
 *   kitty: true,
 *   paste: true,
 *   onSuspend: () => saveState(),
 *   onResume: () => restoreState(),
 * }))
 * ```
 */

import { createCapabilityRegistry, type CapabilityRegistry } from "./internal/capability-registry"
import { CLIPBOARD_CAPABILITY } from "./internal/capabilities"
import { createOSC52Clipboard, type ClipboardCapability } from "@silvery/ag-term/features"

// =============================================================================
// Types
// =============================================================================

/**
 * Process-like object that provides stdin/stdout streams.
 * Accepts the Node.js global `process` or a mock.
 */
export interface ProcessLike {
  stdin: NodeJS.ReadStream
  stdout: NodeJS.WriteStream
  [key: string]: unknown
}

/**
 * Options for withTerminal.
 */
export interface WithTerminalOptions {
  /**
   * Enable SGR mouse tracking.
   * Default: true
   */
  mouse?: boolean

  /**
   * Enable Kitty keyboard protocol.
   * - `true`: auto-detect and enable with default flags
   *   (DISAMBIGUATE | REPORT_EVENTS | REPORT_ALL_KEYS — supports useModifierKeys Cmd tracking)
   * - number: enable with specific KittyFlags bitfield
   * - `false`: don't enable
   * Default: true
   */
  kitty?: boolean | number

  /**
   * Enable bracketed paste mode.
   * Default: true
   */
  paste?: boolean

  /**
   * Enter alternate screen buffer.
   * Default: true
   */
  alternateScreen?: boolean

  /**
   * Handle Ctrl+Z by suspending the process.
   * Default: true
   */
  suspendOnCtrlZ?: boolean

  /**
   * Handle Ctrl+C by restoring terminal and exiting.
   * Default: true
   */
  exitOnCtrlC?: boolean

  /** Called before suspend. Return false to prevent. */
  onSuspend?: () => boolean | void

  /** Called after resume from suspend. */
  onResume?: () => void

  /** Called on Ctrl+C. Return false to prevent exit. */
  onInterrupt?: () => boolean | void

  /**
   * Enable Kitty text sizing protocol for PUA characters.
   * Default: false
   */
  textSizing?: boolean | "auto"

  /**
   * Enable terminal focus reporting.
   * Default: false
   */
  focusReporting?: boolean
}

/**
 * App enhanced with terminal configuration.
 */
export interface AppWithTerminal {
  /** The terminal options for this app */
  readonly terminalOptions: WithTerminalOptions & { proc: ProcessLike }

  /** Capability registry populated by withTerminal (clipboard). */
  readonly capabilityRegistry: CapabilityRegistry

  /** Clipboard capability for copy operations (OSC 52). */
  readonly clipboardCapability: ClipboardCapability
}

/**
 * Minimal app shape that withTerminal can enhance.
 */
interface RunnableApp {
  run(...args: unknown[]): unknown
  [key: string]: unknown
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Configure terminal I/O for an app.
 *
 * In pipe() composition, this captures the process streams and options
 * so that run() configures terminal I/O correctly.
 *
 * The plugin wraps `run()` to inject terminal options:
 * - stdin/stdout from the process object
 * - Protocol options (mouse, kitty, paste)
 * - Lifecycle handlers (suspend, resume, interrupt)
 *
 * @param proc - Process object with stdin/stdout (typically `process`)
 * @param options - Terminal configuration
 * @returns Plugin function that binds terminal config to the app
 */
export function withTerminal<T extends RunnableApp>(
  proc: ProcessLike,
  options: WithTerminalOptions = {},
): (app: T) => T & AppWithTerminal {
  const termConfig = {
    mouse: options.mouse ?? true,
    kitty: options.kitty ?? true,
    paste: options.paste ?? true,
    alternateScreen: options.alternateScreen ?? true,
    suspendOnCtrlZ: options.suspendOnCtrlZ ?? true,
    exitOnCtrlC: options.exitOnCtrlC ?? true,
    ...options,
    proc,
  }

  return (app: T): T & AppWithTerminal => {
    const originalRun = app.run

    // Create capability registry and clipboard capability
    // If the app already has a registry (e.g., from a previous plugin), reuse it
    const existingRegistry = (app as any).capabilityRegistry as CapabilityRegistry | undefined
    const registry = existingRegistry ?? createCapabilityRegistry()

    // Create OSC 52 clipboard using stdout.write
    const clipboard = createOSC52Clipboard((data: string) => {
      proc.stdout.write(data)
    })
    registry.register(CLIPBOARD_CAPABILITY, clipboard)

    return Object.assign(Object.create(app), {
      terminalOptions: termConfig,
      capabilityRegistry: registry,
      clipboardCapability: clipboard,
      run(...args: unknown[]) {
        // Inject terminal options into the run call
        // The first arg after element is typically options
        const runOptions: Record<string, unknown> = {}

        // Find or create options argument
        let existingOptions: Record<string, unknown> | undefined
        if (args.length > 0 && typeof args[args.length - 1] === "object" && args[args.length - 1] !== null) {
          existingOptions = args[args.length - 1] as Record<string, unknown>
          // Don't treat React elements as options
          if ("type" in existingOptions && "props" in existingOptions) {
            existingOptions = undefined
          }
        }

        // Merge terminal options
        Object.assign(runOptions, existingOptions ?? {}, {
          stdin: proc.stdin,
          stdout: proc.stdout,
          mouse: termConfig.mouse,
          kitty: termConfig.kitty,
          alternateScreen: termConfig.alternateScreen,
          suspendOnCtrlZ: termConfig.suspendOnCtrlZ,
          exitOnCtrlC: termConfig.exitOnCtrlC,
          textSizing: termConfig.textSizing,
          focusReporting: termConfig.focusReporting,
          onSuspend: termConfig.onSuspend,
          onResume: termConfig.onResume,
          onInterrupt: termConfig.onInterrupt,
          capabilityRegistry: registry,
        })

        // Replace options in args
        if (existingOptions) {
          const newArgs = [...args]
          newArgs[newArgs.length - 1] = runOptions
          return originalRun.apply(app, newArgs)
        }
        return originalRun.call(app, ...args, runOptions)
      },
    }) as T & AppWithTerminal
  }
}
