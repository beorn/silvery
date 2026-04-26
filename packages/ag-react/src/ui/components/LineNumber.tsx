/**
 * LineNumber Component
 *
 * A right-aligned, fixed-width line-number column. Use as a gutter
 * primitive for code blocks, diffs, search results, or any rendered
 * source where lines should be addressable.
 *
 * Usage:
 * ```tsx
 * {lines.map((line, i) => (
 *   <Box key={i}>
 *     <LineNumber n={i + 1} width={4} />
 *     <Text> {line}</Text>
 *   </Box>
 * ))}
 * ```
 *
 * Width auto-derives from `n` when omitted (`String(n).length`). Use
 * an explicit `width` when stacking many rows so the gutter doesn't
 * jiggle as the number of digits grows.
 */
import React from "react"
import { Box } from "../../components/Box"
import type { BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"

// =============================================================================
// Types
// =============================================================================

export interface LineNumberProps extends Omit<BoxProps, "children"> {
  /** Line number (1-indexed by convention). */
  n: number
  /** Fixed width for the column. Auto-derives from `n` when omitted. */
  width?: number
  /** Highlight this row (e.g. cursor or focus). */
  highlight?: boolean
}

// =============================================================================
// Component
// =============================================================================

export function LineNumber({ n, width, highlight, ...rest }: LineNumberProps): React.ReactElement {
  const text = String(n)
  const w = width ?? text.length
  const padded = text.padStart(w, " ")
  return (
    <Box {...rest}>
      <Text color={highlight ? "$primary" : "$muted"}>{padded}</Text>
    </Box>
  )
}
