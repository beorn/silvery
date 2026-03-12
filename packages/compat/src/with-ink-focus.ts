/**
 * withInkFocus() — Plugin providing Ink's focus system.
 *
 * Canonical home for InkFocusContext, InkFocusProvider, and the Focusable type.
 * Consumed by ink.ts (useFocus/useFocusManager hooks).
 *
 * @packageDocumentation
 */
import React, { createContext, Fragment, useCallback, useEffect, useMemo, useState } from "react"
import type { EventEmitter } from "node:events"
import type { RunnableApp } from "./with-ink"

// =============================================================================
// Ink Focus Context & Provider
// =============================================================================

/** A focusable entry in the Ink focus system. */
type Focusable = { id: string; isActive: boolean }

export type InkFocusContextValue = {
  activeId: string | undefined
  isFocusEnabled: boolean
  add: (id: string, options: { autoFocus: boolean }) => void
  remove: (id: string) => void
  activate: (id: string) => void
  deactivate: (id: string) => void
  enableFocus: () => void
  disableFocus: () => void
  focusNext: () => void
  focusPrevious: () => void
  focus: (id: string) => void
  blur: () => void
}

export const InkFocusContext = createContext<InkFocusContextValue>({
  activeId: undefined,
  isFocusEnabled: true,
  add() {},
  remove() {},
  activate() {},
  deactivate() {},
  enableFocus() {},
  disableFocus() {},
  focusNext() {},
  focusPrevious() {},
  focus() {},
  blur() {},
})

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

  const blur = useCallback((): void => {
    setActiveFocusId(undefined)
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
    setFocusables((currentFocusables) => currentFocusables.map((f) => (f.id === id ? { ...f, isActive: true } : f)))
  }, [])

  const deactivateFocusable = useCallback((id: string): void => {
    setActiveFocusId((currentActiveFocusId) => {
      if (currentActiveFocusId === id) return undefined
      return currentActiveFocusId
    })
    setFocusables((currentFocusables) => currentFocusables.map((f) => (f.id === id ? { ...f, isActive: false } : f)))
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
      isFocusEnabled,
      add: addFocusable,
      remove: removeFocusable,
      activate: activateFocusable,
      deactivate: deactivateFocusable,
      enableFocus,
      disableFocus,
      focusNext,
      focusPrevious,
      focus,
      blur,
    }),
    [
      activeFocusId,
      isFocusEnabled,
      addFocusable,
      removeFocusable,
      activateFocusable,
      deactivateFocusable,
      enableFocus,
      disableFocus,
      focusNext,
      focusPrevious,
      focus,
      blur,
    ],
  )

  return React.createElement(InkFocusContext.Provider, { value: contextValue }, children)
}

// =============================================================================
// withInkFocus — App-level plugin for pipe() composition
// =============================================================================

export interface WithInkFocusOptions {
  inputEmitter?: EventEmitter
}

export interface AppWithInkFocus {
  readonly Root: React.ComponentType<{ children: React.ReactNode }>
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
