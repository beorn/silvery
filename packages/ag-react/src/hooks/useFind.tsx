/**
 * useFind — React hook for find with optional FindProvider support.
 *
 * Manages find state via the TEA state machine from @silvery/headless/find.
 * When a FindProvider is present in the React context, delegates search
 * to the provider (model-level search for virtual lists). Otherwise,
 * falls back to visible-buffer search.
 */

import { useCallback, useContext, useState } from "react"
import { type FindState, type FindEffect, type FindResult, createFindState, findUpdate } from "@silvery/headless/find"
import type { TerminalBuffer } from "@silvery/ag-term/buffer"
import { useFindProvider } from "./useFindProvider"

// ============================================================================
// Types
// ============================================================================

export interface UseFindOptions {
  /** Called when a scrollTo effect is emitted */
  onScrollTo?: (row: number) => void
  /** Called when a setSelection effect is emitted */
  onSetSelection?: (match: { row: number; startCol: number; endCol: number }) => void
  /** Called when a provider reveal completes — return screen coords for highlighting */
  onProviderReveal?: (result: FindResult) => Promise<{ row: number; startCol: number; endCol: number } | null>
}

export interface UseFindResult {
  /** Current find state */
  findState: FindState
  /** Search for a query in the buffer (buffer search fallback) */
  search(query: string, buffer: TerminalBuffer): void
  /** Search using the provider if available, else buffer search */
  searchWithProvider(query: string, buffer?: TerminalBuffer): void
  /** Navigate to the next match */
  next(): void
  /** Navigate to the previous match */
  prev(): void
  /** Close find mode */
  close(): void
  /** Set selection to the current match */
  selectCurrent(): void
  /** Whether a FindProvider is available in context */
  hasProvider: boolean
}

// ============================================================================
// Hook
// ============================================================================

export function useFind(options?: UseFindOptions): UseFindResult {
  const [state, setState] = useState<FindState>(createFindState)
  const provider = useFindProvider()

  const processEffects = useCallback(
    (effects: FindEffect[]) => {
      for (const effect of effects) {
        switch (effect.type) {
          case "scrollTo":
            options?.onScrollTo?.(effect.row)
            break
          case "setSelection":
            options?.onSetSelection?.(effect.match)
            break
          case "providerReveal":
            // Async: call reveal on provider, then report back
            if (provider && options?.onProviderReveal) {
              const result = effect.result
              void (async () => {
                await provider.reveal(result)
                const coords = await options.onProviderReveal!(result)
                if (coords) {
                  setState((prev) => {
                    const [next, revealEffects] = findUpdate(
                      {
                        type: "revealComplete",
                        result,
                        row: coords.row,
                        startCol: coords.startCol,
                        endCol: coords.endCol,
                      },
                      prev,
                    )
                    // Process non-async effects from revealComplete
                    for (const e of revealEffects) {
                      if (e.type === "scrollTo") options?.onScrollTo?.(e.row)
                    }
                    return next
                  })
                }
              })()
            } else if (provider) {
              // No onProviderReveal callback — just reveal, no highlighting
              void provider.reveal(effect.result)
            }
            break
          case "providerSearch":
            // Async: call provider search, then feed results back
            if (provider) {
              const query = effect.query
              void (async () => {
                const results = await provider.search(query)
                setState((prev) => {
                  const [next, resultEffects] = findUpdate({ type: "setProviderResults", results, query }, prev)
                  // Process effects from setProviderResults
                  for (const e of resultEffects) {
                    if (e.type === "providerReveal" && provider) {
                      if (options?.onProviderReveal) {
                        const result = e.result
                        void (async () => {
                          await provider.reveal(result)
                          const coords = await options.onProviderReveal!(result)
                          if (coords) {
                            setState((prev2) => {
                              const [next2, revealEffects] = findUpdate(
                                {
                                  type: "revealComplete",
                                  result,
                                  row: coords.row,
                                  startCol: coords.startCol,
                                  endCol: coords.endCol,
                                },
                                prev2,
                              )
                              for (const re of revealEffects) {
                                if (re.type === "scrollTo") options?.onScrollTo?.(re.row)
                              }
                              return next2
                            })
                          }
                        })()
                      } else {
                        void provider.reveal(e.result)
                      }
                    }
                  }
                  return next
                })
              })()
            }
            break
          // "render" effects are handled by React re-render from setState
        }
      }
    },
    [options, provider],
  )

  const search = useCallback(
    (query: string, buffer: TerminalBuffer) => {
      setState((prev) => {
        const [next, effects] = findUpdate({ type: "search", query, buffer }, prev)
        processEffects(effects)
        return next
      })
    },
    [processEffects],
  )

  const searchWithProvider = useCallback(
    (query: string, buffer?: TerminalBuffer) => {
      if (provider) {
        // Provider mode: delegate to provider
        setState((prev) => {
          const [next, effects] = findUpdate({ type: "providerSearchStarted", query }, prev)
          processEffects(effects)
          // Kick off provider search
          processEffects([{ type: "providerSearch", query }])
          return next
        })
      } else if (buffer) {
        // Buffer fallback
        search(query, buffer)
      }
    },
    [provider, search, processEffects],
  )

  const next = useCallback(() => {
    setState((prev) => {
      const [nextState, effects] = findUpdate({ type: "next" }, prev)
      processEffects(effects)
      return nextState
    })
  }, [processEffects])

  const prev = useCallback(() => {
    setState((prev) => {
      const [nextState, effects] = findUpdate({ type: "prev" }, prev)
      processEffects(effects)
      return nextState
    })
  }, [processEffects])

  const close = useCallback(() => {
    setState((prev) => {
      const [nextState, effects] = findUpdate({ type: "close" }, prev)
      processEffects(effects)
      return nextState
    })
  }, [processEffects])

  const selectCurrent = useCallback(() => {
    setState((prev) => {
      const [nextState, effects] = findUpdate({ type: "selectCurrent" }, prev)
      processEffects(effects)
      return nextState
    })
  }, [processEffects])

  return {
    findState: state,
    search,
    searchWithProvider,
    next,
    prev,
    close,
    selectCurrent,
    hasProvider: provider !== null,
  }
}
