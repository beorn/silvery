/**
 * DOM-level Mouse Events for silvery
 *
 * Provides React DOM-compatible mouse event infrastructure:
 * - SilveryMouseEvent / SilveryWheelEvent synthetic event objects
 * - Tree-based hit testing using scrollRect (replaces manual HitRegistry)
 * - Event dispatch with bubbling (target → root, stopPropagation support)
 * - Double-click detection (300ms / 2-cell threshold)
 * - mouseenter/mouseleave tracking (no bubble, like DOM spec)
 */

import { createLogger } from "loggily"
import type { FocusManager } from "@silvery/ag/focus-manager"
import { findFocusableAncestor } from "@silvery/ag/focus-queries"
import type { ParsedMouse } from "./mouse"
import { getAncestorPath, hitTestInlineRects, pointInRect } from "@silvery/ag/tree-utils"
import type { AgNode, BoxProps, Rect, TextProps, UserSelect } from "@silvery/ag/types"
import type { SelectionScope } from "@silvery/headless/selection"
import { setHovered, setArmed } from "@silvery/ag/interactive-signals"
import {
  displayWidthAnsi,
  graphemeWidth,
  splitGraphemes,
  stripAnsi,
  wrapTextWithOffsets,
} from "./unicode"
import type { TerminalBuffer } from "./buffer"
import { resolveUserSelect } from "./user-select"

export { resolveUserSelect } from "./user-select"

// Re-export canonical types from ag (avoid duplicate type definitions)
export type { SilveryMouseEvent, SilveryWheelEvent } from "@silvery/ag/mouse-event-types"
import type { SilveryMouseEvent, SilveryWheelEvent } from "@silvery/ag/mouse-event-types"

const mouseLog = createLogger("silvery:mouse")

// ============================================================================
// Mouse Event Handler Props — canonical location is @silvery/ag
// ============================================================================

import type { MouseEventProps } from "@silvery/ag/mouse-event-types"

// ============================================================================
// Event Factory
// ============================================================================

/**
 * Create a synthetic mouse event.
 *
 * Modifier keys are merged from two sources:
 * - SGR mouse protocol: reports Ctrl, Alt/Meta, Shift (reliable)
 * - Keyboard tracking: reports Super/Cmd, Hyper, CapsLock, NumLock (via Kitty protocol)
 *
 * `metaKey` = keyboard-tracked Super (Cmd on macOS). SGR "meta" maps to `altKey`.
 */
export function createMouseEvent(
  type: SilveryMouseEvent["type"],
  x: number,
  y: number,
  target: AgNode,
  parsed: ParsedMouse,
  keyboardMods?: KeyboardModifierState,
): SilveryMouseEvent {
  let propagationStopped = false
  let defaultPrevented = false
  const metaKey = keyboardMods?.super ?? false
  if (type === "click" || type === "mousedown") {
    mouseLog.debug?.(
      `createMouseEvent(${type}) metaKey=${metaKey} keyboardMods.super=${keyboardMods?.super}`,
    )
  } else if (type === "wheel") {
    const targetId = (target.props as Record<string, unknown>).id ?? ""
    mouseLog.debug?.(
      `createMouseEvent(wheel) x=${x} y=${y} delta=${parsed.delta ?? 0} target=${target.type}#${targetId}`,
    )
  } else if (type === "mouseup") {
    mouseLog.debug?.(`createMouseEvent(mouseup) x=${x} y=${y} button=${parsed.button}`)
  }

  return {
    type,
    x,
    y,
    clientX: parsed.clientX,
    clientY: parsed.clientY,
    button: parsed.button,
    altKey: parsed.meta,
    ctrlKey: parsed.ctrl,
    metaKey,
    shiftKey: parsed.shift,
    timeStamp: parsed.receivedAt ?? performance.now(),
    inputBatchId: parsed.inputBatchId,
    target,
    currentTarget: target,
    nativeEvent: parsed,
    get propagationStopped() {
      return propagationStopped
    },
    get defaultPrevented() {
      return defaultPrevented
    },
    stopPropagation() {
      propagationStopped = true
    },
    preventDefault() {
      defaultPrevented = true
    },
  }
}

/**
 * Create a synthetic wheel event.
 */
export function createWheelEvent(
  x: number,
  y: number,
  target: AgNode,
  parsed: ParsedMouse,
  keyboardMods?: KeyboardModifierState,
): SilveryWheelEvent {
  const base = createMouseEvent("wheel", x, y, target, parsed, keyboardMods) as SilveryWheelEvent
  base.deltaY = parsed.delta ?? 0
  base.deltaX = parsed.deltaX ?? 0
  return base
}

// ============================================================================
// Hit Testing
// ============================================================================

/** Position property on a Box that takes the node out of normal flow. */
function isAbsolutePositioned(node: AgNode): boolean {
  const p = node.props as { position?: string }
  return p.position === "absolute"
}

/**
 * Geometry-based hit test for absolute-positioned descendants.
 *
 * Walks the whole subtree rooted at `node` in tree order. For each
 * absolute-positioned descendant whose scrollRect contains (x, y), recurse
 * into it as a standalone hit-test (which finds the deepest in-flow child
 * under that absolute) and track the latest-in-tree hit — that one paints
 * on top (third pass in render order uses natural child order, so later =
 * higher z).
 *
 * Respects pointerEvents="none" on the absolute root and its ancestors,
 * and overflow:hidden/scroll clipping on ancestors up to `node`.
 *
 * Returns null if no absolute descendant covers (x, y).
 */
function hitTestAbsoluteDescendants(
  node: AgNode,
  x: number,
  y: number,
  ancestorClipRect: Rect | null,
): AgNode | null {
  let result: AgNode | null = null

  for (const child of node.children) {
    // Honor pointerEvents="none" on any ancestor of the absolute node.
    const cp = child.props as { pointerEvents?: string; overflow?: string }
    if (cp.pointerEvents === "none") continue

    // Compute the effective clip rect for this child's descendants.
    let childClip = ancestorClipRect
    if (cp.overflow === "hidden" || cp.overflow === "scroll") {
      const cr = child.scrollRect
      if (cr) {
        childClip = childClip ? intersectRect(childClip, cr) : cr
      }
    }

    if (isAbsolutePositioned(child) && child.scrollRect) {
      // If an ancestor clips and the absolute node is outside the clip, skip.
      const clipExcludes = ancestorClipRect && !pointInRect(x, y, ancestorClipRect)
      if (!clipExcludes && pointInRect(x, y, child.scrollRect)) {
        // Recurse INTO the absolute node to find the deepest descendant
        // under it. We use hitTestInFlow plus a nested absolute pass so
        // nested absolutes also resolve geometrically.
        const nestedAbs = hitTestAbsoluteDescendants(child, x, y, null)
        const hit = nestedAbs ?? hitTestInFlow(child, x, y)
        if (hit) {
          // Later-in-tree wins for z-order (paints on top in absolute pass).
          result = hit
        }
      }
    }

    // Continue searching this child's subtree for deeper absolute descendants
    // (an absolute node can contain nested absolute nodes; we still want the
    // latest one to win).
    const deeper = hitTestAbsoluteDescendants(child, x, y, childClip)
    if (deeper) result = deeper
  }

  return result
}

/** Compute the intersection of two rects; returns a zero-size rect if disjoint. */
function intersectRect(a: Rect, b: Rect): Rect {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  return { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) }
}

