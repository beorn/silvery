/**
 * withInkFocus() — Plugin providing Ink's focus system.
 *
 * Wraps the element tree with InkFocusProvider, enabling Ink's
 * useFocus/useFocusManager hooks (flat-list focus with Tab/Shift+Tab).
 *
 * Future: bridge to silvery's tree-based FocusManager.
 *
 * @packageDocumentation
 */
import React, { Fragment } from "react"
import { InkFocusProvider } from "./with-ink"
import type { EventEmitter } from "node:events"

export interface WithInkFocusOptions {
  inputEmitter?: EventEmitter
}

export interface AppWithInkFocus {
  readonly Root: React.ComponentType<{ children: React.ReactNode }>
}

interface RunnableApp {
  run(...args: unknown[]): unknown
  Root?: React.ComponentType<{ children: React.ReactNode }>
  [key: string]: unknown
}

export function withInkFocus<T extends RunnableApp>(
  options: WithInkFocusOptions = {},
): (app: T) => T & AppWithInkFocus {
  return (app: T): T & AppWithInkFocus => {
    const PrevRoot = app.Root ?? Fragment
    const InkFocusRoot = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        InkFocusProvider,
        { inputEmitter: options.inputEmitter },
        React.createElement(PrevRoot, null, children),
      )

    return Object.assign(Object.create(app), {
      Root: InkFocusRoot,
    }) as T & AppWithInkFocus
  }
}
