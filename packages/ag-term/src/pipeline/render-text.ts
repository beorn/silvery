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
import type { AgNode, TextProps } from "@silvery/ag/types"
import {
  type StyledSegment,
  ensureEmojiPresentation,
  graphemeWidth,
  hasAnsi,
  parseAnsiText,
  sliceByWidth,
  sliceByWidthFromEnd,
  splitGraphemes,
  wrapText,
} from "../unicode"
import { collectPlainText } from "./collect-text"
import { getTextStyle, getTextWidth, parseColor } from "./render-helpers"
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
import type { BgConflictMode, NodeRenderState, PipelineContext } from "./types"
import { createLogger } from "loggily"

const log = createLogger("silvery:content")

// ============================================================================
// Background Conflict Detection
// ============================================================================

/** Cached bg conflict mode. Read from env once at module load. */
let bgConflictMode: BgConflictMode = (() => {
  const env = typeof process !== "undefined" ? process.env.SILVERY_BG_CONFLICT?.toLowerCase() : undefined
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
function formatBgConflictColor(c: number | { r: number; g: number; b: number } | null | undefined): string {
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
  color?: string
  backgroundColor?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  underlineStyle?: string | false
  underlineColor?: string
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
function styleToAnsi(style: StyleContext): string {
  const parts: string[] = []

  // Foreground color - use parseColor directly instead of roundtripping through getTextStyle
  if (style.color) {
    const color = parseColor(style.color)
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
  if (style.bold) parts.push("1")
  if (style.dim) parts.push("2")
  if (style.italic) parts.push("3")
  // Underline: prefer underlineStyle (SGR 4:x subparam) over boolean (SGR 4)
  if (style.underlineStyle) {
    const styleMap: Record<string, string> = {
      single: "4:1",
      double: "4:2",
      curly: "4:3",
      dotted: "4:4",
      dashed: "4:5",
    }
    parts.push(styleMap[style.underlineStyle] ?? "4")
  } else if (style.underline) {
    parts.push("4")
  }
  // Underline color (SGR 58;5;N or 58;2;r;g;b)
  if (style.underlineColor) {
    const ulColor = parseColor(style.underlineColor)
    if (ulColor !== null) {
      if (typeof ulColor === "number") {
        parts.push(`58;5;${ulColor}`)
      } else {
        parts.push(`58;2;${ulColor.r};${ulColor.g};${ulColor.b}`)
      }
    }
  }
  if (style.inverse) parts.push("7")
  if (style.strikethrough) parts.push("9")

  if (parts.length === 0) {
    return ""
  }

  return `\x1b[${parts.join(";")}m`
}

/**
 * Merge child props into parent context.
 * Child values override parent values when specified.
 */
function mergeStyleContext(parent: StyleContext, childProps: TextProps): StyleContext {
  return {
    color: childProps.color ?? parent.color,
    backgroundColor: childProps.backgroundColor ?? parent.backgroundColor,
    bold: childProps.bold ?? parent.bold,
    dim: childProps.dim ?? childProps.dimColor ?? parent.dim,
    italic: childProps.italic ?? parent.italic,
    underline: (childProps.underline ?? (childProps as any).underlineStyle) ? true : parent.underline,
    underlineStyle: (childProps as any).underlineStyle ?? parent.underlineStyle,
    underlineColor: (childProps as any).underlineColor ?? parent.underlineColor,
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
function applyTextStyleAnsi(text: string, childStyle: StyleContext, parentStyle: StyleContext): string {
  if (!text) {
    return text
  }

  const childAnsi = styleToAnsi(childStyle)
  const parentAnsi = styleToAnsi(parentStyle)

  // If child has no style changes, just return text
  if (!childAnsi) {
    return text
  }

  // Apply child style, then reset and re-apply parent style
  // We use \x1b[0m to reset, then re-apply parent styles
  return `${childAnsi}${text}\x1b[0m${parentAnsi}`
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
export function collectTextContent(node: AgNode, parentContext: StyleContext = {}): string {
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
      let childContent = collectTextContent(child, childContext)
      // Apply internal_transform from virtual text nodes (nested Transform components).
      // Matches Ink's squashTextNodes: transform is applied to the full concatenated
      // text of the child, with index = child position in parent's children array.
      const childTransform = (childProps as any).internal_transform
      if (childTransform && childContent.length > 0) {
        childContent = childTransform(childContent, i)
      }
      // Apply styles with proper push/pop (child style, then restore parent)
      result += applyTextStyleAnsi(childContent, childContext, parentContext)
    } else {
      // Not a styled Text node, just collect recursively
      result += collectTextContent(child, parentContext)
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
    const childBudget = maxDisplayWidth !== undefined ? maxDisplayWidth - displayWidthCollected : undefined

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
      const styledText = applyTextStyleAnsi(childResult.text, childContext, parentContext)
      result += styledText

      // Track bg segment if this child (or its ancestors) has backgroundColor.
      // When backgroundColor is "" (empty string), create a null-bg segment to
      // explicitly clear inherited background (e.g., from a parent Box).
      if (childContext.backgroundColor) {
        const bg = parseColor(childContext.backgroundColor)
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

      // Track child span for inlineRects computation
      if (childResult.plainLen > 0) {
        childSpans.push({
          node: child,
          start: currentOffset,
          end: currentOffset + childResult.plainLen,
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
): void {
  if (bgSegments.length === 0) return
  if (y < 0 || y >= buffer.height) return

  // Reusable cell for readCellInto to avoid per-character allocation
  const bgCell = createMutableCell()
  const gWidthFn = ctx ? ctx.measurer.graphemeWidth : graphemeWidth

  // For each bg segment that overlaps this line's character range,
  // calculate the screen columns and fill the bg
  for (const seg of bgSegments) {
    // Check overlap between segment [seg.start, seg.end) and line [lineCharStart, lineCharEnd)
    const overlapStart = Math.max(seg.start, lineCharStart)
    const overlapEnd = Math.min(seg.end, lineCharEnd)
    if (overlapStart >= overlapEnd) continue

    // Convert display-width offsets to column positions within the line.
    // BgSegment offsets and lineCharStart/lineCharEnd are all in display-width
    // coordinates, so relStart/relEnd are display-width offsets within the line.
    const relStart = overlapStart - lineCharStart
    const relEnd = overlapEnd - lineCharStart

    // Walk through the line's visible characters to find screen columns.
    // Use display-width offset (col - x) to match BgSegment coordinate system.
    let col = x
    const graphemes = splitGraphemes(hasAnsi(lineText) ? stripAnsiForBg(lineText) : lineText)

    for (const grapheme of graphemes) {
      const gWidth = gWidthFn(grapheme)
      if (gWidth === 0) continue

      const displayOffset = col - x
      if (displayOffset >= relStart && displayOffset < relEnd) {
        // This character is within the bg segment -- set bg on its cells.
        // Use readCellInto to avoid allocating a new Cell per iteration.
        buffer.readCellInto(col, y, bgCell)
        bgCell.bg = seg.bg
        buffer.setCell(col, y, bgCell)
        if (gWidth === 2 && col + 1 < buffer.width) {
          buffer.readCellInto(col + 1, y, bgCell)
          bgCell.bg = seg.bg
          buffer.setCell(col + 1, y, bgCell)
        }
      }

      col += gWidth
      if (col - x >= relEnd) break
    }
  }
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

// ============================================================================
// Text Formatting
// ============================================================================

/**
 * Format text into lines based on wrap mode.
 *
 * @param trim - When true, trims trailing spaces on broken lines and skips leading
 *   spaces on continuation lines. When false (e.g., text has backgroundColor),
 *   preserves trailing spaces so background color covers them. Defaults to true.
 */
export function formatTextLines(
  text: string,
  width: number,
  wrap: TextProps["wrap"],
  ctx?: PipelineContext,
  trim = true,
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
    const sliceFn = ctx ? ctx.measurer.sliceByWidth : sliceByWidth
    const out: string[] = []
    for (const line of lines) {
      if (line === "") {
        out.push("")
        continue
      }
      let remaining = line
      // Guard against infinite loops when sliceByWidth cannot advance
      // (e.g., a single grapheme wider than `width`). In that case, push
      // the remaining text as-is and break.
      while (getTextWidth(remaining, ctx) > width) {
        const head = sliceFn(remaining, width)
        if (head.length === 0) break
        out.push(head)
        remaining = remaining.slice(head.length)
      }
      out.push(remaining)
    }
    return out
  }

  // No wrapping, just truncate at end
  if (wrap === false || wrap === "truncate-end" || wrap === "truncate") {
    return lines.map((line) => truncateText(line, width, "end", ctx))
  }

  if (wrap === "truncate-start") {
    return lines.map((line) => truncateText(line, width, "start", ctx))
  }

  if (wrap === "truncate-middle") {
    return lines.map((line) => truncateText(line, width, "middle", ctx))
  }

  // Optimal wrapping (Knuth-Plass): minimize total raggedness across all lines.
  // Uses dynamic programming over breakpoints for globally optimal line breaks.
  if (wrap === "optimal") {
    const gWidthFn = ctx?.measurer?.graphemeWidth?.bind(ctx.measurer) ?? graphemeWidth
    const analysis = buildTextAnalysis(normalizedText, gWidthFn)
    return optimalWrap(normalizedText, analysis, width)
  }

  // Balanced wrapping: equalize line widths by tightening to balanced width.
  // Uses Pretext analysis to find the width that distributes text most evenly.
  if (wrap === "balanced") {
    const gWidthFn = ctx?.measurer?.graphemeWidth?.bind(ctx.measurer) ?? graphemeWidth
    const analysis = buildTextAnalysis(normalizedText, gWidthFn)
    const bWidth = computeBalancedWidth(analysis, width)
    if (ctx) return ctx.measurer.wrapText(normalizedText, bWidth, true, trim)
    return wrapText(normalizedText, bWidth, true, trim)
  }

  // wrap === true or wrap === 'wrap' - word-aware wrapping
  // Uses wrapText from unicode.ts with trim for rendering
  // (when trim=true, trims trailing spaces on broken lines, skips leading spaces
  // on continuation lines; when trim=false, preserves spaces for bg-colored text)
  if (ctx) return ctx.measurer.wrapText(normalizedText, width, true, trim)
  return wrapText(normalizedText, width, true, trim)
}

/**
 * Truncate text to fit within width.
 */
export function truncateText(
  text: string,
  width: number,
  mode: "start" | "middle" | "end",
  ctx?: PipelineContext,
): string {
  const textWidth = getTextWidth(text, ctx)
  if (textWidth <= width) return text

  const ellipsis = "\u2026" // ...
  const availableWidth = width - 1 // Reserve space for ellipsis

  if (availableWidth <= 0) {
    return width > 0 ? ellipsis : ""
  }

  const sliceFn = ctx ? ctx.measurer.sliceByWidth : sliceByWidth
  const sliceEndFn = ctx ? ctx.measurer.sliceByWidthFromEnd : sliceByWidthFromEnd

  if (mode === "end") {
    return sliceFn(text, availableWidth) + ellipsis
  }

  if (mode === "start") {
    return ellipsis + sliceEndFn(text, availableWidth)
  }

  // middle
  const halfWidth = Math.floor(availableWidth / 2)
  const startPart = sliceFn(text, halfWidth)
  const endPart = sliceEndFn(text, availableWidth - halfWidth)
  return startPart + ellipsis + endPart
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
): void {
  // Check if text contains ANSI escape sequences
  if (hasAnsi(text)) {
    renderAnsiTextLine(buffer, x, y, text, baseStyle, maxCol, inheritedBg, ctx)
    return
  }

  renderGraphemes(buffer, splitGraphemes(text), x, y, baseStyle, maxCol, inheritedBg, ctx)
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
): number {
  if (hasAnsi(text)) {
    return renderAnsiTextLineReturn(buffer, x, y, text, baseStyle, maxCol, inheritedBg, ctx, minCol)
  }
  return renderGraphemes(buffer, splitGraphemes(text), x, y, baseStyle, maxCol, inheritedBg, ctx, minCol)
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
): number {
  let col = startCol
  // Effective right boundary: text node's layout edge or buffer edge
  const rightEdge = maxCol !== undefined ? Math.min(maxCol, buffer.width) : buffer.width
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
    // Priority: 1) Text's own bg, 2) inherited bg from ancestor Box, 3) buffer read (legacy fallback).
    // Using inherited bg instead of getCellBg decouples text rendering from buffer state,
    // which is critical for incremental rendering: the cloned buffer may have stale bg
    // at positions outside the parent's bg-filled region (e.g., overflow text).
    const existingBg = style.bg !== null ? style.bg : inheritedBg !== undefined ? inheritedBg : buffer.getCellBg(col, y)

    // Wide character at the boundary: the continuation cell would overflow
    // into an adjacent container. Replace with a space to match terminal
    // behavior (real terminals leave the last column blank for wide chars
    // that don't fit). Without this, the continuation cell extends outside
    // the text node's layout bounds and becomes stale during incremental
    // rendering — the owning container's dirty flag tracking doesn't cover
    // cells outside its layout area.
    if (width === 2 && col + 1 >= rightEdge) {
      buffer.setCell(col, y, {
        char: " ",
        fg: style.fg,
        bg: existingBg,
        underlineColor: style.underlineColor ?? null,
        attrs: style.attrs,
        wide: false,
        continuation: false,
        hyperlink: style.hyperlink,
      })
      col += 1
      continue
    }

    // For text-presentation emoji, add VS16 so terminals render at 2 columns
    const outputChar = width === 2 ? ensureEmojiPresentation(grapheme) : grapheme

    buffer.setCell(col, y, {
      char: outputChar,
      fg: style.fg,
      bg: existingBg,
      underlineColor: style.underlineColor ?? null,
      attrs: style.attrs,
      wide: width === 2,
      continuation: false,
      hyperlink: style.hyperlink,
    })

    if (width === 2 && col + 1 < buffer.width) {
      const existingBg2 =
        style.bg !== null ? style.bg : inheritedBg !== undefined ? inheritedBg : buffer.getCellBg(col + 1, y)
      buffer.setCell(col + 1, y, {
        char: "",
        fg: style.fg,
        bg: existingBg2,
        underlineColor: style.underlineColor ?? null,
        attrs: style.attrs,
        wide: false,
        continuation: true,
        hyperlink: style.hyperlink,
      })
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
): void {
  renderAnsiTextLineReturn(buffer, x, y, text, baseStyle, maxCol, inheritedBg, ctx)
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
): number {
  const segments = parseAnsiText(text)
  let col = x

  for (const segment of segments) {
    // Merge segment style with base style
    const style = mergeAnsiStyle(baseStyle, segment)

    // Detect background conflict: chalk.bg* overwrites existing silvery background
    // Check both: 1) Text's own backgroundColor, 2) Parent Box's bg already in buffer
    // Skip if segment has bgOverride flag (explicit opt-out via ansi.bgOverride)
    const effectiveBgConflictMode = ctx?.bgConflictMode ?? getBgConflictMode()
    if (
      effectiveBgConflictMode !== "ignore" &&
      !segment.bgOverride &&
      segment.bg !== undefined &&
      segment.bg !== null
    ) {
      // Check if there's an existing background (from Text prop or parent Box fill)
      const existingBufBg = col < buffer.width ? buffer.getCellBg(col, y) : null
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

    col = renderGraphemes(buffer, splitGraphemes(segment.text), col, y, style, maxCol, inheritedBg, ctx, minCol)
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
export function mergeStyles(base: Style, overlay: Partial<Style>, options: MergeStylesOptions = {}): Style {
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
  } else {
    attrs.underline = overlayAttrs.underline ?? baseAttrs.underline
    attrs.underlineStyle = overlayAttrs.underlineStyle ?? baseAttrs.underlineStyle
    attrs.strikethrough = overlayAttrs.strikethrough ?? baseAttrs.strikethrough
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
function mergeAnsiStyle(base: Style, segment: StyledSegment, options: MergeStylesOptions = {}): Style {
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

  // Use mergeStyles for consistent category-based merging
  const merged = mergeStyles(
    base,
    { fg, bg, underlineColor, attrs: overlayAttrs },
    { preserveDecorations, preserveEmphasis },
  )

  // Pass through OSC 8 hyperlink from segment (not an SGR attribute)
  if (segment.hyperlink) {
    merged.hyperlink = segment.hyperlink
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
): void {
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
      return // Completely outside vertical clip bounds
    }
    if (clipBounds.left !== undefined && clipBounds.right !== undefined) {
      if (x + width <= clipBounds.left || x >= clipBounds.right) {
        return // Completely outside horizontal clip bounds
      }
    }
  }

  // --- PreparedText cache: Level 0 (plain text for maxDisplayWidth) ---
  // Compute DOM-level display width budget for truncate-end modes.
  // This limits how much text collectTextWithBg gathers BEFORE ANSI serialization,
  // making OSC 8 hyperlinks and other escape sequences safe by construction.
  let maxDisplayWidth: number | undefined
  const isTruncateEnd =
    props.wrap === false || props.wrap === "truncate-end" || props.wrap === "truncate" || props.wrap === "clip"
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
    maxDisplayWidth = (width + 1) * lineCount
  }

  // --- PreparedText cache: Level 1 (collected styled text) ---
  // Collect text content and background segments from this node and all children.
  // Background color from nested Text elements is tracked as BgSegments
  // (not embedded as ANSI codes) to survive text wrapping correctly.
  let text: string
  let bgSegments: BgSegment[]
  let childSpans: ChildSpan[]

  const cachedCollected = getCachedCollectedText(node, maxDisplayWidth)
  if (cachedCollected) {
    text = cachedCollected.text
    bgSegments = cachedCollected.bgSegments as BgSegment[]
    childSpans = cachedCollected.childSpans as ChildSpan[]
  } else {
    const collected = collectTextWithBg(node, {}, 0, maxDisplayWidth, ctx)
    text = collected.text
    bgSegments = collected.bgSegments
    childSpans = collected.childSpans
    setCachedCollectedText(node, collected, maxDisplayWidth)
  }

  // Get style for this Text node.
  // Inherit foreground from nearest ancestor Box with color prop (CSS semantics).
  const style = getTextStyle(props)
  if (style.fg === null && inheritedFg !== undefined) {
    style.fg = inheritedFg
  }

  // --- PreparedText cache: Level 2 (formatted lines per width) ---
  // When text has background color, preserve trailing spaces so bg covers them.
  const hasBg = style.bg !== null || bgSegments.length > 0 || (inheritedBg !== undefined && inheritedBg !== null)
  const trim = !hasBg
  const internalTransform = props.internal_transform

  let lines: string[]
  let lineOffsets: Array<{ start: number; end: number }>

  // Skip format cache when internal_transform is present (may depend on external state)
  const cachedFmt = !internalTransform ? getCachedFormat(node, width, props.wrap, trim) : null
  if (cachedFmt) {
    lines = cachedFmt.lines
    lineOffsets = cachedFmt.hasLineOffsets ? cachedFmt.lineOffsets : []
  } else {
    lines = formatTextLines(text, width, props.wrap, ctx, trim)
    if (internalTransform) {
      lines = lines.map((line, index) => internalTransform(line, index))
    }
    const needLineOffsets = bgSegments.length > 0 || childSpans.length > 0
    lineOffsets = needLineOffsets ? mapLinesToCharOffsets(text, lines, ctx) : []
    if (!internalTransform) {
      setCachedFormat(node, width, props.wrap, trim, lines, lineOffsets, needLineOffsets)
    }
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
    const layoutRight = internalTransform ? buffer.width : x + width
    const maxCol =
      clipBounds && "right" in clipBounds && clipBounds.right !== undefined
        ? Math.min(layoutRight, clipBounds.right)
        : layoutRight
    // Clip left edge to horizontal clip bounds. Without this, text rendered
    // by a node whose x is BEFORE the parent's clip-left (e.g., negative
    // marginLeft inside an overflow:hidden container with a border) would
    // overwrite the parent's left border or padding cells.
    const minCol = clipBounds && "left" in clipBounds && clipBounds.left !== undefined ? clipBounds.left : undefined
    const endCol = renderTextLineReturn(buffer, x, lineY, line, style, maxCol, inheritedBg, ctx, minCol)

    // Clear remaining cells after text to end of layout width (clipped).
    // When text content shrinks (e.g., breadcrumb changes from long to short path),
    // the parent Box may skip its bg fill (skipBgFill=true when only subtreeDirty).
    // Without explicit clearing here, stale chars from the previous longer text
    // survive in the cloned buffer. This is safe: we only clear within our own
    // layout area, writing spaces with the correct inherited background.
    // Respect minCol so we don't clear cells inside the parent's left border.
    const clearStart = minCol !== undefined ? Math.max(endCol, minCol) : endCol
    if (clearStart < maxCol) {
      const clearBg = inheritedBg ?? null
      for (let cx = clearStart; cx < maxCol && cx < buffer.width; cx++) {
        buffer.setCell(cx, lineY, {
          char: " ",
          fg: style.fg,
          bg: clearBg,
          underlineColor: null,
          attrs: {
            bold: false,
            dim: false,
            italic: false,
            underline: false,
            inverse: false,
            strikethrough: false,
            blink: false,
            hidden: false,
          },
          wide: false,
          continuation: false,
        })
      }
    }

    // Apply background segments from nested Text elements to the buffer.
    // This happens after renderTextLine so the bg is applied to cells
    // that already have the correct character/fg/attrs written.
    if (bgSegments.length > 0 && lineIdx < lineOffsets.length) {
      const { start, end } = lineOffsets[lineIdx]!
      applyBgSegmentsToLine(buffer, x, lineY, line, start, end, bgSegments, ctx)
    }
  }

  // Compute inlineRects for virtual text children.
  // Maps each child's display-width span to screen-space rectangles,
  // accounting for text wrapping (one rect per line fragment).
  if (childSpans.length > 0 && lineOffsets.length > 0) {
    computeInlineRects(childSpans, lineOffsets, x, y, lines.length, height)
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
