/**
 * Flexx Layout Engine Adapter
 *
 * Wraps Flexx (pure JS layout engine) to implement the LayoutEngine interface.
 * Since Flexx already has a Yoga-compatible API, this is a thin wrapper.
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
	Node as FlexxNode,
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
} from '@beorn/flexx';

import type {
	LayoutConstants,
	LayoutEngine,
	LayoutNode,
	MeasureFunc,
	MeasureMode,
} from '../layout-engine.js';

// ============================================================================
// Flexx Node Adapter
// ============================================================================

/**
 * Wraps a Flexx node to implement LayoutNode interface.
 * Since Flexx already has a Yoga-compatible API, this is mostly delegation.
 */
class FlexxNodeAdapter implements LayoutNode {
	private node: FlexxNode;

	constructor(node: FlexxNode) {
		this.node = node;
	}

	/** Get the underlying Flexx node (for tree operations) */
	getFlexxNode(): FlexxNode {
		return this.node;
	}

	// Tree operations
	insertChild(child: LayoutNode, index: number): void {
		const flexxChild = (child as FlexxNodeAdapter).getFlexxNode();
		this.node.insertChild(flexxChild, index);
	}

	removeChild(child: LayoutNode): void {
		const flexxChild = (child as FlexxNodeAdapter).getFlexxNode();
		this.node.removeChild(flexxChild);
	}

	free(): void {
		this.node.free();
	}

	// Measure function
	setMeasureFunc(measureFunc: MeasureFunc): void {
		this.node.setMeasureFunc((width, widthMode, height, heightMode) => {
			const widthModeStr = this.measureModeToString(widthMode);
			const heightModeStr = this.measureModeToString(heightMode);
			return measureFunc(width, widthModeStr, height, heightModeStr);
		});
	}

	private measureModeToString(mode: number): MeasureMode {
		if (mode === MEASURE_MODE_EXACTLY) return 'exactly';
		if (mode === MEASURE_MODE_AT_MOST) return 'at-most';
		return 'undefined';
	}

	// Dimension setters
	setWidth(value: number): void {
		this.node.setWidth(value);
	}
	setWidthPercent(value: number): void {
		this.node.setWidthPercent(value);
	}
	setWidthAuto(): void {
		this.node.setWidthAuto();
	}
	setHeight(value: number): void {
		this.node.setHeight(value);
	}
	setHeightPercent(value: number): void {
		this.node.setHeightPercent(value);
	}
	setHeightAuto(): void {
		this.node.setHeightAuto();
	}
	setMinWidth(value: number): void {
		this.node.setMinWidth(value);
	}
	setMinWidthPercent(value: number): void {
		this.node.setMinWidthPercent(value);
	}
	setMinHeight(value: number): void {
		this.node.setMinHeight(value);
	}
	setMinHeightPercent(value: number): void {
		this.node.setMinHeightPercent(value);
	}
	setMaxWidth(value: number): void {
		this.node.setMaxWidth(value);
	}
	setMaxWidthPercent(value: number): void {
		this.node.setMaxWidthPercent(value);
	}
	setMaxHeight(value: number): void {
		this.node.setMaxHeight(value);
	}
	setMaxHeightPercent(value: number): void {
		this.node.setMaxHeightPercent(value);
	}

	// Flex properties
	setFlexGrow(value: number): void {
		this.node.setFlexGrow(value);
	}
	setFlexShrink(value: number): void {
		this.node.setFlexShrink(value);
	}
	setFlexBasis(value: number): void {
		this.node.setFlexBasis(value);
	}
	setFlexBasisPercent(value: number): void {
		this.node.setFlexBasisPercent(value);
	}
	setFlexBasisAuto(): void {
		this.node.setFlexBasisAuto();
	}
	setFlexDirection(direction: number): void {
		this.node.setFlexDirection(direction);
	}
	setFlexWrap(wrap: number): void {
		this.node.setFlexWrap(wrap);
	}

