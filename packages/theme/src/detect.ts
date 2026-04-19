/**
 * Terminal palette auto-detection — re-exported from @silvery/ansi (canonical location).
 *
 * To use Nord/Catppuccin as fallback palettes (richer than the built-in defaults),
 * pass them via detectTheme options:
 *
 * @example
 * ```ts
 * import { detectTheme } from "@silvery/ansi"
 * import { nord, catppuccinLatte } from "@silvery/theme/schemes"
 *
 * const theme = await detectTheme({ fallbackDark: nord, fallbackLight: catppuccinLatte })
 * ```
 *
 * @silvery/theme consumers can continue importing from here.
 */

export { detectTerminalScheme, detectTheme } from "@silvery/ansi"
export type { DetectedScheme, DetectThemeOptions } from "@silvery/ansi"
