/**
 * Node Creation and Layout Application
 *
 * Functions for creating SilveryNodes and applying layout properties.
 */

import { createLogger } from "loggily"
import type { LayoutNode } from "@silvery/ag/layout-types"
import { getConstants, getLayoutEngine } from "@silvery/ag-term/layout-engine"
import { collectPlainTextSkipHidden as collectNodeTextContent } from "@silvery/ag-term/pipeline/collect-text"
import { type BoxProps, type AgNode, type AgNodeType, type TextProps, rectEqual } from "@silvery/ag/types"
import { type Measurer, displayWidth, wrapText, getActiveLineHeight } from "@silvery/ag-term/unicode"
import {
  getRenderEpoch,
  INITIAL_EPOCH,
  isDirty,
  CONTENT_BIT,
  STYLE_PROPS_BIT,
  BG_BIT,
  CHILDREN_BIT,
  SUBTREE_BIT,
  ABS_CHILD_BIT,
  DESC_OVERFLOW_BIT,
  ALL_RECONCILER_BITS,
} from "@silvery/ag/epoch"

const measureLog = createLogger("silvery:measure")

// Import from shared module (lives in @silvery/ag-term to keep barrel React-free)
// Re-exported for consumers that imported from here previously
import { measureStats } from "@silvery/ag-term/pipeline/measure-stats"
export { measureStats }

import { syncRectSignals } from "@silvery/ag/layout-signals"

// ============================================================================
// Node Creation
// ============================================================================

/**
 * Create a new SilveryNode with a fresh layout node.
 */
