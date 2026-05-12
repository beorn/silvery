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
 * Per-line width function: takes the 0-based line index, returns the
 * available width for that line. Use to express CSS-float-equivalent
 * layouts (e.g. line 0 narrowed by a top-right pill, lines 1+ at full
 * container width). Inspired by chenglou's original Pretext, which
 * supports per-line widths to wrap text around floated images.
 */
export type WidthFn = (lineIndex: number) => number

/**
 * Find optimal line breaks that minimize total raggedness.
 *
 * Runs per-paragraph (split by newlines) to avoid penalty interactions
 * around forced breaks. Falls back to greedy wrapping for paragraphs
 * where the DP finds no feasible solution (overlong words).
 *
 * `width` accepts either a constant number (uniform width — fast path)
 * or a `WidthFn(lineIndex)` for per-line widths. Per-line uses a
 * forward DP that tracks line index in state.
 *
 * O(breakpoints²) for the constant-width case; O(breakpoints² × maxLines)
 * for per-line. Both negligible for terminal-scale text.
 */
export function knuthPlassBreaks(analysis: TextAnalysis, width: number | WidthFn): number[] {
  // Quick reject: empty or single-line at the widest available width.
  // For per-line, use width(0) as the conservative single-line check —
  // if the whole text fits on line 0, no breaks are needed regardless
  // of what subsequent lines would have permitted.
  const w0 = typeof width === "function" ? width(0) : width
  if (w0 <= 0) return []
  if (analysis.totalWidth <= w0 && analysis.newlineIndices.length === 0) return []

  // Split into paragraphs at newlines and process each independently.
  // Note: per-line width is paragraph-LOCAL — line 0 of each paragraph
  // is "line 0" for width purposes. Most callers pass single-paragraph
  // text (titles, labels) so this matches expectations; multi-paragraph
  // callers wanting absolute line indexing should pre-split + offset.
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

    const breaks =
      typeof width === "function"
        ? knuthPlassForParagraphPerLine(analysis, pStart, pEnd, width)
        : knuthPlassForParagraph(analysis, pStart, pEnd, width)
    allBreaks.push(...breaks)

    // Add newline break if not the last paragraph
    if (p < paragraphStarts.length - 1 && pEnd < graphemes.length) {
      allBreaks.push(pEnd + 1) // after the newline
    }
  }

  return allBreaks
}

// ============================================================================
// Wrap-quality penalties
// ============================================================================

/**
 * Minimum visible-character count for a non-final line before the
 * orphan penalty kicks in. A "token" here is loosely "the visible width
 * of the line"; the penalty is tuned for terminal card widths (≈20-40
 * cols), where any line under 8 cols is visually a stranded fragment.
 */
const ORPHAN_MIN_WIDTH = 8

/** Penalty (added to leftover²) for a non-final line below ORPHAN_MIN_WIDTH. */
const ORPHAN_PENALTY = 500

/**
 * Threshold for a hyphenated compound to count as "short" on either side.
 * Breaking inside `cmd-hover` (3-5 split) or `auto-` (4 chars left, 9
 * chars right of the hyphen) reads worse than letting the compound
 * stay intact. Penalty is gentler than the orphan penalty because
 * breaking after a hyphen IS sometimes the right call (long compounds,
 * narrow widths).
 */
const HYPHEN_COMPOUND_MIN_SIDE = 5

/** Penalty (added to leftover²) for a break inside a short hyphenated compound. */
const HYPHEN_COMPOUND_PENALTY = 250

/**
 * Score the *quality* of a non-final wrapped line.
 *
 * Knuth-Plass's classic cost (leftover²) gives the line layout a global
 * raggedness optimum but doesn't know about typographical taboos —
 * single-word "hover" lines, breaks inside short hyphenated compounds
 * like `cmd-hover`, etc. The penalty is added to the squared-leftover
 * cost and tuned so it dominates *only* when the alternative is visually
 * better; if the alternative has worse raggedness, the leftover²
 * differential will still pick the better wrap.
 *
 * Parameters:
 * - `lineStart` — grapheme index where the line begins (a break candidate)
 * - `lineEnd`   — grapheme index where the next line begins (a break candidate)
 * - `trimEnd`   — `lineEnd` after trailing whitespace/ANSI trim (= visible end)
 */