	// Alignment
	setAlignItems(align: number): void {
		this.node.setAlignItems(align);
	}
	setAlignSelf(align: number): void {
		this.node.setAlignSelf(align);
	}
	setAlignContent(align: number): void {
		this.node.setAlignContent(align);
	}
	setJustifyContent(justify: number): void {
		this.node.setJustifyContent(justify);
	}

	// Spacing
	setPadding(edge: number, value: number): void {
		this.node.setPadding(edge, value);
	}
	setMargin(edge: number, value: number): void {
		this.node.setMargin(edge, value);
	}
	setBorder(edge: number, value: number): void {
		this.node.setBorder(edge, value);
	}
	setGap(gutter: number, value: number): void {
		this.node.setGap(gutter, value);
	}

	// Display & Position
	setDisplay(display: number): void {
		this.node.setDisplay(display);
	}
	setPositionType(positionType: number): void {
		this.node.setPositionType(positionType);
	}
	setOverflow(overflow: number): void {
		this.node.setOverflow(overflow);
	}

	// Layout calculation
	calculateLayout(width: number, height: number, direction?: number): void {
		this.node.calculateLayout(width, height, direction ?? DIRECTION_LTR);
	}

	// Layout results
	getComputedLeft(): number {
		return this.node.getComputedLeft();
	}
	getComputedTop(): number {
		return this.node.getComputedTop();
	}
	getComputedWidth(): number {
		return this.node.getComputedWidth();
	}
	getComputedHeight(): number {
		return this.node.getComputedHeight();
	}
}

// ============================================================================
// Flexx Layout Engine
// ============================================================================

/**
 * Layout engine implementation using Flexx (pure JavaScript).
 */
export class FlexxLayoutEngine implements LayoutEngine {
	private _constants: LayoutConstants = {
		// Flex Direction
		FLEX_DIRECTION_COLUMN,
		FLEX_DIRECTION_COLUMN_REVERSE,
		FLEX_DIRECTION_ROW,
		FLEX_DIRECTION_ROW_REVERSE,

		// Wrap
		WRAP_NO_WRAP,
		WRAP_WRAP,
		WRAP_WRAP_REVERSE,

		// Align
		ALIGN_AUTO,
		ALIGN_FLEX_START,
		ALIGN_CENTER,
		ALIGN_FLEX_END,
		ALIGN_STRETCH,
		ALIGN_BASELINE,
		ALIGN_SPACE_BETWEEN,
		ALIGN_SPACE_AROUND,

		// Justify
		JUSTIFY_FLEX_START,
		JUSTIFY_CENTER,
		JUSTIFY_FLEX_END,
		JUSTIFY_SPACE_BETWEEN,
		JUSTIFY_SPACE_AROUND,
		JUSTIFY_SPACE_EVENLY,

		// Edge
		EDGE_LEFT,
		EDGE_TOP,
		EDGE_RIGHT,
		EDGE_BOTTOM,
		EDGE_HORIZONTAL,
		EDGE_VERTICAL,
		EDGE_ALL,

		// Gutter
		GUTTER_ALL,

		// Display
		DISPLAY_FLEX,
		DISPLAY_NONE,

		// Position Type
		POSITION_TYPE_RELATIVE,
		POSITION_TYPE_ABSOLUTE,

		// Overflow
		OVERFLOW_VISIBLE,
		OVERFLOW_HIDDEN,
		OVERFLOW_SCROLL,

		// Direction
		DIRECTION_LTR,

		// Measure Mode
		MEASURE_MODE_UNDEFINED,
		MEASURE_MODE_EXACTLY,
		MEASURE_MODE_AT_MOST,
	};

	createNode(): LayoutNode {
		return new FlexxNodeAdapter(FlexxNode.create());
	}

	get constants(): LayoutConstants {
		return this._constants;
	}

	get name(): string {
		return 'flexx';
	}
}

// ============================================================================
// Initialization Helper
// ============================================================================

/**
 * Create a Flexx layout engine.
 * Unlike Yoga, Flexx doesn't require async initialization.
 */
export function createFlexxEngine(): FlexxLayoutEngine {
	return new FlexxLayoutEngine();
}
