/**
 * createApp() - Layer 3 entry point for silvery-loop
 *
 * Provides Zustand store integration with unified providers.
 * Providers are stores (getState/subscribe) + event sources (events()).
 *
 * @example
 * ```tsx
 * import { createApp, useApp, createTermProvider } from '@silvery/term/runtime'
 *
 * const app = createApp(
 *   // Store factory
 *   ({ term }) => (set, get) => ({
 *     count: 0,
 *     increment: () => set(s => ({ count: s.count + 1 })),
 *   }),
 *   // Event handlers - namespaced as 'provider:event'
 *   {
 *     'term:key': ({ input, key }, { set }) => {
 *       if (input === 'j') set(s => ({ count: s.count + 1 }))
 *       if (input === 'q') return 'exit'
 *     },
 *     'term:resize': ({ cols, rows }, { set }) => {
 *       // handle resize
 *     },
 *   }
 * )
 *
 * function Counter() {
 *   const count = useApp(s => s.count)
 *   return <Text>Count: {count}</Text>
 * }
 *
 * const term = createTermProvider(process.stdin, process.stdout)
 * await app.run(<Counter />, { term })
 *
 * // Frame iteration:
 * for await (const frame of app.run(<Counter />, { term })) {
 *   expect(frame.text).toContain('Count:')
 * }
 * ```
 */

import process from "node:process"
import React, { createContext, useContext, useEffect, useRef, type ReactElement } from "react"
import { type StateCreator, type StoreApi, createStore } from "zustand"

import { createTerm } from "../ansi/index"
import {
  FocusManagerContext,
  RuntimeContext,
  type RuntimeContextValue,
  StdoutContext,
  TermContext,
} from "@silvery/react/context"
import { SilveryErrorBoundary } from "@silvery/react/error-boundary"
import { createFocusManager } from "@silvery/tea/focus-manager"
import { createCursorStore, CursorProvider } from "@silvery/react/hooks/useCursor"
import { createFocusEvent, dispatchFocusEvent } from "@silvery/tea/focus-events"
import { executeRender } from "../pipeline"
import { createPipeline } from "../measurer"
import { isTextSizingLikelySupported } from "../text-sizing"
import { IncrementalRenderMismatchError } from "../scheduler"
import { createContainer, createFiberRoot, getContainerRoot, reconciler } from "@silvery/react/reconciler"
import { map, merge, takeUntil } from "@silvery/tea/streams"
import { createBuffer } from "./create-buffer"
import { createRuntime } from "./create-runtime"
import {
  createHandlerContext,
  dispatchKeyToHandlers,
  handleFocusNavigation,
  invokeEventHandler,
  type NamespacedEvent,
} from "./event-handlers"
import { keyToAnsi, keyToKittyAnsi } from "@silvery/tea/keys"
import { parseKey, type Key } from "./keys"
import { ensureLayoutEngine } from "./layout"
import { createMouseEventProcessor } from "../mouse-events"
import { enableKittyKeyboard, disableKittyKeyboard, KittyFlags, enableMouse, disableMouse } from "../output"
import { enableFocusReporting, disableFocusReporting } from "../focus-reporting"
import { detectKittyFromStdio } from "../kitty-detect"
import { captureTerminalState, performSuspend } from "./terminal-lifecycle"
import { type TermProvider, createTermProvider } from "./term-provider"
import type { Buffer, Dims, Provider, RenderTarget } from "./types"

// ============================================================================
// Types
// ============================================================================

/**
 * Check if value is a Provider with events (full interface).
 */
function isFullProvider(value: unknown): value is Provider<unknown, Record<string, unknown>> {
  return (
    value !== null &&
    typeof value === "object" &&
    "getState" in value &&
    "subscribe" in value &&
    "events" in value &&
    typeof (value as Provider).getState === "function" &&
    typeof (value as Provider).subscribe === "function" &&
    typeof (value as Provider).events === "function"
  )
}

/**
 * Check if value is a basic Provider (just getState/subscribe, Zustand-compatible).
 */
function isBasicProvider(value: unknown): value is {
  getState(): unknown
  subscribe(l: (s: unknown) => void): () => void
} {
  return (
    value !== null &&
    typeof value === "object" &&
    "getState" in value &&
    "subscribe" in value &&
    typeof (value as { getState: unknown }).getState === "function" &&
    typeof (value as { subscribe: unknown }).subscribe === "function"
  )
}

/**
 * Event handler context passed to handlers.
 *
 * When the store uses `tea()` middleware, `dispatch` is available with the
 * correct Op type inferred from the store. For non-tea stores it's `undefined`.
 */
export interface EventHandlerContext<S> {
  set: StoreApi<S>["setState"]
  get: StoreApi<S>["getState"]
  /** The tree-based focus manager */
  focusManager: import("@silvery/tea/focus-manager").FocusManager
  /** Convenience: focus a node by testID */
  focus(testID: string): void
  /** Activate a peer focus scope (saves/restores focus per scope) */
  activateScope(scopeId: string): void
  /** Get the focus path from focused node to root */
  getFocusPath(): string[]
  /**
   * Dispatch an operation through the tea() reducer.
   *
   * Available when the store was created with `tea()` middleware from `silvery/tea`.
   * Type-safe: the Op type is inferred from the store's TeaSlice.
   * For non-tea stores, this is `undefined`.
   */
  dispatch?: "dispatch" extends keyof S ? S["dispatch"] : undefined
  /** Hit-test the render tree at (x, y). Returns the deepest SilveryNode at that point, or null. */
  hitTest(x: number, y: number): import("@silvery/tea/types").TeaNode | null
}

/**
 * Generic event handler function.
 * Return 'exit' to exit the app.
 */
export type EventHandler<T, S> = (data: T, ctx: EventHandlerContext<S>) => void | "exit" | "flush"

/**
 * Event handlers map.
 * Keys are namespaced as 'provider:event' (e.g., 'term:key', 'term:resize').
 */
export type EventHandlers<S> = {
  [event: `${string}:${string}`]: EventHandler<unknown, S> | undefined
}

/**
 * Options for app.run().
 */
export interface AppRunOptions {
  /** Terminal dimensions (default: from process.stdout) */
  cols?: number
  rows?: number
  /** Standard output (default: process.stdout) */
  stdout?: NodeJS.WriteStream
  /** Standard input (default: process.stdin) */
  stdin?: NodeJS.ReadStream
  /**
   * Plain writable sink for ANSI output. Headless mode with active output.
   * Requires cols and rows. Input via handle.press().
   */
  writable?: { write(data: string): void }
  /**
   * Subscribe to resize events in headless mode.
   * Called with a handler that should be invoked when dimensions change.
   * Returns an unsubscribe function.
   */
  onResize?: (handler: (dims: { cols: number; rows: number }) => void) => () => void
  /** Abort signal for external cleanup */
  signal?: AbortSignal
  /** Enter alternate screen buffer (clean slate, restore on exit). Default: false */
  alternateScreen?: boolean
  /** Use Kitty keyboard protocol encoding for press(). Default: false */
  kittyMode?: boolean
  /**
   * Enable Kitty keyboard protocol.
   * - `true`: auto-detect and enable with DISAMBIGUATE flag (1)
   * - number: enable with specific KittyFlags bitfield
   * - `false`/undefined: don't enable (default)
   */
  kitty?: boolean | number
  /**
   * Enable SGR mouse tracking (mode 1006).
   * When true, enables mouse events and disables on cleanup.
   * Default: false
   */
  mouse?: boolean
  /**
   * Handle Ctrl+Z by suspending the process (save terminal state,
   * send SIGTSTP, restore on SIGCONT). Default: true
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
   * Enable Kitty text sizing protocol (OSC 66) for PUA characters.
   * When enabled, nerdfont/powerline icons are measured as 2-wide and
   * wrapped in OSC 66 sequences so the terminal renders them at the
   * correct width.
   * - `true`: force enable
   * - `"auto"`: enable if terminal likely supports it (Kitty 0.40+, Ghostty)
   * - `false`/undefined: disabled (default)
   */
  textSizing?: boolean | "auto"
  /**
   * Enable terminal focus reporting (CSI ?1004h).
   * When enabled, the terminal sends focus-in/focus-out events that are
   * dispatched as 'term:focus' events with `{ focused: boolean }`.
   * Default: false
   */
  focusReporting?: boolean
  /**
   * Terminal capabilities for width measurement and output suppression.
   * When provided, configures the render pipeline to use these caps
   * (scoped width measurer + output phase). Typically from term.caps.
   */
  caps?: import("../terminal-caps.js").TerminalCaps
  /**
   * Root component that wraps the element tree with additional providers.
   * Set by plugins (e.g., withInk) via the `app.Root` pattern.
   * The Root component receives children and wraps them with providers.
   */
  Root?: React.ComponentType<{ children: React.ReactNode }>
  /** Providers and plain values to inject */
  [key: string]: unknown
}

