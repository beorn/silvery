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
 *   <Box borderStyle="single">
 *     <Text color="$primary">Hello</Text>
 *     <Text color="$text2">world</Text>
 *   </Box>
 * </ThemeProvider>
 * ```
 */

// ============================================================================
// Theme Interface
// ============================================================================

/**
 * Semantic color token map (17 tokens + palette).
 *
 * Components reference tokens with a `$` prefix (e.g. `color="$primary"`).
 * Palette colors use `$color0` through `$color15`.
 * Tokens are resolved at render time via `resolveThemeColor`.
 */
export interface Theme {
  /** Human-readable theme name */
  name: string
  /** True if this is a dark theme (affects contrast decisions) */
  dark: boolean

  // Brand
  /** Primary brand tint — active indicators, interactive controls */
  primary: string
  /** Hyperlinks, references (derived from primary) */
  link: string
  /** Interactive chrome, input borders (derived from primary) */
  control: string

  // Selection
  /** Selection highlight background */
  selected: string
  /** Text on selected background (contrast-paired) */
  selectedfg: string
  /** Keyboard focus outline (always blue — accessibility) */
  focusring: string

  // Text
  /** Primary text — headings, body */
  text: string
  /** Secondary text — descriptions, metadata */
  text2: string
  /** Tertiary text — timestamps, hints, placeholders */
  text3: string
  /** Quaternary text — ghost text, watermarks, barely visible */
  text4: string

  // Surface
  /** Default background (detected or configured) */
  bg: string
  /** Elevated surfaces — dialogs, overlays, popovers */
  raisedbg: string
  /** Dividers, borders, rules */
  separator: string

  // Status
  /** Error/destructive — validation errors, delete actions */
  error: string
  /** Warning/caution — unsaved changes */
  warning: string
  /** Success/positive — saved confirmation, passing tests */
  success: string

  // Content palette (16 indexed colors for categorization)
  /** 16 content colors ($color0 through $color15) */
  palette: string[]
}

// ============================================================================
// ANSI 16 palette (shared by both dark and light ANSI themes)
// ============================================================================

const ansi16Palette: string[] = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "blackBright",
  "redBright",
  "greenBright",
  "yellowBright",
  "blueBright",
  "magentaBright",
  "cyanBright",
  "whiteBright",
]

// ============================================================================
// Default Themes
// ============================================================================

/** Dark ANSI 16 theme — works on any terminal. Primary = yellow. */
export const ansi16DarkTheme: Theme = {
  name: "dark-ansi16",
  dark: true,

  primary: "yellow",
  link: "blueBright",
  control: "yellow",

  selected: "yellow",
  selectedfg: "black",
  focusring: "blueBright",

  text: "whiteBright",
  text2: "white",
  text3: "gray",
  text4: "gray",

  bg: "",
  raisedbg: "black",
  separator: "gray",

  error: "redBright",
  warning: "yellow",
  success: "greenBright",

  palette: ansi16Palette,
}

/** Light ANSI 16 theme — works on any terminal. Primary = blue. */
export const ansi16LightTheme: Theme = {
  name: "light-ansi16",
  dark: false,

  primary: "blue",
  link: "blueBright",
  control: "blue",

  selected: "cyan",
  selectedfg: "black",
  focusring: "blue",

  text: "black",
  text2: "blackBright",
  text3: "gray",
  text4: "gray",

  bg: "",
  raisedbg: "white",
  separator: "gray",

  error: "red",
  warning: "yellow",
  success: "green",

  palette: ansi16Palette,
}

/** Dark truecolor theme — Nord-inspired. */
export const defaultDarkTheme: Theme = {
  name: "dark-truecolor",
  dark: true,

  primary: "#EBCB8B",
  link: "#ECCC90",
  control: "#B8A06E",

  selected: "#88C0D0",
  selectedfg: "#2E3440",
  focusring: "#5E81AC",

  text: "#ECEFF4",
  text2: "#D8DEE9",
  text3: "#7B88A1",
  text4: "#545E72",

  bg: "#2E3440",
  raisedbg: "#3B4252",
  separator: "#4C566A",

  error: "#BF616A",
  warning: "#EBCB8B",
  success: "#A3BE8C",

  palette: [
    "#2E3440",
    "#BF616A",
    "#A3BE8C",
    "#EBCB8B",
    "#5E81AC",
    "#B48EAD",
    "#88C0D0",
    "#E5E9F0",
    "#4C566A",
    "#D08770",
    "#8FBCBB",
    "#D8DEE9",
    "#81A1C1",
    "#B48EAD",
    "#8FBCBB",
    "#ECEFF4",
  ],
}

/** Light truecolor theme — clean, airy. */
export const defaultLightTheme: Theme = {
  name: "light-truecolor",
  dark: false,

  primary: "#0056B3",
  link: "#0066CC",
  control: "#3380CC",

  selected: "#B8D4E8",
  selectedfg: "#1A1A1A",
  focusring: "#0066CC",

  text: "#1A1A1A",
  text2: "#4A4A4A",
  text3: "#8A8A8A",
  text4: "#B0B0B0",

  bg: "#FFFFFF",
  raisedbg: "#F5F5F5",
  separator: "#E0E0E0",

  error: "#D32F2F",
  warning: "#F57C00",
  success: "#388E3C",

  palette: [
    "#1A1A1A",
    "#D32F2F",
    "#388E3C",
    "#F57C00",
    "#1976D2",
    "#7B1FA2",
    "#0097A7",
    "#757575",
    "#424242",
    "#E53935",
    "#43A047",
    "#FB8C00",
    "#1E88E5",
    "#8E24AA",
    "#00ACC1",
    "#BDBDBD",
  ],
}

/** All built-in themes, indexed by name (includes backward-compat aliases). */
export const builtinThemes: Record<string, Theme> = {
  // New canonical names
  "dark-ansi16": ansi16DarkTheme,
  "light-ansi16": ansi16LightTheme,
  "dark-truecolor": defaultDarkTheme,
  "light-truecolor": defaultLightTheme,
  // Old names as aliases
  dark: defaultDarkTheme,
  light: defaultLightTheme,
  "ansi16-dark": ansi16DarkTheme,
  "ansi16-light": ansi16LightTheme,
}

/** Resolve a theme by name (for env var / CLI selection). Defaults to dark-ansi16. */
export function getThemeByName(name?: string): Theme {
  if (!name) return ansi16DarkTheme
  return builtinThemes[name] ?? ansi16DarkTheme
}

// ============================================================================
// Token Resolution
// ============================================================================

/** Color-typed keys of Theme (excludes metadata and palette). */
type ThemeColorKey = Exclude<keyof Theme, "name" | "dark" | "palette">

/** Backward-compat aliases: old token name → new token name. */
const tokenAliases: Record<string, ThemeColorKey> = {
  accent: "primary",
  muted: "text2",
  surface: "raisedbg",
  background: "bg",
  border: "separator",
}

/**
 * Resolve a color value — if it starts with `$`, look up the token in the theme.
 *
 * Supports:
 * - Named tokens: `$primary`, `$text2`, `$separator`, etc.
 * - Palette colors: `$color0` through `$color15`
 * - Backward-compat aliases: `$accent` → `$primary`, `$muted` → `$text2`,
 *   `$surface` → `$raisedbg`, `$background` → `$bg`, `$border` → `$separator`
 *
 * Returns `undefined` for `undefined` input. Non-`$` strings pass through unchanged.
 * Unknown tokens (e.g. `$nonexistent`) pass through as-is so downstream can
 * decide how to handle them.
 */
export function resolveThemeColor(color: string | undefined, theme: Theme): string | undefined {
  if (!color) return undefined
  if (!color.startsWith("$")) return color

  const token = color.slice(1)

  // Palette colors: $color0 through $color15
  if (token.startsWith("color")) {
    const idx = parseInt(token.slice(5), 10)
    if (idx >= 0 && idx < 16 && theme.palette && idx < theme.palette.length) {
      return theme.palette[idx]
    }
  }

  // Check backward-compat aliases first
  const aliased = tokenAliases[token]
  if (aliased) {
    const val = theme[aliased]
    return typeof val === "string" ? val : color
  }

  // Direct token lookup
  const key = token as ThemeColorKey
  const val = theme[key]
  return typeof val === "string" ? val : color
}

// ============================================================================
// Theme Generation
// ============================================================================

/** Supported primary colors for ANSI 16 theme generation. */
export type AnsiPrimary = "yellow" | "cyan" | "magenta" | "green" | "red" | "blue" | "white"

/** Bright variant lookup for ANSI primary colors. */
const brightVariant: Record<AnsiPrimary, string> = {
  yellow: "yellowBright",
  cyan: "cyanBright",
  magenta: "magentaBright",
  green: "greenBright",
  red: "redBright",
  blue: "blueBright",
  white: "whiteBright",
}

/** Warm primaries get cyan selection; cool primaries get yellow. */
const warmPrimaries = new Set<AnsiPrimary>(["yellow", "red", "magenta", "green", "white"])

/**
 * Generate a complete ANSI 16 theme from a primary color + dark/light preference.
 *
 * All derivation rules follow the spec in docs/design/theme-system-v2.md.
 */
export function generateTheme(primary: AnsiPrimary, dark: boolean): Theme {
  return {
    name: `${dark ? "dark" : "light"}-${primary}`,
    dark,

    primary,
    link: "blueBright",
    control: primary,

    selected: primary,
    selectedfg: "black",
    focusring: dark ? "blueBright" : "blue",

    text: dark ? "whiteBright" : "black",
    text2: dark ? "white" : "blackBright",
    text3: "gray",
    text4: "gray",

    bg: "",
    raisedbg: dark ? "black" : "white",
    separator: "gray",

    error: dark ? "redBright" : "red",
    warning: primary,
    success: dark ? "greenBright" : "green",

    palette: ansi16Palette,
  }
}

// ============================================================================
// Active Theme (module-level for pipeline access)
// ============================================================================

/**
 * The currently active theme, set by ThemeProvider during render.
 * Used by parseColor() to resolve $token strings without React context access.
 */
let _activeTheme: Theme = ansi16DarkTheme

/** Set the active theme (called by ThemeProvider). */
export function setActiveTheme(theme: Theme): void {
  _activeTheme = theme
}

/** Get the active theme (called by parseColor in render-helpers). */
export function getActiveTheme(): Theme {
  return _activeTheme
}
