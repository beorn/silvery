/**
 * Import Base16 YAML/JSON schemes into ColorPalette format.
 *
 * Base16 defines 16 colors (base00–base0F). We map them to ColorPalette's
 * 22 colors, deriving bright variants and special colors.
 *
 * @see https://github.com/chriskempson/base16
 */

import { darken, brighten, hexToRgb } from "../color"
import type { ColorPalette } from "../types"
import type { Base16Scheme } from "./types"
import { BASE16_KEYS } from "./types"

// ============================================================================
// YAML Parser (minimal — Base16 YAML is just `key: "value"` lines)
// ============================================================================

/**
 * Parse Base16 YAML into a Base16Scheme object.
 * Handles both quoted and unquoted values, comments, and blank lines.
 */
function parseBase16Yaml(yaml: string): Base16Scheme {
  const result: Record<string, string> = {}

  for (const raw of yaml.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue

    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()

    // Strip surrounding quotes (single or double)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    // Strip inline comments (only after unquoted values)
    const commentIdx = value.indexOf("#")
    if (commentIdx > 0) {
      value = value.slice(0, commentIdx).trim()
    }

    result[key] = value
  }

  // Validate required fields
  if (!result.scheme) {
    throw new Error("Base16 YAML missing required field: scheme")
  }

  for (const key of BASE16_KEYS) {
    if (!result[key]) {
      throw new Error(`Base16 YAML missing required color: ${key}`)
    }
    // Validate hex format (6 hex chars, no # prefix)
    if (!/^[0-9a-fA-F]{6}$/.test(result[key]!)) {
      throw new Error(`Base16 color ${key} must be a 6-digit hex string without '#', got: "${result[key]}"`)
    }
  }

  return result as unknown as Base16Scheme
}

// ============================================================================
// Luminance Detection
// ============================================================================

/** Compute relative luminance (WCAG 2.0) from a hex color with `#` prefix. */
function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

// ============================================================================
// Import
// ============================================================================

/** Normalize a bare hex string to `#RRGGBB` (uppercase). */
function hex(bare: string): string {
  return `#${bare.toUpperCase()}`
}

/**
 * Import a Base16 YAML (or JSON) scheme into a ColorPalette.
 *
 * Mapping:
 *   base00 → background, base01 → brightBlack, base02 → selectionBackground,
 *   base03 → white (muted fg), base05 → foreground/brightWhite,
 *   base08 → red, base09 → brightRed, base0A → yellow,
 *   base0B → green, base0C → cyan, base0D → blue, base0E → magenta,
 *   base0F → brightMagenta.
 *
 * Bright color variants are derived by brightening normals.
 * `dark` is inferred from base00 luminance.
 */
export function importBase16(yamlOrJson: string): ColorPalette {
  const scheme = parseBase16Yaml(yamlOrJson)
  return base16ToColorPalette(scheme)
}

/** Convert a parsed Base16Scheme to ColorPalette. */
export function base16ToColorPalette(scheme: Base16Scheme): ColorPalette {
  const bg = hex(scheme.base00)
  const fg = hex(scheme.base05)
  const isDark = luminance(bg) < 0.179

  const black = isDark ? darken(bg, 0.15) : brighten(bg, 0.15)
  const red = hex(scheme.base08)
  const green = hex(scheme.base0B)
  const yellow = hex(scheme.base0A)
  const blue = hex(scheme.base0D)
  const magenta = hex(scheme.base0E)
  const cyan = hex(scheme.base0C)

  return {
    name: scheme.scheme,
    dark: isDark,
    black,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white: hex(scheme.base03),
    brightBlack: hex(scheme.base01),
    brightRed: hex(scheme.base09),
    brightGreen: brighten(green, 0.15),
    brightYellow: brighten(yellow, 0.15),
    brightBlue: brighten(blue, 0.15),
    brightMagenta: hex(scheme.base0F),
    brightCyan: brighten(cyan, 0.15),
    brightWhite: fg,
    foreground: fg,
    background: bg,
    cursorColor: fg,
    cursorText: bg,
    selectionBackground: hex(scheme.base02),
    selectionForeground: fg,
  }
}
