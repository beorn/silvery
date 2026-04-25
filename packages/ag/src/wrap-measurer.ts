/**
 * Wrap-measurer registry — runtime hook for soft-wrap-aware geometry.
 *
 * `@silvery/ag` is the layout-and-types layer; it deliberately does not own
 * grapheme/wide-char/PUA width tables (those live in `@silvery/ag-term`'s
 * `unicode.ts`). Yet the geometry helpers here — `computeSelectionFragments`
 * being the v1 consumer — need wrap-aware line breaks to emit one rectangle
 * per visual line on a soft-wrapped paragraph.
 *
 * The cross-layer hop is solved by registration, not import: the terminal
 * runtime calls `setWrapMeasurer({ wrapText })` when it boots, and the
 * fragment helper reads `getWrapMeasurer()` at call time. When no measurer
 * is registered (pure `@silvery/ag` unit tests, or a future canvas/DOM
 * adapter that hasn't wired one yet) the fallback is `\n`-split — same
 * behavior as before this hook existed.
 *
 * **v1 scope**: module-level singleton. `@silvery/ag` is consumed by one
 * `Term` at a time per process, so a single registration is enough. A
 * future multi-Term scenario will need a per-tree binding (likely a
 * fingerprint on the AgNode root); the registry is intentionally one
 * object so the upgrade path stays mechanical.
 *
 * **Test isolation**: tests that exercise the registered path SHOULD call
 * `setWrapMeasurer(null)` in `afterEach` to drain any cross-file leak.
 * Tests that need the `\n`-only fallback SHOULD assert `null` registration
 * before computing fragments.
 *
 * Tracking: `km-silvery.softwrap-selection-fragments` (closes Phase 4b
 * deferred wrap-spanning) — see also `hub/silvery/design/overlay-anchor-system.md`
 * § 8 (Option B chosen over lifting `wrapText` to a layering-neutral
 * package).
 */

/**
 * One slice of wrapped text — produced by a registered `WrapMeasurer.wrapText`.
 *
 * `text` is the visible content for that visual line. `startOffset` /
 * `endOffset` are character indices into the *original* (un-wrapped) text,
 * so the consumer can clamp a selection range against each slice's window
 * without re-walking the wrap algorithm.
 *
 * Convention: `endOffset` is exclusive (matches `String.slice(start, end)`),
 * so `text === source.slice(startOffset, endOffset)` for hard wraps. For
 * soft wraps that drop trailing whitespace (`trim` mode), `text` may be
 * shorter than `source.slice(startOffset, endOffset)` — use the offsets
 * for selection-range arithmetic, not the slice text length.
 */
export interface WrapSlice {
  readonly text: string
  readonly startOffset: number
  readonly endOffset: number
}

/**
 * Runtime-supplied wrap measurement. Implementations live in `@silvery/ag-term`
 * (terminal grapheme widths) and any future adapters (canvas glyph widths,
 * DOM measureText). `@silvery/ag` consumers call `getWrapMeasurer()` and
 * fall back gracefully when null.
 */
export interface WrapMeasurer {
  /**
   * Given `text` and a max display width in cells, return one `WrapSlice`
   * per visual line. An empty array means "no wrapping happened" — callers
   * should treat this as a single-line passthrough (using the original
   * text + offsets `[0, text.length]`).
   *
   * The returned slices MUST cover the entire input in order:
   * - First slice's `startOffset === 0`
   * - Each subsequent `startOffset >= prev.endOffset`
   * - Last slice's `endOffset === text.length`
   *
   * Soft wraps that swallow whitespace are still required to advance
   * `startOffset` past the swallowed cells — this is what lets selection
   * fragments map cleanly onto visual rows.
   */
  readonly wrapText: (text: string, maxWidth: number) => readonly WrapSlice[]
}

let _measurer: WrapMeasurer | null = null

/**
 * Register the active wrap measurer. Pass `null` to clear (test teardown,
 * or a Term disposing its runtime).
 *
 * Idempotent: setting the same reference twice is a no-op. Setting a new
 * reference replaces the previous one — there's no stack. v1 assumes a
 * single Term-per-process consumer; multi-Term setups need a different
 * dispatch (see file header).
 */
export function setWrapMeasurer(m: WrapMeasurer | null): void {
  _measurer = m
}

/**
 * Read the active wrap measurer, or `null` if none is registered.
 *
 * Geometry helpers (`computeSelectionFragments` is the v1 consumer) call
 * this at compute-time — not at module-load — so the registration order
 * doesn't matter. The fragment helper falls back to `\n`-split when this
 * returns null.
 */
export function getWrapMeasurer(): WrapMeasurer | null {
  return _measurer
}
