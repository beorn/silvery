/**
 * Backdrop fade — stage 2a: apply the plan's cell-level transform to the
 * terminal buffer.
 *
 * Uses the shared `forEachFadeRegionCell` walker (`./region.ts`) to visit
 * every cell covered by the plan's include + exclude rects exactly once.
 * Trusts the plan: no marker re-collection, no scrim/default resolution,
 * no amount validation, no capability re-derivation (`plan.kittyEnabled`
 * is the sole source of truth for the emoji branch).
 *
 * Wide ≠ emoji. CJK / Hangul / Japanese fullwidth text occupies two columns
 * but responds to `fg` color normally — it goes through the standard mix
 * path. Only EMOJI (bitmap glyphs that ignore `fg`) need special handling,
 * detected via `isLikelyEmoji(cell.char)`.
 *
 * For emoji cells, two paths, mutually exclusive:
 *
 * 1. **Kitty graphics available** (`plan.kittyEnabled === true`): emoji cells
 *    are SKIPPED entirely here. `./realize-kitty.ts` emits a translucent
 *    scrim image at alpha=amount above each emoji cell, and the terminal
 *    composites the overlay on top of the unmixed cell, landing at
 *    `cell_bg * (1 - amount) + scrim * amount` — the same luminance as
 *    surrounding text cells. This avoids the double-fade that would make
 *    emoji bg visibly blacker.
 *
 * 2. **Kitty graphics unavailable** (`plan.kittyEnabled === false`): the
 *    per-cell mix runs on emoji cells too and stamps `attrs.dim` (SGR 2)
 *    on lead + continuation. Terminals honoring SGR 2 on emoji fade the
 *    glyph; others see the glyph at full brightness but the cell bg
 *    matches surroundings.
 *
 * @see ./plan.ts for the color model and scrim derivation.
 * @see ./color.ts for the hex↔rgb adapter helpers.
 * @see @silvery/color for `mixSrgb`.
 * @see ./color-shim.ts for `deemphasizeOklchToward` (polarity-aware,
 *   not yet upstream).
 * @see ./region.ts for the shared include/exclude region walker.
 */

import { mixSrgb } from "@silvery/color"
import type { TerminalBuffer } from "../../buffer"
import { isLikelyEmoji } from "../../unicode"
import { colorToHex, type HexColor, hexToRgb } from "./color"
import { deemphasizeOklchToward } from "./color-shim"
import { DARK_SCRIM, LIGHT_SCRIM, type Plan } from "./plan"
import { forEachFadeRegionCell } from "./region"

/**
 * Stage 2a — apply the plan's cell-level transform to the buffer.
 *
 * Walks every include + exclude cell once via `forEachFadeRegionCell` and
 * applies `fadeCell` with the plan's single `amount`. The buffer is mutated
 * in place.
 *
 * When `plan.kittyEnabled === true`, emoji cells (detected via
 * `isLikelyEmoji(cell.char)`) are SKIPPED — the Kitty overlay realizer
 * composites the scrim on top of the unmixed cell. When
 * `plan.kittyEnabled === false`, emoji cells go through the per-cell mix
 * AND get SGR 2 (`attrs.dim`) stamped on lead + continuation.
 *
 * Returns `true` when at least one buffer cell was mutated.
 */
export function realizeToBuffer(plan: Plan, buffer: TerminalBuffer): boolean {
  if (!plan.active) return false
  if (plan.amount <= 0) return false

  let modified = false
  forEachFadeRegionCell(buffer.width, buffer.height, plan.includes, plan.excludes, (x, y) => {
    if (fadeCell(buffer, x, y, plan)) modified = true
  })
  return modified
}

