/**
 * Phase 3: Render Phase (Adapter-aware) -- DIVERGENT RENDERER
 *
 * A simplified, adapter-agnostic content renderer that renders the full node
 * tree to a RenderBuffer every frame. Used by `executeRenderAdapter()` for
 * non-terminal targets (xterm.js web showcases, canvas, etc.) where the main
 * terminal-optimized render phase cannot be used.
 *
 * Relationship to render-phase.ts:
 *   render-phase.ts is the primary renderer for terminal output. It has
 *   incremental rendering (dirty flags, buffer cloning, fast-path skips),
 *   bg inheritance via findInheritedBg(), ANSI-aware text rendering, theme
 *   context propagation, region clearing, excess area cleanup, descendant
 *   overflow detection, and extensive instrumentation/STRICT mode support.
 *
 *   This file is a parallel implementation that re-implements the same tree
 *   traversal and rendering logic but against the abstract RenderBuffer
 *   interface (drawChar/drawText/fillRect) instead of TerminalBuffer directly.
 *
 * Why it exists:
 *   The RenderAdapter abstraction (see render-adapter.ts) allows silvery to
 *   target different backends -- terminal, xterm.js, canvas. The main
 *   render-phase.ts is tightly coupled to TerminalBuffer (cell-level access,
 *   getCellBg, scrollRegion, packed metadata). This adapter version works with
 *   any RenderBuffer implementation, making it usable for web showcases and
 *   future non-terminal targets.
 *
 * Known divergences from render-phase.ts:
 *   - No incremental rendering: full re-render every frame (no dirty flag
 *     evaluation, no buffer cloning, no fast-path skips)
 *   - No bg inheritance via findInheritedBg() for text -- uses a simpler
 *     ancestor walk (findAncestorBg) that doesn't handle all edge cases
 *   - No theme context propagation (pushContextTheme/popContextTheme)
 *   - No region clearing or excess area cleanup (not needed without
 *     incremental rendering since the buffer starts fresh each frame)
 *   - No instrumentation, STRICT mode, or diagnostic support
 *   - No ANSI-aware text rendering (collectTextContent is plain string
 *     concatenation, not the segment-based BgSegment approach)
 *   - No absolute/sticky incremental rendering optimizations in renderNormalChildren
 *     (three-pass paint order is implemented but without hasPrevBuffer/ancestorCleared cascading)
 *
 * Future direction:
 *   The xterm-unification design (docs/design/xterm-unification.md) proposes
 *   eliminating this file by making xterm.js use the main terminal pipeline
 *   via createXtermProvider(). Since xterm.js is a terminal emulator that
 *   accepts ANSI output, it can use the real render-phase.ts + output-phase.ts
 *   and benefit from incremental rendering. Until then, this file must be
 *   maintained in parallel -- any rendering feature added to render-phase.ts
 *   may need a corresponding (simplified) implementation here.
 */

import { type RenderBuffer, type RenderStyle, getRenderAdapter, hasRenderAdapter } from "../render-adapter"
import type { BoxProps, AgNode, Rect, TextProps } from "@silvery/ag/types"
import { getBorderSize, getPadding } from "./helpers"
import { displayWidth } from "../unicode"
import { formatTextLines } from "./render-text"

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Render all nodes to a RenderBuffer using the current adapter.
 *
 * @param root The root SilveryNode
 * @returns A RenderBuffer with the rendered content
 */
