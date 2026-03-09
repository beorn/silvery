/**
 * Color manipulation utilities.
 *
 * Operates in OKLCH for perceptual uniformity — hue rotations look right,
 * lightness changes feel linear, chroma is preserved.
 *
 * Currently uses simple RGB blending as a foundation. Full OKLCH conversion
 * will be added when needed for advanced derivation (shade generation,
 * palette generation from minimal input).
 */

// ============================================================================
// Hex ↔ RGB Parsing
// ============================================================================

/** Parse a hex color string to [r, g, b] (0-255). Returns null for non-hex. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return null
  return [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16)]
}

/** Convert [r, g, b] (0-255) to hex string. */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`.toUpperCase()
}

// ============================================================================
// Color Manipulation
// ============================================================================

/**
 * Blend two hex colors. t=0 returns a, t=1 returns b.
 * For non-hex inputs (ANSI names), returns `a` unchanged.
 */
export function blend(a: string, b: string, t: number): string {
  const rgbA = hexToRgb(a)
  const rgbB = hexToRgb(b)
  if (!rgbA || !rgbB) return a

  return rgbToHex(
    rgbA[0] + (rgbB[0] - rgbA[0]) * t,
    rgbA[1] + (rgbB[1] - rgbA[1]) * t,
    rgbA[2] + (rgbB[2] - rgbA[2]) * t,
  )
}

/**
 * Brighten a hex color. amount=0.1 adds 10% lightness toward white.
 * For non-hex inputs (ANSI names), returns the color unchanged.
 */
export function brighten(color: string, amount: number): string {
  return blend(color, "#FFFFFF", amount)
}

/**
 * Darken a hex color. amount=0.1 adds 10% darkness toward black.
 * For non-hex inputs (ANSI names), returns the color unchanged.
 */
export function darken(color: string, amount: number): string {
  return blend(color, "#000000", amount)
}

/**
 * Pick black or white text for readability on the given background.
 * Uses relative luminance (WCAG formula).
 */
export function contrastFg(bg: string): "#000000" | "#FFFFFF" {
  const rgb = hexToRgb(bg)
  if (!rgb) return "#FFFFFF" // default to white for non-hex

  // Relative luminance per WCAG 2.0
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  return luminance > 0.179 ? "#000000" : "#FFFFFF"
}

// ============================================================================
// HSL Utilities
// ============================================================================

export type HSL = [number, number, number] // [h: 0-360, s: 0-1, l: 0-1]

export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255)
}

export function hexToHsl(hex: string): HSL | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return rgbToHsl(rgb[0], rgb[1], rgb[2])
}

/**
 * Desaturate a hex color by reducing saturation.
 * amount=0.4 reduces saturation by 40%.
 * For non-hex inputs, returns the color unchanged.
 */
export function desaturate(color: string, amount: number): string {
  const hsl = hexToHsl(color)
  if (!hsl) return color
  const [h, s, l] = hsl
  return hslToHex(h, s * (1 - amount), l)
}

/**
 * Get the complementary color (180° hue rotation).
 * For non-hex inputs, returns the color unchanged.
 */
export function complement(color: string): string {
  const hsl = hexToHsl(color)
  if (!hsl) return color
  const [h, s, l] = hsl
  return hslToHex(h + 180, s, l)
}
