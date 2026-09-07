/**
 * Active theme state — module-level fallback for pipeline access.
 *
 * Theme flows through the AgNode tree via `<Box theme={}>` props (set by
 * ThemeProvider in @silvery/ag-react) and the pushContextTheme/popContextTheme
 * cascade in render-phase.ts. `getActiveTheme()` reads the nearest stack entry,
 * falling back to ansi16DarkTheme for code paths that render without a
 * ThemeProvider (bare tests, xterm renderer before wrap).
 *
 * Usage of standalone resolveThemeColor(token, theme) is preferred for callers
 * that have a Theme reference available.
 *
 * `setActiveTheme()` was removed in R2 (km-silvery.theme-v3-r2-agnode-cascade);
 * the no-op stub is gone too. Callers should wrap in ThemeProvider.
 */

import type { Theme } from "@silvery/ansi"
// The `@silvery/theme` re-export of ansi16DarkTheme is pre-populated with
// Sterling flat tokens; `@silvery/ansi`'s is not. Bare-test render paths need
// the flat tokens to resolve `$fg-accent` / `$bg-surface-subtle` etc.
import { ansi16DarkTheme } from "@silvery/theme"

// ============================================================================
// Active Theme (fallback only — not set by ThemeProvider)
// ============================================================================

/**
 * Safe fallback theme. Never mutated — the theme flows via the AgNode tree
 * (Box theme= prop + pushContextTheme/popContextTheme in render-phase.ts).
 * This is only returned by getActiveTheme() when called from a code path that
 * has no pushContextTheme frame on the stack, e.g. a bare test that renders
 * without ThemeProvider.
 *
 * `@silvery/theme`'s `ansi16DarkTheme` ships with Sterling flat tokens baked
 * in, so bare-test render paths resolve `$fg-accent` / `$bg-surface-subtle` /
 * etc. without needing an explicit ThemeProvider.
 */
const _activeTheme: Theme = ansi16DarkTheme

/** Get the active theme (fallback to ansi16DarkTheme when no context stack entry exists). */
export function getActiveTheme(): Theme {
  return _contextStack.length > 0 ? _contextStack[_contextStack.length - 1]! : _activeTheme
}

// ============================================================================
// Color Level (tier dispatch)
// ============================================================================

/**
 * Color tier a render is targeting.
 *
 * Mirrors `TerminalCaps.colorLevel`. At `"mono"` (monochrome),
 * `parseColor("$fg-accent")` returns `null` and `getTextStyle()` injects
 * mono-attrs (bold, dim, italic, underline, inverse, strikethrough) from
 * `DEFAULT_MONO_ATTRS`, so hierarchy survives where color cannot. See
 * `hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p4`.
 *
 * **This is NOT module state.** It rides on `PipelineContext.colorLevel`,
 * flowing `caps → createPipeline → PipelineConfig → createAg → ctx` and into
 * `parseColor()` / `getTextStyle()` as an argument. It used to be a
 * module-level `_activeColorLevel` that `createPipeline()` assigned, which is
 * indistinguishable from correct with one app running and wrong the moment
 * there are two: `createPipeline` runs at app construction and on cap
 * re-detection, never per frame, so nothing re-established it before a render
 * read it, and whichever app was constructed LAST chose the tier for BOTH. A
 * mono app then lost its SGR hierarchy attrs while its own (per-instance)
 * output phase went on stripping color — flat, unreadable output; a truecolor
 * app next to a mono one lost every `$token` color. Regression pin:
 * `tests/features/color-level-cross-render.test.tsx`.
 *
 * Post km-silvery.terminal-profile-plateau Phase 1 this is an alias for the
 * canonical {@link ColorLevel} — the `ActiveColorLevel` name is retained for
 * backwards compat with consumers.
 */
export type ActiveColorLevel = import("@silvery/ansi").ColorLevel

/** Tier assumed when a caller supplies none — full color, no attr injection. */
export const DEFAULT_COLOR_LEVEL: ActiveColorLevel = "truecolor"

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
 * ThemeProvider (in @silvery/ag-react) renders a <Box theme={merged}>
 * wrapper, so its theme is naturally pushed via this mechanism.
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
