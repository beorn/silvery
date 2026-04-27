/**
 * Unified Render API for silvery
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
  ChainAppContext,
  FocusManagerContext,
  RuntimeContext,
  type RuntimeContextValue,
  StdoutContext,
  TermContext,
} from "@silvery/ag-react/context"
import { createChildApp, toChainAppContextValue } from "@silvery/ag-react/chain-bridge"
import { createFocusManager } from "@silvery/ag/focus-manager"
import {
  type LayoutEngine,
  ensureDefaultLayoutEngine,
  isLayoutEngineInitialized,
  setLayoutEngine,
} from "./layout-engine.js"
import { createAg } from "./ag.js"
import { outputPhase } from "./pipeline/output-phase.js"
import {
  CURSOR_SAVE as _CURSOR_SAVE,
  CURSOR_RESTORE as _CURSOR_RESTORE,
  kittyDeleteAllScrimPlacements as _kittyDeleteAllScrimPlacements,
} from "@silvery/ansi"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
  releaseContainer,
  setOnNodeRemoved,
} from "@silvery/ag-react/reconciler"

import { createTerm } from "./ansi/index"
import { bufferToText } from "./buffer.js"
import { buildMismatchContext, formatMismatchContext } from "@silvery/test/debug-mismatch"
import { createCursorStore, CursorProvider } from "@silvery/ag-react/hooks/useCursor"
import { keyToAnsi, parseKey, splitRawInput } from "@silvery/ag/keys"
import { parseBracketedPaste } from "./bracketed-paste"
import { IncrementalRenderMismatchError } from "./scheduler.js"
import type { RenderPhaseStats } from "./pipeline/types"
import { debugTree } from "@silvery/test/debug"
import { createLogger } from "loggily"
import {
  beginConvergenceLoop,
  beginPass,
  notePassCommit,
  recordPassCause,
} from "./runtime/pass-cause"
// Side-effect import: arms `@silvery/ag`'s wrap-measurer registry with the
// terminal grapheme-aware adapter. Importing renderer.ts (via createRenderer
// in tests, or run() in production) now means soft-wrap-aware
// computeSelectionFragments without further wiring. See bead
// km-silvery.softwrap-selection-fragments.
import "./runtime/wrap-measurer-registration"

const log = createLogger("silvery:render")

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
      "silvery: Layout engine not initialized. " +
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
  /** Use Kitty keyboard protocol encoding for press(). When true, press() uses keyToKittyAnsi. */
  kittyMode?: boolean
  /**
   * Use production-like single-pass layout in doRender().
   *
   * When false (default), doRender() runs a synchronous layout stabilization
   * loop (up to 5 iterations) that re-runs runPipeline whenever React
   * commits new work from layout notifications (useBoxRect, etc.).
   *
   * When true, doRender() does a single runPipeline call (matching
   * production's create-app.tsx behavior). Layout feedback effects are
   * flushed via a separate act()/flushSyncWork() loop after doRender(),
   * mimicking production's processEventBatch flush pattern.
   *
   * Use this to make tests exercise the same rendering pipeline as production.
   */
  singlePassLayout?: boolean
  /**
   * Auto-render on async React commits (e.g., setTimeout → setState).
   *
   * When true, the renderer schedules a microtask re-render whenever React
   * commits new work outside of explicit render/sendInput/rerender calls.
   * This enables test components with async state updates to produce new
   * frames automatically.
   *
   * Default: false (renderer only renders on explicit triggers).
   */
  autoRender?: boolean
  /**
   * Callback fired after each frame render.
   *
   * Called with the frame output string and the underlying TerminalBuffer.
   * Fires after initial render, sendInput, rerender, and (if autoRender)
   * async state changes.
   */
  onFrame?: (frame: string, buffer: TerminalBuffer, contentHeight?: number) => void
  /**
   * Callback fired after each pipeline execution, before React effects flush.
   *
   * Called inside act() after runPipeline produces the buffer but before
   * useLayoutEffect/useEffect callbacks run. Use this to make pipeline output
   * available to effects (e.g., Ink compat debug mode where useStdout().write()
   * needs to replay the latest frame).
   */
  onBufferReady?: (frame: string, buffer: TerminalBuffer, contentHeight?: number) => void
  /**
   * Wrap the root element with additional providers.
   * Called with the element after silvery's internal contexts are applied.
   * Use this to inject additional context providers (e.g., Ink compatibility wrappers).
   * The wrapper is applied INSIDE silvery's contexts, so wrapped providers
   * can access silvery's Term, Stdout, FocusManager, and Runtime contexts.
   */
  wrapRoot?: (element: React.ReactElement) => React.ReactElement
  /**
   * External stdin stream to bridge to the renderer's input.
   * When provided, readable data from this stream is forwarded to the renderer's
   * input handler (equivalent to calling app.stdin.write()).
   */
  stdin?: NodeJS.ReadStream
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
  /**
   * The buffer that was painted on the previous frame (post-fade). Used by
   * the output-phase diff as the "from" state so only actually-painted cells
   * are compared. `prevBuffer` separately carries the PRE-fade state forward
   * for the next frame's renderPhase incremental clone. When no backdrop
   * markers exist, the two are identical.
   */
  prevPaintedBuffer: TerminalBuffer | null
  mounted: boolean
  /** True while inside act() or doRender() — detects re-entrant calls */
  rendering: boolean
  columns: number
  rows: number
  inputEmitter: EventEmitter
  debug: boolean
  incremental: boolean
  /** Render count for SILVERY_STRICT checking (skip first render) */
  renderCount: number
  /** Use production-like single-pass layout (no stabilization loop) */
  singlePassLayout: boolean
  /**
   * True when the PREVIOUS frame emitted Kitty scrim placements. Drives the
   * one-shot `a=d` delete-all on the first frame where the backdrop goes away.
   * Lives at the instance level (not on `Ag`) because this test driver
   * creates a fresh `Ag` per `runPipeline()` call, so `Ag`-scoped tracking
   * doesn't persist across frames here. Production runtimes with a
   * long-lived `Ag` also track this internally and produce the correct
   * deactivation emission — both paths converge on identical behavior.
   */
  kittyActive: boolean
}

