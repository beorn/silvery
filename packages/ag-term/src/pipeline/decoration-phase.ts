/**
 * Phase 3.5: Decoration Phase
 *
 * Draws "outside" decorations — content that writes pixels OUTSIDE the owning
 * node's rect, into the parent's pixel space. Currently handles outlines.
 *
 * ## Why a separate phase?
 *
 * Outlines draw 1 cell beyond each edge of a Box. Those cells are NOT part of
 * the box's own region — they live in the parent's or even grandparent's
 * space. This breaks the per-node incremental dirty cascade:
 *   - The box can be clean while its outline changed
 *   - The outline pixels are not in any single node's "region"
 *   - Clearing on removal requires knowing where the outline previously drew
 *
 * Instead of folding outlines into the cascade (which produced subtle
 * false-positive bugs at realistic scale), we treat them as a separate
 * decoration pass that runs AFTER content rendering on every frame:
 *
 *   1. Before content: restore cells under previous frame's outlines
 *      (using snapshots captured when we drew them last time)
 *   2. Content render runs as normal — no outline-specific tracking
 *   3. After content: walk the tree, draw outlines for every node with
 *      `outlineStyle`, snapshotting each written cell so the next frame
 *      can restore it
 *
 * The snapshots live on a `RenderPostState` carrier owned by `createAg`
 * (Phase 2 Step 5 of paint-clear-invariant L5; see render-post-state.ts).
 * They no longer travel with the TerminalBuffer — that decoupling lets the
 * decoration phase run against either the BufferSink-mutated buffer OR a
 * PlanSink-committed buffer interchangeably, which is the prerequisite for
 * Step 7 (PlanSink-authoritative output).
 *
 * This pattern generalizes to other overlays (focus rings, hover halos,
 * selection borders) — any decoration that draws outside its owning node.
 */

import type { TerminalBuffer, Color } from "../buffer"
import type { BoxProps, AgNode } from "@silvery/ag/types"
import { getBorderSize, getPadding } from "./helpers"
import { renderOutline, getEffectiveBg } from "./render-box"
import { parseColor } from "./render-helpers"
import { createFrameSink, type RenderSink } from "./render-sink"
import type { RenderPostState, OutlineCellSnapshot } from "./render-post-state"
import type { ClipBounds } from "./types"

export type { OutlineCellSnapshot } from "./render-post-state"

/**
 * Restore cells at previously-drawn outline positions to their pre-outline
 * state. Called at the start of each incremental render, before the content
 * phase, on the cloned buffer. No-op when there are no previous snapshots
 * (fresh render or no outlines last frame).
 *
 * Phase 2 Step 5 (paint-clear-invariant L5): snapshots are read from the
 * `RenderPostState` carrier owned by `createAg`, NOT from the buffer. The
 * sink still receives a `setOutlineSnapshots([])` op so the plan-shape
 * captures the cleanup intent for parity tests; the authoritative state
 * lives in `postState.outlineSnapshots`.
 */
export function clearPreviousOutlines(buffer: TerminalBuffer, postState: RenderPostState): void {
  const snapshots = postState.outlineSnapshots
  if (snapshots.length === 0) return
  const sink: RenderSink = createFrameSink(buffer)
  for (const snap of snapshots) {
    sink.emitSetCell(snap.x, snap.y, snap.cell)
  }
  // Clear the post-state directly so the next phase (renderDecorationPass)
  // starts from an empty list. The sink op records the intent in the plan
  // for parity tests but does NOT mutate the carrier — `renderDecorationPass`
  // will overwrite postState.outlineSnapshots with the fresh snapshot list.
  postState.outlineSnapshots = []
  sink.setOutlineSnapshots([])
}

/**
 * Walk the node tree, drawing outlines for every node with `outlineStyle`.
 * Captures per-cell snapshots so the next frame can restore these positions.
 *
 * Called AFTER the content render phase on every frame (both fresh and
 * incremental). Mirrors `renderNodeToBuffer`'s state threading for scroll
 * offsets, clip bounds, and inherited background — but does nothing except
 * visit the tree and draw outlines.
 *
 * Phase 2 Step 5 (paint-clear-invariant L5): snapshots are written to the
 * `RenderPostState` carrier; the sink op is recorded in the plan for parity
 * tests only. After this call, `postState.outlineSnapshots` holds exactly
 * the cells that need restoring on the next frame.
 */
