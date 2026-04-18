/**
 * Theme derivation — transforms a ColorScheme into a Theme.
 */

import { blend, contrastFg, complement, hexToOklch, oklchToHex, colorDistance, brighten, darken } from "@silvery/color"
import { checkContrast, ensureContrast } from "@silvery/color"
import type { ColorScheme, Theme } from "./types.ts"
import {
  validateThemeInvariants,
  ThemeInvariantError,
  SELECTION_DELTA_L,
  CURSOR_DELTA_E,
  type InvariantViolation,
} from "./invariants.ts"

export interface ThemeAdjustment {
  token: string
  from: string
  to: string
  against: string
  target: number
  ratioBefore: number
  ratioAfter: number
}

export function deriveTheme(
  palette: ColorScheme,
  mode: "ansi16" | "truecolor" = "truecolor",
  adjustments?: ThemeAdjustment[],
): Theme {
  if (mode === "ansi16") return deriveAnsi16Theme(palette)
  return deriveTruecolorTheme(palette, adjustments)
}

export interface LoadThemeOptions {
  /** Output mode. Default: "truecolor". */
  mode?: "ansi16" | "truecolor"
  /**
   * Invariant enforcement:
   *   - `"strict"` — throw `ThemeInvariantError` when invariants fail.
   *   - `"lenient"` (default) — accept auto-adjustments, populate `violations` out-param.
   *   - `"off"` — skip invariant validation entirely.
   *
   * Note: `deriveTheme()` already runs `ensureContrast` on every text/bg pair
   * it builds (thresholds: AA=4.5, DIM=3.0, FAINT=1.5, CONTROL=3.0 — tuned for
   * terminals, not blind WCAG imports). Invariant validation is a second pass
   * that catches things derive can't fix. Default: visibility only.
   */
  enforce?: "strict" | "lenient" | "off"
  /**
   * Run WCAG contrast validation in addition to visibility. Default: false.
   * `deriveTheme` already applies the project-tweaked thresholds via
   * `ensureContrast`; only enable `wcag: true` for build-time audits of
   * bundled themes or to validate hand-authored Theme objects.
   */
  wcag?: boolean
  /** Out-parameter: adjustments applied by `deriveTheme`'s ensureContrast calls. */
  adjustments?: ThemeAdjustment[]
  /** Out-parameter: invariant violations (only populated in "lenient" mode; "strict" throws). */
  violations?: InvariantViolation[]
}

/**
 * Load and validate a theme from a ColorScheme.
 *
 * Combines `deriveTheme()` (auto-adjust via ensureContrast with project-tuned
 * thresholds) with `validateThemeInvariants()` (post-derivation visibility +
 * optional WCAG).
 *
 * We don't re-impose WCAG on top of derive's tweaked thresholds — default
 * validation checks visibility invariants only (selection/cursor vs bg) that
 * derive doesn't handle.
 *
 * @example
 * ```ts
 * // Default: lenient + visibility-only (derive already handled contrast)
 * const theme = loadTheme(myScheme)
 *
 * // Build-time audit: strict + full WCAG
 * const theme = loadTheme(myScheme, { enforce: "strict", wcag: true })
 * ```
 */
export function loadTheme(palette: ColorScheme, opts: LoadThemeOptions = {}): Theme {
  const mode = opts.mode ?? "truecolor"
  const enforce = opts.enforce ?? "lenient"
  const theme = deriveTheme(palette, mode, opts.adjustments)
  if (enforce === "off") return theme

  const { ok, violations } = validateThemeInvariants(theme, { wcag: opts.wcag })
  if (!ok) {
    if (enforce === "strict") throw new ThemeInvariantError(violations)
    if (opts.violations) opts.violations.push(...violations)
  }
  return theme
}

const AA = 4.5
const DIM = 3.0
const FAINT = 1.5
const CONTROL = 3.0

