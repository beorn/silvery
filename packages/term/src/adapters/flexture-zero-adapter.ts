/**
 * Flexture Layout Engine Adapter
 *
 * Wraps Flexture to implement the LayoutEngine interface.
 * Uses the default zero-allocation algorithm from flexture.
 */

import {
  ALIGN_AUTO,
  ALIGN_BASELINE,
  ALIGN_CENTER,
  ALIGN_FLEX_END,
  ALIGN_FLEX_START,
  ALIGN_SPACE_AROUND,
  ALIGN_SPACE_BETWEEN,
  ALIGN_STRETCH,
  DIRECTION_LTR,
  DISPLAY_FLEX,
  DISPLAY_NONE,
  EDGE_ALL,
  EDGE_BOTTOM,
  EDGE_HORIZONTAL,
  EDGE_LEFT,
  EDGE_RIGHT,
  EDGE_TOP,
  EDGE_VERTICAL,
  // Constants
  FLEX_DIRECTION_COLUMN,
  FLEX_DIRECTION_COLUMN_REVERSE,
  FLEX_DIRECTION_ROW,
  FLEX_DIRECTION_ROW_REVERSE,
  Node as FlextureNode,
  GUTTER_ALL,
  JUSTIFY_CENTER,
  JUSTIFY_FLEX_END,
  JUSTIFY_FLEX_START,
  JUSTIFY_SPACE_AROUND,
  JUSTIFY_SPACE_BETWEEN,
  JUSTIFY_SPACE_EVENLY,
  MEASURE_MODE_AT_MOST,
  MEASURE_MODE_EXACTLY,
  MEASURE_MODE_UNDEFINED,
  OVERFLOW_HIDDEN,
  OVERFLOW_SCROLL,
  OVERFLOW_VISIBLE,
  POSITION_TYPE_ABSOLUTE,
  POSITION_TYPE_RELATIVE,
  WRAP_NO_WRAP,
  WRAP_WRAP,
  WRAP_WRAP_REVERSE,
} from "flexture"

import type {
  AlignValue,
  DirectionValue,
  DisplayValue,
  EdgeValue,
  FlexDirectionValue,
  GutterValue,
  JustifyValue,
  LayoutConstants,
  LayoutEngine,
  LayoutNode,
  MeasureFunc,
  MeasureMode,
  MeasureModeValue,
  OverflowValue,
  PositionTypeValue,
  WrapValue,
} from "../layout-engine"

// ============================================================================
// Flexture Zero Node Adapter
// ============================================================================

/**
 * Wraps a Flexture zero-alloc node to implement LayoutNode interface.
 * Since Flexture already has a Yoga-compatible API, this is mostly delegation.
 */
class FlextureZeroNodeAdapter implements LayoutNode {
  private node: FlextureNode

  constructor(node: FlextureNode) {
    this.node = node
  }

  /** Get the underlying Flexture node (for tree operations) */
  getFlextureNode(): FlextureNode {
    return this.node
  }

  // Tree operations
  insertChild(child: LayoutNode, index: number): void {
    const flextureChild = (child as FlextureZeroNodeAdapter).getFlextureNode()
    this.node.insertChild(flextureChild, index)
  }

  removeChild(child: LayoutNode): void {
    const flextureChild = (child as FlextureZeroNodeAdapter).getFlextureNode()
    this.node.removeChild(flextureChild)
  }

  free(): void {
    this.node.free()
  }

  // Measure function
  setMeasureFunc(measureFunc: MeasureFunc): void {
    this.node.setMeasureFunc((width, widthMode, height, heightMode) => {
      const widthModeStr = this.measureModeToString(widthMode)
      const heightModeStr = this.measureModeToString(heightMode)
      return measureFunc(width, widthModeStr, height, heightModeStr)
    })
  }

  // Dirty tracking - forces layout recalculation
  markDirty(): void {
    this.node.markDirty()
  }

  private measureModeToString(mode: number): MeasureMode {
    if (mode === MEASURE_MODE_EXACTLY) return "exactly"
    if (mode === MEASURE_MODE_AT_MOST) return "at-most"
    return "undefined"
  }

