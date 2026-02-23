/**
 * Inkx Theme System
 *
 * Provides semantic color tokens that components can reference with $token syntax.
 * Themes are delivered via React context (ThemeContext) and resolved at the
 * component level — no reconciler or layout engine changes required.
 *
 * @example
 * ```tsx
 * import { ThemeProvider, defaultDarkTheme, Box, Text } from 'inkx'
 *
 * <ThemeProvider theme={defaultDarkTheme}>
 *   <Box borderColor="$border">
 *     <Text color="$primary">Hello</Text>
 *     <Text color="$muted">world</Text>
 *   </Box>
 * </ThemeProvider>
 * ```
 */

// ============================================================================
// Theme Interface
// ============================================================================

/**
 * Semantic color token map.
 *
 * Components reference tokens with a `$` prefix (e.g. `color="$primary"`).
 * Tokens are resolved at render time via `resolveThemeColor`.
 */
export interface Theme {
  // Semantic color tokens
  /** Primary accent — links, active indicators, interactive highlights */
  primary: string
  /** Secondary accent — tags, badges, decorative elements */
  accent: string
  /** Error/destructive — validation errors, delete actions */
  error: string
  /** Warning/caution — unsaved changes, deprecation notices */
  warning: string
  /** Success/positive — saved confirmation, passing tests */
  success: string
  /** UI panel backgrounds — cards, sidebars, modals */
  surface: string
  /** App background — outermost fill */
  background: string
  /** Primary text — body copy, headings */
  text: string
  /** Secondary/dim text — placeholders, timestamps, hints */
  muted: string
  /** Border color — dividers, outlines, separators */
  border: string

  // Metadata
  /** Human-readable theme name */
  name: string
  /** True if this is a dark theme (affects contrast decisions) */
  dark: boolean
}

// ============================================================================
// Default Themes
// ============================================================================

/** Nord-inspired dark theme. */
export const defaultDarkTheme: Theme = {
  name: "dark",
  dark: true,
  primary: "#88C0D0", // Nord frost blue
  accent: "#B48EAD", // Nord purple
  error: "#BF616A", // Nord red
  warning: "#EBCB8B", // Nord yellow
  success: "#A3BE8C", // Nord green
  surface: "#3B4252", // Nord polar night
  background: "#2E3440", // Nord darker
  text: "#ECEFF4", // Nord snow
  muted: "#6C7A96", // Nord muted
  border: "#4C566A", // Nord border
}

/** Nord-inspired light theme. */
export const defaultLightTheme: Theme = {
  name: "light",
  dark: false,
  primary: "#5E81AC",
  accent: "#B48EAD",
  error: "#BF616A",
  warning: "#D08770",
  success: "#A3BE8C",
  surface: "#ECEFF4",
  background: "#FFFFFF",
  text: "#2E3440",
  muted: "#7B88A1",
  border: "#D8DEE9",
}

// ============================================================================
// Token Resolution
// ============================================================================

/** Color-typed keys of Theme (excludes `name` and `dark`). */
type ThemeColorKey = Exclude<keyof Theme, "name" | "dark">

/**
 * Resolve a color value — if it starts with `$`, look up the token in the theme.
 *
 * Returns `undefined` for `undefined` input. Non-`$` strings pass through unchanged.
 * Unknown tokens (e.g. `$nonexistent`) pass through as-is so downstream can
 * decide how to handle them.
 */
export function resolveThemeColor(color: string | undefined, theme: Theme): string | undefined {
  if (!color) return undefined
  if (!color.startsWith("$")) return color
  const token = color.slice(1) as ThemeColorKey
  const val = theme[token]
  return typeof val === "string" ? val : color
}