/**
 * In-flow (non-absolute) DFS hit test. Used by both `hitTest` after the
 * absolute pass, and by `hitTestAbsoluteDescendants` when recursing into a
 * matched absolute to find the deepest in-flow descendant under it.
 *
 * Skips absolute children — they're handled by the absolute pass at the
 * entry point (`hitTest`).
 */
function hitTestInFlow(node: AgNode, x: number, y: number): AgNode | null {
  const rect = node.scrollRect
  if (!rect) return null

  if (!pointInRect(x, y, rect)) return null

  const props = node.props as { overflow?: string; pointerEvents?: string }
  if (props.pointerEvents === "none") return null

  const clips = props.overflow === "hidden" || props.overflow === "scroll"

  // DFS: reverse child order (last child = top z-order).
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]!
    if (isAbsolutePositioned(child)) continue // handled by absolute pass

    if (clips) {
      const childRect = child.scrollRect
      if (childRect && !pointInRect(x, y, rect)) {
        continue
      }
    }
    const hit = hitTestInFlow(child, x, y)
    if (hit) return hit
  }

  // Virtual text children with inlineRects (nested Text inside Text), at any depth.
  if (node.type === "silvery-text") {
    const inlineHit = hitTestInlineRects(node, x, y)
    if (inlineHit) return inlineHit
  }

  return node
}

/**
 * Tree-based hit test: find the deepest node whose scrollRect contains (x, y).
 *
 * Uses reverse child order (last sibling wins = highest z-order, like DOM).
 * Respects overflow:hidden clipping and pointerEvents="none".
 *
 * ### Absolute-positioned nodes escape parent bounds
 *
 * Absolute descendants participate in hit-testing by GEOMETRY, not by
 * tree order / parent rect containment. An absolute child can be placed
 * outside its parent's bounding rect (e.g., a popover anchored near a
 * viewport edge); it still occupies screen cells at its own geometry and
 * must be hittable.
 *
 * The hit test runs an "absolute pass" first that walks the whole subtree
 * for absolute descendants and returns the latest-in-tree hit (matching
 * the three-pass render order where absolute children paint on top of
 * normal + sticky content). If no absolute descendant covers the point,
 * it falls through to standard in-flow DFS.
 *
 * A recursive sub-call (via `hitTest(absolute, ...)`) would re-run the
 * absolute pass on that absolute's subtree — which is correct: nested
 * absolutes also need geometry-based hit testing.
 */
export function hitTest(node: AgNode, x: number, y: number): AgNode | null {
  // 1. Absolute pass: find the topmost absolute descendant under (x, y).
  //    Respects pointerEvents and overflow:hidden/scroll clipping on
  //    ancestors.
  const absHit = hitTestAbsoluteDescendants(node, x, y, null)
  if (absHit) return absHit

  // 2. In-flow DFS (classic tree walk).
  return hitTestInFlow(node, x, y)
}

// ============================================================================
// Selection Hit Testing
// ============================================================================

/**
 * Selection hit test: find the deepest node whose text is selectable at (x, y).
 *
 * Unlike pointer hitTest, this:
 * - Ignores pointerEvents (a node with pointerEvents="none" can still be selectable)
 * - Respects userSelect (a node with userSelect="none" is not a selection target)
 */
export function selectionHitTest(node: AgNode, x: number, y: number): AgNode | null {
  return selectionHitTestInner(node, x, y, true)
}

export interface SelectionCell {
  col: number
  row: number
}

export interface SelectionAnchorFromPointOptions {
  root: AgNode | null
  buffer: TerminalBuffer | null
  x: number
  y: number
  forceBufferSelection?: boolean
}

export interface SelectionAnchorResolution {
  /** Semantic document node selected by the point, or null for raw buffer selection. */
  node: AgNode | null
  /** Cell used as the selection anchor after document/padding snapping. */
  cell: SelectionCell
  /** Original pointer-down cell, before nearest-text snapping. */
  downCell: SelectionCell
  /** Document/contain boundaries for the selected node, nearest first. */
  boundaries: SelectionBoundary[]
  /** True when Shift/raw terminal selection bypasses document scopes. */
  forceBufferSelection: boolean
}

interface SelectableRow {
  row: number
  first: number
  last: number
  nearest: number
}

function selectionCellFromPoint(x: number, y: number): SelectionCell {
  return {
    col: Math.max(0, Math.floor(x)),
    row: Math.max(0, Math.floor(y)),
  }
}

/**
 * Find the nearest selectable rendered-text cell inside a container rect.
 *
 * This is the terminal-target equivalent of the browser's
 * caretPositionFromPoint behavior for text-containing boxes: a mousedown in
 * padding or interior whitespace can still start text selection by snapping to
 * nearby rendered text, while genuinely text-free containers return null.
 */
export function nearestSelectableCellFromPoint(
  buffer: TerminalBuffer,
  rect: Rect,
  x: number,
  y: number,
): SelectionCell | null {
  if (rect.width <= 0 || rect.height <= 0) return null

  const left = Math.max(0, Math.floor(rect.x))
  const right = Math.min(buffer.width - 1, Math.ceil(rect.x + rect.width) - 1)
  const top = Math.max(0, Math.floor(rect.y))
  const bottom = Math.min(buffer.height - 1, Math.ceil(rect.y + rect.height) - 1)
  if (left > right || top > bottom) return null

  const pointerCol = Math.max(0, Math.floor(x))
  const pointerRow = Math.max(0, Math.floor(y))
  const rows: SelectableRow[] = []

  for (let row = top; row <= bottom; row++) {
    let first = -1
    let last = -1
    let nearest = -1
    let nearestDistance = Number.POSITIVE_INFINITY

    for (let col = left; col <= right; col++) {
      if (!buffer.isCellSelectable(col, row)) continue
      if (first === -1) first = col
      last = col

      const distance = Math.abs(col - pointerCol)
      if (distance < nearestDistance) {
        nearest = col
        nearestDistance = distance
      }
    }

    if (first !== -1) rows.push({ row, first, last, nearest })
  }

  if (rows.length === 0) return null

  const firstRow = rows[0]!
  const lastRow = rows[rows.length - 1]!
  const sameRow = rows.find((candidate) => candidate.row === pointerRow)
  if (sameRow) {
    if (pointerCol < sameRow.first) return { col: sameRow.first, row: sameRow.row }
    if (pointerCol > sameRow.last) {
      return { col: Math.min(right, sameRow.last + 1), row: sameRow.row }
    }
    return { col: sameRow.nearest, row: sameRow.row }
  }

  if (pointerRow < firstRow.row) return { col: firstRow.first, row: firstRow.row }
  if (pointerRow > lastRow.row) return { col: lastRow.last, row: lastRow.row }

  for (let i = 0; i < rows.length; i++) {
    const candidate = rows[i]!
    if (candidate.row > pointerRow) return { col: candidate.first, row: candidate.row }
  }

  return { col: lastRow.last, row: lastRow.row }
}

/**
 * Resolve the semantic selection anchor for a terminal pointer position.
 *
 * This is the single owner for mousedown selection semantics:
 * - exact selectable glyph / empty rendered line hits
 * - `userSelect="none"` pointer targets that block document selection
 * - nearest rendered text-cell fallback from blank padding inside text containers
 * - `userSelect="contain"` / document boundary discovery
 * - Shift/raw buffer selection that bypasses document scopes
 */
