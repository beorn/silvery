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
import { NodeContext } from "../context"
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
  // Direct AgNode (has contentRect property)
  if (obj.contentRect !== undefined) {
    return refValue as AgNode
  }
  return null
}

/**
 * Compute parent-relative BoxMetrics from a node's contentRect.
 * Position is relative to the parent's contentRect origin, matching
 * Ink's getComputedLayout semantics.
 */
function computeMetrics(node: AgNode): BoxMetrics {
  const rect = node.contentRect
  if (!rect) return EMPTY_METRICS

  // Parent-relative position (matches Ink semantics)
  const parentRect = node.parent?.contentRect
  return {
    width: rect.width,
    height: rect.height,
    left: parentRect ? rect.x - parentRect.x : rect.x,
    top: parentRect ? rect.y - parentRect.y : rect.y,
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
 * Subscribes to layout changes on the target node's layoutSubscribers set.
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

    node.layoutSubscribers.add(forceUpdate)
    return () => {
      node.layoutSubscribers.delete(forceUpdate)
    }
  }, [node])

  if (!node) return EMPTY_METRICS
  return computeMetrics(node)
}
