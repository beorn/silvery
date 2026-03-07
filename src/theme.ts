/**
 * hightea/theme -- Theming system with semantic color tokens.
 *
 * ```tsx
 * import { ThemeProvider, useTheme, defaultDarkTheme } from '@hightea/term/theme'
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

export { ThemeProvider, useTheme } from "./contexts/ThemeContext.js"
export type { ThemeProviderProps } from "./contexts/ThemeContext.js"

export {
  defaultDarkTheme,
  defaultLightTheme,
  ansi16DarkTheme,
  ansi16LightTheme,
  builtinThemes,
  getThemeByName,
  resolveThemeColor,
  generateTheme,
  detectTheme,
  deriveTheme,
} from "swatch"
export type { Theme, ColorPalette, AnsiPrimary, DetectThemeOptions } from "swatch"
