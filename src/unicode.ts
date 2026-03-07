/**
 * Unicode handling for Hightea.
 *
 * Uses Intl.Segmenter for proper grapheme cluster segmentation and
 * string-width for accurate terminal width calculation.
 *
 * Key concepts:
 * - Grapheme: A user-perceived character (may be multiple code points)
 * - Display width: How many terminal columns a character occupies (0, 1, or 2)
 * - Wide characters: CJK ideographs, emoji, etc. that take 2 columns
 * - Combining characters: Diacritics, emoji modifiers that take 0 columns
 */

import { BG_OVERRIDE_CODE } from "@hightea/ansi"
import sliceAnsi from "slice-ansi"
import stringWidth from "string-width"
import { type Cell, type Style, type TerminalBuffer, type UnderlineStyle, createMutableCell } from "./buffer.js"
import { isPrivateUseArea } from "./text-sizing.js"

// Re-export for consumers of hightea
export { BG_OVERRIDE_CODE }

// ============================================================================
// Grapheme Segmentation
// ============================================================================

// Singleton Intl.Segmenter instance (stateless, reusable)
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

// ============================================================================
// Performance: LRU Cache for displayWidth
// ============================================================================

/**
 * Simple LRU cache for displayWidth results.
 * String width calculation is expensive (~8us for ASCII text),
 * but the same strings are often measured repeatedly.
 */
class DisplayWidthCache {
  private cache = new Map<string, number>()
  private maxSize: number

  constructor(maxSize = 1000) {
    this.maxSize = maxSize
  }

  get(text: string): number | undefined {
    const cached = this.cache.get(text)
    if (cached !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(text)
      this.cache.set(text, cached)
    }
    return cached
  }

  set(text: string, width: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(text, width)
  }

  clear(): void {
    this.cache.clear()
  }
}

// Cache size: 10K entries should be enough for most TUI apps
// Each entry is a string key + number value, ~100 bytes, so 10K = ~1MB
const displayWidthCache = new DisplayWidthCache(10000)

// ============================================================================
// Text Sizing Protocol (OSC 66) State
// ============================================================================

/**
 * Default text-presentation emoji width: true (modern terminal assumption).
 * Modern terminals (Ghostty, iTerm, Kitty) render text-presentation emoji
 * as 2-wide. Terminal.app renders them as 1-wide.
 */
const DEFAULT_TEXT_EMOJI_WIDE = true

/**
 * Default text sizing mode: false.
 * When enabled via a Measurer, PUA characters are treated as 2-wide.
 */
const DEFAULT_TEXT_SIZING_ENABLED = false

// ============================================================================
// Scoped Measurer (pipeline execution context)
// ============================================================================

/**
 * Active measurer for the current pipeline execution.
 * Set by runWithMeasurer() during executeRender, restored after.
 * When null, module-level functions use the lazy default measurer.
 */
let _scopedMeasurer: WidthMeasurer | null = null

/**
 * Run a function with a specific measurer as the active scope.
 * Module-level convenience functions (graphemeWidth, displayWidth, etc.)
 * will use this measurer instead of the lazy default for the duration.
 */
export function runWithMeasurer<T>(measurer: WidthMeasurer, fn: () => T): T {
  const prev = _scopedMeasurer
  _scopedMeasurer = measurer
  try {
    return fn()
  } finally {
    _scopedMeasurer = prev
  }
}

/**
 * @deprecated Use createWidthMeasurer() with { textEmojiWide } instead.
 * Kept for backward compatibility but is a no-op.
 */
export function setTextEmojiWide(_wide: boolean): void {
  // No-op: use createWidthMeasurer() with { textEmojiWide } instead
}

/**
 * @deprecated Use createWidthMeasurer() with { textSizingEnabled } instead.
 * Kept for backward compatibility but is a no-op.
 */
export function setTextSizingEnabled(_enabled: boolean): void {
  // No-op: use createWidthMeasurer() with { textSizingEnabled } instead
}

/**
 * Check if text sizing mode is currently enabled.
 * Returns the default (false) since globals have been removed.
 * Use measurer.textSizingEnabled for scoped queries.
 */
export function isTextSizingEnabled(): boolean {
  if (_scopedMeasurer) return _scopedMeasurer.textSizingEnabled
  return DEFAULT_TEXT_SIZING_ENABLED
}

// ============================================================================
// Width Measurer (per-term instance, no globals)
// ============================================================================

/**
 * Width measurement functions scoped to specific terminal capabilities.
 * Created by createWidthMeasurer() from TerminalCaps.
 */
export interface Measurer {
  readonly textEmojiWide: boolean
  readonly textSizingEnabled: boolean
  displayWidth(text: string): number
  displayWidthAnsi(text: string): number
  graphemeWidth(grapheme: string): number
  wrapText(text: string, width: number, trim?: boolean, hard?: boolean): string[]
  sliceByWidth(text: string, maxWidth: number): string
  sliceByWidthFromEnd(text: string, maxWidth: number): string
}

/** Backward-compatible alias for Measurer. */
export type WidthMeasurer = Measurer

/**
 * Strip OSC 8 hyperlink sequences before passing to slice-ansi.
 * slice-ansi doesn't understand OSC sequences and corrupts them.
 */
const OSC8_RE = /\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g
function stripOsc8ForSlice(text: string): string {
  return text.replace(OSC8_RE, "")
}

/**
 * Create a width measurer scoped to terminal capabilities.
 * Each measurer has its own caches (no shared global state).
 */
