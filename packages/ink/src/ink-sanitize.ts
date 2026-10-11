/**
 * Ink compat ANSI sanitization: sanitize sequences, track colon-format SGR, OSC8 filtering.
 * @internal
 */

import {
  createColonSGRTracker,
  sanitizeAnsi as sanitizeAnsiCore,
} from "@silvery/ag-term/ansi-sanitize"

// =============================================================================
// Colon-format SGR tracking (delegated to @silvery/ag-term)
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
// ANSI sanitization — one home: @silvery/ag-term sanitizeAnsi
// =============================================================================

/**
 * Sanitize ANSI sequences in text content using silvery's tokenizer.
 *
 * Preserves SGR (colors/styles) and terminated OSC 8 hyperlinks with an
 * allowed scheme. Tracks colon-format SGR for restoreColonFormatSGR().
 */
export function sanitizeAnsi(text: string): string {
  return sanitizeAnsiCore(text, { onSgr: (value) => colonSGRTracker.register(value) })
}

/** Recursively sanitize string children, preserving React elements. */
export function sanitizeChildren(children: import("react").ReactNode): import("react").ReactNode {
  if (typeof children === "string") {
    return sanitizeAnsi(children)
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => sanitizeChildren(child as import("react").ReactNode))
  }
  return children
}
