/**
 * Commander.js help colorization using @silvery/style.
 *
 * Uses Commander's built-in style hooks (styleTitle, styleOptionText, etc.)
 * rather than regex post-processing.
 *
 * @example
 * ```ts
 * import { Command } from "@silvery/commander"
 * // Command auto-colorizes in its constructor — no manual call needed.
 * // For plain Commander:
 * import { colorizeHelp } from "@silvery/commander"
 * colorizeHelp(program)
 * ```
 */

import { createStyle } from "@silvery/style"

// Auto-detect terminal color level. The Style instance handles the full
// degradation chain: truecolor → 256 → basic (ANSI 16) → null (no color).
// When level is null (NO_COLOR), style methods return plain text.
const s = createStyle()

/**
 * Check if color output should be enabled.
 * Delegates to @silvery/style's auto-detection (NO_COLOR, FORCE_COLOR, TERM).
 */
export function shouldColorize(): boolean {
  return s.level > 0
}

/**
 * Minimal interface for Commander's Command — avoids requiring Commander
 * as a direct dependency. Works with both `commander` and
 * `@silvery/commander`.
 */
export interface CommandLike {
  // biome-ignore lint: permissive to match Commander's overloaded signatures
  configureHelp(...args: any[]): any
  // biome-ignore lint: permissive to match Commander's overloaded signatures
  configureOutput(...args: any[]): any
  // biome-ignore lint: permissive to match Commander's Command[] structurally
  readonly commands: readonly any[]
}

/** Color scheme for help output. Each value is a styling function (text → styled text). */
export interface ColorizeHelpOptions {
  /** Style for command/subcommand names. Default: cyan */
  commands?: (text: string) => string
  /** Style for --flags and -short options. Default: green */
  flags?: (text: string) => string
  /** Style for description text. Default: dim */
  description?: (text: string) => string
  /** Style for section headings (Usage:, Options:, etc.). Default: bold */
  heading?: (text: string) => string
  /** Style for <required> and [optional] argument brackets. Default: yellow */
  brackets?: (text: string) => string
}

/**
 * Apply colorized help output to a Commander.js program and all its subcommands.
 *
 * Uses Commander's built-in `configureHelp()` style hooks rather than
 * post-processing the formatted string.
 *
 * @param program - A Commander Command instance (or compatible object)
 * @param options - Override default style functions for each element
 */
export function colorizeHelp(program: CommandLike, options?: ColorizeHelpOptions): void {
  // Ensure style generates codes — at minimum basic (ANSI 16).
  // Auto-detected level may be higher (256/truecolor) for richer output.
  // May be 0 if NO_COLOR is set; in that case, force basic since Commander
  // handles the final strip via configureOutput.
  if (s.level === 0) s.level = 1

  const cmds = options?.commands ?? ((t: string) => s.cyan(t))
  const flags = options?.flags ?? ((t: string) => s.green(t))
  const desc = options?.description ?? ((t: string) => s.dim(t))
  const heading = options?.heading ?? ((t: string) => s.bold(t))
  const brackets = options?.brackets ?? ((t: string) => s.yellow(t))

  const helpConfig: Record<string, unknown> = {
    styleTitle: (str: string) => heading(str),
    styleCommandText: (str: string) => cmds(str),
    styleOptionText: (str: string) => flags(str),
    styleSubcommandText: (str: string) => cmds(str),
    styleArgumentText: (str: string) => brackets(str),
    styleDescriptionText: (str: string) => desc(str),
    styleCommandDescription: (str: string) => str,
  }

  program.configureHelp(helpConfig)

  // Tell Commander that color output is supported, even when stdout is not
  // a TTY. Without this, Commander strips ANSI codes from helpInformation().
  program.configureOutput({
    getOutHasColors: () => true,
    getErrHasColors: () => true,
  })

  // Apply recursively to all existing subcommands
  for (const sub of program.commands) {
    colorizeHelp(sub, options)
  }
}
