/**
 * Position Registry — 2D grid position tracking with auto-cleanup.
 *
 * Tracks screen positions of items in a 2D grid (sections × items).
 * Items auto-register on mount via useScrollRect and auto-unregister
 * on unmount via useEffect cleanup. Eliminates stale-entry bugs.
 *
 * @example
 * ```tsx
 * <PositionRegistryProvider>
 *   {columns.map((col, i) => (
 *     <VirtualList items={col.items} renderItem={(item, idx) => (
 *       <GridCell sectionIndex={i} itemIndex={idx}>
 *         <Card {...item} />
 *       </GridCell>
 *     )} />
 *   ))}
 * </PositionRegistryProvider>
 * ```
 */

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { createLogger } from "loggily"

const log = createLogger("silvery:position-registry")

// =============================================================================
// Types
// =============================================================================

export interface ScrollRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Position registry for 2D grid layouts.
 *
 * Items are keyed by (sectionIndex, itemIndex). Positions are screen-relative
 * (accounting for scroll offsets) via useScrollRect.
 */
export interface PositionRegistry {
  // === Registration ===

  /** Register an item's screen position. Called automatically by GridCell/useGridPosition. */
  register(sectionIndex: number, itemIndex: number, rect: ScrollRect): void

  /** Remove an item's entry. Called automatically on unmount. */
  unregister(sectionIndex: number, itemIndex: number): void

  // === Queries ===

  /** Get an item's screen position, or undefined if not registered. */
  getPosition(sectionIndex: number, itemIndex: number): ScrollRect | undefined

  /** Check if a section has any registered items. */
  hasSection(sectionIndex: number): boolean

  /** Get count of registered items in a section. */
  getItemCount(sectionIndex: number): number

  // === Cross-axis navigation ===

  /**
   * Find the item in a section closest to a target Y position.
   *
   * Algorithm:
   * 1. If targetY falls inside an item's bounding box, return that item
   * 2. Otherwise, find the item whose midpoint is closest to targetY
   * 3. Return -1 if no items registered or targetY is above all items
   */
  findItemAtY(sectionIndex: number, targetY: number): number

  /**
   * Find the insertion slot in a section closest to targetY.
   * Slot 0 = before first item, slot N = after item N-1.
   */
  findInsertionSlot(sectionIndex: number, targetY: number): number

  // === Lifecycle ===

  /** Clear all positions. */
  clear(): void

  /** Dump registry state for debugging. */
  dump(): string
}

// =============================================================================
// Implementation
// =============================================================================

function createPositionRegistry(): PositionRegistry {
  // Map: sectionIndex -> Map<itemIndex, { rect: ScrollRect }>
  const sections = new Map<number, Map<number, { rect: ScrollRect }>>()

  const registry: PositionRegistry = {
    // === Registration ===

    register(sectionIndex: number, itemIndex: number, rect: ScrollRect): void {
      let sectionMap = sections.get(sectionIndex)
      if (!sectionMap) {
        sectionMap = new Map()
        sections.set(sectionIndex, sectionMap)
      }

      sectionMap.set(itemIndex, { rect })

      log.debug?.(`register sec=${sectionIndex} item=${itemIndex} y=${rect.y} h=${rect.height}`)
    },

    unregister(sectionIndex: number, itemIndex: number): void {
      const sectionMap = sections.get(sectionIndex)
      if (sectionMap) {
        sectionMap.delete(itemIndex)
        if (sectionMap.size === 0) {
          sections.delete(sectionIndex)
        }
        log.debug?.(`unregister sec=${sectionIndex} item=${itemIndex}`)
      }
    },

    // === Queries ===

    getPosition(sectionIndex: number, itemIndex: number): ScrollRect | undefined {
      return sections.get(sectionIndex)?.get(itemIndex)?.rect
    },

    hasSection(sectionIndex: number): boolean {
      const sectionMap = sections.get(sectionIndex)
      return sectionMap !== undefined && sectionMap.size > 0
    },

    getItemCount(sectionIndex: number): number {
      return sections.get(sectionIndex)?.size ?? 0
    },

    // === Cross-axis navigation ===

    findItemAtY(sectionIndex: number, targetY: number): number {
      const sectionMap = sections.get(sectionIndex)
      if (!sectionMap || sectionMap.size === 0) return -1

      // First pass: intersection with item bounding box
      for (const [idx, entry] of sectionMap) {
        const top = entry.rect.y
        const bottom = top + entry.rect.height
        if (targetY >= top && targetY < bottom) return idx
      }

      // Second pass: closest midpoint
      let closestIdx = -1
      let closestDist = Infinity
      for (const [idx, entry] of sectionMap) {
        const mid = entry.rect.y + entry.rect.height / 2
        const dist = Math.abs(mid - targetY)
        if (dist < closestDist) {
          closestDist = dist
          closestIdx = idx
        }
      }

      // If above all items, return -1 (section header)
      const firstEntry = sectionMap.get(0)
      if (firstEntry && targetY < firstEntry.rect.y) return -1

      return closestIdx
    },

    findInsertionSlot(sectionIndex: number, targetY: number): number {
      const sectionMap = sections.get(sectionIndex)
      if (!sectionMap || sectionMap.size === 0) return 0

      const sorted = Array.from(sectionMap.entries()).sort((a, b) => a[0] - b[0])

      for (let i = 0; i < sorted.length; i++) {
        const entry = sorted[i]!
        if (targetY < entry[1].rect.y) return i
      }

      return sorted.length
    },

    // === Lifecycle ===

    clear(): void {
      sections.clear()
      log.debug?.("cleared all positions")
    },

    dump(): string {
      const lines: string[] = []

      if (sections.size === 0) {
        lines.push("(no items registered)")
      } else {
        for (const [secIdx, sectionMap] of sections) {
          const entries = Array.from(sectionMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([idx, entry]) => `${idx}:y${entry.rect.y}:h${entry.rect.height}`)
            .join(", ")
          lines.push(`sec[${secIdx}]: ${entries}`)
        }
      }

      return lines.join("\n")
    },
  }

  return registry
}

// =============================================================================
// React Context
// =============================================================================

const PositionRegistryContext = createContext<PositionRegistry | null>(null)

/**
 * Provider that creates a PositionRegistry for descendant components.
 * Wrap the root of any 2D grid layout with this provider.
 */
export function PositionRegistryProvider({ children }: { children: ReactNode }) {
  const registry = useMemo(() => createPositionRegistry(), [])
  return (
    <PositionRegistryContext.Provider value={registry}>{children}</PositionRegistryContext.Provider>
  )
}

/**
 * Access the position registry from any descendant of PositionRegistryProvider.
 * Returns null if no provider is found (opt-in, no crash).
 */
export function usePositionRegistry(): PositionRegistry | null {
  return useContext(PositionRegistryContext)
}

// Export for testing
export { createPositionRegistry }
