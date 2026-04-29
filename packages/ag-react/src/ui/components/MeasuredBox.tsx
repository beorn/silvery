/**
 * MeasuredBox — render-prop wrapper that defers rendering its children
 * until its own measured rect is known.
 *
 * Wraps the recurring "I need to know my own width before I render" pattern
 * that comes up for responsive content (banners, tables, ASCII art that
 * truncates at host width). Eliminates the explicit
 * `useBoxRect() + width > 0 ? <Inner/> : null` dance.
 *
 * ```tsx
 * <MeasuredBox width="100%" flexDirection="column" alignItems="center">
 *   {({ width }) => <Banner availableWidth={width} />}
 * </MeasuredBox>
 * ```
 *
 * Internals: the outer `<Box>` always renders (it's the node being
 * measured); `useBoxRect()` reads its size. On the first paint the rect
 * is `{0,0,0,0}` and `MeasuredBox` renders nothing. After layout commits,
 * the second paint delivers the real rect to the render function.
 *
 * Sizing the outer box: MeasuredBox is just a Box — it sizes by the same
 * rules as `<Box>`. Pass an explicit `width`/`height`, `flexGrow`, or
 * `width="100%"` (when the parent has a definite cross-axis size). A
 * MeasuredBox without sizing inside an `alignItems="center"` parent can't
 * grow past zero with no children, so it never measures.
 *
 * Source: bead km-silvery.measuredbox-primitive.
 */
import React from "react"
import { Box, type BoxProps } from "../../components/Box"
import { useBoxRect, type Rect } from "../../hooks/useLayout"

export type MeasuredBoxRect = Pick<Rect, "width" | "height">

export type MeasuredBoxRenderFn = (rect: MeasuredBoxRect) => React.ReactNode

export interface MeasuredBoxProps extends Omit<BoxProps, "children"> {
  /**
   * Either a render function `({ width, height }) => ReactNode` invoked
   * once measurement is available, or plain ReactNode that is deferred
   * until measurement is available.
   */
  children: MeasuredBoxRenderFn | React.ReactNode
}

export function MeasuredBox({ children, ...boxProps }: MeasuredBoxProps): React.ReactElement {
  return (
    <Box {...boxProps}>
      <MeasuredInner>{children}</MeasuredInner>
    </Box>
  )
}

/**
 * Inner consumer that reads its enclosing Box's rect. Lives in its own
 * component so `useBoxRect()` reads the outer Box (the node we want to
 * measure) rather than the box being constructed.
 *
 * Returns null until measurement is available — width > 0 is the gate
 * (height can legitimately be 0 along main axis without children, but
 * width comes from the cross-axis decision Yoga makes from parent and
 * outer-Box props, so it's a reliable signal that layout has committed).
 */
function MeasuredInner({
  children,
}: {
  children: MeasuredBoxRenderFn | React.ReactNode
}): React.ReactElement | null {
  const rect = useBoxRect()
  if (rect.width <= 0) return null
  if (typeof children === "function") {
    return <>{(children as MeasuredBoxRenderFn)({ width: rect.width, height: rect.height })}</>
  }
  return <>{children}</>
}
