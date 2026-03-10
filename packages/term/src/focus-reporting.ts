/**
 * Focus Reporting (CSI ?1004h)
 *
 * Enables/disables terminal focus-in/focus-out event reporting.
 * When enabled, the terminal sends CSI I on focus-in and CSI O on focus-out.
 *
 * Protocol:
 * - Enable:    CSI ? 1004 h
 * - Disable:   CSI ? 1004 l
 * - Focus In:  CSI I  (\x1b[I)
 * - Focus Out: CSI O  (\x1b[O)
 *
 * Supported by: xterm (v282+), Ghostty, Kitty, WezTerm, iTerm2, foot, VTE
 */

const CSI = "\x1b[";

/**
 * Enable terminal focus reporting.
 * After enabling, the terminal will send CSI I / CSI O sequences
 * when the terminal window gains or loses focus.
 */
export function enableFocusReporting(write: (data: string) => void): void {
  write(`${CSI}?1004h`);
}

/**
 * Disable terminal focus reporting.
 */
export function disableFocusReporting(write: (data: string) => void): void {
  write(`${CSI}?1004l`);
}

/**
 * Parse a focus event from terminal input.
 *
 * @param input Raw terminal input string
 * @returns Parsed focus event, or null if not a focus sequence
 */
export function parseFocusEvent(input: string): { type: "focus-in" | "focus-out" } | null {
  if (input.includes(`${CSI}I`)) {
    return { type: "focus-in" };
  }
  if (input.includes(`${CSI}O`)) {
    return { type: "focus-out" };
  }
  return null;
}
