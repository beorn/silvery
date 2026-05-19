/**
 * App - Unified render API for silvery
 *
 * Both production and testing return an App instance with the same interface.
 * Key improvements over the old API:
 * - Auto-refreshing locators (no stale locator problem)
 * - Playwright-style API (app.press(), app.getByTestId())
 * - Bound terminal (app.term) with node awareness
 *
 * @example
 * ```tsx
 * // Both production and testing
 * const app = await render(<App />, term)
 *
 * // Query and interact
 * app.text                          // rendered text (no ANSI)
 * app.getByTestId('modal')          // auto-refreshing locator
 * await app.press('ArrowUp')        // send key
 * await app.waitUntilExit()         // wait until exit
 *
 * // Terminal access
 * app.term.cell(x, y)               // { char, fg, bg, attrs }
 * app.term.nodeAt(x, y)             // node at screen coords
 * ```
 */

import type { ReactNode } from "react"
import { type AutoLocator, createAutoLocator } from "@silvery/test/auto-locator"
import { type BoundTerm, createBoundTerm } from "./bound-term"
import type { TerminalBuffer } from "./buffer"
import {
  bufferToHTML,
  bufferToStyledText,
  bufferToText,
  cellToFrameCell,
  EMPTY_FRAME_CELL,
} from "./buffer"
import { type Screenshotter, createScreenshotter } from "./screenshot"
import { keyToAnsi, keyToKittyAnsi, parseHotkey } from "@silvery/ag/keys"
import { findActiveCursorRect } from "@silvery/ag/layout-signals"
import { updateKeyboardModifiers } from "./mouse-events"
import type { ParsedMouse } from "./mouse"
import { createMouseEventProcessor, processMouseEvent } from "./mouse-events"
import type { FocusManager } from "@silvery/ag/focus-manager"
import { pointInRect } from "@silvery/ag/tree-utils"
import type { AgNode } from "@silvery/ag/types"
import type { FrameCell } from "@silvery/ag/text-frame"
import type { CLSReport, ReasonClassifier } from "@silvery/ag/cls"
import type { ClsMonitor } from "./runtime/cls-monitor"
import { getRenderPath, getMountTree } from "@silvery/ag-react/debug/render-path"

/**
 * App interface - unified return type from render()
 */
/**
 * Fluent chain of App actions. Each action method returns `ChainableApp`
 * — a `PromiseLike<App>` that exposes the same action methods so calls
 * can be composed without explicit `await` between every step.
 *
 * ```ts
 * await app.keyDown("Super").hover(x, y).keyUp("Super")
 * ```
 *
 * The returned chain `.then`-s into the App, so existing `await
 * app.action(...)` calls continue to receive the App instance — the
 * change is purely additive at the call site.
 *
 * Bead: @km/silvery/fluent-chain-actions.
 */
