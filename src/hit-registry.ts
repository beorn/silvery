/**
 * Hit Registry for Mouse Input
 *
 * Provides a registry for tracking clickable regions in the terminal UI.
 * Components register their screen positions, and mouse clicks are resolved
 * to the appropriate target based on position and z-index.
 *
 * The registry uses z-index ordering to handle overlapping elements:
 * - Dialogs (z-index 100+) take priority over cards
 * - Cards (z-index 10) take priority over background
 * - Background elements (z-index 0) are lowest priority
 */

import { createContext, useContext, useEffect, useRef } from "react"
import type { Rect } from "./types.js"

// ============================================================================
// Types
// ============================================================================

/**
 * Target type for hit testing.
 * Each type represents a different clickable element in the UI.
 */
export interface HitTarget {
  /** The type of element that was clicked */
  type: "node" | "fold-toggle" | "link" | "column-header" | "scroll-area" | "button"
  /** Column index (for column-header, or items within a column) */
  colIndex?: number
  /** Card index within a column */
  cardIndex?: number
  /** Sub-item index within a card (e.g., checklist items) */
  subIndex?: number
  /** Node ID for node-specific targets */
  nodeId?: string
  /** URL for link targets */
  linkUrl?: string
  /** Custom action identifier */
  action?: string
}

/**
 * A registered hit region with position, size, target, and z-index.
 */
export interface HitRegion {
  /** X position on screen (0-indexed column) */
  x: number
  /** Y position on screen (0-indexed row) */
  y: number
  /** Width in columns */
  width: number
  /** Height in rows */
  height: number
  /** The target to return when this region is clicked */
  target: HitTarget
  /** Z-index for layering (higher values are on top) */
  zIndex: number
}

// ============================================================================
// HitRegistry Class
// ============================================================================

/**
 * Registry for managing hit regions.
 *
 * Components register their screen regions with targets, and the registry
 * resolves mouse clicks to the appropriate target based on position and z-index.
 *
 * @example
 * ```typescript
 * const registry = new HitRegistry();
 *
 * // Register a card region
 * registry.register('card-1', {
 *   x: 10, y: 5, width: 30, height: 8,
 *   target: { type: 'node', nodeId: 'abc123' },
 *   zIndex: 10
 * });
 *
 * // Hit test a click
 * const target = registry.hitTest(15, 7);
 * // Returns { type: 'node', nodeId: 'abc123' }
 * ```
 */
export class HitRegistry {
  private regions = new Map<string, HitRegion>()

  /**
   * Register a hit region with a unique ID.
   *
   * @param id - Unique identifier for the region (used for unregistration)
   * @param region - The region definition including position, size, target, and z-index
   */
  register(id: string, region: HitRegion): void {
    this.regions.set(id, region)
  }

  /**
   * Unregister a hit region by ID.
   *
   * @param id - The ID used when registering the region
   */
  unregister(id: string): void {
    this.regions.delete(id)
  }

  /**
   * Clear all registered regions.
   * Useful when the UI is completely redrawn.
   */
  clear(): void {
    this.regions.clear()
  }

  /**
   * Get the number of registered regions.
   * Useful for debugging.
   */
  get size(): number {
    return this.regions.size
  }

  /**
   * Test a screen position and return the highest z-index matching target.
   *
   * @param screenX - X position on screen (0-indexed column)
   * @param screenY - Y position on screen (0-indexed row)
   * @returns The target of the highest z-index region containing the point, or null if none
   */
  hitTest(screenX: number, screenY: number): HitTarget | null {
    let bestMatch: HitRegion | null = null

    for (const region of this.regions.values()) {
      // Check if point is within region bounds
      if (
        screenX >= region.x &&
        screenX < region.x + region.width &&
        screenY >= region.y &&
        screenY < region.y + region.height
      ) {
        // Keep the highest z-index match
        if (!bestMatch || region.zIndex > bestMatch.zIndex) {
          bestMatch = region
        }
      }
    }

    return bestMatch?.target ?? null
  }

  /**
   * Get all regions that contain a point, sorted by z-index (highest first).
   * Useful for debugging or when you need to know all overlapping elements.
   *
   * @param screenX - X position on screen (0-indexed column)
   * @param screenY - Y position on screen (0-indexed row)
   * @returns Array of matching regions, sorted by z-index descending
   */
  hitTestAll(screenX: number, screenY: number): HitRegion[] {
    const matches: HitRegion[] = []

    for (const region of this.regions.values()) {
      if (
        screenX >= region.x &&
        screenX < region.x + region.width &&
        screenY >= region.y &&
        screenY < region.y + region.height
      ) {
        matches.push(region)
      }
    }

    // Sort by z-index descending (highest first)
    return matches.sort((a, b) => b.zIndex - a.zIndex)
  }