function deriveTruecolorTheme(p: ColorScheme, adjustments?: ThemeAdjustment[]): Theme {
  const dark = p.dark ?? true
  const bg = p.background

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

  const surfacebg = blend(bg, p.foreground, 0.05)
  const popoverbg = blend(bg, p.foreground, 0.08)
  const fg = ensure("fg", p.foreground, popoverbg, AA)
  const primary = ensure("primary", p.primary ?? (dark ? p.yellow : p.blue), bg, AA)
  const accent = ensure("accent", complement(primary), bg, AA)
  const secondary = ensure("secondary", blend(primary, accent, 0.35), bg, AA)
  const error = ensure("error", p.red, bg, AA)
  const warning = ensure("warning", p.yellow, bg, AA)
  const success = ensure("success", p.green, bg, AA)
  const info = ensure("info", blend(fg, accent, 0.5), bg, AA)
  const link = ensure("link", dark ? p.brightBlue : p.blue, bg, AA)

  // Brand anchor (Apple system-color model) — app identity.
  // $brand anchors to primary; hover/active shift OKLCH L ±0.04 / ±0.08.
  const brand = primary
  const brandHover = dark ? brighten(primary, 0.04) : darken(primary, 0.04)
  const brandActive = dark ? brighten(primary, 0.08) : darken(primary, 0.08)

  // Categorical color ring — 8 harmonious hues for tagging / chart series /
  // categories. ensureContrast-adjusted against bg.
  const red = ensure("red", p.red, bg, AA)
  const orange = ensure("orange", blend(p.red, p.yellow, 0.5), bg, AA)
  const yellow = ensure("yellow", p.yellow, bg, AA)
  const green = ensure("green", p.green, bg, AA)
  const teal = ensure("teal", blend(p.green, p.cyan, 0.5), bg, AA)
  const blue = ensure("blue", dark ? p.brightBlue : p.blue, bg, AA)
  const purple = ensure("purple", p.magenta, bg, AA)
  const pink = ensure("pink", blend(p.magenta, p.red, 0.5), bg, AA)
  const mutedbg = blend(bg, p.foreground, 0.04)
  const muted = ensure("muted", blend(fg, bg, 0.4), mutedbg, AA)
  const disabledfg = ensure("disabledfg", blend(fg, bg, 0.5), bg, DIM)
  const border = ensure("border", blend(bg, p.foreground, 0.15), bg, FAINT)
  const inputborder = ensure("inputborder", blend(bg, p.foreground, 0.25), bg, CONTROL)
  // Repair selection visibility — nudge selectionbg L away from bg until ΔL ≥ threshold.
  // Preserves hue + chroma. For ultra-subtle themes (one-light, serendipity-morning, etc.)
  // this shifts the selection ~0.05 L while keeping the aesthetic.
  const selectionBg = repairSelectionBg(p.selectionBackground, bg)
  const selection = ensure("selection", p.selectionForeground, selectionBg, AA)
  // Repair cursor visibility — nudge cursorbg ΔE away from bg (OKLCH).
  const cursorBgRepaired = repairCursorBg(p.cursorColor, bg)
  const cursor = ensure("cursor", p.cursorText, cursorBgRepaired, AA)

  return {
    name: p.name ?? (dark ? "derived-dark" : "derived-light"),
    bg,
    fg,
    muted,
    mutedbg,
    surface: fg,
    surfacebg,
    popover: fg,
    popoverbg,
    inverse: contrastFg(blend(fg, bg, 0.1)),
    inversebg: blend(fg, bg, 0.1),
    cursor,
    cursorbg: cursorBgRepaired,
    selection,
    selectionbg: selectionBg,
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
    border,
    inputborder,
    focusborder: link,
    link,
    disabledfg,
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
    brand,
    brandHover,
    brandActive,
    // Categorical ring — primary names
    red,
    orange,
    yellow,
    green,
    teal,
    blue,
    purple,
    pink,
    // Deprecated brand-<hue> aliases (same values; for backward compat one release)
    brandRed: red,
    brandOrange: orange,
    brandYellow: yellow,
    brandGreen: green,
    brandTeal: teal,
    brandBlue: blue,
    brandPurple: purple,
    brandPink: pink,
  }
}

