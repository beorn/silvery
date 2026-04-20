/**
 * Backdrop fade — `@silvery/color` compatibility shim.
 *
 * Temporary shim while `@silvery/color` lags behind on publish cycles.
 * `@silvery/color` does export `mixSrgb` and `deemphasize` from source; this
 * module prefers the upstream versions at runtime and falls back to a
 * local implementation when an upstream export is missing — e.g., when a
 * new helper is introduced in the same release cycle as the silvery
 * package that imports it (the published `@silvery/color` dist doesn't
 * ship the new name until its next publish, breaking CI verify).
 *
 * The fallback implementations are byte-identical to the upstream ones.
 * Once all downstream consumers of silvery are on a published version of
 * `@silvery/color` that exports every name we reference, delete the
 * `local*` fallbacks and collapse each export to a direct re-export.
 *
 * Light-theme-aware deemphasize (`deemphasizeOklchToward`) is NOT in
 * upstream yet — it's only shipped by this module. When it lands in
 * `@silvery/color`, replace the local implementation with an upstream
 * re-export behind the same shim.
 *
 * @see ./color.ts for hex↔rgb adapter helpers and `HexColor` type.
 */

import * as Upstream from "@silvery/color"
import { hexToRgb, rgbToHex } from "./color"

/**
 * sRGB source-over alpha mix. `out = a * (1 - t) + b * t`.
 *
 * Prefers `@silvery/color`'s published export; falls back to the local copy
 * when upstream doesn't ship the name yet. The local implementation matches
 * `@silvery/color/src/color.ts` byte-for-byte and is safe to use while the
 * publish train catches up.
 */
function localMixSrgb(a: string, b: string, t: number): string {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra || !rb) return a
  const u = Math.max(0, Math.min(1, t))
  const r = ra.r * (1 - u) + rb.r * u
  const g = ra.g * (1 - u) + rb.g * u
  const bl = ra.b * (1 - u) + rb.b * u
  return rgbToHex(r, g, bl)
}

const upstreamMixSrgb = (Upstream as unknown as Record<string, unknown>).mixSrgb as
  | ((a: string, b: string, t: number) => string)
  | undefined

/** sRGB source-over mix. Prefers upstream `@silvery/color`; falls back to the local copy. */
export const mixSrgb: (a: string, b: string, t: number) => string = upstreamMixSrgb ?? localMixSrgb

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
 * "more saturated when darkened" to viewers — the exact complaint that
 * prompted the quadratic version.
 *
 * Using `(1-α)²` for chroma reduces saturation faster than lightness on
 * both polarities:
 *
 *   α=0.25 → C *= 0.563  (C/L drops to 75% of original)
 *   α=0.40 → C *= 0.360  (C/L drops to 60%)
 *   α=0.50 → C *= 0.250  (C/L drops to 50%)
 *   α=1.00 → C *= 0      (fully faded to the target luminance).
 *
 * Light-theme case (towardLight=true): a bright colored text on a light
 * backdrop is made paler by raising L toward 1 and dropping C — the
 * symmetric "fade toward the page color" behavior macOS ships in light
 * mode. Without the polarity flip, the dark-only formula `L *= (1 - α)`
 * would darken colored text on a light bg, which reads as "text popping"
 * against the faded scrim rather than receding.
 */
function localDeemphasizeOklchToward(hex: string, amount: number, towardLight: boolean): string {
  const o = upstreamHexToOklch(hex)
  if (!o) return hex
  const a = Math.max(0, Math.min(1, amount))
  const chromaFactor = (1 - a) * (1 - a)
  const L = towardLight ? o.L + (1 - o.L) * a : o.L * (1 - a)
  return upstreamOklchToHex({
    L: Math.max(0, Math.min(1, L)),
    C: Math.max(0, o.C * chromaFactor),
    H: o.H,
  })
}

// Lightweight typed indirection into upstream — avoids `as any` at every
// call site. Using the runtime-export form so bundlers don't require the
// names at import time (supports the "same-release-cycle publish" case).
type Oklch = { L: number; C: number; H: number }
const upstreamHexToOklch = (Upstream as unknown as Record<string, unknown>).hexToOklch as
  | ((hex: string) => Oklch | null)
  // The upstream `hexToOklch` has always shipped — cast is a safety net,
  // not a feature-gate like the compat helpers above.
  | ((hex: string) => Oklch | null)
const upstreamOklchToHex = (Upstream as unknown as Record<string, unknown>).oklchToHex as (
  color: Oklch,
) => string

/**
 * OKLCH deemphasize with explicit polarity control. See
 * `localDeemphasizeOklchToward` for the math and rationale.
 *
 * Prefers the upstream `deemphasizeOklchToward` export when available;
 * falls back to the local implementation when upstream doesn't ship the
 * name yet (expected during the first release cycle that needs the
 * light-theme polarity).
 */
const upstreamDeemphasizeToward = (Upstream as unknown as Record<string, unknown>)
  .deemphasizeOklchToward as
  | ((hex: string, amount: number, towardLight: boolean) => string)
  | undefined

export const deemphasizeOklchToward: (hex: string, amount: number, towardLight: boolean) => string =
  upstreamDeemphasizeToward ?? localDeemphasizeOklchToward

/**
 * Dark-theme deemphasize. Retained as a convenience alias so existing
 * callers don't have to thread `towardLight=false` everywhere. New code
 * should prefer `deemphasizeOklchToward` directly so the polarity is
 * explicit at the call site.
 */
export function deemphasizeOklch(hex: string, amount: number): string {
  return deemphasizeOklchToward(hex, amount, false)
}
