/**
 * WCAG 2.1 contrast checking and enforcement.
 *
 * Re-exports from @silvery/color — the canonical implementation.
 * This module exists to preserve @silvery/theme's public API.
 */

export { checkContrast, ensureContrast } from "@silvery/color"
export type { ContrastResult } from "@silvery/color"
