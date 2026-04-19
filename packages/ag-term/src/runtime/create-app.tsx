/**
 * createApp() - Layer 3 entry point for silvery-loop
 *
 * Provides signal-backed store integration with unified providers.
 * Providers are stores (getState/subscribe) + event sources (events()).
 *
 * @example
 * ```tsx
 * import { createApp, useApp } from '@silvery/create/create-app'
 * import { createTermProvider } from '@silvery/ag-term/runtime'
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

import { writeSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import process from "node:process"
import React, { createContext, useContext, useEffect, useRef, type ReactElement } from "react"
import { type StateCreator, type StoreApi, createStore } from "@silvery/create/signal-store"

import { createTerm } from "../ansi"
import {
  CacheBackendContext,
  CapabilityRegistryContext,
  FocusManagerContext,
  RuntimeContext,
  type RuntimeContextValue,
  StdoutContext,
  StderrContext,
  TermContext,
} from "@silvery/ag-react/context"
import { SilveryErrorBoundary } from "@silvery/ag-react/error-boundary"
import { createFocusManager } from "@silvery/ag/focus-manager"
import { createCursorStore, CursorProvider } from "@silvery/ag-react/hooks/useCursor"
import { createFocusEvent, dispatchFocusEvent } from "@silvery/ag/focus-events"
import { createAg, type Ag } from "../ag"
import { runWithMeasurer } from "../unicode"
import { createPipeline } from "../measurer"
import {
  isTextSizingLikelySupported,
  detectTextSizingSupport,
  getCachedProbeResult,
} from "../text-sizing"
import { createWidthDetector, applyWidthConfig } from "../ansi/width-detection"
import { IncrementalRenderMismatchError } from "../scheduler"
import { isAnyDirty } from "@silvery/ag/epoch"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
  setOnNodeRemoved,
} from "@silvery/ag-react/reconciler"
import { map, merge, takeUntil } from "@silvery/create/streams"
import { createBuffer } from "./create-buffer"
import { createRuntime } from "./create-runtime"
import {
  createHandlerContext,
  dispatchKeyToHandlers,
  handleFocusNavigation,
  invokeEventHandler,
  type NamespacedEvent,
} from "./event-handlers"
import { keyToAnsi, keyToKittyAnsi, isModifierOnlyEvent } from "@silvery/ag/keys"
import { parseKey, type Key } from "./keys"
import { ensureLayoutEngine } from "./layout"
import {
  createMouseEventProcessor,
  updateKeyboardModifiers,
  findContainBoundary,
  selectionHitTest,
} from "../mouse-events"
import {
  enableKittyKeyboard,
  disableKittyKeyboard,
  KittyFlags,
  enableMouse,
  disableMouse,
  resetCursorStyle,
  enterAlternateScreen,
  leaveAlternateScreen,
} from "../output"
import { enableFocusReporting } from "../focus-reporting"
import { detectKittyFromStdio } from "../kitty-detect"
import { captureTerminalState, performSuspend } from "./terminal-lifecycle"
import { type TermProvider, createTermProvider } from "./term-provider"
import type { Buffer, Dims, Provider, RenderTarget } from "./types"
import {
  createTerminalSelectionState,
  terminalSelectionUpdate,
  extractText,
} from "@silvery/headless/selection"
import { createSelectionBridge, type SelectionFeature } from "../features/selection"
import { renderSelectionOverlay } from "../selection-renderer"
import {
  createCapabilityRegistry,
  type CapabilityRegistry,
} from "@silvery/create/internal/capability-registry"
import { SELECTION_CAPABILITY } from "@silvery/create/internal/capabilities"
import { createVirtualScrollback } from "../virtual-scrollback"
import {
  createSearchState,
  searchUpdate,
  renderSearchBar,
  type SearchMatch,
} from "../search-overlay"
import { createOutputGuard, type OutputGuard } from "../ansi/output-guard"
import { perfLog, checkBudget, logExitSummary, startTracking } from "./perf"
import { createLogger } from "loggily"

const log = createLogger("silvery:app")

// ============================================================================
// Feature-detection flags — hoisted to module scope.
//
// These env var checks were historically evaluated on every doRender() call,
// adding ~10μs/frame overhead to production renders. They are all static for
// the lifetime of the process, so we compute them once at module load.
//
// When the instrumentation flag is off (the common case), branches guarded by
// these constants are dead-code eliminated by V8's optimizer — turning them
// into no-ops on the hot path.
// ============================================================================
const ENV = typeof process !== "undefined" ? process.env : undefined
const NO_INCREMENTAL = ENV?.SILVERY_NO_INCREMENTAL === "1"
const STRICT_MODE = (() => {
  const v = ENV?.SILVERY_STRICT
  return !!v && v !== "0" && v !== "false"
})()
const CELL_DEBUG = (() => {
  const v = ENV?.SILVERY_CELL_DEBUG
  if (!v || !v.includes(",")) return null
  const [cx, cy] = v.split(",").map(Number)
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
  return { x: cx, y: cy }
})()
// INSTRUMENTED = any diagnostic is on. When false, the per-frame resets of
// diagnostic globals can be skipped entirely — they are only consumed by the
// STRICT/CELL_DEBUG paths. This is the primary hot-path win: when no
// instrumentation is active (production), doRender skips ~8 global ops/frame.
const INSTRUMENTED = STRICT_MODE || CELL_DEBUG !== null

// ============================================================================
// Types
// ============================================================================

/**
 * Check if value is a Provider with events (full interface).
 */
