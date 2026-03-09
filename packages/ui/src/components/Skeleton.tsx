/**
 * Skeleton Component
 *
 * Loading placeholder with configurable dimensions and shape.
 * Renders a block of placeholder characters to indicate content
 * that is loading or not yet available.
 *
 * Usage:
 * ```tsx
 * <Skeleton width={20} />
 * <Skeleton width={30} height={3} />
 * <Skeleton width={10} shape="circle" />
 * ```
 */
import React from "react"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

// =============================================================================
// Types
// =============================================================================

export interface SkeletonProps {
  /** Width in columns (default: 20) */
  width?: number
  /** Height in rows (default: 1) */
  height?: number
  /** Placeholder character (default: "░") */
  char?: string
  /** Shape hint: "line" for single-line, "block" for multi-line (default: auto from height) */
  shape?: "line" | "block" | "circle"
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_WIDTH = 20
const DEFAULT_CHAR = "░"

// =============================================================================
// Component
// =============================================================================

/**
 * Loading placeholder skeleton.
 *
 * Renders a dimmed block of placeholder characters. Use `width` and `height`
 * to match the expected content dimensions. The `circle` shape renders
 * a shorter, centered row for avatar-style placeholders.
 */
export function Skeleton({
  width = DEFAULT_WIDTH,
  height: heightProp,
  char = DEFAULT_CHAR,
  shape,
}: SkeletonProps): React.ReactElement {
  const resolvedShape = shape ?? (heightProp && heightProp > 1 ? "block" : "line")
  const height = heightProp ?? (resolvedShape === "circle" ? 1 : 1)

  if (resolvedShape === "circle") {
    // Render a centered shorter line to suggest a circular avatar
    const circleWidth = Math.min(width, 6)
    const pad = Math.max(0, Math.floor((width - circleWidth) / 2))
    return (
      <Box>
        <Text color="$muted">
          {" ".repeat(pad)}
          {char.repeat(circleWidth)}
        </Text>
      </Box>
    )
  }

  const line = char.repeat(width)
  const rows = Array.from({ length: height }, (_, i) => i)

  return (
    <Box flexDirection="column">
      {rows.map((i) => (
        <Text key={i} color="$muted">
          {line}
        </Text>
      ))}
    </Box>
  )
}
