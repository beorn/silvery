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
 * Post km-silvery.unicode-plateau Phase 2 (2026-04-23): this module reads
 * ZERO environment variables. Capability detection lives entirely in
 * `@silvery/ansi`'s `createTerminalProfile`. Consumers pass `TerminalCaps`
 * (or an explicit fingerprint string for the probe cache) so the module is
 * pure w.r.t. environment and browser/canvas targets aren't broken.
 *
 * @see https://sw.kovidgoyal.net/kitty/text-sizing-protocol/
 */

import type { TerminalCaps } from "@silvery/ansi"

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

// ============================================================================
// Probe fingerprint + result cache
// ============================================================================

/**
 * Structural subset of the terminal profile's identity the fingerprint helper
 * needs. Post km-silvery.caps-restructure (Phase 7, 2026-04-23): program /
 * version moved from {@link TerminalCaps} onto `TerminalIdentity`, so the
 * fingerprint now takes an identity shape.
 */
export interface FingerprintCaps {
  readonly program: string
  readonly version: string
}

/**
 * Build a terminal fingerprint for cache keying. Combines `program` +
 * `version` from the supplied identity to uniquely identify the terminal
 * type. Different versions may add/remove OSC 66 support, so version is part
 * of the key.
 *
 * Post unicode-plateau Phase 2: identity is required — the legacy
 * env-reading variant is gone. Callers building fingerprints from a one-shot
 * probe can use `createTerminalProfile().identity` upstream.
 */
export function getTerminalFingerprint(identity: FingerprintCaps): string {
  const program = identity.program || "unknown"
  const version = identity.version || "unknown"
  return `${program}@${version}`
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
 * Get a cached probe result for the given fingerprint, if available.
 */
export function getCachedProbeResult(fingerprint: string): TextSizingProbeResult | undefined {
  return probeCache.get(fingerprint)
}

/**
 * Store a probe result in the cache for the given fingerprint.
 */
export function setCachedProbeResult(
  fingerprint: string,
  result: TextSizingProbeResult,
): void {
  probeCache.set(fingerprint, result)
}

/**
 * Clear the probe cache. Useful for testing.
 */
export function clearProbeCache(): void {
  probeCache.clear()
}

// ============================================================================
// Async probe
// ============================================================================

/**
 * Detect terminal support for the text sizing protocol.
 * Uses cursor position reports (CPR) to check if OSC 66 advances the cursor
 * by the specified width.
 *
 * Results are cached by fingerprint so the probe only runs once per terminal
 * type per process.
 *
 * @param write - Writer function (TUI output)
 * @param read - Reader function (CPR response source)
 * @param fingerprint - Cache key. Derived via {@link getTerminalFingerprint}
 *   from `TerminalCaps`; callers inside a running session typically compute
 *   it once from `term.profile.caps`.
 * @param timeout - Per-probe timeout in ms (default 1000)
 * @returns Object with `supported` and `widthOnly` flags:
 * - supported=true, widthOnly=false: full support (scale + width)
 * - supported=true, widthOnly=true: width mode only
 * - supported=false: no support
 */
export async function detectTextSizingSupport(
  write: (data: string) => void,
  read: () => Promise<string>,
  fingerprint: string,
  timeout = 1000,
): Promise<TextSizingProbeResult> {
  // Check cache first
  const cached = getCachedProbeResult(fingerprint)
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
        setCachedProbeResult(fingerprint, result)
        return result
      }
    }

    const result: TextSizingProbeResult = { supported: false, widthOnly: false }
    setCachedProbeResult(fingerprint, result)
    return result
  } catch {
    const result: TextSizingProbeResult = { supported: false, widthOnly: false }
    setCachedProbeResult(fingerprint, result)
    return result
  }
}
