/**
 * Phase 3: Render Phase
 *
 * Render all nodes to a terminal buffer.
 *
 * This module orchestrates the rendering process by traversing the node tree
 * and delegating to specialized rendering functions for boxes and text.
 *
 * Layout (top-down):
 *   renderPhase → renderNodeToBuffer → buildCascadeInputs + computeCascade
 *                                     → traceRenderDecision (diagnostics)
 *                                     → executeRegionClearing
 *                                     → renderOwnContent
 *                                     → renderScrollContainerChildren / renderNormalChildren
 *   Helpers: clearDirtyFlags, hasChildPositionChanged, computeChildClipBounds
 *   Region clearing: clearNodeRegion, clearExcessArea, clippedFill
 */

import { createLogger } from "loggily"
import type { Color } from "../buffer"
import { TerminalBuffer } from "../buffer"
import type { BoxProps, AgNode, TextProps } from "@silvery/ag/types"
import { getBorderSize, getPadding } from "./helpers"
import { renderBox, renderOutline, renderScrollIndicators, getEffectiveBg } from "./render-box"
import { getTextStyle, parseColor } from "./render-helpers"
import { clearBgConflictWarnings, renderText, setBgConflictMode } from "./render-text"
import { pushContextTheme, popContextTheme } from "@silvery/theme/state"
import type { Theme } from "@silvery/theme/types"
import { computeCascade } from "./cascade-predicates"
import { isStyleOnlyDirty } from "@silvery/ag/dirty-tracking"
import { isCurrentEpoch, INITIAL_EPOCH, advanceRenderEpoch } from "@silvery/ag/epoch"
import type { CascadeOutputs } from "./cascade-predicates"
import type { ClipBounds, RenderPhaseStats, NodeRenderState, NodeTraceEntry, PipelineContext } from "./types"
import { getReactiveState, syncToSignals, assertReactiveMatchesOracle } from "./reactive-node"

const contentLog = createLogger("silvery:content")
const traceLog = createLogger("silvery:content:trace")
const cellLog = createLogger("silvery:content:cell")

/**
 * Render all nodes to a terminal buffer.
 *
 * @param root The root SilveryNode
 * @param prevBuffer Previous buffer for incremental rendering (optional)
 * @returns A TerminalBuffer with the rendered content
 */
export function renderPhase(root: AgNode, prevBuffer?: TerminalBuffer | null, ctx?: PipelineContext): TerminalBuffer {
  const layout = root.boxRect
  if (!layout) {
    throw new Error("renderPhase called before layout phase")
  }

  // Resolve instrumentation from ctx (if provided) or module-level globals
  const instrumentEnabled = ctx?.instrumentEnabled ?? _instrumentEnabled
  const stats = ctx?.stats ?? _renderPhaseStats
  const nodeTrace = ctx?.nodeTrace ?? _nodeTrace
  const nodeTraceEnabled = ctx?.nodeTraceEnabled ?? _nodeTraceEnabled

  // Clone prevBuffer if same dimensions, else create fresh
  const hasPrevBuffer = prevBuffer && prevBuffer.width === layout.width && prevBuffer.height === layout.height

  if (instrumentEnabled) {
    _renderPhaseCallCount++
    stats._prevBufferNull = prevBuffer == null ? 1 : 0
    stats._prevBufferDimMismatch = prevBuffer && !hasPrevBuffer ? 1 : 0
    stats._hasPrevBuffer = hasPrevBuffer ? 1 : 0
    stats._layoutW = layout.width
    stats._layoutH = layout.height
    stats._prevW = prevBuffer?.width ?? 0
    stats._prevH = prevBuffer?.height ?? 0
    stats._callCount = _renderPhaseCallCount
  }

  const t0 = instrumentEnabled ? performance.now() : 0
  const buffer = hasPrevBuffer ? prevBuffer.clone() : new TerminalBuffer(layout.width, layout.height)
  const tClone = instrumentEnabled ? performance.now() - t0 : 0

  // Default: root is selectable (userSelect defaults to "text").
  // renderNodeToBuffer will override per-node as it traverses.
  buffer.setSelectableMode(true)

  const t1 = instrumentEnabled ? performance.now() : 0
  renderNodeToBuffer(
    root,
    buffer,
    {
      scrollOffset: 0,
      clipBounds: undefined,
      hasPrevBuffer: !!hasPrevBuffer,
      ancestorCleared: false,
      bufferIsCloned: !!hasPrevBuffer,
      ancestorLayoutChanged: false,
      inheritedBg: { color: null, ancestorRect: null },
      inheritedFg: null,
    },
    ctx,
  )
  const tRender = instrumentEnabled ? performance.now() - t1 : 0

  if (instrumentEnabled) {
    // Expose sub-phase timing for profiling
    const snap = {
      clone: tClone,
      render: tRender,
      ...structuredClone(stats),
    }
    // Retain globalThis for programmatic consumers (STRICT diagnostics, perf profiling)
    ;(globalThis as any).__silvery_content_detail = snap
    const arr = ((globalThis as any).__silvery_content_all ??= [] as (typeof snap)[])
    arr.push(snap)
    // Route human-readable output through loggily
    contentLog.debug?.(
      `frame ${snap._callCount}: ${snap.nodesRendered}/${snap.nodesVisited} rendered, ${snap.nodesSkipped} skipped (${tClone.toFixed(1)}ms clone, ${tRender.toFixed(1)}ms render)`,
    )
    for (const key of Object.keys(stats) as (keyof RenderPhaseStats)[]) {
      ;(stats as any)[key] = 0
    }
    stats.cascadeMinDepth = 999
    stats.cascadeNodes = ""
    stats.scrollClearReason = ""
    stats.normalRepaintReason = ""
  }

  // Export node trace for SILVERY_STRICT diagnosis
  if (nodeTraceEnabled && nodeTrace.length > 0) {
    // Retain globalThis for programmatic consumers (STRICT diagnostics)
    const traceArr = ((globalThis as any).__silvery_node_trace ??= [] as NodeTraceEntry[][])
    traceArr.push([...nodeTrace])
    // Route human-readable output through loggily
    traceLog.debug?.(`${nodeTrace.length} nodes traced`)
    nodeTrace.length = 0
  }

  // Sync prevLayout after render phase to prevent staleness on subsequent frames.
  // Without this, prevLayout stays at the old value from propagateLayout, causing
  // hasChildPositionChanged and clearExcessArea to use stale coordinates.
  syncPrevLayout(root)

  // Advance the render epoch — all dirty flags stamped with the old epoch
  // instantly become "not dirty". This replaces the O(N) clearDirtyFlags walk
  // for rendered nodes (skipped nodes still need explicit clearing).
  advanceRenderEpoch()

  return buffer
}

/**
 * Sync prevLayout to boxRect for all nodes in the tree.
 *
 * Called at the end of each renderPhase pass. This prevents:
 * 1. The O(N) staleness bug where prevLayout drifts from boxRect
 *    causing !rectEqual to always be true on subsequent frames.
 * 2. Stale old-bounds references in clearExcessArea on doRender iteration 2+.
 * 3. Asymmetry between incremental and fresh renders — doFreshRender's layout
 *    phase syncs prevLayout before content, so without this, the real render
 *    has null/stale prevLayout while fresh has synced prevLayout, causing
 *    different cascade behavior (layoutChanged true vs false).
 */
function syncPrevLayout(root: AgNode): void {
  const stack: AgNode[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    node.prevLayout = node.boxRect
    const children = node.children
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]!)
    }
  }
}

/** Check if an env var is truthy (treats "0" and "false" as disabled). */
function envTruthy(val: string | undefined): boolean {
  return !!val && val !== "0" && val !== "false"
}

/** Instrumentation enabled when SILVERY_STRICT or SILVERY_INSTRUMENT is set */
const _instrumentEnabled =
  typeof process !== "undefined" &&
  (envTruthy(process.env?.SILVERY_STRICT) || envTruthy(process.env?.SILVERY_INSTRUMENT))

/** Mutable stats counters — reset after each renderPhase call */
const _renderPhaseStats: RenderPhaseStats = {
  nodesVisited: 0,
  nodesRendered: 0,
  nodesSkipped: 0,
  textNodes: 0,
  boxNodes: 0,
  clearOps: 0,
  noPrevBuffer: 0,
  flagContentDirty: 0,
  flagStylePropsDirty: 0,
  flagLayoutChanged: 0,
  flagSubtreeDirty: 0,
  flagChildrenDirty: 0,
  flagChildPositionChanged: 0,
  flagAncestorLayoutChanged: 0,
  scrollContainerCount: 0,
  scrollViewportCleared: 0,
  scrollClearReason: "",
  normalChildrenRepaint: 0,
  normalRepaintReason: "",
  cascadeMinDepth: 999,
  cascadeNodes: "",
  _prevBufferNull: 0,
  _prevBufferDimMismatch: 0,
  _hasPrevBuffer: 0,
  _layoutW: 0,
  _layoutH: 0,
  _prevW: 0,
  _prevH: 0,
  _callCount: 0,
}

let _renderPhaseCallCount = 0

/** Module-level node trace (fallback when ctx.nodeTrace is not provided) */
const _nodeTrace: NodeTraceEntry[] = []
const _nodeTraceEnabled = typeof process !== "undefined" && envTruthy(process.env?.SILVERY_STRICT)

/** E+ Phase 2: verify reactive cascade computeds match oracle in STRICT mode */
const _reactiveVerifyEnabled = typeof process !== "undefined" && envTruthy(process.env?.SILVERY_STRICT)

/** DIAG: compute node depth in tree */
function _getNodeDepth(node: AgNode): number {
  let depth = 0
  let n: AgNode | null = node.parent
  while (n) {
    depth++
    n = n.parent
  }
  return depth
}

// Re-export for consumers who need to clear bg conflict warnings
export { clearBgConflictWarnings, setBgConflictMode }

// ============================================================================
// Core Rendering
// ============================================================================

/**
 * Render a single node to the buffer.
 */
