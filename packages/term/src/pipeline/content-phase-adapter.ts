/**
 * Phase 3: Content Phase (Adapter-aware)
 *
 * Render all nodes to a RenderBuffer using the current RenderAdapter.
 * This is a parallel implementation that works with any adapter (terminal, canvas, etc.)
 *
 * Key differences from content-phase.ts:
 * - Uses RenderBuffer interface instead of TerminalBuffer directly
 * - Works with pixel dimensions (canvas) or cell dimensions (terminal)
 * - Delegates to adapter for text measurement and styling
 */

import { type RenderBuffer, type RenderStyle, getRenderAdapter, hasRenderAdapter } from "../render-adapter"
import type { BoxProps, TeaNode, Rect, TextProps } from "@silvery/tea/types"
import { getBorderSize, getPadding } from "./helpers"
import { displayWidth } from "../unicode"

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Render all nodes to a RenderBuffer using the current adapter.
 *
 * @param root The root SilveryNode
 * @returns A RenderBuffer with the rendered content
 */
export function contentPhaseAdapter(root: TeaNode): RenderBuffer {
  if (!hasRenderAdapter()) {
    throw new Error("contentPhaseAdapter called without a render adapter set")
  }

  const layout = root.contentRect
  if (!layout) {
    throw new Error("contentPhaseAdapter called before layout phase")
  }

  const adapter = getRenderAdapter()
  const buffer = adapter.createBuffer(layout.width, layout.height)

  renderNodeToBuffer(root, buffer)
  return buffer
}

// ============================================================================
// Node Rendering
// ============================================================================

/** Clip bounds for vertical and optional horizontal clipping. */
interface ClipRect {
  top: number
  bottom: number
  left?: number
  right?: number
}

function renderNodeToBuffer(node: TeaNode, buffer: RenderBuffer, scrollOffset = 0, clipBounds?: ClipRect): void {
  const layout = node.contentRect
  if (!layout) return

  // Skip nodes without layout (raw text and virtual text nodes)
  if (!node.layoutNode) return

  // Skip hidden nodes (Suspense support)
  if (node.hidden) return

  const props = node.props as BoxProps & TextProps

  // Skip display="none" nodes
  if (props.display === "none") return

  // Check if this is a scrollable container
  const isScrollContainer = props.overflow === "scroll" && node.scrollState

  // Render based on node type
  if (node.type === "silvery-box") {
    renderBox(node, buffer, layout, props, clipBounds, scrollOffset)

    // Scroll indicators
    if (isScrollContainer && node.scrollState) {
      renderScrollIndicators(node, buffer, layout, props, node.scrollState)
    }
  } else if (node.type === "silvery-text") {
    renderText(node, buffer, layout, props, scrollOffset, clipBounds)
  }

  // Render children
  if (isScrollContainer && node.scrollState) {
    renderScrollContainerChildren(node, buffer, props, clipBounds)
  } else {
    renderNormalChildren(node, buffer, scrollOffset, props, clipBounds)
  }

  // Render outline AFTER children — outline overlaps content at edges
  if (node.type === "silvery-box" && props.outlineStyle) {
    const { x, width, height } = layout
    const outlineY = layout.y - scrollOffset
    renderOutlineAdapter(buffer, x, outlineY, width, height, props, clipBounds)
  }

  // Clear content dirty flag
  node.contentDirty = false
}

// ============================================================================
// Box Rendering
// ============================================================================

/**
 * Render a Box node.
 */
function renderBox(
  _node: TeaNode,
  buffer: RenderBuffer,
  layout: Rect,
  props: BoxProps,
  clipBounds?: ClipRect,
  scrollOffset = 0,
): void {
  const { x, width, height } = layout
  const y = layout.y - scrollOffset

  // Skip if completely outside clip bounds
  if (clipBounds) {
    if (y + height <= clipBounds.top || y >= clipBounds.bottom) return
    if (clipBounds.left !== undefined && clipBounds.right !== undefined) {
      if (x + width <= clipBounds.left || x >= clipBounds.right) return
    }
  }

  // Fill background if set
  if (props.backgroundColor) {
    const style: RenderStyle = { bg: props.backgroundColor }

    if (clipBounds) {
      const clippedY = Math.max(y, clipBounds.top)
      const clippedHeight = Math.min(y + height, clipBounds.bottom) - clippedY
      const clippedX = clipBounds.left !== undefined ? Math.max(x, clipBounds.left) : x
      const clippedWidth =
        clipBounds.right !== undefined ? Math.min(x + width, clipBounds.right) - clippedX : width - (clippedX - x)
      if (clippedHeight > 0 && clippedWidth > 0) {
        buffer.fillRect(clippedX, clippedY, clippedWidth, clippedHeight, style)
      }
    } else {
      buffer.fillRect(x, y, width, height, style)
    }
  }

  // Render border if set
  if (props.borderStyle) {
    renderBorder(buffer, x, y, width, height, props, clipBounds)
  }
}

