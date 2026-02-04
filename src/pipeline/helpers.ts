/**
 * Shared helper functions for inkx pipeline phases.
 */

import type { BoxProps } from "../types.js"

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
 */
export function getBorderSize(props: BoxProps): {
  top: number
  bottom: number
  left: number
  right: number
} {
  if (!props.borderStyle) {
    return { top: 0, bottom: 0, left: 0, right: 0 }
  }
  return {
    top: props.borderTop !== false ? 1 : 0,
    bottom: props.borderBottom !== false ? 1 : 0,
    left: props.borderLeft !== false ? 1 : 0,
    right: props.borderRight !== false ? 1 : 0,
  }
}
