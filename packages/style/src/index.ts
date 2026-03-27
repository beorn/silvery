/**
 * @silvery/style — Theme-aware terminal styling.
 *
 * Chalk-compatible API with color detection, ANSI 16 fallback,
 * and semantic theme token resolution.
 *
 * @example
 * ```ts
 * import { createStyle } from "@silvery/style"
 *
 * const s = createStyle()
 * s.bold.red("error")
 * s.hex("#818cf8")("indigo")
 *
 * const s = createStyle({ theme })
 * s.primary("deploy")
 * s.success("done")
 * ```
 *
 * @module
 */

export { createStyle } from "./style.ts"
export type { Style, StyleOptions, ThemeLike } from "./types.ts"
export { hexToRgb, fgFromRgb, bgFromRgb, MODIFIERS, FG_COLORS, BG_COLORS, THEME_TOKEN_DEFAULTS } from "./colors.ts"
