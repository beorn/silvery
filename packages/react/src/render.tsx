/**
 * Silvery Render Entry Point
 *
 * The main render() function that initializes Silvery and renders a React element
 * to the terminal. This wires together:
 * - Yoga (layout engine)
 * - React reconciler
 * - Context providers (RuntimeContext, Stdout)
 * - Render scheduler (batching and diffing)
 *
 * Compatible with Ink's render API.
 */

import { EventEmitter } from "node:events"
import process from "node:process"
import { createLogger } from "decant"
import { type Term, createTerm } from "@silvery/ansi"
import React, { useCallback, useEffect, useMemo, useRef, type ReactElement, type ReactNode } from "react"

const log = createLogger("silvery:render")
import { RuntimeContext, type RuntimeContextValue, StdoutContext, TermContext } from "./context"
import { createCursorStore, CursorProvider, type CursorStore } from "./hooks/useCursor"
import { parseKey } from "@silvery/tea/keys"
import { type LayoutEngineType, isLayoutEngineInitialized } from "@silvery/term/layout-engine"
import { enableBracketedPaste, disableBracketedPaste, parseBracketedPaste } from "@silvery/term/bracketed-paste"
import {
  ANSI,
  enterAlternateScreen,
  leaveAlternateScreen,
  enableKittyKeyboard,
  disableKittyKeyboard,
  resetWindowTitle,
} from "@silvery/term/output"
import { createContainer, createFiberRoot, getContainerRoot, reconciler, runWithDiscreteEvent } from "./reconciler"
import { renderStringSync } from "./render-string"
import { RenderScheduler } from "@silvery/term/scheduler"
import { type ResolvedTermDef, isTerm, isTermDef, resolveFromTerm, resolveTermDef } from "@silvery/term/term-def"
import type { TermDef } from "@silvery/tea/types"
import { splitRawInput } from "@silvery/tea/keys"

// ============================================================================
// Types
// ============================================================================

/**
 * Render mode for the terminal.
 */
export type RenderMode = "fullscreen" | "inline"

/**
 * Non-TTY mode for rendering in non-interactive environments.
 *
 * - 'auto': Auto-detect based on environment (default)
 * - 'tty': Force TTY mode with cursor positioning
 * - 'line-by-line': Output lines without cursor repositioning
 * - 'static': Single final output only (no intermediate updates)
 * - 'plain': Strip all ANSI escape codes
 */
export type NonTTYMode = "auto" | "tty" | "line-by-line" | "static" | "plain"

/**
 * Options for the render function.
 */
export interface RenderOptions {
  /** Standard output stream (default: process.stdout) */
  stdout?: NodeJS.WriteStream
  /** Standard input stream (default: process.stdin) */
  stdin?: NodeJS.ReadStream
  /** Exit when Ctrl+C is pressed (default: true) */
  exitOnCtrlC?: boolean
  /** Enable debug mode with verbose logging (default: false) */
  debug?: boolean
  /** Patch console methods to work with Silvery output (default: true) */
  patchConsole?: boolean
  /** Use alternate screen buffer (default: true for fullscreen mode, false for inline) */
  alternateScreen?: boolean
  /**
   * Render mode (default: 'fullscreen')
   * - 'fullscreen': Uses absolute cursor positioning and alternateScreen
   * - 'inline': Renders inline from current cursor position (for progress bars)
   */
  mode?: RenderMode
  /**
   * Non-TTY mode for non-interactive environments (default: 'auto')
   *
   * When running in a non-TTY environment (piped output, CI, TERM=dumb),
   * silvery will automatically detect this and use 'line-by-line' mode.
   * You can override this behavior by explicitly setting the mode.
   *
   * - 'auto': Detect based on environment (TTY -> 'tty', non-TTY -> 'line-by-line')
   * - 'tty': Force TTY mode with cursor positioning
   * - 'line-by-line': Simple newline-separated output, updates in place
   * - 'static': Only output final frame (no intermediate renders)
   * - 'plain': Strip all ANSI codes, output plain text
   */
  nonTTYMode?: NonTTYMode
  /**
   * Layout engine to use (default: 'flexture', or SILVERY_ENGINE env var)
   * - 'flexture': Pure JS, synchronous, smaller bundle
   * - 'yoga': Facebook's WASM-based flexbox (more mature)
   */
  layoutEngine?: LayoutEngineType
}

/**
 * The instance returned by render().
 */
