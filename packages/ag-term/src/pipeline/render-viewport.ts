/**
 * Render a `silvery-viewport` node into the parent {@link TerminalBuffer}.
 *
 * A viewport is an OPAQUE blit: the foreign cell domain owned by the viewport's
 * {@link ViewportNodeState} is copied into the parent buffer at the node's
 * `boxRect`, with source gaps painted as blanks. The viewport does NOT
 * participate in bg-coherence with the parent — the bg-conflict throw in
 * `render-text.ts` is structurally side-stepped because viewport cells route
 * through the render-sink directly, never through {@link renderText}.
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
import type { CellBuffer } from "@silvery/ag/viewport-types"
import type { RenderSink } from "./render-sink"
import { parseColor } from "./render-helpers"
import type { ClipBounds, PipelineContext } from "./types"
import { assertIslandRenderInvariants, ensureIslandStrictInstrumentation } from "../strict-island"

/**
 * Blit the foreign cell buffer at `node.viewportState.buffer` into `buffer`
 * (via `sink.emitSetCell`) at `layout` (the viewport's content rect in
 * absolute parent-buffer coordinates). The full layout rect is painted so
 * cloned parent buffers cannot retain stale cells where the source is smaller.
 * The blit is clipped like every other own-content paint: to `clipBounds`,
 * the node's clip from its clipping ancestors (`nodeState.clipBounds`), and
 * to the buffer's bounds.
 */
export function renderViewport(
  node: AgNode,
  buffer: TerminalBuffer,
  sink: RenderSink,
  layout: Rect,
  scrollOffset: number,
  clipBounds: ClipBounds | undefined,
  ctx?: PipelineContext,
): void {
  const state = node.viewportState
  emitOpaqueBlit(
    state?.buffer ?? null,
    buffer,
    sink,
    layout,
    scrollOffset,
    clipBounds,
    null,
    false,
    ctx,
  )
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
function viewportCellToPatch(
  cell: Cell,
  inheritedBg: Color = null,
  ctx?: PipelineContext,
): CellPatch {
  return {
    char: cell.char,
    fg: cell.fg === null ? null : (parseColor(cell.fg, ctx?.colorLevel) as Color),
    bg: cell.bg === null ? inheritedBg : (parseColor(cell.bg, ctx?.colorLevel) as Color),
    attrs: cell.attrs,
    hyperlink: cell.hyperlink,
    wide: cell.wide,
    continuation: cell.continuation,
  }
}

function blankCellToPatch(inheritedBg: Color = null): CellPatch {
  return {
    char: " ",
    fg: null,
    bg: inheritedBg,
    attrs: {},
    wide: false,
    continuation: false,
  }
}

function emitOpaqueBlit(
  src: CellBuffer | null,
  buffer: TerminalBuffer,
  sink: RenderSink,
  layout: Rect,
  scrollOffset: number,
  clipBounds: ClipBounds | undefined,
  inheritedBg: Color = null,
  selectableMode = false,
  ctx?: PipelineContext,
): void {
  const baseX = layout.x
  const baseY = layout.y - scrollOffset
  const blank = blankCellToPatch(inheritedBg)
  // Clip like every other own-content paint: to the clip the node renders
  // under (from its clipping ancestors), then to the buffer. Cells past a
  // scroll or hidden ancestor belong to whatever paints there (#26811).
  const top = Math.max(0, clipBounds?.top ?? 0)
  const bottom = Math.min(buffer.height, clipBounds?.bottom ?? buffer.height)
  const left = Math.max(0, clipBounds?.left ?? 0)
  const right = Math.min(buffer.width, clipBounds?.right ?? buffer.width)

  // Viewports and islands are opaque cell domains. Paint the whole layout
  // rect, not just the currently available source grid, so cloned host buffers
  // cannot retain stale cells after a guest resize, deferred init, or remount.
  for (let r = 0; r < layout.height; r++) {
    const dstY = baseY + r
    if (dstY < top || dstY >= bottom) continue
    for (let c = 0; c < layout.width; c++) {
      const dstX = baseX + c
      if (dstX < left || dstX >= right) continue
      const cell =
        src && r < src.rows && c < src.cols
          ? viewportCellToPatch(src.getCell(c, r), inheritedBg, ctx)
          : blank
      sink.emitSetCell(dstX, dstY, cell, selectableMode)
    }
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
 * When the host node has no `islandState` (factory still mounting) or the
 * guest's `init()` hasn't resolved yet (`handle === null`, lifecycle
 * `"pending"` / `"errored"` / `"disposed"`), the island still paints its full
 * rect as inherited-background blanks. The host region is opaque even when no
 * guest frame is ready.
 *
 * Cursor handling: `IslandOutputOwner.cursor` is the guest's internal
 * cursor descriptor. v1 (Phase 1) does NOT render the guest cursor into the
 * host frame — the host cursor sits OUTSIDE the island, and the
 * `IslandModesOwner` contract un-applies the host cursor on focus blur to
 * the island. Phase 3 of `@km/silvery/15646-islands` wires the guest cursor
 * into the host's cursor signal (separate epic unit); until then, the
 * cursor field is read by the focus aggregator, not the blit.
 *
 * Clipping: same as viewport — the blit paints only inside `clipBounds` (the
 * node's clip from its clipping ancestors) and the parent buffer; an island
 * taller or wider than a scroll/hidden ancestor, or overshooting the parent
 * buffer, paints only its visible intersection.
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
  clipBounds: ClipBounds | undefined,
  inheritedBg: Color = null,
  selectableMode = false,
  ctx?: PipelineContext,
): void {
  const state = node.islandState
  if (!state) {
    emitOpaqueBlit(
      null,
      buffer,
      sink,
      layout,
      scrollOffset,
      clipBounds,
      inheritedBg,
      selectableMode,
      ctx,
    )
    return
  }
  const handle = state.handle
  // Deferred-hydrate or async-init islands have no handle until the guest's
  // `init()` resolves. The island rect is still opaque, so emit blank cells
  // instead of letting cloned parent-buffer content survive under it.
  if (!handle) {
    emitOpaqueBlit(
      null,
      buffer,
      sink,
      layout,
      scrollOffset,
      clipBounds,
      inheritedBg,
      selectableMode,
      ctx,
    )
    return
  }
  ensureIslandStrictInstrumentation(node)
  assertIslandRenderInvariants(node, layout)
  const src = handle.output.buffer
  emitOpaqueBlit(
    src,
    buffer,
    sink,
    layout,
    scrollOffset,
    clipBounds,
    inheritedBg,
    selectableMode,
    ctx,
  )
}
