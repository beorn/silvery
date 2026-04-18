/**
 * ThemeProvider — delivers a Theme to the React component tree.
 *
 * Sets React context so `useTheme()` returns the active theme. Supports two
 * prop forms for progressive disclosure:
 *
 * ```tsx
 * // v2 API (preferred) — sparse or full token bag, merged over defaults
 * <ThemeProvider tokens={{ primary: "#5B8DEF", "priority-p0": "#FF5555" }}>
 *   <App />
 * </ThemeProvider>
 *
 * // Legacy API — pass a full, pre-derived Theme (backwards compatible)
 * <ThemeProvider theme={detectedTheme}>
 *   <App />
 * </ThemeProvider>
 * ```
 *
 * The `tokens` prop accepts a partial or full token bag. Sparse bags merge
 * over the app's base theme (from context or defaults); full bags replace it.
 * Either way, the merged result becomes the active theme for `useTheme()` and
 * `$token` resolution.
 *
 * The legacy `theme` prop still works and is equivalent to passing the whole
 * theme object as `tokens`. Passing both is an error (developer typo).
 *
 * For pipeline $token resolution and automatic fg/bg within a subtree, use
 * `<Box theme={}>` (unchanged).
 */

import React, { useContext, useMemo } from "react"
import { ThemeContext } from "@silvery/theme/ThemeContext"
import type { Theme } from "@silvery/theme/types"

/** Partial token bag — merged over the base theme. Accepts any Theme key, custom $tokens via app-defined keys, or a full Theme. */
export type ThemeTokens = Partial<Theme> | (Partial<Theme> & Record<string, string | string[] | undefined>) | Theme

export interface ThemeProviderProps {
  /**
   * v2 API — a partial or full token bag. Merged over the inherited theme
   * (or default-dark/light if none). App-specific tokens (`"priority-p0"`,
   * `"my-app-brand"`) live in the same bag as standard tokens.
   */
  tokens?: ThemeTokens
  /**
   * Legacy API — a full, pre-derived Theme. Equivalent to passing the
   * whole object as `tokens`. Prefer `tokens` for new code.
   */
  theme?: Theme
  children: React.ReactNode
}

export function ThemeProvider({ tokens, theme, children }: ThemeProviderProps): React.ReactElement {
  const parent = useContext(ThemeContext)
  const merged = useMemo(() => {
    if (tokens && theme) {
      throw new Error(
        "ThemeProvider: pass either `tokens` or `theme`, not both. `theme` is the legacy API; prefer `tokens`.",
      )
    }
    if (theme) return theme
    if (!tokens) return parent
    // Sparse merge: parent theme (or empty) + tokens override.
    return { ...parent, ...tokens } as Theme
  }, [tokens, theme, parent])
  return <ThemeContext.Provider value={merged}>{children}</ThemeContext.Provider>
}
