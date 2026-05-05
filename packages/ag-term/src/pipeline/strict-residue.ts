/**
 * STRICT residue invariant — sentinel-compare verification.
 *
 * Bead: @km/silvery/render-no-stale-residue-invariant (P1, 2026-05-05).
 *
 * The canonical incremental≡fresh comparison (run on every frame at
 * SILVERY_STRICT=1) catches divergences in CHANGED cells. It does NOT catch
 * the "stale carry-over" class of bug where a cell painted in frame N-1 is
 * left untouched in frame N because the incremental cascade thinks it's
 * clean — but the prev pixel happens to coincide with what fresh would
 * paint, so cell-equality holds. The cyan-strip residue saw exactly this
 * shape: a row of $bg-selected cells from a previous cursor position
 * survived a downstream re-render because the parent's cascade stopped
 * cascading clears.
 *
 * The sentinel-compare check exposes this class. The semantic in detail:
 *
 *   1. Snapshot the REAL prev buffer P.
 *   2. Clone P and POISON every cell with a color/char no theme produces:
 *      rgb(254, 0, 254), char "þ" — call this P'.
 *   3. Run the regular incremental render against P'. Cells the cascade
 *      skips retain the sentinel (they're cloned from P' and not
 *      repainted). Cells the cascade repaints have fresh content. Call
 *      this buffer I'.
 *   4. Run a fresh render from a zeroed buffer with all pipeline state
 *      (postState, accumulators) reset → buffer F.
 *   5. INVARIANT: at every (x,y),
 *        I'[x,y] is sentinel ⇒ P[x,y] == F[x,y]
 *      (cascade skipped this cell ⇒ prev pixel matched what fresh
 *      paints; the skip was correct).
 *      Equivalently: at any cell where P[x,y] ≠ F[x,y], the cascade
 *      MUST repaint and I'[x,y] MUST NOT be the sentinel.
 *   6. Pipeline-state contamination shows up as a non-sentinel cell in
 *      I' that disagrees with F — both passes painted but disagreed
 *      because cross-pass state leaked.
 *
 * Cost: O(width × height) extra memory for the poisoned clone + one
 * additional render-phase run per frame. Tier 2 (paranoid). Default
 * SILVERY_STRICT=1 does NOT enable this.
 *
 * Sentinel choice: rgb(254, 0, 254) "þ". Verified against all 84
 * shipped color schemes (`grep -rE '#[0-9A-Fa-f]{6}'` in
 * packages/theme/src/schemes/, 992 unique colors, no hit on `#fe00fe`).
 * `#FF00FF` would NOT be safe — `xtermColors` ships a brightMagenta of
 * `#FF00FF`. The "þ" character (LATIN SMALL LETTER THORN) is similarly
 * unlikely to appear in normal UI text.
 *
 * Why "compare to F (fresh-from-zero)" and NOT "compare to incremental
 * with REAL prev": at cells the cascade correctly skips, both renders
 * agree by definition (the comparison would be a no-op). The whole
 * point of comparing to F is to expose the asymmetry between "cascade
 * skipped because prev was already right" (I' = sentinel, F = correct)
 * and "cascade skipped but prev was WRONG" (I' = sentinel, F = correct,
 * but P ≠ F — the bug). Sentinel-poison is the discriminator.
 */

import type { TerminalBuffer } from "../buffer.js"
import { cellEquals } from "../buffer.js"
import { IncrementalRenderMismatchError } from "../errors.js"
import { isStrictEnabled } from "../strict-mode.js"

/** Sentinel cell value used to poison the prev buffer.
 *
 * Every theme-shipped color was checked: `#FE00FE` (rgb 254, 0, 254) does
 * not appear in any of the 84 schemes in packages/theme/src/schemes/. The
 * neighbouring `#FF00FF` IS used by xtermColors (brightMagenta), so we
 * deliberately avoid it.
 *
 * The character "þ" (LATIN SMALL LETTER THORN, "þ") is non-ASCII and
 * does not appear in silvery built-in components or default theme text.
 */
export const RESIDUE_SENTINEL_CHAR = "þ"
export const RESIDUE_SENTINEL_RGB = { r: 254, g: 0, b: 254 } as const

