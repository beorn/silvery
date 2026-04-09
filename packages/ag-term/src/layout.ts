/**
 * silvery/layout -- Layout feedback hooks.
 *
 * The key differentiator of silvery over Ink: components that know their
 * own size during render, not after.
 *
 * ```tsx
 * import { useContentRect, useScrollRect } from '@silvery/ag-react/layout'
 *
 * function ResponsiveCard() {
 *   const { width, height } = useContentRect()
 *   const { x, y } = useScrollRect()
 *   return <Text>{`${width}x${height} at (${x},${y})`}</Text>
 * }
 * ```
 *
 * @packageDocumentation
 */

export {
  useContentRect,
  useContentRectCallback,
  useScrollRect,
  useScrollRectCallback,
} from "@silvery/ag-react/hooks/useLayout"
export type { Rect } from "@silvery/ag/types"
