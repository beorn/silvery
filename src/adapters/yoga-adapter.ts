/**
 * Yoga Layout Engine Adapter
 *
 * Wraps yoga-wasm-web to implement the LayoutEngine interface.
 */

import type {
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  Overflow,
  PositionType,
  Wrap,
  Yoga,
  Node as YogaNode,
} from "yoga-wasm-web"
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
} from "../layout-engine.js"

// ============================================================================
// Yoga Node Adapter
// ============================================================================

/**
 * Wraps a Yoga node to implement LayoutNode interface.
 */
class YogaNodeAdapter implements LayoutNode {
  private node: YogaNode
  private yoga: Yoga
  private hasMeasureFunc = false

  constructor(node: YogaNode, yoga: Yoga) {
    this.node = node
    this.yoga = yoga
  }

  /** Get the underlying Yoga node (for tree operations) */
  getYogaNode(): YogaNode {
    return this.node
  }

  // Tree operations
  insertChild(child: LayoutNode, index: number): void {
    const yogaChild = (child as YogaNodeAdapter).getYogaNode()
    this.node.insertChild(yogaChild, index)
  }

  removeChild(child: LayoutNode): void {
    const yogaChild = (child as YogaNodeAdapter).getYogaNode()
    this.node.removeChild(yogaChild)
  }

  free(): void {
    this.node.free()
  }

  // Measure function
  setMeasureFunc(measureFunc: MeasureFunc): void {
    this.hasMeasureFunc = true
    this.node.setMeasureFunc((width, widthMode, height, heightMode) => {
      const widthModeStr = this.measureModeToString(widthMode)
      const heightModeStr = this.measureModeToString(heightMode)
      return measureFunc(width, widthModeStr, height, heightModeStr)
    })
  }

  // Dirty tracking - forces layout recalculation
  // Yoga only allows markDirty() on leaf nodes with measure functions
  markDirty(): void {
    if (this.hasMeasureFunc) {
      this.node.markDirty()
    }
  }

  private measureModeToString(mode: number): MeasureMode {
    if (mode === this.yoga.MEASURE_MODE_EXACTLY) return "exactly"
    if (mode === this.yoga.MEASURE_MODE_AT_MOST) return "at-most"
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
    // LayoutEngine uses plain numbers; Yoga uses branded FlexDirection type
    this.node.setFlexDirection(direction as FlexDirection)
  }
  setFlexWrap(wrap: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded Wrap type
    this.node.setFlexWrap(wrap as Wrap)
  }

  // Alignment
  setAlignItems(align: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded Align type
    this.node.setAlignItems(align as Align)
  }
  setAlignSelf(align: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded Align type
    this.node.setAlignSelf(align as Align)
  }
  setAlignContent(align: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded Align type
    this.node.setAlignContent(align as Align)
  }
  setJustifyContent(justify: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded Justify type
    this.node.setJustifyContent(justify as Justify)
  }

  // Spacing
  setPadding(edge: number, value: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded Edge type
    this.node.setPadding(edge as Edge, value)
  }
  setMargin(edge: number, value: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded Edge type
    this.node.setMargin(edge as Edge, value)
  }
  setBorder(edge: number, value: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded Edge type
    this.node.setBorder(edge as Edge, value)
  }
  setGap(gutter: number, value: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded Gutter type
    this.node.setGap(gutter as Gutter, value)
  }

  // Display & Position
  setDisplay(display: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded Display type
    this.node.setDisplay(display as Display)
  }
  setPositionType(positionType: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded PositionType type
    this.node.setPositionType(positionType as PositionType)
  }
  setOverflow(overflow: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded Overflow type
    this.node.setOverflow(overflow as Overflow)
  }

