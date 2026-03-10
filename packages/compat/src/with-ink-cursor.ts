/**
 * withInkCursor() — Thin adapter bridging Ink's useCursor to silvery's CursorStore.
 *
 * Provides InkCursorStoreCtx so Ink's useCursor hook can write to silvery's
 * hardware cursor system. ~20 lines — just context plumbing.
 *
 * @packageDocumentation
 */
import React, { Fragment } from "react"
import { createCursorStore, CursorProvider, type CursorStore } from "@silvery/react/hooks/useCursor"
import { InkCursorStoreCtx } from "./with-ink"

export interface WithInkCursorOptions {
  cursorStore?: CursorStore
}

export interface AppWithInkCursor {
  readonly Root: React.ComponentType<{ children: React.ReactNode }>
}

interface RunnableApp {
  run(...args: unknown[]): unknown
  Root?: React.ComponentType<{ children: React.ReactNode }>
  [key: string]: unknown
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