function wrapQualityPenalty(
  analysis: TextAnalysis,
  lineStart: number,
  lineEnd: number,
  trimEnd: number,
): number {
  let penalty = 0
  const { cumWidths, graphemes } = analysis

  // Orphan/widow penalty: tax non-final lines whose visible content is
  // narrower than ORPHAN_MIN_WIDTH. Width is measured between lineStart
  // and trimEnd (= line content without trailing whitespace). This pushes
  // the DP to prefer "TUI" + "(cmd-hover also no-op)" over
  // "TUI (cmd-" + "hover" + "also no-op)" when both fit.
  const visibleWidth = cumWidths[trimEnd]! - cumWidths[lineStart]!
  if (visibleWidth < ORPHAN_MIN_WIDTH) {
    penalty += ORPHAN_PENALTY
  }

  // Hyphen-compound penalty: when the break point lands AFTER a hyphen
  // (graphemes[lineEnd - 1] === '-'), inspect the compound that hyphen
  // belongs to and tax breaks that produce short halves on either side.
  //
  // Compound left half: scan backward from the hyphen, stopping at the
  // previous word boundary or compound separator. Compound right half:
  // scan forward from `lineEnd` (= position after the hyphen) until the
  // next word boundary. If either half is shorter than
  // HYPHEN_COMPOUND_MIN_SIDE, apply the penalty.
  if (lineEnd > 0 && graphemes[lineEnd - 1] === "-") {
    // Left-half length: count non-boundary graphemes immediately before the hyphen.
    let leftLen = 0
    for (let k = lineEnd - 2; k >= 0; k--) {
      const g = graphemes[k]!
      if (g === " " || g === "\t" || g === "-" || g === "\n") break
      leftLen++
      if (leftLen >= HYPHEN_COMPOUND_MIN_SIDE) break
    }

    // Right-half length: count non-boundary graphemes immediately after the hyphen.
    let rightLen = 0
    for (let k = lineEnd; k < graphemes.length; k++) {
      const g = graphemes[k]!
      if (g === " " || g === "\t" || g === "-" || g === "\n") break
      rightLen++
      if (rightLen >= HYPHEN_COMPOUND_MIN_SIDE) break
    }

    if (leftLen < HYPHEN_COMPOUND_MIN_SIDE || rightLen < HYPHEN_COMPOUND_MIN_SIDE) {
      penalty += HYPHEN_COMPOUND_PENALTY
    }
  }

  return penalty
}

/** DP for a single paragraph (no newlines). Constant-width fast path. */
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
      const isLastLine = j === n - 1
      let lineCost = isLastLine ? 0 : leftover * leftover

      if (!isLastLine) {
        lineCost += wrapQualityPenalty(analysis, lineStart, lineEnd, trimEnd)
      }

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
 * DP for a single paragraph (no newlines), per-line width.
 *
 * Forward DP — `f[i]` is the min cost to reach candidate i with `line[i]`
 * tracking the line index of position i in the optimal path. Each segment
 * (j → i) is on line `line[j]`, so its allowed width is `widthFn(line[j])`.
 *
 * O(n² × m) where m is max meaningful line index. For titles n is small
 * (~30 candidates, ~5 lines) so this is trivial. The constant-width path
 * above stays as the fast path for callers that don't need per-line.
 */
function knuthPlassForParagraphPerLine(
  analysis: TextAnalysis,
  pStart: number,
  pEnd: number,
  widthFn: WidthFn,
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

  // Forward DP: f[i] = min cost to reach candidate i; from[i] = optimal predecessor
  // line[i] = line index of candidate i in the optimal path (= breaks taken before i)
  const f = new Array<number>(n).fill(Infinity)
  const from = new Array<number>(n).fill(-1)
  const line = new Array<number>(n).fill(0)
  f[0] = 0
  // line[0] = 0

  for (let i = 1; i < n; i++) {
    const lineEnd = candidates[i]!
    // Trim trailing whitespace on the segment ending at i
    let trimEnd = lineEnd
    while (trimEnd > 0) {
      const prevG = graphemes[trimEnd - 1]
      const prevW = widths[trimEnd - 1]
      if (prevW === 0) {
        trimEnd--
        continue
      }
      if (prevG === " " || prevG === "\t") {
        trimEnd--
        continue
      }
      break
    }
    const trimEndCum = cumWidths[trimEnd]!

    for (let j = 0; j < i; j++) {
      if (f[j] === Infinity) continue
      const lineStart = candidates[j]!
      const lineWidth = trimEndCum - cumWidths[lineStart]!

      // The segment (j → i) is the (line[j])-th line in the optimal path
      // through j (0-indexed). Its allowed width comes from widthFn at that
      // index.
      const segLineIndex = line[j]!
      const allowedWidth = widthFn(segLineIndex)
      if (lineWidth > allowedWidth) continue

      const leftover = allowedWidth - lineWidth
      const isLastLine = i === n - 1
      let lineCost = isLastLine ? 0 : leftover * leftover

      if (!isLastLine) {
        lineCost += wrapQualityPenalty(analysis, lineStart, lineEnd, trimEnd)
      }

      const totalCost = f[j]! + lineCost

      if (totalCost < f[i]!) {
        f[i] = totalCost
        from[i] = j
        line[i] = segLineIndex + 1
      }
    }
  }

  if (f[n - 1] === Infinity) return [] // infeasible — caller falls back to greedy

  // Trace back: collect break candidate indices (excluding sentinel start/end)
  const breaks: number[] = []
  let idx = n - 1
  while (from[idx]! > 0) {
    idx = from[idx]!
    breaks.push(candidates[idx]!)
  }
  breaks.reverse()
  return breaks
}

