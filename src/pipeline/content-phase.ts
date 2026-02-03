/**
 * Phase 3: Content Phase
 *
 * Render all nodes to a terminal buffer.
 *
 * This module orchestrates the rendering process by traversing the node tree
 * and delegating to specialized rendering functions for boxes and text.
 */

import { TerminalBuffer } from '../buffer.js';
import type { BoxProps, InkxNode, TextProps } from '../types.js';
import { rectEqual } from '../types.js';
import { getBorderSize, getPadding } from './helpers.js';
import { renderBox, renderScrollIndicators } from './render-box.js';
import { clearBgConflictWarnings, renderText } from './render-text.js';

/**
 * Render all nodes to a terminal buffer.
 *
 * @param root The root InkxNode
 * @param prevBuffer Previous buffer for incremental rendering (optional)
 * @returns A TerminalBuffer with the rendered content
 */
export function contentPhase(root: InkxNode, prevBuffer?: TerminalBuffer | null): TerminalBuffer {
	const layout = root.computedLayout;
	if (!layout) {
		throw new Error('contentPhase called before layout phase');
	}

	// Clone prevBuffer if same dimensions, else create fresh
	const canReuse =
		prevBuffer && prevBuffer.width === layout.width && prevBuffer.height === layout.height;

	const buffer = canReuse ? prevBuffer.clone() : new TerminalBuffer(layout.width, layout.height);
	renderNodeToBuffer(root, buffer, 0, undefined, canReuse);
	return buffer;
}

// Re-export for consumers who need to clear bg conflict warnings
export { clearBgConflictWarnings };

/**
 * Clear dirty flags on a subtree that was skipped during incremental rendering.
 */
function clearDirtyFlags(node: InkxNode): void {
	node.contentDirty = false;
	node.subtreeDirty = false;
	for (const child of node.children) {
		if (child.layoutNode) clearDirtyFlags(child);
	}
}

/**
 * Render a single node to the buffer.
 */
function renderNodeToBuffer(
	node: InkxNode,
	buffer: TerminalBuffer,
	scrollOffset = 0,
	clipBounds?: { top: number; bottom: number },
	hasPrevBuffer = false,
): void {
	const layout = node.computedLayout;
	if (!layout) return;

	// Skip nodes without Yoga (raw text and virtual text nodes)
	// Their content is rendered by their parent inkx-text via collectTextContent()
	if (!node.layoutNode) return;

	// Skip hidden nodes (Suspense support)
	// When a Suspense boundary shows a fallback, the hidden subtree is not rendered
	if (node.hidden) return;

	const props = node.props as BoxProps & TextProps;

	// Skip display="none" nodes - they have 0x0 dimensions and shouldn't render
	// Also skip their children since the entire subtree is hidden
	if (props.display === 'none') return;

	// FAST PATH: Skip entire subtree if unchanged and we have a previous buffer
	// The buffer was cloned from prevBuffer, so skipped nodes keep their rendered output
	const layoutChanged = !rectEqual(node.prevLayout, node.computedLayout);
	if (hasPrevBuffer && !node.contentDirty && !layoutChanged && !node.subtreeDirty) {
		clearDirtyFlags(node);
		return;
	}

	// Check if this is a scrollable container
	const isScrollContainer = props.overflow === 'scroll' && node.scrollState;

	// When re-rendering a content-dirty box on a cloned buffer, clear its region first.
	// contentDirty means the node's own props or structure changed (backgroundColor
	// removed, children added/removed triggering layout change, etc.), so old pixels
	// from the cloned buffer may bleed through. Nodes with backgroundColor are already
	// cleared by renderBox's fill. Subtree-dirty-only nodes (descendants changed but
	// this node's own content didn't) don't need clearing - their children will
	// overwrite their own regions.
	if (
		hasPrevBuffer &&
		(node.contentDirty || layoutChanged) &&
		node.type === 'inkx-box' &&
		!props.backgroundColor
	) {
		const screenY = layout.y - scrollOffset;
		const clearY = clipBounds ? Math.max(screenY, clipBounds.top) : screenY;
		const clearBottom = clipBounds
			? Math.min(screenY + layout.height, clipBounds.bottom)
			: screenY + layout.height;
		const clearHeight = clearBottom - clearY;
		if (clearHeight > 0) {
			buffer.fill(layout.x, clearY, layout.width, clearHeight, { char: ' ' });
		}
	}

	// Render based on node type
	if (node.type === 'inkx-box') {
		renderBox(node, buffer, layout, props, clipBounds, scrollOffset);

		// If scrollable, render overflow indicators
		if (isScrollContainer && node.scrollState) {
			renderScrollIndicators(node, buffer, layout, props, node.scrollState);
		}
	} else if (node.type === 'inkx-text') {
		renderText(node, buffer, layout, props, scrollOffset, clipBounds);
	}

	// Render children
	if (isScrollContainer && node.scrollState) {
		renderScrollContainerChildren(node, buffer, props, clipBounds, hasPrevBuffer);
	} else {
		renderNormalChildren(node, buffer, scrollOffset, props, clipBounds, hasPrevBuffer);
	}

	// Clear dirty flags
	node.contentDirty = false;
	node.subtreeDirty = false;
}

