/**
 * SearchProvider — app-global search routed to the focused TextSurface.
 *
 * Wraps the TEA search state machine from @silvery/ag-term/search-overlay
 * and delegates search queries to the focused surface from SurfaceRegistry.
 *
 * Usage:
 * ```tsx
 * <SearchProvider>
 *   <App />
 *   <SearchBar />
 * </SearchProvider>
 * ```
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from "react"
import { type SearchState, type SearchMatch, createSearchState, searchUpdate } from "@silvery/ag-term/search-overlay"
import { useInput } from "../hooks/useInput"
import type { ReactNode, ReactElement } from "react"

// ============================================================================
// Types
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
  const [activeSurfaceId, setActiveSurfaceId] = useState<string | null>(null)
  // TODO: Replace with search-machine registration (km-silvery.search-machine)
  const registry = { getSurface: () => null, getFocusedSurface: () => null } as any

  const getSearchFn = useCallback(() => {
    const surface = activeSurfaceId ? registry.getSurface(activeSurfaceId) : registry.getFocusedSurface()
    if (!surface) return undefined
    return (query: string) => surface.search(query)
  }, [registry, activeSurfaceId])

  const handleEffects = useCallback(
    (effects: Array<{ type: string; row?: number }>) => {
      const surface = activeSurfaceId ? registry.getSurface(activeSurfaceId) : registry.getFocusedSurface()
      if (!surface) return
      for (const eff of effects) {
        if (eff.type === "scrollTo" && eff.row !== undefined) {
          surface.reveal(eff.row)
        }
      }
    },
    [registry, activeSurfaceId],
  )

  const open = useCallback(() => {
    const surface = registry.getFocusedSurface()
    if (surface) setActiveSurfaceId(surface.id)
    setState((prev) => {
      const [next] = searchUpdate({ type: "open" }, prev)
      return next
    })
  }, [registry])

  const close = useCallback(() => {
    setActiveSurfaceId(null)
    setState((prev) => {
      const [next] = searchUpdate({ type: "close" }, prev)
      return next
    })
  }, [])

  const next = useCallback(() => {
    setState((prev) => {
      const searchFn = getSearchFn()
      const [next, effects] = searchUpdate({ type: "nextMatch" }, prev, searchFn)
      handleEffects(effects)
      return next
    })
  }, [getSearchFn, handleEffects])

  const prev = useCallback(() => {
    setState((prev) => {
      const searchFn = getSearchFn()
      const [next, effects] = searchUpdate({ type: "prevMatch" }, prev, searchFn)
      handleEffects(effects)
      return next
    })
  }, [getSearchFn, handleEffects])

  const input = useCallback(
    (char: string) => {
      setState((prev) => {
        const searchFn = getSearchFn()
        const [next, effects] = searchUpdate({ type: "input", char }, prev, searchFn)
        handleEffects(effects)
        return next
      })
    },
    [getSearchFn, handleEffects],
  )

  const backspace = useCallback(() => {
    setState((prev) => {
      const searchFn = getSearchFn()
      const [next, effects] = searchUpdate({ type: "backspace" }, prev, searchFn)
      handleEffects(effects)
      return next
    })
  }, [getSearchFn, handleEffects])

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
    }),
    [state, open, close, next, prev, input, backspace, cursorLeft, cursorRight],
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
      if (key.backspace) {
        ctx.backspace()
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