export function createNode(
  type: AgNodeType,
  props: BoxProps | TextProps | Record<string, unknown>,
  measurer?: Measurer,
): AgNode {
  const layoutNode = getLayoutEngine().createNode()
  const epoch = getRenderEpoch()

  const node: AgNode = {
    type,
    props,
    children: [],
    parent: null,
    layoutNode,
    boxRect: null,
    scrollRect: null,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: epoch,
    dirtyBits: ALL_RECONCILER_BITS,
    dirtyEpoch: epoch,
  }

  // Apply initial flexbox props to layout node
  if (type === "silvery-box") {
    applyBoxProps(layoutNode, props as BoxProps)
  }

  // Set up measure function for text nodes
  // This tells the layout engine how to calculate the text's intrinsic size
  if (type === "silvery-text") {
    // Cache for measure results - avoid recalculating if text and constraints unchanged
    // Cache multiple (width, widthMode) -> result entries since layout calls measure with different widths
    let cachedText: string | null = null
    const measureCache = new Map<string, { width: number; height: number }>()

    layoutNode.setMeasureFunc((width, widthMode, height, heightMode) => {
      measureStats.calls++
      // Log measure calls through loggily (zero-cost when disabled via optional chaining)
      measureLog.debug?.(
        `measure "${collectNodeTextContent(node).slice(0, 40)}" width=${width} widthMode=${widthMode} height=${height} heightMode=${heightMode}`,
      )

      // Fast path: check if we have a cached result for this exact constraint
      // This avoids text collection entirely if we've measured this before
      const cacheKey = `${width}|${widthMode}|${height}|${heightMode}`
      const cached = measureCache.get(cacheKey)
      if (cached && cachedText !== null && !isDirty(node.dirtyBits, node.dirtyEpoch, CONTENT_BIT)) {
        measureStats.cacheHits++
        return cached
      }

      // Collect text content from this node and its raw text children
      // Use cached text if node hasn't been marked dirty (contentDirty)
      let text: string
      if (cachedText !== null && !isDirty(node.dirtyBits, node.dirtyEpoch, CONTENT_BIT)) {
        text = cachedText
      } else {
        measureStats.textCollects++
        const newText = collectNodeTextContent(node)
        // Only clear measurement cache if text actually changed
        if (newText !== cachedText) {
          measureCache.clear()
        }
        text = newText
        cachedText = text
        // Clear CONTENT_BIT so subsequent measure calls in same layout pass use cache.
        // NOTE: This means the render phase won't see contentDirty=true for text nodes
        // whose content changed. The render phase uses stylePropsDirty (which survives the
        // measure phase) combined with the node type check to correctly identify text
        // nodes that need region clearing. See contentAreaAffected in render-phase.ts.
        node.dirtyBits &= ~CONTENT_BIT
      }
      if (!text) {
        return { width: 0, height: 0 }
      }

      // Check cache again (may have been preserved if text unchanged)
      const cachedAfterCollect = measureCache.get(cacheKey)
      if (cachedAfterCollect) {
        measureStats.cacheHits++
        return cachedAfterCollect
      }

      // Calculate text dimensions
      const lines = text.split("\n")
      // Treat NaN width the same as unconstrained (can happen with auto-sized parents)
      const maxWidth = widthMode === "undefined" || Number.isNaN(width) ? Number.POSITIVE_INFINITY : width

      // Check if text will be truncated (not wrapped) — affects height calculation
      const { wrap } = node.props as TextProps
      const isTruncate =
        wrap === "truncate" ||
        wrap === "truncate-start" ||
        wrap === "truncate-middle" ||
        wrap === "truncate-end" ||
        wrap === "clip" ||
        wrap === false
      // Hard wrap: character-level wrapping, not word-aware. Each line that
      // exceeds maxWidth is sliced into chunks of exactly maxWidth. Intrinsic
      // width is maxWidth (since hard-wrapped lines fill the available width).
      const isHardWrap = wrap === "hard"

      // Calculate actual dimensions based on wrapping
      // Use wrapText() for accurate line count — must match the render phase
      // (render-text.ts formatTextLines) which also uses wrapText()
      let totalHeight = 0
      let actualWidth = 0

      // Use explicit measurer when available, fall back to module-level convenience functions
      const dw = measurer ? measurer.displayWidth.bind(measurer) : displayWidth
      const wt = measurer ? measurer.wrapText.bind(measurer) : wrapText

      const lh = getActiveLineHeight() // 1 in cell mode, lineHeightPx in pixel mode

      for (const line of lines) {
        measureStats.displayWidthCalls++
        const lineWidth = dw(line)
        if (isTruncate || lineWidth <= maxWidth) {
          totalHeight += lh
          actualWidth = Math.max(actualWidth, isTruncate ? Math.min(lineWidth, maxWidth) : lineWidth)
        } else if (isHardWrap) {
          // Character-level hard wrap: ceil(lineWidth / maxWidth) lines.
          // Guard: when maxWidth is not finite (unconstrained), treat as 1 line.
          if (Number.isFinite(maxWidth) && maxWidth > 0) {
            totalHeight += Math.ceil(lineWidth / maxWidth) * lh
            actualWidth = Math.max(actualWidth, maxWidth)
          } else {
            totalHeight += lh
            actualWidth = Math.max(actualWidth, lineWidth)
          }
        } else {
          const wrapped = wt(line, maxWidth, false, true)
          totalHeight += wrapped.length * lh
          for (const wl of wrapped) {
            actualWidth = Math.max(actualWidth, dw(wl))
          }
        }
      }

      // Respect height constraint from layout engine.
      // When heightMode is "at-most", the text should not exceed the available height.
      // When heightMode is "exactly", the text should be exactly that height.
      // This prevents text from overflowing into parent border rows.
      let resultHeight = Math.max(lh, totalHeight)
      if (heightMode === "exactly" && Number.isFinite(height)) {
        resultHeight = height
      } else if (heightMode === "at-most" && Number.isFinite(height)) {
        resultHeight = Math.min(resultHeight, height)
      }

      // Cache and return result
      const result = {
        width: Math.min(actualWidth, maxWidth),
        height: resultHeight,
      }
      measureCache.set(cacheKey, result)
      return result
    })
  }

  return node
}

// collectNodeTextContent is imported from @silvery/ag-term/pipeline/collect-text
// as collectPlainTextSkipHidden. Previously duplicated here; now shared with
// measure-phase.ts and render-text.ts via the shared collect-text module.

/**
 * Create the root node for the Silvery tree.
 * Root is always column (document flow is top-to-bottom), regardless of
 * flexily's default flexDirection.
 */
export function createRootNode(): AgNode {
  const node = createNode("silvery-root", {})
  const c = getConstants()
  node.layoutNode!.setFlexDirection(c.FLEX_DIRECTION_COLUMN)
  return node
}

/**
 * Create a virtual text node (for nested text elements).
 * Virtual text nodes don't have layout nodes and don't participate in layout.
 * They're used when Text is nested inside another Text.
 */
export function createVirtualTextNode(props: TextProps): AgNode {
  const epoch = getRenderEpoch()
  return {
    type: "silvery-text",
    props,
    children: [],
    parent: null,
    layoutNode: null, // No layout node for virtual text
    boxRect: null,
    scrollRect: null,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: INITIAL_EPOCH,
    dirtyBits: CONTENT_BIT | STYLE_PROPS_BIT | BG_BIT | SUBTREE_BIT,
    dirtyEpoch: epoch,
    isRawText: false, // Not raw text, but virtual (nested) text
    inlineRects: null,
  }
}

