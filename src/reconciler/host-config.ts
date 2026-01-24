/**
 * React Reconciler Host Config
 *
 * Defines how React creates, updates, and manages InkxNodes.
 * This is the bridge between React's reconciliation algorithm
 * and our custom terminal node tree.
 */

import { createContext } from 'react';
import { DefaultEventPriority, NoEventPriority } from 'react-reconciler/constants.js';
import type { BoxProps, InkxNode, InkxNodeType, TextProps } from '../types.js';
import { contentPropsChanged, layoutPropsChanged, propsEqual } from './helpers.js';
import { applyBoxProps, createNode, createVirtualTextNode } from './nodes.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Container type - the root of our Inkx tree
 */
export interface Container {
	root: InkxNode;
	onRender: () => void;
}

/**
 * Host context tracks whether we're inside a Text component
 */
interface HostContext {
	isInsideText: boolean;
}

// ============================================================================
// Update Priority Management (for react-reconciler 0.33+)
// ============================================================================

let currentUpdatePriority = NoEventPriority;

// ============================================================================
// Host Config
// ============================================================================

/**
 * The React Reconciler host config.
 * This defines how React creates, updates, and manages our custom InkxNodes.
 */
export const hostConfig = {
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
	getRootHostContext(): HostContext {
		return { isInsideText: false };
	},

	getChildHostContext(parentHostContext: HostContext, type: InkxNodeType): HostContext {
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
		hostContext: HostContext,
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
			contentRect: null,
			screenRect: null,
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
