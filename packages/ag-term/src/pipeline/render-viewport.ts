/**
 * Render a `silvery-viewport` node into the parent {@link TerminalBuffer}.
 *
 * A viewport is an OPAQUE blit: the foreign cell domain owned by the viewport's
 * {@link ViewportNodeState} is copied 1:1 into the parent buffer at the node's
 * `boxRect`. The viewport does NOT participate in bg-coherence with the parent
 * — the bg-conflict throw in `render-text.ts` is structurally side-stepped
 * because viewport cells route through {@link TerminalBuffer.setCell} directly,
 * never through {@link renderText}.
 *
 * See {@link viewport-types.ts} in `@silvery/ag` and bead
 * `@km/silvery/15513-surface-nested-composition-primitive`.
 */

import type { TerminalBuffer, CellPatch, Color } from "../buffer"
import type { AgNode, Cell, Rect } from "@silvery/ag/types"
import { parseColor } from "./render-helpers"

/**
 * Blit the foreign cell buffer at `node.viewportState.buffer` into `buffer`
 * at `layout` (the viewport's content rect in absolute parent-buffer
 * coordinates). Cells outside `buffer`'s bounds are silently clipped — the
 * Viewport rect's right/bottom may extend off-screen and that's fine.
 */
export function renderViewport(
  node: AgNode,
  buffer: TerminalBuffer,
  layout: Rect,
  scrollOffset: number,
): void {
  const state = node.viewportState
  if (!state) return
  const src = state.buffer
  const baseX = layout.x
  const baseY = layout.y - scrollOffset

  // Clip blit region to the intersection of the viewport rect and the
  // foreign buffer's grid. We don't enlarge to the foreign buffer's
  // dimensions if the layout rect is smaller — the parent layout decides
  // visible bounds.
  const drawW = Math.min(layout.width, src.cols)
  const drawH = Math.min(layout.height, src.rows)

  for (let r = 0; r < drawH; r++) {
    const dstY = baseY + r
    if (dstY < 0 || dstY >= buffer.height) continue
    for (let c = 0; c < drawW; c++) {
      const dstX = baseX + c
      if (dstX < 0 || dstX >= buffer.width) continue
      const cell = src.getCell(c, r)
      // The viewport's CellBuffer is the source of truth — we copy the cell's
      // visible state verbatim (char, fg, bg, attrs, wide). Continuation cells
      // surface as-is so wide-char handling round-trips through the foreign
      // source's encoding.
      buffer.setCell(dstX, dstY, viewportCellToPatch(cell))
    }
  }
}

/**
 * Convert a viewport {@link Cell} (string-colored, framework-agnostic shape
 * from `@silvery/ag/types`) to a {@link CellPatch} the parent
 * {@link TerminalBuffer} accepts (Color = `number | RGB | null`). String
 * colors are parsed once per cell — the upcoming xterm adapter writes
 * pre-resolved RGB strings, so parseColor's fast path runs.
 */
function viewportCellToPatch(cell: Cell): CellPatch {
  return {
    char: cell.char,
    fg: cell.fg === null ? null : (parseColor(cell.fg) as Color),
    bg: cell.bg === null ? null : (parseColor(cell.bg) as Color),
    attrs: cell.attrs,
    wide: cell.wide,
    continuation: cell.continuation,
  }
}
