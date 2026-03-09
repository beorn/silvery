/**
 * Easing Functions
 *
 * Maps time progress (0-1) to value progress (0-1) for smooth animations.
 * Includes common presets and a resolver for name-or-function usage.
 */

// ============================================================================
// Types
// ============================================================================

/** Easing function: maps time progress (0-1) to value progress (0-1) */
export type EasingFn = (t: number) => number

// ============================================================================
// Presets
// ============================================================================

export const easings = {
  linear: (t: number) => t,
  ease: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => t * (2 - t),
  easeInOut: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => --t * t * t + 1,
} as const satisfies Record<string, EasingFn>

export type EasingName = keyof typeof easings

// ============================================================================
// Resolver
// ============================================================================

/** Resolve an easing — accepts a name string or a custom function. */
export function resolveEasing(easing: EasingName | EasingFn): EasingFn {
  return typeof easing === "function" ? easing : easings[easing]
}
