/**
 * Text Rendering - Functions for rendering text content to the buffer.
 *
 * Contains:
 * - ANSI text line rendering (renderAnsiTextLine)
 * - Plain text line rendering (renderTextLine)
 * - Text formatting (formatTextLines)
 * - Text truncation (truncateText)
 * - Text content collection (collectTextContent)
 */

import {
  type CellAttrs,
  type Color,
  type Style,
  type TerminalBuffer,
  type UnderlineStyle,
  createMutableCell,
} from "../buffer"
import type {
  AgNode,
  TextProps,
  TextTruncateHook,
  TextTruncateResult,
  TextMeasure,
  UserSelect,
} from "@silvery/ag/types"
import {
  type StyledSegment,
  ensureEmojiPresentation,
  fixOsc8AcrossWrappedLines,
  fixSgrAcrossWrappedLines,
  graphemeWidth,
  hasAnsi,
  parseAnsiText,
  sliceByWidth,
  sliceByWidthFromEnd,
  splitGraphemes,
  splitGraphemesAnsiAware,
  wrapText,
} from "../unicode"
import { collectPlainText } from "./collect-text"
import { getTextStyle, getTextWidth, parseColor } from "./render-helpers"
import { getActiveTheme, type ActiveColorLevel } from "./state"
import {
  getCachedPlainText,
  setCachedPlainText,
  getCachedCollectedText,
  setCachedCollectedText,
  getCachedFormat,
  setCachedFormat,
  getCachedAnalysis,
  setCachedAnalysis,
} from "./prepared-text"
import { buildTextAnalysis, balancedWidth as computeBalancedWidth, optimalWrap } from "./pretext"
import { createFrameSink, type RenderSink } from "./render-sink"
import type { BgConflictMode, ClipBounds, NodeRenderState, PipelineContext } from "./types"
import { isStrictAnyEnabled } from "../strict-mode"
import { assertBgCellHasTextPaint, isClipParityEnabled } from "../strict-clip-parity.js"
import { createLogger } from "loggily"
import { resolveUserSelect } from "../user-select"

const log = createLogger("silvery:content")

// ============================================================================
// Background Conflict Detection
// ============================================================================

/** Cached bg conflict mode. Read from env once at module load. */
let bgConflictMode: BgConflictMode = (() => {
  const env =
    typeof process !== "undefined" ? process.env.SILVERY_BG_CONFLICT?.toLowerCase() : undefined
  if (env === "ignore" || env === "warn" || env === "throw") return env
  return "throw" // default - fail fast on programming errors
})()

/**
 * Get the current background conflict detection mode.
 */
function getBgConflictMode(): BgConflictMode {
  return bgConflictMode
}

/**
 * Set the background conflict detection mode. For tests.
 */
export function setBgConflictMode(mode: BgConflictMode): void {
  bgConflictMode = mode
}

// Track warned conflicts to avoid spam (only used in 'warn' mode)
const warnedBgConflicts = new Set<string>()

/** Format a Color value for bg conflict diagnostics */
function formatBgConflictColor(
  c: number | { r: number; g: number; b: number } | null | undefined,
): string {
  if (c === null || c === undefined) return "none"
  if (typeof c === "number") {
    // Packed RGB (0x1000000 marker) or ANSI palette index
    if (c & 0x1000000) {
      const r = (c >> 16) & 0xff
      const g = (c >> 8) & 0xff
      const b = c & 0xff
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
    }
    // Map SGR codes to names for readability
    const names: Record<number, string> = {
      40: "black",
      41: "red",
      42: "green",
      43: "yellow",
      44: "blue",
      45: "magenta",
      46: "cyan",
      47: "white",
      100: "brightBlack",
      101: "brightRed",
      102: "brightGreen",
      103: "brightYellow",
      104: "brightBlue",
      105: "brightMagenta",
      106: "brightCyan",
      107: "brightWhite",
    }
    return names[c] ?? `palette(${c})`
  }
  return `rgb(${c.r},${c.g},${c.b})`
}

/**
 * Clear the background conflict warning cache.
 * Call this at the start of each render cycle to:
 * - Prevent memory leaks in long-running apps
 * - Allow warnings to repeat after user fixes issues
 */
export function clearBgConflictWarnings(): void {
  warnedBgConflicts.clear()
}

// ============================================================================
// Text Content Collection
// ============================================================================

/**
 * Style context for nested Text elements.
 * Tracks cumulative styles through the tree to enable proper push/pop behavior.
 */
interface StyleContext {
  hyperlink?: string
  color?: string
  backgroundColor?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  underlineStyle?: string | false
  underlineColor?: string
  overline?: boolean
  inverse?: boolean
  strikethrough?: boolean
}

/**
 * Build ANSI escape sequence for a style context.
 *
 * Note: backgroundColor is intentionally NOT embedded as ANSI codes.
 * Background color is handled at the buffer level (via BgSegment tracking)
 * to prevent bg bleed across wrapped text lines. See km-silvery.bg-bleed.
 */
function styleToAnsi(style: StyleContext, colorLevel?: ActiveColorLevel): string {
  const parts: string[] = []
  let bold = style.bold
  let dim = style.dim
  let italic = style.italic
  let underline = style.underline
  let underlineStyle = style.underlineStyle
  let inverse = style.inverse
  let strikethrough = style.strikethrough

  // Nested Text runs bypass getTextStyle(), so carry the same monochrome
  // token fallbacks into their inline ANSI segments. Without this,
  // `$fg-on-inverse-muted` loses its SGR dim fallback inside a parent Text and
  // color-driven animations disappear on mono terminals.
  if (colorLevel === "mono") {
    const monoAttrs = getTextStyle(
      {
        color: style.color,
        backgroundColor: style.backgroundColor,
      },
      colorLevel,
    ).attrs
    if (monoAttrs.bold) bold = true
    if (monoAttrs.dim) dim = true
    if (monoAttrs.italic) italic = true
    if (monoAttrs.underline) {
      underline = true
      if (!underlineStyle) underlineStyle = "single"
    }
    if (monoAttrs.inverse) inverse = true
    if (monoAttrs.strikethrough) strikethrough = true
  }

  // Foreground color - use parseColor directly instead of roundtripping through getTextStyle
  if (style.color) {
    const color = parseColor(style.color, colorLevel)
    if (color !== null) {
      if (typeof color === "number") {
        parts.push(`38;5;${color}`)
      } else {
        parts.push(`38;2;${color.r};${color.g};${color.b}`)
      }
    }
  }

  // backgroundColor is NOT embedded here - it is tracked separately via
  // BgSegment and applied at the buffer level in renderText(). This prevents
  // bg color from bleeding across wrapped lines. See collectTextWithBg().

  // Attributes
  if (bold) parts.push("1")
  if (dim) parts.push("2")
  if (italic) parts.push("3")
  // Underline: prefer underlineStyle (SGR 4:x subparam) over boolean (SGR 4)
  if (underlineStyle) {
    const styleMap: Record<string, string> = {
      single: "4:1",
      double: "4:2",
      curly: "4:3",
      dotted: "4:4",
      dashed: "4:5",
    }
    parts.push(styleMap[underlineStyle] ?? "4")
  } else if (underline) {
    parts.push("4")
  }
  // Underline color (SGR 58;5;N or 58;2;r;g;b).
  // "currentColor"/"inherit" → resolve to the merged fg (style.color), so the
  // underline tracks whatever color the surrounding text ended up as.
  if (style.underlineColor) {
    const underlineSource =
      style.underlineColor === "currentColor" || style.underlineColor === "inherit"
        ? style.color
        : style.underlineColor
    if (underlineSource) {
      const ulColor = parseColor(underlineSource, colorLevel)
      if (ulColor !== null) {
        if (typeof ulColor === "number") {
          parts.push(`58;5;${ulColor}`)
        } else {
          parts.push(`58;2;${ulColor.r};${ulColor.g};${ulColor.b}`)
        }
      }
    }
  }
  if (inverse) parts.push("7")
  if (strikethrough) parts.push("9")
  if (style.overline) parts.push("53")

  if (parts.length === 0) {
    return ""
  }

  return `\x1b[${parts.join(";")}m`
}

function hyperlinkOpen(href: string): string {
  return `\x1b]8;;${href}\x1b\\`
}

const HYPERLINK_CLOSE = "\x1b]8;;\x1b\\"
// Nested Text is serialized to ANSI and parsed back before cells are painted.
// OSC 8 close otherwise becomes indistinguishable from "no hyperlink override",
// causing mergeAnsiStyle() to inherit the outer destination again. This private
// marker carries an explicit clear across that internal round trip; it never
// reaches the output buffer.
const INTERNAL_HYPERLINK_CLEAR = "\0silvery:hyperlink-clear"

/**
 * Merge child props into parent context.
 * Child values override parent values when specified.
 */
function mergeStyleContext(parent: StyleContext, childProps: TextProps): StyleContext {
  // color="inherit"/"currentColor" on a virtual-text child is a pass-through:
  // the child's effective color is whatever the parent already resolved to.
  // Without this, nested <Text color="inherit"> clobbered the merged context
  // with the raw keyword, which styleToAnsi then mapped to null (no fg SGR).
  const isInheritKeyword = childProps.color === "inherit" || childProps.color === "currentColor"
  const effectiveChildColor = isInheritKeyword ? parent.color : childProps.color

  // Normalize unified `underline: boolean | UnderlineStyleName` on the child.
  // `underlineStyle` (deprecated) wins when both are set; otherwise string form
  // promotes to both underline=true AND underlineStyle=<name>.
  const childUl = childProps.underline
  const childUlStyle = (childProps as any).underlineStyle
  let childUnderline: boolean | undefined
  let childUnderlineStyle: string | false | undefined
  if (childUlStyle !== undefined) {
    childUnderline = childUlStyle === false ? false : true
    childUnderlineStyle = childUlStyle
  } else if (typeof childUl === "string") {
    childUnderline = true
    childUnderlineStyle = childUl
  } else if (childUl !== undefined) {
    childUnderline = childUl
    childUnderlineStyle = undefined
  }

  return {
    hyperlink: childProps.internal_hyperlink ?? parent.hyperlink,
    color: effectiveChildColor ?? parent.color,
    backgroundColor: childProps.backgroundColor ?? parent.backgroundColor,
    bold: childProps.bold ?? parent.bold,
    dim: childProps.internal_dim ?? parent.dim,
    italic: childProps.italic ?? parent.italic,
    underline: childUnderline ?? parent.underline,
    underlineStyle: childUnderlineStyle ?? parent.underlineStyle,
    underlineColor: (childProps as any).underlineColor ?? parent.underlineColor,
    overline: (childProps as any).overline ?? parent.overline,
    inverse: childProps.inverse ?? parent.inverse,
    strikethrough: childProps.strikethrough ?? parent.strikethrough,
  }
}

/**
 * Apply text styles as ANSI escape codes with proper push/pop behavior.
 * After the child text, restores the parent context's styles.
 *
 * @param text - The text content to wrap
 * @param childStyle - The merged style for this child (child overrides parent)
 * @param parentStyle - The parent's style context to restore after
 */
function applyTextStyleAnsi(
  text: string,
  childStyle: StyleContext,
  parentStyle: StyleContext,
  colorLevel?: ActiveColorLevel,
): string {
  if (!text) {
    return text
  }

  const childAnsi = styleToAnsi(childStyle, colorLevel)
  const parentAnsi = styleToAnsi(parentStyle, colorLevel)
  const linkChanged = childStyle.hyperlink !== parentStyle.hyperlink

  // If child has no style changes, just return text
  if (!childAnsi && !linkChanged) {
    return text
  }

  const openLink = !linkChanged
    ? ""
    : childStyle.hyperlink === undefined
      ? HYPERLINK_CLOSE
      : hyperlinkOpen(childStyle.hyperlink || INTERNAL_HYPERLINK_CLEAR)
  const restoreLink = !linkChanged
    ? ""
    : parentStyle.hyperlink === undefined
      ? HYPERLINK_CLOSE
      : hyperlinkOpen(parentStyle.hyperlink)
  const restoreStyle = childAnsi === "" ? "" : `\x1b[0m${parentAnsi}`
  return `${openLink}${childAnsi}${text}${restoreStyle}${restoreLink}`
}

/**
 * Recursively collect text content from a node and its children.
 * Handles both raw text nodes (textContent set directly) and
 * Text component wrappers (text in children).
 *
 * For nested Text nodes with style props (color, bold, etc.),
 * applies ANSI codes so the styles are preserved when rendered.
 * Uses a style stack to properly restore parent styles after nested elements.
 *
 * @param node - The node to collect text from
 * @param parentContext - The inherited style context from parent (used for restoration)
 */
