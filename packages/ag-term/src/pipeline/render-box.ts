/**
 * Box Rendering - Functions for rendering box elements to the buffer.
 *
 * Contains:
 * - Box rendering (renderBox)
 * - Border rendering (renderBorder)
 * - Scroll indicators (renderScrollIndicators), placed by
 *   overflowIndicatorPlacement (public via the pipeline barrel)
 */

import type { Color, Style, TerminalBuffer } from "../buffer"
import type { BoxProps, AgNode, Rect } from "@silvery/ag/types"
import { getBorderChars, parseColor } from "./render-helpers"
import { renderTextLine } from "./render-text"
import { createFrameSink, type RenderSink } from "./render-sink"
import { overflowIndicatorPlacement, type OverflowIndicatorPlacement } from "./overflow-indicator"
import type { NodeRenderState, PipelineContext } from "./types"
import type { ActiveColorLevel } from "./state"

/**
 * Get the effective background color string for a Box.
 * Returns explicit `backgroundColor` if set, otherwise the Theme's root
 * surface background — Sterling's `bg-surface-default` if present, falling
 * back to the legacy `bg` root for any pre-Sterling Theme shape.
 * Used by both renderBox (paint fill) and render-phase (cascade logic).
 */
export function getEffectiveBg(props: BoxProps): string | undefined {
  if (props.backgroundColor) return props.backgroundColor as string
  if (props.theme) {
    const theme = props.theme as unknown as Record<string, unknown>
    const sterlingBg = theme["bg-surface-default"]
    if (typeof sterlingBg === "string") return sterlingBg
    const legacyBg = theme["bg"]
    if (typeof legacyBg === "string") return legacyBg
  }
  return undefined
}

// ============================================================================
// Box Rendering
// ============================================================================

/**
 * Render a Box node.
 */
