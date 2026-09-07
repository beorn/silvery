/**
 * ThemeProvider — delivers a Theme to the React component tree.
 *
 * Sets React context so `useTheme()` returns the active theme. Supports two
 * prop forms for progressive disclosure:
 *
 * ```tsx
 * // v2 API (preferred) — sparse or full token bag, merged over defaults
 * <ThemeProvider tokens={{ "fg-accent": "#5B8DEF", "priority-p0": "#FF5555" }}>
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
 * The `variants` sub-object is deep-merged — passing
 * `tokens={{ variants: { hero: {...} } }}` adds to (not replaces) the
 * existing variants map from the inherited theme.
 *
 * The legacy `theme` prop still works and is equivalent to passing the whole
 * theme object as `tokens`. Passing both is an error (developer typo).
 *
 * Pipeline $token resolution uses the same `theme` prop on the inner Box —
 * no separate `<Box theme={}>` wrapper needed. Nested ThemeProviders each
 * scope their own Box, so inner themes never bleed into outer subtrees.
 *
 * The inner Box uses `flexGrow={1} flexShrink={1} alignSelf="stretch"` so it
 * fills its parent (critical when children use `position="absolute"` — without
 * these, an all-absolute child tree gives the Box zero content height, which
 * propagates null height to the root layout node and crashes the render phase).
 */

import React, { useContext, useMemo } from "react"
import { ThemeContext, ActiveSchemeContext } from "./ThemeContext"
import {
  bakeFlat,
  defaultFlattenRule,
  resolveThemeColor,
  sterlingMergePartial,
  type Theme,
  type ActiveScheme,
} from "@silvery/ansi"
import { Box } from "./components/Box"

/** Partial token bag — merged over the base theme. Accepts any Theme key, custom $tokens via app-defined keys, or a full Theme. */
export type ThemeTokens =
  | Partial<Theme>
  | (Partial<Theme> & Record<string, string | string[] | undefined>)
  | Theme

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
  /**
   * Optional scheme detection metadata. When provided, makes
   * `useActiveScheme()` return this object for all descendants. Populated
   * automatically by `runThemed()`. Omitting it leaves any parent
   * ActiveSchemeContext unchanged (may be null).
   */
  scheme?: ActiveScheme
  children: React.ReactNode
}

/**
 * Reflect canonical flat-token overrides onto their nested source leaves.
 *
 * `bakeFlat` owns the forward projection and freezes the result. This small
 * inverse walk only identifies the existing nested leaf for a supplied flat
 * key; it neither reconstructs a ColorScheme nor derives colors, so overlays
 * cannot become a second theme authority.
 */
function applyFlatOverrides(
  node: Record<string, unknown>,
  overrides: Record<string, unknown>,
  path: readonly string[] = [],
  isRoot = true,
): Record<string, unknown> {
  let out = node
  for (const [key, value] of Object.entries(node)) {
    // Root-level hyphen keys are prior projections. Their nested source wins
    // when `bakeFlat` writes a fresh canonical projection below.
    if (isRoot && key.includes("-")) continue
    const nextPath = [...path, key]
    if (typeof value === "string") {
      const flat = defaultFlattenRule(nextPath)
      const override = flat === null ? undefined : overrides[flat]
      if (typeof override === "string" && override !== value) {
        if (out === node) out = { ...node }
        out[key] = override
      }
      continue
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const next = applyFlatOverrides(value as Record<string, unknown>, overrides, nextPath, false)
      if (next !== value) {
        if (out === node) out = { ...node }
        out[key] = next
      }
    }
  }
  return out
}

function mergeThemeTokens(parent: Theme, tokens: ThemeTokens): Theme {
  // A string in place of a nested canonical role is the retired Theme shape.
  // Ask the shared token resolver to reject it with its channel-aware cure,
  // rather than merging a raw field into the otherwise canonical Theme.
  for (const [key, value] of Object.entries(tokens)) {
    if (typeof value === "string" && !key.includes("-")) {
      resolveThemeColor(`$${key}`, parent)
    }
  }
  // mergePartial builds a new overlay; it never mutates the frozen parent.
  const merged = sterlingMergePartial(parent, tokens as never) as unknown as Record<string, unknown>
  const projected = applyFlatOverrides(merged, tokens as Record<string, unknown>)
  // Rebuild canonical flats from their nested source and freeze both forms.
  // App-defined flat custom tokens are preserved because bakeFlat skips root
  // hyphen keys that are not produced by the standard projection rule.
  // `projected` is structurally open for app tokens; `bakeFlat` restores the
  // complete, frozen Sterling flat projection before it reaches context.
  return bakeFlat(projected) as unknown as Theme
}

export function ThemeProvider({
  tokens,
  theme,
  scheme,
  children,
}: ThemeProviderProps): React.ReactElement {
  const parent = useContext(ThemeContext)
  const merged = useMemo(() => {
    if (tokens && theme) {
      throw new Error(
        "ThemeProvider: pass either `tokens` or `theme`, not both. `theme` is the legacy API; prefer `tokens`.",
      )
    }
    if (theme) return theme
    if (!tokens) return parent
    return mergeThemeTokens(parent, tokens)
  }, [tokens, theme, parent])
  // Wrap children in a Box with theme= prop so the render pipeline picks up the
  // theme via the AgNode tree (same mechanism as color="inherit" cascade). The
  // render phase calls pushContextTheme/popContextTheme when it encounters a node
  // with a theme prop, so $token resolution always uses the nearest ancestor theme
  // without relying on any module-level global.
  // flexGrow/flexShrink/alignSelf: ensure this Box fills its parent (column flex).
  // Required because children with position="absolute" contribute zero content
  // height, so an auto-sized Box with only absolute children gets height=null
  // from Flexily, corrupting the root node's boxRect and crashing the render phase.
  const inner = (
    <ThemeContext.Provider value={merged}>
      <Box theme={merged} flexGrow={1} flexShrink={1} alignSelf="stretch">
        {children}
      </Box>
    </ThemeContext.Provider>
  )
  if (scheme !== undefined) {
    return <ActiveSchemeContext.Provider value={scheme}>{inner}</ActiveSchemeContext.Provider>
  }
  return inner
}