/** SILVERY_STRICT slug for the residue check. Tier 2 by design. */
export const RESIDUE_STRICT_SLUG = "residue"
export const RESIDUE_STRICT_MIN_TIER = 2

/** Returns true when the residue check should fire. */
export function isResidueStrictEnabled(): boolean {
  return isStrictEnabled(RESIDUE_STRICT_SLUG, RESIDUE_STRICT_MIN_TIER)
}

/**
 * Fill every cell of `buffer` with the residue sentinel — a magenta-ish
 * RGB no theme uses + the thorn character "þ". This is a destructive
 * operation; callers must operate on a clone of the live prev buffer.
 */
export function poisonBufferWithSentinel(buffer: TerminalBuffer): void {
  buffer.fill(0, 0, buffer.width, buffer.height, {
    char: RESIDUE_SENTINEL_CHAR,
    fg: RESIDUE_SENTINEL_RGB,
    bg: RESIDUE_SENTINEL_RGB,
    wide: false,
    continuation: false,
  })
}

/** Result of the cell-by-cell sentinel comparison. */
export interface ResidueDivergence {
  x: number
  y: number
  /** The sentinel-cloned incremental render's cell. */
  incrChar: string
  incrFg: unknown
  incrBg: unknown
  /** The fresh-from-zero render's cell. */
  freshChar: string
  freshFg: unknown
  freshBg: unknown
  /** True when the incremental cell still carries the sentinel itself
   *  (strongest signal — definitely a stale carry-over). */
  isSentinelLeak: boolean
}

/**
 * Compare a sentinel-poison-prev incremental render to a fresh render,
 * accounting for the legitimate "cascade skipped this cell because prev
 * was already correct" pattern.
 *
 * The check semantic in detail:
 *
 *   1. Real prev buffer P captures the pre-frame state (the buffer the
 *      production incremental render correctly clones from).
 *   2. Poisoned prev P' = P with every cell replaced by sentinel.
 *   3. Incremental-with-poison buffer I' is what runPipeline produced
 *      against P'. Cells the cascade skipped retain sentinel; cells it
 *      repainted have fresh content.
 *   4. Fresh-from-zero buffer F is the all-paths-recomputed reference.
 *   5. INVARIANT: at every (x,y),
 *        I'[x,y] is sentinel ⇒ P[x,y] === F[x,y]
 *      (cascade skipped this cell ⇒ prev pixel was already what fresh
 *      paints; no stale carry-over).
 *   6. Equivalently: at any cell where P[x,y] ≠ F[x,y], the incremental
 *      cascade MUST repaint, and I'[x,y] ≠ sentinel.
 *
 * A violation = "the cascade decided this cell is clean, but the real
 * prev had different content from what fresh paints". That's exactly
 * the cyan-strip-residue class: prev had cyan bg at row 5; fresh paints
 * default bg; cascade skipped row 5; user sees cyan on a row that
 * should be default. Sentinel-poison reveals it because I' has the
 * sentinel where the cascade skipped, and F[x,y] ≠ P[x,y] at that cell.
 *
 * Pipeline-state contamination is detected as a side effect: if any
 * cross-pass state (postState / accumulators) leaks, I' diverges from
 * F at cells the sentinel doesn't cover, and `cellEquals` catches it.
 *
 * Throws on first divergence with a diagnostic identifying the verdict
 * (sentinel leak vs pipeline contamination), the cell coordinates, and
 * the value triple (P, I', F) for the offending cell.
 */
