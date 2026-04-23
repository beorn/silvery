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

import process from "node:process"
import { createLogger } from "loggily"
import { type Term, createTerm } from "@silvery/ag-term/ansi"
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react"

const log = createLogger("silvery:render")
import {
  ChainAppContext,
  FocusManagerContext,
  RuntimeContext,
  type RuntimeContextValue,
  StdoutContext,
  StderrContext,
  TermContext,
} from "./context"
import { createChildApp, toChainAppContextValue } from "./chain-bridge"
import { createCursorStore, CursorProvider, type CursorStore } from "./hooks/useCursor"
import { createFocusManager } from "@silvery/ag/focus-manager"
import { parseKey } from "@silvery/ag/keys"
import { type LayoutEngineType, isLayoutEngineInitialized } from "@silvery/ag-term/layout-engine"
import {
  enableBracketedPaste,
  disableBracketedPaste,
  parseBracketedPaste,
} from "@silvery/ag-term/bracketed-paste"
import {
  ANSI,
  enterAlternateScreen,
  leaveAlternateScreen,
  enableKittyKeyboard,
  disableKittyKeyboard,
  resetWindowTitle,
} from "@silvery/ag-term/output"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
  runWithDiscreteEvent,
  setOnNodeRemoved,
} from "./reconciler"
import { renderStringSync } from "./render-string"
import { RenderScheduler } from "@silvery/ag-term/scheduler"
import { createOutput, type Output } from "@silvery/ag-term/runtime/devices/output"
import {
  type ResolvedTermDef,
  type TermDef,
  isTerm,
  isTermDef,
  resolveFromTerm,
  resolveTermDef,
} from "@silvery/ag-term/term-def"
import { splitRawInput } from "@silvery/ag/keys"

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
   * Layout engine to use (default: 'flexily', or SILVERY_ENGINE env var)
   * - 'flexily': Pure JS, synchronous, smaller bundle
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
 * @param engineType - 'flexily' or 'yoga'. Falls back to SILVERY_ENGINE env, then 'flexily'.
 */
async function ensureLayoutEngineInitialized(engineType?: LayoutEngineType): Promise<void> {
  if (isLayoutEngineInitialized()) {
    log.debug?.("Layout engine already initialized")
    return
  }

  log.debug?.(`Initializing layout engine (${engineType ?? "default"})...`)
  const startTime = Date.now()

  const { ensureDefaultLayoutEngine } = await import("@silvery/ag-term/layout-engine")
  await ensureDefaultLayoutEngine(engineType)

  log.debug?.(`Layout engine initialized in ${Date.now() - startTime}ms`)
}

// ============================================================================
// Internal App Component
// ============================================================================

// ============================================================================
// ============================================================================
// App Props — callback-based, no Node.js types in the callback interface
// ============================================================================

interface AppProps {
  children: ReactNode
  /** Subscribe to raw input chunks. Returns cleanup. Called by setRawMode. */
  onInputSubscribe?: (handler: (chunk: string) => void) => () => void
  /** Whether Ctrl+C should exit the app */
  exitOnCtrlC: boolean
  /** Write function for stdout context */
  stdoutWrite: (data: string) => void
  /** The raw stdout stream (for StdoutContext.stdout) — still NodeJS.WriteStream for now */
  stdout: NodeJS.WriteStream
  onExit: (error?: Error) => void
  onPause?: () => void
  onResume?: () => void
  onScrollback?: (lines: number) => void
  /** Get the root AgNode for focus navigation. Provided by SilveryInstance. */
  getRoot?: () => import("@silvery/create/types").AgNode | null
  /** Handle Tab/Shift+Tab/Escape focus cycling (default: true) */
  handleFocusCycling?: boolean
}

/**
 * Internal App component that provides all contexts.
 * This is a functional component that manages focus state and provides
 * all the context values needed by hooks.
 *
 * Input is callback-driven — no EventEmitter, no stdin/stdout dependency.
 * The caller (SilveryInstance for Node.js, renderToXterm for browser)
 * provides `onInputSubscribe` which connects the input source.
 */
