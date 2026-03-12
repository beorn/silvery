/**
 * ANSI escape code utilities for terminal control
 */

/** Hide the cursor */
export const CURSOR_HIDE = "\x1b[?25l"

/** Show the cursor */
export const CURSOR_SHOW = "\x1b[?25h"

/** Move cursor to beginning of line */
export const CURSOR_TO_START = "\r"

/** Clear from cursor to end of line */
export const CLEAR_LINE_END = "\x1b[K"

/** Clear entire line */
export const CLEAR_LINE = "\x1b[2K"

/** Clear screen and move to top-left */
export const CLEAR_SCREEN = "\x1b[2J\x1b[H"

/** Move cursor up N lines */
export const cursorUp = (n: number = 1): string => `\x1b[${n}A`

/** Move cursor down N lines */
export const cursorDown = (n: number = 1): string => `\x1b[${n}B`

/** Save cursor position */
export const CURSOR_SAVE = "\x1b[s"

/** Restore cursor position */
export const CURSOR_RESTORE = "\x1b[u"

/**
 * Write to stream with proper handling
 */
export function write(text: string, stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(text)
}

/**
 * Clear the current line and write new text
 */
export function writeLine(text: string, stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`${CURSOR_TO_START}${text}${CLEAR_LINE_END}`)
}

/**
 * Wrap a function to handle cursor visibility
 * Hides cursor on start, shows on completion/error
 */
export function withCursor<T>(fn: () => T | Promise<T>, stream: NodeJS.WriteStream = process.stdout): Promise<T> {
  stream.write(CURSOR_HIDE)

  const restore = () => stream.write(CURSOR_SHOW)

  try {
    const result = fn()
    if (result instanceof Promise) {
      return result.finally(restore)
    }
    restore()
    return Promise.resolve(result)
  } catch (error) {
    restore()
    throw error
  }
}

/**
 * Check if stream is a TTY (supports ANSI codes)
 * Also respects FORCE_TTY environment variable for testing
 */
export function isTTY(stream: NodeJS.WriteStream = process.stdout): boolean {
  if (process.env.FORCE_TTY === "1") return true
  return stream.isTTY ?? false
}

/**
 * Get terminal width
 */
export function getTerminalWidth(stream: NodeJS.WriteStream = process.stdout): number {
  return stream.columns ?? 80
}