export function verifyNoResidueLeak(
  realPrevBuffer: TerminalBuffer,
  incrPoisonedBuffer: TerminalBuffer,
  freshBuffer: TerminalBuffer,
  frameCount: number,
): void {
  const w = Math.min(realPrevBuffer.width, incrPoisonedBuffer.width, freshBuffer.width)
  const h = Math.min(realPrevBuffer.height, incrPoisonedBuffer.height, freshBuffer.height)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const incr = incrPoisonedBuffer.getCell(x, y)
      const fresh = freshBuffer.getCell(x, y)

      // Identical incr vs fresh — no possible divergence to investigate
      // regardless of what prev held.
      if (cellEquals(incr, fresh)) continue

      const isSentinelLeak = isSentinelCell(incr)

      if (isSentinelLeak) {
        // Cascade skipped this cell. Look up real-prev content; if it
        // matches fresh, this is the legitimate "skip because prev was
        // already correct" case — NOT a residue bug. Skip silently.
        const prev = realPrevBuffer.getCell(x, y)
        if (cellEquals(prev, fresh)) continue
        // Otherwise: the cascade trusted a prev pixel that DOES NOT
        // match fresh. Real residue bug.
        const msg =
          `STRICT residue check (frame ${frameCount}): SENTINEL LEAK at (${x},${y})\n` +
          `  real prev:   char='${prev.char}' fg=${formatColor(prev.fg)} bg=${formatColor(prev.bg)}\n` +
          `  incremental: char='${incr.char}' fg=${formatColor(incr.fg)} bg=${formatColor(incr.bg)} (sentinel — cascade skipped)\n` +
          `  fresh:       char='${fresh.char}' fg=${formatColor(fresh.fg)} bg=${formatColor(fresh.bg)}\n` +
          `  Real prev ≠ fresh at this cell, but the incremental cascade decided\n` +
          `  not to repaint it. The user sees a stale prev pixel where fresh\n` +
          `  would have painted differently — the cyan-strip-residue class.\n` +
          `  Likely root cause: missing dirty flag propagation, a skipBgFill\n` +
          `  that should have been bgRefillNeeded, or a transparent-Box\n` +
          `  ancestorCleared cascade gap.\n` +
          `  Slug: SILVERY_STRICT=${RESIDUE_STRICT_SLUG} (tier ${RESIDUE_STRICT_MIN_TIER}+).\n` +
          `  Per-test opt-out: SILVERY_STRICT=2,!${RESIDUE_STRICT_SLUG}.`
        throw new IncrementalRenderMismatchError(msg)
      }

      // Non-sentinel divergence: the cascade DID repaint this cell, but
      // the result differs from fresh. This is pipeline-state
      // contamination — the cross-pass postState / scroll-offset /
      // outlineSnapshots leaked between the incremental run and the
      // fresh-render baseline. Always a real bug.
      const msg =
        `STRICT residue check (frame ${frameCount}): pipeline-state contamination at (${x},${y})\n` +
        `  incremental: char='${incr.char}' fg=${formatColor(incr.fg)} bg=${formatColor(incr.bg)} (repainted)\n` +
        `  fresh:       char='${fresh.char}' fg=${formatColor(fresh.fg)} bg=${formatColor(fresh.bg)}\n` +
        `  Both passes painted this cell but disagreed. Cross-pass state\n` +
        `  (postState / scrollOffset / outlineSnapshots) is leaking between\n` +
        `  the sentinel-poisoned incremental render and the fresh baseline.\n` +
        `  Slug: SILVERY_STRICT=${RESIDUE_STRICT_SLUG} (tier ${RESIDUE_STRICT_MIN_TIER}+).\n` +
        `  Per-test opt-out: SILVERY_STRICT=2,!${RESIDUE_STRICT_SLUG}.`
      throw new IncrementalRenderMismatchError(msg)
    }
  }
}

/** True when a cell still carries the residue sentinel. */
function isSentinelCell(c: { char: string; fg: unknown; bg: unknown }): boolean {
  if (c.char !== RESIDUE_SENTINEL_CHAR) return false
  const bg = c.bg
  if (typeof bg !== "object" || bg === null) return false
  const o = bg as { r: number; g: number; b: number }
  return (
    o.r === RESIDUE_SENTINEL_RGB.r &&
    o.g === RESIDUE_SENTINEL_RGB.g &&
    o.b === RESIDUE_SENTINEL_RGB.b
  )
}

function formatColor(c: unknown): string {
  if (c === null || c === undefined) return "default"
  if (typeof c === "number") return `${c}`
  if (typeof c === "object") {
    const o = c as { r: number; g: number; b: number }
    return `rgb(${o.r},${o.g},${o.b})`
  }
  return String(c)
}
