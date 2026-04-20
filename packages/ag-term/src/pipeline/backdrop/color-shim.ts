/**
 * Backdrop fade — `@silvery/color` polarity-aware deemphasize shim.
 *
 * `@silvery/color` exports `deemphasize` (dark-only, drifts L toward 0) and
 * `mixSrgb` directly. Use those whenever possible. The light-theme-aware
 * variant `deemphasizeOklchToward` (drifts L toward 0 OR 1 by polarity) is
 * NOT yet upstream — this file ships it locally.
 *
 * **Deletion condition**: when `@silvery/color` exports
 * `deemphasizeOklchToward`, delete this file entirely and update
 * `./realize-buffer.ts` to import directly from `@silvery/color`. Audit
 * with `rg "from .*color-shim"` — should drop to zero.
 *
 * @see ./color.ts for hex↔rgb adapter helpers and `HexColor` type.
 */

import { hexToOklch, oklchToHex } from "@silvery/color"

/**
 * OKLCH-native deemphasize that drifts toward EITHER black (dark themes)
 * OR white (light themes). `towardLight` controls the lightness target;
 * the chroma falloff is identical in both directions.
 *
 *   towardLight=false (dark themes):
 *     L' = L × (1 - amount)          // linear toward black
 *   towardLight=true (light themes):
 *     L' = L + (1 - L) × amount      // linear toward white
 *   (both branches):
 *     C' = C × (1 - amount)²         // quadratic chroma falloff
 *     H' = H                         // hue preserved
 *
 * The asymmetric chroma falloff corrects for a perceptual nonlinearity:
 * the human visual system reads chroma RELATIVE to luminance, so a modest
 * OKLCH C at extreme L *appears* distinctly more chromatic than the same C
 * near mid-L. Proportional L+C scaling (`C *= 1-α`, preserving C/L) feels
 * "more saturated when darkened" to viewers.
 *
 * Light-theme case (towardLight=true): a bright colored text on a light
 * backdrop is made paler by raising L toward 1 and dropping C — the
 * symmetric "fade toward the page color" behavior macOS ships in light
 * mode. Without the polarity flip, the dark-only formula `L *= (1 - α)`
 * would darken colored text on a light bg, which reads as "text popping"
 * against the faded scrim rather than receding.
 */
export function deemphasizeOklchToward(hex: string, amount: number, towardLight: boolean): string {
  const o = hexToOklch(hex)
  if (!o) return hex
  const a = Math.max(0, Math.min(1, amount))
  const chromaFactor = (1 - a) * (1 - a)
  const L = towardLight ? o.L + (1 - o.L) * a : o.L * (1 - a)
  return oklchToHex({
    L: Math.max(0, Math.min(1, L)),
    C: Math.max(0, o.C * chromaFactor),
    H: o.H,
  })
}

/**
 * Dark-theme deemphasize. Convenience alias so existing callers don't
 * have to thread `towardLight=false` everywhere. New code should prefer
 * `deemphasizeOklchToward` directly so the polarity is explicit at the
 * call site, OR `deemphasize` from `@silvery/color` (byte-identical).
 */
export function deemphasizeOklch(hex: string, amount: number): string {
  return deemphasizeOklchToward(hex, amount, false)
}
