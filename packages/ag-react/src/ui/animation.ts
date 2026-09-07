/**
 * silvery/animation -- Smooth terminal UI animations at ~30fps.
 *
 * ```tsx
 * import { useAnimation, easings } from './animation'
 *
 * function FadeIn() {
 *   const { value } = useAnimation({ duration: 300, easing: "easeOut" })
 *   return <Text color={value < 1 ? "$fg-muted" : undefined}>Hello</Text>
 * }
 * ```
 *
 * @packageDocumentation
 */

export {
  easings,
  resolveEasing,
  useAnimation,
  useInterval,
  useTimeout,
  useLatest,
} from "./animation/index"
export { useTransition as useAnimatedTransition } from "./animation/index"
export type {
  EasingFn,
  EasingName,
  UseAnimationOptions,
  UseAnimationResult,
  UseTransitionOptions,
} from "./animation/index"