  /**
   * Debug helper: get all registered regions.
   */
  getAllRegions(): Map<string, HitRegion> {
    return new Map(this.regions)
  }
}

// ============================================================================
// React Context
// ============================================================================

/**
 * Context for accessing the HitRegistry.
 * Components use this to register their hit regions.
 */
export const HitRegistryContext = createContext<HitRegistry | null>(null)

// ============================================================================
// Hooks
// ============================================================================

/**
 * Generate a unique ID for hit region registration.
 */
let hitRegionIdCounter = 0
function generateHitRegionId(): string {
  return `hit-${++hitRegionIdCounter}`
}

/**
 * Reset the ID counter (useful for testing).
 */
export function resetHitRegionIdCounter(): void {
  hitRegionIdCounter = 0
}

/**
 * Hook to get the HitRegistry from context.
 *
 * @returns The HitRegistry instance, or null if not in a HitRegistryContext
 */
export function useHitRegistry(): HitRegistry | null {
  return useContext(HitRegistryContext)
}

/**
 * Hook to register a hit region based on component's screen position.
 *
 * Automatically registers on mount and when position changes,
 * and unregisters on unmount.
 *
 * @param target - The target to return when this region is clicked
 * @param rect - The screen rectangle (from useScreenRect or similar)
 * @param zIndex - Z-index for layering (default: 0)
 * @param enabled - Whether the region is active (default: true)
 *
 * @example
 * ```tsx
 * function Card({ nodeId }: { nodeId: string }) {
 *   const rect = useScreenRect();
 *
 *   useHitRegion(
 *     { type: 'node', nodeId },
 *     rect,
 *     10 // z-index for cards
 *   );
 *
 *   return <Box>...</Box>;
 * }
 * ```
 */
export function useHitRegion(target: HitTarget, rect: Rect | null, zIndex = 0, enabled = true): void {
  const registry = useContext(HitRegistryContext)
  const idRef = useRef<string | null>(null)

  // Generate stable ID on first use
  if (idRef.current === null) {
    idRef.current = generateHitRegionId()
  }

  useEffect(() => {
    if (!registry || !rect || !enabled) {
      // Clean up if disabled or no registry
      if (idRef.current && registry) {
        registry.unregister(idRef.current)
      }
      return
    }

    const id = idRef.current!

    // Register the region
    registry.register(id, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      target,
      zIndex,
    })

    // Cleanup on unmount or when dependencies change
    return () => {
      registry.unregister(id)
    }
  }, [registry, rect?.x, rect?.y, rect?.width, rect?.height, target, zIndex, enabled])
}

/**
 * Hook to register a hit region using a callback for screen position.
 *
 * Similar to useHitRegion but works with useScreenRectCallback for
 * better performance in large lists (avoids re-renders).
 *
 * @param target - The target to return when this region is clicked
 * @param zIndex - Z-index for layering (default: 0)
 * @param enabled - Whether the region is active (default: true)
 * @returns A callback to pass to useScreenRectCallback
 *
 * @example
 * ```tsx
 * function Card({ nodeId }: { nodeId: string }) {
 *   const onLayout = useHitRegionCallback(
 *     { type: 'node', nodeId },
 *     10 // z-index
 *   );
 *
 *   useScreenRectCallback(onLayout);
 *
 *   return <Box>...</Box>;
 * }
 * ```
 */
export function useHitRegionCallback(target: HitTarget, zIndex = 0, enabled = true): (rect: Rect) => void {
  const registry = useContext(HitRegistryContext)
  const idRef = useRef<string | null>(null)

  // Generate stable ID on first use
  if (idRef.current === null) {
    idRef.current = generateHitRegionId()
  }

  // Cleanup on unmount
  useEffect(() => {
    const id = idRef.current
    return () => {
      if (id && registry) {
        registry.unregister(id)
      }
    }
  }, [registry])

  // Return callback that updates the region
  return (rect: Rect) => {
    if (!registry || !enabled) {
      if (idRef.current && registry) {
        registry.unregister(idRef.current)
      }
      return
    }

    registry.register(idRef.current!, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      target,
      zIndex,
    })
  }
}

// ============================================================================
// Z-Index Constants
// ============================================================================

/**
 * Recommended z-index values for different UI layers.
 */
export const Z_INDEX = {
  /** Background elements */
  BACKGROUND: 0,
  /** Column headers */
  COLUMN_HEADER: 5,
  /** Cards in the main view */
  CARD: 10,
  /** Fold toggles (above cards for easier clicking) */
  FOLD_TOGGLE: 15,
  /** Links within cards */
  LINK: 20,
  /** Floating elements */
  FLOATING: 50,
  /** Modal dialogs */
  DIALOG: 100,
  /** Dropdown menus */
  DROPDOWN: 150,
  /** Tooltips */
  TOOLTIP: 200,
} as const
