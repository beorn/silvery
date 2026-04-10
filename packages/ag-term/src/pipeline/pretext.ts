/**
 * Pretext: Grapheme-indexed text analysis for O(log n) layout queries.
 *
 * Inspired by https://chenglou.me/pretext/ — prepare text once, measure at
 * any width cheaply. Enables layout algorithms CSS can't express:
 *
 * - **Shrinkwrap**: find the narrowest width that keeps the same line count
 *   (tighter than CSS fit-content, eliminates dead space in bubbles/cards)
 * - **Balanced**: equalize line widths (reduce raggedness without Knuth-Plass)
 * - **Knuth-Plass**: optimal paragraph breaking (minimize total raggedness)
 * - **Height prediction**: exact line count at any width without full wrapping
 *
 * All algorithms operate on the same TextAnalysis data structure, which is
 * built once from ANSI-aware graphemes and cached per text node via PreparedText.
 *
 * Terminal widths are integers, so binary search for shrinkwrap does at most
 * log2(120) ≈ 7 iterations. Each iteration is O(graphemes). Total: O(7 × N)
 * where N is grapheme count — microseconds for typical terminal text.
 */

import {
  graphemeWidth as defaultGraphemeWidth,
  splitGraphemesAnsiAware,
  isWordBoundary,
  canBreakAnywhere,
} from "../unicode"

// ============================================================================
// Types
// ============================================================================

/** Grapheme-level text analysis for fast width queries. */
export interface TextAnalysis {
  /** ANSI-aware graphemes (visible chars + zero-width ANSI tokens). */
  graphemes: string[]
  /** Display width per grapheme (0 for ANSI tokens). */
  widths: number[]
  /** Prefix sums: cumWidths[i] = sum(widths[0..i-1]). cumWidths[0] = 0. */
  cumWidths: number[]
  /** Total display width of all graphemes. */
  totalWidth: number
  /** Width of the widest unbreakable word segment. Lower bound for shrinkwrap. */
  maxWordWidth: number
  /** Grapheme indices where newlines occur. */
  newlineIndices: number[]
  /**
   * Grapheme indices where word breaks are legal.
   * After spaces/hyphens (index = char after boundary).
   * Before CJK chars (index = the CJK char itself).
   */
  breakIndices: number[]
}

// ============================================================================
// Build
// ============================================================================

/**
 * Build text analysis from an ANSI-embedded text string.
 * O(N) where N is grapheme count. Call once per text change (cached by PreparedText).
 */
export function buildTextAnalysis(text: string, gWidthFn: (g: string) => number = defaultGraphemeWidth): TextAnalysis {
  const graphemes = splitGraphemesAnsiAware(text)
  const len = graphemes.length
  const widths = new Array<number>(len)
  const cumWidths = new Array<number>(len + 1)
  const newlineIndices: number[] = []
  const breakIndices: number[] = []

  cumWidths[0] = 0
  let maxWordWidth = 0
  let currentWordWidth = 0

  for (let i = 0; i < len; i++) {
    const g = graphemes[i]!
    const w = gWidthFn(g)
    widths[i] = w
    cumWidths[i + 1] = cumWidths[i]! + w

    if (g === "\n") {
      newlineIndices.push(i)
      maxWordWidth = Math.max(maxWordWidth, currentWordWidth)
      currentWordWidth = 0
    } else if (isWordBoundary(g)) {
      // Break AFTER space/hyphen: next grapheme starts a new word
      breakIndices.push(i + 1)
      maxWordWidth = Math.max(maxWordWidth, currentWordWidth)
      currentWordWidth = 0
    } else if (canBreakAnywhere(g)) {
      // Break BEFORE CJK: this char can start a new line
      breakIndices.push(i)
      maxWordWidth = Math.max(maxWordWidth, currentWordWidth)
      currentWordWidth = w
    } else if (w > 0) {
      currentWordWidth += w
    }
  }
  maxWordWidth = Math.max(maxWordWidth, currentWordWidth)

  return {
    graphemes,
    widths,
    cumWidths,
    totalWidth: cumWidths[len]!,
    maxWordWidth,
    newlineIndices,
    breakIndices,
  }
}

// ============================================================================
// Line counting (fast, no string allocation)
// ============================================================================

/**
 * Count how many lines text would occupy at a given width.
 * Uses greedy word-wrap algorithm matching wrapTextWithMeasurer behavior.
 * O(graphemes) per call — no string allocation.
 */
