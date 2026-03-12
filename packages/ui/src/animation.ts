/**
 * silvery/animation -- Smooth terminal UI animations at ~30fps.
 *
 * ```tsx
 * import { useAnimation, easings } from '@silvery/ui/animation'
 *
 * function FadeIn() {
 *   const { value } = useAnimation({ duration: 300, easing: "easeOut" })
 *   return <Text dimColor={value < 1}>Hello</Text>
 * }
 * ```
 *
 * @packageDocumentation
 */

export { easings, resolveEasing, useAnimation, useInterval, useTimeout, useLatest } from "./animation/index"
export { useTransition as useAnimatedTransition } from "./animation/index"
export type {
  EasingFn,
  EasingName,
  UseAnimationOptions,
  UseAnimationResult,
  UseTransitionOptions,
} from "./animation/index"
