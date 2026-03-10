/**
 * Spinner Component
 *
 * An animated loading spinner with multiple built-in styles.
 *
 * Usage:
 * ```tsx
 * <Spinner />
 * <Spinner type="arc" label="Loading..." />
 * <Spinner type="bounce" interval={120} />
 * ```
 */
import React, { useEffect, useState } from "react";
import { Text } from "@silvery/react/components/Text";

// =============================================================================
// Types
// =============================================================================

export interface SpinnerProps {
  /** Spinner style preset */
  type?: "dots" | "line" | "arc" | "bounce";
  /** Label text shown after spinner */
  label?: string;
  /** Animation interval in ms (default: 80) */
  interval?: number;
}

// =============================================================================
// Frame Sequences
// =============================================================================

const FRAMES: Record<NonNullable<SpinnerProps["type"]>, readonly string[]> = {
  dots: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  line: ["|", "/", "—", "\\"],
  arc: ["◜", "◠", "◝", "◞", "◡", "◟"],
  bounce: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
};

// =============================================================================
// Component
// =============================================================================

export function Spinner({ type = "dots", label, interval = 80 }: SpinnerProps): React.ReactElement {
  const [frameIndex, setFrameIndex] = useState(0);
  const frames = FRAMES[type];

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [frames.length, interval]);

  const frame = frames[frameIndex % frames.length]!;

  return (
    <Text>
      {frame}
      {label ? ` ${label}` : ""}
    </Text>
  );
}
