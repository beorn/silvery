/**
 * Debug utilities for incremental render mismatch diagnostics.
 *
 * When INKX_STRICT detects a mismatch between incremental and fresh renders,
 * these utilities help identify the root cause by providing:
 * - Node attribution (which node owns the mismatched cell)
 * - Dirty flag state (what flags were set before render)
 * - Layout changes (prevLayout vs contentRect)
 * - Scroll context (offset changes, hidden items)
 */

import type { Cell } from "./buffer.js"
import type { BoxProps, InkxNode, Rect, TextProps } from "./types.js"

// ============================================================================
// Types
// ============================================================================

/** Debug info about a node at a screen position */
export interface NodeDebugInfo {
  /** Node ID (if set via props.id) */
  id: string | undefined
  /** Node type (inkx-box, inkx-text, inkx-root) */
  type: string
  /** Path from root to this node (IDs or indices) */
  path: string
  /** Index within parent's children array */
  childIndex: number | null
  /** Dirty flags at time of mismatch */
  dirtyFlags: {
    contentDirty: boolean
    paintDirty: boolean
    subtreeDirty: boolean
    childrenDirty: boolean
    layoutDirty: boolean
  }
  /** Layout info */
  layout: {
    prevLayout: Rect | null
    contentRect: Rect | null
    screenRect: Rect | null
    layoutChanged: boolean
  }
  /** Scroll context (if this is a scroll container or inside one) */
  scroll?: {
    offset: number
    prevOffset: number
    offsetChanged: boolean
    contentHeight: number
    viewportHeight: number
    hiddenAbove: number
    hiddenBelow: number
    firstVisibleChild: number
    lastVisibleChild: number
  }
  /** Background color from props */
  backgroundColor: string | undefined
  /** Number of children */
  childCount: number
  /** Whether node is hidden (Suspense) */
  hidden: boolean
}

