/**
 * Shared tree utilities for silvery event systems.
 *
 * Functions used by both focus-events.ts and mouse-events.ts.
 */

import type { TeaNode, Rect } from "./types.js"

/**
 * Collect the ancestor path from target to root (inclusive).
 */
export function getAncestorPath(node: TeaNode): TeaNode[] {
  const path: TeaNode[] = []
  let current: TeaNode | null = node
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