  // Dimension setters
  setWidth(value: number): void {
    this.node.setWidth(value)
  }
  setWidthPercent(value: number): void {
    this.node.setWidthPercent(value)
  }
  setWidthAuto(): void {
    this.node.setWidthAuto()
  }
  setHeight(value: number): void {
    this.node.setHeight(value)
  }
  setHeightPercent(value: number): void {
    this.node.setHeightPercent(value)
  }
  setHeightAuto(): void {
    this.node.setHeightAuto()
  }
  setMinWidth(value: number): void {
    this.node.setMinWidth(value)
  }
  setMinWidthPercent(value: number): void {
    this.node.setMinWidthPercent(value)
  }
  setMinHeight(value: number): void {
    this.node.setMinHeight(value)
  }
  setMinHeightPercent(value: number): void {
    this.node.setMinHeightPercent(value)
  }
  setMaxWidth(value: number): void {
    this.node.setMaxWidth(value)
  }
  setMaxWidthPercent(value: number): void {
    this.node.setMaxWidthPercent(value)
  }
  setMaxHeight(value: number): void {
    this.node.setMaxHeight(value)
  }
  setMaxHeightPercent(value: number): void {
    this.node.setMaxHeightPercent(value)
  }

  // Flex properties
  setFlexGrow(value: number): void {
    this.node.setFlexGrow(value)
  }
  setFlexShrink(value: number): void {
    this.node.setFlexShrink(value)
  }
  setFlexBasis(value: number): void {
    this.node.setFlexBasis(value)
  }
  setFlexBasisPercent(value: number): void {
    this.node.setFlexBasisPercent(value)
  }
  setFlexBasisAuto(): void {
    this.node.setFlexBasisAuto()
  }
  setFlexDirection(direction: number): void {
    this.node.setFlexDirection(direction)
  }
  setFlexWrap(wrap: number): void {
    this.node.setFlexWrap(wrap)
  }

  // Alignment
  setAlignItems(align: number): void {
    this.node.setAlignItems(align)
  }
  setAlignSelf(align: number): void {
    this.node.setAlignSelf(align)
  }
  setAlignContent(align: number): void {
    this.node.setAlignContent(align)
  }
  setJustifyContent(justify: number): void {
    this.node.setJustifyContent(justify)
  }

  // Spacing
  setPadding(edge: number, value: number): void {
    this.node.setPadding(edge, value)
  }
  setMargin(edge: number, value: number): void {
    this.node.setMargin(edge, value)
  }
  setBorder(edge: number, value: number): void {
    this.node.setBorder(edge, value)
  }
  setGap(gutter: number, value: number): void {
    this.node.setGap(gutter, value)
  }

  // Display & Position
  setDisplay(display: number): void {
    this.node.setDisplay(display)
  }
  setPositionType(positionType: number): void {
    this.node.setPositionType(positionType)
  }
  setOverflow(overflow: number): void {
    this.node.setOverflow(overflow)
  }

  // Layout calculation
  calculateLayout(width: number, height: number, direction?: number): void {
    this.node.calculateLayout(width, height, direction ?? DIRECTION_LTR)
  }

  // Layout results
  getComputedLeft(): number {
    return this.node.getComputedLeft()
  }
  getComputedTop(): number {
    return this.node.getComputedTop()
  }
  getComputedWidth(): number {
    return this.node.getComputedWidth()
  }
  getComputedHeight(): number {
    return this.node.getComputedHeight()
  }
}

// ============================================================================
// Flexture Zero Layout Engine
// ============================================================================

/**
 * Layout engine implementation using Flexture zero-allocation variant.
 * Optimized for high-frequency layout with reduced GC pressure.
 */
