/**
 * ReactiveThemeProvider — auto-switches theme based on terminal color scheme.
 *
 * Wraps ThemeProvider and subscribes to the BgModeDetector (Mode 2031).
 * When the terminal reports a dark↔light change, the theme automatically
 * switches to the corresponding variant.
 *
 * @example
 * ```tsx
 * import { ReactiveThemeProvider } from '@silvery/ag-react'
 * import { nord, catppuccinLatte } from '@silvery/theme'
 *
 * <ReactiveThemeProvider dark={nordTheme} light={latteTheme}>
 *   <App />
 * </ReactiveThemeProvider>
 * ```
 *
 * When no color scheme is detected (unknown), falls back to the `dark` theme.
 */

import React from "react"
import { ThemeProvider } from "./ThemeProvider"
import { useColorScheme } from "./hooks/useColorScheme"
import type { Theme } from "@silvery/theme/types"
import { defaultDarkTheme, defaultLightTheme } from "@silvery/theme"

export interface ReactiveThemeProviderProps {
  /** Theme to use when the terminal is in dark mode. Default: Nord. */
  dark?: Theme
  /** Theme to use when the terminal is in light mode. Default: Catppuccin Latte. */
  light?: Theme
  /** Initial theme to use before detection completes. Default: dark theme. */
  initial?: Theme
  children: React.ReactNode
}

/**
 * Inner component that subscribes to color scheme changes.
 * Separated so ThemeProvider re-renders only when scheme actually changes.
 */
function ReactiveThemeInner({
  dark = defaultDarkTheme,
  light = defaultLightTheme,
  initial,
  children,
}: ReactiveThemeProviderProps): React.ReactElement {
  const scheme = useColorScheme()

  let theme: Theme
  if (scheme === "light") {
    theme = light
  } else if (scheme === "dark") {
    theme = dark
  } else {
    // "unknown" — use initial or fall back to dark
    theme = initial ?? dark
  }

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}

/**
 * Theme provider that reacts to Mode 2031 color scheme changes.
 *
 * Automatically switches between dark and light themes when the terminal
 * reports a scheme change. Uses `useColorScheme()` internally.
 */
export function ReactiveThemeProvider(props: ReactiveThemeProviderProps): React.ReactElement {
  return <ReactiveThemeInner {...props} />
}
