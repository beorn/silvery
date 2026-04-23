/**
 * ANSI color maps and RGB-to-ANSI quantization.
 *
 * Provides named color maps (MODIFIERS, FG_COLORS, BG_COLORS) and
 * functions to generate SGR codes from RGB values at any color level.
 *
 * @see https://en.wikipedia.org/wiki/ANSI_escape_code#Colors
 */

import type { ColorLevel } from "./types"

// Re-export so existing callers that do `import { ColorLevel } from "./color-maps"`
// keep compiling after the canonical definition moved to `./types`.
export type { ColorLevel }

// =============================================================================
// SGR Code Constants
// =============================================================================

/** Modifier SGR codes: open -> close */
export const MODIFIERS: Record<string, [number, number]> = {
  reset: [0, 0],
  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  inverse: [7, 27],
  hidden: [8, 28],
  strikethrough: [9, 29],
  overline: [53, 55],
}

/** Foreground color name -> ANSI SGR code */
export const FG_COLORS: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  blackBright: 90,
  gray: 90,
  grey: 90,
  redBright: 91,
  greenBright: 92,
  yellowBright: 93,
  blueBright: 94,
  magentaBright: 95,
  cyanBright: 96,
  whiteBright: 97,
}

/** Background color name -> ANSI SGR code */
export const BG_COLORS: Record<string, number> = {
  bgBlack: 40,
  bgRed: 41,
  bgGreen: 42,
  bgYellow: 43,
  bgBlue: 44,
  bgMagenta: 45,
  bgCyan: 46,
  bgWhite: 47,
  bgBlackBright: 100,
  bgGray: 100,
  bgGrey: 100,
  bgRedBright: 101,
  bgGreenBright: 102,
  bgYellowBright: 103,
  bgBlueBright: 104,
  bgMagentaBright: 105,
  bgCyanBright: 106,
  bgWhiteBright: 107,
}

// =============================================================================
// Color Quantization (truecolor -> 256 -> 16)
// =============================================================================

/** Standard ANSI 16 color RGB values for nearest-color matching.
 * Uses xterm-256 standard values for consistent mapping (matches chalk/ansi-styles). */
export const ANSI_16_COLORS: Array<[number, number, number]> = [
  [0, 0, 0], // 0: black
  [128, 0, 0], // 1: red
  [0, 128, 0], // 2: green
  [128, 128, 0], // 3: yellow/brown
  [0, 0, 128], // 4: blue
  [128, 0, 128], // 5: magenta
  [0, 128, 128], // 6: cyan
  [192, 192, 192], // 7: white
  [128, 128, 128], // 8: bright black (gray)
  [255, 0, 0], // 9: bright red
  [0, 255, 0], // 10: bright green
  [255, 255, 0], // 11: bright yellow
  [0, 0, 255], // 12: bright blue
  [255, 0, 255], // 13: bright magenta
  [0, 255, 255], // 14: bright cyan
  [255, 255, 255], // 15: bright white
]

/**
 * Canonical hex values for the 16 standard ANSI color slots.
 *
 * These are the xterm-256 reference values — the same RGB values used by
 * `nearestAnsi16` for quantization. Used to convert ANSI16 slot-name themes
 * (e.g., "yellow") into hex-valued themes (e.g., "#808000") so Theme objects
 * are pure hex across all tiers.
 *
 * Terminal-rendering behavior is unchanged: the output phase reads `colorLevel`
 * and emits 4-bit ANSI codes when `colorLevel === "basic"` — the hex value is
 * only carried in the Theme object itself, not emitted verbatim.
 */
export const ANSI16_SLOT_HEX: Record<string, string> = {
  black: "#000000",
  red: "#800000",
  green: "#008000",
  yellow: "#808000",
  blue: "#000080",
  magenta: "#800080",
  cyan: "#008080",
  white: "#c0c0c0",
  blackBright: "#808080",
  gray: "#808080",
  grey: "#808080",
  redBright: "#ff0000",
  greenBright: "#00ff00",
  yellowBright: "#ffff00",
  blueBright: "#0000ff",
  magentaBright: "#ff00ff",
  cyanBright: "#00ffff",
  whiteBright: "#ffffff",
}

/** Find nearest ANSI 16 color index for an RGB value. */
export function nearestAnsi16(r: number, g: number, b: number): number {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < 16; i++) {
    const [cr, cg, cb] = ANSI_16_COLORS[i]!
    const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }
  return bestIdx
}