export function resolveSelectionAnchorFromPoint(
  options: SelectionAnchorFromPointOptions,
): SelectionAnchorResolution | null {
  const { root, buffer, x, y } = options
  const forceBufferSelection = options.forceBufferSelection === true
  const downCell = selectionCellFromPoint(x, y)
  let anchorCell = downCell

  if (!root) {
    return forceBufferSelection
      ? {
          node: null,
          cell: anchorCell,
          downCell,
          boundaries: [],
          forceBufferSelection,
        }
      : null
  }

  const pointerTarget = hitTest(root, x, y)
  const pointerBlocksSelection =
    pointerTarget !== null && resolveUserSelect(pointerTarget) === "none"
  let selectedNode = !pointerBlocksSelection ? selectionHitTest(root, x, y) : null

  if (
    selectedNode === null &&
    !forceBufferSelection &&
    !pointerBlocksSelection &&
    pointerTarget !== null &&
    buffer
  ) {
    let current: AgNode | null = pointerTarget
    while (current && selectedNode === null) {
      const rect = current.scrollRect
      const nearest = rect ? nearestSelectableCellFromPoint(buffer, rect, x, y) : null
      if (!nearest) {
        current = current.parent
        continue
      }
      const nearestHit = selectionHitTest(root, nearest.col, nearest.row)
      if (nearestHit) {
        anchorCell = nearest
        selectedNode = nearestHit
      }
      current = current.parent
    }
  }

  if (selectedNode === null && !forceBufferSelection) return null

  return {
    node: selectedNode,
    cell: anchorCell,
    downCell,
    boundaries: selectedNode ? findSelectionBoundaries(selectedNode) : [],
    forceBufferSelection,
  }
}

function selectionHitTestInner(
  node: AgNode,
  x: number,
  y: number,
  allowRowFallback: boolean,
): AgNode | null {
  const rect = node.scrollRect
  if (!rect) return null

  if (!pointInRect(x, y, rect)) return null

  // userSelect="none" blocks this subtree from selection hit testing
  // But only if explicitly "none" — "auto" inherits and root defaults to "text"
  const props = node.props as { overflow?: string; userSelect?: UserSelect }
  const resolved = resolveUserSelect(node)
  if (resolved === "none") return null

  // Check overflow clipping (same as pointer hitTest)
  const clips = props.overflow === "hidden" || props.overflow === "scroll"

  // DFS: check children in reverse order (last child = top z-order)
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]!
    const childRect = child.scrollRect
    if (clips) {
      if (childRect && !pointInRect(x, y, rect)) {
        continue
      }
    }
    if (childRect && pointInRect(x, y, childRect)) {
      if (resolveUserSelect(child) === "none") return null
      const hit = selectionHitTestInner(child, x, y, false)
      if (hit) return hit
      continue
    }
    const hit = selectionHitTestInner(child, x, y, false)
    if (hit) return hit
  }

  // Check virtual text children with inlineRects, at any depth.
  if (node.type === "silvery-text") {
    const inlineHit = hitTestInlineRects(node, x, y)
    if (inlineHit) return inlineHit
  }

  if (node.type === "silvery-text") {
    return pointHitsRenderedTextRow(node, y) ? node : null
  }

  if (node.type === "silvery-island") {
    return node
  }

  return allowRowFallback ? findTextNodeOnRow(node, y) : null
}

/**
 * Find the contain boundary for a node.
 * Walks up to the nearest `userSelect="contain"` ancestor and returns its scrollRect
 * as a SelectionScope. Returns null if no contain boundary exists.
 */
export function findContainBoundary(node: AgNode): SelectionScope | null {
  let current: AgNode | null = node
  while (current) {
    const props = current.props as { userSelect?: UserSelect }
    if (props.userSelect === "contain") {
      const rect = current.scrollRect
      if (rect) {
        return {
          top: rect.y,
          bottom: rect.y + rect.height - 1,
          left: rect.x,
          right: rect.x + rect.width - 1,
        }
      }
    }
    current = current.parent
  }
  return null
}

export interface SelectionBoundary {
  node: AgNode
  scope: SelectionScope
  hardContain: boolean
}

function nodeSelectionScope(node: AgNode): SelectionScope | null {
  const rect = node.scrollRect
  if (!rect) return null
  // Reject degenerate (zero-area) rects. Virtual text children expose
  // `inlineRects` for hit testing but carry a placeholder scrollRect of
  // {0,0,0,0}; treating that as a selection scope would produce
  // {top:0, bottom:-1, left:0, right:-1} and clamp every selection
  // anchor/head to (0,0) — silently breaking double/triple-click word
  // selection that goes through `clampToScope`.
  if (rect.width <= 0 || rect.height <= 0) return null
  if (node.type === "silvery-text") {
    const textBounds = renderedTextBounds(node)
    if (textBounds === null) return null
    return {
      top: rect.y,
      bottom: rect.y + textBounds.height - 1,
      left: rect.x,
      right: rect.x + textBounds.width - 1,
    }
  }

  return {
    top: rect.y,
    bottom: rect.y + rect.height - 1,
    left: rect.x,
    right: rect.x + rect.width - 1,
  }
}

function visitTextLeaves(node: AgNode, visit: (leaf: AgNode, text: string) => void): void {
  if (node.type === "silvery-text" && node.textContent !== undefined) {
    visit(node, node.textContent)
    return
  }
  for (const child of node.children) visitTextLeaves(child, visit)
}

function collectText(node: AgNode): string {
  let out = ""
  visitTextLeaves(node, (_leaf, text) => {
    // Selection gaps count visible graphemes, not the child's SGR bytes.
    out += stripAnsi(text)
  })
  return out
}

interface SelectableContentGrapheme {
  text: string
  selectable: boolean
}

function collectSelectableContentGraphemes(node: AgNode): SelectableContentGrapheme[] {
  const runs: Array<{ start: number; end: number; selectable: boolean }> = []
  let text = ""
  visitTextLeaves(node, (leaf, leafText) => {
    const start = text.length
    text += stripAnsi(leafText)
    runs.push({
      start,
      end: text.length,
      selectable: resolveUserSelect(leaf) !== "none",
    })
  })

  const result: SelectableContentGrapheme[] = []
  let sourceOffset = 0
  let runIndex = 0
  for (const grapheme of splitGraphemes(text)) {
    const endOffset = sourceOffset + grapheme.length
    while (runs[runIndex] && runs[runIndex]!.end <= sourceOffset) runIndex++
    let selectable = true
    for (let index = runIndex; runs[index] && runs[index]!.start < endOffset; index++) {
      selectable &&= runs[index]!.selectable
    }
    result.push({ text: grapheme, selectable })
    sourceOffset = endOffset
  }
  return result
}

interface RenderedTextSlice {
  text: string
  startOffset: number
  endOffset: number
}

function renderedTextSlices(node: AgNode): RenderedTextSlice[] {
  const rect = node.scrollRect
  if (!rect || rect.width <= 0) return []
  const text = collectText(node)
  if (text.length === 0) return []
  const props = node.props as TextProps
  const wrap = props.wrap
  const shouldWrap =
    wrap !== false && wrap !== "truncate" && wrap !== "truncate-end" && wrap !== "clip"
  const slices: RenderedTextSlice[] = []
  let paragraphStart = 0
  for (let index = 0; index <= text.length; index++) {
    if (index < text.length && text.charCodeAt(index) !== 10) continue
    const paragraph = text.slice(paragraphStart, index)
    const wrapped = shouldWrap ? wrapTextWithOffsets(paragraph, rect.width) : []
    if (wrapped.length === 0) {
      slices.push({
        text: paragraph,
        startOffset: paragraphStart,
        endOffset: paragraphStart + paragraph.length,
      })
    } else {
      for (const slice of wrapped) {
        slices.push({
          text: slice.text,
          startOffset: paragraphStart + slice.startOffset,
          endOffset: paragraphStart + slice.endOffset,
        })
      }
    }
    paragraphStart = index + 1
  }
  return slices
}

