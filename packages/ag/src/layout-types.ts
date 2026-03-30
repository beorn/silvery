/**
 * Layout Type Abstractions
 *
 * Pure type interfaces for layout engines (Yoga, Flexily, etc.)
 * These live in @silvery/ag because they're used by core types (AgNode).
 * The runtime layout engine management lives in @silvery/ag-term/layout-engine.
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
