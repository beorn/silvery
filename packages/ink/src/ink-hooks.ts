/**
 * Ink compat hooks: useFocus, useFocusManager, useStdin, usePaste, useCursor, useBoxMetrics, etc.
 * @internal
 */

import { useContext, useEffect, useLayoutEffect, useCallback, useState, useMemo, useRef } from "react"
import { effect as signalEffect } from "@silvery/signals"
import { getLayoutSignals } from "@silvery/ag/layout-signals"
import { StdoutContext } from "@silvery/ag-react/context"
import { RuntimeContext } from "@silvery/ag-react/context"
import { InkCursorStoreCtx } from "./with-ink-cursor"
import { InkFocusContext } from "./with-ink-focus"
import { InkStdinCtx } from "./ink-stdin"
import { useInput as silveryUseInput } from "@silvery/ag-react/hooks/useInput"

// =============================================================================
// Focus hooks
//
// NOTE: @silvery/ag-react now exports a native useFocus(options) hook backed
// by the real silvery FocusManager — same signature, same return shape, but
// integrated with scopes, spatial nav, and focus origin tracking.
//
// This Ink-compat version uses its own InkFocusContext (parallel state).
// It's kept because ink-render.ts doesn't provide FocusManagerContext.
// Tracked for unification: km-silvery.focus-unify (Step 5).
//
// For NON-Ink apps, prefer: import { useFocus } from "silvery"
// =============================================================================

/**
 * Ink-compatible useFocus hook.
 * Registers a focusable component and tracks focus state.
 *
 * @deprecated For non-Ink apps, prefer `useFocus` from `@silvery/ag-react`
 * which integrates with scopes, spatial nav, and the native FocusManager.
 */
export function useFocus(opts?: { isActive?: boolean; autoFocus?: boolean; id?: string }): {
  isFocused: boolean
  focus: (id: string) => void
} {
  const { isActive = true, autoFocus = false, id: customId } = opts ?? {}
  const ctx = useContext(InkFocusContext)

  const id = useMemo(() => customId ?? Math.random().toString().slice(2, 7), [customId])

  useEffect(() => {
    ctx.add(id, { autoFocus })
    return () => {
      ctx.remove(id)
    }
  }, [id, autoFocus])

  useEffect(() => {
    if (isActive) {
      ctx.activate(id)
    } else {
      ctx.deactivate(id)
    }
  }, [isActive, id])

  return {
    isFocused: Boolean(id) && ctx.activeId === id,
    focus: ctx.focus,
  }
}

/**
 * Ink-compatible useFocusManager hook.
 */
export function useFocusManager(): {
  enableFocus: () => void
  disableFocus: () => void
  focusNext: () => void
  focusPrevious: () => void
  focus: (id: string) => void
  activeId: string | undefined
} {
  const ctx = useContext(InkFocusContext)
  return {
    enableFocus: ctx.enableFocus,
    disableFocus: ctx.disableFocus,
    focusNext: ctx.focusNext,
    focusPrevious: ctx.focusPrevious,
    focus: ctx.focus,
    activeId: ctx.activeId,
  }
}

export type UseFocusOptions = { isActive?: boolean; autoFocus?: boolean; id?: string }
export type UseFocusResult = { isFocused: boolean; focus: (id: string) => void }
export type InkUseFocusManagerResult = ReturnType<typeof useFocusManager>

// =============================================================================
// Stdin hooks
// =============================================================================

/**
 * Ink-compatible useStdin hook.
 * Returns stdin stream and raw mode controls.
 */
export function useStdin() {
  const ctx = useContext(InkStdinCtx)
  return {
    stdin: ctx.stdin,
    setRawMode: ctx.setRawMode,
    isRawModeSupported: ctx.isRawModeSupported,
  }
}

/**
 * Ink-compatible usePaste hook.
 *
 * Enables bracketed paste mode and calls the handler when the user pastes text.
 * Paste content is delivered as a single string, not forwarded to useInput handlers.
 */