function renderedTextLines(node: AgNode): string[] {
  return renderedTextSlices(node).map((slice) => slice.text)
}

function renderedTextBounds(node: AgNode): { width: number; height: number } | null {
  const rect = node.scrollRect
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  const lines = renderedTextLines(node)
  if (lines.length === 0) return null
  let maxWidth = 0
  for (const line of lines) {
    maxWidth = Math.max(maxWidth, Math.min(rect.width, displayWidthAnsi(line)))
  }
  if (maxWidth <= 0) return null
  return { width: maxWidth, height: Math.min(rect.height, lines.length) }
}

/** A document endpoint retained by node identity and a grapheme gap. */
export interface ContentSelectionEndpoint {
  node: AgNode
  /** Gap index in `[0, graphemeCount]`, never a UTF-16 or terminal-cell offset. */
  gap: number
  /** Atomic invalidation witness: content replacement clears the selection. */
  text: string
}

export interface ContentSelectionPoint {
  before: ContentSelectionEndpoint
  after: ContentSelectionEndpoint
}

function selectionContentNode(node: AgNode): AgNode | null {
  let current: AgNode | null = node
  while (current) {
    const rect = current.scrollRect
    if (
      current.type === "silvery-text" &&
      rect &&
      rect.width > 0 &&
      collectText(current).length > 0
    ) {
      return current
    }
    current = current.parent
  }
  return null
}

function gapAtSourceOffset(text: string, offset: number): number {
  let sourceOffset = 0
  let gap = 0
  for (const grapheme of splitGraphemes(text)) {
    if (sourceOffset + grapheme.length > offset) break
    sourceOffset += grapheme.length
    gap++
  }
  return gap
}

function sourceOffsetAtGap(text: string, gap: number): number {
  const graphemes = splitGraphemes(text)
  let offset = 0
  for (let index = 0; index < Math.max(0, Math.min(gap, graphemes.length)); index++) {
    offset += graphemes[index]!.length
  }
  return offset
}

/** Resolve a pointer cell to the adjacent semantic text gap on one mounted node. */
export function contentSelectionEndpointFromPoint(
  node: AgNode,
  x: number,
  y: number,
  affinity: "before" | "after",
): ContentSelectionEndpoint | null {
  const contentNode = selectionContentNode(node)
  if (!contentNode) return null
  const rect = contentNode.scrollRect
  if (!rect) return null
  const slices = renderedTextSlices(contentNode)
  const row = Math.max(0, Math.min(slices.length - 1, Math.floor(y - rect.y)))
  const slice = slices[row]
  if (!slice) return null

  const localCol = Math.max(0, Math.floor(x - rect.x))
  let visibleCol = 0
  let localOffset = 0
  for (const grapheme of splitGraphemes(slice.text)) {
    const width = Math.max(0, graphemeWidth(grapheme))
    if (localCol < visibleCol + Math.max(1, width)) {
      const sourceOffset =
        slice.startOffset + localOffset + (affinity === "after" ? grapheme.length : 0)
      const text = collectText(contentNode)
      return { node: contentNode, gap: gapAtSourceOffset(text, sourceOffset), text }
    }
    visibleCol += width
    localOffset += grapheme.length
  }

  const text = collectText(contentNode)
  return { node: contentNode, gap: gapAtSourceOffset(text, slice.endOffset), text }
}

/** Resolve both gaps surrounding the glyph under one pointer cell. */
export function contentSelectionPointFromPoint(
  node: AgNode,
  x: number,
  y: number,
): ContentSelectionPoint | null {
  const before = contentSelectionEndpointFromPoint(node, x, y, "before")
  const after = contentSelectionEndpointFromPoint(node, x, y, "after")
  return before && after ? { before, after } : null
}

function isNodeInTree(node: AgNode, root: AgNode): boolean {
  let current: AgNode | null = node
  while (current) {
    if (current === root) return true
    current = current.parent
  }
  return false
}

/** Content replacement and unmount invalidate a retained endpoint atomically. */
export function isContentSelectionEndpointValid(
  endpoint: ContentSelectionEndpoint,
  root: AgNode,
): boolean {
  return isNodeInTree(endpoint.node, root) && collectText(endpoint.node) === endpoint.text
}

function selectableTextNodes(root: AgNode): AgNode[] {
  const nodes: AgNode[] = []
  const walk = (node: AgNode): void => {
    if (resolveUserSelect(node) === "none") return
    // Only layout-backed Text nodes own a content coordinate space. Raw and
    // nested virtual text descendants are already folded into their nearest
    // layout-backed ancestor by collectText(); visiting them again duplicates
    // both document order and copied content.
    if (
      node.type === "silvery-text" &&
      node.scrollRect &&
      collectSelectableContentGraphemes(node).some((grapheme) => grapheme.selectable)
    ) {
      nodes.push(node)
      return
    }
    for (const child of node.children) walk(child)
  }
  walk(root)
  return nodes
}

function compareContentEndpoints(
  nodes: readonly AgNode[],
  left: ContentSelectionEndpoint,
  right: ContentSelectionEndpoint,
): number {
  const leftIndex = nodes.indexOf(left.node)
  const rightIndex = nodes.indexOf(right.node)
  if (leftIndex !== rightIndex) return leftIndex - rightIndex
  return left.gap - right.gap
}

/**
 * Orient two pointer glyphs into a semantic half-open range. Forward drags
 * use origin-before through head-after; reverse drags use origin-after through
 * head-before, so both pointer glyphs remain included in either direction.
 */
export function orientContentSelectionRange(
  root: AgNode,
  candidates: {
    anchorBefore: ContentSelectionEndpoint
    anchorAfter: ContentSelectionEndpoint
    headBefore: ContentSelectionEndpoint
    headAfter: ContentSelectionEndpoint
  },
): { anchor: ContentSelectionEndpoint; head: ContentSelectionEndpoint } | null {
  const { anchorBefore, anchorAfter, headBefore, headAfter } = candidates
  if (
    !isContentSelectionEndpointValid(anchorBefore, root) ||
    !isContentSelectionEndpointValid(anchorAfter, root) ||
    !isContentSelectionEndpointValid(headBefore, root) ||
    !isContentSelectionEndpointValid(headAfter, root)
  ) {
    return null
  }
  const nodes = selectableTextNodes(root)
  if (
    !nodes.includes(anchorBefore.node) ||
    !nodes.includes(anchorAfter.node) ||
    !nodes.includes(headBefore.node) ||
    !nodes.includes(headAfter.node)
  ) {
    return null
  }
  return compareContentEndpoints(nodes, anchorBefore, headBefore) <= 0
    ? { anchor: anchorBefore, head: headAfter }
    : { anchor: anchorAfter, head: headBefore }
}