export function renderPhaseAdapter(root: AgNode): RenderBuffer {
  if (!hasRenderAdapter()) {
    throw new Error("renderPhaseAdapter called without a render adapter set")
  }

  const layout = root.contentRect
  if (!layout) {
    throw new Error("renderPhaseAdapter called before layout phase")
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

function renderNodeToBuffer(node: AgNode, buffer: RenderBuffer, scrollOffset = 0, clipBounds?: ClipRect): void {
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
  _node: AgNode,
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

  const showTop = props.outlineTop !== false
  const showBottom = props.outlineBottom !== false
  const showLeft = props.outlineLeft !== false
  const showRight = props.outlineRight !== false

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

  // Side borders — extend range when top/bottom are hidden
  const outRightVertical = chars.rightVertical ?? chars.vertical
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
    outRightVertical,
    style,
    isRowVisible,
    clipBounds,
  )

  // Bottom border
  const outBottomHorizontal = chars.bottomHorizontal ?? chars.horizontal
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
 * Mirrors findInheritedBg() in render-phase.ts.
 */
function findAncestorBg(node: AgNode): string | undefined {
  let current = node.parent
  while (current) {
    const bg = (current.props as BoxProps).backgroundColor
    if (bg) return bg
    current = current.parent
  }
  return undefined
}

/** A segment of text with its resolved style. */
interface StyledSegment {
  text: string
  style: RenderStyle
}

/** Style context for nested Text style inheritance (mirrors render-text.ts StyleContext). */
interface AdapterStyleContext {
  color?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  underlineStyle?: "single" | "double" | "curly" | "dotted" | "dashed"
  underlineColor?: string
  inverse?: boolean
  strikethrough?: boolean
}

/** Merge child TextProps into parent style context. Child values override parent. */
function mergeAdapterStyleContext(parent: AdapterStyleContext, childProps: TextProps): AdapterStyleContext {
  return {
    color: childProps.color ?? parent.color,
    bold: childProps.bold ?? parent.bold,
    dim: childProps.dim ?? (childProps as any).dimColor ?? parent.dim,
    italic: childProps.italic ?? parent.italic,
    underline: childProps.underline ?? parent.underline,
    underlineStyle: (childProps.underlineStyle as AdapterStyleContext["underlineStyle"]) ?? parent.underlineStyle,
    underlineColor: childProps.underlineColor ?? parent.underlineColor,
    inverse: childProps.inverse ?? parent.inverse,
    strikethrough: childProps.strikethrough ?? parent.strikethrough,
  }
}

/** Build a RenderStyle from a style context and inherited bg. */
function contextToRenderStyle(ctx: AdapterStyleContext, bg?: string): RenderStyle {
  return {
    fg: ctx.color ?? undefined,
    bg: bg ?? undefined,
    attrs: {
      bold: ctx.bold,
      dim: ctx.dim,
      italic: ctx.italic,
      underline: ctx.underline,
      underlineStyle: ctx.underlineStyle,
      underlineColor: ctx.underlineColor,
      strikethrough: ctx.strikethrough,
      inverse: ctx.inverse,
    },
  }
}

/**
 * Collect styled text segments from a node tree.
 *
 * Walks the tree like render-text.ts collectTextContent but instead of embedding
 * ANSI codes, returns an array of { text, style } segments. The adapter renders
 * each segment with its own RenderStyle via drawText — no ANSI parsing needed.
 *
 * Handles: nested Text style push/pop, internal_transform, display="none" skipping.
 */
function collectStyledSegments(
  node: AgNode,
  parentContext: AdapterStyleContext,
  inheritedBg: string | undefined,
  segments: StyledSegment[],
): void {
  // Raw text nodes — emit a segment with the current style
  if (node.textContent !== undefined) {
    if (node.textContent.length > 0) {
      segments.push({
        text: node.textContent,
        style: contextToRenderStyle(parentContext, inheritedBg),
      })
    }
    return
  }

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!
    const childProps = child.props as TextProps & BoxProps

    // Skip display="none" children
    if (childProps?.display === "none") continue

    // Skip hidden children (Suspense)
    if (child.hidden) continue

    // Nested virtual Text node with style props
    if (child.type === "silvery-text" && child.props && !child.layoutNode) {
      const childContext = mergeAdapterStyleContext(parentContext, childProps)

      // Check for internal_transform
      const childTransform = (childProps as any).internal_transform as
        | ((text: string, index: number) => string)
        | undefined

      if (childTransform) {
        // Collect child's plain text first, apply transform, then emit as styled segment
        const plainText = collectPlainTextAdapter(child)
        if (plainText.length > 0) {
          const transformed = childTransform(plainText, i)
          if (transformed.length > 0) {
            segments.push({
              text: transformed,
              style: contextToRenderStyle(childContext, inheritedBg),
            })
          }
        }
      } else {
        // Recurse into children with merged style context
        collectStyledSegments(child, childContext, inheritedBg, segments)
      }
    } else {
      // Not a styled Text node — recurse with parent context
      collectStyledSegments(child, parentContext, inheritedBg, segments)
    }
  }
}

/**
 * Collect plain text from a node tree (no styles). Used for internal_transform
 * application which needs the full concatenated text before transformation.
 */
function collectPlainTextAdapter(node: AgNode): string {
  if (node.textContent !== undefined) return node.textContent
  let result = ""
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!
    const childProps = child.props as TextProps & BoxProps
    if (childProps?.display === "none") continue
    if (child.hidden) continue
    let childText = collectPlainTextAdapter(child)
    if (childText.length > 0 && (child.props as any)?.internal_transform) {
      childText = (child.props as any).internal_transform(childText, i)
    }
    result += childText
  }
  return result
}

