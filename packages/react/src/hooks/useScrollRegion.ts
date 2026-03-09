/**
 * useScrollRegion - Terminal scroll region optimization hook.
 *
 * When scroll offset changes, instead of re-rendering the entire
 * scroll area, this hook uses DECSTBM to shift content natively
 * and only the newly revealed rows need repainting.
 */

import { useEffect, useRef } from "react"
import {
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  supportsScrollRegions,
} from "@silvery/term/scroll-region"

export interface UseScrollRegionOptions {
  /** Top row of scroll area (0-indexed screen coordinates). */
  top: number
  /** Bottom row of scroll area (0-indexed screen coordinates). */
  bottom: number
  /** Current scroll offset. */
  scrollOffset: number
  /** Whether to enable optimization (default: auto-detect). */
  enabled?: boolean
  /** Stream to write to (default: process.stdout). */
  stdout?: NodeJS.WriteStream
}

export interface UseScrollRegionResult {
  /** Whether scroll region optimization is active. */
  isActive: boolean
  /** Scroll delta since last render (-N = up, +N = down). */
  scrollDelta: number
}

/**
 * Hook that uses terminal scroll regions to optimize scrolling.
 *
 * When scroll offset changes, instead of re-rendering the entire
 * scroll area, this hook uses DECSTBM to shift content natively
 * and only renders the newly revealed rows.
 *
 * Returns the scroll delta so the renderer can decide what to repaint.
 */
export function useScrollRegion(options: UseScrollRegionOptions): UseScrollRegionResult {
  const { top, bottom, scrollOffset, stdout = process.stdout } = options
  const enabled = options.enabled ?? supportsScrollRegions()

  const prevOffsetRef = useRef(scrollOffset)

  const delta = scrollOffset - prevOffsetRef.current

  useEffect(() => {
    if (!enabled || delta === 0) {
      prevOffsetRef.current = scrollOffset
      return
    }

    // DECSTBM uses 1-indexed rows
    const topRow = top + 1
    const bottomRow = bottom + 1

    setScrollRegion(stdout, topRow, bottomRow)

    if (delta > 0) {
      // Scrolling down: content shifts up, new rows appear at bottom
      scrollUp(stdout, delta)
    } else {
      // Scrolling up: content shifts down, new rows appear at top
      scrollDown(stdout, -delta)
    }

    // Reset scroll region to full terminal after the operation
    resetScrollRegion(stdout)

    prevOffsetRef.current = scrollOffset
  }, [enabled, delta, scrollOffset, top, bottom, stdout])

  // Clean up scroll region on unmount
  useEffect(() => {
    if (!enabled) return
    return () => {
      resetScrollRegion(stdout)
    }
  }, [enabled, stdout])

  return {
    isActive: enabled,
    scrollDelta: delta,
  }
}
