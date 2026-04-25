/**
 * Theme validation — checks that all required semantic tokens are present.
 *
 * Complements validateColorScheme() which validates the lower-level
 * ColorScheme. This validates the derived Theme object.
 */

/**
 * Required semantic token keys on Theme (excludes `name` and `palette`).
 *
 * Sterling owns selection / inverse / link styling via flat tokens
 * (`bg-selected`, `fg-on-selected`, `bg-inverse`, `fg-on-inverse`, `fg-link`)
 * baked in by `inlineSterlingTokens`. The legacy single-hex aliases
 * (`selection`, `selectionbg`, `inverse`, `inversebg`, `link`) were removed
 * in 0.21.0 (sterling-purge-legacy-tokens).
 */
export const THEME_TOKEN_KEYS: readonly string[] = [
  // Root pair
  "bg",
  "fg",
  // Surface pairs (base = text, *bg = background)
  "muted",
  "mutedbg",
  "surface",
  "surfacebg",
  "popover",
  "popoverbg",
  "cursor",
  "cursorbg",
  // 7 accent pairs (base = area bg, *fg = text on area)
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
  // Standalone tokens
  "border",
  "inputborder",
  "focusborder",
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
