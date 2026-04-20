/**
 * Unified scheme detection orchestrator.
 *
 * Consolidates the four detection layers into a single entry point:
 *
 *   1. **Override** — `SILVERY_COLOR` env var / explicit option forces a scheme
 *   2. **Probe** — OSC 10/11/4 query the terminal for its 22 slots
 *   3. **Fingerprint** — match probed slots against a catalog → named scheme
 *   4. **Fallback** — `defaultDarkScheme` / `defaultLightScheme` based on BgMode
 *
 * Returns `{ scheme, theme, source, confidence, slotSources }` so callers can
 * tell apart "detected Dracula at 0.98 confidence" from "falling back to
 * default-dark because probing failed."
 */

import type { ColorScheme, Theme } from "./types.ts"
import { COLOR_SCHEME_FIELDS } from "./types.ts"
import { deriveTheme, loadTheme } from "./derive.ts"
import { probeColors } from "./detect.ts"
import { fingerprintMatch } from "./fingerprint.ts"
import { defaultDarkScheme, defaultLightScheme } from "./default-schemes.ts"

/** How the final scheme was decided. */
export type DetectSource =
  | "override" // explicit option or SILVERY_COLOR env var
  | "fingerprint" // probed + matched a catalog scheme
  | "probed" // probed but no catalog match (custom scheme)
  | "bg-mode" // bg-mode detection only (no full probe)
  | "fallback" // nothing worked, using defaultDark/Light

/** Where each slot's value came from. */
export type SlotSource = "probed" | "catalog" | "fallback"

export interface DetectSchemeResult {
  /** The resolved 22-slot color scheme. */
  scheme: ColorScheme
  /** The derived, validated Theme (via loadTheme). */
  theme: Theme
  /** How the scheme was determined overall. */
  source: DetectSource
  /** 0–1 confidence heuristic (exact override = 1, fingerprint = match score, fallback = 0). */
  confidence: number
  /** Per-slot provenance. Keys are ColorScheme field names. */
  slotSources: Partial<Record<keyof ColorScheme, SlotSource>>
  /** If fingerprint matched, the catalog scheme name. */
  matchedName?: string
}

export interface DetectSchemeOptions {
  /** Explicit override — if provided, skips all probing. */
  override?: ColorScheme
  /** Catalog to fingerprint against. If empty or undefined, skip fingerprinting. */
  catalog?: readonly ColorScheme[]
  /** OSC probe timeout (ms). Default 150. */
  timeoutMs?: number
  /** Force dark/light inference when no bg is probed. */
  darkFallback?: boolean
  /**
   * Apply strict invariant validation to the loaded Theme. Default `lenient`.
   * See `loadTheme`'s `enforce` parameter.
   */
  enforce?: "strict" | "lenient" | "off"
  /** Add WCAG contrast check to the invariant validation. Default `false`. */
  wcag?: boolean
}

function envOverride(): "truecolor" | "256" | "ansi16" | "scheme" | "mono" | "auto" | null {
  const v = process.env.SILVERY_COLOR
  if (!v) return null
  if (
    v === "truecolor" ||
    v === "256" ||
    v === "ansi16" ||
    v === "scheme" ||
    v === "mono" ||
    v === "auto"
  )
    return v
  return null
}

/**
 * Detect the terminal's color scheme + derive a theme in one call.
 *
 * Runs the 4-layer detection cascade (override → probe → fingerprint →
 * fallback) and returns a fully-resolved Theme along with provenance metadata
 * so callers can log how the scheme was determined.
 *
 * This is the recommended entry point for apps — it handles all the gotchas
 * (non-TTY environments, failed probes, partial OSC responses, catalog matches,
 * bg-mode inference) and returns something you can hand to `ThemeProvider`.
 *
 * @example
 * ```ts
 * import { detectScheme } from "@silvery/ansi"
 * import { builtinPalettes } from "@silvery/theme/schemes"
 *
 * const { scheme, theme, source, matchedName, confidence } = await detectScheme({
 *   catalog: Object.values(builtinPalettes),
 *   enforce: "lenient",
 * })
 * console.log(`${source === "fingerprint" ? `detected ${matchedName}` : source} (${(confidence * 100).toFixed(0)}%)`)
 * ```
 */