  // Layout calculation
  calculateLayout(width: number, height: number, direction?: number): void {
    // LayoutEngine uses plain numbers; Yoga uses branded Direction type
    this.node.calculateLayout(width, height, (direction ?? this.yoga.DIRECTION_LTR) as Direction)
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
// Yoga Layout Engine
// ============================================================================

/**
 * Layout engine implementation using Yoga (WASM).
 */
export class YogaLayoutEngine implements LayoutEngine {
  private yoga: Yoga
  private _constants: LayoutConstants

  constructor(yoga: Yoga) {
    this.yoga = yoga
    // Cast Yoga's branded types to our LayoutEngine branded types at the adapter boundary
    this._constants = {
      // Flex Direction
      FLEX_DIRECTION_COLUMN: yoga.FLEX_DIRECTION_COLUMN as unknown as FlexDirectionValue,
      FLEX_DIRECTION_COLUMN_REVERSE: yoga.FLEX_DIRECTION_COLUMN_REVERSE as unknown as FlexDirectionValue,
      FLEX_DIRECTION_ROW: yoga.FLEX_DIRECTION_ROW as unknown as FlexDirectionValue,
      FLEX_DIRECTION_ROW_REVERSE: yoga.FLEX_DIRECTION_ROW_REVERSE as unknown as FlexDirectionValue,

      // Wrap
      WRAP_NO_WRAP: yoga.WRAP_NO_WRAP as unknown as WrapValue,
      WRAP_WRAP: yoga.WRAP_WRAP as unknown as WrapValue,
      WRAP_WRAP_REVERSE: yoga.WRAP_WRAP_REVERSE as unknown as WrapValue,

      // Align
      ALIGN_AUTO: yoga.ALIGN_AUTO as unknown as AlignValue,
      ALIGN_FLEX_START: yoga.ALIGN_FLEX_START as unknown as AlignValue,
      ALIGN_CENTER: yoga.ALIGN_CENTER as unknown as AlignValue,
      ALIGN_FLEX_END: yoga.ALIGN_FLEX_END as unknown as AlignValue,
      ALIGN_STRETCH: yoga.ALIGN_STRETCH as unknown as AlignValue,
      ALIGN_BASELINE: yoga.ALIGN_BASELINE as unknown as AlignValue,
      ALIGN_SPACE_BETWEEN: yoga.ALIGN_SPACE_BETWEEN as unknown as AlignValue,
      ALIGN_SPACE_AROUND: yoga.ALIGN_SPACE_AROUND as unknown as AlignValue,

      // Justify
      JUSTIFY_FLEX_START: yoga.JUSTIFY_FLEX_START as unknown as JustifyValue,
      JUSTIFY_CENTER: yoga.JUSTIFY_CENTER as unknown as JustifyValue,
      JUSTIFY_FLEX_END: yoga.JUSTIFY_FLEX_END as unknown as JustifyValue,
      JUSTIFY_SPACE_BETWEEN: yoga.JUSTIFY_SPACE_BETWEEN as unknown as JustifyValue,
      JUSTIFY_SPACE_AROUND: yoga.JUSTIFY_SPACE_AROUND as unknown as JustifyValue,
      JUSTIFY_SPACE_EVENLY: yoga.JUSTIFY_SPACE_EVENLY as unknown as JustifyValue,

      // Edge
      EDGE_LEFT: yoga.EDGE_LEFT as unknown as EdgeValue,
      EDGE_TOP: yoga.EDGE_TOP as unknown as EdgeValue,
      EDGE_RIGHT: yoga.EDGE_RIGHT as unknown as EdgeValue,
      EDGE_BOTTOM: yoga.EDGE_BOTTOM as unknown as EdgeValue,
      EDGE_HORIZONTAL: yoga.EDGE_HORIZONTAL as unknown as EdgeValue,
      EDGE_VERTICAL: yoga.EDGE_VERTICAL as unknown as EdgeValue,
      EDGE_ALL: yoga.EDGE_ALL as unknown as EdgeValue,

      // Gutter
      GUTTER_ALL: yoga.GUTTER_ALL as unknown as GutterValue,

      // Display
      DISPLAY_FLEX: yoga.DISPLAY_FLEX as unknown as DisplayValue,
      DISPLAY_NONE: yoga.DISPLAY_NONE as unknown as DisplayValue,

      // Position Type
      POSITION_TYPE_RELATIVE: yoga.POSITION_TYPE_RELATIVE as unknown as PositionTypeValue,
      POSITION_TYPE_ABSOLUTE: yoga.POSITION_TYPE_ABSOLUTE as unknown as PositionTypeValue,

      // Overflow
      OVERFLOW_VISIBLE: yoga.OVERFLOW_VISIBLE as unknown as OverflowValue,
      OVERFLOW_HIDDEN: yoga.OVERFLOW_HIDDEN as unknown as OverflowValue,
      OVERFLOW_SCROLL: yoga.OVERFLOW_SCROLL as unknown as OverflowValue,

      // Direction
      DIRECTION_LTR: yoga.DIRECTION_LTR as unknown as DirectionValue,

      // Measure Mode
      MEASURE_MODE_UNDEFINED: yoga.MEASURE_MODE_UNDEFINED as unknown as MeasureModeValue,
      MEASURE_MODE_EXACTLY: yoga.MEASURE_MODE_EXACTLY as unknown as MeasureModeValue,
      MEASURE_MODE_AT_MOST: yoga.MEASURE_MODE_AT_MOST as unknown as MeasureModeValue,
    }
  }

  createNode(): LayoutNode {
    return new YogaNodeAdapter(this.yoga.Node.create(), this.yoga)
  }

  get constants(): LayoutConstants {
    return this._constants
  }

  get name(): string {
    return "yoga"
  }
}

// ============================================================================
// Initialization Helper
// ============================================================================

/**
 * Create a Yoga layout engine from an initialized Yoga instance.
 */
export function createYogaEngine(yoga: Yoga): YogaLayoutEngine {
  return new YogaLayoutEngine(yoga)
}

/**
 * Initialize Yoga and create a layout engine.
 * Uses yoga-wasm-web/auto which automatically selects the right implementation.
 */
export async function initYogaEngine(): Promise<YogaLayoutEngine> {
  const { default: yoga } = (await import("yoga-wasm-web/auto")) as {
    default: Yoga
  }
  return new YogaLayoutEngine(yoga)
}