export function createWidthMeasurer(caps: { textEmojiWide?: boolean; textSizingEnabled?: boolean } = {}): Measurer {
  const textEmojiWide = caps.textEmojiWide ?? true
  const textSizingEnabled = caps.textSizingEnabled ?? false
  const cache = new DisplayWidthCache(10000)

  function measuredGraphemeWidth(grapheme: string): number {
    const width = stringWidth(grapheme)
    if (width !== 1) return width
    if (textEmojiWide && isTextPresentationEmoji(grapheme)) return 2
    if (textSizingEnabled) {
      const cp = grapheme.codePointAt(0)
      if (cp !== undefined && isPrivateUseArea(cp)) return 2
    }
    return width
  }

  function measuredDisplayWidth(text: string): number {
    const cached = cache.get(text)
    if (cached !== undefined) return cached

    let width: number
    const needsSlowPath = MAY_CONTAIN_TEXT_EMOJI.test(text) || (textSizingEnabled && MAY_CONTAIN_PUA.test(text))
    if (!needsSlowPath) {
      width = stringWidth(text)
    } else {
      const stripped = stripAnsi(text)
      width = 0
      for (const grapheme of splitGraphemes(stripped)) {
        width += measuredGraphemeWidth(grapheme)
      }
    }
    cache.set(text, width)
    return width
  }

  function measuredDisplayWidthAnsi(text: string): number {
    return measuredDisplayWidth(stripAnsi(text))
  }

  function measuredSliceByWidth(text: string, maxWidth: number): string {
    if (hasAnsi(text)) {
      return sliceAnsi(stripOsc8ForSlice(text), 0, maxWidth)
    }
    let width = 0
    let result = ""
    const graphemes = splitGraphemes(text)
    for (const grapheme of graphemes) {
      const gWidth = measuredGraphemeWidth(grapheme)
      if (width + gWidth > maxWidth) break
      result += grapheme
      width += gWidth
    }
    return result
  }

  function measuredSliceByWidthFromEnd(text: string, maxWidth: number): string {
    const totalWidth = measuredDisplayWidthAnsi(text)
    if (totalWidth <= maxWidth) return text
    if (hasAnsi(text)) {
      const cleaned = stripOsc8ForSlice(text)
      const cleanedWidth = measuredDisplayWidthAnsi(cleaned)
      const startIndex = cleanedWidth - maxWidth
      return sliceAnsi(cleaned, startIndex)
    }
    const graphemes = splitGraphemes(text)
    let width = 0
    let startIdx = graphemes.length
    for (let i = graphemes.length - 1; i >= 0; i--) {
      const gWidth = measuredGraphemeWidth(graphemes[i]!)
      if (width + gWidth > maxWidth) break
      width += gWidth
      startIdx = i
    }
    return graphemes.slice(startIdx).join("")
  }

  function measuredWrapText(text: string, width: number, trim?: boolean, hard?: boolean): string[] {
    return wrapTextWithMeasurer(text, width, measurer, trim ?? false, hard ?? false)
  }

  const measurer: Measurer = {
    textEmojiWide,
    textSizingEnabled,
    displayWidth: measuredDisplayWidth,
    displayWidthAnsi: measuredDisplayWidthAnsi,
    graphemeWidth: measuredGraphemeWidth,
    wrapText: measuredWrapText,
    sliceByWidth: measuredSliceByWidth,
    sliceByWidthFromEnd: measuredSliceByWidthFromEnd,
  }

  return measurer
}

/** Alias for createWidthMeasurer. */
export const createMeasurer = createWidthMeasurer

// ============================================================================
// Default Measurer (lazy singleton for module-level convenience functions)
// ============================================================================

let _defaultMeasurer: Measurer | undefined

/** Get the default measurer (lazy init, uses default caps). */
function getDefaultMeasurer(): Measurer {
  if (!_defaultMeasurer) {
    _defaultMeasurer = createWidthMeasurer()
  }
  return _defaultMeasurer
}

/**
 * @deprecated Use createWidthMeasurer() and pass the measurer explicitly.
 * Kept as a no-op for backward compatibility.
 */
export function withMeasurer<T>(_measurer: WidthMeasurer, fn: () => T): T {
  return fn()
}

/**
 * Split a string into grapheme clusters.
 * Each grapheme is a user-perceived character that may consist of
 * multiple Unicode code points.
 *
 * Examples:
 * - "cafe\u0301" (café with combining accent) -> ["c", "a", "f", "e\u0301"]
 * - "👨‍👩‍👧" (family emoji) -> ["👨‍👩‍👧"]
 * - "한국어" -> ["한", "국", "어"]
 */
export function splitGraphemes(text: string): string[] {
  return [...segmenter.segment(text)].map((s) => s.segment)
}

/**
 * Count the number of graphemes in a string.
 */
export function graphemeCount(text: string): number {
  let count = 0
  for (const _ of segmenter.segment(text)) count++
  return count
}

// ============================================================================
// Emoji Width Correction
// ============================================================================

/**
 * Regex for Extended_Pictographic characters that have default text presentation.
 * These characters are reported as width 1 by string-width (per Unicode EAW),
 * but most modern terminals render them as 2 columns wide using emoji glyphs.
 *
 * Specifically: Extended_Pictographic AND NOT Emoji_Presentation.
 * Examples: ⚠ (U+26A0), ☑ (U+2611), ✈ (U+2708), ❤ (U+2764)
 * Counter-examples: 📁 (U+1F4C1) has Emoji_Presentation so string-width is correct.
 *
 * Uses the RGI_Emoji regex with VS16 to detect characters that support
 * emoji presentation -- if char+VS16 is RGI emoji, the terminal likely
 * renders the bare char as 2-wide.
 */
const TEXT_PRESENTATION_EMOJI_REGEX = /^\p{Extended_Pictographic}$/u
const EMOJI_PRESENTATION_REGEX = /^\p{Emoji_Presentation}$/u
// @ts-expect-error -- RGI_Emoji v flag needs es2024 target but works at runtime
const RGI_EMOJI_REGEX = /^\p{RGI_Emoji}$/v

/**
 * Cache for isTextPresentationEmoji results.
 * Maps first code point to boolean.
 */
const textPresentationEmojiCache = new Map<number, boolean>()

/**
 * Check if a grapheme is a text-presentation emoji that terminals render wide.
 *
 * Returns true for characters that are Extended_Pictographic, do NOT have
 * the Emoji_Presentation property, but become RGI emoji when followed by
 * VS16 (U+FE0F). These characters are rendered as 2 columns in most
 * modern terminals despite string-width reporting width 1.
 */
function isTextPresentationEmoji(grapheme: string): boolean {
  const cp = grapheme.codePointAt(0)
  if (cp === undefined) return false

  // Check cache
  const cached = textPresentationEmojiCache.get(cp)
  if (cached !== undefined) return cached

  // Multi-codepoint graphemes (with VS16, ZWJ, etc.) are already handled
  // correctly by string-width. Only check single-codepoint graphemes.
  const singleChar = String.fromCodePoint(cp)
  if (singleChar.length !== grapheme.length) {
    textPresentationEmojiCache.set(cp, false)
    return false
  }

  // Must be Extended_Pictographic but NOT Emoji_Presentation
  const isExtPict = TEXT_PRESENTATION_EMOJI_REGEX.test(grapheme)
  const isEmojiPres = EMOJI_PRESENTATION_REGEX.test(grapheme)
  if (!isExtPict || isEmojiPres) {
    textPresentationEmojiCache.set(cp, false)
    return false
  }

  // Check if adding VS16 makes it an RGI emoji sequence
  const withVs16 = grapheme + "\uFE0F"
  const result = RGI_EMOJI_REGEX.test(withVs16)
  textPresentationEmojiCache.set(cp, result)
  return result
}

// ============================================================================
// Private Use Area (PUA) — Nerdfont / Powerline Icons
// ============================================================================

/**
 * Append VS16 (U+FE0F) to emoji characters that have default text presentation.
 *
 * Use this to normalize icon characters for consistent terminal rendering.
 * Characters that already have emoji presentation or VS16 are returned unchanged.
 *
 * @example
 * ```ts
 * ensureEmojiPresentation('⚠')  // '⚠\uFE0F' (⚠️)
 * ensureEmojiPresentation('☑')  // '☑\uFE0F' (☑️)
 * ensureEmojiPresentation('☐')  // '☐' (unchanged, not an emoji)
 * ensureEmojiPresentation('📁') // '📁' (unchanged, already emoji presentation)
 * ```
 */
export function ensureEmojiPresentation(char: string): string {
  if (char.includes("\uFE0F")) return char // Already has VS16
  if (isTextPresentationEmoji(char)) return char + "\uFE0F"
  return char
}

