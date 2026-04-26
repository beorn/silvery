/**
 * TextReveal Component
 *
 * Typewriter-style character reveal — animates text from empty to full
 * over `duration` ms. Use for tool-call status morphs ("Reading file..."
 * → "Read 3 files"), boot screens, dramatic emphasis, or anywhere a
 * sudden text appearance would be jarring.
 *
 * Usage:
 * ```tsx
 * <TextReveal text="Read 3 files" duration={300} />
 * <TextReveal text={statusLabel} duration={200} onComplete={fadeIn} />
 * ```
 *
 * When `text` changes, restarts the reveal from 0 (mirrors how a typist
 * would re-type the new label).
 */
import React, { useEffect, useState } from "react"
import { Text } from "../../components/Text"
import type { TextProps } from "../../components/Text"
import { useAnimation } from "../animation/useAnimation"
import type { EasingName } from "../animation/easing"

// =============================================================================
// Types
// =============================================================================

export interface TextRevealProps extends Omit<TextProps, "children"> {
  /** Full text to reveal. Reveal restarts when this changes. */
  text: string
  /** Total reveal duration in ms. Default 300. */
  duration?: number
  /** Easing curve. Default `linear` (typewriter feel). */
  easing?: EasingName
  /** Called when the reveal reaches the full string. */
  onComplete?: () => void
}

// =============================================================================
// Component
// =============================================================================

export function TextReveal({
  text,
  duration = 300,
  easing = "linear",
  onComplete,
  ...rest
}: TextRevealProps): React.ReactElement {
  // animKey forces a fresh useAnimation cycle when `text` changes — a
  // re-mount semantically is the cleanest way to restart progress.
  const [animKey, setAnimKey] = useState(0)
  useEffect(() => {
    setAnimKey((k) => k + 1)
  }, [text])

  return <TextRevealRunner key={animKey} text={text} duration={duration} easing={easing} onComplete={onComplete} {...rest} />
}

function TextRevealRunner({
  text,
  duration,
  easing,
  onComplete,
  ...rest
}: {
  text: string
  duration: number
  easing: EasingName
  onComplete?: () => void
} & Omit<TextProps, "children">): React.ReactElement {
  const { value } = useAnimation({ duration, easing, onComplete })
  // Round so the typewriter steps land on whole characters.
  const charsToShow = Math.round(value * text.length)
  return <Text {...rest}>{text.slice(0, charsToShow)}</Text>
}
