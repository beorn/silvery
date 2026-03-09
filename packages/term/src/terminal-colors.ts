/**
 * OSC 10/11/12 Terminal Color Queries
 *
 * Provides functions to query and set the terminal's foreground, background,
 * and cursor colors. Also provides theme detection via background luminance.
 *
 * Protocol: OSC N
 * - Query:    ESC ] N ; ? BEL
 * - Set:      ESC ] N ; <color> BEL
 * - Reset:    ESC ] N BEL  (some terminals) or ESC ] 1N BEL (110/111/112)
 * - Response: ESC ] N ; rgb:RRRR/GGGG/BBBB ST
 *
 * Where N is:
 *   10 = foreground (text) color
 *   11 = background color
 *   12 = cursor color
 *
 * Response format uses the same rgb: notation as OSC 4 palette colors.
 * Terminators: BEL (\x07) or ST (ESC \) — both are accepted.
 *
 * Supported by: xterm, Ghostty, Kitty, WezTerm, iTerm2, foot, Alacritty
 */

const ESC = "\x1b"
const BEL = "\x07"

// ============================================================================
// Response Parsing (shared)
// ============================================================================

/**
 * Regex for an OSC color response body: rgb:R/G/B (1-4 hex digits per channel)
 */
const RGB_BODY_RE = /rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})/

/**
 * Normalize a hex color channel to 2-digit hex.
 * - 1-digit: repeat (e.g., "f" -> "ff")
 * - 2-digit: as-is
 * - 3-digit: take first 2
 * - 4-digit: take first 2
 */
function normalizeHexChannel(hex: string): string {
  switch (hex.length) {
    case 1:
      return hex + hex
    case 2:
      return hex
    default:
      return hex.slice(0, 2)
  }
}

/**
 * Parse an OSC color response (10/11/12) into a #RRGGBB hex string.
 *
 * @param input Raw terminal input
 * @param oscCode The OSC code to look for (10, 11, or 12)
 * @returns Normalized #RRGGBB hex string, or null if not a valid response
 */
function parseOscColorResponse(input: string, oscCode: number): string | null {
  const prefix = `${ESC}]${oscCode};`
  const prefixIdx = input.indexOf(prefix)
  if (prefixIdx === -1) return null

  const bodyStart = prefixIdx + prefix.length

  // Find terminator: BEL (\x07) or ST (ESC \)
  let bodyEnd = input.indexOf(BEL, bodyStart)
  if (bodyEnd === -1) {
    bodyEnd = input.indexOf(`${ESC}\\`, bodyStart)
  }
  if (bodyEnd === -1) return null

  const body = input.slice(bodyStart, bodyEnd)
  const match = RGB_BODY_RE.exec(body)
  if (!match) return null

  const r = normalizeHexChannel(match[1]!)
  const g = normalizeHexChannel(match[2]!)
  const b = normalizeHexChannel(match[3]!)

  return `#${r}${g}${b}`
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Query a terminal color via OSC code.
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin
 * @param oscCode The OSC code (10, 11, or 12)
 * @param timeoutMs How long to wait for response
 */
async function queryOscColor(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  oscCode: number,
  timeoutMs: number,
): Promise<string | null> {
  write(`${ESC}]${oscCode};?${BEL}`)

  const data = await read(timeoutMs)
  if (data == null) return null

  return parseOscColorResponse(data, oscCode)
}

/**
 * Query the terminal foreground (text) color.
 * @returns "#RRGGBB" hex string, or null on timeout/unsupported
 */
export async function queryForegroundColor(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<string | null> {
  return queryOscColor(write, read, 10, timeoutMs)
}

/**
 * Query the terminal background color.
 * @returns "#RRGGBB" hex string, or null on timeout/unsupported
 */
export async function queryBackgroundColor(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<string | null> {
  return queryOscColor(write, read, 11, timeoutMs)
}

/**
 * Query the terminal cursor color.
 * @returns "#RRGGBB" hex string, or null on timeout/unsupported
 */
export async function queryCursorColor(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<string | null> {
  return queryOscColor(write, read, 12, timeoutMs)
}

// ============================================================================
// Set Functions
// ============================================================================

/** Set the terminal foreground (text) color. */
export function setForegroundColor(write: (data: string) => void, color: string): void {
  write(`${ESC}]10;${color}${BEL}`)
}

/** Set the terminal background color. */
export function setBackgroundColor(write: (data: string) => void, color: string): void {
  write(`${ESC}]11;${color}${BEL}`)
}

/** Set the terminal cursor color. */
export function setCursorColor(write: (data: string) => void, color: string): void {
  write(`${ESC}]12;${color}${BEL}`)
}

// ============================================================================
// Reset Functions
// ============================================================================

/** Reset the terminal foreground color to default. */
export function resetForegroundColor(write: (data: string) => void): void {
  write(`${ESC}]110${BEL}`)
}

/** Reset the terminal background color to default. */
export function resetBackgroundColor(write: (data: string) => void): void {
  write(`${ESC}]111${BEL}`)
}

/** Reset the terminal cursor color to default. */
export function resetCursorColor(write: (data: string) => void): void {
  write(`${ESC}]112${BEL}`)
}

// ============================================================================
// Theme Detection
// ============================================================================

/**
 * Detect the terminal color scheme (light or dark) by querying the
 * background color and computing its relative luminance.
 *
 * Uses the standard sRGB luminance formula:
 *   L = 0.2126*R + 0.7152*G + 0.0722*B
 *
 * L > 0.5 → light theme, L <= 0.5 → dark theme
 *
 * @returns "light" or "dark", or null if the background color could not be queried
 */
export async function detectColorScheme(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<"light" | "dark" | null> {
  const bg = await queryBackgroundColor(write, read, timeoutMs)
  if (bg == null) return null

  // Parse #RRGGBB
  const r = parseInt(bg.slice(1, 3), 16) / 255
  const g = parseInt(bg.slice(3, 5), 16) / 255
  const b = parseInt(bg.slice(5, 7), 16) / 255

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.5 ? "light" : "dark"
}