function isStore(arg: unknown): arg is Store {
  // Store has cols and rows as required (not optional) properties.
  // RenderOptions has them as optional. Disambiguate by checking for
  // RenderOptions-only traits.
  if (arg === null || typeof arg !== "object") return false
  const obj = arg as Record<string, unknown>
  return (
    typeof obj.cols === "number" &&
    typeof obj.rows === "number" &&
    !("layoutEngine" in obj) &&
    !("debug" in obj) &&
    !("incremental" in obj) &&
    !("singlePassLayout" in obj) &&
    !("autoRender" in obj) &&
    !("onFrame" in obj) &&
    !("kittyMode" in obj) &&
    !("wrapRoot" in obj) &&
    !("stdin" in obj)
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
export function render(element: ReactElement, optsOrStore: RenderOptions | Store = {}): App {
  // Guard: layout engine must be initialized
  assertLayoutEngine()

  const storeMode = isStore(optsOrStore)
  const cols = storeMode ? optsOrStore.cols : (optsOrStore.cols ?? 80)
  const rows = storeMode ? optsOrStore.rows : (optsOrStore.rows ?? 24)
  const debug = storeMode ? false : (optsOrStore.debug ?? false)
  // Incremental rendering is enabled by default for all renders
  // Store mode also supports incremental - the RenderInstance tracks prevBuffer
  const incremental = storeMode ? true : (optsOrStore.incremental ?? true)
  const singlePassLayout = storeMode ? false : (optsOrStore.singlePassLayout ?? false)
  const kittyMode = storeMode ? false : (optsOrStore.kittyMode ?? false)
  const autoRender = storeMode ? false : (optsOrStore.autoRender ?? false)
  const onFrame = storeMode ? undefined : optsOrStore.onFrame
  const onBufferReady = storeMode ? undefined : optsOrStore.onBufferReady
  const wrapRoot = storeMode ? undefined : optsOrStore.wrapRoot
  const stdinStream = storeMode ? undefined : optsOrStore.stdin

  // Guard: detect render leaks (absurd number of active instances)
  const liveCount = pruneAndCountActiveRenders()
  if (liveCount >= ACTIVE_RENDER_LEAK_THRESHOLD) {
    throw new Error(
      `silvery: ${liveCount} active render instances without unmount(). ` +
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
    prevPaintedBuffer: null,
    mounted: true,
    rendering: false,
    columns: cols,
    rows: rows,
    inputEmitter: new EventEmitter(),
    debug,
    incremental,
    renderCount: 0,
    singlePassLayout,
    kittyActive: false,
  }

  // Track whether React committed new work (from layout notifications etc.)
  let hadReactCommit = false
  let autoRenderScheduled = false
  let inRenderCycle = false // true during doRender() and explicit operations
  instance.container = createContainer(() => {
    hadReactCommit = true
    // Auto-render: schedule a microtask re-render on async React commits
    // (e.g., setTimeout → setState). Skipped during explicit render operations
    // (rendering=true or inRenderCycle=true) since those call doRender() themselves.
    if (
      autoRender &&
      !instance.rendering &&
      !inRenderCycle &&
      !autoRenderScheduled &&
      instance.mounted
    ) {
      autoRenderScheduled = true
      queueMicrotask(() => {
        autoRenderScheduled = false
        if (!instance.mounted || instance.rendering || inRenderCycle) return
        inRenderCycle = true
        try {
          const newFrame = doRender()
          instance.frames.push(newFrame)
          onFrame?.(newFrame, instance.prevBuffer!, getRootContentHeight())
        } finally {
          inRenderCycle = false
        }
      })
    }
  })

  instance.fiberRoot = createFiberRoot(instance.container)

  /**
   * Get the content extent of the root node's children (for buffer padding trimming).
   * Returns the max outer bottom edge of the root's direct children, including
   * margins. The root itself stretches to fill the terminal, but its children
   * have specific layout-computed heights plus margins that extend beyond.
   * Returns 0 if no children have layout (empty tree).
   * Returns undefined if root has no layout at all.
   */
  const getRootContentHeight = (): number | undefined => {
    try {
      const root = getContainerRoot(instance.container)
      if (!root?.boxRect) return undefined
      let maxBottom = 0
      let hasChildren = false
      for (const child of root.children) {
        if (child.boxRect) {
          hasChildren = true
          // boxRect includes marginTop in the y position but NOT marginBottom
          // in the height. Read marginBottom from props to get the full outer extent.
          const props = child.props as Record<string, unknown>
          const mb =
            (props.marginBottom as number) ??
            (props.marginY as number) ??
            (props.margin as number) ??
            0
          const childBottom = child.boxRect.y + child.boxRect.height + mb
          if (childBottom > maxBottom) maxBottom = childBottom
        }
      }
      return hasChildren ? maxBottom : 0
    } catch {
      return undefined
    }
  }

  // Track exit state
  let exitCalledFlag = false
  let exitErrorValue: Error | undefined

  const handleExit = (error?: Error) => {
    exitCalledFlag = true
    exitErrorValue = error
    if (debug) {
      console.log("[silvery] exit() called", error ? `with error: ${error.message}` : "")
    }
  }

  // Create mock stdout with mutable dimensions and event support (for resize)
  const stdoutEmitter = new EventEmitter()
  const mockStdout = {
    columns: instance.columns,
    rows: instance.rows,
    write: () => true,
    isTTY: true,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      stdoutEmitter.on(event, listener)
      return mockStdout
    },
    off: (event: string, listener: (...args: unknown[]) => void) => {
      stdoutEmitter.off(event, listener)
      return mockStdout
    },
    once: (event: string, listener: (...args: unknown[]) => void) => {
      stdoutEmitter.once(event, listener)
      return mockStdout
    },
    removeListener: (event: string, listener: (...args: unknown[]) => void) => {
      stdoutEmitter.removeListener(event, listener)
      return mockStdout
    },
    addListener: (event: string, listener: (...args: unknown[]) => void) => {
      stdoutEmitter.addListener(event, listener)
      return mockStdout
    },
  } as unknown as NodeJS.WriteStream

  // Create mock term with the mock stdout so useWindowSize reads correct dimensions
  const mockTerm = createTerm({ colorLevel: "truecolor", stdout: mockStdout })

  // Focus manager (tree-based focus system)
  const focusManager = createFocusManager()

  // Wire up focus cleanup on node removal
  setOnNodeRemoved((removedNode) => focusManager.handleSubtreeRemoved(removedNode))

  // Per-instance cursor state (replaces module-level globals)
  const cursorStore = createCursorStore()

  // Child apply-chain BaseApp — the ChainAppContext surface for hooks
  // rendered via the test renderer. Mirrors the plumbing in
  // `create-app.tsx` (TEA Phase 2). Inputs routed here via the
  // inputEmitter bridge below.
  const childApp = createChildApp()
  const chainAppContextValue = toChainAppContextValue(childApp)
  instance.inputEmitter.on("input", (data: string | Buffer) => {
    const [input, key] = parseKey(data)
    childApp.rawKeys.notify(input, key)
    childApp.dispatch({ type: "input:key", input, key })
    childApp.drainEffects()
  })
  instance.inputEmitter.on("paste", (text: string) => {
    childApp.dispatch({ type: "term:paste", text })
    childApp.drainEffects()
  })

  // RuntimeContext — trimmed to `exit()` only. First-party hooks
  // subscribe via ChainAppContext above; app-defined events ride on
  // `chain.events`.
  const runtimeValue: RuntimeContextValue = {
    exit: handleExit,
  }

  // Wrap element with contexts
  function wrapWithContexts(el: ReactElement): ReactElement {
    const inner = wrapRoot ? wrapRoot(el) : el
    return React.createElement(
      CursorProvider,
      { store: cursorStore },
      React.createElement(
        TermContext.Provider,
        { value: mockTerm },
        React.createElement(
          StdoutContext.Provider,
          { value: { stdout: mockStdout, write: () => {} } },
          React.createElement(
            FocusManagerContext.Provider,
            { value: focusManager },
            React.createElement(
              RuntimeContext.Provider,
              { value: runtimeValue },
              React.createElement(ChainAppContext.Provider, { value: chainAppContextValue }, inner),
            ),
          ),
        ),
      ),
    )
  }

  // Check SILVERY_STRICT for automatic incremental checking (like scheduler does)
  // Note: "0" and "false" are treated as disabled
  const strictEnv = process.env.SILVERY_STRICT
  const strictMode = incremental && strictEnv && strictEnv !== "0" && strictEnv !== "false"

  // Render function that executes the pipeline.
  //
  // Two modes:
  // 1. Multi-pass (default): Layout stabilization loop (up to 5 iterations).
  //    After runPipeline fires notifyLayoutSubscribers (Phase 2.7), hooks
  //    like useBoxRect call forceUpdate(). These React updates are flushed
  //    and the pipeline re-run until stable.
  //
  // 2. Single-pass (singlePassLayout=true): Matches production create-app.tsx.
  //    Single runPipeline call per doRender(), with a separate effect flush
  //    loop afterward (like production's processEventBatch). This ensures tests
  //    exercise the same rendering pipeline as production.
  //
  // Key insight: runPipeline must run inside act() so that forceUpdate/setState
  // calls from layout notifications are properly captured by React's scheduler.
  // With IS_REACT_ACT_ENVIRONMENT=true (set by silvery/testing), state updates
  // outside act() boundaries may be dropped.
  // Max iterations for singlePassLayout mode. Normally 1-2 passes, but resize
  // can need 3+ (pass 0 stale zustand + pass 1 updated dims + pass 2+ layout
  // feedback stabilization). Bumped to 15 to accommodate multi-stage layout
  // feedback chains (e.g. cursor moves trigger scroll, scroll triggers
  // virtualizer window shifts, virtualizer shifts trigger measurement
  // re-runs). Classic path keeps cap of 5 — single-pass needs more headroom
  // because each iteration is one runPipeline + flushSyncWork pass and
  // multiple layers of useLayoutEffect can compound (e.g. Tab focus +
  // fold-state cascade can chain 8+ commits in km-tui board).
  const MAX_SINGLE_PASS_ITERATIONS = 15

  /** Run the full pipeline: layout + render + output phase. */
  function runPipeline(
    root: ReturnType<typeof getContainerRoot>,
    cols: number,
    rows: number,
    prevBuffer: TerminalBuffer | null,
    opts?: { skipLayoutNotifications?: boolean; skipScrollStateUpdates?: boolean },
  ): {
    output: string
    buffer: TerminalBuffer
    carryForwardBuffer: TerminalBuffer
    overlay: string
  } {
    const ag = createAg(root)
    ag.layout({ cols, rows }, opts)
    // `buffer` is post-fade (what we paint); `carryForwardBuffer` is pre-fade
    // (what the NEXT frame's incremental render must clone). See ag.ts
    // `AgRenderResult.carryForwardBuffer` for the invariant rationale.
    const { buffer, carryForwardBuffer, overlay } = ag.render({ prevBuffer })
    // Output-phase diff uses the previously painted (post-fade) buffer.
    // `prevPaintedBuffer` is set by the caller (see singlePass/classic loops)
    // and stored as `instance.prevPaintedBuffer`.
    const prevForDiff = instance.prevPaintedBuffer ?? prevBuffer
    let output = outputPhase(prevForDiff, buffer, "fullscreen")
    // Backdrop emoji-scrim overlay (Kitty graphics). Since we create a fresh
    // `Ag` per render, the ag-internal `_kittyActive` tracker is always fresh
    // and can't emit the deactivation `a=d`. Track it at the instance level
    // and synthesize the delete-all when the overlay disappears.
    const overlayEmitted = overlay.length > 0
    if (overlayEmitted) {
      output += overlay
      instance.kittyActive = true
    } else if (instance.kittyActive) {
      // Transition active → inactive (modal closed). Emit delete-all once
      // so leftover scrim rectangles don't linger in the terminal.
      output += _CURSOR_SAVE + _kittyDeleteAllScrimPlacements() + _CURSOR_RESTORE
      instance.kittyActive = false
    }
    return { output, buffer, carryForwardBuffer, overlay }
  }

  function doRender(): string {
    let output: string
    let buffer!: TerminalBuffer
    // Kitty backdrop-fade overlay from the incremental render. Captured
    // here so the STRICT block below can compare it against the fresh
    // render's overlay (determinism invariant — see pipeline/backdrop/).
    let incrementalOverlay = ""

    if (instance.singlePassLayout) {
      // Production-matching single-pass: one runPipeline, no stabilization
      // loop. This matches create-app.tsx doRender() which does a single
      // reconcile + pipeline pass. Layout feedback effects (useBoxRect
      // etc.) are NOT re-run within this doRender — they're flushed by the
      // caller (sendInput) in a separate loop, matching production's
      // processEventBatch flush pattern.
      //
      // IMPORTANT: Do NOT flush sync work here. runPipeline fires
      // notifyLayoutSubscribers (Phase 2.7) which may call forceUpdate().
      // If we flushed that commit here, the pipeline output would still
      // reflect the pre-forceUpdate state. Instead, let the sendInput
      // flush loop detect the pending commit and call doRender() again
      // with the updated React tree.
      // Single-pass: run runPipeline once, then flush any pending React
      // work from layout notifications. If React committed new work, run
      // additional passes to stabilize. Normally 1-2 passes suffice, but
      // resize can need 3 (pass 0 with stale zustand, pass 1 with updated
      // dimensions, pass 2 for layout feedback from pass 1).
      let singlePassCount = 0
      beginConvergenceLoop()
      for (let pass = 0; pass < MAX_SINGLE_PASS_ITERATIONS; pass++) {
        hadReactCommit = false
        singlePassCount++
        beginPass(pass)
        let renderError: Error | null = null
        let carryForwardBuffer: TerminalBuffer | undefined
        withActEnvironment(() => {
          act(() => {
            const root = getContainerRoot(instance.container)
            try {
              const result = runPipeline(
                root,
                instance.columns,
                instance.rows,
                incremental ? instance.prevBuffer : null,
              )
              output = result.output
              buffer = result.buffer
              carryForwardBuffer = result.carryForwardBuffer
              incrementalOverlay = result.overlay
            } catch (e) {
              // STRICT output verification may throw from the output phase.
              // The render phase buffer is still valid and attached to the
              // error — extract it so lastBuffer() returns the correct frame.
              renderError = e as Error
              const attachedBuffer = (e as any)?.__silvery_buffer
              if (attachedBuffer) {
                buffer = attachedBuffer
                carryForwardBuffer = attachedBuffer
              }
            }
            // Always update prevBuffer when a new buffer was produced,
            // even if the output phase threw. The buffer from renderPhase
            // is correct; the STRICT verification exception is a diagnostic that
            // should not corrupt incremental rendering state.
            //
            // Carry forward the PRE-fade buffer so the next frame's incremental
            // render starts from unfaded cells. Without this, backdrop-fade
            // compounds across frames.
            if (buffer) {
              // `prevBuffer` = pre-fade — carried into next frame's renderPhase.
              // `prevPaintedBuffer` = post-fade — what the output phase diffs against.
              instance.prevBuffer = carryForwardBuffer ?? buffer
              instance.prevPaintedBuffer = buffer
            }
            instance.renderCount++
            onBufferReady?.(output, buffer, getRootContentHeight())
          })
          if (!hadReactCommit) {
            act(() => {
              reconciler.flushSyncWork()
            })
          }
        })
        // Re-throw non-diagnostic errors. IncrementalRenderMismatchError from
        // STRICT output verification is diagnostic — the buffer was saved above, and
        // the render-phase STRICT check below will detect real mismatches.
        // Propagating diagnostic throws would crash sendInput() callers.
        if (renderError) {
          if (!((renderError as Error) instanceof IncrementalRenderMismatchError)) {
            throw renderError
          }
        }
        if (!hadReactCommit) break
        // Pass N committed React work — pass N+1 will run. Record so the
        // histogram can show "how many passes had extra-pass causes attributed
        // to them?". Specific cause records are emitted by the pipeline phases
        // and signal sync via recordPassCause().
        notePassCommit(pass)
        if (pass === MAX_SINGLE_PASS_ITERATIONS - 1) {
          // Loop will exit but committed work is still pending — surface as
          // unknown so the histogram doesn't undercount the loop tail.
          recordPassCause({ cause: "unknown", detail: "single-pass-exhaustion" })
        }
      }

      if (hadReactCommit && singlePassCount >= MAX_SINGLE_PASS_ITERATIONS) {
        if (process.env.SILVERY_STRICT) {
          log.warn?.(
            `singlePassLayout exhausted ${MAX_SINGLE_PASS_ITERATIONS} iterations ` +
              `with pending React commit — output may be stale`,
          )
        }
      }

      // When multiple passes ran, the final buffer's dirty rows only cover
      // the LAST pass's render phase writes. Mark all rows dirty so the
      // output phase does a full diff scan.
      if (incremental && buffer && singlePassCount > 1) {
        buffer.markAllRowsDirty()
      }
    } else {
      // Classic multi-pass layout stabilization loop
      const MAX_LAYOUT_ITERATIONS = 5
      let iterationCount = 0

      beginConvergenceLoop()
      for (let iteration = 0; iteration < MAX_LAYOUT_ITERATIONS; iteration++) {
        hadReactCommit = false
        iterationCount++
        beginPass(iteration)

        // Run the render pipeline inside act() so that forceUpdate/setState
        // from notifyLayoutSubscribers (Phase 2.7) are properly captured.
        let classicRenderError: Error | null = null
        let carryForwardBuffer: TerminalBuffer | undefined
        withActEnvironment(() => {
          act(() => {
            const root = getContainerRoot(instance.container)
            try {
              const result = runPipeline(
                root,
                instance.columns,
                instance.rows,
                incremental ? instance.prevBuffer : null,
              )
              output = result.output
              buffer = result.buffer
              carryForwardBuffer = result.carryForwardBuffer
              incrementalOverlay = result.overlay
            } catch (e) {
              classicRenderError = e as Error
              const attachedBuffer = (e as any)?.__silvery_buffer
              if (attachedBuffer) {
                buffer = attachedBuffer
                carryForwardBuffer = attachedBuffer
              }
            }
            if (buffer) {
              // Carry forward PRE-fade buffer for renderPhase incremental clone;
              // track POST-fade buffer for output-phase diff.
              instance.prevBuffer = carryForwardBuffer ?? buffer
              instance.prevPaintedBuffer = buffer
            }
            instance.renderCount++
            onBufferReady?.(output, buffer, getRootContentHeight())
          })
          // Flush any React work scheduled during runPipeline (e.g. from
          // useSyncExternalStore updates triggered by Phase 2.7 callbacks).
          // Without this, external store changes from layout notification callbacks
          // (Phase 2.7) won't be committed until after doRender returns, causing
          // stale text in the buffer (e.g. breadcrumb showing old cursor position).
          if (!hadReactCommit) {
            act(() => {
              reconciler.flushSyncWork()
            })
          }
        })
        if (classicRenderError) {
          if (!((classicRenderError as Error) instanceof IncrementalRenderMismatchError)) {
            throw classicRenderError
          }
        }

        // If React didn't commit any new work from layout notifications,
        // the layout is stable — no more iterations needed.
        if (!hadReactCommit) break
        notePassCommit(iteration)
        if (iteration === MAX_LAYOUT_ITERATIONS - 1) {
          recordPassCause({ cause: "unknown", detail: "classic-exhaustion" })
        }
      }

      if (hadReactCommit && iterationCount >= MAX_LAYOUT_ITERATIONS) {
        if (process.env.SILVERY_STRICT) {
          log.warn?.(
            `classic layout loop exhausted ${MAX_LAYOUT_ITERATIONS} iterations ` +
              `with pending React commit — output may be stale`,
          )
        }
      }

      // When multiple iterations ran, the final buffer's dirty rows only cover
      // the LAST iteration's render phase writes. Rows changed in earlier
      // iterations but not the last are invisible to diffBuffers' dirty row
      // scan, causing those rows to be skipped → garbled output. Mark all rows
      // dirty so the output phase does a full diff scan.
      if (incremental && buffer && iterationCount > 1) {
        buffer.markAllRowsDirty()
      }
    }

    // SILVERY_STRICT: Compare incremental vs fresh on every render (like scheduler)
    // Skip first render (nothing to compare against)
    if (strictMode && instance.renderCount > 1) {
      const root = getContainerRoot(instance.container)
      const { buffer: freshBuffer, overlay: freshOverlay } = doFreshRenderFull()

      // STRICT overlay-plan comparison.
      //
      // Invariant: `applyBackdrop` is a pure function of (tree markers,
      // buffer cells, options) → overlay is deterministic. Incremental
      // and fresh paths MUST emit byte-identical overlay strings. Any drift
      // is a determinism bug in marker collection, the emoji walk, or
      // placement ID derivation — see `formatOverlayMismatch` in
      // scheduler.ts for the diagnostic path.
      if (incrementalOverlay !== freshOverlay) {
        const msg = formatRendererOverlayMismatch(
          incrementalOverlay,
          freshOverlay,
          instance.renderCount,
        )
        throw new IncrementalRenderMismatchError(msg)
      }

      for (let y = 0; y < buffer!.height; y++) {
        for (let x = 0; x < buffer!.width; x++) {
          const a = buffer!.getCell(x, y)
          const b = freshBuffer.getCell(x, y)
          if (!cellEquals(a, b)) {
            // Re-run fresh render with write trap to capture what writes here
            let trapInfo = ""
            const trap = { x, y, log: [] as string[] }
            ;(globalThis as any).__silvery_write_trap = trap
            try {
              doFreshRender()
            } catch {
              // ignore
            }
            ;(globalThis as any).__silvery_write_trap = null
            if (trap.log.length > 0) {
              trapInfo = `\nWRITE TRAP (${trap.log.length} writes to (${x},${y})):\n${trap.log.join("\n")}\n`
            } else {
              trapInfo = `\nWRITE TRAP: NO WRITES to (${x},${y})\n`
            }

            // Build rich debug context
            const ctx = buildMismatchContext(root, x, y, a, b, instance.renderCount)

            // Capture render-phase instrumentation snapshot
            const renderPhaseStats: RenderPhaseStats | undefined = (globalThis as any)
              .__silvery_content_detail
              ? structuredClone((globalThis as any).__silvery_content_detail)
              : undefined

            const debugInfo = formatMismatchContext(ctx, renderPhaseStats)

            // Include text output for full picture
            const incText = bufferToText(buffer!)
            const freshText = bufferToText(freshBuffer)
            const msg =
              debugInfo + trapInfo + `--- incremental ---\n${incText}\n--- fresh ---\n${freshText}`
            throw new IncrementalRenderMismatchError(msg, {
              renderPhaseStats,
              mismatchContext: ctx,
            })
          }
        }
      }
    }

    return output!
  }

  // Fresh render: renders from scratch without updating incremental state.
  // Returns buffer + overlay so the STRICT block can compare the
  // backdrop-fade overlay byte-for-byte against the incremental render.
  function doFreshRenderFull(): { buffer: TerminalBuffer; overlay: string } {
    const root = getContainerRoot(instance.container)
    const { buffer, overlay } = runPipeline(root, instance.columns, instance.rows, null, {
      skipLayoutNotifications: true,
      skipScrollStateUpdates: true,
    })
    return { buffer, overlay }
  }
  // Public shim: keeps the `freshRender(): TerminalBuffer` API stable for
  // external callers (with-diagnostics, app.freshRender).
  function doFreshRender(): TerminalBuffer {
    return doFreshRenderFull().buffer
  }

  // Synchronously update React tree within act()
  instance.rendering = true
  try {
    withActEnvironment(() => {
      act(() => {
        reconciler.updateContainerSync(wrapWithContexts(element), instance.fiberRoot, null, null)
        reconciler.flushSyncWork()
      })
    })
  } finally {
    instance.rendering = false
  }

  // Execute the render pipeline.
  // The initial render always uses the multi-pass stabilization loop regardless
  // of singlePassLayout, because hooks like useBoxRect need multiple passes
  // to stabilize (subscribe → layout → forceUpdate → re-render). This matches
  // production where the initial render runs once and the first user-visible
  // frame comes after the event loop starts. For tests, we need the initial
  // state to be stable. singlePassLayout only affects subsequent renders
  // (sendInput/press) to match production's processEventBatch path.
  const savedSinglePass = instance.singlePassLayout
  instance.singlePassLayout = false
  const output = doRender()
  instance.singlePassLayout = savedSinglePass

  instance.frames.push(output)
  onFrame?.(output, instance.prevBuffer!, getRootContentHeight())

  if (debug) {
    console.log("[silvery] Initial render:", output)
  }

  // Set up stdin bridge: forward external stdin data to the renderer's input
  let stdinOnReadable: (() => void) | undefined
  if (stdinStream) {
    stdinOnReadable = () => {
      let chunk: string | null
      while ((chunk = (stdinStream as any).read?.()) !== null && chunk !== undefined) {
        instance.inputEmitter.emit("input", chunk)
      }
    }
    stdinStream.on("readable", stdinOnReadable)
  }

  // Helper functions for App
  const getContainer = () => getContainerRoot(instance.container)
  // Expose the POST-fade buffer so app.cell() / app.text / createTextFrame
  // read what was actually painted. `instance.prevBuffer` is the pre-fade
  // buffer used for the next frame's renderPhase incremental clone.
  const getBuffer = () => instance.prevPaintedBuffer ?? instance.prevBuffer

  const sendInput = (data: string) => {
    if (!instance.mounted) {
      throw new Error("Cannot write to stdin after unmount")
    }
    if (instance.rendering) {
      throw new Error(
        "silvery: Re-entrant render detected. " +
          "Cannot call press()/stdin.write() from inside a React render or effect. " +
          "Use setTimeout or an event handler instead.",
      )
    }
    const t0 = performance.now()
    instance.rendering = true
    try {
      // Check for bracketed paste before splitting into individual keys.
      // Paste content is delivered as a single "paste" event, not individual keystrokes.
      // This mirrors the production path in term-provider.ts.
      const pasteResult = parseBracketedPaste(data)
      if (pasteResult) {
        withActEnvironment(() => {
          act(() => {
            instance.inputEmitter.emit("paste", pasteResult.content)
          })
        })
      } else {
        // Split multi-character data into individual keypresses.
        // This mirrors the production path (render.tsx handleReadable)
        // where stdin.read() can return buffered characters.
        withActEnvironment(() => {
          for (const keypress of splitRawInput(data)) {
            // Default Tab/Shift+Tab focus cycling and Escape blur.
            // Matches production behavior in run.tsx and render.tsx.
            // Tab events are consumed (not passed to useInput handlers).
            // Each focus change runs in its own act() boundary so React
            // commits the re-render before the next keypress or doRender().
            const [, key] = parseKey(keypress)
            if (key.tab && !key.shift) {
              act(() => {
                const root = getContainerRoot(instance.container)
                focusManager.focusNext(root)
              })
              continue
            }
            if (key.tab && key.shift) {
              act(() => {
                const root = getContainerRoot(instance.container)
                focusManager.focusPrev(root)
              })
              continue
            }
            if (key.escape && focusManager.activeElement) {
              act(() => {
                focusManager.blur()
              })
              continue
            }
            act(() => {
              instance.inputEmitter.emit("input", keypress)
            })
          }
        })
      } // end else (non-paste input)
    } finally {
      instance.rendering = false
    }

    const t1 = performance.now()
    // doRender() handles SILVERY_STRICT checking internally
    let newFrame = doRender()

    // In single-pass mode, flush effects after doRender() — matching
    // production's processEventBatch pattern (lines 1107-1118 of create-app.tsx).
    // Production does: doRender → await Promise.resolve() → check pendingRerender → repeat.
    // In tests, we use act(flushSyncWork) as the synchronous equivalent.
    let doRenderCount = 1
    if (instance.singlePassLayout) {
      const MAX_EFFECT_FLUSHES = 5
      beginConvergenceLoop()
      for (let flush = 0; flush < MAX_EFFECT_FLUSHES; flush++) {
        hadReactCommit = false
        beginPass(flush)
        withActEnvironment(() => {
          act(() => {
            reconciler.flushSyncWork()
          })
        })
        if (!hadReactCommit) break
        notePassCommit(flush)
        if (flush === MAX_EFFECT_FLUSHES - 1) {
          recordPassCause({ cause: "unknown", detail: "effect-flush-exhaustion" })
        }
        // React committed new work from effects — re-render
        newFrame = doRender()
        doRenderCount++
      }
    }

    // When multiple doRender() calls ran (layout feedback, effects), the final
    // buffer's dirty rows only cover the LAST call's writes. Rows changed in
    // earlier doRender calls are invisible to callers using outputPhase to diff
    // against an older prevBuffer. Mark all rows dirty for correctness.
    if (incremental && doRenderCount > 1 && instance.prevBuffer) {
      instance.prevBuffer.markAllRowsDirty()
    }

    const t2 = performance.now()
    instance.frames.push(newFrame)
    onFrame?.(newFrame, instance.prevBuffer!, getRootContentHeight())
    if (debug) {
      console.log("[silvery] stdin.write:", newFrame)
    }
    // Expose timing on global for benchmarking
    ;(globalThis as any).__silvery_last_timing = {
      actMs: t1 - t0,
      renderMs: t2 - t1,
    }
  }

  const rerenderFn = (newElement: ReactNode) => {
    if (!instance.mounted) {
      throw new Error("Cannot rerender after unmount")
    }
    if (instance.rendering) {
      throw new Error(
        "silvery: Re-entrant render detected. " +
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
    onFrame?.(newFrame, instance.prevBuffer!, getRootContentHeight())
    if (debug) {
      console.log("[silvery] Rerender:", newFrame)
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
    // The root is created as ConcurrentRoot (see createFiberRoot). Mount and
    // rerender both use updateContainerSync + flushSyncWork; unmount must do
    // the same so React layout-effect cleanups (e.g. useBoxMetrics's
    // signalEffect disposers) actually run synchronously. The async
    // updateContainer(null, …) path on a ConcurrentRoot leaves cleanups
    // pending past unmount, which kept signal subscriptions + the whole
    // RenderInstance graph alive across mount/unmount cycles.
    const fiberRoot = instance.fiberRoot
    withActEnvironment(() => {
      act(() => {
        reconciler.updateContainerSync(null, fiberRoot, null, null)
        reconciler.flushSyncWork()
      })
    })

    instance.mounted = false
    instance.rendering = false
    autoRenderScheduled = false
    inRenderCycle = false

    instance.inputEmitter.removeAllListeners()
    stdoutEmitter.removeAllListeners()

    // Clean up stdin bridge
    if (stdinStream && stdinOnReadable) {
      stdinStream.removeListener("readable", stdinOnReadable)
      stdinOnReadable = undefined
    }

    // Unregister node removal hook
    setOnNodeRemoved(null)

    // Untrack this render
    activeRenders.delete(renderRef)

    // Drop heavy retained state and break the FiberRoot → Container.onRender
    // → RenderInstance retention chain. Without releaseContainer(), even a
    // synchronously-flushed unmount keeps the full instance reachable
    // through the container that the FiberRoot still references.
    clearFn()
    instance.kittyActive = false
    releaseContainer(instance.container)
    instance.fiberRoot = null

    if (debug) {
      console.log("[silvery] Unmounted")
    }
  }
  renderTracker.unmount = unmountFn

  const clearFn = () => {
    instance.frames.length = 0
    instance.prevBuffer = null
    instance.prevPaintedBuffer = null
  }

  const debugFn = () => {
    console.log(debugTree(getContainerRoot(instance.container)))
  }

  // actAndRender: wrap a callback in act() so React state updates are flushed,
  // then doRender() to update the buffer. Used by click/wheel/doubleClick.
  const actAndRenderFn = (fn: () => void) => {
    if (!instance.mounted) return
    withActEnvironment(() => {
      act(() => {
        fn()
      })
    })
    const newFrame = doRender()
    instance.frames.push(newFrame)
    onFrame?.(newFrame, instance.prevBuffer!, getRootContentHeight())
  }

  // Resize: update dimensions, clear prevBuffer, re-render (matches scheduler resize behavior)
  const resizeFn = (newCols: number, newRows: number) => {
    if (!instance.mounted) {
      throw new Error("Cannot resize after unmount")
    }
    instance.columns = newCols
    instance.rows = newRows
    mockStdout.columns = newCols
    mockStdout.rows = newRows
    // Emit resize event so component-level listeners (e.g., ScrollbackView's
    // width tracking) fire before the render, matching real terminal behavior.
    stdoutEmitter.emit("resize")
    // Clear prevBuffer to force full redraw (matches scheduler.setupResizeListener)
    instance.prevBuffer = null
    instance.prevPaintedBuffer = null
    // Re-render at new dimensions
    const newFrame = doRender()
    instance.frames.push(newFrame)
    onFrame?.(newFrame, instance.prevBuffer!, getRootContentHeight())
    if (debug) {
      console.log("[silvery] Resize:", newCols, "x", newRows)
    }
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
    kittyMode,
    actAndRender: actAndRenderFn,
    resize: resizeFn,
    focusManager,
    getCursorState: cursorStore.accessors.getCursorState,
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
  /** Use production-like single-pass layout. See RenderOptions.singlePassLayout. */
  singlePassLayout?: boolean
  /** Use Kitty keyboard protocol encoding for press(). */
  kittyMode?: boolean
}

/**
 * Create a render function that auto-cleans previous renders.
 *
 * By default, incremental rendering is ENABLED for test renders.
 * This matches production behavior (live scheduler uses incremental)
 * and enables withDiagnostics to catch incremental vs fresh mismatches.
 *
 * **Instance reuse:** When the same renderer is called repeatedly with a
 * compatible element (no overrides that would require fresh state), the
 * returned function calls `current.rerender(element)` instead of
 * unmount+remount. This avoids paying the full React reconciler init +
 * fiberRoot creation cost on each iteration — which otherwise dominates
 * cold-render microbenchmarks. See bead `km-silvery.renderer-reuse`.
 *
 * Reuse is skipped (forcing fresh mount) when:
 * - The previous instance has been unmounted (rerender would throw)
 * - Per-render overrides are supplied that conflict with baseOpts
 *   (e.g., flipping `incremental`, `singlePassLayout`, or `kittyMode`)
 * - The base options are a Store (store-mode renders manage their own
 *   lifecycle and we conservatively force a fresh mount)
 *
 * @example
 * ```tsx
 * const render = createRenderer({ cols: 80, rows: 24 })
 * const app1 = render(<Foo />)  // fresh mount
 * const app2 = render(<Bar />)  // reuses app1 via rerender()
 * // app1 === app2 when reuse kicks in
 *
 * // Explicitly disable incremental if needed
 * const render2 = createRenderer({ cols: 80, rows: 24, incremental: false })
 * ```
 */
export function createRenderer(
  optsOrStore: RenderOptions | Store = {},
): (el: ReactElement, overrides?: PerRenderOptions) => App {
  let current: App | null = null
  // Tracks whether `current` is reusable via rerender(). Set to false when
  // the instance is unmounted (either via an exception path below or if the
  // caller called unmount() directly — in which case rerender() will throw
  // and we fall back to a fresh mount).
  let currentReusable = false

  // Default to incremental: true for test renders (matches production behavior)
  // User can explicitly pass incremental: false to disable
  // Note: When passed a Store-like object (cols/rows only), convert to RenderOptions with incremental.
  // The converted baseOpts always has `incremental`, so isStore(baseOpts) === false.
  const baseOpts = isStore(optsOrStore)
    ? { incremental: true, cols: optsOrStore.cols, rows: optsOrStore.rows }
    : { incremental: true, ...optsOrStore }

  return (element: ReactElement, overrides?: PerRenderOptions): App => {
    // Fast path: reuse the existing instance via rerender() when safe.
    // This skips unmount + full React reconciler re-init on every call,
    // which dominates cold-render microbenchmarks against Ink.
    //
    // We reuse when:
    //   1. We have a live previous instance.
    //   2. No overrides that conflict with the base config (dimensions are
    //      always identical since they come from the fixed baseOpts).
    //
    // On any rerender() exception (e.g., the caller unmounted `current`
    // manually), we fall through to the legacy unmount+render path.
    if (current && currentReusable && canReuseInstance(overrides, baseOpts)) {
      try {
        current.rerender(element)
        return current
      } catch {
        // Fall through to unmount+remount path. The instance may have been
        // unmounted by the caller or torn down by an error.
        currentReusable = false
      }
    }

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
    currentReusable = true
    return current
  }
}

/**
 * Can we reuse the current App instance for this call? Overrides that would
 * change reconciler/layout semantics force a fresh mount.
 */
function canReuseInstance(
  overrides: PerRenderOptions | undefined,
  baseOpts: { incremental?: boolean; singlePassLayout?: boolean; kittyMode?: boolean },
): boolean {
  if (!overrides) return true
  if (
    overrides.incremental !== undefined &&
    overrides.incremental !== (baseOpts.incremental ?? true)
  ) {
    return false
  }
  if (
    overrides.singlePassLayout !== undefined &&
    overrides.singlePassLayout !== (baseOpts.singlePassLayout ?? false)
  ) {
    return false
  }
  if (overrides.kittyMode !== undefined && overrides.kittyMode !== (baseOpts.kittyMode ?? false)) {
    return false
  }
  return true
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
export interface AsyncRunResult extends AsyncIterable<string>, PromiseLike<void> {
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
    then<TResult1 = void, TResult2 = never>(
      onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
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
  return value !== null && typeof value === "object" && Symbol.asyncIterator in value
}

/**
 * Run a function with IS_REACT_ACT_ENVIRONMENT temporarily set to true.
 * This ensures act() works correctly without polluting the global scope.
 */
function withActEnvironment(fn: () => void): void {
  const prev = (globalThis as any).IS_REACT_ACT_ENVIRONMENT
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  try {
    fn()
  } finally {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = prev
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
// STRICT Diagnostics — Backdrop Overlay Mismatch
// ============================================================================

/**
 * Format a human-readable diff when the incremental and fresh Kitty overlays
 * disagree. The overlay is a Kitty graphics protocol escape sequence emitted
 * by `realizeToKitty` (see `pipeline/backdrop/`) — it
 * places translucent "scrim" images over emoji cells inside faded regions.
 * The invariant is that the fresh and incremental paths emit byte-identical
 * strings for the same tree; any drift is a determinism bug.
 *
 * The diff surfaces the placement IDs that differ — the Kitty protocol uses
 * `p=<id>` in each placement command, so grep-friendly IDs are the quickest
 * path from "test failed" to "which cell drifted".
 */
function formatRendererOverlayMismatch(
  incremental: string,
  fresh: string,
  renderNum: number,
): string {
  const incPlacements = extractOverlayPlacementIds(incremental)
  const freshPlacements = extractOverlayPlacementIds(fresh)

  const incSet = new Set(incPlacements)
  const freshSet = new Set(freshPlacements)

  const onlyIncremental = incPlacements.filter((id) => !freshSet.has(id))
  const onlyFresh = freshPlacements.filter((id) => !incSet.has(id))

  const lines: string[] = [
    `[SILVERY_STRICT] Kitty overlay mismatch at render #${renderNum}`,
    `  incremental length: ${incremental.length} bytes, placements: ${incPlacements.length}`,
    `  fresh       length: ${fresh.length} bytes, placements: ${freshPlacements.length}`,
  ]
  if (onlyIncremental.length > 0) {
    lines.push(`  only in incremental (moved/appeared): ${onlyIncremental.join(", ")}`)
  }
  if (onlyFresh.length > 0) {
    lines.push(`  only in fresh       (missing/disappeared): ${onlyFresh.join(", ")}`)
  }
  if (onlyIncremental.length === 0 && onlyFresh.length === 0) {
    lines.push(`  placements match — drift is in scrim-image payload or ordering`)
  }

  // Truncated raw bytes for inspection. Full strings can be many KB (each
  // scrim image payload is base64-encoded) — cap to avoid log-flood.
  const cap = 400
  lines.push(
    `  incremental[0..${cap}]: ${JSON.stringify(incremental.slice(0, cap))}`,
    `  fresh      [0..${cap}]: ${JSON.stringify(fresh.slice(0, cap))}`,
  )
  return lines.join("\n")
}

/**
 * Extract the list of `p=<id>` placement IDs from a Kitty overlay string, in
 * emission order. Used by the STRICT diagnostic to show which placements
 * moved/appeared/disappeared.
 */
function extractOverlayPlacementIds(overlay: string): string[] {
  const ids: string[] = []
  const re = /p=(\d+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(overlay)) !== null) {
    ids.push(m[1]!)
  }
  return ids
}

// ============================================================================
// Re-exports
// ============================================================================

export { keyToAnsi } from "@silvery/ag/keys"
export type { App } from "./app.js"
