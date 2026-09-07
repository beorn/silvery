/**
 * Terminal palette detection — straight re-export from `@silvery/ansi`.
 *
 * `@silvery/ansi`'s `detectTheme` / `detectScheme` / `detectSchemeTheme` now
 * return themes with Sterling flat tokens (`$bg-accent`, `$bg-surface-overlay`,
 * `$border-default`, `$fg-muted`, …) baked in. There is one canonical Theme
 * shape; this module exists only so downstream code importing from
 * `@silvery/theme` (or `silvery`, via barrel re-export) continues to work.
 *
 * Historical note (km-silvery.fallback-theme-empty-bg-tokens): this file once
 * wrapped `@silvery/ansi` detection to compensate for partial themes. That split was
 * the root cause of the "31/32 empty bg tokens on fallback" regression —
 * every caller that reached past the wrapper hit the partial shape. The
 * fix was structural: move Sterling into `@silvery/ansi` so `deriveTheme`,
 * `loadTheme`, and all detection paths bake flat tokens in. This file no
 * longer transforms anything.
 *
 * @example
 * ```ts
 * import { detectTheme } from "@silvery/theme"
 * import { nord, catppuccinLatte } from "@silvery/theme/schemes"
 *
 * const theme = await detectTheme({ fallbackDark: nord, fallbackLight: catppuccinLatte })
 * ```
 */

export {
  probeColors,
  detectTerminalScheme,
  detectTheme,
  detectScheme,
  detectSchemeTheme,
} from "@silvery/ansi"

export type {
  DetectedScheme,
  DetectThemeOptions,
  DetectSchemeOptions,
  DetectSchemeResult,
  DetectSource,
  SlotSource,
} from "@silvery/ansi"