/**
 * Render a Text node.
 */
function renderText(
  node: AgNode,
  buffer: RenderBuffer,
  layout: Rect,
  props: TextProps,
  scrollOffset = 0,
  clipBounds?: ClipRect,
): void {
  const { x, width: layoutWidth } = layout
  const y = layout.y - scrollOffset

  // Build root style context from the Text node's own props
  const rootContext: AdapterStyleContext = {
    color: props.color ?? undefined,
    bold: props.bold,
    dim: props.dim,
    italic: props.italic,
    underline: props.underline,
    underlineStyle: props.underlineStyle as AdapterStyleContext["underlineStyle"],
    underlineColor: props.underlineColor ?? undefined,
    inverse: props.inverse,
    strikethrough: props.strikethrough,
  }

  // Inherit bg from nearest ancestor Box with backgroundColor
  const inheritedBg = props.backgroundColor ?? findAncestorBg(node)

  // Collect styled segments from all children
  const segments: StyledSegment[] = []
  collectStyledSegments(node, rootContext, inheritedBg, segments)

  // Build flat text for formatTextLines (wrapping/truncation)
  const text = segments.map((s) => s.text).join("")
  if (!text) return

  // Skip if outside vertical clip bounds
  if (clipBounds && (y < clipBounds.top || y >= clipBounds.bottom)) {
    return
  }

  // Determine the maximum column for text rendering.
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

  // Format text into lines (handles wrapping, truncation, newlines)
  const availableWidth = maxCol - x
  const lines = formatTextLines(text, availableWidth, props.wrap)

  // If all segments have the same style (common case), use fast path
  if (segments.length <= 1) {
    const style = segments.length === 1 ? segments[0]!.style : contextToRenderStyle(rootContext, inheritedBg)
    for (let i = 0; i < lines.length; i++) {
      const lineY = y + i
      if (clipBounds && (lineY < clipBounds.top || lineY >= clipBounds.bottom)) continue
      if (!buffer.inBounds(0, lineY)) continue
      const truncated = truncateToWidth(lines[i]!, availableWidth)
      if (truncated) {
        buffer.drawText(x, lineY, truncated, style)
      }
    }
    return
  }

  // Multi-segment path: render each line with per-character style lookup.
  // Build a character-to-segment index for the flat text.
  const segmentForChar: number[] = new Array(text.length)
  let charIdx = 0
  for (let s = 0; s < segments.length; s++) {
    const segText = segments[s]!.text
    for (let j = 0; j < segText.length; j++) {
      segmentForChar[charIdx++] = s
    }
  }

  // Track how far we've consumed in the flat text across lines
  let flatOffset = 0

  for (let i = 0; i < lines.length; i++) {
    const lineY = y + i
    if (clipBounds && (lineY < clipBounds.top || lineY >= clipBounds.bottom)) {
      // Still advance flatOffset past this line
      flatOffset = advanceFlatOffset(text, flatOffset, lines[i]!)
      continue
    }
    if (!buffer.inBounds(0, lineY)) {
      flatOffset = advanceFlatOffset(text, flatOffset, lines[i]!)
      continue
    }

    const line = lines[i]!
    const truncated = truncateToWidth(line, availableWidth)
    if (!truncated) {
      flatOffset = advanceFlatOffset(text, flatOffset, line)
      continue
    }

    // Render truncated line character by character with per-segment styles
    let col = x
    const lineStartOffset = flatOffset
    let lineCharIdx = 0
    for (const char of truncated) {
      if (col >= maxCol) break
      const srcIdx = lineStartOffset + lineCharIdx
      const segIdx = srcIdx < segmentForChar.length ? segmentForChar[srcIdx]! : 0
      const style = segments[segIdx]!.style
      const charWidth = displayWidth(char)
      if (col + charWidth <= maxCol) {
        buffer.drawChar(col, lineY, char, style)
        // Mark continuation cells for wide characters
        for (let w = 1; w < charWidth; w++) {
          if (buffer.inBounds(col + w, lineY)) {
            buffer.drawChar(col + w, lineY, "", style)
          }
        }
      }
      col += charWidth
      lineCharIdx += char.length
    }

    flatOffset = advanceFlatOffset(text, flatOffset, line)
  }
}

