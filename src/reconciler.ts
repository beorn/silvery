/**
 * Inkx React Reconciler
 *
 * Custom React reconciler that builds a tree of InkxNodes, each with a Yoga layout node.
 * This is the core of Inkx's architecture - separating structure (React reconciliation)
 * from content (terminal rendering).
 *
 * The reconciler creates InkxNodes during React's reconciliation phase,
 * but actual terminal content is rendered later after Yoga computes layout.
 */

// @ts-expect-error - react-reconciler has no type declarations
import Reconciler from 'react-reconciler';
// @ts-expect-error - react-reconciler constants not typed
import { DefaultEventPriority, NoEventPriority } from 'react-reconciler/constants.js';
import { createContext } from 'react';
import type { Yoga, Node as YogaNode } from 'yoga-wasm-web';
import type { BoxProps, ComputedLayout, InkxNode, InkxNodeType, TextProps } from './types.js';

// ============================================================================
// Update Priority Management (for react-reconciler 0.33+)
// ============================================================================

let currentUpdatePriority = NoEventPriority;

// ============================================================================
// Yoga Instance Management
// ============================================================================

/**
 * The global Yoga instance. Must be initialized before rendering.
 * This is set by initYoga() or loadYoga().
 */
let yoga: Yoga | null = null;

/**
 * Initialize Inkx with a Yoga instance.
 * Call this before render().
 */
export function setYoga(instance: Yoga): void {
	yoga = instance;
}

/**
 * Get the current Yoga instance. Throws if not initialized.
 */
export function getYoga(): Yoga {
	if (!yoga) {
		throw new Error('Yoga not initialized. Call initYoga() or setYoga() before rendering.');
	}
	return yoga;
}

/**
 * Check if Yoga is initialized.
 */
export function isYogaInitialized(): boolean {
	return yoga !== null;
}

// ============================================================================
// Node Creation Helpers
// ============================================================================

/**
 * Create a new InkxNode with a fresh Yoga node.
 */
export function createNode(
	type: InkxNodeType,
	props: BoxProps | TextProps | Record<string, unknown>,
): InkxNode {
	const yogaNode = getYoga().Node.create();

	const node: InkxNode = {
		type,
		props,
		children: [],
		parent: null,
		yogaNode,
		computedLayout: null,
		prevLayout: null,
		layoutDirty: true,
		contentDirty: true,
		layoutSubscribers: new Set(),
	};

	// Apply initial flexbox props to Yoga node
	if (type === 'inkx-box') {
		applyBoxProps(yogaNode, props as BoxProps);
	}

	// Set up measure function for text nodes
	// This tells Yoga how to calculate the text's intrinsic size
	if (type === 'inkx-text') {
		yogaNode.setMeasureFunc((width, widthMode, _height, _heightMode) => {
			// Collect text content from this node and its raw text children
			const text = collectNodeTextContent(node);
			if (!text) {
				return { width: 0, height: 0 };
			}

			// Calculate text dimensions
			const lines = text.split('\n');
			const y = getYoga();
			const maxWidth = widthMode === y.MEASURE_MODE_UNDEFINED ? Number.POSITIVE_INFINITY : width;

			// Calculate actual dimensions based on wrapping
			let totalHeight = 0;
			let actualWidth = 0;

			for (const line of lines) {
				const lineWidth = measureTextWidth(line);
				if (lineWidth <= maxWidth) {
					totalHeight += 1;
					actualWidth = Math.max(actualWidth, lineWidth);
				} else {
					// Need to wrap this line
					const wrappedLines = Math.ceil(lineWidth / Math.max(1, maxWidth));
					totalHeight += wrappedLines;
					actualWidth = Math.max(actualWidth, Math.min(lineWidth, maxWidth));
				}
			}

			return {
				width: Math.min(actualWidth, maxWidth),
				height: Math.max(1, totalHeight),
			};
		});
	}

	return node;
}

/**
 * Collect text content from a node and its children (for measure function).
 */
function collectNodeTextContent(node: InkxNode): string {
	if (node.textContent !== undefined) {
		return node.textContent;
	}
	let result = '';
	for (const child of node.children) {
		result += collectNodeTextContent(child);
	}
	return result;
}

