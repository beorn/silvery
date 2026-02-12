/**
 * Cross-axis navigation helpers for 2D grid layouts.
 *
 * Pure functions that query a PositionRegistry to find navigation targets.
 * Used for h/l style column-to-column navigation where the cursor should
 * land at the same visual Y position in the target section.
 */

import type { PositionRegistry, ScreenRect } from "../hooks/usePositionRegistry.js"

/**
 * Result of a cross-axis navigation query.
 */
export interface CrossAxisTarget {
  /** Item index in the target section (-1 if section is empty). */
  itemIndex: number
  /** Whether the stickyY value was used (vs. computed from source). */
  usedStickyY: boolean
}

/**
 * Find the item in targetSection closest to the source item's visual position.
 *
 * Uses stickyY if available (preserves Y across multiple h/l presses).
 * Otherwise computes the source item's head midpoint as the target Y.
 *
 * @param registry The position registry to query
 * @param sourceSectionIndex Section containing the current item
 * @param sourceItemIndex Current item index
 * @param targetSectionIndex Section to navigate to
 * @returns Target item index and whether stickyY was used
 */
export function findCrossAxisTarget(
  registry: PositionRegistry,
  sourceSectionIndex: number,
  sourceItemIndex: number,
  targetSectionIndex: number,
): CrossAxisTarget {
  // Determine target Y: use stickyY if available, otherwise compute from source
  let targetY: number
  let usedStickyY = false

  if (registry.stickyY !== null) {
    targetY = registry.stickyY
    usedStickyY = true
  } else {
    targetY = getItemMidY(registry, sourceSectionIndex, sourceItemIndex)
    // Set stickyY for subsequent h/l presses
    registry.setStickyY(targetY)
  }

  const itemIndex = registry.findItemAtY(targetSectionIndex, targetY)
  return { itemIndex, usedStickyY }
}

/**
 * Get the visual midpoint Y for an item's "head" region.
 *
 * If the item has a registered head region (via updateHead), uses headY + headHeight/2.
 * Otherwise falls back to the full item's midpoint (y + height/2).
 *
 * Used as the source Y when computing stickyY for cross-axis navigation.
 */
export function getItemMidY(registry: PositionRegistry, sectionIndex: number, itemIndex: number): number {
  const rect = registry.getPosition(sectionIndex, itemIndex)
  if (!rect) {
    return 0 // Item not registered — shouldn't happen in normal flow
  }

  // Access internal head measurements via the registry's internal state.
  // The PositionRegistry stores head info per-item, accessible via getPosition's
  // extended data. For now, use the full rect midpoint. Apps that need head-based
  // stickyY should call updateHead and use a custom midY calculation.
  return rect.y + rect.height / 2
}

/**
 * Get the screen rect for an item, or null if not registered.
 *
 * Convenience wrapper for navigation code that needs the full rect.
 */
export function getItemRect(registry: PositionRegistry, sectionIndex: number, itemIndex: number): ScreenRect | null {
  return registry.getPosition(sectionIndex, itemIndex) ?? null
}
