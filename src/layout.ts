/**
 * hightea/layout -- Layout feedback hooks.
 *
 * The key differentiator of hightea over Ink: components that know their
 * own size during render, not after.
 *
 * ```tsx
 * import { useContentRect, useScreenRect } from '@hightea/term/layout'
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

export { useContentRect, useContentRectCallback, useScreenRect, useScreenRectCallback } from "./hooks/useLayout.js"
export type { Rect } from "./types.js"