/**
 * Wrap text using Knuth-Plass optimal breaks.
 * Returns line strings — drop-in replacement for greedy wrap.
 * Falls back to greedy wrapText when DP finds no feasible solution.
 *
 * `width` accepts a constant `number` (uniform width) OR a `WidthFn(lineIndex)`
 * for per-line widths (e.g. line 0 narrowed by a top-right pill, lines 1+
 * full width — CSS-float-equivalent layouts).
 */
export function optimalWrap(
  text: string,
  analysis: TextAnalysis,
  width: number | WidthFn,
): string[] {
  const breaks = knuthPlassBreaks(analysis, width)
  // For greedy fallback, use line-0 width as the conservative single value
  const fallbackWidth = typeof width === "function" ? width(0) : width
  if (breaks.length === 0) {
    // No breaks found — either single line or DP infeasible → fall back to greedy
    if (analysis.totalWidth <= fallbackWidth && analysis.newlineIndices.length === 0) return [text]
    return wrapText(text, fallbackWidth, true, true)
  }

  const { graphemes, widths } = analysis
  const lines: string[] = []
  let lineStart = 0
  // ANSI tokens scanned past while skipping leading whitespace on the next
  // line — carried forward so the styling re-establishes at column 0.
  let pendingAnsiPrefix = ""

  for (const bp of breaks) {
    // Trim trailing whitespace, but CAPTURE zero-width ANSI tokens.
    // Without capture, an ANSI OFF token sitting between the last visible
    // grapheme and the break point falls into the gap [lineEnd, bp) and is
    // silently dropped from the output — the styling state then bleeds
    // into the next line and beyond. Capture preserves source order via
    // prepend (we walk backward).
    let lineEnd = bp
    let trailingAnsi = ""
    while (lineEnd > lineStart) {
      const w = widths[lineEnd - 1]!
      if (w === 0) {
        trailingAnsi = graphemes[lineEnd - 1]! + trailingAnsi
        lineEnd--
        continue
      }
      const g = graphemes[lineEnd - 1]!
      if (g === " " || g === "\t" || g === "\n") {
        lineEnd--
        continue
      }
      break
    }
    lines.push(pendingAnsiPrefix + graphemes.slice(lineStart, lineEnd).join("") + trailingAnsi)
    pendingAnsiPrefix = ""

    // Skip leading whitespace AND zero-width ANSI tokens at line start.
    // Without skipping ANSI, a wrap landing after [ANSI-on][word][ANSI-off]
    // would leave the post-ANSI space as a line-start slug. Symmetric with
    // the trailing-side skip above. ANSI tokens scanned past are preserved
    // as pendingAnsiPrefix so the next line's styling is re-established at
    // column 0 (dropping them would lose color/attributes).
    lineStart = bp
    while (lineStart < graphemes.length) {
      const g = graphemes[lineStart]!
      const w = widths[lineStart]!
      if (g === " " || g === "\t") {
        lineStart++
        continue
      }
      if (w === 0) {
        pendingAnsiPrefix += g
        lineStart++
        continue
      }
      break
    }
  }

  // Last line
  if (lineStart < graphemes.length) {
    lines.push(pendingAnsiPrefix + graphemes.slice(lineStart).join(""))
  } else if (pendingAnsiPrefix !== "") {
    // No content after the last break, but we have stashed ANSI tokens —
    // append them to the last emitted line so styling state isn't lost.
    if (lines.length > 0) {
      lines[lines.length - 1] = lines[lines.length - 1]! + pendingAnsiPrefix
    }
  }

  return lines
}
