/**
 * xterm.js Entry Point
 *
 * Provides a browser-friendly API for rendering inkx components to xterm.js terminals.
 * This module sets up the terminal adapter and writes ANSI output to an xterm.js Terminal.
 *
 * The terminal adapter produces ANSI diff strings via `flush()`. xterm.js accepts ANSI
 * via `term.write()`. This entry point bridges the two.
 *
 * @example
 * ```tsx
 * import { Terminal } from "@xterm/xterm"
 * import { renderToXterm, Box, Text, useContentRect } from '@hightea/term/xterm';
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
import { createFlextureZeroEngine } from "../adapters/flexture-zero-adapter.js"
import { terminalAdapter } from "../adapters/terminal-adapter.js"
import { setLayoutEngine } from "../layout-engine.js"
import { executeRenderAdapter } from "../pipeline/index.js"
import { createContainer, createFiberRoot, getContainerRoot, reconciler } from "../reconciler.js"
import type { RenderBuffer } from "../render-adapter.js"
import { setRenderAdapter } from "../render-adapter.js"

// Re-export components and hooks for convenience
export { Box, type BoxProps } from "../components/Box.js"
export { Text, type TextProps } from "../components/Text.js"
export { Divider, type DividerProps } from "../components/Divider.js"
export { useContentRect, useScreenRect } from "../hooks/useLayout.js"
export { useApp } from "../hooks/useApp.js"

// Re-export adapter utilities
export { terminalAdapter } from "../adapters/terminal-adapter.js"

// ============================================================================
// Types
// ============================================================================

/** Duck-typed xterm.js Terminal interface — only the methods we need */
export interface XtermTerminal {
  write(data: string): void
  readonly cols: number
  readonly rows: number
}

export interface XtermRenderOptions {
  /** Width in columns (default: terminal.cols) */
  cols?: number
  /** Height in rows (default: terminal.rows) */
  rows?: number
  /** Called when the terminal is resized via fitAddon.fit() or resize() */
  onResize?: (cols: number, rows: number) => void
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

  setLayoutEngine(createFlextureZeroEngine())
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

  const unmount = (): void => {
    unmounted = true
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