// ============================================================================
// Display Width Calculation
// ============================================================================

/**
 * Regex to detect strings that MAY contain text-presentation emoji.
 * Used as a fast pre-check before the more expensive grapheme-based calculation.
 * Covers the Unicode blocks where Extended_Pictographic characters live:
 * - Miscellaneous Technical (U+2300-U+23FF)
 * - Miscellaneous Symbols (U+2600-U+26FF)
 * - Dingbats (U+2700-U+27BF)
 * - Miscellaneous Symbols and Arrows (U+2B00-U+2BFF)
 * - Other scattered ranges
 */
const MAY_CONTAIN_TEXT_EMOJI =
  /[\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u2328\u23CF\u23ED-\u23EF\u23F1\u23F2\u23F8-\u23FA\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26A7\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26C8\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]/

/**
 * Fast pre-check regex for BMP Private Use Area characters (U+E000-U+F8FF).
 * Used to gate the slow grapheme-by-grapheme path when text sizing is enabled.
 */
const MAY_CONTAIN_PUA = /[\uE000-\uF8FF]/

/**
 * Get the display width of a string (number of terminal columns).
 * Uses string-width which handles:
 * - Wide characters (CJK) -> 2 columns
 * - Regular ASCII -> 1 column
 * - Zero-width characters (combining, ZWJ) -> 0 columns
 * - Emoji -> varies (1 or 2)
 * - ANSI escape sequences -> 0 columns (stripped)
 *
 * Corrects string-width for text-presentation emoji characters
 * (e.g., ⚠ U+26A0) that terminals render as 2 columns wide.
 *
 * Results are cached for performance.
 */
export function displayWidth(text: string): number {
  if (_scopedMeasurer) return _scopedMeasurer.displayWidth(text)
  // Check cache first
  const cached = displayWidthCache.get(text)
  if (cached !== undefined) {
    return cached
  }

  let width: number
  // Fast path: if text cannot contain text-presentation emoji, use string-width directly.
  // Default measurer does not enable text sizing, so PUA check uses the constant default.
  const needsSlowPath = MAY_CONTAIN_TEXT_EMOJI.test(text) || (DEFAULT_TEXT_SIZING_ENABLED && MAY_CONTAIN_PUA.test(text))
  if (!needsSlowPath) {
    width = stringWidth(text)
  } else {
    // Slow path: strip ANSI codes first (they'd inflate the grapheme count),
    // then split into graphemes and sum corrected widths
    const stripped = stripAnsi(text)
    width = 0
    for (const grapheme of splitGraphemes(stripped)) {
      width += graphemeWidth(grapheme)
    }
  }

  displayWidthCache.set(text, width)
  return width
}

/**
 * Get the display width of a single grapheme.
 *
 * Overrides string-width for characters that are Extended_Pictographic with
 * default text presentation. These characters (e.g., ⚠ U+26A0, ☑ U+2611)
 * are reported as width 1 by string-width (per Unicode EAW tables), but most
 * modern terminals render them as 2 columns wide using emoji glyphs.
 *
 * The mismatch causes text after these characters to be placed at the wrong
 * column, leading to truncation or overlap.
 */
export function graphemeWidth(grapheme: string): number {
  if (_scopedMeasurer) return _scopedMeasurer.graphemeWidth(grapheme)
  const width = stringWidth(grapheme)
  // If string-width already says 2 (or 0), trust it
  if (width !== 1) return width
  // Check if this is a text-presentation emoji that terminals render wide.
  // Uses DEFAULT_TEXT_EMOJI_WIDE (true) — assumes modern terminal.
  if (DEFAULT_TEXT_EMOJI_WIDE && isTextPresentationEmoji(grapheme)) return 2
  // Default module-level function does not enable text sizing.
  // Scoped measurers handle PUA via their own graphemeWidth.
  if (DEFAULT_TEXT_SIZING_ENABLED) {
    const cp = grapheme.codePointAt(0)
    if (cp !== undefined && isPrivateUseArea(cp)) return 2
  }
  return width
}

/**
 * Check if a grapheme is a wide character (takes 2 columns).
 */
export function isWideGrapheme(grapheme: string): boolean {
  return graphemeWidth(grapheme) === 2
}

/**
 * Check if a grapheme is zero-width (combining character, ZWJ, etc.).
 */
export function isZeroWidthGrapheme(grapheme: string): boolean {
  return stringWidth(grapheme) === 0
}

// ============================================================================
// Text Manipulation
// ============================================================================

/**
 * Truncate a string to fit within a given display width.
 * Handles wide characters and ANSI escape sequences (including OSC 8 hyperlinks) correctly.
 *
 * @param text - The text to truncate (may contain ANSI escape sequences)
 * @param maxWidth - Maximum display width
 * @param ellipsis - Ellipsis to append if truncated (default: "...")
 * @returns Truncated string
 */
export function truncateText(
  text: string,
  maxWidth: number,
  ellipsis = "\u2026", // Unicode ellipsis (single character)
): string {
  const textWidth = displayWidth(text)

  // No truncation needed
  if (textWidth <= maxWidth) {
    return text
  }

  const ellipsisWidth = displayWidth(ellipsis)
  const targetWidth = maxWidth - ellipsisWidth

  if (targetWidth <= 0) {
    // Not enough space for even the ellipsis
    return maxWidth > 0 ? ellipsis.slice(0, maxWidth) : ""
  }

  // Use ANSI-aware grapheme splitting when text contains escape sequences
  // (including OSC 8 hyperlinks) to avoid counting escape bytes as visible width.
  const graphemes = hasAnsi(text) ? splitGraphemesAnsiAware(text) : splitGraphemes(text)
  let result = ""
  let currentWidth = 0

  for (const grapheme of graphemes) {
    const gWidth = graphemeWidth(grapheme)
    if (currentWidth + gWidth > targetWidth) {
      break
    }
    result += grapheme
    currentWidth += gWidth
  }

  return result + ellipsis
}

/**
 * Pad a string to a given display width.
 *
 * @param text - The text to pad
 * @param width - Target display width
 * @param align - Alignment: 'left', 'right', or 'center'
 * @param padChar - Character to use for padding (default: space)
 * @returns Padded string
 */
export function padText(
  text: string,
  width: number,
  align: "left" | "right" | "center" = "left",
  padChar = " ",
): string {
  const textWidth = displayWidth(text)
  const padWidth = width - textWidth

  if (padWidth <= 0) {
    return text
  }

  const padCharWidth = displayWidth(padChar)
  if (padCharWidth === 0) {
    // Can't pad with zero-width characters
    return text
  }

  // Calculate number of pad characters needed
  const padCount = Math.floor(padWidth / padCharWidth)

  switch (align) {
    case "left":
      return text + padChar.repeat(padCount)
    case "right":
      return padChar.repeat(padCount) + text
    case "center": {
      const leftPad = Math.floor(padCount / 2)
      const rightPad = padCount - leftPad
      return padChar.repeat(leftPad) + text + padChar.repeat(rightPad)
    }
  }
}

