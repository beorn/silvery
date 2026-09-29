/**
 * Shared helper functions for silvery pipeline phases.
 */

import type { BoxProps } from "@silvery/ag/types"
import { getActiveLineHeight } from "../unicode"

/**
 * Get padding values from props.
 */
export function getPadding(props: BoxProps): {
  top: number
  bottom: number
  left: number
  right: number
} {
  return {
    top: props.paddingTop ?? props.paddingY ?? props.padding ?? 0,
    bottom: props.paddingBottom ?? props.paddingY ?? props.padding ?? 0,
    left: props.paddingLeft ?? props.paddingX ?? props.padding ?? 0,
    right: props.paddingRight ?? props.paddingX ?? props.padding ?? 0,
  }
}

/**
 * Get border size (1 or 0 for each side).
 * In pixel/canvas mode (lineHeight > 1), borders are visual-only (fillRoundedRect)
 * and don't affect content positioning — returns 0.
 */
export function getBorderSize(props: BoxProps): {
  top: number
  bottom: number
  left: number
  right: number
} {
  if (!props.borderStyle || getActiveLineHeight() > 1) {
    return { top: 0, bottom: 0, left: 0, right: 0 }
  }
  return {
    top: props.borderTop !== false ? 1 : 0,
    bottom: props.borderBottom !== false ? 1 : 0,
    left: props.borderLeft !== false ? 1 : 0,
    right: props.borderRight !== false ? 1 : 0,
  }
}