/**
 * Measure text display width (simplified for measure function).
 */
function measureTextWidth(text: string): number {
	let width = 0;
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		// Wide characters (simplified CJK detection)
		if (
			(code >= 0x1100 && code <= 0x115f) ||
			(code >= 0x2e80 && code <= 0x9fff) ||
			(code >= 0xac00 && code <= 0xd7af) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xfe10 && code <= 0xfe6f) ||
			(code >= 0xff00 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6) ||
			(code >= 0x20000 && code <= 0x3fffd)
		) {
			width += 2;
		} else {
			width += 1;
		}
	}
	return width;
}


/**
 * Create the root node for the Inkx tree.
 */
export function createRootNode(): InkxNode {
	return createNode('inkx-root', {});
}

/**
 * Create a virtual text node (for nested text elements).
 * Virtual text nodes don't have Yoga nodes and don't participate in layout.
 * They're used when Text is nested inside another Text.
 */
function createVirtualTextNode(props: TextProps): InkxNode {
	return {
		type: 'inkx-text',
		props,
		children: [],
		parent: null,
		yogaNode: null, // No Yoga node for virtual text
		computedLayout: null,
		prevLayout: null,
		layoutDirty: false,
		contentDirty: true,
		layoutSubscribers: new Set(),
		isRawText: false, // Not raw text, but virtual (nested) text
	};
}

// ============================================================================
// Yoga Property Application
// ============================================================================

/**
 * Apply BoxProps to a Yoga node.
 * This maps Ink/Inkx props to Yoga's API.
 */
