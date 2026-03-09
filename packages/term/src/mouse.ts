/**
 * SGR mouse event parsing (mode 1006).
 *
 * SGR format: CSI < button;x;y M (press) or CSI < button;x;y m (release)
 *
 * Button encoding:
 * - Bits 0-1: 0=left, 1=middle, 2=right, 3=release (X10 only, not SGR)
 * - Bit 2 (+4): Shift held
 * - Bit 3 (+8): Meta/Alt held
 * - Bit 4 (+16): Ctrl held
 * - Bit 5 (+32): Motion event (mouse moved while button held)
 * - Bits 6-7: 64=wheel-up, 65=wheel-down, 66=wheel-left, 67=wheel-right
 */

/**
 * Parsed mouse event from SGR mouse protocol (mode 1006).
 */
export interface ParsedMouse {
  /** Mouse button: 0=left, 1=middle, 2=right */
  button: number
  /** Column (0-indexed) */
  x: number
  /** Row (0-indexed) */
  y: number
  /** Event action */
  action: "down" | "up" | "move" | "wheel"
  /** Wheel delta: -1 for up, +1 for down */
  delta?: number
  /** Shift was held */
  shift: boolean
  /** Alt/Meta was held */
  meta: boolean
  /** Ctrl was held */
  ctrl: boolean
}

const SGR_MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/

/**
 * Parse an SGR mouse sequence.
 *
 * @returns ParsedMouse or null if not a valid mouse sequence
 */
export function parseMouseSequence(input: string): ParsedMouse | null {
  const m = SGR_MOUSE_RE.exec(input)
  if (!m) return null

  const raw = parseInt(m[1]!)
  const x = parseInt(m[2]!) - 1 // 1-indexed → 0-indexed
  const y = parseInt(m[3]!) - 1
  const terminator = m[4]!

  const shift = !!(raw & 4)
  const meta = !!(raw & 8)
  const ctrl = !!(raw & 16)
  const motion = !!(raw & 32)
  const isWheel = !!(raw & 64)

  if (isWheel) {
    const wheelButton = raw & 3 // 0=up, 1=down, 2=left, 3=right
    return {
      button: 0,
      x,
      y,
      action: "wheel",
      delta: wheelButton === 0 ? -1 : 1,
      shift,
      meta,
      ctrl,
    }
  }

  const button = raw & 3
  const action = motion ? "move" : terminator === "M" ? "down" : "up"
  return { button, x, y, action, shift, meta, ctrl }
}

const SGR_MOUSE_TEST_RE = /^\x1b\[<\d+;\d+;\d+[Mm]$/

/** Check if a raw input string is a mouse sequence */
export function isMouseSequence(input: string): boolean {
  return SGR_MOUSE_TEST_RE.test(input)
}