export function collectTextContent(
  node: AgNode,
  parentContext: StyleContext = {},
  colorLevel?: ActiveColorLevel,
): string {
  // If this node has direct text content, return it
  if (node.textContent !== undefined) {
    return node.textContent
  }

  // Otherwise, collect from children
  // Matching Ink's squashTextNodes: apply internal_transform to the full text
  // of each child node (not per-line), using the child index as the index argument.
  let result = ""
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!
    // If child is a Text node (virtual/nested) with style props, apply ANSI codes
    if (child.type === "silvery-text" && child.props && !child.layoutNode) {
      const childProps = child.props as TextProps
      // Merge child props with parent context to get effective child style
      const childContext = mergeStyleContext(parentContext, childProps)
      // Recursively collect with child's context
      let childContent = collectTextContent(child, childContext, colorLevel)
      // Apply internal_transform from virtual text nodes (nested Transform components).
      // Matches Ink's squashTextNodes: transform is applied to the full concatenated
      // text of the child, with index = child position in parent's children array.
      const childTransform = (childProps as any).internal_transform
      if (childTransform && childContent.length > 0) {
        childContent = childTransform(childContent, i)
      }
      // Apply styles with proper push/pop (child style, then restore parent)
      result += applyTextStyleAnsi(childContent, childContext, parentContext, colorLevel)
    } else {
      // Not a styled Text node, just collect recursively
      result += collectTextContent(child, parentContext, colorLevel)
    }
  }
  return result
}

// ============================================================================
// Background Segment Tracking
// ============================================================================

/**
 * A background color segment in collected text.
 * Tracks which character range has which background color,
 * independent of ANSI codes. Used to apply bg at the buffer level
 * after text wrapping, preventing bg bleed across wrapped lines.
 */
interface BgSegment {
  /** Start character offset in the collected text (inclusive) */
  start: number
  /** End character offset in the collected text (exclusive) */
  end: number
  /** Background color to apply */
  bg: Color
}

/**
 * A span mapping a virtual text child node to its character range.
 * Used to compute inlineRects for hit testing on nested Text.
 */
interface ChildSpan {
  /** The virtual text node */
  node: AgNode
  /** Start display-width offset in the collected text (inclusive) */
  start: number
  /** End display-width offset in the collected text (exclusive) */
  end: number
  /**
   * The child's fully-merged style context (parent context ⊕ child props), as
   * computed during collection. Used by the style-only restyle fast path to
   * resolve this run's fg/attrs identically to the full render path (the cells
   * the full path paints get `mergeAnsiStyle(baseStyle, parse(styleToAnsi(ctx)))`).
   */
  context: StyleContext
}

/**
 * Result of collecting text with background segments.
 */
interface TextWithBg {
  /** The collected text string (with ANSI codes for fg/attrs, but NOT bg) */
  text: string
  /** Background color segments from nested Text elements */
  bgSegments: BgSegment[]
  /** Spans mapping virtual text children to display-width ranges */
  childSpans: ChildSpan[]
  /** Plain text character count (excluding ANSI codes). Used for DOM-level budget tracking. */
  plainLen: number
}

// collectPlainText is imported from ./collect-text.
// Previously duplicated here; now shared across measure-phase, render-text,
// and the reconciler's measure function.

/**
 * Collect text content and background color segments from a node tree.
 *
 * Like collectTextContent, but also tracks backgroundColor from nested Text
 * elements as separate BgSegment entries. Background is NOT embedded as ANSI
 * codes, preventing bg bleed when text wraps across lines.
 *
 * @param node - The node to collect text from
 * @param parentContext - The inherited style context from parent
 * @param offset - Current character offset in the collected text (for bg tracking)
 * @param maxDisplayWidth - Maximum display width (columns) to collect. When set,
 *   stops collecting once this many display columns of content have been gathered.
 *   This truncates at the DOM level BEFORE ANSI serialization, so escape sequences
 *   (OSC 8, etc.) are never generated for content that won't be displayed.
 *   Uses getTextWidth (ANSI-aware) so pre-styled leaf text is handled correctly.
 */
function collectTextWithBg(
  node: AgNode,
  parentContext: StyleContext = {},
  offset = 0,
  maxDisplayWidth?: number,
  ctx?: PipelineContext,
): TextWithBg {
  // If this node has direct text content, return it with no bg segments
  if (node.textContent !== undefined) {
    let text = node.textContent
    // DOM-level truncation: trim leaf text to display width budget
    if (maxDisplayWidth !== undefined) {
      const textW = getTextWidth(text, ctx)
      if (textW > maxDisplayWidth) {
        const sliceFn = ctx ? ctx.measurer.sliceByWidth : sliceByWidth
        text = sliceFn(text, maxDisplayWidth)
      }
    }
    // plainLen tracks display width for budget and BgSegment offset tracking.
    // Both use display-width coordinates consistently: collectTextWithBg uses
    // getTextWidth for offsets, mapLinesToCharOffsets returns display-width,
    // and applyBgSegmentsToLine compares via display-width (col - x).
    const plainLen = getTextWidth(text, ctx)
    return { text, bgSegments: [], childSpans: [], plainLen }
  }

  let result = ""
  const bgSegments: BgSegment[] = []
  const childSpans: ChildSpan[] = []
  let currentOffset = offset
  let displayWidthCollected = 0

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!
    // Stop collecting if budget exhausted
    if (maxDisplayWidth !== undefined && displayWidthCollected >= maxDisplayWidth) break

    // Compute remaining budget for this child
    const childBudget =
      maxDisplayWidth !== undefined ? maxDisplayWidth - displayWidthCollected : undefined

    if (child.type === "silvery-text" && child.props && !child.layoutNode) {
      const childProps = child.props as TextProps
      const childContext = mergeStyleContext(parentContext, childProps)
      // Recursively collect with child's context and budget
      const childResult = collectTextWithBg(child, childContext, currentOffset, childBudget, ctx)

      // Apply internal_transform from virtual text nodes (nested Transform components).
      // Matches Ink's squashTextNodes: transform is applied to the full concatenated
      // text of the child, with index = child position in parent's children array.
      const childTransform = (childProps as any).internal_transform
      if (childTransform && childResult.text.length > 0) {
        childResult.text = childTransform(childResult.text, i)
      }

      // Apply ANSI styles for fg/attrs (but NOT bg) with push/pop
      const styledText = applyTextStyleAnsi(
        childResult.text,
        childContext,
        parentContext,
        ctx?.colorLevel,
      )
      result += styledText

      // Track bg segment if this child (or its ancestors) has backgroundColor.
      // When backgroundColor is "" (empty string), create a null-bg segment to
      // explicitly clear inherited background (e.g., from a parent Box).
      if (childContext.backgroundColor) {
        const bg = parseColor(childContext.backgroundColor, ctx?.colorLevel)
        if (bg !== null) {
          if (childResult.plainLen > 0) {
            bgSegments.push({
              start: currentOffset,
              end: currentOffset + childResult.plainLen,
              bg,
            })
          }
        }
      } else if (childProps.backgroundColor === "" && childResult.plainLen > 0) {
        // Explicit backgroundColor="" clears inherited bg (from parent Text
        // or ancestor Box's inheritedBg). Push a null-bg segment so
        // applyBgSegmentsToLine overrides inheritedBg to null for this range.
        bgSegments.push({
          start: currentOffset,
          end: currentOffset + childResult.plainLen,
          bg: null,
        })
      }

      // Track child span for inlineRects computation + style-only restyle.
      // `childContext` is the fully-merged context — the same value
      // applyTextStyleAnsi uses to emit this child's inline ANSI.
      if (childResult.plainLen > 0) {
        childSpans.push({
          node: child,
          start: currentOffset,
          end: currentOffset + childResult.plainLen,
          context: childContext,
        })
      }

      // Include child's nested bg segments and child spans
      bgSegments.push(...childResult.bgSegments)
      childSpans.push(...childResult.childSpans)

      // Track using plainLen (display width) — not text.length which includes ANSI codes
      currentOffset += childResult.plainLen
      displayWidthCollected += childResult.plainLen
    } else {
      // Not a styled Text node, just collect recursively
      const childResult = collectTextWithBg(child, parentContext, currentOffset, childBudget, ctx)
      result += childResult.text
      bgSegments.push(...childResult.bgSegments)
      childSpans.push(...childResult.childSpans)
      currentOffset += childResult.plainLen
      displayWidthCollected += childResult.plainLen
    }
  }

  return { text: result, bgSegments, childSpans, plainLen: displayWidthCollected }
}

function hasNestedUserSelectOverride(node: AgNode): boolean {
  for (const child of node.children) {
    const value = (child.props as { userSelect?: UserSelect }).userSelect
    if (value === "none" || value === "text" || value === "contain") return true
    if (hasNestedUserSelectOverride(child)) return true
  }
  return false
}

interface DisplayTextSegment {
  start: number
  end: number
}

/** Visit every rendered cell covered by display-width text segments. */
function forEachTextSegmentCell<T extends DisplayTextSegment>(
  segments: readonly T[],
  x: number,
  lineText: string,
  lineCharStart: number,
  lineCharEnd: number,
  leftClip: number,
  rightClip: number,
  graphemeWidthFn: (grapheme: string) => number,
  visit: (segment: T, col: number, width: number) => void,
): void {
  const graphemes = splitGraphemes(hasAnsi(lineText) ? stripAnsiForBg(lineText) : lineText)
  for (const segment of segments) {
    const overlapStart = Math.max(segment.start, lineCharStart)
    const overlapEnd = Math.min(segment.end, lineCharEnd)
    if (overlapStart >= overlapEnd) continue

    const relStart = overlapStart - lineCharStart
    const relEnd = overlapEnd - lineCharStart
    let col = x
    for (const grapheme of graphemes) {
      const width = graphemeWidthFn(grapheme)
      if (width === 0) continue

      const displayOffset = col - x
      if (
        displayOffset >= relStart &&
        displayOffset < relEnd &&
        col >= leftClip &&
        col < rightClip
      ) {
        visit(segment, col, Math.min(width, rightClip - col))
      }

      col += width
      if (col - x >= relEnd || col >= rightClip) break
    }
  }
}

/**
 * Apply background segments to buffer cells for a single rendered line.
 *
 * Maps character offsets from the original collected text to screen positions,
 * accounting for text wrapping. Each bg segment fills only the cells that
 * correspond to actual text characters, not trailing whitespace.
 *
 * @param buffer - The terminal buffer to write to
 * @param x - Screen x position of the line start
 * @param y - Screen y position of the line
 * @param lineText - The rendered line text (may contain ANSI codes)
 * @param lineCharStart - Character offset in original text where this line starts
 * @param lineCharEnd - Character offset in original text where this line ends
 * @param bgSegments - Background color segments to apply
 */
function applyBgSegmentsToLine(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  lineText: string,
  lineCharStart: number,
  lineCharEnd: number,
  bgSegments: BgSegment[],
  ctx?: PipelineContext,
  maxCol?: number,
  minCol?: number,
  selectable = false,
): void {
  if (bgSegments.length === 0) return
  const sink: RenderSink = createFrameSink(buffer)
  if (y < 0 || y >= sink.height) return

  // Clip horizontally to the parent's visible region. Without this, bg paint
  // walks the full natural-flow width of the line — which, when the Text node
  // is laid out wider than the visible parent (e.g. wrap=wrap inside an
  // overflow=hidden card narrower than the text's natural width), produces
  // bg cells past the parent's right border into the empty area beyond the
  // card. The chars themselves are clipped by renderGraphemes's rightEdge
  // check, leaving bg cells with empty content — the cyan-strip residue.
  // See bead km-silvery.render-light-blue-bg-strip-residue Round 11.
  const rightClip = maxCol !== undefined ? Math.min(maxCol, sink.width) : sink.width
  const leftClip = minCol !== undefined ? Math.max(minCol, 0) : 0

  // Reusable cell for readCellInto to avoid per-character allocation
  const bgCell = createMutableCell()
  const gWidthFn = ctx ? ctx.measurer.graphemeWidth : graphemeWidth
  const clipParityTextColumns = isClipParityEnabled()
    ? collectClipParityTextColumns(lineText, x, leftClip, rightClip, gWidthFn)
    : null
  const clipParityLinePreview =
    clipParityTextColumns === null ? undefined : previewClipParityLine(lineText)

  forEachTextSegmentCell(
    bgSegments,
    x,
    lineText,
    lineCharStart,
    lineCharEnd,
    leftClip,
    rightClip,
    gWidthFn,
    (segment, col, width) => {
      for (let offset = 0; offset < width; offset++) {
        const cellX = col + offset
        if (clipParityTextColumns !== null) {
          assertBgCellHasTextPaint({
            x: cellX,
            y,
            textPaintColumns: clipParityTextColumns,
            leftClip,
            rightClip,
            bg: segment.bg,
            lineTextPreview: clipParityLinePreview,
          })
        }
        buffer.readCellInto(cellX, y, bgCell)
        bgCell.bg = segment.bg
        sink.emitSetCell(cellX, y, bgCell, selectable)
      }
    },
  )
}

