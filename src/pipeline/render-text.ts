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
} from "../buffer.js"
import type { InkxNode, TextProps } from "../types.js"
import {
  type StyledSegment,
  ensureEmojiPresentation,
  graphemeWidth,
  hasAnsi,
  parseAnsiText,
  splitGraphemes,
  wrapText,
} from "../unicode.js"
import { getTextStyle, getTextWidth, parseColor, sliceByWidth, sliceByWidthFromEnd } from "./render-helpers.js"

// ============================================================================
// Background Conflict Detection
// ============================================================================

/**
 * Background conflict detection mode.
 * Set via INKX_BG_CONFLICT env var: 'ignore' | 'warn' | 'throw'
 * Default: 'throw'
 *
 * - ignore: no detection (for performance or when you know what you're doing)
 * - warn: log warning once per unique conflict (deduplicated)
 * - throw: throw Error immediately (catches programming errors in dev)
 */
type BgConflictMode = "ignore" | "warn" | "throw"

/** Cached bg conflict mode. Read from env once at module load. */
let bgConflictMode: BgConflictMode = (() => {
  const env = process.env.INKX_BG_CONFLICT?.toLowerCase()
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
  inverse?: boolean
  strikethrough?: boolean
}

/**
 * Build ANSI escape sequence for a style context.
 *
 * Note: backgroundColor is intentionally NOT embedded as ANSI codes.
 * Background color is handled at the buffer level (via BgSegment tracking)
 * to prevent bg bleed across wrapped text lines. See km-inkx.bg-bleed.
 */
function styleToAnsi(style: StyleContext): string {
  const codes: number[] = []

  // Foreground color - use parseColor directly instead of roundtripping through getTextStyle
  if (style.color) {
    const color = parseColor(style.color)
    if (color !== null) {
      if (typeof color === "number") {
        codes.push(38, 5, color)
      } else {
        codes.push(38, 2, color.r, color.g, color.b)
      }
    }
  }

  // backgroundColor is NOT embedded here - it is tracked separately via
  // BgSegment and applied at the buffer level in renderText(). This prevents
  // bg color from bleeding across wrapped lines. See collectTextWithBg().

  // Attributes
  if (style.bold) codes.push(1)
  if (style.dim) codes.push(2)
  if (style.italic) codes.push(3)
  if (style.underline) codes.push(4)
  if (style.inverse) codes.push(7)
  if (style.strikethrough) codes.push(9)

  if (codes.length === 0) {
    return ""
  }

  return `\x1b[${codes.join(";")}m`
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
    underline: childProps.underline ?? parent.underline,
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
export function collectTextContent(node: InkxNode, parentContext: StyleContext = {}): string {
  // If this node has direct text content, return it
  if (node.textContent !== undefined) {
    return node.textContent
  }

  // Otherwise, collect from children
  let result = ""
  for (const child of node.children) {
    // If child is a Text node (virtual/nested) with style props, apply ANSI codes
    if (child.type === "inkx-text" && child.props && !child.layoutNode) {
      const childProps = child.props as TextProps
      // Merge child props with parent context to get effective child style
      const childContext = mergeStyleContext(parentContext, childProps)
      // Recursively collect with child's context
      const childContent = collectTextContent(child, childContext)
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
 * Result of collecting text with background segments.
 */
interface TextWithBg {
  /** The collected text string (with ANSI codes for fg/attrs, but NOT bg) */
  text: string
  /** Background color segments from nested Text elements */
  bgSegments: BgSegment[]
  /** Plain text character count (excluding ANSI codes). Used for DOM-level budget tracking. */
  plainLen: number
}

/**
 * Collect plain text content from a node tree (no ANSI codes).
 * Used to compute DOM-level truncation budget before ANSI serialization.
 */
function collectPlainText(node: InkxNode): string {
  if (node.textContent !== undefined) return node.textContent
  let result = ""
  for (const child of node.children) {
    result += collectPlainText(child)
  }
  return result
}

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
  node: InkxNode,
  parentContext: StyleContext = {},
  offset = 0,
  maxDisplayWidth?: number,
): TextWithBg {
  // If this node has direct text content, return it with no bg segments
  if (node.textContent !== undefined) {
    let text = node.textContent
    // DOM-level truncation: trim leaf text to display width budget
    if (maxDisplayWidth !== undefined) {
      const textW = getTextWidth(text)
      if (textW > maxDisplayWidth) {
        text = sliceByWidth(text, maxDisplayWidth)
      }
    }
    // plainLen tracks display width for budget, used for both budget tracking
    // and BgSegment offset tracking (both are display-width based since
    // mapLinesToCharOffsets works on plain text which maps 1:1 with display width
    // for non-wide characters)
    const plainLen = getTextWidth(text)
    return { text, bgSegments: [], plainLen }
  }

  let result = ""
  const bgSegments: BgSegment[] = []
  let currentOffset = offset
  let displayWidthCollected = 0

  for (const child of node.children) {
    // Stop collecting if budget exhausted
    if (maxDisplayWidth !== undefined && displayWidthCollected >= maxDisplayWidth) break

    // Compute remaining budget for this child
    const childBudget = maxDisplayWidth !== undefined ? maxDisplayWidth - displayWidthCollected : undefined

    if (child.type === "inkx-text" && child.props && !child.layoutNode) {
      const childProps = child.props as TextProps
      const childContext = mergeStyleContext(parentContext, childProps)

      // Recursively collect with child's context and budget
      const childResult = collectTextWithBg(child, childContext, currentOffset, childBudget)

      // Apply ANSI styles for fg/attrs (but NOT bg) with push/pop
      const styledText = applyTextStyleAnsi(childResult.text, childContext, parentContext)
      result += styledText

      // Track bg segment if this child (or its ancestors) has backgroundColor
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
      }

      // Include child's nested bg segments
      bgSegments.push(...childResult.bgSegments)

      // Track using plainLen (display width) — not text.length which includes ANSI codes
      currentOffset += childResult.plainLen
      displayWidthCollected += childResult.plainLen
    } else {
      // Not a styled Text node, just collect recursively
      const childResult = collectTextWithBg(child, parentContext, currentOffset, childBudget)
      result += childResult.text
      bgSegments.push(...childResult.bgSegments)
      currentOffset += childResult.plainLen
      displayWidthCollected += childResult.plainLen
    }
  }

  return { text: result, bgSegments, plainLen: displayWidthCollected }
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
): void {
  if (bgSegments.length === 0) return
  if (y < 0 || y >= buffer.height) return

  // Reusable cell for readCellInto to avoid per-character allocation
  const bgCell = createMutableCell()

  // For each bg segment that overlaps this line's character range,
  // calculate the screen columns and fill the bg
  for (const seg of bgSegments) {
    // Check overlap between segment [seg.start, seg.end) and line [lineCharStart, lineCharEnd)
    const overlapStart = Math.max(seg.start, lineCharStart)
    const overlapEnd = Math.min(seg.end, lineCharEnd)
    if (overlapStart >= overlapEnd) continue

    // Convert character offsets to column positions within the line.
    // We need to map "character offset relative to line start" to "screen column".
    // The lineText may contain ANSI codes, so we use displayWidth-aware iteration.
    const relStart = overlapStart - lineCharStart
    const relEnd = overlapEnd - lineCharStart

    // Walk through the line's visible characters to find screen columns
    let charIdx = 0
    let col = x
    const graphemes = splitGraphemes(hasAnsi(lineText) ? stripAnsiForBg(lineText) : lineText)

    for (const grapheme of graphemes) {
      const gWidth = graphemeWidth(grapheme)
      if (gWidth === 0) continue

      if (charIdx >= relStart && charIdx < relEnd) {
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
      charIdx++
      if (charIdx >= relEnd) break
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
 * @param originalText - The original collected text (with ANSI, before wrapping)
 * @param formattedLines - The wrapped/truncated output lines
 * @returns Array of { start, end } character offsets for each formatted line
 */
function mapLinesToCharOffsets(originalText: string, formattedLines: string[]): Array<{ start: number; end: number }> {
  // Strip ANSI from the original to get the plain text character sequence
  const plainOriginal = hasAnsi(originalText) ? stripAnsiForBg(originalText) : originalText
  // Normalize tabs to match formatTextLines behavior
  const normalized = plainOriginal.replace(/\t/g, "    ")

  const result: Array<{ start: number; end: number }> = []
  let offset = 0

  for (const line of formattedLines) {
    const plainLine = hasAnsi(line) ? stripAnsiForBg(line) : line

    // Find where this line starts in the normalized text.
    // Search forward from current offset, skipping newlines and spaces
    // that were consumed by the wrapping/splitting process.
    const lineStart = findLineStart(normalized, plainLine, offset)
    const lineLen = Math.min(plainLine.length, normalized.length - lineStart)

    result.push({ start: lineStart, end: lineStart + lineLen })
    offset = lineStart + lineLen
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
 */
export function formatTextLines(text: string, width: number, wrap: TextProps["wrap"]): string[] {
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
    return lines.map((line) => {
      if (getTextWidth(line) <= width) return line
      return sliceByWidth(line, width)
    })
  }

  // No wrapping, just truncate at end
  if (wrap === false || wrap === "truncate-end" || wrap === "truncate") {
    return lines.map((line) => truncateText(line, width, "end"))
  }

  if (wrap === "truncate-start") {
    return lines.map((line) => truncateText(line, width, "start"))
  }

  if (wrap === "truncate-middle") {
    return lines.map((line) => truncateText(line, width, "middle"))
  }

  // wrap === true or wrap === 'wrap' - word-aware wrapping
  // Uses wrapText from unicode.ts with trim=true for rendering
  // (trims trailing spaces on broken lines, skips leading spaces on continuation lines)
  return wrapText(normalizedText, width, true, true)
}

/**
 * Truncate text to fit within width.
 */
export function truncateText(text: string, width: number, mode: "start" | "middle" | "end"): string {
  const textWidth = getTextWidth(text)
  if (textWidth <= width) return text

  const ellipsis = "\u2026" // ...
  const availableWidth = width - 1 // Reserve space for ellipsis

  if (availableWidth <= 0) {
    return width > 0 ? ellipsis : ""
  }

  if (mode === "end") {
    return sliceByWidth(text, availableWidth) + ellipsis
  }

  if (mode === "start") {
    return ellipsis + sliceByWidthFromEnd(text, availableWidth)
  }

  // middle
  const halfWidth = Math.floor(availableWidth / 2)
  const startPart = sliceByWidth(text, halfWidth)
  const endPart = sliceByWidthFromEnd(text, availableWidth - halfWidth)
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
): void {
  // Check if text contains ANSI escape sequences
  if (hasAnsi(text)) {
    renderAnsiTextLine(buffer, x, y, text, baseStyle, maxCol, inheritedBg)
    return
  }

  renderGraphemes(buffer, splitGraphemes(text), x, y, baseStyle, maxCol, inheritedBg)
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
): number {
  if (hasAnsi(text)) {
    return renderAnsiTextLineReturn(buffer, x, y, text, baseStyle, maxCol, inheritedBg)
  }
  return renderGraphemes(buffer, splitGraphemes(text), x, y, baseStyle, maxCol, inheritedBg)
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
): number {
  let col = startCol
  // Effective right boundary: text node's layout edge or buffer edge
  const rightEdge = maxCol !== undefined ? Math.min(maxCol, buffer.width) : buffer.width

  for (const grapheme of graphemes) {
    if (col >= rightEdge) break

    const width = graphemeWidth(grapheme)
    if (width === 0) continue

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
): void {
  renderAnsiTextLineReturn(buffer, x, y, text, baseStyle, maxCol, inheritedBg)
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
): number {
  const segments = parseAnsiText(text)
  let col = x

  for (const segment of segments) {
    // Merge segment style with base style
    const style = mergeAnsiStyle(baseStyle, segment)

    // Detect background conflict: chalk.bg* overwrites existing inkx background
    // Check both: 1) Text's own backgroundColor, 2) Parent Box's bg already in buffer
    // Skip if segment has bgOverride flag (explicit opt-out via chalkx.bgOverride)
    const bgConflictMode = getBgConflictMode()
    if (bgConflictMode !== "ignore" && !segment.bgOverride && segment.bg !== undefined && segment.bg !== null) {
      // Check if there's an existing background (from Text prop or parent Box fill)
      const existingBufBg = col < buffer.width ? buffer.getCellBg(col, y) : null
      const hasExistingBg = baseStyle.bg !== null || existingBufBg !== null

      if (hasExistingBg) {
        const preview = segment.text.slice(0, 30)
        const msg = `[inkx] Background conflict: chalk.bg* on text that already has inkx background. Chalk bg will override only text characters, causing visual gaps in padding. Use chalkx.bgOverride() to suppress if intentional. Text: "${preview}${segment.text.length > 30 ? "..." : ""}"`

        if (bgConflictMode === "throw") {
          throw new Error(msg)
        }
        // 'warn' mode - deduplicate
        const key = `${JSON.stringify(existingBufBg)}-${segment.bg}-${preview}`
        if (!warnedBgConflicts.has(key)) {
          warnedBgConflicts.add(key)
          console.warn(msg)
        }
      }
    }

    col = renderGraphemes(buffer, splitGraphemes(segment.text), col, y, style, maxCol, inheritedBg)
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
    // Direct palette index - map common ones
    const paletteMap: Record<number, number> = {
      0: 0, // black
      1: 1, // red
      2: 2, // green
      3: 3, // yellow
      4: 4, // blue
      5: 5, // magenta
      6: 6, // cyan
      7: 7, // white
      8: 8, // gray
      9: 9, // redBright
      10: 10, // greenBright
      11: 11, // yellowBright
      12: 12, // blueBright
      13: 13, // magentaBright
      14: 14, // cyanBright
      15: 15, // whiteBright
    }
    return paletteMap[code] ?? code
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
 * See km-inkx.bg-bleed for details.
 */
export function renderText(
  node: InkxNode,
  buffer: TerminalBuffer,
  layout: { x: number; y: number; width: number; height: number },
  props: TextProps,
  scrollOffset = 0,
  clipBounds?: { top: number; bottom: number; left?: number; right?: number },
  inheritedBg?: Color,
): void {
  const { x, width, height } = layout
  let { y } = layout

  // Apply scroll offset
  y -= scrollOffset

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

  // Compute DOM-level display width budget for truncate-end modes.
  // This limits how much text collectTextWithBg gathers BEFORE ANSI serialization,
  // making OSC 8 hyperlinks and other escape sequences safe by construction.
  // Only applies to end-truncation (truncate, truncate-end, false) where we keep
  // text from the start. Start/middle truncation keep text from the end or both
  // ends, so they fall back to ANSI-level truncation in formatTextLines.
  // Budget is width + 1 display columns per line to ensure formatTextLines sees
  // text wider than the container and adds the ellipsis character.
  let maxDisplayWidth: number | undefined
  const isTruncateEnd =
    props.wrap === false || props.wrap === "truncate-end" || props.wrap === "truncate" || props.wrap === "clip"
  if (isTruncateEnd && width > 0) {
    const plainText = collectPlainText(node)
    const lineCount = (plainText.match(/\n/g)?.length ?? 0) + 1
    // Each line needs width+1 columns to trigger ellipsis. Multiply by line count.
    maxDisplayWidth = (width + 1) * lineCount
  }

  // Collect text content and background segments from this node and all children.
  // Background color from nested Text elements is tracked as BgSegments
  // (not embedded as ANSI codes) to survive text wrapping correctly.
  const { text, bgSegments } = collectTextWithBg(node, {}, 0, maxDisplayWidth)

  // Get style for this Text node
  const style = getTextStyle(props)

  // Handle wrapping/truncation
  let lines = formatTextLines(text, width, props.wrap)

  // Apply internal_transform if present (used by Transform component).
  // Transform is applied per-line after formatting, matching ink's behavior.
  // The transform should not change dimensions of the output.
  const internalTransform = props.internal_transform
  if (internalTransform) {
    lines = lines.map((line, index) => internalTransform(line, index))
  }

  // Map formatted lines back to character offsets for bg segment application
  const lineOffsets = bgSegments.length > 0 ? mapLinesToCharOffsets(text, lines) : []

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
    const maxCol =
      clipBounds && "right" in clipBounds && clipBounds.right !== undefined
        ? Math.min(x + width, clipBounds.right)
        : x + width
    const endCol = renderTextLineReturn(buffer, x, lineY, line, style, maxCol, inheritedBg)

    // Clear remaining cells after text to end of layout width (clipped).
    // When text content shrinks (e.g., breadcrumb changes from long to short path),
    // the parent Box may skip its bg fill (skipBgFill=true when only subtreeDirty).
    // Without explicit clearing here, stale chars from the previous longer text
    // survive in the cloned buffer. This is safe: we only clear within our own
    // layout area, writing spaces with the correct inherited background.
    if (endCol < maxCol) {
      const clearBg = inheritedBg ?? null
      for (let cx = endCol; cx < maxCol && cx < buffer.width; cx++) {
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
      applyBgSegmentsToLine(buffer, x, lineY, line, start, end, bgSegments)
    }
  }
}
