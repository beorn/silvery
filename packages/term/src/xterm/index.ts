/**
 * xterm.js Entry Point
 *
 * Provides a browser-friendly API for rendering silvery components to xterm.js terminals.
 * This module sets up the terminal adapter and writes ANSI output to an xterm.js Terminal.
 *
 * The terminal adapter produces ANSI diff strings via `flush()`. xterm.js accepts ANSI
 * via `term.write()`. This entry point bridges the two.
 *
 * `renderToXterm()` renders silvery components to xterm.js with full runtime support:
 * useInput, focus management, and mouse events all work out of the box when
 * `input: true` (or input callbacks) is provided.
 *
 * @example
 * ```tsx
 * import { Terminal } from "@xterm/xterm"
 * import { renderToXterm, Box, Text, useContentRect } from '@silvery/term/xterm';
 *
 * function App() {
 *   const { width, height } = useContentRect();
 *   return (
 *     <Box flexDirection="column">
 *       <Text>Terminal size: {width} cols x {height} rows</Text>
 *     </Box>
 *   );
 * }
 *
 * const term = new Terminal({ cols: 80, rows: 24 });
 * term.open(document.getElementById('terminal')!);
 * renderToXterm(<App />, term, { input: true });
 * ```
 */

import React, { type ReactElement } from "react"
import { createFlexilyZeroEngine } from "../adapters/flexily-zero-adapter"
import { terminalAdapter } from "../adapters/terminal-adapter"
import { setLayoutEngine } from "../layout-engine"
import { executeRenderAdapter } from "../pipeline"
import {
  createContainer,
  createFiberRoot,
  getContainerRoot,
  reconciler,
  runWithDiscreteEvent,
} from "@silvery/react/reconciler"
import type { RenderBuffer } from "../render-adapter"
import { setRenderAdapter } from "../render-adapter"
import { RuntimeContext, FocusManagerContext, type RuntimeContextValue } from "@silvery/react/context"
import { createFocusManager } from "@silvery/tea/focus-manager"
import { parseKey, splitRawInput } from "@silvery/tea/keys"
import { parseBracketedPaste } from "../bracketed-paste"
import { createXtermProvider, type XtermProvider } from "./xterm-provider"

// Re-export components and hooks for convenience
export { Box, type BoxProps } from "@silvery/react/components/Box"
export { Text, type TextProps } from "@silvery/react/components/Text"
export { Divider, type DividerProps } from "@silvery/ui/components/Divider"
export { useContentRect, useScreenRect } from "@silvery/react/hooks/useLayout"
export { useApp } from "@silvery/react/hooks/useApp"
export { useInput, type Key, type InputHandler, type UseInputOptions } from "@silvery/react/hooks/useInput"

// Re-export adapter utilities
export { terminalAdapter } from "../adapters/terminal-adapter"

// Re-export provider for advanced usage
export { createXtermProvider, type XtermProvider } from "./xterm-provider"

// ============================================================================
// Types
// ============================================================================

/** Duck-typed xterm.js Terminal interface — only the methods we need */
export interface XtermTerminal {
  write(data: string): void
  readonly cols: number
  readonly rows: number
  /** Subscribe to terminal data (keyboard + mouse sequences). Required for input wiring. */
  onData?: (callback: (data: string) => void) => { dispose(): void }
  /** The hidden textarea xterm.js uses for focus. Required for focus tracking. */
  textarea?: HTMLTextAreaElement | null
}

/** Mouse event info passed to onMouse callback */
export interface XtermMouseInfo {
  /** 0-indexed column */
  x: number
  /** 0-indexed row */
  y: number
  /** Mouse button (0=left, 1=middle, 2=right) */
  button: number
}

/** Input handling options for renderToXterm */
export interface XtermInputOptions {
  /** Called on keyboard input (raw terminal data, after mouse sequences are filtered out) */
  onKey?: (data: string) => void
  /** Called on mouse press (SGR mode). Receives 0-indexed coordinates and button. */
  onMouse?: (info: XtermMouseInfo) => void
  /** Called when the terminal gains or loses focus */
  onFocus?: (focused: boolean) => void
}

