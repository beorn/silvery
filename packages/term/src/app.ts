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
import { bufferToHTML, bufferToStyledText, bufferToText } from "./buffer"
import { type Screenshotter, createScreenshotter } from "./screenshot"
import { keyToAnsi, keyToKittyAnsi, parseHotkey } from "@silvery/tea/keys"
import { updateKeyboardModifiers } from "./mouse-events"
import type { ParsedMouse } from "./mouse"
import { createMouseEventProcessor, processMouseEvent } from "./mouse-events"
import type { FocusManager } from "@silvery/tea/focus-manager"
import { pointInRect } from "@silvery/tea/tree-utils"
import type { TeaNode } from "@silvery/tea/types"

/**
 * App interface - unified return type from render()
 */
export interface App {
  // === Content/Document Perspective ===

  /** Full rendered text (no ANSI codes) */
  readonly text: string

  /** Full rendered text with ANSI styling */
  readonly ansi: string

  /** Get node at content coordinates */
  nodeAt(x: number, y: number): TeaNode | null

  /** Get locator by testID attribute */
  getByTestId(id: string): AutoLocator

  /** Get locator by text content */
  getByText(text: string | RegExp): AutoLocator

  /** Get locator by CSS-style selector */
  locator(selector: string): AutoLocator

  // === Actions (return this for chaining) ===

  /** Send a key press (uses keyToAnsi internally) */
  press(key: string): Promise<this>

  /** Send multiple key presses */
  pressSequence(...keys: string[]): Promise<this>

  /** Type text input */
  type(text: string): Promise<this>

  /** Simulate a mouse click at (x, y) terminal coordinates */
  click(
    x: number,
    y: number,
    options?: { button?: number; shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
  ): Promise<this>

  /** Simulate a double-click at (x, y) terminal coordinates */
  doubleClick(
    x: number,
    y: number,
    options?: { button?: number; shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
  ): Promise<this>

  /** Simulate a mouse move/hover at (x, y) terminal coordinates */
  hover(x: number, y: number): Promise<this>

  /** Simulate a mouse wheel event at (x, y) with delta (-1=up, +1=down) */
  wheel(x: number, y: number, delta: number): Promise<this>

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
  getContainer(): TeaNode

  // === Focus System ===

  /** Focus a node by testID */
  focus(testID: string): void

  /** Get the focus path from focused node to root (testID[]) */
  getFocusPath(): string[]

  /** Direct access to the FocusManager instance */
  readonly focusManager: FocusManager

  // === Cursor State ===

  /** Get the current cursor state for this silvery instance (per-instance, not global). */
  getCursorState(): import("@silvery/react/hooks/useCursor").CursorState | null
}

/**
 * Options for creating an App instance
 */
export interface AppOptions {
  /** Function to get current container root */
  getContainer: () => TeaNode

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
  getCursorState?: () => import("@silvery/react/hooks/useCursor").CursorState | null
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

    nodeAt(x: number, y: number): TeaNode | null {
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

    async press(key: string): Promise<App> {
      // Update keyboard modifier state so subsequent mouse events have accurate metaKey etc.
      const hotkey = parseHotkey(key)
      updateKeyboardModifiers(mouseState, {
        super: hotkey.super,
        hyper: hotkey.hyper,
        eventType: "press",
      })
      const sequence = kittyMode ? keyToKittyAnsi(key) : keyToAnsi(key)
      sendInput(sequence)
      // Allow microtask to flush for test synchronization
      await Promise.resolve()
      return app
    },

    async pressSequence(...keys: string[]): Promise<App> {
      for (const key of keys) {
        await app.press(key)
      }
      return app
    },

    async type(text: string): Promise<App> {
      for (const char of text) {
        sendInput(char)
      }
      await Promise.resolve()
      return app
    },

    async click(
      x: number,
      y: number,
      options?: { button?: number; shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
    ): Promise<App> {
      const button = options?.button ?? 0
      // cmd is an alias for setting keyboard-tracked Super (Cmd on macOS)
      if (options?.cmd) mouseState.keyboardModifiers.super = true
      const doClick = () => {
        const parsed: ParsedMouse = {
          button,
          x,
          y,
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
      // Reset keyboard modifier override after click
      if (options?.cmd) mouseState.keyboardModifiers.super = false
      await Promise.resolve()
      return app
    },

    async doubleClick(
      x: number,
      y: number,
      options?: { button?: number; shift?: boolean; meta?: boolean; ctrl?: boolean; cmd?: boolean },
    ): Promise<App> {
      const button = options?.button ?? 0
      if (options?.cmd) mouseState.keyboardModifiers.super = true
      const doDblClick = () => {
        const baseParsed: ParsedMouse = {
          button,
          x,
          y,
          action: "down",
          shift: options?.shift ?? false,
          meta: options?.meta ?? false,
          ctrl: options?.ctrl ?? false,
        }
        // First click
        processMouseEvent(mouseState, baseParsed, getContainer())
        processMouseEvent(mouseState, { ...baseParsed, action: "up" }, getContainer())
        // Second click (triggers double-click detection)
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
    },

    async hover(x: number, y: number): Promise<App> {
      const doHover = () => {
        const parsed: ParsedMouse = {
          button: 0,
          x,
          y,
          action: "move",
          shift: false,
          meta: false,
          ctrl: false,
        }
        processMouseEvent(mouseState, parsed, getContainer())
      }
      if (actAndRender) {
        actAndRender(doHover)
      } else {
        doHover()
      }
      await Promise.resolve()
      return app
    },

    async wheel(x: number, y: number, delta: number): Promise<App> {
      const doWheel = () => {
        const parsed: ParsedMouse = {
          button: 0,
          x,
          y,
          action: "wheel",
          delta,
          shift: false,
          meta: false,
          ctrl: false,
        }
        processMouseEvent(mouseState, parsed, getContainer())
      }
      if (actAndRender) {
        actAndRender(doWheel)
      } else {
        doWheel()
      }
      await Promise.resolve()
      return app
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

    getContainer(): TeaNode {
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
      return options.getCursorState?.() ?? null
    },
  }

  return app
}

/**
 * Find node at content coordinates (not screen coordinates)
 */
function findNodeAtContentPosition(node: TeaNode, x: number, y: number): TeaNode | null {
  const rect = node.contentRect
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