function cellAtGrapheme(node: AgNode, graphemeIndex: number): SelectionCell | null {
  const rect = node.scrollRect
  if (!rect) return null
  const text = collectText(node)
  const offset = sourceOffsetAtGap(text, graphemeIndex)
  const slices = renderedTextSlices(node)
  let row = slices.findIndex(
    (slice, index) =>
      offset >= slice.startOffset &&
      (offset < slice.endOffset || (index === slices.length - 1 && offset === slice.endOffset)),
  )
  if (row < 0) row = Math.max(0, slices.length - 1)
  const slice = slices[row]
  if (!slice) return null
  // A soft wrap may consume a boundary space in the source without rendering
  // it. Clamp the source-relative prefix to the actual visual slice instead
  // of trimEnd(), which would also erase intentionally rendered spaces.
  const visiblePrefixLength = Math.min(Math.max(0, offset - slice.startOffset), slice.text.length)
  const localSource = slice.text.slice(0, visiblePrefixLength)
  return {
    col: Math.floor(rect.x + displayWidthAnsi(localSource)),
    row: Math.floor(rect.y + row),
  }
}

/**
 * Project a semantic half-open range back to the terminal's inclusive cell
 * range. Offscreen endpoints clamp to the frame; the semantic endpoints do not.
 */
export function projectContentSelectionRange(
  root: AgNode,
  anchor: ContentSelectionEndpoint,
  head: ContentSelectionEndpoint,
  width: number,
  height: number,
): { anchor: SelectionCell; head: SelectionCell } | null {
  if (
    !isContentSelectionEndpointValid(anchor, root) ||
    !isContentSelectionEndpointValid(head, root)
  ) {
    return null
  }
  const nodes = selectableTextNodes(root)
  if (!nodes.includes(anchor.node) || !nodes.includes(head.node)) return null
  const [start, end] =
    compareContentEndpoints(nodes, anchor, head) <= 0 ? [anchor, head] : [head, anchor]
  const startGraphemes = splitGraphemes(start.text)
  if (start.gap >= startGraphemes.length || end.gap <= 0) return null
  const startCell = cellAtGrapheme(start.node, start.gap)
  const endCell = cellAtGrapheme(end.node, end.gap - 1)
  if (!startCell || !endCell) return null
  const clamp = (cell: SelectionCell): SelectionCell => ({
    col: Math.max(0, Math.min(width - 1, cell.col)),
    row: Math.max(0, Math.min(height - 1, cell.row)),
  })
  return { anchor: clamp(startCell), head: clamp(endCell) }
}

/** Extract the retained document range, joining vertically distinct text nodes by newline. */
export function extractContentSelectionText(
  root: AgNode,
  anchor: ContentSelectionEndpoint,
  head: ContentSelectionEndpoint,
): string | null {
  if (
    !isContentSelectionEndpointValid(anchor, root) ||
    !isContentSelectionEndpointValid(head, root)
  ) {
    return null
  }
  const nodes = selectableTextNodes(root)
  const [start, end] =
    compareContentEndpoints(nodes, anchor, head) <= 0 ? [anchor, head] : [head, anchor]
  const startIndex = nodes.indexOf(start.node)
  const endIndex = nodes.indexOf(end.node)
  if (startIndex < 0 || endIndex < startIndex) return null

  const parts: string[] = []
  for (let index = startIndex; index <= endIndex; index++) {
    const node = nodes[index]!
    const graphemes = collectSelectableContentGraphemes(node)
    const from = index === startIndex ? start.gap : 0
    const to = index === endIndex ? end.gap : graphemes.length
    parts.push(
      graphemes
        .slice(from, to)
        .filter((grapheme) => grapheme.selectable)
        .map((grapheme) => grapheme.text)
        .join(""),
    )
  }

  let text = parts[0] ?? ""
  for (let index = 1; index < parts.length; index++) {
    const previous = nodes[startIndex + index - 1]?.boxRect
    const current = nodes[startIndex + index]?.boxRect
    text += previous && current && current.y > previous.y ? "\n" : ""
    text += parts[index]
  }
  return text
}

/** Nearest scroll owner for a selection gesture; adapters remain component-owned. */
export function findSelectionScrollOwner(node: AgNode | null, scopeRoot?: AgNode): AgNode | null {
  let current = node
  while (current) {
    const props = current.props as BoxProps
    const scroll = current.scrollState
    if (props.overflow === "scroll" && scroll && scroll.contentHeight > scroll.viewportHeight) {
      return current
    }
    if (current === scopeRoot) return null
    current = current.parent
  }
  return null
}

/** The one pointer-selection edge policy; scroll motion stays in existing adapters. */
export function selectionEdgeScrollDirection(owner: AgNode, pointerY: number): -1 | 0 | 1 {
  const rect = owner.scrollRect
  if (!rect || rect.height <= 0) return 0
  const row = Math.floor(pointerY)
  if (row <= Math.floor(rect.y)) return -1
  if (row >= Math.ceil(rect.y + rect.height) - 1) return 1
  return 0
}

function pointHitsRenderedTextRow(node: AgNode, y: number): boolean {
  const rect = node.scrollRect
  if (!rect) return false
  const row = y - rect.y
  if (row < 0 || row >= rect.height) return false
  const lines = renderedTextLines(node)
  return lines[row] !== undefined
}

function findTextNodeOnRow(node: AgNode, y: number): AgNode | null {
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i]!
    const hit = findTextNodeOnRow(child, y)
    if (hit) return hit
  }
  return node.type === "silvery-text" && pointHitsRenderedTextRow(node, y) ? node : null
}

/**
 * Return the selectable document-ancestor chain for a node, nearest first.
 *
 * This is the DOM-like selection path: ordinary selectable nodes create
 * semantic selection regions, while `userSelect="contain"` marks a CSS-style
 * hard containment boundary that selection must not escape.
 */
export function findSelectionBoundaries(node: AgNode): SelectionBoundary[] {
  const boundaries: SelectionBoundary[] = []
  let current: AgNode | null = node
  while (current) {
    const resolved = resolveUserSelect(current)
    if (resolved !== "none") {
      const scope = nodeSelectionScope(current)
      if (scope) {
        const props = current.props as { userSelect?: UserSelect }
        boundaries.push({
          node: current,
          scope,
          hardContain: props.userSelect === "contain" || current.type === "silvery-island",
        })
      }
    }
    current = current.parent
  }
  return boundaries
}

// ============================================================================
// Draggable Resolution
// ============================================================================

/**
 * Check if a node has draggable=true.
 * Unlike userSelect, draggable is NOT inherited — only the exact node is checked.
 * Ancestors' draggable prop has no effect on children.
 */
export function resolveNodeDraggable(node: AgNode | null): boolean {
  if (!node) return false
  const props = node.props as { draggable?: boolean }
  return props.draggable === true
}

// ============================================================================
// Event Dispatch
// ============================================================================

/** Map event type to the handler prop name */
const EVENT_HANDLER_MAP: Record<string, string & keyof MouseEventProps> = {
  click: "onClick",
  dblclick: "onDoubleClick",
  tripleclick: "onTripleClick",
  mousedown: "onMouseDown",
  mouseup: "onMouseUp",
  mousemove: "onMouseMove",
  mouseenter: "onMouseEnter",
  mouseleave: "onMouseLeave",
  wheel: "onWheel",
}

/**
 * Dispatch a mouse event through the render tree with DOM-style bubbling.
 *
 * Bubbles from target → root, calling the appropriate handler on each node.
 * stopPropagation() halts bubbling. mouseenter/mouseleave do NOT bubble (DOM spec).
 */
