/**
 * Terminal palette auto-detection — Sterling-aware wrapper around
 * `@silvery/ansi`'s `detectTheme`.
 *
 * `@silvery/ansi`'s `detectTheme` returns a minimal `Theme` shape without
 * Sterling flat tokens (`border-default`, `fg-muted`, `bg-surface-default`, …).
 * Tokens like `"$border-default"` would resolve to `undefined` and fall through
 * to `parseColor → null`, which paints as the terminal's default foreground
 * (usually white-on-dark) — the canonical "borders look white" bug.
 *
 * This wrapper runs the detected / fallback theme through `inlineSterlingTokens`
 * so every shipped Theme is guaranteed to expose Sterling flat keys. This is
 * the canonical source of `detectTheme` for every silvery consumer
 * (components, km-tui, silvery itself, the terminal runtime). Never import
 * `detectTheme` / `detectScheme` directly from `@silvery/ansi` at runtime —
 * that path produces a partial shape (missing flat tokens) and is why
 * `$bg-*` used to paint empty cells on the fallback branch (confidence=0).
 * See tests/theme-flat-tokens-contract.test.ts.
 *
 * To use Nord/Catppuccin as fallback palettes (richer than the built-in
 * defaults), pass them via options:
 *
 * @example
 * ```ts
 * import { detectTheme } from "@silvery/theme"
 * import { nord, catppuccinLatte } from "@silvery/theme/schemes"
 *
 * const theme = await detectTheme({ fallbackDark: nord, fallbackLight: catppuccinLatte })
 * ```
 */

import {
  detectTheme as _detectTheme,
  detectScheme as _detectScheme,
  detectSchemeTheme as _detectSchemeTheme,
  probeColors,
  detectTerminalScheme,
  type DetectSchemeOptions,
  type DetectSchemeResult,
  type DetectThemeOptions,
  type Theme,
} from "@silvery/ansi"
import { inlineSterlingTokens } from "./sterling/inline.ts"

export type {
  DetectedScheme,
  DetectThemeOptions,
  DetectSchemeOptions,
  DetectSchemeResult,
  DetectSource,
  SlotSource,
} from "@silvery/ansi"

/**
 * Probe the terminal for its 22-slot color scheme via OSC 4/10/11 queries.
 * Re-exported from `@silvery/ansi` for convenience — prefer the canonical
 * name `probeColors`. `detectTerminalScheme` is the legacy alias.
 */
export { probeColors, detectTerminalScheme }

/**
 * Run the full 4-layer scheme detection cascade and return a Sterling-aware
 * Theme along with provenance metadata.
 *
 * Wraps `@silvery/ansi`'s `detectScheme` so the returned `theme` field has
 * Sterling flat tokens (`border-default`, `fg-muted`, `bg-surface-default`, …)
 * baked in via `inlineSterlingTokens`. Use this whenever consumers read
 * Sterling tokens (most do).
 */
export async function detectScheme(opts: DetectSchemeOptions = {}): Promise<DetectSchemeResult> {
  const result = await _detectScheme(opts)
  return { ...result, theme: inlineSterlingTokens(result.theme) }
}

/** Shortcut: run `detectScheme` and return only the (Sterling-aware) Theme. */
export async function detectSchemeTheme(opts: DetectSchemeOptions = {}): Promise<Theme> {
  const theme = await _detectSchemeTheme(opts)
  return inlineSterlingTokens(theme)
}

/**
 * Detect the terminal's palette and return a Sterling-aware Theme.
 *
 * Identical to `@silvery/ansi`'s `detectTheme` but every returned theme has
 * Sterling flat tokens baked in via `inlineSterlingTokens`.
 */
export async function detectTheme(opts: DetectThemeOptions = {}): Promise<Theme> {
  const theme = await _detectTheme(opts)
  return inlineSterlingTokens(theme)
}
