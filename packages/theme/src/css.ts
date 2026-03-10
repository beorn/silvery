/**
 * CSS variables export — convert theme tokens to CSS custom properties.
 *
 * Generates a flat map of CSS custom property names to color values,
 * suitable for applying as inline styles or injecting into a stylesheet.
 */

import type { Theme } from "./types";
import { THEME_TOKEN_KEYS } from "./validate-theme";

/**
 * Convert a Theme to CSS custom properties.
 *
 * Token names are kebab-cased with a `--` prefix:
 *   - `bg` → `--bg`
 *   - `surfacefg` → `--surfacefg`
 *   - `disabledfg` → `--disabledfg`
 *   - Palette entries: `--color0` through `--color15`
 *
 * @param theme - The theme to convert
 * @returns A record mapping CSS custom property names to color values
 *
 * @example
 * ```typescript
 * const vars = themeToCSSVars(myTheme)
 * // { "--bg": "#1E1E2E", "--fg": "#CDD6F4", "--primary": "#F9E2AF", ... }
 *
 * // Apply to an element:
 * Object.assign(element.style, vars)
 * ```
 */
export function themeToCSSVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};

  // Semantic tokens
  for (const key of THEME_TOKEN_KEYS) {
    const value = theme[key as keyof Theme];
    if (typeof value === "string") {
      vars[`--${key}`] = value;
    }
  }

  // Palette colors
  if (theme.palette) {
    for (let i = 0; i < theme.palette.length; i++) {
      vars[`--color${i}`] = theme.palette[i]!;
    }
  }

  return vars;
}