function renderNodeToBuffer(
  node: AgNode,
  buffer: TerminalBuffer,
  nodeState: NodeRenderState,
  ctx?: PipelineContext,
): void {
  const {
    scrollOffset,
    clipBounds,
    hasPrevBuffer,
    ancestorCleared,
    bufferIsCloned,
    ancestorLayoutChanged = false,
  } = nodeState
  // Resolve instrumentation from ctx or module globals
  const instrumentEnabled = ctx?.instrumentEnabled ?? _instrumentEnabled
  const stats = ctx?.stats ?? _renderPhaseStats
  const nodeTrace = ctx?.nodeTrace ?? _nodeTrace
  const nodeTraceEnabled = ctx?.nodeTraceEnabled ?? _nodeTraceEnabled
  if (instrumentEnabled) stats.nodesVisited++
  const layout = node.boxRect
  if (!layout) return

  // Skip nodes without Yoga (raw text and virtual text nodes)
  // Their content is rendered by their parent silvery-text via collectTextContent()
  if (!node.layoutNode) {
    // Clear dirty flags so markSubtreeDirty() can propagate future updates.
    // Without this, virtual text children keep stale subtreeDirty=true from
    // creation, causing markSubtreeDirty to stop early and never reach the
    // layout ancestor — producing 0-byte diffs on text content changes.
    clearVirtualTextFlags(node)
    return
  }

  // Skip hidden nodes (Suspense support)
  // When a Suspense boundary shows a fallback, the hidden subtree is not rendered
  if (node.hidden) {
    clearDirtyFlags(node)
    return
  }

  const props = node.props as BoxProps & TextProps

  // Resolve userSelect for SELECTABLE_FLAG stamping.
  // Set buffer selectable mode before any cell writes. Restore on exit.
  const prevSelectableMode = buffer.getSelectableMode()
  const userSelect = props.userSelect
  if (userSelect === "none") {
    buffer.setSelectableMode(false)
  } else if (userSelect === "text" || userSelect === "contain") {
    buffer.setSelectableMode(true)
  }
  // "auto" or undefined: inherit parent's mode (already set on buffer)

  // Skip display="none" nodes - they have 0x0 dimensions and shouldn't render
  // Also skip their children since the entire subtree is hidden
  if (props.display === "none") {
    clearDirtyFlags(node)
    buffer.setSelectableMode(prevSelectableMode)
    return
  }

  // Skip nodes entirely off-screen (viewport clipping).
  // The scroll container's VirtualList already handles most culling, but this
  // catches any remaining nodes rendered below/above the visible area.
  //
  // IMPORTANT: Don't clear dirty flags on nodes that were never rendered.
  // Just skip them and leave their flags intact so they render correctly
  // when scrolled into view.
  //
  // Why this matters: clearDirtyFlags on off-screen nodes prevents them from
  // rendering when they later become visible:
  // 1. Node off-screen → clearDirtyFlags → all flags false
  // 2. Scroll brings node on-screen with hasPrevBuffer=true
  // 3. canSkipEntireSubtree = true (all flags clean) → node SKIPPED
  // 4. Buffer has stale/blank pixels → blank content visible
  //
  // By preserving dirty flags, the node forces rendering when it enters
  // the visible area. The subtreeDirty flag on ancestors is maintained
  // because we don't clear it — markSubtreeDirty() already set it during
  // reconciliation/layout, and not clearing here preserves that signal.
  const screenY = layout.y - scrollOffset
  if (screenY >= buffer.height || screenY + layout.height <= 0) {
    buffer.setSelectableMode(prevSelectableMode)
    return
  }

  // FAST PATH: Skip entire subtree if unchanged and we have a previous buffer
  // The buffer was cloned from prevBuffer, so skipped nodes keep their rendered output
  //
  // layoutChanged: did this node's layout position/size change?
  // Uses layoutChangedThisFrame (set by propagateLayout in layout phase) instead of
  // the stale !rectEqual(prevLayout, boxRect). The rect comparison is asymmetric
  // between incremental and fresh renders: doFreshRender's layout phase syncs
  // prevLayout=boxRect before content, making layoutChanged=false, while the
  // real render may have prevLayout=null (new nodes), making layoutChanged=true.
  // This asymmetry causes contentAreaAffected→clearNodeRegion to fire in incremental
  // but not fresh, wiping sibling content. layoutChangedThisFrame is symmetric.
  const layoutChanged = isCurrentEpoch(node.layoutChangedThisFrame)

  // Check if any child shifted position (sibling shift from size changes).
  // Gap space between children belongs to this container, so must re-render.
  const childPositionChanged = !!(hasPrevBuffer && !layoutChanged && hasChildPositionChanged(node))

  // Check if this node is a scroll container whose offset changed.
  // The scroll phase (layout-phase.ts) sets subtreeDirty on the scroll container
  // when offset changes, and the reconciler propagates subtreeDirty to ancestors
  // when scrollTo/scrollOffset props change. However, this defensive check
  // catches edge cases where scroll offset changes without proper dirty
  // propagation — e.g., layout feedback loops that alter scroll state between
  // render passes without a reconciler commit.
  const scrollOffsetChanged = !!(node.scrollState && node.scrollState.offset !== node.scrollState.prevOffset)

  // FAST PATH: Skip unchanged subtrees when we have a valid previous buffer.
  // The cloned buffer already has correct pixels for clean nodes.
  // SILVERY_STRICT=1 verifies this by comparing incremental vs fresh renders.
  //
  // ancestorLayoutChanged: an ancestor's layout position/size changed this frame.
  // Even if this node's own flags are clean, its pixels in the cloned buffer are
  // at coordinates relative to the old ancestor layout. The node must re-render
  // at its new absolute position. This is a safety net — normally the parent's
  // childrenNeedFreshRender cascade sets childHasPrev=false which prevents skipping,
  // but ancestorLayoutChanged catches cases where the cascade doesn't propagate
  // (e.g., ancestor with backgroundColor that breaks the ancestorCleared chain).
  const canSkipEntireSubtree =
    hasPrevBuffer &&
    !isCurrentEpoch(node.contentDirtyEpoch) &&
    !isCurrentEpoch(node.stylePropsDirtyEpoch) &&
    !layoutChanged &&
    !isCurrentEpoch(node.subtreeDirtyEpoch) &&
    !isCurrentEpoch(node.childrenDirtyEpoch) &&
    !childPositionChanged &&
    !ancestorLayoutChanged &&
    !scrollOffsetChanged

  // Node ID for tracing (only trace named nodes to keep compact)
  const _nodeId = instrumentEnabled ? ((props.id as string | undefined) ?? "") : ""
  const _traceThis = instrumentEnabled && nodeTraceEnabled && _nodeId

  // Cell debug: log nodes that cover the target cell.
  // Retained on globalThis for STRICT diagnostics (create-app.tsx reads the accumulated log).
  const _cellDbg = (globalThis as any).__silvery_cell_debug as { x: number; y: number; log: string[] } | undefined
  const _coversCellNow =
    _cellDbg &&
    layout.x <= _cellDbg.x &&
    layout.x + layout.width > _cellDbg.x &&
    screenY <= _cellDbg.y &&
    screenY + layout.height > _cellDbg.y
  const _coversCellPrev =
    _cellDbg &&
    node.prevLayout &&
    node.prevLayout.x <= _cellDbg.x &&
    node.prevLayout.x + node.prevLayout.width > _cellDbg.x &&
    node.prevLayout.y - scrollOffset <= _cellDbg.y &&
    node.prevLayout.y - scrollOffset + node.prevLayout.height > _cellDbg.y

  if (canSkipEntireSubtree) {
    if (_cellDbg && (_coversCellNow || _coversCellPrev)) {
      const id = (props.id as string) ?? node.type
      const depth = _getNodeDepth(node)
      const prev = node.prevLayout
      const msg =
        `SKIP ${id}@${depth} rect=${layout.x},${screenY} ${layout.width}x${layout.height}` +
        ` prev=${prev ? `${prev.x},${prev.y - scrollOffset} ${prev.width}x${prev.height}` : "null"}` +
        ` coversNow=${_coversCellNow} coversPrev=${_coversCellPrev}`
      _cellDbg.log.push(msg)
      cellLog.debug?.(msg)
    }
    if (instrumentEnabled) {
      stats.nodesSkipped++
      if (_traceThis) {
        nodeTrace.push({
          id: _nodeId,
          type: node.type,
          depth: _getNodeDepth(node),
          rect: `${layout.x},${layout.y} ${layout.width}x${layout.height}`,
          prevLayout: node.prevLayout
            ? `${node.prevLayout.x},${node.prevLayout.y} ${node.prevLayout.width}x${node.prevLayout.height}`
            : "null",
          hasPrev: hasPrevBuffer,
          ancestorCleared,
          flags: "",
          decision: "SKIPPED",
          layoutChanged,
        })
      }
    }
    clearDirtyFlags(node)
    buffer.setSelectableMode(prevSelectableMode)
    return
  }
  if (instrumentEnabled) {
    stats.nodesRendered++
    if (!hasPrevBuffer) stats.noPrevBuffer++
    if (isCurrentEpoch(node.contentDirtyEpoch)) stats.flagContentDirty++
    if (isCurrentEpoch(node.stylePropsDirtyEpoch)) stats.flagStylePropsDirty++
    if (layoutChanged) stats.flagLayoutChanged++
    if (isCurrentEpoch(node.subtreeDirtyEpoch)) stats.flagSubtreeDirty++
    if (isCurrentEpoch(node.childrenDirtyEpoch)) stats.flagChildrenDirty++
    if (childPositionChanged) stats.flagChildPositionChanged++
    if (ancestorLayoutChanged) stats.flagAncestorLayoutChanged++
  }

  // Push per-subtree theme override (if this Box has a theme prop).
  // Placed after all early returns and fast-path skip — only active during
  // actual rendering. Popped at the end of this function after all child passes.
  const nodeTheme = (props as BoxProps).theme as Theme | undefined
  if (nodeTheme) pushContextTheme(nodeTheme)
  try {
    // Check if this is a scrollable container
    const isScrollContainer = props.overflow === "scroll" && node.scrollState

    // Build tree-dependent cascade inputs (child traversal), then compute cascade.
    // See cascade-predicates.ts for the truth table and invariants.
    const { absoluteChildMutated, descendantOverflowChanged } = buildCascadeInputs(node, hasPrevBuffer)
    let cascade = computeCascade({
      hasPrevBuffer,
      contentDirty: isCurrentEpoch(node.contentDirtyEpoch),
      stylePropsDirty: isCurrentEpoch(node.stylePropsDirtyEpoch),
      layoutChanged,
      subtreeDirty: isCurrentEpoch(node.subtreeDirtyEpoch),
      childrenDirty: isCurrentEpoch(node.childrenDirtyEpoch),
      childPositionChanged,
      ancestorLayoutChanged,
      ancestorCleared,
      bgDirty: isCurrentEpoch(node.bgDirtyEpoch),
      isTextNode: node.type === "silvery-text",
      hasBgColor: !!getEffectiveBg(props),
      absoluteChildMutated,
      descendantOverflowChanged,
    })

    // E+ Phase 2: Verify reactive computeds match oracle (STRICT mode only).
    // This syncs epoch flags → signals, reads computeds, and asserts equivalence.
    // Zero cost in production (gated on module-level const).
    if (_reactiveVerifyEnabled) {
      const reactiveState = getReactiveState(node)
      syncToSignals(reactiveState, node, {
        hasPrevBuffer,
        layoutChanged,
        childPositionChanged,
        ancestorLayoutChanged,
        ancestorCleared,
        absoluteChildMutated,
        descendantOverflowChanged,
        hasBgColor: !!getEffectiveBg(props),
      })
      assertReactiveMatchesOracle(reactiveState, cascade, (props.id as string) ?? node.type)
    }

    // bgOnlyChange safety check: fillBg updates ALL cells in the region, which
    // would incorrectly overwrite children with their own explicit backgroundColor.
    // Fall back to the full path when any descendant has its own bg.
    if (cascade.bgOnlyChange && hasDescendantWithBg(node)) {
      const childrenNeedFreshRender =
        (hasPrevBuffer || ancestorCleared) && (cascade.contentAreaAffected || cascade.bgRefillNeeded)
      cascade = { ...cascade, bgOnlyChange: false, childrenNeedFreshRender }
    }
    const { contentRegionCleared, skipBgFill, childrenNeedFreshRender } = cascade

    // DIAG: Per-node trace, cascade tracking, and cell debug
    if (instrumentEnabled || (_cellDbg && (_coversCellNow || _coversCellPrev))) {
      traceRenderDecision(
        node,
        props,
        layout,
        screenY,
        scrollOffset,
        hasPrevBuffer,
        ancestorCleared,
        layoutChanged,
        childPositionChanged,
        cascade,
        _nodeId,
        _traceThis,
        _cellDbg,
        _coversCellNow,
        _coversCellPrev,
        instrumentEnabled,
        stats,
        nodeTrace,
      )
    }

    // Text style-only fast path: when only visual style props changed on a text
    // node (no content, bg, or children changes), we restyle existing cells
    // instead of re-rendering. In this case, skip region clearing — the chars
    // in the cloned buffer are correct and must be preserved.
    //
    // CRITICAL: check !contentDirty and !childrenDirty in addition to
    // isStyleOnlyDirty. The reconciler may set isStyleOnlyDirty in commitUpdate
    // (based on prop changes alone), then commitTextUpdate on a child sets
    // contentDirty on the layout ancestor. Both flags can be true simultaneously.
    // Text style-only fast path: when only visual style props changed on a text
    // node (no content, bg, or children changes), we restyle existing cells
    // instead of re-rendering. In this case, skip region clearing — the chars
    // in the cloned buffer are correct and must be preserved.
    //
    // CRITICAL: check !contentDirty and !childrenDirty in addition to
    // isStyleOnlyDirty. The reconciler may set isStyleOnlyDirty in commitUpdate
    // (based on prop changes alone), then commitTextUpdate on a child sets
    // contentDirty on the layout ancestor. Both flags can be true simultaneously.
    // DISABLED: text style-only fast path causes incremental rendering mismatches
    // (fg colors lost). Needs investigation before re-enabling.
    const useTextStyleFastPath = false

    // Clear stale regions in the cloned buffer before rendering content.
    // Suppress clearing when using the text style-only fast path — chars are
    // correct in the clone and clearNodeRegion would destroy them with spaces.
    executeRegionClearing(
      node,
      buffer,
      layout,
      scrollOffset,
      clipBounds,
      bufferIsCloned,
      layoutChanged,
      useTextStyleFastPath ? false : contentRegionCleared,
      descendantOverflowChanged,
      instrumentEnabled,
      stats,
      nodeState.inheritedBg,
    )

    // Determine if this node's own content (border, bg, text) needs repainting.
    // When hasPrevBuffer=true and only subtreeDirty is set (no own visual changes),
    // the cloned buffer already has correct own content. Skipping avoids a border
    // redraw that would overwrite child content rendered on top of the border area
    // (e.g., text overflow into border columns).
    const needsOwnRepaint =
      !hasPrevBuffer ||
      ancestorCleared ||
      ancestorLayoutChanged ||
      cascade.contentAreaAffected ||
      isCurrentEpoch(node.stylePropsDirtyEpoch) ||
      cascade.bgRefillNeeded

    // Render this node's own content (box bg/border or text).
    // Compute boxInheritedBg even when skipping own repaint — it's needed by
    // outline rendering (after children) and may be needed by child rendering.
    const boxInheritedBg =
      node.type === "silvery-box" && !getEffectiveBg(props) ? nodeState.inheritedBg.color : undefined
    if (needsOwnRepaint) {
      renderOwnContent(
        node,
        buffer,
        layout,
        props,
        nodeState,
        skipBgFill,
        instrumentEnabled,
        stats,
        ctx,
        cascade.bgOnlyChange,
        useTextStyleFastPath,
      )
    }

    // Compute inherited bg/fg for children. If this node sets backgroundColor,
    // color, or theme, children inherit from this node. Otherwise, inherit from parent.
    const effectiveBg = getEffectiveBg(props)
    const childInheritedBg = effectiveBg
      ? { color: parseColor(effectiveBg), ancestorRect: node.boxRect }
      : nodeTheme
        ? { color: parseColor(nodeTheme.bg), ancestorRect: node.boxRect }
        : nodeState.inheritedBg
    const childInheritedFg = props.color
      ? parseColor(props.color)
      : nodeTheme
        ? parseColor(nodeTheme.fg)
        : nodeState.inheritedFg

    // Render children — pass inherited bg/fg so children don't walk the parent chain
    const childState: NodeRenderState = { ...nodeState, inheritedBg: childInheritedBg, inheritedFg: childInheritedFg }
    if (isScrollContainer) {
      renderScrollContainerChildren(node, buffer, props, childState, contentRegionCleared, childrenNeedFreshRender, ctx)

      // Render overflow indicators AFTER children so they survive viewport clear.
      // renderScrollContainerChildren may clear the viewport (Tier 2) which would
      // overwrite indicators drawn before children.
      renderScrollIndicators(node, buffer, layout, props, node.scrollState!, ctx)
    } else {
      renderNormalChildren(
        node,
        buffer,
        props,
        childState,
        childPositionChanged,
        contentRegionCleared,
        childrenNeedFreshRender,
        ctx,
      )
    }

    // Render outline AFTER children — outline overlaps content at edges
    if (node.type === "silvery-box" && props.outlineStyle) {
      const { x, width, height } = layout
      const y = layout.y - scrollOffset
      renderOutline(buffer, x, y, width, height, props, clipBounds, boxInheritedBg)
    }

    // Clear dirty flags (current node only — children clear their own when rendered)
    clearNodeDirtyFlags(node)
  } finally {
    // Pop per-subtree theme override (after ALL child passes including absolute/sticky)
    if (nodeTheme) popContextTheme()
    // Restore parent's selectable mode
    buffer.setSelectableMode(prevSelectableMode)
  }
}

