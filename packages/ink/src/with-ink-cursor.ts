/**
 * withInkCursor() — Thin adapter bridging Ink's useCursor to silvery's CursorStore.
 *
 * Canonical home for InkCursorStoreCtx. Consumed by ink.ts (useCursor hook).
 *
 * @packageDocumentation
 */
import React, { createContext, Fragment } from "react"
import {
  createCursorStore,
  CursorProvider,
  type CursorStore,
} from "@silvery/ag-react/hooks/useCursor"
import type { RunnableApp } from "./with-ink"

// =============================================================================
// Ink Cursor Store Context
// =============================================================================

/**
 * Context for passing cursor store to Ink compat useCursor hook.
 * This lets useCursor write directly to the store without going through
 * silvery's useCursor hook (which requires NodeContext for layout).
 */
export const InkCursorStoreCtx = createContext<CursorStore | null>(null)

// =============================================================================
// withInkCursor — App-level plugin for pipe() composition
// =============================================================================

export interface WithInkCursorOptions {
  cursorStore?: CursorStore
}

export interface AppWithInkCursor {
  readonly Root: React.ComponentType<{ children: React.ReactNode }>
}

export function withInkCursor<T extends RunnableApp>(
  options: WithInkCursorOptions = {},
): (app: T) => T & AppWithInkCursor {
  const cursorStore = options.cursorStore ?? createCursorStore()

  return (app: T): T & AppWithInkCursor => {
    const PrevRoot = app.Root ?? Fragment
    const InkCursorRoot = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        CursorProvider,
        { store: cursorStore },
        React.createElement(
          InkCursorStoreCtx.Provider,
          { value: cursorStore },
          React.createElement(PrevRoot, null, children),
        ),
      )

    return Object.assign(Object.create(app), {
      Root: InkCursorRoot,
    }) as T & AppWithInkCursor
  }
}
