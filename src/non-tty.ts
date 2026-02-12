/**
 * Non-TTY Mode Support for Inkx
 *
 * Provides detection and rendering modes for non-interactive environments:
 * - Piped output (process.stdout.isTTY === false)
 * - CI environments
 * - TERM=dumb
 *
 * When in non-TTY mode, inkx avoids cursor positioning codes that garble
 * output in non-interactive environments.
 *
 * Modes:
 * - 'auto': Detect based on environment (default)
 * - 'tty': Force TTY mode (normal cursor positioning)
 * - 'line-by-line': Simple newline-separated output, no cursor movement
 * - 'static': Single output at end (no updates)
 * - 'plain': Strip all ANSI codes
 */

import { stripAnsi } from "./unicode.js"

// ============================================================================
// Types
// ============================================================================

/**
 * Non-TTY rendering mode.
 *
 * - 'auto': Auto-detect based on environment
 * - 'tty': Force TTY mode with cursor positioning
 * - 'line-by-line': Output lines without cursor repositioning
 * - 'static': Single final output only
 * - 'plain': Strip all ANSI escape codes
 */
export type NonTTYMode = "auto" | "tty" | "line-by-line" | "static" | "plain"

/**
 * Options for non-TTY output.
 */
export interface NonTTYOptions {
  /** The rendering mode. Default: 'auto' */
  mode?: NonTTYMode
  /** Output stream to check for TTY status. Default: process.stdout */
  stdout?: NodeJS.WriteStream
}

/**
 * Resolved non-TTY mode after auto-detection.
 */
export type ResolvedNonTTYMode = Exclude<NonTTYMode, "auto">

// ============================================================================
// Detection
// ============================================================================

/**
 * Check if the environment is a TTY.
 *
 * Returns false if:
 * - stdout.isTTY is false or undefined
 * - TERM=dumb
 * - CI environment variables are set
 */
export function isTTY(stdout: NodeJS.WriteStream = process.stdout): boolean {
  // Check stdout.isTTY
  if (!stdout.isTTY) {
    return false
  }

  // Check TERM=dumb
  if (process.env.TERM === "dumb") {
    return false
  }

  // Check common CI environment variables
  if (
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.JENKINS_URL ||
    process.env.BUILDKITE ||
    process.env.CIRCLECI ||
    process.env.TRAVIS
  ) {
    return false
  }

  return true
}

/**
 * Resolve the non-TTY mode based on options and environment.
 *
 * When mode is 'auto':
 * - If TTY detected: returns 'tty'
 * - If non-TTY detected: returns 'line-by-line'
 */
export function resolveNonTTYMode(options: NonTTYOptions = {}): ResolvedNonTTYMode {
  const { mode = "auto", stdout = process.stdout } = options

  if (mode !== "auto") {
    return mode
  }

  // Auto-detect based on environment
  return isTTY(stdout) ? "tty" : "line-by-line"
}

// Re-export stripAnsi from unicode.ts (canonical implementation)
export { stripAnsi } from "./unicode.js"

// ============================================================================
// Line-by-Line Output
// ============================================================================

/**
 * Convert buffer output to line-by-line format.
 *
 * Instead of using cursor positioning, outputs each line with a simple
 * carriage return and clear-to-end-of-line sequence.
 *
 * @param content The rendered content (may contain ANSI codes but no cursor positioning)
 * @param prevLineCount Number of lines in the previous frame (for clearing)
 * @returns Output string suitable for non-TTY rendering
 */
export function toLineByLineOutput(content: string, prevLineCount: number): string {
  const lines = content.split("\n")
  let output = ""

  // Move cursor up to overwrite previous content (if any)
  if (prevLineCount > 0) {
    // Move to start of first line
    output += "\r"
    // Move up
    if (prevLineCount > 1) {
      output += `\x1b[${prevLineCount - 1}A`
    }
  }

  // Output each line
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      output += "\n"
    }
    output += lines[i]
    // Clear to end of line (removes leftover content from longer previous lines)
    output += "\x1b[K"
  }

  // Clear any remaining lines from previous frame
  const extraLines = prevLineCount - lines.length
  if (extraLines > 0) {
    for (let i = 0; i < extraLines; i++) {
      output += "\n\x1b[K"
    }
    // Move cursor back up to end of content
    output += `\x1b[${extraLines}A`
  }

  return output
}

/**
 * Convert buffer output to plain text format.
 *
 * Strips all ANSI codes and outputs simple newline-separated text.
 * No cursor movement or clearing.
 *
 * @param content The rendered content
 * @param prevLineCount Number of lines in the previous frame (unused in plain mode)
 * @returns Plain text output
 */
export function toPlainOutput(content: string, _prevLineCount: number): string {
  // Strip ANSI codes
  const plain = stripAnsi(content)

  // Trim trailing whitespace from each line but preserve structure
  const lines = plain.split("\n").map((line) => line.trimEnd())

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop()
  }

  return lines.join("\n")
}

// ============================================================================
// Output Helpers
// ============================================================================

/**
 * Create an output transformer based on the non-TTY mode.
 *
 * @param mode The resolved non-TTY mode
 * @returns A function that transforms output based on the mode
 */
export function createOutputTransformer(mode: ResolvedNonTTYMode): (content: string, prevLineCount: number) => string {
  switch (mode) {
    case "tty":
      // Pass through unchanged
      return (content) => content

    case "line-by-line":
      return toLineByLineOutput

    case "static":
      // For static mode, we return empty string for intermediate renders
      // The final render is handled by the caller
      return () => ""

    case "plain":
      return toPlainOutput
  }
}

/**
 * Count the number of lines in a string.
 */
export function countLines(str: string): number {
  if (!str) return 0
  return str.split("\n").length
}
