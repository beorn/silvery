/**
 * createApp() - Layer 3 entry point for inkx-loop
 *
 * Provides Zustand store integration with unified providers.
 * Providers are stores (getState/subscribe) + event sources (events()).
 *
 * @example
 * ```tsx
 * import { createApp, useApp, createTermProvider } from 'inkx/runtime'
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

import { createTerm } from "chalkx"
import { AppContext, FocusManagerContext, StdoutContext, TermContext } from "../context.js"
import { createFocusManager } from "../focus-manager.js"
import { createFocusEvent, createKeyEvent, dispatchFocusEvent, dispatchKeyEvent } from "../focus-events.js"
import { findByTestID } from "../focus-queries.js"
import { executeRender } from "../pipeline/index.js"
import { createContainer, createFiberRoot, getContainerRoot, reconciler } from "../reconciler.js"
import { map, merge, takeUntil } from "../streams/index.js"
import { createBuffer } from "./create-buffer.js"
import { createRuntime } from "./create-runtime.js"
import { keyToAnsi, keyToKittyAnsi } from "../keys.js"
import { parseKey } from "./keys.js"
import { ensureLayoutEngine } from "./layout.js"
import { createMouseEventProcessor, processMouseEvent } from "../mouse-events.js"
import { enableKittyKeyboard, disableKittyKeyboard, KittyFlags, enableMouse, disableMouse } from "../output.js"
import { detectKittyFromStdio } from "../kitty-detect.js"
import { type TermProvider, createTermProvider } from "./term-provider.js"
import type { Buffer, Dims, Provider, RenderTarget } from "./types.js"

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
 */
