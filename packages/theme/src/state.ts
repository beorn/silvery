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
import { ansi16DarkTheme } from "./schemes/index"

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
// Active Color Level (tier dispatch)
// ============================================================================

/**
 * Color tier the render pipeline is targeting.
 *
 * Mirrors `TerminalCaps.colorLevel` but lives in module state for the
 * render-helpers parseColor() / getTextStyle() functions, which don't have
 * access to the OutputContext or React props. Set by the runtime
 * (`createPipeline()` in `@silvery/ag-term/measurer.ts`) before the first
 * render, and updated on cap changes.
 *
 * At `"none"` (monochrome), `parseColor("$primary")` returns `null` and
 * `getTextStyle()` injects mono-attrs (bold, dim, italic, underline, inverse,
 * strikethrough) from `DEFAULT_MONO_ATTRS`. See `hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p4`.
 */
export type ActiveColorLevel = "none" | "basic" | "256" | "truecolor"

let _activeColorLevel: ActiveColorLevel = "truecolor"

/** Set the active color level (called by the runtime based on TerminalCaps). */
export function setActiveColorLevel(level: ActiveColorLevel): void {
  _activeColorLevel = level
}

/** Get the active color level (called by parseColor / getTextStyle in render-helpers). */
export function getActiveColorLevel(): ActiveColorLevel {
  return _activeColorLevel
}

// ============================================================================
// Context Theme Stack (per-subtree overrides during render phase)
// ============================================================================

/**
 * Stack of per-subtree theme overrides, pushed/popped during render phase
 * tree walk. When a Box has a `theme` prop, its theme is pushed before
 * rendering children and popped after. getActiveTheme() checks this stack
 * first, falling back to _activeTheme.
 *
 * This enables CSS custom property-like cascading: the nearest ancestor
 * Box with a theme prop determines $token resolution for its subtree.
 */
const _contextStack: Theme[] = []

/** Push a context theme (called by render phase for Box nodes with theme prop). */
export function pushContextTheme(theme: Theme): void {
  _contextStack.push(theme)
}

/** Pop a context theme (called by render phase after processing Box subtree). */
export function popContextTheme(): void {
  _contextStack.pop()
}