/**
 * Render children of a scroll container with proper clipping and offset.
 */
function renderScrollContainerChildren(
	node: InkxNode,
	buffer: TerminalBuffer,
	props: BoxProps,
	clipBounds?: { top: number; bottom: number },
	hasPrevBuffer = false,
): void {
	const layout = node.computedLayout;
	const ss = node.scrollState;
	if (!layout || !ss) return;

	const border = props.borderStyle
		? getBorderSize(props)
		: { top: 0, bottom: 0, left: 0, right: 0 };
	const padding = getPadding(props);

	// Set up clip bounds for children
	const nodeClip = {
		top: layout.y + border.top + padding.top,
		bottom: layout.y + layout.height - border.bottom - padding.bottom,
	};
	// Intersect with parent clip bounds if present
	const childClipBounds = clipBounds
		? {
				top: Math.max(clipBounds.top, nodeClip.top),
				bottom: Math.min(clipBounds.bottom, nodeClip.bottom),
			}
		: nodeClip;

	// IMPORTANT: Never use hasPrevBuffer for scroll container children.
	// Even if child content hasn't changed, their SCREEN position changes when
	// scrollOffset changes. The fast-path would incorrectly skip rendering them
	// at their new screen positions, causing visual corruption.
	// TODO: Track prevScrollOffset and only disable fast-path when it changes.

	// Clear the scroll container's viewport area before re-rendering children.
	// Children are forced to hasPrevBuffer=false (disabling fast-path), but the
	// buffer IS a clone from the previous frame. Without clearing, stale pixels
	// (e.g. old cursor highlight backgroundColor) bleed through in boxes that
	// no longer have their own backgroundColor.
	if (hasPrevBuffer && node.subtreeDirty) {
		const clearY = childClipBounds.top;
		const clearHeight = childClipBounds.bottom - childClipBounds.top;
		if (clearHeight > 0) {
			const contentX = layout.x + border.left + padding.left;
			const contentWidth =
				layout.width - border.left - border.right - padding.left - padding.right;
			buffer.fill(contentX, clearY, contentWidth, clearHeight, { char: ' ' });
		}
	}

	// First pass: render non-sticky visible children with scroll offset
	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];
		if (!child) continue;
		const childProps = child.props as BoxProps;

		// Skip sticky children - they're rendered in second pass
		if (childProps.position === 'sticky') {
			continue;
		}

		// Skip children that are completely outside the visible range
		if (i < ss.firstVisibleChild || i > ss.lastVisibleChild) {
			continue;
		}

		// Render visible children with scroll offset applied
		// Pass hasPrevBuffer=false to force re-rendering at new screen positions
		renderNodeToBuffer(child, buffer, ss.offset, childClipBounds, false);
	}

	// Second pass: render sticky children at their computed positions
	// Rendered last so they appear on top of other content
	if (ss.stickyChildren) {
		for (const sticky of ss.stickyChildren) {
			const child = node.children[sticky.index];
			if (!child || !child.computedLayout) continue;

			// Calculate the scroll offset that would place the child at its sticky position
			// stickyOffset = naturalTop - renderOffset
			// This makes the child render at renderOffset instead of its natural position
			const stickyScrollOffset = sticky.naturalTop - sticky.renderOffset;

			renderNodeToBuffer(child, buffer, stickyScrollOffset, childClipBounds, false);
		}
	}
}

/**
 * Render children of a normal (non-scroll) container.
 */
function renderNormalChildren(
	node: InkxNode,
	buffer: TerminalBuffer,
	scrollOffset: number,
	props: BoxProps,
	clipBounds?: { top: number; bottom: number },
	hasPrevBuffer = false,
): void {
	const layout = node.computedLayout;
	if (!layout) return;

	// For overflow='hidden' containers, calculate clip bounds
	// Must account for scrollOffset since clip checks happen in screen coordinates
	let effectiveClipBounds = clipBounds;
	if (props.overflow === 'hidden') {
		const border = props.borderStyle
			? getBorderSize(props)
			: { top: 0, bottom: 0, left: 0, right: 0 };
		const padding = getPadding(props);
		// Adjust layout position by scrollOffset to get screen coordinates
		const adjustedY = layout.y - scrollOffset;
		const nodeClip = {
			top: adjustedY + border.top + padding.top,
			bottom: adjustedY + layout.height - border.bottom - padding.bottom,
		};
		// Intersect with parent clip bounds if present
		if (clipBounds) {
			effectiveClipBounds = {
				top: Math.max(clipBounds.top, nodeClip.top),
				bottom: Math.min(clipBounds.bottom, nodeClip.bottom),
			};
		} else {
			effectiveClipBounds = nodeClip;
		}
	}

	// Normal rendering - render all children with effective clip bounds
	for (const child of node.children) {
		renderNodeToBuffer(child, buffer, scrollOffset, effectiveClipBounds, hasPrevBuffer);
	}
}
