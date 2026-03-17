/**
 * ThemeProvider — delivers a Theme to the component tree.
 *
 * Sets React context (useTheme()) so components can read the active theme.
 * For $token resolution in the render pipeline, use `color="$fg"` and
 * `backgroundColor="$bg"` on your root Box alongside `theme={theme}`:
 *
 * ```tsx
 * <ThemeProvider theme={lightTheme}>
 *   <Box theme={lightTheme} color="$fg" backgroundColor="$bg">
 *     <Text color="$primary">Uses light theme</Text>
 *   </Box>
 * </ThemeProvider>
 * ```
 *
 * For the root app where the theme matches the terminal, no Box props needed:
 * ```tsx
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