/** Apply nested virtual Text userSelect overrides without repainting cell content. */
function applySelectableSpansToLine(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  lineText: string,
  lineCharStart: number,
  lineCharEnd: number,
  childSpans: readonly ChildSpan[],
  lineHasContent: boolean,
  ctx?: PipelineContext,
  maxCol?: number,
  minCol?: number,
): void {
  if (childSpans.length === 0) return

  const sink: RenderSink = createFrameSink(buffer)
  if (y < 0 || y >= sink.height) return
  const rightClip = maxCol !== undefined ? Math.min(maxCol, sink.width) : sink.width
  const leftClip = minCol !== undefined ? Math.max(minCol, 0) : 0
  const cell = createMutableCell()
  const graphemeWidthFn = ctx ? ctx.measurer.graphemeWidth : graphemeWidth

  forEachTextSegmentCell(
    childSpans,
    x,
    lineText,
    lineCharStart,
    lineCharEnd,
    leftClip,
    rightClip,
    graphemeWidthFn,
    (span, col, width) => {
      for (let offset = 0; offset < width; offset++) {
        const cellX = col + offset
        buffer.readCellInto(cellX, y, cell)
        sink.emitSetCell(cellX, y, cell, lineHasContent && resolveUserSelect(span.node) !== "none")
      }
    },
  )
}

function collectClipParityTextColumns(
  lineText: string,
  startCol: number,
  leftClip: number,
  rightClip: number,
  graphemeWidthFn: (grapheme: string) => number,
): Set<number> {
  const columns = new Set<number>()
  let col = startCol
  const graphemes = splitGraphemes(hasAnsi(lineText) ? stripAnsiForBg(lineText) : lineText)

  for (const grapheme of graphemes) {
    if (col >= rightClip) break

    const width = graphemeWidthFn(grapheme)
    if (width === 0) continue

    if (col + width <= leftClip) {
      col += width
      continue
    }

    if (col < leftClip) {
      col = leftClip
      continue
    }

    if (width === 2 && col + 1 >= rightClip) {
      columns.add(col)
      col += 1
      continue
    }

    columns.add(col)
    if (width === 2 && col + 1 < rightClip) {
      columns.add(col + 1)
      col += 2
    } else {
      col += width
    }
  }

  return columns
}

function previewClipParityLine(lineText: string): string {
  const plain = hasAnsi(lineText) ? stripAnsiForBg(lineText) : lineText
  return plain.length > 80 ? `${plain.slice(0, 80)}…` : plain
}

/**
 * Strip ANSI escape codes from text for character counting.
 */
