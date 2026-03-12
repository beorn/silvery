/**
 * Ink compat ANSI sanitization: sanitize sequences, track colon-format SGR, OSC8 filtering.
 * @internal
 */

import { tokenizeAnsi as tokenizeAnsiEsc, isCSISGR, createColonSGRTracker } from "@silvery/term/ansi-sanitize"

// =============================================================================
// Colon-format SGR tracking (delegated to @silvery/term)
// =============================================================================

/**
 * Module-level colon-format SGR tracker.
 * Populated by sanitizeAnsi when it encounters colon-separated SGR (e.g., 38:2::R:G:B).
 * Consumed by restoreColonFormatSGR to convert semicolon output back to colon format.
 *
 * This is safe because rendering is synchronous: sanitize → render → output in one call.
 */
export const colonSGRTracker = createColonSGRTracker()

/**
 * Restore colon-format SGR sequences in output.
 * Replaces semicolon-format sequences that were originally colon-format.
 *
 * Note: does NOT clear the tracker — the render() path may call
 * processBuffer multiple times (handleBufferReady + writeFrame), and each
 * call needs access to the same replacements. Replacements are naturally
 * replaced when sanitizeAnsi re-populates them on the next render cycle.
 */
export function restoreColonFormatSGR(output: string): string {
  return colonSGRTracker.restore(output)
}

// =============================================================================
// OSC helpers
// =============================================================================

/** Check if an OSC sequence is properly terminated (BEL or ST). */
function isOSCTerminated(value: string): boolean {
  if (value.length === 0) return false
  const last = value.charCodeAt(value.length - 1)
  // BEL terminator (0x07)
  if (last === 0x07) return true
  // C1 ST terminator (0x9C)
  if (last === 0x9c) return true
  // 7-bit ST: ESC + '\' — check last two chars
  if (value.length >= 2 && last === 0x5c && value.charCodeAt(value.length - 2) === 0x1b) {
    return true
  }
  return false
}

/** Check if an OSC token is OSC 8 (hyperlink). */
function isOSC8(value: string): boolean {
  // OSC 8 starts with ESC]8; or \x9D8;
  if (value.charCodeAt(0) === 0x1b) {
    // ESC ] 8 ;
    return value.charCodeAt(2) === 0x38 && value.charCodeAt(3) === 0x3b
  }
  // C1 OSC: \x9D 8 ;
  return value.charCodeAt(1) === 0x38 && value.charCodeAt(2) === 0x3b
}

// =============================================================================
// ANSI sanitization
// =============================================================================

/**
 * Sanitize ANSI sequences in text content using silvery's tokenizer.
 *
 * Preserves SGR (colors/styles) and OSC 8 hyperlinks.
 * Strips cursor movement, screen clearing, non-hyperlink OSC, DCS, PM, APC, SOS, C1 controls.
 * Also tracks colon-format SGR for round-trip restoration via restoreColonFormatSGR().
 */
export function sanitizeAnsi(text: string): string {
  if (text.length === 0) return ""

  const tokens = tokenizeAnsiEsc(text)
  let result = ""

  for (const token of tokens) {
    switch (token.type) {
      case "text":
        result += token.value
        break
      case "csi":
        // Only keep SGR sequences: final byte 'm', no intermediate bytes,
        // no private-use parameter prefixes (<, =, >, ?)
        if (isCSISGR(token.value)) {
          result += token.value
          colonSGRTracker.register(token.value)
        }
        break
      case "osc":
        // Only keep properly terminated OSC 8 (hyperlinks).
        // Strip unterminated OSC (no BEL/ST terminator) to prevent payload leaks.
        if (isOSC8(token.value) && isOSCTerminated(token.value)) {
          result += token.value
        }
        break
      // Strip everything else: esc, dcs, pm, apc, sos, c1
    }
  }

  return result
}

/** Recursively sanitize string children, preserving React elements. */
export function sanitizeChildren(children: import("react").ReactNode): import("react").ReactNode {
  if (typeof children === "string") {
    return sanitizeAnsi(children)
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => sanitizeChildren(child))
  }
  return children
}
