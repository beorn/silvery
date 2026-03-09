/**
 * silvery/layout -- Layout feedback hooks.
 *
 * The key differentiator of silvery over Ink: components that know their
 * own size during render, not after.
 *
 * ```tsx
 * import { useContentRect, useScreenRect } from '@silvery/react/layout'
 *
 * function ResponsiveCard() {
 *   const { width, height } = useContentRect()
 *   const { x, y } = useScreenRect()
 *   return <Text>{`${width}x${height} at (${x},${y})`}</Text>
 * }
 * ```
 *
 * @packageDocumentation
 */

export {
  useContentRect,
  useContentRectCallback,
  useScreenRect,
  useScreenRectCallback,
} from "@silvery/react/hooks/useLayout"
export type { Rect } from "@silvery/tea/types"
