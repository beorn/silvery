/**
 * useTransition - Smoothly interpolate between numeric values.
 *
 * When the target value changes, animates from the current value toward
 * the new target. If the target changes mid-animation, restarts from
 * the current interpolated position. Targets ~30fps.
 */

import { useState, useEffect, useRef } from "react";
import { resolveEasing, type EasingName, type EasingFn } from "./easing";

// ============================================================================
// Types
// ============================================================================

export interface UseTransitionOptions {
  /** Duration in milliseconds (default: 300) */
  duration?: number;
  /** Easing function or preset name (default: "easeOut") */
  easing?: EasingName | EasingFn;
}

// ============================================================================
// Constants
// ============================================================================

/** ~30fps tick interval for terminal animations */
const TICK_MS = 33;

// ============================================================================
// Hook
// ============================================================================

/**
 * Smoothly interpolate when the target value changes.
 *
 * Returns the current interpolated value. On the first render, returns
 * the target value immediately (no animation). Subsequent changes
 * animate from the previous value to the new target.
 *
 * @example
 * ```tsx
 * function ScrollOffset({ target }) {
 *   const smooth = useTransition(target, { duration: 200, easing: "easeOut" })
 *   return <Box marginTop={Math.round(smooth)}>...</Box>
 * }
 * ```
 */
export function useTransition(targetValue: number, options?: UseTransitionOptions): number {
  const { duration = 300, easing = "easeOut" } = options ?? {};

  const [currentValue, setCurrentValue] = useState(targetValue);

  const fromRef = useRef(targetValue);
  const toRef = useRef(targetValue);
  const startTimeRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFirstRef = useRef(true);

  const easingFn = resolveEasing(easing);

  useEffect(() => {
    // On first render, snap to target without animation
    if (isFirstRef.current) {
      isFirstRef.current = false;
      return;
    }

    // If target hasn't changed, nothing to do
    if (targetValue === toRef.current) return;

    // Start from wherever we currently are
    fromRef.current = currentValue;
    toRef.current = targetValue;
    startTimeRef.current = performance.now();

    // Clear any existing interval
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      const elapsed = performance.now() - startTimeRef.current;
      const raw = Math.min(elapsed / duration, 1);
      const eased = easingFn(raw);
      const interpolated = fromRef.current + (toRef.current - fromRef.current) * eased;

      setCurrentValue(interpolated);

      if (raw >= 1) {
        // Snap to exact target and stop
        setCurrentValue(toRef.current);
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, TICK_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetValue, duration, easingFn]);

  return currentValue;
}
