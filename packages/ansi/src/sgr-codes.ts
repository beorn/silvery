/**
 * SGR (Select Graphic Rendition) color code helpers.
 *
 * Shared by buffer.ts (styleToAnsiCodes) and output-phase.ts (styleTransition).
 * Emits the shortest possible SGR code string for a given color.
 */

/**
 * Emit the shortest SGR code string for a foreground color.
 * - Basic 0-7: 4-bit code (30+N)
 * - Extended 8-255: 256-color (38;5;N)
 * - RGB: true color (38;2;R;G;B)
 */
export function fgColorCode(color: number | { r: number; g: number; b: number }): string {
  if (typeof color === "number") {
    if (color >= 0 && color <= 7) return `${30 + color}`
    return `38;5;${color}`
  }
  return `38;2;${color.r};${color.g};${color.b}`
}

/**
 * Emit the shortest SGR code string for a background color.
 * - Basic 0-7: 4-bit code (40+N)
 * - Extended 8-255: 256-color (48;5;N)
 * - RGB: true color (48;2;R;G;B)
 */
export function bgColorCode(color: number | { r: number; g: number; b: number }): string {
  if (typeof color === "number") {
    if (color >= 0 && color <= 7) return `${40 + color}`
    return `48;5;${color}`
  }
  return `48;2;${color.r};${color.g};${color.b}`
}