function stripAnsiForBg(text: string): string {
  return text
    .replace(/\x1b\[[0-9;:?]*[A-Za-z]/g, "")
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[DME78]/g, "")
    .replace(/\x1b\(B/g, "")
}

/**
 * Map formatted lines back to character offsets in the original text.
 *
 * After wrapping/truncation, each output line corresponds to a range
 * of characters in the original text. This function computes those ranges
 * by searching for each line's content in the normalized text.
 *
 * Handles characters consumed by word wrapping (spaces at break points,
 * newlines) and characters added by truncation (ellipsis).
 *
 * Returns display-width offsets (not UTF-16 code units) to match BgSegment
 * coordinate system. BgSegments use display-width via getTextWidth/plainLen.
 *
 * @param originalText - The original collected text (with ANSI, before wrapping)
 * @param formattedLines - The wrapped/truncated output lines
 * @param ctx - Pipeline context for width measurement
 * @returns Array of { start, end } display-width offsets for each formatted line
 */
function mapLinesToCharOffsets(
  originalText: string,
  formattedLines: string[],
  ctx?: PipelineContext,
): Array<{ start: number; end: number }> {
  // Strip ANSI from the original to get the plain text character sequence
  const plainOriginal = hasAnsi(originalText) ? stripAnsiForBg(originalText) : originalText
  // Normalize tabs to match formatTextLines behavior
  const normalized = plainOriginal.replace(/\t/g, "    ")

  const result: Array<{ start: number; end: number }> = []
  let charOffset = 0 // UTF-16 offset for string matching (findLineStart)
  let displayOffset = 0 // Display-width offset for BgSegment matching

  for (const line of formattedLines) {
    const plainLine = hasAnsi(line) ? stripAnsiForBg(line) : line

    // Find where this line starts in the normalized text (UTF-16 matching).
    const lineStart = findLineStart(normalized, plainLine, charOffset)

    // Convert skipped characters (between previous line end and this line start)
    // to display width. These are whitespace/newlines consumed by wrapping.
    if (lineStart > charOffset) {
      const skipped = normalized.slice(charOffset, lineStart)
      displayOffset += getTextWidth(skipped, ctx)
    }

    // Line content display width
    const lineDisplayWidth = getTextWidth(plainLine, ctx)
    result.push({ start: displayOffset, end: displayOffset + lineDisplayWidth })

    // Advance both offset trackers
    const lineLen = Math.min(plainLine.length, normalized.length - lineStart)
    charOffset = lineStart + lineLen
    displayOffset += lineDisplayWidth
  }

  return result
}

/**
 * Find where a formatted line starts in the normalized original text.
 *
 * Scans forward from the given offset, matching the line content
 * character by character. Skips newlines and whitespace that were
 * consumed by wrapping between lines.
 */
function findLineStart(normalized: string, plainLine: string, fromOffset: number): number {
  if (plainLine.length === 0) {
    // Empty line -- skip to next newline
    let pos = fromOffset
    while (pos < normalized.length && normalized[pos] === "\n") {
      pos++
    }
    return pos
  }

  // Try exact match at current offset first (fast path for first line
  // and for lines that follow explicit newlines without space trimming)
  if (normalized.startsWith(plainLine, fromOffset)) {
    return fromOffset
  }

  // For truncated lines, extract prefix before ellipsis for matching.
  // startsWith fails when the line has "…" that doesn't exist in the original.
  const ELLIPSIS = "\u2026"
  const ellipsisIdx = plainLine.indexOf(ELLIPSIS)
  const truncatedPrefix = ellipsisIdx > 0 ? plainLine.slice(0, ellipsisIdx) : null

  if (truncatedPrefix && normalized.startsWith(truncatedPrefix, fromOffset)) {
    return fromOffset
  }

  // Scan forward, skipping newlines and spaces consumed by wrapping
  let pos = fromOffset
  while (pos < normalized.length) {
    const ch = normalized[pos]!
    if (ch === "\n" || ch === " ") {
      pos++
      continue
    }
    // Found a non-whitespace character -- check if line starts here
    if (normalized.startsWith(plainLine, pos)) {
      return pos
    }
    // Check truncated prefix match (e.g. "abcde…" -> match "abcde")
    if (truncatedPrefix && normalized.startsWith(truncatedPrefix, pos)) {
      return pos
    }
    pos++
  }

  // Fallback: return current position
  return fromOffset
}

/**
 * Classification of the boundary between formatted line[i] and line[i+1] in
 * terms of what the ORIGINAL (normalized) text had between them. Drives the
 * per-row `softWrapped` / `wrapJoinSpace` metadata that copy-selection reads
 * to rejoin soft-wrapped visual rows into their logical line.
 *
 * - "soft-space": the rows are the same logical line, split by word wrap that
 *   consumed whitespace (the gap was only spaces). Rejoin with a single space.
 *   → { softWrapped: true, wrapJoinSpace: true }
 * - "soft-break": the rows are the same logical line, split mid-token with NO
 *   whitespace consumed (a token longer than the width, or `wrap="hard"`).
 *   Rejoin with nothing. → { softWrapped: true, wrapJoinSpace: false }
 * - "hard": the gap contained an explicit `\n` — a real line break. Keep the
 *   newline. → { softWrapped: false }
 * - "end": the last (or only) line — no following row. → { softWrapped: false }
 */
export type LineBreakKind = "soft-space" | "soft-break" | "hard" | "end"

/**
 * Classify each formatted line's break to the next, by walking the normalized
 * original text alongside the formatted `lines` (mirroring
 * `mapLinesToCharOffsets` / `findLineStart`'s "skip whitespace/newlines
 * consumed by wrapping" logic).
 *
 * For each line, find where it starts in the normalized text and where it
 * ends; the GAP to the next line's start is the text consumed at the break:
 *   - contains "\n"            → "hard"
 *   - non-empty (only spaces)  → "soft-space"
 *   - empty (adjacent)         → "soft-break"
 * The final line is "end".
 *
 * PURE: depends only on (text, lines). Computed once per (node, width, wrap,
 * trim) and replayed from the format cache, so STRICT incremental≡fresh holds.
 *
 * Returns one entry per formatted line (same length as `formattedLines`).
 */
function classifyLineBreaks(originalText: string, formattedLines: string[]): LineBreakKind[] {
  const result: LineBreakKind[] = []
  const lineCount = formattedLines.length
  if (lineCount === 0) return result

  // Mirror mapLinesToCharOffsets: strip ANSI, normalize tabs, then match each
  // formatted line back into the normalized text by UTF-16 offset.
  const plainOriginal = hasAnsi(originalText) ? stripAnsiForBg(originalText) : originalText
  const normalized = plainOriginal.replace(/\t/g, "    ")

  let charOffset = 0
  // lineStart/lineEnd of the CURRENT line in `normalized` (UTF-16 offsets).
  let curStart = -1
  let curEnd = -1

  for (let i = 0; i < lineCount; i++) {
    const line = formattedLines[i]!
    const plainLine = hasAnsi(line) ? stripAnsiForBg(line) : line

    if (i === 0) {
      curStart = findLineStart(normalized, plainLine, charOffset)
      const lineLen = Math.min(plainLine.length, normalized.length - curStart)
      curEnd = curStart + lineLen
    }

    if (i === lineCount - 1) {
      // No following row.
      result.push("end")
      break
    }

    // Locate the NEXT line's start to measure the gap consumed at this break.
    const nextLine = formattedLines[i + 1]!
    const plainNext = hasAnsi(nextLine) ? stripAnsiForBg(nextLine) : nextLine
    const nextStart = findLineStart(normalized, plainNext, curEnd)
    const gap = normalized.slice(curEnd, nextStart)

    if (gap.includes("\n")) {
      result.push("hard")
    } else if (gap.length > 0) {
      // Word wrap consumed whitespace (trim-mode stripped it from both rows).
      result.push("soft-space")
    } else {
      // Adjacent in the original — a forced mid-token break (long token or
      // wrap="hard"). No separator to reinsert.
      result.push("soft-break")
    }

    // Advance to the next line for the following iteration.
    const nextLen = Math.min(plainNext.length, normalized.length - nextStart)
    curStart = nextStart
    curEnd = nextStart + nextLen
    charOffset = curEnd
  }

  return result
}

// ============================================================================
// Text Formatting
// ============================================================================

function hardWrapTextLines(text: string, width: number, ctx?: PipelineContext): string[] {
  const inputLines = text.split("\n")
  const out: string[] = []
  const gWidthFn = ctx?.measurer?.graphemeWidth?.bind(ctx.measurer) ?? graphemeWidth

  for (const line of inputLines) {
    if (line === "") {
      out.push("")
      continue
    }

    let current = ""
    let currentWidth = 0
    for (const grapheme of splitGraphemesAnsiAware(line)) {
      const gWidth = hasAnsi(grapheme) ? 0 : gWidthFn(grapheme)
      if (gWidth > 0 && currentWidth + gWidth > width && current.length > 0) {
        out.push(current)
        current = ""
        currentWidth = 0
      }

      current += grapheme
      currentWidth += gWidth
    }

    if (current.length > 0) {
      out.push(current)
    }
  }

  if (text.includes("\x1b]8;;")) {
    fixOsc8AcrossWrappedLines(out)
  }
  if (out.length > 1 && text.includes("\x1b[")) {
    fixSgrAcrossWrappedLines(out)
  }

  return out
}

/**
 * Format text into lines based on wrap mode.
 *
 * @param trim - When true, trims trailing spaces on broken lines and skips leading
 *   spaces on continuation lines. When false (e.g., text has backgroundColor),
 *   preserves trailing spaces so background color covers them. Defaults to true.
 * @param markerSgr - Inline SGR opening marker-chrome styling for inserted
 *   elision markers (built-in "…" and hook-returned marker ranges). `""` (the
 *   default when `truncateMarkerColor` is unset/unresolvable) leaves markers
 *   styled like their surroundings — byte-identical to the historical output.
 */
export function formatTextLines(
  text: string,
  width: number,
  wrap: TextProps["wrap"],
  ctx?: PipelineContext,
  trim = true,
  truncate?: TextTruncateHook,
  markerSgr = "",
): string[] {
  // Guard against width <= 0 to prevent infinite loops
  // This can happen with display="none" nodes (0x0 dimensions)
  if (width <= 0) {
    return []
  }

  // Convert tabs to spaces (tabs have 0 display width in string-width library)
  const normalizedText = text.replace(/\t/g, "    ")
  const lines = normalizedText.split("\n")

  // Hard clip: truncate without ellipsis (used by Fill component)
  if (wrap === "clip") {
    const sliceFn = ctx ? ctx.measurer.sliceByWidth : sliceByWidth
    return lines.map((line) => {
      if (getTextWidth(line, ctx) <= width) return line
      return sliceFn(line, width)
    })
  }

  // Hard wrap: character-level wrapping without regard to word boundaries.
  // Matches Ink's wrap="hard" behavior (wrap-ansi with wordWrap=false), so
  // "Hello World" at width=7 becomes ["Hello W", "orld"] — the break lands
  // mid-word rather than at the space. Multi-line input is hard-wrapped
  // line-by-line; each line is repeatedly sliced by display width.
  if (wrap === "hard") {
    return hardWrapTextLines(normalizedText, width, ctx)
  }

  // No wrapping, just truncate at end. The truncate hook (when present) is
  // consulted per-line for every truncate mode and applies after overflow.
  if (wrap === false || wrap === "truncate-end" || wrap === "truncate") {
    return lines.map((line) => truncateText(line, width, "end", ctx, truncate, markerSgr))
  }

  if (wrap === "truncate-start") {
    return lines.map((line) => truncateText(line, width, "start", ctx, truncate, markerSgr))
  }

  if (wrap === "truncate-middle") {
    return lines.map((line) => truncateText(line, width, "middle", ctx, truncate, markerSgr))
  }

  // Optimal wrapping (Knuth-Plass): minimize total raggedness across all lines.
  // Uses dynamic programming over breakpoints for globally optimal line breaks.
  if (wrap === "even") {
    // The optimal wrapper operates on visible text analysis and is not safe for
    // control sequences. Fall back to the ANSI-aware greedy wrapper so OSC 8
    // hyperlinks stay atomic and never leak a partial close token as text.
    if (hasAnsi(normalizedText)) return wrapText(normalizedText, width, true, trim)
    // NB (defense-in-depth): the early-return above sends EVERY ansi-bearing
    // string through greedy `wrapText` — which already self-contains both OSC 8
    // and SGR per line — so `optimalWrap` only reaches here for ansi-free text
    // and the two `fix*AcrossWrappedLines` guards below never fire today. They
    // are kept symmetric with `wrapTextWithMeasurer` so that, if the early
    // return is ever narrowed (e.g. to let optimalWrap handle SGR-only runs),
    // per-line self-containment still holds here. Drop both together if the
    // early-return is ever proven permanent.
    const gWidthFn = ctx?.measurer?.graphemeWidth?.bind(ctx.measurer) ?? graphemeWidth
    const analysis = buildTextAnalysis(normalizedText, gWidthFn)
    const evenLines = optimalWrap(normalizedText, analysis, width)
    // optimalWrap preserves ANSI tokens but, unlike the greedy wrapText path,
    // does not make each line's OSC 8 hyperlink state self-contained. A break
    // mid-link leaves a continuation line carrying only the CLOSE — which
    // parseAnsiText then leaks as literal `]8;;\` cells. Re-open/close per line,
    // identical to wrapTextWithMeasurer. See @km/code/v0.2/19654-osc-link-leak.
    if (normalizedText.includes("\x1b]8;;")) {
      fixOsc8AcrossWrappedLines(evenLines)
    }
    // Same self-containment requirement for SGR fg/attrs: optimalWrap preserves
    // ANSI tokens but doesn't re-open a style split across a break, so a
    // continuation line loses its colour/attr. Sibling of the OSC 8 fix above.
    // See @km/code/v0.2/19690-status-tuple-wrap-color.
    if (evenLines.length > 1 && normalizedText.includes("\x1b[")) {
      fixSgrAcrossWrappedLines(evenLines)
    }
    return evenLines
  }

  // Balanced wrapping: disabled — the heuristic (totalWidth / lineCount) doesn't
  // reliably produce better results than optimal. It narrows the width (changing
  // line count) rather than optimizing break placement. Keep the algorithm in
  // pretext.ts for potential future use; just treat "balanced" as greedy here.

  // wrap === "wrap-truncate" — body-text wrap that ellipsis-truncates the
  // offending line when an atomic token can't break (no soft-break
  // separator, would otherwise character-wrap). CSS-equivalent
  // `overflow-wrap: break-word` + `text-overflow: ellipsis`. Tracks
  // `@km/silvery/card-body-truncate-ellipsis`.
  if (wrap === "wrap-truncate") {
    const wrapped = ctx
      ? ctx.measurer.wrapText(normalizedText, width, true, false, true)
      : wrapText(normalizedText, width, true, true, true)
    // The ellipsis is inserted by the wrapper at a forced truncation, always at
    // the END of the offending line. Style a trailing "…" as marker chrome.
    // No-op when markerSgr is "" → byte-identical historical output.
    return markerSgr === ""
      ? wrapped
      : wrapped.map((line) => styleTrailingEllipsis(line, markerSgr))
  }

  // wrap === true or wrap === 'wrap' or wrap === 'balanced' - word-aware wrapping
  // Uses wrapText from unicode.ts with trim for rendering
  // (when trim=true, trims trailing spaces on broken lines, skips leading spaces
  // on continuation lines; when trim=false, preserves spaces for bg-colored text)
  if (ctx) return ctx.measurer.wrapText(normalizedText, width, true, trim)
  return wrapText(normalizedText, width, true, trim)
}

/**
 * Build a cell-width-aware {@link TextMeasure} bound to the active measurer
 * (or module-level fallbacks). Handed to a {@link TextTruncateHook} so the hook
 * never re-derives width math. Same `sliceFn`/`sliceEndFn`/`getTextWidth`
 * pattern used internally by `truncateText`.
 */
function makeTextMeasure(ctx?: PipelineContext): TextMeasure {
  const sliceFn = ctx ? ctx.measurer.sliceByWidth : sliceByWidth
  const sliceEndFn = ctx ? ctx.measurer.sliceByWidthFromEnd : sliceByWidthFromEnd
  return {
    width: (text) => getTextWidth(text, ctx),
    sliceByWidth: (text, max) => sliceFn(text, max),
    sliceByWidthFromEnd: (text, max) => sliceEndFn(text, max),
  }
}

// One SGR escape: ESC [ <params> m. Used to peel a uniformly-styled run's
// leading/trailing style sequences so the truncate hook only ever sees the
// plain VISIBLE core (it must never slice mid-escape).
const SGR_SEQ = /^\x1b\[[0-9;:]*m/
const SGR_SEQ_END = /\x1b\[[0-9;:]*m$/

/**
 * Peel a single uniformly-styled SGR run: optional leading SGR sequence(s) +
 * plain core (NO escape sequences inside) + optional trailing SGR sequence(s).
 *
 * Returns `{ prefix, core, suffix }` when the line is exactly that shape, or
 * `null` for any other ANSI shape (multi-run, OSC 8 links, escapes mid-line).
 * The truncate hook is caller domain policy operating on visible text — it gets
 * the plain `core`, and the framework re-attaches `prefix`/`suffix` around the
 * hook's result so the style survives and no escape is ever cut.
 */
function peelUniformSgr(line: string): { prefix: string; core: string; suffix: string } | null {
  let rest = line
  let prefix = ""
  // Consume leading SGR sequences.
  for (let m = rest.match(SGR_SEQ); m; m = rest.match(SGR_SEQ)) {
    prefix += m[0]
    rest = rest.slice(m[0].length)
  }
  let suffix = ""
  // Consume trailing SGR sequences.
  for (let m = rest.match(SGR_SEQ_END); m; m = rest.match(SGR_SEQ_END)) {
    suffix = m[0] + suffix
    rest = rest.slice(0, rest.length - m[0].length)
  }
  // The remaining core must contain NO escape sequences — any ESC means the
  // line is not a single uniform run (mid-line SGR, OSC 8, cursor moves, etc.).
  if (rest.includes("\x1b")) return null
  // Require that peeling actually removed style (otherwise hasAnsi was a false
  // positive from a non-SGR escape, which the core-ESC check already rejects).
  if (prefix === "" && suffix === "") return null
  return { prefix, core: rest, suffix }
}

/**
 * Build the foreground SGR sequence (`ESC [ 38;… m`) for a resolved {@link Color}.
 * Returns `""` for `null` (no color / stripped at mono tier) so callers can
 * treat "no marker color" as "leave the marker styled like its surroundings".
 * Mirrors the fg branch of {@link styleToAnsi} but takes an already-resolved
 * Color instead of a color string.
 */
function colorToFgSgr(color: Color): string {
  if (color === null) return ""
  if (typeof color === "number") return `\x1b[38;5;${color}m`
  return `\x1b[38;2;${color.r};${color.g};${color.b}m`
}

/**
 * Resolve a `truncateMarkerColor` prop (string color form) into the inline SGR
 * sequence that opens marker-chrome styling, or `""` when there is nothing to
 * apply (unset, unresolvable, or stripped at mono tier — markers then render
 * with the surrounding text's style, which is the correct degradation).
 *
 * Resolution goes through `parseColor`, so `$token` / hex / named / `rgb(...)` /
 * `mix(...)` all work and resolve against the active theme at paint time — the
 * same path `getTextStyle` uses for `color`. No second token-resolution path.
 */
function resolveMarkerSgr(markerColor: string | undefined, colorLevel?: ActiveColorLevel): string {
  if (!markerColor) return ""
  return colorToFgSgr(parseColor(markerColor, colorLevel))
}

/**
 * Insert marker-chrome styling around `[start, end)` ranges of a PLAIN string.
 *
 * For each marker range, emits `markerSgr` before the range and `reopenSgr`
 * after it, so the marker cells paint with the marker color and the surrounding
 * text restores its own style. `reopenSgr` is the line's own opening SGR (the
 * peeled prefix for a color-prop Text) or an SGR reset (`ESC [ 0 m`) for plain
 * text — never "reset to terminal default mid-styled-line", which would drop
 * the line's color after the first marker.
 *
 * Defensive against malformed `markers`: ranges are clamped to `[0, len]`,
 * empty/inverted ranges dropped, and overlaps merged. Never throws; a malformed
 * array under STRICT logs a deduplicated warning. When `markerSgr === ""`
 * (no/unresolvable marker color) the input is returned unchanged.
 */
function applyMarkerRanges(
  text: string,
  markers: readonly { start: number; end: number }[] | undefined,
  markerSgr: string,
  reopenSgr: string,
): string {
  if (!markers || markers.length === 0 || markerSgr === "") return text
  const len = text.length

  // Clamp + drop degenerate ranges, then sort by start.
  let malformed = false
  const clamped: { start: number; end: number }[] = []
  for (const m of markers) {
    let s = m.start
    let e = m.end
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e > len || s >= e) {
      malformed = true
      s = Math.max(0, Math.min(s, len))
      e = Math.max(0, Math.min(e, len))
      if (s >= e) continue
    }
    clamped.push({ start: s, end: e })
  }
  clamped.sort((a, b) => a.start - b.start)

  // Merge overlapping/adjacent ranges so we never emit nested marker SGR.
  const merged: { start: number; end: number }[] = []
  for (const r of clamped) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) {
      if (r.start < last.end) malformed = true // genuine overlap (not just adjacency)
      last.end = Math.max(last.end, r.end)
    } else {
      merged.push({ ...r })
    }
  }

  if (malformed && isStrictAnyEnabled()) {
    warnMarkerRanges(text, markers)
  }

  if (merged.length === 0) return text

  // Stitch: plain segment, then markerSgr + marker + reopenSgr, repeat.
  let out = ""
  let cursor = 0
  for (const r of merged) {
    out += text.slice(cursor, r.start)
    out += markerSgr + text.slice(r.start, r.end) + reopenSgr
    cursor = r.end
  }
  out += text.slice(cursor)
  return out
}

const warnedMarkerRanges = new Set<string>()

