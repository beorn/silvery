/**
 * Theme derivation — transforms a ColorPalette into a Theme.
 *
 * All inputs ultimately flow through deriveTheme():
 *   ColorPalette (22) → deriveTheme() → Theme (33)
 *
 * Supports two modes:
 *   - truecolor (default): rich derivation with blends, contrast pairing, OKLCH
 *   - ansi16: direct aliases into the 22 palette colors (no blending)
 */

import { blend, contrastFg, desaturate, complement } from "./color";
import type { ColorPalette, Theme } from "./types";

/**
 * Derive a complete Theme from a ColorPalette.
 *
 * The palette provides 22 terminal colors. This function maps them to
 * 33 semantic tokens + a 16-color content palette.
 *
 * @param palette - The 22-color terminal palette
 * @param mode - "truecolor" (default) for rich derivation, "ansi16" for direct aliases
 */
export function deriveTheme(
  palette: ColorPalette,
  mode: "ansi16" | "truecolor" = "truecolor",
): Theme {
  if (mode === "ansi16") return deriveAnsi16Theme(palette);
  return deriveTruecolorTheme(palette);
}

function deriveTruecolorTheme(p: ColorPalette): Theme {
  const dark = p.dark ?? true;
  const primaryColor = dark ? p.yellow : p.blue;

  return {
    name: p.name ?? (dark ? "derived-dark" : "derived-light"),

    // ── Pairs ────────────────────────────────────────────────────
    bg: p.background,
    fg: p.foreground,
    surface: blend(p.background, p.foreground, 0.05),
    surfacefg: p.foreground,
    popover: blend(p.background, p.foreground, 0.08),
    popoverfg: p.foreground,
    muted: blend(p.background, p.foreground, 0.04),
    mutedfg: blend(p.foreground, p.background, 0.7),
    primary: primaryColor,
    primaryfg: contrastFg(primaryColor),
    secondary: desaturate(primaryColor, 0.4),
    secondaryfg: contrastFg(desaturate(primaryColor, 0.4)),
    accent: complement(primaryColor),
    accentfg: contrastFg(complement(primaryColor)),
    error: p.red,
    errorfg: contrastFg(p.red),
    warning: p.yellow,
    warningfg: contrastFg(p.yellow),
    success: p.green,
    successfg: contrastFg(p.green),
    info: p.cyan,
    infofg: contrastFg(p.cyan),
    selection: p.selectionBackground,
    selectionfg: p.selectionForeground,
    inverse: blend(p.foreground, p.background, 0.1),
    inversefg: contrastFg(blend(p.foreground, p.background, 0.1)),
    cursor: p.cursorColor,
    cursorfg: p.cursorText,

    // ── Standalone ───────────────────────────────────────────────
    border: blend(p.background, p.foreground, 0.15),
    inputborder: blend(p.background, p.foreground, 0.25),
    focusborder: p.blue,
    link: p.blue,
    disabledfg: blend(p.foreground, p.background, 0.5),

    // ── 16 palette passthrough ───────────────────────────────────
    palette: [
      p.black,
      p.red,
      p.green,
      p.yellow,
      p.blue,
      p.magenta,
      p.cyan,
      p.white,
      p.brightBlack,
      p.brightRed,
      p.brightGreen,
      p.brightYellow,
      p.brightBlue,
      p.brightMagenta,
      p.brightCyan,
      p.brightWhite,
    ],
  };
}

function deriveAnsi16Theme(p: ColorPalette): Theme {
  const dark = p.dark ?? true;
  const primaryColor = dark ? p.yellow : p.blue;

  return {
    name: p.name ?? (dark ? "derived-ansi16-dark" : "derived-ansi16-light"),

    // ── Pairs (direct aliases, no blending) ──────────────────────
    bg: p.background,
    fg: p.foreground,
    surface: p.black,
    surfacefg: p.foreground,
    popover: p.black,
    popoverfg: p.foreground,
    muted: p.black,
    mutedfg: p.white,
    primary: primaryColor,
    primaryfg: p.black,
    secondary: p.magenta,
    secondaryfg: p.black,
    accent: p.cyan,
    accentfg: p.black,
    error: dark ? p.brightRed : p.red,
    errorfg: p.black,
    warning: p.yellow,
    warningfg: p.black,
    success: dark ? p.brightGreen : p.green,
    successfg: p.black,
    info: p.cyan,
    infofg: p.black,
    selection: p.selectionBackground,
    selectionfg: p.selectionForeground,
    inverse: p.brightWhite,
    inversefg: p.black,
    cursor: p.cursorColor,
    cursorfg: p.cursorText,

    // ── Standalone ───────────────────────────────────────────────
    border: p.brightBlack,
    inputborder: p.brightBlack,
    focusborder: dark ? p.brightBlue : p.blue,
    link: dark ? p.brightBlue : p.blue,
    disabledfg: p.brightBlack,

    // ── 16 palette passthrough ───────────────────────────────────
    palette: [
      p.black,
      p.red,
      p.green,
      p.yellow,
      p.blue,
      p.magenta,
      p.cyan,
      p.white,
      p.brightBlack,
      p.brightRed,
      p.brightGreen,
      p.brightYellow,
      p.brightBlue,
      p.brightMagenta,
      p.brightCyan,
      p.brightWhite,
    ],
  };
}
