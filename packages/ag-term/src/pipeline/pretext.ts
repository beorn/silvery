/**
 * Pretext: Grapheme-indexed text analysis for layout queries.
 *
 * Inspired by https://chenglou.me/pretext/ — prepare text once, measure at
 * any width cheaply. Enables layout algorithms CSS can't express:
 *
 * - **Shrinkwrap**: find the narrowest width that keeps the same line count
 * - **Balanced**: equalize line widths (reduce raggedness)
 * - **Knuth-Plass**: optimal paragraph breaking (minimize total raggedness)
 * - **Height prediction**: exact line count at any width without full wrapping
 */

import {
  graphemeWidth as defaultGraphemeWidth,
  splitGraphemesAnsiAware,
  isWordBoundary,
  canBreakAnywhere,
  wrapText,
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
  /** Width of the widest unbreakable word segment. */
  maxWordWidth: number
  /** Width of the widest single grapheme. */
  maxGraphemeWidth: number
  /** Grapheme indices where newlines occur. */
  newlineIndices: number[]
  /** Grapheme indices where word breaks are legal. */
  breakIndices: number[]
  /** Original text (for delegating to wrapText). */
  text: string
}

// ============================================================================
// Build
// ============================================================================

/**
 * Build text analysis from an ANSI-embedded text string.
 * O(N) where N is grapheme count. Call once per text change (cached by PreparedText).
 */
