/**
 * Shared tree utilities for silvery event systems.
 *
 * Functions used by both focus-events.ts and mouse-events.ts.
 */

import type { AgNode, Rect, TextProps } from "./types.js"

/** Include hidden descendants: their previously painted transform still needs clearing. */
export function subtreeHasTextTransform(node: AgNode): boolean {
  return (
    !!(node.props as TextProps).internal_transform || node.children.some(subtreeHasTextTransform)
  )
}

/**
 * Collect the ancestor path from target to root (inclusive).
 */
export function getAncestorPath(node: AgNode): AgNode[] {
  const path: AgNode[] = []
  let current: AgNode | null = node
  while (current) {
    path.push(current)
    current = current.parent
  }
  return path
}

/**
 * Check if a point is inside a rect.
 */
export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
}

/**
 * Find the deepest virtual-text descendant whose `inlineRects` contain the point.
 *
 * Virtual text nodes (a `<Text>` nested inside another `<Text>`) have no layout
 * node and no `scrollRect`, so the rect-based tree walk can't reach them —
 * `inlineRects`, computed during text rendering, is their only geometry. They
 * nest arbitrarily (`<Strong>` wrapping a `<Link>`), and collection flattens
 * every level's span into the parent's `childSpans`, so every level gets rects.
 * The walk must therefore recurse: stopping at the outermost matching run
 * returns the styling wrapper, and the interactive descendant inside it never
 * becomes an event target even though its region was computed correctly.
 *
 * Raw text leaves carry rects too, but they're content rather than elements
 * (no handlers, no props of interest), so they're never a deeper answer than
 * the element that owns them — mirroring `elementFromPoint`, which returns an
 * element and never a text node. A raw leaf is still returned when it's the
 * only match, which keeps the hit target for plain `<Text>` content unchanged.
 */
export function hitTestInlineRects(node: AgNode, x: number, y: number): AgNode | null {
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]!
    const rects = child.inlineRects
    if (!rects) continue
    let contains = false
    for (const rect of rects) {
      if (pointInRect(x, y, rect)) {
        contains = true
        break
      }
    }
    if (!contains) continue
    const deeper = hitTestInlineRects(child, x, y)
    return deeper && !deeper.isRawText ? deeper : child
  }
  return null
}