export interface XtermRenderOptions {
  /** Width in columns (default: terminal.cols) */
  cols?: number
  /** Height in rows (default: terminal.rows) */
  rows?: number
  /** Called when the terminal is resized via fitAddon.fit() or resize() */
  onResize?: (cols: number, rows: number) => void
  /**
   * Enable automatic input handling (keyboard, mouse, focus).
   *
   * When enabled, `useInput()` and focus management work inside rendered components.
   *
   * - `true` — enable mouse tracking and parse onData, but no callbacks
   * - `{ onKey, onMouse, onFocus }` — enable with callbacks
   * - `false` — disable (caller handles input manually)
   *
   * Default: `false` (backwards compatible)
   */
  input?: boolean | XtermInputOptions
  /**
   * Exit on Ctrl+C (default: true when input is enabled).
   * When true, Ctrl+C will trigger the exit callback.
   */
  exitOnCtrlC?: boolean
  /**
   * Handle Tab/Shift+Tab/Escape focus cycling (default: true when input is enabled).
   */
  handleFocusCycling?: boolean
}

export interface XtermInstance {
  /** Re-render with a new element */
  rerender: (element: ReactElement) => void
  /** Unmount and clean up */
  unmount: () => void
  /** Dispose (alias for unmount) — enables `using` */
  [Symbol.dispose](): void
  /** Force a re-render */
  refresh: () => void
  /** Resize the terminal and re-render. Overrides dynamic terminal.cols/rows. */
  resize: (cols: number, rows: number) => void
}

// ============================================================================
// ANSI Escape Sequences
// ============================================================================

const CURSOR_HIDE = "\x1b[?25l"
const CURSOR_SHOW = "\x1b[?25h"
const CURSOR_HOME = "\x1b[H"
const CLEAR_SCREEN = "\x1b[2J"

// ============================================================================
// Initialization
// ============================================================================

let initialized = false

function initXtermRenderer(): void {
  if (initialized) return

  setLayoutEngine(createFlexilyZeroEngine())
  setRenderAdapter(terminalAdapter)

  initialized = true
}

// ============================================================================
// Input handler type for subscriber list
// ============================================================================

type InputEventHandler = (input: string, key: import("@silvery/tea/keys").Key) => void
type PasteEventHandler = (text: string) => void

// ============================================================================
// Render Functions
// ============================================================================

/**
 * Render a React element to an xterm.js terminal.
 *
 * Uses the terminal adapter to produce ANSI diff strings, then writes them
 * to the terminal via `term.write()`.
 *
 * When `input` is enabled, provides full runtime support:
 * - `useInput()` works for keyboard input handling
 * - Focus management (Tab/Shift+Tab/Escape cycling)
 * - Mouse events via SGR protocol
 * - Paste detection via bracketed paste sequences
 *
 * @param element - React element to render
 * @param terminal - xterm.js Terminal (or any object with write/cols/rows)
 * @param options - Render options (cols, rows overrides, input handling)
 * @returns XtermInstance for controlling the render
 *
 * @example
 * ```tsx
 * const term = new Terminal({ cols: 80, rows: 24 });
 * term.open(container);
 *
 * // With useInput support
 * const instance = renderToXterm(<App />, term, { input: true });
 *
 * // With callbacks
 * const instance = renderToXterm(<App />, term, {
 *   input: {
 *     onKey: (data) => console.log('key:', data),
 *     onMouse: ({ x, y }) => console.log('click:', x, y),
 *   },
 * });
 *
 * instance.unmount();
 * ```
 */
