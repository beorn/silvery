/**
 * Yoga Layout Engine Adapter
 *
 * Wraps yoga-wasm-web to implement the LayoutEngine interface.
 */

import type { Yoga, Node as YogaNode } from 'yoga-wasm-web';
import type {
	LayoutConstants,
	LayoutEngine,
	LayoutNode,
	MeasureFunc,
	MeasureMode,
} from '../layout-engine.js';

// ============================================================================
// Yoga Node Adapter
// ============================================================================

/**
 * Wraps a Yoga node to implement LayoutNode interface.
 */
class YogaNodeAdapter implements LayoutNode {
	private node: YogaNode;
	private yoga: Yoga;

	constructor(node: YogaNode, yoga: Yoga) {
		this.node = node;
		this.yoga = yoga;
	}

	/** Get the underlying Yoga node (for tree operations) */
	getYogaNode(): YogaNode {
		return this.node;
	}

	// Tree operations
	insertChild(child: LayoutNode, index: number): void {
		const yogaChild = (child as YogaNodeAdapter).getYogaNode();
		this.node.insertChild(yogaChild, index);
	}

	removeChild(child: LayoutNode): void {
		const yogaChild = (child as YogaNodeAdapter).getYogaNode();
		this.node.removeChild(yogaChild);
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
		if (mode === this.yoga.MEASURE_MODE_EXACTLY) return 'exactly';
		if (mode === this.yoga.MEASURE_MODE_AT_MOST) return 'at-most';
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
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setFlexDirection(direction: number): void {
		this.node.setFlexDirection(direction as any);
	}
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setFlexWrap(wrap: number): void {
		this.node.setFlexWrap(wrap as any);
	}

	// Alignment
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setAlignItems(align: number): void {
		this.node.setAlignItems(align as any);
	}
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setAlignSelf(align: number): void {
		this.node.setAlignSelf(align as any);
	}
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setAlignContent(align: number): void {
		this.node.setAlignContent(align as any);
	}
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setJustifyContent(justify: number): void {
		this.node.setJustifyContent(justify as any);
	}

	// Spacing
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setPadding(edge: number, value: number): void {
		this.node.setPadding(edge as any, value);
	}
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setMargin(edge: number, value: number): void {
		this.node.setMargin(edge as any, value);
	}
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setBorder(edge: number, value: number): void {
		this.node.setBorder(edge as any, value);
	}
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setGap(gutter: number, value: number): void {
		this.node.setGap(gutter as any, value);
	}

	// Display & Position
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setDisplay(display: number): void {
		this.node.setDisplay(display as any);
	}
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setPositionType(positionType: number): void {
		this.node.setPositionType(positionType as any);
	}
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	setOverflow(overflow: number): void {
		this.node.setOverflow(overflow as any);
	}

	// Layout calculation
	// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type from number
	calculateLayout(width: number, height: number, direction?: number): void {
		this.node.calculateLayout(width, height, (direction ?? this.yoga.DIRECTION_LTR) as any);
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
// Yoga Layout Engine
// ============================================================================

/**
 * Layout engine implementation using Yoga (WASM).
 */
export class YogaLayoutEngine implements LayoutEngine {
	private yoga: Yoga;
	private _constants: LayoutConstants;

	constructor(yoga: Yoga) {
		this.yoga = yoga;
		this._constants = {
			// Flex Direction
			FLEX_DIRECTION_COLUMN: yoga.FLEX_DIRECTION_COLUMN,
			FLEX_DIRECTION_COLUMN_REVERSE: yoga.FLEX_DIRECTION_COLUMN_REVERSE,
			FLEX_DIRECTION_ROW: yoga.FLEX_DIRECTION_ROW,
			FLEX_DIRECTION_ROW_REVERSE: yoga.FLEX_DIRECTION_ROW_REVERSE,

			// Wrap
			WRAP_NO_WRAP: yoga.WRAP_NO_WRAP,
			WRAP_WRAP: yoga.WRAP_WRAP,
			WRAP_WRAP_REVERSE: yoga.WRAP_WRAP_REVERSE,

			// Align
			ALIGN_AUTO: yoga.ALIGN_AUTO,
			ALIGN_FLEX_START: yoga.ALIGN_FLEX_START,
			ALIGN_CENTER: yoga.ALIGN_CENTER,
			ALIGN_FLEX_END: yoga.ALIGN_FLEX_END,
			ALIGN_STRETCH: yoga.ALIGN_STRETCH,
			ALIGN_BASELINE: yoga.ALIGN_BASELINE,
			ALIGN_SPACE_BETWEEN: yoga.ALIGN_SPACE_BETWEEN,
			ALIGN_SPACE_AROUND: yoga.ALIGN_SPACE_AROUND,

			// Justify
			JUSTIFY_FLEX_START: yoga.JUSTIFY_FLEX_START,
			JUSTIFY_CENTER: yoga.JUSTIFY_CENTER,
			JUSTIFY_FLEX_END: yoga.JUSTIFY_FLEX_END,
			JUSTIFY_SPACE_BETWEEN: yoga.JUSTIFY_SPACE_BETWEEN,
			JUSTIFY_SPACE_AROUND: yoga.JUSTIFY_SPACE_AROUND,
			JUSTIFY_SPACE_EVENLY: yoga.JUSTIFY_SPACE_EVENLY,

			// Edge
			EDGE_LEFT: yoga.EDGE_LEFT,
			EDGE_TOP: yoga.EDGE_TOP,
			EDGE_RIGHT: yoga.EDGE_RIGHT,
			EDGE_BOTTOM: yoga.EDGE_BOTTOM,
			EDGE_HORIZONTAL: yoga.EDGE_HORIZONTAL,
			EDGE_VERTICAL: yoga.EDGE_VERTICAL,
			EDGE_ALL: yoga.EDGE_ALL,

			// Gutter
			GUTTER_ALL: yoga.GUTTER_ALL,

			// Display
			DISPLAY_FLEX: yoga.DISPLAY_FLEX,
			DISPLAY_NONE: yoga.DISPLAY_NONE,

			// Position Type
			POSITION_TYPE_RELATIVE: yoga.POSITION_TYPE_RELATIVE,
			POSITION_TYPE_ABSOLUTE: yoga.POSITION_TYPE_ABSOLUTE,

			// Overflow
			OVERFLOW_VISIBLE: yoga.OVERFLOW_VISIBLE,
			OVERFLOW_HIDDEN: yoga.OVERFLOW_HIDDEN,
			OVERFLOW_SCROLL: yoga.OVERFLOW_SCROLL,

			// Direction
			DIRECTION_LTR: yoga.DIRECTION_LTR,

			// Measure Mode
			MEASURE_MODE_UNDEFINED: yoga.MEASURE_MODE_UNDEFINED,
			MEASURE_MODE_EXACTLY: yoga.MEASURE_MODE_EXACTLY,
			MEASURE_MODE_AT_MOST: yoga.MEASURE_MODE_AT_MOST,
		};
	}

	createNode(): LayoutNode {
		return new YogaNodeAdapter(this.yoga.Node.create(), this.yoga);
	}

	get constants(): LayoutConstants {
		return this._constants;
	}

	get name(): string {
		return 'yoga';
	}
}

// ============================================================================
// Initialization Helper
// ============================================================================

/**
 * Create a Yoga layout engine from an initialized Yoga instance.
 */
export function createYogaEngine(yoga: Yoga): YogaLayoutEngine {
	return new YogaLayoutEngine(yoga);
}

/**
 * Initialize Yoga and create a layout engine.
 * Uses yoga-wasm-web/auto which automatically selects the right implementation.
 */
export async function initYogaEngine(): Promise<YogaLayoutEngine> {
	const { default: yoga } = (await import('yoga-wasm-web/auto')) as {
		default: Yoga;
	};
	return new YogaLayoutEngine(yoga);
}
