/**
 * withInk() — Composable plugin for Ink compatibility.
 *
 * Composes withInkCursor() and withInkFocus() to wrap a React element tree
 * with Ink-specific providers (focus system, cursor store).
 *
 * Error handling is provided by silvery's built-in SilveryErrorBoundary
 * in createApp(), so withInk() no longer includes its own error boundary.
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

import React, { createContext, useCallback, useEffect, useMemo, useState } from "react"
import type { CursorStore } from "@silvery/react/hooks/useCursor"
import { EventEmitter } from "node:events"
import { withInkCursor } from "./with-ink-cursor"
import { withInkFocus } from "./with-ink-focus"

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
export function InkFocusProvider({
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
 * Error handling is provided by silvery's built-in SilveryErrorBoundary
 * in createApp(), so withInk() no longer includes its own error boundary.
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
 * @param options - Optional cursor store and input emitter
 * @returns Plugin function `(app) => enhancedApp`
 */
export function withInk<T extends RunnableApp>(
  options: WithInkOptions = {},
): (app: T) => T & AppWithInk {
  return (app: T): T & AppWithInk => {
    // Apply cursor adapter
    const appWithCursor = withInkCursor({ cursorStore: options.cursorStore })(app)

    // Apply focus adapter
    const result = withInkFocus({ inputEmitter: options.inputEmitter })(appWithCursor)

    return result as unknown as T & AppWithInk
  }
}