/** Convert RGB to 256-color index (using the 6x6x6 color cube). */
export function rgbToAnsi256(r: number, g: number, b: number): number {
  // Check if it's a grayscale (r === g === b)
  if (r === g && g === b) {
    if (r < 8) return 16
    if (r > 248) return 231
    return Math.round(((r - 8) / 247) * 24) + 232
  }
  // Map to 6x6x6 cube
  const ri = Math.round((r / 255) * 5)
  const gi = Math.round((g / 255) * 5)
  const bi = Math.round((b / 255) * 5)
  return 16 + 36 * ri + 6 * gi + bi
}

/**
 * Generate SGR foreground code for an RGB color at the given color tier.
 * Returns the SGR parameter string (e.g., "31" or "38;5;196" or "38;2;255;0;0").
 *
 * Tiers `"truecolor"`, `"256"`, and `"ansi16"` emit color codes. `"mono"`
 * is handled by the caller (no SGR code is emitted for color at the mono tier)
 * — this function coerces `"mono"` to the `"ansi16"` code path rather than
 * throwing, since callers that get here with `"mono"` have already bypassed
 * the mono short-circuit.
 */
export function fgFromRgb(r: number, g: number, b: number, tier: ColorLevel): string {
  if (tier === "truecolor") return `38;2;${r};${g};${b}`
  if (tier === "256") return `38;5;${rgbToAnsi256(r, g, b)}`
  // ansi16 / mono: map to ANSI 16
  const idx = nearestAnsi16(r, g, b)
  return idx < 8 ? `${30 + idx}` : `${82 + idx}` // 90-97 for bright
}

/**
 * Generate SGR background code for an RGB color at the given color tier.
 * See {@link fgFromRgb} for tier handling.
 */
export function bgFromRgb(r: number, g: number, b: number, tier: ColorLevel): string {
  if (tier === "truecolor") return `48;2;${r};${g};${b}`
  if (tier === "256") return `48;5;${rgbToAnsi256(r, g, b)}`
  const idx = nearestAnsi16(r, g, b)
  return idx < 8 ? `${40 + idx}` : `${92 + idx}` // 100-107 for bright
}

// =============================================================================
// Hex-in / hex-out tier quantization (for previews)
// =============================================================================

/**
 * Convert a 256-palette index back to its canonical xterm hex value.
 *
 * Mirrors `rgbToAnsi256`:
 *   - 16–231: 6×6×6 color cube. Index = 16 + 36·r + 6·g + b (each channel 0..5).
 *   - 232–255: 24-step grayscale ramp.
 *   - 0–15: ANSI 16 slots (reuses ANSI16_SLOT_HEX for exact parity with
 *     `nearestAnsi16`).
 */
export function ansi256ToHex(idx: number): string {
  if (idx < 0 || idx > 255 || !Number.isInteger(idx)) return "#000000"
  if (idx < 16) {
    // ANSI16 slot — index order matches ANSI_16_COLORS above.
    const [r, g, b] = ANSI_16_COLORS[idx]!
    return rgbToHexHash(r, g, b)
  }
  if (idx < 232) {
    // 6×6×6 cube. xterm levels: 0, 95, 135, 175, 215, 255.
    const levels = [0, 95, 135, 175, 215, 255] as const
    const i = idx - 16
    const r = levels[Math.floor(i / 36)]!
    const g = levels[Math.floor((i % 36) / 6)]!
    const b = levels[i % 6]!
    return rgbToHexHash(r, g, b)
  }
  // 232..255 grayscale ramp: 8, 18, 28, ..., 238.
  const gray = 8 + (idx - 232) * 10
  return rgbToHexHash(gray, gray, gray)
}

