/**
 * TextShimmer Component
 *
 * Pulses text color between active and muted tokens to signal in-flight
 * work. Use during streaming responses, long-running tool calls, or
 * background tasks — anywhere "this is alive but waiting" needs a
 * visual hint.
 *
 * Usage:
 * ```tsx
 * <TextShimmer active={isStreaming}>Generating response...</TextShimmer>
 * ```
 *
 * Implementation: cycles `useAnimation` from 0→1→0 every `period` ms.
 * Renders text at `$primary` when t > 0.5, `$muted` otherwise (binary
 * pulse — terminals don't blend mid-frame). When `active=false` the
 * shimmer stops and text shows at `$primary`.
 */
import React, { useEffect, useState } from "react"
import { Text } from "../../components/Text"
import type { TextProps } from "../../components/Text"
import { useAnimation } from "../animation/useAnimation"

// =============================================================================
// Types
// =============================================================================

export interface TextShimmerProps extends Omit<TextProps, "color" | "children"> {
  /** Text content. */
  children: React.ReactNode
  /** When false, text renders solid (no shimmer). Default true. */
  active?: boolean
  /** Pulse period in ms. Default 1200 (slow, non-distracting). */
  period?: number
  /** Theme tokens for the pulse. Defaults to `$primary` and `$muted`. */
  highColor?: string
  lowColor?: string
}

// =============================================================================
// Component
// =============================================================================

export function TextShimmer({
  children,
  active = true,
  period = 1200,
  highColor = "$primary",
  lowColor = "$muted",
  ...rest
}: TextShimmerProps): React.ReactElement {
  // Tick state — flips every `period/2` to oscillate between high and low.
  // Built on a ping-pong useAnimation cycle; we restart on each completion.
  const [phase, setPhase] = useState(0)
  const { value, reset } = useAnimation({
    duration: period,
    easing: "linear",
    enabled: active,
    onComplete: () => {
      // Bump phase, then restart for the next cycle.
      setPhase((p) => p + 1)
    },
  })

  useEffect(() => {
    if (active) reset()
  }, [phase, active, reset])

  if (!active) {
    return <Text color={highColor} {...rest}>{children}</Text>
  }

  const color = value > 0.5 ? highColor : lowColor
  return <Text color={color} {...rest}>{children}</Text>
}
