/**
 * ThemeProvider with automatic fg color inheritance.
 *
 * Wraps the base ThemeProvider from @silvery/theme with a Box that sets
 * `color="$fg"`, so all text in the subtree inherits the theme's foreground.
 * Without this, text in a themed subtree uses the terminal's default fg,
 * which breaks when the theme differs from the terminal (e.g., light theme
 * in a dark terminal).
 *
 * The `root` prop (default: true) controls whether the wrapper Box is rendered.
 * Set `root={false}` for test environments or nested ThemeProviders where an
 * extra flex container would interfere with layout.
 */

import React from "react"
import { ThemeProvider as BaseThemeProvider } from "@silvery/theme/ThemeContext"
import type { ThemeProviderProps } from "@silvery/theme/ThemeContext"
import { Box } from "./components/Box"

export function ThemeProvider({ theme, children, root = true }: ThemeProviderProps): React.ReactElement {
  if (!root) {
    return <BaseThemeProvider theme={theme}>{children}</BaseThemeProvider>
  }
  return (
    <BaseThemeProvider theme={theme}>
      <Box color="$fg" backgroundColor="$bg" flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </BaseThemeProvider>
  )
}
