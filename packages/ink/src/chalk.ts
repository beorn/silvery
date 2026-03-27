/**
 * silvery/chalk — Drop-in chalk replacement powered by @silvery/style.
 *
 * ```ts
 * // Before:
 * import chalk from 'chalk'
 *
 * // After:
 * import chalk from 'silvery/chalk'
 * ```
 *
 * The default export is a chainable styling function identical to chalk's API.
 * Under the hood it uses @silvery/style (which uses @silvery/ansi for detection).
 *
 * For silvery-native features (detection, hyperlinks, extended underlines),
 * use `@silvery/ansi` directly.
 *
 * @packageDocumentation
 */

import { createStyle, type Style } from "@silvery/style"
import { detectColor } from "@silvery/ag-term/ansi/detection"
import type { ColorLevel } from "@silvery/ag-term/ansi/types"

// =============================================================================
// Color level conversion
// =============================================================================

type ChalkLevel = 0 | 1 | 2 | 3

function toChalkLevel(cl: ColorLevel | null): ChalkLevel {
  if (cl === null) return 0
  if (cl === "basic") return 1
  if (cl === "256") return 2
  return 3 // truecolor
}

function fromChalkLevel(level: ChalkLevel): ColorLevel | null {
  if (level === 0) return null
  if (level === 1) return "basic"
  if (level === 2) return "256"
  return "truecolor"
}

// =============================================================================
// Default style instance (auto-detected)
// =============================================================================

const detectedColor =
  // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- typeof guard prevents ReferenceError in environments without process global
  typeof process !== "undefined" && process.stdout ? detectColor(process.stdout) : null

const detectedLevel = toChalkLevel(detectedColor)

/**
 * Default chalk instance — drop-in replacement for `import chalk from 'chalk'`.
 *
 * Supports the full chainable API: `chalk.bold.red('error')`, `chalk.hex('#ff0')('hi')`, etc.
 */
const chalk: Style = createStyle({ level: detectedColor })
export default chalk

// =============================================================================
// Named exports (chalk 5.x compatibility)
// =============================================================================

/**
 * Chalk constructor replacement — creates a style with a specific level.
 */
export class Chalk {
  private style: Style
  level: ChalkLevel

  constructor(options?: { level?: ChalkLevel }) {
    this.level = options?.level ?? detectedLevel
    this.style = createStyle({ level: fromChalkLevel(this.level) })
  }

  // Proxy to the underlying style instance
  bold = (text: string) => this.style.bold(text)
  dim = (text: string) => this.style.dim(text)
  italic = (text: string) => this.style.italic(text)
  underline = (text: string) => this.style.underline(text)
  red = (text: string) => this.style.red(text)
  green = (text: string) => this.style.green(text)
  yellow = (text: string) => this.style.yellow(text)
  blue = (text: string) => this.style.blue(text)
  magenta = (text: string) => this.style.magenta(text)
  cyan = (text: string) => this.style.cyan(text)
  white = (text: string) => this.style.white(text)
  gray = (text: string) => this.style.gray(text)
  grey = (text: string) => this.style.grey(text)
}

export type ChalkInstance = Style

/**
 * Color support detection for stdout.
 * Returns false if no color, or an object with the chalk level.
 */
export const supportsColor: false | { level: ChalkLevel } = detectedLevel === 0 ? false : { level: detectedLevel }

/**
 * Color support detection for stderr.
 */
export const supportsColorStderr: false | { level: ChalkLevel } = (() => {
  if (!process?.stderr) return false
  const level = toChalkLevel(detectColor(process.stderr))
  return level === 0 ? false : { level }
})()

// =============================================================================
// Chalk name lists (for programmatic access)
// =============================================================================

export const modifierNames = [
  "reset",
  "bold",
  "dim",
  "italic",
  "underline",
  "overline",
  "inverse",
  "hidden",
  "strikethrough",
  "visible",
] as const

export const foregroundColorNames = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "gray",
  "grey",
  "blackBright",
  "redBright",
  "greenBright",
  "yellowBright",
  "blueBright",
  "magentaBright",
  "cyanBright",
  "whiteBright",
] as const

export const backgroundColorNames = [
  "bgBlack",
  "bgRed",
  "bgGreen",
  "bgYellow",
  "bgBlue",
  "bgMagenta",
  "bgCyan",
  "bgWhite",
  "bgGray",
  "bgGrey",
  "bgBlackBright",
  "bgRedBright",
  "bgGreenBright",
  "bgYellowBright",
  "bgBlueBright",
  "bgMagentaBright",
  "bgCyanBright",
  "bgWhiteBright",
] as const

export const colorNames = [...foregroundColorNames, ...backgroundColorNames] as const

// Re-export detection utilities that chalk users often need
export { detectColor, toChalkLevel, fromChalkLevel }
export type { ColorLevel, ChalkLevel }
