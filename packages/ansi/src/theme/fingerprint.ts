/**
 * Scheme fingerprinting — match a terminal's probed colors against a catalog
 * of known schemes.
 *
 * OSC 10/11/4 probing yields up to 18 slots (fg + bg + 16 ANSI colors).
 * Fingerprint matching compares that probed slot-set against every catalog
 * scheme using OKLCH ΔE distance, returning the best match with a confidence
 * score. This unlocks "detect the user's scheme" UX — apps can style
 * themselves to match the terminal without the user picking a theme.
 *
 * Match criteria (both required for a match):
 *   1. ΔE sum across probed slots < `sumThreshold` (default 30)
 *   2. Per-slot max ΔE < `perSlotThreshold` (default 8)
 *
 * The per-slot check prevents false positives where most slots are close but
 * one slot is wildly off (e.g., same ansi[0..14] but different red) — those
 * are different schemes, not noisy matches.
 */

import type { ColorScheme } from "./types.ts"
import { colorDistance } from "@silvery/color"

/** Fields that are always probed and used for fingerprinting. */
const FINGERPRINT_FIELDS: readonly (keyof ColorScheme)[] = [
  "foreground",
  "background",
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const

export interface FingerprintOptions {
  /** Sum-of-ΔE threshold for match acceptance. Default: 30. */
  sumThreshold?: number
  /** Per-slot max ΔE threshold. Default: 8. */
  perSlotThreshold?: number
}

export interface FingerprintMatch {
  /** The catalog scheme that matched. */
  scheme: ColorScheme
  /** Total ΔE across all probed slots (lower = better). */
  sumDeltaE: number
  /** Largest per-slot ΔE (lower = better). */
  maxDeltaE: number
  /** Number of slots compared (can be < 18 if some probed slots are null). */
  slotsCompared: number
  /** Heuristic 0–1 confidence score. */
  confidence: number
}

/**
 * Map ΔE thresholds into a 0–1 confidence.
 *
 * sumΔE=0 + maxΔE=0 → 1.0 (perfect match)
 * sumΔE=30 (threshold)  → ~0.5
 * sumΔE≥60 → ~0.0
 */
function computeConfidence(sumDE: number, maxDE: number, sumThreshold: number): number {
  const sumScore = Math.max(0, 1 - sumDE / (sumThreshold * 2))
  const maxScore = Math.max(0, 1 - maxDE / 16)
  // Weight sum more heavily — a good average with one outlier isn't a real match.
  return Math.max(0, Math.min(1, 0.7 * sumScore + 0.3 * maxScore))
}

/**
 * Match probed slots against a catalog, returning the best candidate if it
 * satisfies both sum and per-slot thresholds. Returns `null` if nothing matches.
 *
 * `probed` is a partial ColorScheme — whatever slots OSC queries returned. Missing
 * slots are skipped (still counted as "not compared"). Non-hex values are
 * ignored (ΔE can't be computed).
 */
export function fingerprintMatch(
  probed: Partial<ColorScheme>,
  catalog: readonly ColorScheme[],
  opts: FingerprintOptions = {},
): FingerprintMatch | null {
  const sumThreshold = opts.sumThreshold ?? 30
  const perSlotThreshold = opts.perSlotThreshold ?? 8

  let best: FingerprintMatch | null = null

  for (const scheme of catalog) {
    let sumDE = 0
    let maxDE = 0
    let slotsCompared = 0

    for (const field of FINGERPRINT_FIELDS) {
      const probedVal = probed[field]
      const catalogVal = scheme[field]
      if (typeof probedVal !== "string" || typeof catalogVal !== "string") continue
      const de = colorDistance(probedVal, catalogVal)
      if (de === null) continue
      // Scale ΔE to the ×100 convention used in the thresholds.
      const scaled = de * 100
      sumDE += scaled
      if (scaled > maxDE) maxDE = scaled
      slotsCompared++
    }

    if (slotsCompared === 0) continue
    if (maxDE > perSlotThreshold) continue
    if (sumDE > sumThreshold) continue

    if (best === null || sumDE < best.sumDeltaE) {
      best = {
        scheme,
        sumDeltaE: sumDE,
        maxDeltaE: maxDE,
        slotsCompared,
        confidence: computeConfidence(sumDE, maxDE, sumThreshold),
      }
    }
  }

  return best
}

/**
 * Like `fingerprintMatch`, but returns all candidates that pass the thresholds
 * sorted by `sumDeltaE` ascending. Useful for UX where the user picks among
 * a shortlist ("Looks like you're using one of: Dracula, Horizon, Tokyo Night").
 */
export function fingerprintCandidates(
  probed: Partial<ColorScheme>,
  catalog: readonly ColorScheme[],
  opts: FingerprintOptions = {},
): FingerprintMatch[] {
  const sumThreshold = opts.sumThreshold ?? 30
  const perSlotThreshold = opts.perSlotThreshold ?? 8
  const out: FingerprintMatch[] = []

  for (const scheme of catalog) {
    let sumDE = 0
    let maxDE = 0
    let slotsCompared = 0

    for (const field of FINGERPRINT_FIELDS) {
      const probedVal = probed[field]
      const catalogVal = scheme[field]
      if (typeof probedVal !== "string" || typeof catalogVal !== "string") continue
      const de = colorDistance(probedVal, catalogVal)
      if (de === null) continue
      const scaled = de * 100
      sumDE += scaled
      if (scaled > maxDE) maxDE = scaled
      slotsCompared++
    }

    if (slotsCompared === 0) continue
    if (maxDE > perSlotThreshold) continue
    if (sumDE > sumThreshold) continue

    out.push({
      scheme,
      sumDeltaE: sumDE,
      maxDeltaE: maxDE,
      slotsCompared,
      confidence: computeConfidence(sumDE, maxDE, sumThreshold),
    })
  }

  out.sort((a, b) => a.sumDeltaE - b.sumDeltaE)
  return out
}
