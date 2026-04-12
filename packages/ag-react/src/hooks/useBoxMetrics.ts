/**
 * useBoxMetrics — Ink-compatible box metrics hook.
 *
 * Returns `{ width, height, left, top, hasMeasured }` for the nearest Box,
 * with parent-relative positioning (matching Ink 7.0 semantics).
 *
 * Two usage modes:
 * - **Without ref** (silvery idiom): reads from NodeContext — works for any
 *   component rendered inside a `<Box>`.
 * - **With ref** (Ink idiom): reads from a BoxHandle ref attached to a `<Box>`.
 *
 * @example Context-based (silvery idiom)
 * ```tsx
 * function Inner() {
 *   const { width, height, hasMeasured } = useBoxMetrics()
 *   if (!hasMeasured) return <Text>Measuring...</Text>
 *   return <Text>Size: {width}x{height}</Text>
 * }
 * ```
 *
 * @example Ref-based (Ink idiom)
 * ```tsx
 * function Outer() {
 *   const ref = useRef<BoxHandle>(null)
 *   const { width, height } = useBoxMetrics(ref)
 *   return <Box ref={ref}><Text>{width}x{height}</Text></Box>
 * }
 * ```
 *
 * Bead: km-silvery.boxmetrics-parity
 */

import { useContext, useLayoutEffect, useReducer, type RefObject } from "react"
import { effect as signalEffect } from "@silvery/signals"
import { NodeContext } from "../context"
import { getLayoutSignals } from "@silvery/ag/layout-signals"
import type { AgNode } from "@silvery/ag/types"

// ============================================================================
// Types
// ============================================================================

export interface BoxMetrics {
  readonly width: number
  readonly height: number
  readonly left: number
  readonly top: number
  readonly hasMeasured: boolean
}

// ============================================================================
// Constants
// ============================================================================

const EMPTY_METRICS: BoxMetrics = {
  width: 0,
  height: 0,
  left: 0,
  top: 0,
  hasMeasured: false,
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract the AgNode from a ref that may point to a BoxHandle or an AgNode.
 * Box's forwardRef exposes a BoxHandle via useImperativeHandle with getNode().
 */
function resolveNode(refValue: unknown): AgNode | null {
  if (!refValue) return null
  const obj = refValue as Record<string, unknown>
  // BoxHandle from silvery's Box component
  if (typeof obj.getNode === "function") {
    return (obj.getNode as () => AgNode | null)()
  }
  // Direct AgNode (has boxRect property)
  if (obj.boxRect !== undefined) {
    return refValue as AgNode
  }
  return null
}

/**
 * Compute parent-relative BoxMetrics from a node's boxRect.
 * Position is relative to the parent's boxRect origin, matching
 * Ink's getComputedLayout semantics.
 */
function computeMetrics(node: AgNode): BoxMetrics {
  const rect = node.boxRect
  if (!rect) return EMPTY_METRICS

  // Parent-relative position (matches Ink/Yoga semantics: offset from parent content area)
  const parent = node.parent
  const parentRect = parent?.boxRect
  const parentProps = parent?.props as import("@silvery/ag/types").BoxProps | undefined
  const padLeft = parentProps?.paddingLeft ?? parentProps?.paddingX ?? parentProps?.padding ?? 0
  const padTop = parentProps?.paddingTop ?? parentProps?.paddingY ?? parentProps?.padding ?? 0
  const borderLeft = parentProps?.borderStyle ? 1 : 0
  const borderTop = parentProps?.borderStyle ? 1 : 0
  const contentX = parentRect ? parentRect.x + padLeft + borderLeft : 0
  const contentY = parentRect ? parentRect.y + padTop + borderTop : 0
  return {
    width: rect.width,
    height: rect.height,
    left: parentRect ? rect.x - contentX : rect.x,
    top: parentRect ? rect.y - contentY : rect.y,
    hasMeasured: true,
  }
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Returns box metrics for the nearest Box ancestor (context-based) or a
 * specific Box via ref (Ink-compatible).
 *
 * Subscribes to layout changes via the boxRect signal from layout-signals.
 * On first render before layout completes, returns zeros with hasMeasured=false.
 *
 * @param ref - Optional ref to a Box (BoxHandle). When omitted, reads from NodeContext.
 */
export function useBoxMetrics(ref?: RefObject<unknown>): BoxMetrics {
  const contextNode = useContext(NodeContext)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  // Resolve the target node: ref-based or context-based
  const node = ref ? resolveNode(ref.current) : contextNode

  useLayoutEffect(() => {
    if (!node) return

    const signals = getLayoutSignals(node)
    const dispose = signalEffect(() => {
      signals.boxRect() // read to establish dependency
      forceUpdate()
    })
    return dispose
  }, [node])

  if (!node) return EMPTY_METRICS
  return computeMetrics(node)
}