export function renderDecorationPass(
  buffer: TerminalBuffer,
  root: AgNode,
  postState: RenderPostState,
): void {
  const snapshots: OutlineCellSnapshot[] = []
  const sink: RenderSink = createFrameSink(buffer)
  walk(root, buffer, sink, 0, undefined, { color: null }, snapshots)
  postState.outlineSnapshots = snapshots
  sink.setOutlineSnapshots(snapshots)
}

/**
 * Recursive tree walk. Each invocation corresponds to the state at a single
 * node — scroll offset, clip bounds, inherited background — matching what
 * `renderNodeToBuffer` would have threaded through its `NodeRenderState`.
 */
function walk(
  node: AgNode,
  buffer: TerminalBuffer,
  sink: RenderSink,
  scrollOffset: number,
  clipBounds: ClipBounds | undefined,
  inheritedBg: { color: Color },
  snapshots: OutlineCellSnapshot[],
): void {
  // Virtual text nodes have no layout — they're rendered by their parent's
  // text collection pass. Nothing to draw and no children to descend.
  if (!node.layoutNode) return
  const layout = node.boxRect
  if (!layout) return

  // Respect the same visibility gates as the content phase.
  if (node.hidden) return
  const props = node.props as BoxProps
  if (props.display === "none") return

  // Apply scroll offset to the effective y position.
  const y = layout.y - scrollOffset

  // Off-screen viewport clipping — mirrors renderNodeToBuffer. Keeps the
  // walker cheap: large scroll containers with many hidden children return
  // early for any node entirely outside the visible window.
  if (y >= sink.height || y + layout.height <= 0) return

  // Compute the effective background the outline should inherit from this
  // box — matches the `boxInheritedBg` calculation in renderOwnContent.
  const effectiveBg = getEffectiveBg(props)
  const theme = props.theme as Record<string, unknown> | undefined
  const themeBg =
    theme && typeof theme["bg-surface-default"] === "string"
      ? (theme["bg-surface-default"] as string)
      : theme && typeof theme["bg"] === "string"
        ? (theme["bg"] as string)
        : undefined
  const childInheritedBg: { color: Color } = effectiveBg
    ? { color: parseColor(effectiveBg) }
    : themeBg !== undefined
      ? { color: parseColor(themeBg) }
      : inheritedBg

  // Draw the outline AFTER content — this means we paint on top of whatever
  // siblings rendered in the gap around this box. The snapshot captures
  // those pre-outline pixels so the next frame can restore them.
  if (node.type === "silvery-box" && props.outlineStyle) {
    const boxInheritedBg = effectiveBg ? undefined : inheritedBg.color
    const positions = collectOutlineCells(
      layout.x,
      y,
      layout.width,
      layout.height,
      props,
      clipBounds,
      sink.width,
      sink.height,
    )
    for (const pos of positions) {
      // Snapshot the cell BEFORE the outline overwrites it.
      snapshots.push({ x: pos.x, y: pos.y, cell: buffer.getCell(pos.x, pos.y) })
    }
    renderOutline(
      buffer,
      sink,
      layout.x,
      y,
      layout.width,
      layout.height,
      props,
      clipBounds,
      boxInheritedBg,
    )
  }

  // Descend into children with the appropriate state. Scroll containers
  // override scrollOffset for their normal-flow children; sticky children
  // use their computed sticky offset. Clip bounds tighten for overflow
  // containers.
  if (node.children.length === 0) return

  const isScrollContainer = props.overflow === "scroll" && node.scrollState
  const clipX = (props.overflowX ?? props.overflow) === "hidden"
  const clipY = (props.overflowY ?? props.overflow) === "hidden"

  if (isScrollContainer) {
    const ss = node.scrollState!
    const childClip = computeChildClip(layout, props, clipBounds, 0, false, true)
    // Non-sticky children: rendered with container scroll offset.
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]
      if (!child) continue
      const cp = child.props as BoxProps
      if (cp.position === "sticky") continue
      if (i < ss.firstVisibleChild || i > ss.lastVisibleChild) continue
      walk(child, buffer, sink, ss.offset, childClip, childInheritedBg, snapshots)
    }
    // Sticky children: rendered at their computed sticky offset.
    if (ss.stickyChildren) {
      for (const sticky of ss.stickyChildren) {
        const child = node.children[sticky.index]
        if (!child) continue
        const stickyOffset = sticky.naturalTop - sticky.renderOffset
        walk(child, buffer, sink, stickyOffset, childClip, childInheritedBg, snapshots)
      }
    }
  } else {
    const childClip =
      clipX || clipY
        ? computeChildClip(layout, props, clipBounds, scrollOffset, clipX, clipY)
        : clipBounds
    for (const child of node.children) {
      walk(child, buffer, sink, scrollOffset, childClip, childInheritedBg, snapshots)
    }
  }
}

