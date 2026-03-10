/**
 * OSC 52 Clipboard Support
 *
 * Provides clipboard access via the OSC 52 terminal protocol.
 * This works across SSH sessions and in terminals that support it.
 *
 * Protocol: OSC 52
 * - Copy:    ESC ] 52 ; c ; <base64> BEL
 * - Query:   ESC ] 52 ; c ; ? BEL
 * - Response: ESC ] 52 ; c ; <base64> BEL  (or ST terminator)
 *
 * Supported by: Ghostty, Kitty, WezTerm, iTerm2, xterm, foot, tmux
 */

const ESC = "\x1b";
const BEL = "\x07";

// ============================================================================
// Clipboard Operations
// ============================================================================

/**
 * Copy text to the system clipboard via OSC 52.
 * Encodes the text as base64 and writes the OSC 52 sequence to stdout.
 */
export function copyToClipboard(stdout: NodeJS.WriteStream, text: string): void {
  const base64 = Buffer.from(text).toString("base64");
  stdout.write(`${ESC}]52;c;${base64}${BEL}`);
}

/**
 * Request clipboard contents via OSC 52.
 * Writes the OSC 52 query sequence. The terminal will respond with
 * an OSC 52 response containing the clipboard contents as base64.
 * Use parseClipboardResponse() to decode the response.
 */
export function requestClipboard(stdout: NodeJS.WriteStream): void {
  stdout.write(`${ESC}]52;c;?${BEL}`);
}

// ============================================================================
// Response Parsing
// ============================================================================

/** OSC 52 response prefix */
const OSC52_PREFIX = `${ESC}]52;c;`;

/**
 * Parse an OSC 52 clipboard response and decode the base64 content.
 *
 * Returns the decoded clipboard text, or null if the input is not
 * an OSC 52 clipboard response.
 *
 * Handles both BEL (\x07) and ST (ESC \) terminators.
 */
export function parseClipboardResponse(input: string): string | null {
  const prefixIdx = input.indexOf(OSC52_PREFIX);
  if (prefixIdx === -1) return null;

  const contentStart = prefixIdx + OSC52_PREFIX.length;

  // Reject the query marker — it's not a response
  if (input[contentStart] === "?") return null;

  // Find terminator: BEL (\x07) or ST (ESC \)
  let contentEnd = input.indexOf(BEL, contentStart);
  if (contentEnd === -1) {
    contentEnd = input.indexOf(`${ESC}\\`, contentStart);
  }
  if (contentEnd === -1) return null;

  const base64 = input.slice(contentStart, contentEnd);
  return Buffer.from(base64, "base64").toString("utf-8");
}
