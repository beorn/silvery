/**
 * Text Sizing Protocol (OSC 66) -- Kitty v0.40+
 *
 * Lets the app specify how many cells a character should occupy.
 * This solves the measurement/rendering mismatch for Private Use Area (PUA)
 * characters (nerdfont icons, powerline symbols) that `string-width` reports
 * as 1-cell but terminals render as 2-cell.
 *
 * When OSC 66 is used with w=2, both the app's layout engine and the terminal
 * agree on the character width, eliminating truncation and misalignment.
 *
 * Protocol format:
 *   ESC ] 66 ; w=<width> ; <text> BEL
 *
 * @see https://sw.kovidgoyal.net/kitty/text-sizing-protocol/
 */

const OSC = "\x1b]"
const ST = "\x07" // BEL terminator (more compatible than ESC \)

/**
 * Wrap text in an OSC 66 sequence that tells the terminal to render it
 * in exactly `width` cells.
 */
export function textSized(text: string, width: number): string {
  return `${OSC}66;w=${width};${text}${ST}`
}

// ============================================================================
// Text Scale (font size multiplier) — OSC 66 s= parameter
// ============================================================================

/**
 * Generate an OSC 66 escape sequence to set the text scale (font size).
 *
 * The scale is a floating-point multiplier:
 * - 2.0 = double size (headings)
 * - 1.0 = normal
 * - 0.5 = half size (small print, annotations)
 *
 * The scale applies to all subsequent text until reset or changed.
 * Only supported in Kitty v0.40+.
 *
 * @param scale - Font size multiplier (e.g. 2.0 for double, 0.5 for half)
 */
export function textScaled(scale: number): string {
  return `${OSC}66;s=${scale}${ST}`
}

/**
 * Generate an OSC 66 escape sequence to reset text scale to default (1.0).
 */
export function resetTextScale(): string {
  return `${OSC}66;s=1${ST}`
}

/**
 * Check if a code point is in the Private Use Area (PUA).
 * Covers BMP PUA (U+E000-U+F8FF) and Supplementary PUA-A/B.
 */
export function isPrivateUseArea(cp: number): boolean {
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) || // BMP PUA
    (cp >= 0xf0000 && cp <= 0xffffd) || // Supplementary PUA-A
    (cp >= 0x100000 && cp <= 0x10fffd) // Supplementary PUA-B
  )
}

/**
 * Check if text sizing is likely supported based on environment variables.
 * This is a fast synchronous check -- use detectTextSizingSupport() for
 * definitive detection via cursor position reports.
 *
 * Prefer the caps-aware form: pass `caps.textSizingSupported` if a
 * {@link TerminalCaps} is already in scope. The `createTerminalProfile`
 * detection in `@silvery/ansi/profile` already computes this flag with the
 * canonical `TERM=xterm-kitty` check + version parse. The env-fallback path
 * here (TERM_PROGRAM) survives for the one caller (create-app.tsx:1003) that
 * runs without caps in some test paths.
 *
 * The plateau refactor (km-silvery.terminal-profile-plateau) prefers consumers
 * reading caps over re-reading env. Passing caps turns this helper into a
 * pass-through; leaving it unset uses the legacy env probe.
 */
export function isTextSizingLikelySupported(caps?: {
  readonly textSizingSupported?: boolean
}): boolean {
  // Prefer caps when supplied — profile.ts already made the authoritative
  // decision via TERM=xterm-kitty + TERM_PROGRAM_VERSION parse.
  if (caps?.textSizingSupported !== undefined) return caps.textSizingSupported

  const termProgram = process.env.TERM_PROGRAM?.toLowerCase() ?? ""
  const termVersion = process.env.TERM_PROGRAM_VERSION ?? ""

  // Kitty v0.40+ supports OSC 66
  if (termProgram === "kitty") {
    const parts = termVersion.split(".")
    const major = Number(parts[0]) || 0
    const minor = Number(parts[1]) || 0
    if (major > 0 || (major === 0 && minor >= 40)) return true
  }

  // Ghostty parses OSC 66 but does NOT render it (as of v1.3.0, March 2026).
  // Wrapping text in OSC 66 causes Ghostty to swallow the content silently.
  // Re-enable when Ghostty ships actual text sizing GUI support.
  // if (termProgram === "ghostty") return true

  return false
}

/** Result of text sizing probe */
export interface TextSizingProbeResult {
  supported: boolean
  widthOnly: boolean
}

/**
 * Cache of probe results by terminal fingerprint.
 * Persists across app instances in the same process so the probe
 * only runs once per terminal type.
 */
const probeCache = new Map<string, TextSizingProbeResult>()

/**
 * Get a terminal fingerprint for cache keying.
 * Combines TERM_PROGRAM + TERM_PROGRAM_VERSION to uniquely identify
 * the terminal type. Different versions may add/remove OSC 66 support.
 */
export function getTerminalFingerprint(): string {
  const program = process.env.TERM_PROGRAM ?? "unknown"
  const version = process.env.TERM_PROGRAM_VERSION ?? "unknown"
  return `${program}@${version}`
}

/**
 * Get a cached probe result for the current terminal, if available.
 */
export function getCachedProbeResult(): TextSizingProbeResult | undefined {
  return probeCache.get(getTerminalFingerprint())
}

/**
 * Store a probe result in the cache for the current terminal.
 */
export function setCachedProbeResult(result: TextSizingProbeResult): void {
  probeCache.set(getTerminalFingerprint(), result)
}

/**
 * Clear the probe cache. Useful for testing.
 */
export function clearProbeCache(): void {
  probeCache.clear()
}

/**
 * Detect terminal support for the text sizing protocol.
 * Uses cursor position reports (CPR) to check if OSC 66 advances the cursor
 * by the specified width.
 *
 * Results are cached by terminal fingerprint so the probe only runs once
 * per terminal type per process.
 *
 * @returns Object with `supported` and `widthOnly` flags:
 * - supported=true, widthOnly=false: full support (scale + width)
 * - supported=true, widthOnly=true: width mode only
 * - supported=false: no support
 */
export async function detectTextSizingSupport(
  write: (data: string) => void,
  read: () => Promise<string>,
  timeout = 1000,
): Promise<TextSizingProbeResult> {
  // Check cache first
  const cached = getCachedProbeResult()
  if (cached !== undefined) return cached

  // Detection sequence:
  // 1. CR to column 0
  // 2. OSC 66 w=2 with a space character
  // 3. Request CPR (cursor position report)
  // If cursor is at column 3 (1-indexed), w=2 worked
  const testSequence = "\r" + textSized(" ", 2) + "\x1b[6n" + "\r\x1b[K"
  write(testSequence)

  try {
    const response = await Promise.race([
      read(),
      new Promise<string>((_resolve, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeout),
      ),
    ])

    // Parse CPR response: ESC [ row ; col R
    const match = response.match(/\x1b\[(\d+);(\d+)R/)
    if (match) {
      const col = Number(match[2])
      // Column 3 means the space occupied 2 cells (col is 1-indexed, started at 1)
      if (col === 3) {
        const result: TextSizingProbeResult = { supported: true, widthOnly: false }
        setCachedProbeResult(result)
        return result
      }
    }

    const result: TextSizingProbeResult = { supported: false, widthOnly: false }
    setCachedProbeResult(result)
    return result
  } catch {
    const result: TextSizingProbeResult = { supported: false, widthOnly: false }
    setCachedProbeResult(result)
    return result
  }
}