export async function detectScheme(opts: DetectSchemeOptions = {}): Promise<DetectSchemeResult> {
  const enforce = opts.enforce ?? "lenient"
  const wcag = opts.wcag ?? false

  // 1. Explicit override (option or env var)
  if (opts.override) {
    const theme = loadTheme(opts.override, { enforce, wcag })
    return {
      scheme: opts.override,
      theme,
      source: "override",
      confidence: 1,
      slotSources: allSlotsFrom("fallback"), // override is opaque — we don't know provenance
      matchedName: opts.override.name,
    }
  }

  const envMode = envOverride()
  if (envMode === "mono" || envMode === "ansi16") {
    // These tiers have their own theme shapes — return dark fallback + mark as override
    const fallback = opts.darkFallback !== false ? defaultDarkScheme : defaultLightScheme
    const theme = loadTheme(fallback, { enforce, wcag })
    return {
      scheme: fallback,
      theme,
      source: "override",
      confidence: 1,
      slotSources: allSlotsFrom("fallback"),
      matchedName: fallback.name,
    }
  }

  // 2. Probe terminal
  const detected = await probeColors(opts.timeoutMs)

  // No probe result → pure fallback
  if (!detected) {
    const dark = opts.darkFallback !== false
    const fallback = dark ? defaultDarkScheme : defaultLightScheme
    const theme = loadTheme(fallback, { enforce, wcag })
    return {
      scheme: fallback,
      theme,
      source: "fallback",
      confidence: 0,
      slotSources: allSlotsFrom("fallback"),
      matchedName: fallback.name,
    }
  }

  // 3. Fingerprint if catalog provided
  const catalog = opts.catalog ?? []
  if (catalog.length > 0) {
    const match = fingerprintMatch(detected.palette, catalog)
    if (match) {
      const theme = loadTheme(match.scheme, { enforce, wcag })
      return {
        scheme: match.scheme,
        theme,
        source: "fingerprint",
        confidence: match.confidence,
        slotSources: allSlotsFrom("catalog"),
        matchedName: match.scheme.name,
      }
    }
  }

  // 4. Probed but no catalog match — merge probed slots over fallback
  const dark = detected.dark
  const fallback = dark ? defaultDarkScheme : defaultLightScheme
  const merged: ColorScheme = { ...fallback, ...stripNulls(detected.palette) }
  const theme = loadTheme(merged, { enforce, wcag })

  // Per-slot provenance: probed slots come from detected.palette, the rest from fallback
  const slotSources: Partial<Record<keyof ColorScheme, SlotSource>> = {}
  for (const field of COLOR_SCHEME_FIELDS) {
    const probed = (detected.palette as Record<string, unknown>)[field]
    slotSources[field] = typeof probed === "string" ? "probed" : "fallback"
  }

  // Confidence heuristic: proportion of slots that were probed (of the 18 trackable: fg + bg + 16 ansi)
  const probedCount = Object.values(slotSources).filter((s) => s === "probed").length
  const confidence = Math.min(1, probedCount / 18)

  return {
    scheme: merged,
    theme,
    source: "probed",
    confidence,
    slotSources,
    matchedName: undefined,
  }
}

function stripNulls(partial: Partial<ColorScheme>): Partial<ColorScheme> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(partial)) {
    if (v != null) result[k] = v
  }
  return result as Partial<ColorScheme>
}

function allSlotsFrom(src: SlotSource): Partial<Record<keyof ColorScheme, SlotSource>> {
  const out: Partial<Record<keyof ColorScheme, SlotSource>> = {}
  for (const field of COLOR_SCHEME_FIELDS) out[field] = src
  return out
}

/**
 * Shortcut: detect scheme + return the Theme only. For apps that don't care
 * about provenance. Same defaults as `detectScheme`.
 *
 * @example
 * ```ts
 * const theme = await detectSchemeTheme({ catalog: Object.values(builtinPalettes) })
 * render(<ThemeProvider theme={theme}>…</ThemeProvider>)
 * ```
 */
export async function detectSchemeTheme(opts: DetectSchemeOptions = {}): Promise<Theme> {
  const { theme } = await detectScheme(opts)
  return theme
}
