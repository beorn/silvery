/**
 * CSS variables export — convert theme tokens to CSS custom properties.
 *
 * Emits Sterling flat tokens (`--fg-accent`, `--bg-surface-subtle`,
 * `--border-focus`, …) as 1:1 CSS custom properties. The flat-token
 * grammar is the canonical web-facing surface — see
 * `hub/silvery/design/v10-terminal/design-system.md` §"Flat — the
 * user-facing form".
 *
 * Every shipped Theme has Sterling flat keys baked by the canonical factory,
 * so this walk
 * produces a complete export without needing a separate derivation pass.
 */

import type { Theme } from "@silvery/ansi"
import { STERLING_FLAT_TOKENS } from "@silvery/ansi"

/**
 * Convert a Theme to CSS custom properties.
 *
 * Token names mirror Sterling's flat grammar with a `--` prefix:
 *   - `bg-surface-default` → `--bg-surface-default`
 *   - `fg-accent` → `--fg-accent`
 *   - `border-focus` → `--border-focus`
 *   - Palette entries: `--color0` through `--color15`
 *
 * @param theme - The theme to convert (Sterling flat tokens must be populated)
 * @returns A record mapping CSS custom property names to color values
 *
 * @example
 * ```typescript
 * const vars = themeToCSSVars(myTheme)
 * // { "--bg-surface-default": "#1E1E2E", "--fg-accent": "#F9E2AF", ... }
 *
 * // Apply to an element:
 * Object.assign(element.style, vars)
 * ```
 */
export function themeToCSSVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {}

  // Sterling flat tokens — channel-role-state grammar.
  const flat = theme as unknown as Record<string, string | undefined>
  for (const key of STERLING_FLAT_TOKENS) {
    const value = flat[key]
    if (typeof value === "string") {
      vars[`--${key}`] = value
    }
  }

  // Palette colors — raw ANSI slots for app-level category coloring.
  if (theme.palette) {
    for (let i = 0; i < theme.palette.length; i++) {
      vars[`--color${i}`] = theme.palette[i]!
    }
  }

  return vars
}