function applyBoxProps(yogaNode: YogaNode, props: BoxProps): void {
	const y = getYoga();

	// Dimensions
	if (props.width !== undefined) {
		if (typeof props.width === 'string' && props.width.endsWith('%')) {
			yogaNode.setWidthPercent(Number.parseFloat(props.width));
		} else if (typeof props.width === 'number') {
			yogaNode.setWidth(props.width);
		} else if (props.width === 'auto') {
			yogaNode.setWidthAuto();
		}
	}

	if (props.height !== undefined) {
		if (typeof props.height === 'string' && props.height.endsWith('%')) {
			yogaNode.setHeightPercent(Number.parseFloat(props.height));
		} else if (typeof props.height === 'number') {
			yogaNode.setHeight(props.height);
		} else if (props.height === 'auto') {
			yogaNode.setHeightAuto();
		}
	}

	// Min/Max dimensions
	if (props.minWidth !== undefined) {
		if (typeof props.minWidth === 'string' && props.minWidth.endsWith('%')) {
			yogaNode.setMinWidthPercent(Number.parseFloat(props.minWidth));
		} else if (typeof props.minWidth === 'number') {
			yogaNode.setMinWidth(props.minWidth);
		}
	}

	if (props.minHeight !== undefined) {
		if (typeof props.minHeight === 'string' && props.minHeight.endsWith('%')) {
			yogaNode.setMinHeightPercent(Number.parseFloat(props.minHeight));
		} else if (typeof props.minHeight === 'number') {
			yogaNode.setMinHeight(props.minHeight);
		}
	}

	if (props.maxWidth !== undefined) {
		if (typeof props.maxWidth === 'string' && props.maxWidth.endsWith('%')) {
			yogaNode.setMaxWidthPercent(Number.parseFloat(props.maxWidth));
		} else if (typeof props.maxWidth === 'number') {
			yogaNode.setMaxWidth(props.maxWidth);
		}
	}

	if (props.maxHeight !== undefined) {
		if (typeof props.maxHeight === 'string' && props.maxHeight.endsWith('%')) {
			yogaNode.setMaxHeightPercent(Number.parseFloat(props.maxHeight));
		} else if (typeof props.maxHeight === 'number') {
			yogaNode.setMaxHeight(props.maxHeight);
		}
	}

	// Flex properties
	if (props.flexGrow !== undefined) {
		yogaNode.setFlexGrow(props.flexGrow);
	}

	if (props.flexShrink !== undefined) {
		yogaNode.setFlexShrink(props.flexShrink);
	}

	if (props.flexBasis !== undefined) {
		if (typeof props.flexBasis === 'string' && props.flexBasis.endsWith('%')) {
			yogaNode.setFlexBasisPercent(Number.parseFloat(props.flexBasis));
		} else if (props.flexBasis === 'auto') {
			yogaNode.setFlexBasisAuto();
		} else if (typeof props.flexBasis === 'number') {
			yogaNode.setFlexBasis(props.flexBasis);
		}
	}

	// Flex direction
	if (props.flexDirection !== undefined) {
		const directionMap: Record<string, number> = {
			row: y.FLEX_DIRECTION_ROW,
			column: y.FLEX_DIRECTION_COLUMN,
			'row-reverse': y.FLEX_DIRECTION_ROW_REVERSE,
			'column-reverse': y.FLEX_DIRECTION_COLUMN_REVERSE,
		};
		yogaNode.setFlexDirection(
			// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type mismatch
			(directionMap[props.flexDirection] ?? y.FLEX_DIRECTION_COLUMN) as any,
		);
	}

	// Flex wrap
	if (props.flexWrap !== undefined) {
		const wrapMap: Record<string, number> = {
			nowrap: y.WRAP_NO_WRAP,
			wrap: y.WRAP_WRAP,
			'wrap-reverse': y.WRAP_WRAP_REVERSE,
		};
		// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type mismatch
		yogaNode.setFlexWrap((wrapMap[props.flexWrap] ?? y.WRAP_NO_WRAP) as any);
	}

	// Alignment
	if (props.alignItems !== undefined) {
		// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type mismatch
		yogaNode.setAlignItems(alignToYoga(props.alignItems) as any);
	}

	if (props.alignSelf !== undefined && props.alignSelf !== 'auto') {
		// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type mismatch
		yogaNode.setAlignSelf(alignToYoga(props.alignSelf) as any);
	}

	if (props.alignContent !== undefined) {
		// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type mismatch
		yogaNode.setAlignContent(alignToYoga(props.alignContent) as any);
	}

	if (props.justifyContent !== undefined) {
		// biome-ignore lint/suspicious/noExplicitAny: Yoga enum type mismatch
		yogaNode.setJustifyContent(justifyToYoga(props.justifyContent) as any);
	}

	// Padding
	applySpacing(yogaNode, 'padding', props);

	// Margin
	applySpacing(yogaNode, 'margin', props);

	// Gap
	if (props.gap !== undefined) {
		yogaNode.setGap(y.GUTTER_ALL, props.gap);
	}

	// Display
	if (props.display !== undefined) {
		yogaNode.setDisplay(props.display === 'none' ? y.DISPLAY_NONE : y.DISPLAY_FLEX);
	}

	// Position
	if (props.position !== undefined) {
		yogaNode.setPositionType(
			props.position === 'absolute' ? y.POSITION_TYPE_ABSOLUTE : y.POSITION_TYPE_RELATIVE,
		);
	}

	// Overflow
	if (props.overflow !== undefined) {
		if (props.overflow === 'hidden') {
			yogaNode.setOverflow(y.OVERFLOW_HIDDEN);
		} else if (props.overflow === 'scroll') {
			yogaNode.setOverflow(y.OVERFLOW_SCROLL);
		} else {
			yogaNode.setOverflow(y.OVERFLOW_VISIBLE);
		}
	}

	// Border (affects layout - 1 cell per border side)
	if (props.borderStyle) {
		const borderWidth = 1;
		if (props.borderTop !== false) yogaNode.setBorder(y.EDGE_TOP, borderWidth);
		if (props.borderBottom !== false) yogaNode.setBorder(y.EDGE_BOTTOM, borderWidth);
		if (props.borderLeft !== false) yogaNode.setBorder(y.EDGE_LEFT, borderWidth);
		if (props.borderRight !== false) yogaNode.setBorder(y.EDGE_RIGHT, borderWidth);
	}
}

/**
 * Apply padding or margin to a Yoga node.
 */
