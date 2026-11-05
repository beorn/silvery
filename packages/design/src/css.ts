/**
 * CSS variables export — convert theme tokens to CSS custom properties.
 *
 * Emits Sterling flat tokens (`--fg-accent`, `--bg-surface-subtle`,
 * `--border-focus`, …) as 1:1 CSS custom properties. The flat-token
 * grammar is the canonical web-facing surface.
 *
 * Every shipped Theme has Sterling flat keys baked on at construction
 * (by its constructor or `inlineSterlingTokens`) so this walk
 * produces a complete export without needing a separate derivation pass.
 */

import type { Theme } from "./sterling/types.ts"
import { STERLING_FLAT_TOKENS } from "./sterling/flat-tokens.ts"
import { sterling } from "./sterling/sterling.ts"

/** Every page color: Sterling's flat tokens and its eight categorical hues. */
export const THEME_CSS_TOKENS = [
  ...STERLING_FLAT_TOKENS,
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
] as const

/**
 * A paired light/dark style sheet with registered color custom properties.
 * Pages select their modes through CSS color-scheme or a color-scheme meta.
 * With no pair, uses Sterling's light and dark defaults.
 * @throws When a token is missing, naming the token and its mode.
 */
export function themeCss(pair?: { light: Theme; dark: Theme }): string {
  const { light, dark } = pair ?? {
    light: sterling.defaults("light"),
    dark: sterling.defaults("dark"),
  }
  const props: string[] = []
  const vars: string[] = []
  for (const name of THEME_CSS_TOKENS) {
    const l = light[name]
    const d = dark[name]
    if (typeof l !== "string") throw new Error(`Sterling has no ${name} colour in light mode.`)
    if (typeof d !== "string") throw new Error(`Sterling has no ${name} colour in dark mode.`)
    props.push(`@property --${name}{syntax:"<color>";inherits:true;initial-value:${l}}`)
    vars.push(`--${name}:${l === d ? l : `light-dark(${l},${d})`}`)
  }
  return `${props.join("")}:root{${vars.join(";")}}:where(html){color:var(--fg-default)}`
}

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