/**
 * Handle returned by app.run().
 *
 * Also AsyncIterable<Buffer> — iterate to get frames after each event:
 * ```typescript
 * for await (const frame of app.run(<App />)) {
 *   expect(frame.text).toContain('expected')
 * }
 * ```
 */
export interface AppHandle<S> {
  /** Current rendered text (no ANSI) */
  readonly text: string
  /** Access to the Zustand store */
  readonly store: StoreApi<S>
  /** Wait until the app exits */
  waitUntilExit(): Promise<void>
  /** Unmount and cleanup */
  unmount(): void
  /** Dispose (alias for unmount) — enables `using` */
  [Symbol.dispose](): void
  /** Send a key press (simulates term:key event) */
  press(key: string): Promise<void>
  /** Iterate frames yielded after each event */
  [Symbol.asyncIterator](): AsyncIterator<Buffer>
}

/**
 * App definition returned by createApp().
 */
export interface AppDefinition<S> {
  run(element: ReactElement, options?: AppRunOptions): AppRunner<S>
}

/**
 * Result of app.run() — both a Promise<AppHandle> and an AsyncIterable<Buffer>.
 *
 * - `await app.run(el)` → AppHandle (backward compat)
 * - `for await (const frame of app.run(el))` → iterate frames
 */
export interface AppRunner<S> extends AsyncIterable<Buffer>, PromiseLike<AppHandle<S>> {}

// ============================================================================
// Store Context
// ============================================================================

export const StoreContext = createContext<StoreApi<unknown> | null>(null)

/**
 * Hook for accessing app state with selectors.
 *
 * @example
 * ```tsx
 * const count = useApp(s => s.count)
 * const { count, increment } = useApp(s => ({ count: s.count, increment: s.increment }))
 * ```
 */
export function useApp<S, T>(selector: (state: S) => T): T {
  const store = useContext(StoreContext) as StoreApi<S> | null
  if (!store) throw new Error("useApp must be used within createApp().run()")

  const [state, setState] = React.useState(() => selector(store.getState()))
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  useEffect(() => {
    return store.subscribe((newState) => {
      const next = selectorRef.current(newState)
      // Only update if the selected value actually changed (avoids
      // unnecessary re-renders when unrelated store slices change)
      setState((prev) => (Object.is(prev, next) ? prev : next))
    })
  }, [store])

  return state
}

/**
 * Shallow comparison for plain objects.
 * Returns true if objects have same keys with Object.is() equal values.
 */
function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false
  }
  const keysA = Object.keys(a as Record<string, unknown>)
  const keysB = Object.keys(b as Record<string, unknown>)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false
    }
  }
  return true
}

/**
 * Hook for accessing app state with shallow comparison.
 *
 * Like useApp, but uses shallow object comparison instead of Object.is().
 * Use when your selector returns a new object on each call — this prevents
 * re-renders when all individual fields are unchanged.
 *
 * @example
 * ```tsx
 * const { cursor, mode } = useAppShallow(s => ({
 *   cursor: s.cursorNodeId,
 *   mode: s.viewMode,
 * }))
 * ```
 */
