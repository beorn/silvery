/**
 * Theme validation — checks that all required semantic tokens are present.
 *
 * Complements validateColorPalette() which validates the lower-level
 * ColorPalette. This validates the derived Theme object.
 */

/** All 33 required semantic token keys on Theme (excludes `name` and `palette`). */
export const THEME_TOKEN_KEYS: readonly string[] = [
  // 14 pairs (28 tokens)
  "bg",
  "fg",
  "surface",
  "surfacefg",
  "popover",
  "popoverfg",
  "muted",
  "mutedfg",
  "primary",
  "primaryfg",
  "secondary",
  "secondaryfg",
  "accent",
  "accentfg",
  "error",
  "errorfg",
  "warning",
  "warningfg",
  "success",
  "successfg",
  "info",
  "infofg",
  "selection",
  "selectionfg",
  "inverse",
  "inversefg",
  "cursor",
  "cursorfg",
  // 5 standalone tokens
  "border",
  "inputborder",
  "focusborder",
  "link",
  "disabledfg",
] as const

/** Result of theme validation. */
export interface ThemeValidationResult {
  /** Whether the theme has all required tokens. */
  valid: boolean
  /** Token keys that are required but missing or empty. */
  missing: string[]
  /** Token keys that exist on the object but are not recognized theme tokens. */
  extra: string[]
}

/** All recognized keys on Theme (tokens + metadata). */
const ALL_KNOWN_KEYS = new Set([...THEME_TOKEN_KEYS, "name", "palette"])

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
