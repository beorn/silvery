/**
 * STRICT bordered-rect-clip — assert every painted cell stays inside the
 * nearest bordered ancestor's inner content rect.
 *
 * Bead: @km/silvery/cell-outside-rect-strict-check (P2, 2026-05-08).
 *
 * The pattern this catches: a `<Box borderStyle="round">` containing a
 * `<Text>` whose content overflows the box's inner content area. Without
 * `overflow="hidden"` on the box (and without `wrap="truncate"` on the
 * text), the text engine paints cells past the box's inner rect, blowing
 * through the border or bleeding into siblings. The bug shape is silent:
 * `expect(buffer.text).toContain("...")` may still pass — the offending
 * cells just sit at unexpected positions.
 *
 * Mechanic in detail:
 *
 *   1. Push the current rendering AgNode onto a module-level stack right
 *      before `renderOwnContent` dispatches to renderBox/renderText. Pop
 *      after.
 *   2. The `BufferSink.emitSetCell` hook (the single canonical
 *      single-cell paint site) reads the top of stack. Walk node.parent
 *      until a node with `borderStyle != null` is found. That's the
 *      bordered ancestor.
 *   3. Skip the assertion when the bordered ancestor has `overflow="hidden"`
 *      / `overflowX/overflowY="hidden"` — `computeChildClipBounds`
 *      already enforces the clip there (render-phase.ts:1826-1831).
 *      Those nodes are safe by construction.
 *   4. Otherwise: assert (x, y) lies inside the inner rect:
 *        innerLeft   = boxRect.x      + (borderLeft   ? 1 : 0)
 *        innerTop    = boxRect.y      + (borderTop    ? 1 : 0)
 *        innerRight  = boxRect.x + W  - (borderRight  ? 1 : 0)
 *        innerBottom = boxRect.y + H  - (borderBottom ? 1 : 0)
 *      Throws `BorderedRectClipError` on first violation.
 *
 * Per-call memoization: every emitSetCell during a single `renderText` /
 * `renderBox` call shares the same rendering node, so the bordered-ancestor
 * walk is cached against that node identity. Cost amortizes to O(depth)
 * per renderer dispatch, not O(depth × cells).
 *
 * Tier 2 (paranoid). `SILVERY_STRICT=2` enables, `SILVERY_STRICT=1` does
 * NOT (would be too noisy if any pre-existing offender slipped through —
 * see test:fast smoke at the bottom of this file).
 *
 * Why a module-level stack instead of threading the node into the sink:
 * every renderer (renderBox, renderText, decoration helpers) constructs
 * its own local sink via `createFrameSink(buffer)`. Threading would touch
 * 50+ call sites. The stack pattern mirrors the already-shipped
 * `_frameCapturePlanSink` in render-sink.ts — same shape, same lifetime
 * discipline (push around the dispatch, pop in `finally`).
 */

import type { AgNode, BoxProps, Rect } from "@silvery/ag/types"
import { isStrictEnabled } from "./strict-mode.js"

/** SILVERY_STRICT slug for the bordered-rect clip check. Tier 2 by design. */
export const BORDERED_RECT_CLIP_SLUG = "bordered-rect-clip"
export const BORDERED_RECT_CLIP_MIN_TIER = 2

/** Returns true when the bordered-rect clip check should fire. */
export function isBorderedRectClipEnabled(): boolean {
  return isStrictEnabled(BORDERED_RECT_CLIP_SLUG, BORDERED_RECT_CLIP_MIN_TIER)
}

/**
 * Error thrown when a cell is painted outside the nearest bordered
 * ancestor's inner content rect under SILVERY_STRICT=bordered-rect-clip.
 *
 * Like `IncrementalRenderMismatchError`, this should NOT be caught by
 * general error handlers — it indicates a real layout/clip bug that
 * needs a structural fix (`overflow="hidden"` on the bordered Box, or
 * `wrap="truncate"` on the inner Text).
 */
export class BorderedRectClipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BorderedRectClipError"
  }
}

// ---------------------------------------------------------------------------
// Rendering-node stack
// ---------------------------------------------------------------------------

const renderingStack: AgNode[] = []

/** Push the node currently being painted onto the rendering stack. */
export function pushRenderingNode(node: AgNode): void {
  renderingStack.push(node)
}

