/**
 * Signal Store — Zustand StoreApi-compatible store backed by alien-signals.
 *
 * Drop-in replacement for Zustand's createStore(). Provides the same
 * StoreApi<T> interface so useApp()/StoreContext keep working unchanged.
 *
 * Also re-exports StateCreator for backward compatibility with code
 * that imported it from "zustand".
 */

import { signal } from "alien-signals"

// =============================================================================
// Types (matching Zustand's API surface)
// =============================================================================

type SetStateInternal<T> = {
  (partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: false): void
  (state: T | ((state: T) => T), replace: true): void
}

export interface StoreApi<T> {
  setState: SetStateInternal<T>
  getState: () => T
  getInitialState: () => T
  subscribe: (listener: (state: T, prevState: T) => void) => () => void
}

export type StateCreator<
  T,
  Mis extends [StoreMutatorIdentifier, unknown][] = [],
  Mos extends [StoreMutatorIdentifier, unknown][] = [],
  U = T,
> = ((
  setState: StoreApi<T>["setState"],
  getState: StoreApi<T>["getState"],
  store: StoreApi<T>,
) => U) & {
  $$storeMutators?: Mos
}

// Zustand compatibility stubs — unused but needed for type compat
export interface StoreMutators<_S, _A> {}
export type StoreMutatorIdentifier = keyof StoreMutators<unknown, unknown>

// =============================================================================
// createStore — signal-backed Zustand replacement
// =============================================================================

export function createStore<T>(factory: StateCreator<T>): StoreApi<T> {
  const listeners = new Set<(state: T, prevState: T) => void>()
  const state$ = signal<T>(undefined as T)
  let initialState: T

  const setState: SetStateInternal<T> = (partial: unknown, replace?: boolean) => {
    const prev = state$()
    const raw =
      typeof partial === "function"
        ? (partial as (state: T) => T | Partial<T>)(prev)
        : (partial as T | Partial<T>)

    let next: T
    if (!replace && raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
      next = { ...prev, ...(raw as Partial<T>) } as T
    } else {
      next = raw as T
    }

    if (Object.is(prev, next)) return

    state$(next)

    for (const listener of listeners) {
      listener(next, prev)
    }
  }

  const getState = (): T => state$()
  const getInitialState = (): T => initialState

  const subscribe = (listener: (state: T, prevState: T) => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const api: StoreApi<T> = { setState, getState, getInitialState, subscribe }

  const created = factory(setState, getState, api)
  state$(created)
  initialState = created

  return api
}