function rgbToHexHash(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

function parseHexLocal(hex: string): [number, number, number] | null {
  if (typeof hex !== "string") return null
  let s = hex.trim()
  if (s.startsWith("#")) s = s.slice(1)
  if (s.length === 3) {
    s = s
      .split("")
      .map((c) => c + c)
      .join("")
  }
  if (s.length !== 6) return null
  const r = parseInt(s.slice(0, 2), 16)
  const g = parseInt(s.slice(2, 4), 16)
  const b = parseInt(s.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return [r, g, b]
}

// `ColorLevel` is re-exported below from `./types` for backwards compatibility
// with call sites that import it from `@silvery/ansi/color-maps`. The canonical
// definition lives in `./types` so the ansi package has a single source of
// truth for the 4-state color tier enum.

/**
 * Hex-in / hex-out quantization for previews.
 *
 * Takes any hex color and returns the hex a real terminal at that tier would
 * actually emit. Used by the Sterling storybook to make the `1/2/3/4` tier
 * toggle visibly different in-process — the output phase already does this
 * when writing to a real TTY, but preview surfaces (theme swatches, rendered
 * components inside a storybook app) bypass output-phase quantization. Apply
 * `quantizeHex` at render time to mimic tier-specific terminal output.
 *
 *   - `truecolor`: returns the input unchanged (normalized to `#rrggbb`).
 *   - `256`: snaps to the nearest xterm-256 slot, then returns that slot's hex.
 *   - `ansi16`: snaps to one of the 16 standard slots (canonical xterm RGB).
 *   - `mono`: luminance threshold (>= 0.5 → `#ffffff`, else `#000000`).
 *
 * Returns the input unchanged if it cannot be parsed as a hex color.
 */
export function quantizeHex(hex: string, tier: ColorLevel): string {
  const rgb = parseHexLocal(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb
  if (tier === "truecolor") return rgbToHexHash(r, g, b)
  if (tier === "256") return ansi256ToHex(rgbToAnsi256(r, g, b))
  if (tier === "ansi16") {
    const idx = nearestAnsi16(r, g, b)
    const [cr, cg, cb] = ANSI_16_COLORS[idx]!
    return rgbToHexHash(cr, cg, cb)
  }
  // mono: Rec. 709 luminance threshold.
  const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return y >= 0.5 ? "#ffffff" : "#000000"
}

/**
 * Hex-regex used to detect hex leaves during tier quantization walks.
 * Matches `#rgb` and `#rrggbb` (case-insensitive).
 */
const HEX_LEAF_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/

function isHexLeaf(value: unknown): value is string {
  return typeof value === "string" && HEX_LEAF_RE.test(value)
}

/**
 * Pre-quantize every hex leaf in a Theme (or any object tree) to the
 * requested color tier.
 *
 * Walks the input recursively — each string leaf matching `#rgb` / `#rrggbb`
 * is passed through {@link quantizeHex}; all other values (numbers, booleans,
 * non-hex strings like `"Nord"`, null/undefined, arrays of non-hex values)
 * pass through unchanged. Arrays and nested objects are rebuilt with
 * quantized leaves.
 *
 * Works on both the legacy ANSI Theme (flat hex tokens + `palette` array)
 * and the Sterling Theme (nested roles + flat tokens) — the structural rule
 * "any leaf that looks like a hex is a color value" holds for both.
 *
 * @example Pre-cache tier variants
 * ```ts
 * import { pickColorLevel } from "silvery"
 *
 * const themes = {
 *   truecolor: theme,
 *   ansi16: pickColorLevel(theme, "ansi16"),
 *   mono: pickColorLevel(theme, "mono"),
 * }
 * ```
 *
 * @example Storybook — show multiple tiers simultaneously
 * ```tsx
 * <ThemeProvider theme={pickColorLevel(theme, "ansi16")}>
 *   <AlertPreview />
 * </ThemeProvider>
 * ```
 *
 * Notes:
 * - `truecolor` is a no-op — returns the input unchanged (identity).
 * - The result is structurally identical to the input (same keys, same
 *   nesting); only hex leaves are remapped.
 * - Idempotent per tier: `pickColorLevel(pickColorLevel(t, "ansi16"), "ansi16")`
 *   yields the same hex values as `pickColorLevel(t, "ansi16")`.
 * - Does not freeze the returned object. Callers that want immutability
 *   should `Object.freeze()` (or deep-freeze) the result themselves.
 */
export function pickColorLevel<T>(theme: T, tier: ColorLevel): T {
  if (tier === "truecolor") return theme
  return pickColorLevelWalk(theme, tier)
}

function pickColorLevelWalk<T>(obj: T, tier: ColorLevel): T {
  if (obj == null) return obj
  if (isHexLeaf(obj)) return quantizeHex(obj, tier) as unknown as T
  if (Array.isArray(obj)) {
    return obj.map((v) => pickColorLevelWalk(v, tier)) as unknown as T
  }
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = pickColorLevelWalk(v, tier)
    }
    return out as T
  }
  return obj
}