export function buildTextAnalysis(
  text: string,
  gWidthFn: (g: string) => number = defaultGraphemeWidth,
): TextAnalysis {
  const graphemes = splitGraphemesAnsiAware(text)
  const len = graphemes.length
  const widths = new Array<number>(len)
  const cumWidths = new Array<number>(len + 1)
  const newlineIndices: number[] = []
  const breakIndices: number[] = []

  cumWidths[0] = 0
  let maxWordWidth = 0
  let maxGraphemeWidth = 0
  let currentWordWidth = 0

  for (let i = 0; i < len; i++) {
    const g = graphemes[i]!
    const w = gWidthFn(g)
    widths[i] = w
    cumWidths[i + 1] = cumWidths[i]! + w
    if (w > maxGraphemeWidth) maxGraphemeWidth = w

    if (g === "\n") {
      newlineIndices.push(i)
      maxWordWidth = Math.max(maxWordWidth, currentWordWidth)
      currentWordWidth = 0
    } else if (isWordBoundary(g)) {
      breakIndices.push(i + 1)
      maxWordWidth = Math.max(maxWordWidth, currentWordWidth)
      currentWordWidth = 0
    } else if (canBreakAnywhere(g)) {
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
    maxGraphemeWidth,
    newlineIndices,
    breakIndices,
    text,
  }
}

// ============================================================================
// Line counting
// ============================================================================

/**
 * Count how many lines text would occupy at a given width.
 *
 * Delegates to wrapText for correctness — the greedy wrapping algorithm has
 * subtle boundary-char handling (spaces consumed on overflow, leading space
 * trimming on continuation lines) that's error-prone to reimplement.
 *
 * For terminal text (20-200 chars), wrapText is ~5-12µs per call.
 * Shrinkwrap does ~7-9 calls (log2(width)), so total is ~50-100µs.
 */
export function countLinesAtWidth(analysis: TextAnalysis, width: number): number {
  if (width <= 0) return Infinity
  if (analysis.totalWidth <= width && analysis.newlineIndices.length === 0) return 1
  return wrapText(analysis.text, width, true, true).length
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
 * O(log(maxWidth) × wrapText) — ~7-9 iterations for terminal widths.
 */
export function shrinkwrapWidth(analysis: TextAnalysis, maxWidth: number): number {
  if (maxWidth <= 0) return 0
  const targetLineCount = countLinesAtWidth(analysis, maxWidth)
  if (targetLineCount <= 1) {
    return Math.min(Math.ceil(analysis.totalWidth), maxWidth)
  }

  // Lower bound: max grapheme width (character wrap allows widths below maxWordWidth)
  // Upper bound: maxWidth (can't return wider than the container)
  let lo = Math.max(1, analysis.maxGraphemeWidth)
  let hi = maxWidth

  // Guard: if lo >= hi, nothing to search
  if (lo >= hi) return Math.min(hi, maxWidth)

  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (countLinesAtWidth(analysis, mid) <= targetLineCount) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }

  // Clamp to maxWidth (safety)
  return Math.min(lo, maxWidth)
}

// ============================================================================
// Balanced breaking
// ============================================================================

/**
 * Find a width that produces lines of approximately equal length.
 *
 * Strategy: compute total width / line count as the ideal per-line width,
 * then find the narrowest width at that line count via shrinkwrap.
 */
export function balancedWidth(analysis: TextAnalysis, maxWidth: number): number {
  if (maxWidth <= 0) return 0
  const lineCount = countLinesAtWidth(analysis, maxWidth)
  if (lineCount <= 1) return Math.min(Math.ceil(analysis.totalWidth), maxWidth)

  // Ideal balanced width: total / lines, rounded up
  const idealWidth = Math.ceil(analysis.totalWidth / lineCount)

  // Clamp to [maxGraphemeWidth, maxWidth]
  const candidateWidth = Math.max(analysis.maxGraphemeWidth, Math.min(idealWidth, maxWidth))

  // Verify this doesn't increase line count
  if (countLinesAtWidth(analysis, candidateWidth) > lineCount) {
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
 * Runs per-paragraph (split by newlines) to avoid penalty interactions
 * around forced breaks. Falls back to greedy wrapping for paragraphs
 * where the DP finds no feasible solution (overlong words).
 *
 * O(breakpoints²) per paragraph, typically much less with pruning.
 */
export function knuthPlassBreaks(analysis: TextAnalysis, width: number): number[] {
  if (width <= 0) return []
  if (analysis.totalWidth <= width && analysis.newlineIndices.length === 0) return []

  // Split into paragraphs at newlines and process each independently
  const { newlineIndices, graphemes } = analysis
  const allBreaks: number[] = []

  const paragraphStarts = [0]
  for (const nl of newlineIndices) {
    paragraphStarts.push(nl + 1)
  }

  for (let p = 0; p < paragraphStarts.length; p++) {
    const pStart = paragraphStarts[p]!
    const pEnd = p + 1 < paragraphStarts.length ? paragraphStarts[p + 1]! - 1 : graphemes.length // -1 to exclude newline

    if (pStart >= pEnd) continue // empty paragraph

    const breaks = knuthPlassForParagraph(analysis, pStart, pEnd, width)
    allBreaks.push(...breaks)

    // Add newline break if not the last paragraph
    if (p < paragraphStarts.length - 1 && pEnd < graphemes.length) {
      allBreaks.push(pEnd + 1) // after the newline
    }
  }

  return allBreaks
}

/** DP for a single paragraph (no newlines). */
function knuthPlassForParagraph(
  analysis: TextAnalysis,
  pStart: number,
  pEnd: number,
  width: number,
): number[] {
  const { cumWidths, breakIndices, widths, graphemes } = analysis

  // Build candidates for this paragraph
  const candidates: number[] = [pStart]
  for (const bp of breakIndices) {
    if (bp > pStart && bp <= pEnd) candidates.push(bp)
  }
  candidates.push(pEnd)

  const n = candidates.length
  if (n <= 2) return [] // single segment, no breaks needed

  const cost = new Array<number>(n).fill(Infinity)
  const next = new Array<number>(n).fill(-1)
  cost[n - 1] = 0

  for (let i = n - 2; i >= 0; i--) {
    const lineStart = candidates[i]!
    const lineStartCum = cumWidths[lineStart]!

    for (let j = i + 1; j < n; j++) {
      const lineEnd = candidates[j]!

      // Compute line width, trimming trailing whitespace
      let trimEnd = lineEnd
      while (trimEnd > lineStart) {
        const prevG = graphemes[trimEnd - 1]
        const prevW = widths[trimEnd - 1]
        if (prevW === 0) {
          trimEnd--
          continue
        } // skip ANSI
        if (prevG === " " || prevG === "\t") {
          trimEnd--
          continue
        }
        break
      }
      const lineWidth = cumWidths[trimEnd]! - lineStartCum

      if (lineWidth > width) break // too wide, skip wider candidates

      const leftover = width - lineWidth
      const lineCost = j === n - 1 ? 0 : leftover * leftover
      const totalCost = lineCost + cost[j]!

      if (totalCost < cost[i]!) {
        cost[i] = totalCost
        next[i] = j
      }
    }
  }

  // If DP failed (no feasible path), return empty (caller falls back to greedy)
  if (cost[0] === Infinity) return []

  // Trace back
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
 * Returns line strings — drop-in replacement for greedy wrap.
 * Falls back to greedy wrapText when DP finds no feasible solution.
 */
export function optimalWrap(text: string, analysis: TextAnalysis, width: number): string[] {
  const breaks = knuthPlassBreaks(analysis, width)
  if (breaks.length === 0) {
    // No breaks found — either single line or DP infeasible → fall back to greedy
    if (analysis.totalWidth <= width && analysis.newlineIndices.length === 0) return [text]
    return wrapText(text, width, true, true)
  }

  const { graphemes, widths } = analysis
  const lines: string[] = []
  let lineStart = 0

  for (const bp of breaks) {
    // Trim trailing whitespace (skip zero-width ANSI tokens)
    let lineEnd = bp
    while (lineEnd > lineStart) {
      const w = widths[lineEnd - 1]!
      if (w === 0) {
        lineEnd--
        continue
      } // ANSI token
      const g = graphemes[lineEnd - 1]!
      if (g === " " || g === "\t" || g === "\n") {
        lineEnd--
        continue
      }
      break
    }
    lines.push(graphemes.slice(lineStart, lineEnd).join(""))

    // Skip leading whitespace on next line (skip ANSI tokens)
    lineStart = bp
    while (lineStart < graphemes.length) {
      const g = graphemes[lineStart]!
      if (g === " " || g === "\t") {
        lineStart++
        continue
      }
      break
    }
  }

  // Last line
  if (lineStart < graphemes.length) {
    lines.push(graphemes.slice(lineStart).join(""))
  }

  return lines
}
