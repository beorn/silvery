import type { Term } from "@silvery/term/ansi"
import { useCallback, useContext, useRef, useSyncExternalStore } from "react"
import { TermContext } from "../context"

/**
 * Shallow equality comparison for object selectors.
 *
 * @example
 * ```tsx
 * const { cols, rows } = useTerm(t => ({ cols: t.cols, rows: t.rows }), shallow)
 * ```
 */
export function shallow<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
      return false
  }
  return true
}

/**
 * Hook to access the Term in components.
 *
 * Without a selector, returns the Term object (not reactive to state changes).
 * With a selector, returns the selected value reactively via useSyncExternalStore.
 *
 * @example
 * ```tsx
 * // Non-reactive: access Term for styling, I/O, etc.
 * const term = useTerm()
 * term.green('Success!')
 *
 * // Reactive: re-renders only when cols changes
 * const cols = useTerm(t => t.cols)
 *
 * // Reactive with shallow comparison for object selectors
 * const { cols, rows } = useTerm(t => ({ cols: t.cols, rows: t.rows }), shallow)
 * ```
 */
export function useTerm(): Term
export function useTerm<T>(selector: (term: Term) => T, equalityFn?: (a: T, b: T) => boolean): T
export function useTerm<T>(
  selector?: (term: Term) => T,
  equalityFn?: (a: T, b: T) => boolean,
): Term | T {
  const term = useContext(TermContext)
  if (!term) {
    throw new Error("useTerm must be used within a render(element, term) context")
  }

  if (!selector) {
    return term
  }

  return useTermSelector(term, selector, equalityFn)
}

function useTermSelector<T>(
  term: Term,
  selector: (term: Term) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const prevRef = useRef<T | undefined>(undefined)
  const isEqual = equalityFn ?? Object.is

  const subscribe = useCallback((listener: () => void) => term.subscribe(listener), [term])

  const getSnapshot = useCallback((): T => {
    const next = selector(term)
    if (prevRef.current !== undefined && isEqual(prevRef.current, next)) {
      return prevRef.current
    }
    prevRef.current = next
    return next
  }, [term, selector, isEqual])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
