/**
 * FindFeature — service wrapper around the headless find state machine.
 *
 * Provides a subscribe/invalidate-based API so consumers (withFocus, React hooks)
 * can drive the find UI without knowing the TEA internals.
 *
 * The feature wraps `findUpdate` from `@silvery/headless/find` and manages
 * buffer-level searching, match navigation, and render invalidation.
 *
 * @example
 * ```ts
 * const feature = createFindFeature({
 *   getBuffer: () => ag.render().buffer,
 *   invalidate: () => app.render(),
 * })
 *
 * feature.open()
 * feature.setQuery("hello")
 * feature.next()
 * feature.close()
 * feature.dispose()
 * ```
 */

import {
  createFindState,
  findUpdate,
  searchBuffer,
  type FindState,
  type FindAction,
  type FindEffect,
} from "@silvery/headless/find"
import type { TerminalBuffer } from "./buffer"

// =============================================================================
// Types
// =============================================================================

export interface FindFeature {
  /** Current find state (read-only snapshot). */
  readonly state: FindState

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void

  /** Open find mode. */
  open(): void

  /** Close find mode and clear results. */
  close(): void

  /** Update the search query (triggers buffer search). */
  setQuery(query: string): void

  /** Navigate to the next match (wraps around). */
  next(): void

  /** Navigate to the previous match (wraps around). */
  prev(): void

  /** Clean up subscriptions. */
  dispose(): void
}

export interface FindFeatureOptions {
  /** Callback to get the current terminal buffer for searching. */
  getBuffer: () => TerminalBuffer | null

  /** Callback to trigger a render pass after state changes. */
  invalidate: () => void
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a FindFeature — a service wrapping the headless find machine.
 */
export function createFindFeature(options: FindFeatureOptions): FindFeature {
  const { getBuffer, invalidate } = options

  let state = createFindState()
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const listener of listeners) {
      listener()
    }
  }

  function processEffects(effects: FindEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "render":
          invalidate()
          break
        case "scrollTo":
          // Scroll effects are informational — consumers handle via state.currentIndex
          break
        case "setSelection":
          // Selection integration — consumers can check state.matches[currentIndex]
          break
        case "providerSearch":
        case "providerReveal":
          // Provider effects not handled at this level
          break
      }
    }
  }

  function dispatch(action: FindAction): void {
    const [newState, effects] = findUpdate(action, state)
    state = newState
    processEffects(effects)
    notify()
  }

  return {
    get state(): FindState {
      return state
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    open(): void {
      state = { ...createFindState(), active: true }
      invalidate()
      notify()
    },

    close(): void {
      dispatch({ type: "close" })
    },

    setQuery(query: string): void {
      const buffer = getBuffer()
      if (!buffer) return
      dispatch({ type: "search", query, buffer })
    },

    next(): void {
      dispatch({ type: "next" })
    },

    prev(): void {
      dispatch({ type: "prev" })
    },

    dispose(): void {
      listeners.clear()
    },
  }
}
