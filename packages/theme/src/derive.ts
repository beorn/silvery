/**
 * Theme derivation — transforms a ColorPalette into a Theme.
 *
 * All inputs ultimately flow through deriveTheme():
 *   ColorPalette (22) → deriveTheme() → Theme (33)
 *
 * Supports two modes:
 *   - truecolor (default): rich derivation with blends, contrast pairing
 *   - ansi16: direct aliases into the 22 palette colors (no blending)
 *
 * ## Contrast-aware derivation
 *
 * Fixed blend factors (e.g. "40% toward background") produce wildly different
 * contrast ratios across themes because palettes have different fg/bg luminance
 * ranges. A 40% blend that gives 5:1 on Nord gives 2.2:1 on Tokyo Night Day.
 *
 * Instead of fixed blend factors, derived tokens use contrast targets:
 *
 * | Token             | Target | Rationale                           |
 * |-------------------|--------|-------------------------------------|
 * | fg / surfaces     | 4.5:1  | Body text on all surface backgrounds|
 * | muted / bg        | 4.5:1  | Secondary text, WCAG AA             |
 * | disabled-fg / bg  | 3.0:1  | Intentionally dim but visible       |
 * | border / bg       | 1.5:1  | Faint structural divider            |
 * | inputborder / bg  | 3.0:1  | WCAG 1.4.11 non-text minimum        |
 * | accent as text    | 4.5:1  | Colored text on root background     |
 * | selection pair    | 4.5:1  | Selected text readable              |
 * | cursor pair       | 4.5:1  | Text under cursor readable          |
 *
 * The blend-first-then-ensure pattern preserves the palette's aesthetic:
 * the initial blend sets the color's character, ensureContrast only
 * adjusts lightness (preserving hue/saturation) if the ratio falls short.
 */

import { blend, contrastFg, desaturate, complement } from "./color"
import { checkContrast, ensureContrast } from "./contrast"
import type { ColorPalette, Theme } from "./types"

/** A single contrast adjustment made during theme derivation. */
export interface ThemeAdjustment {
  /** Token name (e.g. "primary", "muted", "fg") */
  token: string
  /** Original color before adjustment */
  from: string
  /** Adjusted color */
  to: string
  /** Background color used for contrast check */
  against: string
  /** Target contrast ratio */
  target: number
  /** Contrast ratio before and after adjustment */
  ratioBefore: number
  ratioAfter: number
}

/**
 * Derive a complete Theme from a ColorPalette.
 *
 * The palette provides 22 terminal colors. This function maps them to
 * 33 semantic tokens + a 16-color content palette.
 *
 * @param palette - The 22-color terminal palette
 * @param mode - "truecolor" (default) for rich derivation, "ansi16" for direct aliases
 * @param adjustments - Optional array to collect contrast adjustments made during derivation
 */
export function deriveTheme(
  palette: ColorPalette,
  mode: "ansi16" | "truecolor" = "truecolor",
  adjustments?: ThemeAdjustment[],
): Theme {
  if (mode === "ansi16") return deriveAnsi16Theme(palette)
  return deriveTruecolorTheme(palette, adjustments)
}

// ── Contrast targets ────────────────────────────────────────────────
// These are minimums — most themes exceed them without adjustment.
// ensureContrast() is a no-op when the target is already met.

/** WCAG AA for normal text — secondary/muted text, accent-as-text */
const AA = 4.5
/** Reduced contrast for intentionally dim UI — disabled text */
const DIM = 3.0
/** Faint structural element — borders, dividers */
const FAINT = 1.5
/** WCAG 1.4.11 non-text minimum — interactive control boundaries */
const CONTROL = 3.0

