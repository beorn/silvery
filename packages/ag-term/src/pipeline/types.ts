/**
 * Shared types for the Silvery render pipeline.
 */

import type { Cell } from "../buffer"
import type { Measurer } from "../unicode"

/**
 * Context threaded through the render pipeline.
 *
 * Carries per-render resources that were previously accessed via module-level
 * globals (e.g., `_scopedMeasurer` + `runWithMeasurer()`). Threading context
 * explicitly eliminates save/restore patterns and makes the pipeline pure.
 *
 * Phase 1: measurer only.
 * Phase 2: NodeRenderState for per-node params.
 * Phase 3: instrumentation/diagnostics fields (optional — fall back to
 *   module-level globals when absent for backward compat).
 */
export interface PipelineContext {
  readonly measurer: Measurer
  // Phase 3: instrumentation (all optional for backward compat)
  readonly instrumentEnabled?: boolean
  readonly stats?: RenderPhaseStats
  readonly nodeTrace?: NodeTraceEntry[]
  readonly nodeTraceEnabled?: boolean
  readonly bgConflictMode?: BgConflictMode
  readonly warnedBgConflicts?: Set<string>
}

/**
 * Background conflict detection mode.
 * Set via SILVERY_BG_CONFLICT env var: 'ignore' | 'warn' | 'throw'
 */
export type BgConflictMode = "ignore" | "warn" | "throw"

/**
 * Per-node trace entry for SILVERY_STRICT diagnosis.
 */
export interface NodeTraceEntry {
  id: string
  type: string
  depth: number
  rect: string
  prevLayout: string
  hasPrev: boolean
  ancestorCleared: boolean
  flags: string
  decision: string
  layoutChanged: boolean
  contentAreaAffected?: boolean
  contentRegionCleared?: boolean
  childrenNeedFreshRender?: boolean
  childHasPrev?: boolean
  childAncestorCleared?: boolean
  skipBgFill?: boolean
  bgColor?: string
}

/**
 * Mutable stats counters for render phase instrumentation.
 * Reset after each renderPhase call.
 */
export interface RenderPhaseStats {
  nodesVisited: number
  nodesRendered: number
  nodesSkipped: number
  textNodes: number
  boxNodes: number
  clearOps: number
  // Per-flag breakdown: why nodes weren't skipped
  noPrevBuffer: number
  flagContentDirty: number
  flagStylePropsDirty: number
  flagLayoutChanged: number
  flagSubtreeDirty: number
  flagChildrenDirty: number
  flagChildPositionChanged: number
  flagAncestorLayoutChanged: number
  // Scroll container diagnostics
  scrollContainerCount: number
  scrollViewportCleared: number
  scrollClearReason: string
  // Normal container diagnostics
  normalChildrenRepaint: number
  normalRepaintReason: string
  /**
   * Count of children force-rendered because an earlier first-pass sibling's
   * boxRect overlapped them. CSS paint order requires later siblings to win
   * at any overlap; on incremental renders the earlier sibling's painting
   * destroys the later sibling's pixels in the cloned buffer, so the later
   * sibling must repaint even when its own dirty flags are clean.
   */
  siblingOverlapForced: number
  // Cascade diagnostics
  cascadeMinDepth: number
  cascadeNodes: string
  // Top-level prevBuffer diagnostics
  _noopSkip: number
  _prevBufferNull: number
  _prevBufferDimMismatch: number
  _hasPrevBuffer: number
  _layoutW: number
  _layoutH: number
  _prevW: number
  _prevH: number
  _callCount: number
}

/**
 * Clip bounds for viewport clipping.
 */
export type ClipBounds = { top: number; bottom: number; left?: number; right?: number }

/**
 * Per-node render state that changes at each tree level.
 *
 * Groups the parameters that vary per-node during tree traversal:
 * - scrollOffset: accumulated scroll offset from scroll containers
 * - clipBounds: viewport clipping rectangle (from overflow containers)
 * - hasPrevBuffer: whether the buffer was cloned from a previous frame
 * - ancestorCleared: whether an ancestor already cleared this node's region
 *
 * Contrast with frame-scoped params (buffer, ctx) which stay the same
 * for the entire render pass.
 */
export interface NodeRenderState {
  scrollOffset: number
  clipBounds?: ClipBounds
  hasPrevBuffer: boolean
  ancestorCleared: boolean
  /** True when the buffer was cloned from prevBuffer (stale pixels exist).
   * False when the buffer is a fresh TerminalBuffer (no stale pixels).
   * Unlike hasPrevBuffer (which can be false per-node on a cloned buffer),
   * this is constant for the entire render pass. Used to prevent clearExcessArea
   * from writing inherited bg into a fresh buffer — no stale pixels to clear. */
  bufferIsCloned: boolean
  /** True when any ancestor had layoutChangedThisFrame = true.
   * Propagated top-down to prevent descendants from being skipped when their
   * own dirty flags are clean but their pixels are at wrong positions in the
   * cloned buffer (because an ancestor moved/resized). Without this, the
   * hasPrevBuffer cascade handles most cases, but this adds a direct safety
   * net in the skip condition itself. */
  ancestorLayoutChanged?: boolean
  /** Inherited background from nearest ancestor with backgroundColor or theme.
   * Threaded top-down so every node has O(1) access — no parent chain walks.
   * Contains the parsed color and the ancestor's rect for clipping.
   * Always set: root initializes with { color: null, ancestorRect: null }. */
  inheritedBg: {
    color: import("../buffer").Color
    ancestorRect: { x: number; y: number; width: number; height: number } | null
  }
  /** Inherited foreground from nearest ancestor with color or theme.
   * Threaded top-down so every node has O(1) access — no parent chain walks.
   * Always set: root initializes with null (terminal default). */
  inheritedFg: import("../buffer").Color
}

/**
 * Cell change for diffing.
 */
export interface CellChange {
  x: number
  y: number
  cell: Cell
}

/**
 * Border character sets.
 */
export interface BorderChars {
  topLeft: string
  topRight: string
  bottomLeft: string
  bottomRight: string
  horizontal: string
  vertical: string
  /** Bottom horizontal character. When absent, falls back to `horizontal`. */
  bottomHorizontal?: string
  /** Right vertical character. When absent, falls back to `vertical`. */
  rightVertical?: string
}