/** Pop the most recently pushed rendering node. */
export function popRenderingNode(): void {
  renderingStack.pop()
}

/** Peek the topmost rendering node, or null if the stack is empty. */
export function peekRenderingNode(): AgNode | null {
  return renderingStack.length === 0 ? null : (renderingStack[renderingStack.length - 1] ?? null)
}

// ---------------------------------------------------------------------------
// Bordered-ancestor helper
// ---------------------------------------------------------------------------

/**
 * Walk `node.parent` until we find a node with `borderStyle != null`.
 * Returns null when no ancestor is bordered (the outer canvas itself
 * has no border to honor).
 *
 * Excludes the starting node — a bordered Box's own border cells sit on
 * its perimeter (outside its OWN inner rect). The relevant constraint is
 * "stay inside the parent that borders me", not "stay inside myself".
 */
export function findBorderedAncestor(node: AgNode): AgNode | null {
  let current: AgNode | null = node.parent
  while (current) {
    const props = current.props as BoxProps | undefined
    if (props && props.borderStyle != null) return current
    current = current.parent
  }
  return null
}

// ---------------------------------------------------------------------------
// Per-renderer-call memoization
// ---------------------------------------------------------------------------

/**
 * Bordered-ancestor lookup result, cached against the topmost rendering
 * node identity. The renderer dispatches one `renderText` / `renderBox`
 * call per AgNode, and inside that call every emitSetCell shares the
 * same currently-rendering node. So a single-slot cache amortizes the
 * O(depth) walk to once per dispatch, not per cell.
 *
 * `cachedFor === null` means "no entry"; `cachedAncestor === null`
 * means "no bordered ancestor exists" (legitimate — outer-canvas paint).
 */
let cachedFor: AgNode | null = null
let cachedAncestor: AgNode | null = null
let cachedSkip: boolean = false

function getBorderedAncestorCached(node: AgNode): {
  ancestor: AgNode | null
  skip: boolean
} {
  if (cachedFor === node) return { ancestor: cachedAncestor, skip: cachedSkip }
  cachedFor = node
  cachedAncestor = findBorderedAncestor(node)
  cachedSkip = cachedAncestor != null && hasOverflowHidden(cachedAncestor)
  return { ancestor: cachedAncestor, skip: cachedSkip }
}

function hasOverflowHidden(node: AgNode): boolean {
  const p = node.props as BoxProps | undefined
  if (!p) return false
  if (p.overflow === "hidden") return true
  if (p.overflowX === "hidden" && p.overflowY === "hidden") return true
  return false
}

/** Reset the per-render cache. Called at the boundary of each rendering
 *  push/pop so a stale identity from a previous frame never leaks. */
export function resetBorderedRectClipCache(): void {
  cachedFor = null
  cachedAncestor = null
  cachedSkip = false
}

// ---------------------------------------------------------------------------
// Inner-rect math
// ---------------------------------------------------------------------------

interface InnerRect {
  left: number
  top: number
  right: number // exclusive
  bottom: number // exclusive
}

function computeInnerRect(box: Rect, props: BoxProps): InnerRect {
  // Mirrors getBorderSize in pipeline/helpers.ts: each side contributes 1
  // cell when the side is not explicitly disabled. We're not in pixel
  // mode here (line-height check is for canvas/DOM targets); the strict
  // check fires in terminal renders only.
  const top = props.borderTop !== false ? 1 : 0
  const bottom = props.borderBottom !== false ? 1 : 0
  const left = props.borderLeft !== false ? 1 : 0
  const right = props.borderRight !== false ? 1 : 0
  return {
    left: box.x + left,
    top: box.y + top,
    right: box.x + box.width - right,
    bottom: box.y + box.height - bottom,
  }
}

// ---------------------------------------------------------------------------
// The assertion
// ---------------------------------------------------------------------------

interface AssertCellOpts {
  char?: string
  bg?: unknown
  fg?: unknown
}

/**
 * Assert that cell (x, y) lies inside the nearest bordered ancestor's
 * inner content rect. No-op when:
 *   - the strict slug is not enabled
 *   - no rendering node is on the stack (paint outside a renderer
 *     dispatch — e.g. early init clear)
 *   - no bordered ancestor exists
 *   - the bordered ancestor has overflow="hidden" (clip enforced
 *     elsewhere by computeChildClipBounds)
 *
 * Throws `BorderedRectClipError` on violation.
 */