export function usePaste(handler: (text: string) => void, options: { isActive?: boolean } = {}): void {
  const ctx = useContext(InkStdinCtx)
  const rt = useContext(RuntimeContext)

  useEffect(() => {
    if (options.isActive === false) return
    ctx.setRawMode(true)
    ctx.setBracketedPasteMode(true)
    return () => {
      ctx.setRawMode(false)
      ctx.setBracketedPasteMode(false)
    }
  }, [options.isActive, ctx.setRawMode, ctx.setBracketedPasteMode])

  // Subscribe to paste events from silvery's RuntimeContext (interactive path)
  useEffect(() => {
    if (options.isActive === false) return
    if (!rt) return
    return rt.on("paste", (text: string) => {
      handler(text)
    })
  }, [options.isActive, rt, handler])

  // Subscribe to paste events from InkStdinCtx (test renderer path)
  useEffect(() => {
    if (options.isActive === false) return
    const handlePaste = (text: string) => {
      handler(text)
    }
    ctx.internal_eventEmitter.on("paste", handlePaste)
    return () => {
      ctx.internal_eventEmitter.removeListener("paste", handlePaste)
    }
  }, [options.isActive, ctx.internal_eventEmitter, handler])
}

// =============================================================================
// Cursor hook
// =============================================================================

/**
 * Ink-compatible useCursor hook.
 *
 * Bridges Ink's imperative `setCursorPosition({ x, y })` API to silvery's
 * cursor store. Writes directly to the per-instance CursorStore rather than
 * going through silvery's useCursor hook (which needs NodeContext for layout
 * coordinate translation — unnecessary here since Ink provides absolute coords).
 *
 * On unmount, clears cursor state (hides cursor).
 */
export function useCursor() {
  const store = useContext(InkCursorStoreCtx)

  // Buffer for render-phase setCursorPosition calls.
  // Applied in useLayoutEffect (after commit) to prevent cursor state from
  // leaking when a component renders but doesn't commit (e.g., Suspense).
  const pendingRef = useRef<{ x: number; y: number } | null | undefined>(undefined)

  // Apply buffered cursor state after commit, clear on unmount.
  // No deps array: runs every render to pick up position changes from render phase.
  useLayoutEffect(() => {
    if (store && pendingRef.current !== undefined) {
      const pos = pendingRef.current
      if (pos) {
        store.setCursorState({ x: pos.x, y: pos.y, visible: true })
      } else {
        store.setCursorState(null)
      }
    }
    return () => {
      store?.setCursorState(null)
    }
  })

  const setCursorPosition = useCallback(
    (position: { x: number; y: number } | undefined) => {
      if (!store) return
      // Buffer the position — applied in useLayoutEffect after React commits
      pendingRef.current = position ?? null
    },
    [store],
  )

  return { setCursorPosition }
}

// =============================================================================
// Animation hook
// =============================================================================

import { InkAnimationContext, normalizeAnimationInterval } from "./ink-animation"

/**
 * Result returned by useAnimation.
 */
export type AnimationResult = {
  /** Discrete frame counter (increments by 1 each interval). */
  readonly frame: number
  /** Total elapsed ms since animation started or last reset. */
  readonly time: number
  /** Milliseconds since the previous tick. */
  readonly delta: number
  /** Reset all counters to 0 and restart timing. */
  readonly reset: () => void
}

/**
 * Options for useAnimation.
 */
export type UseAnimationOptions = {
  /** Time between ticks in ms (default 100). */
  readonly interval?: number
  /** Whether the animation is running (default true). */
  readonly isActive?: boolean
}

const zeroAnimState = { frame: 0, time: 0, delta: 0 }

/**
 * Ink-compatible useAnimation hook.
 *
 * Drives animations by providing a frame counter, elapsed time, frame delta,
 * and a reset function. All animations share a single timer internally via
 * InkAnimationContext, so multiple animated components consolidate into one
 * render cycle (matching Ink 7.0 behaviour).
 */
