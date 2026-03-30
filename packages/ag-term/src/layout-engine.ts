/**
 * Layout Engine Abstraction
 *
 * Provides a pluggable interface for layout engines (Yoga, Flexily, etc.)
 * This allows silvery to use different layout backends without code changes.
 *
 * Core type interfaces (LayoutNode, MeasureFunc, MeasureMode) live in
 * @silvery/ag/layout-types and are re-exported here for backward compatibility.
 */

// Re-export core layout types from ag (canonical location)
export type { MeasureMode, MeasureFunc, LayoutNode } from "@silvery/ag/layout-types"
import type { LayoutNode } from "@silvery/ag/layout-types"

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/**
 * Branded types prevent accidentally mixing up layout constant categories.
 * E.g., you can't pass an AlignValue where a FlexDirectionValue is expected.
 */
export type FlexDirectionValue = number & { readonly __brand: "FlexDirection" }
export type WrapValue = number & { readonly __brand: "Wrap" }
export type AlignValue = number & { readonly __brand: "Align" }
export type JustifyValue = number & { readonly __brand: "Justify" }
export type EdgeValue = number & { readonly __brand: "Edge" }
export type GutterValue = number & { readonly __brand: "Gutter" }
export type DisplayValue = number & { readonly __brand: "Display" }
export type PositionTypeValue = number & { readonly __brand: "PositionType" }
export type OverflowValue = number & { readonly __brand: "Overflow" }
export type DirectionValue = number & { readonly __brand: "Direction" }
export type MeasureModeValue = number & { readonly __brand: "MeasureMode" }

// ============================================================================
// Layout Constants Interface
// ============================================================================

/**
 * Constants for layout configuration.
 * These are the same across Yoga and Flexily.
 * Uses branded types for compile-time safety.
 */
export interface LayoutConstants {
  // Flex Direction
  FLEX_DIRECTION_COLUMN: FlexDirectionValue
  FLEX_DIRECTION_COLUMN_REVERSE: FlexDirectionValue
  FLEX_DIRECTION_ROW: FlexDirectionValue
  FLEX_DIRECTION_ROW_REVERSE: FlexDirectionValue

  // Wrap
  WRAP_NO_WRAP: WrapValue
  WRAP_WRAP: WrapValue
  WRAP_WRAP_REVERSE: WrapValue

  // Align
  ALIGN_AUTO: AlignValue
  ALIGN_FLEX_START: AlignValue
  ALIGN_CENTER: AlignValue
  ALIGN_FLEX_END: AlignValue
  ALIGN_STRETCH: AlignValue
  ALIGN_BASELINE: AlignValue
  ALIGN_SPACE_BETWEEN: AlignValue
  ALIGN_SPACE_AROUND: AlignValue
  ALIGN_SPACE_EVENLY: AlignValue

  // Justify
  JUSTIFY_FLEX_START: JustifyValue
  JUSTIFY_CENTER: JustifyValue
  JUSTIFY_FLEX_END: JustifyValue
  JUSTIFY_SPACE_BETWEEN: JustifyValue
  JUSTIFY_SPACE_AROUND: JustifyValue
  JUSTIFY_SPACE_EVENLY: JustifyValue

  // Edge
  EDGE_LEFT: EdgeValue
  EDGE_TOP: EdgeValue
  EDGE_RIGHT: EdgeValue
  EDGE_BOTTOM: EdgeValue
  EDGE_HORIZONTAL: EdgeValue
  EDGE_VERTICAL: EdgeValue
  EDGE_ALL: EdgeValue

  // Gutter
  GUTTER_COLUMN: GutterValue
  GUTTER_ROW: GutterValue
  GUTTER_ALL: GutterValue

  // Display
  DISPLAY_FLEX: DisplayValue
  DISPLAY_NONE: DisplayValue

  // Position Type
  POSITION_TYPE_STATIC: PositionTypeValue
  POSITION_TYPE_RELATIVE: PositionTypeValue
  POSITION_TYPE_ABSOLUTE: PositionTypeValue

  // Overflow
  OVERFLOW_VISIBLE: OverflowValue
  OVERFLOW_HIDDEN: OverflowValue
  OVERFLOW_SCROLL: OverflowValue

  // Direction
  DIRECTION_LTR: DirectionValue

  // Measure Mode
  MEASURE_MODE_UNDEFINED: MeasureModeValue
  MEASURE_MODE_EXACTLY: MeasureModeValue
  MEASURE_MODE_AT_MOST: MeasureModeValue
}

// ============================================================================
// Layout Engine Interface
// ============================================================================

/**
 * Abstract layout engine interface.
 * Implementations can wrap Yoga, Flexily, or other layout engines.
 */
export interface LayoutEngine {
  /** Create a new layout node */
  createNode(): LayoutNode

  /** Layout constants for this engine */
  readonly constants: LayoutConstants

  /** Engine name for debugging */
  readonly name: string
}

// ============================================================================
// Global Layout Engine Management
// ============================================================================

let layoutEngine: LayoutEngine | null = null

/**
 * Set the global layout engine instance.
 * Must be called before rendering.
 */
export function setLayoutEngine(engine: LayoutEngine): void {
  layoutEngine = engine
}

/**
 * Get the global layout engine instance.
 * Throws if not initialized.
 */
export function getLayoutEngine(): LayoutEngine {
  if (!layoutEngine) {
    throw new Error("Layout engine not initialized. Call setLayoutEngine() or initYoga()/initFlexily() first.")
  }
  return layoutEngine
}

/**
 * Check if a layout engine is initialized.
 */
export function isLayoutEngineInitialized(): boolean {
  return layoutEngine !== null
}

/**
 * Get the layout constants from the current engine.
 * Convenience function for accessing constants.
 */
export function getConstants(): LayoutConstants {
  return getLayoutEngine().constants
}

// ============================================================================
// Default Engine Initialization
// ============================================================================

/**
 * Layout engine type for configuration.
 *
 * - 'flexily': Zero-allocation Flexily (default, optimized for high-frequency layout)
 * - 'flexily-classic': Classic Flexily algorithm (for debugging/compatibility)
 * - 'yoga': Facebook's WASM-based flexbox (most mature)
 */
export type LayoutEngineType = "flexily" | "yoga"

/**
 * Initialize the layout engine if not already set.
 *
 * @param engineType - 'flexily', 'flexily-classic', or 'yoga'. If not provided, checks
 *                     SILVERY_ENGINE env var, then defaults to 'flexily'.
 */
export async function ensureDefaultLayoutEngine(engineType?: LayoutEngineType): Promise<void> {
  if (isLayoutEngineInitialized()) {
    return
  }

  // Resolve engine type: option → env → 'flexily'
  const resolved = engineType ?? (process.env.SILVERY_ENGINE?.toLowerCase() as LayoutEngineType) ?? "flexily"

  if (resolved === "yoga") {
    const { initYogaEngine } = await import("./adapters/yoga-adapter.js")
    setLayoutEngine(await initYogaEngine())
  } else {
    // 'flexily' (default) uses zero-allocation engine
    const { createFlexilyZeroEngine } = await import("./adapters/flexily-zero-adapter.js")
    setLayoutEngine(createFlexilyZeroEngine())
  }
}
