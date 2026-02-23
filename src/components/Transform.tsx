/**
 * Inkx Transform Component
 *
 * Applies a string transformation to each line of rendered text output.
 * Compatible with ink's Transform component.
 *
 * Transform must be applied only to Text children and should not change
 * the dimensions of the output — otherwise layout will be incorrect.
 *
 * @example
 * ```tsx
 * import { Transform, Text } from 'inkx'
 *
 * // Uppercase all text
 * <Transform transform={output => output.toUpperCase()}>
 *   <Text>Hello World</Text>
 * </Transform>
 *
 * // Add line numbers
 * <Transform transform={(line, index) => `${index + 1}: ${line}`}>
 *   <Text>First line{'\n'}Second line</Text>
 * </Transform>
 * ```
 */

import type { JSX, ReactNode } from "react"

// ============================================================================
// Props
// ============================================================================

export interface TransformProps {
  /** Function that transforms each line of output */
  transform: (line: string, index: number) => string
  /** Text content (string, number, or nested Text elements) */
  children?: ReactNode
}

// ============================================================================
// Component
// ============================================================================

/**
 * Transform applies a string transform to rendered text output.
 *
 * Works by passing `internal_transform` to the underlying `inkx-text` host
 * element, which the render pipeline applies to each formatted line.
 */
export function Transform({ transform, children }: TransformProps): JSX.Element | null {
  if (children === undefined || children === null) {
    return null
  }

  return <inkx-text internal_transform={transform}>{children}</inkx-text>
}