export function dispatchMouseEvent(event: SilveryMouseEvent): void {
  const handlerProp = EVENT_HANDLER_MAP[event.type]
  if (!handlerProp) return

  // mouseenter/mouseleave don't bubble (DOM spec)
  const noBubble = event.type === "mouseenter" || event.type === "mouseleave"

  if (noBubble) {
    // Only fire on the target itself
    const handler = (event.target.props as Record<string, unknown>)[handlerProp] as
      | ((e: SilveryMouseEvent) => void)
      | undefined
    if (handler) {
      const mutableEvent = event as { currentTarget: AgNode }
      mutableEvent.currentTarget = event.target
      handler(event)
    }
    return
  }

  // Bubble phase: fire from target up to root
  const path = getAncestorPath(event.target)
  for (const node of path) {
    if (event.propagationStopped) break

    const handler = (node.props as Record<string, unknown>)[handlerProp] as
      | ((e: SilveryMouseEvent) => void)
      | undefined
    if (handler) {
      const mutableEvent = event as { currentTarget: AgNode }
      mutableEvent.currentTarget = node
      handler(event)
    }
  }
}

// ============================================================================
// Click-Count Detection (single / double / triple)
// ============================================================================

/**
 * Click-count state tracker.
 *
 * Counts up to 3 consecutive clicks within `MULTI_CLICK_TIME_MS` and
 * `MULTI_CLICK_DISTANCE` cells of each other on the same button. After
 * count reaches 3, the next click resets to 1 (matching DOM behavior:
 * `MouseEvent.detail` increments to 3, then a new click chain starts).
 *
 * `DoubleClickState` is kept as a backwards-compatible alias.
 */
export interface ClickCountState {
  lastClickTime: number
  lastClickX: number
  lastClickY: number
  lastClickButton: number
  /** Number of consecutive clicks in the current chain (1, 2, or 3). */
  count: number
}

/** @deprecated Use `ClickCountState` instead — kept as an alias for callers
 *  that haven't migrated to the count-based API. */
export type DoubleClickState = ClickCountState

export function createClickCountState(): ClickCountState {
  return {
    lastClickTime: 0,
    lastClickX: -999,
    lastClickY: -999,
    lastClickButton: -1,
    count: 0,
  }
}

/** @deprecated Use `createClickCountState()` instead. */
export const createDoubleClickState = createClickCountState

const MULTI_CLICK_TIME_MS = 300
const MULTI_CLICK_DISTANCE = 2

/**
 * Determine the consecutive-click count for the current click.
 *
 * Returns 1 for a fresh click, 2 for a double-click, 3 for a triple-click.
 * Subsequent clicks restart the chain at 1.
 *
 * Updates `state` so the next call sees the right history.
 */
export function checkClickCount(
  state: ClickCountState,
  x: number,
  y: number,
  button: number,
  now: number = Date.now(),
): 1 | 2 | 3 {
  const timeDelta = now - state.lastClickTime
  const dx = Math.abs(x - state.lastClickX)
  const dy = Math.abs(y - state.lastClickY)
  const sameButton = button === state.lastClickButton
  const inChain =
    sameButton &&
    timeDelta <= MULTI_CLICK_TIME_MS &&
    dx <= MULTI_CLICK_DISTANCE &&
    dy <= MULTI_CLICK_DISTANCE

  let count: 1 | 2 | 3
  if (!inChain || state.count >= 3) {
    count = 1
  } else if (state.count === 1) {
    count = 2
  } else {
    count = 3
  }

  state.lastClickTime = now
  state.lastClickX = x
  state.lastClickY = y
  state.lastClickButton = button
  state.count = count

  return count
}

/**
 * Check if a click qualifies as a double-click. Backwards-compatible
 * wrapper around `checkClickCount`.
 *
 * @deprecated Use `checkClickCount` and inspect the returned count
 *   (`=== 2` for dblclick, `=== 3` for tripleclick).
 */
export function checkDoubleClick(
  state: ClickCountState,
  x: number,
  y: number,
  button: number,
  now: number = Date.now(),
): boolean {
  return checkClickCount(state, x, y, button, now) === 2
}

// ============================================================================
// Mouse Enter/Leave Tracking
// ============================================================================

/**
 * Compute mouseenter/mouseleave transitions between two ancestor paths.
 *
 * Returns { entered, left } — arrays of nodes that were entered or left.
 * Mirrors the DOM spec: fire mouseleave on nodes in prevPath not in nextPath,
 * and mouseenter on nodes in nextPath not in prevPath.
 */
export function computeEnterLeave(
  prevPath: AgNode[],
  nextPath: AgNode[],
): { entered: AgNode[]; left: AgNode[] } {
  const prevSet = new Set(prevPath)
  const nextSet = new Set(nextPath)

  const entered = nextPath.filter((n) => !prevSet.has(n))
  const left = prevPath.filter((n) => !nextSet.has(n))

  return { entered, left }
}

// ============================================================================
// High-Level Mouse Event Processor
// ============================================================================

/**
 * Options for creating a mouse event processor.
 */
export interface MouseEventProcessorOptions {
  /** Optional focus manager — enables click-to-focus behavior.
   *  On mousedown, the deepest focusable ancestor of the hit target is focused. */
  focusManager?: FocusManager
  /**
   * Called when the semantic cursor resolved from the hit-test region changes.
   * `null` means reset to the default target cursor.
   */
  onMouseCursorChange?: (shape: BoxProps["mouseCursor"] | null) => void
}

/**
 * State for the mouse event processor.
 */
/**
 * Keyboard modifier state tracked from Kitty protocol key events.
 * Merged into mouse events to provide accurate modifier detection
 * (SGR mouse protocol reports Ctrl/Alt/Shift but NOT Cmd/Super).
 */
export interface KeyboardModifierState {
  super: boolean
  hyper: boolean
  capsLock: boolean
  numLock: boolean
}

export interface MouseEventProcessorState {
  doubleClick: DoubleClickState
  /** Previous hover path (for enter/leave tracking) */
  hoverPath: AgNode[]
  /** Whether the left button is currently down (for click detection) */
  mouseDownTarget: AgNode | null
  /** Optional ancestor that captures move/up for the active mouse press. */
  mouseCaptureTarget: AgNode | null
  /** Grace timer for captured drags that briefly leave the terminal bounds. */
  outsideCaptureReleaseTimer: ReturnType<typeof setTimeout> | null
  /** Last no-target mouse event observed while the grace timer is armed. */
  outsideCaptureReleaseMouse: ParsedMouse | null
  /** Optional focus manager for click-to-focus */
  focusManager?: FocusManager
  /** Modifier state from Kitty keyboard events, merged into mouse events */
  keyboardModifiers: KeyboardModifierState
  /** Aggregate `defaultPrevented` from the most recent click/dblclick/tripleclick
   *  dispatch chain. Set by `processMouseEvent` on every mouseup so callers
   *  (e.g., the runtime selection wiring) can gate auto-select on whether the
   *  component tree consumed the click. Reset to false at the start of each
   *  mouseup dispatch. */
  lastClickPrevented: boolean
  /** Last observed pointer coordinates (terminal cells). Updated on every
   *  mouse event so consumers can re-hit-test after layout changes — e.g.
   *  scroll-wheel events that reposition content under a stationary cursor.
   *  null means the pointer has left the terminal bounds (clearHoverPath
   *  ran) or no mouse event has arrived yet. */
  lastPointer: { x: number; y: number } | null
  /** Last emitted semantic mouse cursor shape. */
  lastMouseCursor: BoxProps["mouseCursor"] | null
  /** Optional callback for terminal/canvas/DOM cursor sinks. */
  onMouseCursorChange?: (shape: BoxProps["mouseCursor"] | null) => void
}

