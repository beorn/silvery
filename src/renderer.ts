/**
 * Unified Render API for inkx
 *
 * Composable primitives:
 * - render(element, opts | store) — always sync, returns full App
 * - createStore(providers) — flattens providers into { cols, rows, events() }
 * - run(app, events?) — event loop driver (sync or async)
 * - createApp(element, providers) — sugar: render + createStore + run
 * - createRenderer(opts | store) — factory with auto-cleanup
 */

import { EventEmitter } from "node:events"
import React, { type ReactElement, type ReactNode, act } from "react"
import { type App, buildApp } from "./app.js"
import { type TerminalBuffer, cellEquals } from "./buffer.js"
import {
  AppContext,
  EventsContext,
  InputContext,
  StdoutContext,
  TermContext,
} from "./context.js"
import {
  type LayoutEngine,
  ensureDefaultLayoutEngine,
  isLayoutEngineInitialized,
  setLayoutEngine,
} from "./layout-engine.js"
import { executeRender } from "./pipeline.js"
import { createContainer, getContainerRoot, reconciler } from "./reconciler.js"

import { createTerm } from "chalkx"
import { bufferToText } from "./buffer.js"
import {
  buildMismatchContext,
  formatMismatchContext,
} from "./debug-mismatch.js"
import { keyToAnsi } from "./keys.js"
import { IncrementalRenderMismatchError } from "./scheduler.js"
import { debugTree } from "./testing/debug.js"

// ============================================================================
// Defensive Guards
// ============================================================================

/**
 * Track all active (mounted) render instances to detect leaks.
 * Uses a Set of WeakRefs so GC can clean up unreferenced apps.
 */
const activeRenders = new Set<WeakRef<{ unmount: () => void; id: number }>>()
let renderIdCounter = 0

/**
 * Maximum number of active render instances before throwing.
 * Set high to allow large test files (each test may create a render without unmount),
 * but catch genuine leaks like infinite loops creating renders.
 */
const ACTIVE_RENDER_LEAK_THRESHOLD = 1000

/**
 * Prune GC'd entries from activeRenders and return live count.
 */
function pruneAndCountActiveRenders(): number {
  let count = 0
  for (const ref of activeRenders) {
    if (ref.deref() === undefined) {
      activeRenders.delete(ref)
    } else {
      count++
    }
  }
  return count
}

/**
 * Assert that the layout engine is initialized before rendering.
 * This catches the common mistake of calling render() without await ensureEngine().
 */