export interface Instance {
  /** Re-render with a new element */
  rerender: (element: ReactNode) => void
  /** Unmount the component and clean up */
  unmount: () => void
  /** Dispose (alias for unmount) — enables `using` */
  [Symbol.dispose](): void
  /** Promise that resolves when the app exits */
  waitUntilExit: () => Promise<void>
  /** Clear the terminal output */
  clear: () => void
  /** Force an immediate render, bypassing scheduler batching */
  flush: () => void
  /** Pause rendering output (for screen switching). Input still works. */
  pause: () => void
  /** Resume rendering after pause. Forces a full redraw. */
  resume: () => void
}

/**
 * Handle returned by render() - thenable AND has fluent .run() method.
 *
 * Supports two usage patterns:
 * ```tsx
 * // Pattern 1: Get instance, then wait
 * const instance = await render(<App />, term)
 * await instance.waitUntilExit()
 *
 * // Pattern 2: Fluent - render and wait in one line
 * await render(<App />, term).run()
 * ```
 */
export class RenderHandle implements PromiseLike<Instance> {
  constructor(private readonly promise: Promise<Instance>) {}

  /** Make this thenable so `await render()` returns Instance */
  then<TResult1 = Instance, TResult2 = never>(
    onfulfilled?: ((value: Instance) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected)
  }

  /** Catch errors */
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<Instance | TResult> {
    return this.promise.catch(onrejected)
  }

  /** Finally handler */
  finally(onfinally?: (() => void) | null): Promise<Instance> {
    return this.promise.finally(onfinally)
  }

  /**
   * Render and wait until exit - fluent API for common case.
   *
   * @example
   * ```tsx
   * await render(<App />, term).run()
   * ```
   */
  async run(): Promise<void> {
    const instance = await this.promise
    await instance.waitUntilExit()
  }
}

// ============================================================================
// Global State
// ============================================================================

/** Map of stdout streams to instances (for reuse) */
const instances = new Map<NodeJS.WriteStream, SilveryInstance>()

// ============================================================================
// Layout Engine Initialization
// ============================================================================

/**
 * Initialize layout engine if not already initialized.
 * @param engineType - 'flexture' or 'yoga'. Falls back to SILVERY_ENGINE env, then 'flexture'.
 */
async function ensureLayoutEngineInitialized(engineType?: LayoutEngineType): Promise<void> {
  if (isLayoutEngineInitialized()) {
    log.debug?.("Layout engine already initialized")
    return
  }

  log.debug?.(`Initializing layout engine (${engineType ?? "default"})...`)
  const startTime = Date.now()

  const { ensureDefaultLayoutEngine } = await import("@silvery/term/layout-engine")
  await ensureDefaultLayoutEngine(engineType)

  log.debug?.(`Layout engine initialized in ${Date.now() - startTime}ms`)
}

// ============================================================================
// Internal App Component
// ============================================================================

interface AppProps {
  children: ReactNode
  stdin: NodeJS.ReadStream
  stdout: NodeJS.WriteStream
  exitOnCtrlC: boolean
  onExit: (error?: Error) => void
  onPause?: () => void
  onResume?: () => void
  onScrollback?: (lines: number) => void
}

/**
 * Internal App component that provides all contexts.
 * This is a functional component that manages focus state and provides
 * all the context values needed by hooks.
 */
