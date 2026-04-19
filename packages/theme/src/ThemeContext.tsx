/**
 * ThemeContext — delivers a Theme to the component tree.
 *
 * Wrap your app (or a subtree) in `<ThemeProvider theme={…}>` to make
 * `$token` color props resolve against that theme. Components call
 * `useTheme()` to read the current theme.
 *
 * @example
 * ```tsx
 * import { ThemeProvider, defaultDarkTheme } from '@silvery/ag-react'
 *
 * <ThemeProvider theme={defaultDarkTheme}>
 *   <App />
 * </ThemeProvider>
 * ```
 */

import React, { createContext, useContext } from "react"
import type { Theme } from "@silvery/ansi"
import { defaultDarkTheme } from "./schemes/index"

// ============================================================================
// Context
// ============================================================================

/** @internal Exported for @silvery/ag-react ThemeProvider — not public API. */
export const ThemeContext = createContext<Theme>(defaultDarkTheme)

// ============================================================================
// Provider
// ============================================================================

export interface ThemeProviderProps {
  theme: Theme
  children: React.ReactNode
}

/**
 * Provide a theme to the subtree via React context only.
 *
 * Components beneath this provider can use `useTheme()` or `$token`
 * color props (e.g. `color="$primary"`).
 *
 * For pipeline $token resolution, use the `ThemeProvider` from `@silvery/ag-react`
 * instead — it also attaches the theme to the AgNode tree via a Box wrapper,
 * enabling the render phase to resolve tokens without a module-level global.
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