// ============================================================================
// Cascade Input Helpers
// ============================================================================

/**
 * Build tree-dependent cascade inputs that require child traversal.
 *
 * These feed into computeCascade() alongside the node's own dirty flags.
 * Separated from renderNodeToBuffer to keep the main function focused on
 * the rendering flow rather than child traversal details.
 */
function buildCascadeInputs(
  node: AgNode,
  hasPrevBuffer: boolean,
): { absoluteChildMutated: boolean; descendantOverflowChanged: boolean } {
  if (!hasPrevBuffer || !isCurrentEpoch(node.subtreeDirtyEpoch) || node.children === undefined) {
    return { absoluteChildMutated: false, descendantOverflowChanged: false }
  }

  // absoluteChildMutated: an absolute child had structural changes (children
  // mount/unmount/reorder, layout change, child position shift). Forces parent
  // to clear stale overlay pixels in gap areas.
  const absoluteChildMutated = node.children.some((child) => {
    const cp = child.props as BoxProps
    return (
      cp.position === "absolute" &&
      (isCurrentEpoch(child.childrenDirtyEpoch) ||
        isCurrentEpoch(child.layoutChangedThisFrame) ||
        hasChildPositionChanged(child))
    )
  })

  // descendantOverflowChanged: a descendant was overflowing THIS node's rect
  // in the previous frame and its layout changed. Must be detected recursively
  // at THIS level so borders are properly restored.
  const descendantOverflowChanged = hasDescendantOverflowChanged(node)

  return { absoluteChildMutated, descendantOverflowChanged }
}

// ============================================================================
// Render Decision Tracing
// ============================================================================

/**
 * Log per-node trace, cascade tracking, and cell debug info.
 *
 * Gated on instrumentation or cell debug being active. Separated from
 * renderNodeToBuffer to keep the main function focused on rendering logic.
 */
function traceRenderDecision(
  node: AgNode,
  props: BoxProps & TextProps,
  layout: NonNullable<AgNode["boxRect"]>,
  screenY: number,
  scrollOffset: number,
  hasPrevBuffer: boolean,
  ancestorCleared: boolean,
  layoutChanged: boolean,
  childPositionChanged: boolean,
  cascade: CascadeOutputs,
  _nodeId: string,
  _traceThis: string | false | 0 | "",
  _cellDbg: { x: number; y: number; log: string[] } | undefined,
  _coversCellNow: boolean | undefined,
  _coversCellPrev: boolean | null | undefined,
  instrumentEnabled: boolean,
  stats: RenderPhaseStats,
  nodeTrace: NodeTraceEntry[],
): void {
  const { contentAreaAffected, contentRegionCleared, skipBgFill, childrenNeedFreshRender } = cascade

  // Per-node trace and cascade tracking (gated on instrumentation)
  if (instrumentEnabled) {
    if (_traceThis) {
      const flagStr = [
        isCurrentEpoch(node.contentDirtyEpoch) && "C",
        isCurrentEpoch(node.stylePropsDirtyEpoch) && "P",
        isCurrentEpoch(node.bgDirtyEpoch) && "B",
        isCurrentEpoch(node.subtreeDirtyEpoch) && "S",
        isCurrentEpoch(node.childrenDirtyEpoch) && "Ch",
        childPositionChanged && "CP",
      ]
        .filter(Boolean)
        .join(",")
      const childrenNeedRepaint_ =
        isCurrentEpoch(node.childrenDirtyEpoch) || childPositionChanged || childrenNeedFreshRender
      const childHasPrev_ = childrenNeedRepaint_ ? false : hasPrevBuffer
      const childAncestorCleared_ = contentRegionCleared || (ancestorCleared && !getEffectiveBg(props))
      nodeTrace.push({
        id: _nodeId,
        type: node.type,
        depth: _getNodeDepth(node),
        rect: `${layout.x},${layout.y} ${layout.width}x${layout.height}`,
        prevLayout: node.prevLayout
          ? `${node.prevLayout.x},${node.prevLayout.y} ${node.prevLayout.width}x${node.prevLayout.height}`
          : "null",
        hasPrev: hasPrevBuffer,
        ancestorCleared,
        flags: flagStr,
        decision: "RENDER",
        layoutChanged,
        contentAreaAffected,
        contentRegionCleared,
        childrenNeedFreshRender,
        childHasPrev: childHasPrev_,
        childAncestorCleared: childAncestorCleared_,
        skipBgFill,
        bgColor: props.backgroundColor as string | undefined,
      })
    }
    if (childrenNeedFreshRender && node.children.length > 0) {
      const depth = _getNodeDepth(node)
      if (depth < stats.cascadeMinDepth) {
        stats.cascadeMinDepth = depth
      }
      const id = (node.props as Record<string, unknown>).id ?? node.type
      const flags = [
        isCurrentEpoch(node.contentDirtyEpoch) && "C",
        isCurrentEpoch(node.stylePropsDirtyEpoch) && "P",
        isCurrentEpoch(node.childrenDirtyEpoch) && "Ch",
        layoutChanged && "L",
        childPositionChanged && "CP",
      ]
        .filter(Boolean)
        .join("")
      const entry = `${id}@${depth}[${flags}:${node.children.length}ch]`
      stats.cascadeNodes += (stats.cascadeNodes ? " " : "") + entry
    }
  }

  // Cell debug: log render decision for nodes covering target cell
  if (_cellDbg && (_coversCellNow || _coversCellPrev)) {
    const id = (props.id as string) ?? node.type
    const depth = _getNodeDepth(node)
    const prev = node.prevLayout
    const flags = [
      isCurrentEpoch(node.contentDirtyEpoch) && "C",
      isCurrentEpoch(node.stylePropsDirtyEpoch) && "P",
      layoutChanged && "L",
      isCurrentEpoch(node.subtreeDirtyEpoch) && "S",
      isCurrentEpoch(node.childrenDirtyEpoch) && "Ch",
      childPositionChanged && "CP",
      isCurrentEpoch(node.bgDirtyEpoch) && "B",
    ]
      .filter(Boolean)
      .join(",")
    const msg =
      `RENDER ${id}@${depth} rect=${layout.x},${screenY} ${layout.width}x${layout.height}` +
      ` prev=${prev ? `${prev.x},${prev.y - scrollOffset} ${prev.width}x${prev.height}` : "null"}` +
      ` flags=[${flags}] hasPrev=${hasPrevBuffer} ancClr=${ancestorCleared}` +
      ` caa=${contentAreaAffected} prc=${contentRegionCleared} prm=${childrenNeedFreshRender}` +
      ` coversNow=${_coversCellNow} coversPrev=${_coversCellPrev}` +
      ` bg=${props.backgroundColor ?? "none"}`
    _cellDbg.log.push(msg)
    cellLog.debug?.(msg)
  }
}

