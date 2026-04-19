/**
 * Silvery Box Component
 *
 * The primary layout primitive for Silvery. Box is a flexbox container that can hold
 * other Box or Text components. It supports all standard flexbox properties,
 * dimensions, spacing, and borders.
 *
 * Box renders to an 'silvery-box' host element that the reconciler converts to an
 * SilveryNode with an associated Yoga layout node.
 *
 * Box provides NodeContext to its children, enabling useBoxRect/useScrollRect hooks.
 * It also supports forwardRef for imperative access and onLayout for layout callbacks.
 */

import {
  type ForwardedRef,
  type JSX,
  type ReactNode,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { effect as signalEffect } from "@silvery/signals"
import { NodeContext } from "../context"
import { getLayoutSignals } from "@silvery/ag/layout-signals"
import type { BoxProps as BoxPropsType, AgNode, Rect } from "@silvery/ag/types"

// ============================================================================
// Props
// ============================================================================

export interface BoxProps extends BoxPropsType {
  /** Child elements */
  children?: ReactNode
}

/**
 * Methods exposed via ref on Box component.
 */
export interface BoxHandle {
  /** Get the underlying SilveryNode */
  getNode(): AgNode | null
  /** Get the current content-relative layout rect */
  getBoxRect(): Rect | null
  /** Get the current screen-relative layout rect */
  getScrollRect(): Rect | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * Flexbox container component for terminal UIs.
 *
 * Provides NodeContext to children, enabling useBoxRect/useScrollRect hooks.
 * Supports forwardRef for imperative access and onLayout for layout callbacks.
 *
 * @example
 * ```tsx
 * // Basic vertical layout (default)
 * <Box>
 *   <Text>Line 1</Text>
 *   <Text>Line 2</Text>
 * </Box>
 *
 * // Horizontal layout with spacing
 * <Box flexDirection="row" gap={2}>
 *   <Box width={10}><Text>Left</Text></Box>
 *   <Box flexGrow={1}><Text>Center</Text></Box>
 *   <Box width={10}><Text>Right</Text></Box>
 * </Box>
 *
 * // With border
 * <Box borderStyle="single" borderColor="green" padding={1}>
 *   <Text>Boxed content</Text>
 * </Box>
 *
 * // With ref and onLayout
 * const boxRef = useRef<BoxHandle>(null);
 * <Box
 *   ref={boxRef}
 *   onLayout={(layout) => console.log('Size:', layout.width, layout.height)}
 * >
 *   <Text>Content</Text>
 * </Box>
 * ```
 */
export const Box = forwardRef(function Box(
  props: BoxProps,
  ref: ForwardedRef<BoxHandle>,
): JSX.Element {
  const { children, onLayout, ...restProps } = props
  const nodeRef = useRef<AgNode | null>(null)
  const [node, setNode] = useState<AgNode | null>(null)

  // Track the last layout we reported to onLayout to avoid duplicate calls
  const lastReportedLayout = useRef<Rect | null>(null)

  // After mount, ref points to the SilveryNode. Update state once to provide
  // the node to children via context. Only runs on mount ([] deps).
  useLayoutEffect(() => {
    if (nodeRef.current) {
      setNode(nodeRef.current)
    }
  }, [])

  // Wire up onLayout callback - subscribe via layout signals
  useLayoutEffect(() => {
    if (!onLayout || !node) return

    const signals = getLayoutSignals(node)
    const onLayoutRef = { current: onLayout }
    onLayoutRef.current = onLayout

    const dispose = signalEffect(() => {
      const layout = signals.boxRect()
      if (!layout) return

      // Only call onLayout if layout actually changed
      const last = lastReportedLayout.current
      if (
        !last ||
        last.x !== layout.x ||
        last.y !== layout.y ||
        last.width !== layout.width ||
        last.height !== layout.height
      ) {
        lastReportedLayout.current = layout
        onLayoutRef.current(layout)
      }
    })

    return dispose
  }, [node, onLayout])

  // Expose imperative methods via ref
  useImperativeHandle(
    ref,
    () => ({
      getNode: () => nodeRef.current,
      getBoxRect: () => nodeRef.current?.boxRect ?? null,
      getScrollRect: () => nodeRef.current?.scrollRect ?? null,
    }),
    [],
  )

  // Render silvery-box with ref, wrap children in NodeContext
  // The reconciler creates an SilveryNode, ref gives us access to it
  return (
    <silvery-box ref={nodeRef} {...restProps}>
      <NodeContext.Provider value={node}>{children}</NodeContext.Provider>
    </silvery-box>
  )
})
