/**
 * TimeToFirstDraw Component
 *
 * Dev-mode perf marker. Renders the elapsed time (ms) since component
 * mount up to the first paint. Use to instrument app startup, tool-call
 * latency, or any "how fast did this surface arrive" check during
 * development.
 *
 * Usage:
 * ```tsx
 * {process.env.SILVERY_DEV ? <TimeToFirstDraw /> : null}
 * ```
 *
 * Implementation: captures `performance.now()` at module init for the
 * component instance, computes elapsed once during the first render,
 * then renders a static label. Subsequent renders show the same value
 * (it's a "first draw" marker, not a live clock).
 */
import React, { useRef } from "react"
import { Text } from "../../components/Text"
import type { TextProps } from "../../components/Text"

// =============================================================================
// Types
// =============================================================================

export interface TimeToFirstDrawProps extends Omit<TextProps, "children"> {
  /** Optional label prefix. Default "ttfd:". */
  label?: string
  /**
   * Reference timestamp (ms since epoch or performance.now origin) for
   * the elapsed calculation. Defaults to component mount time, which
   * works for "from this component's mount." Pass an app-wide start
   * time for true app-startup measurement.
   */
  startedAt?: number
}

// =============================================================================
// Component
// =============================================================================

export function TimeToFirstDraw({
  label = "ttfd:",
  startedAt,
  ...rest
}: TimeToFirstDrawProps): React.ReactElement {
  // Capture start time once per instance. Prefer the prop if provided —
  // useful when measuring from a moment that pre-dates this component.
  const startRef = useRef<number>(startedAt ?? performance.now())
  const elapsedRef = useRef<number | null>(null)

  // First render snapshots the elapsed; subsequent renders read it back
  // unchanged. Without this guard, every parent re-render would push the
  // displayed value (turning the marker into a clock).
  if (elapsedRef.current === null) {
    elapsedRef.current = performance.now() - startRef.current
  }

  const ms = Math.round(elapsedRef.current)
  return (
    <Text color="$muted" {...rest}>
      {label} {ms}ms
    </Text>
  )
}
