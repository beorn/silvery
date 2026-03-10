/**
 * withInk() — Composable plugin for Ink compatibility.
 *
 * Wraps a React element tree with Ink-specific providers (error boundary,
 * focus system, cursor store) via the `.Root` component pattern.
 *
 * Two usage modes:
 *
 * 1. **pipe() composition** — App-level plugin for the silvery plugin system:
 *    ```tsx
 *    const app = pipe(
 *      createApp(store),
 *      withReact(<App />),
 *      withTerminal(process),
 *      withInk(),
 *    )
 *    ```
 *
 * 2. **Test renderer** — Pass `createInkWrapRoot()` as `wrapRoot` option:
 *    ```tsx
 *    const app = render(<App />, {
 *      cols: 80,
 *      rows: 24,
 *      wrapRoot: createInkWrapRoot(),
 *    })
 *    ```
 *
 * @packageDocumentation
 */

import React, { Component, Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { createCursorStore, CursorProvider, type CursorStore } from "@silvery/react/hooks/useCursor"
import { EventEmitter } from "node:events"
import type { ReactElement } from "react"

// =============================================================================
// Types
// =============================================================================

/**
 * Options for withInk().
 */
export interface WithInkOptions {
  /** Custom cursor store (creates a new one if not provided) */
  cursorStore?: CursorStore
  /** Custom input event emitter for focus navigation (Tab/Shift+Tab/Esc) */
  inputEmitter?: EventEmitter
  /** Error handler for the error boundary */
  onError?: (error: Error) => void
}

/**
 * A focusable entry in the Ink focus system.
 */
type Focusable = { id: string; isActive: boolean }

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
// Ink Focus Context & Provider
// =============================================================================

type InkFocusContextValue = {
  activeId: string | undefined
  add: (id: string, options: { autoFocus: boolean }) => void
  remove: (id: string) => void
  activate: (id: string) => void
  deactivate: (id: string) => void
  enableFocus: () => void
  disableFocus: () => void
  focusNext: () => void
  focusPrevious: () => void
  focus: (id: string) => void
}

const InkFocusContext = createContext<InkFocusContextValue>({
  activeId: undefined,
  add() {},
  remove() {},
  activate() {},
  deactivate() {},
  enableFocus() {},
  disableFocus() {},
  focusNext() {},
  focusPrevious() {},
  focus() {},
})

/**
 * Access the Ink focus context.
 */
export { InkFocusContext }

/**
 * Ink-compatible FocusProvider component.
 * Manages focus state: list of focusables, active focus ID, tab navigation.
 */
function InkFocusProvider({
  children,
  inputEmitter,
}: {
  children?: React.ReactNode
  inputEmitter?: EventEmitter
}) {
  const [isFocusEnabled, setIsFocusEnabled] = useState(true)
  const [activeFocusId, setActiveFocusId] = useState<string | undefined>(undefined)
  const [, setFocusables] = useState<Focusable[]>([])
  const focusablesCountRef = React.useRef(0)

  const findNextFocusable = useCallback(
    (currentFocusables: Focusable[], currentActiveFocusId: string | undefined): string | undefined => {
      const activeIndex = currentFocusables.findIndex((f) => f.id === currentActiveFocusId)
      for (let i = activeIndex + 1; i < currentFocusables.length; i++) {
        if (currentFocusables[i]?.isActive) return currentFocusables[i]!.id
      }
      return undefined
    },
    [],
  )

  const findPreviousFocusable = useCallback(
    (currentFocusables: Focusable[], currentActiveFocusId: string | undefined): string | undefined => {
      const activeIndex = currentFocusables.findIndex((f) => f.id === currentActiveFocusId)
      for (let i = activeIndex - 1; i >= 0; i--) {
        if (currentFocusables[i]?.isActive) return currentFocusables[i]!.id
      }
      return undefined
    },
    [],
  )

  const focusNext = useCallback((): void => {
    setFocusables((currentFocusables) => {
      setActiveFocusId((currentActiveFocusId) => {
        const firstFocusableId = currentFocusables.find((f) => f.isActive)?.id
        const nextFocusableId = findNextFocusable(currentFocusables, currentActiveFocusId)
        return nextFocusableId ?? firstFocusableId
      })
      return currentFocusables
    })
  }, [findNextFocusable])

  const focusPrevious = useCallback((): void => {
    setFocusables((currentFocusables) => {
      setActiveFocusId((currentActiveFocusId) => {
        const lastFocusableId = currentFocusables.findLast((f) => f.isActive)?.id
        const previousFocusableId = findPreviousFocusable(currentFocusables, currentActiveFocusId)
        return previousFocusableId ?? lastFocusableId
      })
      return currentFocusables
    })
  }, [findPreviousFocusable])

  const enableFocus = useCallback((): void => {
    setIsFocusEnabled(true)
  }, [])
  const disableFocus = useCallback((): void => {
    setIsFocusEnabled(false)
  }, [])

  const focus = useCallback((id: string): void => {
    setFocusables((currentFocusables) => {
      if (currentFocusables.some((f) => f.id === id)) {
        setActiveFocusId(id)
      }
      return currentFocusables
    })
  }, [])

  const addFocusable = useCallback((id: string, { autoFocus }: { autoFocus: boolean }): void => {
    setFocusables((currentFocusables) => {
      focusablesCountRef.current = currentFocusables.length + 1
      return [...currentFocusables, { id, isActive: true }]
    })
    if (autoFocus) {
      setActiveFocusId((currentActiveFocusId) => {
        if (!currentActiveFocusId) return id
        return currentActiveFocusId
      })
    }
  }, [])

  const removeFocusable = useCallback((id: string): void => {
    setActiveFocusId((currentActiveFocusId) => {
      if (currentActiveFocusId === id) return undefined
      return currentActiveFocusId
    })
    setFocusables((currentFocusables) => {
      const filtered = currentFocusables.filter((f) => f.id !== id)
      focusablesCountRef.current = filtered.length
      return filtered
    })
  }, [])

  const activateFocusable = useCallback((id: string): void => {
    setFocusables((currentFocusables) =>
      currentFocusables.map((f) => (f.id === id ? { ...f, isActive: true } : f)),
    )
  }, [])

  const deactivateFocusable = useCallback((id: string): void => {
    setActiveFocusId((currentActiveFocusId) => {
      if (currentActiveFocusId === id) return undefined
      return currentActiveFocusId
    })
    setFocusables((currentFocusables) =>
      currentFocusables.map((f) => (f.id === id ? { ...f, isActive: false } : f)),
    )
  }, [])

  // Tab/Shift+Tab/Esc focus navigation via inputEmitter (raw escape sequences)
  useEffect(() => {
    if (!inputEmitter) return
    const tab = "\t"
    const shiftTab = "\x1b[Z"
    const escape = "\x1b"
    const handleInput = (data: string | Buffer) => {
      const input = typeof data === "string" ? data : data.toString()
      if (!isFocusEnabled || focusablesCountRef.current === 0) return
      if (input === tab) focusNext()
      else if (input === shiftTab) focusPrevious()
      else if (input === escape) setActiveFocusId(undefined)
    }
    inputEmitter.on("input", handleInput)
    return () => {
      inputEmitter.removeListener("input", handleInput)
    }
  }, [isFocusEnabled, focusNext, focusPrevious, inputEmitter])

  const contextValue = useMemo(
    () => ({
      activeId: activeFocusId,
      add: addFocusable,
      remove: removeFocusable,
      activate: activateFocusable,
      deactivate: deactivateFocusable,
      enableFocus,
      disableFocus,
      focusNext,
      focusPrevious,
      focus,
    }),
    [
      activeFocusId,
      addFocusable,
      removeFocusable,
      activateFocusable,
      deactivateFocusable,
      enableFocus,
      disableFocus,
      focusNext,
      focusPrevious,
      focus,
    ],
  )

  return React.createElement(InkFocusContext.Provider, { value: contextValue }, children)
}

// =============================================================================
// Ink Error Boundary
// =============================================================================

interface InkErrorBoundaryProps {
  children?: React.ReactNode
  onError?: (error: Error) => void
}

interface InkErrorBoundaryState {
  error: Error | null
}

class InkErrorBoundary extends Component<InkErrorBoundaryProps, InkErrorBoundaryState> {
  state: InkErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): InkErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error)
  }

  render() {
    if (this.state.error) {
      const err = this.state.error
      const stack = err.stack ?? ""
      const frames = stack
        .split("\n")
        .filter((line) => line.match(/^\s+at\s/))
        .map((line) => line.trim())
      const firstFrame = frames[0] ?? ""
      const fileMatch = firstFrame.match(/\((.+)\)$/) ?? firstFrame.match(/at (.+)$/)
      const rawLocation = fileMatch?.[1] ?? ""

      let location = rawLocation
      const cwd = process.cwd()
      for (const prefix of [cwd, `/private${cwd}`]) {
        if (location.startsWith(`${prefix}/`)) {
          location = location.slice(prefix.length + 1)
          break
        }
      }

      return React.createElement(
        React.Fragment,
        null,
        React.createElement("silvery-text", { color: "red", bold: true }, "ERROR"),
        " ",
        err.message,
        location ? `\n${location}` : null,
      )
    }
    return this.props.children
  }
}

