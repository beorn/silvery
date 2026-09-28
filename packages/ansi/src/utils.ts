/**
 * ANSI string utilities.
 *
 * This module can be imported separately via `@silvery/ansi/utils`
 * for projects that only need ANSI stripping without chalk.
 */

import stringWidth from "string-width"

// =============================================================================
// ANSI Regex Pattern
// =============================================================================

/**
 * ANSI escape code pattern for stripping.
 *
 * Matches:
 * - ESC CSI SGR sequences: \x1b[31m, \x1b[4:3m, \x1b[38:2::255:100:0m
 * - C1 CSI SGR sequences: \x9b31m, \x9b4:3m
 * - ESC OSC 8 hyperlinks (BEL-terminated): \x1b]8;;<url>\x07
 * - ESC OSC 8 hyperlinks (ST-terminated): \x1b]8;;<url>\x1b\\
 * - C1 OSC 8 hyperlinks (BEL-terminated): \x9d8;;<url>\x07
 * - C1 OSC 8 hyperlinks (ST-terminated): \x9d8;;<url>\x1b\\
 * - C1 OSC 8 hyperlinks (C1 ST-terminated): \x9d8;;<url>\x9c
 */
export const ANSI_REGEX =
  /\x1b\[[0-9;:]*m|\x9b[0-9;:]*m|\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)|\x9d8;;[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)/g

// =============================================================================
// String Utilities
// =============================================================================

/**
 * Strip all ANSI escape codes from a string.
 *
 * @param text - String potentially containing ANSI codes
 * @returns Clean string with all ANSI codes removed
 *
 * @example
 * ```ts
 * stripAnsi('\x1b[31mred\x1b[0m') // 'red'
 * stripAnsi('\x1b[4:3mwavy\x1b[4:0m') // 'wavy'
 * ```
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "")
}

/**
 * Get the display width of a string, excluding ANSI escape codes.
 * Correctly handles CJK characters, emoji, and other wide characters.
 *
 * @param text - String potentially containing ANSI codes
 * @returns Number of terminal columns the text will occupy
 *
 * @example
 * ```ts
 * displayLength('\x1b[31mhello\x1b[0m') // 5
 * displayLength('hello') // 5
 * displayLength('한글') // 4 (2 chars × 2 cells each)
 * displayLength('⚠') // 2 (text-presentation emoji, painted wide)
 * ```
 */
export function displayLength(text: string): number {
  const stripped = stripAnsi(text)
  // Fast path: nothing in range to correct, so string-width is already right.
  if (!MAY_CONTAIN_TEXT_EMOJI.test(stripped)) return stringWidth(stripped)
  let width = 0
  for (const { segment } of graphemeSegmenter.segment(stripped)) {
    width += graphemeDisplayWidth(segment)
  }
  return width
}

// =============================================================================
// Text-presentation emoji width correction
//
// This lives HERE, at the bottom of the dependency graph, because it is the one
// place every width consumer can reach. `@silvery/ansi` depends on nothing but
// `@silvery/color` and `string-width`; `@silvery/ag-term` depends on THIS. While
// the correction lived only in ag-term, `displayLength` could not reach it and
// grew its own uncorrected answer — a duplicate that was structurally forced
// rather than careless, which is why the fix had to be structural too.
//
// ag-term layers its cache and per-`Measurer` scoping on top of these. The
// private-use-area correction deliberately stays up there: it is gated on a
// probed terminal capability, not on Unicode properties alone.
// =============================================================================

/** Stateless and reusable; the correction keys on grapheme segmentation. */
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/**
 * Extended_Pictographic characters WITHOUT Emoji_Presentation: `string-width`
 * reports 1 (per Unicode East Asian Width) and terminals paint 2.
 * Examples: ⚠ (U+26A0), ☑ (U+2611), ✈ (U+2708), ❤ (U+2764).
 * Counter-example: 📁 (U+1F4C1) HAS Emoji_Presentation, so string-width is right.
 */
const EXTENDED_PICTOGRAPHIC_RE = /^\p{Extended_Pictographic}$/u
const EMOJI_PRESENTATION_RE = /^\p{Emoji_Presentation}$/u
const RGI_EMOJI_RE = /^\p{RGI_Emoji}$/v

/** Memoized by first code point — only ever consulted for single-codepoint graphemes. */
const textPresentationEmojiCache = new Map<number, boolean>()

/**
 * Fast pre-check for strings that could contain a text-presentation emoji, so
 * the common case never pays for grapheme segmentation. Exported because
 * `@silvery/ag-term` gates its own scoped measurers on the same set — a second
 * copy of this range list is exactly the drift this consolidation removes.
 */
