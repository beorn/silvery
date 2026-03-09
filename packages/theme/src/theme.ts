/**
 * silvery/theme -- Theming system with semantic color tokens.
 *
 * ```tsx
 * import { ThemeProvider, useTheme, defaultDarkTheme } from '@silvery/theme'
 *
 * <ThemeProvider theme={defaultDarkTheme}>
 *   <Box borderStyle="single">
 *     <Text color="$primary">Hello</Text>
 *     <Text color="$muted-fg">world</Text>
 *   </Box>
 * </ThemeProvider>
 * ```
 *
 * Any color prop starting with `$` resolves against the active theme.
 * Without a ThemeProvider, `defaultDarkTheme` is used.
 *
 * @packageDocumentation
 */

export { ThemeProvider, useTheme } from "./ThemeContext"
export type { ThemeProviderProps } from "./ThemeContext"

export {
  defaultDarkTheme,
  defaultLightTheme,
  ansi16DarkTheme,
  ansi16LightTheme,
  builtinThemes,
  getThemeByName,
  getActiveTheme,
  setActiveTheme,
  pushContextTheme,
  popContextTheme,
  resolveThemeColor,
  generateTheme,
  detectTheme,
  deriveTheme,
} from "swatch"
export type { Theme, ColorPalette, AnsiPrimary, DetectThemeOptions } from "swatch"
