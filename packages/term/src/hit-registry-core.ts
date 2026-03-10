/**
 * Hit Registry Core — Pure logic for mouse hit testing.
 *
 * This module contains the React-free core of the hit registry:
 * types, registry class, z-index constants, and ID counter.
 *
 * React hooks and context live in ./hit-registry (which re-exports everything
 * from here plus adds useHitRegion, useHitRegionCallback, HitRegistryContext).
 *
 * The @silvery/term barrel imports from this file to stay React-free.
 * Consumers who need React hooks should import from @silvery/term/hit-registry.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Target type for hit testing.
 * Each type represents a different clickable element in the UI.
 */
export interface HitTarget {
  /** The type of element that was clicked */
  type: "node" | "fold-toggle" | "link" | "column-header" | "scroll-area" | "button";
  /** Column index (for column-header, or items within a column) */
  colIndex?: number;
  /** Card index within a column */
  cardIndex?: number;
  /** Sub-item index within a card (e.g., checklist items) */
  subIndex?: number;
  /** Node ID for node-specific targets */
  nodeId?: string;
  /** URL for link targets */
  linkUrl?: string;
  /** Custom action identifier */
  action?: string;
}

/**
 * A registered hit region with position, size, target, and z-index.
 */
export interface HitRegion {
  /** X position on screen (0-indexed column) */
  x: number;
  /** Y position on screen (0-indexed row) */
  y: number;
  /** Width in columns */
  width: number;
  /** Height in rows */
  height: number;
  /** The target to return when this region is clicked */
  target: HitTarget;
  /** Z-index for layering (higher values are on top) */
  zIndex: number;
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
  private regions = new Map<string, HitRegion>();

  /**
   * Register a hit region with a unique ID.
   *
   * @param id - Unique identifier for the region (used for unregistration)
   * @param region - The region definition including position, size, target, and z-index
   */
  register(id: string, region: HitRegion): void {
    this.regions.set(id, region);
  }

  /**
   * Unregister a hit region by ID.
   *
   * @param id - The ID used when registering the region
   */
  unregister(id: string): void {
    this.regions.delete(id);
  }

  /**
   * Clear all registered regions.
   * Useful when the UI is completely redrawn.
   */
  clear(): void {
    this.regions.clear();
  }

  /**
   * Get the number of registered regions.
   * Useful for debugging.
   */
  get size(): number {
    return this.regions.size;
  }

  /**
   * Test a screen position and return the highest z-index matching target.
   *
   * @param screenX - X position on screen (0-indexed column)
   * @param screenY - Y position on screen (0-indexed row)
   * @returns The target of the highest z-index region containing the point, or null if none
   */
  hitTest(screenX: number, screenY: number): HitTarget | null {
    let bestMatch: HitRegion | null = null;

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
          bestMatch = region;
        }
      }
    }

    return bestMatch?.target ?? null;
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
    const matches: HitRegion[] = [];

    for (const region of this.regions.values()) {
      if (
        screenX >= region.x &&
        screenX < region.x + region.width &&
        screenY >= region.y &&
        screenY < region.y + region.height
      ) {
        matches.push(region);
      }
    }

    // Sort by z-index descending (highest first)
    return matches.sort((a, b) => b.zIndex - a.zIndex);
  }

  /**
   * Debug helper: get all registered regions.
   */
  getAllRegions(): Map<string, HitRegion> {
    return new Map(this.regions);
  }
}

// ============================================================================
// ID Counter
// ============================================================================

/**
 * Generate a unique ID for hit region registration.
 */
let hitRegionIdCounter = 0;
export function generateHitRegionId(): string {
  return `hit-${++hitRegionIdCounter}`;
}

/**
 * Reset the ID counter (useful for testing).
 */
export function resetHitRegionIdCounter(): void {
  hitRegionIdCounter = 0;
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
} as const;