// ============================================================================
// Region Clearing (executeRegionClearing)
// ============================================================================

/**
 * Handle all region clearing before rendering own content.
 *
 * Three clearing paths:
 * 1. contentRegionCleared: clear the node's region with inherited bg (no own bg)
 * 2. Excess area: clear stale pixels when a node shrank (even without contentRegionCleared)
 * 3. Descendant overflow: clear areas where descendants previously overflowed this node's rect
 *
 * All clearing runs BEFORE renderBox/renderText so borders drawn later are not overwritten.
 */
function executeRegionClearing(
  node: AgNode,
  buffer: TerminalBuffer,
  layout: NonNullable<AgNode["boxRect"]>,
  scrollOffset: number,
  clipBounds: ClipBounds | undefined,
  bufferIsCloned: boolean,
  layoutChanged: boolean,
  contentRegionCleared: boolean,
  descendantOverflowChanged: boolean,
  instrumentEnabled: boolean,
  stats: RenderPhaseStats,
  threadedInheritedBg: NodeRenderState["inheritedBg"],
): void {
  if (contentRegionCleared) {
    if (instrumentEnabled) stats.clearOps++
    clearNodeRegion(node, buffer, layout, scrollOffset, clipBounds, layoutChanged, threadedInheritedBg)
  } else if (bufferIsCloned && layoutChanged && node.prevLayout) {
    // Even when contentRegionCleared is false, a shrinking node needs its excess
    // area cleared. Key scenario: absolute-positioned overlays (e.g., search dialog)
    // that shrink while normal-flow siblings are dirty -- forceRepaint sets
    // hasPrevBuffer=false + ancestorCleared=false, making contentRegionCleared=false,
    // but the cloned buffer still has stale pixels from the old larger layout.
    // Also applies to nodes WITH backgroundColor: renderBox fills only the NEW
    // (smaller) region, leaving stale pixels in the excess area.
    //
    // Gated on bufferIsCloned: on a fresh buffer (e.g., multi-pass resize where
    // dimensions changed between passes), there are no stale pixels to clear.
    // Without this guard, clearExcessArea writes inherited bg into cells that
    // doFreshRender leaves as default, causing STRICT mismatches.
    clearExcessArea(node, buffer, layout, scrollOffset, clipBounds, layoutChanged, threadedInheritedBg)
  }

  // Clear descendant overflow regions: areas where descendants' previous layouts
  // extended beyond THIS node's rect. clearNodeRegion covers the node's interior,
  // but overflow content is beyond it. This is separate from contentRegionCleared
  // because overflow is OUTSIDE the rect -- it needs clearing even for nodes with
  // backgroundColor (whose interior is handled by renderBox's bg fill).
  if (descendantOverflowChanged) {
    clearDescendantOverflowRegions(node, buffer, layout, scrollOffset, clipBounds, threadedInheritedBg)
  }
}

// ============================================================================
// Own Content Rendering
// ============================================================================

/**
 * Render this node's own content (box background/border or text).
 *
 * For boxes: computes inherited bg for border rendering and calls renderBox.
 * For text: computes inherited bg/fg for text rendering and calls renderText.
 *
 * @returns The boxInheritedBg color (needed by outline rendering after children).
 */
function renderOwnContent(
  node: AgNode,
  buffer: TerminalBuffer,
  layout: NonNullable<AgNode["boxRect"]>,
  props: BoxProps & TextProps,
  nodeState: NodeRenderState,
  skipBgFill: boolean,
  instrumentEnabled: boolean,
  stats: RenderPhaseStats,
  ctx?: PipelineContext,
  bgOnlyChange = false,
  useTextStyleFastPath = false,
): Color | undefined {
  // O(1) inherited bg/fg from nodeState — threaded top-down, no parent chain walks.
  const boxInheritedBg = node.type === "silvery-box" && !getEffectiveBg(props) ? nodeState.inheritedBg.color : undefined

  if (node.type === "silvery-box") {
    if (instrumentEnabled) stats.boxNodes++
    renderBox(node, buffer, layout, props, nodeState, skipBgFill, boxInheritedBg, bgOnlyChange)
  } else if (node.type === "silvery-text") {
    if (instrumentEnabled) stats.textNodes++
    // O(1) inherited bg/fg — threaded top-down through nodeState.
    // inheritedBg decouples text rendering from buffer state, which is critical
    // for incremental rendering: the cloned buffer may have stale bg at positions
    // outside the parent's bg-filled region (e.g., overflow text, moved nodes).
    // Foreground inheritance matches CSS semantics: Box color cascades to Text children.
    const textInheritedBg = nodeState.inheritedBg.color
    const textInheritedFg = nodeState.inheritedFg

    // Style-only fast path for text nodes: when only visual style props changed
    // (color, bold, dim, inverse, etc.) but text content is identical, skip the
    // expensive collectTextWithBg → formatTextLines → renderGraphemes pipeline.
    // Instead, restyle existing cells in-place with the new style.
    //
    // Conditions (pre-computed as useTextStyleFastPath):
    // 1. hasPrevBuffer: cloned buffer has correct chars from previous frame
    // 2. isStyleOnlyDirty: only style props changed (no content, bg, or children)
    // 3. No nested children with bg: restyleRegion would overwrite their bg
    // 4. Not ancestorCleared/ancestorLayoutChanged: cells are at correct positions
    //
    // This avoids O(text_length) text processing for the common case of
    // cursor/selection styling (just color/bold/inverse changes on text nodes).
    if (useTextStyleFastPath) {
      const style = getTextStyle(props)
      if (style.fg === null && textInheritedFg !== undefined) {
        style.fg = textInheritedFg
      }
      const effectiveBg = style.bg !== null ? style.bg : (textInheritedBg ?? null)
      const { x, width, height } = layout
      const y = layout.y - nodeState.scrollOffset
      buffer.restyleRegion(x, y, width, height, {
        fg: style.fg,
        bg: effectiveBg,
        underlineColor: style.underlineColor ?? null,
        attrs: style.attrs,
      })
    } else {
      renderText(node, buffer, layout, props, nodeState, textInheritedBg, textInheritedFg, ctx)
    }
  }

  return boxInheritedBg
}

// ============================================================================
// Scroll Tier Planner
// ============================================================================

/** Which tier strategy a scroll container uses for this frame. */
export type ScrollTier = "shift" | "clear" | "subtree-only"

/** Inputs for the scroll tier decision (all from renderScrollContainerChildren). */
export interface ScrollPlanInputs {
  /** Scroll offset changed since last frame. */
  scrollOffsetChanged: boolean
  /** Visible child index range changed. */
  visibleRangeChanged: boolean
  /** Scroll container has sticky children. */
  hasStickyChildren: boolean
  /** Parent cascade: children need fresh render (contentAreaAffected || bgRefillNeeded). */
  childrenNeedFreshRender: boolean
  /** Node has restructured children (added/removed/reordered). */
  childrenDirty: boolean
  /** Buffer from previous frame is available (incremental mode). */
  hasPrevBuffer: boolean
  /** An ancestor cleared its region. */
  ancestorCleared: boolean
  /** This node's content region was cleared (no own bg). */
  contentRegionCleared: boolean
  /** The bg to use for viewport clears (own bg or inherited). */
  scrollBg: Color | null
}

/** Result of the scroll tier decision. */
export interface ScrollPlan {
  /** Which tier strategy to use. */
  tier: ScrollTier
  /** Background color for viewport clear/shift fill (null = no bg). */
  clearBg: Color | null
  /** Default hasPrevBuffer for children. */
  childHasPrev: boolean
  /** Default ancestorCleared for children. */
  childAncestorCleared: boolean
  /** Whether all first-pass items must re-render (Tier 3 with sticky children). */
  stickyForceRefresh: boolean
  /** Human-readable reasons for the tier decision (for instrumentation). */
  reasons: string[]
}

/**
 * Determine the scroll tier strategy for this frame.
 *
 * Pure function -- no side effects, no node access beyond the inputs.
 *
 * Three-tier strategy:
 * 1. **shift**: Only scroll offset changed, no sticky children. Buffer contents
 *    shifted by scroll delta; only newly visible edges re-render.
 * 2. **clear**: Children restructured, visible range changed with scroll, or
 *    parent region changed. Entire viewport cleared and all children re-render.
 * 3. **subtree-only**: Only some descendants changed. Children use hasPrevBuffer=true
 *    and skip via fast-path if clean. With sticky children, forces all first-pass
 *    items to re-render (stickyForceRefresh).
 */