function assertLayoutEngine(): void {
  if (!isLayoutEngineInitialized()) {
    throw new Error(
      "inkx: Layout engine not initialized. " +
        "Call `await ensureEngine()` before render(), or use the testing module " +
        "which initializes it automatically via top-level await.",
    )
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Options for headless render (no terminal).
 */
export interface RenderOptions {
  /** Terminal width for layout. Default: 80 */
  cols?: number
  /** Terminal height for layout. Default: 24 */
  rows?: number
  /** Layout engine to use. Default: current global engine */
  layoutEngine?: LayoutEngine
  /** Enable debug output. Default: false */
  debug?: boolean
  /** Enable incremental rendering. Default: true */
  incremental?: boolean
}

/**
 * Store — the TermDef-like environment for render().
 * Provides cols, rows, and optionally an event stream for interactive mode.
 */
export interface Store {
  /** Terminal columns */
  readonly cols: number
  /** Terminal rows */
  readonly rows: number
  /** Async event stream (if present, enables interactive mode) */
  events?(): AsyncIterable<StoreEvent>
}

/**
 * Event from a store's event stream.
 */
export interface StoreEvent {
  type: string
  data: unknown
}

/**
 * Provider options for createStore().
 */
export interface StoreOptions {
  /** Terminal columns. Default: 80 */
  cols?: number
  /** Terminal rows. Default: 24 */
  rows?: number
  /** Event source for interactive mode */
  events?: AsyncIterable<StoreEvent>
}

// ============================================================================
// Module Initialization
// ============================================================================

// Layout engine initialization promise (lazy)
let engineReady: Promise<void> | null = null

/**
 * Ensure layout engine is initialized (async, cached).
 */
export async function ensureEngine(): Promise<void> {
  if (isLayoutEngineInitialized()) return
  if (!engineReady) {
    engineReady = ensureDefaultLayoutEngine()
  }
  await engineReady
}

// ============================================================================
// render() — sync, returns full App
// ============================================================================

/**
 * Internal state for a render instance.
 */
interface RenderInstance {
  frames: string[]
  container: ReturnType<typeof createContainer>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- React reconciler internal type
  fiberRoot: any
  prevBuffer: TerminalBuffer | null
  mounted: boolean
  /** True while inside act() or doRender() — detects re-entrant calls */
  rendering: boolean
  columns: number
  rows: number
  inputEmitter: EventEmitter
  debug: boolean
  incremental: boolean
  /** Render count for INKX_STRICT checking (skip first render) */
  renderCount: number
}

function isStore(arg: unknown): arg is Store {
  // Store has cols and rows as required (not optional) properties.
  // RenderOptions has them as optional. Disambiguate by checking for
  // Store-only traits: no layoutEngine, no debug, no incremental.
  if (arg === null || typeof arg !== "object") return false
  const obj = arg as Record<string, unknown>
  return (
    typeof obj.cols === "number" &&
    typeof obj.rows === "number" &&
    !("layoutEngine" in obj) &&
    !("debug" in obj) &&
    !("incremental" in obj)
  )
}

/**
 * Render a React element synchronously. Returns a full App with locators,
 * press(), text, ansi, etc.
 *
 * Layout engine must be initialized before calling (use ensureEngine() or
 * the top-level await in testing module).
 *
 * Overloads:
 * - render(element, { cols, rows }) — headless with dimensions
 * - render(element, store) — with a Store from createStore()
 *
 * @example
 * ```tsx
 * const app = render(<Counter />, { cols: 80, rows: 24 })
 * expect(app.text).toContain('Count: 0')
 * await app.press('j')
 * expect(app.text).toContain('Count: 1')
 * ```
 */
export function render(
  element: ReactElement,
  optsOrStore: RenderOptions | Store = {},
): App {
  // Guard: layout engine must be initialized
  assertLayoutEngine()

  const storeMode = isStore(optsOrStore)
  const cols = storeMode ? optsOrStore.cols : (optsOrStore.cols ?? 80)
  const rows = storeMode ? optsOrStore.rows : (optsOrStore.rows ?? 24)
  const debug = storeMode ? false : (optsOrStore.debug ?? false)
  // Incremental rendering is enabled by default for all renders
  // Store mode also supports incremental - the RenderInstance tracks prevBuffer
  const incremental = storeMode ? true : (optsOrStore.incremental ?? true)

  // Guard: detect render leaks (absurd number of active instances)
  const liveCount = pruneAndCountActiveRenders()
  if (liveCount >= ACTIVE_RENDER_LEAK_THRESHOLD) {
    throw new Error(
      `inkx: ${liveCount} active render instances without unmount(). ` +
        "This is a render leak. Use createRenderer() for auto-cleanup, " +
        "or call unmount() when done with each render.",
    )
  }

  // Set layout engine if provided
  if (!storeMode && optsOrStore.layoutEngine) {
    setLayoutEngine(optsOrStore.layoutEngine)
  }

  // Unique ID for this render instance (for tracking/debugging)
  const renderId = ++renderIdCounter

  const instance: RenderInstance = {
    frames: [],
    container: null as unknown as ReturnType<typeof createContainer>,
    fiberRoot: null,
    prevBuffer: null,
    mounted: true,
    rendering: false,
    columns: cols,
    rows: rows,
    inputEmitter: new EventEmitter(),
    debug,
    incremental,
    renderCount: 0,
  }

  // Create container (onRender callback not needed for sync rendering)
  instance.container = createContainer(() => {})

  instance.fiberRoot = reconciler.createContainer(
    instance.container,
    1, // ConcurrentRoot
    null, // hydrationCallbacks
    false, // isStrictMode
    null, // concurrentUpdatesByDefaultOverride
    "", // identifierPrefix
    () => {}, // onUncaughtError
    () => {}, // onCaughtError
    () => {}, // onRecoverableError
    null, // onDefaultTransitionIndicator
  )

  // Track exit state
  let exitCalledFlag = false
  let exitErrorValue: Error | undefined

  const handleExit = (error?: Error) => {
    exitCalledFlag = true
    exitErrorValue = error
    if (debug) {
      console.log(
        "[inkx] exit() called",
        error ? `with error: ${error.message}` : "",
      )
    }
  }

  // Create mock stdout
  const mockStdout = {
    columns: instance.columns,
    rows: instance.rows,
    write: () => true,
    isTTY: true,
    on: () => mockStdout,
    off: () => mockStdout,
    once: () => mockStdout,
    removeListener: () => mockStdout,
    addListener: () => mockStdout,
  } as unknown as NodeJS.WriteStream

  // Create mock term
  const mockTerm = createTerm({ level: 3, columns: cols })

  // Mock events for interactive mode (signals to useInput that input is enabled)
  const mockEvents: AsyncIterable<import("./types.js").Event> = {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<IteratorResult<import("./types.js").Event>>(() => {}),
    }),
  }

  // Wrap element with contexts
  function wrapWithContexts(el: ReactElement): ReactElement {
    return React.createElement(
      TermContext.Provider,
      { value: mockTerm },
      React.createElement(
        EventsContext.Provider,
        { value: mockEvents },
        React.createElement(
          AppContext.Provider,
          { value: { exit: handleExit } },
          React.createElement(
            StdoutContext.Provider,
            { value: { stdout: mockStdout, write: () => {} } },
            React.createElement(
              InputContext.Provider,
              {
                value: {
                  eventEmitter: instance.inputEmitter,
                  exitOnCtrlC: false,
                },
              },
              el,
            ),
          ),
        ),
      ),
    )
  }

  // Check INKX_STRICT for automatic incremental checking (like scheduler does)
  // Note: "0" and "false" are treated as disabled
  const strictEnv =
    process.env.INKX_STRICT || process.env.INKX_CHECK_INCREMENTAL
  const strictMode =
    incremental && strictEnv && strictEnv !== "0" && strictEnv !== "false"

  // Render function that executes the pipeline
  function doRender(): string {
    const root = getContainerRoot(instance.container)
    const { output, buffer } = executeRender(
      root,
      instance.columns,
      instance.rows,
      incremental ? instance.prevBuffer : null,
    )
    instance.prevBuffer = buffer
    instance.renderCount++

    // INKX_STRICT: Compare incremental vs fresh on every render (like scheduler)
    // Skip first render (nothing to compare against)
    if (strictMode && instance.renderCount > 1) {
      const freshBuffer = doFreshRender()
      for (let y = 0; y < buffer.height; y++) {
        for (let x = 0; x < buffer.width; x++) {
          const a = buffer.getCell(x, y)
          const b = freshBuffer.getCell(x, y)
          if (!cellEquals(a, b)) {
            // Build rich debug context
            const ctx = buildMismatchContext(
              root,
              x,
              y,
              a,
              b,
              instance.renderCount,
            )
            const debugInfo = formatMismatchContext(ctx)

            // Include text output for full picture
            const incText = bufferToText(buffer)
            const freshText = bufferToText(freshBuffer)
            const msg =
              debugInfo +
              `--- incremental ---\n${incText}\n--- fresh ---\n${freshText}`
            throw new IncrementalRenderMismatchError(msg)
          }
        }
      }
    }

    return output
  }

  // Fresh render: renders from scratch without updating incremental state
  function doFreshRender(): TerminalBuffer {
    const root = getContainerRoot(instance.container)
    const { buffer } = executeRender(
      root,
      instance.columns,
      instance.rows,
      null,
      {
        skipLayoutNotifications: true,
        skipScrollStateUpdates: true,
      },
    )
    return buffer
  }

  // Synchronously update React tree within act()
  instance.rendering = true
  try {
    withActEnvironment(() => {
      act(() => {
        reconciler.updateContainerSync(
          wrapWithContexts(element),
          instance.fiberRoot,
          null,
          null,
        )
        reconciler.flushSyncWork()
      })
    })
  } finally {
    instance.rendering = false
  }

  // Execute the render pipeline
  const output = doRender()
  instance.frames.push(output)

  if (debug) {
    console.log("[inkx] Initial render:", output)
  }

  // Helper functions for App
  const getContainer = () => getContainerRoot(instance.container)
  const getBuffer = () => instance.prevBuffer

  const sendInput = (data: string) => {
    if (!instance.mounted) {
      throw new Error("Cannot write to stdin after unmount")
    }
    if (instance.rendering) {
      throw new Error(
        "inkx: Re-entrant render detected. " +
          "Cannot call press()/stdin.write() from inside a React render or effect. " +
          "Use setTimeout or an event handler instead.",
      )
    }
    instance.rendering = true
    try {
      withActEnvironment(() => {
        act(() => {
          instance.inputEmitter.emit("input", data)
        })
      })
    } finally {
      instance.rendering = false
    }
    // doRender() handles INKX_STRICT checking internally
    const newFrame = doRender()
    instance.frames.push(newFrame)
    if (debug) {
      console.log("[inkx] stdin.write:", newFrame)
    }
  }

  const rerenderFn = (newElement: ReactNode) => {
    if (!instance.mounted) {
      throw new Error("Cannot rerender after unmount")
    }
    if (instance.rendering) {
      throw new Error(
        "inkx: Re-entrant render detected. " +
          "Cannot call rerender() from inside a React render or effect.",
      )
    }
    instance.rendering = true
    try {
      withActEnvironment(() => {
        act(() => {
          reconciler.updateContainerSync(
            wrapWithContexts(newElement as ReactElement),
            instance.fiberRoot,
            null,
            null,
          )
          reconciler.flushSyncWork()
        })
      })
    } finally {
      instance.rendering = false
    }
    const newFrame = doRender()
    instance.frames.push(newFrame)
    if (debug) {
      console.log("[inkx] Rerender:", newFrame)
    }
  }

  // Track this render for leak detection
  const renderTracker = { unmount: () => {}, id: renderId }
  const renderRef = new WeakRef(renderTracker)
  activeRenders.add(renderRef)

  const unmountFn = () => {
    if (!instance.mounted) {
      throw new Error("Already unmounted")
    }
    withActEnvironment(() => {
      act(() => {
        reconciler.updateContainer(null, instance.fiberRoot, null, () => {})
      })
    })
    instance.mounted = false
    instance.inputEmitter.removeAllListeners()

    // Untrack this render
    activeRenders.delete(renderRef)

    if (debug) {
      console.log("[inkx] Unmounted")
    }
  }
  renderTracker.unmount = unmountFn

  const clearFn = () => {
    instance.frames.length = 0
    instance.prevBuffer = null
  }

  const debugFn = () => {
    console.log(debugTree(getContainerRoot(instance.container)))
  }

  // Build unified App instance
  return buildApp({
    getContainer,
    getBuffer,
    sendInput,
    rerender: rerenderFn,
    unmount: unmountFn,
    waitUntilExit: () => Promise.resolve(),
    clear: clearFn,
    exitCalled: () => exitCalledFlag,
    exitError: () => exitErrorValue,
    freshRender: doFreshRender,
    debugFn,
    frames: instance.frames,
    columns: cols,
    rows: rows,
  })
}

