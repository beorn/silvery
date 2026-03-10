/**
 * Animation Utilities
 *
 * Hooks and helpers for smooth terminal UI animations at ~30fps.
 */

// Easing
export { easings, resolveEasing } from "./easing";
export type { EasingFn, EasingName } from "./easing";

// Hooks
export { useAnimation } from "./useAnimation";
export type { UseAnimationOptions, UseAnimationResult } from "./useAnimation";
export { useTransition } from "./useTransition";
export type { UseTransitionOptions } from "./useTransition";
export { useInterval } from "./useInterval";