function deriveAnsi16Theme(p: ColorScheme): Theme {
  const dark = p.dark ?? true
  const primaryColor = dark ? p.yellow : p.blue
  return {
    name: p.name ?? (dark ? "derived-ansi16-dark" : "derived-ansi16-light"),
    bg: p.background,
    fg: p.foreground,
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
    border: p.brightBlack,
    inputborder: p.brightBlack,
    focusborder: dark ? p.brightBlue : p.blue,
    link: dark ? p.brightBlue : p.blue,
    disabledfg: p.brightBlack,
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
    // Brand tokens at ANSI 16 — map to named slots (no blending possible).
    brand: primaryColor,
    brandHover: primaryColor,
    brandActive: primaryColor,
    // Categorical ring (canonical names)
    red: dark ? p.brightRed : p.red,
    orange: dark ? p.brightRed : p.red, // no orange slot in ANSI 16
    yellow: p.yellow,
    green: dark ? p.brightGreen : p.green,
    teal: p.cyan,
    blue: dark ? p.brightBlue : p.blue,
    purple: p.magenta,
    pink: dark ? p.brightMagenta : p.magenta,
    // Deprecated brand-<hue> aliases (same values)
    brandRed: dark ? p.brightRed : p.red,
    brandOrange: dark ? p.brightRed : p.red,
    brandYellow: p.yellow,
    brandGreen: dark ? p.brightGreen : p.green,
    brandTeal: p.cyan,
    brandBlue: dark ? p.brightBlue : p.blue,
    brandPurple: p.magenta,
    brandPink: dark ? p.brightMagenta : p.magenta,
  }
}

/**
 * Nudge `selectionBg`'s OKLCH lightness until it differs from `bg` by at least
 * `SELECTION_DELTA_L`. Preserves hue + chroma. Non-hex input returns unchanged.
 *
 * Direction: shift away from bg — if bg is dark, lift L; if bg is light, drop L.
 * If the input already meets the threshold, it's returned unchanged.
 */
function repairSelectionBg(selectionBg: string, bg: string): string {
  const oSel = hexToOklch(selectionBg)
  const oBg = hexToOklch(bg)
  if (!oSel || !oBg) return selectionBg
  const dL = Math.abs(oSel.L - oBg.L)
  if (dL >= SELECTION_DELTA_L) return selectionBg

  const needed = SELECTION_DELTA_L - dL + 0.005 // small overshoot to land above floor after gamut-map
  const direction = oSel.L >= oBg.L ? 1 : -1
  const newL = Math.max(0, Math.min(1, oSel.L + direction * needed))
  return oklchToHex({ L: newL, C: oSel.C, H: oSel.H })
}

/**
 * Nudge `cursorBg`'s OKLCH values until it differs from `bg` by at least
 * `CURSOR_DELTA_E`. Shifts lightness first (preserves hue/chroma aesthetics).
 * Non-hex input returns unchanged.
 */
function repairCursorBg(cursorBg: string, bg: string): string {
  const d = colorDistance(cursorBg, bg)
  if (d === null || d >= CURSOR_DELTA_E) return cursorBg

  const oCur = hexToOklch(cursorBg)!
  const oBg = hexToOklch(bg)!
  // Shift L in the direction that increases distance.
  const lGap = SELECTION_DELTA_L + 0.02
  const direction = oCur.L >= oBg.L ? 1 : -1
  const newL = Math.max(0, Math.min(1, oCur.L + direction * lGap))
  const candidate = oklchToHex({ L: newL, C: oCur.C, H: oCur.H })
  const d2 = colorDistance(candidate, bg)
  if (d2 !== null && d2 >= CURSOR_DELTA_E) return candidate

  // Fallback: high-contrast neutral pick.
  return oBg.L > 0.5 ? "#000000" : "#FFFFFF"
}