/**
 * Render a border around a box.
 */
function renderBorder(
  buffer: RenderBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  props: BoxProps,
  clipBounds?: ClipRect,
): void {
  const adapter = getRenderAdapter()
  const chars = adapter.getBorderChars(props.borderStyle ?? "single")
  const style: RenderStyle = props.borderColor ? { fg: props.borderColor } : {}

  const showTop = props.borderTop !== false
  const showBottom = props.borderBottom !== false
  const showLeft = props.borderLeft !== false
  const showRight = props.borderRight !== false

  const isRowVisible = (row: number): boolean =>
    clipBounds ? row >= clipBounds.top && row < clipBounds.bottom && buffer.inBounds(0, row) : buffer.inBounds(0, row)

  // Top border
  if (showTop && isRowVisible(y)) {
    renderHorizontalBorder(
      buffer,
      x,
      y,
      width,
      showLeft,
      showRight,
      chars.topLeft,
      chars.topRight,
      chars.horizontal,
      style,
      clipBounds,
    )
  }

  // Side borders — extend range when top/bottom borders are hidden
  const rightVertical = chars.rightVertical ?? chars.vertical
  const sideStart = showTop ? y + 1 : y
  const sideEnd = showBottom ? y + height - 1 : y + height
  renderSideBorders(
    buffer,
    x,
    width,
    sideStart,
    sideEnd,
    showLeft,
    showRight,
    chars.vertical,
    rightVertical,
    style,
    isRowVisible,
    clipBounds,
  )

  // Bottom border
  const bottomHorizontal = chars.bottomHorizontal ?? chars.horizontal
  const bottomY = y + height - 1
  if (showBottom && isRowVisible(bottomY)) {
    renderHorizontalBorder(
      buffer,
      x,
      bottomY,
      width,
      showLeft,
      showRight,
      chars.bottomLeft,
      chars.bottomRight,
      bottomHorizontal,
      style,
      clipBounds,
    )
  }
}

function renderHorizontalBorder(
  buffer: RenderBuffer,
  x: number,
  row: number,
  width: number,
  showLeft: boolean,
  showRight: boolean,
  leftCorner: string,
  rightCorner: string,
  horizontal: string,
  style: RenderStyle,
  clipBounds?: ClipRect,
): void {
  const clipLeft = clipBounds?.left ?? -Infinity
  const clipRight = clipBounds?.right ?? Infinity
  if (showLeft && x >= clipLeft && x < clipRight) buffer.drawChar(x, row, leftCorner, style)
  for (let col = x + 1; col < x + width - 1; col++) {
    if (col >= clipLeft && col < clipRight && buffer.inBounds(col, row)) {
      buffer.drawChar(col, row, horizontal, style)
    }
  }
  const rightCol = x + width - 1
  if (showRight && rightCol >= clipLeft && rightCol < clipRight && buffer.inBounds(rightCol, row)) {
    buffer.drawChar(rightCol, row, rightCorner, style)
  }
}

function renderSideBorders(
  buffer: RenderBuffer,
  x: number,
  width: number,
  startRow: number,
  endRow: number,
  showLeft: boolean,
  showRight: boolean,
  leftVertical: string,
  rightVertical: string,
  style: RenderStyle,
  isRowVisible: (row: number) => boolean,
  clipBounds?: ClipRect,
): void {
  const clipLeft = clipBounds?.left ?? -Infinity
  const clipRight = clipBounds?.right ?? Infinity
  for (let row = startRow; row < endRow; row++) {
    if (!isRowVisible(row)) continue
    if (showLeft && x >= clipLeft && x < clipRight) buffer.drawChar(x, row, leftVertical, style)
    const rightCol = x + width - 1
    if (showRight && rightCol >= clipLeft && rightCol < clipRight && buffer.inBounds(rightCol, row)) {
      buffer.drawChar(rightCol, row, rightVertical, style)
    }
  }
}

// ============================================================================
// Outline Rendering
// ============================================================================

/**
 * Render an outline around a box (adapter version).
 *
 * Unlike borders, outlines do NOT affect layout dimensions. They draw border
 * characters that OVERLAP the content area at the node's screen rect edges.
 */