// ============================================================================
// Layout Property Application
// ============================================================================

/**
 * Apply BoxProps to a layout node.
 * This maps Ink/Silvery props to the layout engine API.
 */
export function applyBoxProps(layoutNode: LayoutNode, props: BoxProps, oldProps?: BoxProps): void {
  const c = getConstants()
  // Helper: true when a prop was set in oldProps but not in newProps (prop removed on rerender)
  const wasRemoved = (prop: keyof BoxProps): boolean => oldProps?.[prop] !== undefined && props[prop] === undefined

  // Dimensions
  if (props.width !== undefined) {
    if (typeof props.width === "string" && props.width.endsWith("%")) {
      layoutNode.setWidthPercent(Number.parseFloat(props.width))
    } else if (typeof props.width === "number") {
      layoutNode.setWidth(props.width)
    } else if (props.width === "auto") {
      layoutNode.setWidthAuto()
    } else if (props.width === "fit-content") {
      layoutNode.setWidthFitContent()
    } else if (props.width === "snug-content") {
      layoutNode.setWidthSnugContent()
    }
  } else if (wasRemoved("width")) {
    layoutNode.setWidthAuto()
  }

  if (props.height !== undefined) {
    if (typeof props.height === "string" && props.height.endsWith("%")) {
      layoutNode.setHeightPercent(Number.parseFloat(props.height))
    } else if (typeof props.height === "number") {
      layoutNode.setHeight(props.height)
    } else if (props.height === "auto") {
      layoutNode.setHeightAuto()
    }
  } else if (wasRemoved("height")) {
    layoutNode.setHeightAuto()
  }

  // Min/Max dimensions
  if (props.minWidth !== undefined) {
    if (typeof props.minWidth === "string" && props.minWidth.endsWith("%")) {
      layoutNode.setMinWidthPercent(Number.parseFloat(props.minWidth))
    } else if (typeof props.minWidth === "number") {
      layoutNode.setMinWidth(props.minWidth)
    }
  } else if (wasRemoved("minWidth")) {
    layoutNode.setMinWidth(0)
  }

  if (props.minHeight !== undefined) {
    if (typeof props.minHeight === "string" && props.minHeight.endsWith("%")) {
      layoutNode.setMinHeightPercent(Number.parseFloat(props.minHeight))
    } else if (typeof props.minHeight === "number") {
      layoutNode.setMinHeight(props.minHeight)
    }
  } else if (wasRemoved("minHeight")) {
    layoutNode.setMinHeight(0)
  }

  if (props.maxWidth !== undefined) {
    if (typeof props.maxWidth === "string" && props.maxWidth.endsWith("%")) {
      layoutNode.setMaxWidthPercent(Number.parseFloat(props.maxWidth))
    } else if (typeof props.maxWidth === "number") {
      layoutNode.setMaxWidth(props.maxWidth)
    }
  } else if (wasRemoved("maxWidth")) {
    layoutNode.setMaxWidth(Number.POSITIVE_INFINITY)
  }

  if (props.maxHeight !== undefined) {
    if (typeof props.maxHeight === "string" && props.maxHeight.endsWith("%")) {
      layoutNode.setMaxHeightPercent(Number.parseFloat(props.maxHeight))
    } else if (typeof props.maxHeight === "number") {
      layoutNode.setMaxHeight(props.maxHeight)
    }
  } else if (wasRemoved("maxHeight")) {
    layoutNode.setMaxHeight(Number.POSITIVE_INFINITY)
  }

  // Flex properties
  if (props.flexGrow !== undefined) {
    layoutNode.setFlexGrow(props.flexGrow)
  } else if (wasRemoved("flexGrow")) {
    layoutNode.setFlexGrow(0)
  }

  if (props.flexShrink !== undefined) {
    layoutNode.setFlexShrink(props.flexShrink)
  } else if (wasRemoved("flexShrink")) {
    layoutNode.setFlexShrink(1)
  }

  if (props.flexBasis !== undefined) {
    if (typeof props.flexBasis === "string" && props.flexBasis.endsWith("%")) {
      layoutNode.setFlexBasisPercent(Number.parseFloat(props.flexBasis))
    } else if (props.flexBasis === "auto") {
      layoutNode.setFlexBasisAuto()
    } else if (typeof props.flexBasis === "number") {
      layoutNode.setFlexBasis(props.flexBasis)
    }
  } else if (wasRemoved("flexBasis")) {
    layoutNode.setFlexBasisAuto()
  }

  // Flex direction
  if (props.flexDirection !== undefined) {
    const directionMap: Record<string, number> = {
      row: c.FLEX_DIRECTION_ROW,
      column: c.FLEX_DIRECTION_COLUMN,
      "row-reverse": c.FLEX_DIRECTION_ROW_REVERSE,
      "column-reverse": c.FLEX_DIRECTION_COLUMN_REVERSE,
    }
    layoutNode.setFlexDirection(directionMap[props.flexDirection] ?? c.FLEX_DIRECTION_ROW)
  } else if (wasRemoved("flexDirection")) {
    layoutNode.setFlexDirection(c.FLEX_DIRECTION_ROW)
  }

  // Flex wrap
  if (props.flexWrap !== undefined) {
    const wrapMap: Record<string, number> = {
      nowrap: c.WRAP_NO_WRAP,
      wrap: c.WRAP_WRAP,
      "wrap-reverse": c.WRAP_WRAP_REVERSE,
    }
    layoutNode.setFlexWrap(wrapMap[props.flexWrap] ?? c.WRAP_NO_WRAP)
  } else if (wasRemoved("flexWrap")) {
    layoutNode.setFlexWrap(c.WRAP_NO_WRAP)
  }

  // Alignment
  if (props.alignItems !== undefined) {
    layoutNode.setAlignItems(alignToConstant(props.alignItems))
  } else if (wasRemoved("alignItems")) {
    layoutNode.setAlignItems(c.ALIGN_STRETCH)
  }

  if (props.alignSelf !== undefined) {
    if (props.alignSelf === "auto") {
      layoutNode.setAlignSelf(c.ALIGN_AUTO)
    } else {
      layoutNode.setAlignSelf(alignToConstant(props.alignSelf))
    }
  } else if (wasRemoved("alignSelf")) {
    layoutNode.setAlignSelf(c.ALIGN_AUTO)
  }

  if (props.alignContent !== undefined) {
    layoutNode.setAlignContent(alignToConstant(props.alignContent))
  } else if (wasRemoved("alignContent")) {
    layoutNode.setAlignContent(c.ALIGN_FLEX_START)
  }

  if (props.justifyContent !== undefined) {
    layoutNode.setJustifyContent(justifyToConstant(props.justifyContent))
  } else if (wasRemoved("justifyContent")) {
    layoutNode.setJustifyContent(c.JUSTIFY_FLEX_START)
  }

  // Padding
  applySpacing(layoutNode, "padding", props)

  // Margin
  applySpacing(layoutNode, "margin", props)

  // Gap
  if (props.gap !== undefined) {
    layoutNode.setGap(c.GUTTER_ALL, props.gap)
  } else if (wasRemoved("gap")) {
    layoutNode.setGap(c.GUTTER_ALL, 0)
  }

  if (props.columnGap !== undefined) {
    layoutNode.setGap(c.GUTTER_COLUMN, props.columnGap)
  } else if (wasRemoved("columnGap")) {
    layoutNode.setGap(c.GUTTER_COLUMN, 0)
  }

  if (props.rowGap !== undefined) {
    layoutNode.setGap(c.GUTTER_ROW, props.rowGap)
  } else if (wasRemoved("rowGap")) {
    layoutNode.setGap(c.GUTTER_ROW, 0)
  }

  // Display
  if (props.display !== undefined) {
    layoutNode.setDisplay(props.display === "none" ? c.DISPLAY_NONE : c.DISPLAY_FLEX)
  } else if (wasRemoved("display")) {
    layoutNode.setDisplay(c.DISPLAY_FLEX)
  }

  // Position
  // Note: 'sticky' is handled at render-time, not by layout engine. For layout purposes, treat as relative.
  if (props.position !== undefined) {
    if (props.position === "absolute") {
      layoutNode.setPositionType(c.POSITION_TYPE_ABSOLUTE)
    } else if (props.position === "static") {
      layoutNode.setPositionType(c.POSITION_TYPE_STATIC)
    } else {
      layoutNode.setPositionType(c.POSITION_TYPE_RELATIVE)
    }
  } else if (wasRemoved("position")) {
    layoutNode.setPositionType(c.POSITION_TYPE_RELATIVE)
  }

  // Position offsets (top, left, bottom, right)
  // Skip offsets for position="static" — static positioning ignores offsets (CSS spec).
  if (props.position !== "static") {
    applyPositionOffset(layoutNode, c.EDGE_TOP, props.top)
    applyPositionOffset(layoutNode, c.EDGE_LEFT, props.left)
    applyPositionOffset(layoutNode, c.EDGE_BOTTOM, props.bottom)
    applyPositionOffset(layoutNode, c.EDGE_RIGHT, props.right)
  }

  // Aspect ratio
  if (props.aspectRatio !== undefined) {
    layoutNode.setAspectRatio(props.aspectRatio)
  } else if (wasRemoved("aspectRatio")) {
    layoutNode.setAspectRatio(NaN)
  }

  // Overflow
  // Derive effective overflow: explicit overflow takes precedence, then per-axis (hidden if either axis is hidden)
  const effectiveOverflow =
    props.overflow ?? (props.overflowX === "hidden" || props.overflowY === "hidden" ? "hidden" : undefined)
  if (effectiveOverflow !== undefined) {
    if (effectiveOverflow === "hidden") {
      layoutNode.setOverflow(c.OVERFLOW_HIDDEN)
    } else if (effectiveOverflow === "scroll") {
      // Use OVERFLOW_HIDDEN for layout so children are constrained to parent width
      // (text wraps instead of overflowing). The render phase reads props.overflow
      // to enable vertical scroll behavior independently of the layout constraint.
      layoutNode.setOverflow(c.OVERFLOW_HIDDEN)
    } else {
      layoutNode.setOverflow(c.OVERFLOW_VISIBLE)
    }
  } else if (wasRemoved("overflow") || wasRemoved("overflowX") || wasRemoved("overflowY")) {
    layoutNode.setOverflow(c.OVERFLOW_VISIBLE)
  }

  // Border (affects layout - 1 cell per border side in terminal mode).
  // In pixel/canvas mode (lineHeight > 1), borders are visual-only — drawn by
  // fillRoundedRect, not layout-affecting box-drawing characters. Set width to 0
  // so flexily doesn't steal space from content for invisible character borders.
  if (props.borderStyle) {
    const borderWidth = getActiveLineHeight() > 1 ? 0 : 1
    if (props.borderTop !== false) {
      layoutNode.setBorder(c.EDGE_TOP, borderWidth)
    } else {
      layoutNode.setBorder(c.EDGE_TOP, 0)
    }
    if (props.borderBottom !== false) {
      layoutNode.setBorder(c.EDGE_BOTTOM, borderWidth)
    } else {
      layoutNode.setBorder(c.EDGE_BOTTOM, 0)
    }
    if (props.borderLeft !== false) {
      layoutNode.setBorder(c.EDGE_LEFT, borderWidth)
    } else {
      layoutNode.setBorder(c.EDGE_LEFT, 0)
    }
    if (props.borderRight !== false) {
      layoutNode.setBorder(c.EDGE_RIGHT, borderWidth)
    } else {
      layoutNode.setBorder(c.EDGE_RIGHT, 0)
    }
  } else {
    // Reset all border widths when borderStyle is removed
    layoutNode.setBorder(c.EDGE_TOP, 0)
    layoutNode.setBorder(c.EDGE_BOTTOM, 0)
    layoutNode.setBorder(c.EDGE_LEFT, 0)
    layoutNode.setBorder(c.EDGE_RIGHT, 0)
  }
}

