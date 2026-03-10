/**
 * React Spinner component for silvery/Ink TUI apps
 */

import React, { useState, useEffect } from "react";
import type { SpinnerProps, SpinnerStyle } from "../types.js";
import { SPINNER_FRAMES, SPINNER_INTERVALS } from "../cli/spinner";

/**
 * Animated spinner component for React TUI apps
 *
 * @example
 * ```tsx
 * import { Spinner } from "@silvery/ui/react";
 *
 * function LoadingView() {
 *   return <Spinner label="Loading..." />;
 * }
 *
 * // With style
 * <Spinner label="Processing..." style="arc" color="yellow" />
 * ```
 */
export function Spinner({
  label,
  style = "dots",
  color = "cyan",
}: SpinnerProps): React.ReactElement {
  const [frameIndex, setFrameIndex] = useState(0);
  const frames = SPINNER_FRAMES[style];
  const interval = SPINNER_INTERVALS[style];

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((i) => (i + 1) % frames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [frames.length, interval]);

  const frame = frames[frameIndex];

  // Note: In a real silvery app, you'd use <Text color={color}> etc.
  // This is a generic React component that can be styled by the consumer
  return (
    <span data-progressx-spinner data-color={color}>
      {frame}
      {label && <span> {label}</span>}
    </span>
  );
}

/**
 * Hook for using spinner state in custom components
 *
 * @example
 * ```tsx
 * function CustomSpinner() {
 *   const frame = useSpinnerFrame("dots");
 *   return <Text color="cyan">{frame}</Text>;
 * }
 * ```
 */
export function useSpinnerFrame(style: SpinnerStyle = "dots"): string {
  const [frameIndex, setFrameIndex] = useState(0);
  const frames = SPINNER_FRAMES[style];
  const interval = SPINNER_INTERVALS[style];

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((i) => (i + 1) % frames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [frames.length, interval]);

  return frames[frameIndex]!;
}
