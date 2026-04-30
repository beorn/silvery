/**
 * createApp() - Layer 3 entry point for silvery-loop
 *
 * Provides signal-backed store integration with a Term-driven event loop.
 * The event loop subscribes directly to the Term's `input` + `size`
 * sub-owners — no async-iterator `events()` pipeline.
 *
 * @example
 * ```tsx
 * import { createApp, useApp } from '@silvery/create/create-app'
 * import { createTerm } from '@silvery/ag-term/ansi'
 *
 * const app = createApp(
 *   // Store factory
 *   ({ term }) => (set, get) => ({
 *     count: 0,
 *     increment: () => set(s => ({ count: s.count + 1 })),
 *   }),
 *   // Event handlers — namespaced as 'provider:event'
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
 * using term = createTerm()
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
import { watch } from "@silvery/signals"

import { createTerm } from "../ansi"
import {
  CacheBackendContext,
  CapabilityRegistryContext,
  ChainAppContext,
  type ChainAppContextValue,
  FocusManagerContext,
  RuntimeContext,
  type RuntimeContextValue,
  StdoutContext,
  StderrContext,
  TermContext,
  type TerminalFrameArtifact,
} from "@silvery/ag-react/context"
import { SilveryErrorBoundary } from "@silvery/ag-react/error-boundary"
import { ScopeProvider } from "@silvery/ag-react/ScopeProvider"
import { createScope, reportDisposeError, type Scope } from "@silvery/scope"
import { createFocusManager } from "@silvery/ag/focus-manager"
import { createCursorStore, CursorProvider } from "@silvery/ag-react/hooks/useCursor"
import { createFocusEvent, dispatchFocusEvent } from "@silvery/ag/focus-events"
import { createPipeline } from "../measurer"
import {
  detectTextSizingSupport,
  getCachedProbeResult,
  getTerminalFingerprint,
} from "../text-sizing"
import { createWidthDetector, applyWidthConfig } from "../ansi/width-detection"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
  setOnNodeRemoved,
} from "@silvery/ag-react/reconciler"
import { map, merge, takeUntil } from "@silvery/create/streams"
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
  hitTest,
  resolveUserSelect,
  createClickCountState,
  checkClickCount,
} from "../mouse-events"
import { setArmed } from "@silvery/ag/interactive-signals"
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
import type { Buffer, Dims, Provider, RenderTarget } from "./types"
import {
  createTerminalSelectionState,
  terminalSelectionUpdate,
  extractText,
  type SelectionScope,
} from "@silvery/headless/selection"
import { createSelectionBridge, type SelectionFeature } from "../features/selection"
import {
  createCapabilityRegistry,
  type CapabilityRegistry,
} from "@silvery/create/internal/capability-registry"
import { SELECTION_CAPABILITY } from "@silvery/create/internal/capabilities"
import {
  createBaseApp,
  withCustomEvents,
  withTerminalChain,
  withPasteChain,
  withInputChain,
  withFocusChain,
  type BaseApp,
  type CustomEventStore,
  type InputStore,
  type PasteStore,
  type TerminalStore,
  type FocusChainStore,
} from "@silvery/create/plugins"
import { createVirtualScrollback } from "../virtual-scrollback"
import { createSearchState, searchUpdate } from "../search-overlay"
import { createOutput, type Output } from "./devices/output"
import { createModes } from "./devices/modes"
import type { Term } from "../ansi/term"
import { perfLog, checkBudget, logExitSummary, startTracking } from "./perf"
import {
  addWriter,
  createFileWriter,
  createLogger,
  getLogLevel,
  setLogLevel,
  type LogLevel,
} from "loggily"
import {
  createRenderer,
  createSearchScrollback,
  pushToScrollback as pushToScrollbackFn,
  renderVirtualScrollbackView as renderVirtualScrollbackViewFn,
  applySearchBarToPaintBuffer as applySearchBarToPaintBufferFn,
  applySearchHighlightsToPaintBuffer as applySearchHighlightsToPaintBufferFn,
  applySelectionToPaintBuffer as applySelectionToPaintBufferFn,
} from "./renderer"
import { createBuffer as wrapBuffer } from "./create-buffer"
import {
  beginConvergenceLoop,
  beginPass,
  notePassCommit,
  logPass,
  printPassHistogram,
  appendHistogramJson,
  resetPassHistogram,
  assertBoundedConvergence,
  MAX_CONVERGENCE_PASSES,
  INSTRUMENT,
} from "./pass-cause"

const log = createLogger("silvery:app")
const traceLog = createLogger("silvery:trace")

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
 * Check if value is a Provider usable by the event loop.
 *
 * Two accepted shapes:
 *   - Term umbrella: has `.size` + `.modes` sub-owners. The event loop
 *     subscribes directly via `term.input.on*` and `watch(term.size.snapshot())`.
 *   - Legacy custom Provider: has `events()`/`getState()`/`subscribe()`. The
 *     event loop iterates `events()` into the queue.
 */
