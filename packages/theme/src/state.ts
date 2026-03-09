/**
 * Active theme state — module-level for pipeline access.
 *
 * This module has side effects (global mutable state).
 * Marked in package.json sideEffects for tree-shaking.
 *
 * Usage is optional — standalone users pass Theme objects explicitly
 * to resolveThemeColor(token, theme). The global state exists for
 * silvery's render pipeline where React context isn't accessible.
 */

import type { Theme } from "./types"
import { ansi16DarkTheme } from "./palettes/index"

// ============================================================================
// Active Theme
// ============================================================================

/**
 * The currently active theme, set by ThemeProvider during render.
 * Used by parseColor() to resolve $token strings without React context access.
 */
let _activeTheme: Theme = ansi16DarkTheme

/** Set the active theme (called by ThemeProvider). */
export function setActiveTheme(theme: Theme): void {
  _activeTheme = theme
}

/** Get the active theme (called by parseColor in render-helpers). */
export function getActiveTheme(): Theme {
  return _contextStack.length > 0 ? _contextStack[_contextStack.length - 1]! : _activeTheme
}

// ============================================================================
// Context Theme Stack (per-subtree overrides during content phase)
// ============================================================================

/**
 * Stack of per-subtree theme overrides, pushed/popped during content phase
 * tree walk. When a Box has a `theme` prop, its theme is pushed before
 * rendering children and popped after. getActiveTheme() checks this stack
 * first, falling back to _activeTheme.
 *
 * This enables CSS custom property-like cascading: the nearest ancestor
 * Box with a theme prop determines $token resolution for its subtree.
 */
const _contextStack: Theme[] = []

/** Push a context theme (called by content phase for Box nodes with theme prop). */
export function pushContextTheme(theme: Theme): void {
  _contextStack.push(theme)
}

/** Pop a context theme (called by content phase after processing Box subtree). */
export function popContextTheme(): void {
  _contextStack.pop()
}