function deriveTruecolorTheme(p: ColorPalette, adjustments?: ThemeAdjustment[]): Theme {
  const dark = p.dark ?? true
  const bg = p.background

  /** ensureContrast with optional adjustment tracking */
  function ensure(token: string, color: string, against: string, target: number): string {
    const result = ensureContrast(color, against, target)
    if (adjustments && result !== color) {
      const before = checkContrast(color, against)
      const after = checkContrast(result, against)
      adjustments.push({
        token,
        from: color,
        to: result,
        against,
        target,
        ratioBefore: before?.ratio ?? 0,
        ratioAfter: after?.ratio ?? 0,
      })
    }
    return result
  }

  // ── Body text — ensure readability on all surfaces ──────────────
  // Surface backgrounds blend bg toward fg by 4-8%. popoverbg (8%) is the
  // hardest case — if fg meets AA there, it meets AA on all surfaces.
  const surfacebg = blend(bg, p.foreground, 0.05)
  const popoverbg = blend(bg, p.foreground, 0.08)
  const fg = ensure("fg", p.foreground, popoverbg, AA)

  // ── Accent colors — ensure readability as text on root bg ────────
  // Use explicit primary seed if provided, else infer from ANSI slots.
  const primary = ensure("primary", p.primary ?? (dark ? p.yellow : p.blue), bg, AA)
  const accent = ensure("accent", complement(primary), bg, AA)
  const secondary = ensure("secondary", blend(primary, accent, 0.35), bg, AA)
  const error = ensure("error", p.red, bg, AA)
  const warning = ensure("warning", p.yellow, bg, AA)
  const success = ensure("success", p.green, bg, AA)
  const info = ensure("info", blend(fg, accent, 0.5), bg, AA)
  const link = ensure("link", dark ? p.brightBlue : p.blue, bg, AA)

  // ── Blended tokens — blend first, then ensure contrast ───────────
  // Muted targets mutedbg (the harder case) so it passes on both bg and mutedbg.
  const mutedbg = blend(bg, p.foreground, 0.04)
  const muted = ensure("muted", blend(fg, bg, 0.4), mutedbg, AA)
  const disabledfg = ensure("disabledfg", blend(fg, bg, 0.5), bg, DIM)
  const border = ensure("border", blend(bg, p.foreground, 0.15), bg, FAINT)
  const inputborder = ensure("inputborder", blend(bg, p.foreground, 0.25), bg, CONTROL)

  // ── Selection & cursor — ensure pairs are readable ─────────────
  const selection = ensure("selection", p.selectionForeground, p.selectionBackground, AA)
  const cursor = ensure("cursor", p.cursorText, p.cursorColor, AA)

  return {
    name: p.name ?? (dark ? "derived-dark" : "derived-light"),

    // ── Root pair ─────────────────────────────────────────────────
    bg,
    fg,

    // ── Surface pairs (base = text, *bg = background) ──────────
    muted,
    mutedbg,
    surface: fg,
    surfacebg,
    popover: fg,
    popoverbg,
    inverse: contrastFg(blend(fg, bg, 0.1)),
    inversebg: blend(fg, bg, 0.1),
    cursor,
    cursorbg: p.cursorColor,
    selection,
    selectionbg: p.selectionBackground,

    // ── Accent pairs (base = area bg, *fg = text on area) ──────
    primary,
    primaryfg: contrastFg(primary),
    secondary,
    secondaryfg: contrastFg(secondary),
    accent,
    accentfg: contrastFg(accent),
    error,
    errorfg: contrastFg(error),
    warning,
    warningfg: contrastFg(warning),
    success,
    successfg: contrastFg(success),
    info,
    infofg: contrastFg(info),

    // ── Standalone ───────────────────────────────────────────────
    border,
    inputborder,
    focusborder: link,
    link,
    disabledfg,

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
  }
}

function deriveAnsi16Theme(p: ColorPalette): Theme {
  const dark = p.dark ?? true
  const primaryColor = dark ? p.yellow : p.blue

  return {
    name: p.name ?? (dark ? "derived-ansi16-dark" : "derived-ansi16-light"),

    // ── Root pair ─────────────────────────────────────────────────
    bg: p.background,
    fg: p.foreground,

    // ── Surface pairs (base = text, *bg = background) ──────────
    muted: p.white,
    mutedbg: p.black,
    surface: p.foreground,
    surfacebg: p.black,
    popover: p.foreground,
    popoverbg: p.black,
    inverse: p.black,
    inversebg: p.brightWhite,
    cursor: p.cursorText,
    cursorbg: p.cursorColor,
    selection: p.selectionForeground,
    selectionbg: p.selectionBackground,

    // ── Accent pairs (base = area bg, *fg = text on area) ──────
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
  }
}
