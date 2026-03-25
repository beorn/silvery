/**
 * @silvery/headless — createMachine
 *
 * Minimal observable state container for headless machines.
 * Holds current state, dispatches actions via update function,
 * notifies subscribers on state change.
 *
 * Framework-agnostic: works with signals, React, zustand, or bare loops.
 */

// =============================================================================
// Types
// =============================================================================

export interface Machine<S, A> {
  /** Current state (read-only) */
  readonly state: S
  /** Dispatch an action through the update function */
  send(action: A): void
  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe(listener: (state: S) => void): () => void
  /** Replace state directly (escape hatch for controlled mode sync) */
  setState(state: S): void
}

export type UpdateFn<S, A> = (state: S, action: A) => S

// =============================================================================
// Factory
// =============================================================================

export function createMachine<S, A>(update: UpdateFn<S, A>, initialState: S): Machine<S, A> {
  let current = initialState
  const listeners = new Set<(state: S) => void>()

  function notify() {
    for (const fn of listeners) fn(current)
  }

  return {
    get state() {
      return current
    },

    send(action: A) {
      const next = update(current, action)
      if (next !== current) {
        current = next
        notify()
      }
    },

    subscribe(listener: (state: S) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    setState(state: S) {
      if (state !== current) {
        current = state
        notify()
      }
    },
  }
}
