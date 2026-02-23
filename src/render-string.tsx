/**
 * renderString - Static one-shot rendering to string
 *
 * Renders a React element to a string without needing a terminal.
 * Use for:
 * - CI output (no cursor control needed)
 * - Piped output
 * - One-shot reports/summaries
 * - Testing component output
 *
 * @example
 * ```tsx
 * import { renderString, Box, Text } from 'inkx'
 *
 * // Basic usage
 * const output = renderString(<Summary stats={stats} />)
 * console.log(output)
 *
 * // Custom width
 * const wide = renderString(<Report />, { width: 120 })
 *
 * // Plain text (no ANSI)
 * const plain = renderString(<Report />, { plain: true })
 * ```
 */

import React, { type ReactElement, act } from "react"

import { createTerm } from "chalkx"

import { bufferToStyledText, bufferToText, type TerminalBuffer } from "./buffer.js"
import { AppContext, StdoutContext, TermContext } from "./context.js"
import { isLayoutEngineInitialized } from "./layout-engine.js"
import { executeRender } from "./pipeline.js"
import { createContainer, createFiberRoot, getContainerRoot, reconciler } from "./reconciler.js"

// ============================================================================
// Types
// ============================================================================

/**
 * Options for renderString().
 */
export interface RenderStringOptions {
  /**
   * Width in columns for layout calculations.
   * Default: 80
   */
  width?: number

  /**
   * Height in rows for layout calculations.
   * Default: 24
   */
  height?: number

  /**
   * Strip ANSI codes for plain text output.
   * Default: false (includes ANSI styling)
   */
  plain?: boolean
}

// ============================================================================
// Module State
// ============================================================================

// Track if we've initialized to avoid redundant imports
let engineInitialized = false

async function ensureLayoutEngine(): Promise<void> {
  if (engineInitialized || isLayoutEngineInitialized()) {
    return
  }
  // Use centralized default engine initialization
  const { ensureDefaultLayoutEngine } = await import("./layout-engine.js")
  await ensureDefaultLayoutEngine()
  engineInitialized = true
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Render a React element to a string (async version).
 *
 * Automatically initializes the layout engine if needed.
 * Use this when you're not sure if the layout engine is ready.
 *
 * @param element - React element to render
 * @param options - Render options (width, height, plain)
 * @returns Rendered string (with or without ANSI codes)
 *
 * @example
 * ```tsx
 * const output = await renderString(<Summary stats={stats} />)
 * console.log(output)
 * ```
 */
export async function renderString(element: ReactElement, options: RenderStringOptions = {}): Promise<string> {
  await ensureLayoutEngine()
  return renderStringSync(element, options)
}

/**
 * Render a React element to a string (sync version).
 *
 * Requires the layout engine to be already initialized.
 * Throws if the layout engine is not ready.
 *
 * @param element - React element to render
 * @param options - Render options (width, height, plain)
 * @returns Rendered string (with or without ANSI codes)
 *
 * @example
 * ```tsx
 * // After layout engine is initialized
 * const output = renderStringSync(<Summary stats={stats} />)
 * console.log(output)
 * ```
 */
export function renderStringSync(element: ReactElement, options: RenderStringOptions = {}): string {
  if (!isLayoutEngineInitialized()) {
    throw new Error("Layout engine not initialized. Use renderString() (async) or initialize with setLayoutEngine().")
  }

  const { width = 80, height = 24, plain = false } = options

  // Track whether React committed new work (from layout notifications etc.)
  let hadReactCommit = false
  const container = createContainer(() => {
    hadReactCommit = true
  })

  // Create fiber root
  const fiberRoot = createFiberRoot(container)

  // Create minimal mock stdout for components that use useStdout
  const mockStdout = {
    columns: width,
    rows: height,
    write: () => true,
    isTTY: false,
    on: () => mockStdout,
    off: () => mockStdout,
    once: () => mockStdout,
    removeListener: () => mockStdout,
    addListener: () => mockStdout,
  } as unknown as NodeJS.WriteStream

  // Create mock term for components that use useTerm()
  const mockTerm = createTerm({ color: plain ? null : "truecolor" })

  // Wrap with minimal contexts (no input handling needed)
  const wrapped = React.createElement(
    TermContext.Provider,
    { value: mockTerm },
    React.createElement(
      AppContext.Provider,
      {
        value: {
          exit: () => {}, // No-op for static render
        },
      },
      React.createElement(
        StdoutContext.Provider,
        {
          value: {
            stdout: mockStdout,
            write: () => {},
          },
        },
        element,
      ),
    ),
  )

  // Mount the React tree inside act() so layout feedback works
  withActEnvironment(() => {
    act(() => {
      reconciler.updateContainerSync(wrapped, fiberRoot, null, null)
      reconciler.flushSyncWork()
    })
  })

  // Layout stabilization loop: run the pipeline, flush React work from
  // layout notifications (useContentRect forceUpdate etc.), repeat until stable.
  // This matches the test renderer's multi-pass approach.
  let buffer!: TerminalBuffer
  const MAX_ITERATIONS = 5
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    hadReactCommit = false
    withActEnvironment(() => {
      act(() => {
        const root = getContainerRoot(container)
        const result = executeRender(root, width, height, null)
        buffer = result.buffer
      })
      if (!hadReactCommit) {
        act(() => {
          reconciler.flushSyncWork()
        })
      }
    })
    if (!hadReactCommit) break
  }

  // Unmount (cleanup)
  withActEnvironment(() => {
    act(() => {
      reconciler.updateContainerSync(null, fiberRoot, null, null)
      reconciler.flushSyncWork()
    })
  })

  return plain ? bufferToText(buffer) : bufferToStyledText(buffer)
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Run a function with IS_REACT_ACT_ENVIRONMENT temporarily set to true.
 * This ensures act() captures forceUpdate/setState from layout notifications.
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
