/**
 * Commander.js help colorization using ANSI escape codes.
 *
 * Uses Commander's built-in style hooks (styleTitle, styleOptionText, etc.)
 * rather than regex post-processing. Works with @silvery/commander
 * or plain commander — accepts a minimal CommandLike interface so Commander
 * is a peer dependency, not a hard one.
 *
 * Zero dependencies — only raw ANSI escape codes.
 *
 * @example
 * ```ts
 * import { Command } from "@silvery/commander"
 * import { colorizeHelp } from "@silvery/commander"
 *
 * const program = new Command("myapp").description("My CLI tool")
 * colorizeHelp(program)
 * ```
 */

// Raw ANSI escape codes — no framework dependencies.
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"
const CYAN = "\x1b[36m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"

/**
 * Check if color output should be enabled.
 * Uses @silvery/ansi detectColor() if available, falls back to basic
 * NO_COLOR/FORCE_COLOR/isTTY checks.
 */
let _shouldColorize: boolean | undefined

export function shouldColorize(): boolean {
  if (_shouldColorize !== undefined) return _shouldColorize

  // Try @silvery/ansi for full detection (respects NO_COLOR, FORCE_COLOR, TERM, etc.)
  try {
    const { detectColor } = require("@silvery/ansi") as { detectColor: (stdout: NodeJS.WriteStream) => string | null }
    _shouldColorize = detectColor(process.stdout) !== null
  } catch {
    // Fallback: basic NO_COLOR / FORCE_COLOR / isTTY checks
    if (process.env.NO_COLOR !== undefined) {
      _shouldColorize = false
    } else if (process.env.FORCE_COLOR !== undefined) {
      _shouldColorize = true
    } else {
      _shouldColorize = process.stdout?.isTTY ?? true
    }
  }

  return _shouldColorize
}

/** Wrap a string with ANSI codes, handling nested resets. */
function ansi(text: string, code: string): string {
  return `${code}${text}${RESET}`
}

/**
 * Minimal interface for Commander's Command — avoids requiring Commander
 * as a direct dependency. Works with both `commander` and
 * `@silvery/commander`.
 *
 * Uses permissive types to ensure structural compatibility with all
 * Commander versions, overloads, and generic instantiations.
 */
export interface CommandLike {
  // biome-ignore lint: permissive to match Commander's overloaded signatures
  configureHelp(...args: any[]): any
  // biome-ignore lint: permissive to match Commander's overloaded signatures
  configureOutput(...args: any[]): any
  // biome-ignore lint: permissive to match Commander's Command[] structurally
  readonly commands: readonly any[]
}

/** Color scheme for help output. Values are raw ANSI escape sequences. */
export interface ColorizeHelpOptions {
  /** ANSI code for command/subcommand names. Default: cyan */
  commands?: string
  /** ANSI code for --flags and -short options. Default: green */
  flags?: string
  /** ANSI code for description text. Default: dim */
  description?: string
  /** ANSI code for section headings (Usage:, Options:, etc.). Default: bold */
  heading?: string
  /** ANSI code for <required> and [optional] argument brackets. Default: yellow */
  brackets?: string
}

/**
 * Apply colorized help output to a Commander.js program and all its subcommands.
 *
 * Uses Commander's built-in `configureHelp()` style hooks rather than
 * post-processing the formatted string. This approach is robust against
 * formatting changes in Commander and handles wrapping correctly.
 *
 * @param program - A Commander Command instance (or compatible object)
 * @param options - Override default ANSI color codes for each element
 */
export function colorizeHelp(program: CommandLike, options?: ColorizeHelpOptions): void {
  const cmds = options?.commands ?? CYAN
  const flags = options?.flags ?? GREEN
  const desc = options?.description ?? DIM
  const heading = options?.heading ?? BOLD
  const brackets = options?.brackets ?? YELLOW

  const helpConfig: Record<string, unknown> = {
    // Section headings: "Usage:", "Options:", "Commands:", "Arguments:"
    styleTitle(str: string): string {
      return ansi(str, heading)
    },

    // Command name in usage line and subcommand terms
    styleCommandText(str: string): string {
      return ansi(str, cmds)
    },

    // Option terms: "-v, --verbose", "--repo <path>", "[options]"
    styleOptionText(str: string): string {
      return ansi(str, flags)
    },

    // Subcommand names in the commands list
    styleSubcommandText(str: string): string {
      return ansi(str, cmds)
    },

    // Argument terms: "<file>", "[dir]"
    styleArgumentText(str: string): string {
      return ansi(str, brackets)
    },

    // Description text for options, subcommands, arguments
    styleDescriptionText(str: string): string {
      return ansi(str, desc)
    },

    // Command description (the main program description line) — keep normal
    styleCommandDescription(str: string): string {
      return str
    },
  }

  program.configureHelp(helpConfig)

  // Tell Commander that color output is supported, even when stdout is not
  // a TTY (e.g., piped output, CI, tests). Without this, Commander strips
  // all ANSI codes from helpInformation() output.
  //
  // Callers who want to respect NO_COLOR/FORCE_COLOR should check
  // shouldColorize() before calling colorizeHelp().
  program.configureOutput({
    getOutHasColors: () => true,
    getErrHasColors: () => true,
  })

  // Apply recursively to all existing subcommands
  for (const sub of program.commands) {
    colorizeHelp(sub, options)
  }
}