function SilveryApp({
  children,
  stdin,
  stdout,
  exitOnCtrlC,
  onExit,
  onPause,
  onResume,
  onScrollback,
}: AppProps): ReactElement {
  // Raw mode reference count
  const rawModeCountRef = React.useRef(0)

  // Input event emitter
  const eventEmitter = useMemo(() => new EventEmitter(), [])

  // Exit handler
  const handleExit = useCallback(
    (error?: Error) => {
      onExit(error)
    },
    [onExit],
  )

  // Raw mode support check
  const isRawModeSupported = stdin.isTTY === true
  log.debug?.(
    `SilveryApp: stdin=${stdin === process.stdin ? "process.stdin" : "other"}, stdin.isTTY=${stdin.isTTY}, process.stdin.isTTY=${process.stdin.isTTY}, isRawModeSupported=${isRawModeSupported}`,
  )

  // Mutable refs for values accessed inside the stdin readable handler.
  // Using refs prevents handleReadable identity from ever changing, which
  // would cascade through setRawMode → stdinContext → useInput effects →
  // stdin listener removal/re-addition, dropping keypresses during the gap.

  const exitOnCtrlCRef = useRef(exitOnCtrlC)
  exitOnCtrlCRef.current = exitOnCtrlC

  const handleExitRef = useRef(handleExit)
  handleExitRef.current = handleExit

  // Stable stdin readable handler — created once, never changes identity.
  // All mutable state is read via refs to avoid dependency cascade.
  const handleReadableRef = useRef<(() => void) | null>(null)
  if (handleReadableRef.current === null) {
    handleReadableRef.current = () => {
      log.debug?.("handleReadable called")
      processInput()

      function processInput() {
        const chunk = stdin.read() as string | null
        log.debug?.(`stdin.read() returned: ${chunk === null ? "null" : JSON.stringify(chunk)}`)
        if (chunk === null) return

        // Check for bracketed paste before splitting into individual keys.
        const pasteResult = parseBracketedPaste(chunk)
        if (pasteResult) {
          // Emit paste as a single 'paste' event on the input emitter
          eventEmitter.emit("paste", pasteResult.content)
          processInput()
          return
        }

        // Split multi-character chunks into individual keypresses.
        // stdin.read() can return multiple characters buffered together
        // (rapid typing, paste, or auto-repeat during heavy renders).
        for (const keypress of splitRawInput(chunk)) {
          handleChunk(keypress)
        }
        processInput() // Process next chunk if available
      }

      function handleChunk(chunk: string) {
        log.debug?.(`handleChunk: ${JSON.stringify(chunk)}`)
        // Handle Ctrl+C
        if (chunk === "\x03" && exitOnCtrlCRef.current) {
          handleExitRef.current()
          return
        }

        // All input handling runs at discrete priority so React commits
        // synchronously. Without this, concurrent mode defers the commit
        // and onCommit → scheduleRender() never fires.
        runWithDiscreteEvent(() => {
          eventEmitter.emit("input", chunk)
        })
        reconciler.flushSyncWork()
      }
    }
  }
  const handleReadable = handleReadableRef.current

  // Set raw mode handler
  const setRawMode = useCallback(
    (enabled: boolean) => {
      log.debug?.(
        `setRawMode called: enabled=${enabled}, rawModeCount=${rawModeCountRef.current}, isRawModeSupported=${isRawModeSupported}`,
      )
      if (!isRawModeSupported) {
        if (stdin === process.stdin) {
          throw new Error(
            "Raw mode is not supported on the current process.stdin. " +
              "This usually happens when running without a TTY.",
          )
        }
        throw new Error("Raw mode is not supported on the provided stdin.")
      }

      stdin.setEncoding("utf8")

      if (enabled) {
        if (rawModeCountRef.current === 0) {
          log.debug?.("setRawMode: enabling raw mode, adding readable listener")
          stdin.ref()
          stdin.setRawMode(true)
          stdin.on("readable", handleReadable)
          log.debug?.(`setRawMode: stdin.isRaw=${stdin.isRaw}, listenerCount=${stdin.listenerCount("readable")}`)
        }
        rawModeCountRef.current++
        log.debug?.(`setRawMode: rawModeCount incremented to ${rawModeCountRef.current}`)
      } else {
        rawModeCountRef.current = Math.max(0, rawModeCountRef.current - 1)
        log.debug?.(`setRawMode: rawModeCount decremented to ${rawModeCountRef.current}`)
        if (rawModeCountRef.current === 0) {
          log.debug?.("setRawMode: disabling raw mode, removing readable listener")
          stdin.setRawMode(false)
          stdin.off("readable", handleReadable)
          stdin.unref()
        }
      }
    },
    [stdin, isRawModeSupported, handleReadable],
  )

  const stdoutContextValue = useMemo(
    () => ({
      stdout,
      write: (data: string) => stdout.write(data),
      notifyScrollback: onScrollback,
    }),
    [stdout, onScrollback],
  )

  // RuntimeContext — typed event bus bridging from the existing EventEmitter
  const runtimeContextValue = useMemo<RuntimeContextValue>(
    () => ({
      on(event, handler) {
        if (event === "input") {
          const wrapped = (data: string | Buffer) => {
            const [input, key] = parseKey(data)
            ;(handler as (input: string, key: import("@silvery/tea/keys").Key) => void)(input, key)
          }
          eventEmitter.on("input", wrapped)
          return () => {
            eventEmitter.removeListener("input", wrapped)
          }
        }
        if (event === "paste") {
          eventEmitter.on("paste", handler)
          return () => {
            eventEmitter.removeListener("paste", handler)
          }
        }
        return () => {} // Unknown event — no-op cleanup
      },
      emit() {
        // render() runtime doesn't support view → runtime events
      },
      exit: handleExit,
      pause: onPause,
      resume: onResume,
    }),
    [eventEmitter, handleExit, onPause, onResume],
  )

  // Auto-enable raw mode when stdin is a TTY so useInput receives events.
  // Without this, the event loop drains and the process exits immediately.
  useEffect(() => {
    if (!isRawModeSupported) return
    setRawMode(true)
    return () => setRawMode(false)
  }, [isRawModeSupported, setRawMode])

  return (
    <StdoutContext.Provider value={stdoutContextValue}>
      <RuntimeContext.Provider value={runtimeContextValue}>{children}</RuntimeContext.Provider>
    </StdoutContext.Provider>
  )
}

