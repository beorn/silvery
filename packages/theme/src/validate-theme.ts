/**
 * Theme validation — checks that all required semantic tokens are present.
 *
 * Complements validateColorScheme() which validates the lower-level
 * ColorScheme. This validates the derived Theme object.
 */

/**
 * Required semantic token keys on Theme (excludes `name` and `palette`).
 *
 * Sterling owns all semantic styling through its frozen nested roles and
 * canonical flat tokens. Validation must recognize that exact factory output,
 * rather than looking for retired single-hex aliases.
 */
import { STERLING_FLAT_TOKENS } from "@silvery/ansi"

export const THEME_TOKEN_KEYS = ["bg", "fg", ...STERLING_FLAT_TOKENS] as const

/** Result of theme validation. */
export interface ThemeValidationResult {
  /** Whether the theme has all required tokens. */
  valid: boolean
  /** Token keys that are required but missing or empty. */
  missing: string[]
  /** Token keys that exist on the object but are not recognized theme tokens. */
  extra: string[]
}

/** All recognized keys on a frozen canonical Theme (tokens + nested form + metadata). */
const ALL_KNOWN_KEYS = new Set([
  ...THEME_TOKEN_KEYS,
  "name",
  "mode",
  "palette",
  "variants",
  "derivationTrace",
  "accent",
  "info",
  "success",
  "warning",
  "error",
  "muted",
  "faint",
  "surface",
  "border",
  "cursor",
  "selected",
  "inverse",
  "link",
  "disabled",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
])

/**
 * Validate a Theme object — check that all required tokens are present.
 *
 * @param theme - The theme object to validate
 * @returns Validation result with missing and extra token lists
 *
 * @example
 * ```typescript
 * const result = validateTheme(myTheme)
 * if (!result.valid) {
 *   console.log("Missing tokens:", result.missing)
 * }
 * ```
 */
export function validateTheme(theme: Record<string, unknown>): ThemeValidationResult {
  const missing: string[] = []
  const extra: string[] = []

  // Check for missing or empty required tokens
  for (const key of THEME_TOKEN_KEYS) {
    const val = theme[key]
    if (val === undefined || val === null || val === "") {
      missing.push(key)
    }
  }

  // Check for unrecognized keys (exclude prototype properties)
  for (const key of Object.keys(theme)) {
    if (!ALL_KNOWN_KEYS.has(key)) {
      extra.push(key)
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    extra,
  }
}
