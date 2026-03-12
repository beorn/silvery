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
 *
 * This module re-exports the pure core (types, class, constants) and adds
 * React hooks/context. Import from @silvery/term/hit-registry-core for the
 * React-free subset.
 */

import { createContext, useContext, useEffect, useRef } from "react"
import type { Rect } from "@silvery/tea/types"

// Re-export everything from core
export {
  HitRegistry,
  generateHitRegionId,
  resetHitRegionIdCounter,
  Z_INDEX,
} from "./hit-registry-core"
export type { HitTarget, HitRegion } from "./hit-registry-core"

// Import for local use
import {
  type HitTarget,
  type HitRegion,
  HitRegistry,
  generateHitRegionId,
} from "./hit-registry-core"

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
export function useHitRegion(
  target: HitTarget,
  rect: Rect | null,
  zIndex = 0,
  enabled = true,
): void {
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
export function useHitRegionCallback(
  target: HitTarget,
  zIndex = 0,
  enabled = true,
): (rect: Rect) => void {
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
