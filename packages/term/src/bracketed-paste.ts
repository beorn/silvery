/**
 * Bracketed Paste Mode
 *
 * Enables bracketed paste so the terminal wraps pasted text with markers.
 * This lets the app distinguish pasted text from typed input and receive
 * it as a single event rather than individual keystrokes.
 *
 * Protocol: DEC private mode 2004
 * - Enable:  CSI ? 2004 h
 * - Disable: CSI ? 2004 l
 * - Paste start marker: CSI 200 ~
 * - Paste end marker:   CSI 201 ~
 *
 * Supported by: Ghostty, Kitty, WezTerm, iTerm2, Alacritty, xterm, tmux, foot
 */

// ============================================================================
// Constants
// ============================================================================

/** Escape sequence that marks the beginning of pasted text */
export const PASTE_START = "\x1b[200~"

/** Escape sequence that marks the end of pasted text */
export const PASTE_END = "\x1b[201~"

// ============================================================================
// Protocol Control
// ============================================================================

/**
 * Enable bracketed paste mode.
 * Writes CSI ? 2004 h to the output stream.
 */
export function enableBracketedPaste(stdout: NodeJS.WriteStream): void {
  stdout.write("\x1b[?2004h")
}

/**
 * Disable bracketed paste mode.
 * Writes CSI ? 2004 l to the output stream.
 */
export function disableBracketedPaste(stdout: NodeJS.WriteStream): void {
  stdout.write("\x1b[?2004l")
}

// ============================================================================
// Parsing
// ============================================================================

/** Result of parsing a bracketed paste sequence */
export interface BracketedPasteResult {
  type: "paste"
  content: string
}

/**
 * Detect and extract bracketed paste content from raw terminal input.
 *
 * Returns the paste content if the input contains a complete bracketed paste
 * sequence (PASTE_START ... PASTE_END), or null if no paste markers are found.
 */
export function parseBracketedPaste(input: string): BracketedPasteResult | null {
  const startIdx = input.indexOf(PASTE_START)
  if (startIdx === -1) return null

  const contentStart = startIdx + PASTE_START.length
  const endIdx = input.indexOf(PASTE_END, contentStart)
  if (endIdx === -1) return null

  return {
    type: "paste",
    content: input.slice(contentStart, endIdx),
  }
}
