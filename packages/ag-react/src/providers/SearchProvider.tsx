/**
 * SearchProvider — app-global search with pluggable Searchable registration.
 *
 * Components (e.g., ListView) register as searchable. SearchBar reads search state.
 * Ctrl+F opens search on the focused searchable. Pluggable: any component can
 * register by calling `registerSearchable()` from the context.
 *
 * Usage:
 * ```tsx
 * <SearchProvider>
 *   <App />
 *   <SearchBar />
 * </SearchProvider>
 * ```
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import {
  type SearchState,
  type SearchMatch,
  type SearchEffect,
  type SearchAction,
  createSearchState,
  searchUpdate,
} from "@silvery/ag-term/search-overlay"
import { useInput } from "../hooks/useInput"
import type { ReactNode, ReactElement } from "react"

// ============================================================================
// Searchable interface — what components register
// ============================================================================

/** Minimal interface for a searchable component. */
export interface Searchable {
  search(query: string): SearchMatch[]
  reveal(match: SearchMatch): void
}

// ============================================================================
// Context types
// ============================================================================

export interface SearchContextValue {
  /** Whether the search bar is currently open */
  isActive: boolean
  /** The current search query */
  query: string
  /** All matches found by the current query */
  matches: SearchMatch[]
  /** Index of the currently highlighted match (-1 = none) */
  currentMatch: number
  /** Cursor position within the query string */
  cursorPosition: number
  /** Open the search bar */
  open(): void
  /** Close the search bar and clear results */
  close(): void
  /** Jump to the next match */
  next(): void
  /** Jump to the previous match */
  prev(): void
  /** Type a character into the search query */
  input(char: string): void
  /** Delete the character before the cursor */
  backspace(): void
  /** Move the query cursor left */
  cursorLeft(): void
  /** Move the query cursor right */
  cursorRight(): void
  /** Move the query cursor to the start */
  cursorToStart(): void
  /** Move the query cursor to the end */
  cursorToEnd(): void
  /** Delete the word before the cursor (Ctrl+W) */
  deleteWordBack(): void
  /** Delete everything before the cursor (Ctrl+U) */
  deleteToStart(): void
  /** Register a searchable component. Returns unregister function. */
  registerSearchable(id: string, searchable: Searchable): () => void
  /** Set which searchable is focused (for multi-pane routing). */
  setFocused(id: string | null): void
}

// ============================================================================
// Context
// ============================================================================

const SearchContext = createContext<SearchContextValue | null>(null)

// ============================================================================
// Provider
// ============================================================================

