/**
 * useGridPosition — auto-register an item's screen position in the PositionRegistry.
 *
 * Uses useScrollRect for zero-rerender position tracking.
 * Automatically unregisters on unmount (prevents stale entries).
 *
 * @example
 * ```tsx
 * function Item({ sectionIndex, itemIndex }) {
 *   useGridPosition(sectionIndex, itemIndex)
 *   return <Box>...</Box>
 * }
 * ```
 */

import { useEffect, useRef } from "react"
import { useScrollRect } from "./useLayout"
import { usePositionRegistry } from "./usePositionRegistry"

/**
 * Register the current component's screen position in the PositionRegistry.
 *
 * Must be called from within a Box (needs NodeContext for screen rect).
 * No-ops gracefully if no PositionRegistryProvider is present.
 */
export function useGridPosition(sectionIndex: number, itemIndex: number): void {
  const registry = usePositionRegistry()

  // Track current indices in refs so the cleanup function always has the latest values
  const sectionRef = useRef(sectionIndex)
  const itemRef = useRef(itemIndex)
  sectionRef.current = sectionIndex
  itemRef.current = itemIndex

  // Register position on every layout update (no re-renders)
  useScrollRect((rect) => {
    registry?.register(sectionRef.current, itemRef.current, rect)
  })

  // Unregister on unmount
  useEffect(() => {
    return () => {
      registry?.unregister(sectionRef.current, itemRef.current)
    }
  }, [registry])

  // If indices change, unregister old position
  useEffect(() => {
    return () => {
      registry?.unregister(sectionIndex, itemIndex)
    }
  }, [registry, sectionIndex, itemIndex])
}
