/**
 * ThemeContext — delivers a Theme to the component tree.
 *
 * Wrap your app (or a subtree) in `<ThemeProvider theme={…}>` to make
 * `$token` color props resolve against that theme. Components call
 * `useTheme()` to read the current theme.
 *
 * @example
 * ```tsx
 * import { ThemeProvider, defaultDarkTheme } from 'inkx'
 *
 * <ThemeProvider theme={defaultDarkTheme}>
 *   <App />
 * </ThemeProvider>
 * ```
 */

import React, { createContext, useContext } from "react"
import { defaultDarkTheme, type Theme } from "../theme-defs.js"

// ============================================================================
// Context
// ============================================================================

const ThemeContext = createContext<Theme>(defaultDarkTheme)

// ============================================================================
// Provider
// ============================================================================

export interface ThemeProviderProps {
  theme: Theme
  children: React.ReactNode
}

/**
 * Provide a theme to the subtree.
 *
 * Components beneath this provider can use `useTheme()` or `$token`
 * color props (e.g. `color="$primary"`).
 */
export function ThemeProvider({ theme, children }: ThemeProviderProps): React.ReactElement {
  return React.createElement(ThemeContext.Provider, { value: theme }, children)
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Read the current theme from context.
 *
 * Returns `defaultDarkTheme` when no `ThemeProvider` is present.
 */
export function useTheme(): Theme {
  return useContext(ThemeContext)
}