export function renderBox(
  _node: AgNode,
  buffer: TerminalBuffer,
  layout: Rect,
  props: BoxProps,
  nodeState: NodeRenderState,
  skipBgFill = false,
  inheritedBg?: Color | null,
  bgFillPreservesCells = false,
  inheritedFg?: Color | null,
  colorLevel?: ActiveColorLevel,
): void {
  // Phase 2 Step 4b: paint emissions route through a RenderSink so the
  // intent of each op is declared at the call site (paintFill vs fillBg).
  // BufferSink is behavior-equivalent to direct buffer mutation; once
  // every renderer routes through a sink, swapping in PlanSink at one
  // entry point will flip onto the plan/commit substrate.
  const sink: RenderSink = createFrameSink(buffer)

  const { scrollOffset, clipBounds } = nodeState
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

  // Fill background if set (explicit backgroundColor or theme.bg).
  // In incremental mode, skipBgFill=true when the box itself hasn't changed
  // (only subtreeDirty). The cloned buffer already has the correct bg fill,
  // and re-filling would destroy child pixels that won't be repainted.
  //
  // bgFillPreservesCells: use fillBg() when the parent only needs to refresh
  // background metadata while preserving cloned child chars/fg/attrs.
  const effectiveBgStr = getEffectiveBg(props)
  if (effectiveBgStr && !skipBgFill) {
    const bg = parseColor(effectiveBgStr, colorLevel)
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
        if (bgFillPreservesCells) {
          sink.emitFillBg(clippedX, clippedY, clippedWidth, clippedHeight, bg)
        } else {
          sink.emitPaintFill(clippedX, clippedY, clippedWidth, clippedHeight, { bg })
        }
      }
    } else {
      if (bgFillPreservesCells) {
        sink.emitFillBg(x, y, width, height, bg)
      } else {
        sink.emitPaintFill(x, y, width, height, { bg })
      }
    }
  }

  // Render border if set
  if (props.borderStyle) {
    renderBorder(
      buffer,
      sink,
      x,
      y,
      width,
      height,
      props,
      clipBounds,
      inheritedBg,
      inheritedFg,
      colorLevel,
    )
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
  sink: RenderSink,
  x: number,
  y: number,
  width: number,
  height: number,
  props: BoxProps,
  clipBounds?: { top: number; bottom: number; left?: number; right?: number },
  inheritedBg?: Color | null,
  inheritedFg?: Color | null,
  colorLevel?: ActiveColorLevel,
): void {
  const chars = getBorderChars(props.borderStyle ?? "single")
  // borderColor="currentColor"/"inherit" resolves to the Box's own fg —
  // explicit props.color if set, else the inherited fg from the nearest
  // ancestor with a color. Mirrors CSS `border-color: currentColor`.
  let color: Color | null
  if (props.borderColor === "currentColor" || props.borderColor === "inherit") {
    color = props.color ? parseColor(props.color, colorLevel) : (inheritedFg ?? null)
  } else {
    color = props.borderColor ? parseColor(props.borderColor, colorLevel) : null
  }
  // Preserve the box's background color on border cells. Falls back to
  // inherited bg from the nearest ancestor with backgroundColor, ensuring
  // border cells don't punch transparent holes through parent backgrounds.
  const baseBg = props.backgroundColor
    ? parseColor(props.backgroundColor, colorLevel)
    : (inheritedBg ?? null)

  // Per-side border background colors — each side falls back to the shorthand
  // borderBackgroundColor, then to the box's own bg / inherited bg.
  const borderBgStr = (props as BoxProps).borderBackgroundColor
  const borderBgBase = borderBgStr ? parseColor(borderBgStr, colorLevel) : baseBg
  const topBorderBgStr = (props as BoxProps).borderTopBackgroundColor
  const bottomBorderBgStr = (props as BoxProps).borderBottomBackgroundColor
  const leftBorderBgStr = (props as BoxProps).borderLeftBackgroundColor
  const rightBorderBgStr = (props as BoxProps).borderRightBackgroundColor
  const topBg = topBorderBgStr ? parseColor(topBorderBgStr, colorLevel) : borderBgBase
  const bottomBg = bottomBorderBgStr ? parseColor(bottomBorderBgStr, colorLevel) : borderBgBase
  const leftBg = leftBorderBgStr ? parseColor(leftBorderBgStr, colorLevel) : borderBgBase
  const rightBg = rightBorderBgStr ? parseColor(rightBorderBgStr, colorLevel) : borderBgBase

  const showTop = props.borderTop !== false
  const showBottom = props.borderBottom !== false
  const showLeft = props.borderLeft !== false
  const showRight = props.borderRight !== false

  // Helper to check if a row is visible within clip bounds
  const isRowVisible = (row: number): boolean => {
    if (!clipBounds) return row >= 0 && row < sink.height
    return row >= clipBounds.top && row < clipBounds.bottom && row < sink.height
  }

  // Helper to check if a column is visible within clip bounds
  const isColVisible = (col: number): boolean => {
    if (clipBounds?.left === undefined || clipBounds.right === undefined) {
      return col >= 0 && col < sink.width
    }
    return col >= clipBounds.left && col < clipBounds.right && col < sink.width
  }

  // Top border — corners use the bg of the horizontal side (top/bottom)
  if (showTop && isRowVisible(y)) {
    if (showLeft && isColVisible(x)) {
      sink.emitSetCell(x, y, { char: chars.topLeft, fg: color, bg: topBg })
    }
    const hStart = showLeft ? x + 1 : x
    const hEnd = showRight ? x + width - 1 : x + width
    for (let col = hStart; col < hEnd && col < sink.width; col++) {
      if (isColVisible(col)) {
        sink.emitSetCell(col, y, { char: chars.horizontal, fg: color, bg: topBg })
      }
    }
    if (showRight && x + width - 1 < sink.width && isColVisible(x + width - 1)) {
      sink.emitSetCell(x + width - 1, y, { char: chars.topRight, fg: color, bg: topBg })
    }
  }

  // Side borders — extend range when top/bottom borders are hidden
  const rightVertical = chars.rightVertical ?? chars.vertical
  const sideStart = showTop ? y + 1 : y
  const sideEnd = showBottom ? y + height - 1 : y + height
  for (let row = sideStart; row < sideEnd; row++) {
    if (!isRowVisible(row)) continue
    if (showLeft && isColVisible(x)) {
      sink.emitSetCell(x, row, { char: chars.vertical, fg: color, bg: leftBg })
    }
    if (showRight && x + width - 1 < sink.width && isColVisible(x + width - 1)) {
      sink.emitSetCell(x + width - 1, row, { char: rightVertical, fg: color, bg: rightBg })
    }
  }

  // Bottom border
  const bottomHorizontal = chars.bottomHorizontal ?? chars.horizontal
  const bottomY = y + height - 1
  if (showBottom && isRowVisible(bottomY)) {
    if (showLeft && isColVisible(x)) {
      sink.emitSetCell(x, bottomY, { char: chars.bottomLeft, fg: color, bg: bottomBg })
    }
    const bStart = showLeft ? x + 1 : x
    const bEnd = showRight ? x + width - 1 : x + width
    for (let col = bStart; col < bEnd && col < sink.width; col++) {
      if (isColVisible(col)) {
        sink.emitSetCell(col, bottomY, { char: bottomHorizontal, fg: color, bg: bottomBg })
      }
    }
    if (showRight && x + width - 1 < sink.width && isColVisible(x + width - 1)) {
      sink.emitSetCell(x + width - 1, bottomY, {
        char: chars.bottomRight,
        fg: color,
        bg: bottomBg,
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
 * characters OUTSIDE the box — one cell beyond each edge, in the gap/margin
 * space between siblings. This matches CSS `outline` semantics.
 *
 * The outline occupies cells at (x-1, y-1) through (x+width, y+height) —
 * entirely outside the box's own rect. Content is never overlapped.
 */
export function renderOutline(
  buffer: TerminalBuffer,
  sink: RenderSink,
  x: number,
  y: number,
  width: number,
  height: number,
  props: BoxProps,
  clipBounds?: { top: number; bottom: number; left?: number; right?: number },
  inheritedBg?: Color | null,
  colorLevel?: ActiveColorLevel,
): void {
  const chars = getBorderChars(props.outlineStyle ?? "single")
  const color = props.outlineColor ? parseColor(props.outlineColor, colorLevel) : null
  const bg = props.backgroundColor
    ? parseColor(props.backgroundColor, colorLevel)
    : (inheritedBg ?? null)
  const attrs = props.outlineDimColor ? { dim: true } : {}

  // Outline draws OUTSIDE the box: one cell beyond each edge
  const ox = x - 1 // outline left column
  const oy = y - 1 // outline top row
  const ow = width + 2 // outline total width
  const oh = height + 2 // outline total height

  // Helper to check if a row is visible within clip bounds
  const isRowVisible = (row: number): boolean => {
    if (!clipBounds) return row >= 0 && row < sink.height
    return row >= clipBounds.top && row < clipBounds.bottom && row < sink.height
  }

  // Helper to check if a column is visible within clip bounds
  const isColVisible = (col: number): boolean => {
    if (clipBounds?.left === undefined || clipBounds.right === undefined) {
      return col >= 0 && col < sink.width
    }
    return col >= clipBounds.left && col < clipBounds.right && col < sink.width
  }

  const showTop = props.outlineTop !== false
  const showBottom = props.outlineBottom !== false
  const showLeft = props.outlineLeft !== false
  const showRight = props.outlineRight !== false

  // Top border (one row above the box)
  if (showTop && isRowVisible(oy)) {
    if (showLeft && isColVisible(ox)) {
      sink.emitSetCell(ox, oy, { char: chars.topLeft, fg: color, bg, attrs })
    }
    for (let col = ox + 1; col < ox + ow - 1 && col < sink.width; col++) {
      if (isColVisible(col)) {
        sink.emitSetCell(col, oy, { char: chars.horizontal, fg: color, bg, attrs })
      }
    }
    if (showRight && ox + ow - 1 < sink.width && isColVisible(ox + ow - 1)) {
      sink.emitSetCell(ox + ow - 1, oy, { char: chars.topRight, fg: color, bg, attrs })
    }
  }

  // Side borders — run along the box's own height (y to y+height-1)
  const outlineRightVertical = chars.rightVertical ?? chars.vertical
  const sideStart = showTop ? oy + 1 : oy
  const sideEnd = showBottom ? oy + oh - 1 : oy + oh
  for (let row = sideStart; row < sideEnd; row++) {
    if (!isRowVisible(row)) continue
    if (showLeft && isColVisible(ox)) {
      sink.emitSetCell(ox, row, { char: chars.vertical, fg: color, bg, attrs })
    }
    if (showRight && ox + ow - 1 < sink.width && isColVisible(ox + ow - 1)) {
      sink.emitSetCell(ox + ow - 1, row, { char: outlineRightVertical, fg: color, bg, attrs })
    }
  }

  // Bottom border (one row below the box)
  const outlineBottomHorizontal = chars.bottomHorizontal ?? chars.horizontal
  const bottomY = oy + oh - 1
  if (showBottom && isRowVisible(bottomY)) {
    if (showLeft && isColVisible(ox)) {
      sink.emitSetCell(ox, bottomY, { char: chars.bottomLeft, fg: color, bg, attrs })
    }
    for (let col = ox + 1; col < ox + ow - 1 && col < sink.width; col++) {
      if (isColVisible(col)) {
        sink.emitSetCell(col, bottomY, { char: outlineBottomHorizontal, fg: color, bg, attrs })
      }
    }
    if (showRight && ox + ow - 1 < sink.width && isColVisible(ox + ow - 1)) {
      sink.emitSetCell(ox + ow - 1, bottomY, {
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

export {
  overflowIndicatorPlacement,
  type OverflowIndicatorEdge,
  type OverflowIndicatorPlacement,
  type OverflowIndicatorPlacementInput,
} from "./overflow-indicator"

/**
 * Render scroll indicators showing hidden items above/below the viewport:
 * `▲N` for items hidden above, `▼N` for items hidden below, drawn where
 * {@link overflowIndicatorPlacement} puts them: on the border line of a
 * bordered edge, on the first/last content row of a borderless edge when
 * `overflowIndicator` is set.
 *
 * The indicators are the scroll container's own paint, like its background and
 * border (see {@link renderBox}). They are placed at the container's screen
 * position (`layout.y - scrollOffset`) and clipped to the `clipBounds` the
 * container renders under. An indicator row outside that clip paints nothing,
 * which matches the clip-aware pointer hit test. If it painted, it would draw
 * over whatever owns those cells, and an incremental frame would keep that
 * owner's clean cells on the fast path while a fresh frame repaints them.
 */
export function renderScrollIndicators(
  _node: AgNode,
  buffer: TerminalBuffer,
  layout: Rect,
  props: BoxProps,
  ss: NonNullable<AgNode["scrollState"]>,
  nodeState: Pick<NodeRenderState, "scrollOffset" | "clipBounds">,
  ctx?: PipelineContext,
): void {
  const rawBg = getEffectiveBg(props)
  const bg = rawBg ? (parseColor(rawBg) ?? null) : null
  const indicatorStyle: Style = {
    fg: 15, // Bright white
    bg,
    attrs: {},
  }
  const { scrollOffset, clipBounds } = nodeState
  const screenLayout: Rect = { ...layout, y: layout.y - scrollOffset }

  // Top first, then bottom: on a shared row the bottom indicator wins.
  const top = overflowIndicatorPlacement({
    edge: "top",
    hidden: ss.hiddenAbove,
    layout: screenLayout,
    props,
  })
  if (top) renderOverflowIndicator(buffer, top, indicatorStyle, clipBounds, ctx)
  const bottom = overflowIndicatorPlacement({
    edge: "bottom",
    hidden: ss.hiddenBelow,
    layout: screenLayout,
    props,
  })
  if (bottom) renderOverflowIndicator(buffer, bottom, indicatorStyle, clipBounds, ctx)
}

function renderOverflowIndicator(
  buffer: TerminalBuffer,
  placement: OverflowIndicatorPlacement,
  style: Style,
  clipBounds: NodeRenderState["clipBounds"],
  ctx?: PipelineContext,
): void {
  const { y, x, width, text, rowX, rowWidth } = placement
  if (clipBounds && (y < clipBounds.top || y >= clipBounds.bottom)) return
  // The painted span is the placement's row span narrowed to the clip.
  const left = Math.max(rowX, clipBounds?.left ?? rowX)
  const right = Math.min(rowX + rowWidth, clipBounds?.right ?? rowX + rowWidth)
  if (right <= left) return
  // Clear the whole indicator row first. The viewport window can replace an
  // item row with an overflow-indicator row after scrolling; without explicit
  // clears, incremental output leaves stale item glyphs around the centered
  // token. Keep the clears matching the container background so fresh and
  // incremental buffers agree on the surrounding blank cells.
  renderTextLine(
    buffer,
    left,
    y,
    " ".repeat(right - left),
    { fg: null, bg: style.bg, attrs: {} },
    right,
    undefined,
    ctx,
  )
  // Clip the glyph to its own cells within the painted span, so no more than
  // the placement's [x, x + width) reaches the buffer. Every glyph character
  // is one cell wide, so a cell offset is a string offset.
  const glyphLeft = Math.max(x, left)
  const glyphRight = Math.min(x + width, right)
  if (glyphRight <= glyphLeft) return
  renderTextLine(
    buffer,
    glyphLeft,
    y,
    text.slice(glyphLeft - x, glyphRight - x),
    style,
    glyphRight,
    undefined,
    ctx,
  )
}