/** Full mismatch debug context */
export interface MismatchDebugContext {
  /** Screen position of the mismatch */
  position: { x: number; y: number }
  /** Cell values */
  cells: {
    incremental: Cell
    fresh: Cell
  }
  /** Render number */
  renderNum: number
  /** Node that owns this screen position (innermost) */
  node: NodeDebugInfo | null
  /** Scroll container ancestry (if any) */
  scrollAncestors: NodeDebugInfo[]
  /** All nodes whose screenRect contains this position */
  containingNodes: NodeDebugInfo[]
  /** Fast-path analysis - why the node was likely skipped */
  fastPathAnalysis: string[]
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Find the innermost node at a screen position.
 */
export function findNodeAtPosition(root: InkxNode, x: number, y: number): InkxNode | null {
  let result: InkxNode | null = null

  function visit(node: InkxNode): void {
    const rect = node.screenRect
    if (!rect) return

    // Check if position is within this node's screenRect
    if (x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height) {
      result = node // This node contains the position

      // Check children (later children render on top of earlier ones)
      for (const child of node.children) {
        visit(child)
      }
    }
  }

  visit(root)
  return result
}

/**
 * Find all nodes whose screenRect contains the given position.
 * Returns nodes from root to innermost (outermost first).
 */
export function findAllContainingNodes(root: InkxNode, x: number, y: number): InkxNode[] {
  const result: InkxNode[] = []

  function visit(node: InkxNode): void {
    const rect = node.screenRect
    if (!rect) return

    if (x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height) {
      result.push(node)
      for (const child of node.children) {
        visit(child)
      }
    }
  }

  visit(root)
  return result
}

/**
 * Get the path from root to a node (for identification).
 */
function getNodePath(node: InkxNode): string {
  const parts: string[] = []
  let current: InkxNode | null = node

  while (current) {
    const props = current.props as BoxProps & TextProps
    if (props.id) {
      parts.unshift(`#${props.id}`)
    } else if (current.parent) {
      const idx = current.parent.children.indexOf(current)
      parts.unshift(`[${idx}]`)
    } else {
      parts.unshift("root")
    }
    current = current.parent
  }

  return parts.join(" > ")
}

/**
 * Check if a rect changed (position or size).
 */
function rectChanged(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return false
  if (!a || !b) return true
  return a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height
}

/**
 * Extract debug info from a node.
 */
export function getNodeDebugInfo(node: InkxNode): NodeDebugInfo {
  const props = node.props as BoxProps & TextProps

  // Get child index within parent
  let childIndex: number | null = null
  if (node.parent) {
    childIndex = node.parent.children.indexOf(node)
  }

  return {
    id: props.id,
    type: node.type,
    path: getNodePath(node),
    childIndex,
    dirtyFlags: {
      contentDirty: node.contentDirty,
      paintDirty: node.paintDirty,
      subtreeDirty: node.subtreeDirty,
      childrenDirty: node.childrenDirty,
      layoutDirty: node.layoutDirty,
    },
    layout: {
      prevLayout: node.prevLayout,
      contentRect: node.contentRect,
      screenRect: node.screenRect,
      layoutChanged: rectChanged(node.prevLayout, node.contentRect),
    },
    scroll: node.scrollState
      ? {
          offset: node.scrollState.offset,
          prevOffset: node.scrollState.prevOffset,
          offsetChanged: node.scrollState.offset !== node.scrollState.prevOffset,
          contentHeight: node.scrollState.contentHeight,
          viewportHeight: node.scrollState.viewportHeight,
          hiddenAbove: node.scrollState.hiddenAbove,
          hiddenBelow: node.scrollState.hiddenBelow,
          firstVisibleChild: node.scrollState.firstVisibleChild,
          lastVisibleChild: node.scrollState.lastVisibleChild,
        }
      : undefined,
    backgroundColor: props.backgroundColor,
    childCount: node.children.length,
    hidden: node.hidden ?? false,
  }
}

/**
 * Find scroll container ancestors for a node.
 */
function findScrollAncestors(node: InkxNode): InkxNode[] {
  const result: InkxNode[] = []
  let current = node.parent

  while (current) {
    if (current.scrollState) {
      result.push(current)
    }
    current = current.parent
  }

  return result
}

/**
 * Analyze why a node might have been incorrectly skipped by fast-path.
 */
function analyzeFastPath(node: InkxNode | null, scrollAncestors: InkxNode[]): string[] {
  const analysis: string[] = []

  if (!node) {
    analysis.push("⚠ No node found at mismatch position - possible virtualization issue")
    return analysis
  }

  const flags = node
  const allClean =
    !flags.contentDirty && !flags.paintDirty && !flags.subtreeDirty && !flags.childrenDirty && !flags.layoutDirty

  if (allClean) {
    analysis.push("⚠ ALL DIRTY FLAGS FALSE - fast-path likely skipped this node")
  }

  // Check if node is in a scroll container
  const scrollParent = scrollAncestors[0]
  if (scrollParent?.scrollState) {
    const ss = scrollParent.scrollState
    const childIndex = node.parent ? node.parent.children.indexOf(node) : -1

    // Check if this node SHOULD be in visible range
    const inVisibleRange = childIndex >= ss.firstVisibleChild && childIndex <= ss.lastVisibleChild
    if (!inVisibleRange && childIndex >= 0) {
      analysis.push(
        `⚠ Node index ${childIndex} is OUTSIDE visible range [${ss.firstVisibleChild}..${ss.lastVisibleChild}]`,
      )
      analysis.push("  → Node should have been skipped, but mismatch suggests it should render")
    } else if (inVisibleRange) {
      analysis.push(`✓ Node index ${childIndex} is in visible range [${ss.firstVisibleChild}..${ss.lastVisibleChild}]`)
    }

    // Check scroll offset
    if (ss.offset === ss.prevOffset) {
      analysis.push("✓ Scroll offset unchanged (fast-path enabled for children)")
    } else {
      analysis.push(`⚠ Scroll offset CHANGED: ${ss.prevOffset} → ${ss.offset}`)
    }

    // Check if visible range might have changed
    if (ss.firstVisibleChild !== 0 || ss.lastVisibleChild !== scrollParent.children.length - 1) {
      analysis.push(
        `  Visible range is partial: [${ss.firstVisibleChild}..${ss.lastVisibleChild}] of ${scrollParent.children.length} children`,
      )
      analysis.push("  → If visible range changed, newly visible children need rendering")
    }
  }

  // Check prevLayout
  const layoutChanged = rectChanged(node.prevLayout, node.contentRect)
  if (!layoutChanged && node.prevLayout) {
    analysis.push("✓ Layout unchanged (prevLayout matches contentRect)")
  } else if (!node.prevLayout) {
    analysis.push("⚠ prevLayout is NULL - node may never have been rendered before")
  } else {
    analysis.push("⚠ Layout CHANGED but node still skipped - dirty flag not set?")
  }

  // Check for sibling child position changes
  if (node.parent && node.parent.children.length > 1) {
    let siblingMoved = false
    for (const sibling of node.parent.children) {
      if (sibling !== node && sibling.contentRect && sibling.prevLayout) {
        if (sibling.contentRect.x !== sibling.prevLayout.x || sibling.contentRect.y !== sibling.prevLayout.y) {
          siblingMoved = true
          break
        }
      }
    }
    if (siblingMoved) {
      analysis.push("⚠ SIBLING POSITION CHANGED - parent should have detected this")
    }
  }

  // Check hidden state
  if (node.hidden) {
    analysis.push("⚠ Node is HIDDEN (Suspense) - should not be rendered")
  }

  return analysis
}

/**
 * Build full mismatch debug context.
 */
export function buildMismatchContext(
  root: InkxNode,
  x: number,
  y: number,
  incrementalCell: Cell,
  freshCell: Cell,
  renderNum: number,
): MismatchDebugContext {
  const innermost = findNodeAtPosition(root, x, y)
  const containing = findAllContainingNodes(root, x, y)
  const scrollAncestorNodes = innermost ? findScrollAncestors(innermost) : []

  return {
    position: { x, y },
    cells: {
      incremental: incrementalCell,
      fresh: freshCell,
    },
    renderNum,
    node: innermost ? getNodeDebugInfo(innermost) : null,
    scrollAncestors: scrollAncestorNodes.map(getNodeDebugInfo),
    containingNodes: containing.map(getNodeDebugInfo),
    fastPathAnalysis: analyzeFastPath(innermost, scrollAncestorNodes),
  }
}

/**
 * Format mismatch context as a human-readable string.
 */
export function formatMismatchContext(ctx: MismatchDebugContext): string {
  const lines: string[] = []

  // Header
  lines.push(`INKX_CHECK_INCREMENTAL: MISMATCH at (${ctx.position.x}, ${ctx.position.y}) on render #${ctx.renderNum}`)
  lines.push("")

  // Cell values
  const { incremental, fresh } = ctx.cells
  lines.push("CELL VALUES:")
  lines.push(
    `  incremental: char=${JSON.stringify(incremental.char)} fg=${JSON.stringify(incremental.fg)} bg=${JSON.stringify(incremental.bg)} attrs=${JSON.stringify(incremental.attrs)}`,
  )
  lines.push(
    `  fresh:       char=${JSON.stringify(fresh.char)} fg=${JSON.stringify(fresh.fg)} bg=${JSON.stringify(fresh.bg)} attrs=${JSON.stringify(fresh.attrs)}`,
  )
  lines.push("")

  // Node attribution
  if (ctx.node) {
    lines.push("INNERMOST NODE:")
    lines.push(`  path: ${ctx.node.path}`)
    lines.push(`  type: ${ctx.node.type}`)
    if (ctx.node.backgroundColor) {
      lines.push(`  backgroundColor: ${ctx.node.backgroundColor}`)
    }
    lines.push("")

    // Dirty flags
    const flags = ctx.node.dirtyFlags
    const activeFlags = Object.entries(flags)
      .filter(([, v]) => v)
      .map(([k]) => k)
    lines.push("DIRTY FLAGS:")
    if (activeFlags.length > 0) {
      lines.push(`  active: ${activeFlags.join(", ")}`)
    } else {
      lines.push("  active: (none - node was clean)")
    }
    lines.push(
      `  all: contentDirty=${flags.contentDirty} paintDirty=${flags.paintDirty} subtreeDirty=${flags.subtreeDirty} childrenDirty=${flags.childrenDirty} layoutDirty=${flags.layoutDirty}`,
    )
    lines.push("")

    // Layout info
    const { layout } = ctx.node
    lines.push("LAYOUT:")
    if (layout.layoutChanged) {
      lines.push("  ⚠ LAYOUT CHANGED:")
      lines.push(`    prevLayout: ${formatRect(layout.prevLayout)}`)
      lines.push(`    contentRect: ${formatRect(layout.contentRect)}`)
    } else {
      lines.push(`  contentRect: ${formatRect(layout.contentRect)}`)
    }
    lines.push(`  screenRect: ${formatRect(layout.screenRect)}`)
    lines.push("")

    // Scroll context
    if (ctx.node.scroll) {
      lines.push("SCROLL STATE (this node):")
      formatScrollState(lines, ctx.node.scroll)
      lines.push("")
    }
  } else {
    lines.push("INNERMOST NODE: (none found at this position)")
    lines.push("")
  }

  // Scroll ancestors
  if (ctx.scrollAncestors.length > 0) {
    lines.push("SCROLL ANCESTORS:")
    for (const ancestor of ctx.scrollAncestors) {
      lines.push(`  ${ancestor.path}:`)
      if (ancestor.scroll) {
        formatScrollState(lines, ancestor.scroll, "    ")
      }
    }
    lines.push("")
  }

  // Containing nodes (for debugging layering issues)
  if (ctx.containingNodes.length > 1) {
    lines.push("ALL CONTAINING NODES (outermost to innermost):")
    for (const node of ctx.containingNodes) {
      const flags = Object.entries(node.dirtyFlags)
        .filter(([, v]) => v)
        .map(([k]) => k.replace("Dirty", ""))
        .join(",")
      const flagStr = flags ? ` [${flags}]` : " [clean]"
      const bgStr = node.backgroundColor ? ` bg=${node.backgroundColor}` : ""
      const childStr = node.childIndex !== null ? ` child[${node.childIndex}]` : ""
      lines.push(`  ${node.path}${flagStr}${bgStr}${childStr}`)
    }
    lines.push("")
  }

  // Fast-path analysis
  if (ctx.fastPathAnalysis.length > 0) {
    lines.push("FAST-PATH ANALYSIS:")
    for (const line of ctx.fastPathAnalysis) {
      lines.push(`  ${line}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

function formatRect(rect: Rect | null): string {
  if (!rect) return "(null)"
  return `{x:${rect.x}, y:${rect.y}, w:${rect.width}, h:${rect.height}}`
}

function formatScrollState(lines: string[], scroll: NonNullable<NodeDebugInfo["scroll"]>, indent = "  "): void {
  if (scroll.offsetChanged) {
    lines.push(`${indent}⚠ SCROLL CHANGED: offset ${scroll.prevOffset} → ${scroll.offset}`)
  } else {
    lines.push(`${indent}offset: ${scroll.offset}`)
  }
  lines.push(
    `${indent}viewport: ${scroll.viewportHeight}/${scroll.contentHeight} (hidden: ▲${scroll.hiddenAbove} ▼${scroll.hiddenBelow})`,
  )
  lines.push(`${indent}visibleRange: [${scroll.firstVisibleChild}..${scroll.lastVisibleChild}]`)
}
