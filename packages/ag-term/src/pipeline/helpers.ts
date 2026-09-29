/**
 * Shared helper functions for silvery pipeline phases.
 */

import type { AgNode, BoxProps, Rect } from "@silvery/ag/types"
import type { ClipBounds } from "./types"
import { getActiveLineHeight } from "../unicode"

/**
 * Get padding values from props.
 */
export function getPadding(props: BoxProps): {
  top: number
  bottom: number
  left: number
  right: number
} {
  return {
    top: props.paddingTop ?? props.paddingY ?? props.padding ?? 0,
    bottom: props.paddingBottom ?? props.paddingY ?? props.padding ?? 0,
    left: props.paddingLeft ?? props.paddingX ?? props.padding ?? 0,
    right: props.paddingRight ?? props.paddingX ?? props.padding ?? 0,
  }
}

/** Painter projection: use this pass's threaded offset for old and new layout. */
export function projectPaintRect(rect: Rect, scrollOffset: number): Rect {
  return { ...rect, y: rect.y - scrollOffset }
}

/** The painter substitutes scroll/sticky offsets; it does not accumulate them. */
export function childPaintOffset(
  inherited: number,
  scroll: number | undefined,
  sticky?: { naturalTop: number; renderOffset: number },
): number {
  return sticky ? sticky.naturalTop - sticky.renderOffset : (scroll ?? inherited)
}