// ============================================================================
// createStore() — flatten providers into { cols, rows, events() }
// ============================================================================

/**
 * Create a Store from provider options.
 *
 * A Store is the TermDef-like environment: cols, rows, and optionally events.
 *
 * @example
 * ```tsx
 * const store = createStore({ cols: 80, rows: 24 })
 * const app = render(<App />, store)
 * ```
 */
export function createStore(options: StoreOptions = {}): Store {
  const { cols = 80, rows = 24, events: eventsSource } = options

  const store: Store = {
    cols,
    rows,
  }

  if (eventsSource) {
    store.events = () => eventsSource
  }

  return store
}

// ============================================================================
// createRenderer() — factory with auto-cleanup
// ============================================================================

/**
 * Per-render overrides for createRenderer's returned function.
 */
export interface PerRenderOptions {
  /** Enable incremental rendering for this render. */
  incremental?: boolean
}

/**
 * Create a render function that auto-cleans previous renders.
 *
 * By default, incremental rendering is ENABLED for test renders.
 * This matches production behavior (live scheduler uses incremental)
 * and enables withDiagnostics to catch incremental vs fresh mismatches.
 *
 * @example
 * ```tsx
 * const render = createRenderer({ cols: 80, rows: 24 })
 * const app1 = render(<Foo />)  // incremental: true by default
 * const app2 = render(<Bar />)  // unmounts app1
 *
 * // Explicitly disable incremental if needed
 * const render2 = createRenderer({ cols: 80, rows: 24, incremental: false })
 * ```
 */
