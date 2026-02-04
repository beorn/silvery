/**
 * Box Rendering - Functions for rendering box elements to the buffer.
 *
 * Contains:
 * - Box rendering (renderBox)
 * - Border rendering (renderBorder)
 * - Scroll indicators (renderScrollIndicators)
 */

import type { Style, TerminalBuffer } from "../buffer.js"
import type { BoxProps, InkxNode, Rect } from "../types.js"
import { getBorderChars, getBorderSize, parseColor } from "./render-helpers.js"
import { renderTextLine } from "./render-text.js"

// ============================================================================
// Box Rendering
// ============================================================================

/**
 * Render a Box node.
 */
export function renderBox(
  _node: InkxNode,
  buffer: TerminalBuffer,
  layout: Rect,
  props: BoxProps,
  clipBounds?: { top: number; bottom: number },
  scrollOffset = 0,
): void {
  const { x, width, height } = layout
  // Apply scroll offset to y position
  const y = layout.y - scrollOffset

  // Skip if completely outside clip bounds
  if (clipBounds && (y + height <= clipBounds.top || y >= clipBounds.bottom)) {
    return
  }

  // Fill background if set
  if (props.backgroundColor) {
    const bg = parseColor(props.backgroundColor)
    // Clip background fill to bounds
    if (clipBounds) {
      const clippedY = Math.max(y, clipBounds.top)
      const clippedHeight = Math.min(y + height, clipBounds.bottom) - clippedY
      if (clippedHeight > 0) {
        buffer.fill(x, clippedY, width, clippedHeight, { bg })
      }
    } else {
      buffer.fill(x, y, width, height, { bg })
    }
  }

  // Render border if set
  if (props.borderStyle) {
    renderBorder(buffer, x, y, width, height, props, clipBounds)
  }
}

// ============================================================================
// Border Rendering
// ============================================================================

/**
 * Render a border around a box.
 */
export function renderBorder(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  props: BoxProps,
  clipBounds?: { top: number; bottom: number },
): void {
  const chars = getBorderChars(props.borderStyle ?? "single")
  const color = props.borderColor ? parseColor(props.borderColor) : null

  const showTop = props.borderTop !== false
  const showBottom = props.borderBottom !== false
  const showLeft = props.borderLeft !== false
  const showRight = props.borderRight !== false

  // Helper to check if a row is visible within clip bounds
  const isRowVisible = (row: number): boolean => {
    if (!clipBounds) return row >= 0 && row < buffer.height
    return (
      row >= clipBounds.top && row < clipBounds.bottom && row < buffer.height
    )
  }

  // Top border
  if (showTop && isRowVisible(y)) {
    if (showLeft) buffer.setCell(x, y, { char: chars.topLeft, fg: color })
    for (let col = x + 1; col < x + width - 1 && col < buffer.width; col++) {
      buffer.setCell(col, y, { char: chars.horizontal, fg: color })
    }
    if (showRight && x + width - 1 < buffer.width) {
      buffer.setCell(x + width - 1, y, { char: chars.topRight, fg: color })
    }
  }

  // Side borders
  for (let row = y + 1; row < y + height - 1; row++) {
    if (!isRowVisible(row)) continue
    if (showLeft) buffer.setCell(x, row, { char: chars.vertical, fg: color })
    if (showRight && x + width - 1 < buffer.width) {
      buffer.setCell(x + width - 1, row, { char: chars.vertical, fg: color })
    }
  }

  // Bottom border
  const bottomY = y + height - 1
  if (showBottom && isRowVisible(bottomY)) {
    if (showLeft) {
      buffer.setCell(x, bottomY, { char: chars.bottomLeft, fg: color })
    }
    for (let col = x + 1; col < x + width - 1 && col < buffer.width; col++) {
      buffer.setCell(col, bottomY, { char: chars.horizontal, fg: color })
    }
    if (showRight && x + width - 1 < buffer.width) {
      buffer.setCell(x + width - 1, bottomY, {
        char: chars.bottomRight,
        fg: color,
      })
    }
  }
}

// ============================================================================
// Scroll Indicators
// ============================================================================

/**
 * Render scroll indicators showing hidden items above/below viewport.
 *
 * Two rendering modes:
 * 1. Bordered containers: Indicators appear on the border (e.g., "───▲42───")
 * 2. Borderless containers with overflowIndicator: Indicators overlay content at edges
 *
 * Uses ▲N for items hidden above, ▼N for items hidden below.
 */
export function renderScrollIndicators(
  _node: InkxNode,
  buffer: TerminalBuffer,
  layout: Rect,
  props: BoxProps,
  ss: NonNullable<InkxNode["scrollState"]>,
): void {
  const border = props.borderStyle
    ? getBorderSize(props)
    : { top: 0, bottom: 0, left: 0, right: 0 }

  const indicatorStyle: Style = {
    fg: props.borderColor ? parseColor(props.borderColor) : 8, // Gray/dim
    bg: null,
    attrs: { dim: true },
  }

  // Determine if we should show indicators for borderless containers
  const showBorderless = props.overflowIndicator === true

  // Top indicator
  if (ss.hiddenAbove > 0) {
    const indicator = `\u25b2${ss.hiddenAbove}`

    if (border.top > 0) {
      // Bordered: render on top border line, right side
      const x = layout.x + layout.width - border.right - indicator.length - 1
      const y = layout.y
      renderTextLine(buffer, x, y, indicator, indicatorStyle)
    } else if (showBorderless) {
      // Borderless: render on first content row, right side
      const padding = getPadding(props)
      const x = layout.x + layout.width - indicator.length
      const y = layout.y + padding.top
      renderTextLine(buffer, x, y, indicator, indicatorStyle)
    }
  }

  // Bottom indicator
  if (ss.hiddenBelow > 0) {
    const indicator = `\u25bc${ss.hiddenBelow}`

    if (border.bottom > 0) {
      // Bordered: render on bottom border line, right side
      const x = layout.x + layout.width - border.right - indicator.length - 1
      const y = layout.y + layout.height - 1
      renderTextLine(buffer, x, y, indicator, indicatorStyle)
    } else if (showBorderless) {
      // Borderless: render on last content row, right side
      const padding = getPadding(props)
      const x = layout.x + layout.width - indicator.length
      const y = layout.y + layout.height - 1 - padding.bottom
      renderTextLine(buffer, x, y, indicator, indicatorStyle)
    }
  }
}

/**
 * Get padding values from props.
 */
function getPadding(props: BoxProps): {
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