/**
 * Fade a single cell. Returns true if the cell was modified.
 *
 * Two-channel transform (see `./plan.ts` for the full color model):
 *
 *   fg' = deemphasizeOklchToward(fg, amount, scrimTowardLight)
 *   bg' = mixSrgb(bg, scrim, amount)
 *
 * Fg uses OKLCH deemphasize (not sRGB mixing) so colored text deemphasizes
 * perceptually — pale lavender becomes dull slate on dark themes, pale
 * grey on light themes. The polarity flag `scrimTowardLight` (from the
 * plan) steers L toward 0 or 1; chroma falloff is symmetric. Bg uses sRGB
 * source-over because the Kitty graphics scrim overlay composites in sRGB
 * at alpha at the hardware level.
 *
 * `null`/`DEFAULT_BG` cells are resolved to `plan.defaultBg` first (that
 * IS the color the terminal paints), then mixed toward the scrim — so
 * empty cells darken at the same rate as explicitly-colored cells.
 *
 * Uniform amounts for fg + bg preserve relative brightness ordering across
 * borders vs fills. Heaviness is controlled by `plan.amount` (default
 * 0.25, calibrated against macOS 0.20, Material 3 0.32, iOS 0.40, Flutter
 * 0.54).
 *
 * The `scrim !== null` gate activates the full two-channel path: fg always
 * deemphasizes, and bg mixes toward the scrim when a resolvable bg hex is
 * available (`cell.bg` non-null OR `defaultBg` non-null). When both
 * `scrim` and a resolvable bg are null (no theme context at all): falls
 * back to mixing fg toward `cell.bg` so the cell still reads as "receded"
 * without needing external theme info.
 *
 * ### Wide-char / emoji handling
 *
 * Terminals render emoji using the glyph's own bitmap colors — the fg mix
 * has no visible effect on the emoji glyph. Two paths, mutually exclusive:
 *
 * 1. Kitty graphics available: `fadeCell` SKIPS emoji wide cells entirely.
 *    The Kitty overlay composites the scrim at alpha=amount on top, landing
 *    at `cell * (1 - amount) + scrim * amount` — same as surrounding cells.
 * 2. Kitty unavailable: mix the cell bg + stamp `attrs.dim` on lead +
 *    continuation. Terminals honoring SGR 2 on emoji fade the glyph. Wide
 *    TEXT (CJK etc.) goes through the normal deemphasize path on both
 *    branches — the fg mix works fine and SGR 2 on CJK over-fades.
 */
