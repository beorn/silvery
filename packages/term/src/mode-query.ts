/**
 * DECRQM — DEC Private Mode Query
 *
 * Queries the terminal for the state of DEC private modes.
 *
 * Protocol:
 * - Query:    CSI ? {mode} $ p
 * - Response: CSI ? {mode} ; {Ps} $ y
 *
 * Where Ps is:
 *   1 = set (mode is enabled)
 *   2 = reset (mode is disabled)
 *   0 = not recognized (unknown mode)
 *   3 = permanently set
 *   4 = permanently reset
 *
 * We normalize 3→"set" and 4→"reset" for simplicity.
 *
 * Supported by: xterm, Ghostty, Kitty, WezTerm, foot, VTE-based terminals
 */

/** Regex for DECRPM response: CSI ? mode ; Ps $ y */
const DECRPM_RESPONSE_RE = /\x1b\[\?(\d+);(\d+)\$y/;

/** Well-known DEC private mode constants. */
export const DecMode = {
  /** DEC cursor visible (DECTCEM) */
  CURSOR_VISIBLE: 25,
  /** Alternate screen buffer (DECSET 1049) */
  ALT_SCREEN: 1049,
  /** Normal mouse tracking (X10) */
  MOUSE_TRACKING: 1000,
  /** Bracketed paste mode */
  BRACKETED_PASTE: 2004,
  /** Synchronized output */
  SYNC_OUTPUT: 2026,
  /** Focus reporting */
  FOCUS_REPORTING: 1004,
} as const;

type ModeState = "set" | "reset" | "unknown";

/**
 * Query the state of a single DEC private mode.
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin
 * @param mode DEC private mode number (e.g., DecMode.ALT_SCREEN)
 * @param timeoutMs How long to wait for response (default: 200ms)
 * @returns "set", "reset", or "unknown"
 */
export async function queryMode(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  mode: number,
  timeoutMs = 200,
): Promise<ModeState> {
  write(`\x1b[?${mode}$p`);

  const data = await read(timeoutMs);
  if (data == null) return "unknown";

  const match = DECRPM_RESPONSE_RE.exec(data);
  if (!match) return "unknown";

  const reportedMode = parseInt(match[1]!, 10);
  if (reportedMode !== mode) return "unknown";

  const ps = parseInt(match[2]!, 10);
  switch (ps) {
    case 1:
    case 3:
      return "set";
    case 2:
    case 4:
      return "reset";
    default:
      return "unknown";
  }
}

/**
 * Query the state of multiple DEC private modes.
 *
 * Queries each mode sequentially and returns a Map of results.
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin
 * @param modes Array of DEC private mode numbers
 * @param timeoutMs Per-query timeout (default: 200ms)
 */
export async function queryModes(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  modes: number[],
  timeoutMs = 200,
): Promise<Map<number, ModeState>> {
  const results = new Map<number, ModeState>();

  for (const mode of modes) {
    const state = await queryMode(write, read, mode, timeoutMs);
    results.set(mode, state);
  }

  return results;
}