function renderOutlineAdapter(
  buffer: RenderBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  props: BoxProps,
  clipBounds?: ClipRect,
): void {
  const adapter = getRenderAdapter()
  const chars = adapter.getBorderChars(props.outlineStyle ?? "single")
  const style: RenderStyle = {}
  if (props.outlineColor) style.fg = props.outlineColor
  if (props.outlineDimColor) style.attrs = { dim: true }

  const isRowVisible = (row: number): boolean =>
    clipBounds ? row >= clipBounds.top && row < clipBounds.bottom && buffer.inBounds(0, row) : buffer.inBounds(0, row)

  // Top border
  if (isRowVisible(y)) {
    renderHorizontalBorder(buffer, x, y, width, true, true, chars.topLeft, chars.topRight, chars.horizontal, style, clipBounds)
  }

  // Side borders
  const outRightVertical = chars.rightVertical ?? chars.vertical
  renderSideBorders(
    buffer,
    x,
    width,
    y + 1,
    y + height - 1,
    true,
    true,
    chars.vertical,
    outRightVertical,
    style,
    isRowVisible,
    clipBounds,
  )

  // Bottom border
  const outBottomHorizontal = chars.bottomHorizontal ?? chars.horizontal
  const bottomY = y + height - 1
  if (isRowVisible(bottomY)) {
    renderHorizontalBorder(
      buffer,
      x,
      bottomY,
      width,
      true,
      true,
      chars.bottomLeft,
      chars.bottomRight,
      outBottomHorizontal,
      style,
      clipBounds,
    )
  }
}

// ============================================================================
// Text Rendering
// ============================================================================

/**
 * Walk the parent chain to find the nearest ancestor Box with backgroundColor.
 * Mirrors findInheritedBg() in content-phase.ts.
 */
function findAncestorBg(node: TeaNode): string | undefined {
  let current = node.parent
  while (current) {
    const bg = (current.props as BoxProps).backgroundColor
    if (bg) return bg
    current = current.parent
  }
  return undefined
}

/**
 * Render a Text node.
 */
function renderText(
  node: TeaNode,
  buffer: RenderBuffer,
  layout: Rect,
  props: TextProps,
  scrollOffset = 0,
  clipBounds?: ClipRect,
): void {
  const { x, width: layoutWidth } = layout
  const y = layout.y - scrollOffset

  // Collect text content from children
  const text = collectTextContent(node)
  if (!text) return

  // Map underline style to supported values
  const underlineStyle = props.underlineStyle as "single" | "double" | "curly" | "dotted" | "dashed" | undefined

  // Inherit bg from nearest ancestor Box with backgroundColor
  const inheritedBg = props.backgroundColor ?? findAncestorBg(node)

  // Build style from props
  const style: RenderStyle = {
    fg: props.color ?? undefined,
    bg: inheritedBg ?? undefined,
    attrs: {
      bold: props.bold,
      dim: props.dim,
      italic: props.italic,
      underline: props.underline,
      underlineStyle,
      underlineColor: props.underlineColor ?? undefined,
      strikethrough: props.strikethrough,
      inverse: props.inverse,
    },
  }

  // Skip if outside vertical clip bounds
  if (clipBounds && (y < clipBounds.top || y >= clipBounds.bottom)) {
    return
  }

  // Determine the maximum column for text rendering.
  // Clip to: (1) the node's own layout width, and (2) any horizontal clip bounds from overflow="hidden" ancestors.
  let maxCol = x + layoutWidth
  if (clipBounds?.right !== undefined) {
    maxCol = Math.min(maxCol, clipBounds.right)
  }

  // Determine the starting column (horizontal clip from left)
  let startCol = x
  if (clipBounds?.left !== undefined) {
    startCol = Math.max(startCol, clipBounds.left)
  }

  // Skip if entirely clipped horizontally
  if (startCol >= maxCol) return

  // Truncate text to fit within the available width
  const truncated = truncateToWidth(text, maxCol - x)
  if (!truncated) return

  buffer.drawText(x, y, truncated, style)
}

/**
 * Truncate text to fit within a given display width.
 * Respects multi-column characters (CJK, emoji).
 */
function truncateToWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return ""
  const textWidth = displayWidth(text)
  if (textWidth <= maxWidth) return text

  // Need to truncate — iterate character by character
  let width = 0
  let end = 0
  for (const char of text) {
    const charWidth = displayWidth(char)
    if (width + charWidth > maxWidth) break
    width += charWidth
    end += char.length
  }
  return text.slice(0, end)
}

/**
 * Collect text content from a node and its children.
 */
function collectTextContent(node: TeaNode): string {
  // Raw text nodes have textContent set directly
  if (node.isRawText && node.textContent !== undefined) {
    return node.textContent
  }

  let result = ""
  for (const child of node.children) {
    result += collectTextContent(child)
  }
  return result
}

// ============================================================================
// Scroll Indicators
// ============================================================================

interface ScrollState {
  offset: number
  contentHeight: number
  viewportHeight: number
  firstVisibleChild: number
  lastVisibleChild: number
  stickyChildren?: Array<{
    index: number
    naturalTop: number
    renderOffset: number
  }>
}

/**
 * Render scroll indicators for a scrollable container.
 */