/**
 * Constrain text to width and height limits.
 * Combines wrapping and truncation to fit text in a box.
 *
 * @param text - Text to constrain (may contain ANSI codes)
 * @param width - Maximum display width per line
 * @param maxLines - Maximum number of lines
 * @param pad - If true, pad lines to full width
 * @param ellipsis - Custom ellipsis character (default: "…")
 * @returns Object with lines array and truncated flag
 */
export function constrainText(
  text: string,
  width: number,
  maxLines: number,
  pad = false,
  ellipsis = "…",
): { lines: string[]; truncated: boolean } {
  const allLines = wrapText(text, width)
  const truncated = allLines.length > maxLines
  let lines = allLines.slice(0, maxLines)

  if (truncated && lines.length > 0) {
    const lastIdx = lines.length - 1
    const lastLine = lines[lastIdx]
    if (lastLine) {
      const ellipsisLen = displayWidth(ellipsis)
      const lastLineLen = displayWidth(lastLine)
      if (lastLineLen + ellipsisLen <= width) {
        lines[lastIdx] = lastLine + ellipsis
      } else {
        lines[lastIdx] = truncateText(lastLine, width, ellipsis)
      }
    }
  }

  if (pad) {
    lines = lines.map((line) => padText(line, width))
  }

  return { lines, truncated }
}

/**
 * Check if a grapheme is a word boundary character (space, hyphen, etc.)
 */
function isWordBoundary(grapheme: string): boolean {
  // Common word boundary characters
  return grapheme === " " || grapheme === "-" || grapheme === "\t"
}

/**
 * Look ahead from a space to check if the next word is a single-character
 * operator (like +, =, *, /, etc.) followed by another space. Breaking before
 * such operators looks bad — e.g. "$12k\n+ $400" — so we suppress the break
 * point to keep the operator with its left operand.
 *
 * Accepts an explicit graphemeWidth function so it works with both the
 * module-level default and per-measurer instances.
 */
function isBreakBeforeOperatorWith(graphemes: string[], spaceIndex: number, gWidthFn: (g: string) => number): boolean {
  // Look for pattern: [current space] [operator] [space]
  // spaceIndex is the index of the current space in the graphemes array
  let j = spaceIndex + 1
  // Skip any zero-width characters (ANSI escapes)
  while (j < graphemes.length && gWidthFn(graphemes[j]!) === 0) j++
  if (j >= graphemes.length) return false
  const nextChar = graphemes[j]!
  // Must be a single visible character that is not alphanumeric or space
  if (gWidthFn(nextChar) !== 1) return false
  if (/^[a-zA-Z0-9\s]$/.test(nextChar)) return false
  // Check that it's followed by a space (it's an infix operator, not a prefix)
  let k = j + 1
  while (k < graphemes.length && gWidthFn(graphemes[k]!) === 0) k++
  if (k >= graphemes.length) return false
  return graphemes[k] === " "
}

/**
 * Check if a grapheme can break anywhere (CJK characters).
 * CJK text doesn't use spaces between words, so any character boundary is valid.
 */
function canBreakAnywhere(grapheme: string): boolean {
  return isCJK(grapheme)
}

