/**
 * Token resolution — resolves `$token` strings against a Theme.
 *
 * All theme property names are lowercase, no hyphens (e.g. `surfacefg`).
 * Hyphens in token strings are stripped for lookup: `$surface-fg` → `surfacefg`.
 * This allows both `$surfacefg` and `$surface-fg` to resolve identically.
 */

import type { Theme } from "./types";

/** Color-typed keys of Theme (excludes metadata and palette). */
type ThemeColorKey = Exclude<keyof Theme, "name" | "palette">;

/**
 * Resolve a color value — if it starts with `$`, look up the token in the theme.
 *
 * Supports:
 * - Named tokens: `$primary`, `$fg`, `$border`, etc.
 * - Compound tokens: `$surfacefg`, `$mutedfg`, `$disabledfg`, etc.
 * - Hyphenated tokens (compat): `$surface-fg` → strips hyphens → `surfacefg`
 * - Palette colors: `$color0` through `$color15`
 *
 * Returns `undefined` for `undefined` input. Non-`$` strings pass through unchanged.
 * Unknown tokens pass through as-is.
 */
export function resolveThemeColor(color: string | undefined, theme: Theme): string | undefined {
  if (!color) return undefined;
  if (!color.startsWith("$")) return color;

  const token = color.slice(1);

  // Palette colors: $color0 through $color15
  if (token.startsWith("color")) {
    const idx = parseInt(token.slice(5), 10);
    if (idx >= 0 && idx < 16 && theme.palette && idx < theme.palette.length) {
      return theme.palette[idx];
    }
  }

  // Strip hyphens for lookup (supports both $surfacefg and $surface-fg)
  const key = token.replace(/-/g, "") as ThemeColorKey;
  const val = theme[key];
  return typeof val === "string" ? val : color;
}