export function countLinesAtWidth(analysis: TextAnalysis, width: number): number {
  if (width <= 0) return Infinity
  const { widths, totalWidth, newlineIndices } = analysis
  if (totalWidth <= width && newlineIndices.length === 0) return 1

  let lines = 1
  let currentWidth = 0
  let lastBreakWidth = -1 // width at last break opportunity
  let hasBreak = false

  // Build a set for O(1) newline lookup
  const newlineSet = newlineIndices.length > 0 ? new Set(newlineIndices) : null
  // Build a set for O(1) break lookup
  const breakSet = analysis.breakIndices.length > 0 ? new Set(analysis.breakIndices) : null

  for (let i = 0; i < widths.length; i++) {
    // Newline forces a line break (check before width skip — newlines have width 0)
    if (newlineSet?.has(i)) {
      lines++
      currentWidth = 0
      hasBreak = false
      lastBreakWidth = -1
      continue
    }

    const w = widths[i]!
    if (w === 0) continue // ANSI token

    // Track break opportunities
    if (breakSet?.has(i)) {
      lastBreakWidth = currentWidth
      hasBreak = true
    }

    // Would this grapheme overflow?
    if (currentWidth + w > width) {
      lines++
      if (hasBreak && lastBreakWidth >= 0) {
        // Rewind to last break: the remaining width from break to current
        currentWidth = currentWidth - lastBreakWidth + w
      } else {
        // Character wrap
        currentWidth = w
      }
      hasBreak = false
      lastBreakWidth = -1
    } else {
      currentWidth += w
    }
  }

  return lines
}

// ============================================================================
// Shrinkwrap
// ============================================================================

/**
 * Find the narrowest integer width that produces the same line count as maxWidth.
 *
 * CSS fit-content uses the widest wrapped line — leaving dead space when the
 * last line is short. Shrinkwrap binary-searches for the tightest width that
 * keeps the same number of lines, eliminating wasted area in bubbles/cards.
 *
 * O(log(maxWidth) × graphemes) — ~7 iterations × N for terminal widths.
 */
export function shrinkwrapWidth(analysis: TextAnalysis, maxWidth: number): number {
  if (maxWidth <= 0) return 0
  const targetLineCount = countLinesAtWidth(analysis, maxWidth)
  if (targetLineCount <= 1) {
    // Single line — tightest width is the total text width (or maxWidth if smaller)
    return Math.min(Math.ceil(analysis.totalWidth), maxWidth)
  }

  // Binary search: find narrowest width where lineCount <= targetLineCount
  // Lower bound: widest unbreakable word (can't go narrower without adding lines)
  let lo = Math.max(1, analysis.maxWordWidth)
  let hi = maxWidth

  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (countLinesAtWidth(analysis, mid) <= targetLineCount) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }

  return lo
}

// ============================================================================
// Balanced breaking
// ============================================================================

/**
 * Find a width that produces lines of approximately equal length.
 *
 * Strategy: compute total width, divide by target line count, then
 * find the narrowest width at that line count via shrinkwrap.
 * Falls back to maxWidth if balanced width would increase line count.
 */
export function balancedWidth(analysis: TextAnalysis, maxWidth: number): number {
  if (maxWidth <= 0) return 0
  const lineCount = countLinesAtWidth(analysis, maxWidth)
  if (lineCount <= 1) return Math.min(Math.ceil(analysis.totalWidth), maxWidth)

  // Ideal balanced width: total / lines, rounded up
  const idealWidth = Math.ceil(analysis.totalWidth / lineCount)

  // Clamp to [maxWordWidth, maxWidth]
  const candidateWidth = Math.max(analysis.maxWordWidth, Math.min(idealWidth, maxWidth))

  // Verify this doesn't increase line count
  if (countLinesAtWidth(analysis, candidateWidth) > lineCount) {
    // Balanced width would add lines — use shrinkwrap instead
    return shrinkwrapWidth(analysis, maxWidth)
  }

  // Further tighten via shrinkwrap at the balanced line count
  return shrinkwrapWidth(analysis, candidateWidth)
}

// ============================================================================
// Knuth-Plass optimal paragraph breaking
// ============================================================================

/**
 * Find optimal line breaks that minimize total raggedness.
 *
 * The Knuth-Plass algorithm uses dynamic programming over break points to
 * find the set of line breaks that minimizes the sum of squared leftover space
 * across all lines. This produces more visually pleasing paragraphs than
 * greedy wrapping, which only optimizes each line independently.
 *
 * Returns an array of grapheme indices where line breaks should occur.
 * The caller wraps text at these indices instead of using greedy wrapping.
 *
 * Complexity: O(breakpoints²) worst case, typically much less with pruning.
 * For terminal text (20-200 chars, ~5-30 breakpoints), this is microseconds.
 */