export function assertCellInsideBorderedRect(
  x: number,
  y: number,
  opts: AssertCellOpts = {},
): void {
  if (!isBorderedRectClipEnabled()) return
  const node = peekRenderingNode()
  if (!node) return
  const { ancestor, skip } = getBorderedAncestorCached(node)
  if (!ancestor || skip) return
  // Use screenRect (post-scroll, post-sticky) — NOT boxRect (content-space).
  // The painted (x, y) is in screen coordinates: a node inside an
  // overflow="scroll" container can have boxRect.y far below the
  // viewport while its screenRect.y sits in the visible region. Using
  // boxRect here would wrongly flag every scrolled child paint.
  // Falls back to scrollRect (== screenRect for non-sticky), then
  // boxRect (early-frame fallback) — but the fallback shouldn't fire
  // in well-formed renders.
  const box = ancestor.screenRect ?? ancestor.scrollRect ?? ancestor.boxRect
  if (!box) return
  const props = ancestor.props as BoxProps
  const inner = computeInnerRect(box, props)
  if (x >= inner.left && x < inner.right && y >= inner.top && y < inner.bottom) return

  // Out of bounds — build the diagnostic.
  const ancestorId = describeNode(ancestor)
  const nodeId = describeNode(node)
  const path = describeDepthPath(node)
  const charDesc = opts.char ? `'${opts.char}'` : "(unknown)"
  const bgDesc = formatColor(opts.bg)
  const fgDesc = formatColor(opts.fg)
  const msg =
    `STRICT bordered-rect-clip: cell painted outside ancestor's bordered rect\n` +
    `  cell:        (x=${x}, y=${y}) char=${charDesc} bg=${bgDesc} fg=${fgDesc}\n` +
    `  parent box:  id='${ancestorId}' rect=(${box.x},${box.y},${box.width},${box.height}) borderStyle='${props.borderStyle}'\n` +
    `  inner rect:  (left=${inner.left}, top=${inner.top}, right=${inner.right}, bottom=${inner.bottom}) [exclusive]\n` +
    `  painter:     '${nodeId}'\n` +
    `  depth path:  ${path}\n` +
    `\n` +
    `  Suggested fix: set \`overflow="hidden"\` on the bordered Box,\n` +
    `                 or use \`wrap="wrap"\` / \`wrap="truncate"\` on the inner Text.\n` +
    `\n` +
    `  Slug: SILVERY_STRICT=${BORDERED_RECT_CLIP_SLUG} (tier ${BORDERED_RECT_CLIP_MIN_TIER}+).\n` +
    `  Per-test opt-out: SILVERY_STRICT=2,!${BORDERED_RECT_CLIP_SLUG}.`
  throw new BorderedRectClipError(msg)
}

function describeNode(node: AgNode): string {
  const props = node.props as { key?: string | number } | undefined
  const key = props?.key
  if (key !== undefined) return `${node.type}[key=${String(key)}]`
  if (node.type === "silvery-text" && typeof node.textContent === "string") {
    const t = node.textContent.length > 20 ? `${node.textContent.slice(0, 20)}…` : node.textContent
    return `${node.type}[${JSON.stringify(t)}]`
  }
  return `${node.type}`
}

function describeDepthPath(node: AgNode): string {
  const parts: string[] = []
  let cur: AgNode | null = node
  let depth = 0
  while (cur && depth < 8) {
    const props = cur.props as BoxProps | undefined
    let label = cur.type
    if (props?.borderStyle) label += `[border=${props.borderStyle}]`
    parts.unshift(label)
    cur = cur.parent
    depth++
  }
  if (cur) parts.unshift("…")
  return parts.join(" > ")
}

function formatColor(c: unknown): string {
  if (c === null || c === undefined) return "default"
  if (typeof c === "number") return `${c}`
  if (typeof c === "object") {
    const o = c as { r: number; g: number; b: number }
    if (typeof o.r === "number") {
      const hex = ((o.r << 16) | (o.g << 8) | o.b).toString(16).padStart(6, "0")
      return `#${hex}`
    }
  }
  return String(c)
}
