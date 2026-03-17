/**
 * Chainable theme builder — create themes from minimal input.
 *
 * @example
 * ```typescript
 * // Just a background color
 * const theme = createTheme().bg('#2E3440').build()
 *
 * // Primary + explicit dark mode
 * const theme = createTheme().primary('#EBCB8B').dark().build()
 *
 * // Three-color input (dark/light inferred from bg luminance)
 * const theme = createTheme()
 *   .bg('#2E3440').fg('#ECEFF4').primary('#EBCB8B').build()
 *
 * // Preset with override
 * const theme = createTheme().preset('nord').primary('#A3BE8C').build()
 * ```
 */

import { hexToRgb } from "./color"
import { deriveTheme } from "./derive"
import { fromColors, assignPrimaryToSlot } from "./generators"
import { getPaletteByName } from "./palettes/index"
import type { Theme, ColorPalette, HueName } from "./types"

// ============================================================================
// Luminance
// ============================================================================

function isDarkColor(hex: string): boolean {
  const rgb = hexToRgb(hex)
  if (!rgb) return true
  return (rgb[0] + rgb[1] + rgb[2]) / (255 * 3) < 0.5
}

// ============================================================================
// Builder
// ============================================================================

interface ThemeBuilderState {
  dark?: boolean
  bgColor?: string
  fgColor?: string
  primaryColor?: string
  colors: Partial<ColorPalette>
  presetPalette?: ColorPalette
}

export interface ThemeBuilder {
  /** Set background color. */
  bg(color: string): ThemeBuilder
  /** Set foreground color. */
  fg(color: string): ThemeBuilder
  /** Set primary accent color. */
  primary(color: string): ThemeBuilder
  /** Alias for `.primary()`. */
  accent(color: string): ThemeBuilder
  /** Force dark mode. */
  dark(): ThemeBuilder
  /** Force light mode. */
  light(): ThemeBuilder
  /** Set any palette color by name. */
  color(name: keyof Omit<ColorPalette, "name" | "dark">, value: string): ThemeBuilder
  /** Set full palette at once. */
  palette(p: ColorPalette): ThemeBuilder
  /** Load a built-in palette by name. */
  preset(name: string): ThemeBuilder
  /** Derive the final Theme from accumulated state. */
  build(): Theme
}

/** Create a chainable theme builder. */
export function createTheme(): ThemeBuilder {
  const state: ThemeBuilderState = { colors: {} }

  const builder: ThemeBuilder = {
    bg(color) {
      state.bgColor = color
      return builder
    },
    fg(color) {
      state.fgColor = color
      return builder
    },
    primary(color) {
      state.primaryColor = color
      return builder
    },
    accent(color) {
      return builder.primary(color)
    },
    dark() {
      state.dark = true
      return builder
    },
    light() {
      state.dark = false
      return builder
    },
    color(name, value) {
      ;(state.colors as Record<string, string>)[name] = value
      return builder
    },
    palette(p) {
      state.presetPalette = p
      return builder
    },
    preset(name) {
      const p = getPaletteByName(name)
      if (p) state.presetPalette = p
      return builder
    },

    build(): Theme {
      const isDark = state.dark ?? (state.bgColor ? isDarkColor(state.bgColor) : true)

      let palette: ColorPalette

      if (state.presetPalette) {
        // Start from preset, apply overrides
        palette = { ...state.presetPalette }
        if (state.bgColor) palette.background = state.bgColor
        if (state.fgColor) palette.foreground = state.fgColor
        if (state.primaryColor) {
          // Set semantic primary seed so deriveTheme() uses it
          palette.primary = state.primaryColor
          // Also place in the appropriate ANSI slot for accent derivation
          const slot = assignPrimaryToSlot(state.primaryColor)
          const ansiName = hueToAnsiField(slot)
          ;(palette as unknown as Record<string, string>)[ansiName] = state.primaryColor
        }
        palette.dark = isDark
      } else {
        // Generate from minimal input
        palette = fromColors({
          background: state.bgColor,
          foreground: state.fgColor,
          primary: state.primaryColor,
          dark: isDark,
        })
      }

      // Apply explicit color overrides
      for (const [key, val] of Object.entries(state.colors)) {
        if (val !== undefined && typeof val === "string") (palette as unknown as Record<string, string>)[key] = val
      }

      return deriveTheme(palette)
    },
  }

  return builder
}

/** Map a HueName to the corresponding ColorPalette field. */
function hueToAnsiField(hue: HueName): keyof ColorPalette {
  const map: Record<HueName, keyof ColorPalette> = {
    red: "red",
    orange: "brightRed",
    yellow: "yellow",
    green: "green",
    teal: "cyan",
    blue: "blue",
    purple: "magenta",
    pink: "brightMagenta",
  }
  return map[hue]
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick theme from a primary color or color name.
 *
 * @example
 * ```typescript
 * quickTheme('#EBCB8B', 'dark')  // yellow primary, dark mode
 * quickTheme('blue')              // blue primary, default dark
 * ```
 */
export function quickTheme(primaryOrHex: string, mode?: "dark" | "light"): Theme {
  const b = createTheme()
  if (primaryOrHex.startsWith("#")) {
    b.primary(primaryOrHex)
  } else {
    const namedColors: Record<string, string> = {
      red: "#BF616A",
      orange: "#D08770",
      yellow: "#EBCB8B",
      green: "#A3BE8C",
      teal: "#88C0D0",
      cyan: "#88C0D0",
      blue: "#5E81AC",
      purple: "#B48EAD",
      pink: "#D4879C",
      magenta: "#B48EAD",
      white: "#ECEFF4",
    }
    b.primary(namedColors[primaryOrHex] ?? "#5E81AC")
  }
  if (mode === "dark") b.dark()
  else if (mode === "light") b.light()
  return b.build()
}

/**
 * Create a theme from a built-in preset name.
 *
 * @example
 * ```typescript
 * presetTheme('catppuccin-mocha')
 * presetTheme('nord')
 * ```
 */
export function presetTheme(name: string): Theme {
  return createTheme().preset(name).build()
}
