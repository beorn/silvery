/**
 * AnimatedNumber Component
 *
 * Animates a smooth integer transition between two values over a
 * duration. Use for tool-call counters ("Read 3 files" → "Read 12 files"),
 * token-budget meters, cost displays, or anywhere a number changing
 * abruptly would be jarring.
 *
 * Usage:
 * ```tsx
 * <AnimatedNumber value={count} duration={400} />
 * <AnimatedNumber value={tokens} duration={300} format={(n) => n.toLocaleString()} />
 * ```
 *
 * Implementation: tracks the previous value across renders. When `value`
 * changes, animates from the old value to the new over `duration` ms,
 * rounding intermediate steps. Built on `useAnimation`.
 */
import React, { useEffect, useRef, useState } from "react"
import { Text } from "../../components/Text"
import type { TextProps } from "../../components/Text"
import { useAnimation } from "../animation/useAnimation"
import type { EasingName } from "../animation/easing"

// =============================================================================
// Types
// =============================================================================

export interface AnimatedNumberProps extends Omit<TextProps, "children"> {
  /** Target value to animate towards. */
  value: number
  /** Animation duration in ms. Default 400. */
  duration?: number
  /** Easing curve. Default `easeOut`. */
  easing?: EasingName
  /** Format the rendered string. Default `String(Math.round(n))`. */
  format?: (n: number) => string
}

// =============================================================================
// Component
// =============================================================================

export function AnimatedNumber({
  value,
  duration = 400,
  easing = "easeOut",
  format = (n) => String(Math.round(n)),
  ...rest
}: AnimatedNumberProps): React.ReactElement {
  // Track the value we last rendered FROM so each transition starts at
  // the displayed integer, not the previous animation target. Mounting
  // initializes both refs to the current value (no entry animation).
  const fromRef = useRef(value)
  const toRef = useRef(value)
  const [animKey, setAnimKey] = useState(0)

  // When value changes, snap the previous animation to its target,
  // record the new from→to, and bump the animation key to restart.
  useEffect(() => {
    if (toRef.current !== value) {
      fromRef.current = toRef.current
      toRef.current = value
      setAnimKey((k) => k + 1)
    }
  }, [value])

  return (
    <AnimatedNumberRunner
      // animKey forces a fresh useAnimation cycle when value changes.
      key={animKey}
      from={fromRef.current}
      to={toRef.current}
      duration={duration}
      easing={easing}
      format={format}
      {...rest}
    />
  )
}

// =============================================================================
// Runner — keyed by animKey so useAnimation re-mounts per transition.
// =============================================================================

function AnimatedNumberRunner({
  from,
  to,
  duration,
  easing,
  format,
  ...rest
}: {
  from: number
  to: number
  duration: number
  easing: EasingName
  format: (n: number) => string
} & Omit<TextProps, "children">): React.ReactElement {
  const { value: t } = useAnimation({ duration, easing })
  const current = from + (to - from) * t
  return <Text {...rest}>{format(current)}</Text>
}
