/**
 * Phase 2: Layout Phase
 *
 * Run Yoga layout calculation and propagate dimensions to all nodes.
 */

import type { BoxProps, ComputedLayout, InkxNode } from '../types.js';

/**
 * Run Yoga layout calculation and propagate dimensions to all nodes.
 *
 * @param root The root InkxNode
 * @param width Terminal width in columns
 * @param height Terminal height in rows
 */
export function layoutPhase(root: InkxNode, width: number, height: number): void {
	// Check if dimensions changed from previous layout
	const prevLayout = root.computedLayout;
	const dimensionsChanged =
		prevLayout && (prevLayout.width !== width || prevLayout.height !== height);

	// Only recalculate if something changed (dirty nodes or dimensions)
	if (!dimensionsChanged && !hasLayoutDirtyNodes(root)) {
		return;
	}

	// Run Yoga layout calculation (root always has a layoutNode)
	if (root.layoutNode) {
		root.layoutNode.calculateLayout(width, height);
	}

	// Propagate computed dimensions to all nodes
	propagateLayout(root, 0, 0);

	// Notify subscribers (triggers useLayout re-renders)
	notifyLayoutSubscribers(root);
}

/**
 * Check if any node in the tree has layoutDirty flag set.
 */
function hasLayoutDirtyNodes(node: InkxNode): boolean {
	if (node.layoutDirty) return true;
	for (const child of node.children) {
		if (hasLayoutDirtyNodes(child)) return true;
	}
	return false;
}

/**
 * Propagate computed layout from Yoga nodes to InkxNodes.
 *
 * @param node The node to process
 * @param parentX Absolute X position of parent
 * @param parentY Absolute Y position of parent
 */
function propagateLayout(node: InkxNode, parentX: number, parentY: number): void {
	// Save previous layout for change detection
	node.prevLayout = node.computedLayout;

	// Virtual/raw text nodes (no layoutNode) inherit parent's position
	if (!node.layoutNode) {
		node.computedLayout = {
			x: parentX,
			y: parentY,
			width: 0,
			height: 0,
		};
		node.layoutDirty = false;
		// Still recurse to children (virtual text nodes can have raw text children)
		for (const child of node.children) {
			propagateLayout(child, parentX, parentY);
		}
		return;
	}

	// Compute absolute position from Yoga
	node.computedLayout = {
		x: parentX + node.layoutNode.getComputedLeft(),
		y: parentY + node.layoutNode.getComputedTop(),
		width: node.layoutNode.getComputedWidth(),
		height: node.layoutNode.getComputedHeight(),
	};

	// Clear layout dirty flag
	node.layoutDirty = false;

	// If dimensions changed, mark content as dirty
	if (!layoutEqual(node.prevLayout, node.computedLayout)) {
		node.contentDirty = true;
	}

	// Recurse to children
	for (const child of node.children) {
		propagateLayout(child, node.computedLayout.x, node.computedLayout.y);
	}
}

/**
 * Notify all layout subscribers of dimension changes.
 */
function notifyLayoutSubscribers(node: InkxNode): void {
	// Only notify if dimensions actually changed
	if (!layoutEqual(node.prevLayout, node.computedLayout)) {
		for (const subscriber of node.layoutSubscribers) {
			subscriber();
		}
	}

	// Recurse to children
	for (const child of node.children) {
		notifyLayoutSubscribers(child);
	}
}

/**
 * Check if two layouts are equal.
 */
export function layoutEqual(a: ComputedLayout | null, b: ComputedLayout | null): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// ============================================================================
// Phase 2.5: Scroll Phase (for overflow='scroll' containers)
// ============================================================================

/**
 * Calculate scroll state for all overflow='scroll' containers.
 *
 * This phase runs after layout to determine which children are visible
 * within each scrollable container.
 */
export function scrollPhase(root: InkxNode): void {
	traverseTree(root, (node) => {
		const props = node.props as BoxProps;
		if (props.overflow !== 'scroll') return;

		// Calculate scroll state for this container
		calculateScrollState(node, props);
	});
}

/**
 * Calculate scroll state for a single scrollable container.
 */