/** Deduplicated STRICT-mode warning for out-of-bounds / overlapping marker ranges. */
function warnMarkerRanges(text: string, markers: readonly { start: number; end: number }[]): void {
  const key = `${text.length}:${JSON.stringify(markers)}`
  if (warnedMarkerRanges.has(key)) return
  warnedMarkerRanges.add(key)
  log.warn?.(
    `[silvery] truncate hook returned out-of-bounds or overlapping marker ranges ` +
      `for a line of length ${text.length}: ${JSON.stringify(markers)}. ` +
      `Ranges were clamped/merged defensively.`,
  )
}

/**
 * Truncate text to fit within width.
 *
 * @param hook - Optional per-line {@link TextTruncateHook}. When provided and
 *   the text overflows, the hook is consulted FIRST; a non-null result is
 *   defensively hard-clipped to `width` (never trusted to fit on its own) and
 *   returned, while `null` falls through to the built-in `mode` behavior. When
 *   the hook is absent, output is byte-identical to the historical truncation.
 * @param markerSgr - Inline SGR sequence opening marker-chrome styling for the
 *   built-in ellipsis and for hook-returned marker ranges. `""` (the default
 *   when `truncateMarkerColor` is unset/unresolvable) leaves markers styled
 *   like their surroundings — byte-identical to the historical output.
 */
export function truncateText(
  text: string,
  width: number,
  mode: "start" | "middle" | "end",
  ctx?: PipelineContext,
  hook?: TextTruncateHook,
  markerSgr = "",
): string {
  const textWidth = getTextWidth(text, ctx)
  if (textWidth <= width) return text

  const sliceFn = ctx ? ctx.measurer.sliceByWidth : sliceByWidth
  const sliceEndFn = ctx ? ctx.measurer.sliceByWidthFromEnd : sliceByWidthFromEnd

  // Consult the hook first. The hook is caller domain policy that operates on
  // PLAIN VISIBLE text \u2014 it must never receive (and so never slice through)
  // inline ANSI. NO silent trust on its result either: a fitted result that
  // still overflows is hard-clipped so it can never paint past the box edge.
  if (hook && width > 0) {
    if (hasAnsi(text)) {
      // Only a single uniformly-styled run is safe to peel: leading SGR +
      // plain core + trailing SGR. Any other ANSI shape (multi-run, OSC 8,
      // mid-line escapes) \u2192 skip the hook, use the built-in ANSI-aware mode.
      const peeled = peelUniformSgr(text)
      if (peeled) {
        const raw = hook(peeled.core, width, makeTextMeasure(ctx))
        if (raw !== null) {
          const { text: result, markers } = normalizeHookResult(raw)
          // Clip-check on the PLAIN result before marker-styling + re-attaching
          // style, so the re-styled line never exceeds the box even if the hook
          // overran. Marker ranges are dropped when the result was clipped \u2014 the
          // hook's offsets no longer line up with the trimmed string.
          const overran = getTextWidth(result, ctx) > width
          const fitted = overran ? sliceFn(result, width) : result
          // Marker SGR opens the marker color; `reopenSgr` restores the line's
          // OWN style (the peeled prefix) after each marker so the surrounding
          // colored text keeps its color, never resetting to terminal default.
          const styled = overran
            ? fitted
            : applyMarkerRanges(fitted, markers, markerSgr, peeled.prefix)
          return peeled.prefix + styled + peeled.suffix
        }
      }
      // peeled === null OR hook returned null \u2192 fall through to built-in below.
    } else {
      const raw = hook(text, width, makeTextMeasure(ctx))
      if (raw !== null) {
        const { text: result, markers } = normalizeHookResult(raw)
        const overran = getTextWidth(result, ctx) > width
        if (overran) return sliceFn(result, width)
        // Plain (unstyled) line: restore to terminal default after each marker.
        return applyMarkerRanges(result, markers, markerSgr, SGR_RESET)
      }
      // result === null \u2192 fall through to the built-in mode behavior below.
    }
  }

  const ellipsis = "\u2026" // ...
  const availableWidth = width - 1 // Reserve space for ellipsis

  if (availableWidth <= 0) {
    return width > 0 ? styleMarker(ellipsis, markerSgr) : ""
  }

  // The built-in ellipsis is marker chrome. `styleMarker` wraps it with the
  // marker SGR (when set) + an SGR reset, so adjacent text (plain, or \u2014 in the
  // multi-run ANSI fall-through \u2014 text that re-opens its own SGR at the slice
  // boundary) is not painted with the marker color.
  const marker = styleMarker(ellipsis, markerSgr)

  if (mode === "end") {
    return sliceFn(text, availableWidth) + marker
  }

  if (mode === "start") {
    return marker + sliceEndFn(text, availableWidth)
  }

  // middle
  const halfWidth = Math.floor(availableWidth / 2)
  const startPart = sliceFn(text, halfWidth)
  const endPart = sliceEndFn(text, availableWidth - halfWidth)
  return startPart + marker + endPart
}

/** SGR reset \u2014 restores terminal default style. */
const SGR_RESET = "\x1b[0m"

/**
 * Normalize a {@link TextTruncateHook} return into `{ text, markers }`. A bare
 * string is `{ text }` with no markers (today's behavior). A
 * {@link TextTruncateResult} passes through.
 */
function normalizeHookResult(raw: string | TextTruncateResult): {
  text: string
  markers?: readonly { start: number; end: number }[]
} {
  if (typeof raw === "string") return { text: raw }
  return { text: raw.text, markers: raw.markers }
}

/**
 * Wrap the built-in ellipsis marker with marker-chrome SGR. When `markerSgr`
 * is empty (no/unresolvable `truncateMarkerColor`) the marker is returned
 * verbatim \u2014 byte-identical to the historical output. Otherwise the marker is
 * `markerSgr + marker + RESET` so it never bleeds color onto adjacent text.
 */
function styleMarker(marker: string, markerSgr: string): string {
  if (markerSgr === "") return marker
  return markerSgr + marker + SGR_RESET
}

/**
 * Style a trailing elision ellipsis as marker chrome — used by `wrap-truncate`,
 * whose wrapper inserts the "…" at the end of a force-truncated line. When the
 * line carries no inline ANSI, wraps a trailing "…" with marker SGR + reset.
 * Lines that already contain ANSI are left untouched (the wrap-truncate path is
 * fed plain text by render, so this is the common case) to avoid composing with
 * unknown trailing SGR. No-op when the line does not end in "…".
 */
function styleTrailingEllipsis(line: string, markerSgr: string): string {
  if (markerSgr === "" || hasAnsi(line) || !line.endsWith("…")) return line
  return line.slice(0, -1) + markerSgr + "…" + SGR_RESET
}

// ============================================================================
// Text Line Rendering
// ============================================================================

/**
 * Render a single line of text to the buffer.
 *
 * @param maxCol - Right edge of the text node's layout area. Wide characters
 *   whose continuation cell would exceed this boundary are replaced with a
 *   space, matching terminal behavior for wide chars at the screen edge.
 *   Without this, continuation cells overflow into adjacent containers and
 *   become stale during incremental rendering (the owning container's dirty
 *   tracking doesn't cover cells outside its layout bounds).
 */
export function renderTextLine(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  text: string,
  baseStyle: Style,
  maxCol?: number,
  inheritedBg?: Color,
  ctx?: PipelineContext,
  selectable = false,
): void {
  // Check if text contains ANSI escape sequences
  if (hasAnsi(text)) {
    renderAnsiTextLine(buffer, x, y, text, baseStyle, maxCol, inheritedBg, ctx, selectable)
    return
  }

  renderGraphemes(
    buffer,
    splitGraphemes(text),
    x,
    y,
    baseStyle,
    maxCol,
    inheritedBg,
    ctx,
    undefined,
    selectable,
  )
}

/**
 * Like renderTextLine but returns the column position after the last rendered character.
 * Used by renderText to know where to clear remaining cells.
 */
function renderTextLineReturn(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  text: string,
  baseStyle: Style,
  maxCol?: number,
  inheritedBg?: Color,
  ctx?: PipelineContext,
  minCol?: number,
  selectable = false,
  /**
   * Per-node bg-conflict policy from the owning Text node's `bgConflict`
   * prop. When set, it overrides the context / global `BgConflictMode`
   * for this line — used by `<Terminal>` to opt its external-ANSI cells
   * out of the throw.
   */
  bgConflictOverride?: BgConflictMode,
): number {
  if (hasAnsi(text)) {
    return renderAnsiTextLineReturn(
      buffer,
      x,
      y,
      text,
      baseStyle,
      maxCol,
      inheritedBg,
      ctx,
      minCol,
      selectable,
      bgConflictOverride,
    )
  }
  return renderGraphemes(
    buffer,
    splitGraphemes(text),
    x,
    y,
    baseStyle,
    maxCol,
    inheritedBg,
    ctx,
    minCol,
    selectable,
  )
}

/**
 * Render graphemes to buffer cells with proper Unicode handling.
 * Shared by renderTextLine (plain text) and renderAnsiTextLine (per-segment).
 *
 * @param maxCol - Right edge of the text node's layout area (exclusive).
 *   Wide characters whose continuation cell would reach or exceed this
 *   boundary are replaced with a space character. This matches terminal
 *   behavior for wide chars at the right edge of a container and prevents
 *   continuation cells from overflowing into adjacent containers, where
 *   they become stale during incremental rendering.
 * @param minCol - Left edge of the visible region (inclusive). Graphemes
 *   whose end position is at or before minCol are skipped (col still advances).
 *   Used to clip text that overflows the LEFT edge of an overflow:hidden
 *   container with a border (so the border isn't overwritten).
 *
 * Returns the column position after the last rendered grapheme.
 */
function renderGraphemes(
  buffer: TerminalBuffer,
  graphemes: string[],
  startCol: number,
  y: number,
  style: Style,
  maxCol?: number,
  inheritedBg?: Color,
  ctx?: PipelineContext,
  minCol?: number,
  selectable = false,
): number {
  const sink: RenderSink = createFrameSink(buffer)
  let col = startCol
  // Effective right boundary: text node's layout edge or buffer edge
  const rightEdge = maxCol !== undefined ? Math.min(maxCol, sink.width) : sink.width
  // Effective left boundary: max of clipBounds.left and 0 (no negative columns)
  const leftEdge = minCol !== undefined ? Math.max(minCol, 0) : 0
  const gWidthFn = ctx ? ctx.measurer.graphemeWidth : graphemeWidth

  for (const grapheme of graphemes) {
    if (col >= rightEdge) break

    const width = gWidthFn(grapheme)
    if (width === 0) continue

    // Skip graphemes whose end is still left of leftEdge (still advance col).
    // This clips text that overflows the LEFT edge of an overflow:hidden
    // container — without this, the text would overwrite the parent's left
    // border or padding cells.
    if (col + width <= leftEdge) {
      col += width
      continue
    }

    // Partial overlap: a wide grapheme straddling the left edge. Replace with
    // a space at leftEdge so the visible cell is preserved without the
    // grapheme's continuation cell extending outside the clip region.
    if (col < leftEdge) {
      // Skip this grapheme (the visible portion is its right cell which we
      // can't draw without the leading half). Advance to leftEdge.
      col = leftEdge
      // Don't draw a partial wide char — fall through to the next grapheme.
      continue
    }

    // Determine background color for this cell.
    // Priority: 1) Text's own bg, 2) inherited bg from ancestor Box, 3) null.
    // Using inherited bg instead of getCellBg decouples text rendering from buffer state,
    // which is critical for incremental rendering: the cloned buffer may have stale bg
    // at positions outside the parent's bg-filled region (e.g., overflow text).
    // Phase 2 Step 6 / paint-clear-l5-final Step 1b: the legacy `getCellBg`
    // fallback is removed. All in-walk callers (renderText) thread inheritedBg
    // explicitly; external callers (scroll indicators in render-box.ts) pass
    // `style.bg` directly so they never reach the inheritedBg branch.
    const existingBg = style.bg !== null ? style.bg : inheritedBg !== undefined ? inheritedBg : null

    // Wide character at the boundary: the continuation cell would overflow
    // into an adjacent container. Replace with a space to match terminal
    // behavior (real terminals leave the last column blank for wide chars
    // that don't fit). Without this, the continuation cell extends outside
    // the text node's layout bounds and becomes stale during incremental
    // rendering — the owning container's dirty flag tracking doesn't cover
    // cells outside its layout area.
    if (width === 2 && col + 1 >= rightEdge) {
      sink.emitSetCell(
        col,
        y,
        {
          char: " ",
          fg: style.fg,
          bg: existingBg,
          underlineColor: style.underlineColor ?? null,
          attrs: style.attrs,
          wide: false,
          continuation: false,
          hyperlink: style.hyperlink,
        },
        false,
      )
      col += 1
      continue
    }

    // For text-presentation emoji, add VS16 so terminals render at 2 columns
    const outputChar = width === 2 ? ensureEmojiPresentation(grapheme) : grapheme

    sink.emitSetCell(
      col,
      y,
      {
        char: outputChar,
        fg: style.fg,
        bg: existingBg,
        underlineColor: style.underlineColor ?? null,
        attrs: style.attrs,
        wide: width === 2,
        continuation: false,
        hyperlink: style.hyperlink,
      },
      selectable,
    )

    if (width === 2 && col + 1 < sink.width) {
      const existingBg2 =
        style.bg !== null ? style.bg : inheritedBg !== undefined ? inheritedBg : null
      sink.emitSetCell(
        col + 1,
        y,
        {
          char: "",
          fg: style.fg,
          bg: existingBg2,
          underlineColor: style.underlineColor ?? null,
          attrs: style.attrs,
          wide: false,
          continuation: true,
          hyperlink: style.hyperlink,
        },
        selectable,
      )
      col += 2
    } else {
      col += width
    }
  }

  return col
}