export function createMouseEventProcessor(
  options?: MouseEventProcessorOptions,
): MouseEventProcessorState {
  return {
    doubleClick: createDoubleClickState(),
    hoverPath: [],
    mouseDownTarget: null,
    mouseCaptureTarget: null,
    outsideCaptureReleaseTimer: null,
    outsideCaptureReleaseMouse: null,
    focusManager: options?.focusManager,
    keyboardModifiers: { super: false, hyper: false, capsLock: false, numLock: false },
    lastClickPrevented: false,
    lastPointer: null,
    lastMouseCursor: null,
    onMouseCursorChange: options?.onMouseCursorChange,
  }
}

function findMouseCaptureTarget(node: AgNode | null): AgNode | null {
  let current = node
  while (current) {
    const props = current.props as { mouseCapture?: boolean }
    if (props.mouseCapture === true) return current
    current = current.parent
  }
  return null
}

function resolveMouseCursor(node: AgNode | null): BoxProps["mouseCursor"] | null {
  // Explicit intent always wins, including "default" as the opt-out for
  // component/interaction defaults. Scan the whole path before deriving a
  // semantic fallback so a clickable child cannot override an ancestor's
  // explicit cursor.
  let current = node
  while (current) {
    const shape = (current.props as BoxProps).mouseCursor
    if (shape !== undefined) return shape
    current = current.parent
  }

  // Activation handlers carry the same pointer affordance as web controls.
  // Scan the full path before falling back to text so labels nested inside a
  // clickable region inherit the region's pointer rather than masking it.
  let selectableText = false
  current = node
  while (current) {
    const props = current.props as BoxProps
    if (props.onClick || props.onDoubleClick || props.onTripleClick) {
      return "pointer"
    }
    if (current.type === "silvery-text" && resolveUserSelect(current) !== "none") {
      selectableText = true
    }
    current = current.parent
  }

  return selectableText ? "text" : null
}

function updateMouseCursor(state: MouseEventProcessorState, target: AgNode | null): void {
  const cursorTarget = state.mouseCaptureTarget ?? target
  const next = resolveMouseCursor(cursorTarget)
  if (next === state.lastMouseCursor) return
  state.lastMouseCursor = next
  state.onMouseCursorChange?.(next)
}

const MOUSE_CAPTURE_OUTSIDE_GRACE_MS = 2000

function mouseUpParsed(parsed: ParsedMouse): ParsedMouse {
  return parsed.action === "up" ? parsed : { ...parsed, action: "up" }
}

/**
 * Update keyboard modifier state from a parsed key event.
 * Call this for every keyboard event so mouse events can include accurate modifiers.
 */
export function updateKeyboardModifiers(
  state: MouseEventProcessorState,
  key: {
    super?: boolean
    hyper?: boolean
    capsLock?: boolean
    numLock?: boolean
    eventType?: string
  },
): void {
  // On key release events, clear the modifier. On press/repeat, set it.
  const isRelease = key.eventType === "release"
  const prevSuper = state.keyboardModifiers.super
  if (key.super !== undefined) state.keyboardModifiers.super = isRelease ? false : key.super
  if (key.hyper !== undefined) state.keyboardModifiers.hyper = isRelease ? false : key.hyper
  if (key.capsLock !== undefined) state.keyboardModifiers.capsLock = key.capsLock
  if (key.numLock !== undefined) state.keyboardModifiers.numLock = key.numLock
  if (state.keyboardModifiers.super !== prevSuper) {
    mouseLog.debug?.(
      `keyboardModifiers.super: ${prevSuper} → ${state.keyboardModifiers.super} (key.super=${key.super}, eventType=${key.eventType})`,
    )
  }
}

function releaseMousePress(state: MouseEventProcessorState, parsed: ParsedMouse): boolean {
  let defaultPrevented = false
  const dispatchTarget = state.mouseCaptureTarget
  const releaseParsed = mouseUpParsed(parsed)
  cancelOutsideCaptureRelease(state)

  if (state.mouseDownTarget) {
    setArmed(state.mouseDownTarget, false)
  }

  if (dispatchTarget) {
    const event = createMouseEvent(
      "mouseup",
      releaseParsed.x,
      releaseParsed.y,
      dispatchTarget,
      releaseParsed,
      state.keyboardModifiers,
    )
    dispatchMouseEvent(event)
    defaultPrevented = event.defaultPrevented
  }

  state.lastClickPrevented = false
  state.mouseDownTarget = null
  state.mouseCaptureTarget = null
  updateMouseCursor(state, null)
  return defaultPrevented
}

function cancelOutsideCaptureRelease(state: MouseEventProcessorState): void {
  if (state.outsideCaptureReleaseTimer !== null) {
    clearTimeout(state.outsideCaptureReleaseTimer)
  }
  state.outsideCaptureReleaseTimer = null
  state.outsideCaptureReleaseMouse = null
}

function scheduleOutsideCaptureRelease(state: MouseEventProcessorState, parsed: ParsedMouse): void {
  state.outsideCaptureReleaseMouse = parsed
  if (state.outsideCaptureReleaseTimer !== null) return

  state.outsideCaptureReleaseTimer = setTimeout(() => {
    const outsideMouse = state.outsideCaptureReleaseMouse ?? parsed
    releaseMousePress(state, outsideMouse)
    clearHoverPath(state, outsideMouse)
  }, MOUSE_CAPTURE_OUTSIDE_GRACE_MS)
}

function clearHoverPath(state: MouseEventProcessorState, parsed: ParsedMouse): void {
  for (const node of state.hoverPath.slice().reverse()) {
    setHovered(node, false)
    const leaveEvent = createMouseEvent(
      "mouseleave",
      parsed.x,
      parsed.y,
      node,
      parsed,
      state.keyboardModifiers,
    )
    dispatchMouseEvent(leaveEvent)
  }
  state.hoverPath = []
  // Pointer has left the terminal bounds — refreshHoverPath becomes a
  // no-op until a fresh in-bounds event arrives.
  state.lastPointer = null
  updateMouseCursor(state, null)
}

/**
 * Re-resolve the hover path at the last known pointer coordinates and
 * dispatch enter/leave for any nodes that changed. Use after a layout
 * change that didn't come from a mouse event — most importantly:
 *
 *   - Wheel scrolls (content shifts under a stationary cursor)
 *   - Async content arrival (transcript leaf appended, list re-flowed)
 *   - Programmatic re-layout (resize, theme switch)
 *
 * Without this, hover bg / hover-armed popovers stick to whatever AgNode
 * was under the cursor when the last mouse event fired, even after the
 * tree under that coordinate changed. Symptoms: persistent hover bg on
 * rows that have scrolled out from under the pointer; popover targets
 * arming on rows the cursor isn't over anymore.
 *
 * Idempotent — when nothing changed, no events fire and `state.hoverPath`
 * stays identity-equal. Safe to call every render commit.
 *
 * Bead: @km/code/sticky-hover-residue.
 */
