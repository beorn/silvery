/**
 * ThemeProvider — delivers a Theme to the React component tree.
 *
 * Sets React context so `useTheme()` returns the active theme.
 * For pipeline $token resolution and automatic fg/bg, use `Box theme={}`:
 *
 * ```tsx
 * // Themed subtree — Box theme handles fg, bg, and $tokens automatically
 * <Box theme={lightTheme} borderStyle="single">
 *   <Text color="$primary">Uses light theme</Text>
 * </Box>
 *
 * // Root app — ThemeProvider for useTheme(), terminal matches detected theme
 * <ThemeProvider theme={detectedTheme}>
 *   <App />
 * </ThemeProvider>
 * ```
 */

import React from "react"
import { ThemeContext } from "@silvery/theme/ThemeContext"
import type { Theme } from "@silvery/theme/types"

export interface ThemeProviderProps {
  theme: Theme
  children: React.ReactNode
}

export function ThemeProvider({ theme, children }: ThemeProviderProps): React.ReactElement {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}