/**
 * Render text line with ANSI escape sequences.
 * Parses ANSI codes and applies styles to individual segments.
 */
export function renderAnsiTextLine(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  text: string,
  baseStyle: Style,
  maxCol?: number,
  inheritedBg?: Color,
  ctx?: PipelineContext,
  selectable = false,
): void {
  renderAnsiTextLineReturn(
    buffer,
    x,
    y,
    text,
    baseStyle,
    maxCol,
    inheritedBg,
    ctx,
    undefined,
    selectable,
  )
}

/**
 * Like renderAnsiTextLine but returns the column position after the last rendered character.
 */
function renderAnsiTextLineReturn(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  text: string,
  baseStyle: Style,
  maxCol?: number,
  inheritedBg?: Color,
  ctx?: PipelineContext,
  minCol?: number,
  selectable = false,
  /**
   * Per-node bg-conflict policy (the owning Text node's `bgConflict`
   * prop). Highest-precedence override: when set, it takes priority over
   * `ctx.bgConflictMode` and the module-global mode. `<Terminal>` passes
   * `"ignore"` here so its re-encoded external-ANSI cells are exempt from
   * the global throw, while real silvery-app pipeline bugs elsewhere
   * still throw.
   */
  bgConflictOverride?: BgConflictMode,
): number {
  const sink: RenderSink = createFrameSink(buffer)
  const segments = parseAnsiText(text)
  let col = x

  for (const segment of segments) {
    // Merge segment style with base style
    const style = mergeAnsiStyle(baseStyle, segment)

    // Detect background conflict: chalk.bg* overwrites existing silvery background
    // Check both: 1) Text's own backgroundColor, 2) inherited bg from ancestor Box.
    // Skip if segment has bgOverride flag (explicit opt-out via ansi.bgOverride).
    // Phase 2 Step 6 / paint-clear-l5-final Step 1b: the diagnostic now uses
    // `inheritedBg` (threaded from the render walk) instead of `buffer.getCellBg`,
    // matching the rendered-output bg priority chain (style.bg → inheritedBg → null).
    // Precedence: per-node `bgConflict` prop → context mode → global mode.
    const effectiveBgConflictMode = bgConflictOverride ?? ctx?.bgConflictMode ?? getBgConflictMode()
    if (
      effectiveBgConflictMode !== "ignore" &&
      !segment.bgOverride &&
      segment.bg !== undefined &&
      segment.bg !== null
    ) {
      // Check if there's an existing background (from Text prop or ancestor Box).
      const existingBufBg = inheritedBg !== undefined ? inheritedBg : null
      const hasExistingBg = baseStyle.bg !== null || existingBufBg !== null

      if (hasExistingBg) {
        const preview = segment.text.slice(0, 30)
        const chalkBg = formatBgConflictColor(segment.bg)
        const silveryBg =
          baseStyle.bg !== null
            ? `Text.bg=${formatBgConflictColor(baseStyle.bg)}`
            : `bufferBg=${formatBgConflictColor(existingBufBg)}`
        // Show a snippet of the raw ANSI text around the conflict for debugging
        const textPreview = text.length > 80 ? text.slice(0, 80) + "…" : text
        const msg = `[silvery] Background conflict at (${col},${y}): chalk bg=${chalkBg} on silvery ${silveryBg}. Text: "${preview}${segment.text.length > 30 ? "…" : ""}". Raw ANSI (first 80): ${JSON.stringify(textPreview)}. Chalk bg will override only text characters, causing visual gaps in padding. Use ansi.bgOverride() to suppress if intentional.`

        if (effectiveBgConflictMode === "throw") {
          throw new Error(msg)
        }
        // 'warn' mode - deduplicate
        const effectiveWarnedBgConflicts = ctx?.warnedBgConflicts ?? warnedBgConflicts
        const key = `${JSON.stringify(existingBufBg)}-${segment.bg}-${preview}`
        if (!effectiveWarnedBgConflicts.has(key)) {
          effectiveWarnedBgConflicts.add(key)
          log.warn?.(msg)
        }
      }
    }

    col = renderGraphemes(
      buffer,
      splitGraphemes(segment.text),
      col,
      y,
      style,
      maxCol,
      inheritedBg,
      ctx,
      minCol,
      selectable,
    )
  }
  return col
}

// ============================================================================
// Style Merging (Category-Based)
// ============================================================================

/**
 * Options for category-based style merging.
 */
export interface MergeStylesOptions {
  /**
   * Preserve decoration attributes through layers (OR merge).
   * Affects: underline, underlineStyle, underlineColor, strikethrough
   * Default: true
   */
  preserveDecorations?: boolean
  /**
   * Preserve emphasis attributes through layers (OR merge).
   * Affects: bold, dim, italic
   * Default: true
   */
  preserveEmphasis?: boolean
}

/**
 * Merge two styles using category-based semantics.
 *
 * Categories and their merge behavior:
 * - Container (bg): overlay replaces base
 * - Text (fg): overlay replaces base
 * - Decorations (underline*, strikethrough): OR merge if preserveDecorations=true
 * - Emphasis (bold, dim, italic): OR merge if preserveEmphasis=true
 * - Transform (inverse, hidden, blink): overlay only, not inherited
 *
 * @param base - The base style (from parent/container)
 * @param overlay - The overlay style (from child/content)
 * @param options - Merge behavior options
 */
export function mergeStyles(
  base: Style,
  overlay: Partial<Style>,
  options: MergeStylesOptions = {},
): Style {
  const { preserveDecorations = true, preserveEmphasis = true } = options

  const baseAttrs = base.attrs ?? {}
  const overlayAttrs = overlay.attrs ?? {}

  // Merge attributes by category
  const attrs: CellAttrs = {}

  // Decorations: OR if preserving, otherwise overlay takes precedence
  if (preserveDecorations) {
    // Underline: OR the boolean, but style from overlay wins if specified
    const hasBaseUnderline = baseAttrs.underline || baseAttrs.underlineStyle
    const hasOverlayUnderline = overlayAttrs.underline || overlayAttrs.underlineStyle
    if (hasBaseUnderline || hasOverlayUnderline) {
      attrs.underline = true
      // Style: overlay wins if specified, else base
      attrs.underlineStyle = overlayAttrs.underlineStyle ?? baseAttrs.underlineStyle ?? "single"
    }
    attrs.strikethrough = overlayAttrs.strikethrough || baseAttrs.strikethrough
    attrs.overline = overlayAttrs.overline || baseAttrs.overline
  } else {
    attrs.underline = overlayAttrs.underline ?? baseAttrs.underline
    attrs.underlineStyle = overlayAttrs.underlineStyle ?? baseAttrs.underlineStyle
    attrs.strikethrough = overlayAttrs.strikethrough ?? baseAttrs.strikethrough
    attrs.overline = overlayAttrs.overline ?? baseAttrs.overline
  }

  // Emphasis: OR if preserving
  if (preserveEmphasis) {
    attrs.bold = overlayAttrs.bold || baseAttrs.bold
    attrs.dim = overlayAttrs.dim || baseAttrs.dim
    attrs.italic = overlayAttrs.italic || baseAttrs.italic
  } else {
    attrs.bold = overlayAttrs.bold ?? baseAttrs.bold
    attrs.dim = overlayAttrs.dim ?? baseAttrs.dim
    attrs.italic = overlayAttrs.italic ?? baseAttrs.italic
  }

  // Transform: overlay only, not inherited from base
  attrs.inverse = overlayAttrs.inverse
  attrs.hidden = overlayAttrs.hidden
  attrs.blink = overlayAttrs.blink

  return {
    hyperlink: overlay.hyperlink ?? base.hyperlink,
    // Container/Text: overlay wins if specified
    fg: overlay.fg ?? base.fg,
    bg: overlay.bg ?? base.bg,
    // Underline color: always use overlay ?? base (part of decoration preservation)
    underlineColor: overlay.underlineColor ?? base.underlineColor,
    attrs,
  }
}

// ============================================================================
// ANSI Style Helpers
// ============================================================================

/**
 * Merge ANSI segment style with base style.
 * Uses category-based merging to preserve decorations and emphasis.
 */
function mergeAnsiStyle(
  base: Style,
  segment: StyledSegment,
  options: MergeStylesOptions = {},
): Style {
  const { preserveDecorations = true, preserveEmphasis = true } = options

  // Convert ANSI SGR codes to overlay style
  let fg: Color = base.fg
  let bg: Color = base.bg
  let underlineColor: Color = base.underlineColor ?? null

  if (segment.fg !== undefined && segment.fg !== null) {
    fg = ansiColorToColor(segment.fg)
  }
  if (segment.bg !== undefined && segment.bg !== null) {
    bg = ansiColorToColor(segment.bg)
  }
  if (segment.underlineColor !== undefined && segment.underlineColor !== null) {
    underlineColor = ansiColorToColor(segment.underlineColor)
  }

  // Build overlay attrs from segment
  const overlayAttrs: CellAttrs = {}
  if (segment.bold !== undefined) overlayAttrs.bold = segment.bold
  if (segment.dim !== undefined) overlayAttrs.dim = segment.dim
  if (segment.italic !== undefined) overlayAttrs.italic = segment.italic
  if (segment.underline !== undefined) {
    overlayAttrs.underline = segment.underline
  }
  if (segment.underlineStyle !== undefined) {
    overlayAttrs.underlineStyle = segment.underlineStyle as UnderlineStyle
  }
  if (segment.inverse !== undefined) overlayAttrs.inverse = segment.inverse
  if (segment.strikethrough !== undefined) overlayAttrs.strikethrough = segment.strikethrough
  if (segment.overline !== undefined) overlayAttrs.overline = segment.overline

  // Use mergeStyles for consistent category-based merging
  const merged = mergeStyles(
    base,
    { fg, bg, underlineColor, attrs: overlayAttrs },
    { preserveDecorations, preserveEmphasis },
  )

  // Pass through OSC 8 hyperlink from segment (not an SGR attribute)
  if (segment.hyperlink !== undefined) {
    merged.hyperlink = segment.hyperlink === INTERNAL_HYPERLINK_CLEAR ? "" : segment.hyperlink
  }

  return merged
}

/**
 * Convert ANSI SGR color code to our Color type.
 * Color is: number (256-color index) | { r, g, b } (true color) | null
 */
function ansiColorToColor(code: number): Color {
  // True color (packed RGB with 0x1000000 marker from parseAnsiText)
  if (code >= 0x1000000) {
    const r = (code >> 16) & 0xff
    const g = (code >> 8) & 0xff
    const b = code & 0xff
    return { r, g, b }
  }

  // 256 color palette index (0-255)
  if (code < 30 || (code >= 38 && code < 40) || (code >= 48 && code < 90)) {
    // Direct palette index (0-255) — return as-is
    return code
  }

  // Standard foreground colors (30-37) map to palette 0-7
  if (code >= 30 && code <= 37) {
    return code - 30
  }

  // Standard background colors (40-47) map to palette 0-7
  if (code >= 40 && code <= 47) {
    return code - 40
  }

  // Bright foreground colors (90-97) map to palette 8-15
  if (code >= 90 && code <= 97) {
    return code - 90 + 8
  }

  // Bright background colors (100-107) map to palette 8-15
  if (code >= 100 && code <= 107) {
    return code - 100 + 8
  }

  return null
}

// ============================================================================
// Render Text Node (Main Entry Point)
// ============================================================================

/**
 * Render a Text node.
 *
 * Background colors from nested Text elements are handled at the buffer level
 * (not via ANSI codes) to prevent bg bleed across wrapped text lines.
 * See km-silvery.bg-bleed for details.
 */