export function SearchProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<SearchState>(createSearchState)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const searchablesRef = useRef(new Map<string, Searchable>())

  const getActiveSearchable = useCallback((): Searchable | null => {
    const id = activeId ?? focusedId
    if (!id) {
      // Fall back to the only registered searchable (single-pane apps)
      const entries = searchablesRef.current
      if (entries.size === 1) return entries.values().next().value!
      return null
    }
    return searchablesRef.current.get(id) ?? null
  }, [activeId, focusedId])

  const getSearchFn = useCallback(() => {
    const searchable = getActiveSearchable()
    if (!searchable) return undefined
    return (query: string) => searchable.search(query)
  }, [getActiveSearchable])

  // ── Deferred effect processing ────────────────────────────────────
  // Effects from searchUpdate (like scrollTo) are collected during setState
  // updaters and processed in a useEffect after React completes the render.
  // This avoids "Cannot update a component while rendering another" warnings
  // that would occur if reveal() (which may trigger setState in other
  // components like ListView) was called inside a setState updater.
  const pendingEffectsRef = useRef<{ effects: SearchEffect[]; state: SearchState } | null>(null)

  // Process pending effects after state changes complete
  useEffect(() => {
    const pending = pendingEffectsRef.current
    if (!pending) return
    pendingEffectsRef.current = null

    const searchable = getActiveSearchable()
    if (!searchable) return
    for (const eff of pending.effects) {
      if (eff.type === "scrollTo") {
        const match = pending.state.currentMatch >= 0 ? pending.state.matches[pending.state.currentMatch] : undefined
        if (match) {
          searchable.reveal(match)
        }
      }
    }
  })

  /** Dispatch a search action via the TEA state machine. */
  const dispatch = useCallback(
    (action: SearchAction) => {
      setState((prev) => {
        const searchFn = getSearchFn()
        const [next, effects] = searchUpdate(action, prev, searchFn)
        // Collect effects for deferred processing in useEffect
        if (effects.length > 0) {
          pendingEffectsRef.current = { effects, state: next }
        }
        return next
      })
    },
    [getSearchFn],
  )

  const registerSearchable = useCallback((id: string, searchable: Searchable): (() => void) => {
    searchablesRef.current.set(id, searchable)
    return () => {
      searchablesRef.current.delete(id)
    }
  }, [])

  const setFocused = useCallback((id: string | null) => {
    setFocusedId(id)
  }, [])

  const open = useCallback(() => {
    // Lock to current focused searchable when opening
    setActiveId(focusedId)
    dispatch({ type: "open" })
  }, [focusedId, dispatch])

  const close = useCallback(() => {
    setActiveId(null)
    dispatch({ type: "close" })
  }, [dispatch])

  const next = useCallback(() => {
    dispatch({ type: "nextMatch" })
  }, [dispatch])

  const prev = useCallback(() => {
    dispatch({ type: "prevMatch" })
  }, [dispatch])

  const input = useCallback(
    (char: string) => {
      dispatch({ type: "input", char })
    },
    [dispatch],
  )

  const backspace = useCallback(() => {
    dispatch({ type: "backspace" })
  }, [dispatch])

  const cursorLeft = useCallback(() => {
    setState((prev) => {
      const [next] = searchUpdate({ type: "cursorLeft" }, prev)
      return next
    })
  }, [])

  const cursorRight = useCallback(() => {
    setState((prev) => {
      const [next] = searchUpdate({ type: "cursorRight" }, prev)
      return next
    })
  }, [])

  const cursorToStart = useCallback(() => {
    setState((prev) => {
      const [next] = searchUpdate({ type: "cursorToStart" }, prev)
      return next
    })
  }, [])

  const cursorToEnd = useCallback(() => {
    setState((prev) => {
      const [next] = searchUpdate({ type: "cursorToEnd" }, prev)
      return next
    })
  }, [])

  const deleteWordBack = useCallback(() => {
    dispatch({ type: "deleteWordBack" })
  }, [dispatch])

  const deleteToStart = useCallback(() => {
    dispatch({ type: "deleteToStart" })
  }, [dispatch])

  const value = useMemo<SearchContextValue>(
    () => ({
      isActive: state.active,
      query: state.query,
      matches: state.matches,
      currentMatch: state.currentMatch,
      cursorPosition: state.cursorPosition,
      open,
      close,
      next,
      prev,
      input,
      backspace,
      cursorLeft,
      cursorRight,
      cursorToStart,
      cursorToEnd,
      deleteWordBack,
      deleteToStart,
      registerSearchable,
      setFocused,
    }),
    [
      state,
      open,
      close,
      next,
      prev,
      input,
      backspace,
      cursorLeft,
      cursorRight,
      cursorToStart,
      cursorToEnd,
      deleteWordBack,
      deleteToStart,
      registerSearchable,
      setFocused,
    ],
  )

  return React.createElement(
    SearchContext.Provider,
    { value },
    React.createElement(SearchBindings, { ctx: value }),
    children,
  )
}

// ============================================================================
// Input Bindings
// ============================================================================

function SearchBindings({ ctx }: { ctx: SearchContextValue }) {
  useInput(
    (input, key) => {
      if (!ctx.isActive) {
        if (key.ctrl && input === "f") {
          ctx.open()
          return
        }
        return
      }
      if (key.escape) {
        ctx.close()
        return
      }
      if (key.return && !key.shift) {
        ctx.next()
        return
      }
      if (key.return && key.shift) {
        ctx.prev()
        return
      }
      if (key.backspace && key.meta) {
        // Alt+Backspace — delete word backward
        ctx.deleteWordBack()
        return
      }
      if (key.backspace) {
        ctx.backspace()
        return
      }
      // Ctrl+W — delete word backward
      if (key.ctrl && input === "w") {
        ctx.deleteWordBack()
        return
      }
      // Ctrl+U — delete to start of line
      if (key.ctrl && input === "u") {
        ctx.deleteToStart()
        return
      }
      // Ctrl+A — cursor to start
      if (key.ctrl && input === "a") {
        ctx.cursorToStart()
        return
      }
      // Ctrl+E — cursor to end
      if (key.ctrl && input === "e") {
        ctx.cursorToEnd()
        return
      }
      // Home — cursor to start
      if (key.home) {
        ctx.cursorToStart()
        return
      }
      // End — cursor to end
      if (key.end) {
        ctx.cursorToEnd()
        return
      }
      if (key.leftArrow) {
        ctx.cursorLeft()
        return
      }
      if (key.rightArrow) {
        ctx.cursorRight()
        return
      }
      if (input && !key.ctrl && !key.meta) {
        ctx.input(input)
        return
      }
    },
    { isActive: true },
  )
  return null
}

// ============================================================================
// Hook
// ============================================================================

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext)
  if (!ctx) {
    throw new Error("useSearch must be used within a SearchProvider")
  }
  return ctx
}

/** Optional variant — returns null when no SearchProvider is in the tree. */
export function useSearchOptional(): SearchContextValue | null {
  return useContext(SearchContext)
}