export function useAnimation(options?: UseAnimationOptions): AnimationResult {
  const { interval = 100, isActive = true } = options ?? {}
  const safeInterval = normalizeAnimationInterval(interval)
  const { subscribe, renderThrottleMs } = useContext(InkAnimationContext)

  const [resetKey, setResetKey] = useState(0)
  const [animState, setAnimState] = useState(zeroAnimState)

  const nextRenderTimeRef = useRef(0)
  const lastRenderTimeRef = useRef(0)
  const previousOptionsRef = useRef({ isActive, safeInterval, resetKey })
  const previousOptions = previousOptionsRef.current

  const shouldReset =
    isActive &&
    (safeInterval !== previousOptions.safeInterval ||
      !previousOptions.isActive ||
      resetKey !== previousOptions.resetKey)

  const reset = useCallback(() => {
    setResetKey((k) => k + 1)
  }, [])

  useLayoutEffect(() => {
    if (!isActive) return

    // Reset to zero immediately so any render between effect commit and
    // first tick shows zeros, not stale values.
    setAnimState(zeroAnimState)

    let startTime = 0

    const { startTime: subscriberStartTime, unsubscribe } = subscribe((currentTime: number) => {
      const isThrottled = renderThrottleMs > 0 && currentTime < nextRenderTimeRef.current
      if (isThrottled) return

      const elapsed = currentTime - startTime
      const nextDelta = currentTime - lastRenderTimeRef.current
      lastRenderTimeRef.current = currentTime
      nextRenderTimeRef.current = currentTime + renderThrottleMs

      setAnimState({
        frame: Math.floor(elapsed / safeInterval),
        time: elapsed,
        delta: nextDelta,
      })
    }, safeInterval)

    startTime = subscriberStartTime
    lastRenderTimeRef.current = subscriberStartTime
    nextRenderTimeRef.current = startTime + renderThrottleMs

    return unsubscribe
  }, [safeInterval, isActive, subscribe, renderThrottleMs, resetKey])

  useLayoutEffect(() => {
    previousOptionsRef.current = { isActive, safeInterval, resetKey }
  }, [isActive, safeInterval, resetKey])

  if (shouldReset) {
    return { ...zeroAnimState, reset }
  }

  return { ...animState, reset }
}

// =============================================================================
// Screen reader hook
// =============================================================================

/**
 * Ink-compatible useIsScreenReaderEnabled hook.
 *
 * Returns whether screen reader mode is enabled. Silvery does not yet have
 * a runtime accessibility probe, so this always returns false unless the
 * INK_SCREEN_READER env var is set.
 */
export function useIsScreenReaderEnabled(): boolean {
  return process.env["INK_SCREEN_READER"] === "true"
}

// =============================================================================
// Window size hook
// =============================================================================

export { useWindowSize } from "@silvery/ag-react/hooks/useWindowSize"

// =============================================================================
// Box metrics
// =============================================================================

/**
 * Extract the AgNode from a ref that may point to a BoxHandle or a AgNode.
 * In silvery, Box's forwardRef exposes a BoxHandle via useImperativeHandle,
 * which has getNode(). Ink users pass refs expecting direct DOM-like access.
 */
function resolveAgNode(refValue: any): import("@silvery/create/types").AgNode | null {
  if (!refValue) return null
  // BoxHandle from silvery's Box component
  if (typeof refValue.getNode === "function") {
    return refValue.getNode()
  }
  // Direct AgNode (has layoutNode property)
  if (refValue.layoutNode !== undefined || refValue.boxRect !== undefined) {
    return refValue
  }
  return null
}

/**
 * Metrics state for useBoxMetrics.
 */
interface BoxMetrics {
  width: number
  height: number
  left: number
  top: number
  hasMeasured: boolean
}

const ZERO_METRICS: BoxMetrics = { width: 0, height: 0, left: 0, top: 0, hasMeasured: false }

/**
 * Compare two BoxMetrics objects for equality.
 */
function metricsEqual(a: BoxMetrics, b: BoxMetrics): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.left === b.left &&
    a.top === b.top &&
    a.hasMeasured === b.hasMeasured
  )
}

/**
 * Ink-compatible useBoxMetrics hook.
 * Returns layout metrics for a tracked box element.
 *
 * Wires into silvery's layout system by subscribing to layout changes
 * via the AgNode's layout signals.
 */