export function renderText(
  node: AgNode,
  buffer: TerminalBuffer,
  layout: { x: number; y: number; width: number; height: number },
  props: TextProps,
  nodeState: NodeRenderState,
  inheritedBg?: Color,
  inheritedFg?: Color,
  ctx?: PipelineContext,
  /**
   * Style-only restyle hint. When true AND the node is eligible (nested colored
   * runs, no nested bg, no own Text bg, no transform/truncate hook), the
   * per-segment restyle fast path updates existing cells in place and skips the
   * renderGraphemes loop. Falls back to the full render path when ineligible.
   * Returns true iff the fast path was taken (for instrumentation).
   */
  styleOnly = false,
): boolean {
  // Phase 2 Step 6.1: dimension reads route through sink instead of
  // buffer (buffer.width / buffer.height eliminated).
  const sink: RenderSink = createFrameSink(buffer)
  const { scrollOffset, clipBounds } = nodeState
  const { x, width, height } = layout
  let { y } = layout

  // Apply scroll offset
  y -= scrollOffset

  // Explicit backgroundColor="" on a Text node means "no background" — force
  // null bg to override both inherited bg from ancestor Boxes and any bg
  // already in the buffer cells (set by Box's renderBox fill). The sentinel
  // value `null` is used instead of `undefined` so renderGraphemes uses it
  // directly instead of falling back to buffer.getCellBg().
  if (props.backgroundColor === "") {
    inheritedBg = null
  }

  // Clip to bounds if specified
  if (clipBounds) {
    if (y + height <= clipBounds.top || y >= clipBounds.bottom) {
      return false // Completely outside vertical clip bounds
    }
    if (clipBounds.left !== undefined && clipBounds.right !== undefined) {
      if (x + width <= clipBounds.left || x >= clipBounds.right) {
        return false // Completely outside horizontal clip bounds
      }
    }
  }

  // --- PreparedText cache: Level 0 (plain text for maxDisplayWidth) ---
  // Compute DOM-level display width budget for truncate-end modes.
  // This limits how much text collectTextWithBg gathers BEFORE ANSI serialization,
  // making OSC 8 hyperlinks and other escape sequences safe by construction.
  let maxDisplayWidth: number | undefined
  const isTruncateEnd =
    props.wrap === false ||
    props.wrap === "truncate-end" ||
    props.wrap === "truncate" ||
    props.wrap === "clip"
  if (isTruncateEnd && width > 0) {
    const cachedPlain = getCachedPlainText(node)
    let lineCount: number
    if (cachedPlain) {
      lineCount = cachedPlain.lineCount
    } else {
      const plainText = collectPlainText(node)
      lineCount = (plainText.match(/\n/g)?.length ?? 0) + 1
      setCachedPlainText(node, plainText, lineCount)
    }
    // Keep enough overflow to prove the line needs ellipsizing. `width + 1`
    // works for ASCII, but wide graphemes can slice back to exactly `width`
    // before formatTextLines runs, making CJK overflow look like exact-fit
    // text. Terminal graphemes are at most two cells wide here, so +2 keeps
    // one extra visible grapheme without collecting unbounded hidden content.
    maxDisplayWidth = (width + 2) * lineCount
  }

  // --- PreparedText cache: Level 1 (collected styled text) ---
  // Collect text content and background segments from this node and all children.
  // Background color from nested Text elements is tracked as BgSegments
  // (not embedded as ANSI codes) to survive text wrapping correctly.
  let text: string
  let bgSegments: BgSegment[]
  let childSpans: ChildSpan[]

  // Seed the collection parent context with this Text's own effective props so
  // nested virtual <Text color="inherit"> children can resolve "inherit" /
  // "currentColor" back to the owner Text's color. Without this, virtual
  // children only see "{}" and keyword lookups produced no fg.
  // Normalize unified `underline: boolean | UnderlineStyleName` prop.
  // Precedence matches getTextStyle / AdapterStyleContext:
  //   1. underlineStyle (deprecated) wins when set
  //   2. underline: "string" → both boolean + style name
  //   3. underline: true → boolean only (style name undefined)
  let rootUnderline: boolean | undefined
  let rootUnderlineStyle: string | false | undefined
  if (props.underlineStyle !== undefined) {
    rootUnderline = props.underlineStyle !== false
    rootUnderlineStyle = props.underlineStyle
  } else if (typeof props.underline === "string") {
    rootUnderline = true
    rootUnderlineStyle = props.underline
  } else if (props.underline !== undefined) {
    rootUnderline = props.underline
  }

  const rootContext: StyleContext = {
    hyperlink: props.internal_hyperlink,
    color: props.color,
    backgroundColor: props.backgroundColor,
    bold: props.bold,
    dim: props.internal_dim,
    italic: props.italic,
    underline: rootUnderline,
    underlineStyle: rootUnderlineStyle,
    underlineColor: props.underlineColor,
    overline: props.overline,
    inverse: props.inverse,
    strikethrough: props.strikethrough,
  }

  // Pass the active context theme as a cache key so that $token ANSI codes
  // embedded in collected text are invalidated when the nearest-ancestor
  // ThemeProvider changes its theme. Without this, a theme change would leave
  // stale ANSI-encoded token colors in the cache (e.g., $fg-accent → blue from
  // the first render), causing the new theme's green to be overridden.
  const contextTheme = getActiveTheme()
  const nestedUserSelectOverride = hasNestedUserSelectOverride(node)
  const cachedCollected = nestedUserSelectOverride
    ? null
    : getCachedCollectedText(node, maxDisplayWidth, contextTheme)
  if (cachedCollected) {
    text = cachedCollected.text
    bgSegments = cachedCollected.bgSegments as BgSegment[]
    childSpans = cachedCollected.childSpans as ChildSpan[]
  } else {
    const collected = collectTextWithBg(node, rootContext, 0, maxDisplayWidth, ctx)
    text = collected.text
    bgSegments = collected.bgSegments
    childSpans = collected.childSpans
    setCachedCollectedText(node, collected, maxDisplayWidth, contextTheme)
  }

  // Get style for this Text node.
  // Inherit foreground from nearest ancestor Box with color prop (CSS semantics).
  const style = getTextStyle(props, ctx?.colorLevel)
  style.hyperlink = props.internal_hyperlink
  if (style.fg === null && inheritedFg !== undefined) {
    style.fg = inheritedFg
  }
  // underlineColor="currentColor"/"inherit" tracks the text's resolved fg.
  // getTextStyle already produced style.underlineColor = null for the keyword
  // (parseColor("currentColor") === null). Upgrade it here — AFTER fg
  // inheritance has been applied — so the underline matches the visible text.
  if (props.underlineColor === "currentColor" || props.underlineColor === "inherit") {
    style.underlineColor = style.fg
  }

  // --- PreparedText cache: Level 2 (formatted lines per width) ---
  // When text has background color, preserve trailing spaces so bg covers them.
  const hasBg =
    style.bg !== null ||
    bgSegments.length > 0 ||
    (inheritedBg !== undefined && inheritedBg !== null)
  const trim = !hasBg
  const internalTransform = props.internal_transform
  const truncateHook = props.truncate
  // Elision-marker chrome color. Defaults to "$fg-muted" so the inserted "…"
  // (and hook-returned marker ranges) read as quiet chrome, not content.
  // "$fg-muted" is the codebase's standard low/dim fg slot (e.g. StatusGlyph
  // lowColor); it has to stay distinct from "$fg" or the marker would never dim
  // against $fg-colored text. Resolved against the active theme at paint time via
  // parseColor (same path as the `color` prop). A theme change invalidates the
  // collected-text cache (which keys on contextTheme), which clears the format
  // cache — so the embedded marker SGR is recomputed with the new token value.
  const markerSgr = resolveMarkerSgr(props.truncateMarkerColor ?? "$fg-muted", ctx?.colorLevel)

  let lines: string[]
  let lineOffsets: Array<{ start: number; end: number }>
  // Per-line break classification (soft-space | soft-break | hard | end) used
  // to produce row metadata for copy-selection soft-wrap rejoining. Computed
  // once per (node, width, wrap, trim) and replayed from the format cache so
  // STRICT incremental≡fresh holds (rowMeta must be identical every render).
  let lineBreaks: LineBreakKind[]

  // Skip format cache when internal_transform OR a truncate hook is present —
  // both are functions that may depend on external state and have unstable
  // identity (the (node, width, wrap, trim) cache key can't capture them).
  const bypassFormatCache = !!internalTransform || !!truncateHook
  const cachedFmt = !bypassFormatCache ? getCachedFormat(node, width, props.wrap, trim) : null
  if (cachedFmt) {
    lines = cachedFmt.lines
    lineOffsets = cachedFmt.hasLineOffsets ? cachedFmt.lineOffsets : []
    lineBreaks = cachedFmt.lineBreaks as LineBreakKind[]
  } else {
    lines = formatTextLines(text, width, props.wrap, ctx, trim, truncateHook, markerSgr)
    if (internalTransform) {
      lines = lines.map((line, index) => internalTransform(line, index))
    }
    const needLineOffsets = bgSegments.length > 0 || childSpans.length > 0
    lineOffsets = needLineOffsets ? mapLinesToCharOffsets(text, lines, ctx) : []
    // internal_transform can produce lines that don't exist in the original
    // text (e.g. injected markers), so break classification by matching back
    // into `text` is meaningless there — every line falls through to the
    // last-line "end" / non-match path. Skip it; those nodes get the default
    // not-soft-wrapped metadata, which is correct (transforms are single-line
    // chrome, not wrapped prose).
    // A truncate hook (like internal_transform) can emit lines that don't
    // appear verbatim in `text` (custom separators), so break classification by
    // matching back into `text` is meaningless — skip it and don't cache.
    lineBreaks = bypassFormatCache ? [] : classifyLineBreaks(text, lines)
    if (!bypassFormatCache) {
      setCachedFormat(
        node,
        width,
        props.wrap,
        trim,
        lines,
        lineOffsets,
        needLineOffsets,
        lineBreaks,
      )
    }
  }

  // ── Style-only restyle fast path ──────────────────────────────────────────
  // When only visual style props changed (styleOnly) and the node is a nested
  // colored run with no nested bg and no own Text bg, restyle existing cells in
  // place PER CHILD SPAN instead of running the renderGraphemes loop. The cloned
  // buffer already holds the correct chars (content is identical on a style-only
  // change). Each child span's resolved style is computed the SAME way the full
  // path resolves its cells, so SILVERY_STRICT incremental≡fresh holds.
  //
  // Gated to childSpans.length > 0 (nested runs): plain text has no child spans,
  // and its base cells go through renderGraphemes (which keeps base transform
  // attrs like `inverse`) rather than mergeAnsiStyle (which drops them) — so a
  // plain-text restyle would diverge from fresh. Nested runs always render via
  // the ANSI path, where gap + run cells both go through mergeAnsiStyle.
  // Truncation inserts a colored elision marker ("…") as a CONTENT cell (not a
  // child span). The per-segment restyle would recolor it as base text, so skip
  // the fast path whenever an ellipsis-inserting wrap mode actually overflowed.
  // `clip`/`hard` slice without a marker, so they are always safe.
  const ellipsisMode =
    props.wrap === false ||
    props.wrap === "truncate" ||
    props.wrap === "truncate-end" ||
    props.wrap === "truncate-start" ||
    props.wrap === "truncate-middle" ||
    props.wrap === "wrap-truncate"
  const mayHaveMarker = ellipsisMode && getTextWidth(text, ctx) > width
  if (
    styleOnly &&
    childSpans.length > 0 &&
    bgSegments.length === 0 &&
    style.bg === null &&
    props.backgroundColor !== "" &&
    !internalTransform &&
    !truncateHook &&
    !mayHaveMarker &&
    !nestedUserSelectOverride &&
    lineOffsets.length > 0
  ) {
    restyleTextSegments(
      sink,
      x,
      y,
      width,
      Math.min(lines.length, height),
      style,
      inheritedBg,
      childSpans,
      lineOffsets,
      clipBounds,
      ctx?.colorLevel,
    )
    // inlineRects geometry is unchanged on a style-only render, but recompute so
    // hit-testing stays consistent with the full path.
    if (lineOffsets.length > 0) {
      computeInlineRects(childSpans, lineOffsets, x, y, lines.length, height)
    }
    return true
  }

  // Render each line
  for (let lineIdx = 0; lineIdx < lines.length && lineIdx < height; lineIdx++) {
    const lineY = y + lineIdx
    // Skip lines outside clip bounds
    if (clipBounds && (lineY < clipBounds.top || lineY >= clipBounds.bottom)) {
      continue
    }
    const line = lines[lineIdx]!

    // Pass maxCol to prevent wide characters from overflowing into adjacent
    // containers. Without this, continuation cells outside the text node's
    // layout bounds become stale during incremental rendering.
    // Clip right edge to horizontal clip bounds (overflow:hidden containers).
    // When internal_transform is active, expand maxCol to buffer width so the
    // transformed text (which may be wider than the original layout) is not clipped.
    const layoutRight = internalTransform ? sink.width : x + width
    const maxCol =
      clipBounds && "right" in clipBounds && clipBounds.right !== undefined
        ? Math.min(layoutRight, clipBounds.right)
        : layoutRight
    // Clip left edge to horizontal clip bounds. Without this, text rendered
    // by a node whose x is BEFORE the parent's clip-left (e.g., negative
    // marginLeft inside an overflow:hidden container with a border) would
    // overwrite the parent's left border or padding cells.
    const minCol =
      clipBounds && "left" in clipBounds && clipBounds.left !== undefined
        ? clipBounds.left
        : undefined
    const lineTextForSelection = hasAnsi(line) ? stripAnsiForBg(line) : line
    const lineHasContent = /\S/.test(lineTextForSelection)
    const lineSelectable = nodeState.selectableMode && lineHasContent
    const endCol = renderTextLineReturn(
      buffer,
      x,
      lineY,
      line,
      style,
      maxCol,
      inheritedBg,
      ctx,
      minCol,
      lineSelectable,
      props.bgConflict,
    )

    // Row metadata for copy-selection: soft-wrap rejoining + trailing-space
    // trimming. ALWAYS write so stale metadata from a prior frame (the cloned
    // buffer carries it forward) is overwritten on every render.
    //   - lastContentCol: rightmost content column. endCol is the col AFTER the
    //     last written char; subtract 1. An empty line wrote nothing (endCol ==
    //     x), so report -1 ("no content") to match the buffer default and the
    //     consumer's trailing-trim contract — never x-1, which would claim
    //     phantom content.
    //   - softWrapped / wrapJoinSpace: from the precomputed break classification
    //     (soft-space → join with a space; soft-break → join with nothing;
    //     hard/end → not soft-wrapped, keep the newline).
    const lastContentCol = lineHasContent ? endCol - 1 : -1
    const breakKind = lineBreaks[lineIdx]
    const softWrapped = breakKind === "soft-space" || breakKind === "soft-break"
    sink.setRowMeta(lineY, {
      softWrapped,
      lastContentCol,
      wrapJoinSpace: breakKind === "soft-space",
    })

    // Clear remaining cells after text to end of layout width (clipped).
    // When text content shrinks (e.g., breadcrumb changes from long to short path),
    // the parent Box may skip its bg fill (skipBgFill=true when only subtreeDirty).
    // Without explicit clearing here, stale chars from the previous longer text
    // survive in the cloned buffer. This is safe: we only clear within our own
    // layout area, writing spaces with the correct inherited background.
    // Respect minCol so we don't clear cells inside the parent's left border.
    //
    // Phase 2 Step 4c: routes through sink.emitClearCells (intent: clear stale
    // pixels in the trailing cells of a shrunk text node — destructive).
    // Cleared whitespace is background-only: fresh renders get these cells from
    // ancestor background fills, which have no foreground.
    const clearStart = minCol !== undefined ? Math.max(endCol, minCol) : endCol
    if (clearStart < maxCol) {
      const clearBg = inheritedBg ?? null
      const clearCell = {
        char: " ",
        fg: null,
        bg: clearBg,
        underlineColor: null,
        attrs: {
          bold: false,
          dim: false,
          italic: false,
          underline: false,
          overline: false,
          inverse: false,
          strikethrough: false,
          blink: false,
          hidden: false,
        },
        wide: false,
        continuation: false,
      }
      for (let cx = clearStart; cx < maxCol && cx < sink.width; cx++) {
        sink.emitClearCells(cx, lineY, 1, 1, clearCell)
      }
    }

    // Apply background segments from nested Text elements to the buffer.
    // This happens after renderTextLine so the bg is applied to cells
    // that already have the correct character/fg/attrs written.
    // Pass maxCol/minCol so bg paint clips to the same visible region as
    // renderGraphemes — without this, bg leaks past the parent's
    // overflow=hidden border into the empty area beyond the card (the
    // cyan-strip residue bug, km-silvery.render-light-blue-bg-strip-residue).
    if (bgSegments.length > 0 && lineIdx < lineOffsets.length) {
      const { start, end } = lineOffsets[lineIdx]!
      applyBgSegmentsToLine(
        buffer,
        x,
        lineY,
        line,
        start,
        end,
        bgSegments,
        ctx,
        maxCol,
        minCol,
        lineSelectable,
      )
    }
    if (childSpans.length > 0 && lineIdx < lineOffsets.length) {
      const { start, end } = lineOffsets[lineIdx]!
      applySelectableSpansToLine(
        buffer,
        x,
        lineY,
        line,
        start,
        end,
        childSpans,
        lineHasContent,
        ctx,
        maxCol,
        minCol,
      )
    }
  }

  // Compute inlineRects for virtual text children.
  // Maps each child's display-width span to screen-space rectangles,
  // accounting for text wrapping (one rect per line fragment).
  if (childSpans.length > 0 && lineOffsets.length > 0) {
    computeInlineRects(childSpans, lineOffsets, x, y, lines.length, height)
  }
  return false
}

