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

import { createContext } from 'react';
// @ts-expect-error - react-reconciler has no type declarations
import Reconciler from 'react-reconciler';
// @ts-expect-error - react-reconciler constants not typed
import { DefaultEventPriority, NoEventPriority } from 'react-reconciler/constants.js';
import { type LayoutNode, getConstants, getLayoutEngine } from './layout-engine.js';
import type { BoxProps, ComputedLayout, InkxNode, InkxNodeType, TextProps } from './types.js';
import { displayWidth } from './unicode.js';

// ============================================================================
// Update Priority Management (for react-reconciler 0.33+)
// ============================================================================

let currentUpdatePriority = NoEventPriority;

// ============================================================================
// Node Creation Helpers
// ============================================================================

/**
 * Create a new InkxNode with a fresh layout node.
 */
export function createNode(
	type: InkxNodeType,
	props: BoxProps | TextProps | Record<string, unknown>,
): InkxNode {
	const layoutNode = getLayoutEngine().createNode();

	const node: InkxNode = {
		type,
		props,
		children: [],
		parent: null,
		layoutNode,
		computedLayout: null,
		prevLayout: null,
		layoutDirty: true,
		contentDirty: true,
		layoutSubscribers: new Set(),
	};

	// Apply initial flexbox props to layout node
	if (type === 'inkx-box') {
		applyBoxProps(layoutNode, props as BoxProps);
	}

	// Set up measure function for text nodes
	// This tells the layout engine how to calculate the text's intrinsic size
	if (type === 'inkx-text') {
		layoutNode.setMeasureFunc((width, widthMode, _height, _heightMode) => {
			// Collect text content from this node and its raw text children
			const text = collectNodeTextContent(node);
			if (!text) {
				return { width: 0, height: 0 };
			}

			// Calculate text dimensions
			const lines = text.split('\n');
			const maxWidth = widthMode === 'undefined' ? Number.POSITIVE_INFINITY : width;

			// Calculate actual dimensions based on wrapping
			let totalHeight = 0;
			let actualWidth = 0;

			for (const line of lines) {
				const lineWidth = displayWidth(line);
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
 * Create the root node for the Inkx tree.
 */
export function createRootNode(): InkxNode {
	return createNode('inkx-root', {});
}

/**
 * Create a virtual text node (for nested text elements).
 * Virtual text nodes don't have layout nodes and don't participate in layout.
 * They're used when Text is nested inside another Text.
 */
function createVirtualTextNode(props: TextProps): InkxNode {
	return {
		type: 'inkx-text',
		props,
		children: [],
		parent: null,
		layoutNode: null, // No layout node for virtual text
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
 * Apply BoxProps to a layout node.
 * This maps Ink/Inkx props to the layout engine API.
 */
function applyBoxProps(layoutNode: LayoutNode, props: BoxProps): void {
	const c = getConstants();

	// Dimensions
	if (props.width !== undefined) {
		if (typeof props.width === 'string' && props.width.endsWith('%')) {
			layoutNode.setWidthPercent(Number.parseFloat(props.width));
		} else if (typeof props.width === 'number') {
			layoutNode.setWidth(props.width);
		} else if (props.width === 'auto') {
			layoutNode.setWidthAuto();
		}
	}

	if (props.height !== undefined) {
		if (typeof props.height === 'string' && props.height.endsWith('%')) {
			layoutNode.setHeightPercent(Number.parseFloat(props.height));
		} else if (typeof props.height === 'number') {
			layoutNode.setHeight(props.height);
		} else if (props.height === 'auto') {
			layoutNode.setHeightAuto();
		}
	}

	// Min/Max dimensions
	if (props.minWidth !== undefined) {
		if (typeof props.minWidth === 'string' && props.minWidth.endsWith('%')) {
			layoutNode.setMinWidthPercent(Number.parseFloat(props.minWidth));
		} else if (typeof props.minWidth === 'number') {
			layoutNode.setMinWidth(props.minWidth);
		}
	}

	if (props.minHeight !== undefined) {
		if (typeof props.minHeight === 'string' && props.minHeight.endsWith('%')) {
			layoutNode.setMinHeightPercent(Number.parseFloat(props.minHeight));
		} else if (typeof props.minHeight === 'number') {
			layoutNode.setMinHeight(props.minHeight);
		}
	}

	if (props.maxWidth !== undefined) {
		if (typeof props.maxWidth === 'string' && props.maxWidth.endsWith('%')) {
			layoutNode.setMaxWidthPercent(Number.parseFloat(props.maxWidth));
		} else if (typeof props.maxWidth === 'number') {
			layoutNode.setMaxWidth(props.maxWidth);
		}
	}

	if (props.maxHeight !== undefined) {
		if (typeof props.maxHeight === 'string' && props.maxHeight.endsWith('%')) {
			layoutNode.setMaxHeightPercent(Number.parseFloat(props.maxHeight));
		} else if (typeof props.maxHeight === 'number') {
			layoutNode.setMaxHeight(props.maxHeight);
		}
	}

	// Flex properties
	if (props.flexGrow !== undefined) {
		layoutNode.setFlexGrow(props.flexGrow);
	}

	if (props.flexShrink !== undefined) {
		layoutNode.setFlexShrink(props.flexShrink);
	}

	if (props.flexBasis !== undefined) {
		if (typeof props.flexBasis === 'string' && props.flexBasis.endsWith('%')) {
			layoutNode.setFlexBasisPercent(Number.parseFloat(props.flexBasis));
		} else if (props.flexBasis === 'auto') {
			layoutNode.setFlexBasisAuto();
		} else if (typeof props.flexBasis === 'number') {
			layoutNode.setFlexBasis(props.flexBasis);
		}
	}

	// Flex direction
	if (props.flexDirection !== undefined) {
		const directionMap: Record<string, number> = {
			row: c.FLEX_DIRECTION_ROW,
			column: c.FLEX_DIRECTION_COLUMN,
			'row-reverse': c.FLEX_DIRECTION_ROW_REVERSE,
			'column-reverse': c.FLEX_DIRECTION_COLUMN_REVERSE,
		};
		layoutNode.setFlexDirection(directionMap[props.flexDirection] ?? c.FLEX_DIRECTION_COLUMN);
	}

	// Flex wrap
	if (props.flexWrap !== undefined) {
		const wrapMap: Record<string, number> = {
			nowrap: c.WRAP_NO_WRAP,
			wrap: c.WRAP_WRAP,
			'wrap-reverse': c.WRAP_WRAP_REVERSE,
		};
		layoutNode.setFlexWrap(wrapMap[props.flexWrap] ?? c.WRAP_NO_WRAP);
	}

	// Alignment
	if (props.alignItems !== undefined) {
		layoutNode.setAlignItems(alignToConstant(props.alignItems));
	}

	if (props.alignSelf !== undefined && props.alignSelf !== 'auto') {
		layoutNode.setAlignSelf(alignToConstant(props.alignSelf));
	}

	if (props.alignContent !== undefined) {
		layoutNode.setAlignContent(alignToConstant(props.alignContent));
	}

	if (props.justifyContent !== undefined) {
		layoutNode.setJustifyContent(justifyToConstant(props.justifyContent));
	}

	// Padding
	applySpacing(layoutNode, 'padding', props);

	// Margin
	applySpacing(layoutNode, 'margin', props);

	// Gap
	if (props.gap !== undefined) {
		layoutNode.setGap(c.GUTTER_ALL, props.gap);
	}

	// Display
	if (props.display !== undefined) {
		layoutNode.setDisplay(props.display === 'none' ? c.DISPLAY_NONE : c.DISPLAY_FLEX);
	}

	// Position
	// Note: 'sticky' is handled at render-time, not by layout engine. For layout purposes, treat as relative.
	if (props.position !== undefined) {
		layoutNode.setPositionType(
			props.position === 'absolute' ? c.POSITION_TYPE_ABSOLUTE : c.POSITION_TYPE_RELATIVE,
		);
	}

	// Overflow
	if (props.overflow !== undefined) {
		if (props.overflow === 'hidden') {
			layoutNode.setOverflow(c.OVERFLOW_HIDDEN);
		} else if (props.overflow === 'scroll') {
			layoutNode.setOverflow(c.OVERFLOW_SCROLL);
		} else {
			layoutNode.setOverflow(c.OVERFLOW_VISIBLE);
		}
	}

	// Border (affects layout - 1 cell per border side)
	if (props.borderStyle) {
		const borderWidth = 1;
		if (props.borderTop !== false) {
			layoutNode.setBorder(c.EDGE_TOP, borderWidth);
		}
		if (props.borderBottom !== false) {
			layoutNode.setBorder(c.EDGE_BOTTOM, borderWidth);
		}
		if (props.borderLeft !== false) {
			layoutNode.setBorder(c.EDGE_LEFT, borderWidth);
		}
		if (props.borderRight !== false) {
			layoutNode.setBorder(c.EDGE_RIGHT, borderWidth);
		}
	}
}

/**
 * Apply padding or margin to a layout node.
 */
function applySpacing(layoutNode: LayoutNode, type: 'padding' | 'margin', props: BoxProps): void {
	const c = getConstants();
	const set =
		type === 'padding'
			? layoutNode.setPadding.bind(layoutNode)
			: layoutNode.setMargin.bind(layoutNode);

	const all = props[type];
	const x = props[`${type}X` as keyof BoxProps] as number | undefined;
	const yy = props[`${type}Y` as keyof BoxProps] as number | undefined;
	const top = props[`${type}Top` as keyof BoxProps] as number | undefined;
	const bottom = props[`${type}Bottom` as keyof BoxProps] as number | undefined;
	const left = props[`${type}Left` as keyof BoxProps] as number | undefined;
	const right = props[`${type}Right` as keyof BoxProps] as number | undefined;

	// Apply in order of specificity
	if (all !== undefined) {
		set(c.EDGE_ALL, all);
	}
	if (x !== undefined) {
		set(c.EDGE_HORIZONTAL, x);
	}
	if (yy !== undefined) {
		set(c.EDGE_VERTICAL, yy);
	}
	if (top !== undefined) {
		set(c.EDGE_TOP, top);
	}
	if (bottom !== undefined) {
		set(c.EDGE_BOTTOM, bottom);
	}
	if (left !== undefined) {
		set(c.EDGE_LEFT, left);
	}
	if (right !== undefined) {
		set(c.EDGE_RIGHT, right);
	}
}

/**
 * Convert align value to layout constant.
 */
function alignToConstant(align: string): number {
	const c = getConstants();
	const map: Record<string, number> = {
		'flex-start': c.ALIGN_FLEX_START,
		'flex-end': c.ALIGN_FLEX_END,
		center: c.ALIGN_CENTER,
		stretch: c.ALIGN_STRETCH,
		baseline: c.ALIGN_BASELINE,
		'space-between': c.ALIGN_SPACE_BETWEEN,
		'space-around': c.ALIGN_SPACE_AROUND,
	};
	return map[align] ?? c.ALIGN_STRETCH;
}

/**
 * Convert justify value to layout constant.
 */
function justifyToConstant(justify: string): number {
	const c = getConstants();
	const map: Record<string, number> = {
		'flex-start': c.JUSTIFY_FLEX_START,
		'flex-end': c.JUSTIFY_FLEX_END,
		center: c.JUSTIFY_CENTER,
		'space-between': c.JUSTIFY_SPACE_BETWEEN,
		'space-around': c.JUSTIFY_SPACE_AROUND,
		'space-evenly': c.JUSTIFY_SPACE_EVENLY,
	};
	return map[justify] ?? c.JUSTIFY_FLEX_START;
}

// ============================================================================
// Layout Calculation
// ============================================================================

/**
 * Calculate layout for the entire tree starting from root.
 */
export function calculateLayout(root: InkxNode, width: number, height: number): void {
	const c = getConstants();
	if (!root.layoutNode) {
		throw new Error('Root node must have a layout node');
	}
	root.layoutNode.calculateLayout(width, height, c.DIRECTION_LTR);
	propagateLayout(root, 0, 0);
	notifyLayoutSubscribers(root);
}

/**
 * Propagate computed layout from layout nodes to InkxNodes.
 */
function propagateLayout(node: InkxNode, parentX: number, parentY: number): void {
	// Save previous layout for change detection
	node.prevLayout = node.computedLayout;

	// Get computed layout from layout node
	if (!node.layoutNode) {
		// Virtual nodes (raw text, nested text) inherit parent layout
		return;
	}
	const left = node.layoutNode.getComputedLeft();
	const top = node.layoutNode.getComputedTop();
	const width = node.layoutNode.getComputedWidth();
	const height = node.layoutNode.getComputedHeight();

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
		// Nested text nodes become "virtual" - no layout node
		if (type === 'inkx-text' && hostContext.isInsideText) {
			return createVirtualTextNode(props as TextProps);
		}
		return createNode(type, props);
	},

	createTextInstance(text: string): InkxNode {
		// Raw text nodes don't have layout nodes - they're just data nodes
		// Their content is rendered by their parent inkx-text element
		const node: InkxNode = {
			type: 'inkx-text',
			props: { children: text } as TextProps,
			children: [],
			parent: null,
			layoutNode: null, // No layout node for raw text
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
		// Only add to layout tree if both nodes have layout nodes
		if (parentInstance.layoutNode && child.layoutNode) {
			// Count non-raw-text children for proper layout index
			const layoutIndex = parentInstance.children.filter((c) => c.layoutNode !== null).length - 1;
			parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex);
		}
		parentInstance.layoutDirty = true;
	},

	appendInitialChild(parentInstance: InkxNode, child: InkxNode) {
		child.parent = parentInstance;
		parentInstance.children.push(child);
		// Only add to layout tree if both nodes have layout nodes
		if (parentInstance.layoutNode && child.layoutNode) {
			const layoutIndex = parentInstance.children.filter((c) => c.layoutNode !== null).length - 1;
			parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex);
		}
	},

	appendChildToContainer(container: Container, child: InkxNode) {
		child.parent = container.root;
		container.root.children.push(child);
		if (container.root.layoutNode && child.layoutNode) {
			const layoutIndex = container.root.children.filter((c) => c.layoutNode !== null).length - 1;
			container.root.layoutNode.insertChild(child.layoutNode, layoutIndex);
		}
		container.root.layoutDirty = true;
	},

	removeChild(parentInstance: InkxNode, child: InkxNode) {
		const index = parentInstance.children.indexOf(child);
		if (index !== -1) {
			parentInstance.children.splice(index, 1);
			if (parentInstance.layoutNode && child.layoutNode) {
				parentInstance.layoutNode.removeChild(child.layoutNode);
				child.layoutNode.free();
			}
			child.parent = null;
			parentInstance.layoutDirty = true;
		}
	},

	removeChildFromContainer(container: Container, child: InkxNode) {
		const index = container.root.children.indexOf(child);
		if (index !== -1) {
			container.root.children.splice(index, 1);
			if (container.root.layoutNode && child.layoutNode) {
				container.root.layoutNode.removeChild(child.layoutNode);
				child.layoutNode.free();
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
			if (parentInstance.layoutNode && child.layoutNode) {
				// Count non-raw-text children before this position for proper layout index
				const layoutIndex = parentInstance.children
					.slice(0, beforeIndex)
					.filter((c) => c.layoutNode !== null).length;
				parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex);
			}
			parentInstance.layoutDirty = true;
		}
	},

	insertInContainerBefore(container: Container, child: InkxNode, beforeChild: InkxNode) {
		const beforeIndex = container.root.children.indexOf(beforeChild);
		if (beforeIndex !== -1) {
			child.parent = container.root;
			container.root.children.splice(beforeIndex, 0, child);
			if (container.root.layoutNode && child.layoutNode) {
				const layoutIndex = container.root.children
					.slice(0, beforeIndex)
					.filter((c) => c.layoutNode !== null).length;
				container.root.layoutNode.insertChild(child.layoutNode, layoutIndex);
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

	// Note: react-reconciler 0.33+ changed the signature from
	// commitUpdate(instance, updatePayload, type, oldProps, newProps) to
	// commitUpdate(instance, type, oldProps, newProps, finishedWork)
	commitUpdate(
		instance: InkxNode,
		_type: InkxNodeType,
		oldProps: BoxProps | TextProps,
		newProps: BoxProps | TextProps,
		_finishedWork: unknown,
	) {
		// Check if layout-affecting props changed
		if (
			layoutPropsChanged(oldProps as Record<string, unknown>, newProps as Record<string, unknown>)
		) {
			if (instance.layoutNode) {
				applyBoxProps(instance.layoutNode, newProps as BoxProps);
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
			if (container.root.layoutNode && child.layoutNode) {
				container.root.layoutNode.removeChild(child.layoutNode);
				child.layoutNode.free();
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
	'scrollTo',
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
