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
  isSoftBreakPoint,
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
    } else if (isSoftBreakPoint(g) && i + 1 < len) {
      // Soft-punct (/ \ . _ : ,) emits the break AFTER the punctuation,
      // not before. `commands/run` wraps to `commands/` + `run`, never
      // `commands` + `/run`. This matches chenglou/pretext's convention
      // and avoids the lone-punct-line failure mode (`/` alone on a line).
      // The grapheme itself stays in `currentWordWidth` of the LEFT
      // compound (it belongs visually to the preceding token).
      // Tracking: @km/silvery/15132-pretext-break-kind.
      currentWordWidth += w
      breakIndices.push(i + 1)
      maxWordWidth = Math.max(maxWordWidth, currentWordWidth)
      currentWordWidth = 0
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
 * Options for the Knuth-Plass break selector and `optimalWrap`.
 *
 * - `maxLines`: caps the wrap to ≤ N lines. When the DP can't fit the
 *   text in that budget at the requested width, `knuthPlassBreaks` returns
 *   an empty array (infeasibility signal) and `optimalWrap` falls back to
 *   greedy wrapping clipped to `maxLines` with the final line truncated
 *   and `truncationSuffix` appended.
 *
 * Tracking: @km/silvery/15130-pretext-maxlines-aware. Without `maxLines`
 * the DP behaves exactly as before — same line count, same break points.
 */
export interface PretextOpts {
  /** Maximum number of wrapped lines. Omit for unbounded (default). */
  maxLines?: number
}

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
 * Pass `opts.maxLines` to cap the wrap to ≤ N lines (a 2D DP over
 * candidates × lines-used). When infeasible the function returns `[]`
 * and the caller (`optimalWrap`) is responsible for the truncation
 * fallback.
 *
 * O(breakpoints²) for the constant-width unbounded case;
 * O(breakpoints² × maxLines) for per-line or when `maxLines` is set.
 * All variants are negligible for terminal-scale text.
 */
export function knuthPlassBreaks(
  analysis: TextAnalysis,
  width: number | WidthFn,
  opts?: PretextOpts,
): number[] {
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
  //
  // maxLines semantics with multi-paragraph input: the budget is applied
  // PER-PARAGRAPH. Multi-paragraph callers needing global line capping
  // should pre-split. (Title callers — the primary maxLines consumer —
  // always pass single-paragraph text, so this is a non-issue in practice.)
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
        ? knuthPlassForParagraphPerLine(analysis, pStart, pEnd, width, opts)
        : knuthPlassForParagraph(analysis, pStart, pEnd, width, opts)
    // When maxLines is set and the paragraph is infeasible, the per-
    // paragraph DP returns [] (no breaks) — but the paragraph may still
    // be non-empty (totalWidth > width). The caller (`optimalWrap`)
    // distinguishes "single-line OK" from "infeasible-under-cap" by
    // re-running the line-count check post hoc; signalling infeasibility
    // here would require a separate channel. Keeping the [] convention
    // matches the existing greedy-fallback contract.
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

/**
 * DP for a single paragraph (no newlines). Constant-width.
 *
 * Without `opts.maxLines`: backward 1D DP, `cost[i]` = min cost to reach
 * the end starting at candidate `i`. Final answer = `cost[0]`.
 *
 * With `opts.maxLines`: forward 2D DP, `f[i][k]` = min cost to reach
 * candidate `i` after consuming exactly `k` lines. See
 * `knuthPlassForParagraph2D` below — same shape as the per-line variant
 * but with a constant `width` for every line.
 */
function knuthPlassForParagraph(
  analysis: TextAnalysis,
  pStart: number,
  pEnd: number,
  width: number,
  opts?: PretextOpts,
): number[] {
  if (opts?.maxLines !== undefined) {
    return knuthPlassForParagraph2D(analysis, pStart, pEnd, () => width, opts.maxLines)
  }

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
 *
 * Dispatches to the 2D variant when `opts.maxLines` is set — needed because
 * the optimal path through candidate `i` for line-count `k` may differ from
 * the path for `k+1`, so the single-state `line[]` shortcut is unsafe under
 * a hard line cap.
 */
function knuthPlassForParagraphPerLine(
  analysis: TextAnalysis,
  pStart: number,
  pEnd: number,
  widthFn: WidthFn,
  opts?: PretextOpts,
): number[] {
  if (opts?.maxLines !== undefined) {
    return knuthPlassForParagraph2D(analysis, pStart, pEnd, widthFn, opts.maxLines)
  }

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
 * DP for a single paragraph with a hard line-budget cap.
 *
 * Forward 2D DP — `f[i][k]` = min cost to reach candidate `i` using
 * exactly `k` lines. Transition:
 *
 *   f[i][k+1] = min over j<i of (f[j][k] + lineCost(j → i, line k))
 *
 * The line index `k` is consumed by the (j → i) segment, so its allowed
 * width is `widthFn(k)`. Final answer = `argmin_{k <= maxLines} f[n-1][k]`,
 * with `cost = 0` on the last line (no raggedness penalty on the final
 * line, matching the 1D contracts above).
 *
 * Returns `[]` when no path fits within `maxLines` lines (infeasibility
 * signal — `optimalWrap` falls back to truncation).
 *
 * Complexity: O(n² × maxLines). For terminal titles n ≈ 30 candidates and
 * maxLines ≈ 4-6, so ≤ 5400 ops per paragraph — negligible. Memory: one
 * 2D Float64Array sized `n × (maxLines + 1)`.
 *
 * Tracking: @km/silvery/15130-pretext-maxlines-aware.
 */
function knuthPlassForParagraph2D(
  analysis: TextAnalysis,
  pStart: number,
  pEnd: number,
  widthFn: WidthFn,
  maxLines: number,
): number[] {
  if (maxLines <= 0) return []

  const { cumWidths, breakIndices, widths, graphemes } = analysis

  // Build candidates for this paragraph
  const candidates: number[] = [pStart]
  for (const bp of breakIndices) {
    if (bp > pStart && bp <= pEnd) candidates.push(bp)
  }
  candidates.push(pEnd)

  const n = candidates.length
  if (n <= 2) {
    // Single segment, no breaks needed — but still subject to the line cap.
    // A 1-line wrap is always feasible under maxLines >= 1.
    return []
  }

  // K = maxLines + 1 (so we index k = 0..maxLines).
  // f[i * K + k] = min cost to reach candidate i using exactly k lines.
  // from[i * K + k] = predecessor candidate index (-1 if unreached).
  // fromK[i * K + k] = predecessor line count (= k - 1) — stored
  // for symmetry with from[]; both make traceback trivial.
  const K = maxLines + 1
  const f = new Float64Array(n * K).fill(Infinity)
  const from = new Int32Array(n * K).fill(-1)
  // f[(0 * K) + 0] = state "reached candidate 0 using 0 lines"
  f[0] = 0

  // Pre-compute trimEnd for each candidate (the visible end of a line
  // ending at that candidate — strips trailing whitespace and ANSI).
  const trimEnds = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const lineEnd = candidates[i]!
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
    trimEnds[i] = trimEnd
  }

  // Forward DP: for each (j, k) state with finite cost, extend to every i > j
  // landing at line count k+1.
  for (let j = 0; j < n - 1; j++) {
    const lineStart = candidates[j]!
    const lineStartCum = cumWidths[lineStart]!

    for (let k = 0; k < maxLines; k++) {
      const fjk = f[j * K + k]!
      if (fjk === Infinity) continue
      const allowedWidth = widthFn(k)
      if (allowedWidth <= 0) continue

      for (let i = j + 1; i < n; i++) {
        const lineEnd = candidates[i]!
        const trimEnd = trimEnds[i]!
        const lineWidth = cumWidths[trimEnd]! - lineStartCum

        // Constant-width fast-path optimization: when widthFn returns the
        // same value for every line, candidates are visited in ascending
        // order of cumWidths, so once a candidate's width exceeds the
        // allowed width all subsequent ones do too. With per-line widths
        // we can't break — `continue` is the safe move. (The performance
        // cost is small at terminal scales.)
        if (lineWidth > allowedWidth) continue

        const leftover = allowedWidth - lineWidth
        const isLastLine = i === n - 1
        let lineCost = isLastLine ? 0 : leftover * leftover

        if (!isLastLine) {
          lineCost += wrapQualityPenalty(analysis, lineStart, lineEnd, trimEnd)
        }

        const total = fjk + lineCost
        const target = i * K + (k + 1)
        if (total < f[target]!) {
          f[target] = total
          from[target] = j
        }
      }
    }
  }

  // Pick the best terminal state — min f[n-1][k] over k = 1..maxLines.
  let bestK = -1
  let bestCost = Infinity
  for (let k = 1; k <= maxLines; k++) {
    const c = f[(n - 1) * K + k]!
    if (c < bestCost) {
      bestCost = c
      bestK = k
    }
  }
  if (bestK === -1 || bestCost === Infinity) return [] // infeasible under cap

  // Trace back: walk from (n-1, bestK) to (0, 0) using `from`.
  const breaks: number[] = []
  let curI = n - 1
  let curK = bestK
  while (curK > 0) {
    const prev = from[curI * K + curK]!
    if (prev < 0) break // safety; shouldn't happen with bestCost finite
    if (prev > 0) breaks.push(candidates[prev]!)
    curI = prev
    curK = curK - 1
  }
  breaks.reverse()
  return breaks
}

/**
 * Options for `optimalWrap`. Extends `PretextOpts` with caller-side
 * presentation knobs (truncation suffix on overflow).
 */
export interface OptimalWrapOpts extends PretextOpts {
  /**
   * Suffix appended to the final visible line when `maxLines` is exceeded
   * and the wrap falls back to truncation. Default is `"…"` (single
   * horizontal-ellipsis). Set to `""` to truncate without a suffix.
   *
   * The suffix is counted against the available width when truncating —
   * the last line is cut so that `displayLength(head + suffix) <= width`.
   */
  truncationSuffix?: string
}

/**
 * Wrap text using Knuth-Plass optimal breaks.
 * Returns line strings — drop-in replacement for greedy wrap.
 * Falls back to greedy wrapText when DP finds no feasible solution.
 *
 * `width` accepts a constant `number` (uniform width) OR a `WidthFn(lineIndex)`
 * for per-line widths (e.g. line 0 narrowed by a top-right pill, lines 1+
 * full width — CSS-float-equivalent layouts).
 *
 * `opts.maxLines` caps the wrap to ≤ N lines. When the DP can't fit the
 * text in that budget, falls back to a greedy wrap clipped to `maxLines`
 * with the final visible line truncated (head trimmed at a grapheme
 * boundary so `head + truncationSuffix` fits within the budget). Default
 * suffix is `"…"`.
 *
 * Tracking: @km/silvery/15130-pretext-maxlines-aware.
 */
export function optimalWrap(
  text: string,
  analysis: TextAnalysis,
  width: number | WidthFn,
  opts?: OptimalWrapOpts,
): string[] {
  const maxLines = opts?.maxLines
  const truncationSuffix = opts?.truncationSuffix ?? "…"
  const breaks = knuthPlassBreaks(
    analysis,
    width,
    maxLines !== undefined ? { maxLines } : undefined,
  )
  // For greedy fallback, use line-0 width as the conservative single value
  const fallbackWidth = typeof width === "function" ? width(0) : width
  if (breaks.length === 0) {
    // No breaks — either single-line, multi-line-infeasible, OR DP infeasible
    // under `maxLines` cap. Disambiguate via line-count check.
    const singleLine = analysis.totalWidth <= fallbackWidth && analysis.newlineIndices.length === 0
    if (singleLine) return [text]
    const greedy = wrapText(text, fallbackWidth, true, true)
    if (maxLines !== undefined && greedy.length > maxLines) {
      return clampToMaxLines(greedy, maxLines, fallbackWidth, truncationSuffix)
    }
    return greedy
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

  // Defensive: the DP enforces `maxLines` by construction, but if a future
  // edit introduces a path where breaks > maxLines - 1 leaks through (e.g.
  // multi-paragraph callers passing newlines), clamp + ellipsize here so
  // the contract "≤ maxLines visible rows" is honored unconditionally.
  if (maxLines !== undefined && lines.length > maxLines) {
    return clampToMaxLines(lines, maxLines, fallbackWidth, truncationSuffix)
  }

  return lines
}

/**
 * Clamp a wrapped output to `maxLines` rows. The final visible line is
 * truncated so that `head + suffix` fits within `width`; the head is cut
 * at a grapheme-aware boundary (using `splitGraphemesAnsiAware` to keep
 * ANSI tokens intact).
 *
 * Used by `optimalWrap` when the DP cannot satisfy `opts.maxLines` and
 * falls back to greedy + truncate, AND as a defensive net at the end of
 * `optimalWrap` (the DP already enforces the cap by construction).
 *
 * Tracking: @km/silvery/15130-pretext-maxlines-aware.
 */
function clampToMaxLines(
  lines: string[],
  maxLines: number,
  width: number,
  suffix: string,
): string[] {
  if (lines.length <= maxLines) return lines
  if (maxLines <= 0) return []
  const kept = lines.slice(0, maxLines)
  const lastIdx = maxLines - 1
  const last = kept[lastIdx]!
  kept[lastIdx] = appendTruncationSuffix(last, width, suffix)
  return kept
}

/**
 * Append `suffix` to `line`, trimming graphemes off the visible end if
 * needed so that `displayLength(line + suffix) <= width`. ANSI tokens
 * (zero-width) are preserved across the truncation boundary so styling
 * state isn't dropped.
 *
 * If `suffix` itself is wider than `width`, returns just the suffix
 * (truncated to width via the same grapheme walk). Callers using a
 * pathological width should size-check on their side.
 */
function appendTruncationSuffix(line: string, width: number, suffix: string): string {
  if (width <= 0) return ""
  // Fast path: line already fits with suffix appended.
  const suffixGraphemes = splitGraphemesAnsiAware(suffix)
  const suffixWidth = suffixGraphemes.reduce((acc, g) => acc + defaultGraphemeWidth(g), 0)

  const lineGraphemes = splitGraphemesAnsiAware(line)
  const lineWidth = lineGraphemes.reduce((acc, g) => acc + defaultGraphemeWidth(g), 0)

  if (lineWidth + suffixWidth <= width) return line + suffix

  // Walk backward over visible graphemes, dropping until head + suffix fits.
  // ANSI tokens are preserved — we only count visible width but keep all
  // tokens in source order (so trailing styling-off sequences survive).
  const budget = Math.max(0, width - suffixWidth)
  let acc = 0
  let cutoff = 0
  for (let i = 0; i < lineGraphemes.length; i++) {
    const g = lineGraphemes[i]!
    const w = defaultGraphemeWidth(g)
    if (acc + w > budget) break
    acc += w
    cutoff = i + 1
  }
  // Capture any trailing zero-width ANSI tokens that sit just past the cutoff,
  // so styling-off sequences aren't dropped at the truncation boundary.
  let tail = ""
  for (let i = cutoff; i < lineGraphemes.length; i++) {
    if (defaultGraphemeWidth(lineGraphemes[i]!) === 0) {
      tail += lineGraphemes[i]
    } else {
      break
    }
  }
  return lineGraphemes.slice(0, cutoff).join("") + tail + suffix
}
