/**
 * Terminal palette auto-detection via OSC queries.
 *
 * Enhanced version with named palette fallbacks (Nord dark, Catppuccin Latte light).
 * The base implementation lives in @silvery/ansi — this adds richer defaults.
 *
 * @silvery/theme consumers: import from here for named palette fallbacks.
 * Standalone consumers: import from @silvery/ansi for lightweight defaults.
 */

import type { ColorScheme, Theme } from "./types"
import { deriveTheme } from "./derive"
import {
  detectTerminalScheme as _detectTerminalScheme,
  queryMultiplePaletteColors,
  parsePaletteResponse,
  queryForegroundColor,
  queryBackgroundColor,
  ansi16DarkTheme,
  ansi16LightTheme,
} from "@silvery/ansi"
import type { DetectedScheme } from "@silvery/ansi"
import { nord } from "./schemes/nord"
import { catppuccinLatte } from "./schemes/catppuccin"

// Re-export the base detection — works standalone without named palettes
export { _detectTerminalScheme as detectTerminalScheme }
export type { DetectedScheme }

// ============================================================================
// detectTheme — high-level: detect terminal palette, fill gaps, derive theme
// ============================================================================

export interface DetectThemeOptions {
  /** Fallback ColorScheme when detection fails or returns partial data.
   * Detected colors override matching fallback fields. */
  fallback?: ColorScheme
  /** Timeout per OSC query in ms (default 150). */
  timeoutMs?: number
  /** Terminal capabilities (from detectTerminalCaps). When provided:
   * - colorLevel "none"/"basic" skips OSC detection and returns ANSI 16 theme
   * - darkBackground informs fallback selection when detection fails */
  caps?: { colorLevel?: string; darkBackground?: boolean }
}

/**
 * Detect the terminal's color palette and derive a Theme.
 *
 * Enhanced version that uses Nord (dark) or Catppuccin Latte (light)
 * as fallback palettes for richer defaults than the base @silvery/ansi version.
 */
export async function detectTheme(opts: DetectThemeOptions = {}): Promise<Theme> {
  const colorLevel = opts.caps?.colorLevel
  if (colorLevel === "none" || colorLevel === "basic") {
    const isDark = opts.caps?.darkBackground ?? true
    return isDark ? ansi16DarkTheme : ansi16LightTheme
  }

  const detected = await _detectTerminalScheme(opts.timeoutMs)
  const isDark = detected?.dark ?? opts.caps?.darkBackground ?? true
  const fallback = opts.fallback ?? (isDark ? nord : catppuccinLatte)

  if (!detected) {
    return deriveTheme(fallback)
  }

  const merged: ColorScheme = { ...fallback, ...stripNulls(detected.palette) }
  return deriveTheme(merged)
}

function stripNulls(partial: Partial<ColorScheme>): Partial<ColorScheme> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(partial)) {
    if (v != null) result[k] = v
  }
  return result as Partial<ColorScheme>
}
