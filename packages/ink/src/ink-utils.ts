/**
 * Ink compat utilities: chalk integration, terminal dimensions, contexts, VS16 handling.
 * @internal
 */

import React from "react"
import chalk from "./chalk.ts"
import { isTextPresentationEmoji } from "@silvery/ag-term/unicode"

// =============================================================================
// Chalk integration
// =============================================================================

/**
 * Get chalk's current color level at render time.
 * Tests may set chalk.level programmatically (e.g., chalk.level = 3 for
 * background color tests). We sync our renderer's color behavior with chalk.
 */
/** @internal */
export function currentChalkLevel(): number {
  return chalk?.level ?? 0
}

// =============================================================================
// Terminal dimensions
// =============================================================================

/**
 * Resolve terminal column count using Ink's fallback chain:
 * process.env.COLUMNS → process.stdout.columns → process.stderr.columns → 80
 */
export function resolveTerminalColumns(): number {
  if (process.env.COLUMNS) {
    const val = Number(process.env.COLUMNS)
    if (val > 0) return val
  }
  if (process.stdout?.columns && process.stdout.columns > 0) return process.stdout.columns
  if (process.stderr?.columns && process.stderr.columns > 0) return process.stderr.columns
  return 80
}

/**
 * Resolve terminal row count using Ink's fallback chain:
 * process.env.LINES → process.stdout.rows → process.stderr.rows → 24
 */
export function resolveTerminalRows(): number {
  if (process.env.LINES) {
    const val = Number(process.env.LINES)
    if (val > 0) return val
  }
  if (process.stdout?.rows && process.stdout.rows > 0) return process.stdout.rows
  if (process.stderr?.rows && process.stderr.rows > 0) return process.stderr.rows
  return 24
}

// =============================================================================
// Contexts
// =============================================================================

/**
 * Context that signals style props should be passed to silvery's Text.
 * Always true in the render() path so buffer cells are styled for correct
 * content edge detection (trailing whitespace preservation).
 * When chalk has no colors AND no embedded ANSI, processBuffer strips ANSI
 * from the styled output to produce plain text.
 * The render() path sets this to true; renderToString() does not use it.
 */
export const ForceStylesCtx = React.createContext(false)

/**
 * Per-render-instance state shared between InkText (render phase) and
 * processBuffer (output phase). Tracks whether any Text component in the
 * tree has user-embedded ANSI sequences (SGR, OSC 8) in its children.
 * When true and !chalkHasColors, processBuffer preserves ANSI in output;
 * when false, processBuffer strips all ANSI for correct plain-mode output.
 */
export interface InkRenderState {
  hasEmbeddedAnsi: boolean
}
export const InkRenderStateCtx = React.createContext<InkRenderState | null>(null)

// =============================================================================
// ANSI detection
// =============================================================================

/** Check if a string contains ANSI escape sequences (ESC or C1 control chars). */
export function containsAnsiEscapes(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 0x1b) return true // ESC
    if (code >= 0x80 && code <= 0x9f) return true // C1 control chars
  }
  return false
}

/** Recursively check if React children contain ANSI escape sequences. */
export function childrenContainAnsi(children: React.ReactNode): boolean {
  if (typeof children === "string") return containsAnsiEscapes(children)
  if (Array.isArray(children))
    return children.some((c) => childrenContainAnsi(c as React.ReactNode))
  if (React.isValidElement(children)) {
    return childrenContainAnsi(
      (children.props as Record<string, unknown>).children as React.ReactNode,
    )
  }
  return false
}

// =============================================================================
// VS16 (variation selector) handling
// =============================================================================

/**
 * Track text-presentation emoji codepoints that the user provided WITH VS16.
 * When silvery's ensureEmojiPresentation adds VS16 to bare text-presentation
 * emojis (e.g., ✔ → ✔️), stripSilveryVS16 strips them. But when the user's
 * original text already had VS16 (e.g., 🌡️, ⚠️), we must preserve it.
 *
 * This set is populated by the Ink compat Text component before rendering,
 * and consulted by stripSilveryVS16 during buffer post-processing.
 */
export const _userVS16Codepoints = new Set<number>()

/**
 * Scan text content for text-presentation emojis that already have VS16.
 * Records their base codepoints in the module-level set so that
 * stripSilveryVS16 knows to preserve the user's VS16.
 */
export function registerUserVS16(text: string): void {
  if (!text.includes("\uFE0F")) return
  let i = 0
  while (i < text.length) {
    const cp = text.codePointAt(i)!
    const char = String.fromCodePoint(cp)
    const charLen = char.length
    if (i + charLen < text.length && text.charCodeAt(i + charLen) === 0xfe0f) {
      if (isTextPresentationEmoji(char)) {
        _userVS16Codepoints.add(cp)
      }
    }
    i += charLen
  }
}

/** Recursively scan React children for user-provided VS16 in string content. */
export function scanChildrenForVS16(children: React.ReactNode): void {
  if (typeof children === "string") {
    registerUserVS16(children)
  } else if (Array.isArray(children)) {
    for (const child of children) scanChildrenForVS16(child as React.ReactNode)
  } else if (React.isValidElement(children)) {
    scanChildrenForVS16((children.props as Record<string, unknown>).children as React.ReactNode)
  }
}

/**
 * Strip VS16 (U+FE0F) variation selectors that silvery adds to text-presentation
 * emoji characters. Silvery's ensureEmojiPresentation adds VS16 to characters that
 * are Extended_Pictographic but NOT Emoji_Presentation (e.g., ✔ U+2714, ☑ U+2611).
 *
 * Preserves VS16 for codepoints in the _userVS16Codepoints set — these had VS16
 * in the user's original text and should not be stripped.
 */
/** @internal */
export function stripSilveryVS16(input: string): string {
  // Fast path: no VS16 in the string
  if (!input.includes("\uFE0F")) return input

  // Walk through the string, removing VS16 only after text-presentation emoji
  // that did NOT have VS16 in the user's original text
  let result = ""
  let i = 0
  while (i < input.length) {
    const cp = input.codePointAt(i)!
    const char = String.fromCodePoint(cp)
    const charLen = char.length

    // Check if next position has VS16
    if (i + charLen < input.length && input.charCodeAt(i + charLen) === 0xfe0f) {
      // Only strip VS16 if the preceding char is text-presentation emoji
      // AND the user's original text did NOT have VS16 for this codepoint
      if (isTextPresentationEmoji(char)) {
        if (!_userVS16Codepoints.has(cp)) {
          // This is a text-presentation emoji that silvery decorated with VS16 — strip it
          result += char
          i += charLen + 1 // skip char + VS16
          continue
        }
      }
    }

    result += char
    i += charLen
  }
  return result
}