export function knuthPlassBreaks(analysis: TextAnalysis, width: number): number[] {
  if (width <= 0) return []
  if (analysis.totalWidth <= width && analysis.newlineIndices.length === 0) return []

  const { cumWidths, breakIndices, newlineIndices, graphemes, widths } = analysis

  // Build combined break candidates: start of text + breakIndices + newlines + end of text
  // Each candidate is a grapheme index where a line can start
  const candidates: number[] = [0]
  const newlineSet = new Set(newlineIndices)

  // Merge breakIndices and newline positions (as forced breaks)
  const allBreaks = new Set(breakIndices)
  for (const nl of newlineIndices) {
    allBreaks.add(nl + 1) // line starts after newline
  }
  const sortedBreaks = Array.from(allBreaks).sort((a, b) => a - b)
  for (const bp of sortedBreaks) {
    if (bp > 0 && bp <= graphemes.length) candidates.push(bp)
  }
  candidates.push(graphemes.length) // end sentinel

  const n = candidates.length

  // DP: cost[i] = minimum total cost to break text from candidate[i] to end
  // break[i] = next candidate index (where the next line starts)
  const cost = new Array<number>(n).fill(Infinity)
  const next = new Array<number>(n).fill(-1)
  cost[n - 1] = 0 // end sentinel has zero cost

  // Process candidates from right to left
  for (let i = n - 2; i >= 0; i--) {
    const lineStart = candidates[i]!
    const lineStartCum = cumWidths[lineStart]!

    for (let j = i + 1; j < n; j++) {
      const lineEnd = candidates[j]!
      let lineWidth = cumWidths[lineEnd]! - lineStartCum

      // Trim trailing spaces from line width
      let trimEnd = lineEnd
      while (trimEnd > lineStart && widths[trimEnd - 1] === 0) trimEnd--
      if (trimEnd > lineStart) {
        const lastChar = graphemes[trimEnd - 1]
        if (lastChar === " " || lastChar === "\t") {
          lineWidth = cumWidths[trimEnd - 1]! - lineStartCum
        }
      }

      // Check for forced newline in this range
      let forcedBreak = false
      for (const nl of newlineIndices) {
        if (nl >= lineStart && nl < lineEnd) {
          forcedBreak = true
          break
        }
      }

      if (lineWidth > width && !forcedBreak) break // no point trying wider lines

      // Cost: squared leftover space (last line is free — no penalty)
      const leftover = width - lineWidth
      const lineCost = j === n - 1 ? 0 : leftover * leftover
      const totalCost = lineCost + cost[j]!

      if (totalCost < cost[i]!) {
        cost[i] = totalCost
        next[i] = j
      }

      if (forcedBreak) break // forced break — can't extend past newline
    }
  }

  // Trace back to get break positions
  const breaks: number[] = []
  let idx = 0
  while (idx < n - 1 && next[idx]! >= 0) {
    idx = next[idx]!
    if (idx < n - 1) {
      breaks.push(candidates[idx]!)
    }
  }

  return breaks
}

/**
 * Wrap text using Knuth-Plass optimal breaks.
 * Returns line strings (with ANSI preserved) — drop-in replacement for greedy wrap.
 */
export function optimalWrap(text: string, analysis: TextAnalysis, width: number): string[] {
  const breaks = knuthPlassBreaks(analysis, width)
  if (breaks.length === 0) return [text]

  const { graphemes } = analysis
  const lines: string[] = []
  let lineStart = 0

  for (const bp of breaks) {
    // Collect graphemes from lineStart to bp, trimming trailing spaces
    let lineEnd = bp
    while (lineEnd > lineStart && (graphemes[lineEnd - 1] === " " || graphemes[lineEnd - 1] === "\t")) {
      lineEnd--
    }
    lines.push(graphemes.slice(lineStart, lineEnd).join(""))

    // Skip leading spaces on next line
    lineStart = bp
    while (lineStart < graphemes.length && (graphemes[lineStart] === " " || graphemes[lineStart] === "\t")) {
      lineStart++
    }
  }

  // Last line
  if (lineStart < graphemes.length) {
    lines.push(graphemes.slice(lineStart).join(""))
  }

  return lines
}