export interface ChainableApp extends PromiseLike<App> {
  press(key: string): ChainableApp
  keyDown(key: string): ChainableApp
  keyUp(key: string): ChainableApp
  pressSequence(...keys: string[]): ChainableApp
  type(text: string): ChainableApp
  click(
    x: number,
    y: number,
    options?: { button?: number; shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
  ): ChainableApp
  doubleClick(
    x: number,
    y: number,
    options?: { button?: number; shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
  ): ChainableApp
  hover(
    x: number,
    y: number,
    options?: { shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
  ): ChainableApp
  wheel(
    x: number,
    y: number,
    delta: number,
    options?: { shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
  ): ChainableApp
}

export interface App {
  // === Content/Document Perspective ===

  /** Full rendered text (no ANSI codes) */
  readonly text: string

  /** Full rendered text with ANSI styling */
  readonly ansi: string

  /** Per-line plain text array (no ANSI codes) */
  readonly lines: string[]

  /** Frame width in terminal columns */
  readonly width: number

  /** Frame height in terminal rows */
  readonly height: number

  /** Get the cell at the given column and row (resolved styling) */
  cell(col: number, row: number): FrameCell

  /** Check whether the plain text contains the given substring */
  containsText(text: string): boolean

  /** Get node at content coordinates */
  nodeAt(x: number, y: number): AgNode | null

  /** Get locator by testID attribute */
  getByTestId(id: string): AutoLocator

  /** Get locator by text content */
  getByText(text: string | RegExp): AutoLocator

  /** Get locator by CSS-style selector */
  locator(selector: string): AutoLocator

  // === Actions (return ChainableApp for fluent composition) ===

  /**
   * Send a single key press. Emits the bare Kitty CSI u shape
   * (no `:eventType` byte) — the parser defaults to "press" without
   * one. Equivalent to a full down+up keystroke for tests asserting
   * "user typed key X". For held-state scenarios (Cmd-hover popovers,
   * multi-key chords) use `keyDown` / `keyUp` which emit explicit
   * `:1` (press) and `:3` (release) event-type bytes.
   *
   * Both bare-press and explicit-`:1` shapes parse to
   * `{ eventType: "press" | undefined }` respectively; consumers that
   * test `eventType !== "release"` see them identically. The shape
   * difference is intentional: bare = transient single event, typed =
   * paired down/up lifecycle. Bead:
   * @km/silvery/keydown-keyup-test-primitives.
   */
  press(key: string): ChainableApp

  /**
   * Send a key DOWN event without auto-release. Useful for held-modifier
   * scenarios — e.g., `app.keyDown("Super")` then `app.hover(x, y)` then
   * `app.keyUp("Super")` to drive a Cmd-hover popover that opens after a
   * dwell timer reads the (still-held) modifier from the input store.
   *
   * Requires Kitty keyboard protocol (`kittyMode: true`) for modifier keys —
   * legacy ANSI cannot represent Super (Cmd) alone.
   *
   * For a single press+release event (the common case) use `press()`. Bead:
   * @km/silvery/keydown-keyup-test-primitives.
   */
  keyDown(key: string): ChainableApp

  /**
   * Send a key UP event. Pairs with `keyDown(key)`. Drops the implicit
   * modifier state (mouseState.keyboardModifiers + the input-store
   * modifier tracker) so subsequent events run without the modifier
   * asserted. Bead: @km/silvery/keydown-keyup-test-primitives.
   */
  keyUp(key: string): ChainableApp

  /** Send multiple key presses */
  pressSequence(...keys: string[]): ChainableApp

  /** Type text input */
  type(text: string): ChainableApp

  /** Simulate a mouse click at (x, y) terminal coordinates */
  click(
    x: number,
    y: number,
    options?: { button?: number; shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
  ): ChainableApp

  /** Simulate a double-click at (x, y) terminal coordinates */
  doubleClick(
    x: number,
    y: number,
    options?: { button?: number; shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
  ): ChainableApp

  /** Simulate a mouse move/hover at (x, y) terminal coordinates */
  hover(
    x: number,
    y: number,
    options?: { shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
  ): ChainableApp

  /** Simulate a mouse wheel event at (x, y) with delta (-1=up, +1=down) */
  wheel(
    x: number,
    y: number,
    delta: number,
    options?: { shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
  ): ChainableApp

  /** Resize the virtual terminal and re-render. Only available in test renderer. */
  resize(cols: number, rows: number): void

  /** Wait until app exits */
  run(): Promise<void>

  // === Terminal Binding ===

  /** Bound terminal for screen-space access */
  readonly term: BoundTerm

  // === Lifecycle (Instance compatibility) ===

  /** Re-render with a new element */
  rerender(element: ReactNode): void

  /** Unmount the component and clean up */
  unmount(): void

  /** Dispose (alias for unmount) — enables `using` */
  [Symbol.dispose](): void

  /** Promise that resolves when the app exits (alias for run()) */
  waitUntilExit(): Promise<void>

  /**
   * Drain additional commit / layout cycles until layout reports stable
   * (no node dirty, no pending React commit) OR a budget cap is reached
   * (default 20 passes / 50ms wall clock).
   *
   * The default test harness exposes the post-`MAX_CONVERGENCE_PASSES`
   * frame — matching what production silvery commits on first paint.
   * Most tests don't need to wait further: keyboard / mouse input each
   * runs its own bounded-convergence loop, so an assertion after `press()`
   * already sees post-convergence state for that batch.
   *
   * This method is for assertions on layout state IMMEDIATELY after mount
   * that require chains needing more than `MAX_CONVERGENCE_PASSES` passes
   * to settle (rare with the layout-signals primitive, common with older
   * useState+onLayout chains). Returns once stable so tests can assert
   * post-convergence text/layout.
   *
   * Resolves without throwing even when the cap is hit — an infinitely
   * non-converging app is a structural bug surfaced by SILVERY_STRICT's
   * `assertBoundedConvergence`, not a test-author concern here.
   *
   * Bead: `@km/silvery/test-harness-convergence-cap-parity`.
   */
  waitForLayoutStable(opts?: { timeoutMs?: number; maxPasses?: number }): Promise<void>

  // === CLS (Cumulative Layout Shift) capture ===

  /**
   * Begin a CLS capture window. Layout shifts that occur between this call
   * and the next `endCLSCapture()` are recorded with the supplied
   * `ReasonClassifier` (default: every shift labeled "unexpected"). Use
   * `waitForLayoutStable()` to drain pending layout passes before reading
   * the report.
   *
   * Throws if a capture is already active — call `endCLSCapture()` or
   * `cancelCLSCapture()` first. The capture is process-wide (single active
   * recorder per process); two parallel captures on different App
   * instances is not supported by design.
   *
   * Bead: km-silvery.cls-instrumentation-primitive
   */
  beginCLSCapture(classifier?: ReasonClassifier): void

  /**
   * End the active CLS capture and return the aggregated report. When
   * `SILVERY_STRICT=cls` (or tier 2+) is enabled, throws
   * `UnexpectedLayoutShiftError` if any shift has reflowReason="unexpected"
   * — failing-fast under STRICT lets close-gate tests skip explicit
   * assertions and rely on the umbrella env var.
   *
   * Throws if no capture is active.
   *
   * Bead: km-silvery.cls-instrumentation-primitive
   */
  endCLSCapture(): import("@silvery/ag/cls").CLSReport

  /**
   * Cancel the active CLS capture without producing a report. Idempotent
   * — safe to call when no capture is active. Used by test-cleanup paths
   * that need to bail without asserting.
   *
   * Bead: km-silvery.cls-instrumentation-primitive
   */
  cancelCLSCapture(): void

  /** Clear the terminal output */
  clear(): void

  // === Screenshot ===

  /** Render current buffer to PNG. Requires Playwright (lazy-loaded on first call). */
  screenshot(outputPath?: string): Promise<Buffer>

  // === Debug ===

  /** Print component tree to console */
  debug(): void

  // === Testing extras ===

  /** Render the current tree from scratch (no incremental buffer reuse).
   *  Returns the fresh buffer without updating incremental state.
   *  Only available in test renderer - throws otherwise. */
  freshRender(): TerminalBuffer

  /** Check if exit() was called */
  exitCalled(): boolean

  /** Get error passed to exit() */
  exitError(): Error | undefined

  /** Send raw stdin input (for sync test helpers; prefer app.press() for new code) */
  readonly stdin: { write: (data: string) => void }

  // === Internal/Legacy (kept for silvery test compatibility, not for external use) ===

  /** All rendered frames (internal) */
  readonly frames: string[]

  /** Get last frame with ANSI codes (internal - use app.ansi instead) */
  lastFrame(): string | undefined

  /** Get last buffer (internal - use app.term.buffer instead) */
  lastBuffer(): TerminalBuffer | undefined

  /** Get last frame as plain text (internal - use app.text instead) */
  lastFrameText(): string | undefined

  /** Get container root node (internal - use app.locator() instead) */
  getContainer(): AgNode

  // === Focus System ===

  /** Focus a node by testID */
  focus(testID: string): void

  /** Get the focus path from focused node to root (testID[]) */
  getFocusPath(): string[]

  /** Direct access to the FocusManager instance */
  readonly focusManager: FocusManager

  // === Cursor State ===

  /** Get the current cursor state for this silvery instance (per-instance, not global). */
  getCursorState(): import("@silvery/ag-react/hooks/useCursor").CursorState | null

  // === Debug (render-path / mount-tree) ===

  /**
   * Return the parent chain from the container root down to the first
   * AgNode whose component name matches `componentName`. Empty array if
   * not found. Useful for asserting structural invariants in tests and
   * for bead-investigation static traces ("does ToolBlock actually
   * render inside Content.Body[width=full]?").
   *
   * See `@silvery/ag-react/debug/render-path` for the underlying API.
   */
  renderPath(componentName: string): import("@silvery/ag-react/debug/render-path").RenderPathNode[]

  /**
   * Recursive JSON dump of the entire mount tree. Useful for snapshot
   * tests asserting on structural invariants.
   */
  mountTree(): import("@silvery/ag-react/debug/render-path").MountTree
}

/**
 * Options for creating an App instance
 */
export interface AppOptions {
  /** Function to get current container root */
  getContainer: () => AgNode

  /** Function to get current buffer */
  getBuffer: () => TerminalBuffer | null

  /** Function to send input */
  sendInput: (data: string) => void

  /** Function to rerender */
  rerender: (element: ReactNode) => void

  /** Function to unmount */
  unmount: () => void

  /** Function to wait for exit */
  waitUntilExit: () => Promise<void>

  /** Function to clear output */
  clear: () => void

  /** Function to check if exit was called */
  exitCalled?: () => boolean

  /** Function to get exit error */
  exitError?: () => Error | undefined

  /** Fresh render function (test renderer only) */
  freshRender?: () => TerminalBuffer

  /** Debug print function */
  debugFn?: () => void

  /** Captured frames array (internal) */
  frames?: string[]

  /**
   * Optional ClsMonitor instance. When provided, the App's
   * `beginCLSCapture` / `endCLSCapture` / `cancelCLSCapture` methods
   * delegate to it. The host harness is responsible for instantiating
   * the monitor AND calling `clsMonitor.onCommit(...)` on every render
   * commit so the monitor's session-shift buffer stays in sync with
   * the rendered tree (Option C consolidation: cls-monitor is the
   * single source of truth for layout-shift detection).
   *
   * Bead: @km/silvery/cls-instrumentation-primitive (Phase 9/11).
   */
  clsMonitor?: ClsMonitor

  /** Terminal dimensions */
  columns: number
  rows: number

  /** Use Kitty keyboard protocol encoding for press(). When true, press() uses keyToKittyAnsi. */
  kittyMode?: boolean

  /** Wrap a callback in act() + doRender() for the test renderer. Ensures React state updates from mouse handlers are flushed. */
  actAndRender?: (fn: () => void) => void

  /** Resize the virtual terminal (test renderer only). */
  resize?: (cols: number, rows: number) => void

  /** Focus manager instance for focus system */
  focusManager?: FocusManager

  /** Per-instance cursor state accessor */
  getCursorState?: () => import("@silvery/ag-react/hooks/useCursor").CursorState | null

  /**
   * Drain commit / layout cycles until stable (test renderer only).
   * See {@link App.waitForLayoutStable} for the contract.
   */
  waitForLayoutStable?: (opts?: { timeoutMs?: number; maxPasses?: number }) => Promise<void>
}

/**
 * Create an App instance
 */
export function buildApp(options: AppOptions): App {
  const {
    getContainer,
    getBuffer,
    sendInput,
    rerender,
    unmount,
    waitUntilExit,
    clear,
    exitCalled = () => false,
    exitError = () => undefined,
    freshRender: freshRenderFn,
    debugFn,
    frames = [],
    columns,
    rows,
    kittyMode = false,
    actAndRender,
    resize: resizeFn,
    focusManager: fm,
    waitForLayoutStable: waitForLayoutStableFn,
    clsMonitor,
  } = options

  // Create auto-refreshing locator factory
  const createLocator = () => createAutoLocator(getContainer)

  // Create bound terminal
  const getText = () => {
    const buffer = getBuffer()
    return buffer ? bufferToText(buffer) : ""
  }

  // Note: BoundTerm is created lazily since buffer may not exist initially
  let boundTerm: BoundTerm | null = null

  // Mouse event processor for click/doubleClick/wheel
  const mouseState = createMouseEventProcessor()

  // Screenshotter is created lazily on first screenshot() call
  let screenshotter: Screenshotter | null = null

  const app: App = {
    // === Content/Document Perspective ===

    get text(): string {
      return getText()
    },

    get ansi(): string {
      const buffer = getBuffer()
      return buffer ? bufferToStyledText(buffer) : ""
    },

    get lines(): string[] {
      return getText().split("\n")
    },

    get width(): number {
      return getBuffer()?.width ?? columns
    },

    get height(): number {
      return getBuffer()?.height ?? rows
    },

    cell(col: number, row: number): FrameCell {
      const buffer = getBuffer()
      if (!buffer) return EMPTY_FRAME_CELL as FrameCell
      return cellToFrameCell(buffer.getCell(col, row))
    },

    containsText(text: string): boolean {
      return getText().includes(text)
    },

    nodeAt(x: number, y: number): AgNode | null {
      const root = getContainer()
      return findNodeAtContentPosition(root, x, y)
    },

    getByTestId(id: string): AutoLocator {
      return createLocator().getByTestId(id)
    },

    getByText(text: string | RegExp): AutoLocator {
      return createLocator().getByText(text)
    },

    locator(selector: string): AutoLocator {
      return createLocator().locator(selector)
    },

    // === Actions ===

    press(key: string): ChainableApp {
      return makeChain(
        (async (): Promise<App> => {
          const hotkey = parseHotkey(key)
          updateKeyboardModifiers(mouseState, {
            super: hotkey.super,
            hyper: hotkey.hyper,
            eventType: "press",
          })
          const sequence = kittyMode ? keyToKittyAnsi(key) : keyToAnsi(key)
          sendInput(sequence)
          await Promise.resolve()
          return app
        })(),
      )
    },

    keyDown(key: string): ChainableApp {
      return makeChain(
        (async (): Promise<App> => {
          const hotkey = parseHotkey(key)
          updateKeyboardModifiers(mouseState, {
            super: hotkey.super || keyIsModifier(key, "Super"),
            hyper: hotkey.hyper || keyIsModifier(key, "Hyper"),
            eventType: "press",
          })
          const baseSeq = kittyMode ? keyToKittyAnsi(key) : keyToAnsi(key)
          sendInput(injectKittyEventType(baseSeq, 1))
          await Promise.resolve()
          return app
        })(),
      )
    },

    keyUp(key: string): ChainableApp {
      return makeChain(
        (async (): Promise<App> => {
          const hotkey = parseHotkey(key)
          updateKeyboardModifiers(mouseState, {
            super: false,
            hyper: false,
            eventType: "release",
          })
          const baseSeq = kittyMode ? keyToKittyAnsi(key) : keyToAnsi(key)
          sendInput(injectKittyEventType(baseSeq, 3))
          void hotkey
          await Promise.resolve()
          return app
        })(),
      )
    },

    pressSequence(...keys: string[]): ChainableApp {
      return makeChain(
        (async (): Promise<App> => {
          for (const key of keys) {
            await app.press(key)
          }
          return app
        })(),
      )
    },

    type(text: string): ChainableApp {
      return makeChain(
        (async (): Promise<App> => {
          for (const char of text) {
            sendInput(char)
          }
          await Promise.resolve()
          return app
        })(),
      )
    },

    click(
      x: number,
      y: number,
      options?: { button?: number; shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
    ): ChainableApp {
      return makeChain(
        (async (): Promise<App> => {
          const button = options?.button ?? 0
          // cmd is an alias for setting keyboard-tracked Super (Cmd on macOS)
          if (options?.cmd) mouseState.keyboardModifiers.super = true
          const doClick = () => {
            const parsed: ParsedMouse = {
              button,
              x,
              y,
              coordinateMode: "cell",
              action: "down",
              shift: options?.shift ?? false,
              meta: options?.meta ?? false,
              ctrl: options?.ctrl ?? false,
            }
            processMouseEvent(mouseState, parsed, getContainer())
            const upParsed: ParsedMouse = { ...parsed, action: "up" }
            processMouseEvent(mouseState, upParsed, getContainer())
          }
          if (actAndRender) {
            actAndRender(doClick)
          } else {
            doClick()
          }
          if (options?.cmd) mouseState.keyboardModifiers.super = false
          await Promise.resolve()
          return app
        })(),
      )
    },

    doubleClick(
      x: number,
      y: number,
      options?: { button?: number; shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
    ): ChainableApp {
      return makeChain(
        (async (): Promise<App> => {
          const button = options?.button ?? 0
          if (options?.cmd) mouseState.keyboardModifiers.super = true
          const doDblClick = () => {
            const baseParsed: ParsedMouse = {
              button,
              x,
              y,
              coordinateMode: "cell",
              action: "down",
              shift: options?.shift ?? false,
              meta: options?.meta ?? false,
              ctrl: options?.ctrl ?? false,
            }
            processMouseEvent(mouseState, baseParsed, getContainer())
            processMouseEvent(mouseState, { ...baseParsed, action: "up" }, getContainer())
            processMouseEvent(mouseState, baseParsed, getContainer())
            processMouseEvent(mouseState, { ...baseParsed, action: "up" }, getContainer())
          }
          if (actAndRender) {
            actAndRender(doDblClick)
          } else {
            doDblClick()
          }
          if (options?.cmd) mouseState.keyboardModifiers.super = false
          await Promise.resolve()
          return app
        })(),
      )
    },

    hover(
      x: number,
      y: number,
      options?: { shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
    ): ChainableApp {
      return makeChain(
        (async (): Promise<App> => {
          // cmd is an alias for setting keyboard-tracked Super (Cmd on macOS)
          // for the duration of the hover — same hack as click/doubleClick.
          // Bead: @km/silvery/hover-wheel-modifier-options-parity.
          if (options?.cmd) mouseState.keyboardModifiers.super = true
          const doHover = () => {
            const parsed: ParsedMouse = {
              button: 0,
              x,
              y,
              coordinateMode: "cell",
              action: "move",
              shift: options?.shift ?? false,
              meta: options?.meta ?? false,
              ctrl: options?.ctrl ?? false,
            }
            processMouseEvent(mouseState, parsed, getContainer())
          }
          if (actAndRender) {
            actAndRender(doHover)
          } else {
            doHover()
          }
          if (options?.cmd) mouseState.keyboardModifiers.super = false
          await Promise.resolve()
          return app
        })(),
      )
    },

    wheel(
      x: number,
      y: number,
      delta: number,
      options?: { shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
    ): ChainableApp {
      return makeChain(
        (async (): Promise<App> => {
          // Bead: @km/silvery/hover-wheel-modifier-options-parity.
          if (options?.cmd) mouseState.keyboardModifiers.super = true
          const doWheel = () => {
            const parsed: ParsedMouse = {
              button: 0,
              x,
              y,
              coordinateMode: "cell",
              action: "wheel",
              delta,
              shift: options?.shift ?? false,
              meta: options?.meta ?? false,
              ctrl: options?.ctrl ?? false,
            }
            processMouseEvent(mouseState, parsed, getContainer())
          }
          if (actAndRender) {
            actAndRender(doWheel)
          } else {
            doWheel()
          }
          if (options?.cmd) mouseState.keyboardModifiers.super = false
          await Promise.resolve()
          return app
        })(),
      )
    },

    resize(cols: number, rows: number): void {
      if (!resizeFn) {
        throw new Error("resize() is only available in test renderer")
      }
      resizeFn(cols, rows)
    },

    async run(): Promise<void> {
      return waitUntilExit()
    },

    // === Terminal Binding ===

    get term(): BoundTerm {
      const buffer = getBuffer()
      if (!buffer) {
        // Return a dummy bound term if no buffer yet
        const dummyBuffer = {
          width: columns,
          height: rows,
          getCell: () => ({
            char: " ",
            fg: null,
            bg: null,
            attrs: {},
            wide: false,
            continuation: false,
          }),
          setCell: () => {},
          clear: () => {},
          inBounds: () => false,
        } as unknown as TerminalBuffer
        return createBoundTerm(dummyBuffer, getContainer, getText)
      }
      if (!boundTerm || boundTerm.buffer !== buffer) {
        boundTerm = createBoundTerm(buffer, getContainer, getText)
      }
      return boundTerm
    },

    // === Screenshot ===

    async screenshot(outputPath?: string): Promise<Buffer> {
      const buffer = getBuffer()
      if (!buffer) {
        throw new Error("No buffer available for screenshot")
      }
      const html = bufferToHTML(buffer)
      if (!screenshotter) {
        screenshotter = createScreenshotter()
      }
      return screenshotter.capture(html, outputPath)
    },

    // === Lifecycle ===

    rerender,
    unmount() {
      // Close screenshotter if it was created
      if (screenshotter) {
        screenshotter.close().catch(() => {})
        screenshotter = null
      }
      unmount()
    },
    [Symbol.dispose]() {
      app.unmount()
    },
    waitUntilExit,
    waitForLayoutStable(opts?: { timeoutMs?: number; maxPasses?: number }): Promise<void> {
      if (!waitForLayoutStableFn) {
        return Promise.reject(
          new Error("waitForLayoutStable() is only available in the test renderer"),
        )
      }
      return waitForLayoutStableFn(opts)
    },

    // CLS capture delegates to the harness-provided ClsMonitor (Option C
    // consolidation 2026-05-13). The host harness (renderer.ts /
    // create-app.tsx) owns the monitor's lifecycle AND calls
    // `clsMonitor.onCommit(...)` on every render commit so its session-
    // shift buffer stays in sync with the rendered tree. Reading
    // `screenRect` (post-scroll, sticky-aware) — the only domain that
    // catches user-visible flicker (scroll-induced + sticky shifts).
    //
    // Bead: @km/silvery/cls-instrumentation-primitive.
    beginCLSCapture(classifier?: ReasonClassifier): void {
      if (!clsMonitor) {
        throw new Error(
          "beginCLSCapture: no ClsMonitor was provided to buildApp(). The render harness must instantiate `createClsMonitor()` and pass it via AppOptions.clsMonitor for CLS capture to work.",
        )
      }
      clsMonitor.beginCapture(classifier)
    },
    endCLSCapture(): CLSReport {
      if (!clsMonitor) {
        throw new Error(
          "endCLSCapture: no ClsMonitor was provided to buildApp().",
        )
      }
      // endCapture() applies SILVERY_STRICT=cls internally — throws
      // UnexpectedLayoutShiftError when tier 2 strict is active and the
      // window saw any "unexpected" shifts.
      return clsMonitor.endCapture()
    },
    cancelCLSCapture(): void {
      // Idempotent — safe to call even when no monitor is provided
      // (cleanup paths shouldn't fail loud when the App was built
      // without a monitor).
      clsMonitor?.cancelCapture()
    },

    clear,

    // === Debug ===

    debug(): void {
      if (debugFn) {
        debugFn()
      } else {
        console.log(app.text)
      }
    },

    // === Testing extras ===

    freshRender(): TerminalBuffer {
      if (!freshRenderFn) {
        throw new Error("freshRender() is only available in test renderer")
      }
      return freshRenderFn()
    },

    exitCalled,
    exitError,

    stdin: {
      write: sendInput,
    },

    // Internal/Legacy (kept for silvery test compatibility)
    frames,

    lastFrame(): string | undefined {
      return frames[frames.length - 1]
    },

    lastBuffer(): TerminalBuffer | undefined {
      return getBuffer() ?? undefined
    },

    lastFrameText(): string | undefined {
      const buffer = getBuffer()
      return buffer ? bufferToText(buffer) : undefined
    },

    getContainer(): AgNode {
      return getContainer()
    },

    // === Focus System ===

    focus(testID: string): void {
      if (fm) {
        const root = getContainer()
        fm.focusById(testID, root, "programmatic")
      }
    },

    getFocusPath(): string[] {
      if (fm) {
        const root = getContainer()
        return fm.getFocusPath(root)
      }
      return []
    },

    get focusManager(): FocusManager {
      if (!fm) {
        throw new Error("FocusManager not available — pass focusManager to buildApp()")
      }
      return fm
    },

    getCursorState() {
      // Layout-output cursor takes priority over the legacy store. After
      // Phase 2 of `km-silvery.view-as-layout-output`, TextArea / TextInput
      // declare cursor position as a Box prop (`cursorOffset`) which the
      // layout phase resolves into `LayoutSignals.cursorRect`. The store
      // remains as a fallback for Ink-compat consumers + the deprecated
      // `useCursor` hook.
      const root = getContainer()
      const layoutCursor = findActiveCursorRect(root)
      if (layoutCursor) {
        return {
          x: layoutCursor.x,
          y: layoutCursor.y,
          visible: layoutCursor.visible,
          shape: layoutCursor.shape,
        }
      }
      return options.getCursorState?.() ?? null
    },

    renderPath(componentName) {
      return getRenderPath(getContainer(), componentName)
    },

    mountTree() {
      return getMountTree(getContainer())
    },
  }

  return app
}

/**
 * Wrap a `Promise<App>` in a `ChainableApp` — a thenable that exposes
 * the action methods so consumers can compose without explicit `await`
 * between every step:
 *
 *   await app.keyDown("Super").hover(x, y).keyUp("Super")
 *
 * Each chained method returns a new `ChainableApp` whose backing promise
 * `.then`s into the previous step + the new action. The terminal `await`
 * resolves the entire chain to the underlying `App`.
 *
 * Bead: @km/silvery/fluent-chain-actions.
 */
function makeChain(p: Promise<App>): ChainableApp {
  return {
    press: (key) => makeChain(p.then((a) => a.press(key))),
    keyDown: (key) => makeChain(p.then((a) => a.keyDown(key))),
    keyUp: (key) => makeChain(p.then((a) => a.keyUp(key))),
    pressSequence: (...keys) => makeChain(p.then((a) => a.pressSequence(...keys))),
    type: (text) => makeChain(p.then((a) => a.type(text))),
    click: (x, y, options) => makeChain(p.then((a) => a.click(x, y, options))),
    doubleClick: (x, y, options) => makeChain(p.then((a) => a.doubleClick(x, y, options))),
    hover: (x, y, options) => makeChain(p.then((a) => a.hover(x, y, options))),
    wheel: (x, y, delta, options) => makeChain(p.then((a) => a.wheel(x, y, delta, options))),
    then: (onFulfilled, onRejected) => p.then(onFulfilled, onRejected),
  }
}

/**
 * Inject a Kitty CSI u event-type byte (`:1` press, `:2` repeat, `:3`
 * release) before the trailing terminator (`u`, `~`, or a CSI letter)
 * of a Kitty key sequence. Used by `keyDown`/`keyUp` to express held
 * vs. transient state — `keyToKittyAnsi` returns the bare-press shape
 * (no event-type byte), which the parser interprets as "press" by
 * default; explicit `:1`/`:3` lets tests drive paired down/up events.
 *
 * Examples:
 *
 *   `\x1b[57444;9u`   → `\x1b[57444;9:1u`   (left-super press)
 *   `\x1b[57444;9u`   → `\x1b[57444;9:3u`   (left-super release)
 *   `\x1b[1;5A`       → `\x1b[1;5:1A`       (Ctrl+ArrowUp press)
 *   `\x1b[3;5~`       → `\x1b[3;5:1~`       (Ctrl+Delete press)
 *
 * Sequences without a modifier byte (`\x1b[CPu`) get a `;1:eventType`
 * insert: `\x1b[57444u` → `\x1b[57444;1:1u`. The base modifier is `1`
 * (no modifiers + 1 base) per the Kitty spec.
 *
 * Bead: @km/silvery/keydown-keyup-test-primitives.
 */
function injectKittyEventType(seq: string, eventType: 1 | 2 | 3): string {
  // Match the trailing CSI terminator: `u`, `~`, or a single letter A-Z.
  // The byte before the terminator may be a digit (modifier) or the
  // codepoint itself when no modifier is present.
  // Case 1: trailing `;MOD{terminator}` → insert `:eventType` before terminator.
  const withMod = seq.replace(/(;[0-9]+)([A-Za-z~])$/, `$1:${eventType}$2`)
  if (withMod !== seq) return withMod
  // Case 2: trailing `[CP{terminator}` (no modifier byte) → insert `;1:eventType`.
  return seq.replace(/^(\x1b\[[0-9]+)([A-Za-z~])$/, `$1;1:${eventType}$2`)
}

/**
 * Detect whether a key string represents a specific bare modifier
 * (e.g., `keyIsModifier("Super", "Super")` → true,
 * `keyIsModifier("leftsuper", "Super")` → true,
 * `keyIsModifier("a", "Super")` → false). Used by `keyDown`/`keyUp`
 * to update `mouseState.keyboardModifiers` even when the caller passes
 * a bare modifier name like "Super" rather than a chord like
 * "Super+a". `parseHotkey` only sets `.super` when the key is a chord
 * with Super as a modifier; it doesn't set it for the bare modifier
 * name itself.
 *
 * Bead: @km/silvery/keydown-keyup-test-primitives.
 */
function keyIsModifier(key: string, target: "Super" | "Hyper"): boolean {
  // Strip any +-prefixed modifiers; we only look at the trailing key.
  const parts = key.split("+")
  const last = parts[parts.length - 1]?.toLowerCase() ?? ""
  if (target === "Super") {
    return (
      last === "super" ||
      last === "cmd" ||
      last === "command" ||
      last === "leftsuper" ||
      last === "rightsuper"
    )
  }
  return last === "hyper" || last === "lefthyper" || last === "righthyper"
}

/**
 * Find node at content coordinates (not screen coordinates)
 */
function findNodeAtContentPosition(node: AgNode, x: number, y: number): AgNode | null {
  const rect = node.boxRect
  if (!rect) return null

  if (!pointInRect(x, y, rect)) {
    return null
  }

  for (const child of node.children) {
    const found = findNodeAtContentPosition(child, x, y)
    if (found) return found
  }

  return node
}
