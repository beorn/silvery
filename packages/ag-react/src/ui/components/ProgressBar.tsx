/**
 * ProgressBar Component
 *
 * A terminal progress bar with determinate and indeterminate modes.
 *
 * Usage:
 * ```tsx
 * <ProgressBar value={0.5} />
 * <ProgressBar value={0.75} color="green" label="Downloading..." />
 * <ProgressBar />  // indeterminate (animated)
 * ```
 */
import React, { useEffect, useState } from "react"
import { useContentRect } from "@silvery/ag-react/hooks/useLayout"
import { Box } from "@silvery/ag-react/components/Box"
import { Text } from "@silvery/ag-react/components/Text"

// =============================================================================
// Types
// =============================================================================

export interface ProgressBarProps {
  /** Progress value 0-1 (omit for indeterminate) */
  value?: number
  /** Width in columns (default: uses available width via useContentRect) */
  width?: number
  /** Fill character (default: "█") */
  fillChar?: string
  /** Empty character (default: "░") */
  emptyChar?: string
  /** Show percentage label (default: true for determinate) */
  showPercentage?: boolean
  /** Label text */
  label?: string
  /** Color of the filled portion */
  color?: string
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_FILL = "█"
const DEFAULT_EMPTY = "░"
const DEFAULT_WIDTH = 30
const INDETERMINATE_BLOCK_SIZE = 4
const INDETERMINATE_INTERVAL = 100

// =============================================================================
// Component
// =============================================================================

export function ProgressBar({
  value,
  width: widthProp,
  fillChar = DEFAULT_FILL,
  emptyChar = DEFAULT_EMPTY,
  showPercentage,
  label,
  color,
}: ProgressBarProps): React.ReactElement {
  // Only use layout feedback when width isn't explicitly provided
  const layoutRect = useContentRect()
  const contentWidth = widthProp ? 0 : layoutRect.width
  const [bouncePos, setBouncePos] = useState(0)
  const [bounceDir, setBounceDir] = useState(1)

  const isDeterminate = value !== undefined
  const showPct = showPercentage ?? isDeterminate

  // Calculate available bar width
  const labelWidth = label ? label.length + 1 : 0
  const pctWidth = showPct ? 5 : 0 // " 100%"
  const availableWidth = widthProp ?? (contentWidth > 0 ? contentWidth : DEFAULT_WIDTH)
  const barWidth = Math.max(1, availableWidth - labelWidth - pctWidth)

  // Indeterminate animation
  useEffect(() => {
    if (isDeterminate) return

    const timer = setInterval(() => {
      setBouncePos((prev) => {
        const maxPos = barWidth - INDETERMINATE_BLOCK_SIZE
        if (maxPos <= 0) return 0

        const next = prev + bounceDir
        if (next >= maxPos) {
          setBounceDir(-1)
          return maxPos
        }
        if (next <= 0) {
          setBounceDir(1)
          return 0
        }
        return next
      })
    }, INDETERMINATE_INTERVAL)

    return () => clearInterval(timer)
  }, [isDeterminate, barWidth, bounceDir])

  let filledPart: string
  let emptyPart: string

  if (isDeterminate) {
    const clamped = Math.max(0, Math.min(1, value))
    const filled = Math.round(clamped * barWidth)
    filledPart = fillChar.repeat(filled)
    emptyPart = emptyChar.repeat(barWidth - filled)
  } else {
    // Indeterminate: sliding block
    const blockSize = Math.min(INDETERMINATE_BLOCK_SIZE, barWidth)
    const pos = Math.max(0, Math.min(bouncePos, barWidth - blockSize))
    filledPart = emptyChar.repeat(pos) + fillChar.repeat(blockSize)
    emptyPart = emptyChar.repeat(barWidth - pos - blockSize)
  }

  const pct = isDeterminate ? Math.round(Math.max(0, Math.min(1, value)) * 100) : 0

  return (
    <Box>
      {label && <Text>{label} </Text>}
      <Text color={color}>{filledPart}</Text>
      <Text dimColor>{emptyPart}</Text>
      {showPct && <Text>{String(pct).padStart(4)}%</Text>}
    </Box>
  )
}