/**
 * Apply padding or margin to a layout node.
 */
function applySpacing(layoutNode: LayoutNode, type: "padding" | "margin", props: BoxProps): void {
  const c = getConstants()
  const set = type === "padding" ? layoutNode.setPadding.bind(layoutNode) : layoutNode.setMargin.bind(layoutNode)

  const all = props[type] as number | undefined
  const x = props[`${type}X` as keyof BoxProps] as number | undefined
  const yy = props[`${type}Y` as keyof BoxProps] as number | undefined
  const top = props[`${type}Top` as keyof BoxProps] as number | undefined
  const bottom = props[`${type}Bottom` as keyof BoxProps] as number | undefined
  const left = props[`${type}Left` as keyof BoxProps] as number | undefined
  const right = props[`${type}Right` as keyof BoxProps] as number | undefined

  // Compute effective value per edge, resolving CSS-like specificity cascade:
  // individual > axis (X/Y) > all > 0
  // This handles the case where props are REMOVED (e.g., paddingLeft: 1 → undefined):
  // the edge is reset to 0 instead of retaining the stale Yoga value.
  set(c.EDGE_TOP, top ?? yy ?? all ?? 0)
  set(c.EDGE_BOTTOM, bottom ?? yy ?? all ?? 0)
  set(c.EDGE_LEFT, left ?? x ?? all ?? 0)
  set(c.EDGE_RIGHT, right ?? x ?? all ?? 0)
}

