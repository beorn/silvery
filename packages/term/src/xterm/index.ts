/**
 * xterm.js Entry Point
 *
 * Provides a browser-friendly API for rendering silvery components to xterm.js terminals.
 * This module sets up the terminal adapter and writes ANSI output to an xterm.js Terminal.
 *
 * The terminal adapter produces ANSI diff strings via `flush()`. xterm.js accepts ANSI
 * via `term.write()`. This entry point bridges the two.
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
 * renderToXterm(<App />, term);
 * ```
 */

import type { ReactElement } from "react"
import { createFlexilyZeroEngine } from "../adapters/flexily-zero-adapter"
import { terminalAdapter } from "../adapters/terminal-adapter"
import { setLayoutEngine } from "../layout-engine"
import { executeRenderAdapter } from "../pipeline"
import { createContainer, createFiberRoot, getContainerRoot, reconciler } from "@silvery/react/reconciler"
import type { RenderBuffer } from "../render-adapter"
import { setRenderAdapter } from "../render-adapter"

// Re-export components and hooks for convenience
export { Box, type BoxProps } from "@silvery/react/components/Box"
export { Text, type TextProps } from "@silvery/react/components/Text"
export { Divider, type DividerProps } from "@silvery/ui/components/Divider"
export { useContentRect, useScreenRect } from "@silvery/react/hooks/useLayout"
export { useApp } from "@silvery/react/hooks/useApp"

// Re-export adapter utilities
export { terminalAdapter } from "../adapters/terminal-adapter"

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
   * - `true` — enable mouse tracking and parse onData, but no callbacks
   * - `{ onKey, onMouse, onFocus }` — enable with callbacks
   * - `false` — disable (caller handles input manually)
   *
   * Default: `false` (backwards compatible)
   */
  input?: boolean | XtermInputOptions
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

// Mouse tracking: Normal mode + SGR extended mode
const MOUSE_ENABLE = "\x1b[?1000h\x1b[?1006h"
const MOUSE_DISABLE = "\x1b[?1000l\x1b[?1006l"

// SGR mouse sequence regex: \x1b[<btn;x;yM (press) or \x1b[<btn;x;ym (release)
const SGR_MOUSE_RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/

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
// Render Functions
// ============================================================================

/**
 * Render a React element to an xterm.js terminal.
 *
 * Uses the terminal adapter to produce ANSI diff strings, then writes them
 * to the terminal via `term.write()`.
 *
 * @param element - React element to render
 * @param terminal - xterm.js Terminal (or any object with write/cols/rows)
 * @param options - Render options (cols, rows overrides)
 * @returns XtermInstance for controlling the render
 *
 * @example
 * ```tsx
 * const term = new Terminal({ cols: 80, rows: 24 });
 * term.open(container);
 *
 * const instance = renderToXterm(<App />, term);
 *
 * // Later: update the component
 * instance.rerender(<App newProps />);
 *
 * // Clean up
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
    reconciler.updateContainerSync(currentElement, fiberRoot, null, null)
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

  // ---- Input wiring ----
  const disposables: Array<{ dispose(): void }> = []
  const inputOpts = options.input
  const inputEnabled = inputOpts === true || (typeof inputOpts === "object" && inputOpts !== null)
  const inputCallbacks: XtermInputOptions = typeof inputOpts === "object" && inputOpts !== null ? inputOpts : {}

  if (inputEnabled) {
    // Enable SGR mouse tracking
    terminal.write(MOUSE_ENABLE)

    // Wire onData: parse mouse sequences, forward keyboard input
    if (terminal.onData) {
      const dataDisposable = terminal.onData((data: string) => {
        const mouseMatch = data.match(SGR_MOUSE_RE)
        if (mouseMatch) {
          const btn = parseInt(mouseMatch[1]!, 10)
          const x = parseInt(mouseMatch[2]!, 10) - 1 // 1-indexed → 0-indexed
          const y = parseInt(mouseMatch[3]!, 10) - 1
          const isPress = mouseMatch[4] === "M"
          if (isPress && btn <= 2) {
            inputCallbacks.onMouse?.({ x, y, button: btn })
          }
          return
        }
        inputCallbacks.onKey?.(data)
      })
      disposables.push(dataDisposable)
    }

    // Wire focus/blur tracking
    if (terminal.textarea && inputCallbacks.onFocus) {
      const textarea = terminal.textarea
      const onFocus = () => inputCallbacks.onFocus!(true)
      const onBlur = () => inputCallbacks.onFocus!(false)
      textarea.addEventListener("focus", onFocus)
      textarea.addEventListener("blur", onBlur)
      disposables.push({
        dispose() {
          textarea.removeEventListener("focus", onFocus)
          textarea.removeEventListener("blur", onBlur)
        },
      })
    }
  }

  const unmount = (): void => {
    unmounted = true
    // Clean up input wiring
    for (const d of disposables) d.dispose()
    disposables.length = 0
    if (inputEnabled) {
      terminal.write(MOUSE_DISABLE)
    }
    // Synchronous unmount ensures useEffect cleanups (e.g. clearInterval) run
    // before returning, preventing stale renders to the same terminal.
    reconciler.updateContainerSync(null, fiberRoot, null, null)
    reconciler.flushSyncWork()
    // Show cursor on unmount
    terminal.write(CURSOR_SHOW)
  }

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
      scheduleRender()
    },
  }
}