function SilveryApp({
  children,
  onInputSubscribe,
  exitOnCtrlC,
  stdoutWrite,
  stdout,
  onExit,
  onPause,
  onResume,
  onScrollback,
  getRoot: getRootProp,
  handleFocusCycling = true,
}: AppProps): ReactElement {
  // Child apply-chain BaseApp — the ChainAppContext surface for hooks
  // inside this render tree. Built once per instance, mirrors the
  // plumbing in `create-app.tsx` (TEA Phase 2). Hooks subscribe via
  // ChainAppContext only — RuntimeContext is trimmed to {exit}.
  const childAppRef = useRef<ReturnType<typeof createChildApp> | null>(null)
  if (!childAppRef.current) childAppRef.current = createChildApp()
  const childApp = childAppRef.current

  // Exit handler
  const handleExit = useCallback(
    (error?: Error) => {
      onExit(error)
    },
    [onExit],
  )

  // Mutable refs for values accessed inside the input handler.
  // Using refs prevents handler identity from ever changing, which
  // would cascade through subscription effects, dropping keypresses during the gap.

  const exitOnCtrlCRef = useRef(exitOnCtrlC)
  exitOnCtrlCRef.current = exitOnCtrlC

  const handleExitRef = useRef(handleExit)
  handleExitRef.current = handleExit

  // Refs for focus manager and root getter — accessed inside input handler
  const focusManagerRef = useRef<import("@silvery/ag/focus-manager").FocusManager | null>(null)
  const getRootRef = useRef(getRootProp)
  getRootRef.current = getRootProp
  const handleFocusCyclingRef = useRef(handleFocusCycling)
  handleFocusCyclingRef.current = handleFocusCycling

  // Stable input chunk handler — created once, never changes identity.
  // All mutable state is read via refs to avoid dependency cascade.
  const handleChunkRef = useRef<((chunk: string) => void) | null>(null)
  if (handleChunkRef.current === null) {
    handleChunkRef.current = (rawChunk: string) => {
      log.debug?.(`handleChunk: ${JSON.stringify(rawChunk)}`)

      // Check for bracketed paste before splitting into individual keys.
      const pasteResult = parseBracketedPaste(rawChunk)
      if (pasteResult) {
        // Dispatch to the child chain — the canonical subscription
        // surface for hooks via ChainAppContext. The legacy
        // `rt.on("paste", …)` subscriber list is gone (RuntimeContext
        // trimmed to {exit} only).
        childApp.dispatch({ type: "term:paste", text: pasteResult.content })
        childApp.drainEffects()
        return
      }

      // Split multi-character chunks into individual keypresses.
      // Raw input sources can deliver multiple characters in a single chunk
      // (rapid typing, paste, or auto-repeat during heavy renders).
      for (const keypress of splitRawInput(rawChunk)) {
        processSingleKey(keypress)
      }
    }

    function processSingleKey(chunk: string) {
      log.debug?.(`processSingleKey: ${JSON.stringify(chunk)}`)
      // Handle Ctrl+C
      if (chunk === "\x03" && exitOnCtrlCRef.current) {
        handleExitRef.current()
        return
      }

      // Default Tab/Shift+Tab focus cycling and Escape blur.
      // Handled before dispatching to useInput handlers so it works
      // automatically when focusable components exist. Tab events are
      // consumed (not passed to useInput) — matching run() and createApp().
      if (handleFocusCyclingRef.current) {
        const fm = focusManagerRef.current
        const root = getRootRef.current?.()
        if (fm && root) {
          const [, key] = parseKey(chunk)
          if (key.tab && !key.shift) {
            fm.focusNext(root)
            reconciler.flushSyncWork()
            return
          }
          if (key.tab && key.shift) {
            fm.focusPrev(root)
            reconciler.flushSyncWork()
            return
          }
          if (key.escape && fm.activeElement) {
            fm.blur()
            reconciler.flushSyncWork()
            return
          }
        }
      }

      // Parse the key and dispatch to the child chain.
      const [input, key] = parseKey(chunk)

      // All input handling runs at discrete priority so React commits
      // synchronously. Without this, concurrent mode defers the commit
      // and onCommit → scheduleRender() never fires.
      runWithDiscreteEvent(() => {
        // Fire raw-key observers first (useModifierKeys, etc.) so modifier
        // state is up-to-date before the filtered input handlers run.
        childApp.rawKeys.notify(input, key)
        // Dispatch into the child apply chain — this reaches `useInput`
        // consumers via `chain.input.register`. Effects (render/exit)
        // are drained and discarded; render.tsx owns its own commit
        // lifecycle below.
        childApp.dispatch({ type: "input:key", input, key })
        childApp.drainEffects()
      })
      reconciler.flushSyncWork()
    }
  }
  const handleChunk = handleChunkRef.current

  // Subscribe to input source when available
  useEffect(() => {
    if (!onInputSubscribe) return
    return onInputSubscribe(handleChunk)
  }, [onInputSubscribe, handleChunk])

  const stdoutContextValue = useMemo(
    () => ({
      stdout,
      write: stdoutWrite,
      notifyScrollback: onScrollback,
    }),
    [stdout, stdoutWrite, onScrollback],
  )

  // RuntimeContext — trimmed to lifecycle controls (exit + optional
  // pause/resume for console suspension). Input / paste / focus flow
  // through ChainAppContext.
  const runtimeContextValue = useMemo<RuntimeContextValue>(
    () => ({
      exit: handleExit,
      pause: onPause,
      resume: onResume,
    }),
    [handleExit, onPause, onResume],
  )

  // ChainAppContext — canonical subscription surface for ag-react hooks.
  const chainAppContextValue = useMemo(() => toChainAppContextValue(childApp), [childApp])

  // Focus manager (tree-based focus system)
  const focusManager = useMemo(() => createFocusManager(), [])
  // Store in ref so the stable input handler closure can access it
  focusManagerRef.current = focusManager

  // Wire up focus cleanup on node removal
  useEffect(() => {
    setOnNodeRemoved((removedNode) => focusManager.handleSubtreeRemoved(removedNode))
    return () => setOnNodeRemoved(null)
  }, [focusManager])

  return (
    <StdoutContext.Provider value={stdoutContextValue}>
      <StderrContext.Provider
        value={{
          stderr: process.stderr,
          write: (data: string) => {
            process.stderr.write(data)
          },
        }}
      >
        <FocusManagerContext.Provider value={focusManager}>
          <RuntimeContext.Provider value={runtimeContextValue}>
            <ChainAppContext.Provider value={chainAppContextValue}>
              {children}
            </ChainAppContext.Provider>
          </RuntimeContext.Provider>
        </FocusManagerContext.Provider>
      </StderrContext.Provider>
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
  private output: Output | null = null

  constructor(options: Required<Omit<RenderOptions, "layoutEngine">>) {
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

    // Activate output owner after protocol setup so that terminal escape
    // sequences (alt screen, kitty keyboard, etc.) go through raw stdout.
    // The owner intercepts process.stdout/stderr writes so only silvery's
    // render pipeline can write to stdout — all other writes are suppressed
    // (stdout) or redirected to DEBUG_LOG (stderr).
    // Only activate when writing to the real process.stdout — mock streams
    // in tests don't need guarding and intercepting process.stdout would
    // break the test infrastructure.
    if (this.alternateScreen && this.stdout === process.stdout) {
      this.output = createOutput()
      this.output.activate()
    }

    // Set up container
    this.container = createContainer(() => {
      this.scheduler?.scheduleRender()
    })

    // Create the React fiber root
    this.fiberRoot = createFiberRoot(this.container)

    // Set up scheduler — route render output through the owner when active
    this.scheduler = new RenderScheduler({
      stdout: this.stdout,
      root: getContainerRoot(this.container),
      debug: this.debug,
      mode: this.mode,
      nonTTYMode: this.nonTTYMode,
      cursorAccessors: this.cursorStore.accessors,
      writeOutput: this.output ? (data: string) => this.output!.write(data) : undefined,
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
          onInputSubscribe={this.subscribeToInput}
          exitOnCtrlC={this.exitOnCtrlC}
          stdoutWrite={(data: string) => {
            if (this.output) {
              this.output.write(data)
            } else {
              this.stdout.write(data)
            }
          }}
          stdout={this.stdout}
          onExit={this.handleExit}
          onPause={this.pause}
          onResume={this.resume}
          onScrollback={this.handleScrollback}
          getRoot={() => (this.container ? getContainerRoot(this.container) : null)}
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
    log.debug?.(
      `SilveryInstance.render() updateContainerSync complete in ${Date.now() - startTime}ms`,
    )

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

    // Dispose output owner BEFORE terminal protocol cleanup — restores original
    // stdout/stderr write methods so the cleanup sequences go through unimpeded.
    if (this.output) {
      this.output.dispose()
      this.output = null
    }

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

  /**
   * Subscribe to stdin input. Sets up raw mode and readable listener.
   * Returns cleanup function that tears down raw mode.
   *
   * This is the Node.js-specific input adapter — it bridges stdin
   * into the platform-agnostic callback that SilveryApp expects.
   */
  private subscribeToInput = (handler: (chunk: string) => void): (() => void) => {
    const { stdin } = this
    const isRawModeSupported = stdin.isTTY === true

    log.debug?.(
      `subscribeToInput: stdin=${stdin === process.stdin ? "process.stdin" : "other"}, isTTY=${stdin.isTTY}, isRawModeSupported=${isRawModeSupported}`,
    )

    if (!isRawModeSupported) {
      log.debug?.("subscribeToInput: raw mode not supported, skipping")
      return () => {}
    }

    // Set up readable handler that reads chunks and passes to handler
    const handleReadable = () => {
      let chunk: string | null
      while ((chunk = stdin.read() as string | null) !== null) {
        log.debug?.(`subscribeToInput: stdin.read() returned: ${JSON.stringify(chunk)}`)
        handler(chunk)
      }
    }

    stdin.setEncoding("utf8")
    stdin.ref()
    stdin.setRawMode(true)
    stdin.on("readable", handleReadable)
    log.debug?.(`subscribeToInput: enabled raw mode, stdin.isRaw=${stdin.isRaw}`)

    return () => {
      log.debug?.("subscribeToInput: cleanup — disabling raw mode")
      stdin.setRawMode(false)
      stdin.off("readable", handleReadable)
      stdin.unref()
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
 * import { render, Box, Text, createTerm } from '@silvery/ag-react';
 *
 * using term = createTerm();
 * const { waitUntilExit } = await render(<App />, term);
 * await waitUntilExit();
 * ```
 *
 * @example Static rendering (no terminal needed)
 * ```tsx
 * import { render, Box, Text } from '@silvery/ag-react';
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
 * import { render, Box, Text } from '@silvery/ag-react';
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
export function render(
  element: ReactElement,
  termOrDef?: Term | TermDef,
  options?: RenderOptions,
): RenderHandle {
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
    term = createTerm({ colorLevel: resolved.colors ?? undefined })
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
      colorLevel: resolved.colors ?? undefined,
    })
  } else {
    throw new Error("Invalid second argument: expected Term, TermDef, or undefined")
  }

  // Merge options. `resolved.stdout/stdin` come from `resolveFromTerm` (which
  // reads them from the Term) or `resolveTermDef` (which takes them from the
  // TermDef); the final `process.stdout/stdin` fallbacks apply only to the
  // no-termOrDef path where nothing else supplied streams. Phase 8a: the
  // raw-stream fields on Term are slated for removal
  // (km-silvery.term-sub-owners Phase 8b) — we no longer reach into them here.
  const mergedOptions: RenderOptions = {
    ...options,
    stdout: options?.stdout ?? resolved.stdout ?? process.stdout,
    stdin: options?.stdin ?? (resolved.isStatic ? undefined : process.stdin),
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
    const { autoConnectDevTools } = await import("@silvery/ag-term/devtools")
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
async function renderStaticImpl(
  element: ReactElement,
  term: Term,
  resolved: ResolvedTermDef,
): Promise<Instance> {
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
 * import { renderSync, Box, Text, initYogaEngine, setLayoutEngine, createTerm } from '@silvery/ag-react';
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
export function renderSync(
  element: ReactElement,
  termOrDef?: Term | TermDef,
  options?: RenderOptions,
): Instance {
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
    term = createTerm({ colorLevel: resolved.colors ?? undefined })
  } else if (isTerm(termOrDef)) {
    resolved = resolveFromTerm(termOrDef)
    term = termOrDef
  } else if (isTermDef(termOrDef)) {
    resolved = resolveTermDef(termOrDef)
    term = createTerm({
      stdout: termOrDef.stdout,
      stdin: termOrDef.stdin,
      colorLevel: resolved.colors ?? undefined,
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

  // Merge options for interactive mode. See `renderAsync` above for the
  // rationale behind `process.stdout/stdin` fallbacks instead of reaching
  // into the deprecated Term raw-stream fields (Phase 8a: pre-delete migration).
  const mergedOptions: RenderOptions = {
    ...options,
    stdout: options?.stdout ?? resolved.stdout ?? process.stdout,
    stdin: options?.stdin ?? process.stdin,
  }

  // alternateScreen defaults to true for fullscreen mode
  const mode = mergedOptions.mode ?? ("fullscreen" as RenderMode)
  const resolvedOptions = {
    stdout: mergedOptions.stdout ?? process.stdout,
    stdin: mergedOptions.stdin ?? process.stdin,
    exitOnCtrlC: mergedOptions.exitOnCtrlC ?? true,
    debug: mergedOptions.debug ?? false,
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
 * import { renderStatic, Box, Text } from '@silvery/ag-react';
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
export {
  setLayoutEngine,
  isLayoutEngineInitialized,
  type LayoutEngineType,
} from "@silvery/ag-term/layout-engine"

// Re-export adapters for custom engine initialization
export {
  createYogaEngine,
  initYogaEngine,
  YogaLayoutEngine,
} from "@silvery/ag-term/adapters/yoga-adapter"
export {
  createFlexilyZeroEngine as createFlexilyEngine,
  FlexilyZeroLayoutEngine as FlexilyLayoutEngine,
} from "@silvery/ag-term/adapters/flexily-zero-adapter"