// ============================================================================
// Internal Instance Class
// ============================================================================

/**
 * Internal class that manages a single Silvery render instance.
 */
class SilveryInstance {
  private readonly stdout: NodeJS.WriteStream
  private readonly stdin: NodeJS.ReadStream
  private readonly exitOnCtrlC: boolean
  private readonly debug: boolean
  private readonly alternateScreen: boolean
  private readonly mode: RenderMode
  private readonly nonTTYMode: NonTTYMode

  private scheduler: RenderScheduler | null = null
  private cursorStore: CursorStore
  private container: ReturnType<typeof createContainer> | null = null
  private fiberRoot: any = null
  private lastElement: ReactNode = null
  private isUnmounted = false

  private exitPromise: Promise<void> | null = null
  private resolveExit: (() => void) | null = null
  private rejectExit: ((error: Error) => void) | null = null

  private resizeCleanup: (() => void) | null = null
  private signalCleanup: (() => void) | null = null

  constructor(options: Required<Omit<RenderOptions, "patchConsole" | "layoutEngine">>) {
    log.debug?.("SilveryInstance constructor start")
    const startTime = Date.now()

    this.stdout = options.stdout
    this.stdin = options.stdin
    this.exitOnCtrlC = options.exitOnCtrlC
    this.debug = options.debug
    this.alternateScreen = options.alternateScreen
    this.mode = options.mode
    this.nonTTYMode = options.nonTTYMode

    // Set up exit promise
    this.exitPromise = new Promise<void>((resolve, reject) => {
      this.resolveExit = resolve
      this.rejectExit = reject
    })

    // Enter alternate screen if requested
    if (this.alternateScreen) {
      this.stdout.write(enterAlternateScreen())
    }

    // Enable Kitty keyboard protocol for enhanced key reporting
    if (this.stdout.isTTY) {
      this.stdout.write(enableKittyKeyboard())
    }

    // Enable bracketed paste mode so pasted text is distinguishable from typing
    if (this.stdout.isTTY) {
      enableBracketedPaste(this.stdout)
    }

    // Per-instance cursor state (replaces module-level globals)
    this.cursorStore = createCursorStore()

    // Set up container
    this.container = createContainer(() => {
      this.scheduler?.scheduleRender()
    })

    // Create the React fiber root
    this.fiberRoot = createFiberRoot(this.container)

    // Set up scheduler
    this.scheduler = new RenderScheduler({
      stdout: this.stdout,
      root: getContainerRoot(this.container),
      debug: this.debug,
      mode: this.mode,
      nonTTYMode: this.nonTTYMode,
      cursorAccessors: this.cursorStore.accessors,
    })

    // Set up resize listener
    this.setupResizeListener()

    // Set up signal handlers
    this.setupSignalHandlers()

    log.debug?.(`SilveryInstance constructor complete in ${Date.now() - startTime}ms`)
  }

  /**
   * Render a React element.
   */
  render(element: ReactNode): void {
    log.debug?.("SilveryInstance.render() start")
    const startTime = Date.now()

    if (this.isUnmounted || !this.fiberRoot) return
    this.lastElement = element

    const tree = (
      <CursorProvider store={this.cursorStore}>
        <SilveryApp
          stdin={this.stdin}
          stdout={this.stdout}
          exitOnCtrlC={this.exitOnCtrlC}
          onExit={this.handleExit}
          onPause={this.pause}
          onResume={this.resume}
          onScrollback={this.handleScrollback}
        >
          {element}
        </SilveryApp>
      </CursorProvider>
    )

    // Use synchronous update to ensure React commits the work immediately
    // This is necessary because the async updateContainer doesn't flush work
    // in environments like Bun where the event loop may not be pumped
    log.debug?.("SilveryInstance.render() calling updateContainerSync")
    reconciler.updateContainerSync(tree, this.fiberRoot, null, null)
    log.debug?.(`SilveryInstance.render() updateContainerSync complete in ${Date.now() - startTime}ms`)

    log.debug?.("SilveryInstance.render() calling flushSyncWork")
    const flushStart = Date.now()
    reconciler.flushSyncWork()
    log.debug?.(
      `SilveryInstance.render() flushSyncWork complete in ${Date.now() - flushStart}ms (total: ${Date.now() - startTime}ms)`,
    )
  }