export function planScrollRender(inputs: ScrollPlanInputs): ScrollPlan {
  const {
    scrollOffsetChanged,
    visibleRangeChanged,
    hasStickyChildren,
    childrenNeedFreshRender,
    childrenDirty,
    hasPrevBuffer,
    ancestorCleared,
    contentRegionCleared,
    scrollBg,
  } = inputs

  // Tier 1: Buffer shift -- scroll offset changed but nothing else.
  // Unsafe with sticky children (sticky second pass overwrites shifted pixels).
  const scrollOnly =
    hasPrevBuffer &&
    scrollOffsetChanged &&
    !childrenDirty &&
    !childrenNeedFreshRender &&
    !hasStickyChildren &&
    !visibleRangeChanged

  // Tier 2: Full viewport clear -- children restructured, scroll+sticky, or parent changed.
  const needsViewportClear =
    hasPrevBuffer &&
    !scrollOnly &&
    (scrollOffsetChanged || childrenDirty || childrenNeedFreshRender || visibleRangeChanged)

  // Tier 3 with sticky: force all first-pass items to re-render.
  // The cloned buffer has stale content from previous frames' sticky positions.
  const stickyForceRefresh = hasStickyChildren && hasPrevBuffer && !needsViewportClear

  // Build reasons for instrumentation
  const reasons: string[] = []
  if (scrollOnly) reasons.push("SHIFT")
  if (needsViewportClear) {
    if (scrollOffsetChanged) reasons.push("scrollOffset")
    if (childrenDirty) reasons.push("childrenDirty")
    if (childrenNeedFreshRender) reasons.push("childrenNeedFreshRender")
    if (visibleRangeChanged) reasons.push("visibleRangeChanged")
  }
  if (stickyForceRefresh) reasons.push("stickyForceRefresh")

  const tier: ScrollTier = scrollOnly ? "shift" : needsViewportClear ? "clear" : "subtree-only"

  const childHasPrev = needsViewportClear ? false : hasPrevBuffer
  const childAncestorCleared = needsViewportClear ? true : ancestorCleared || contentRegionCleared

  return {
    tier,
    clearBg: scrollOnly || needsViewportClear ? scrollBg : null,
    childHasPrev,
    childAncestorCleared,
    stickyForceRefresh,
    reasons,
  }
}

/**
 * Render children of a scroll container with proper clipping and offset.
 */
function renderScrollContainerChildren(
  node: AgNode,
  buffer: TerminalBuffer,
  props: BoxProps,
  nodeState: NodeRenderState,
  contentRegionCleared = false,
  childrenNeedFreshRender = false,
  ctx?: PipelineContext,
): void {
  const {
    clipBounds,
    hasPrevBuffer,
    ancestorCleared,
    bufferIsCloned,
    ancestorLayoutChanged,
    inheritedBg,
    inheritedFg,
  } = nodeState
  // Resolve instrumentation from ctx or module globals
  const instrumentEnabled = ctx?.instrumentEnabled ?? _instrumentEnabled
  const stats = ctx?.stats ?? _renderPhaseStats
  const layout = node.boxRect
  const ss = node.scrollState
  if (!layout || !ss) return

  const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
  const padding = getPadding(props)
  // Scroll containers clip vertically (for scrolling) but NOT horizontally.
  // Scroll containers clip vertically (viewport) but not horizontally —
  // horizontal containment is handled by text wrapping, not clipping.
  const childClipBounds = computeChildClipBounds(
    layout,
    props,
    clipBounds,
    0,
    /* horizontal */ false,
    /* vertical */ true,
  )

  // Determine if scroll offset changed since last render.
  const scrollOffsetChanged = ss.offset !== ss.prevOffset
  const hasStickyChildren = !!(ss.stickyChildren && ss.stickyChildren.length > 0)
  const visibleRangeChanged =
    ss.firstVisibleChild !== ss.prevFirstVisibleChild || ss.lastVisibleChild !== ss.prevLastVisibleChild

  // Compute viewport geometry (shared by all tiers)
  const clearY = childClipBounds.top
  const clearHeight = childClipBounds.bottom - childClipBounds.top
  const contentX = layout.x + border.left + padding.left
  const contentWidth = layout.width - border.left - border.right - padding.left - padding.right

  // Compute scroll bg eagerly -- planScrollRender needs it and it's cheap
  const scrollBg =
    scrollOffsetChanged || isCurrentEpoch(node.childrenDirtyEpoch) || childrenNeedFreshRender || visibleRangeChanged
      ? getEffectiveBg(props)
        ? parseColor(getEffectiveBg(props)!)
        : inheritedBg.color
      : null

  // Plan the scroll tier strategy (pure decision, no side effects)
  const plan = planScrollRender({
    scrollOffsetChanged,
    visibleRangeChanged,
    hasStickyChildren,
    childrenNeedFreshRender,
    childrenDirty: isCurrentEpoch(node.childrenDirtyEpoch),
    hasPrevBuffer,
    ancestorCleared,
    contentRegionCleared,
    scrollBg,
  })
  const { tier, stickyForceRefresh } = plan
  const defaultChildHasPrev = plan.childHasPrev
  const defaultChildAncestorCleared = plan.childAncestorCleared

  if (instrumentEnabled) {
    stats.scrollContainerCount++
    if (tier !== "subtree-only" || stickyForceRefresh) {
      stats.scrollViewportCleared++
      const reasons = [...plan.reasons]
      if (scrollOffsetChanged) reasons.push(`scrollOffset(${ss.prevOffset}->${ss.offset})`)
      reasons.push(
        `vp=${ss.viewportHeight} content=${ss.contentHeight} vis=${ss.firstVisibleChild}-${ss.lastVisibleChild}`,
      )
      stats.scrollClearReason = reasons.join("+")
    }
  }

  // STRICT invariant: Tier 1 (buffer shift) must never be used with sticky children.
  if (process?.env?.SILVERY_STRICT && tier === "shift" && hasStickyChildren) {
    throw new Error(
      `[SILVERY_STRICT] Scroll Tier 1 (buffer shift) activated with sticky children ` +
        `(node: ${(props.id as string | undefined) ?? node.type}, ` +
        `stickyCount: ${ss.stickyChildren?.length ?? 0})`,
    )
  }

  // Apply the plan: buffer shift, viewport clear, or sticky force refresh
  const scrollDelta = ss.offset - (ss.prevOffset ?? ss.offset)
  if (tier === "shift" && clearHeight > 0) {
    // Clear scroll indicator rows before shifting to prevent stale indicator
    // pixels at edges (columns not covered by children).
    const showBorderless = props.overflowIndicator === true
    if (showBorderless && !border.top && !border.bottom) {
      const topIndicatorY = clearY
      const bottomIndicatorY = clearY + clearHeight - 1
      if (ss.prevOffset != null && ss.prevOffset > 0) {
        buffer.fill(contentX, topIndicatorY, contentWidth, 1, { char: " ", bg: plan.clearBg })
      }
      buffer.fill(contentX, bottomIndicatorY, contentWidth, 1, { char: " ", bg: plan.clearBg })
    }
    buffer.scrollRegion(contentX, clearY, contentWidth, clearHeight, scrollDelta, {
      char: " ",
      bg: plan.clearBg,
    })
  }

  if (tier === "clear" && clearHeight > 0) {
    buffer.fill(contentX, clearY, contentWidth, clearHeight, {
      char: " ",
      bg: plan.clearBg,
    })
  }

  // Tier 3 with sticky: clear viewport to null bg (matches fresh render state)
  // before re-rendering all items, so the sticky second pass works correctly.
  if (stickyForceRefresh && clearHeight > 0) {
    buffer.fill(contentX, clearY, contentWidth, clearHeight, { char: " ", bg: null })
  }

  // Propagate ancestor layout change to scroll container children.
  const childAncestorLayoutChanged = isCurrentEpoch(node.layoutChangedThisFrame) || !!ancestorLayoutChanged

  // For buffer shift: children that were fully visible in BOTH the previous
  // and current frames have correct pixels after the shift (childHasPrev=true).
  const prevVisTop = ss.prevOffset ?? ss.offset
  const prevVisBottom = prevVisTop + ss.viewportHeight

  // First pass: render non-sticky visible children with scroll offset
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    if (!child) continue
    const childProps = child.props as BoxProps

    // Skip sticky children - they're rendered in second pass
    if (childProps.position === "sticky") {
      continue
    }

    // Skip children that are completely outside the visible range
    if (i < ss.firstVisibleChild || i > ss.lastVisibleChild) {
      continue
    }

    // Determine per-child hasPrev for buffer shift mode
    let thisChildHasPrev = defaultChildHasPrev
    let thisChildAncestorCleared = defaultChildAncestorCleared
    if (tier === "shift") {
      // Check if child was fully visible in the previous frame
      const childRect = child.boxRect
      if (childRect) {
        const childTop = childRect.y - layout.y - border.top - padding.top
        const childBottom = childTop + childRect.height
        const wasFullyVisible = childTop >= prevVisTop && childBottom <= prevVisBottom
        thisChildHasPrev = wasFullyVisible
        // Shifted children: their pixels are intact (not cleared)
        // Newly visible: exposed region was filled by scrollRegion
        thisChildAncestorCleared = wasFullyVisible ? ancestorCleared || contentRegionCleared : true
      }
    }

    // Force fresh rendering when sticky children exist (see stickyForceRefresh).
    if (stickyForceRefresh && thisChildHasPrev) {
      thisChildHasPrev = false
      thisChildAncestorCleared = false
    }

    // Render visible children with scroll offset applied.
    renderNodeToBuffer(
      child,
      buffer,
      {
        scrollOffset: ss.offset,
        clipBounds: childClipBounds,
        hasPrevBuffer: thisChildHasPrev,
        ancestorCleared: thisChildAncestorCleared,
        bufferIsCloned,
        ancestorLayoutChanged: childAncestorLayoutChanged,
        inheritedBg,
        inheritedFg,
      },
      ctx,
    )
  }

  // Second pass: render sticky children at their computed positions
  // Rendered last so they appear on top of other content
  if (ss.stickyChildren) {
    for (const sticky of ss.stickyChildren) {
      const child = node.children[sticky.index]
      if (!child?.boxRect) continue

      // Calculate the scroll offset that would place the child at its sticky position
      // stickyOffset = naturalTop - renderOffset
      // This makes the child render at renderOffset instead of its natural position
      const stickyScrollOffset = sticky.naturalTop - sticky.renderOffset

      // Sticky children always re-render (hasPrevBuffer=false) since their
      // effective scroll offset may change even when the container's doesn't.
      //
      // ancestorCleared=false matches fresh render semantics: on a fresh render,
      // the buffer at sticky positions has first-pass content (not "cleared").
      // Using ancestorCleared=true would cause transparent spacer Boxes to clear
      // their region (via layoutChanged=true from prevLayout=null → cascading
      // contentRegionCleared), wiping overlapping sticky headers rendered earlier
      // in this pass.
      //
      // Stale bg from previous frames is handled by the stickyForceRefresh
      // pre-clear above, which ensures correct bg is in the buffer before sticky
      // children render on top of first-pass content.
      renderNodeToBuffer(
        child,
        buffer,
        {
          scrollOffset: stickyScrollOffset,
          clipBounds: childClipBounds,
          hasPrevBuffer: false,
          ancestorCleared: false,
          bufferIsCloned,
          ancestorLayoutChanged: childAncestorLayoutChanged,
          inheritedBg,
          inheritedFg,
        },
        ctx,
      )
    }
  }
}

