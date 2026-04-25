/**
 * ANSI 16 theme generation — derives a complete Theme from a primary color + dark/light.
 *
 * All token values are hex strings. Terminal rendering quantizes hex to 4-bit
 * ANSI codes at paint time when colorLevel === "ansi16".
 */

import type { AnsiPrimary, Theme } from "@silvery/ansi"
import { deriveFields, DEFAULT_VARIANTS, ANSI16_SLOT_HEX } from "@silvery/ansi"

// Re-export for consumers that import DEFAULT_VARIANTS from here.
export { DEFAULT_VARIANTS }

/**
 * Resolve an ANSI16 slot name (e.g. "yellow", "blueBright") to its canonical
 * hex value. Falls back to the input string if not found (e.g., already hex).
 */
function slotHex(name: string): string {
  return ANSI16_SLOT_HEX[name] ?? name
}

/**
 * Generate a complete ANSI 16 theme from a primary color + dark/light preference.
 *
 * All token values are hex strings (e.g. "#808000" for yellow).
 * Terminal rendering quantizes these to 4-bit ANSI codes at paint time
 * when colorLevel === "ansi16".
 */
export function generateTheme(primary: AnsiPrimary, dark: boolean): Theme {
  const primaryHex = slotHex(primary)
  const fgHex = slotHex(dark ? "whiteBright" : "black")
  const accentHex = primaryHex // generate.ts: accent = primary (single-color generator)
  const selectionbgHex = primaryHex
  const surfacebgHex = slotHex(dark ? "black" : "white")

  // Categorical ring — computed from dark flag alone (no ColorScheme available)
  const ring = {
    red: slotHex(dark ? "redBright" : "red"),
    orange: slotHex(dark ? "redBright" : "red"), // no orange slot in ANSI 16
    yellow: slotHex("yellow"),
    green: slotHex(dark ? "greenBright" : "green"),
    teal: slotHex("cyan"), // canonical: cyan (not cyanBright — aligned to deriveAnsi16Theme)
    blue: slotHex(dark ? "blueBright" : "blue"),
    purple: slotHex("magenta"),
    pink: slotHex(dark ? "magentaBright" : "magenta"),
  }

  const derived = deriveFields({
    primary: primaryHex,
    accent: accentHex,
    fg: fgHex,
    selectionbg: selectionbgHex,
    surfacebg: surfacebgHex,
    ring,
  })

  return {
    name: `${dark ? "dark" : "light"}-${primary}`,

    // ── Root pair ─────────────────────────────────────────────────
    bg: "",
    fg: fgHex,

    // ── Surface pairs (base = text, *bg = background) ──────────
    muted: slotHex(dark ? "white" : "blackBright"),
    mutedbg: slotHex(dark ? "black" : "white"),
    surface: slotHex(dark ? "whiteBright" : "black"),
    surfacebg: surfacebgHex,
    popover: slotHex(dark ? "whiteBright" : "black"),
    popoverbg: slotHex(dark ? "blackBright" : "white"),
    inverse: slotHex(dark ? "black" : "whiteBright"),
    inversebg: slotHex(dark ? "whiteBright" : "black"),
    cursor: slotHex("black"),
    cursorbg: primaryHex,
    selection: slotHex("black"),
    selectionbg: primaryHex,

    // ── Accent pairs (base = area bg, *fg = text on area) ──────
    primary: primaryHex,
    primaryfg: slotHex("black"),
    secondary: primaryHex,
    secondaryfg: slotHex("black"),
    accent: primaryHex,
    accentfg: slotHex("black"),
    error: slotHex(dark ? "redBright" : "red"),
    errorfg: slotHex("black"),
    warning: primaryHex,
    warningfg: slotHex("black"),
    success: slotHex(dark ? "greenBright" : "green"),
    successfg: slotHex("black"),
    info: slotHex(dark ? "cyanBright" : "cyan"),
    infofg: slotHex("black"),

    // ── Standalone ───────────────────────────────────────────────
    border: slotHex("gray"),
    inputborder: slotHex("gray"),
    focusborder: slotHex(dark ? "blueBright" : "blue"),
    link: slotHex("blueBright"),
    disabledfg: slotHex("gray"),

    // ── Palette ──────────────────────────────────────────────────
    palette: [
      slotHex("black"),
      slotHex("red"),
      slotHex("green"),
      slotHex("yellow"),
      slotHex("blue"),
      slotHex("magenta"),
      slotHex("cyan"),
      slotHex("white"),
      slotHex("blackBright"),
      slotHex("redBright"),
      slotHex("greenBright"),
      slotHex("yellowBright"),
      slotHex("blueBright"),
      slotHex("magentaBright"),
      slotHex("cyanBright"),
      slotHex("whiteBright"),
    ],

    // ── Derived fields (brand, ring, state variants, variants) ───
    ...derived,
  } as unknown as Theme
}