export function useAppShallow<S, T>(selector: (state: S) => T): T {
  const store = useContext(StoreContext) as StoreApi<S> | null
  if (!store) throw new Error("useAppShallow must be used within createApp().run()")

  const [state, setState] = React.useState(() => selector(store.getState()))
  const selectorRef = useRef(selector)
  selectorRef.current = selector

  useEffect(() => {
    return store.subscribe((newState) => {
      const next = selectorRef.current(newState)
      setState((prev) => (shallowEqual(prev, next) ? prev : next))
    })
  }, [store])

  return state
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create an app with Zustand store and provider integration.
 *
 * This is Layer 3 - it provides:
 * - Zustand store with fine-grained subscriptions
 * - Providers as unified stores + event sources
 * - Event handlers namespaced as 'provider:event'
 *
 * @param factory Store factory function that receives providers
 * @param handlers Optional event handlers (namespaced as 'provider:event')
 */
export function createApp<I extends Record<string, unknown>, S extends Record<string, unknown>>(
  factory: (inject: I) => StateCreator<S>,
  handlers?: EventHandlers<S & I>,
): AppDefinition<S & I> {
  return {
    run(element: ReactElement, options: AppRunOptions = {}): AppRunner<S & I> {
      // Lazy-init: the actual setup happens once, on first access
      let handlePromise: Promise<AppHandle<S & I>> | null = null

      const init = (): Promise<AppHandle<S & I>> => {
        if (handlePromise) return handlePromise
        handlePromise = initApp(factory, handlers, element, options)
        return handlePromise
      }

      return {
        // PromiseLike — makes `await app.run(el)` work
        then<TResult1 = AppHandle<S & I>, TResult2 = never>(
          onfulfilled?: ((value: AppHandle<S & I>) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> {
          return init().then(onfulfilled, onrejected)
        },

        // AsyncIterable — makes `for await (const frame of app.run(el))` work
        [Symbol.asyncIterator](): AsyncIterator<Buffer> {
          let handle: AppHandle<S & I> | null = null
          let iterator: AsyncIterator<Buffer> | null = null
          let started = false

          return {
            async next(): Promise<IteratorResult<Buffer>> {
              if (!started) {
                started = true
                handle = await init()
                iterator = handle[Symbol.asyncIterator]()
              }
              return iterator!.next()
            },
            async return(): Promise<IteratorResult<Buffer>> {
              if (handle) handle.unmount()
              return { done: true, value: undefined as unknown as Buffer }
            },
          }
        },
      }
    },
  }
}

/**
 * Initialize the app — extracted from run() for clarity.
 */
async function initApp<I extends Record<string, unknown>, S extends Record<string, unknown>>(
  factory: (inject: I) => StateCreator<S>,
  handlers: EventHandlers<S & I> | undefined,
  element: ReactElement,
  options: AppRunOptions,
): Promise<AppHandle<S & I>> {
  const {
    cols: explicitCols,
    rows: explicitRows,
    stdout: explicitStdout,
    stdin = process.stdin,
    signal: externalSignal,
    alternateScreen = false,
    kittyMode: useKittyMode = false,
    kitty: kittyOption,
    mouse: mouseOption = false,
    suspendOnCtrlZ: suspendOption = true,
    exitOnCtrlC: exitOnCtrlCOption = true,
    onSuspend: onSuspendHook,
    onResume: onResumeHook,
    onInterrupt: onInterruptHook,
    textSizing: textSizingOption,
    focusReporting: focusReportingOption = false,
    caps: capsOption,
    Root: RootComponent,
    writable: explicitWritable,
    onResize: explicitOnResize,
    ...injectValues
  } = options

  const headless = (explicitCols != null && explicitRows != null && !explicitStdout) || explicitWritable != null
  const cols = explicitCols ?? process.stdout.columns ?? 80
  const rows = explicitRows ?? process.stdout.rows ?? 24
  const stdout = explicitStdout ?? process.stdout

  // Initialize layout engine
  await ensureLayoutEngine()

  // Create abort controller for cleanup
  const controller = new AbortController()
  const signal = controller.signal

  // Wire external signal
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), {
        once: true,
      })
    }
  }

  // Separate providers from plain values
  const providers: Record<string, Provider<unknown, Record<string, unknown>>> = {}
  const plainValues: Record<string, unknown> = {}
  const providerCleanups: (() => void)[] = []

  // Create term provider if not provided
  let termProvider: TermProvider | null = null
  if (!("term" in injectValues) || !isFullProvider(injectValues.term)) {
    // In headless mode, provide mock streams so termProvider doesn't touch real stdin/stdout.
    // When onResize is provided, the mock supports resize events so the term provider
    // picks up dimension changes and triggers re-renders through the event loop.
    const resizeListeners = new Set<() => void>()
    const termStdout = headless
      ? ({
          columns: cols,
          rows,
          write: () => true,
          isTTY: false,
          on(event: string, handler: () => void) {
            if (event === "resize") resizeListeners.add(handler)
            return termStdout
          },
          off(event: string, handler: () => void) {
            if (event === "resize") resizeListeners.delete(handler)
            return termStdout
          },
        } as unknown as NodeJS.WriteStream)
      : stdout
    const termStdin = headless
      ? ({
          isTTY: false,
          on: () => termStdin,
          off: () => termStdin,
          setRawMode: () => {},
          resume: () => {},
          pause: () => {},
          setEncoding: () => {},
        } as unknown as NodeJS.ReadStream)
      : stdin
    termProvider = createTermProvider(termStdin, termStdout, { cols, rows })
    providers.term = termProvider as unknown as Provider<unknown, Record<string, unknown>>
    providerCleanups.push(() => termProvider![Symbol.dispose]())

    // Wire onResize to the mock termStdout so the term provider sees resize events.
    // This updates:
    // 1. currentDims — so getDims() returns correct values for doRender()
    // 2. mock termStdout columns/rows — so the term provider reads correct dimensions
    // 3. mock termStdout resize listeners — triggers term:resize through the provider's
    //    event stream → event loop → doRender()
    if (headless && explicitOnResize) {
      const unsub = explicitOnResize((dims) => {
        currentDims = dims
        ;(termStdout as { columns: number; rows: number }).columns = dims.cols
        ;(termStdout as { columns: number; rows: number }).rows = dims.rows
        for (const listener of resizeListeners) listener()
      })
      providerCleanups.push(unsub)
    }
  }

  // Categorize injected values
  for (const [name, value] of Object.entries(injectValues)) {
    if (isFullProvider(value)) {
      providers[name] = value
    } else {
      plainValues[name] = value
    }
  }

  // Build inject object (providers + plain values)
  const inject = { ...providers, ...plainValues } as I

  // Subscribe to provider state changes
  const stateUnsubscribes: (() => void)[] = []

  // Create store
  const store = createStore<S & I>((set, get, api) => {
    // Get base state from factory
    const baseState = factory(inject)(
      set as StoreApi<S>["setState"],
      get as StoreApi<S>["getState"],
      api as StoreApi<S>,
    )

    // Merge provider references into state (for access via selectors)
    const mergedState: Record<string, unknown> = { ...baseState }

    for (const [name, provider] of Object.entries(providers)) {
      mergedState[name] = provider

      // Subscribe to provider state changes (basic providers only)
      if (isBasicProvider(provider)) {
        const unsub = provider.subscribe((_providerState) => {
          // Could flatten provider state here if desired
          // For now, just trigger a re-check
        })
        stateUnsubscribes.push(unsub)
      }
    }

    // Add plain values
    for (const [name, value] of Object.entries(plainValues)) {
      mergedState[name] = value
    }

    return mergedState as S & I
  })

  // Track current dimensions
  let currentDims: Dims = { cols, rows }
  let shouldExit = false
  let renderPaused = false
  let isRendering = false // Re-entrancy guard for store subscription
  let inEventHandler = false // True during processEvent/press — suppresses subscription renders

  // ========================================================================
  // ANSI Trace: SILVERY_TRACE=1 logs all stdout writes with decoded sequences
  // ========================================================================
  const _ansiTrace = !headless && process.env?.SILVERY_TRACE === "1"

  let _traceSeq = 0
  const _traceStart = performance.now()
  let _origStdoutWrite: typeof process.stdout.write | undefined

  if (_ansiTrace) {
    const fs =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs") as typeof import("node:fs")
    fs.writeFileSync("/tmp/silvery-trace.log", `=== SILVERY TRACE START ===\n`)

    _origStdoutWrite = stdout.write.bind(stdout) as typeof stdout.write

    const symbolize = (s: string): string =>
      s
        .replace(/\x1b\[\?1049h/g, "⟨ALT_ON⟩")
        .replace(/\x1b\[\?1049l/g, "⟨ALT_OFF⟩")
        .replace(/\x1b\[2J/g, "⟨CLEAR⟩")
        .replace(/\x1b\[H/g, "⟨HOME⟩")
        .replace(/\x1b\[\?25l/g, "⟨CUR_HIDE⟩")
        .replace(/\x1b\[\?25h/g, "⟨CUR_SHOW⟩")
        .replace(/\x1b\[\?2026h/g, "⟨SYNC_ON⟩")
        .replace(/\x1b\[\?2026l/g, "⟨SYNC_OFF⟩")
        .replace(/\x1b\[\?2004h/g, "⟨BPASTE_ON⟩")
        .replace(/\x1b\[\?2004l/g, "⟨BPASTE_OFF⟩")
        .replace(/\x1b\[0m/g, "⟨RST⟩")
        .replace(/\x1b\[(\d+);(\d+)H/g, "⟨GO $1,$2⟩")
        .replace(/\x1b\[38;5;(\d+)m/g, "⟨F$1⟩")
        .replace(/\x1b\[48;5;(\d+)m/g, "⟨B$1⟩")
        .replace(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g, "⟨FR$1,$2,$3⟩")
        .replace(/\x1b\[48;2;(\d+);(\d+);(\d+)m/g, "⟨BR$1,$2,$3⟩")
        .replace(/\x1b\[1m/g, "⟨BOLD⟩")
        .replace(/\x1b\[2m/g, "⟨DIM⟩")
        .replace(/\x1b\[3m/g, "⟨ITAL⟩")
        .replace(/\x1b\[4m/g, "⟨UL⟩")
        .replace(/\x1b\[7m/g, "⟨INV⟩")
        .replace(/\x1b\[22m/g, "⟨/BOLD⟩")
        .replace(/\x1b\[23m/g, "⟨/ITAL⟩")
        .replace(/\x1b\[24m/g, "⟨/UL⟩")
        .replace(/\x1b\[27m/g, "⟨/INV⟩")
        .replace(/\x1b\[39m/g, "⟨/FG⟩")
        .replace(/\x1b\[49m/g, "⟨/BG⟩")
        // Catch remaining CSI sequences
        .replace(/\x1b\[([0-9;]*)([A-Za-z])/g, "⟨CSI $1$2⟩")
        // Catch remaining ESC sequences
        .replace(/\x1b([^\[])/, "⟨ESC $1⟩")

    const traceWrite = function (this: typeof stdout, chunk: unknown, ...args: unknown[]): boolean {
      const str = typeof chunk === "string" ? chunk : String(chunk)
      const seq = ++_traceSeq
      const ms = (performance.now() - _traceStart).toFixed(0)
      const decoded = symbolize(str)
      // Truncate for readability but keep enough to identify content
      const preview =
        decoded.length > 400 ? decoded.slice(0, 200) + ` ...[${decoded.length}ch]... ` + decoded.slice(-100) : decoded
      fs.appendFileSync(
        "/tmp/silvery-trace.log",
        `[${String(seq).padStart(4, "0")}] +${ms}ms (${str.length}b): ${preview}\n`,
      )
      return (_origStdoutWrite as Function).call(this, chunk, ...args)
    } as typeof stdout.write

    stdout.write = traceWrite
    // Restore original stdout.write on cleanup (providerCleanups runs during cleanup())
    providerCleanups.push(() => {
      if (_origStdoutWrite) stdout.write = _origStdoutWrite
    })
  }

  // Create render target
  const target: RenderTarget = headless
    ? {
        write(frame: string) {
          if (explicitWritable) explicitWritable.write(frame)
        },
        getDims: () => currentDims,
      }
    : {
        write(frame: string): void {
          if (_perfLog) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            require("node:fs").appendFileSync(
              "/tmp/silvery-perf.log",
              `TARGET.write: ${frame.length} bytes (paused=${renderPaused})\n`,
            )
          }
          if (!renderPaused) stdout.write(frame)
        },
        getDims(): Dims {
          return currentDims
        },
        onResize(handler: (dims: Dims) => void): () => void {
          const onResize = () => {
            currentDims = {
              cols: stdout.columns || 80,
              rows: stdout.rows || 24,
            }
            handler(currentDims)
          }
          stdout.on("resize", onResize)
          return () => stdout.off("resize", onResize)
        },
      }

  // Resolve textSizing from caps + option (matches run.tsx gate)
  const textSizingEnabled =
    textSizingOption === true ||
    (textSizingOption === "auto" && (capsOption?.textSizingSupported ?? isTextSizingLikelySupported()))

  // Create pipeline config from caps (scoped width measurer + output phase)
  const pipelineConfig = capsOption
    ? createPipeline({ caps: { ...capsOption, textSizingSupported: textSizingEnabled } })
    : undefined

  // Create runtime (pass scoped output phase to ensure measurer/caps are threaded)
  // mode must match alternateScreen: inline apps (alternateScreen=false) need
  // inline output phase rendering (relative cursor) + scrollback offset tracking.
  const runtime = createRuntime({
    target,
    signal,
    mode: alternateScreen ? "fullscreen" : "inline",
    outputPhaseFn: pipelineConfig?.outputPhaseFn,
  })

  // Cleanup state
  let cleanedUp = false
  let storeUnsubscribeFn: (() => void) | null = null
  // Track protocol state for cleanup and suspend/resume
  let kittyEnabled = false
  let kittyFlags: number = KittyFlags.DISAMBIGUATE
  let mouseEnabled = false
  let focusReportingEnabled = false

  // Focus manager (tree-based focus system) with event dispatch wiring
  const focusManager = createFocusManager({
    onFocusChange(oldNode, newNode, _origin) {
      // Dispatch blur event on the old element
      if (oldNode) {
        const blurEvent = createFocusEvent("blur", oldNode, newNode)
        dispatchFocusEvent(blurEvent)
      }
      // Dispatch focus event on the new element
      if (newNode) {
        const focusEvent = createFocusEvent("focus", newNode, oldNode)
        dispatchFocusEvent(focusEvent)
      }
    },
  })

  // Per-instance cursor state (replaces module-level globals)
  const cursorStore = createCursorStore()

  // Mouse event processor for DOM-level dispatch (with click-to-focus)
  const mouseEventState = createMouseEventProcessor({ focusManager })

  // Cleanup function - idempotent, can be called from exit() or finally
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true

    // Unmount React tree first — this runs effect cleanups (clears intervals,
    // cancels subscriptions) before we tear down the infrastructure.
    try {
      reconciler.updateContainerSync(null, fiberRoot, null, () => {})
      reconciler.flushSyncWork()
    } catch {
      // Ignore — component tree may already be partially torn down
    }

    // Unsubscribe from store
    if (storeUnsubscribeFn) {
      storeUnsubscribeFn()
    }

    // Unsubscribe from provider state changes
    stateUnsubscribes.forEach((unsub) => {
      try {
        unsub()
      } catch {
        // Ignore
      }
    })

    // Cleanup providers (including termProvider)
    providerCleanups.forEach((fn) => {
      try {
        fn()
      } catch {
        // Ignore
      }
    })

    // Dispose runtime
    runtime[Symbol.dispose]()

    // Restore cursor and leave alternate screen
    if (!headless) {
      // Disable focus reporting before restoring terminal
      if (focusReportingEnabled) disableFocusReporting((s) => stdout.write(s))
      // Disable mouse tracking before restoring terminal
      if (mouseEnabled) stdout.write(disableMouse())
      // Disable Kitty keyboard protocol before restoring terminal
      if (kittyEnabled) stdout.write(disableKittyKeyboard())
      stdout.write("\x1b[?25h\x1b[0m\n")
      if (alternateScreen) stdout.write("\x1b[?1049l")
    }
  }

  let exit: () => void

  // Create SilveryNode container
  const container = createContainer(() => {})

  // Create React fiber root
  const fiberRoot = createFiberRoot(container)

  // Track current buffer for text access
  let currentBuffer: Buffer

  // Create mock stdout for contexts
  const mockStdout = {
    columns: cols,
    rows: rows,
    write: () => true,
    isTTY: false,
    on: () => mockStdout,
    off: () => mockStdout,
    once: () => mockStdout,
    removeListener: () => mockStdout,
    addListener: () => mockStdout,
  } as unknown as NodeJS.WriteStream

  // Create mock term
  const mockTerm = createTerm({ color: "truecolor" })

  // RuntimeContext input listeners — allows components using hooks/useInput
  // (TextInput, TextArea, SelectList etc.) to work inside createApp apps.
  const runtimeInputListeners = new Set<(input: string, key: Key) => void>()
  const runtimePasteListeners = new Set<(text: string) => void>()

  // Typed event bus — supports view → runtime events via emit()
  const runtimeEventListeners = new Map<string, Set<Function>>()
  runtimeEventListeners.set("input", runtimeInputListeners as unknown as Set<Function>)
  runtimeEventListeners.set("paste", runtimePasteListeners as unknown as Set<Function>)

  const runtimeContextValue: RuntimeContextValue = {
    on(event, handler) {
      let listeners = runtimeEventListeners.get(event)
      if (!listeners) {
        listeners = new Set()
        runtimeEventListeners.set(event, listeners)
      }
      listeners.add(handler)
      return () => listeners!.delete(handler)
    },
    emit(event, ...args) {
      const listeners = runtimeEventListeners.get(event)
      if (listeners) {
        for (const listener of listeners) {
          listener(...args)
        }
      }
    },
    exit: () => exit(),
  }

  // Wrap element with all required providers
  // SilveryErrorBoundary is always the outermost wrapper — catches render errors gracefully.
  // If a Root component is provided (e.g., from withInk), wrap the element with it
  // inside silvery's contexts so it can access Term, Stdout, FocusManager, Runtime.
  const Root = RootComponent ?? React.Fragment
  const wrappedElement = (
    <SilveryErrorBoundary>
      <CursorProvider store={cursorStore}>
        <TermContext.Provider value={mockTerm}>
          <StdoutContext.Provider
            value={{
              stdout: mockStdout,
              write: () => {},
              notifyScrollback: (lines: number) => runtime.addScrollbackLines(lines),
              promoteScrollback: (content: string, lines: number) => runtime.promoteScrollback(content, lines),
              resetInlineCursor: () => runtime.resetInlineCursor(),
              getInlineCursorRow: () => runtime.getInlineCursorRow(),
            }}
          >
            <FocusManagerContext.Provider value={focusManager}>
              <RuntimeContext.Provider value={runtimeContextValue}>
                <Root>
                  <StoreContext.Provider value={store as StoreApi<unknown>}>{element}</StoreContext.Provider>
                </Root>
              </RuntimeContext.Provider>
            </FocusManagerContext.Provider>
          </StdoutContext.Provider>
        </TermContext.Provider>
      </CursorProvider>
    </SilveryErrorBoundary>
  )

  // Performance instrumentation — count renders per event
  let _renderCount = 0
  let _eventStart = 0
  const _perfLog = typeof process !== "undefined" && process.env?.DEBUG?.includes("silvery:perf")

  // Incremental rendering — store previous pipeline buffer for diffing.
  // Without this, every render walks the entire node tree from scratch.
  // Set SILVERY_NO_INCREMENTAL=1 to disable (for debugging blank screen issues).
  const _noIncremental = process.env?.SILVERY_NO_INCREMENTAL === "1"
  let _prevTermBuffer: import("../buffer.js").TerminalBuffer | null = null

  // Helper to render and get text
  function doRender(): Buffer {
    _renderCount++
    if (_ansiTrace) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/tmp/silvery-trace.log",
        `--- doRender #${_renderCount} (prev=${_prevTermBuffer ? "yes" : "null"}, incremental=${!_noIncremental && !!_prevTermBuffer}) ---\n`,
      )
    }
    const renderStart = performance.now()

    // Phase A: React reconciliation
    reconciler.updateContainerSync(wrappedElement, fiberRoot, null, () => {})
    reconciler.flushSyncWork()
    const reconcileMs = performance.now() - renderStart

    // Phase B: Render pipeline (incremental when prevBuffer available)
    const pipelineStart = performance.now()
    const rootNode = getContainerRoot(container)
    const dims = runtime.getDims()

    const isInline = !alternateScreen

    // Invalidate prevBuffer on dimension change (resize).
    // Both pipeline-level (_prevTermBuffer) and runtime-level (runtime.invalidate())
    // must be cleared — otherwise the ANSI diff compares different-sized buffers.
    //
    // In inline mode, only WIDTH changes trigger invalidation. Height changes are
    // normal (content grows/shrinks as items are added/frozen) and are handled
    // incrementally by the output phase. Invalidating on height causes the runtime's
    // prevBuffer to be null, which triggers the first-render clear path with \x1b[J
    // — wiping the entire visible screen including shell prompt content above the app.
    if (_prevTermBuffer) {
      const widthChanged = dims.cols !== _prevTermBuffer.width
      const heightChanged = !isInline && dims.rows !== _prevTermBuffer.height
      if (widthChanged || heightChanged) {
        _prevTermBuffer = null
        runtime.invalidate()
      }
    }

    // Clear diagnostic arrays before the render so we capture only this render's data
    ;(globalThis as any).__silvery_content_all = undefined
    ;(globalThis as any).__silvery_node_trace = undefined

    // Early return: if reconciliation produced no dirty flags on the tree,
    // skip the pipeline entirely. This avoids cloning _prevTermBuffer (which
    // resets dirty rows to 0), preserving the row-level dirty markers that
    // the runtime diff needs to detect actual changes.
    const rootHasDirty =
      rootNode.layoutDirty ||
      rootNode.contentDirty ||
      rootNode.paintDirty ||
      rootNode.bgDirty ||
      rootNode.subtreeDirty ||
      rootNode.childrenDirty
    if (!rootHasDirty && _prevTermBuffer && currentBuffer) {
      return currentBuffer
    }

    const wasIncremental = !_noIncremental && _prevTermBuffer !== null
    const { buffer: termBuffer } = executeRender(
      rootNode,
      dims.cols,
      dims.rows,
      wasIncremental ? _prevTermBuffer : null,
      // Always use fullscreen mode here — the pipeline's output is discarded.
      // The runtime's render() handles inline mode output separately.
      // Using inline mode here would modify the shared inline cursor state
      // (prevCursorRow, prevBuffer) before runtime.render() gets a chance,
      // causing the runtime to produce 0-byte output.
      undefined,
      pipelineConfig,
    )
    if (!_noIncremental) _prevTermBuffer = termBuffer
    const pipelineMs = performance.now() - pipelineStart

    // SILVERY_CHECK_INCREMENTAL: compare incremental render against fresh render.
    // createApp bypasses Scheduler/Renderer which have this check built-in,
    // so we add it here to catch incremental rendering bugs at runtime.
    const strictEnv =
      typeof process !== "undefined" && (process.env?.SILVERY_STRICT || process.env?.SILVERY_CHECK_INCREMENTAL)
    if (strictEnv && strictEnv !== "0" && strictEnv !== "false" && wasIncremental) {
      const { buffer: freshBuffer } = executeRender(
        rootNode,
        dims.cols,
        dims.rows,
        null,
        {
          skipLayoutNotifications: true,
          skipScrollStateUpdates: true,
        },
        pipelineConfig,
      )
      const { cellEquals, bufferToText } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("../buffer.js") as typeof import("../buffer.js")
      for (let y = 0; y < termBuffer.height; y++) {
        for (let x = 0; x < termBuffer.width; x++) {
          const a = termBuffer.getCell(x, y)
          const b = freshBuffer.getCell(x, y)
          if (!cellEquals(a, b)) {
            // Re-run fresh render with write trap to capture what writes to the mismatched cell
            let trapInfo = ""
            const trap = { x, y, log: [] as string[] }
            ;(globalThis as any).__silvery_write_trap = trap
            try {
              executeRender(
                rootNode,
                dims.cols,
                dims.rows,
                null,
                {
                  skipLayoutNotifications: true,
                  skipScrollStateUpdates: true,
                },
                pipelineConfig,
              )
            } catch {
              // ignore
            }
            ;(globalThis as any).__silvery_write_trap = null
            if (trap.log.length > 0) {
              trapInfo = `\nWRITE TRAP (${trap.log.length} writes to (${x},${y})):\n${trap.log.join("\n")}\n`
            } else {
              trapInfo = `\nWRITE TRAP: NO WRITES to (${x},${y})\n`
            }
            const incText = bufferToText(termBuffer)
            const freshText = bufferToText(freshBuffer)
            const cellStr = (c: typeof a) =>
              `char=${JSON.stringify(c.char)} fg=${c.fg} bg=${c.bg} ulColor=${c.underlineColor} wide=${c.wide} cont=${c.continuation} attrs={bold=${c.attrs.bold},dim=${c.attrs.dim},italic=${c.attrs.italic},ul=${c.attrs.underline},ulStyle=${c.attrs.underlineStyle},blink=${c.attrs.blink},inv=${c.attrs.inverse},hidden=${c.attrs.hidden},strike=${c.attrs.strikethrough}}`
            // Dump content phase stats for diagnosis
            const contentAll = (globalThis as any).__silvery_content_all as unknown[]
            const statsStr = contentAll
              ? `\n--- content phase stats (${contentAll.length} calls) ---\n` +
                contentAll
                  .map(
                    (s: any, i: number) =>
                      `  #${i}: visited=${s.nodesVisited} rendered=${s.nodesRendered} skipped=${s.nodesSkipped} ` +
                      `clearOps=${s.clearOps} cascade="${s.cascadeNodes}" ` +
                      `flags={C=${s.flagContentDirty} P=${s.flagPaintDirty} L=${s.flagLayoutChanged} ` +
                      `S=${s.flagSubtreeDirty} Ch=${s.flagChildrenDirty} CP=${s.flagChildPositionChanged} noPrev=${s.noPrevBuffer}} ` +
                      `scroll={containers=${s.scrollContainerCount} cleared=${s.scrollViewportCleared} reason="${s.scrollClearReason}"} ` +
                      `normalRepaint="${s.normalRepaintReason}" ` +
                      `prevBuf={null=${s._prevBufferNull} dimMismatch=${s._prevBufferDimMismatch} hasPrev=${s._hasPrevBuffer} ` +
                      `layout=${s._layoutW}x${s._layoutH} prev=${s._prevW}x${s._prevH}}`,
                  )
                  .join("\n")
              : ""
            const msg =
              `SILVERY_CHECK_INCREMENTAL (createApp): MISMATCH at (${x}, ${y}) on render #${_renderCount}\n` +
              `  incremental: ${cellStr(a)}\n` +
              `  fresh:       ${cellStr(b)}` +
              statsStr +
              // Per-node trace
              (() => {
                const traces = (globalThis as any).__silvery_node_trace as unknown[][] | undefined
                if (!traces || traces.length === 0) return ""
                let out = "\n--- node trace ---"
                for (let ti = 0; ti < traces.length; ti++) {
                  out += `\n  contentPhase #${ti}:`
                  for (const t of traces[ti] as any[]) {
                    out += `\n    ${t.decision} ${t.id}(${t.type})@${t.depth} rect=${t.rect} prev=${t.prevLayout}`
                    out += ` hasPrev=${t.hasPrev} ancClr=${t.ancestorCleared} flags=[${t.flags}] layout∆=${t.layoutChanged}`
                    if (t.decision === "RENDER") {
                      out += ` caa=${t.contentAreaAffected} prc=${t.parentRegionCleared} prm=${t.parentRegionChanged}`
                      out += ` childPrev=${t.childHasPrev} childAnc=${t.childAncestorCleared} skipBg=${t.skipBgFill} bg=${t.bgColor ?? "none"}`
                    }
                  }
                }
                return out
              })() +
              trapInfo +
              `\n--- incremental ---\n${incText}\n--- fresh ---\n${freshText}`
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            require("node:fs").appendFileSync("/tmp/silvery-perf.log", msg + "\n")
            // Also throw to make it visible
            throw new IncrementalRenderMismatchError(msg)
          }
        }
      }
      if (_perfLog) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("node:fs").appendFileSync(
          "/tmp/silvery-perf.log",
          `SILVERY_CHECK_INCREMENTAL (createApp): render #${_renderCount} OK\n`,
        )
      }
    }

    const buf = createBuffer(termBuffer, rootNode)
    if (_perfLog) {
      const renderDuration = performance.now() - renderStart
      const phases = (globalThis as any).__silvery_last_pipeline
      const detail = (globalThis as any).__silvery_content_detail
      const phaseStr = phases
        ? ` [measure=${phases.measure.toFixed(1)} layout=${phases.layout.toFixed(1)} content=${phases.content.toFixed(1)} output=${phases.output.toFixed(1)}]`
        : ""
      const detailStr = detail
        ? ` {visited=${detail.nodesVisited} rendered=${detail.nodesRendered} skipped=${detail.nodesSkipped} noPrev=${detail.noPrevBuffer ?? 0} dirty=${detail.flagContentDirty ?? 0} paint=${detail.flagPaintDirty ?? 0} layoutChg=${detail.flagLayoutChanged ?? 0} subtree=${detail.flagSubtreeDirty ?? 0} children=${detail.flagChildrenDirty ?? 0} childPos=${detail.flagChildPositionChanged ?? 0} scroll=${detail.scrollContainerCount ?? 0}/${detail.scrollViewportCleared ?? 0}${detail.scrollClearReason ? `(${detail.scrollClearReason})` : ""}}${detail.cascadeNodes ? ` CASCADE[minDepth=${detail.cascadeMinDepth} ${detail.cascadeNodes}]` : ""}`
        : ""
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/tmp/silvery-perf.log",
        `doRender #${_renderCount}: ${renderDuration.toFixed(1)}ms (reconcile=${reconcileMs.toFixed(1)}ms pipeline=${pipelineMs.toFixed(1)}ms ${dims.cols}x${dims.rows})${phaseStr}${detailStr}\n`,
      )
    }
    return buf
  }

  // Initial render
  if (_ansiTrace) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").appendFileSync("/tmp/silvery-trace.log", "=== INITIAL RENDER ===\n")
  }
  currentBuffer = doRender()

  // Enter alternate screen if requested, then clear and hide cursor
  if (!headless) {
    if (_ansiTrace) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync("/tmp/silvery-trace.log", "=== ALT SCREEN + CLEAR ===\n")
    }
    if (alternateScreen) {
      stdout.write("\x1b[?1049h")
      stdout.write("\x1b[2J\x1b[H")
    }
    stdout.write("\x1b[?25l")

    // Kitty keyboard protocol
    if (kittyOption != null && kittyOption !== false) {
      if (kittyOption === true) {
        // Auto-detect: probe terminal, enable if supported
        const result = await detectKittyFromStdio(stdout, stdin as NodeJS.ReadStream)
        if (result.supported) {
          stdout.write(enableKittyKeyboard(KittyFlags.DISAMBIGUATE))
          kittyEnabled = true
          kittyFlags = KittyFlags.DISAMBIGUATE
        }
      } else {
        // Explicit flags — enable directly without detection
        stdout.write(enableKittyKeyboard(kittyOption as 1))
        kittyEnabled = true
        kittyFlags = kittyOption as number
      }
    } else {
      // Legacy behavior: always enable Kitty DISAMBIGUATE
      stdout.write(enableKittyKeyboard(KittyFlags.DISAMBIGUATE))
      kittyEnabled = true
      kittyFlags = KittyFlags.DISAMBIGUATE
    }

    // Mouse tracking
    if (mouseOption) {
      stdout.write(enableMouse())
      mouseEnabled = true
    }

    // Focus reporting
    if (focusReportingOption) {
      enableFocusReporting((s) => stdout.write(s))
      focusReportingEnabled = true
    }
  }
  if (_ansiTrace) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").appendFileSync("/tmp/silvery-trace.log", "=== RUNTIME.RENDER (initial) ===\n")
  }
  runtime.render(currentBuffer)
  if (_perfLog) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").appendFileSync(
      "/tmp/silvery-perf.log",
      `STARTUP: initial render done (render #${_renderCount}, incremental=${!_noIncremental})\n`,
    )
  }

  // Assign pause/resume now that doRender and runtime are available.
  // Update runtimeContextValue in-place so useApp()/useRuntime() sees the latest values.
  if (!headless) {
    runtimeContextValue.pause = () => {
      renderPaused = true
    }
    runtimeContextValue.resume = () => {
      renderPaused = false
      // Reset diff state so next render outputs a full frame.
      // The screen was cleared when entering console mode, so
      // incremental diffing would produce an incomplete frame.
      runtime.invalidate()
      _prevTermBuffer = null
      // Force full re-render to restore display, but only if we're not
      // already inside a doRender() call (e.g. when resume() is called
      // from a React effect cleanup during reconciliation).
      if (!isRendering) {
        currentBuffer = doRender()
        runtime.render(currentBuffer)
      }
      // If isRendering is true, the outer doRender()/runtime.render() will
      // handle the re-render after effects complete, with renderPaused=false.
    }
  }

  // Exit promise
  let exitResolve: () => void
  let exitResolved = false
  const exitPromise = new Promise<void>((resolve) => {
    exitResolve = () => {
      if (!exitResolved) {
        exitResolved = true
        resolve()
      }
    }
  })

  // Now define exit function (needs exitResolve and cleanup)
  exit = () => {
    if (shouldExit) return // Already exiting
    shouldExit = true
    controller.abort()
    cleanup()
    exitResolve()
  }
  runtimeContextValue.exit = exit

  // Frame listeners for async iteration
  let frameResolve: ((buffer: Buffer) => void) | null = null
  let framesDone = false

  // Notify frame listeners
  function emitFrame(buf: Buffer) {
    if (frameResolve) {
      const resolve = frameResolve
      frameResolve = null
      resolve(buf)
    }
  }

  // Subscribe to store for re-renders.
  //
  // Three cases:
  // 1. inEventHandler=true (during processEvent/press): ONLY flag pendingRerender.
  //    The caller's flush loop will handle all deferred renders. No microtask.
  // 2. isRendering=true (during doRender effects): defer via pendingRerender flag.
  //    Queue a microtask to render after the current render completes — but only
  //    if NOT in an event handler (the flush loop handles it).
  // 3. Neither: render immediately (standalone setState from timeout/interval).
  //
  let pendingRerender = false
  storeUnsubscribeFn = store.subscribe(() => {
    if (shouldExit) return
    if (_ansiTrace) {
      const _case = inEventHandler ? "1:event" : isRendering ? "2:rendering" : "3:standalone"
      const stack = new Error().stack?.split("\n").slice(1, 5).join("\n") ?? ""
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/tmp/silvery-trace.log",
        `=== SUBSCRIPTION (case ${_case}, render #${_renderCount + 1}) ===\n${stack}\n`,
      )
    }
    if (inEventHandler) {
      // During processEvent/press: just flag, caller's flush loop handles it.
      pendingRerender = true
      return
    }
    if (isRendering) {
      // During doRender (outside event handler): defer to microtask.
      if (!pendingRerender) {
        pendingRerender = true
        queueMicrotask(() => {
          if (!pendingRerender) return
          pendingRerender = false
          if (!shouldExit && !isRendering) {
            if (_perfLog) {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              require("node:fs").appendFileSync(
                "/tmp/silvery-perf.log",
                `SUBSCRIPTION: deferred microtask render (case 2, render #${_renderCount + 1})\n`,
              )
            }
            isRendering = true
            try {
              currentBuffer = doRender()
              runtime.render(currentBuffer)
            } finally {
              isRendering = false
            }
          }
        })
      }
      return
    }
    if (_perfLog) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/tmp/silvery-perf.log",
        `SUBSCRIPTION: immediate render (case 3, render #${_renderCount + 1})\n`,
      )
    }
    isRendering = true
    try {
      currentBuffer = doRender()
      runtime.render(currentBuffer)
    } finally {
      isRendering = false
    }
  })

  // Create namespaced event streams from all providers
  function createProviderEventStream(
    name: string,
    provider: Provider<unknown, Record<string, unknown>>,
  ): AsyncIterable<NamespacedEvent> {
    return map(provider.events(), (event) => ({
      type: `${name}:${String(event.type)}`,
      provider: name,
      event: String(event.type),
      data: event.data,
    }))
  }

  /**
   * Run a single event's handler (state mutation only, no render).
   * Returns true if processing should continue, false if app should exit.
   */
  function runEventHandler(event: NamespacedEvent): boolean | "flush" {
    const ctx = createHandlerContext(store, focusManager, container)
    return invokeEventHandler(event, handlers, ctx, mouseEventState, container)
  }

  /**
   * Process a batch of events — run all handlers, then render once.
   *
   * This is the key optimization for press-and-hold / auto-repeat keys.
   * When events arrive faster than renders (e.g., 30/sec auto-repeat vs
   * 50ms renders), we batch all pending handlers into a single render pass.
   *
   * For a batch of 3 'j' presses: handler1 → handler2 → handler3 → render.
   * The cursor moves 3 positions, but we only pay one render cost.
   */
  async function processEventBatch(events: NamespacedEvent[]): Promise<Buffer | null> {
    if (shouldExit || events.length === 0) return null
    _renderCount = 0
    _eventStart = performance.now()

    // Intercept lifecycle keys (Ctrl+Z, Ctrl+C) BEFORE they reach app handlers.
    // These must be handled at the runtime level, not by individual components.
    if (!headless) {
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i]!
        if (event.type !== "term:key") continue
        const data = event.data as { input: string; key: Key }

        // Ctrl+Z: suspend (parseKey returns input="z" with key.ctrl=true)
        if (data.input === "z" && data.key.ctrl && suspendOption) {
          const prevented = onSuspendHook?.() === false
          if (!prevented) {
            // Remove this event from the batch
            events.splice(i, 1)
            const state = captureTerminalState({
              alternateScreen,
              cursorHidden: true,
              mouse: mouseEnabled,
              kitty: kittyEnabled,
              kittyFlags,
              bracketedPaste: true,
              rawMode: true,
              focusReporting: focusReportingEnabled,
            })
            performSuspend(state, stdout, stdin, () => {
              // After resume, trigger a full re-render
              runtime.invalidate()
              onResumeHook?.()
            })
          } else {
            events.splice(i, 1)
          }
        }

        // Ctrl+C: exit (parseKey returns input="c" with key.ctrl=true)
        if (data.input === "c" && data.key.ctrl && exitOnCtrlCOption) {
          const prevented = onInterruptHook?.() === false
          if (!prevented) {
            exit()
            return null
          }
          events.splice(i, 1)
        }
      }
      if (events.length === 0) return null
    }

    // Suppress subscription renders — the flush loop below handles everything.
    inEventHandler = true
    isRendering = true

    // Run all handlers — state mutations batch naturally in Zustand
    for (const event of events) {
      // Bridge key/paste events to RuntimeContext listeners (useInput consumers)
      if (event.type === "term:key") {
        const { input, key: parsedKey } = event.data as { input: string; key: Key }
        for (const listener of runtimeInputListeners) {
          listener(input, parsedKey)
        }
      } else if (event.type === "term:paste") {
        const { text } = event.data as { text: string }
        for (const listener of runtimePasteListeners) {
          listener(text)
        }
      }

      // If a listener called exit() (e.g., useInput handler returned "exit"),
      // stop processing events immediately — don't render or flush.
      if (shouldExit) {
        inEventHandler = false
        return null
      }

      const result = runEventHandler(event)
      if (result === false) {
        isRendering = false
        inEventHandler = false
        exit()
        return null
      }

      // Render barrier: if handler requested flush, render now before next event.
      // This ensures newly mounted components (e.g., InlineEditField) have their
      // refs set up before the next event handler runs.
      //
      // IMPORTANT: runtime.render() must be called here to keep the runtime's
      // prevBuffer in sync with _prevTermBuffer. Without this, the post-batch
      // doRender's dirty-row tracking (relative to _prevTermBuffer) would be
      // stale relative to runtime.prevBuffer, causing diffBuffers() to skip
      // all rows and produce an empty diff (0 bytes output).
      if (result === "flush") {
        pendingRerender = false
        currentBuffer = doRender()
        runtime.render(currentBuffer)
        // Flush effects so mounted components can set up refs
        await Promise.resolve()
        if (pendingRerender) {
          pendingRerender = false
          currentBuffer = doRender()
          runtime.render(currentBuffer)
        }
      }
    }

    // Clear deferred renders from handlers' setState calls — the explicit
    // doRender below picks up all state changes in one pass.
    pendingRerender = false

    // Explicit render — batches all handler state changes + flushes effects
    try {
      currentBuffer = doRender()
    } finally {
      isRendering = false
    }

    // Flush deferred re-renders from effects.
    // React's passive effects (useEffect) are scheduled during doRender
    // but flushed at the START of the next doRender (flushPassiveEffects).
    // The await drains the microtask queue so React's internally-queued
    // effect flush runs. Since inEventHandler=true, any setState from
    // effects just sets pendingRerender (no microtask render).
    let flushCount = 0
    const maxFlushes = 5
    while (flushCount < maxFlushes) {
      await Promise.resolve() // Drain microtask queue → passive effects flush
      if (!pendingRerender) break
      pendingRerender = false
      isRendering = true
      try {
        currentBuffer = doRender()
      } finally {
        isRendering = false
      }
      flushCount++
    }

    // When multiple doRender() calls happened (layout feedback, effects),
    // the final buffer's dirty rows only cover the LAST doRender's changes.
    // But runtime.render() diffs against its own prevBuffer (from the previous
    // event batch), which may be older. Rows changed in earlier doRender calls
    // but not the last one would be invisible to diffBuffers' dirty row scan,
    // causing those rows to be skipped → garbled terminal output.
    // Fix: mark all rows dirty so diffBuffers does a full scan.
    if (flushCount > 0) {
      currentBuffer._buffer.markAllRowsDirty()
    }

    inEventHandler = false
    const runtimeStart = performance.now()
    runtime.render(currentBuffer)
    const runtimeMs = performance.now() - runtimeStart
    if (_perfLog) {
      const totalMs = performance.now() - _eventStart
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/tmp/silvery-perf.log",
        `EVENT batch(${events.length} ${events[0]?.type}): ${totalMs.toFixed(1)}ms total, ${_renderCount} doRender() calls, runtime.render=${runtimeMs.toFixed(1)}ms\n---\n`,
      )
    }
    return currentBuffer
  }

  // Start event loop
  //
  // Event coalescing: when events arrive faster than renders, we batch
  // consecutive handler calls into a single render pass. This prevents
  // the "event backlog" problem where auto-repeat keys queue up faster
  // than they can be rendered (e.g., 30/sec auto-repeat vs 50ms renders).
  //
  // Strategy: collect events into a shared queue, run all pending handlers,
  // render once. This means pressing and holding 'j' processes 2-3 cursor
  // moves per render instead of 1, keeping up with auto-repeat.
  const eventQueue: NamespacedEvent[] = []
  let eventQueueResolve: (() => void) | null = null

  const eventLoop = async () => {
    // Merge all provider event streams
    const providerEventStreams = Object.entries(providers).map(([name, provider]) =>
      createProviderEventStream(name, provider),
    )

    const allEvents = merge(...providerEventStreams)

    // Pump events from async iterable into the shared queue
    const pumpEvents = async () => {
      try {
        for await (const event of takeUntil(allEvents, signal)) {
          eventQueue.push(event)
          if (eventQueueResolve) {
            const resolve = eventQueueResolve
            eventQueueResolve = null
            resolve()
          }
          if (shouldExit) break
        }
      } finally {
        // Signal end of events
        if (eventQueueResolve) {
          const resolve = eventQueueResolve
          eventQueueResolve = null
          resolve()
        }
      }
    }

    // Start pump in background
    pumpEvents().catch(console.error)

    try {
      while (!shouldExit && !signal.aborted) {
        // Wait for at least one event
        if (eventQueue.length === 0) {
          await new Promise<void>((resolve) => {
            eventQueueResolve = resolve
            signal.addEventListener("abort", () => resolve(), { once: true })
          })
        }

        if (shouldExit || signal.aborted) break
        if (eventQueue.length === 0) continue

        // Yield to microtask queue so the pump can push any additional
        // pending events before we drain. Without this, the first event
        // after idle always processes solo (1-event batch), even when
        // auto-repeat has queued multiple events in the term provider.
        await Promise.resolve()

        // Process all pending events — run handlers without rendering
        const buf = await processEventBatch(eventQueue.splice(0))
        if (buf) emitFrame(buf)
      }
    } finally {
      // Mark frames as done and notify waiters
      framesDone = true
      if (frameResolve) {
        const resolve = frameResolve
        frameResolve = null
        // Signal completion — resolve with a sentinel that next() will detect
        resolve(null as unknown as Buffer)
      }
      // Cleanup and resolve exit promise
      cleanup()
      exitResolve()
    }
  }

  // Start loop in background
  eventLoop().catch(console.error)

  // Return handle with async iteration
  const handle: AppHandle<S & I> = {
    get text() {
      return currentBuffer.text
    },
    get store() {
      return store
    },
    waitUntilExit() {
      return exitPromise
    },
    unmount() {
      exit()
    },
    [Symbol.dispose]() {
      exit()
    },
    async press(rawKey: string) {
      // Convert named keys to ANSI bytes (Kitty protocol when enabled)
      const ansiKey = useKittyMode ? keyToKittyAnsi(rawKey) : keyToAnsi(rawKey)
      const [input, parsedKey] = parseKey(ansiKey)

      // Intercept lifecycle keys (Ctrl+C) — same as processEventBatch but for
      // headless/press() path. parseKey returns input="c" with key.ctrl=true
      // for Ctrl+C (not the raw "\x03" byte).
      if (input === "c" && parsedKey.ctrl && exitOnCtrlCOption) {
        const prevented = onInterruptHook?.() === false
        if (!prevented) {
          exit()
          return
        }
      }

      // Bridge to RuntimeContext listeners (useInput consumers)
      for (const listener of runtimeInputListeners) {
        listener(input, parsedKey)
      }

      // Suppress subscription renders — flush loop below handles everything.
      inEventHandler = true
      isRendering = true

      // Focus system: dispatch key event and handle default navigation
      const focusResult = handleFocusNavigation(input, parsedKey, focusManager, container)
      if (focusResult === "consumed") {
        pendingRerender = false
        isRendering = false
        inEventHandler = false
        doRender()
        await Promise.resolve()
        return
      }

      // Dispatch to app handlers (namespaced + legacy)
      const handlerCtx = createHandlerContext(store, focusManager, container)
      if (dispatchKeyToHandlers(input, parsedKey, handlers, handlerCtx) === "exit") {
        isRendering = false
        inEventHandler = false
        exit()
        return
      }

      // Clear deferred renders — explicit render below batches all changes
      pendingRerender = false

      // Trigger re-render (batches handler state changes + flushes effects)
      try {
        currentBuffer = doRender()
      } finally {
        isRendering = false
      }
      // Flush deferred re-renders from effects.
      // await drains microtask queue → React passive effects flush.
      // Since inEventHandler=true, setState from effects just flags
      // pendingRerender (no microtask render).
      let flushCount = 0
      const maxFlushes = 5
      while (flushCount < maxFlushes) {
        await Promise.resolve()
        if (!pendingRerender) break
        pendingRerender = false
        isRendering = true
        try {
          currentBuffer = doRender()
        } finally {
          isRendering = false
        }
        flushCount++
      }
      inEventHandler = false
      runtime.render(currentBuffer)
    },

    [Symbol.asyncIterator](): AsyncIterator<Buffer> {
      return {
        async next(): Promise<IteratorResult<Buffer>> {
          if (framesDone || shouldExit) {
            return { done: true, value: undefined as unknown as Buffer }
          }

          // Wait for next frame from event loop
          const buf = await new Promise<Buffer>((resolve) => {
            // If already done, resolve immediately
            if (framesDone || shouldExit) {
              resolve(null as unknown as Buffer)
              return
            }
            frameResolve = resolve
          })

          // null sentinel means done
          if (!buf) {
            return { done: true, value: undefined as unknown as Buffer }
          }

          return { done: false, value: buf }
        },
        async return(): Promise<IteratorResult<Buffer>> {
          exit()
          return { done: true, value: undefined as unknown as Buffer }
        },
      }
    },
  }

  return handle
}