export function renderToXterm(
  element: ReactElement,
  terminal: XtermTerminal,
  options: XtermRenderOptions = {},
): XtermInstance {
  initXtermRenderer()

  // If cols/rows were explicitly provided, use those (fixed size).
  // Otherwise, read from terminal.cols/rows at render time (dynamic).
  const fixedCols = options.cols ?? null
  const fixedRows = options.rows ?? null
  let overrideCols: number | null = null
  let overrideRows: number | null = null

  function getCols(): number {
    return overrideCols ?? fixedCols ?? terminal.cols
  }
  function getRows(): number {
    return overrideRows ?? fixedRows ?? terminal.rows
  }

  const container = createContainer(() => {
    scheduleRender()
  })

  const root = getContainerRoot(container)
  const fiberRoot = createFiberRoot(container)

  let currentBuffer: RenderBuffer | null = null
  let currentElement: ReactElement = element
  let renderScheduled = false
  let unmounted = false

  // ---- Input / Runtime setup ----
  const inputOpts = options.input
  const inputEnabled = inputOpts === true || (typeof inputOpts === "object" && inputOpts !== null)
  const inputCallbacks: XtermInputOptions = typeof inputOpts === "object" && inputOpts !== null ? inputOpts : {}
  const exitOnCtrlC = options.exitOnCtrlC ?? inputEnabled
  const handleFocusCycling = options.handleFocusCycling ?? inputEnabled

  // Create xterm provider for input handling (only when input is enabled)
  let provider: XtermProvider | null = null
  let focusManager: ReturnType<typeof createFocusManager> | null = null
  let runtimeContextValue: RuntimeContextValue | null = null

  // Subscriber lists for RuntimeContext (no EventEmitter)
  const inputHandlers = new Set<InputEventHandler>()
  const pasteHandlers = new Set<PasteEventHandler>()

  // Exit handler — uses doUnmount() indirection to avoid referencing
  // the `unmount` const before it's declared.
  let doUnmount: () => void = () => {}
  const handleExit = (error?: Error) => {
    doUnmount()
  }

  if (inputEnabled) {
    provider = createXtermProvider(terminal)
    focusManager = createFocusManager()

    // Wire provider input to RuntimeContext subscribers + user callbacks
    provider.onInput((chunk: string) => {
      if (unmounted) return

      // Check for bracketed paste
      const pasteResult = parseBracketedPaste(chunk)
      if (pasteResult) {
        for (const handler of pasteHandlers) {
          handler(pasteResult.content)
        }
        return
      }

      // Split and process individual keys
      for (const keypress of splitRawInput(chunk)) {
        processKey(keypress)
      }
    })

    // Wire mouse events to user callback
    if (inputCallbacks.onMouse) {
      const onMouse = inputCallbacks.onMouse
      provider.onMouse((info) => {
        if (info.type === "press" && info.button <= 2) {
          onMouse({ x: info.x, y: info.y, button: info.button })
        }
      })
    }

    // Wire focus events to user callback
    if (inputCallbacks.onFocus) {
      provider.onFocus(inputCallbacks.onFocus)
    }

    // Enable SGR mouse tracking
    provider.enableMouse()

    // Process a single keypress — handles Ctrl+C, focus cycling, then dispatches
    function processKey(rawKey: string): void {
      // Handle Ctrl+C
      if (rawKey === "\x03" && exitOnCtrlC) {
        handleExit()
        return
      }

      // Focus cycling (Tab/Shift+Tab/Escape)
      if (handleFocusCycling && focusManager) {
        const treeRoot = getContainerRoot(container)
        if (treeRoot) {
          const [, key] = parseKey(rawKey)
          if (key.tab && !key.shift) {
            focusManager.focusNext(treeRoot)
            reconciler.flushSyncWork()
            return
          }
          if (key.tab && key.shift) {
            focusManager.focusPrev(treeRoot)
            reconciler.flushSyncWork()
            return
          }
          if (key.escape && focusManager.activeElement) {
            focusManager.blur()
            reconciler.flushSyncWork()
            return
          }
        }
      }

      // Parse and dispatch to RuntimeContext subscribers
      const [input, key] = parseKey(rawKey)
      runWithDiscreteEvent(() => {
        for (const handler of inputHandlers) {
          handler(input, key)
        }
      })
      reconciler.flushSyncWork()

      // Also call user callback
      inputCallbacks.onKey?.(rawKey)
    }

    // Build RuntimeContext value
    runtimeContextValue = {
      on(event, handler) {
        if (event === "input") {
          const typed = handler as InputEventHandler
          inputHandlers.add(typed)
          return () => {
            inputHandlers.delete(typed)
          }
        }
        if (event === "paste") {
          const typed = handler as unknown as PasteEventHandler
          pasteHandlers.add(typed)
          return () => {
            pasteHandlers.delete(typed)
          }
        }
        return () => {} // Unknown event — no-op cleanup
      },
      emit() {
        // renderToXterm doesn't support view → runtime events
      },
      exit: handleExit,
    }
  }

  // Wrap element with context providers when input is enabled
  function wrapElement(el: ReactElement): ReactElement {
    if (!inputEnabled || !runtimeContextValue || !focusManager) return el
    return React.createElement(
      FocusManagerContext.Provider,
      { value: focusManager },
      React.createElement(RuntimeContext.Provider, { value: runtimeContextValue }, el),
    )
  }

  function scheduleRender(): void {
    if (renderScheduled || unmounted) return
    renderScheduled = true

    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => {
        renderScheduled = false
        doRender()
      })
    } else {
      setTimeout(() => {
        renderScheduled = false
        doRender()
      }, 0)
    }
  }

  function doRender(): void {
    if (unmounted) return
    reconciler.updateContainerSync(wrapElement(currentElement), fiberRoot, null, null)
    reconciler.flushSyncWork()

    const prevBuffer = currentBuffer
    const result = executeRenderAdapter(root, getCols(), getRows(), prevBuffer)
    currentBuffer = result.buffer

    // The terminal adapter's flush() returns ANSI diff strings
    if (typeof result.output === "string" && result.output.length > 0) {
      terminal.write(result.output)
    }
  }

  // Initial render: hide cursor, clear screen, move to home, then render
  terminal.write(CURSOR_HIDE + CURSOR_HOME + CLEAR_SCREEN)
  doRender()
  // Second pass picks up layout feedback (useContentRect dimensions).
  // Without this, the first frame shows zeros because forceUpdate() is
  // deferred to requestAnimationFrame, which may not fire in iframes.
  doRender()

  const unmount = (): void => {
    if (unmounted) return
    unmounted = true

    // Clean up provider (input wiring, mouse tracking)
    if (provider) {
      provider.disableMouse()
      provider.dispose()
    }
    // Synchronous unmount ensures useEffect cleanups (e.g. clearInterval) run
    // before returning, preventing stale renders to the same terminal.
    reconciler.updateContainerSync(null, fiberRoot, null, null)
    reconciler.flushSyncWork()
    // Clean up subscriber lists
    inputHandlers.clear()
    pasteHandlers.clear()
    // Show cursor on unmount
    terminal.write(CURSOR_SHOW)
  }
  doUnmount = unmount

  return {
    rerender(newElement: ReactElement): void {
      currentElement = newElement
      scheduleRender()
    },

    unmount,
    [Symbol.dispose]: unmount,

    refresh(): void {
      scheduleRender()
    },

    resize(cols: number, rows: number): void {
      overrideCols = cols
      overrideRows = rows
      // Clear the buffer so next render does a full repaint at the new size
      currentBuffer = null
      terminal.write(CURSOR_HOME + CLEAR_SCREEN)
      options.onResize?.(cols, rows)
      // Two passes: first pass calculates layout at new size and notifies
      // useContentRect subscribers, second pass picks up the updated values.
      // Without this, resize causes a flash of stale dimensions.
      renderScheduled = false
      doRender()
      doRender()
    },
  }
}