// =============================================================================
// createInkWrapRoot — Low-level wrapRoot function
// =============================================================================

/**
 * Create a `wrapRoot` function that wraps a React element tree with
 * Ink-specific providers (CursorProvider, InkCursorStoreCtx, InkFocusProvider,
 * InkErrorBoundary).
 *
 * Use this directly with silvery's test renderer `render()`:
 *
 * ```tsx
 * import { createInkWrapRoot } from '@silvery/compat/with-ink'
 *
 * const app = render(<App />, {
 *   cols: 80,
 *   rows: 24,
 *   wrapRoot: createInkWrapRoot(),
 * })
 * ```
 *
 * @param options - Optional cursor store, input emitter, and error handler
 * @returns A `wrapRoot` function `(element) => wrappedElement`
 */
export function createInkWrapRoot(
  options: WithInkOptions = {},
): (element: ReactElement) => ReactElement {
  const cursorStore = options.cursorStore ?? createCursorStore()
  const { inputEmitter, onError } = options

  return (el: ReactElement): ReactElement =>
    React.createElement(
      CursorProvider,
      { store: cursorStore },
      React.createElement(
        InkCursorStoreCtx.Provider,
        { value: cursorStore },
        React.createElement(
          InkFocusProvider,
          { inputEmitter },
          React.createElement(InkErrorBoundary, { onError }, el),
        ),
      ),
    )
}