/**
 * Empty ANSI segment — `mergeAnsiStyle(base, EMPTY)` yields the style the full
 * render path gives a NON-styled run (parent's own text / gap cells): emphasis
 * + decorations preserved from base, transform attrs (inverse/hidden/blink)
 * dropped. This matches `renderAnsiTextLineReturn`'s treatment of an
 * unstyled segment, which is what the gap cells go through when childSpans>0.
 */
const EMPTY_ANSI_SEGMENT: StyledSegment = { text: "" }

/** All-false attrs, matching the trailing clear-cell written by renderText. */
const CLEAR_ATTRS: CellAttrs = {
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  overline: false,
  inverse: false,
  strikethrough: false,
  blink: false,
  hidden: false,
}

/**
 * Resolve a child run's final cell style EXACTLY as the full render path does:
 * `mergeAnsiStyle(baseStyle, parse(styleToAnsi(childContext)))`. The full path
 * wraps the child's text in `styleToAnsi(childContext)` (applyTextStyleAnsi),
 * parseAnsiText turns it into a StyledSegment, and renderAnsiTextLineReturn
 * merges it over baseStyle. We reproduce that per span (once, not per grapheme).
 */
function resolveSpanStyle(
  baseStyle: Style,
  context: StyleContext,
  colorLevel?: ActiveColorLevel,
): Style {
  const ansi = styleToAnsi(context, colorLevel)
  if (!ansi) return mergeAnsiStyle(baseStyle, EMPTY_ANSI_SEGMENT)
  // Append a sentinel char so parseAnsiText emits a segment carrying the SGR.
  const segs = parseAnsiText(ansi + " ")
  return mergeAnsiStyle(baseStyle, segs[0] ?? EMPTY_ANSI_SEGMENT)
}

/**
 * Per-segment style-only restyle. Updates fg/attrs of existing cells in place
 * (chars/wide/continuation/hyperlink/selectable preserved by restyleRegion),
 * skipping collectTextWithBg→formatTextLines→renderGraphemes.
 *
 * Three cell categories, matching what the full render path paints:
 *   1. parent's own text + interior spaces → `contentStyle` (base ⊕ empty seg)
 *   2. trailing pad after a line's content  → background-only, no attrs
 *   3. each nested run's cells              → `resolveSpanStyle(base, ctx)`
 *
 * Applied in z-order: content fill first, then trailing, then runs on top
 * (outer-before-inner, the childSpans array order from collectTextWithBg).
 *
 * Caller guarantees: style.bg === null and bgSegments empty, so bg is uniform
 * (`effectiveBg`) across every cell.
 */
function restyleTextSegments(
  sink: RenderSink,
  x: number,
  y: number,
  width: number,
  rowCount: number,
  baseStyle: Style,
  inheritedBg: Color | undefined,
  childSpans: ChildSpan[],
  lineOffsets: Array<{ start: number; end: number }>,
  clipBounds?: ClipBounds,
  colorLevel?: ActiveColorLevel,
): void {
  const effectiveBg: Color = baseStyle.bg !== null ? baseStyle.bg : (inheritedBg ?? null)
  const contentStyle = mergeAnsiStyle(baseStyle, EMPTY_ANSI_SEGMENT)
  const layoutRight = x + width
  // Horizontal clip mirrors renderText's maxCol/minCol.
  const maxCol =
    clipBounds?.right !== undefined ? Math.min(layoutRight, clipBounds.right) : layoutRight
  const minCol = clipBounds?.left !== undefined ? clipBounds.left : undefined
  const leftClip = minCol !== undefined ? Math.max(minCol, 0) : 0

  // Route through the sink (not buffer) so the op is captured into the render
  // plan under SILVERY_RENDER_PLAN — a direct buffer write is dropped when
  // commitSectionedPlan replays the plan onto a fresh frame buffer.
  const restyle = (col: number, row: number, w: number, s: Style): void => {
    const left = Math.max(col, leftClip)
    const right = Math.min(col + w, maxCol)
    if (right > left) sink.emitRestyleRegion(left, row, right - left, 1, s)
  }

  for (let row = 0; row < rowCount; row++) {
    const lineY = y + row
    if (clipBounds && (lineY < clipBounds.top || lineY >= clipBounds.bottom)) continue
    const lo = lineOffsets[row]
    if (!lo) continue
    const contentRight = x + (lo.end - lo.start)
    // 1. content fill (parent's own text + interior spaces)
    restyle(x, lineY, contentRight - x, {
      fg: contentStyle.fg,
      bg: effectiveBg,
      underlineColor: contentStyle.underlineColor ?? null,
      attrs: contentStyle.attrs,
    })
    // 2. trailing pad → background-only, no attrs (matches renderText's clear cell)
    restyle(contentRight, lineY, maxCol - contentRight, {
      fg: null,
      bg: effectiveBg,
      underlineColor: null,
      attrs: CLEAR_ATTRS,
    })
  }

  // 3. nested runs on top (outer-before-inner)
  for (const span of childSpans) {
    const runStyle = resolveSpanStyle(baseStyle, span.context, colorLevel)
    const applied: Style = {
      fg: runStyle.fg,
      bg: effectiveBg,
      underlineColor: runStyle.underlineColor ?? null,
      attrs: runStyle.attrs,
    }
    for (let row = 0; row < rowCount; row++) {
      const lineY = y + row
      if (clipBounds && (lineY < clipBounds.top || lineY >= clipBounds.bottom)) continue
      const lo = lineOffsets[row]
      if (!lo) continue
      const overlapStart = Math.max(span.start, lo.start)
      const overlapEnd = Math.min(span.end, lo.end)
      if (overlapStart >= overlapEnd) continue
      const sx = x + (overlapStart - lo.start)
      restyle(sx, lineY, overlapEnd - overlapStart, applied)
    }
  }
}

/**
 * Compute inlineRects for virtual text children based on their display-width spans
 * and the formatted line offsets. For wrapped text, a child may span multiple lines,
 * producing one rect per line fragment.
 *
 * @param childSpans - Virtual text children with their display-width ranges
 * @param lineOffsets - Display-width offset ranges for each formatted line
 * @param parentX - Screen X of the parent Text node
 * @param parentY - Screen Y of the parent Text node (after scroll offset)
 * @param lineCount - Number of formatted lines
 * @param maxHeight - Maximum height (layout height) of the parent Text node
 */
function computeInlineRects(
  childSpans: ChildSpan[],
  lineOffsets: Array<{ start: number; end: number }>,
  parentX: number,
  parentY: number,
  lineCount: number,
  maxHeight: number,
): void {
  for (const span of childSpans) {
    const rects: Array<{ x: number; y: number; width: number; height: number }> = []

    for (let lineIdx = 0; lineIdx < lineCount && lineIdx < maxHeight; lineIdx++) {
      const lineOffset = lineOffsets[lineIdx]
      if (!lineOffset) continue

      // Check overlap between span [span.start, span.end) and line [lineOffset.start, lineOffset.end)
      const overlapStart = Math.max(span.start, lineOffset.start)
      const overlapEnd = Math.min(span.end, lineOffset.end)
      if (overlapStart >= overlapEnd) continue

      // Convert to screen coordinates
      const rectX = parentX + (overlapStart - lineOffset.start)
      const rectY = parentY + lineIdx
      const rectWidth = overlapEnd - overlapStart

      rects.push({ x: rectX, y: rectY, width: rectWidth, height: 1 })
    }

    span.node.inlineRects = rects.length > 0 ? rects : null
  }
}