// ANSI CSI pattern: ESC [ (params) (letter)
const ANSI_CSI_RE = /^\x1b\[[0-9;:?]*[A-Za-z]/
// ANSI OSC pattern: ESC ] ... (BEL or ST)
const ANSI_OSC_RE = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/
// Single-char escape: ESC followed by one letter
const ANSI_SINGLE_RE = /^\x1b[DME78(B]/

/**
 * Split text into graphemes, keeping ANSI escape sequences as single zero-width tokens.
 * Without this, `splitGraphemes` would split `\x1b[38;5;1m` into individual characters
 * like `[`, `3`, `8`, `;`, etc., each consuming display width.
 */
function splitGraphemesAnsiAware(text: string): string[] {
  if (!hasAnsi(text)) {
    return splitGraphemes(text)
  }

  const result: string[] = []
  let pos = 0

  while (pos < text.length) {
    if (text[pos] === "\x1b") {
      // Try to match an ANSI sequence starting at pos
      const remaining = text.slice(pos)
      const csi = remaining.match(ANSI_CSI_RE)
      if (csi) {
        result.push(csi[0])
        pos += csi[0].length
        continue
      }
      const osc = remaining.match(ANSI_OSC_RE)
      if (osc) {
        result.push(osc[0])
        pos += osc[0].length
        continue
      }
      const single = remaining.match(ANSI_SINGLE_RE)
      if (single) {
        result.push(single[0])
        pos += single[0].length
        continue
      }
    }

    // Find the next ESC or end of string
    const nextEsc = text.indexOf("\x1b", pos + 1)
    const chunk = nextEsc === -1 ? text.slice(pos) : text.slice(pos, nextEsc)

    // Split this non-ANSI chunk into graphemes
    for (const g of splitGraphemes(chunk)) {
      result.push(g)
    }
    pos += chunk.length
  }

  return result
}

/**
 * Wrap text to fit within a given width.
 *
 * Implements word-boundary wrapping:
 * 1. Breaks at word boundaries (spaces, hyphens) when possible
 * 2. Falls back to character wrap only when necessary (very long words)
 * 3. Handles CJK text properly (can break anywhere since CJK has no word spaces)
 * 4. Preserves intentional line breaks
 *
 * @param text - The text to wrap (may contain ANSI escape sequences)
 * @param width - Maximum display width per line
 * @param preserveNewlines - Whether to preserve existing newlines
 * @param trim - Trim trailing spaces on broken lines and skip leading spaces on continuation lines (useful for rendering)
 * @returns Array of wrapped lines
 */
export function wrapText(text: string, width: number, preserveNewlines = true, trim = false): string[] {
  return wrapTextWithMeasurer(text, width, _scopedMeasurer ?? undefined, trim, false, preserveNewlines)
}

/**
 * Internal: wrap text using an explicit measurer for grapheme width calculations.
 * When measurer is undefined, falls back to the module-level graphemeWidth.
 */
function wrapTextWithMeasurer(
  text: string,
  width: number,
  measurer: Measurer | undefined,
  trim = false,
  _hard = false,
  preserveNewlines = true,
): string[] {
  if (width <= 0) {
    return []
  }

  const gWidthFn = measurer ? measurer.graphemeWidth.bind(measurer) : graphemeWidth

  const lines: string[] = []

  // Split by newlines first if preserving
  const inputLines = preserveNewlines ? text.split("\n") : [text.replace(/\n/g, " ")]

  for (const line of inputLines) {
    // Handle empty lines
    if (line === "") {
      lines.push("")
      continue
    }

    // If the line contains ANSI escape sequences, split them out so they
    // don't consume display width.  We interleave visible graphemes with
    // zero-width ANSI "tokens" that are appended to currentLine untouched.
    const graphemes = splitGraphemesAnsiAware(line)
    let currentLine = ""
    let currentWidth = 0
    let isFirstLineOfParagraph = true

    // Track the last valid break point
    let lastBreakIndex = -1 // Index in currentLine (character position)
    let lastBreakWidth = 0 // Width at break point
    let lastBreakGraphemeIndex = -1 // Index in graphemes array

    for (let i = 0; i < graphemes.length; i++) {
      const grapheme = graphemes[i]!
      const gWidth = gWidthFn(grapheme)

      // Handle zero-width characters
      if (gWidth === 0) {
        currentLine += grapheme
        continue
      }

      // In trim mode, skip leading spaces on continuation lines
      if (trim && !isFirstLineOfParagraph && currentWidth === 0 && isWordBoundary(grapheme) && grapheme !== "-") {
        continue
      }

      // Check if this grapheme is a break point
      // Break AFTER spaces/hyphens, or BEFORE CJK characters
      if (isWordBoundary(grapheme)) {
        // Include the boundary character, then mark as break point
        if (currentWidth + gWidth <= width) {
          currentLine += grapheme
          currentWidth += gWidth
          // Suppress break point if the next word is a lone operator (e.g. "+", "=")
          // to avoid orphaning operators at the start of the next line.
          if (grapheme !== " " || !isBreakBeforeOperatorWith(graphemes, i, gWidthFn)) {
            lastBreakIndex = currentLine.length
            lastBreakWidth = currentWidth
            lastBreakGraphemeIndex = i + 1
          }
          continue
        }
        // Space/hyphen doesn't fit — break here (before the boundary char).
        // The current line is complete; the boundary char is consumed as the break.
        if (currentLine) {
          let lineToAdd = currentLine
          if (trim) lineToAdd = lineToAdd.trimEnd()
          lines.push(lineToAdd)
          isFirstLineOfParagraph = false
        }
        currentLine = ""
        currentWidth = 0
        lastBreakIndex = -1
        lastBreakWidth = 0
        lastBreakGraphemeIndex = -1
        continue
      } else if (canBreakAnywhere(grapheme)) {
        // CJK: can break before this character
        lastBreakIndex = currentLine.length
        lastBreakWidth = currentWidth
        lastBreakGraphemeIndex = i
      }

      // Would this grapheme overflow?
      if (currentWidth + gWidth > width) {
        if (lastBreakIndex > 0) {
          // We have a valid break point - use it
          let lineToAdd = currentLine.slice(0, lastBreakIndex)
          if (trim) lineToAdd = lineToAdd.trimEnd()
          lines.push(lineToAdd)
          isFirstLineOfParagraph = false

          // Reset and continue from break point
          currentLine = currentLine.slice(lastBreakIndex)
          currentWidth = currentWidth - lastBreakWidth

          // Rewind to process graphemes after the break
          i = lastBreakGraphemeIndex - 1
          currentLine = ""
          currentWidth = 0
          lastBreakIndex = -1
          lastBreakWidth = 0
          lastBreakGraphemeIndex = -1
        } else {
          // No break point found - must do character wrap
          if (currentLine) {
            if (trim) currentLine = currentLine.trimEnd()
            lines.push(currentLine)
            isFirstLineOfParagraph = false
          }
          currentLine = grapheme
          currentWidth = gWidth
          lastBreakIndex = -1
          lastBreakWidth = 0
          lastBreakGraphemeIndex = -1
        }
      } else {
        currentLine += grapheme
        currentWidth += gWidth
      }
    }

    // Push remaining content
    if (currentLine) {
      lines.push(currentLine)
    }
  }

  return lines
}

/**
 * Slice text by display width (from start).
 * Returns the first `maxWidth` columns of text.
 * Uses the default measurer for width calculations.
 * Handles both ANSI-styled and plain text.
 *
 * @param text - The text to slice
 * @param maxWidth - Maximum display width to keep from the start
 * @returns Sliced string from the start
 */
export function sliceByWidth(text: string, maxWidth: number): string {
  return (_scopedMeasurer ?? getDefaultMeasurer()).sliceByWidth(text, maxWidth)
}

/**
 * Slice a string by display width range.
 * Like string.slice() but works with display columns.
 *
 * @param text - The text to slice
 * @param start - Start display column (inclusive)
 * @param end - End display column (exclusive)
 * @returns Sliced string
 */
export function sliceByWidthRange(text: string, start: number, end?: number): string {
  const graphemes = splitGraphemes(text)
  let result = ""
  let currentCol = 0
  const endCol = end ?? Number.POSITIVE_INFINITY

  for (const grapheme of graphemes) {
    const gWidth = graphemeWidth(grapheme)

    // Haven't reached start yet
    if (currentCol + gWidth <= start) {
      currentCol += gWidth
      continue
    }

    // Past the end
    if (currentCol >= endCol) {
      break
    }

    // This grapheme is at least partially in range
    result += grapheme
    currentCol += gWidth
  }

  return result
}

/**
 * Slice text by display width from the end.
 * Returns the last `maxWidth` columns of text.
 * Uses the default measurer for width calculations.
 *
 * @param text - The text to slice
 * @param maxWidth - Maximum display width to keep from the end
 * @returns Sliced string from the end
 */
export function sliceByWidthFromEnd(text: string, maxWidth: number): string {
  return (_scopedMeasurer ?? getDefaultMeasurer()).sliceByWidthFromEnd(text, maxWidth)
}

// ============================================================================
// Buffer Writing
// ============================================================================

/**
 * Write styled text to a terminal buffer.
 *
 * Handles:
 * - Multi-byte graphemes (emoji, combining characters)
 * - Wide characters (CJK) that take 2 cells
 * - Zero-width characters (appended to previous cell)
 *
 * @param buffer - The buffer to write to
 * @param x - Starting column
 * @param y - Row
 * @param text - Text to write
 * @param style - Style to apply
 * @returns The ending column (x + display_width)
 */
export function writeTextToBuffer(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  text: string,
  style: Style = { fg: null, bg: null, attrs: {} },
): number {
  const graphemes = splitGraphemes(text)
  let col = x
  let combineCell: Cell | null = null

  for (const grapheme of graphemes) {
    const width = graphemeWidth(grapheme)

    if (width === 0) {
      // Zero-width character: combine with previous cell.
      // Use readCellInto to avoid allocating a fresh Cell on each combine.
      if (col > 0 && buffer.inBounds(col - 1, y)) {
        // Lazy-init reusable cell (zero-width combining is uncommon)
        combineCell ??= createMutableCell()
        buffer.readCellInto(col - 1, y, combineCell)
        combineCell.char = combineCell.char + grapheme
        buffer.setCell(col - 1, y, combineCell)
      }
    } else if (width === 1) {
      // Normal single-width character
      if (buffer.inBounds(col, y)) {
        buffer.setCell(col, y, {
          char: grapheme,
          fg: style.fg,
          bg: style.bg,
          attrs: style.attrs,
          wide: false,
          continuation: false,
        })
      }
      col++
    } else if (width === 2) {
      // Wide character: takes 2 cells
      // For text-presentation emoji, add VS16 so terminals render at 2 columns
      const outputChar = ensureEmojiPresentation(grapheme)
      if (buffer.inBounds(col, y)) {
        buffer.setCell(col, y, {
          char: outputChar,
          fg: style.fg,
          bg: style.bg,
          attrs: style.attrs,
          wide: true,
          continuation: false,
        })
      }
      if (buffer.inBounds(col + 1, y)) {
        buffer.setCell(col + 1, y, {
          char: "",
          fg: style.fg,
          bg: style.bg,
          attrs: style.attrs,
          wide: false,
          continuation: true,
        })
      }
      col += 2
    }

    // Stop if we've gone past the buffer edge
    if (col >= buffer.width) {
      break
    }
  }

  return col
}

/**
 * Write styled text to a buffer with automatic truncation.
 *
 * @param buffer - The buffer to write to
 * @param x - Starting column
 * @param y - Row
 * @param text - Text to write
 * @param maxWidth - Maximum width (truncate if exceeded)
 * @param style - Style to apply
 * @param ellipsis - Ellipsis for truncated text
 */
export function writeTextTruncated(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  text: string,
  maxWidth: number,
  style: Style = { fg: null, bg: null, attrs: {} },
  ellipsis = "\u2026",
): void {
  const textWidth = displayWidth(text)

  if (textWidth <= maxWidth) {
    writeTextToBuffer(buffer, x, y, text, style)
  } else {
    const truncated = truncateText(text, maxWidth, ellipsis)
    writeTextToBuffer(buffer, x, y, truncated, style)
  }
}

/**
 * Write multiple lines of styled text to a buffer.
 *
 * @param buffer - The buffer to write to
 * @param x - Starting column
 * @param y - Starting row
 * @param lines - Lines to write
 * @param style - Style to apply
 */
export function writeLinesToBuffer(
  buffer: TerminalBuffer,
  x: number,
  y: number,
  lines: string[],
  style: Style = { fg: null, bg: null, attrs: {} },
): void {
  for (let i = 0; i < lines.length; i++) {
    if (y + i >= buffer.height) break
    writeTextToBuffer(buffer, x, y + i, lines[i]!, style)
  }
}

// ============================================================================
// ANSI-Aware Operations
// ============================================================================

/**
 * Strip all ANSI escape codes from a string.
 *
 * Handles:
 * - CSI sequences (cursor movement, colors, SGR, etc.)
 * - OSC sequences (window titles, hyperlinks)
 * - Single-character escape sequences
 * - Character set selection
 */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;:?]*[A-Za-z]/g, "") // CSI sequences (including SGR with colons)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "") // OSC sequences
    .replace(/\x1b[DME78]/g, "") // Single-char sequences
    .replace(/\x1b\(B/g, "") // Character set selection
}