  /**
   * Rerender with a new element.
   */
  rerender = (element: ReactNode): void => {
    this.render(element)
  }

  /**
   * Force an immediate render, bypassing scheduler batching.
   * Re-renders the current element synchronously, then runs the pipeline.
   * Useful for streaming reporters that need incremental output after
   * external state changes (e.g., store updates via useSyncExternalStore).
   */
  flush = (): void => {
    if (this.isUnmounted || !this.lastElement) return
    // Re-render the current element synchronously. This forces React to
    // re-evaluate the tree, picking up any external store changes
    // (useSyncExternalStore) that were notified since the last render.
    this.render(this.lastElement)
    // Force the render pipeline to run immediately
    this.scheduler?.forceRender()
  };

  /**
   * Unmount the component.
   */
  [Symbol.dispose] = (): void => this.unmount()

  unmount = (): void => {
    if (this.isUnmounted) return
    this.isUnmounted = true

    // Final render
    this.scheduler?.forceRender()

    // Clean up resources
    this.resizeCleanup?.()
    this.signalCleanup?.()

    // Disable Kitty keyboard protocol and bracketed paste before leaving
    if (this.stdout.isTTY) {
      disableBracketedPaste(this.stdout)
      this.stdout.write(disableKittyKeyboard())
    }

    // Reset window title so the terminal reverts to its default
    if (this.stdout.isTTY) {
      resetWindowTitle(this.stdout)
    }

    // Leave alternate screen if we entered it (leaveAlternateScreen includes
    // SYNC_END as a safety belt). For inline mode, show cursor and move to
    // next line. Otherwise emit SYNC_END as a safety belt.
    if (this.alternateScreen) {
      this.stdout.write(leaveAlternateScreen())
    } else if (this.mode === "inline") {
      // Show cursor and move to line after content
      this.stdout.write(`${ANSI.SYNC_END}${ANSI.CURSOR_SHOW}\n`)
    } else {
      this.stdout.write(ANSI.SYNC_END)
    }

    // Destroy the stdin stream to stop its internal I/O watcher from pulling
    // data from fd 0. Without this, the stream's internal _read() continues
    // consuming bytes from the kernel buffer even after all JS-level listeners
    // are removed. A child process with inherited stdio would never see those
    // bytes — they're trapped in the parent's stream buffer.
    //
    // Note: destroy() on process.stdin does NOT close fd 0 — the kernel fd
    // remains open for child processes to inherit. It only tears down the
    // Node.js/Bun stream wrapper.
    const { stdin } = this
    stdin.removeAllListeners("readable")
    stdin.removeAllListeners("data")
    stdin.destroy()
    // Unref stdin so it doesn't keep the event loop alive after unmount.
    // Without this, the process hangs after exit() in inline mode.
    if (typeof stdin.unref === "function") stdin.unref()

    if (this.fiberRoot) {
      reconciler.updateContainer(null, this.fiberRoot, null, () => {})
    }

    // Dispose scheduler
    this.scheduler?.dispose()

    // Remove from instances
    instances.delete(this.stdout)

    // Resolve exit promise
    this.resolveExit?.()
  }

  /**
   * Wait for the app to exit.
   */
  waitUntilExit = (): Promise<void> => {
    return this.exitPromise ?? Promise.resolve()
  }

  /**
   * Clear the terminal output.
   */
  clear = (): void => {
    this.scheduler?.clear()
  }

  /**
   * Pause rendering output. Scheduled and forced renders become no-ops.
   * Input handling continues normally. Used for screen-switching.
   */
  pause = (): void => {
    this.scheduler?.pause()
  }

  /**
   * Resume rendering after pause. Forces a full redraw.
   */
  resume = (): void => {
    this.scheduler?.resume()
    // If nothing was pending, still force a full redraw
    this.scheduler?.forceRender()
  }

  /**
   * Handle exit.
   */
  private handleExit = (error?: Error): void => {
    if (this.isUnmounted) return

    if (error) {
      this.rejectExit?.(error)
    }

    this.unmount()
  }

  /**
   * Handle scrollback lines written to stdout by useScrollback.
   */
  private handleScrollback = (lines: number): void => {
    this.scheduler?.addScrollbackLines(lines)
  }

  /**
   * Set up resize listener.
   */
  private setupResizeListener(): void {
    const handleResize = () => {
      // Clear and force full redraw on resize
      this.scheduler?.clear()
      this.scheduler?.forceRender()
    }

    this.stdout.on("resize", handleResize)
    this.resizeCleanup = () => {
      this.stdout.off("resize", handleResize)
    }
  }