/**
 * Advance the flat text offset past a formatted line.
 * formatTextLines may split on whitespace or add ellipsis — we need to find
 * where this line's content came from in the original flat text.
 */
function advanceFlatOffset(flatText: string, offset: number, line: string): number {
  // Skip leading whitespace that formatTextLines may have trimmed
  while (offset < flatText.length && (flatText[offset] === " " || flatText[offset] === "\n")) {
    // Check if the line starts with this whitespace — if so, don't skip it
    if (line.length > 0 && line[0] === flatText[offset]) break
    offset++
  }
  // Advance past the line's characters in the flat text
  let lineIdx = 0
  while (lineIdx < line.length && offset < flatText.length) {
    // Handle ellipsis in truncated text — the ellipsis char isn't in the source
    if (line[lineIdx] === "\u2026") {
      lineIdx++
      continue
    }
    if (line[lineIdx] === flatText[offset]) {
      lineIdx++
      offset++
    } else {
      // Mismatch — skip source char (may have been trimmed by wrapping)
      offset++
    }
  }
  return offset
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
 * Collect text content from a node and its children (flat string, no styles).
 * Used by external callers that only need the plain text.
 */
function collectTextContent(node: AgNode): string {
  // Raw text nodes have textContent set directly
  if (node.isRawText && node.textContent !== undefined) {
    return node.textContent
  }

  let result = ""
  for (const child of node.children) {
    const childProps = child.props as TextProps & BoxProps
    // Skip display="none" children
    if (childProps?.display === "none") continue
    // Skip hidden children (Suspense)
    if (child.hidden) continue
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
  _node: AgNode,
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
  node: AgNode,
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
  node: AgNode,
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

  // Multi-pass rendering to match CSS paint order (and render-phase.ts):
  // 1. Normal-flow children (skip sticky and absolute)
  // 2. Sticky children at computed positions
  // 3. Absolute children on top of everything

  // First pass: render normal-flow children (skip sticky + absolute)
  let hasAbsoluteChildren = false
  for (const child of node.children) {
    const childProps = child.props as BoxProps
    if (childProps.position === "absolute") {
      hasAbsoluteChildren = true
      continue // Skip — rendered in third pass
    }
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

  // Third pass: render absolute children on top (CSS paint order)
  if (hasAbsoluteChildren) {
    for (const child of node.children) {
      const childProps = child.props as BoxProps
      if (childProps.position !== "absolute") continue
      renderNodeToBuffer(child, buffer, scrollOffset, effectiveClipBounds)
    }
  }
}