export function refreshHoverPath(state: MouseEventProcessorState, root: AgNode): void {
  if (state.lastPointer === null) return
  // Don't override an active capture (drag in progress) — the dragger
  // owns the move/up routing until release.
  if (state.mouseCaptureTarget) return
  const { x, y } = state.lastPointer
  const target = hitTest(root, x, y)
  updateMouseCursor(state, target)
  const newPath = target ? getAncestorPath(target) : []
  const { entered, left } = computeEnterLeave(state.hoverPath, newPath)
  if (entered.length === 0 && left.length === 0) return
  // Synthesize a `move`-shaped ParsedMouse so the mouseenter/mouseleave
  // events carry sane button/action metadata. Subscribers that key off
  // event.type (mouseenter/leave) — the typical case — don't care about
  // the underlying button value.
  const synthetic: ParsedMouse = {
    x,
    y,
    button: 0,
    action: "move",
    coordinateMode: "cell",
    shift: false,
    meta: false,
    ctrl: false,
  }
  for (const node of left) {
    setHovered(node, false)
    const ev = createMouseEvent("mouseleave", x, y, node, synthetic, state.keyboardModifiers)
    dispatchMouseEvent(ev)
  }
  for (const node of entered.reverse()) {
    setHovered(node, true)
    const ev = createMouseEvent("mouseenter", x, y, node, synthetic, state.keyboardModifiers)
    dispatchMouseEvent(ev)
  }
  state.hoverPath = newPath
}

/**
 * Process a raw ParsedMouse event and dispatch DOM-level events on the render tree.
 *
 * Call this for every SGR mouse event received. It handles:
 * - mousedown / mouseup
 * - click (on mouseup if same target as mousedown)
 * - dblclick (based on timing)
 * - mousemove + mouseenter/mouseleave
 * - wheel
 */
export function processMouseEvent(
  state: MouseEventProcessorState,
  parsed: ParsedMouse,
  root: AgNode,
): boolean {
  const { x, y, action } = parsed
  // Track last pointer coords so refreshHoverPath() can re-hit-test after
  // layout changes (e.g. wheel scrolls content under a stationary cursor;
  // async state arrival shifts rows). Cleared in clearHoverPath when the
  // pointer leaves the terminal bounds.
  state.lastPointer = { x, y }
  const target = hitTest(root, x, y)
  updateMouseCursor(state, target)
  if (action === "move") {
    const nodeType = target?.type ?? "null"
    const nodeId = target ? ((target.props as Record<string, unknown>).id ?? "") : ""
    // Check entire ancestor path for onMouseEnter
    let enterAncestor = ""
    if (target) {
      let n: AgNode | null = target
      while (n) {
        if ("onMouseEnter" in (n.props as Record<string, unknown>)) {
          enterAncestor = `${n.type}#${(n.props as Record<string, unknown>).id ?? ""}`
          break
        }
        n = n.parent
      }
    }
    const newPath = target ? getAncestorPath(target) : []
    const { entered } = computeEnterLeave(state.hoverPath, newPath)
    mouseLog.debug?.(
      `move x=${x} y=${y} target=${nodeType}#${nodeId} enterAncestor=${enterAncestor || "none"} entered=${entered.length} prevPath=${state.hoverPath.length}`,
    )
  }
  let defaultPrevented = false
  if (target) {
    cancelOutsideCaptureRelease(state)
  }
  if (!target) {
    if (action === "move") {
      if (state.mouseCaptureTarget) {
        scheduleOutsideCaptureRelease(state, parsed)
      } else {
        defaultPrevented = releaseMousePress(state, parsed)
      }
      clearHoverPath(state, parsed)
      return defaultPrevented
    }
    if (action === "up") {
      defaultPrevented = releaseMousePress(state, parsed)
    }
    return defaultPrevented
  }
  if (action === "down") {
    state.mouseDownTarget = target
    state.mouseCaptureTarget = findMouseCaptureTarget(target)
    updateMouseCursor(state, target)

    // Set armed state on the target node
    setArmed(target, true)

    // Click-to-focus: find nearest focusable ancestor and focus it
    if (state.focusManager) {
      const focusable = findFocusableAncestor(target)
      if (focusable) {
        state.focusManager.focus(focusable, "mouse")
      }
    }

    const event = createMouseEvent("mousedown", x, y, target, parsed, state.keyboardModifiers)
    dispatchMouseEvent(event)
    if (event.defaultPrevented) defaultPrevented = true
  } else if (action === "up") {
    const dispatchTarget = state.mouseCaptureTarget ?? target
    // Clear armed state on the mousedown target
    if (state.mouseDownTarget) {
      setArmed(state.mouseDownTarget, false)
    }

    // Reset aggregate at the start of every mouseup so callers reading
    // `lastClickPrevented` after dispatch see only this dispatch's signal.
    state.lastClickPrevented = false

    const event = createMouseEvent("mouseup", x, y, dispatchTarget, parsed, state.keyboardModifiers)
    dispatchMouseEvent(event)

    // Click = mouseup on the same node (or ancestor) where mousedown happened
    // DOM actually fires click even if up is on a different element, but the target
    // is the nearest common ancestor. For simplicity, we fire click on the up target
    // if mousedown was on the same target or a descendant.
    if (state.mouseDownTarget) {
      // Resolve the multi-click count BEFORE creating the event so we can
      // attach `detail` (DOM `MouseEvent.detail` convention).
      const count = checkClickCount(state.doubleClick, x, y, parsed.button)
      const clickEvent = createMouseEvent(
        "click",
        x,
        y,
        dispatchTarget,
        parsed,
        state.keyboardModifiers,
      )
      ;(clickEvent as { detail?: 1 | 2 | 3 }).detail = count
      dispatchMouseEvent(clickEvent)
      if (clickEvent.defaultPrevented) {
        defaultPrevented = true
        state.lastClickPrevented = true
      }

      if (count >= 2) {
        const dblEvent = createMouseEvent(
          "dblclick",
          x,
          y,
          dispatchTarget,
          parsed,
          state.keyboardModifiers,
        )
        ;(dblEvent as { detail?: 1 | 2 | 3 }).detail = 2
        dispatchMouseEvent(dblEvent)
        if (dblEvent.defaultPrevented) {
          defaultPrevented = true
          state.lastClickPrevented = true
        }
      }
      if (count === 3) {
        const tripleEvent = createMouseEvent(
          "tripleclick",
          x,
          y,
          dispatchTarget,
          parsed,
          state.keyboardModifiers,
        )
        ;(tripleEvent as { detail?: 1 | 2 | 3 }).detail = 3
        dispatchMouseEvent(tripleEvent)
        if (tripleEvent.defaultPrevented) {
          defaultPrevented = true
          state.lastClickPrevented = true
        }
      }
    }

    state.mouseDownTarget = null
    state.mouseCaptureTarget = null
    updateMouseCursor(state, target)
  } else if (action === "move") {
    const dispatchTarget = state.mouseCaptureTarget ?? target
    const event = createMouseEvent(
      "mousemove",
      x,
      y,
      dispatchTarget,
      parsed,
      state.keyboardModifiers,
    )
    dispatchMouseEvent(event)

    // Compute enter/leave transitions
    const newPath = getAncestorPath(target)
    const { entered, left } = computeEnterLeave(state.hoverPath, newPath)

    // Fire mouseleave on nodes that were left (reverse order = deepest first)
    for (const node of left) {
      setHovered(node, false)
      const leaveEvent = createMouseEvent("mouseleave", x, y, node, parsed, state.keyboardModifiers)
      dispatchMouseEvent(leaveEvent)
    }

    // Fire mouseenter on newly entered nodes (forward order = shallowest first)
    for (const node of entered.reverse()) {
      setHovered(node, true)
      const enterEvent = createMouseEvent("mouseenter", x, y, node, parsed, state.keyboardModifiers)
      dispatchMouseEvent(enterEvent)
    }

    state.hoverPath = newPath
  } else if (action === "wheel") {
    const event = createWheelEvent(x, y, target, parsed, state.keyboardModifiers)
    dispatchMouseEvent(event)
    if (event.defaultPrevented) defaultPrevented = true
  }
  return defaultPrevented
}
