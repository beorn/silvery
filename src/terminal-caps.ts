/**
 * Terminal capability detection.
 *
 * Detects what features the current terminal supports by inspecting
 * environment variables and terminal responses.
 */

export interface TerminalCaps {
  /** Terminal program name (from TERM_PROGRAM) */
  program: string
  /** TERM value */
  term: string
  /** Color support level */
  colorLevel: "none" | "basic" | "256" | "truecolor"
  /** Kitty keyboard protocol supported */
  kittyKeyboard: boolean
  /** Kitty graphics protocol (inline images) */
  kittyGraphics: boolean
  /** Sixel graphics supported */
  sixel: boolean
  /** OSC 52 clipboard */
  osc52: boolean
  /** OSC 8 hyperlinks */
  hyperlinks: boolean
  /** OSC 9/99 notifications */
  notifications: boolean
  /** Bracketed paste mode */
  bracketedPaste: boolean
  /** SGR mouse tracking */
  mouse: boolean
  /** Synchronized output (DEC 2026) */
  syncOutput: boolean
  /** Unicode/emoji support */
  unicode: boolean
}

/** Detect terminal capabilities from environment variables.
 * This is synchronous and doesn't query the terminal (no I/O).
 */
export function detectTerminalCaps(): TerminalCaps {
  const program = process.env.TERM_PROGRAM ?? ""
  const term = process.env.TERM ?? ""
  const colorTerm = process.env.COLORTERM ?? ""
  const noColor = process.env.NO_COLOR !== undefined

  // Color level
  let colorLevel: TerminalCaps["colorLevel"] = "none"
  if (!noColor) {
    if (colorTerm === "truecolor" || colorTerm === "24bit") colorLevel = "truecolor"
    else if (term.includes("256color")) colorLevel = "256"
    else if (process.stdout?.isTTY) colorLevel = "basic"
  }

  // Known terminal capabilities
  const isKitty = term === "xterm-kitty"
  const isITerm = program === "iTerm.app"
  const isGhostty = program === "ghostty"
  const isWezTerm = program === "WezTerm"
  const isAlacritty = program === "Alacritty"
  const isFoot = term === "foot" || term === "foot-extra"
  const isModern = isKitty || isITerm || isGhostty || isWezTerm || isFoot

  return {
    program,
    term,
    colorLevel,
    kittyKeyboard: isKitty || isGhostty || isWezTerm || isFoot,
    kittyGraphics: isKitty || isGhostty,
    sixel: isFoot || isWezTerm, // Known sixel support
    osc52: isModern || isAlacritty, // Most modern terminals
    hyperlinks: isModern || isAlacritty,
    notifications: isITerm || isKitty, // OSC 9 / OSC 99
    bracketedPaste: true, // Nearly all modern terminals
    mouse: true, // Nearly all modern terminals
    syncOutput: isModern || isAlacritty, // DEC 2026
    unicode: true, // Assume yes for modern terminals
  }
}
