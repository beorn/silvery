/**
 * Tier simulation — produce a Theme that visually represents each capability
 * tier without needing to remount the terminal.
 *
 * Silvery's output phase quantizes truecolor to 256/ansi16 at paint time based
 * on `term.caps.colorLevel`. That path requires rebuilding the terminal. For
 * an interactive storybook we instead pre-quantize each token's hex and feed
 * the quantized hex back through Text's color resolver — the user sees the
 * same pixels they'd get at that tier, and the tier toggle is zero-latency.
 */

import { hexToRgb } from "@silvery/color"
import type { ColorScheme } from "@silvery/theme"
import { deriveMonochromeTheme, rgbToAnsi256, nearestAnsi16, deriveTheme, type Theme } from "@silvery/ansi"
import type { MonochromeAttrs } from "@silvery/ansi"
import type { Tier } from "./types"

// -----------------------------------------------------------------------------
// 256-color cube: convert a 256-index back to its canonical RGB.
// -----------------------------------------------------------------------------

/** The 6-step cube values used by xterm-256 (0, 95, 135, 175, 215, 255). */
const CUBE_STEPS = [0, 95, 135, 175, 215, 255]

function ansi256ToHex(idx: number): string {
  if (idx < 16) {
    // Standard ANSI 16 — use the same values nearestAnsi16 uses as its palette.
    const base = ANSI16_HEX[idx] ?? "#000000"
    return base
  }
  if (idx >= 232) {
    // Greyscale ramp: 232 (8,8,8) .. 255 (238,238,238) with 10-unit steps.
    const v = 8 + (idx - 232) * 10
    return rgbToHex(v, v, v)
  }
  const i = idx - 16
  const r = CUBE_STEPS[Math.floor(i / 36)]!
  const g = CUBE_STEPS[Math.floor((i % 36) / 6)]!
  const b = CUBE_STEPS[i % 6]!
  return rgbToHex(r, g, b)
}

/** Canonical ANSI 16 display palette (mirrors packages/ansi/src/color-maps.ts). */
const ANSI16_HEX: Record<number, string> = {
  0: "#000000",
  1: "#aa0000",
  2: "#00aa00",
  3: "#aa5500",
  4: "#0000aa",
  5: "#aa00aa",
  6: "#00aaaa",
  7: "#aaaaaa",
  8: "#555555",
  9: "#ff5555",
  10: "#55ff55",
  11: "#ffff55",
  12: "#5555ff",
  13: "#ff55ff",
  14: "#55ffff",
  15: "#ffffff",
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
      .toLowerCase()
  )
}

export function quantize256(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const idx = rgbToAnsi256(rgb[0], rgb[1], rgb[2])
  return ansi256ToHex(idx)
}

export function quantizeAnsi16Hex(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const idx = nearestAnsi16(rgb[0], rgb[1], rgb[2])
  return ANSI16_HEX[idx] ?? hex
}

// -----------------------------------------------------------------------------
// Tier themes
// -----------------------------------------------------------------------------

function remap(theme: Theme, fn: (hex: string) => string): Theme {
  const out: Record<string, unknown> = { ...theme }
  for (const [k, v] of Object.entries(theme)) {
    if (k === "name" || k === "palette") continue
    if (typeof v === "string") out[k] = fn(v)
  }
  if (Array.isArray(theme.palette)) {
    out.palette = theme.palette.map(fn)
  }
  return out as unknown as Theme
}

export interface TierView {
  /** Theme to feed ThemeProvider (already quantized when appropriate). */
  theme: Theme
  /** True when tier renders without color (mono). */
  monochrome: boolean
  /** Per-token SGR attrs (mono tier only). */
  monoAttrs: MonochromeAttrs | null
  /** Human-readable description of the tier's pixel-level behavior. */
  description: string
}

export function buildTierView(palette: ColorScheme, tier: Tier): TierView {
  const truecolor = deriveTheme(palette, "truecolor")
  if (tier === "truecolor") {
    return {
      theme: truecolor,
      monochrome: false,
      monoAttrs: null,
      description: "24-bit RGB — every token is rendered at full fidelity.",
    }
  }
  if (tier === "256") {
    return {
      theme: remap(truecolor, quantize256),
      monochrome: false,
      monoAttrs: null,
      description:
        "xterm-256 6×6×6 cube + 24-step grey ramp — each token quantized to the nearest palette slot.",
    }
  }
  if (tier === "ansi16") {
    const themeAnsi16 = deriveTheme(palette, "ansi16")
    return {
      theme: remap(themeAnsi16, quantizeAnsi16Hex),
      monochrome: false,
      monoAttrs: null,
      description: "ANSI 16 — tokens snap to the 16 terminal-controlled slots.",
    }
  }
  // mono
  const attrs = deriveMonochromeTheme(truecolor)
  return {
    theme: truecolor, // unused (app omits ThemeProvider in mono tier)
    monochrome: true,
    monoAttrs: attrs,
    description:
      "No color — hierarchy carried by SGR attrs (bold, dim, inverse, italic, underline).",
  }
}
