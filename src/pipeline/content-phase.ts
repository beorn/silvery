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
import { getBorderSize, getPadding } from './helpers.js';
import { renderBox, renderScrollIndicators } from './render-box.js';
import { clearBgConflictWarnings, renderText } from './render-text.js';

/**
 * Render all nodes to a terminal buffer.
 *
 * @param root The root InkxNode
 * @returns A TerminalBuffer with the rendered content
 */
export function contentPhase(root: InkxNode): TerminalBuffer {
	const layout = root.computedLayout;
	if (!layout) {
		throw new Error('contentPhase called before layout phase');
	}

	const buffer = new TerminalBuffer(layout.width, layout.height);
	renderNodeToBuffer(root, buffer);
	return buffer;
}

// Re-export for consumers who need to clear bg conflict warnings
export { clearBgConflictWarnings };

/**
 * Render a single node to the buffer.
 */
function renderNodeToBuffer(
	node: InkxNode,
	buffer: TerminalBuffer,
	scrollOffset = 0,
	clipBounds?: { top: number; bottom: number },
): void {
	const layout = node.computedLayout;
	if (!layout) return;

	// Skip nodes without Yoga (raw text and virtual text nodes)
	// Their content is rendered by their parent inkx-text via collectTextContent()
	if (!node.layoutNode) return;

	const props = node.props as BoxProps & TextProps;

	// Skip display="none" nodes - they have 0x0 dimensions and shouldn't render
	// Also skip their children since the entire subtree is hidden
	if (props.display === 'none') return;

	// Check if this is a scrollable container
	const isScrollContainer = props.overflow === 'scroll' && node.scrollState;

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
		renderScrollContainerChildren(node, buffer, props, clipBounds);
	} else {
		renderNormalChildren(node, buffer, scrollOffset, props, clipBounds);
	}

	// Clear content dirty flag
	node.contentDirty = false;
}

/**
 * Render children of a scroll container with proper clipping and offset.
 */
function renderScrollContainerChildren(
	node: InkxNode,
	buffer: TerminalBuffer,
	props: BoxProps,
	clipBounds?: { top: number; bottom: number },
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
		renderNodeToBuffer(child, buffer, ss.offset, childClipBounds);
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

			renderNodeToBuffer(child, buffer, stickyScrollOffset, childClipBounds);
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
): void {
	const layout = node.computedLayout;
	if (!layout) return;

	// For overflow='hidden' containers, calculate clip bounds
	let effectiveClipBounds = clipBounds;
	if (props.overflow === 'hidden') {
		const border = props.borderStyle
			? getBorderSize(props)
			: { top: 0, bottom: 0, left: 0, right: 0 };
		const padding = getPadding(props);
		const nodeClip = {
			top: layout.y + border.top + padding.top,
			bottom: layout.y + layout.height - border.bottom - padding.bottom,
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
		renderNodeToBuffer(child, buffer, scrollOffset, effectiveClipBounds);
	}
}
