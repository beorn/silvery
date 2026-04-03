/**
 * Commander.js help colorization using @silvery/ansi.
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

import { createStyle } from "@silvery/ansi"

// Auto-detect terminal color level for shouldColorize() checks.
const autoStyle = createStyle()

// Forced basic-color style for explicit colorizeHelp() calls.
// When a user explicitly calls colorizeHelp(), they want color regardless
// of terminal detection. The function name means "add color" — if you
// don't want color, don't call it.
const s = createStyle({ level: "basic" })

/**
 * Check if color output should be enabled.
 * Delegates to @silvery/ansi's auto-detection (NO_COLOR, FORCE_COLOR, TERM).
 */
export function shouldColorize(): boolean {
  return autoStyle.level > 0
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
  /** Style for command/subcommand names. Default: primary (yellow without theme) */
  commands?: (text: string) => string
  /** Style for --flags and -short options. Default: secondary (cyan without theme) */
  flags?: (text: string) => string
  /** Style for description text. Default: unstyled (normal foreground) */
  description?: (text: string) => string
  /** Style for section headings (Usage:, Options:, etc.). Default: bold */
  heading?: (text: string) => string
  /** Style for <required> and [optional] argument brackets. Default: accent (magenta without theme) */
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
  // Semantic token fallback: theme token → named color
  const cmds = options?.commands ?? ((t: string) => s.primary(t))
  const flags = options?.flags ?? ((t: string) => s.secondary(t))
  const desc = options?.description ?? ((t: string) => t)
  const heading = options?.heading ?? ((t: string) => s.bold(t))
  const brackets = options?.brackets ?? ((t: string) => s.accent(t))

  const helpConfig: Record<string, unknown> = {
    styleTitle: (str: string) => heading(str),
    styleCommandText: (str: string) => cmds(str),
    styleOptionText: (str: string) => flags(str),
    styleSubcommandText: (str: string) => cmds(str),
    styleArgumentText: (str: string) => brackets(str),
    styleDescriptionText: (str: string) => desc(str),
    styleCommandDescription: (str: string) => s.bold.primary(str),
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