/**
 * Apply a position offset (top/left/bottom/right) to a layout node.
 * Supports both numeric (absolute) and percentage string values.
 */
function applyPositionOffset(layoutNode: LayoutNode, edge: number, value: number | string | undefined): void {
  if (value === undefined) {
    // Unset stale position offset when prop is removed on rerender
    layoutNode.setPosition(edge, NaN)
    return
  }
  if (typeof value === "string" && value.endsWith("%")) {
    layoutNode.setPositionPercent(edge, Number.parseFloat(value))
  } else if (typeof value === "number") {
    layoutNode.setPosition(edge, value)
  }
}

/**
 * Convert align value to layout constant.
 */
function alignToConstant(align: string): number {
  const c = getConstants()
  const map: Record<string, number> = {
    "flex-start": c.ALIGN_FLEX_START,
    "flex-end": c.ALIGN_FLEX_END,
    center: c.ALIGN_CENTER,
    stretch: c.ALIGN_STRETCH,
    baseline: c.ALIGN_BASELINE,
    "space-between": c.ALIGN_SPACE_BETWEEN,
    "space-around": c.ALIGN_SPACE_AROUND,
    "space-evenly": c.ALIGN_SPACE_EVENLY,
  }
  return map[align] ?? c.ALIGN_STRETCH
}

