/**
 * Layout Engine Abstraction
 *
 * Provides a pluggable interface for layout engines (Yoga, Flexily, etc.)
 * This allows silvery to use different layout backends without code changes.
 */

// ============================================================================
// Measure Function Types
// ============================================================================

/**
 * Measure mode determines how the width/height constraint should be interpreted.
 */
export type MeasureMode = "undefined" | "exactly" | "at-most"

/**
 * Measure function callback for intrinsic sizing.
 * Called when a node needs to determine its size based on content.
 */
export type MeasureFunc = (
  width: number,
  widthMode: MeasureMode,
  height: number,
  heightMode: MeasureMode,
) => { width: number; height: number }

// ============================================================================
// Layout Node Interface
// ============================================================================

/**
 * Abstract layout node interface.
 * Represents a single node in the layout tree.
 */
export interface LayoutNode {
  // Tree operations
  insertChild(child: LayoutNode, index: number): void
  removeChild(child: LayoutNode): void
  free(): void

  // Measure function
  setMeasureFunc(measureFunc: MeasureFunc): void

  // Dirty tracking
  markDirty(): void

  // Dimension setters
  setWidth(value: number): void
  setWidthPercent(value: number): void
  setWidthAuto(): void
  setHeight(value: number): void
  setHeightPercent(value: number): void
  setHeightAuto(): void
  setMinWidth(value: number): void
  setMinWidthPercent(value: number): void
  setMinHeight(value: number): void
  setMinHeightPercent(value: number): void
  setMaxWidth(value: number): void
  setMaxWidthPercent(value: number): void
  setMaxHeight(value: number): void
  setMaxHeightPercent(value: number): void

  // Flex properties
  setFlexGrow(value: number): void
  setFlexShrink(value: number): void
  setFlexBasis(value: number): void
  setFlexBasisPercent(value: number): void
  setFlexBasisAuto(): void
  setFlexDirection(direction: number): void
  setFlexWrap(wrap: number): void

  // Alignment
  setAlignItems(align: number): void
  setAlignSelf(align: number): void
  setAlignContent(align: number): void
  setJustifyContent(justify: number): void

  // Spacing
  setPadding(edge: number, value: number): void
  setMargin(edge: number, value: number): void
  setBorder(edge: number, value: number): void
  setGap(gutter: number, value: number): void

  // Display & Position
  setDisplay(display: number): void
  setPositionType(positionType: number): void
  setPosition(edge: number, value: number): void
  setPositionPercent(edge: number, value: number): void
  setOverflow(overflow: number): void

  // Aspect Ratio
  setAspectRatio(value: number): void

  // Layout calculation
  calculateLayout(width: number, height: number, direction?: number): void

  // Layout results
  getComputedLeft(): number
  getComputedTop(): number
  getComputedWidth(): number
  getComputedHeight(): number
}

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
    throw new Error(
      "Layout engine not initialized. Call setLayoutEngine() or initYoga()/initFlexily() first.",
    )
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
  const resolved =
    engineType ?? (process.env.SILVERY_ENGINE?.toLowerCase() as LayoutEngineType) ?? "flexily"

  if (resolved === "yoga") {
    const { initYogaEngine } = await import("./adapters/yoga-adapter.js")
    setLayoutEngine(await initYogaEngine())
  } else {
    // 'flexily' (default) uses zero-allocation engine
    const { createFlexilyZeroEngine } = await import("./adapters/flexily-zero-adapter.js")
    setLayoutEngine(createFlexilyZeroEngine())
  }
}