export class FlextureZeroLayoutEngine implements LayoutEngine {
  private _constants: LayoutConstants = {
    // Flex Direction (cast from Flexture's plain numbers to branded types)
    FLEX_DIRECTION_COLUMN: FLEX_DIRECTION_COLUMN as FlexDirectionValue,
    FLEX_DIRECTION_COLUMN_REVERSE: FLEX_DIRECTION_COLUMN_REVERSE as FlexDirectionValue,
    FLEX_DIRECTION_ROW: FLEX_DIRECTION_ROW as FlexDirectionValue,
    FLEX_DIRECTION_ROW_REVERSE: FLEX_DIRECTION_ROW_REVERSE as FlexDirectionValue,

    // Wrap
    WRAP_NO_WRAP: WRAP_NO_WRAP as WrapValue,
    WRAP_WRAP: WRAP_WRAP as WrapValue,
    WRAP_WRAP_REVERSE: WRAP_WRAP_REVERSE as WrapValue,

    // Align
    ALIGN_AUTO: ALIGN_AUTO as AlignValue,
    ALIGN_FLEX_START: ALIGN_FLEX_START as AlignValue,
    ALIGN_CENTER: ALIGN_CENTER as AlignValue,
    ALIGN_FLEX_END: ALIGN_FLEX_END as AlignValue,
    ALIGN_STRETCH: ALIGN_STRETCH as AlignValue,
    ALIGN_BASELINE: ALIGN_BASELINE as AlignValue,
    ALIGN_SPACE_BETWEEN: ALIGN_SPACE_BETWEEN as AlignValue,
    ALIGN_SPACE_AROUND: ALIGN_SPACE_AROUND as AlignValue,

    // Justify
    JUSTIFY_FLEX_START: JUSTIFY_FLEX_START as JustifyValue,
    JUSTIFY_CENTER: JUSTIFY_CENTER as JustifyValue,
    JUSTIFY_FLEX_END: JUSTIFY_FLEX_END as JustifyValue,
    JUSTIFY_SPACE_BETWEEN: JUSTIFY_SPACE_BETWEEN as JustifyValue,
    JUSTIFY_SPACE_AROUND: JUSTIFY_SPACE_AROUND as JustifyValue,
    JUSTIFY_SPACE_EVENLY: JUSTIFY_SPACE_EVENLY as JustifyValue,

    // Edge
    EDGE_LEFT: EDGE_LEFT as EdgeValue,
    EDGE_TOP: EDGE_TOP as EdgeValue,
    EDGE_RIGHT: EDGE_RIGHT as EdgeValue,
    EDGE_BOTTOM: EDGE_BOTTOM as EdgeValue,
    EDGE_HORIZONTAL: EDGE_HORIZONTAL as EdgeValue,
    EDGE_VERTICAL: EDGE_VERTICAL as EdgeValue,
    EDGE_ALL: EDGE_ALL as EdgeValue,

    // Gutter
    GUTTER_ALL: GUTTER_ALL as GutterValue,

    // Display
    DISPLAY_FLEX: DISPLAY_FLEX as DisplayValue,
    DISPLAY_NONE: DISPLAY_NONE as DisplayValue,

    // Position Type
    POSITION_TYPE_RELATIVE: POSITION_TYPE_RELATIVE as PositionTypeValue,
    POSITION_TYPE_ABSOLUTE: POSITION_TYPE_ABSOLUTE as PositionTypeValue,

    // Overflow
    OVERFLOW_VISIBLE: OVERFLOW_VISIBLE as OverflowValue,
    OVERFLOW_HIDDEN: OVERFLOW_HIDDEN as OverflowValue,
    OVERFLOW_SCROLL: OVERFLOW_SCROLL as OverflowValue,

    // Direction
    DIRECTION_LTR: DIRECTION_LTR as DirectionValue,

    // Measure Mode
    MEASURE_MODE_UNDEFINED: MEASURE_MODE_UNDEFINED as MeasureModeValue,
    MEASURE_MODE_EXACTLY: MEASURE_MODE_EXACTLY as MeasureModeValue,
    MEASURE_MODE_AT_MOST: MEASURE_MODE_AT_MOST as MeasureModeValue,
  }

  createNode(): LayoutNode {
    return new FlextureZeroNodeAdapter(FlextureNode.create())
  }

  get constants(): LayoutConstants {
    return this._constants
  }

  get name(): string {
    return "flexture-zero"
  }
}

// ============================================================================
// Initialization Helper
// ============================================================================

/**
 * Create a Flexture zero-allocation layout engine.
 * Unlike Yoga, Flexture doesn't require async initialization.
 */
export function createFlextureZeroEngine(): FlextureZeroLayoutEngine {
  return new FlextureZeroLayoutEngine()
}
