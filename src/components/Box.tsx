/**
 * Hightea Box Component
 *
 * The primary layout primitive for Hightea. Box is a flexbox container that can hold
 * other Box or Text components. It supports all standard flexbox properties,
 * dimensions, spacing, and borders.
 *
 * Box renders to an 'hightea-box' host element that the reconciler converts to an
 * HighteaNode with an associated Yoga layout node.
 *
 * Box provides NodeContext to its children, enabling useContentRect/useScreenRect hooks.
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
import { NodeContext } from "../context.js"
import type { BoxProps as BoxPropsType, TeaNode, Rect } from "../types.js"

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
  /** Get the underlying HighteaNode */
  getNode(): TeaNode | null
  /** Get the current content-relative layout rect */
  getContentRect(): Rect | null
  /** Get the current screen-relative layout rect */
  getScreenRect(): Rect | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * Flexbox container component for terminal UIs.
 *
 * Provides NodeContext to children, enabling useContentRect/useScreenRect hooks.
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
export const Box = forwardRef(function Box(props: BoxProps, ref: ForwardedRef<BoxHandle>): JSX.Element {
  const { children, onLayout, ...restProps } = props
  const nodeRef = useRef<TeaNode | null>(null)
  const [node, setNode] = useState<TeaNode | null>(null)

  // Track the last layout we reported to onLayout to avoid duplicate calls
  const lastReportedLayout = useRef<Rect | null>(null)

  // After mount, ref points to the HighteaNode. Update state once to provide
  // the node to children via context. Only runs on mount ([] deps).
  useLayoutEffect(() => {
    if (nodeRef.current) {
      setNode(nodeRef.current)
    }
  }, [])

  // Wire up onLayout callback - subscribe to layout changes
  useLayoutEffect(() => {
    if (!onLayout || !node) return

    // Create subscriber callback
    const handleLayoutChange = () => {
      const layout = node.contentRect
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
        onLayout(layout)
      }
    }

    // Subscribe to layout changes
    node.layoutSubscribers.add(handleLayoutChange)

    // Call immediately if we already have layout
    if (node.contentRect) {
      handleLayoutChange()
    }

    return () => {
      node.layoutSubscribers.delete(handleLayoutChange)
    }
  }, [node, onLayout])

  // Expose imperative methods via ref
  useImperativeHandle(
    ref,
    () => ({
      getNode: () => nodeRef.current,
      getContentRect: () => nodeRef.current?.contentRect ?? null,
      getScreenRect: () => nodeRef.current?.screenRect ?? null,
    }),
    [],
  )

  // Render hightea-box with ref, wrap children in NodeContext
  // The reconciler creates an HighteaNode, ref gives us access to it
  return (
    <hightea-box ref={nodeRef} {...restProps}>
      <NodeContext.Provider value={node}>{children}</NodeContext.Provider>
    </hightea-box>
  )
})