/**
 * Convert justify value to layout constant.
 */
function justifyToConstant(justify: string): number {
  const c = getConstants()
  const map: Record<string, number> = {
    "flex-start": c.JUSTIFY_FLEX_START,
    "flex-end": c.JUSTIFY_FLEX_END,
    center: c.JUSTIFY_CENTER,
    "space-between": c.JUSTIFY_SPACE_BETWEEN,
    "space-around": c.JUSTIFY_SPACE_AROUND,
    "space-evenly": c.JUSTIFY_SPACE_EVENLY,
  }
  return map[justify] ?? c.JUSTIFY_FLEX_START
}

// ============================================================================
// Layout Calculation
// ============================================================================

/**
 * Calculate layout for the entire tree starting from root.
 */
export function calculateLayout(root: AgNode, width: number, height: number): void {
  const c = getConstants()
  if (!root.layoutNode) {
    throw new Error("Root node must have a layout node")
  }
  root.layoutNode.calculateLayout(width, height, c.DIRECTION_LTR)
  propagateLayout(root, 0, 0)
  notifyLayoutSubscribers(root)
}

/**
 * Propagate computed layout from layout nodes to SilveryNodes.
 */
function propagateLayout(node: AgNode, parentX: number, parentY: number): void {
  // Save previous layout for change detection
  node.prevLayout = node.boxRect

  // Get computed layout from layout node
  if (!node.layoutNode) {
    // Virtual nodes (raw text, nested text) inherit parent layout
    return
  }
  const left = node.layoutNode.getComputedLeft()
  const top = node.layoutNode.getComputedTop()
  const width = node.layoutNode.getComputedWidth()
  const height = node.layoutNode.getComputedHeight()

  node.boxRect = {
    x: parentX + left,
    y: parentY + top,
    width,
    height,
  }

  // If dimensions changed, content needs re-render
  if (!rectEqual(node.prevLayout, node.boxRect)) {
    const epoch = getRenderEpoch()
    if (node.dirtyEpoch !== epoch) {
      node.dirtyBits = CONTENT_BIT
      node.dirtyEpoch = epoch
    } else {
      node.dirtyBits |= CONTENT_BIT
    }
  }

  // Recursively propagate to children
  for (const child of node.children) {
    propagateLayout(child, node.boxRect.x, node.boxRect.y)
  }
}

/**
 * Sync layout signals for nodes whose rects changed.
 */
function notifyLayoutSubscribers(node: AgNode): void {
  // Sync rect values into alien-signals (for signal-based hooks)
  syncRectSignals(node)

  for (const child of node.children) {
    notifyLayoutSubscribers(child)
  }
}
