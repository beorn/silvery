/**
 * inkx/theme -- Theming system with semantic color tokens.
 *
 * ```tsx
 * import { ThemeProvider, useTheme, defaultDarkTheme } from 'inkx/theme'
 *
 * <ThemeProvider theme={defaultDarkTheme}>
 *   <Box borderColor="$border">
 *     <Text color="$primary">Hello</Text>
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

export { defaultDarkTheme, defaultLightTheme, resolveThemeColor } from "./theme-defs.js"
export type { Theme } from "./theme-defs.js"
