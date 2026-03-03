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
import { getPadding } from "./helpers.js"
import { getBorderChars, getBorderSize, parseColor } from "./render-helpers.js"
import { renderTextLine } from "./render-text.js"
import type { PipelineContext } from "./types.js"

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
  clipBounds?: { top: number; bottom: number; left?: number; right?: number },
  scrollOffset = 0,
  skipBgFill = false,
): void {
  const { x, width, height } = layout
  // Apply scroll offset to y position
  const y = layout.y - scrollOffset

  // Skip if completely outside clip bounds
  if (clipBounds) {
    if (y + height <= clipBounds.top || y >= clipBounds.bottom) return
    if (clipBounds.left !== undefined && clipBounds.right !== undefined) {
      if (x + width <= clipBounds.left || x >= clipBounds.right) return
    }
  }

  // Fill background if set.
  // In incremental mode, skipBgFill=true when the box itself hasn't changed
  // (only subtreeDirty). The cloned buffer already has the correct bg fill,
  // and re-filling would destroy child pixels that won't be repainted.
  if (props.backgroundColor && !skipBgFill) {
    const bg = parseColor(props.backgroundColor)
    // Clip background fill to bounds
    if (clipBounds) {
      const clippedY = Math.max(y, clipBounds.top)
      const clippedHeight = Math.min(y + height, clipBounds.bottom) - clippedY
      let clippedX = x
      let clippedWidth = width
      if (clipBounds.left !== undefined && clipBounds.right !== undefined) {
        clippedX = Math.max(x, clipBounds.left)
        clippedWidth = Math.min(x + width, clipBounds.right) - clippedX
      }
      if (clippedHeight > 0 && clippedWidth > 0) {
        buffer.fill(clippedX, clippedY, clippedWidth, clippedHeight, { bg })
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
  clipBounds?: { top: number; bottom: number; left?: number; right?: number },
): void {
  const chars = getBorderChars(props.borderStyle ?? "single")
  const color = props.borderColor ? parseColor(props.borderColor) : null
  // Preserve the box's background color on border cells. Without this,
  // border cells get bg=null (transparent) which differs from the box's
  // bg fill (e.g., bg=0 for "black"). This bg=null vs bg=0 discrepancy
  // causes ANSI output differences: bg=null emits no background SGR code
  // (terminal default), while bg=0 emits explicit \x1b[48;5;0m. When
  // these differ visually (some terminals/themes), border segments appear
  // with wrong background. Setting bg explicitly ensures border cells
  // match the box's background, producing consistent ANSI output.
  const bg = props.backgroundColor ? parseColor(props.backgroundColor) : null

  const showTop = props.borderTop !== false
  const showBottom = props.borderBottom !== false
  const showLeft = props.borderLeft !== false
  const showRight = props.borderRight !== false

  // Helper to check if a row is visible within clip bounds
  const isRowVisible = (row: number): boolean => {
    if (!clipBounds) return row >= 0 && row < buffer.height
    return row >= clipBounds.top && row < clipBounds.bottom && row < buffer.height
  }

  // Helper to check if a column is visible within clip bounds
  const isColVisible = (col: number): boolean => {
    if (clipBounds?.left === undefined || clipBounds.right === undefined) return col >= 0 && col < buffer.width
    return col >= clipBounds.left && col < clipBounds.right && col < buffer.width
  }

  // Top border
  if (showTop && isRowVisible(y)) {
    if (showLeft && isColVisible(x)) buffer.setCell(x, y, { char: chars.topLeft, fg: color, bg })
    for (let col = x + 1; col < x + width - 1 && col < buffer.width; col++) {
      if (isColVisible(col)) buffer.setCell(col, y, { char: chars.horizontal, fg: color, bg })
    }
    if (showRight && x + width - 1 < buffer.width && isColVisible(x + width - 1)) {
      buffer.setCell(x + width - 1, y, { char: chars.topRight, fg: color, bg })
    }
  }

  // Side borders — extend range when top/bottom borders are hidden
  const sideStart = showTop ? y + 1 : y
  const sideEnd = showBottom ? y + height - 1 : y + height
  for (let row = sideStart; row < sideEnd; row++) {
    if (!isRowVisible(row)) continue
    if (showLeft && isColVisible(x)) buffer.setCell(x, row, { char: chars.vertical, fg: color, bg })
    if (showRight && x + width - 1 < buffer.width && isColVisible(x + width - 1)) {
      buffer.setCell(x + width - 1, row, { char: chars.vertical, fg: color, bg })
    }
  }

  // Bottom border
  const bottomY = y + height - 1
  if (showBottom && isRowVisible(bottomY)) {
    if (showLeft && isColVisible(x)) {
      buffer.setCell(x, bottomY, { char: chars.bottomLeft, fg: color, bg })
    }
    for (let col = x + 1; col < x + width - 1 && col < buffer.width; col++) {
      if (isColVisible(col)) buffer.setCell(col, bottomY, { char: chars.horizontal, fg: color, bg })
    }
    if (showRight && x + width - 1 < buffer.width && isColVisible(x + width - 1)) {
      buffer.setCell(x + width - 1, bottomY, {
        char: chars.bottomRight,
        fg: color,
        bg,
      })
    }
  }
}

// ============================================================================
// Outline Rendering
// ============================================================================

/**
 * Render an outline around a box.
 *
 * Unlike borders, outlines do NOT affect layout dimensions. They draw border
 * characters that OVERLAP the content area at the node's screen rect edges.
 * This is the CSS `outline` equivalent for terminal UI.
 */
export function renderOutline(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  props: BoxProps,
  clipBounds?: { top: number; bottom: number; left?: number; right?: number },
): void {
  const chars = getBorderChars(props.outlineStyle ?? "single")
  const color = props.outlineColor ? parseColor(props.outlineColor) : null
  const bg = props.backgroundColor ? parseColor(props.backgroundColor) : null
  const attrs = props.outlineDimColor ? { dim: true } : {}

  // Helper to check if a row is visible within clip bounds
  const isRowVisible = (row: number): boolean => {
    if (!clipBounds) return row >= 0 && row < buffer.height
    return row >= clipBounds.top && row < clipBounds.bottom && row < buffer.height
  }

  // Helper to check if a column is visible within clip bounds
  const isColVisible = (col: number): boolean => {
    if (clipBounds?.left === undefined || clipBounds.right === undefined) return col >= 0 && col < buffer.width
    return col >= clipBounds.left && col < clipBounds.right && col < buffer.width
  }

  const showTop = props.outlineTop !== false
  const showBottom = props.outlineBottom !== false
  const showLeft = props.outlineLeft !== false
  const showRight = props.outlineRight !== false

  // Top border
  if (showTop && isRowVisible(y)) {
    if (showLeft && isColVisible(x)) buffer.setCell(x, y, { char: chars.topLeft, fg: color, bg, attrs })
    for (let col = x + 1; col < x + width - 1 && col < buffer.width; col++) {
      if (isColVisible(col)) buffer.setCell(col, y, { char: chars.horizontal, fg: color, bg, attrs })
    }
    if (showRight && x + width - 1 < buffer.width && isColVisible(x + width - 1)) {
      buffer.setCell(x + width - 1, y, { char: chars.topRight, fg: color, bg, attrs })
    }
  }

  // Side borders — extend range when top/bottom are hidden
  const sideStart = showTop ? y + 1 : y
  const sideEnd = showBottom ? y + height - 1 : y + height
  for (let row = sideStart; row < sideEnd; row++) {
    if (!isRowVisible(row)) continue
    if (showLeft && isColVisible(x)) buffer.setCell(x, row, { char: chars.vertical, fg: color, bg, attrs })
    if (showRight && x + width - 1 < buffer.width && isColVisible(x + width - 1)) {
      buffer.setCell(x + width - 1, row, { char: chars.vertical, fg: color, bg, attrs })
    }
  }

  // Bottom border
  const bottomY = y + height - 1
  if (showBottom && isRowVisible(bottomY)) {
    if (showLeft && isColVisible(x)) {
      buffer.setCell(x, bottomY, { char: chars.bottomLeft, fg: color, bg, attrs })
    }
    for (let col = x + 1; col < x + width - 1 && col < buffer.width; col++) {
      if (isColVisible(col)) buffer.setCell(col, bottomY, { char: chars.horizontal, fg: color, bg, attrs })
    }
    if (showRight && x + width - 1 < buffer.width && isColVisible(x + width - 1)) {
      buffer.setCell(x + width - 1, bottomY, {
        char: chars.bottomRight,
        fg: color,
        bg,
        attrs,
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
 * 2. Borderless containers with overflowIndicator: Indicators appear directly
 *    after the last visible child (not at the viewport bottom)
 *
 * Uses ▲N for items hidden above, ▼N for items hidden below.
 */
export function renderScrollIndicators(
  _node: InkxNode,
  buffer: TerminalBuffer,
  layout: Rect,
  props: BoxProps,
  ss: NonNullable<InkxNode["scrollState"]>,
  ctx?: PipelineContext,
): void {
  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }

  // Inverse bar style: white text on dark background
  const indicatorStyle: Style = {
    fg: 15, // Bright white
    bg: 8, // Dark gray
    attrs: {},
  }

  // Determine if we should show indicators for borderless containers
  const showBorderless = props.overflowIndicator === true

  // Top indicator
  if (ss.hiddenAbove > 0) {
    const indicator = `\u25b2${ss.hiddenAbove}`

    if (border.top > 0) {
      // Bordered: render centered inverse bar on top border line
      const contentWidth = layout.width - border.left - border.right
      const bar = padCenter(indicator, contentWidth)
      const x = layout.x + border.left
      const y = layout.y
      renderTextLine(buffer, x, y, bar, indicatorStyle, undefined, undefined, ctx)
    } else if (showBorderless) {
      // Borderless: render centered inverse bar on first content row
      const padding = getPadding(props)
      const contentWidth = layout.width - padding.left - padding.right
      const bar = padCenter(indicator, contentWidth)
      const x = layout.x + padding.left
      const y = layout.y + padding.top
      renderTextLine(buffer, x, y, bar, indicatorStyle, undefined, undefined, ctx)
    }
  }

  // Bottom indicator
  if (ss.hiddenBelow > 0) {
    const indicator = `\u25bc${ss.hiddenBelow}`

    if (border.bottom > 0) {
      // Bordered: render centered inverse bar on bottom border line
      const contentWidth = layout.width - border.left - border.right
      const bar = padCenter(indicator, contentWidth)
      const x = layout.x + border.left
      const y = layout.y + layout.height - 1
      renderTextLine(buffer, x, y, bar, indicatorStyle, undefined, undefined, ctx)
    } else if (showBorderless) {
      // Borderless: render indicator flush to viewport bottom
      const padding = getPadding(props)
      const contentWidth = layout.width - padding.left - padding.right
      const bar = padCenter(indicator, contentWidth)
      const x = layout.x + padding.left
      const y = layout.y + layout.height - padding.bottom - 1

      renderTextLine(buffer, x, y, bar, indicatorStyle, undefined, undefined, ctx)
    }
  }
}

/** Center text within a fixed width, padding with spaces on both sides. */
function padCenter(text: string, width: number): string {
  if (text.length >= width) return text
  const leftPad = Math.floor((width - text.length) / 2)
  const rightPad = width - text.length - leftPad
  return " ".repeat(leftPad) + text + " ".repeat(rightPad)
}