function isFullProvider(value: unknown): value is Provider<unknown, Record<string, unknown>> {
  if (value === null || value === undefined) return false
  // Term is a Proxy wrapping chalk, so typeof is "function" not "object"
  if (typeof value !== "object" && typeof value !== "function") return false
  const o = value as Record<string, unknown>
  // Term-shape: has `size` sub-owner.
  if (
    typeof o.size === "object" &&
    o.size !== null &&
    typeof (o.size as Record<string, unknown>).cols === "function"
  ) {
    return true
  }
  // Legacy Provider shape.
  return (
    "getState" in o &&
    "subscribe" in o &&
    "events" in o &&
    typeof o.getState === "function" &&
    typeof o.subscribe === "function" &&
    typeof o.events === "function"
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
  focusManager: import("@silvery/ag/focus-manager").FocusManager
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
   * Pre-built {@link TerminalProfile} produced by `createTerminalProfile()`.
   * When supplied, `caps` is read from `profile.caps` — the run pipeline
   * uses the profile's caps directly, skipping any additional detection.
   * Phase 4 of `km-silvery.terminal-profile-plateau` — lets `run()` /
   * `createApp()` / `createTerminalProfile()` share one resolution pass.
   *
   * When both `caps` and `profile` are supplied, the profile wins. A
   * caller who only has `caps` and not a profile can still pass `caps`
   * directly — the pipeline behaves identically to pre-Phase-4.
   */
  profile?: import("@silvery/ansi").TerminalProfile
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
  /**
   * Root app scope — all `useScope()` / `useAppScope()` reads at the app
   * root resolve to this same value. Disposed (LIFO over `defer`/`use`
   * registrations and any fiber-attached child scopes) when the app
   * unmounts, on SIGINT/SIGTERM (via `term.signals` if a real Term is
   * present), or when callers `await scope[Symbol.asyncDispose]()` it
   * directly. See `km-silvery.lifecycle-scope`.
   */
  readonly scope: Scope
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
    caps: capsOptionRaw,
    profile: profileOption,
    guardOutput: guardOutputOption,
    Root: RootComponent,
    capabilityRegistry: capabilityRegistryOption,
    writable: explicitWritable,
    onResize: explicitOnResize,
    ...injectValues
  } = options

  // Phase 4 of km-silvery.terminal-profile-plateau: a caller-supplied
  // `profile` wins over `caps`. Both paths converge on `capsOption` — the
  // rest of initApp stays identical, so every existing code site that reads
  // `capsOption?.textSizing` / `capsOption?.kittyKeyboard` sees the
  // same shape whether caps came from `caps` or `profile.caps`.
  const capsOption = profileOption?.caps ?? capsOptionRaw
  // Post km-silvery.plateau-naming-polish (2026-04-23): profile identity lives
  // on `profile.emulator` (program/version/TERM). createApp's probe-cache
  // fingerprint reads off the emulator when a profile is supplied.
  const emulatorOption = profileOption?.emulator

  // Derive kitty mode for press(): use explicit kittyMode if set, otherwise
  // auto-enable when kitty protocol is active (so press() encodes modifier keys correctly)
  const useKittyMode = explicitKittyMode ?? !!kittyOption

  const headless =
    (explicitCols != null && explicitRows != null && !explicitStdout) || explicitWritable != null
  const cols = explicitCols ?? process.stdout.columns ?? 80
  const rows = explicitRows ?? process.stdout.rows ?? 24
  const stdout = explicitStdout ?? process.stdout

  // If the caller passed `term` (from run()'s Term path), its `modes` sub-owner
  // is the single authority for protocol mode toggles — raw, alt-screen, paste,
  // kitty keyboard, mouse, focus reporting. Otherwise we construct a local
  // Modes owner over the raw streams to get the same consolidation for
  // createApp-direct callers. Either way, every enable*/disable* call in this
  // function goes through an owner — no scattered raw ANSI toggles.
  // See km-silvery.term-sub-owners Phase 4.
  const injectedTerm = (injectValues as { term?: Term }).term

  // Output guard: created after protocol setup (see below).
  // Only guard when using real process.stdout — mock stdouts don't benefit from
  // the guard (which patches process.stdout.write), and it would route render
  // output to the real stdout instead of the mock.
  const isRealStdout = stdout === process.stdout
  const shouldGuardOutput = guardOutputOption ?? (alternateScreen && !headless && isRealStdout)
  // Output owner — mediates stdout/stderr/console writes. Stable across the
  // session; toggled via activate()/deactivate() for pause/resume cycles.
  // If an injected Term exposes `.output`, we reuse it (one writer per
  // resource). Otherwise we construct a local one and own its lifetime.
  //
  // Declared BEFORE `modes` so the local Modes owner's writer can close over
  // it lazily. Without that, modes captures `stdout.write` at construction
  // time; once `output.activate()` later monkey-patches `process.stdout.write`
  // into the suppress sink, every mode-toggle ANSI (alt-screen enter, mouse,
  // kitty keyboard, focus reporting) silently lands in the sink and never
  // reaches the terminal. Same shape as the Pro-review 2026-04-22 P0-1 fix
  // for `term.modes` (which already routes through `ownedWrite`); this
  // mirrors that for createApp's local-modes fallback.
  let output: Output | null = null
  let ownsOutput = false

  const modes =
    injectedTerm?.modes ??
    createModes({
      write: (s) => (output && output.active() ? output.write(s) : stdout.write(s)),
      stdin,
    })

  // Initialize layout engine
  await ensureLayoutEngine()

  // Root app scope (km-silvery.lifecycle-scope Phase 1).
  //
  // Owns every resource that should live for the duration of this app:
  //   - components register child scopes via `useScopeEffect`
  //   - host-config disposes fiber-attached scopes when subtrees unmount
  //   - SIGINT/SIGTERM (when an injected Term exposes `term.signals`) start
  //     root disposal — fire-and-forget, errors via `reportDisposeError`.
  //
  // The same value is exposed to React via both `ScopeContext` and
  // `AppScopeContext` so `useScope()` and `useAppScope()` resolve to it
  // when no inner provider is present. Disposal is wired into `cleanup()`
  // below so it runs after React unmount but before terminal protocol
  // cleanup — child scopes get a chance to release resources before we
  // tear down stdin/stdout.
  const appScope = createScope("app")

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

  // Create Term if not provided. In headless mode we pass mock streams so the
  // Term doesn't touch real stdin/stdout; `onResize` drives the mock stdout's
  // resize listeners so `term.size` observes dim changes.
  let autoTerm: Term | null = null
  if (!("term" in injectValues) || !isFullProvider(injectValues.term)) {
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
    autoTerm = createTerm({ stdin: termStdin, stdout: termStdout })
    providers.term = autoTerm as unknown as Provider<unknown, Record<string, unknown>>
    providerCleanups.push(() => autoTerm![Symbol.dispose]())

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

  // Wire SIGINT/SIGTERM into root-scope disposal (km-silvery.lifecycle-scope).
  //
  // The terminal Term owns the actual `process.on(...)` registrations via
  // `term.signals` — we just mediate one handler per signal that starts
  // root-scope teardown. `term.signals.on(...)` returns a `SignalUnregister`
  // which is `Disposable & AsyncDisposable`, so we adopt it into `appScope`
  // and the unregister fires when the scope disposes (idempotent on a
  // process exiting after a real signal). Skipped for headless because
  // there's no real terminal for SIGINT to come from, and tests routinely
  // create+dispose Terms in tight loops without wanting global handlers.
  const effectiveTerm = injectedTerm ?? autoTerm
  if (!headless && effectiveTerm?.signals) {
    const onSignal = (): void => {
      void appScope[Symbol.asyncDispose]().catch((error) =>
        reportDisposeError(error, { phase: "signal", scope: appScope }),
      )
    }
    appScope.use(
      effectiveTerm.signals.on("SIGINT", onSignal, {
        priority: 5,
        name: "scope-root-sigint",
      }),
    )
    appScope.use(
      effectiveTerm.signals.on("SIGTERM", onSignal, {
        priority: 5,
        name: "scope-root-sigterm",
      }),
    )
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

  // Subscribe to resize events so currentDims stays in sync.
  // In headless mode this is handled by explicitOnResize above.
  // When a Term with a `size` sub-owner is injected, subscribe through the
  // owner so create-app sees the SAME coalesced geometry as the rest of the
  // pipeline. Otherwise fall back to direct stdout "resize" events for
  // standalone callers. See km-silvery.term-sub-owners Phase 5.
  if (!headless) {
    const termSize = injectedTerm?.size
    if (termSize) {
      // Change-only subscription: `watch` swallows the seed fire so
      // mockTermSubscribers only see real resizes.
      const stop = watch(
        () => termSize.snapshot(),
        (next) => {
          currentDims = { cols: next.cols, rows: next.rows }
          for (const listener of mockTermSubscribers) listener(currentDims)
        },
      )
      providerCleanups.push(stop)
    } else {
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

    // Pipe `silvery:trace`-namespaced loggily records to the trace log file.
    // The `{ ns: "silvery:trace" }` config routes only that namespace through
    // the writer — other silvery namespaces (silvery:app, silvery:render,
    // etc.) don't pollute the file.
    // Auto-lowers global log level to "debug" when above, so traceLog.debug?.()
    // banner records actually emit; restored on cleanup.
    const traceFileWriter = createFileWriter("/tmp/silvery-trace.log")
    const unsubscribeTraceWriter = addWriter({ ns: "silvery:trace" }, (formatted) =>
      traceFileWriter.write(formatted),
    )
    const _prevLogLevel: LogLevel = getLogLevel()
    if (_prevLogLevel !== "trace" && _prevLogLevel !== "debug") {
      setLogLevel("debug")
    }
    providerCleanups.push(() => {
      unsubscribeTraceWriter()
      traceFileWriter.close()
      if (_prevLogLevel !== "trace" && _prevLogLevel !== "debug") {
        setLogLevel(_prevLogLevel)
      }
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
            if (output) {
              output.write(frame)
            } else {
              stdout.write(frame)
            }
          }
        },
        getDims(): Dims {
          return currentDims
        },
        onResize(handler: (dims: Dims) => void): () => void {
          // Prefer the injected Term's Size owner (coalesced) when present;
          // fall back to direct stdout "resize" for standalone callers.
          const termSize = injectedTerm?.size
          if (termSize) {
            return watch(
              () => termSize.snapshot(),
              (next) => {
                currentDims = { cols: next.cols, rows: next.rows }
                handler(currentDims)
              },
            )
          }
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

  const postPaintWrites: string[] = []
  const frameArtifacts: TerminalFrameArtifact[] = []
  const writeOutOfBand = (data: string): void => {
    if (headless) return
    if (output) {
      output.write(data)
    } else {
      stdout.write(data)
    }
  }
  const queuePostPaintWrite = (data: string): void => {
    if (headless) return
    postPaintWrites.push(data)
  }
  const queueFrameArtifact = (artifact: TerminalFrameArtifact): void => {
    if (headless) return
    frameArtifacts.push(artifact)
  }
  const flushPostPaintWrites = (): void => {
    if (frameArtifacts.length > 0) {
      const artifacts = frameArtifacts.splice(0)
      artifacts.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
      for (const artifact of artifacts) {
        switch (artifact.kind) {
          case "terminal-sequence":
            writeOutOfBand(artifact.sequence)
            break
        }
      }
    }
    if (postPaintWrites.length === 0) return
    const writes = postPaintWrites.splice(0)
    for (const data of writes) writeOutOfBand(data)
  }

  // Resolve textSizing from caps + option
  // For "auto": use caps flag first, probe to verify if caps says yes
  // For "probe": start disabled, probe async to determine
  // For true/false: use directly
  // Post km-silvery.unicode-plateau Phase 2: read `caps.textSizing`
  // directly — profile.ts already computed the authoritative flag from
  // TERM=xterm-kitty + TERM_PROGRAM_VERSION. No second env probe.
  const heuristicSupported = capsOption?.textSizing ?? false
  const shouldProbe =
    textSizingOption === "probe" || (textSizingOption === "auto" && heuristicSupported)
  // Probe-cache fingerprint: program@version, derived from caps. Computed
  // once so the initial cache check and the async-probe path share one key.
  const probeFingerprint = getTerminalFingerprint(emulatorOption ?? { program: "", version: "" })
  // If we have a cached probe result, use it immediately instead of probing again
  const cachedProbe = shouldProbe ? getCachedProbeResult(probeFingerprint) : undefined
  let textSizing: boolean
  if (textSizingOption === true) {
    textSizing = true
  } else if (textSizingOption === "probe") {
    // "probe": start disabled unless cache says supported
    textSizing = cachedProbe?.supported ?? false
  } else if (textSizingOption === "auto") {
    if (cachedProbe !== undefined) {
      // Cache available: use definitive probe result
      textSizing = cachedProbe.supported
    } else {
      // No cache: use heuristic for first render, probe will verify
      textSizing = heuristicSupported
    }
  } else {
    textSizing = false
  }

  // Whether we still need to run the async probe (no cache hit)
  const needsProbe = shouldProbe && cachedProbe === undefined && !headless

  // Resolve width detection: "auto" enables when caps are provided and not headless
  const needsWidthDetection =
    !headless &&
    (widthDetectionOption === true || (widthDetectionOption === "auto" && capsOption != null))

  // Track effective caps — may be updated by width detection and text sizing
  // probes. Heuristic fields (`maybeWideEmojis` etc.) live on caps now (post
  // km-silvery.plateau-naming-polish), so width detection toggles them
  // directly on the same object.
  let effectiveCaps = capsOption ? { ...capsOption, textSizing: textSizing } : undefined

  // Create pipeline config from caps (scoped width measurer + output phase).
  // Use `let` because the pipeline may be recreated after a probe changes
  // textSizing or width detection flips `caps.maybeWideEmojis`.
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
  // Selection follows mouse: when mouse tracking is enabled, drag-to-select +
  // OSC 52 copy should work without requiring explicit opt-in. (The comment
  // here used to say "don't hijack mouse clicks by default" but the
  // documented default is "true when mouse is enabled" — the old `?? false`
  // made every consumer set selection:true manually.) Callers that really
  // want mouse-without-selection pass `selection:false`.
  const selectionEnabled = selectionOption ?? mouseOption === true
  let selectionState = createTerminalSelectionState()

  // --- Selection drag-vs-click state machine ---
  //
  //   idle     --mouseDown--> armed      (store anchor, NO selection started yet)
  //   armed    --mouseMove(|Δ|>=1)--> dragging (dispatch start then extend)
  //   armed    --mouseUp-->   idle       (plain click — click dispatches
  //                                       normally, no selection created;
  //                                       on 2nd / 3rd click in a chain
  //                                       dispatch startWord / startLine
  //                                       so the upcoming drag extends by
  //                                       word / line granularity)
  //   dragging --mouseMove--> dragging   (dispatch extend with current pos;
  //                                       extend uses the current granularity
  //                                       so word / line drags snap)
  //   dragging --mouseUp-->   idle       (dispatch finish + OSC 52,
  //                                       SUPPRESS subsequent onClick)
  //
  // `pendingSelectionDown` holds the armed anchor + scope between mousedown
  // and the first move-past-threshold. It is null in every other state.
  // `selectionState.selecting` is true only while dragging.
  //
  // Threshold: selection activates on the first move to a different cell
  // than the anchor. Same-cell jitter (mouse reports at same (x,y)) stays
  // in `armed` and ends as a plain click on mouseUp.
  let pendingSelectionDown: {
    col: number
    row: number
    scope: SelectionScope | null
    /** Click-count this mousedown belongs to (1, 2, or 3).
     *  Determines what action to dispatch on the corresponding mouseUp:
     *  1 → no selection (plain click), 2 → startWord, 3 → startLine.
     *  Also determines drag granularity if the down is followed by a move:
     *  count=2 starts a word-granular drag, count=3 a line-granular drag. */
    clickCount: 1 | 2 | 3
  } | null = null

  // Deferred word/line auto-select intent — captured on mouseup-from-armed
  // (clickCount >= 2) and applied AFTER the component-tree dispatch so that
  // a downstream onClick / onDoubleClick / onTripleClick handler that calls
  // `event.preventDefault()` can opt out. See the gating comment in the
  // mouseup branch below.
  let pendingAutoSelect: {
    col: number
    row: number
    scope: SelectionScope | null
    clickCount: 2 | 3
  } | null = null
  // Click-count tracker dedicated to selection (separate from
  // mouseEventState.doubleClick which drives onDoubleClick / onTripleClick
  // dispatch on the component tree). Updated on every mousedown so we
  // arm `pendingSelectionDown` with the right granularity intent. Without
  // a dedicated state, peeking mouseEventState.doubleClick on mousedown
  // would race the down-stream call inside processMouseEvent.
  const selectionClickCount = createClickCountState()

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

    // Pass-cause histogram (only emits when SILVERY_INSTRUMENT=1; no-op
    // otherwise). Aggregates across the lifetime of this app instance.
    //
    // - SILVERY_INSTRUMENT_FILE set: append a JSON record per app teardown.
    //   Suitable for vitest worker threads where `process.on("exit")` may
    //   not fire (each test still produces a teardown via app cleanup).
    // - SILVERY_INSTRUMENT_PRINT=1: also emit the formatted text summary
    //   (to stderr by default; to file if SILVERY_INSTRUMENT_FILE is set).
    //
    // Reset after emission so the next app's histogram doesn't double-count.
    if (INSTRUMENT) {
      const file = process.env.SILVERY_INSTRUMENT_FILE
      if (file) appendHistogramJson(file)
      if (process.env.SILVERY_INSTRUMENT_PRINT === "1") printPassHistogram()
      resetPassHistogram()
    }

    // Unmount React tree first — this runs effect cleanups (clears intervals,
    // cancels subscriptions) before we tear down the infrastructure.
    //
    // Fiber teardown also disposes any per-fiber scopes attached via
    // `attachNodeScope` (host-config) and any child scopes owned by
    // `useScopeEffect`. After this step every component-owned resource
    // should have started disposal.
    try {
      reconciler.updateContainerSync(null, fiberRoot, null, () => {})
      reconciler.flushSyncWork()
    } catch {
      // Ignore — component tree may already be partially torn down
    }

    // Dispose the root app scope — runs every resource that registered
    // through `useAppScope().use(...)` / `appScope.defer(...)` (LIFO),
    // and cascades into any child scopes that haven't already disposed
    // via fiber teardown above. Fire-and-forget: cleanup() is sync, so
    // any async-disposer rejection routes through `reportDisposeError`
    // (phase: "app-exit") instead of throwing into the caller.
    void appScope[Symbol.asyncDispose]().catch((error) =>
      reportDisposeError(error, { phase: "app-exit", scope: appScope }),
    )

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

    // Dispose output owner BEFORE terminal protocol cleanup — restores original
    // stdout/stderr write methods so the cleanup sequences go through unimpeded.
    // Only dispose if we constructed it; an injected Term's Output is owned by
    // the Term and will be disposed when the Term is.
    if (output) {
      if (ownsOutput) output.dispose()
      else output.deactivate()
      output = null
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

    // Dispose the Modes owner — restores any protocols it activated.
    // This runs AFTER the writeSync safety sequences above, so modes'
    // dispose is a no-op for the common exit path (state has already been
    // cleared). When createApp was invoked without a terminal Term (e.g.
    // tests that exit without the writeSync block running), Modes handles
    // its own cleanup.
    if (!injectedTerm) {
      // Only dispose locally-owned Modes. A Term-owned Modes is disposed by
      // the Term's own Symbol.dispose (see term.ts).
      modes[Symbol.dispose]()
    }

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
            paintFrame()
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
  //
  // CRITICAL: we seed the mock term with `{ cols, rows }` so it routes through
  // `createHeadlessTerm`, which uses `createFixedSize(dims)` — the resulting
  // `term.size.cols()` / `.rows()` reflect the app's *actual* viewport. If we
  // called `createTerm({ color: "truecolor" })` here, it would route through
  // `createNodeTerm` and read `process.stdout.columns/rows`, which in
  // termless/emulator/test contexts is the host's stdout (often 80×24) —
  // NOT the caller's emulator dims. That mismatch cascades into
  // `useWindowSize()` consumers: apps laying out `height={termRows}` above
  // an overflow-scroll container (e.g. ListView) would oversize the column,
  // pushing siblings below the viewport — the Composer-off-screen bug
  // (km-silvery.listview-flex-sibling).
  //
  // We still override `.size.cols()` / `.rows()` / `.snapshot()` to read
  // `currentDims` so resizes propagate through the same subscriber fanout.
  const baseMockTerm = createTerm({ cols: currentDims.cols, rows: currentDims.rows })
  const mockTermSubscribers = new Set<(state: { cols: number; rows: number }) => void>()
  // Bridge resize notifications into the baseMockTerm.size signal, so any
  // `useTerm(t => t.size.cols())` consumer re-renders on resize. The headless
  // Term's size is a `createFixedSize` with an `update(cols, rows)` method.
  const mockSizeUpdate = (
    baseMockTerm.size as unknown as {
      update?: (cols: number, rows: number) => void
    }
  ).update
  if (mockSizeUpdate) {
    mockTermSubscribers.add((next) => mockSizeUpdate(next.cols, next.rows))
  }
  const mockTerm = Object.create(baseMockTerm, {
    getState: { value: (): { cols: number; rows: number } => currentDims },
    subscribe: {
      value: (listener: (state: { cols: number; rows: number }) => void): (() => void) => {
        mockTermSubscribers.add(listener)
        return () => mockTermSubscribers.delete(listener)
      },
    },
  }) as typeof baseMockTerm

  // Apply-chain substrate (TEA Phase 2) — see
  // @silvery/create/runtime/{base-app,with-*-chain,event-loop}.
  //
  // Input / paste / terminal-focus events flow through the chain directly
  // (see `processEventBatch` and the `press()` path). The chain exposes
  // plugin stores on `ChainAppContext` that ag-react hooks subscribe to.
  //
  // withFocusChain.dispatchKey does the focus-tree dispatch inline — the
  // legacy `handleFocusNavigation(…) + runtimeInputListeners` decision
  // point is now a single chain call per event.
  const baseApp = createBaseApp()
  const terminalChainApp = withTerminalChain({
    cols: currentDims.cols,
    rows: currentDims.rows,
  })(baseApp)
  const pasteChainApp = withPasteChain({})(terminalChainApp)
  const inputChainApp = withInputChain(pasteChainApp)
  const focusChainApp = withFocusChain({
    dispatchKey: (input, key) => {
      const focusResult = handleFocusNavigation(input, key as Key, focusManager, container, {
        handleTabCycling: (options as { handleTabCycling?: boolean }).handleTabCycling ?? true,
      })
      return focusResult === "consumed"
    },
    hasActiveFocus: () => focusManager.activeElement !== null,
  })(inputChainApp)
  // Custom events — replaces the legacy RuntimeContext.on/emit surface
  // for app-defined channels (e.g. km-tui's `link:open`).
  const app = withCustomEvents(focusChainApp)
  // Focus event slice — mirrors the withTerminalChain `focused` snapshot
  // into a pub/sub store shaped like InputStore/PasteStore. Used by the
  // ChainAppContext `focusEvents` accessor (hooks useTerminalFocused,
  // useModifierKeys).
  const focusEventListeners: Array<(focused: boolean) => void> = []
  const appFocusEvents = {
    register(handler: (focused: boolean) => void): () => void {
      focusEventListeners.push(handler)
      return () => {
        const i = focusEventListeners.indexOf(handler)
        if (i >= 0) focusEventListeners.splice(i, 1)
      }
    },
    notify(focused: boolean): void {
      for (const h of focusEventListeners) h(focused)
    },
  }

  // Raw-key observer slice — hooks that need unfiltered access to key events
  // (useModifierKeys is the canonical consumer). Fired for every key event
  // including release and modifier-only, regardless of focus consumption.
  const rawKeyListeners: Array<(input: string, key: Key) => void> = []
  const appRawKeys = {
    register(handler: (input: string, key: Key) => void): () => void {
      rawKeyListeners.push(handler)
      return () => {
        const i = rawKeyListeners.indexOf(handler)
        if (i >= 0) rawKeyListeners.splice(i, 1)
      }
    },
    notify(input: string, key: Key): void {
      for (const h of rawKeyListeners) h(input, key)
    },
  }
  // Expose on the BaseApp so ag-react hooks can reach the slice once migrated.
  // Keep typing loose here — BaseApp extensions are added by plugins.
  type AppWithChains = BaseApp & {
    input: InputStore
    paste: PasteStore
    terminal: TerminalStore
    focusChain: FocusChainStore
    events: CustomEventStore
    focusEvents: typeof appFocusEvents
    rawKeys: typeof appRawKeys
  }
  const chainApp: AppWithChains = Object.assign(app, {
    focusEvents: appFocusEvents,
    rawKeys: appRawKeys,
  })

  // ChainAppContext value — the ag-react-visible slice of the chain.
  const chainAppContextValue: ChainAppContextValue = {
    input: chainApp.input,
    paste: chainApp.paste,
    focusEvents: chainApp.focusEvents,
    rawKeys: chainApp.rawKeys,
    events: chainApp.events,
  }

  // Runtime handle — trimmed to `exit()` only. Input / paste / focus
  // subscriptions live on `ChainAppContext` (see chainAppContextValue
  // above); app-defined view ↔ runtime events ride on
  // `ChainAppContext.events` (withCustomEvents).
  const runtimeContextValue: RuntimeContextValue = {
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
      <ScopeProvider scope={appScope} appScope={appScope}>
        <CursorProvider store={cursorStore}>
          <CacheBackendContext.Provider value={cacheBackend}>
            <TermContext.Provider value={mockTerm}>
              <StdoutContext.Provider
                value={{
                  // Headless backends: keep the mock stdout (no real terminal to write to).
                  // Real terminals: expose the actual stdout so consumers (e.g., Image)
                  // can read columns/rows and receive Kitty/Sixel escapes via `write`.
                  stdout: headless ? mockStdout : stdout,
                  // The render pipeline owns the silvery frame; out-of-band writes
                  // (image escapes, hyperlink protocol, etc.) need a path that
                  // bypasses the Output guard's stdout intercept. Prefer the Output
                  // owner's `write` (bypasses the intercept by design) when active;
                  // otherwise fall back to direct `stdout.write`. Headless = no-op.
                  write: headless
                    ? () => {}
                    : (data: string) => {
                        writeOutOfBand(data)
                      },
                  queueFrameArtifact: headless ? () => {} : queueFrameArtifact,
                  writeAfterFrame: headless ? () => {} : queuePostPaintWrite,
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
                      <ChainAppContext.Provider value={chainAppContextValue}>
                        <CapabilityRegistryContext.Provider value={capabilityRegistry}>
                          <Root>
                            <StoreContext.Provider value={store as StoreApi<unknown>}>
                              {element}
                            </StoreContext.Provider>
                          </Root>
                        </CapabilityRegistryContext.Provider>
                      </ChainAppContext.Provider>
                    </RuntimeContext.Provider>
                  </FocusManagerContext.Provider>
                </StderrContext.Provider>
              </StdoutContext.Provider>
            </TermContext.Provider>
          </CacheBackendContext.Provider>
        </CursorProvider>
      </ScopeProvider>
    </SilveryErrorBoundary>
  )

  // Performance instrumentation — count renders per event
  let _eventStart = 0
  const _perfLog: boolean = !!(
    typeof process !== "undefined" && process.env?.DEBUG?.includes("silvery:perf")
  )

  // Renderer factory — owns the long-lived Ag instance, prevBuffer tracking,
  // SILVERY_STRICT comparison, and perf logging. See renderer.ts.
  const rendererCellDebug =
    CELL_DEBUG && typeof CELL_DEBUG.x === "number" && typeof CELL_DEBUG.y === "number"
      ? { x: CELL_DEBUG.x, y: CELL_DEBUG.y }
      : null
  const renderer = createRenderer({
    wrappedElement,
    fiberRoot,
    container,
    runtime,
    alternateScreen,
    pipelineConfig,
    noIncremental: NO_INCREMENTAL,
    strictMode: STRICT_MODE,
    cellDebug: rendererCellDebug,
    instrumented: INSTRUMENTED,
    ansiTrace: _ansiTrace,
    perfLog: _perfLog,
  })
  const doRender = renderer.doRender

  // Startup ordering — both invariants must hold:
  //
  //   (1) Output owner activates BEFORE alt-screen entry so any
  //       stderr/console write during startup (React render, accountly
  //       init, recall index, loggily startup ticks, etc.) is captured
  //       by buffer-and-replay instead of flashing on the user's main
  //       screen for one frame and then being wiped by `\x1b[2J\x1b[H`.
  //       (Bug: silvercode startup log line briefly visible then lost.)
  //
  //   (2) Alt-screen entry happens BEFORE the initial doRender() so that
  //       React effects fired during reconcile (e.g., <Image>'s
  //       useEffect writing Kitty graphics escapes) land on the alt
  //       screen rather than the main screen and then get wiped when
  //       alt-screen entry clears its buffer.
  //
  // Sequence: output.activate() → alt-screen ON → clear → cursor hide →
  // first doRender (effects write to alt screen, surviving subsequent
  // cell paints because Kitty/Sixel images live above the text layer
  // with z>=0) → paintFrame writes the buffer.
  //
  // Capture model (Output owner):
  //   - DEBUG_LOG set       → mirror stderr/console writes to that file
  //   - DEBUG_LOG unset     → buffer stderr/console writes; replay to the
  //                           normal terminal on exit so the operator sees
  //                           what was logged (no silent drop, no sidecar
  //                           file by default)
  //   - SILVERY_NO_CAPTURE  → opt out for debugging, leave streams as-is
  //
  // Once active, process.stdout.write is patched to suppress non-silvery
  // writes — every silvery-owned write below (alt-screen sequences,
  // paintFrame target.write) must therefore go through `output.write`,
  // which toggles the silveryWriting flag so it bypasses the suppress
  // sink. The render `target` already routes through `output.write` when
  // `output` is set (see RenderTarget.write above), and the explicit
  // alt-screen sequences below mirror that via `writeOwned`.
  if (shouldGuardOutput && process.env.SILVERY_NO_CAPTURE !== "1") {
    // Prefer the injected Term's Output sub-owner (single writer per
    // resource). Fall back to constructing a local one when no Term is
    // injected or the Term has no Output (headless / emulator backends).
    const termOutput = injectedTerm?.output
    if (termOutput) {
      output = termOutput
      ownsOutput = false
    } else {
      output = createOutput()
      ownsOutput = true
    }
    // Default: buffer-and-replay when DEBUG_LOG isn't set. The buffer
    // flushes to the original stderr on deactivate(), so the operator
    // sees the captured output on exit instead of silently losing it.
    output.activate({ bufferStderr: !process.env.DEBUG_LOG })
  }

  // Local helper: route a transient write through the output owner when
  // active (so the suppress sink doesn't eat it), else through the raw
  // stdout. Used by the alt-screen entry block below for sequences that
  // don't naturally go through `target.write` or the modes owner.
  const writeOwned = (data: string): void => {
    if (output) output.write(data)
    else stdout.write(data)
  }

  // Enter alternate screen if requested, then clear and hide cursor —
  // BEFORE initial render so reconciler effects land on alt screen.
  if (!headless) {
    if (_ansiTrace) {
      traceLog.debug?.("=== ALT SCREEN + CLEAR ===")
    }
    if (alternateScreen) {
      // Route through modes so the owner tracks state for race-free dispose.
      // Clear + home still go through stdout — they're transient cursor moves,
      // not mode toggles. Use the owned writer so the (now-active) Output
      // sink doesn't suppress them.
      modes.altScreen(true)
      writeOwned("\x1b[2J\x1b[H")
    }
    writeOwned("\x1b[?25l")
  }

  // Initial render — must run AFTER alt-screen entry so reconciler effects
  // (Image, Static, etc.) write to the correct screen surface.
  if (_ansiTrace) {
    traceLog.debug?.("=== INITIAL RENDER ===")
  }
  currentBuffer = doRender()

  if (!headless) {
    // Kitty keyboard protocol — all paths go through the Modes owner so state
    // is tracked for race-free teardown.
    if (kittyOption != null && kittyOption !== false) {
      if (kittyOption === true) {
        // Auto-detect: probe terminal, enable if supported.
        // If caller already detected Kitty support synchronously (via caps from
        // detectTerminalCaps — $TERM-based), skip the 200ms stdio roundtrip and
        // enable directly. The synchronous heuristic is reliable for the four
        // Kitty-protocol terminals (kitty/ghostty/wezterm/foot); the probe only
        // adds value when caps weren't provided.
        if (capsOption?.kittyKeyboard) {
          modes.kittyKeyboard(defaultKittyFlags)
          kittyEnabled = true
          kittyFlags = defaultKittyFlags
        } else {
          const result = await detectKittyFromStdio(stdout, stdin as NodeJS.ReadStream)
          if (result.supported) {
            modes.kittyKeyboard(defaultKittyFlags)
            kittyEnabled = true
            kittyFlags = defaultKittyFlags
          }
        }
      } else {
        // Explicit flags — enable directly without detection
        modes.kittyKeyboard(kittyOption as number)
        kittyEnabled = true
        kittyFlags = kittyOption as number
      }
    } else if (kittyOption == null) {
      // No option specified: legacy behavior — always enable Kitty with full fidelity
      modes.kittyKeyboard(defaultKittyFlags)
      kittyEnabled = true
      kittyFlags = defaultKittyFlags
    }

    // Mouse tracking
    if (mouseOption) {
      modes.mouse(true)
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
  paintFrame()
  if (_perfLog) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("node:fs").appendFileSync(
      "/tmp/silvery-perf.log",
      `STARTUP: initial render done (render #${renderer.renderCount()}, incremental=${!renderer.isIncrementalOff()})\n`,
    )
  }

  // (Output owner is now activated earlier — before alt-screen entry — so
  // pre-render stderr writes are buffered. See the activate block above.)

  // Assign pause/resume now that doRender and runtime are available.
  // Update runtimeContextValue in-place so useApp()/useRuntime() sees the latest values.
  if (!headless) {
    runtimeContextValue.pause = () => {
      renderPaused = true
      // Deactivate the output owner so console-mode writes (e.g., log dump)
      // reach the terminal directly. Owner is retained — resume() re-activates.
      if (output) output.deactivate()
      if (alternateScreen) stdout.write(leaveAlternateScreen())
    }
    runtimeContextValue.resume = () => {
      if (alternateScreen) stdout.write(enterAlternateScreen())
      renderPaused = false
      // Re-activate the output owner (deactivated during pause)
      if (shouldGuardOutput && output) output.activate({ bufferStderr: !process.env.DEBUG_LOG })
      // Reset diff state so next render outputs a full frame.
      // The screen was cleared when entering console mode, so
      // incremental diffing would produce an incomplete frame.
      runtime.invalidate()
      renderer.resetAg()
      // Force full re-render to restore display, but only if we're not
      // already inside a doRender() call (e.g. when resume() is called
      // from a React effect cleanup during reconciliation).
      if (!isRendering) {
        currentBuffer = doRender()
        paintFrame()
      }
      // If isRendering is true, the outer doRender()/paintFrame() will
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
        `=== SUBSCRIPTION (case ${_case}, render #${renderer.renderCount() + 1}) ===\n${stack}\n`,
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
                `SUBSCRIPTION: deferred microtask render (case 2, render #${renderer.renderCount() + 1})\n`,
              )
            }
            isRendering = true
            try {
              currentBuffer = doRender()
              paintFrame()
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
        `SUBSCRIPTION: immediate render (case 3, render #${renderer.renderCount() + 1})\n`,
      )
    }
    isRendering = true
    try {
      currentBuffer = doRender()
      paintFrame()
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

  // Overlay helpers — thin wrappers over the pure functions in ./renderer.ts.
  // These bridge the closure state (currentBuffer, selectionState, scrollback,
  // virtualScrollOffset, searchState) into the pure functional API.

  /**
   * Paint the current frame, baking selection-highlight styling into the
   * buffer cells (when a selection is active) before handing off to runtime.
   *
   * Selection styling is applied to a CLONE of `currentBuffer`, never the
   * canonical buffer itself. Mutating `currentBuffer` would pollute Ag's
   * internal `_prevBuffer` reference (Ag uses the same buffer object for
   * incremental render's clone-and-skip fast path — see pipeline/CLAUDE.md).
   * Keeping the canonical buffer clean preserves the incremental invariant
   * that fast-path-skipped subtrees carry forward CONTENT pixels, not
   * accidental selection-colored ones.
   *
   * Replaces the legacy `runtime.render(currentBuffer) + writeSelectionOverlay()`
   * sequence which wrote inverse ANSI past the buffer. That approach kept
   * the buffer clean (good for Ag) but the diff engine couldn't track
   * overlay-painted cells, so on shrink the stale inverse pixels would
   * persist on screen.
   *
   * Tracking: km-silvery.delete-render-selection-overlay
   */
  // Function declaration (not arrow const) so it hoists to top-of-scope —
  // the initial render at startup calls paintFrame BEFORE this point in
  // source order. Closures over `currentBuffer` / `selectionState` /
  // `selectionEnabled` / `runtime` are by-reference, evaluated at call time.
  function paintFrame(): void {
    if (!currentBuffer) return
    const hasSelection = selectionEnabled && !!selectionState.range
    const hasSearchHighlight = searchState.active && searchState.currentMatch >= 0
    const hasSearchBar = searchState.active
    if (hasSelection || hasSearchHighlight || hasSearchBar) {
      const cloned = currentBuffer._buffer.clone()
      const paintBuf = wrapBuffer(cloned, currentBuffer.nodes, currentBuffer.overlay)
      // Force diff coverage — the clone starts with all rows clean, but
      // selection / search-highlight / search-bar styling will mutate cells.
      // Mark all rows so diffBuffers does the per-cell pre-check
      // (rowMetadataEquals/rowCharsEquals/rowExtrasEquals) and emits ANSI
      // for any row that actually changed relative to runtime.prevBuffer.
      cloned.markAllRowsDirty()
      // Apply search highlights FIRST so selection wins on overlap (drag
      // over a search match should look "selected", not "found").
      if (hasSearchHighlight) {
        applySearchHighlightsToPaintBufferFn({
          searchState,
          scrollback,
          virtualScrollOffset,
          paintBuffer: paintBuf,
          theme: profileOption?.theme,
        })
      }
      if (hasSelection) {
        applySelectionToPaintBufferFn({
          selectionEnabled,
          selectionState,
          paintBuffer: paintBuf,
          theme: profileOption?.theme,
        })
      }
      // Search bar wins LAST — it's the modal UI element. When the bar
      // closes (`hasSearchBar` false) the clone's last row carries the React
      // tree's content for that row and the diff engine repaints it cleanly.
      if (hasSearchBar) {
        applySearchBarToPaintBufferFn({ searchState, paintBuffer: paintBuf })
      }
      runtime.render(paintBuf)
    } else {
      runtime.render(currentBuffer)
    }
    flushPostPaintWrites()
  }
  const pushToScrollback = (): void =>
    pushToScrollbackFn({ scrollback, currentBuffer: currentBuffer ?? null })
  const renderVirtualScrollbackView = (): void =>
    renderVirtualScrollbackViewFn({ scrollback, virtualScrollOffset, target })
  // Search highlights AND the search bar are folded into paintFrame() —
  // they live on the paint clone's cells, not as ANSI past the buffer.
  // See applySearchHighlightsToPaintBufferFn / applySearchBarToPaintBufferFn.
  const searchScrollback = createSearchScrollback(scrollback)

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

    // Selection: intercept mouse events (drag-vs-click state machine)
    //
    // See the state-machine comment at the top of this function (near
    // `pendingSelectionDown`). Summary:
    //   down              → armed      (store anchor, no selection yet)
    //   move past anchor  → dragging   (start + extend — first extend draws)
    //   move              → dragging'  (extend — shrinks or grows)
    //   up from dragging  → idle       (finish, OSC 52 copy, CONSUME event
    //                                   so onClick/onSelect does NOT fire)
    //   up from armed     → idle       (plain click — event propagates,
    //                                   no selection created, no clipboard)
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
          // idle/dragging → armed. Clear any existing selection (visual
          // feedback: old overlay disappears), then arm with the anchor.
          // DO NOT call `start` — that would set `selecting: true` and a
          // same-cell mouseUp would leave a 1-char range (Bug 3).
          if (selectionState.range || selectionState.selecting) {
            const [cleared] = terminalSelectionUpdate({ type: "clear" }, selectionState)
            selectionState = cleared
            notifySelectionListeners()
            // Force full re-render so the freshly cleared selection's
            // styling is removed from screen. Without runtime.invalidate(),
            // the diff might skip selection-styled cells if buffer content
            // hasn't changed (selection was applied to a clone — runtime's
            // prevBuffer holds the styled clone, currentBuffer is clean,
            // diff would emit unstyled cells correctly — but invalidating
            // is the safer/explicit path here matching the previous
            // semantics).
            if (currentBuffer) {
              runtime.invalidate()
              currentBuffer = doRender()
              paintFrame()
            }
          }
          // Resolve contain boundary from the node under the cursor.
          // If the click lands inside a `userSelect="contain"` subtree, the
          // selection range is clamped to that ancestor's scrollRect so drags
          // can't leak into adjacent siblings. selectionHitTest uses the
          // selection-aware walk (respects userSelect="none" subtrees) rather
          // than pointer hit test.
          const agRoot = getContainerRoot(container)
          // Two hit tests run here:
          //   1. `hitTest` — pointer-event z-ordered hit (absolute
          //      children sit on top of in-flow siblings). Used to
          //      detect "did the click land inside a userSelect=none
          //      overlay?" — the overlay should block selection from
          //      reaching whatever in-flow content is behind it.
          //   2. `selectionHitTest` — selection-aware DFS (skips
          //      userSelect=none subtrees but doesn't z-order, so an
          //      absolute non-selectable overlay does NOT block
          //      in-flow text behind it on its own). Used to find the
          //      contain boundary for the selection scope.
          //
          // The pointer-target gate is what fixes "click on scrollbar /
          // floating button still creates a selection" — the
          // selectionHitTest alone descends behind the absolute overlay
          // and finds in-flow text to anchor the drag on.
          const pointerTarget = agRoot ? hitTest(agRoot, mouseData.x, mouseData.y) : null
          const pointerBlocksSelection =
            pointerTarget !== null && resolveUserSelect(pointerTarget) === "none"
          const hit =
            !pointerBlocksSelection && agRoot
              ? selectionHitTest(agRoot, mouseData.x, mouseData.y)
              : null
          // No selectable hit target — the click landed in a
          // `userSelect="none"` subtree (scrollbar, toolbar buttons,
          // etc.). Don't arm a selection drag: a subsequent mousemove
          // would otherwise start a drag from this anchor and steal
          // the gesture from the component's own onMouseDown/move
          // handlers (the click-and-drag scrollbar is the canonical
          // case — its move handlers fire alongside the selection
          // drag, and the selection paint overlays the scroll UX).
          if (hit === null) {
            pendingSelectionDown = null
          } else {
            const scope = findContainBoundary(hit)
            // Resolve click-count for THIS mousedown (1=fresh, 2=double-
            // click, 3=triple-click). Used by the up branch to decide
            // whether to dispatch startWord / startLine, and by the
            // move branch to pick the drag granularity.
            const clickCount = checkClickCount(
              selectionClickCount,
              mouseData.x,
              mouseData.y,
              mouseData.button,
            )
            pendingSelectionDown = {
              col: mouseData.x,
              row: mouseData.y,
              scope,
              clickCount,
            }
          }
          // Don't consume — let the component tree handle mousedown
          // (click-to-focus, onMouseDown handlers, etc.)
        } else if (mouseData.action === "move") {
          if (pendingSelectionDown) {
            // armed → dragging (first move past threshold starts the drag).
            // Threshold: different cell than anchor. Same-cell jitter stays
            // in armed and ends as a plain click.
            const dx = mouseData.x - pendingSelectionDown.col
            const dy = mouseData.y - pendingSelectionDown.row
            if (dx !== 0 || dy !== 0) {
              const anchor = pendingSelectionDown
              pendingSelectionDown = null
              // Pick the start action based on the click chain that armed
              // this drag:
              //   1 → start  (character-granular drag)
              //   2 → startWord (word-granular drag — snaps to word edges)
              //   3 → startLine (line-granular drag — snaps to line edges)
              // The headless machine sets `granularity` accordingly, and
              // `terminalSelectionUpdate({ type: "extend", buffer })` snaps
              // the head on every extend.
              let started: typeof selectionState
              if (anchor.clickCount === 2 && currentBuffer) {
                ;[started] = terminalSelectionUpdate(
                  {
                    type: "startWord",
                    col: anchor.col,
                    row: anchor.row,
                    scope: anchor.scope,
                    buffer: currentBuffer._buffer,
                  },
                  selectionState,
                )
              } else if (anchor.clickCount === 3 && currentBuffer) {
                ;[started] = terminalSelectionUpdate(
                  {
                    type: "startLine",
                    col: anchor.col,
                    row: anchor.row,
                    scope: anchor.scope,
                    buffer: currentBuffer._buffer,
                  },
                  selectionState,
                )
              } else {
                ;[started] = terminalSelectionUpdate(
                  { type: "start", col: anchor.col, row: anchor.row, scope: anchor.scope },
                  selectionState,
                )
              }
              const [extended] = terminalSelectionUpdate(
                {
                  type: "extend",
                  col: mouseData.x,
                  row: mouseData.y,
                  buffer: currentBuffer?._buffer,
                },
                started,
              )
              selectionState = extended
              notifySelectionListeners()
              if (currentBuffer) {
                paintFrame()
              }
              // Consume move events during selection — don't dispatch to the
              // component tree (prevents onMouseEnter from firing on every
              // row under the drag, which would move ListView's cursor).
              return true
            }
            // Same-cell move — stay armed, don't consume (safe no-op).
          } else if (selectionState.selecting) {
            // dragging → dragging (extend with current pos; head follows
            // the cursor regardless of direction, so selection shrinks on
            // reverse drag — Bug 1 protection).
            // Buffer is forwarded so word / line granularity drags snap
            // the head to the right boundary on every move.
            const [next] = terminalSelectionUpdate(
              {
                type: "extend",
                col: mouseData.x,
                row: mouseData.y,
                buffer: currentBuffer?._buffer,
              },
              selectionState,
            )
            selectionState = next
            notifySelectionListeners()
            if (currentBuffer) {
              paintFrame()
            }
            return true
          }
        } else if (mouseData.action === "up") {
          if (selectionState.selecting) {
            // dragging → idle. Finish selection, copy via OSC 52, and
            // CONSUME the event so onClick/onSelect does NOT fire (Bug 2).
            const [next] = terminalSelectionUpdate({ type: "finish" }, selectionState)
            selectionState = next
            pendingSelectionDown = null
            notifySelectionListeners()

            // Copy selected text via OSC 52
            if (next.range && currentBuffer) {
              const text = extractText(currentBuffer._buffer, next.range, { scope: next.scope })
              if (text.length > 0) {
                const base64 = globalThis.Buffer.from(text).toString("base64")
                target.write(`\x1b]52;c;${base64}\x07`)
              }
            }
            // Re-render with final selection styling baked in
            if (currentBuffer) {
              paintFrame()
            }
            // Clear armed state on the mousedown target so the next
            // interaction starts cleanly. We'd otherwise skip this because
            // we're consuming the event (processMouseEvent won't run).
            if (mouseEventState.mouseDownTarget) {
              setArmed(mouseEventState.mouseDownTarget, false)
              mouseEventState.mouseDownTarget = null
            }
            // Consume the mouseup — suppresses mouseup + click dispatch in
            // processMouseEvent (which would otherwise fire ListView's
            // onClick → onSelect, opening a detail view after a drag).
            return true
          }
          // armed → idle. Distinguish three cases:
          //  - clickCount === 1 → plain click. Let the event flow through
          //    to processMouseEvent normally so onClick / onSelect runs;
          //    no selection is created (Bug 3 protection).
          //  - clickCount === 2 → double-click. Select the word at the
          //    click point (granularity = word) and copy via OSC 52.
          //  - clickCount === 3 → triple-click. Select the line at the
          //    click point (granularity = line) and copy via OSC 52.
          //
          // The component-tree dispatch (onClick / onDoubleClick / onTripleClick)
          // is independent of this selection logic — that runs in
          // processMouseEvent unless we explicitly consume the event by
          // returning true. We keep dispatch flowing on multi-click so
          // app code can listen to onDoubleClick etc.
          //
          // defaultPrevented gating: we DEFER auto-select until AFTER the
          // component-tree dispatch runs (in invokeEventHandler), so that
          // an interactive widget that calls `event.preventDefault()` in
          // its onClick / onDoubleClick / onTripleClick handler can opt out
          // of the runtime's word/line selection. Without this gate, a
          // click-to-toggle button would simultaneously toggle AND grab the
          // word under the cursor — a UX collision. The pending intent is
          // captured here, then resolved at the bottom of runEventHandler
          // after `invokeEventHandler` writes `mouseEventState.lastClickPrevented`.
          if (pendingSelectionDown) {
            const anchor = pendingSelectionDown
            pendingSelectionDown = null
            if ((anchor.clickCount === 2 || anchor.clickCount === 3) && currentBuffer) {
              pendingAutoSelect = {
                col: anchor.col,
                row: anchor.row,
                scope: anchor.scope,
                clickCount: anchor.clickCount,
              }
              // Don't consume — let the click event reach the component
              // tree so onDoubleClick / onTripleClick handlers fire. The
              // auto-select is applied (or skipped) below based on the
              // dispatch's defaultPrevented signal.
            }
          }
        }
      }
    }

    // Selection: clear on any keypress
    if (selectionEnabled && event.type === "term:key" && selectionState.range) {
      const [next] = terminalSelectionUpdate({ type: "clear" }, selectionState)
      selectionState = next
      notifySelectionListeners()
      // Force full re-render. Selection just cleared, so paintFrame() goes
      // through the no-selection branch — runtime.render writes unstyled
      // cells, removing any prior selection styling from screen.
      if (currentBuffer) {
        runtime.invalidate()
        currentBuffer = doRender()
        paintFrame()
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
    const result = invokeEventHandler(event, handlers, ctx, mouseEventState, container)

    // Apply deferred word/line auto-select gated on the component tree's
    // defaultPrevented. Captured on mouseup-from-armed (clickCount >= 2);
    // resolved here AFTER `invokeEventHandler` ran the click/dblclick/
    // tripleclick dispatch and recorded `lastClickPrevented` on
    // `mouseEventState`. Skipping when prevented avoids the UX collision
    // where a click-to-toggle widget would also grab the word under the
    // cursor.
    if (pendingAutoSelect && currentBuffer) {
      const anchor = pendingAutoSelect
      pendingAutoSelect = null
      if (!mouseEventState.lastClickPrevented) {
        const [next] = terminalSelectionUpdate(
          anchor.clickCount === 2
            ? {
                type: "startWord",
                col: anchor.col,
                row: anchor.row,
                scope: anchor.scope,
                buffer: currentBuffer._buffer,
              }
            : {
                type: "startLine",
                col: anchor.col,
                row: anchor.row,
                scope: anchor.scope,
                buffer: currentBuffer._buffer,
              },
          selectionState,
        )
        const [finished] = terminalSelectionUpdate({ type: "finish" }, next)
        selectionState = finished
        notifySelectionListeners()
        // Copy via OSC 52, mirroring the drag-finish branch above.
        if (finished.range) {
          const text = extractText(currentBuffer._buffer, finished.range, {
            scope: finished.scope,
          })
          if (text.length > 0) {
            const base64 = globalThis.Buffer.from(text).toString("base64")
            target.write(`\x1b]52;c;${base64}\x07`)
          }
        }
        paintFrame()
      }
    }

    return result
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
    renderer.resetCount()
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
    // All key/paste/focus events flow through the apply chain:
    //
    //   withFocusChain → withInputChain → withPasteChain → withTerminalChain
    //
    // withFocusChain owns the focused-target dispatch (formerly
    // handleFocusNavigation). withInputChain runs useInput fallbacks only
    // when focus didn't consume. withTerminalChain observes modifiers and
    // resize. The chain's effects (render / exit) are drained and re-routed
    // into this runner's render pipeline.
    //
    // Mouse / resize / other namespaced events bypass the chain and go
    // straight to `runEventHandler` (app handlers), same as before.
    for (const event of events) {
      if (event.type === "term:key") {
        const { input, key: parsedKey } = event.data as { input: string; key: Key }

        // Raw lane: Always update keyboard modifier state (Super/Cmd, Hyper) for
        // mouse events. SGR mouse protocol can't report these — Kitty fills the gap.
        updateKeyboardModifiers(mouseEventState, parsedKey)

        // Raw-key observer: fire unconditionally (useModifierKeys tracks state
        // from every key event, including release and modifier-only).
        chainApp.rawKeys.notify(input, parsedKey)

        // Dispatch into the chain. withInputChain filters release / modifier-only
        // events internally so useInput handlers aren't spammed; withFocusChain
        // drives focus precedence via the injected handleFocusNavigation.
        chainApp.dispatch({ type: "input:key", input, key: parsedKey })
        // Drain chain effects — render/exit are re-emitted via the legacy
        // render orchestration below (doRender + flush loop). Capture exit
        // intent so we can short-circuit before the app handler fires.
        const chainEffects = chainApp.drainEffects()
        for (const eff of chainEffects) {
          if (eff.type === "exit") shouldExit = true
        }
        if (shouldExit) {
          inEventHandler = false
          return null
        }
        // Release / modifier-only events skip the app handler path (matches
        // pre-refactor behaviour: those never produced app-level commands).
        if (parsedKey.eventType === "release" || isModifierOnlyEvent(input, parsedKey)) {
          continue
        }
      } else if (event.type === "term:paste") {
        const { text } = event.data as { text: string }
        chainApp.dispatch({ type: "term:paste", text })
        chainApp.drainEffects()
      } else if (event.type === "term:focus") {
        const { focused } = event.data as { focused: boolean }
        chainApp.dispatch({ type: "term:focus", focused })
        chainApp.drainEffects()
        // withTerminalChain is an observer — fan out to the chain
        // focusEvents store so useTerminalFocused / useModifierKeys
        // subscribers see the transition.
        chainApp.focusEvents.notify(focused)
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
      // prevBuffer in sync with the Ag's internal prevBuffer. Without this,
      // the post-batch doRender's dirty-row tracking would be stale relative
      // to runtime.prevBuffer, causing diffBuffers() to skip all rows and
      // produce an empty diff (0 bytes output).
      if (result === "flush") {
        pendingRerender = false
        currentBuffer = doRender()
        paintFrame()
        // Flush effects so mounted components can set up refs
        await Promise.resolve()
        if (pendingRerender) {
          pendingRerender = false
          currentBuffer = doRender()
          paintFrame()
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
    //
    // Bound: MAX_CONVERGENCE_PASSES — see pass-cause.ts. Same convergence
    // structure as the renderer's loops; replaces the prior magic 5.
    let flushCount = 0
    if (INSTRUMENT) beginConvergenceLoop()
    while (flushCount < MAX_CONVERGENCE_PASSES) {
      if (INSTRUMENT) beginPass(flushCount)
      await Promise.resolve() // Drain microtask queue → passive effects flush
      if (!pendingRerender) break
      pendingRerender = false
      isRendering = true
      if (INSTRUMENT) {
        notePassCommit(flushCount)
        if (flushCount === MAX_CONVERGENCE_PASSES - 1) {
          logPass({ cause: "unknown", detail: "production-flush-exhaustion" })
        }
      }
      try {
        currentBuffer = doRender()
      } finally {
        isRendering = false
      }
      flushCount++
    }
    if (flushCount >= MAX_CONVERGENCE_PASSES && pendingRerender) {
      assertBoundedConvergence(flushCount, "production-flush")
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
    // paintFrame() applies selection + search-highlight + search-bar
    // styling to a clone before runtime.render, so the diff engine sees
    // overlay state and repaints correctly when selection grows / shrinks /
    // moves, when the search currentMatch shifts, and when the search bar
    // opens / closes.
    paintFrame()
    // Post-render: push to scrollback (uses currentBuffer's clean content)
    // + overlay scrollback view (still legacy ANSI-past-buffer — different
    // bug class, virtualScrollOffset > 0 forces full screen rewrite each
    // frame so stale-cell drift isn't observable).
    pushToScrollback()
    if (virtualScrollOffset > 0) {
      renderVirtualScrollbackView()
    }
    const runtimeMs = performance.now() - runtimeStart
    if (_perfLog) {
      const totalMs = performance.now() - _eventStart
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").appendFileSync(
        "/tmp/silvery-perf.log",
        `EVENT batch(${events.length} ${events[0]?.type}): ${totalMs.toFixed(1)}ms total, ${renderer.renderCount()} doRender() calls, runtime.render=${runtimeMs.toFixed(1)}ms\n---\n`,
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
    // Direct subscriptions for providers that are Terms (have .input + .size).
    // These skip the async-iterator pipeline and push straight into the shared
    // queue — the canonical path since `term.events()` was retired.
    const streamProviders: [string, Provider<unknown, Record<string, unknown>>][] = []

    const nudge = () => {
      if (eventQueueResolve) {
        const resolve = eventQueueResolve
        eventQueueResolve = null
        resolve()
      }
    }

    for (const [name, provider] of Object.entries(providers)) {
      const maybeTerm = provider as unknown as { input?: Term["input"]; size?: Term["size"] }
      // Any Term-like provider (has `.size`) drives events through direct
      // subscriptions. Input is optional — headless Terms have `.size` but
      // no `.input`; they still need the resize subscription for re-renders.
      if (maybeTerm.size) {
        const size = maybeTerm.size
        const input = maybeTerm.input
        if (input) {
          providerCleanups.push(
            input.onKey((e) => {
              eventQueue.push({ type: `${name}:key`, provider: name, event: "key", data: e })
              nudge()
            }),
          )
          providerCleanups.push(
            input.onMouse((e) => {
              eventQueue.push({ type: `${name}:mouse`, provider: name, event: "mouse", data: e })
              nudge()
            }),
          )
          providerCleanups.push(
            input.onPaste((e) => {
              eventQueue.push({ type: `${name}:paste`, provider: name, event: "paste", data: e })
              nudge()
            }),
          )
          providerCleanups.push(
            input.onFocus((e) => {
              eventQueue.push({ type: `${name}:focus`, provider: name, event: "focus", data: e })
              nudge()
            }),
          )
        }
        providerCleanups.push(
          watch(
            () => size.snapshot(),
            (next) => {
              eventQueue.push({
                type: `${name}:resize`,
                provider: name,
                event: "resize",
                data: { cols: next.cols, rows: next.rows },
              })
              nudge()
            },
          ),
        )
      } else {
        streamProviders.push([name, provider])
      }
    }

    // Merge non-Term provider event streams (user-injected custom providers).
    const providerEventStreams = streamProviders.map(([name, provider]) =>
      createProviderEventStream(name, provider),
    )

    const allEvents = merge(...providerEventStreams)

    // Pump events from async iterables (empty stream when no non-Term
    // providers exist) into the shared queue.
    const pumpEvents = async () => {
      try {
        for await (const event of takeUntil(allEvents, signal)) {
          eventQueue.push(event)
          nudge()
          if (shouldExit) break
        }
      } finally {
        nudge()
      }
    }

    // Run text sizing probe BEFORE stdin is consumed by the input parser.
    // The probe writes a test sequence to stdout and reads the CPR response
    // from stdin. This must happen before pumpEvents() attaches the stdin
    // data listener, otherwise the CPR response would be consumed as a key event.
    if (needsProbe) {
      try {
        // Set up temporary raw mode + stdin listener for probe.
        // Race-safe: only flip raw mode if NO other consumer is on stdin.
        // See vendor/silvery/packages/ansi/src/theme/detect.ts probeColors
        // for the same fix — re-setting raw=false in finally based on a stale
        // wasRaw capture kills the host TUI's input.
        const otherListeners = stdin.listenerCount("data") > 0
        const wasRaw = stdin.isRaw
        let didSetRaw = false
        if (stdin.isTTY && !wasRaw && !otherListeners) {
          stdin.setRawMode(true)
          stdin.resume()
          stdin.setEncoding("utf8")
          didSetRaw = true
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
          (data) => (output ? output.write(data) : stdout.write(data)),
          probeRead,
          probeFingerprint,
          500, // Short timeout — probe should be fast
        )

        // If probe result differs from initial heuristic, recreate pipeline
        if (probeResult.supported !== textSizing) {
          textSizing = probeResult.supported
          if (effectiveCaps) {
            effectiveCaps = { ...effectiveCaps, textSizing: textSizing }
            pipelineConfig = createPipeline({ caps: effectiveCaps })
            // Update runtime's output phase to use the new measurer
            runtime.setOutputPhaseFn(pipelineConfig.outputPhaseFn)
          }
          // Invalidate pipeline and runtime diff state for full redraw.
          // Recreate Ag with updated measurer (text sizing support changed).
          renderer.resetAg()
          runtime.invalidate()
          // Force full re-render with updated measurer
          if (!isRendering) {
            isRendering = true
            try {
              currentBuffer = doRender()
              paintFrame()
            } finally {
              isRendering = false
            }
          }
        }

        // Restore raw mode only if WE set it. Same race-safety pattern as
        // probeColors — never undo someone else's setRawMode(true).
        if (stdin.isTTY && didSetRaw) {
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
        // Race-safe — see text-sizing probe above for the same pattern.
        const otherListeners = stdin.listenerCount("data") > 0
        const wasRaw = stdin.isRaw
        let didSetRaw = false
        if (stdin.isTTY && !wasRaw && !otherListeners) {
          stdin.setRawMode(true)
          stdin.resume()
          stdin.setEncoding("utf8")
          didSetRaw = true
        }

        const stdinHandlers: Array<(data: string) => void> = []
        const stdinListener = (data: string) => {
          for (const handler of stdinHandlers) handler(data)
        }
        stdin.on("data", stdinListener)

        const detector = createWidthDetector({
          write: (data) => (output ? output.write(data) : stdout.write(data)),
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

        // Apply detected width config to caps and recreate pipeline if
        // changed. Post km-silvery.plateau-naming-polish: `maybeWideEmojis`
        // and `textSizing` both live on caps — one overlay, one object.
        if (effectiveCaps) {
          const updatedCaps = applyWidthConfig(effectiveCaps, widthConfig)
          const capsChanged =
            updatedCaps.maybeWideEmojis !== effectiveCaps.maybeWideEmojis ||
            updatedCaps.textSizing !== effectiveCaps.textSizing
          if (capsChanged) {
            effectiveCaps = updatedCaps
            pipelineConfig = createPipeline({ caps: effectiveCaps })
            runtime.setOutputPhaseFn(pipelineConfig.outputPhaseFn)
            // Recreate Ag with updated measurer (caps changed text sizing/emoji width)
            renderer.resetAg()
            runtime.invalidate()
            if (!isRendering) {
              isRendering = true
              try {
                currentBuffer = doRender()
                paintFrame()
              } finally {
                isRendering = false
              }
            }
          }
        }

        if (stdin.isTTY && didSetRaw) {
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
      modes.focusReporting(true)
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
    get scope() {
      return appScope
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

      // Raw-key observer: fire unconditionally (useModifierKeys tracks state
      // from every key event, including release and modifier-only).
      chainApp.rawKeys.notify(input, parsedKey)

      // Suppress subscription renders — flush loop below handles everything.
      inEventHandler = true
      isRendering = true

      // Dispatch into the apply chain: withFocusChain handles the focus-tree
      // dispatch (formerly handleFocusNavigation), withInputChain fires the
      // useInput fallback when focus didn't consume. Same precedence as the
      // batched path.
      chainApp.dispatch({ type: "input:key", input, key: parsedKey })
      const pressEffects = chainApp.drainEffects()
      let focusConsumed = false
      for (const eff of pressEffects) {
        if (eff.type === "exit") shouldExit = true
        if (eff.type === "render") {
          // withFocusChain emits a single `render` effect when the focused
          // tree consumed the key. We use that as the "focus consumed"
          // signal — a single render here short-circuits the rest of the
          // press() pipeline, matching the pre-refactor behaviour.
          focusConsumed = true
        }
      }
      if (shouldExit) {
        isRendering = false
        inEventHandler = false
        return
      }
      if (focusConsumed) {
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
      // pendingRerender (no microtask render). Bound: MAX_CONVERGENCE_PASSES.
      let flushCount = 0
      while (flushCount < MAX_CONVERGENCE_PASSES) {
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
      paintFrame()
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
