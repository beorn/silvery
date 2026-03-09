/**
 * OSC 4 Terminal Color Palette Query/Set
 *
 * Provides functions to query and set terminal color palette entries (indices 0-255)
 * via the OSC 4 protocol. This enables runtime introspection of the terminal's
 * actual color scheme.
 *
 * Protocol: OSC 4
 * - Query:    ESC ] 4 ; <index> ; ? BEL
 * - Set:      ESC ] 4 ; <index> ; <color> BEL
 * - Response: ESC ] 4 ; <index> ; rgb:RRRR/GGGG/BBBB ST
 *
 * The response format uses 4-digit hex per channel (e.g., rgb:ffff/0000/ffff).
 * Some terminals may use 2-digit hex (rgb:ff/00/ff). Both are handled.
 *
 * Terminators: BEL (\x07) or ST (ESC \) — both are accepted in responses.
 *
 * Supported by: xterm, Ghostty, Kitty, WezTerm, iTerm2, foot, Alacritty, rxvt-unicode
 *
 * ## Theme Detection Potential (km-tui integration)
 *
 * This module provides the primitives needed to auto-detect terminal color schemes:
 *
 * 1. Query colors 0-15 (ANSI 16 palette) on startup with queryMultiplePaletteColors()
 * 2. Parse responses with parsePaletteResponse()
 * 3. Derive dark/light mode from background luminance:
 *    - Query OSC 11 (background color) or use palette color 0 as proxy
 *    - Convert to relative luminance: L = 0.2126*R + 0.7152*G + 0.0722*B
 *    - L > 0.5 → light theme, L <= 0.5 → dark theme
 * 4. Optionally adjust theme colors based on actual palette values
 *    (e.g., map $primary to the terminal's blue if it's close enough)
 *
 * This is NOT implemented here — just the raw OSC 4 primitives.
 * The km-tui theme system would consume these to adapt its ThemeProvider.
 */

const ESC = "\x1b"
const BEL = "\x07"

// ============================================================================
// Query
// ============================================================================

/**
 * Write an OSC 4 query sequence for a single palette color index.
 *
 * The terminal will respond with:
 *   ESC ] 4 ; <index> ; rgb:RRRR/GGGG/BBBB ST
 *
 * Use parsePaletteResponse() to decode the response.
 *
 * @param index Palette index (0-255)
 * @param write Function to write data to the terminal (e.g., stdout.write.bind(stdout))
 */
export function queryPaletteColor(index: number, write: (data: string) => void): void {
  if (index < 0 || index > 255) throw new RangeError(`Palette index must be 0-255, got ${index}`)
  write(`${ESC}]4;${index};?${BEL}`)
}

/**
 * Write OSC 4 query sequences for multiple palette color indices.
 *
 * Sends one query per index. Terminals process these sequentially
 * and respond with one OSC 4 response per query.
 *
 * @param indices Array of palette indices (each 0-255)
 * @param write Function to write data to the terminal
 */
export function queryMultiplePaletteColors(indices: number[], write: (data: string) => void): void {
  for (const index of indices) {
    queryPaletteColor(index, write)
  }
}

// ============================================================================
// Set
// ============================================================================

/**
 * Write an OSC 4 sequence to set a palette color.
 *
 * The color can be in any X11 color format accepted by the terminal:
 * - `rgb:RR/GG/BB` or `rgb:RRRR/GGGG/BBBB` (X11 rgb spec)
 * - `#RRGGBB` (CSS hex — widely supported)
 * - Named colors (e.g., `red`, `blue` — terminal-dependent)
 *
 * @param index Palette index (0-255)
 * @param color Color specification string
 * @param write Function to write data to the terminal
 */
export function setPaletteColor(index: number, color: string, write: (data: string) => void): void {
  if (index < 0 || index > 255) throw new RangeError(`Palette index must be 0-255, got ${index}`)
  write(`${ESC}]4;${index};${color}${BEL}`)
}

// ============================================================================
// Response Parsing
// ============================================================================

/** OSC 4 response prefix */
const OSC4_PREFIX = `${ESC}]4;`

/**
 * Regex for the OSC 4 response body: `<index>;rgb:<R>/<G>/<B>`
 * Captures: index, R, G, B (each 1-4 hex digits)
 */
const OSC4_BODY_RE = /^(\d+);rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})$/

/**
 * Parse an OSC 4 palette color response.
 *
 * Handles both standard 4-digit hex (rgb:RRRR/GGGG/BBBB) and
 * abbreviated 2-digit hex (rgb:RR/GG/BB) formats.
 *
 * Handles both BEL (\x07) and ST (ESC \) terminators.
 *
 * @param input Raw terminal input string
 * @returns Parsed result with index and normalized color string, or null if not an OSC 4 response
 */
export function parsePaletteResponse(input: string): { index: number; color: string } | null {
  const prefixIdx = input.indexOf(OSC4_PREFIX)
  if (prefixIdx === -1) return null

  const bodyStart = prefixIdx + OSC4_PREFIX.length

  // Find terminator: BEL (\x07) or ST (ESC \)
  let bodyEnd = input.indexOf(BEL, bodyStart)
  if (bodyEnd === -1) {
    bodyEnd = input.indexOf(`${ESC}\\`, bodyStart)
  }
  if (bodyEnd === -1) return null

  const body = input.slice(bodyStart, bodyEnd)
  const match = OSC4_BODY_RE.exec(body)
  if (!match) return null

  const index = Number.parseInt(match[1]!, 10)
  if (index < 0 || index > 255) return null

  // Normalize color channels to 2-digit hex (scale 4-digit to 2-digit)
  const r = normalizeHexChannel(match[2]!)
  const g = normalizeHexChannel(match[3]!)
  const b = normalizeHexChannel(match[4]!)

  return { index, color: `#${r}${g}${b}` }
}

/**
 * Normalize a hex color channel to 2-digit hex.
 *
 * - 1-digit: repeat (e.g., "f" -> "ff")
 * - 2-digit: as-is
 * - 3-digit: take first 2 (e.g., "fff" -> "ff")
 * - 4-digit: take first 2 (e.g., "ffff" -> "ff", "1a2b" -> "1a")
 */
function normalizeHexChannel(hex: string): string {
  switch (hex.length) {
    case 1:
      return hex + hex
    case 2:
      return hex
    case 3:
      return hex.slice(0, 2)
    case 4:
      return hex.slice(0, 2)
    default:
      return hex.slice(0, 2)
  }
}
