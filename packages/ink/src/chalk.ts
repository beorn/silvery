/**
 * silvery/chalk — Drop-in chalk replacement.
 *
 * ```ts
 * // Before:
 * import chalk from 'chalk'
 *
 * // After:
 * import chalk from 'silvery/chalk'
 * ```
 *
 * The default export is a real chalk instance for full compat (level mutation,
 * visible, multi-arg). Uses @silvery/ansi for color detection.
 *
 * The core rendering pipeline (ag-term) uses @silvery/style instead of chalk.
 *
 * @packageDocumentation
 */

import { Chalk, type ChalkInstance } from "chalk"
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
// Default chalk instance (auto-detected)
// =============================================================================

const detectedLevel = toChalkLevel(
  // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- typeof guard prevents ReferenceError in environments without process global
  typeof process !== "undefined" && process.stdout ? detectColor(process.stdout) : null,
)

/**
 * Default chalk instance — drop-in replacement for `import chalk from 'chalk'`.
 *
 * Supports the full chainable API: `chalk.bold.red('error')`, `chalk.hex('#ff0')('hi')`, etc.
 */
const chalk = new Chalk({ level: detectedLevel })
export default chalk

// =============================================================================
// Named exports (chalk 5.x compatibility)
// =============================================================================

export { Chalk, type ChalkInstance }

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