export const MAY_CONTAIN_TEXT_EMOJI =
  /[‼⁉™ℹ↔-↙↩↪⌨⏏⏭-⏯⏱⏲⏸-⏺▪▫▶◀◻-◾☀-☄☎☑☔☕☘☝☠☢☣☦☪☮☯☸-☺♀♂♈-♓♟♠♣♥♦♨♻♾♿⚒-⚗⚙⚛⚜⚠⚡⚧⚪⚫⚰⚱⚽⚾⛄⛅⛈⛎⛏⛑⛓⛔⛩⛪⛰-⛵⛷-⛺⛽✂✅✈-✍✏✒✔✖✝✡✨✳✴❄❇❌❎❓-❕❗❣❤➕-➗➡➰➿⤴⤵⬅-⬇⬛⬜⭐⭕〰〽㊗㊙]/

/**
 * True for a grapheme that terminals render two columns wide but `string-width`
 * calls one: Extended_Pictographic, not Emoji_Presentation, and RGI once VS16
 * (U+FE0F) is appended.
 */
export function isTextPresentationEmoji(grapheme: string): boolean {
  const cp = grapheme.codePointAt(0)
  if (cp === undefined) return false

  // Multi-codepoint graphemes (VS15/VS16, ZWJ sequences) are already correct in
  // string-width. This gate MUST run before the cache: "⏸︎" and bare
  // "⏸" share a first code point but not their width semantics, so caching
  // a cluster by its base code point would make width depend on call order.
  const singleChar = String.fromCodePoint(cp)
  if (singleChar.length !== grapheme.length) return false

  const cached = textPresentationEmojiCache.get(cp)
  if (cached !== undefined) return cached

  if (!EXTENDED_PICTOGRAPHIC_RE.test(grapheme) || EMOJI_PRESENTATION_RE.test(grapheme)) {
    textPresentationEmojiCache.set(cp, false)
    return false
  }

  const result = RGI_EMOJI_RE.test(grapheme + "️")
  textPresentationEmojiCache.set(cp, result)
  return result
}

/** Width of ONE grapheme in terminal columns, with the emoji correction applied. */
export function graphemeDisplayWidth(grapheme: string): number {
  const width = stringWidth(grapheme)
  // Trust string-width when it already says 0 or 2.
  if (width !== 1) return width
  return isTextPresentationEmoji(grapheme) ? 2 : width
}

// =============================================================================
// warnOnce — shared dev-warning latch
// =============================================================================

/**
 * Process-lifetime set of warning IDs that have already fired. Used by
 * {@link warnOnce} to avoid console spam on every re-render / every paste /
 * every parse. Shared across packages — one latch per warning ID, regardless
 * of which module emits it.
 *
 * Intentionally process-global (not scoped per {@link Term}) because the
 * warnings gated here describe developer-mistake conditions that are
 * semantically "once per process": spam is worse than missed repeats.
 */
const _firedWarnings = new Set<string>()

/**
 * Emit a warning exactly once per process, keyed by `id`.
 *
 * The first call with a given `id` invokes `emit(message)`; subsequent calls
 * with the same `id` are no-ops. Use for dev-mode checks that would otherwise
 * spam the console on every render pass / every keystroke / every reconcile.
 *
 * Consolidates what used to be three parallel `let hasWarned*` latches
 * scattered across silvery packages (`test/index.tsx`,
 * `ag-react/reconciler/host-config.ts`, `ag/keys.ts`). See
 * km-silvery.latch-consolidation.
 *
 * @param id - Unique warning identifier (stable across restarts). Convention:
 *   `<package>:<short-slug>`, e.g. `"silvery/test:termless-leak"`,
 *   `"silvery/ag-react:box-in-text"`.
 * @param emit - Callback that actually produces the warning. Called once.
 *   Omit to use `console.warn` with no message (rarely useful — prefer an
 *   explicit emit).
 *
 * @example
 * ```ts
 * import { warnOnce } from "@silvery/ansi"
 *
 * function validateBoxInText() {
 *   if (!isValid) {
 *     warnOnce("silvery/ag-react:box-in-text", () =>
 *       console.warn("<Box> cannot be nested inside <Text>.")
 *     )
 *   }
 * }
 * ```
 */
export function warnOnce(id: string, emit: () => void): void {
  if (_firedWarnings.has(id)) return
  _firedWarnings.add(id)
  emit()
}
