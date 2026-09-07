/**
 * Compatibility entry point for ANSI-slot theme generation.
 *
 * The implementation lives in `@silvery/ansi`, alongside the ColorScheme
 * seed builder and canonical Sterling factory. Keeping this as a re-export
 * prevents the catalog package from becoming a second derivation authority.
 */

export { generateTheme } from "@silvery/ansi"