export function intersectPaintRect(rect: Rect, clip: ClipBounds | undefined): Rect | null {
  const x = Math.max(rect.x, clip?.left ?? -Infinity)
  const y = Math.max(rect.y, clip?.top ?? -Infinity)
  const right = Math.min(rect.x + rect.width, clip?.right ?? Infinity)
  const bottom = Math.min(rect.y + rect.height, clip?.bottom ?? Infinity)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

export function unionPaintRects(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

export function paintRectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Moved/non-shrinking nodes cannot emit an excess-clear strip. */
export function hasExcessClearRetreat(prev: Rect, cur: Rect): boolean {
  return (
    prev.x === cur.x && prev.y === cur.y && (prev.width > cur.width || prev.height > cur.height)
  )
}

/** One excess-strip definition shared by invalidation and emission. Moved
 * nodes are cleaned by ancestors; the excess formulas apply only to shrink. */
export function excessClearRects(
  prev: Rect,
  cur: Rect,
  parent: AgNode | null,
  ancestorRect: Rect | null,
  scrollOffset: number,
  clip: ClipBounds | undefined,
): Rect[] {
  if (!hasExcessClearRetreat(prev, cur)) return []
  const outer = ancestorRect ?? parent?.boxRect
  if (!outer) return []
  let right = outer.x + outer.width
  let bottom = outer.y - scrollOffset + outer.height
  if (parent?.boxRect) {
    const border = getBorderSize(parent.props as BoxProps)
    const padding = getPadding(parent.props as BoxProps)
    right = Math.min(right, parent.boxRect.x + parent.boxRect.width - border.right - padding.right)
    bottom = Math.min(
      bottom,
      parent.boxRect.y - scrollOffset + parent.boxRect.height - border.bottom - padding.bottom,
    )
  }
  const bounds: ClipBounds = {
    top: clip?.top ?? -Infinity,
    bottom: Math.min(bottom, clip?.bottom ?? Infinity),
    left: clip?.left,
    right: Math.min(right, clip?.right ?? Infinity),
  }
  const strips: Rect[] = []
  if (prev.width > cur.width) {
    const strip = intersectPaintRect(
      projectPaintRect(
        { x: cur.x + cur.width, y: prev.y, width: prev.width - cur.width, height: prev.height },
        scrollOffset,
      ),
      bounds,
    )
    if (strip) strips.push(strip)
  }
  if (prev.height > cur.height) {
    const strip = intersectPaintRect(
      projectPaintRect(
        { x: cur.x, y: cur.y + cur.height, width: prev.width, height: prev.height - cur.height },
        scrollOffset,
      ),
      bounds,
    )
    if (strip) strips.push(strip)
  }
  return strips
}

/**
 * Get border size (1 or 0 for each side).
 * In pixel/canvas mode (lineHeight > 1), borders are visual-only (fillRoundedRect)
 * and don't affect content positioning — returns 0.
 */
export function getBorderSize(props: BoxProps): {
  top: number
  bottom: number
  left: number
  right: number
} {
  if (!props.borderStyle || getActiveLineHeight() > 1) {
    return { top: 0, bottom: 0, left: 0, right: 0 }
  }
  return {
    top: props.borderTop !== false ? 1 : 0,
    bottom: props.borderBottom !== false ? 1 : 0,
    left: props.borderLeft !== false ? 1 : 0,
    right: props.borderRight !== false ? 1 : 0,
  }
}

/** Container child clipping shared with the painter. */
export function computeChildClipBounds(
  layout: NonNullable<AgNode["boxRect"]>,
  props: BoxProps,
  parentClip: ClipBounds | undefined,
  scrollOffset = 0,
  /** Compute left/right clip bounds for horizontal overflow clipping. */
  horizontal = true,
  /** Compute top/bottom clip bounds for vertical overflow clipping.
   *  Defaults to true — scroll containers pass vertical=true, horizontal=false
   *  (horizontal containment is via layout OVERFLOW_HIDDEN, not render clipping). */
  vertical = true,
): ClipBounds {
  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
  const padding = getPadding(props)
  const adjustedY = layout.y - scrollOffset
  const nodeClip: ClipBounds = vertical
    ? {
        top: adjustedY + border.top + padding.top,
        bottom: adjustedY + layout.height - border.bottom - padding.bottom,
      }
    : { top: -Infinity, bottom: Infinity }
  if (horizontal) {
    nodeClip.left = layout.x + border.left + padding.left
    nodeClip.right = layout.x + layout.width - border.right - padding.right
  }
  if (!parentClip) return nodeClip
  const result: ClipBounds = {
    top: vertical ? Math.max(parentClip.top, nodeClip.top) : parentClip.top,
    bottom: vertical ? Math.min(parentClip.bottom, nodeClip.bottom) : parentClip.bottom,
  }
  if (horizontal && nodeClip.left !== undefined && nodeClip.right !== undefined) {
    result.left = Math.max(parentClip.left ?? 0, nodeClip.left)
    result.right = Math.min(parentClip.right ?? Infinity, nodeClip.right)
  } else if (parentClip.left !== undefined && parentClip.right !== undefined) {
    // Pass through parent's horizontal clip bounds without adding own
    result.left = parentClip.left
    result.right = parentClip.right
  }
  return result
}

/** The actual child clip used by both painter and overlap preparation. */
export function childPaintClip(
  node: AgNode,
  inherited: ClipBounds | undefined,
  offset: number,
): ClipBounds | undefined {
  const layout = node.boxRect
  if (!layout) return inherited
  const props = node.props as BoxProps
  if (props.overflow === "scroll" && node.scrollState) {
    const viewport = computeChildClipBounds(layout, props, inherited, 0, false, true)
    const ss = node.scrollState
    if (
      props.overflowIndicator === true &&
      !props.borderStyle &&
      (ss.hiddenAbove > 0 || ss.hiddenBelow > 0)
    ) {
      return {
        ...viewport,
        top: viewport.top + (ss.hiddenAbove > 0 ? 1 : 0),
        bottom: viewport.bottom - (ss.hiddenBelow > 0 ? 1 : 0),
      }
    }
    return viewport
  }
  const x = (props.overflowX ?? props.overflow) === "hidden"
  const y = (props.overflowY ?? props.overflow) === "hidden"
  return x || y ? computeChildClipBounds(layout, props, inherited, offset, x, y) : inherited
}

/** Indexed child dispatch geometry, in the same normal/sticky/absolute passes
 * as the painter. Derived lazily once for each visited parent in a pass. */
export function paintChildStates(
  node: AgNode,
  offset: number,
  inherited: ClipBounds | undefined,
): {
  scrollOffset: number
  clipBounds: ClipBounds | undefined
  pass: number
  order: number
}[] {
  const props = node.props as BoxProps
  const ss = props.overflow === "scroll" ? node.scrollState : undefined
  const clipBounds = childPaintClip(node, inherited, offset)
  const states = node.children.map((child) => ({
    scrollOffset: childPaintOffset(offset, ss?.offset),
    clipBounds,
    pass: !ss && (child.props as BoxProps).position === "absolute" ? 2 : 0,
    order: -1,
  }))
  const stickyChildren = ss ? (ss.stickyChildren ?? []) : (node.stickyChildren ?? [])
  for (const sticky of stickyChildren) {
    const state = states[sticky.index]
    if (!state) throw new Error(`Sticky child ${sticky.index} missing from paint geometry`)
    state.scrollOffset = childPaintOffset(offset, ss?.offset, sticky)
    state.pass = 1
  }
  // Match actual normal/sticky/absolute dispatch, including sticky list order.
  let order = 0
  for (const state of states) if (state.pass === 0) state.order = order++
  for (const sticky of stickyChildren) {
    const state = states[sticky.index]
    if (!state) throw new Error(`Sticky child ${sticky.index} missing from paint order`)
    state.order = order++
  }
  for (const state of states) if (state.pass === 2) state.order = order++
  return states
}