function applySpacing(yogaNode: YogaNode, type: 'padding' | 'margin', props: BoxProps): void {
	const y = getYoga();
	const set =
		type === 'padding' ? yogaNode.setPadding.bind(yogaNode) : yogaNode.setMargin.bind(yogaNode);

	const all = props[type];
	const x = props[`${type}X` as keyof BoxProps] as number | undefined;
	const yy = props[`${type}Y` as keyof BoxProps] as number | undefined;
	const top = props[`${type}Top` as keyof BoxProps] as number | undefined;
	const bottom = props[`${type}Bottom` as keyof BoxProps] as number | undefined;
	const left = props[`${type}Left` as keyof BoxProps] as number | undefined;
	const right = props[`${type}Right` as keyof BoxProps] as number | undefined;

	// Apply in order of specificity
	if (all !== undefined) {
		set(y.EDGE_ALL, all);
	}
	if (x !== undefined) {
		set(y.EDGE_HORIZONTAL, x);
	}
	if (yy !== undefined) {
		set(y.EDGE_VERTICAL, yy);
	}
	if (top !== undefined) {
		set(y.EDGE_TOP, top);
	}
	if (bottom !== undefined) {
		set(y.EDGE_BOTTOM, bottom);
	}
	if (left !== undefined) {
		set(y.EDGE_LEFT, left);
	}
	if (right !== undefined) {
		set(y.EDGE_RIGHT, right);
	}
}

/**
 * Convert align value to Yoga constant.
 */
function alignToYoga(align: string): number {
	const y = getYoga();
	const map: Record<string, number> = {
		'flex-start': y.ALIGN_FLEX_START,
		'flex-end': y.ALIGN_FLEX_END,
		center: y.ALIGN_CENTER,
		stretch: y.ALIGN_STRETCH,
		baseline: y.ALIGN_BASELINE,
		'space-between': y.ALIGN_SPACE_BETWEEN,
		'space-around': y.ALIGN_SPACE_AROUND,
	};
	return map[align] ?? y.ALIGN_STRETCH;
}

/**
 * Convert justify value to Yoga constant.
 */
function justifyToYoga(justify: string): number {
	const y = getYoga();
	const map: Record<string, number> = {
		'flex-start': y.JUSTIFY_FLEX_START,
		'flex-end': y.JUSTIFY_FLEX_END,
		center: y.JUSTIFY_CENTER,
		'space-between': y.JUSTIFY_SPACE_BETWEEN,
		'space-around': y.JUSTIFY_SPACE_AROUND,
		'space-evenly': y.JUSTIFY_SPACE_EVENLY,
	};
	return map[justify] ?? y.JUSTIFY_FLEX_START;
}

// ============================================================================
// Layout Calculation
// ============================================================================

/**
 * Calculate layout for the entire tree starting from root.
 */
export function calculateLayout(root: InkxNode, width: number, height: number): void {
	const y = getYoga();
	root.yogaNode.calculateLayout(width, height, y.DIRECTION_LTR);
	propagateLayout(root, 0, 0);
	notifyLayoutSubscribers(root);
}

/**
 * Propagate computed layout from Yoga nodes to InkxNodes.
 */
function propagateLayout(node: InkxNode, parentX: number, parentY: number): void {
	// Save previous layout for change detection
	node.prevLayout = node.computedLayout;

	// Get computed layout from Yoga
	const left = node.yogaNode.getComputedLeft();
	const top = node.yogaNode.getComputedTop();
	const width = node.yogaNode.getComputedWidth();
	const height = node.yogaNode.getComputedHeight();

	node.computedLayout = {
		x: parentX + left,
		y: parentY + top,
		width,
		height,
	};

	// Clear layout dirty flag
	node.layoutDirty = false;

	// If dimensions changed, content needs re-render
	if (!layoutEqual(node.prevLayout, node.computedLayout)) {
		node.contentDirty = true;
	}

	// Recursively propagate to children
	for (const child of node.children) {
		propagateLayout(child, node.computedLayout.x, node.computedLayout.y);
	}
}

/**
 * Notify all layout subscribers of layout changes.
 */