// =============================================================================
// withInk — App-level plugin for pipe() composition
// =============================================================================

/**
 * Minimal app shape that withInk can enhance.
 */
interface RunnableApp {
  run(...args: unknown[]): unknown
  Root?: React.ComponentType<{ children: React.ReactNode }>
  [key: string]: unknown
}

/**
 * App enhanced with Ink compatibility layer.
 */
export interface AppWithInk {
  /** The Ink wrapRoot function applied by this plugin */
  readonly inkWrapRoot: (element: ReactElement) => ReactElement
  /** Root component that wraps the element tree with Ink providers */
  readonly Root: React.ComponentType<{ children: React.ReactNode }>
}

/**
 * Ink compatibility plugin for pipe() composition.
 *
 * Wraps the React element tree with Ink-specific providers:
 * - `InkErrorBoundary` — catches render errors and displays them Ink-style
 * - `InkFocusProvider` — Ink's focus management (useFocus/useFocusManager)
 * - `InkCursorStoreCtx` — cursor store context for Ink's useCursor hook
 * - `CursorProvider` — silvery cursor provider with the shared store
 *
 * The plugin sets `app.Root` to a component that wraps the element tree
 * with Ink providers, composing with any existing `app.Root`. It also wraps
 * `run()` to inject the Root into run options for `createApp()`.
 *
 * @example
 * ```tsx
 * import { pipe, createApp, withReact, withTerminal } from '@silvery/tea'
 * import { withInk } from '@silvery/compat/with-ink'
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
 * @param options - Optional cursor store, input emitter, and error handler
 * @returns Plugin function `(app) => enhancedApp`
 */
export function withInk<T extends RunnableApp>(
  options: WithInkOptions = {},
): (app: T) => T & AppWithInk {
  const wrapRoot = createInkWrapRoot(options)

  return (app: T): T & AppWithInk => {
    // Compose with previous Root: wrap PrevRoot inside Ink providers
    const PrevRoot = app.Root ?? Fragment
    const InkRoot = ({ children }: { children: React.ReactNode }) =>
      wrapRoot(React.createElement(PrevRoot, null, children))

    const originalRun = app.run

    return Object.assign(Object.create(app), {
      inkWrapRoot: wrapRoot,
      Root: InkRoot,
      run(...args: unknown[]) {
        // Inject Root into run options so createApp() can use it
        let existingOptions: Record<string, unknown> | undefined
        if (args.length > 0 && typeof args[args.length - 1] === "object" && args[args.length - 1] !== null) {
          const last = args[args.length - 1] as Record<string, unknown>
          // Don't treat React elements as options
          if (!("type" in last && "props" in last)) {
            existingOptions = last
          }
        }

        const runOptions: Record<string, unknown> = { ...existingOptions, Root: InkRoot }

        // Replace or append options in args
        if (existingOptions) {
          const newArgs = [...args]
          newArgs[newArgs.length - 1] = runOptions
          return originalRun.apply(app, newArgs)
        }
        return originalRun.call(app, ...args, runOptions)
      },
    }) as T & AppWithInk
  }
}
