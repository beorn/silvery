/**
 * withInk() — Composable plugin for Ink compatibility.
 *
 * Composes withInkCursor() and withInkFocus() to wrap a React element tree
 * with Ink-specific providers (focus system, cursor store).
 *
 * ```tsx
 * const app = pipe(
 *   createApp(store),
 *   withReact(<App />),
 *   withTerminal(process),
 *   withInk(),
 * )
 * ```
 *
 * @packageDocumentation
 */

import type React from "react"
import type { CursorStore } from "@silvery/react/hooks/useCursor"
import type { EventEmitter } from "node:events"
import { withInkCursor } from "./with-ink-cursor"
import { withInkFocus } from "./with-ink-focus"

// =============================================================================
// Shared Types
// =============================================================================

/**
 * Minimal app shape that plugins can enhance.
 * Shared by withInk, withInkCursor, withInkFocus, withTerminal, withReact.
 */
export interface RunnableApp {
  run(...args: unknown[]): unknown
  Root?: React.ComponentType<{ children: React.ReactNode }>
  [key: string]: unknown
}

// =============================================================================
// withInk — Convenience composition
// =============================================================================

/**
 * Options for withInk().
 */
export interface WithInkOptions {
  /** Custom cursor store (creates a new one if not provided) */
  cursorStore?: CursorStore
  /** Custom input event emitter for focus navigation (Tab/Shift+Tab/Esc) */
  inputEmitter?: EventEmitter
}

/**
 * App enhanced with Ink compatibility layer.
 */
export interface AppWithInk {
  /** Root component that wraps the element tree with Ink providers */
  readonly Root: React.ComponentType<{ children: React.ReactNode }>
}

/**
 * Ink compatibility plugin for pipe() composition.
 *
 * Composes withInkCursor() and withInkFocus() to wrap the React element tree
 * with Ink-specific providers:
 * - `InkFocusProvider` — Ink's focus management (useFocus/useFocusManager)
 * - `InkCursorStoreCtx` — cursor store context for Ink's useCursor hook
 * - `CursorProvider` — silvery cursor provider with the shared store
 *
 * Error handling is separate — silvery's `SilveryErrorBoundary` wraps all
 * apps automatically in `createApp()`.
 *
 * @example
 * ```tsx
 * import { pipe, createApp, withReact, withTerminal } from '@silvery/tea'
 * import { withInk } from '@silvery/ink/with-ink'
 *
 * const app = pipe(
 *   createApp(store),
 *   withReact(<App />),
 *   withTerminal(process),
 *   withInk(),
 * )
 * await app.run()
 * ```
 *
 * @param options - Optional cursor store and input emitter
 * @returns Plugin function `(app) => enhancedApp`
 */
export function withInk<T extends RunnableApp>(options: WithInkOptions = {}): (app: T) => T & AppWithInk {
  return (app: T): T & AppWithInk => {
    // Apply cursor adapter
    const appWithCursor = withInkCursor({ cursorStore: options.cursorStore })(app)

    // Apply focus adapter
    const result = withInkFocus({ inputEmitter: options.inputEmitter })(appWithCursor)

    return result as unknown as T & AppWithInk
  }
}