function notifyLayoutSubscribers(node: InkxNode): void {
	if (!layoutEqual(node.prevLayout, node.computedLayout)) {
		for (const subscriber of node.layoutSubscribers) {
			subscriber();
		}
	}

	for (const child of node.children) {
		notifyLayoutSubscribers(child);
	}
}

/**
 * Check if two layouts are equal.
 */
function layoutEqual(a: ComputedLayout | null, b: ComputedLayout | null): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// ============================================================================
// React Reconciler Host Config
// ============================================================================

/**
 * Container type - the root of our Inkx tree
 */
interface Container {
	root: InkxNode;
	onRender: () => void;
}

/**
 * The React Reconciler host config.
 * This defines how React creates, updates, and manages our custom InkxNodes.
 */
const hostConfig = {
	// Feature flags
	supportsMutation: true,
	supportsPersistence: false,
	supportsHydration: false,
	isPrimaryRenderer: true,

	// Scheduling
	scheduleTimeout: setTimeout,
	cancelTimeout: clearTimeout,
	noTimeout: -1,
	supportsMicrotasks: true,
	scheduleMicrotask: queueMicrotask,

	// Context - tracks whether we're inside a Text component
	getRootHostContext() {
		return { isInsideText: false };
	},

	getChildHostContext(
		parentHostContext: { isInsideText: boolean },
		type: InkxNodeType,
	): { isInsideText: boolean } {
		// Once inside a text node, stay inside
		const isInsideText = parentHostContext.isInsideText || type === 'inkx-text';
		if (isInsideText === parentHostContext.isInsideText) {
			return parentHostContext;
		}
		return { isInsideText };
	},

	// Instance creation
	createInstance(
		type: InkxNodeType,
		props: BoxProps | TextProps,
		_rootContainer: unknown,
		hostContext: { isInsideText: boolean },
	): InkxNode {
		// Nested text nodes become "virtual" - no Yoga node
		if (type === 'inkx-text' && hostContext.isInsideText) {
			return createVirtualTextNode(props as TextProps);
		}
		return createNode(type, props);
	},

	createTextInstance(text: string): InkxNode {
		// Raw text nodes don't have Yoga nodes - they're just data nodes
		// Their content is rendered by their parent inkx-text element
		const node: InkxNode = {
			type: 'inkx-text',
			props: { children: text } as TextProps,
			children: [],
			parent: null,
			yogaNode: null, // No Yoga node for raw text
			computedLayout: null,
			prevLayout: null,
			layoutDirty: false,
			contentDirty: true,
			layoutSubscribers: new Set(),
			textContent: text,
			isRawText: true,
		};
		return node;
	},

	// Tree operations
	appendChild(parentInstance: InkxNode, child: InkxNode) {
		child.parent = parentInstance;
		parentInstance.children.push(child);
		// Only add to Yoga tree if both nodes have Yoga nodes
		if (parentInstance.yogaNode && child.yogaNode) {
			// Count non-raw-text children for proper Yoga index
			const yogaIndex = parentInstance.children.filter((c) => c.yogaNode !== null).length - 1;
			parentInstance.yogaNode.insertChild(child.yogaNode, yogaIndex);
		}
		parentInstance.layoutDirty = true;
	},

	appendInitialChild(parentInstance: InkxNode, child: InkxNode) {
		child.parent = parentInstance;
		parentInstance.children.push(child);
		// Only add to Yoga tree if both nodes have Yoga nodes
		if (parentInstance.yogaNode && child.yogaNode) {
			const yogaIndex = parentInstance.children.filter((c) => c.yogaNode !== null).length - 1;
			parentInstance.yogaNode.insertChild(child.yogaNode, yogaIndex);
		}
	},

	appendChildToContainer(container: Container, child: InkxNode) {
		child.parent = container.root;
		container.root.children.push(child);
		if (container.root.yogaNode && child.yogaNode) {
			const yogaIndex = container.root.children.filter((c) => c.yogaNode !== null).length - 1;
			container.root.yogaNode.insertChild(child.yogaNode, yogaIndex);
		}
		container.root.layoutDirty = true;
	},

	removeChild(parentInstance: InkxNode, child: InkxNode) {
		const index = parentInstance.children.indexOf(child);
		if (index !== -1) {
			parentInstance.children.splice(index, 1);
			if (parentInstance.yogaNode && child.yogaNode) {
				parentInstance.yogaNode.removeChild(child.yogaNode);
				child.yogaNode.free();
			}
			child.parent = null;
			parentInstance.layoutDirty = true;
		}
	},

	removeChildFromContainer(container: Container, child: InkxNode) {
		const index = container.root.children.indexOf(child);
		if (index !== -1) {
			container.root.children.splice(index, 1);
			if (container.root.yogaNode && child.yogaNode) {
				container.root.yogaNode.removeChild(child.yogaNode);
				child.yogaNode.free();
			}
			child.parent = null;
			container.root.layoutDirty = true;
		}
	},

	insertBefore(parentInstance: InkxNode, child: InkxNode, beforeChild: InkxNode) {
		const beforeIndex = parentInstance.children.indexOf(beforeChild);
		if (beforeIndex !== -1) {
			child.parent = parentInstance;
			parentInstance.children.splice(beforeIndex, 0, child);
			if (parentInstance.yogaNode && child.yogaNode) {
				// Count non-raw-text children before this position for proper Yoga index
				const yogaIndex = parentInstance.children
					.slice(0, beforeIndex)
					.filter((c) => c.yogaNode !== null).length;
				parentInstance.yogaNode.insertChild(child.yogaNode, yogaIndex);
			}
			parentInstance.layoutDirty = true;
		}
	},

	insertInContainerBefore(container: Container, child: InkxNode, beforeChild: InkxNode) {
		const beforeIndex = container.root.children.indexOf(beforeChild);
		if (beforeIndex !== -1) {
			child.parent = container.root;
			container.root.children.splice(beforeIndex, 0, child);
			if (container.root.yogaNode && child.yogaNode) {
				const yogaIndex = container.root.children
					.slice(0, beforeIndex)
					.filter((c) => c.yogaNode !== null).length;
				container.root.yogaNode.insertChild(child.yogaNode, yogaIndex);
			}
			container.root.layoutDirty = true;
		}
	},

	// Updates
	prepareUpdate(
		_instance: InkxNode,
		_type: InkxNodeType,
		oldProps: BoxProps | TextProps,
		newProps: BoxProps | TextProps,
	): boolean | null {
		// Return true if we need to update
		return !propsEqual(oldProps as Record<string, unknown>, newProps as Record<string, unknown>);
	},

	commitUpdate(
		instance: InkxNode,
		_updatePayload: boolean,
		_type: InkxNodeType,
		oldProps: BoxProps | TextProps,
		newProps: BoxProps | TextProps,
	) {
		// Check if layout-affecting props changed
		if (
			layoutPropsChanged(oldProps as Record<string, unknown>, newProps as Record<string, unknown>)
		) {
			if (instance.yogaNode) {
				applyBoxProps(instance.yogaNode, newProps as BoxProps);
			}
			instance.layoutDirty = true;
		}

		// Check if content changed
		if (
			contentPropsChanged(oldProps as Record<string, unknown>, newProps as Record<string, unknown>)
		) {
			instance.contentDirty = true;
		}

		instance.props = newProps;
	},

	commitTextUpdate(textInstance: InkxNode, _oldText: string, newText: string) {
		textInstance.textContent = newText;
		textInstance.props = { children: newText } as TextProps;
		textInstance.contentDirty = true;
	},

	// Finalization
	finalizeInitialChildren() {
		return false;
	},

	prepareForCommit() {
		return null;
	},

	resetAfterCommit(container: Container) {
		// Trigger render after React finishes committing
		container.onRender();
	},

	// Misc
	getPublicInstance(instance: InkxNode) {
		return instance;
	},

	shouldSetTextContent() {
		return false;
	},

	clearContainer(container: Container) {
		for (const child of container.root.children) {
			if (container.root.yogaNode && child.yogaNode) {
				container.root.yogaNode.removeChild(child.yogaNode);
				child.yogaNode.free();
			}
		}
		container.root.children = [];
	},

	preparePortalMount() {
		// No-op for terminal
	},

	getCurrentEventPriority() {
		return 16; // DefaultEventPriority
	},

	getInstanceFromNode() {
		return null;
	},

	beforeActiveInstanceBlur() {
		// No-op
	},

	afterActiveInstanceBlur() {
		// No-op
	},

	prepareScopeUpdate() {
		// No-op
	},

	getInstanceFromScope() {
		return null;
	},

	detachDeletedInstance() {
		// No-op
	},

	// React 19 / react-reconciler 0.33+ required methods
	setCurrentUpdatePriority(newPriority: number) {
		currentUpdatePriority = newPriority;
	},

	getCurrentUpdatePriority() {
		return currentUpdatePriority;
	},

	resolveUpdatePriority() {
		if (currentUpdatePriority !== NoEventPriority) {
			return currentUpdatePriority;
		}
		return DefaultEventPriority;
	},

	maySuspendCommit() {
		return false;
	},

	NotPendingTransition: null,
	HostTransitionContext: createContext(null),

	resetFormInstance() {
		// No-op
	},

	requestPostPaintCallback() {
		// No-op
	},

	shouldAttemptEagerTransition() {
		return false;
	},

	trackSchedulerEvent() {
		// No-op
	},

	resolveEventType() {
		return null;
	},

	resolveEventTimeStamp() {
		return -1.1;
	},

	preloadInstance() {
		return true;
	},

	startSuspendingCommit() {
		// No-op
	},

	suspendInstance() {
		// No-op
	},

	waitForCommitToBeReady() {
		return null;
	},
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Set of layout-affecting props.
 */
const LAYOUT_PROPS = new Set([
	'width',
	'height',
	'minWidth',
	'minHeight',
	'maxWidth',
	'maxHeight',
	'flexDirection',
	'flexWrap',
	'justifyContent',
	'alignItems',
	'alignContent',
	'alignSelf',
	'flexGrow',
	'flexShrink',
	'flexBasis',
	'padding',
	'paddingX',
	'paddingY',
	'paddingTop',
	'paddingBottom',
	'paddingLeft',
	'paddingRight',
	'margin',
	'marginX',
	'marginY',
	'marginTop',
	'marginBottom',
	'marginLeft',
	'marginRight',
	'gap',
	'borderStyle',
	'borderTop',
	'borderBottom',
	'borderLeft',
	'borderRight',
	'display',
	'position',
	'overflow',
]);

/**
 * Check if layout-affecting props changed.
 */
function layoutPropsChanged(
	oldProps: Record<string, unknown>,
	newProps: Record<string, unknown>,
): boolean {
	for (const prop of LAYOUT_PROPS) {
		if (oldProps[prop] !== newProps[prop]) {
			return true;
		}
	}
	return false;
}

/**
 * Check if content-affecting props changed.
 */
function contentPropsChanged(
	oldProps: Record<string, unknown>,
	newProps: Record<string, unknown>,
): boolean {
	// Children always trigger content change
	if (oldProps.children !== newProps.children) {
		return true;
	}

	// Style props affect content but not layout
	const styleProps = [
		'color',
		'backgroundColor',
		'bold',
		'dim',
		'italic',
		'underline',
		'strikethrough',
		'inverse',
		'wrap',
		'borderColor',
	];

	for (const prop of styleProps) {
		if (oldProps[prop] !== newProps[prop]) {
			return true;
		}
	}

	return false;
}

/**
 * Shallow compare two prop objects.
 */
function propsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);

	if (keysA.length !== keysB.length) {
		return false;
	}

	for (const key of keysA) {
		if (a[key] !== b[key]) {
			return false;
		}
	}

	return true;
}

// ============================================================================
// Reconciler Export
// ============================================================================

/**
 * Create the React reconciler instance.
 */
export const reconciler = Reconciler(hostConfig);

/**
 * Create a container for rendering.
 */
export function createContainer(onRender: () => void): Container {
	const root = createRootNode();
	return { root, onRender };
}

/**
 * Get the root InkxNode from a container.
 */
export function getContainerRoot(container: Container): InkxNode {
	return container.root;
}
