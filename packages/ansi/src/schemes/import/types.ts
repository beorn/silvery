/**
 * Base16 scheme type — the 16-color format used by hundreds of community themes.
 *
 * @see https://github.com/chriskempson/base16
 */

/** A parsed Base16 color scheme. All hex values are WITHOUT `#` prefix. */
export interface Base16Scheme {
  scheme: string
  author: string
  base00: string
  base01: string
  base02: string
  base03: string
  base04: string
  base05: string
  base06: string
  base07: string
  base08: string
  base09: string
  base0A: string
  base0B: string
  base0C: string
  base0D: string
  base0E: string
  base0F: string
}

/** All Base16 color keys in order. */
export const BASE16_KEYS = [
  "base00",
  "base01",
  "base02",
  "base03",
  "base04",
  "base05",
  "base06",
  "base07",
  "base08",
  "base09",
  "base0A",
  "base0B",
  "base0C",
  "base0D",
  "base0E",
  "base0F",
] as const