function renderScrollIndicators(
  _node: TeaNode,
  buffer: RenderBuffer,
  layout: Rect,
  props: BoxProps,
  scrollState: ScrollState,
): void {
  const { x, width, height } = layout
  const y = layout.y

  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, right: 0 }
  const canScrollUp = scrollState.offset > 0
  const canScrollDown = scrollState.offset + scrollState.viewportHeight < scrollState.contentHeight

  const indicatorX = x + width - border.right - 1
  const style: RenderStyle = { fg: props.borderColor ?? "#808080" }

  // Up indicator
  if (canScrollUp) {
    const indicatorY = y + border.top
    if (buffer.inBounds(indicatorX, indicatorY)) {
      buffer.drawChar(indicatorX, indicatorY, "▲", style)
    }
  }

  // Down indicator
  if (canScrollDown) {
    const indicatorY = y + height - border.bottom - 1
    if (buffer.inBounds(indicatorX, indicatorY)) {
      buffer.drawChar(indicatorX, indicatorY, "▼", style)
    }
  }
}

// ============================================================================
// Children Rendering
// ============================================================================

/**
 * Render children of a scroll container.
 */
function renderScrollContainerChildren(
  node: TeaNode,
  buffer: RenderBuffer,
  props: BoxProps,
  clipBounds?: ClipRect,
): void {
  const layout = node.contentRect
  const ss = node.scrollState as ScrollState | undefined
  if (!layout || !ss) return

  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
  const padding = getPadding(props)

  const nodeClip: ClipRect = {
    top: layout.y + border.top + padding.top,
    bottom: layout.y + layout.height - border.bottom - padding.bottom,
    left: layout.x + border.left + padding.left,
    right: layout.x + layout.width - border.right - padding.right,
  }

  const childClipBounds: ClipRect = clipBounds
    ? {
        top: Math.max(clipBounds.top, nodeClip.top),
        bottom: Math.min(clipBounds.bottom, nodeClip.bottom),
        left: Math.max(clipBounds.left ?? nodeClip.left!, nodeClip.left!),
        right: Math.min(clipBounds.right ?? nodeClip.right!, nodeClip.right!),
      }
    : nodeClip

  // Render visible children
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    if (!child) continue
    const childProps = child.props as BoxProps

    if (childProps.position === "sticky") continue
    if (i < ss.firstVisibleChild || i > ss.lastVisibleChild) continue

    renderNodeToBuffer(child, buffer, ss.offset, childClipBounds)
  }

  // Render sticky children
  if (ss.stickyChildren) {
    for (const sticky of ss.stickyChildren) {
      const child = node.children[sticky.index]
      if (!child?.contentRect) continue

      const stickyScrollOffset = sticky.naturalTop - sticky.renderOffset
      renderNodeToBuffer(child, buffer, stickyScrollOffset, childClipBounds)
    }
  }
}

/**
 * Render children of a normal container.
 */
function renderNormalChildren(
  node: TeaNode,
  buffer: RenderBuffer,
  scrollOffset: number,
  props: BoxProps,
  clipBounds?: ClipRect,
): void {
  const layout = node.contentRect
  if (!layout) return

  let effectiveClipBounds = clipBounds

  if (props.overflow === "hidden") {
    const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
    const padding = getPadding(props)

    // Adjust layout position by scrollOffset to get screen coordinates
    const adjustedY = layout.y - scrollOffset
    const nodeClip: ClipRect = {
      top: adjustedY + border.top + padding.top,
      bottom: adjustedY + layout.height - border.bottom - padding.bottom,
      left: layout.x + border.left + padding.left,
      right: layout.x + layout.width - border.right - padding.right,
    }

    effectiveClipBounds = clipBounds
      ? {
          top: Math.max(clipBounds.top, nodeClip.top),
          bottom: Math.min(clipBounds.bottom, nodeClip.bottom),
          left: Math.max(clipBounds.left ?? nodeClip.left!, nodeClip.left!),
          right: Math.min(clipBounds.right ?? nodeClip.right!, nodeClip.right!),
        }
      : nodeClip
  }

  const hasStickyChildren = !!(node.stickyChildren && node.stickyChildren.length > 0)

  // First pass: render non-sticky children
  for (const child of node.children) {
    const childProps = child.props as BoxProps
    if (hasStickyChildren && childProps.position === "sticky") continue
    renderNodeToBuffer(child, buffer, scrollOffset, effectiveClipBounds)
  }

  // Second pass: render sticky children at their computed positions
  if (node.stickyChildren) {
    for (const sticky of node.stickyChildren) {
      const child = node.children[sticky.index]
      if (!child?.contentRect) continue
      const stickyScrollOffset = sticky.naturalTop - sticky.renderOffset
      renderNodeToBuffer(child, buffer, stickyScrollOffset, effectiveClipBounds)
    }
  }
}
