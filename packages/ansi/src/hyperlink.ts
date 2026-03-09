/**
 * Terminal hyperlink functions using OSC 8.
 *
 * OSC 8 hyperlinks create clickable links in supporting terminals.
 * Unsupported terminals will display just the text.
 *
 * @see https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda
 */

import { buildHyperlink } from "./constants"

// =============================================================================
// Hyperlink Functions
// =============================================================================

/**
 * Create a clickable hyperlink in supporting terminals.
 * Falls back to showing just the text (no URL) on unsupported terminals.
 *
 * @param text - Display text for the link
 * @param url - Target URL (http://, https://, file://, etc.)
 * @returns Text wrapped in OSC 8 hyperlink escape codes
 *
 * @example
 * ```ts
 * hyperlink('Click here', 'https://example.com')
 * hyperlink('Open file', 'file:///path/to/file.txt')
 * ```
 *
 * @note Most modern terminals support OSC 8 hyperlinks:
 * - Ghostty, Kitty, WezTerm, iTerm2, Terminal.app, GNOME Terminal
 * - VS Code integrated terminal
 */
export function hyperlink(text: string, url: string): string {
  // Most modern terminals support OSC 8, so we emit it unconditionally.
  // Unsupported terminals will just show the text.
  return buildHyperlink(text, url)
}
