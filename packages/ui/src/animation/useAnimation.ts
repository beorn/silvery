/**
 * useAnimation - Animate a value from 0 to 1 over a duration.
 *
 * Drives a single animation cycle with configurable easing, delay,
 * and completion callback. Targets ~30fps (33ms interval) since
 * terminals don't benefit from higher refresh rates.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { resolveEasing, type EasingName, type EasingFn } from "./easing";

// ============================================================================
// Types
// ============================================================================

export interface UseAnimationOptions {
  /** Duration in milliseconds */
  duration: number;
  /** Easing function or preset name */
  easing?: EasingName | EasingFn;
  /** Delay before starting (ms) */
  delay?: number;
  /** Called when animation completes */
  onComplete?: () => void;
  /** Whether to run the animation (default: true) */
  enabled?: boolean;
}

export interface UseAnimationResult {
  /** Current progress value (0 to 1, eased) */
  value: number;
  /** Whether the animation is still running */
  isAnimating: boolean;
  /** Reset and replay the animation */
  reset: () => void;
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
 * Animate a value from 0 to 1 over a duration with easing.
 *
 * @example
 * ```tsx
 * function FadeIn({ children }) {
 *   const { value } = useAnimation({ duration: 300, easing: "easeOut" })
 *   return <Text dimColor={value < 1}>{children}</Text>
 * }
 * ```
 */
export function useAnimation(options: UseAnimationOptions): UseAnimationResult {
  const { duration, easing = "linear", delay = 0, onComplete, enabled = true } = options;

  const [value, setValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const startTimeRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Epoch bumps on each reset to invalidate stale intervals
  const epochRef = useRef(0);

  const easingFn = resolveEasing(easing);

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startAnimation = useCallback(() => {
    stopInterval();
    epochRef.current++;
    const epoch = epochRef.current;

    setValue(0);
    setIsAnimating(true);

    const begin = () => {
      // Guard against stale starts after a reset
      if (epochRef.current !== epoch) return;

      startTimeRef.current = performance.now();

      intervalRef.current = setInterval(() => {
        // Guard against stale ticks after a reset
        if (epochRef.current !== epoch) return;

        const elapsed = performance.now() - startTimeRef.current;
        const raw = Math.min(elapsed / duration, 1);
        const eased = easingFn(raw);

        setValue(eased);

        if (raw >= 1) {
          stopInterval();
          setIsAnimating(false);
          onCompleteRef.current?.();
        }
      }, TICK_MS);
    };

    if (delay > 0) {
      setTimeout(() => begin(), delay);
    } else {
      begin();
    }
  }, [duration, delay, easingFn, stopInterval]);

  // Start on mount (if enabled)
  useEffect(() => {
    if (!enabled) {
      stopInterval();
      setValue(0);
      setIsAnimating(false);
      return;
    }

    startAnimation();

    return () => {
      stopInterval();
    };
  }, [enabled, startAnimation, stopInterval]);

  const reset = useCallback(() => {
    startAnimation();
  }, [startAnimation]);

  return { value, isAnimating, reset };
}
