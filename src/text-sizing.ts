/**
 * Text Sizing Protocol (OSC 66) -- Kitty v0.40+
 *
 * Lets the app specify how many cells a character should occupy.
 * This solves the measurement/rendering mismatch for Private Use Area (PUA)
 * characters (nerdfont icons, powerline symbols) that `string-width` reports
 * as 1-cell but terminals render as 2-cell.
 *
 * When OSC 66 is used with w=2, both the app's layout engine and the terminal
 * agree on the character width, eliminating truncation and misalignment.
 *
 * Protocol format:
 *   ESC ] 66 ; w=<width> ; <text> BEL
 *
 * @see https://sw.kovidgoyal.net/kitty/text-sizing-protocol/
 */

const OSC = "\x1b]"
const ST = "\x07" // BEL terminator (more compatible than ESC \)

/**
 * Wrap text in an OSC 66 sequence that tells the terminal to render it
 * in exactly `width` cells.
 */
export function textSized(text: string, width: number): string {
  return `${OSC}66;w=${width};${text}${ST}`
}

/**
 * Check if a code point is in the Private Use Area (PUA).
 * Covers BMP PUA (U+E000-U+F8FF) and Supplementary PUA-A/B.
 */
export function isPrivateUseArea(cp: number): boolean {
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) || // BMP PUA
    (cp >= 0xf0000 && cp <= 0xffffd) || // Supplementary PUA-A
    (cp >= 0x100000 && cp <= 0x10fffd) // Supplementary PUA-B
  )
}

/**
 * Check if text sizing is likely supported based on environment variables.
 * This is a fast synchronous check -- use detectTextSizingSupport() for
 * definitive detection via cursor position reports.
 */
export function isTextSizingLikelySupported(): boolean {
  const termProgram = process.env.TERM_PROGRAM?.toLowerCase() ?? ""
  const termVersion = process.env.TERM_PROGRAM_VERSION ?? ""

  // Kitty v0.40+ supports OSC 66
  if (termProgram === "kitty") {
    const parts = termVersion.split(".")
    const major = Number(parts[0]) || 0
    const minor = Number(parts[1]) || 0
    if (major > 0 || (major === 0 && minor >= 40)) return true
  }

  // Ghostty supports text sizing (Kitty protocol compatibility)
  if (termProgram === "ghostty") return true

  return false
}

/**
 * Detect terminal support for the text sizing protocol.
 * Uses cursor position reports (CPR) to check if OSC 66 advances the cursor
 * by the specified width.
 *
 * @returns Object with `supported` and `widthOnly` flags:
 * - supported=true, widthOnly=false: full support (scale + width)
 * - supported=true, widthOnly=true: width mode only
 * - supported=false: no support
 */
export async function detectTextSizingSupport(
  write: (data: string) => void,
  read: () => Promise<string>,
  timeout = 1000,
): Promise<{ supported: boolean; widthOnly: boolean }> {
  // Detection sequence:
  // 1. CR to column 0
  // 2. OSC 66 w=2 with a space character
  // 3. Request CPR (cursor position report)
  // If cursor is at column 3 (1-indexed), w=2 worked
  const testSequence = "\r" + textSized(" ", 2) + "\x1b[6n" + "\r\x1b[K"
  write(testSequence)

  try {
    const response = await Promise.race([
      read(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeout)),
    ])

    // Parse CPR response: ESC [ row ; col R
    const match = response.match(/\x1b\[(\d+);(\d+)R/)
    if (match) {
      const col = Number(match[2])
      // Column 3 means the space occupied 2 cells (col is 1-indexed, started at 1)
      if (col === 3) {
        return { supported: true, widthOnly: false }
      }
    }

    return { supported: false, widthOnly: false }
  } catch {
    return { supported: false, widthOnly: false }
  }
}