function fadeCell(buffer: TerminalBuffer, x: number, y: number, plan: Plan): boolean {
  // Skip continuation half of wide chars — the leading cell at x-1 updates
  // this cell in lockstep when it's processed.
  if (buffer.isCellContinuation(x, y)) return false

  const cell = buffer.getCell(x, y)

  // Glyph classification: only EMOJI cells (bitmap glyphs that ignore fg
  // color) go through the Kitty overlay path. CJK and other wide TEXT cells
  // respond to fg color like narrow text and go through the buffer mix
  // path, which is correct for them. `cell.wide` alone is the wrong
  // discriminator — wide != emoji — pro review flagged this as a bug class.
  const isEmojiGlyph = cell.wide && isLikelyEmoji(cell.char ?? "")

  // When Kitty is available and this cell is an emoji, skip the buffer mix
  // — the Kitty overlay will composite the scrim at alpha=amount above the
  // unmixed cell, landing at `cell_bg * (1 - amount) + scrim * amount`,
  // same luminance as surrounding mixed cells. Mixing here too would
  // double-fade and produce a visibly blacker emoji bg.
  if (plan.kittyEnabled && isEmojiGlyph) return false

  const { amount, scrim, defaultBg, defaultFg, scrimTowardLight } = plan
  const rawFgHex = colorToHex(cell.fg)

  if (scrim !== null) {
    // Two-channel path — scrim is available. An explicit scrim is useful
    // even without a `defaultBg`: fg always deemphasizes toward neutrality,
    // and cells with explicit (non-null) `cell.bg` still mix toward the
    // scrim. Only cells whose bg is unresolvable (null) AND have no
    // `defaultBg` to fall back on skip the bg mix.
    //
    // Resolve null/default fg BEFORE deemphasize. Without this, default-fg
    // text (common in TUIs that don't set Text color explicitly) skips the
    // fade entirely — bg darkens but fg stays at full terminal brightness,
    // producing a visible "text POPS against faded bg" effect that users
    // perceive as "colors look more saturated when darkened".
    const fgHex: HexColor =
      rawFgHex ?? defaultFg ?? (scrimTowardLight ? DARK_SCRIM : LIGHT_SCRIM)

    // sRGB source-over mix: uniform bg toward scrim at `amount`. sRGB
    // matches the Kitty graphics overlay compositing so text-cell bg and
    // emoji-cell bg land at the same luminance in shared faded regions.
    // `colorToHex(cell.bg) ?? defaultBg` — when cell.bg is null/default
    // and no defaultBg is available, bgHex stays null and we skip the bg
    // mix while still deemphasizing fg.
    const bgHex: HexColor | null = colorToHex(cell.bg) ?? defaultBg
    const mixedBgHex = bgHex !== null ? mixSrgb(bgHex, scrim, amount) : null
    const mixedBg = mixedBgHex !== null ? hexToRgb(mixedBgHex) : null

    // Stamp SGR 2 dim on emoji cells when Kitty is NOT available — it's the
    // only portable way to signal "faded" on a glyph the fg mix can't
    // affect. For wide TEXT (CJK etc.), do NOT stamp dim: the fg mix works
    // fine, and SGR 2 on CJK over-fades the glyph.
    const stampEmojiDim = isEmojiGlyph
    const newAttrs = stampEmojiDim && !cell.attrs.dim ? { ...cell.attrs, dim: true } : cell.attrs

    // Fg uses OKLCH deemphasize — L toward 0 (dark) or 1 (light) per
    // `scrimTowardLight`, C *= (1-α)², H preserved. See
    // `deemphasizeOklchToward` docblock for the perceptual rationale. Bg
    // stays sRGB to match Kitty overlay compositing.
    const deemphasizedFgHex = deemphasizeOklchToward(fgHex, amount, scrimTowardLight)
    const mixedFg = hexToRgb(deemphasizedFgHex)

    if (mixedFg) {
      if (mixedBg) {
        buffer.setCell(x, y, { ...cell, fg: mixedFg, bg: mixedBg, attrs: newAttrs })
        propagateToContinuation(buffer, cell, x, y, { bg: mixedBg, dim: stampEmojiDim })
        return true
      }
      buffer.setCell(x, y, { ...cell, fg: mixedFg, attrs: newAttrs })
      if (stampEmojiDim) propagateToContinuation(buffer, cell, x, y, { dim: true })
      return true
    }

    // Fg deemphasize failed (rare — hex parse edge). Fall back to bg-only
    // mix + dim stamp.
    if (mixedBg) {
      buffer.setCell(x, y, { ...cell, bg: mixedBg, attrs: newAttrs })
      propagateToContinuation(buffer, cell, x, y, { bg: mixedBg, dim: stampEmojiDim })
      return true
    }
    if (cell.attrs.dim) return false
    buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
    return true
  }

  const fgHex = rawFgHex

  // Legacy path (no scrim): mix fg toward cell.bg.
  const bgHex = colorToHex(cell.bg)

  if (fgHex && bgHex) {
    const mixedHex = mixSrgb(fgHex, bgHex, amount)
    const mixedRgb = hexToRgb(mixedHex)
    if (!mixedRgb) return false
    // Emoji glyphs ignore fg color — the mix has no visible effect on the
    // glyph. Stamp attrs.dim on lead + continuation so terminals honoring
    // SGR 2 on emoji still fade the glyph. CJK and other wide TEXT keep
    // getting the fg mix only; SGR 2 on CJK over-fades.
    if (isEmojiGlyph) {
      const newAttrs = cell.attrs.dim ? cell.attrs : { ...cell.attrs, dim: true }
      buffer.setCell(x, y, { ...cell, fg: mixedRgb, attrs: newAttrs })
      propagateToContinuation(buffer, cell, x, y, { dim: true })
      return true
    }
    buffer.setCell(x, y, { ...cell, fg: mixedRgb })
    return true
  }

  // Fallback — bg unresolvable (DEFAULT_BG / null) or fg null. Stamp dim so
  // the cell still reads as "backdrop".
  if (cell.attrs.dim) return false
  buffer.setCell(x, y, { ...cell, attrs: { ...cell.attrs, dim: true } })
  if (cell.wide && x + 1 < buffer.width) {
    const cont = buffer.getCell(x + 1, y)
    if (!cont.attrs.dim) {
      buffer.setCell(x + 1, y, { ...cont, attrs: { ...cont.attrs, dim: true } })
    }
  }
  return true
}

/**
 * Propagate lead-cell updates to the continuation cell of a wide char.
 *
 * When a wide char (emoji, CJK) has its bg or dim attribute changed on the
 * lead cell, the continuation cell at `x+1` must track in lockstep or the
 * two halves of the glyph render inconsistently (different bg → visually
 * split glyph; missing dim → half-faded emoji).
 *
 * `patch.bg` copies the mixed bg onto the continuation. `patch.dim` stamps
 * `attrs.dim`. Either or both may be provided; the function is a no-op
 * when neither is set.
 */
function propagateToContinuation(
  buffer: TerminalBuffer,
  leadCell: { wide: boolean },
  x: number,
  y: number,
  patch: { bg?: { r: number; g: number; b: number }; dim?: boolean },
): void {
  if (!leadCell.wide) return
  if (x + 1 >= buffer.width) return
  const cont = buffer.getCell(x + 1, y)
  if (!cont.continuation) return

  const stampDim = patch.dim === true && !cont.attrs.dim
  const writeBg = patch.bg !== undefined

  // Nothing to do: skip the setCell allocation.
  if (!stampDim && !writeBg) return

  const attrs = stampDim ? { ...cont.attrs, dim: true } : cont.attrs
  if (writeBg) {
    buffer.setCell(x + 1, y, { ...cont, bg: patch.bg, attrs })
  } else {
    buffer.setCell(x + 1, y, { ...cont, attrs })
  }
}
