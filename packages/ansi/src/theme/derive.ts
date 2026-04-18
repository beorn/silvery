/**
 * Theme derivation — transforms a ColorScheme into a Theme.
 */

import { blend, contrastFg, complement } from "@silvery/color"
import { checkContrast, ensureContrast } from "@silvery/color"
import type { ColorScheme, Theme } from "./types.ts"

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
  const mutedbg = blend(bg, p.foreground, 0.04)
  const muted = ensure("muted", blend(fg, bg, 0.4), mutedbg, AA)
  const disabledfg = ensure("disabledfg", blend(fg, bg, 0.5), bg, DIM)
  const border = ensure("border", blend(bg, p.foreground, 0.15), bg, FAINT)
  const inputborder = ensure("inputborder", blend(bg, p.foreground, 0.25), bg, CONTROL)
  const selection = ensure("selection", p.selectionForeground, p.selectionBackground, AA)
  const cursor = ensure("cursor", p.cursorText, p.cursorColor, AA)

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
    cursorbg: p.cursorColor,
    selection,
    selectionbg: p.selectionBackground,
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
  }
}
