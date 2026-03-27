/**
 * silvery/chalk — Drop-in chalk replacement powered by @silvery/ansi.
 *
 * ```ts
 * // Before:
 * import chalk from 'chalk'
 *
 * // After:
 * import chalk from 'silvery/chalk'
 * ```
 *
 * The default export is a chainable styling function with chalk-compatible API.
 * Under the hood it uses @silvery/ansi — no chalk dependency.
 *
 * @packageDocumentation
 */

import { createStyle, detectColor, type Style, type ColorLevel } from "@silvery/ansi"

// =============================================================================
// Color level conversion (chalk uses 0-3, silvery uses string|null)
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
// Default instance (auto-detected)
// =============================================================================

const detectedColor = typeof process !== "undefined" && process.stdout ? detectColor(process.stdout) : null

/**
 * Default chalk instance — drop-in replacement for `import chalk from 'chalk'`.
 *
 * Supports the full chainable API: `chalk.bold.red('error')`, `chalk.hex('#ff0')('hi')`, etc.
 * Also supports mutable `chalk.level` for chalk compat (0=none, 1=basic, 2=256, 3=truecolor).
 */
const chalk: Style = createStyle({ level: detectedColor })
export default chalk

// =============================================================================
// Named exports (chalk 5.x compatibility)
// =============================================================================

/**
 * Chalk constructor — creates a new style instance with a specific level.
 * Returns a callable Style (the constructor return overrides `this`).
 *
 * ```ts
 * const instance = new Chalk({ level: 3 })
 * console.log(instance.red('error'))
 * instance.level = 0 // disable colors
 * ```
 */
export class Chalk {
  constructor(options?: { level?: ChalkLevel }) {
    // Returning an object from a constructor overrides `this` — chalk compat pattern
    return createStyle({ level: fromChalkLevel(options?.level ?? toChalkLevel(detectedColor)) }) as any
  }
}

export type ChalkInstance = Style

/**
 * Color support detection for stdout.
 * Returns false if no color, or an object with the chalk level.
 */
const detectedLevel = toChalkLevel(detectedColor)
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
