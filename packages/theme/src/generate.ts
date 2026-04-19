/**
 * ANSI 16 theme generation — derives a complete Theme from a primary color + dark/light.
 *
 * Uses ANSI color names (not hex) so it works on any terminal without truecolor support.
 */

import type { AnsiPrimary, Theme } from "@silvery/ansi"
import { deriveFields, DEFAULT_VARIANTS } from "@silvery/ansi"

// Re-export for consumers that import DEFAULT_VARIANTS from here.
export { DEFAULT_VARIANTS }

/**
 * Generate a complete ANSI 16 theme from a primary color + dark/light preference.
 *
 * All token values are ANSI color names (e.g. "yellow", "blueBright").
 */
export function generateTheme(primary: AnsiPrimary, dark: boolean): Theme {
  const fg = dark ? "whiteBright" : "black"
  const accent = primary // generate.ts: accent = primary (single-color generator)
  const selectionbg = primary
  const surfacebg = dark ? "black" : "white"

  // Categorical ring — computed from dark flag alone (no ColorScheme available)
  const ring = {
    red: dark ? "redBright" : "red",
    orange: dark ? "redBright" : "red", // no orange slot in ANSI 16
    yellow: "yellow",
    green: dark ? "greenBright" : "green",
    teal: "cyan", // canonical: cyan (not cyanBright — aligned to deriveAnsi16Theme)
    blue: dark ? "blueBright" : "blue",
    purple: "magenta",
    pink: dark ? "magentaBright" : "magenta",
  }

  const derived = deriveFields({ mode: "ansi16", primary, accent, fg, selectionbg, surfacebg, ring })

  return {
    name: `${dark ? "dark" : "light"}-${primary}`,

    // ── Root pair ─────────────────────────────────────────────────
    bg: "",
    fg,

    // ── Surface pairs (base = text, *bg = background) ──────────
    muted: dark ? "white" : "blackBright",
    mutedbg: dark ? "black" : "white",
    surface: dark ? "whiteBright" : "black",
    surfacebg,
    popover: dark ? "whiteBright" : "black",
    popoverbg: dark ? "blackBright" : "white",
    inverse: dark ? "black" : "whiteBright",
    inversebg: dark ? "whiteBright" : "black",
    cursor: "black",
    cursorbg: primary,
    selection: "black",
    selectionbg: primary,

    // ── Accent pairs (base = area bg, *fg = text on area) ──────
    primary,
    primaryfg: "black",
    secondary: primary,
    secondaryfg: "black",
    accent: primary,
    accentfg: "black",
    error: dark ? "redBright" : "red",
    errorfg: "black",
    warning: primary,
    warningfg: "black",
    success: dark ? "greenBright" : "green",
    successfg: "black",
    info: dark ? "cyanBright" : "cyan",
    infofg: "black",

    // ── Standalone ───────────────────────────────────────────────
    border: "gray",
    inputborder: "gray",
    focusborder: dark ? "blueBright" : "blue",
    link: "blueBright",
    disabledfg: "gray",

    // ── Palette ──────────────────────────────────────────────────
    palette: [
      "black",
      "red",
      "green",
      "yellow",
      "blue",
      "magenta",
      "cyan",
      "white",
      "blackBright",
      "redBright",
      "greenBright",
      "yellowBright",
      "blueBright",
      "magentaBright",
      "cyanBright",
      "whiteBright",
    ],

    // ── Derived fields (brand, ring, state variants, variants) ───
    ...derived,
  }
}
