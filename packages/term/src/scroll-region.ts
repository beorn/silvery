/**
 * Terminal scroll region (DECSTBM) utilities.
 *
 * Scroll regions tell the terminal to natively scroll content within
 * a defined row range, which is faster than re-rendering all cells.
 *
 * DECSTBM (DEC Set Top and Bottom Margins) is supported by most modern
 * terminal emulators: xterm, iTerm2, Kitty, Ghostty, WezTerm, etc.
 */

const ESC = "\x1b"

/** Set terminal scroll region (1-indexed top and bottom rows). */
export function setScrollRegion(stdout: NodeJS.WriteStream, top: number, bottom: number): void {
  stdout.write(`${ESC}[${top};${bottom}r`)
}

/** Reset scroll region to full terminal. */
export function resetScrollRegion(stdout: NodeJS.WriteStream): void {
  stdout.write(`${ESC}[r`)
}

/** Scroll content up by N lines within the current scroll region. */
export function scrollUp(stdout: NodeJS.WriteStream, lines: number = 1): void {
  stdout.write(`${ESC}[${lines}S`)
}

/** Scroll content down by N lines within the current scroll region. */
export function scrollDown(stdout: NodeJS.WriteStream, lines: number = 1): void {
  stdout.write(`${ESC}[${lines}T`)
}

/** Move cursor to a specific position (1-indexed row and column). */
export function moveCursor(stdout: NodeJS.WriteStream, row: number, col: number): void {
  stdout.write(`${ESC}[${row};${col}H`)
}

export interface ScrollRegionConfig {
  /** Top row of the scrollable area (0-indexed). */
  top: number
  /** Bottom row of the scrollable area (0-indexed). */
  bottom: number
  /** Whether scroll region optimization is enabled. */
  enabled: boolean
}

/**
 * Detect if the terminal likely supports DECSTBM scroll regions.
 *
 * Most modern terminals do (xterm, iTerm2, Kitty, Ghostty, WezTerm, etc.)
 * but some (e.g., Linux console) may not handle them correctly.
 */
export function supportsScrollRegions(): boolean {
  const term = process.env.TERM ?? ""
  const termProgram = process.env.TERM_PROGRAM ?? ""

  // Known-good terminal programs
  if (termProgram === "iTerm.app" || termProgram === "WezTerm" || termProgram === "ghostty" || termProgram === "vscode")
    return true

  // Known-good TERM values
  if (term.includes("xterm") || term.includes("screen") || term.includes("tmux") || term.includes("kitty")) return true

  // Linux console doesn't support DECSTBM
  if (term === "linux") return false

  // Default: assume support for any term that's not empty
  return term !== ""
}