  /**
   * Set up signal handlers for graceful exit.
   */
  private setupSignalHandlers(): void {
    const handleSignal = () => {
      this.unmount()
    }

    process.on("SIGINT", handleSignal)
    process.on("SIGTERM", handleSignal)

    this.signalCleanup = () => {
      process.off("SIGINT", handleSignal)
      process.off("SIGTERM", handleSignal)
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Render a React element to the terminal.
 *
 * The second argument determines the render mode:
 * - **Term instance**: Interactive mode with full terminal capabilities
 * - **TermDef with events/stdin**: Interactive mode
 * - **TermDef without events**: Static mode (renders until stable, then returns)
 * - **Omitted**: Static mode with default dimensions (80x24)
 *
 * @example Interactive rendering with Term
 * ```tsx
 * import { render, Box, Text, createTerm } from '@silvery/react';
 *
 * using term = createTerm();
 * const { waitUntilExit } = await render(<App />, term);
 * await waitUntilExit();
 * ```
 *
 * @example Static rendering (no terminal needed)
 * ```tsx
 * import { render, Box, Text } from '@silvery/react';
 *
 * // Renders once, returns when stable
 * const { lastFrame } = await render(<Summary stats={stats} />);
 * console.log(lastFrame);
 *
 * // With custom dimensions
 * await render(<Report />, { width: 120, height: 40 });
 * ```
 *
 * @example Interactive with TermDef
 * ```tsx
 * import { render, Box, Text } from '@silvery/react';
 *
 * await render(<App />, {
 *   stdin: process.stdin,
 *   stdout: process.stdout,
 * });
 * ```
 *
 * @param element - React element to render
 * @param termOrDef - Term instance, TermDef config, or omitted for static mode
 * @param options - Additional render options (merged with TermDef if provided)
 * @returns RenderHandle - thenable for Instance, or use .run() for fluent API
 *
 * @example
 * ```tsx
 * // Get instance first
 * const instance = await render(<App />, term)
 * await instance.waitUntilExit()
 *
 * // Or use fluent .run()
 * await render(<App />, term).run()
 * ```
 */
export function render(element: ReactElement, termOrDef?: Term | TermDef, options?: RenderOptions): RenderHandle {
  return new RenderHandle(renderAsync(element, termOrDef, options))
}

/**
 * Internal async render implementation.
 */
async function renderAsync(
  element: ReactElement,
  termOrDef?: Term | TermDef,
  options?: RenderOptions,
): Promise<Instance> {
  // Resolve termOrDef to get configuration
  let resolved: ResolvedTermDef
  let term: Term

  if (!termOrDef) {
    // No term/def provided - static mode with defaults
    resolved = resolveTermDef({})
    term = createTerm({ color: resolved.colors ?? undefined })
  } else if (isTerm(termOrDef)) {
    // Full Term instance provided
    resolved = resolveFromTerm(termOrDef)
    term = termOrDef
  } else if (isTermDef(termOrDef)) {
    // TermDef provided
    resolved = resolveTermDef(termOrDef)
    term = createTerm({
      stdout: termOrDef.stdout,
      stdin: termOrDef.stdin,
      color: resolved.colors ?? undefined,
    })
  } else {
    throw new Error("Invalid second argument: expected Term, TermDef, or undefined")
  }

  // Merge options
  const mergedOptions: RenderOptions = {
    ...options,
    stdout: options?.stdout ?? resolved.stdout ?? term.stdout,
    stdin: options?.stdin ?? (resolved.isStatic ? undefined : term.stdin),
  }

  return renderImpl(element, mergedOptions, term, resolved)
}

/**
 * Internal render implementation.
 */
async function renderImpl(
  element: ReactElement,
  options: RenderOptions,
  term: Term,
  resolved: ResolvedTermDef,
): Promise<Instance> {
  log.debug?.(`render() called, isStatic=${resolved.isStatic}`)
  const renderStart = Date.now()

  // Ensure layout engine is initialized
  await ensureLayoutEngineInitialized(options.layoutEngine)
  log.debug?.(`render(): layout engine ready in ${Date.now() - renderStart}ms`)

  // Auto-connect to React DevTools if DEBUG_DEVTOOLS=1
  if (process.env.DEBUG_DEVTOOLS) {
    const { autoConnectDevTools } = await import("@silvery/term/devtools")
    await autoConnectDevTools()
  }

  // For static mode, use renderString-style rendering
  if (resolved.isStatic) {
    return renderStaticImpl(element, term, resolved)
  }

  // Merge with defaults for interactive mode
  // alternateScreen defaults to true for fullscreen mode (clean slate, restore on exit)
  const mode = options.mode ?? ("fullscreen" as RenderMode)
  const resolvedOptions = {
    stdout: options.stdout ?? process.stdout,
    stdin: options.stdin ?? process.stdin,
    exitOnCtrlC: options.exitOnCtrlC ?? true,
    debug: options.debug ?? false,
    patchConsole: options.patchConsole ?? true,
    alternateScreen: options.alternateScreen ?? mode === "fullscreen",
    mode,
    nonTTYMode: options.nonTTYMode ?? ("auto" as NonTTYMode),
  }

  // Get or create instance for this stdout
  let instance = instances.get(resolvedOptions.stdout)
  if (!instance) {
    log.debug?.("render(): creating new SilveryInstance")
    instance = new SilveryInstance(resolvedOptions)
    instances.set(resolvedOptions.stdout, instance)
    log.debug?.(`render(): SilveryInstance created in ${Date.now() - renderStart}ms`)
  }

  // Wrap element with TermContext
  const wrappedElement = <TermContext.Provider value={term}>{element}</TermContext.Provider>

  // Render the element
  log.debug?.("render(): calling instance.render()")
  instance.render(wrappedElement)
  log.debug?.(`render(): instance.render() complete, total: ${Date.now() - renderStart}ms`)

  // Wrap rerender to also include contexts
  const rerender = (newElement: ReactNode) =>
    instance.rerender(<TermContext.Provider value={term}>{newElement}</TermContext.Provider>)

  return {
    rerender,
    unmount: instance.unmount,
    [Symbol.dispose]: instance.unmount,
    waitUntilExit: instance.waitUntilExit,
    clear: instance.clear,
    flush: instance.flush,
    pause: instance.pause,
    resume: instance.resume,
  }
}

/**
 * Render in static mode (no events, render until stable).
 * Internal implementation for render() when no events are present.
 */
async function renderStaticImpl(element: ReactElement, term: Term, resolved: ResolvedTermDef): Promise<Instance> {
  log.debug?.(`renderStatic() called, dimensions: ${resolved.width}x${resolved.height}`)

  // Import renderString functionality
  const { renderStringSync } = await import("./render-string.js")

  // Wrap element with contexts for static rendering
  const wrappedElement = <TermContext.Provider value={term}>{element}</TermContext.Provider>

  // Render to string
  const output = renderStringSync(wrappedElement, {
    width: resolved.width,
    height: resolved.height,
    plain: resolved.colors === null,
  })

  // Write output if we have a stdout
  if (resolved.stdout) {
    resolved.stdout.write(output)
    resolved.stdout.write("\n")
  }

  // Return a minimal Instance for static mode
  let lastFrame = output
  return {
    rerender: (newElement: ReactNode) => {
      const newWrapped = <TermContext.Provider value={term}>{newElement}</TermContext.Provider>
      lastFrame = renderStringSync(newWrapped as ReactElement, {
        width: resolved.width,
        height: resolved.height,
        plain: resolved.colors === null,
      })
      if (resolved.stdout) {
        resolved.stdout.write(lastFrame)
        resolved.stdout.write("\n")
      }
    },
    unmount: () => {},
    [Symbol.dispose]() {},
    waitUntilExit: () => Promise.resolve(),
    clear: () => {},
    pause: () => {},
    resume: () => {},
    // Extra property for accessing last rendered frame
    get lastFrame() {
      return lastFrame
    },
  } as Instance & { lastFrame: string }
}

/**
 * Synchronous render function for use when layout engine is already initialized.
 *
 * @example
 * ```tsx
 * import { renderSync, Box, Text, initYogaEngine, setLayoutEngine, createTerm } from '@silvery/react';
 *
 * const engine = await initYogaEngine();
 * setLayoutEngine(engine);
 * using term = createTerm();
 * renderSync(<App />, term);
 * ```
 *
 * @param element - React element to render
 * @param termOrDef - Term instance or TermDef config
 * @param options - Additional render options
 * @returns An Instance object with control methods
 */
export function renderSync(element: ReactElement, termOrDef?: Term | TermDef, options?: RenderOptions): Instance {
  if (!isLayoutEngineInitialized()) {
    throw new Error(
      "Layout engine is not initialized. Call render() (async) first, or initialize manually with setLayoutEngine().",
    )
  }

  // Resolve termOrDef
  let resolved: ResolvedTermDef
  let term: Term

  if (!termOrDef) {
    resolved = resolveTermDef({})
    term = createTerm({ color: resolved.colors ?? undefined })
  } else if (isTerm(termOrDef)) {
    resolved = resolveFromTerm(termOrDef)
    term = termOrDef
  } else if (isTermDef(termOrDef)) {
    resolved = resolveTermDef(termOrDef)
    term = createTerm({
      stdout: termOrDef.stdout,
      stdin: termOrDef.stdin,
      color: resolved.colors ?? undefined,
    })
  } else {
    throw new Error("Invalid second argument: expected Term, TermDef, or undefined")
  }

  // For static mode, use sync string rendering
  if (resolved.isStatic) {
    const wrappedElement = <TermContext.Provider value={term}>{element}</TermContext.Provider>
    const lastFrame = renderStringSync(wrappedElement, {
      width: resolved.width,
      height: resolved.height,
      plain: resolved.colors === null,
    })
    if (resolved.stdout) {
      resolved.stdout.write(lastFrame)
      resolved.stdout.write("\n")
    }
    return {
      rerender: () => {},
      unmount: () => {},
      [Symbol.dispose]() {},
      waitUntilExit: () => Promise.resolve(),
      clear: () => {},
      flush: () => {},
      pause: () => {},
      resume: () => {},
    }
  }

  // Merge options for interactive mode
  const mergedOptions: RenderOptions = {
    ...options,
    stdout: options?.stdout ?? resolved.stdout ?? term.stdout,
    stdin: options?.stdin ?? term.stdin,
  }

  // alternateScreen defaults to true for fullscreen mode
  const mode = mergedOptions.mode ?? ("fullscreen" as RenderMode)
  const resolvedOptions = {
    stdout: mergedOptions.stdout ?? process.stdout,
    stdin: mergedOptions.stdin ?? process.stdin,
    exitOnCtrlC: mergedOptions.exitOnCtrlC ?? true,
    debug: mergedOptions.debug ?? false,
    patchConsole: mergedOptions.patchConsole ?? true,
    alternateScreen: mergedOptions.alternateScreen ?? mode === "fullscreen",
    mode,
    nonTTYMode: mergedOptions.nonTTYMode ?? ("auto" as NonTTYMode),
  }

  // Get or create instance for this stdout
  let instance = instances.get(resolvedOptions.stdout)
  if (!instance) {
    instance = new SilveryInstance(resolvedOptions)
    instances.set(resolvedOptions.stdout, instance)
  }

  // Wrap element with contexts
  const wrappedElement = <TermContext.Provider value={term}>{element}</TermContext.Provider>

  // Render the element
  instance.render(wrappedElement)

  // Wrap rerender to also include contexts
  const rerender = (newElement: ReactNode) =>
    instance!.rerender(<TermContext.Provider value={term}>{newElement}</TermContext.Provider>)

  return {
    rerender,
    unmount: instance.unmount,
    [Symbol.dispose]: instance.unmount,
    waitUntilExit: instance.waitUntilExit,
    clear: instance.clear,
    flush: instance.flush,
    pause: instance.pause,
    resume: instance.resume,
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Static render - convenience function for one-shot renders.
 *
 * This is equivalent to `render(element)` without a Term - it renders
 * once and returns immediately without starting an event loop.
 *
 * @example
 * ```tsx
 * import { renderStatic, Box, Text } from '@silvery/react';
 *
 * // Render a summary to stdout
 * await renderStatic(<Summary stats={stats} />);
 *
 * // With options
 * await renderStatic(<Report />, { width: 120 });
 * ```
 *
 * @param element - React element to render
 * @param options - Optional width, height, and other static render options
 * @returns Promise that resolves when rendering is complete
 */
export async function renderStatic(
  element: ReactElement,
  options?: {
    width?: number
    height?: number
    plain?: boolean
    layoutEngine?: LayoutEngineType
  },
): Promise<string> {
  await ensureLayoutEngineInitialized(options?.layoutEngine)
  const { renderStringSync } = await import("./render-string.js")
  return renderStringSync(element, options)
}

// Re-export layout engine management for convenience
export { setLayoutEngine, isLayoutEngineInitialized, type LayoutEngineType } from "@silvery/term/layout-engine"

// Re-export adapters for custom engine initialization
export { createYogaEngine, initYogaEngine, YogaLayoutEngine } from "@silvery/term/adapters/yoga-adapter"
export {
  createFlextureZeroEngine as createFlextureEngine,
  FlextureZeroLayoutEngine as FlextureLayoutEngine,
} from "@silvery/term/adapters/flexture-zero-adapter"
