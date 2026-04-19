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

import { createContext, useContext } from "react"
import type { Theme, ActiveScheme } from "@silvery/ansi"
import { defaultDarkTheme } from "@silvery/theme/schemes"

// ============================================================================
// Context
// ============================================================================

/** @internal Exported for ThemeProvider and Text component — not public API. */
export const ThemeContext = createContext<Theme>(defaultDarkTheme)

/**
 * Context that carries scheme detection metadata (name, source, confidence).
 *
 * Separate from ThemeContext because scheme metadata is orthogonal to the
 * theme token bag. Populated by `<ThemeProvider scheme={...}>` when the
 * caller passes detection provenance (e.g. from `runThemed`). Null when
 * no scheme metadata was injected.
 *
 * @internal Exported for ThemeProvider.
 */
export const ActiveSchemeContext = createContext<ActiveScheme | null>(null)

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