/**
 * Get display width of text with ANSI sequences.
 * ANSI sequences don't contribute to display width.
 */
export function displayWidthAnsi(text: string): number {
  return displayWidth(stripAnsi(text))
}

/**
 * Truncate text that may contain ANSI sequences.
 * Preserves ANSI codes while truncating visible characters.
 *
 * Note: This is a simplified implementation that strips ANSI before
 * truncation. For proper ANSI-aware truncation, consider using
 * slice-ansi or similar library.
 */
export function truncateAnsi(text: string, maxWidth: number, ellipsis = "\u2026"): string {
  // Simple approach: if text has ANSI, strip and truncate
  // A more sophisticated approach would preserve styles
  const stripped = stripAnsi(text)
  return truncateText(stripped, maxWidth, ellipsis)
}

// ============================================================================
// ANSI Parsing
// ============================================================================

// BG_OVERRIDE_CODE is imported from ansi and re-exported at top of file

/** Styled text segment with associated ANSI colors/attributes */
export interface StyledSegment {
  text: string
  fg?: number | null // SGR color code (30-37, 90-97, or 38;5;N / 38;2;r;g;b)
  bg?: number | null // SGR color code (40-47, 100-107, or 48;5;N / 48;2;r;g;b)
  /**
   * Underline color (SGR 58).
   * Same format as fg/bg: packed RGB with 0x1000000 marker, or 256-color index.
   */
  underlineColor?: number | null
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  /**
   * Underline style variant (SGR 4:x).
   * Uses UnderlineStyle from buffer.ts.
   */
  underlineStyle?: UnderlineStyle
  inverse?: boolean
  bgOverride?: boolean // Set when BG_OVERRIDE_CODE (9999) is present
  /**
   * OSC 8 hyperlink URL.
   * Set when the segment is inside an OSC 8 hyperlink sequence.
   */
  hyperlink?: string
}

/**
 * Map SGR 4:x subparameter to underline style.
 * 0=none, 1=single, 2=double, 3=curly, 4=dotted, 5=dashed
 */
function parseUnderlineStyle(subparam: number): UnderlineStyle {
  switch (subparam) {
    case 0:
      return false
    case 1:
      return "single"
    case 2:
      return "double"
    case 3:
      return "curly"
    case 4:
      return "dotted"
    case 5:
      return "dashed"
    default:
      return "single" // Unknown, default to single
  }
}

/**
 * Parse text with ANSI escape sequences into styled segments.
 * Handles basic SGR (Select Graphic Rendition) codes including:
 * - Standard colors (30-37, 40-47, 90-97, 100-107)
 * - Extended colors (38;5;N, 48;5;N for 256-color, 38;2;r;g;b, 48;2;r;g;b for RGB)
 * - Underline styles (4:x where x = 0-5)
 * - Underline color (58;5;N for 256-color, 58;2;r;g;b for RGB)
 */