export interface EventHandlerContext<S> {
  set: StoreApi<S>["setState"]
  get: StoreApi<S>["getState"]
  /** The tree-based focus manager */
  focusManager: import("../focus-manager.js").FocusManager
  /** Convenience: focus a node by testID */
  focus(testID: string): void
  /** Get the focus path from focused node to root */
  getFocusPath(): string[]
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
 * Namespaced event from a provider.
 */
interface NamespacedEvent {
  type: string
  provider: string
  event: string
  data: unknown
}

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
    ...injectValues
  } = options

  const headless = explicitCols != null && explicitRows != null && !explicitStdout
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
    // In headless mode, provide mock streams so termProvider doesn't touch real stdin/stdout
    const termStdout = headless
      ? ({
          columns: cols,
          rows,
          write: () => true,
          isTTY: false,
          on: () => termStdout,
          off: () => termStdout,
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
  // ANSI Trace: INKX_TRACE=1 logs all stdout writes with decoded sequences
  // ========================================================================
  const _ansiTrace = !headless && process.env?.INKX_TRACE === "1"

  let _traceSeq = 0
  const _traceStart = performance.now()
  let _origStdoutWrite: typeof process.stdout.write | undefined

  if (_ansiTrace) {
    const fs =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs") as typeof import("node:fs")
    fs.writeFileSync("/tmp/inkx-trace.log", `=== INKX TRACE START ===\n`)

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
        "/tmp/inkx-trace.log",
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
        write() {},
        getDims: () => currentDims,
      }
    : {
        write(frame: string): void {
          if (_perfLog) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            require("node:fs").appendFileSync(
              "/tmp/inkx-perf.log",
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

  // Create runtime
  const runtime = createRuntime({ target, signal })

  // Cleanup state
  let cleanedUp = false
  let storeUnsubscribeFn: (() => void) | null = null
  // Track protocol state for cleanup (set during setup, read during cleanup)
  let kittyEnabled = false
  let mouseEnabled = false

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

  // Mouse event processor for DOM-level dispatch (with click-to-focus)
  const mouseEventState = createMouseEventProcessor({ focusManager })

  // Cleanup function - idempotent, can be called from exit() or finally
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true

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
      // Disable mouse tracking before restoring terminal
      if (mouseEnabled) stdout.write(disableMouse())
      // Disable Kitty keyboard protocol before restoring terminal
      if (kittyEnabled) stdout.write(disableKittyKeyboard())
      stdout.write("\x1b[?25h\x1b[0m\n")
      if (alternateScreen) stdout.write("\x1b[?1049l")
    }
  }

  // Exit/pause/resume - mutable ref so AppContext always sees latest values.
  // Object literal captures values at creation time, so we use a mutable
  // object whose properties are updated in-place after assignment.
  const appContextRef: {
    exit: () => void
    pause?: () => void
    resume?: () => void
  } = {
    exit: () => {},
    pause: undefined,
    resume: undefined,
  }
  let exit: () => void

  // Create InkxNode container
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

  // Wrap element with all required providers
  const wrappedElement = (
    <TermContext.Provider value={mockTerm}>
      <AppContext.Provider value={appContextRef}>
        <StdoutContext.Provider value={{ stdout: mockStdout, write: () => {} }}>
          <FocusManagerContext.Provider value={focusManager}>
            <StoreContext.Provider value={store as StoreApi<unknown>}>{element}</StoreContext.Provider>
          </FocusManagerContext.Provider>
        </StdoutContext.Provider>
      </AppContext.Provider>
    </TermContext.Provider>
  )

  // Performance instrumentation — count renders per event
  let _renderCount = 0
  let _eventStart = 0
  const _perfLog = typeof process !== "undefined" && process.env?.DEBUG?.includes("inkx:perf")

  // Incremental rendering — store previous pipeline buffer for diffing.
  // Without this, every render walks the entire node tree from scratch.
  // Set INKX_NO_INCREMENTAL=1 to disable (for debugging blank screen issues).
  const _noIncremental = process.env?.INKX_NO_INCREMENTAL === "1"
  let _prevTermBuffer: import("../buffer.js").TerminalBuffer | null = null

  // Helper to render and get text
  function doRender(): Buffer {
    _renderCount++
    if (_ansiTrace) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/tmp/inkx-trace.log",
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

    // Invalidate prevBuffer on dimension change (resize).
    // Both pipeline-level (_prevTermBuffer) and runtime-level (runtime.invalidate())
    // must be cleared — otherwise the ANSI diff compares different-sized buffers.
    if (_prevTermBuffer && (dims.cols !== _prevTermBuffer.width || dims.rows !== _prevTermBuffer.height)) {
      _prevTermBuffer = null
      runtime.invalidate()
    }

    // Clear diagnostic arrays before the render so we capture only this render's data
    ;(globalThis as any).__inkx_content_all = undefined
    ;(globalThis as any).__inkx_node_trace = undefined

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

    const { buffer: termBuffer } = executeRender(
      rootNode,
      dims.cols,
      dims.rows,
      _noIncremental ? null : _prevTermBuffer,
    )
    if (!_noIncremental) _prevTermBuffer = termBuffer
    const pipelineMs = performance.now() - pipelineStart

    // INKX_CHECK_INCREMENTAL: compare incremental render against fresh render.
    // createApp bypasses Scheduler/Renderer which have this check built-in,
    // so we add it here to catch incremental rendering bugs at runtime.
    const strictEnv =
      typeof process !== "undefined" && (process.env?.INKX_STRICT || process.env?.INKX_CHECK_INCREMENTAL)
    if (strictEnv && strictEnv !== "0" && strictEnv !== "false" && _renderCount > 1) {
      const { buffer: freshBuffer } = executeRender(rootNode, dims.cols, dims.rows, null, {
        skipLayoutNotifications: true,
      })
      const { cellEquals, bufferToText } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("../buffer.js") as typeof import("../buffer.js")
      for (let y = 0; y < termBuffer.height; y++) {
        for (let x = 0; x < termBuffer.width; x++) {
          const a = termBuffer.getCell(x, y)
          const b = freshBuffer.getCell(x, y)
          if (!cellEquals(a, b)) {
            const incText = bufferToText(termBuffer)
            const freshText = bufferToText(freshBuffer)
            const cellStr = (c: typeof a) =>
              `char=${JSON.stringify(c.char)} fg=${c.fg} bg=${c.bg} ulColor=${c.underlineColor} wide=${c.wide} cont=${c.continuation} attrs={bold=${c.attrs.bold},dim=${c.attrs.dim},italic=${c.attrs.italic},ul=${c.attrs.underline},ulStyle=${c.attrs.underlineStyle},blink=${c.attrs.blink},inv=${c.attrs.inverse},hidden=${c.attrs.hidden},strike=${c.attrs.strikethrough}}`
            // Dump content phase stats for diagnosis
            const contentAll = (globalThis as any).__inkx_content_all as unknown[]
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
              `INKX_CHECK_INCREMENTAL (createApp): MISMATCH at (${x}, ${y}) on render #${_renderCount}\n` +
              `  incremental: ${cellStr(a)}\n` +
              `  fresh:       ${cellStr(b)}` +
              statsStr +
              // Per-node trace
              (() => {
                const traces = (globalThis as any).__inkx_node_trace as unknown[][] | undefined
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
              `\n--- incremental ---\n${incText}\n--- fresh ---\n${freshText}`
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            require("node:fs").appendFileSync("/tmp/inkx-perf.log", msg + "\n")
            // Also throw to make it visible
            throw new Error(msg)
          }
        }
      }
      if (_perfLog) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("node:fs").appendFileSync(
          "/tmp/inkx-perf.log",
          `INKX_CHECK_INCREMENTAL (createApp): render #${_renderCount} OK\n`,
        )
      }
    }

    const buf = createBuffer(termBuffer, rootNode)
    if (_perfLog) {
      const renderDuration = performance.now() - renderStart
      const phases = (globalThis as any).__inkx_last_pipeline
      const detail = (globalThis as any).__inkx_content_detail
      const phaseStr = phases
        ? ` [measure=${phases.measure.toFixed(1)} layout=${phases.layout.toFixed(1)} content=${phases.content.toFixed(1)} output=${phases.output.toFixed(1)}]`
        : ""
      const detailStr = detail
        ? ` {visited=${detail.nodesVisited} rendered=${detail.nodesRendered} skipped=${detail.nodesSkipped} noPrev=${detail.noPrevBuffer ?? 0} dirty=${detail.flagContentDirty ?? 0} paint=${detail.flagPaintDirty ?? 0} layoutChg=${detail.flagLayoutChanged ?? 0} subtree=${detail.flagSubtreeDirty ?? 0} children=${detail.flagChildrenDirty ?? 0} childPos=${detail.flagChildPositionChanged ?? 0} scroll=${detail.scrollContainerCount ?? 0}/${detail.scrollViewportCleared ?? 0}${detail.scrollClearReason ? `(${detail.scrollClearReason})` : ""}}${detail.cascadeNodes ? ` CASCADE[minDepth=${detail.cascadeMinDepth} ${detail.cascadeNodes}]` : ""}`
        : ""
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/tmp/inkx-perf.log",
        `doRender #${_renderCount}: ${renderDuration.toFixed(1)}ms (reconcile=${reconcileMs.toFixed(1)}ms pipeline=${pipelineMs.toFixed(1)}ms ${dims.cols}x${dims.rows})${phaseStr}${detailStr}\n`,
      )
    }
    return buf
  }

  // Initial render
  if (_ansiTrace) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").appendFileSync("/tmp/inkx-trace.log", "=== INITIAL RENDER ===\n")
  }
  currentBuffer = doRender()

  // Enter alternate screen if requested, then clear and hide cursor
  if (!headless) {
    if (_ansiTrace) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync("/tmp/inkx-trace.log", "=== ALT SCREEN + CLEAR ===\n")
    }
    if (alternateScreen) stdout.write("\x1b[?1049h")
    stdout.write("\x1b[2J\x1b[H\x1b[?25l")

    // Kitty keyboard protocol
    if (kittyOption != null && kittyOption !== false) {
      if (kittyOption === true) {
        // Auto-detect: probe terminal, enable if supported
        const result = await detectKittyFromStdio(stdout, stdin as NodeJS.ReadStream)
        if (result.supported) {
          stdout.write(enableKittyKeyboard(KittyFlags.DISAMBIGUATE))
          kittyEnabled = true
        }
      } else {
        // Explicit flags — enable directly without detection
        stdout.write(enableKittyKeyboard(kittyOption as 1))
        kittyEnabled = true
      }
    } else {
      // Legacy behavior: always enable Kitty DISAMBIGUATE
      stdout.write(enableKittyKeyboard(KittyFlags.DISAMBIGUATE))
      kittyEnabled = true
    }

    // Mouse tracking
    if (mouseOption) {
      stdout.write(enableMouse())
      mouseEnabled = true
    }
  }
  if (_ansiTrace) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").appendFileSync("/tmp/inkx-trace.log", "=== RUNTIME.RENDER (initial) ===\n")
  }
  runtime.render(currentBuffer)
  if (_perfLog) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").appendFileSync(
      "/tmp/inkx-perf.log",
      `STARTUP: initial render done (render #${_renderCount}, incremental=${!_noIncremental})\n`,
    )
  }

  // Assign pause/resume now that doRender and runtime are available.
  // Update appContextRef in-place so useApp() sees the latest values.
  if (!headless) {
    appContextRef.pause = () => {
      renderPaused = true
    }
    appContextRef.resume = () => {
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
  appContextRef.exit = exit

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
        "/tmp/inkx-trace.log",
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
                "/tmp/inkx-perf.log",
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
        "/tmp/inkx-perf.log",
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
    const namespacedKey = event.type
    const namespacedHandler = handlers?.[namespacedKey as keyof typeof handlers]

    if (namespacedHandler && typeof namespacedHandler === "function") {
      const result = (namespacedHandler as EventHandler<unknown, S & I>)(event.data, {
        set: store.setState,
        get: store.getState,
        focusManager,
        focus(testID: string) {
          const root = getContainerRoot(container)
          focusManager.focusById(testID, root, "programmatic")
        },
        getFocusPath() {
          const root = getContainerRoot(container)
          return focusManager.getFocusPath(root)
        },
      })
      if (result === "exit") {
        return false
      }
      if (result === "flush") {
        return "flush"
      }
    }

    // DOM-level mouse event dispatch for mouse events
    if (event.event === "mouse" && event.data) {
      const mouseData = event.data as {
        button: number
        x: number
        y: number
        action: string
        delta?: number
        shift: boolean
        meta: boolean
        ctrl: boolean
      }

      const root = getContainerRoot(container)

      processMouseEvent(
        mouseEventState,
        {
          button: mouseData.button,
          x: mouseData.x,
          y: mouseData.y,
          action: mouseData.action as "down" | "up" | "move" | "wheel",
          delta: mouseData.delta,
          shift: mouseData.shift,
          meta: mouseData.meta,
          ctrl: mouseData.ctrl,
        },
        root,
      )
    }

    return true
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

    // Suppress subscription renders — the flush loop below handles everything.
    inEventHandler = true
    isRendering = true

    // Run all handlers — state mutations batch naturally in Zustand
    for (const event of events) {
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

    inEventHandler = false
    const runtimeStart = performance.now()
    runtime.render(currentBuffer)
    const runtimeMs = performance.now() - runtimeStart
    if (_perfLog) {
      const totalMs = performance.now() - _eventStart
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/tmp/inkx-perf.log",
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

      // Suppress subscription renders — flush loop below handles everything.
      inEventHandler = true
      isRendering = true

      // Focus system: dispatch key event to focused node first
      if (focusManager.activeElement) {
        const keyEvent = createKeyEvent(input, parsedKey, focusManager.activeElement)
        dispatchKeyEvent(keyEvent)

        // If focus system consumed the event, skip app handlers
        if (keyEvent.propagationStopped || keyEvent.defaultPrevented) {
          pendingRerender = false
          isRendering = false
          inEventHandler = false
          doRender()
          await Promise.resolve()
          return
        }

        // Default focus navigation (Tab, Shift+Tab, Enter for scope, Escape for scope exit)
        const root = getContainerRoot(container)
        if (parsedKey.tab && !parsedKey.shift) {
          focusManager.focusNext(root)
          pendingRerender = false
          isRendering = false
          inEventHandler = false
          doRender()
          await Promise.resolve()
          return
        } else if (parsedKey.tab && parsedKey.shift) {
          focusManager.focusPrev(root)
          pendingRerender = false
          isRendering = false
          inEventHandler = false
          doRender()
          await Promise.resolve()
          return
        } else if (parsedKey.return) {
          // Enter: if focused element has focusScope, enter that scope
          const activeEl = focusManager.activeElement
          if (activeEl) {
            const props = activeEl.props as Record<string, unknown>
            const testID = typeof props.testID === "string" ? props.testID : null
            if (props.focusScope && testID) {
              focusManager.enterScope(testID)
              focusManager.focusNext(root, activeEl)
              pendingRerender = false
              isRendering = false
              inEventHandler = false
              doRender()
              await Promise.resolve()
              return
            }
          }
        } else if (parsedKey.escape && focusManager.scopeStack.length > 0) {
          // Escape: exit the current focus scope
          const scopeId = focusManager.scopeStack[focusManager.scopeStack.length - 1]!
          focusManager.exitScope()
          const scopeNode = findByTestID(root, scopeId)
          if (scopeNode) {
            focusManager.focus(scopeNode, "keyboard")
          }
          pendingRerender = false
          isRendering = false
          inEventHandler = false
          doRender()
          await Promise.resolve()
          return
        }
      }

      const handlerCtx = {
        set: store.setState,
        get: store.getState,
        focusManager,
        focus(testID: string) {
          const root = getContainerRoot(container)
          focusManager.focusById(testID, root, "programmatic")
        },
        getFocusPath() {
          const root = getContainerRoot(container)
          return focusManager.getFocusPath(root)
        },
      }

      // Simulate term:key event through handlers
      const namespacedHandler = handlers?.["term:key" as keyof typeof handlers]
      if (namespacedHandler && typeof namespacedHandler === "function") {
        const result = (namespacedHandler as EventHandler<unknown, S & I>)({ input, key: parsedKey }, handlerCtx)
        if (result === "exit") {
          isRendering = false
          inEventHandler = false
          exit()
          return
        }
      }

      // Legacy handler
      if ((handlers as any)?.key) {
        const result = (handlers as any).key(input, parsedKey, handlerCtx)
        if (result === "exit") {
          isRendering = false
          inEventHandler = false
          exit()
          return
        }
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
