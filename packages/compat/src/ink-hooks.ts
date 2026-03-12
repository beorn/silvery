/**
 * Ink compat hooks: useFocus, useFocusManager, useStdin, usePaste, useCursor, useBoxMetrics, etc.
 * @internal
 */

import { useContext, useEffect, useLayoutEffect, useCallback, useState, useMemo, useRef } from "react"
import { StdoutContext } from "@silvery/react/context"
import { RuntimeContext } from "@silvery/react/context"
import { InkCursorStoreCtx } from "./with-ink-cursor"
import { InkFocusContext } from "./with-ink-focus"
import { InkStdinCtx } from "./ink-stdin"
import { useInput as silveryUseInput } from "@silvery/react/hooks/useInput"

// =============================================================================
// Focus hooks
// =============================================================================

/**
 * Ink-compatible useFocus hook.
 * Registers a focusable component and tracks focus state.
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
// Window size hook
// =============================================================================

export { useWindowSize } from "@silvery/react/hooks/useWindowSize"

// =============================================================================
// Box metrics
// =============================================================================

/**
 * Extract the TeaNode from a ref that may point to a BoxHandle or a TeaNode.
 * In silvery, Box's forwardRef exposes a BoxHandle via useImperativeHandle,
 * which has getNode(). Ink users pass refs expecting direct DOM-like access.
 */
function resolveTeaNode(refValue: any): import("@silvery/tea/types").TeaNode | null {
  if (!refValue) return null
  // BoxHandle from silvery's Box component
  if (typeof refValue.getNode === "function") {
    return refValue.getNode()
  }
  // Direct TeaNode (has layoutNode property)
  if (refValue.layoutNode !== undefined || refValue.contentRect !== undefined) {
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
 * on the referenced TeaNode's layoutSubscribers.
 */
export function useBoxMetrics(ref: import("react").RefObject<any>) {
  const [metrics, setMetrics] = useState<BoxMetrics>(ZERO_METRICS)

  // Track the previously resolved node so we can detect ref switches
  const prevNodeRef = useRef<import("@silvery/tea/types").TeaNode | null>(null)
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
    const node = resolveTeaNode(ref.current)

    // Detect ref switch
    if (node !== prevNodeRef.current) {
      prevNodeRef.current = node
      if (!node) {
        updateMetrics(ZERO_METRICS)
        return
      }
    }

    if (!node) return

    const onLayoutChange = () => {
      const rect = node.contentRect
      if (rect) {
        updateMetrics({
          width: rect.width,
          height: rect.height,
          left: rect.x,
          top: rect.y,
          hasMeasured: true,
        })
      }
    }

    // Read current layout if already computed
    if (node.contentRect) {
      onLayoutChange()
    }

    // Subscribe to future layout changes
    node.layoutSubscribers.add(onLayoutChange)

    return () => {
      node.layoutSubscribers.delete(onLayoutChange)
    }
  })

  // Listen for resize events on stdout to trigger re-measurement
  const ctx = useContext(StdoutContext)
  const stdout = ctx?.stdout ?? process.stdout

  useEffect(() => {
    const onResize = () => {
      const node = resolveTeaNode(ref.current)
      if (node?.contentRect) {
        updateMetrics({
          width: node.contentRect.width,
          height: node.contentRect.height,
          left: node.contentRect.x,
          top: node.contentRect.y,
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

export { useInput, type Key, type InputHandler, type UseInputOptions } from "@silvery/react/hooks/useInput"
export { useApp } from "@silvery/react/hooks/useApp"
export type { UseAppResult } from "@silvery/react/hooks/useApp"
export { useStdout } from "@silvery/react/hooks/useStdout"
export type { UseStdoutResult } from "@silvery/react/hooks/useStdout"
export { useStderr } from "@silvery/react/hooks/useStderr"
