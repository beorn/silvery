/**
 * Render a `silvery-viewport` node into the parent {@link TerminalBuffer}.
 *
 * A viewport is an OPAQUE blit: the foreign cell domain owned by the viewport's
 * {@link ViewportNodeState} is copied 1:1 into the parent buffer at the node's
 * `boxRect`. The viewport does NOT participate in bg-coherence with the parent
 * — the bg-conflict throw in `render-text.ts` is structurally side-stepped
 * because viewport cells route through the render-sink directly, never through
 * {@link renderText}.
 *
 * IMPORTANT: writes go through {@link RenderSink.emitSetCell}, NOT
 * `buffer.setCell`. Under `SILVERY_RENDER_PLAN` (default ON) the silvery
 * pipeline captures sink emissions into a plan and commits them onto a
 * replay buffer — direct buffer mutations are silently dropped. Routing
 * through the sink keeps viewport cells in the plan so they survive
 * commitSectionedPlan.
 *
 * See {@link viewport-types.ts} in `@silvery/ag` and bead
 * `@km/silvery/15513-surface-nested-composition-primitive`.
 */

import type { TerminalBuffer, CellPatch, Color } from "../buffer"
import type { AgNode, Cell, Rect } from "@silvery/ag/types"
import type { RenderSink } from "./render-sink"
import { parseColor } from "./render-helpers"
import { assertIslandRenderInvariants, ensureIslandStrictInstrumentation } from "../strict-island"

/**
 * Blit the foreign cell buffer at `node.viewportState.buffer` into `buffer`
 * (via `sink.emitSetCell`) at `layout` (the viewport's content rect in
 * absolute parent-buffer coordinates). Cells outside `buffer`'s bounds are
 * silently clipped — the Viewport rect's right/bottom may extend off-screen
 * and that's fine.
 */
export function renderViewport(
  node: AgNode,
  buffer: TerminalBuffer,
  sink: RenderSink,
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
      sink.emitSetCell(dstX, dstY, viewportCellToPatch(cell))
    }
  }
}

/**
 * Convert a viewport {@link Cell} (string-colored, framework-agnostic shape
 * from `@silvery/ag/types`) to a {@link CellPatch} the parent
 * {@link TerminalBuffer} accepts (Color = `number | RGB | null`). String
 * colors are parsed once per cell — the upcoming xterm adapter writes
 * pre-resolved RGB strings, so parseColor's fast path runs.
 *
 * Reused by {@link renderIsland} — both viewport and island share the same
 * Cell shape from `@silvery/ag/types`. Islands pass an inherited background
 * so snapshot guests can leave cell.bg null and still sit on host chrome.
 */
function viewportCellToPatch(cell: Cell, inheritedBg: Color = null): CellPatch {
  return {
    char: cell.char,
    fg: cell.fg === null ? null : (parseColor(cell.fg) as Color),
    bg: cell.bg === null ? inheritedBg : (parseColor(cell.bg) as Color),
    attrs: cell.attrs,
    wide: cell.wide,
    continuation: cell.continuation,
  }
}

/**
 * Blit a `silvery-island` node's guest cell buffer into the parent buffer.
 *
 * Sibling of {@link renderViewport}: reads from
 * `node.islandState.handle.output.buffer` (the guest's read-only output
 * surface from {@link IslandOutputOwner}) instead of
 * `node.viewportState.buffer`. Same routing — through {@link RenderSink}'s
 * `emitSetCell`, not direct buffer writes — so the cells survive
 * `commitSectionedPlan` under `SILVERY_RENDER_PLAN`.
 *
 * Bails when the host node has no `islandState` (factory still mounting) or
 * the guest's `init()` hasn't resolved yet (`handle === null`, lifecycle
 * `"pending"` / `"errored"` / `"disposed"`). In that case the parent's
 * `clearNodeRegion` (or inherited bg fill) has already painted blanks at
 * the island's rect, so we paint nothing and the host chrome shows through.
 *
 * Cursor handling: `IslandOutputOwner.cursor` is the guest's internal
 * cursor descriptor. v1 (Phase 1) does NOT render the guest cursor into the
 * host frame — the host cursor sits OUTSIDE the island, and the
 * `IslandModesOwner` contract un-applies the host cursor on focus blur to
 * the island. Phase 3 of `@km/silvery/15646-islands` wires the guest cursor
 * into the host's cursor signal (separate epic unit); until then, the
 * cursor field is read by the focus aggregator, not the blit.
 *
 * Clipping: same as viewport — out-of-bounds cells are silently dropped.
 * Both axes (right + bottom) clip; an island whose `cols×rows` overshoots
 * the parent buffer paints only its in-bounds intersection.
 *
 * See {@link island-types.ts} in `@silvery/ag` and bead
 * `@km/silvery/15646-islands`.
 */
export function renderIsland(
  node: AgNode,
  buffer: TerminalBuffer,
  sink: RenderSink,
  layout: Rect,
  scrollOffset: number,
  inheritedBg: Color = null,
): void {
  const state = node.islandState
  if (!state) return
  const handle = state.handle
  // Deferred-hydrate or async-init islands have no handle until the
  // guest's `init()` resolves. STRICT slug `island-paint-oob` (tier 2)
  // would catch a guest writing past its rect; the null-handle bail is a
  // structural guard that runs at every paint regardless of STRICT.
  if (!handle) return
  ensureIslandStrictInstrumentation(node)
  assertIslandRenderInvariants(node, layout)
  const src = handle.output.buffer
  const baseX = layout.x
  const baseY = layout.y - scrollOffset

  // Clip blit region to the intersection of the island rect and the guest's
  // current cell grid. We don't enlarge to the guest's dimensions if the
  // layout rect is smaller — the parent layout decides visible bounds (the
  // two-phase resize protocol means the guest may temporarily lag the
  // host's reported cols/rows after a resize).
  const drawW = Math.min(layout.width, src.cols)
  const drawH = Math.min(layout.height, src.rows)

  for (let r = 0; r < drawH; r++) {
    const dstY = baseY + r
    if (dstY < 0 || dstY >= buffer.height) continue
    for (let c = 0; c < drawW; c++) {
      const dstX = baseX + c
      if (dstX < 0 || dstX >= buffer.width) continue
      const cell = src.getCell(c, r)
      sink.emitSetCell(dstX, dstY, viewportCellToPatch(cell, inheritedBg))
    }
  }
}