export function createRenderer(
  optsOrStore: RenderOptions | Store = {},
): (el: ReactElement, overrides?: PerRenderOptions) => App {
  let current: App | null = null

  // Default to incremental: true for test renders (matches production behavior)
  // User can explicitly pass incremental: false to disable
  // Note: When passed a Store-like object (cols/rows only), convert to RenderOptions with incremental
  const baseOpts = isStore(optsOrStore)
    ? { incremental: true, cols: optsOrStore.cols, rows: optsOrStore.rows }
    : { incremental: true, ...optsOrStore }

  return (element: ReactElement, overrides?: PerRenderOptions): App => {
    if (current) {
      try {
        current.unmount()
      } catch {
        // Already unmounted
      }
    }
    let opts = baseOpts
    if (overrides && !isStore(opts)) {
      opts = { ...opts, ...overrides }
    }
    current = render(element, opts)
    return current
  }
}

// ============================================================================
// run() — event loop driver
// ============================================================================

/**
 * Result of run() with sync events — iterable over events.
 */
export interface SyncRunResult extends Iterable<string> {
  /** Current rendered text */
  readonly text: string
  /** The app being driven */
  readonly app: App
}

/**
 * Result of run() with async events — async iterable and awaitable.
 */
export interface AsyncRunResult
  extends AsyncIterable<string>, PromiseLike<void> {
  /** Current rendered text */
  readonly text: string
  /** The app being driven */
  readonly app: App
  /** Unmount and stop the event loop */
  unmount(): void
}