export function parseAnsiText(text: string): StyledSegment[] {
  const segments: StyledSegment[] = []

  // Pre-process: strip OSC 8 hyperlink sequences and build a position-to-URL map.
  // OSC 8 format: \x1b]8;;URL(\x1b\\ | \x07) for open, \x1b]8;;(\x1b\\ | \x07) for close.
  // We strip these from the text before SGR parsing and track which character
  // positions map to which hyperlink URL.
  const oscPattern = /\x1b\]8;;([^\x07\x1b]*)(?:\x07|\x1b\\)/g
  let currentHyperlink: string | undefined
  // Map from character index in cleaned text to hyperlink URL
  const hyperlinkRanges: Array<{ start: number; end: number; url: string }> = []
  let rangeStart = -1
  let cleaned = ""
  let oscMatch: RegExpExecArray | null
  let oscLastIndex = 0

  while ((oscMatch = oscPattern.exec(text)) !== null) {
    // Append text between last OSC and this one (preserving SGR codes)
    cleaned += text.slice(oscLastIndex, oscMatch.index)
    const url = oscMatch[1]!

    if (url === "") {
      // Close hyperlink
      if (currentHyperlink && rangeStart >= 0) {
        hyperlinkRanges.push({ start: rangeStart, end: cleaned.length, url: currentHyperlink })
      }
      currentHyperlink = undefined
      rangeStart = -1
    } else {
      // Open hyperlink
      if (currentHyperlink && rangeStart >= 0) {
        // Close previous unclosed hyperlink
        hyperlinkRanges.push({ start: rangeStart, end: cleaned.length, url: currentHyperlink })
      }
      currentHyperlink = url
      rangeStart = cleaned.length
    }

    oscLastIndex = oscMatch.index + oscMatch[0].length
  }
  // Append remaining text after last OSC
  cleaned += text.slice(oscLastIndex)
  // Close any still-open hyperlink
  if (currentHyperlink && rangeStart >= 0) {
    hyperlinkRanges.push({ start: rangeStart, end: cleaned.length, url: currentHyperlink })
  }

  // If no OSC 8 sequences found, use original text for efficiency
  const processText = hyperlinkRanges.length > 0 ? cleaned : text

  // Extended pattern: matches SGR with semicolons AND colons (for 4:x, 58:2::r:g:b)
  const ansiPattern = /\x1b\[([0-9;:]*)m/g

  let currentStyle: Omit<StyledSegment, "text"> = {}
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Helper to find hyperlink URL for a position in the cleaned text.
  // Positions in cleaned text map directly to hyperlinkRanges since OSC 8
  // sequences were stripped but SGR sequences remain at the same indices.
  function getHyperlinkAt(pos: number): string | undefined {
    for (const range of hyperlinkRanges) {
      if (pos >= range.start && pos < range.end) return range.url
    }
    return undefined
  }

  while ((match = ansiPattern.exec(processText)) !== null) {
    // Add text before this escape sequence
    if (match.index > lastIndex) {
      const content = processText.slice(lastIndex, match.index)
      if (content.length > 0) {
        if (hyperlinkRanges.length > 0) {
          // Split content into runs by hyperlink URL.
          // lastIndex is the position of content[0] in processText/cleaned.
          let segStart = 0
          for (let ci = 0; ci < content.length; ci++) {
            const hl = getHyperlinkAt(lastIndex + ci)
            const prevHl = ci > 0 ? getHyperlinkAt(lastIndex + ci - 1) : undefined
            if (ci > 0 && hl !== prevHl) {
              const sub = content.slice(segStart, ci)
              if (sub.length > 0) {
                const seg: StyledSegment = { text: sub, ...currentStyle }
                if (prevHl) seg.hyperlink = prevHl
                segments.push(seg)
              }
              segStart = ci
            }
          }
          // Push remaining
          const sub = content.slice(segStart)
          if (sub.length > 0) {
            const hl = getHyperlinkAt(lastIndex + segStart)
            const seg: StyledSegment = { text: sub, ...currentStyle }
            if (hl) seg.hyperlink = hl
            segments.push(seg)
          }
        } else {
          segments.push({ text: content, ...currentStyle })
        }
      }
    }

    // Parse SGR codes - split by semicolon first, then handle colon subparams
    const rawParams = match[1]!

    // Handle colon-separated sequences (like 4:3 for curly underline, 58:2::r:g:b)
    // Split by semicolon first to get top-level params
    const params = rawParams.split(";")

    for (let i = 0; i < params.length; i++) {
      const param = params[i]!

      // Check if this param has colon subparameters (e.g., "4:3", "58:2::255:0:0")
      if (param.includes(":")) {
        const subparts = param.split(":").map((s) => (s === "" ? 0 : Number(s)))
        const mainCode = subparts[0]!

        if (mainCode === 4) {
          // SGR 4:x - underline style
          const styleCode = subparts[1] ?? 1
          currentStyle.underlineStyle = parseUnderlineStyle(styleCode)
          currentStyle.underline = currentStyle.underlineStyle !== false
        } else if (mainCode === 58) {
          // SGR 58 - underline color
          // Format: 58:5:N (256-color) or 58:2::r:g:b (RGB, note double colon)
          if (subparts[1] === 5 && subparts[2] !== undefined) {
            currentStyle.underlineColor = subparts[2]
          } else if (subparts[1] === 2) {
            // RGB: 58:2::r:g:b (indices 3,4,5 after the empty slot)
            // or 58:2:r:g:b (indices 2,3,4)
            // Handle both formats by looking for valid RGB values
            const r = subparts[3] ?? subparts[2] ?? 0
            const g = subparts[4] ?? subparts[3] ?? 0
            const b = subparts[5] ?? subparts[4] ?? 0
            currentStyle.underlineColor = 0x1000000 | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
          }
        } else if (mainCode === 38) {
          // SGR 38:2::r:g:b or 38:5:N format
          if (subparts[1] === 5 && subparts[2] !== undefined) {
            currentStyle.fg = subparts[2]
          } else if (subparts[1] === 2) {
            const r = subparts[3] ?? subparts[2] ?? 0
            const g = subparts[4] ?? subparts[3] ?? 0
            const b = subparts[5] ?? subparts[4] ?? 0
            currentStyle.fg = 0x1000000 | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
          }
        } else if (mainCode === 48) {
          // SGR 48:2::r:g:b or 48:5:N format
          if (subparts[1] === 5 && subparts[2] !== undefined) {
            currentStyle.bg = subparts[2]
          } else if (subparts[1] === 2) {
            const r = subparts[3] ?? subparts[2] ?? 0
            const g = subparts[4] ?? subparts[3] ?? 0
            const b = subparts[5] ?? subparts[4] ?? 0
            currentStyle.bg = 0x1000000 | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
          }
        }
        continue
      }

      // Standard semicolon-separated params
      const code = Number(param)
      switch (code) {
        case 0:
          // Reset
          currentStyle = {}
          break
        case 1:
          currentStyle.bold = true
          break
        case 2:
          currentStyle.dim = true
          break
        case 3:
          currentStyle.italic = true
          break
        case 4:
          // Plain SGR 4 - simple underline (no subparam)
          currentStyle.underline = true
          currentStyle.underlineStyle = "single"
          break
        case 7:
          currentStyle.inverse = true
          break
        case 22:
          currentStyle.bold = false
          currentStyle.dim = false
          break
        case 23:
          currentStyle.italic = false
          break
        case 24:
          // SGR 24 - underline off
          currentStyle.underline = false
          currentStyle.underlineStyle = false
          break
        case 27:
          currentStyle.inverse = false
          break
        case 30:
        case 31:
        case 32:
        case 33:
        case 34:
        case 35:
        case 36:
        case 37:
          currentStyle.fg = code
          break
        case 38: {
          // Extended color: 38;5;N (256 color) or 38;2;r;g;b (true color)
          const nextParams = params.slice(i + 1).map(Number)
          if (nextParams[0] === 5 && nextParams[1] !== undefined) {
            currentStyle.fg = nextParams[1]
            i += 2
          } else if (nextParams[0] === 2 && nextParams[3] !== undefined) {
            // True color - store as RGB values packed
            currentStyle.fg =
              0x1000000 | ((nextParams[1]! & 0xff) << 16) | ((nextParams[2]! & 0xff) << 8) | (nextParams[3]! & 0xff)
            i += 4
          }
          break
        }
        case 39:
          currentStyle.fg = null // Default foreground
          break
        case 40:
        case 41:
        case 42:
        case 43:
        case 44:
        case 45:
        case 46:
        case 47:
          currentStyle.bg = code
          break
        case 48: {
          // Extended color: 48;5;N (256 color) or 48;2;r;g;b (true color)
          const nextParams = params.slice(i + 1).map(Number)
          if (nextParams[0] === 5 && nextParams[1] !== undefined) {
            currentStyle.bg = nextParams[1]
            i += 2
          } else if (nextParams[0] === 2 && nextParams[3] !== undefined) {
            // True color - store as RGB values packed
            currentStyle.bg =
              0x1000000 | ((nextParams[1]! & 0xff) << 16) | ((nextParams[2]! & 0xff) << 8) | (nextParams[3]! & 0xff)
            i += 4
          }
          break
        }
        case 49:
          currentStyle.bg = null // Default background
          break
        case 58: {
          // Underline color: 58;5;N (256 color) or 58;2;r;g;b (true color)
          const nextParams = params.slice(i + 1).map(Number)
          if (nextParams[0] === 5 && nextParams[1] !== undefined) {
            currentStyle.underlineColor = nextParams[1]
            i += 2
          } else if (nextParams[0] === 2 && nextParams[3] !== undefined) {
            // True color - store as RGB values packed
            currentStyle.underlineColor =
              0x1000000 | ((nextParams[1]! & 0xff) << 16) | ((nextParams[2]! & 0xff) << 8) | (nextParams[3]! & 0xff)
            i += 4
          }
          break
        }
        case 59:
          currentStyle.underlineColor = null // Default underline color
          break
        case 90:
        case 91:
        case 92:
        case 93:
        case 94:
        case 95:
        case 96:
        case 97:
          currentStyle.fg = code // Bright foreground colors
          break
        case 100:
        case 101:
        case 102:
        case 103:
        case 104:
        case 105:
        case 106:
        case 107:
          currentStyle.bg = code // Bright background colors
          break
        case BG_OVERRIDE_CODE:
          // Private code: signals intentional bg override, skip conflict detection
          currentStyle.bgOverride = true
          break
      }
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < processText.length) {
    const content = processText.slice(lastIndex)
    if (content.length > 0) {
      if (hyperlinkRanges.length > 0) {
        // Split remaining content by hyperlink URL
        let segStart = 0
        for (let ci = 0; ci < content.length; ci++) {
          const hl = getHyperlinkAt(lastIndex + ci)
          const prevHl = ci > 0 ? getHyperlinkAt(lastIndex + ci - 1) : undefined
          if (ci > 0 && hl !== prevHl) {
            const sub = content.slice(segStart, ci)
            if (sub.length > 0) {
              const seg: StyledSegment = { text: sub, ...currentStyle }
              if (prevHl) seg.hyperlink = prevHl
              segments.push(seg)
            }
            segStart = ci
          }
        }
        const sub = content.slice(segStart)
        if (sub.length > 0) {
          const hl = getHyperlinkAt(lastIndex + segStart)
          const seg: StyledSegment = { text: sub, ...currentStyle }
          if (hl) seg.hyperlink = hl
          segments.push(seg)
        }
      } else {
        segments.push({ text: content, ...currentStyle })
      }
    }
  }

  return segments
}

const ANSI_TEST_REGEX = /\x1b(?:\[[0-9;]*[A-Za-z]|\])/

/**
 * Check if text contains ANSI escape sequences (SGR or OSC).
 */
export function hasAnsi(text: string): boolean {
  // Use a non-global regex for testing to avoid lastIndex issues
  return ANSI_TEST_REGEX.test(text)
}

// ============================================================================
// Measurement Utilities
// ============================================================================

/**
 * Measure the dimensions of multi-line text.
 *
 * @param text - Text to measure (may contain newlines)
 * @returns { width, height } in display columns and rows
 */
export function measureText(text: string): { width: number; height: number } {
  const lines = text.split("\n")
  let maxWidth = 0

  for (const line of lines) {
    const lineWidth = displayWidth(line)
    if (lineWidth > maxWidth) {
      maxWidth = lineWidth
    }
  }

  return {
    width: maxWidth,
    height: lines.length,
  }
}

/**
 * Check if a string contains any wide characters.
 */
export function hasWideCharacters(text: string): boolean {
  const graphemes = splitGraphemes(text)
  return graphemes.some(isWideGrapheme)
}

/**
 * Check if a string contains any combining/zero-width characters.
 */
export function hasZeroWidthCharacters(text: string): boolean {
  const graphemes = splitGraphemes(text)
  return graphemes.some(isZeroWidthGrapheme)
}

/**
 * Normalize string for consistent handling.
 * Applies Unicode NFC normalization.
 */
export function normalizeText(text: string): string {
  return text.normalize("NFC")
}

// ============================================================================
// Character Detection
// ============================================================================

/**
 * Common character ranges for quick checks.
 */
const CHAR_RANGES = {
  // Basic Latin (ASCII)
  isBasicLatin: (cp: number) => cp >= 0x0020 && cp <= 0x007f,

  // CJK Unified Ideographs
  isCJK: (cp: number) =>
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Unified Ideographs Extension A
    (cp >= 0x20000 && cp <= 0x2a6df) || // CJK Unified Ideographs Extension B
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
    (cp >= 0x2f800 && cp <= 0x2fa1f), // CJK Compatibility Ideographs Supplement

  // Japanese Hiragana/Katakana
  isJapaneseKana: (cp: number) =>
    (cp >= 0x3040 && cp <= 0x309f) || // Hiragana
    (cp >= 0x30a0 && cp <= 0x30ff), // Katakana

  // Korean Hangul
  isHangul: (cp: number) =>
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul Syllables
    (cp >= 0x1100 && cp <= 0x11ff), // Hangul Jamo

  // Emoji ranges (simplified)
  isEmoji: (cp: number) =>
    (cp >= 0x1f600 && cp <= 0x1f64f) || // Emoticons
    (cp >= 0x1f300 && cp <= 0x1f5ff) || // Misc Symbols and Pictographs
    (cp >= 0x1f680 && cp <= 0x1f6ff) || // Transport and Map
    (cp >= 0x1f700 && cp <= 0x1f77f) || // Alchemical Symbols
    (cp >= 0x1f900 && cp <= 0x1f9ff) || // Supplemental Symbols and Pictographs
    (cp >= 0x2600 && cp <= 0x26ff) || // Misc symbols
    (cp >= 0x2700 && cp <= 0x27bf), // Dingbats
} as const

/**
 * Get the first code point of a string.
 */
export function getFirstCodePoint(str: string): number {
  const cp = str.codePointAt(0)
  return cp ?? 0
}

/**
 * Check if a grapheme is likely an emoji.
 * Note: This is a heuristic, not comprehensive.
 */
export function isLikelyEmoji(grapheme: string): boolean {
  const cp = getFirstCodePoint(grapheme)
  return CHAR_RANGES.isEmoji(cp) || grapheme.includes("\u200d") // Contains ZWJ
}

/**
 * Check if a grapheme is a CJK character.
 */
export function isCJK(grapheme: string): boolean {
  const cp = getFirstCodePoint(grapheme)
  return CHAR_RANGES.isCJK(cp) || CHAR_RANGES.isJapaneseKana(cp) || CHAR_RANGES.isHangul(cp)
}
