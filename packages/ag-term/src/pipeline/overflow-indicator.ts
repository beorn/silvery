/** Shared overflow-indicator placement for the painter and ListView hit tests. */

import type { BoxProps, Rect } from "@silvery/ag/types"
import { getBorderSize, getPadding } from "./helpers"

/** The viewport edge an overflow indicator sits on: `▲N` top, `▼N` bottom. */
export type OverflowIndicatorEdge = "top" | "bottom"

/** Input to {@link overflowIndicatorPlacement}. */
export interface OverflowIndicatorPlacementInput {
  /** Which edge's indicator to place. */
  edge: OverflowIndicatorEdge
  /**
   * Items hidden past this edge: the scroll container's
   * `scrollState.hiddenAbove` for `"top"`, `scrollState.hiddenBelow` for
   * `"bottom"`. There is no indicator unless this is greater than 0.
   */
  hidden: number
  /**
   * The scroll container's rect. The placement comes back in the same
   * coordinate space. The painter passes the container's screen position
   * (`boxRect` shifted by the scroll offset it renders under), and hit tests
   * pass its `screenRect`.
   */
  layout: Rect
  /**
   * The scroll container's own props, as given to the Box. Read:
   * `borderStyle` and the per-side `borderTop`/`borderBottom`/`borderLeft`/
   * `borderRight` switches, the padding props, and `overflowIndicator`.
   */
  props: BoxProps
}

/**
 * Where one edge's overflow indicator is drawn. Row `y` carries it; the
 * glyph's own cells are `[x, x + width)`, centred in the blanked row span
 * `[rowX, rowX + rowWidth)`.
 */
export interface OverflowIndicatorPlacement {
  /** The row the indicator is drawn on. */
  y: number
  /** First column of the glyph text. */
  x: number
  /**
   * Cells the glyph text covers. Every character of `▲N`/`▼N` is one cell
   * wide, so this is `text.length`, and `[x, x + width)` is exactly the set
   * of cells the painter draws the glyph into: the region a click must land
   * in to hit the indicator, as opposed to the rest of its row.
   */
  width: number
  /** The glyph text as drawn: `▲N` or `▼N`, cut to `rowWidth` cells when wider. */
  text: string
  /** First column of the row span the painter blanks before drawing the glyph. */
  rowX: number
  /** Width of that blanked row span. */
  rowWidth: number
}

/**
 * Place the overflow indicator for one edge of a scroll container: the one
 * home of the indicator's layout rule. {@link renderScrollIndicators} paints
 * exactly what this returns, and mouse hit-tests call it to tell a click on
 * the glyph from a click elsewhere on its row, so the two cannot disagree.
 *
 * Decided per edge:
 * - The edge has a border line (as `getBorderSize` counts it: `borderStyle`
 *   set and that side not switched off): the indicator is centred on the
 *   border line, across the columns between the left and right borders.
 *   Padding plays no part.
 * - The edge has no border line and `overflowIndicator` is set: it is centred
 *   on the first (top) or last (bottom) content row, inside the padding.
 * - Otherwise: `undefined`, nothing is drawn for that edge. Likewise when
 *   nothing is hidden past the edge, or when the row span has no width.
 *
 * When both edges resolve to the same row, the painter draws the bottom
 * indicator last, so the bottom one is what shows there.
 */
export function overflowIndicatorPlacement(
  input: OverflowIndicatorPlacementInput,
): OverflowIndicatorPlacement | undefined {
  const { edge, hidden, layout, props } = input
  if (!(hidden > 0)) return undefined

  const border = getBorderSize(props)
  const onBorderLine = edge === "top" ? border.top > 0 : border.bottom > 0

  let rowX: number
  let rowWidth: number
  let y: number
  if (onBorderLine) {
    rowX = layout.x + border.left
    rowWidth = layout.width - border.left - border.right
    y = edge === "top" ? layout.y : layout.y + layout.height - 1
  } else if (props.overflowIndicator === true) {
    const padding = getPadding(props)
    rowX = layout.x + padding.left
    rowWidth = layout.width - padding.left - padding.right
    y = edge === "top" ? layout.y + padding.top : layout.y + layout.height - padding.bottom - 1
  } else {
    return undefined
  }
  if (rowWidth <= 0) return undefined

  const glyph = `${edge === "top" ? "\u25b2" : "\u25bc"}${hidden}`
  const text = glyph.length > rowWidth ? glyph.slice(0, rowWidth) : glyph
  const x = rowX + Math.max(0, Math.floor((rowWidth - text.length) / 2))
  return { y, x, width: text.length, text, rowX, rowWidth }
}