/**
 * Compute the cells an outline would write, given the same inputs
 * `renderOutline` uses. Kept in lockstep with render-box.ts — any change to
 * the outline geometry (e.g., new outline styles, per-side toggles) must be
 * mirrored here. If they drift, the snapshots won't cover every cell the
 * next `renderOutline` call writes, and stale pixels will leak through.
 *
 * Uses the SAME visibility checks as `renderOutline` so the snapshot set is
 * an exact match for the cell set the renderer will overwrite.
 */
function collectOutlineCells(
  x: number,
  y: number,
  width: number,
  height: number,
  props: BoxProps,
  clipBounds: ClipBounds | undefined,
  bufferWidth: number,
  bufferHeight: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  const ox = x - 1
  const oy = y - 1
  const ow = width + 2
  const oh = height + 2

  const isRowVisible = (row: number): boolean => {
    if (!clipBounds) return row >= 0 && row < bufferHeight
    return row >= clipBounds.top && row < clipBounds.bottom && row < bufferHeight
  }
  const isColVisible = (col: number): boolean => {
    if (clipBounds?.left === undefined || clipBounds.right === undefined)
      return col >= 0 && col < bufferWidth
    return col >= clipBounds.left && col < clipBounds.right && col < bufferWidth
  }

  const showTop = props.outlineTop !== false
  const showBottom = props.outlineBottom !== false
  const showLeft = props.outlineLeft !== false
  const showRight = props.outlineRight !== false

  // Top row
  if (showTop && isRowVisible(oy)) {
    if (showLeft && isColVisible(ox)) out.push({ x: ox, y: oy })
    for (let col = ox + 1; col < ox + ow - 1 && col < bufferWidth; col++) {
      if (isColVisible(col)) out.push({ x: col, y: oy })
    }
    if (showRight && ox + ow - 1 < bufferWidth && isColVisible(ox + ow - 1)) {
      out.push({ x: ox + ow - 1, y: oy })
    }
  }

  // Sides
  const sideStart = showTop ? oy + 1 : oy
  const sideEnd = showBottom ? oy + oh - 1 : oy + oh
  for (let row = sideStart; row < sideEnd; row++) {
    if (!isRowVisible(row)) continue
    if (showLeft && isColVisible(ox)) out.push({ x: ox, y: row })
    if (showRight && ox + ow - 1 < bufferWidth && isColVisible(ox + ow - 1)) {
      out.push({ x: ox + ow - 1, y: row })
    }
  }

  // Bottom row
  const bottomY = oy + oh - 1
  if (showBottom && isRowVisible(bottomY)) {
    if (showLeft && isColVisible(ox)) out.push({ x: ox, y: bottomY })
    for (let col = ox + 1; col < ox + ow - 1 && col < bufferWidth; col++) {
      if (isColVisible(col)) out.push({ x: col, y: bottomY })
    }
    if (showRight && ox + ow - 1 < bufferWidth && isColVisible(ox + ow - 1)) {
      out.push({ x: ox + ow - 1, y: bottomY })
    }
  }

  return out
}

/**
 * Local copy of `computeChildClipBounds` from render-phase.ts. The decoration
 * walker can't import private render-phase helpers without tangling modules,
 * so we reproduce the same computation here. Must stay in sync.
 */
function computeChildClip(
  layout: NonNullable<AgNode["boxRect"]>,
  props: BoxProps,
  parentClip: ClipBounds | undefined,
  scrollOffset: number,
  horizontal: boolean,
  vertical: boolean,
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
    result.left = parentClip.left
    result.right = parentClip.right
  }
  return result
}