function calculateScrollState(node: InkxNode, props: BoxProps): void {
	const layout = node.computedLayout;
	if (!layout || !node.layoutNode) return;

	// Calculate viewport (container minus borders/padding)
	const border = props.borderStyle
		? getBorderSize(props)
		: { top: 0, bottom: 0, left: 0, right: 0 };
	const padding = getPadding(props);

	const viewportHeight = layout.height - border.top - border.bottom - padding.top - padding.bottom;

	// Calculate total content height and child positions
	let contentHeight = 0;
	const childPositions: {
		child: InkxNode;
		top: number;
		bottom: number;
		index: number;
		isSticky: boolean;
		stickyTop?: number;
		stickyBottom?: number;
	}[] = [];

	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];
		if (!child.layoutNode || !child.computedLayout) continue;

		const childTop = child.computedLayout.y - layout.y - border.top - padding.top;
		const childBottom = childTop + child.computedLayout.height;
		const childProps = child.props as BoxProps;

		childPositions.push({
			child,
			top: childTop,
			bottom: childBottom,
			index: i,
			isSticky: childProps.position === 'sticky',
			stickyTop: childProps.stickyTop,
			stickyBottom: childProps.stickyBottom,
		});

		contentHeight = Math.max(contentHeight, childBottom);
	}

	// Calculate scroll offset based on scrollTo prop
	// Use "ensure visible" scrolling: only scroll when target would be off-screen
	// Preserve previous offset when target is already visible
	let scrollOffset = node.scrollState?.offset ?? 0;
	const scrollTo = props.scrollTo;

	if (scrollTo !== undefined && scrollTo >= 0 && scrollTo < childPositions.length) {
		// Find the target child
		const target = childPositions.find((c) => c.index === scrollTo);
		if (target) {
			// Calculate current visible range
			const visibleTop = scrollOffset;
			const visibleBottom = scrollOffset + viewportHeight;

			// Only scroll if target is outside visible range
			if (target.top < visibleTop) {
				// Target is above viewport - scroll up to show it at top
				scrollOffset = target.top;
			} else if (target.bottom > visibleBottom) {
				// Target is below viewport - scroll down to show it at bottom
				scrollOffset = target.bottom - viewportHeight;
			}
			// Otherwise, keep current scroll position (target is visible)

			// Clamp to valid range
			scrollOffset = Math.max(0, scrollOffset);
			scrollOffset = Math.min(scrollOffset, Math.max(0, contentHeight - viewportHeight));
		}
	}

	// Determine visible children
	const visibleTop = scrollOffset;
	const visibleBottom = scrollOffset + viewportHeight;

	let firstVisible = -1;
	let lastVisible = -1;
	let hiddenAbove = 0;
	let hiddenBelow = 0;

	for (const cp of childPositions) {
		// Sticky children are always considered "visible" for rendering purposes
		if (cp.isSticky) {
			if (firstVisible === -1) firstVisible = cp.index;
			lastVisible = Math.max(lastVisible, cp.index);
			continue;
		}

		if (cp.bottom <= visibleTop) {
			hiddenAbove++;
		} else if (cp.top >= visibleBottom) {
			hiddenBelow++;
		} else {
			// This child is at least partially visible
			if (firstVisible === -1) firstVisible = cp.index;
			lastVisible = cp.index;
		}
	}

	// Calculate sticky children render positions
	const stickyChildren: NonNullable<InkxNode['scrollState']>['stickyChildren'] = [];

	for (const cp of childPositions) {
		if (!cp.isSticky) continue;

		const childHeight = cp.bottom - cp.top;
		const stickyTop = cp.stickyTop ?? 0;
		const stickyBottom = cp.stickyBottom;

		// Natural position: where it would be without sticking (relative to viewport)
		const naturalRenderY = cp.top - scrollOffset;

		let renderOffset: number;

		if (stickyBottom !== undefined) {
			// Sticky to bottom: element pins to bottom edge when scrolled past
			const bottomPinPosition = viewportHeight - stickyBottom - childHeight;
			// Use natural position if it's below the pin point, otherwise pin
			renderOffset = Math.min(naturalRenderY, bottomPinPosition);
		} else {
			// Sticky to top (default): element pins to top edge when scrolled past
			// Use natural position if it's above the pin point, otherwise pin
			renderOffset = Math.max(naturalRenderY, stickyTop);
		}

		// Clamp to viewport bounds
		renderOffset = Math.max(0, Math.min(renderOffset, viewportHeight - childHeight));

		stickyChildren.push({
			index: cp.index,
			renderOffset,
			naturalTop: cp.top,
			height: childHeight,
		});
	}

	// Store scroll state
	node.scrollState = {
		offset: scrollOffset,
		contentHeight,
		viewportHeight,
		firstVisibleChild: firstVisible,
		lastVisibleChild: lastVisible,
		hiddenAbove,
		hiddenBelow,
		stickyChildren: stickyChildren.length > 0 ? stickyChildren : undefined,
	};
}

/**
 * Traverse tree in depth-first order.
 */
function traverseTree(node: InkxNode, callback: (node: InkxNode) => void): void {
	callback(node);
	for (const child of node.children) {
		traverseTree(child, callback);
	}
}

/**
 * Get padding values from props.
 */
function getPadding(props: BoxProps): {
	top: number;
	bottom: number;
	left: number;
	right: number;
} {
	return {
		top: props.paddingTop ?? props.paddingY ?? props.padding ?? 0,
		bottom: props.paddingBottom ?? props.paddingY ?? props.padding ?? 0,
		left: props.paddingLeft ?? props.paddingX ?? props.padding ?? 0,
		right: props.paddingRight ?? props.paddingX ?? props.padding ?? 0,
	};
}

/**
 * Get border size (1 or 0 for each side).
 */
function getBorderSize(props: BoxProps): {
	top: number;
	bottom: number;
	left: number;
	right: number;
} {
	if (!props.borderStyle) {
		return { top: 0, bottom: 0, left: 0, right: 0 };
	}
	return {
		top: props.borderTop !== false ? 1 : 0,
		bottom: props.borderBottom !== false ? 1 : 0,
		left: props.borderLeft !== false ? 1 : 0,
		right: props.borderRight !== false ? 1 : 0,
	};
}