/**
 * Drive an App with events.
 *
 * - `run(app, ['j', 'k', 'Enter'])` — sync, explicit key events
 * - `run(app, syncIterable)` — sync iteration over events
 * - `await run(app)` — async, reads events from store (if rendered with one)
 * - `for await (const text of run(app, asyncEvents))` — async iteration
 *
 * @example
 * ```tsx
 * const app = render(<Counter />, { cols: 80, rows: 24 })
 * run(app, ['j', 'k', 'Enter'])
 * expect(app.text).toContain('Count: 2')
 * ```
 */
export function run(app: App, events: string[]): SyncRunResult
export function run(app: App, events: Iterable<string>): SyncRunResult
export function run(app: App, events?: AsyncIterable<string>): AsyncRunResult
export function run(
  app: App,
  events?: string[] | Iterable<string> | AsyncIterable<string>,
): SyncRunResult | AsyncRunResult {
  // Sync path: array or sync iterable
  if (events !== undefined && !isAsyncIterable(events)) {
    const iter = Array.isArray(events) ? events : events
    const processedEvents: string[] = []

    for (const key of iter) {
      app.stdin.write(keyToAnsi(key))
      processedEvents.push(key)
    }

    return {
      get text() {
        return app.text
      },
      app,
      [Symbol.iterator]() {
        return processedEvents[Symbol.iterator]()
      },
    }
  }

  // Async path
  let stopped = false
  const unmount = () => {
    stopped = true
    app.unmount()
  }

  const asyncResult: AsyncRunResult = {
    get text() {
      return app.text
    },
    app,
    unmount,

    // PromiseLike — `await run(app)` or `await run(app, asyncEvents)`
    // biome-ignore lint/suspicious/noThenProperty: implements PromiseLike
    then<TResult1 = void, TResult2 = never>(
      // biome-ignore lint/suspicious/noConfusingVoidType: required by PromiseLike
      onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): Promise<TResult1 | TResult2> {
      const promise = (async () => {
        if (events) {
          for await (const key of events) {
            if (stopped) break
            await app.press(key)
          }
        } else {
          // No events — wait until exit
          await app.run()
        }
      })()
      return promise.then(onfulfilled, onrejected)
    },

    // AsyncIterable — `for await (const text of run(app, asyncEvents))`
    [Symbol.asyncIterator](): AsyncIterator<string> {
      if (!events) {
        // No events source — yield current text, then done
        let yielded = false
        return {
          async next(): Promise<IteratorResult<string>> {
            if (yielded || stopped) {
              return { done: true, value: undefined as unknown as string }
            }
            yielded = true
            return { done: false, value: app.text }
          },
        }
      }

      const iter = (events as AsyncIterable<string>)[Symbol.asyncIterator]()
      return {
        async next(): Promise<IteratorResult<string>> {
          if (stopped) {
            return { done: true, value: undefined as unknown as string }
          }
          const result = await iter.next()
          if (result.done) {
            return { done: true, value: undefined as unknown as string }
          }
          await app.press(result.value)
          return { done: false, value: app.text }
        },
        async return(): Promise<IteratorResult<string>> {
          unmount()
          return { done: true, value: undefined as unknown as string }
        },
      }
    },
  }

  return asyncResult
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null && typeof value === "object" && Symbol.asyncIterator in value
  )
}

/**
 * Run a function with IS_REACT_ACT_ENVIRONMENT temporarily set to true.
 * This ensures act() works correctly without polluting the global scope.
 */
function withActEnvironment(fn: () => void): void {
  const prev = globalThis.IS_REACT_ACT_ENVIRONMENT
  // @ts-expect-error - React internal flag
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  try {
    fn()
  } finally {
    // @ts-expect-error - React internal flag
    globalThis.IS_REACT_ACT_ENVIRONMENT = prev
  }
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Get the number of currently active (mounted) render instances.
 * Useful for tests to verify cleanup.
 */
export function getActiveRenderCount(): number {
  return pruneAndCountActiveRenders()
}

// ============================================================================
// Re-exports
// ============================================================================

export { keyToAnsi } from "./keys.js"
export type { App } from "./app.js"