export function useBoxMetrics(ref: import("react").RefObject<any>) {
  const [metrics, setMetrics] = useState<BoxMetrics>(ZERO_METRICS)

  // Track the previously resolved node so we can detect ref switches
  const prevNodeRef = useRef<import("@silvery/create/types").AgNode | null>(null)
  // Track the last metrics we set to avoid unnecessary state updates
  const lastMetricsRef = useRef<BoxMetrics>(ZERO_METRICS)

  /**
   * Update metrics only if they changed, to prevent infinite re-render loops.
   */
  const updateMetrics = useCallback((next: BoxMetrics) => {
    if (!metricsEqual(lastMetricsRef.current, next)) {
      lastMetricsRef.current = next
      setMetrics(next)
    }
  }, [])

  // Subscribe to layout changes. Re-runs on every render (no deps) to
  // pick up ref changes (e.g., memoized component's ref becoming available).
  useEffect(() => {
    const node = resolveAgNode(ref.current)

    // Detect ref switch
    if (node !== prevNodeRef.current) {
      prevNodeRef.current = node
      if (!node) {
        updateMetrics(ZERO_METRICS)
        return
      }
    }

    if (!node) return

    // Subscribe via layout signals
    const signals = getLayoutSignals(node)
    const dispose = signalEffect(() => {
      const rect = signals.boxRect()
      if (rect) {
        updateMetrics({
          width: rect.width,
          height: rect.height,
          left: rect.x,
          top: rect.y,
          hasMeasured: true,
        })
      }
    })

    return dispose
  })

  // Listen for resize events on stdout to trigger re-measurement
  const ctx = useContext(StdoutContext)
  const stdout = ctx?.stdout ?? process.stdout

  useEffect(() => {
    const onResize = () => {
      const node = resolveAgNode(ref.current)
      if (node?.boxRect) {
        updateMetrics({
          width: node.boxRect.width,
          height: node.boxRect.height,
          left: node.boxRect.x,
          top: node.boxRect.y,
          hasMeasured: true,
        })
      }
    }
    stdout.on("resize", onResize)
    return () => {
      stdout.off("resize", onResize)
    }
  }, [stdout, ref, updateMetrics])

  return metrics
}

// =============================================================================
// Re-exported hooks
// =============================================================================

export { useInput, type Key, type InputHandler, type UseInputOptions } from "@silvery/ag-react/hooks/useInput"
export { useApp } from "@silvery/ag-react/hooks/useApp"
export type { UseAppResult } from "@silvery/ag-react/hooks/useApp"
export { useStdout } from "@silvery/ag-react/hooks/useStdout"
export type { UseStdoutResult } from "@silvery/ag-react/hooks/useStdout"
export { useStderr } from "@silvery/ag-react/hooks/useStderr"

// =============================================================================
// Kitty Keyboard Protocol — delegates to @silvery/ag-term
// =============================================================================

import { KittyFlags, type KittyManagerOptions } from "@silvery/ag-term"

/**
 * Kitty keyboard protocol flags (Ink-compatible names).
 * Delegates to KittyFlags from @silvery/ag-term.
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */
export const kittyFlags = {
  disambiguateEscapeCodes: KittyFlags.DISAMBIGUATE,
  reportEventTypes: KittyFlags.REPORT_EVENTS,
  reportAlternateKeys: KittyFlags.REPORT_ALTERNATE,
  reportAllKeysAsEscapeCodes: KittyFlags.REPORT_ALL_KEYS,
  reportAssociatedText: KittyFlags.REPORT_TEXT,
} as const

/** Valid flag names for the kitty keyboard protocol. */
export type KittyFlagName = keyof typeof kittyFlags

/** Converts an array of flag names to the corresponding bitmask value. */
export function resolveFlags(flags: KittyFlagName[]): number {
  let result = 0
  for (const flag of flags) {
    result |= kittyFlags[flag]
  }
  return result
}

/**
 * Kitty keyboard modifier bits.
 * Used in the modifier parameter of CSI u sequences.
 * Note: The actual modifier value is (modifiers - 1) as per the protocol.
 */
export const kittyModifiers = {
  shift: 1,
  alt: 2,
  ctrl: 4,
  super: 8,
  hyper: 16,
  meta: 32,
  capsLock: 64,
  numLock: 128,
} as const

/** Options for configuring kitty keyboard protocol. */
export type KittyKeyboardOptions = {
  mode?: "auto" | "enabled" | "disabled"
  flags?: KittyFlagName[]
}

// =============================================================================
// Kitty Protocol Manager — delegates to @silvery/ag-term
// =============================================================================

/** Convert Ink-compatible KittyKeyboardOptions to @silvery/ag-term KittyManagerOptions.
 *
 * Ink's default when no flags are specified is `['disambiguateEscapeCodes']`
 * (bitmask 1). We match that here for bytewise compat with Ink's test suite,
 * which asserts that `kittyKeyboard: {mode: 'enabled'}` emits exactly `CSI > 1 u`.
 * Silvery's own default (DISAMBIGUATE | REPORT_EVENTS | REPORT_ALL_KEYS = 11)
 * applies only to silvery's native runtime — not the Ink compat layer.
 */
export function resolveKittyManagerOptions(opts: KittyKeyboardOptions | undefined): KittyManagerOptions | undefined {
  if (!opts) return undefined
  return {
    mode: opts.mode,
    flags: opts.flags ? resolveFlags(opts.flags) : kittyFlags.disambiguateEscapeCodes,
  }
}