/**
 * Render children of a normal (non-scroll) container.
 */
function renderNormalChildren(
  node: AgNode,
  buffer: TerminalBuffer,
  props: BoxProps,
  nodeState: NodeRenderState,
  childPositionChanged = false,
  contentRegionCleared = false,
  childrenNeedFreshRender = false,
  ctx?: PipelineContext,
): void {
  const {
    scrollOffset,
    clipBounds,
    hasPrevBuffer,
    ancestorCleared,
    bufferIsCloned,
    ancestorLayoutChanged,
    inheritedBg,
    inheritedFg,
  } = nodeState
  // Resolve instrumentation from ctx or module globals
  const instrumentEnabled = ctx?.instrumentEnabled ?? _instrumentEnabled
  const stats = ctx?.stats ?? _renderPhaseStats
  const layout = node.boxRect
  if (!layout) return

  // For overflow='hidden' containers, clip children to content area.
  // Supports per-axis clipping: overflowX/overflowY override the shorthand overflow prop.
  const clipX = (props.overflowX ?? props.overflow) === "hidden"
  const clipY = (props.overflowY ?? props.overflow) === "hidden"
  const effectiveClipBounds =
    clipX || clipY ? computeChildClipBounds(layout, props, clipBounds, scrollOffset, clipX, clipY) : clipBounds

  // Non-scroll sticky children support. When the layout phase computes
  // node.stickyChildren, we use the same two-pass pattern as scroll containers:
  // first pass renders non-sticky children, second pass renders sticky children
  // at their computed renderOffset positions.
  const hasStickyChildren = !!(node.stickyChildren && node.stickyChildren.length > 0)

  // When sticky children exist and hasPrevBuffer is true, force all first-pass
  // children to re-render. The cloned buffer may have stale pixels from previous
  // frames' sticky positions. This matches the stickyForceRefresh pattern from
  // scroll containers (Tier 3).
  const stickyForceRefresh = hasStickyChildren && hasPrevBuffer

  // Pre-clear the content area to bg=null when stickyForceRefresh is true.
  // Fresh renders start with a blank buffer (null bg everywhere). The cloned
  // buffer has stale content from old sticky positions that would leak through
  // on incremental renders. Clearing to null matches fresh render state before
  // any content renders.
  if (stickyForceRefresh) {
    const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, left: 0, right: 0 }
    const padding = getPadding(props)
    let clearX = layout.x + border.left + padding.left
    let clearY = layout.y - scrollOffset + border.top + padding.top
    let clearW = layout.width - border.left - border.right - padding.left - padding.right
    let clearH = layout.height - border.top - border.bottom - padding.top - padding.bottom
    // Clip to clipBounds (same discipline as scroll container clear)
    if (clipBounds) {
      const clipTop = clipBounds.top
      const clipBottom = clipBounds.bottom
      if (clearY < clipTop) {
        clearH -= clipTop - clearY
        clearY = clipTop
      }
      if (clearY + clearH > clipBottom) {
        clearH = clipBottom - clearY
      }
      if (clipBounds.left !== undefined && clearX < clipBounds.left) {
        clearW -= clipBounds.left - clearX
        clearX = clipBounds.left
      }
      if (clipBounds.right !== undefined && clearX + clearW > clipBounds.right) {
        clearW = clipBounds.right - clearX
      }
    }
    if (clearW > 0 && clearH > 0) {
      buffer.fill(clearX, clearY, clearW, clearH, { char: " ", bg: null })
    }
  }

  // Force children to re-render when parent's region was modified on a clone,
  // children were restructured, or sibling positions shifted.
  const childrenNeedRepaint = isCurrentEpoch(node.childrenDirtyEpoch) || childPositionChanged || childrenNeedFreshRender
  if (instrumentEnabled && childrenNeedRepaint && hasPrevBuffer) {
    stats.normalChildrenRepaint++
    const reasons: string[] = []
    if (isCurrentEpoch(node.childrenDirtyEpoch)) reasons.push("childrenDirty")
    if (childPositionChanged) reasons.push("childPositionChanged")
    if (childrenNeedFreshRender) reasons.push("childrenNeedFreshRender")
    stats.normalRepaintReason = reasons.join("+")
  }
  let childHasPrev = childrenNeedRepaint ? false : hasPrevBuffer
  // childAncestorCleared: tells descendants that STALE pixels exist in the buffer.
  // Only contentRegionCleared (no bg fill → stale pixels remain) propagates this.
  // childrenNeedFreshRender WITHOUT contentRegionCleared means the parent filled its bg,
  // so children's positions have correct bg — NOT stale. Setting ancestorCleared
  // there would cause children to re-fill, overwriting border cells at boundaries.
  // When this node has backgroundColor, its renderBox fill covers any stale
  // pixels from ancestor clears — so children don't need ancestorCleared.
  let childAncestorCleared = contentRegionCleared || (ancestorCleared && !getEffectiveBg(props))

  // Propagate ancestor layout change to children: if this node or any ancestor
  // had layoutChangedThisFrame, children must not be skipped even if their own
  // flags are clean — their pixels in the cloned buffer are at wrong positions.
  const childAncestorLayoutChanged = isCurrentEpoch(node.layoutChangedThisFrame) || !!ancestorLayoutChanged

  // Override child flags when sticky force refresh is active — all first-pass
  // children must re-render fresh (matching the scroll container pattern).
  if (stickyForceRefresh) {
    childHasPrev = false
    childAncestorCleared = false
  }

  // Multi-pass rendering to match CSS paint order:
  // 1. Normal-flow children (skip sticky and absolute)
  // 2. Sticky children at computed positions (on top of normal-flow)
  // 3. Absolute children on top of everything
  //
  // This ensures absolute children's pixels (bg fills, text) are never
  // overwritten by normal-flow siblings' clearNodeRegion/render.
  //
  // Pre-scan: detect if any non-absolute, non-sticky sibling is dirty. When
  // true, absolute children in the third pass must force-repaint because the
  // first pass may have overwritten their pixels in the cloned buffer.
  let hasAbsoluteChildren = false

  // First pass: render normal-flow children (skip sticky + absolute), track dirty state
  for (const child of node.children) {
    const childProps = child.props as BoxProps
    if (childProps.position === "absolute") {
      hasAbsoluteChildren = true
      continue // Skip — rendered in third pass
    }
    if (hasStickyChildren && childProps.position === "sticky") {
      continue // Skip — rendered in second pass
    }

    renderNodeToBuffer(
      child,
      buffer,
      {
        scrollOffset,
        clipBounds: effectiveClipBounds,
        hasPrevBuffer: childHasPrev,
        ancestorCleared: childAncestorCleared,
        bufferIsCloned,
        ancestorLayoutChanged: childAncestorLayoutChanged,
        inheritedBg,
        inheritedFg,
      },
      ctx,
    )
  }

  // Second pass: render sticky children at their computed positions.
  // Rendered after normal-flow so they appear on top of other content.
  if (node.stickyChildren) {
    for (const sticky of node.stickyChildren) {
      const child = node.children[sticky.index]
      if (!child?.boxRect) continue

      // Calculate the scroll offset that would place the child at its sticky position.
      // stickyScrollOffset = naturalTop - renderOffset
      // This makes the child render at renderOffset instead of its natural position.
      const stickyScrollOffset = sticky.naturalTop - sticky.renderOffset

      // Sticky children always re-render (hasPrevBuffer=false) since their
      // effective position may change between frames.
      //
      // ancestorCleared=false matches fresh render semantics: on a fresh render,
      // the buffer at sticky positions has first-pass content (not "cleared").
      // Using ancestorCleared=true would cause transparent spacer Boxes to clear
      // their region, wiping overlapping sticky headers rendered earlier in this pass.
      //
      // ancestorLayoutChanged propagated so descendants know to re-render.
      renderNodeToBuffer(
        child,
        buffer,
        {
          scrollOffset: stickyScrollOffset,
          clipBounds: effectiveClipBounds,
          hasPrevBuffer: false,
          ancestorCleared: false,
          bufferIsCloned,
          ancestorLayoutChanged: childAncestorLayoutChanged,
          inheritedBg,
          inheritedFg,
        },
        ctx,
      )
    }
  }

  // Third pass: render absolute children on top (CSS paint order)
  if (hasAbsoluteChildren) {
    for (const child of node.children) {
      const childProps = child.props as BoxProps
      if (childProps.position !== "absolute") continue

      // Both hasPrevBuffer and ancestorCleared must be false for absolute children
      // in the second pass. The buffer at the absolute child's position contains
      // first-pass content (normal-flow siblings), not "previous frame" content.
      // This is conceptually a fresh render at the absolute child's position:
      //
      // - hasPrevBuffer=false: prevents contentRegionCleared from firing.
      //   Without this, a transparent overlay (no backgroundColor) that changes
      //   (contentAreaAffected=true) would clear its entire region, wiping the
      //   normal-flow content painted in the first pass. On a fresh render,
      //   hasPrevBuffer=false prevents clearing, so this matches.
      //
      // - ancestorCleared=false: prevents transparent descendants from clearing
      //   their regions, which would also wipe first-pass content.
      renderNodeToBuffer(
        child,
        buffer,
        {
          scrollOffset,
          clipBounds: effectiveClipBounds,
          hasPrevBuffer: false,
          ancestorCleared: false,
          bufferIsCloned,
          ancestorLayoutChanged: childAncestorLayoutChanged,
          inheritedBg,
          inheritedFg,
        },
        ctx,
      )
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Clear dirty flags on the current node only (no recursion).
 * Used after rendering a node to reset its flags.
 *
 * With epoch-stamped flags, this is only needed when a subtree is SKIPPED
 * by the fast path (clearDirtyFlags on skipped subtrees) or for the
 * render-phase-adapter. The normal render path relies on advanceRenderEpoch()
 * to expire all flags at once — O(1) instead of O(N).
 */
function clearNodeDirtyFlags(node: AgNode): void {
  node.contentDirtyEpoch = INITIAL_EPOCH
  node.stylePropsDirtyEpoch = INITIAL_EPOCH
  node.bgDirtyEpoch = INITIAL_EPOCH
  node.subtreeDirtyEpoch = INITIAL_EPOCH
  node.childrenDirtyEpoch = INITIAL_EPOCH
  node.layoutChangedThisFrame = INITIAL_EPOCH
}

/**
 * Clear dirty flags on a subtree that was skipped during incremental rendering.
 */
function clearDirtyFlags(node: AgNode): void {
  clearNodeDirtyFlags(node)
  for (const child of node.children) {
    if (child.layoutNode) {
      clearDirtyFlags(child)
    } else {
      // Virtual text children also need flags cleared — they're rendered by
      // their parent's collectTextContent(), not by renderNodeToBuffer().
      clearVirtualTextFlags(child)
    }
  }
}

/**
 * Clear dirty flags on a virtual text node and its descendants.
 * Virtual text nodes (no layoutNode) are rendered by their parent layout
 * ancestor via collectTextContent(). Their dirty flags must be cleared
 * after the parent renders, otherwise stale subtreeDirty blocks
 * markSubtreeDirty() propagation on future updates.
 */
function clearVirtualTextFlags(node: AgNode): void {
  clearNodeDirtyFlags(node)
  for (const child of node.children) {
    clearVirtualTextFlags(child)
  }
}

/**
 * Check if any child's position changed since last render (sibling shift).
 * Checked even when subtreeDirty=true because subtreeDirty only means
 * descendants are dirty, not that this container's gap regions need clearing.
 */
function hasChildPositionChanged(node: AgNode): boolean {
  for (const child of node.children) {
    if (child.boxRect && child.prevLayout) {
      if (child.boxRect.x !== child.prevLayout.x || child.boxRect.y !== child.prevLayout.y) {
        return true
      }
    }
  }
  return false
}

/**
 * Check if any descendant was overflowing THIS node's rect and had its layout change.
 * Recursive: a grandchild overflowing a child AND this node is detected here.
 *
 * When a descendant overflows (prevLayout extends beyond this node's rect) and then
 * shrinks, clearExcessArea on the descendant clips to its immediate parent's content
 * area, leaving stale pixels in this node's border/padding area and beyond this node's
 * rect. By detecting at THIS level, the node clears its region (restoring borders)
 * and handles overflow beyond its rect via clearDescendantOverflowRegions.
 *
 * Only follows subtreeDirty paths for efficiency — layoutChangedThisFrame on a
 * descendant implies subtreeDirty on all its ancestors.
 */
function hasDescendantOverflowChanged(node: AgNode): boolean {
  const rect = node.boxRect!
  return _checkDescendantOverflow(node.children, rect.x, rect.y, rect.x + rect.width, rect.y + rect.height)
}

function _checkDescendantOverflow(
  children: readonly AgNode[],
  nodeLeft: number,
  nodeTop: number,
  nodeRight: number,
  nodeBottom: number,
): boolean {
  for (const child of children) {
    // Check this child's previous layout against the ancestor's rect
    if (child.prevLayout && isCurrentEpoch(child.layoutChangedThisFrame)) {
      const prev = child.prevLayout
      if (
        prev.x + prev.width > nodeRight ||
        prev.y + prev.height > nodeBottom ||
        prev.x < nodeLeft ||
        prev.y < nodeTop
      ) {
        return true
      }
    }
    // Recurse into subtree-dirty children to find deeper overflows
    if (isCurrentEpoch(child.subtreeDirtyEpoch) && child.children !== undefined) {
      if (_checkDescendantOverflow(child.children, nodeLeft, nodeTop, nodeRight, nodeBottom)) {
        return true
      }
    }
  }
  return false
}

/**
 * Check if any descendant has an explicit backgroundColor.
 *
 * Used by the bgOnlyChange fast path: fillBg() updates ALL cells in the region
 * with the parent's bg. If a descendant has its own bg, those cells would be
 * incorrectly overwritten (the descendant is clean and won't re-render to fix it).
 *
 * Only checks Box nodes with explicit backgroundColor or effective bg from theme.
 * Text nodes with backgroundColor are also checked since they render their own bg.
 * Stops at first match (early exit).
 *
 * Performance: walks the child tree, but only runs when bgOnlyChange is true
 * (bg changed, no other flags). This is the cursor-move hot path where trees
 * are typically small (card contents: ~5-20 nodes).
 */
function hasDescendantWithBg(node: AgNode): boolean {
  for (const child of node.children) {
    if (getEffectiveBg(child.props as BoxProps)) return true
    if (child.children.length > 0 && hasDescendantWithBg(child)) return true
  }
  return false
}

/**
 * Check if a text node has any virtual text children with explicit backgroundColor.
 *
 * Used by the text style-only fast path: restyleRegion() applies a uniform
 * style to all cells. If nested children have their own bg, the uniform restyle
 * would overwrite it (those children rendered their own bg during the original
 * renderText, and won't re-render to restore it).
 */
function hasChildWithBg(node: AgNode): boolean {
  for (const child of node.children) {
    if ((child.props as BoxProps).backgroundColor) return true
    if (child.children.length > 0 && hasChildWithBg(child)) return true
  }
  return false
}

/**
 * Compute clip bounds for a container's children by insetting for border+padding,
 * then intersecting with parent clip bounds.
 */
function computeChildClipBounds(
  layout: NonNullable<AgNode["boxRect"]>,
  props: BoxProps,
  parentClip: ClipBounds | undefined,
  scrollOffset = 0,
  /** Compute left/right clip bounds for horizontal overflow clipping. */
  horizontal = true,
  /** Compute top/bottom clip bounds for vertical overflow clipping.
   *  Defaults to true — scroll containers pass vertical=true, horizontal=false
   *  (horizontal containment is via layout OVERFLOW_HIDDEN, not render clipping). */
  vertical = true,
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
    // Pass through parent's horizontal clip bounds without adding own
    result.left = parentClip.left
    result.right = parentClip.right
  }
  return result
}

// ============================================================================
// Region Clearing
// ============================================================================

/**
 * Clear overflow regions: areas where children's prevLayouts extended beyond
 * this node's rect. Called when childOverflowChanged detected stale overflow.
 *
 * clearNodeRegion handles the node's own rect. This function handles the
 * overflow area — pixels that a child rendered OUTSIDE the parent's rect
 * in a previous frame (via overflow:visible behavior). When the child shrinks,
 * those pixels become stale in the cloned buffer.
 *
 * Clears each child's overflow extent, clipped to buffer bounds.
 */
/**
 * Clear areas where descendants' previous layouts overflowed beyond THIS node's rect.
 * Only clears OUTSIDE the node's rect — interior clearing is handled by clearNodeRegion
 * and renderBox. Recursive: follows subtreeDirty paths to find all overflowing descendants.
 */
function clearDescendantOverflowRegions(
  node: AgNode,
  buffer: TerminalBuffer,
  layout: NonNullable<AgNode["boxRect"]>,
  scrollOffset: number,
  clipBounds: ClipBounds | undefined,
  threadedInheritedBg: NodeRenderState["inheritedBg"],
): void {
  const clearBg = threadedInheritedBg.color
  const nodeRight = layout.x + layout.width
  const nodeBottom = layout.y - scrollOffset + layout.height
  const nodeLeft = layout.x
  const nodeTop = layout.y - scrollOffset

  _clearDescendantOverflow(
    node.children,
    buffer,
    nodeLeft,
    nodeTop,
    nodeRight,
    nodeBottom,
    scrollOffset,
    clipBounds,
    clearBg,
  )
}

function _clearDescendantOverflow(
  children: readonly AgNode[],
  buffer: TerminalBuffer,
  nodeLeft: number,
  nodeTop: number,
  nodeRight: number,
  nodeBottom: number,
  scrollOffset: number,
  clipBounds: ClipBounds | undefined,
  clearBg: Color,
): void {
  for (const child of children) {
    if (child.prevLayout && isCurrentEpoch(child.layoutChangedThisFrame)) {
      const prev = child.prevLayout
      const prevRight = prev.x + prev.width
      const prevBottom = prev.y - scrollOffset + prev.height
      const prevTop = prev.y - scrollOffset

      // Clear overflow to the right of the ancestor
      if (prevRight > nodeRight) {
        const overflowX = nodeRight
        const overflowWidth = Math.min(prevRight, buffer.width) - overflowX
        const overflowTop = Math.max(prevTop, clipBounds?.top ?? 0)
        const overflowBottom = Math.min(prevBottom, clipBounds?.bottom ?? buffer.height)
        if (overflowWidth > 0 && overflowBottom > overflowTop) {
          buffer.fill(overflowX, overflowTop, overflowWidth, overflowBottom - overflowTop, {
            char: " ",
            bg: clearBg,
          })
        }
      }
      // Clear overflow below the ancestor
      if (prevBottom > nodeBottom) {
        const overflowTop = Math.max(nodeBottom, clipBounds?.top ?? 0)
        const overflowBottom = Math.min(prevBottom, clipBounds?.bottom ?? buffer.height)
        const overflowX = Math.max(prev.x, clipBounds?.left ?? 0)
        const overflowWidth = Math.min(prevRight, clipBounds?.right ?? buffer.width) - overflowX
        if (overflowWidth > 0 && overflowBottom > overflowTop) {
          buffer.fill(overflowX, overflowTop, overflowWidth, overflowBottom - overflowTop, {
            char: " ",
            bg: clearBg,
          })
        }
      }
      // Clear overflow to the left of the ancestor
      if (prev.x < nodeLeft) {
        const overflowX = Math.max(prev.x, 0)
        const overflowWidth = Math.min(nodeLeft, buffer.width) - overflowX
        const overflowTop = Math.max(prevTop, clipBounds?.top ?? 0)
        const overflowBottom = Math.min(prevBottom, clipBounds?.bottom ?? buffer.height)
        if (overflowWidth > 0 && overflowBottom > overflowTop) {
          buffer.fill(overflowX, overflowTop, overflowWidth, overflowBottom - overflowTop, {
            char: " ",
            bg: clearBg,
          })
        }
      }
      // Clear overflow above the ancestor
      if (prevTop < nodeTop) {
        const overflowTop = Math.max(prevTop, clipBounds?.top ?? 0)
        const overflowBottom = Math.min(nodeTop, clipBounds?.bottom ?? buffer.height)
        const overflowX = Math.max(prev.x, clipBounds?.left ?? 0)
        const overflowWidth = Math.min(prevRight, clipBounds?.right ?? buffer.width) - overflowX
        if (overflowWidth > 0 && overflowBottom > overflowTop) {
          buffer.fill(overflowX, overflowTop, overflowWidth, overflowBottom - overflowTop, {
            char: " ",
            bg: clearBg,
          })
        }
      }
    }
    // Recurse into subtree-dirty children to find deeper overflows
    if (isCurrentEpoch(child.subtreeDirtyEpoch) && child.children !== undefined) {
      _clearDescendantOverflow(
        child.children,
        buffer,
        nodeLeft,
        nodeTop,
        nodeRight,
        nodeBottom,
        scrollOffset,
        clipBounds,
        clearBg,
      )
    }
  }
}

/**
 * Clear a node's region with inherited bg when it has no backgroundColor.
 * Also clears excess area when the node shrank (previous layout was larger).
 *
 * Clipping: clips to parent's boxRect (prevents overflow) and to the
 * colored ancestor's bounds (prevents bg color bleeding into siblings).
 */
function clearNodeRegion(
  node: AgNode,
  buffer: TerminalBuffer,
  layout: NonNullable<AgNode["boxRect"]>,
  scrollOffset: number,
  clipBounds: ClipBounds | undefined,
  layoutChanged: boolean,
  threadedInheritedBg: NodeRenderState["inheritedBg"],
): void {
  const inherited = threadedInheritedBg
  const clearBg = inherited.color
  const screenY = layout.y - scrollOffset

  // Clip to parent's boxRect to prevent oversized children from clearing
  // beyond their parent's bounds and bleeding inherited bg into sibling regions.
  const parentRect = node.parent?.boxRect
  const parentBottom = parentRect ? parentRect.y - scrollOffset + parentRect.height : undefined

  const clearY = clipBounds ? Math.max(screenY, clipBounds.top) : screenY
  let clearBottom = clipBounds ? Math.min(screenY + layout.height, clipBounds.bottom) : screenY + layout.height
  if (parentBottom !== undefined) {
    clearBottom = Math.min(clearBottom, parentBottom)
  }

  // Clip horizontally to clipBounds (overflow:hidden containers) and to the
  // colored ancestor's bounds (prevents inherited bg bleeding into siblings).
  let clearX = layout.x
  let clearWidth = layout.width
  if (clipBounds?.left !== undefined && clipBounds.right !== undefined) {
    if (clearX < clipBounds.left) {
      clearWidth -= clipBounds.left - clearX
      clearX = clipBounds.left
    }
    if (clearX + clearWidth > clipBounds.right) {
      clearWidth = Math.max(0, clipBounds.right - clearX)
    }
  }
  if (inherited.ancestorRect) {
    const ancestorRight = inherited.ancestorRect.x + inherited.ancestorRect.width
    const ancestorLeft = inherited.ancestorRect.x
    if (clearX < ancestorLeft) {
      clearWidth -= ancestorLeft - clearX
      clearX = ancestorLeft
    }
    if (clearX + clearWidth > ancestorRight) {
      clearWidth = Math.max(0, ancestorRight - clearX)
    }
  }

  const clearHeight = clearBottom - clearY
  if (clearHeight > 0 && clearWidth > 0) {
    // Cell debug: log clearNodeRegion coverage
    const _cellDbg2 = (globalThis as any).__silvery_cell_debug as { x: number; y: number; log: string[] } | undefined
    if (_cellDbg2) {
      const covers =
        clearX <= _cellDbg2.x &&
        clearX + clearWidth > _cellDbg2.x &&
        clearY <= _cellDbg2.y &&
        clearY + clearHeight > _cellDbg2.y
      if (covers) {
        const id = ((node.props as Record<string, unknown>).id as string) ?? node.type
        const msg = `CLEAR_REGION ${id} fill=${clearX},${clearY} ${clearWidth}x${clearHeight} bg=${String(clearBg)} COVERS TARGET`
        _cellDbg2.log.push(msg)
        cellLog.debug?.(msg)
      }
    }
    buffer.fill(clearX, clearY, clearWidth, clearHeight, {
      char: " ",
      bg: clearBg,
    })
  }

  // Delegate excess area clearing to shared helper
  clearExcessArea(node, buffer, layout, scrollOffset, clipBounds, layoutChanged, inherited)
}

/**
 * Clear the excess area when a node shrinks (old bounds were larger than new).
 *
 * This is separated from clearNodeRegion because excess area clearing must happen
 * even when contentRegionCleared is false. Key scenario: absolute-positioned overlays
 * (e.g., search dialog) that shrink while normal-flow siblings are dirty. The
 * forceRepaint path sets hasPrevBuffer=false + ancestorCleared=false, making
 * contentRegionCleared=false — but the cloned buffer still has stale pixels from
 * the old larger layout that must be cleared.
 *
 * Clips to the COLORED ANCESTOR's content area (not immediate parent's full rect)
 * to prevent inherited color from bleeding into sibling areas with different bg.
 *
 * IMPORTANT: Uses content area (inside border/padding), not full boxRect.
 * Without this, excess clearing of a child that previously filled the parent's
 * content area will extend into the parent's border row, overwriting border chars.
 */
function clearExcessArea(
  node: AgNode,
  buffer: TerminalBuffer,
  layout: NonNullable<AgNode["boxRect"]>,
  scrollOffset: number,
  clipBounds: ClipBounds | undefined,
  layoutChanged: boolean,
  inherited: NodeRenderState["inheritedBg"],
): void {
  if (!layoutChanged || !node.prevLayout) return
  const prev = node.prevLayout

  // Cell debug: log clearExcessArea decisions
  const _cellDbg3 = (globalThis as any).__silvery_cell_debug as { x: number; y: number; log: string[] } | undefined
  const _prevCoversCell3 =
    _cellDbg3 &&
    prev.x <= _cellDbg3.x &&
    prev.x + prev.width > _cellDbg3.x &&
    prev.y - scrollOffset <= _cellDbg3.y &&
    prev.y - scrollOffset + prev.height > _cellDbg3.y

  // Only clear if the node actually shrank in at least one dimension
  if (prev.width <= layout.width && prev.height <= layout.height) {
    if (_cellDbg3 && _prevCoversCell3) {
      const id = ((node.props as Record<string, unknown>).id as string) ?? node.type
      const msg =
        `EXCESS_SKIP_NO_SHRINK ${id} prev=${prev.x},${prev.y - scrollOffset} ${prev.width}x${prev.height}` +
        ` now=${layout.x},${layout.y - scrollOffset} ${layout.width}x${layout.height}`
      _cellDbg3.log.push(msg)
      cellLog.debug?.(msg)
    }
    return
  }

  // Skip excess clearing when the node MOVED (changed x or y position).
  // The right/bottom excess formulas use new-x + old-y coordinates, which
  // creates a phantom rectangle at wrong positions when the node moved.
  // Example: text at old=(30,7,23,1) → new=(22,8,14,2) computes excess at
  // (36,7) which overwrites a sibling's border character.
  //
  // When the node moved, the parent handles old-pixel cleanup:
  // - Parent's clearNodeRegion covers old pixels within parent's current rect
  // - Parent's clearExcessArea covers old pixels outside parent's rect
  if (prev.x !== layout.x || prev.y !== layout.y) {
    if (_cellDbg3 && _prevCoversCell3) {
      const id = ((node.props as Record<string, unknown>).id as string) ?? node.type
      const msg =
        `EXCESS_SKIP_MOVED ${id} prev=${prev.x},${prev.y - scrollOffset} ${prev.width}x${prev.height}` +
        ` now=${layout.x},${layout.y - scrollOffset} ${layout.width}x${layout.height}` +
        ` (dx=${layout.x - prev.x} dy=${layout.y - prev.y})`
      _cellDbg3.log.push(msg)
      cellLog.debug?.(msg)
    }
    return
  }

  const clearBg = inherited.color
  const screenY = layout.y - scrollOffset
  const prevScreenY = prev.y - scrollOffset

  // Clip to prevent excess clearing from bleeding outside valid bounds.
  // Start with the colored ancestor's rect (prevents bg color bleed),
  // then further restrict to the immediate parent's content area (prevents
  // overwriting parent's border characters).
  const clipRect = inherited.ancestorRect ?? node.parent?.boxRect
  if (!clipRect) return

  const clipRectScreenY = clipRect.y - scrollOffset
  let clipRectBottom = clipRectScreenY + clipRect.height
  let clipRectRight = clipRect.x + clipRect.width

  // Always inset by the immediate parent's border/padding.
  // Without this, a child's excess clearing extends into the parent's
  // border row, overwriting border characters with spaces.
  // (The old code skipped inset when clip rect came from a colored ancestor,
  // assuming "its bg fill covers its border area" — but bg fill only covers
  // the inside, while renderBorder draws characters on the border row.)
  const parent = node.parent
  if (parent?.boxRect) {
    const parentProps = parent.props as BoxProps
    const border = getBorderSize(parentProps)
    const padding = getPadding(parentProps)
    const parentRight = parent.boxRect.x + parent.boxRect.width - border.right - padding.right
    const parentBottom = parent.boxRect.y - scrollOffset + parent.boxRect.height - border.bottom - padding.bottom
    clipRectRight = Math.min(clipRectRight, parentRight)
    clipRectBottom = Math.min(clipRectBottom, parentBottom)
  }

  // Clear right margin (old was wider than new)
  if (prev.width > layout.width) {
    const excessX = layout.x + layout.width
    let excessWidth = prev.width - layout.width
    // Clip horizontally to parent's content area (inside border/padding).
    // Without this, excess clearing of a child that previously filled a wider
    // layout extends into the parent's right border, overwriting border chars.
    if (excessX + excessWidth > clipRectRight) {
      excessWidth = Math.max(0, clipRectRight - excessX)
    }
    if (excessWidth > 0) {
      clippedFill(
        buffer,
        excessX,
        excessWidth,
        prevScreenY,
        prevScreenY + prev.height,
        clipBounds,
        clipRectBottom,
        clearBg,
      )
    }
  }

  // Clear bottom margin (old was taller than new)
  if (prev.height > layout.height) {
    let bottomWidth = prev.width
    // Clip horizontally to parent's content area
    if (layout.x + bottomWidth > clipRectRight) {
      bottomWidth = Math.max(0, clipRectRight - layout.x)
    }
    clippedFill(
      buffer,
      layout.x,
      bottomWidth,
      screenY + layout.height,
      prevScreenY + prev.height,
      clipBounds,
      clipRectBottom,
      clearBg,
    )
  }
}

/** Fill a rectangular region, clipping to clipBounds and an outer bottom limit. */
function clippedFill(
  buffer: TerminalBuffer,
  x: number,
  width: number,
  top: number,
  bottom: number,
  clipBounds: ClipBounds | undefined,
  outerBottom: number,
  bg: Color,
): void {
  const clippedTop = clipBounds ? Math.max(top, clipBounds.top) : top
  const clippedBottom = Math.min(clipBounds ? Math.min(bottom, clipBounds.bottom) : bottom, outerBottom)
  let clippedX = x
  let clippedWidth = width
  if (clipBounds?.left !== undefined && clipBounds.right !== undefined) {
    if (clippedX < clipBounds.left) {
      clippedWidth -= clipBounds.left - clippedX
      clippedX = clipBounds.left
    }
    if (clippedX + clippedWidth > clipBounds.right) {
      clippedWidth = Math.max(0, clipBounds.right - clippedX)
    }
  }
  const height = clippedBottom - clippedTop
  if (height > 0 && clippedWidth > 0) {
    buffer.fill(clippedX, clippedTop, clippedWidth, height, { char: " ", bg })
  }
}