function isFullProvider(value: unknown): value is Provider<unknown, Record<string, unknown>> {
  if (value === null || value === undefined) return false
  // Term is a Proxy wrapping chalk, so typeof is "function" not "object"
  if (typeof value !== "object" && typeof value !== "function") return false
  return (
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
  if (value === null || value === undefined) return false
  // Term is a Proxy wrapping chalk, so typeof is "function" not "object"
  if (typeof value !== "object" && typeof value !== "function") return false
  return (
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
  focusManager: import("@silvery/create/focus-manager").FocusManager
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
  hitTest(x: number, y: number): import("@silvery/create/types").AgNode | null
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
   * Enable virtual inline mode: alt screen with virtual scrollback buffer.
   * Provides scrollable history + search (Ctrl+F) while using fullscreen rendering.
   * Default: false
   */
  virtualInline?: boolean
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
   * - `"auto"`: use heuristic, then probe to verify (progressive enhancement)
   * - `"probe"`: start disabled, probe async, enable on confirmation
   * - `false`/undefined: disabled (default)
   */
  textSizing?: boolean | "auto" | "probe"
  /**
   * Enable DEC width mode detection (modes 1020-1023).
   * Queries the terminal for its actual character width settings (emoji,
   * CJK, private-use area) and updates the measurer accordingly.
   * - `true`: always run width detection probe
   * - `"auto"`: run probe when caps are provided (default for real terminals)
   * - `false`/undefined: disabled (default)
   */
  widthDetection?: boolean | "auto"
  /**
   * Enable terminal focus reporting (CSI ?1004h).
   * When enabled, the terminal sends focus-in/focus-out events that are
   * dispatched as 'term:focus' events with `{ focused: boolean }`.
   * Default: false
   */
  focusReporting?: boolean
  /**
   * Enable buffer-level text selection via mouse drag.
   * When enabled, left mouse drag selects text, and mouse up copies
   * selected text to clipboard via OSC 52.
   * Default: true when mouse is enabled
   */
  selection?: boolean
  /**
   * Terminal capabilities for width measurement and output suppression.
   * When provided, configures the render pipeline to use these caps
   * (scoped width measurer + output phase). Typically from term.caps.
   */
  caps?: import("../terminal-caps").TerminalCaps
  /**
   * Guard stdout/stderr in alt screen mode. When true (the default for
   * alternateScreen), intercepts process.stdout.write and process.stderr.write
   * so that only silvery's render pipeline can write to stdout. Non-silvery
   * stderr writes are redirected to DEBUG_LOG if set, otherwise suppressed.
   * This prevents display corruption from libraries that write directly to
   * process.stdout/stderr (e.g., loggily, debug).
   *
   * - `true`: enable output guard (default when alternateScreen is true)
   * - `false`: disable output guard
   */
  guardOutput?: boolean
  /**
   * Root component that wraps the element tree with additional providers.
   * Set by plugins (e.g., withInk) via the `app.Root` pattern.
   * The Root component receives children and wraps them with providers.
   */
  Root?: React.ComponentType<{ children: React.ReactNode }>
  /**
   * Capability registry from the composition layer (e.g., withDomEvents, withTerminal).
   * When provided, exposed to React components via CapabilityRegistryContext so
   * hooks like useSelection() can discover interaction features.
   */
  capabilityRegistry?: import("@silvery/ag-react/context").CapabilityLookup
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
  /** Live reconciler root node (for locator queries) */
  readonly root: import("@silvery/ag/types").AgNode
  /** Current terminal buffer (cell-level access) */
  readonly buffer: import("../buffer").TerminalBuffer | null
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
    kittyMode: explicitKittyMode,
    kitty: kittyOption,
    mouse: mouseOption = false,
    virtualInline: virtualInlineOption = false,
    suspendOnCtrlZ: suspendOption = true,
    exitOnCtrlC: exitOnCtrlCOption = true,
    onSuspend: onSuspendHook,
    onResume: onResumeHook,
    onInterrupt: onInterruptHook,
    textSizing: textSizingOption,
    widthDetection: widthDetectionOption,
    focusReporting: focusReportingOption = false,
    selection: selectionOption,
    caps: capsOption,
    guardOutput: guardOutputOption,
    Root: RootComponent,
    capabilityRegistry: capabilityRegistryOption,
    writable: explicitWritable,
    onResize: explicitOnResize,
    ...injectValues
  } = options

  // Derive kitty mode for press(): use explicit kittyMode if set, otherwise
  // auto-enable when kitty protocol is active (so press() encodes modifier keys correctly)
  const useKittyMode = explicitKittyMode ?? !!kittyOption

  const headless =
    (explicitCols != null && explicitRows != null && !explicitStdout) || explicitWritable != null
  const cols = explicitCols ?? process.stdout.columns ?? 80
  const rows = explicitRows ?? process.stdout.rows ?? 24
  const stdout = explicitStdout ?? process.stdout

  // Output guard: created after protocol setup (see below).
  // Only guard when using real process.stdout — mock stdouts don't benefit from
  // the guard (which patches process.stdout.write), and it would route render
  // output to the real stdout instead of the mock.
  const isRealStdout = stdout === process.stdout
  const shouldGuardOutput = guardOutputOption ?? (alternateScreen && !headless && isRealStdout)
  let outputGuard: OutputGuard | null = null

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

  // Subscribe to stdout resize events so currentDims stays in sync.
  // In headless mode this is handled by explicitOnResize above.
  // In non-headless mode, stdout resize events update currentDims directly
  // and notify mockTerm subscribers (so useSyncExternalStore re-renders).
  if (!headless) {
    const onStdoutResize = () => {
      currentDims = {
        cols: stdout.columns || 80,
        rows: stdout.rows || 24,
      }
      for (const listener of mockTermSubscribers) listener(currentDims)
    }
    stdout.on("resize", onStdoutResize)
    providerCleanups.push(() => stdout.off("resize", onStdoutResize))
  }

  let shouldExit = false
  let renderPaused = false
  let isRendering = false // Re-entrancy guard for store subscription
  let inEventHandler = false // True during processEvent/press — suppresses subscription renders
  let pendingRerender = false // Deferred render flag for re-entrancy

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
        decoded.length > 400
          ? decoded.slice(0, 200) + ` ...[${decoded.length}ch]... ` + decoded.slice(-100)
          : decoded
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
          if (!renderPaused) {
            if (outputGuard) {
              outputGuard.writeStdout(frame)
            } else {
              stdout.write(frame)
            }
          }
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

  // Resolve textSizing from caps + option
  // For "auto": use heuristic first, probe to verify if heuristic says yes
  // For "probe": start disabled, probe async to determine
  // For true/false: use directly
  const heuristicSupported = capsOption?.textSizingSupported ?? isTextSizingLikelySupported()
  const shouldProbe =
    textSizingOption === "probe" || (textSizingOption === "auto" && heuristicSupported)
  // If we have a cached probe result, use it immediately instead of probing again
  const cachedProbe = shouldProbe ? getCachedProbeResult() : undefined
  let textSizingEnabled: boolean
  if (textSizingOption === true) {
    textSizingEnabled = true
  } else if (textSizingOption === "probe") {
    // "probe": start disabled unless cache says supported
    textSizingEnabled = cachedProbe?.supported ?? false
  } else if (textSizingOption === "auto") {
    if (cachedProbe !== undefined) {
      // Cache available: use definitive probe result
      textSizingEnabled = cachedProbe.supported
    } else {
      // No cache: use heuristic for first render, probe will verify
      textSizingEnabled = heuristicSupported
    }
  } else {
    textSizingEnabled = false
  }

  // Whether we still need to run the async probe (no cache hit)
  const needsProbe = shouldProbe && cachedProbe === undefined && !headless

  // Resolve width detection: "auto" enables when caps are provided and not headless
  const needsWidthDetection =
    !headless &&
    (widthDetectionOption === true || (widthDetectionOption === "auto" && capsOption != null))

  // Track effective caps — may be updated by width detection and text sizing probes
  let effectiveCaps = capsOption
    ? { ...capsOption, textSizingSupported: textSizingEnabled }
    : undefined

  // Create pipeline config from caps (scoped width measurer + output phase)
  // Use `let` because the pipeline may be recreated after a probe changes textSizing
  let pipelineConfig = effectiveCaps ? createPipeline({ caps: effectiveCaps }) : undefined

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

  // Errors caught by SilveryErrorBoundary — flushed to stderr on cleanup so
  // the user sees them after the alt screen exits. Also dumped to a temp file
  // (path included in the stderr message) for full stack/component trace.
  const caughtErrors: Array<{ error: Error; dumpPath?: string }> = []
  function recordBoundaryError(error: Error) {
    let dumpPath: string | undefined
    try {
      dumpPath = `${tmpdir()}/silvery-render-error-${Date.now()}.txt`
      writeFileSync(dumpPath, `${error.message}\n\n${error.stack ?? "(no stack)"}\n`)
    } catch {}
    caughtErrors.push({ error, dumpPath })
    log.error?.(
      `React render error caught by SilveryErrorBoundary: ${error.message}${dumpPath ? ` (dump: ${dumpPath})` : ""}`,
    )
  }
  // Track protocol state for cleanup and suspend/resume
  let kittyEnabled = false
  const defaultKittyFlags =
    KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS | KittyFlags.REPORT_ALL_KEYS
  let kittyFlags: number = defaultKittyFlags
  let mouseEnabled = false
  let focusReportingEnabled = false
  // Selection requires explicit opt-in — don't hijack mouse clicks by default
  const selectionEnabled = selectionOption ?? false
  let selectionState = createTerminalSelectionState()

  // --- Selection bridge ---
  // Listeners for the bridge's subscribe mechanism (used by useSelection)
  const selectionListeners = new Set<() => void>()

  /** Notify useSelection() subscribers that selection state changed. */
  function notifySelectionListeners(): void {
    for (const listener of selectionListeners) {
      listener()
    }
  }

  // Capability registry: use provided one or create our own so the bridge
  // can be registered and useSelection() works even without withDomEvents().
  const capabilityRegistry: CapabilityRegistry =
    (capabilityRegistryOption as CapabilityRegistry | undefined) ?? createCapabilityRegistry()

  // The bridge exposes create-app's selection state via the SelectionFeature
  // interface. React hooks (useSelection) and copy-mode read/write through it.
  let selectionBridge: SelectionFeature | undefined
  if (selectionEnabled) {
    selectionBridge = createSelectionBridge({
      getState: () => selectionState,
      subscribe: (listener) => {
        selectionListeners.add(listener)
        return () => {
          selectionListeners.delete(listener)
        }
      },
      setRange: (range) => {
        if (range === null) {
          const [next] = terminalSelectionUpdate({ type: "clear" }, selectionState)
          selectionState = next
        } else {
          // Start at anchor, extend to head, finish
          const [s1] = terminalSelectionUpdate(
            { type: "start", col: range.anchor.col, row: range.anchor.row, source: "keyboard" },
            selectionState,
          )
          const [s2] = terminalSelectionUpdate(
            { type: "extend", col: range.head.col, row: range.head.row },
            s1,
          )
          const [s3] = terminalSelectionUpdate({ type: "finish" }, s2)
          selectionState = s3
        }
        notifySelectionListeners()
        // Force re-render to show/clear overlay
        if (currentBuffer) {
          runtime.invalidate()
        }
      },
      clear: () => {
        const [next] = terminalSelectionUpdate({ type: "clear" }, selectionState)
        selectionState = next
        notifySelectionListeners()
        if (currentBuffer) {
          runtime.invalidate()
        }
      },
    })
    capabilityRegistry.register(SELECTION_CAPABILITY, selectionBridge)
  }

  // Virtual inline mode state
  const scrollback = virtualInlineOption ? createVirtualScrollback() : null
  let virtualScrollOffset = 0 // 0 = live (bottom), >0 = scrolled up
  let searchState = createSearchState()

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

  // Wire up focus cleanup on node removal — when React unmounts a subtree,
  // the host-config calls this to clear focus if the active element was removed.
  setOnNodeRemoved((removedNode) => focusManager.handleSubtreeRemoved(removedNode))

  // Per-instance cursor state (replaces module-level globals)
  const cursorStore = createCursorStore()

  // Mouse event processor for DOM-level dispatch (with click-to-focus)
  const mouseEventState = createMouseEventProcessor({ focusManager })

  // Cleanup function - idempotent, can be called from exit() or finally
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true

    // Log keypress performance summary before teardown (only emits when TRACE was active)
    logExitSummary()

    // Unmount React tree first — this runs effect cleanups (clears intervals,
    // cancels subscriptions) before we tear down the infrastructure.
    try {
      reconciler.updateContainerSync(null, fiberRoot, null, () => {})
      reconciler.flushSyncWork()
    } catch {
      // Ignore — component tree may already be partially torn down
    }

    // Unregister node removal hook
    setOnNodeRemoved(null)

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

    // Dispose output guard BEFORE terminal protocol cleanup — restores original
    // stdout/stderr write methods so the cleanup sequences go through unimpeded.
    if (outputGuard) {
      outputGuard.dispose()
      outputGuard = null
    }

    // === Terminal protocol cleanup ===
    //
    // Order is critical to avoid escape sequence leaks on exit:
    //
    // 1. Stop consuming stdin — remove data listeners so no more events process
    // 2. Send all protocol disable sequences via writeSync (synchronous, reliable)
    // 3. Drain any in-flight stdin bytes (terminal may have queued events before
    //    processing our disable sequences — especially Kitty key release events)
    // 4. Disable raw mode and pause stdin
    //
    // Without the drain, Kitty release events (e.g., CSI 113;1:3u for 'q' release)
    // and SGR mouse events appear as garbled text on the shell prompt after exit.

    if (!headless && stdin.isTTY) {
      // Step 1: Stop consuming stdin — prevent any more event processing
      stdin.removeAllListeners("data")
      stdin.pause()

      // Step 2: Send ALL protocol disable sequences unconditionally.
      // Sending a disable for an inactive protocol is harmless, and unconditional
      // cleanup is more robust than tracking enable/disable state.
      const sequences = [
        "\x1b[?1004l", // Disable focus reporting
        disableMouse(), // Disable SGR mouse tracking (modes 1003, 1006)
        disableKittyKeyboard(), // Pop Kitty keyboard protocol
        "\x1b[?2004l", // Disable bracketed paste
        "\x1b[0m", // Reset SGR attributes
        resetCursorStyle(), // Reset cursor shape to terminal default (DECSCUSR 0)
        "\x1b[?25h", // Show cursor
        alternateScreen ? "\x1b[?1049l" : "", // Exit alternate screen
      ].join("")

      // Use writeSync for reliability — async write may not flush before exit.
      // For mock/test stdouts, writeSync(fd) bypasses the mock, so fall back.
      const isRealStdout = stdout === process.stdout
      if (isRealStdout) {
        try {
          writeSync((stdout as unknown as { fd: number }).fd, sequences)
        } catch {
          try {
            stdout.write(sequences)
          } catch {
            /* terminal may be gone */
          }
        }

        // Step 3: Drain in-flight stdin bytes. The terminal may have already
        // queued events (Kitty release, mouse moves) before processing our
        // disable sequences. Read and discard them so they don't leak to shell.
        //
        // Known limitation: stdin.read() only gets Node's internal buffer.
        // Late-arriving bytes (Kitty release of 'q') in the kernel TTY buffer
        // may leak to the shell as garbled text (e.g., "3;1:3u").
        // See bead km-silvery.exit-kitty-leak for investigation.
        try {
          stdin.resume()
          while (stdin.read() !== null) {
            /* discard Node-buffered data */
          }
          stdin.pause()
        } catch {
          // Drain failed — best-effort, continue cleanup
        }
      } else {
        try {
          stdout.write(sequences)
        } catch {
          /* terminal may be gone */
        }
      }

      // Step 4: Disable raw mode
      try {
        stdin.setRawMode(false)
      } catch {
        // Ignore — stdin may be closed
      }
    } else if (!headless) {
      // Non-TTY cleanup: just send disable sequences
      const sequences = [
        "\x1b[?1004l",
        disableMouse(),
        disableKittyKeyboard(),
        "\x1b[?2004l",
        "\x1b[0m",
        resetCursorStyle(),
        "\x1b[?25h",
        alternateScreen ? "\x1b[?1049l" : "",
      ].join("")
      try {
        stdout.write(sequences)
      } catch {
        /* terminal may be gone */
      }
    }

    // Cleanup providers — stdin is already cleaned up above for TTY,
    // but provider cleanup handles other resources (resize listeners, etc.)
    providerCleanups.forEach((fn) => {
      try {
        fn()
      } catch {
        // Ignore
      }
    })

    // Dispose runtime
    runtime[Symbol.dispose]()

    // Flush any React render errors caught by SilveryErrorBoundary to stderr.
    // The boundary renders them inside the alt screen — once we leave alt
    // screen the message is gone. Print here so the user actually sees what
    // crashed, with a path to the full dump for stack/component info.
    if (caughtErrors.length > 0) {
      try {
        const lines: string[] = []
        lines.push("")
        lines.push(
          `silvery: ${caughtErrors.length} React render error${caughtErrors.length === 1 ? "" : "s"} caught during this session:`,
        )
        for (const { error, dumpPath } of caughtErrors) {
          lines.push(`  - ${error.message}${dumpPath ? ` (dump: ${dumpPath})` : ""}`)
        }
        lines.push("")
        process.stderr.write(lines.join("\n"))
      } catch {
        // Best-effort — stderr may already be torn down
      }
    }
  }

  let exit: () => void // eslint-disable-line prefer-const -- forward declaration, assigned once at L1403

  // Create SilveryNode container.
  // onRender fires during React's resetAfterCommit — inside the commit phase.
  // Calling doRender from there would be re-entrant (doRender calls updateContainerSync
  // which triggers commit which calls onRender again). Always defer via microtask.
  // Without this callback, setInterval/setTimeout-driven setState never flushes to terminal.
  const container = createContainer(() => {
    if (shouldExit) return
    if (inEventHandler) {
      // During processEvent/press: just flag, caller's flush loop handles it.
      pendingRerender = true
      return
    }
    // Always defer — onRender fires during React commit, re-entry is unsafe.
    if (!pendingRerender) {
      pendingRerender = true
      queueMicrotask(() => {
        if (!pendingRerender) return
        pendingRerender = false
        if (!shouldExit && !isRendering) {
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
  })

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

  // Create mock term — override getState to return the app's actual dimensions
  // rather than process.stdout dimensions (which may differ in test/emulator contexts).
  // Also override subscribe to notify listeners on resize so useSyncExternalStore
  // (used by useTerm/useWindowSize) triggers re-renders when dimensions change.
  const baseMockTerm = createTerm({ color: "truecolor" })
  const mockTermSubscribers = new Set<(state: { cols: number; rows: number }) => void>()
  const mockTerm = Object.create(baseMockTerm, {
    getState: { value: (): { cols: number; rows: number } => currentDims },
    subscribe: {
      value: (listener: (state: { cols: number; rows: number }) => void): (() => void) => {
        mockTermSubscribers.add(listener)
        return () => mockTermSubscribers.delete(listener)
      },
    },
  }) as typeof baseMockTerm

  // RuntimeContext input listeners — allows components using hooks/useInput
  // (TextInput, TextArea, SelectList etc.) to work inside createApp apps.
  //
  // V1r apply chain: ordered dispatch, focus lane before fallback, explicit handled.
  // Raw Sets replaced with arrays for ordered iteration.
  const runtimeInputListeners: Array<(input: string, key: Key) => void> = []
  const runtimePasteListeners: Array<(text: string) => void> = []
  const runtimeFocusListeners: Array<(focused: boolean) => void> = []

  // Typed event bus — supports view → runtime events via emit()
  const runtimeEventListeners = new Map<string, Array<Function>>()
  runtimeEventListeners.set("input", runtimeInputListeners as unknown as Array<Function>)
  runtimeEventListeners.set("paste", runtimePasteListeners as unknown as Array<Function>)
  runtimeEventListeners.set("focus", runtimeFocusListeners as unknown as Array<Function>)

  const runtimeContextValue: RuntimeContextValue = {
    on(event, handler) {
      let listeners = runtimeEventListeners.get(event)
      if (!listeners) {
        listeners = []
        runtimeEventListeners.set(event, listeners)
      }
      listeners.push(handler)
      return () => {
        const idx = listeners!.indexOf(handler)
        if (idx >= 0) listeners!.splice(idx, 1)
      }
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
  // Cache backend selection:
  // - inline: "terminal" — items promoted to real terminal scrollback
  // - fullscreen + virtualInline: "virtual" — items stored in HistoryBuffer,
  //   viewable via virtual scroll overlay
  // - plain fullscreen: "retain" — items cached but kept in the render tree
  //   (no scrollback to display unmounted items, virtualizer handles windowing)
  const cacheBackend = !alternateScreen ? "terminal" : virtualInlineOption ? "virtual" : "retain"
  const wrappedElement = (
    <SilveryErrorBoundary onError={recordBoundaryError}>
      <CursorProvider store={cursorStore}>
        <CacheBackendContext.Provider value={cacheBackend}>
          <TermContext.Provider value={mockTerm}>
            <StdoutContext.Provider
              value={{
                stdout: mockStdout,
                write: () => {},
                notifyScrollback: (lines: number) => runtime.addScrollbackLines(lines),
                promoteScrollback: (content: string, lines: number) =>
                  runtime.promoteScrollback(content, lines),
                resetInlineCursor: () => runtime.resetInlineCursor(),
                getInlineCursorRow: () => runtime.getInlineCursorRow(),
              }}
            >
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
                    <CapabilityRegistryContext.Provider value={capabilityRegistry}>
                      <Root>
                        <StoreContext.Provider value={store as StoreApi<unknown>}>
                          {element}
                        </StoreContext.Provider>
                      </Root>
                    </CapabilityRegistryContext.Provider>
                  </RuntimeContext.Provider>
                </FocusManagerContext.Provider>
              </StderrContext.Provider>
            </StdoutContext.Provider>
          </TermContext.Provider>
        </CacheBackendContext.Provider>
      </CursorProvider>
    </SilveryErrorBoundary>
  )

  // Performance instrumentation — count renders per event
  let _renderCount = 0
  let _eventStart = 0
  const _perfLog = typeof process !== "undefined" && process.env?.DEBUG?.includes("silvery:perf")

  // Incremental rendering via long-lived Ag instance.
  // The Ag manages its own prevBuffer for incremental rendering.
  // Set SILVERY_NO_INCREMENTAL=1 to disable (for debugging blank screen issues).
  // _noIncremental aliases the module-level NO_INCREMENTAL constant for readability.
  const _noIncremental = NO_INCREMENTAL

  // Long-lived Ag instance — created lazily on first doRender() after reconciler
  // produces the root node. Reused across all subsequent frames, avoiding per-frame
  // pipeline state allocation. The Ag manages its own prevBuffer for incremental
  // content rendering.
  let _ag: Ag | null = null
  // Track the last TerminalBuffer for dimension-change detection (the Ag manages
  // prevBuffer internally, but we need the dimensions for resize detection).
  let _lastTermBuffer: import("../buffer").TerminalBuffer | null = null

  // Helper to render and get text
  function doRender(): Buffer {
    _renderCount++
    if (_ansiTrace) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/tmp/silvery-trace.log",
        `--- doRender #${_renderCount} (ag=${_ag ? "reuse" : "create"}, incremental=${!_noIncremental}) ---\n`,
      )
    }
    const renderStart = performance.now()

    // Phase A: React reconciliation
    reconciler.updateContainerSync(wrappedElement, fiberRoot, null, () => {})
    reconciler.flushSyncWork()
    const reconcileMs = performance.now() - renderStart

    // Bench instrumentation: accumulate reconcile time. The pipeline accumulator
    // (set by silveryBenchStart) catches measure/layout/content/output; reconcile
    // lives outside pipeline/index.ts so we add it here.
    {
      const acc = (globalThis as any).__silvery_bench_phases
      if (acc) acc.reconcile += reconcileMs
    }

    // Phase B: Render pipeline (incremental when prevBuffer available)
    const pipelineStart = performance.now()
    const rootNode = getContainerRoot(container)
    const dims = runtime.getDims()

    const isInline = !alternateScreen

    // Create or reuse long-lived Ag instance. Created lazily because the root
    // AgNode is produced by the React reconciler in Phase A above.
    if (!_ag) {
      _ag = createAg(rootNode, {
        measurer: pipelineConfig?.measurer,
        colorLevel: effectiveCaps?.colorLevel,
      })
    }

    // Invalidate prevBuffer on dimension change (resize).
    // Both Ag-level (ag.resetBuffer()) and runtime-level (runtime.invalidate())
    // must be cleared — otherwise the ANSI diff compares different-sized buffers.
    //
    // In inline mode, only WIDTH changes trigger invalidation. Height changes are
    // normal (content grows/shrinks as items are added/frozen) and are handled
    // incrementally by the output phase. Invalidating on height causes the runtime's
    // prevBuffer to be null, which triggers the first-render clear path with \x1b[J
    // — wiping the entire visible screen including shell prompt content above the app.
    if (_ag) {
      // Check dimension changes. On first render there's no prevBuffer to compare.
      const lastBuffer = _lastTermBuffer
      if (lastBuffer) {
        const widthChanged = dims.cols !== lastBuffer.width
        const heightChanged = !isInline && dims.rows !== lastBuffer.height
        if (widthChanged || heightChanged) {
          _ag.resetBuffer()
          runtime.invalidate()
        }
      }
    }

    // Clear diagnostic arrays before the render so we capture only this render's data.
    // INSTRUMENTED is hoisted from env vars at module load — when no diagnostic is
    // active (the hot path), all three global resets and the cell-debug setup
    // constant-fold out of the frame.
    if (INSTRUMENTED) {
      ;(globalThis as any).__silvery_content_all = undefined
      ;(globalThis as any).__silvery_node_trace = undefined
      // Cell debug: enable during real incremental render for SILVERY_STRICT diagnosis.
      // Set SILVERY_CELL_DEBUG=x,y to trace which nodes cover a specific cell.
      // The log is captured during the render and included in any mismatch error.
      ;(globalThis as any).__silvery_cell_debug =
        CELL_DEBUG !== null ? { x: CELL_DEBUG.x, y: CELL_DEBUG.y, log: [] as string[] } : undefined
    }

    // Early return: if reconciliation produced no dirty flags on the tree,
    // skip the pipeline entirely. This avoids cloning prevBuffer (which
    // resets dirty rows to 0), preserving the row-level dirty markers that
    // the runtime diff needs to detect actual changes.
    // Exception: dimension changes require re-layout even without dirty flags.
    const rootHasDirty =
      rootNode.layoutNode?.isDirty() || isAnyDirty(rootNode.dirtyBits, rootNode.dirtyEpoch)
    const dimsChanged =
      _lastTermBuffer != null &&
      (dims.cols !== _lastTermBuffer.width || dims.rows !== _lastTermBuffer.height)
    if (!rootHasDirty && !dimsChanged && _lastTermBuffer && currentBuffer) {
      return currentBuffer
    }

    // When SILVERY_NO_INCREMENTAL is set, force fresh render every frame
    if (_noIncremental) {
      _ag.resetBuffer()
    }

    // Run layout + content render via the long-lived Ag instance.
    // The Ag manages prevBuffer internally for incremental rendering.
    // Output phase is NOT run here — the runtime handles it separately.
    _ag.layout(dims)
    const { buffer: termBuffer, prevBuffer: agPrevBuffer } = _ag.render()
    _lastTermBuffer = termBuffer
    const wasIncremental = !_noIncremental && agPrevBuffer !== null
    const pipelineMs = performance.now() - pipelineStart

    // Expose timing for diagnostics.
    // Output timing is 0 here — the runtime handles the output phase separately.
    ;(globalThis as any).__silvery_last_pipeline = {
      layout: pipelineMs,
      output: 0,
      total: pipelineMs,
      incremental: wasIncremental,
    }
    ;(globalThis as any).__silvery_render_count =
      ((globalThis as any).__silvery_render_count ?? 0) + 1

    // Bench instrumentation: accumulate pipeline-level timing.
    // ag.ts handles measure/layout/content accumulation; we add total here.
    {
      const acc = (globalThis as any).__silvery_bench_phases
      if (acc) {
        acc.total += pipelineMs
        acc.pipelineCalls += 1
      }
    }

    // SILVERY_STRICT: compare incremental render against fresh render.
    // createApp bypasses Scheduler/Renderer which have this check built-in,
    // so we add it here to catch incremental rendering bugs at runtime.
    // STRICT_MODE is hoisted to module scope — the env var is read once at load.
    if (STRICT_MODE && wasIncremental) {
      const doFreshRender = () => {
        const freshAg = createAg(rootNode, {
          measurer: pipelineConfig?.measurer,
          colorLevel: effectiveCaps?.colorLevel,
        })
        freshAg.layout(
          { cols: dims.cols, rows: dims.rows },
          { skipLayoutNotifications: true, skipScrollStateUpdates: true },
        )
        return freshAg.render()
      }
      const measurer = pipelineConfig?.measurer
      const { buffer: freshBuffer } = measurer
        ? runWithMeasurer(measurer, doFreshRender)
        : doFreshRender()
      const { cellEquals, bufferToText } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("../buffer") as typeof import("../buffer")
      for (let y = 0; y < termBuffer.height; y++) {
        for (let x = 0; x < termBuffer.width; x++) {
          const a = termBuffer.getCell(x, y)
          const b = freshBuffer.getCell(x, y)
          if (!cellEquals(a, b)) {
            // Use cell debug log collected during the real incremental render
            let cellDebugInfo = ""
            const savedCellDbg = (globalThis as any).__silvery_cell_debug as
              | { x: number; y: number; log: string[] }
              | undefined
            if (
              savedCellDbg &&
              savedCellDbg.x === x &&
              savedCellDbg.y === y &&
              savedCellDbg.log.length > 0
            ) {
              cellDebugInfo = `\nCELL DEBUG (${savedCellDbg.log.length} entries for (${x},${y})):\n${savedCellDbg.log.join("\n")}\n`
            } else if (savedCellDbg && savedCellDbg.x === x && savedCellDbg.y === y) {
              cellDebugInfo = `\nCELL DEBUG: No nodes cover (${x},${y}) during incremental render\n`
            } else {
              cellDebugInfo = `\nCELL DEBUG: Target cell (${x},${y}) differs from debug cell (${savedCellDbg?.x},${savedCellDbg?.y})\n`
            }

            // Re-run fresh render with write trap to capture what writes to the mismatched cell
            let trapInfo = ""
            const trap = { x, y, log: [] as string[] }
            ;(globalThis as any).__silvery_write_trap = trap
            try {
              if (measurer) {
                runWithMeasurer(measurer, doFreshRender)
              } else {
                doFreshRender()
              }
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
            // Dump render phase stats for diagnosis
            const contentAll = (globalThis as any).__silvery_content_all as unknown[]
            const statsStr = contentAll
              ? `\n--- render phase stats (${contentAll.length} calls) ---\n` +
                contentAll
                  .map(
                    (s: any, i: number) =>
                      `  #${i}: visited=${s.nodesVisited} rendered=${s.nodesRendered} skipped=${s.nodesSkipped} ` +
                      `clearOps=${s.clearOps} cascade="${s.cascadeNodes}" ` +
                      `flags={C=${s.flagContentDirty} P=${s.flagStylePropsDirty} L=${s.flagLayoutChanged} ` +
                      `S=${s.flagSubtreeDirty} Ch=${s.flagChildrenDirty} CP=${s.flagChildPositionChanged} AL=${s.flagAncestorLayoutChanged} noPrev=${s.noPrevBuffer}} ` +
                      `scroll={containers=${s.scrollContainerCount} cleared=${s.scrollViewportCleared} reason="${s.scrollClearReason}"} ` +
                      `normalRepaint="${s.normalRepaintReason}" ` +
                      `prevBuf={null=${s._prevBufferNull} dimMismatch=${s._prevBufferDimMismatch} hasPrev=${s._hasPrevBuffer} ` +
                      `layout=${s._layoutW}x${s._layoutH} prev=${s._prevW}x${s._prevH}}`,
                  )
                  .join("\n")
              : ""
            const msg =
              `SILVERY_STRICT (createApp): MISMATCH at (${x}, ${y}) on render #${_renderCount}\n` +
              `  incremental: ${cellStr(a)}\n` +
              `  fresh:       ${cellStr(b)}` +
              statsStr +
              // Per-node trace
              (() => {
                const traces = (globalThis as any).__silvery_node_trace as unknown[][] | undefined
                if (!traces || traces.length === 0) return ""
                let out = "\n--- node trace ---"
                for (let ti = 0; ti < traces.length; ti++) {
                  out += `\n  renderPhase #${ti}:`
                  for (const t of traces[ti] as any[]) {
                    out += `\n    ${t.decision} ${t.id}(${t.type})@${t.depth} rect=${t.rect} prev=${t.prevLayout}`
                    out += ` hasPrev=${t.hasPrev} ancClr=${t.ancestorCleared} flags=[${t.flags}] layout∆=${t.layoutChanged}`
                    if (t.decision === "RENDER") {
                      out += ` caa=${t.contentAreaAffected} crc=${t.contentRegionCleared} cnfr=${t.childrenNeedFreshRender}`
                      out += ` childPrev=${t.childHasPrev} childAnc=${t.childAncestorCleared} skipBg=${t.skipBgFill} bg=${t.bgColor ?? "none"}`
                    }
                  }
                }
                return out
              })() +
              cellDebugInfo +
              trapInfo +
              `\n--- incremental ---\n${incText}\n--- fresh ---\n${freshText}`
            // Dump full diagnostics to temp file — alt screen hides stderr
            let dumpPath: string | undefined
            try {
              dumpPath = `${tmpdir()}/silvery-strict-failure-${Date.now()}.txt`
              writeFileSync(dumpPath, msg)
            } catch {}
            throw new IncrementalRenderMismatchError(
              dumpPath ? `${msg.split("\n")[0]}\n  dump: ${dumpPath}` : msg,
            )
          }
        }
      }
      if (_perfLog) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("node:fs").appendFileSync(
          "/tmp/silvery-perf.log",
          `SILVERY_STRICT (createApp): render #${_renderCount} OK\n`,
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
        ? ` {visited=${detail.nodesVisited} rendered=${detail.nodesRendered} skipped=${detail.nodesSkipped} noPrev=${detail.noPrevBuffer ?? 0} dirty=${detail.flagContentDirty ?? 0} paint=${detail.flagStylePropsDirty ?? 0} layoutChg=${detail.flagLayoutChanged ?? 0} subtree=${detail.flagSubtreeDirty ?? 0} children=${detail.flagChildrenDirty ?? 0} childPos=${detail.flagChildPositionChanged ?? 0} scroll=${detail.scrollContainerCount ?? 0}/${detail.scrollViewportCleared ?? 0}${detail.scrollClearReason ? `(${detail.scrollClearReason})` : ""}}${detail.cascadeNodes ? ` CASCADE[minDepth=${detail.cascadeMinDepth} ${detail.cascadeNodes}]` : ""}`
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
          stdout.write(enableKittyKeyboard(defaultKittyFlags))
          kittyEnabled = true
          kittyFlags = defaultKittyFlags
        }
      } else {
        // Explicit flags — enable directly without detection
        stdout.write(enableKittyKeyboard(kittyOption as 1))
        kittyEnabled = true
        kittyFlags = kittyOption as number
      }
    } else if (kittyOption == null) {
      // No option specified: legacy behavior — always enable Kitty with full fidelity
      stdout.write(enableKittyKeyboard(defaultKittyFlags))
      kittyEnabled = true
      kittyFlags = defaultKittyFlags
    }

    // Mouse tracking
    if (mouseOption) {
      stdout.write(enableMouse())
      mouseEnabled = true
    }

    // Focus reporting is deferred to after the event loop starts (see below).
    // Enabling it here would cause the terminal's immediate CSI I/O response
    // to arrive before the input parser's stdin listener is attached, leaking
    // raw escape sequences to the screen.
  }
  if (_ansiTrace) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").appendFileSync(
      "/tmp/silvery-trace.log",
      "=== RUNTIME.RENDER (initial) ===\n",
    )
  }
  runtime.render(currentBuffer)
  if (_perfLog) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").appendFileSync(
      "/tmp/silvery-perf.log",
      `STARTUP: initial render done (render #${_renderCount}, incremental=${!_noIncremental})\n`,
    )
  }

  // Activate output guard after protocol setup and initial render are done.
  // This intercepts process.stdout/stderr writes so that only silvery's
  // render pipeline can write to stdout — all other writes are suppressed
  // (stdout) or redirected to DEBUG_LOG (stderr).
  if (shouldGuardOutput) {
    outputGuard = createOutputGuard()
  }

  // Assign pause/resume now that doRender and runtime are available.
  // Update runtimeContextValue in-place so useApp()/useRuntime() sees the latest values.
  if (!headless) {
    runtimeContextValue.pause = () => {
      renderPaused = true
      // Temporarily dispose the output guard so console-mode writes
      // (e.g., log dump) reach the terminal directly.
      if (outputGuard) {
        outputGuard.dispose()
        outputGuard = null
      }
      if (alternateScreen) stdout.write(leaveAlternateScreen())
    }
    runtimeContextValue.resume = () => {
      if (alternateScreen) stdout.write(enterAlternateScreen())
      renderPaused = false
      // Re-create the output guard (disposed during pause)
      if (shouldGuardOutput && !outputGuard) {
        outputGuard = createOutputGuard()
      }
      // Reset diff state so next render outputs a full frame.
      // The screen was cleared when entering console mode, so
      // incremental diffing would produce an incomplete frame.
      runtime.invalidate()
      _ag?.resetBuffer()
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
  //
  // When called from within the event pump (key handler returns "exit"),
  // we send protocol disable sequences immediately but defer the full
  // cleanup (drain + raw mode) to the pump's finally block. This gives
  // the event loop time to receive late-arriving bytes (e.g., Kitty
  // keyboard release events) before we hand stdin back to the shell.
  //
  // When called from outside the pump (signal handler, direct call),
  // we do sync cleanup immediately (best-effort).
  exit = () => {
    if (shouldExit) return // Already exiting
    shouldExit = true

    // Immediately disable protocols that generate async responses.
    // This is the earliest possible moment — before the terminal
    // sends any more events in response to the exit key.
    if (!headless && stdout.isTTY) {
      const earlyDisable = [
        disableKittyKeyboard(), // Stop Kitty release events
        disableMouse(), // Stop mouse events
        "\x1b[?1004l", // Stop focus reporting
      ].join("")
      try {
        writeSync((stdout as unknown as { fd: number }).fd, earlyDisable)
      } catch {
        try {
          stdout.write(earlyDisable)
        } catch {
          /* terminal may be gone */
        }
      }
    }

    controller.abort()

    // If we're inside the event pump, defer cleanup — the pump's
    // finally block will call cleanupAfterDrain() with an async drain.
    // If we're outside (signal handler, etc.), do sync cleanup now.
    if (!inEventHandler) {
      cleanup()
      exitResolve()
    }
    // else: pump's finally block handles cleanup + exitResolve
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
   * Write selection overlay to stdout after a render.
   * Appends inverse-video ANSI sequences over selected cells.
   */
  function writeSelectionOverlay(): void {
    if (!selectionEnabled || !selectionState.range || !currentBuffer) return
    const mode = alternateScreen ? "fullscreen" : "inline"
    const overlay = renderSelectionOverlay(
      selectionState.range,
      currentBuffer._buffer,
      mode,
      selectionState.scope,
    )
    if (overlay) target.write(overlay)
  }

  /**
   * Push the current rendered frame to the virtual scrollback buffer.
   */
  function pushToScrollback(): void {
    if (!scrollback || !currentBuffer) return
    const lines = currentBuffer.text.split("\n")
    scrollback.push(lines)
  }

  /**
   * Render the virtual scrollback view (historical content) to the terminal.
   * When scrolled up, replaces the live app content with historical rows.
   */
  function renderVirtualScrollbackView(): void {
    if (!scrollback || virtualScrollOffset <= 0) return
    const dims = target.getDims()
    const rows = scrollback.getVisibleRows(virtualScrollOffset, dims.rows)

    // Clear screen and write rows using absolute positioning
    let out = ""
    for (let row = 0; row < rows.length; row++) {
      out += `\x1b[${row + 1};1H\x1b[2K${rows[row] ?? ""}`
    }

    // Scroll indicator at top-right
    const indicator = ` ↑ ${virtualScrollOffset} lines `
    const indicatorCol = Math.max(1, dims.cols - indicator.length + 1)
    out += `\x1b[1;${indicatorCol}H\x1b[7m${indicator}\x1b[27m`

    target.write(out)
  }

  /**
   * Render search highlights for the current match with inverse video.
   */
  function renderSearchHighlights(): void {
    if (!searchState.active || searchState.currentMatch < 0) return
    const match = searchState.matches[searchState.currentMatch]
    if (!match) return

    const dims = target.getDims()
    // Calculate the screen row of the current match
    let screenRow: number
    if (scrollback && virtualScrollOffset > 0) {
      // In scrollback view: calculate relative position
      const totalLines = scrollback.totalLines
      const firstVisibleLine = totalLines - virtualScrollOffset - dims.rows
      screenRow = match.row - firstVisibleLine
    } else {
      screenRow = match.row
    }

    if (screenRow < 0 || screenRow >= dims.rows) return

    // Move to match position and render with inverse
    let out = `\x1b[${screenRow + 1};${match.startCol + 1}H\x1b[7m`
    // Emit the match text (we know the query length)
    for (let col = match.startCol; col <= match.endCol; col++) {
      if (currentBuffer && virtualScrollOffset <= 0) {
        out += currentBuffer._buffer.getCell(col, screenRow).char
      } else {
        out += searchState.query[col - match.startCol] ?? " "
      }
    }
    out += "\x1b[27m"
    target.write(out)
  }

  /**
   * Render the search bar at the bottom of the screen.
   */
  function renderSearchBarOverlay(): void {
    if (!searchState.active) return
    const dims = target.getDims()
    const bar = renderSearchBar(searchState, dims.cols)
    // Position at the last row
    target.write(`\x1b[${dims.rows};1H${bar}`)
  }

  /**
   * Search function for virtual scrollback — converts line matches to SearchMatch[].
   */
  function searchScrollback(query: string): SearchMatch[] {
    if (!scrollback || !query) return []
    const matchingLines = scrollback.search(query)
    const lowerQuery = query.toLowerCase()
    const matches: SearchMatch[] = []
    for (const lineIdx of matchingLines) {
      // Find exact column positions by getting the line text
      const rows = scrollback.getVisibleRows(scrollback.totalLines - lineIdx - 1, 1)
      const line = rows[0] ?? ""
      // Strip ANSI for column matching
      const plain = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
      let col = plain.toLowerCase().indexOf(lowerQuery)
      while (col !== -1) {
        matches.push({ row: lineIdx, startCol: col, endCol: col + query.length - 1 })
        col = plain.toLowerCase().indexOf(lowerQuery, col + 1)
      }
    }
    return matches
  }

  /**
   * Run a single event's handler (state mutation only, no render).
   * Returns true if processing should continue, false if app should exit.
   *
   * Intercepts mouse events for selection and virtual inline mode.
   */
  function runEventHandler(event: NamespacedEvent): boolean | "flush" {
    // Virtual inline: intercept search key events
    if (scrollback && searchState.active && event.type === "term:key") {
      const data = event.data as { input: string; key: Key }
      if (data.key.escape) {
        const [next] = searchUpdate({ type: "close" }, searchState)
        searchState = next
        virtualScrollOffset = 0 // Return to live view
        return true // Consume
      }
      if (data.key.return && !data.key.shift) {
        const [next, effects] = searchUpdate({ type: "nextMatch" }, searchState, searchScrollback)
        searchState = next
        for (const eff of effects) {
          if (eff.type === "scrollTo") {
            virtualScrollOffset = Math.max(
              0,
              scrollback.totalLines - eff.row - target.getDims().rows,
            )
          }
        }
        return true
      }
      if (data.key.return && data.key.shift) {
        const [next, effects] = searchUpdate({ type: "prevMatch" }, searchState, searchScrollback)
        searchState = next
        for (const eff of effects) {
          if (eff.type === "scrollTo") {
            virtualScrollOffset = Math.max(
              0,
              scrollback.totalLines - eff.row - target.getDims().rows,
            )
          }
        }
        return true
      }
      if (data.key.backspace) {
        const [next, effects] = searchUpdate({ type: "backspace" }, searchState, searchScrollback)
        searchState = next
        for (const eff of effects) {
          if (eff.type === "scrollTo") {
            virtualScrollOffset = Math.max(
              0,
              scrollback.totalLines - eff.row - target.getDims().rows,
            )
          }
        }
        return true
      }
      if (data.key.leftArrow) {
        const [next] = searchUpdate({ type: "cursorLeft" }, searchState)
        searchState = next
        return true
      }
      if (data.key.rightArrow) {
        const [next] = searchUpdate({ type: "cursorRight" }, searchState)
        searchState = next
        return true
      }
      if (data.input && !data.key.ctrl && !data.key.meta) {
        const [next, effects] = searchUpdate(
          { type: "input", char: data.input },
          searchState,
          searchScrollback,
        )
        searchState = next
        for (const eff of effects) {
          if (eff.type === "scrollTo") {
            virtualScrollOffset = Math.max(
              0,
              scrollback.totalLines - eff.row - target.getDims().rows,
            )
          }
        }
        return true
      }
    }

    // Virtual inline: Ctrl+F opens search
    if (scrollback && event.type === "term:key") {
      const data = event.data as { input: string; key: Key }
      if (data.input === "f" && data.key.ctrl) {
        const [next] = searchUpdate({ type: "open" }, searchState)
        searchState = next
        return true
      }
    }

    // Virtual inline: intercept wheel events for scrolling
    if (scrollback && event.event === "mouse" && event.data) {
      const mouseData = event.data as {
        button: number
        x: number
        y: number
        action: string
        delta?: number
      }
      if (mouseData.action === "wheel") {
        const scrollLines = 3
        if (mouseData.delta && mouseData.delta < 0) {
          // Scroll up (into history)
          virtualScrollOffset = Math.min(
            virtualScrollOffset + scrollLines,
            Math.max(0, scrollback.totalLines - target.getDims().rows),
          )
        } else {
          // Scroll down (toward live)
          virtualScrollOffset = Math.max(0, virtualScrollOffset - scrollLines)
        }
        return true // Consume wheel events
      }
    }

    // Selection: intercept mouse events
    if (selectionEnabled && event.event === "mouse" && event.data) {
      const mouseData = event.data as {
        button: number
        x: number
        y: number
        action: string
      }

      // Left button (button 0) drag for selection
      if (mouseData.button === 0) {
        if (mouseData.action === "down") {
          // Clear any existing selection first, then start new
          if (selectionState.range) {
            const [cleared] = terminalSelectionUpdate({ type: "clear" }, selectionState)
            selectionState = cleared
          }
          // Resolve contain boundary from the node under the cursor.
          // If the click lands inside a `userSelect="contain"` subtree, the selection
          // range is clamped to that ancestor's scrollRect so drags can't leak into
          // adjacent siblings. selectionHitTest uses the selection-aware walk
          // (respects userSelect="none" subtrees) rather than pointer hit test.
          const agRoot = getContainerRoot(container)
          const hit = agRoot ? selectionHitTest(agRoot, mouseData.x, mouseData.y) : null
          const scope = hit ? findContainBoundary(hit) : null
          const [next] = terminalSelectionUpdate(
            { type: "start", col: mouseData.x, row: mouseData.y, scope },
            selectionState,
          )
          selectionState = next
          notifySelectionListeners()
          // Force full re-render to clear old overlay (incremental render won't
          // overwrite the inverse-video ANSI the overlay wrote directly to stdout)
          if (currentBuffer) {
            runtime.invalidate()
            currentBuffer = doRender()
            runtime.render(currentBuffer)
            writeSelectionOverlay()
          }
          // Don't consume — let the component tree also handle mousedown (for click-to-focus etc.)
        } else if (mouseData.action === "move" && selectionState.selecting) {
          const [next] = terminalSelectionUpdate(
            { type: "extend", col: mouseData.x, row: mouseData.y },
            selectionState,
          )
          selectionState = next
          notifySelectionListeners()
          // Re-render overlay to show updated selection
          if (currentBuffer) {
            runtime.render(currentBuffer)
            writeSelectionOverlay()
          }
          // Consume move events during selection — don't dispatch to component tree
          return true
        } else if (mouseData.action === "up" && selectionState.selecting) {
          const [next] = terminalSelectionUpdate({ type: "finish" }, selectionState)
          selectionState = next
          notifySelectionListeners()

          // Copy selected text via OSC 52
          if (next.range && currentBuffer) {
            const text = extractText(currentBuffer._buffer, next.range, { scope: next.scope })
            if (text.length > 0) {
              const base64 = globalThis.Buffer.from(text).toString("base64")
              target.write(`\x1b]52;c;${base64}\x07`)
            }
          }
          // Re-render overlay with final selection
          if (currentBuffer) {
            runtime.render(currentBuffer)
            writeSelectionOverlay()
          }
          // Don't consume — let click handler run
        }
      }
    }

    // Selection: clear on any keypress
    if (selectionEnabled && event.type === "term:key" && selectionState.range) {
      const [next] = terminalSelectionUpdate({ type: "clear" }, selectionState)
      selectionState = next
      notifySelectionListeners()
      // Force full re-render to remove overlay
      if (currentBuffer) {
        runtime.invalidate()
        currentBuffer = doRender()
        runtime.render(currentBuffer)
      }
    }

    // When scrolled up in virtual inline mode, don't dispatch events to component tree
    // (except for search which is handled above)
    if (scrollback && virtualScrollOffset > 0 && event.type === "term:key") {
      // Any non-search keypress returns to live view
      virtualScrollOffset = 0
      return true
    }

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

    // Keypress performance span — wraps the entire batch cycle.
    // perfLog.span?.() short-circuits all argument evaluation when TRACE is off.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    using _perfSpan = perfLog.span?.(
      "keypress",
      (() => {
        startTracking()
        const keyEvents = events.filter((e) => e.type === "term:key")
        return {
          key:
            keyEvents.length > 0
              ? keyEvents.map((e) => (e.data as { input: string }).input).join(",")
              : (events[0]?.type ?? "unknown"),
        }
      })(),
    )

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

    // Input pipeline Stage 3: Event Loop — see docs/guide/input-architecture.md
    //
    // Event precedence (plugin-centric model):
    //   1. Raw: modifier tracking + keyboard state (always fires)
    //   2. Focused: focus tree dispatch via handleFocusNavigation (consumes if handled)
    //   3. Fallback: RuntimeContext listeners (useInput — only unhandled events)
    //   4. App handler (TEA update / commands)
    //
    // This ensures focused components (modals, TextInput) get events BEFORE global
    // hooks (useInput). A modal's onKeyDown for Escape fires before useInput's quit.
    for (const event of events) {
      if (event.type === "term:key") {
        const { input, key: parsedKey } = event.data as { input: string; key: Key }

        // Raw lane: Always update keyboard modifier state (Super/Cmd, Hyper) for
        // mouse events. SGR mouse protocol can't report these — Kitty fills the gap.
        updateKeyboardModifiers(mouseEventState, parsedKey)

        // Release and modifier-only events: bridge to RuntimeContext (useModifierKeys
        // needs them) but skip focus dispatch and app handlers.
        if (parsedKey.eventType === "release" || isModifierOnlyEvent(input, parsedKey)) {
          for (const listener of runtimeInputListeners) {
            listener(input, parsedKey)
          }
          if (shouldExit) {
            inEventHandler = false
            return null
          }
          continue
        }

        // Focused lane: dispatch through focus tree BEFORE useInput.
        // If a focused component handles the event (stopPropagation/preventDefault),
        // useInput never sees it — focused components have priority.
        let focusConsumed = false
        if (focusManager.activeElement) {
          const focusResult = handleFocusNavigation(input, parsedKey, focusManager, container)
          focusConsumed = focusResult === "consumed"
        }

        // Fallback lane: bridge to RuntimeContext listeners (useInput) only if
        // the focus tree didn't consume the event.
        if (!focusConsumed) {
          for (const listener of runtimeInputListeners) {
            listener(input, parsedKey)
          }
        }
      } else if (event.type === "term:paste") {
        const { text } = event.data as { text: string }
        for (const listener of runtimePasteListeners) {
          listener(text)
        }
      } else if (event.type === "term:focus") {
        const { focused } = event.data as { focused: boolean }
        for (const listener of runtimeFocusListeners) {
          listener(focused)
        }
      }

      // If a listener called exit() (e.g., useInput handler returned "exit"),
      // stop processing events immediately — don't render or flush.
      if (shouldExit) {
        inEventHandler = false
        return null
      }

      // Skip key events already handled: release/modifier-only were continued above,
      // focus-consumed events still reach the app handler for render barriers.
      if (event.type === "term:key") {
        const { input, key: k } = event.data as { input: string; key: Key }
        if (k.eventType === "release") continue
        if (isModifierOnlyEvent(input, k)) continue
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
      // prevBuffer in sync with the Ag's internal prevBuffer. Without this,
      // the post-batch doRender's dirty-row tracking would be stale relative
      // to runtime.prevBuffer, causing diffBuffers() to skip all rows and
      // produce an empty diff (0 bytes output).
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

    // The render phase's dirty rows are relative to the Ag's internal prevBuffer.
    // But runtime.render() diffs against its own prevBuffer, which may differ
    // when: (a) multiple doRender calls shifted the Ag's prevBuffer ahead, or
    // (b) the Z chord timeout causes the zoom render to arrive as a deferred
    // event where intermediate renders have updated the Ag's prevBuffer.
    // Always mark all rows dirty to ensure runtime.render() does a full diff.
    // The cost is negligible (diffBuffers still skips identical rows via
    // rowMetadataEquals/rowCharsEquals pre-check), but correctness is guaranteed.
    currentBuffer._buffer.markAllRowsDirty()

    inEventHandler = false
    const runtimeStart = performance.now()
    runtime.render(currentBuffer)
    // Post-render: push to scrollback, overlay selection/search
    pushToScrollback()
    if (virtualScrollOffset > 0) {
      renderVirtualScrollbackView()
    }
    writeSelectionOverlay()
    renderSearchHighlights()
    renderSearchBarOverlay()
    const runtimeMs = performance.now() - runtimeStart
    if (_perfLog) {
      const totalMs = performance.now() - _eventStart
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/tmp/silvery-perf.log",
        `EVENT batch(${events.length} ${events[0]?.type}): ${totalMs.toFixed(1)}ms total, ${_renderCount} doRender() calls, runtime.render=${runtimeMs.toFixed(1)}ms\n---\n`,
      )
    }
    // Budget check — warn if batch took longer than one frame (16ms)
    if (_perfSpan) {
      checkBudget(events[0]?.type ?? "batch", performance.now() - _eventStart)
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

    // Run text sizing probe BEFORE stdin is consumed by the input parser.
    // The probe writes a test sequence to stdout and reads the CPR response
    // from stdin. This must happen before pumpEvents() attaches the stdin
    // data listener, otherwise the CPR response would be consumed as a key event.
    if (needsProbe) {
      try {
        // Set up temporary raw mode + stdin listener for probe
        const wasRaw = stdin.isRaw
        if (stdin.isTTY && !wasRaw) {
          stdin.setRawMode(true)
          stdin.resume()
          stdin.setEncoding("utf8")
        }

        const probeRead = (): Promise<string> =>
          new Promise<string>((resolve) => {
            const onData = (data: string) => {
              stdin.off("data", onData)
              resolve(data as string)
            }
            stdin.on("data", onData)
          })

        const probeResult = await detectTextSizingSupport(
          (data) => (outputGuard ? outputGuard.writeStdout(data) : stdout.write(data)),
          probeRead,
          500, // Short timeout — probe should be fast
        )

        // If probe result differs from initial heuristic, recreate pipeline
        if (probeResult.supported !== textSizingEnabled) {
          textSizingEnabled = probeResult.supported
          if (effectiveCaps) {
            effectiveCaps = { ...effectiveCaps, textSizingSupported: textSizingEnabled }
            pipelineConfig = createPipeline({ caps: effectiveCaps })
            // Update runtime's output phase to use the new measurer
            runtime.setOutputPhaseFn(pipelineConfig.outputPhaseFn)
          }
          // Invalidate pipeline and runtime diff state for full redraw.
          // Recreate Ag with updated measurer (text sizing support changed).
          _ag = null
          runtime.invalidate()
          // Force full re-render with updated measurer
          if (!isRendering) {
            isRendering = true
            try {
              currentBuffer = doRender()
              runtime.render(currentBuffer)
            } finally {
              isRendering = false
            }
          }
        }

        // Restore raw mode if we changed it (pumpEvents will set it again)
        if (stdin.isTTY && !wasRaw) {
          stdin.setRawMode(false)
          stdin.pause()
        }
      } catch {
        // Probe failed — keep current textSizing setting (safe fallback)
      }
    }

    // Run DEC width detection probe BEFORE stdin is consumed by the input parser.
    // Queries DEC modes 1020-1023 for emoji/CJK/PUA width settings.
    // Must happen before pumpEvents() for the same reason as text-sizing probe.
    if (needsWidthDetection) {
      try {
        const wasRaw = stdin.isRaw
        if (stdin.isTTY && !wasRaw) {
          stdin.setRawMode(true)
          stdin.resume()
          stdin.setEncoding("utf8")
        }

        const stdinHandlers: Array<(data: string) => void> = []
        const stdinListener = (data: string) => {
          for (const handler of stdinHandlers) handler(data)
        }
        stdin.on("data", stdinListener)

        const detector = createWidthDetector({
          write: (data) => (outputGuard ? outputGuard.writeStdout(data) : stdout.write(data)),
          onData: (handler) => {
            stdinHandlers.push(handler)
            return () => {
              const idx = stdinHandlers.indexOf(handler)
              if (idx >= 0) stdinHandlers.splice(idx, 1)
            }
          },
          timeoutMs: 200,
        })

        const widthConfig = await detector.detect()
        detector.dispose()
        stdin.off("data", stdinListener)

        // Apply detected width config to caps and recreate pipeline if changed
        if (effectiveCaps) {
          const updatedCaps = applyWidthConfig(effectiveCaps, widthConfig)
          const capsChanged =
            updatedCaps.textEmojiWide !== effectiveCaps.textEmojiWide ||
            updatedCaps.textSizingSupported !== effectiveCaps.textSizingSupported
          if (capsChanged) {
            effectiveCaps = updatedCaps
            pipelineConfig = createPipeline({ caps: effectiveCaps })
            runtime.setOutputPhaseFn(pipelineConfig.outputPhaseFn)
            // Recreate Ag with updated measurer (caps changed text sizing/emoji width)
            _ag = null
            runtime.invalidate()
            if (!isRendering) {
              isRendering = true
              try {
                currentBuffer = doRender()
                runtime.render(currentBuffer)
              } finally {
                isRendering = false
              }
            }
          }
        }

        if (stdin.isTTY && !wasRaw) {
          stdin.setRawMode(false)
          stdin.pause()
        }
      } catch {
        // Width detection failed — keep default caps (safe fallback)
      }
    }

    // Start pump in background — this synchronously runs the term-provider
    // generator body, which attaches the stdin data listener. After this call,
    // stdin is being consumed, so terminal responses won't leak as raw text.
    pumpEvents().catch((err: unknown) => log.error?.(`pumpEvents failed: ${err}`))

    // Enable focus reporting NOW — after stdin listener is attached.
    // Must be deferred from the init phase because the terminal's immediate
    // CSI I/O response would leak before the input parser was ready.
    if (focusReportingOption && !focusReportingEnabled) {
      enableFocusReporting((s) => (outputGuard ? outputGuard.writeStdout(s) : stdout.write(s)))
      focusReportingEnabled = true
    }

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

        // Drain-then-render: yield to the event loop repeatedly so the pump
        // (async-iterator chain: term-provider → merge → map → takeUntil →
        // pumpEvents) can push ALL pending events into eventQueue before we
        // process the batch. Each hop through the async iterator pipeline
        // costs several microtask ticks per event, so a single
        // `Promise.resolve()` yield is not enough to drain a burst of 10+
        // events from the term-provider's internal queue. We use
        // `setImmediate` (which runs after ALL pending microtasks) so that a
        // full async-iterator round-trip has time to complete. Then we loop
        // until the queue is stable across two consecutive yields, meaning
        // the pipeline has delivered everything it had ready.
        //
        // This ensures rapid keypresses (e.g., jumping from fold level 1 to
        // 10, or OS auto-repeat buffering "jjjjj...") coalesce into ONE
        // render cycle instead of N.
        //
        // Safety: bounded by maxDrainSpins to prevent pathological stalls
        // if an event source is producing faster than we can drain. Under
        // realistic auto-repeat (30-60 keys/sec), events arrive in a short
        // burst then go quiet — maxDrainSpins=32 is plenty of headroom.
        const maxDrainSpins = 32
        let drainSpins = 0
        const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve))
        // First mandatory yield — lets events already in-flight land.
        await yieldToEventLoop()
        let prevLen = eventQueue.length
        while (drainSpins < maxDrainSpins) {
          // eslint-disable-next-line no-await-in-loop -- intentional: sequential yields drain the async iterator pipeline
          await yieldToEventLoop()
          const curLen = eventQueue.length
          if (curLen === prevLen) break
          prevLen = curLen
          drainSpins++
        }
        if (_perfLog) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require("node:fs").appendFileSync(
            "/tmp/silvery-perf.log",
            `DRAIN: spins=${drainSpins}, batch=${eventQueue.length}\n`,
          )
        }
        // Expose diagnostic counters on globalThis for test assertions.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _g = globalThis as any
        _g.__silvery_last_drain_spins = drainSpins
        _g.__silvery_last_batch_size = eventQueue.length
        _g.__silvery_batch_count = (_g.__silvery_batch_count ?? 0) + 1

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

      // Async drain: give the event loop 1 tick + 15ms to receive any
      // late-arriving bytes (Kitty release events, mouse events) that were
      // in the kernel TTY buffer when we sent the disable sequences.
      // This is the async path — signal handlers use the sync fallback in exit().
      if (shouldExit && !cleanedUp && !headless && stdin.isTTY) {
        try {
          // Remove data listener but keep raw mode on — we're still consuming
          stdin.removeAllListeners("data")
          stdin.resume()
          // Let the event loop tick to deliver kernel-buffered bytes
          await new Promise((resolve) => setTimeout(resolve, 15))
          // Drain whatever arrived
          while (stdin.read() !== null) {
            /* discard late arrivals */
          }
          stdin.pause()
        } catch {
          // Best-effort — continue to cleanup
        }
      }

      // Cleanup and resolve exit promise
      cleanup()
      exitResolve()
    }
  }

  // Start loop in background
  eventLoop().catch((err: unknown) => {
    cleanup() // exit alt screen so error is visible in normal terminal
    const errObj = err instanceof Error ? err : new Error(String(err))
    const msg = errObj.message
    const stack = errObj.stack ?? "(no stack)"

    // Dump the full error + stack to a temp file — alt screen clears
    // stderr, and for deep stacks (e.g. "Maximum call stack size exceeded")
    // the user needs the recursive frame to diagnose. Same pattern as the
    // SILVERY_STRICT mismatch dump and the React render-error dump.
    let dumpPath: string | undefined
    try {
      dumpPath = `${tmpdir()}/silvery-eventloop-failure-${Date.now()}.txt`
      writeFileSync(dumpPath, `${msg}\n\n${stack}\n`)
    } catch {
      // Best-effort
    }

    const summaryLine = dumpPath
      ? `eventLoop failed: ${msg.split("\n")[0]}\n  dump: ${dumpPath}`
      : `eventLoop failed: ${msg.split("\n")[0]}`
    log.error?.(summaryLine)
    process.stderr.write(`\n${summaryLine}\n`)
    process.exitCode = 1
  })

  // Return handle with async iteration
  const handle: AppHandle<S & I> = {
    get text() {
      return currentBuffer.text
    },
    get root() {
      return getContainerRoot(container)
    },
    get buffer() {
      return currentBuffer?._buffer ?? null
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
      // perfLog.span is always defined; the cost of performance.now() is negligible.
      const pressStart = performance.now()
      // Convert named keys to ANSI bytes (Kitty protocol when enabled)
      const ansiKey = useKittyMode ? keyToKittyAnsi(rawKey) : keyToAnsi(rawKey)
      const [input, parsedKey] = parseKey(ansiKey)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      using _perfSpan = perfLog.span?.(
        "keypress",
        (() => {
          startTracking()
          return { key: input || rawKey }
        })(),
      )

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
        if (_perfSpan) checkBudget(input || rawKey, performance.now() - pressStart)
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
      // Mark all rows dirty — same safety net as processEventBatch (line 2443).
      // When the effect flush loop ran additional doRender calls, the final buffer's
      // dirty rows are relative to the Ag's internal prevBuffer (which advanced),
      // not the runtime's prevBuffer (which is from the last runtime.render()).
      // Without this, diffBuffers skips rows that changed relative to runtime's
      // prevBuffer but aren't marked dirty → garbled output.
      if (flushCount > 0) {
        currentBuffer._buffer.markAllRowsDirty()
      }
      inEventHandler = false
      runtime.render(currentBuffer)
      if (_perfSpan) checkBudget(input || rawKey, performance.now() - pressStart)
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
