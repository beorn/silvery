/**
 * Layout Engine Abstraction
 *
 * Provides a pluggable interface for layout engines (Yoga, Flexx, etc.)
 * This allows inkx to use different layout backends without code changes.
 */

// ============================================================================
// Measure Function Types
// ============================================================================

/**
 * Measure mode determines how the width/height constraint should be interpreted.
 */
export type MeasureMode = 'undefined' | 'exactly' | 'at-most';

/**
 * Measure function callback for intrinsic sizing.
 * Called when a node needs to determine its size based on content.
 */
export type MeasureFunc = (
	width: number,
	widthMode: MeasureMode,
	height: number,
	heightMode: MeasureMode,
) => { width: number; height: number };

// ============================================================================
// Layout Node Interface
// ============================================================================

/**
 * Abstract layout node interface.
 * Represents a single node in the layout tree.
 */
export interface LayoutNode {
	// Tree operations
	insertChild(child: LayoutNode, index: number): void;
	removeChild(child: LayoutNode): void;
	free(): void;

	// Measure function
	setMeasureFunc(measureFunc: MeasureFunc): void;

	// Dimension setters
	setWidth(value: number): void;
	setWidthPercent(value: number): void;
	setWidthAuto(): void;
	setHeight(value: number): void;
	setHeightPercent(value: number): void;
	setHeightAuto(): void;
	setMinWidth(value: number): void;
	setMinWidthPercent(value: number): void;
	setMinHeight(value: number): void;
	setMinHeightPercent(value: number): void;
	setMaxWidth(value: number): void;
	setMaxWidthPercent(value: number): void;
	setMaxHeight(value: number): void;
	setMaxHeightPercent(value: number): void;

	// Flex properties
	setFlexGrow(value: number): void;
	setFlexShrink(value: number): void;
	setFlexBasis(value: number): void;
	setFlexBasisPercent(value: number): void;
	setFlexBasisAuto(): void;
	setFlexDirection(direction: number): void;
	setFlexWrap(wrap: number): void;

	// Alignment
	setAlignItems(align: number): void;
	setAlignSelf(align: number): void;
	setAlignContent(align: number): void;
	setJustifyContent(justify: number): void;

	// Spacing
	setPadding(edge: number, value: number): void;
	setMargin(edge: number, value: number): void;
	setBorder(edge: number, value: number): void;
	setGap(gutter: number, value: number): void;

	// Display & Position
	setDisplay(display: number): void;
	setPositionType(positionType: number): void;
	setOverflow(overflow: number): void;

	// Layout calculation
	calculateLayout(width: number, height: number, direction?: number): void;

	// Layout results
	getComputedLeft(): number;
	getComputedTop(): number;
	getComputedWidth(): number;
	getComputedHeight(): number;
}

// ============================================================================
// Layout Constants Interface
// ============================================================================

/**
 * Constants for layout configuration.
 * These are the same across Yoga and Flexx.
 */
export interface LayoutConstants {
	// Flex Direction
	FLEX_DIRECTION_COLUMN: number;
	FLEX_DIRECTION_COLUMN_REVERSE: number;
	FLEX_DIRECTION_ROW: number;
	FLEX_DIRECTION_ROW_REVERSE: number;

	// Wrap
	WRAP_NO_WRAP: number;
	WRAP_WRAP: number;
	WRAP_WRAP_REVERSE: number;

	// Align
	ALIGN_AUTO: number;
	ALIGN_FLEX_START: number;
	ALIGN_CENTER: number;
	ALIGN_FLEX_END: number;
	ALIGN_STRETCH: number;
	ALIGN_BASELINE: number;
	ALIGN_SPACE_BETWEEN: number;
	ALIGN_SPACE_AROUND: number;

	// Justify
	JUSTIFY_FLEX_START: number;
	JUSTIFY_CENTER: number;
	JUSTIFY_FLEX_END: number;
	JUSTIFY_SPACE_BETWEEN: number;
	JUSTIFY_SPACE_AROUND: number;
	JUSTIFY_SPACE_EVENLY: number;

	// Edge
	EDGE_LEFT: number;
	EDGE_TOP: number;
	EDGE_RIGHT: number;
	EDGE_BOTTOM: number;
	EDGE_HORIZONTAL: number;
	EDGE_VERTICAL: number;
	EDGE_ALL: number;

	// Gutter
	GUTTER_ALL: number;

	// Display
	DISPLAY_FLEX: number;
	DISPLAY_NONE: number;

	// Position Type
	POSITION_TYPE_RELATIVE: number;
	POSITION_TYPE_ABSOLUTE: number;

	// Overflow
	OVERFLOW_VISIBLE: number;
	OVERFLOW_HIDDEN: number;
	OVERFLOW_SCROLL: number;

	// Direction
	DIRECTION_LTR: number;

	// Measure Mode
	MEASURE_MODE_UNDEFINED: number;
	MEASURE_MODE_EXACTLY: number;
	MEASURE_MODE_AT_MOST: number;
}

// ============================================================================
// Layout Engine Interface
// ============================================================================

/**
 * Abstract layout engine interface.
 * Implementations can wrap Yoga, Flexx, or other layout engines.
 */
export interface LayoutEngine {
	/** Create a new layout node */
	createNode(): LayoutNode;

	/** Layout constants for this engine */
	readonly constants: LayoutConstants;

	/** Engine name for debugging */
	readonly name: string;
}

// ============================================================================
// Global Layout Engine Management
// ============================================================================

let layoutEngine: LayoutEngine | null = null;

/**
 * Set the global layout engine instance.
 * Must be called before rendering.
 */
export function setLayoutEngine(engine: LayoutEngine): void {
	layoutEngine = engine;
}

/**
 * Get the global layout engine instance.
 * Throws if not initialized.
 */
export function getLayoutEngine(): LayoutEngine {
	if (!layoutEngine) {
		throw new Error(
			'Layout engine not initialized. Call setLayoutEngine() or initYoga()/initFlexx() first.',
		);
	}
	return layoutEngine;
}

/**
 * Check if a layout engine is initialized.
 */
export function isLayoutEngineInitialized(): boolean {
	return layoutEngine !== null;
}

/**
 * Get the layout constants from the current engine.
 * Convenience function for accessing constants.
 */
export function getConstants(): LayoutConstants {
	return getLayoutEngine().constants;
}
