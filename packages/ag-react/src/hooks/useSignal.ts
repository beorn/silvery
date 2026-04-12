/**
 * useSignal — bridge alien-signals to React re-renders.
 *
 * Reads a signal value and subscribes to changes. When the signal
 * updates, the component re-renders with the new value.
 *
 * This is the Layer 2 bridge in the reactive stack:
 *   Layer 0: alien-signals (signal, computed, effect)
 *   Layer 1: getLayoutSignals (framework-agnostic)
 *   Layer 2: useSignal (React bridge) ← this hook
 *   Layer 3: useBoxRect, useScreenRect (semantic convenience)
 *
 * @example
 * ```tsx
 * import { useSignal } from "silvery"
 * import { useAgNode } from "silvery"
 *
 * function MyComponent() {
 *   const ag = useAgNode()
 *   const rect = useSignal(ag?.signals.boxRect ?? null)
 *   if (rect) console.log(`${rect.width}x${rect.height}`)
 * }
 * ```
 */

import { useReducer, useLayoutEffect, useRef } from "react"
import { effect as signalEffect } from "@silvery/signals"

type ReadableSignal<T> = () => T

/**
 * Read a signal's value and re-render when it changes.
 *
 * @param sig A signal or computed function, or null to skip.
 * @returns The current value of the signal, or undefined if null.
 */
export function useSignal<T>(sig: ReadableSignal<T> | null): T | undefined {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const sigRef = useRef(sig)
  sigRef.current = sig

  useLayoutEffect(() => {
    if (!sigRef.current) return

    const dispose = signalEffect(() => {
      // Read the signal to establish the reactive dependency
      sigRef.current?.()
      // Force React re-render
      forceUpdate()
    })

    return dispose
  }, [sig])

  if (!sig) return undefined
  return sig()
}
