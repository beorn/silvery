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
  FocusManagerContext,
  RuntimeContext,
  type RuntimeContextValue,
  StdoutContext,
  TermContext,
} from "@silvery/ag-react/context"
import { createFocusManager } from "@silvery/ag/focus-manager"
import {
  type LayoutEngine,
  ensureDefaultLayoutEngine,
  isLayoutEngineInitialized,
  setLayoutEngine,
} from "./layout-engine.js"
import { executeRender } from "./pipeline.js"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
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
   * loop (up to 5 iterations) that re-runs executeRender whenever React
   * commits new work from layout notifications (useContentRect, etc.).
   *
   * When true, doRender() does a single executeRender call (matching
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
   * Called inside act() after executeRender produces the buffer but before
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
    mounted: true,
    rendering: false,
    columns: cols,
    rows: rows,
    inputEmitter: new EventEmitter(),
    debug,
    incremental,
    renderCount: 0,
    singlePassLayout,
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
    if (autoRender && !instance.rendering && !inRenderCycle && !autoRenderScheduled && instance.mounted) {
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
      if (!root?.contentRect) return undefined
      let maxBottom = 0
      let hasChildren = false
      for (const child of root.children) {
        if (child.contentRect) {
          hasChildren = true
          // contentRect includes marginTop in the y position but NOT marginBottom
          // in the height. Read marginBottom from props to get the full outer extent.
          const props = child.props as Record<string, unknown>
          const mb = (props.marginBottom as number) ?? (props.marginY as number) ?? (props.margin as number) ?? 0
          const childBottom = child.contentRect.y + child.contentRect.height + mb
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
  const mockTerm = createTerm({ color: "truecolor", stdout: mockStdout })

  // Focus manager (tree-based focus system)
  const focusManager = createFocusManager()

  // Wire up focus cleanup on node removal
  setOnNodeRemoved((removedNode) => focusManager.handleSubtreeRemoved(removedNode))

  // Per-instance cursor state (replaces module-level globals)
  const cursorStore = createCursorStore()

  // RuntimeContext — typed event bus bridging from test renderer's inputEmitter
  const runtimeValue: RuntimeContextValue = {
    on(event, handler) {
      if (event === "input") {
        const wrapped = (data: string | Buffer) => {
          const [input, key] = parseKey(data)
          ;(handler as (input: string, key: import("@silvery/ag/keys").Key) => void)(input, key)
        }
        instance.inputEmitter.on("input", wrapped)
        return () => {
          instance.inputEmitter.removeListener("input", wrapped)
        }
      }
      if (event === "paste") {
        instance.inputEmitter.on("paste", handler)
        return () => {
          instance.inputEmitter.removeListener("paste", handler)
        }
      }
      return () => {} // Unknown event — no-op cleanup
    },
    emit() {
      // Test renderer doesn't support view → runtime events
    },
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
            React.createElement(RuntimeContext.Provider, { value: runtimeValue }, inner),
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
  //    After executeRender fires notifyLayoutSubscribers (Phase 2.7), hooks
  //    like useContentRect call forceUpdate(). These React updates are flushed
  //    and the pipeline re-run until stable.
  //
  // 2. Single-pass (singlePassLayout=true): Matches production create-app.tsx.
  //    Single executeRender call per doRender(), with a separate effect flush
  //    loop afterward (like production's processEventBatch). This ensures tests
  //    exercise the same rendering pipeline as production.
  //
  // Key insight: executeRender must run inside act() so that forceUpdate/setState
  // calls from layout notifications are properly captured by React's scheduler.
  // With IS_REACT_ACT_ENVIRONMENT=true (set by silvery/testing), state updates
  // outside act() boundaries may be dropped.
  // Max iterations for singlePassLayout mode. Normally 1-2 passes, but resize
  // can need 3+ (pass 0 stale zustand + pass 1 updated dims + pass 2+ layout
  // feedback stabilization). Matches classic path's cap of 5.
  const MAX_SINGLE_PASS_ITERATIONS = 5

  function doRender(): string {
    let output: string
    let buffer!: TerminalBuffer

    if (instance.singlePassLayout) {
      // Production-matching single-pass: one executeRender, no stabilization
      // loop. This matches create-app.tsx doRender() which does a single
      // reconcile + pipeline pass. Layout feedback effects (useContentRect
      // etc.) are NOT re-run within this doRender — they're flushed by the
      // caller (sendInput) in a separate loop, matching production's
      // processEventBatch flush pattern.
      //
      // IMPORTANT: Do NOT flush sync work here. executeRender fires
      // notifyLayoutSubscribers (Phase 2.7) which may call forceUpdate().
      // If we flushed that commit here, the pipeline output would still
      // reflect the pre-forceUpdate state. Instead, let the sendInput
      // flush loop detect the pending commit and call doRender() again
      // with the updated React tree.
      // Single-pass: run executeRender once, then flush any pending React
      // work from layout notifications. If React committed new work, run
      // additional passes to stabilize. Normally 1-2 passes suffice, but
      // resize can need 3 (pass 0 with stale zustand, pass 1 with updated
      // dimensions, pass 2 for layout feedback from pass 1).
      let singlePassCount = 0
      for (let pass = 0; pass < MAX_SINGLE_PASS_ITERATIONS; pass++) {
        hadReactCommit = false
        singlePassCount++
        let renderError: Error | null = null
        withActEnvironment(() => {
          act(() => {
            const root = getContainerRoot(instance.container)
            try {
              const result = executeRender(
                root,
                instance.columns,
                instance.rows,
                incremental ? instance.prevBuffer : null,
              )
              output = result.output
              buffer = result.buffer
            } catch (e) {
              // STRICT output verification may throw from the output phase.
              // The render phase buffer is still valid and attached to the
              // error by executeRenderCore — extract it so lastBuffer()
              // returns the correct frame, not a stale one.
              renderError = e as Error
              const attachedBuffer = (e as any)?.__silvery_buffer
              if (attachedBuffer) {
                buffer = attachedBuffer
              }
            }
            // Always update prevBuffer when a new buffer was produced,
            // even if the output phase threw. The buffer from renderPhase
            // is correct; the STRICT verification exception is a diagnostic that
            // should not corrupt incremental rendering state.
            if (buffer) {
              instance.prevBuffer = buffer
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
      }

      if (hadReactCommit && singlePassCount >= MAX_SINGLE_PASS_ITERATIONS) {
        if (process.env.SILVERY_STRICT) {
          log.warn(
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

      for (let iteration = 0; iteration < MAX_LAYOUT_ITERATIONS; iteration++) {
        hadReactCommit = false
        iterationCount++

        // Run the render pipeline inside act() so that forceUpdate/setState
        // from notifyLayoutSubscribers (Phase 2.7) are properly captured.
        let classicRenderError: Error | null = null
        withActEnvironment(() => {
          act(() => {
            const root = getContainerRoot(instance.container)
            try {
              const result = executeRender(
                root,
                instance.columns,
                instance.rows,
                incremental ? instance.prevBuffer : null,
              )
              output = result.output
              buffer = result.buffer
            } catch (e) {
              classicRenderError = e as Error
              const attachedBuffer = (e as any)?.__silvery_buffer
              if (attachedBuffer) {
                buffer = attachedBuffer
              }
            }
            if (buffer) {
              instance.prevBuffer = buffer
            }
            instance.renderCount++
            onBufferReady?.(output, buffer, getRootContentHeight())
          })
          // Flush any React work scheduled during executeRender (e.g. from
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
      }

      if (hadReactCommit && iterationCount >= MAX_LAYOUT_ITERATIONS) {
        if (process.env.SILVERY_STRICT) {
          log.warn(
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
      const freshBuffer = doFreshRender()
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
            const renderPhaseStats: RenderPhaseStats | undefined = (globalThis as any).__silvery_content_detail
              ? structuredClone((globalThis as any).__silvery_content_detail)
              : undefined

            const debugInfo = formatMismatchContext(ctx, renderPhaseStats)

            // Include text output for full picture
            const incText = bufferToText(buffer!)
            const freshText = bufferToText(freshBuffer)
            const msg = debugInfo + trapInfo + `--- incremental ---\n${incText}\n--- fresh ---\n${freshText}`
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

  // Fresh render: renders from scratch without updating incremental state
  function doFreshRender(): TerminalBuffer {
    const root = getContainerRoot(instance.container)
    const { buffer } = executeRender(root, instance.columns, instance.rows, null, {
      skipLayoutNotifications: true,
      skipScrollStateUpdates: true,
    })
    return buffer
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
  // of singlePassLayout, because hooks like useContentRect need multiple passes
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
  const getBuffer = () => instance.prevBuffer

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
      for (let flush = 0; flush < MAX_EFFECT_FLUSHES; flush++) {
        hadReactCommit = false
        withActEnvironment(() => {
          act(() => {
            reconciler.flushSyncWork()
          })
        })
        if (!hadReactCommit) break
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
        "silvery: Re-entrant render detected. " + "Cannot call rerender() from inside a React render or effect.",
      )
    }
    instance.rendering = true
    try {
      withActEnvironment(() => {
        act(() => {
          reconciler.updateContainerSync(wrapWithContexts(newElement as ReactElement), instance.fiberRoot, null, null)
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
    withActEnvironment(() => {
      act(() => {
        reconciler.updateContainer(null, instance.fiberRoot, null, () => {})
      })
    })
    instance.mounted = false
    instance.inputEmitter.removeAllListeners()

    // Clean up stdin bridge
    if (stdinStream && stdinOnReadable) {
      stdinStream.removeListener("readable", stdinOnReadable)
    }

    // Unregister node removal hook
    setOnNodeRemoved(null)

    // Untrack this render
    activeRenders.delete(renderRef)

    if (debug) {
      console.log("[silvery] Unmounted")
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
// Re-exports
// ============================================================================

export { keyToAnsi } from "@silvery/ag/keys"
export type { App } from "./app.js"
