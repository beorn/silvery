/**
 * Phase 3: Content Phase (Adapter-aware)
 *
 * Render all nodes to a RenderBuffer using the current RenderAdapter.
 * This is a parallel implementation that works with any adapter (terminal, canvas, etc.)
 *
 * Key differences from content-phase.ts:
 * - Uses RenderBuffer interface instead of TerminalBuffer directly
 * - Works with pixel dimensions (canvas) or cell dimensions (terminal)
 * - Delegates to adapter for text measurement and styling
 */

import {
	getRenderAdapter,
	hasRenderAdapter,
	type RenderBuffer,
	type RenderStyle,
} from '../render-adapter.js';
import type { BoxProps, InkxNode, Rect, TextProps } from '../types.js';
import { getBorderSize, getPadding } from './helpers.js';

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Render all nodes to a RenderBuffer using the current adapter.
 *
 * @param root The root InkxNode
 * @returns A RenderBuffer with the rendered content
 */
export function contentPhaseAdapter(root: InkxNode): RenderBuffer {
	if (!hasRenderAdapter()) {
		throw new Error('contentPhaseAdapter called without a render adapter set');
	}

	const layout = root.contentRect;
	if (!layout) {
		throw new Error('contentPhaseAdapter called before layout phase');
	}

	const adapter = getRenderAdapter();
	const buffer = adapter.createBuffer(layout.width, layout.height);

	renderNodeToBuffer(root, buffer);
	return buffer;
}

// ============================================================================
// Node Rendering
// ============================================================================

/**
 * Render a single node to the buffer.
 */
function renderNodeToBuffer(
	node: InkxNode,
	buffer: RenderBuffer,
	scrollOffset = 0,
	clipBounds?: { top: number; bottom: number },
): void {
	const layout = node.contentRect;
	if (!layout) return;

	// Skip nodes without layout (raw text and virtual text nodes)
	if (!node.layoutNode) return;

	// Skip hidden nodes (Suspense support)
	if (node.hidden) return;

	const props = node.props as BoxProps & TextProps;

	// Skip display="none" nodes
	if (props.display === 'none') return;

	// Check if this is a scrollable container
	const isScrollContainer = props.overflow === 'scroll' && node.scrollState;

	// Render based on node type
	if (node.type === 'inkx-box') {
		renderBox(node, buffer, layout, props, clipBounds, scrollOffset);

		// Scroll indicators
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

// ============================================================================
// Box Rendering
// ============================================================================

/**
 * Render a Box node.
 */
function renderBox(
	_node: InkxNode,
	buffer: RenderBuffer,
	layout: Rect,
	props: BoxProps,
	clipBounds?: { top: number; bottom: number },
	scrollOffset = 0,
): void {
	const { x, width, height } = layout;
	const y = layout.y - scrollOffset;

	// Skip if completely outside clip bounds
	if (clipBounds && (y + height <= clipBounds.top || y >= clipBounds.bottom)) {
		return;
	}

	// Fill background if set
	if (props.backgroundColor) {
		const style: RenderStyle = { bg: props.backgroundColor };

		if (clipBounds) {
			const clippedY = Math.max(y, clipBounds.top);
			const clippedHeight = Math.min(y + height, clipBounds.bottom) - clippedY;
			if (clippedHeight > 0) {
				buffer.fillRect(x, clippedY, width, clippedHeight, style);
			}
		} else {
			buffer.fillRect(x, y, width, height, style);
		}
	}

	// Render border if set
	if (props.borderStyle) {
		renderBorder(buffer, x, y, width, height, props, clipBounds);
	}
}

/**
 * Render a border around a box.
 */
function renderBorder(
	buffer: RenderBuffer,
	x: number,
	y: number,
	width: number,
	height: number,
	props: BoxProps,
	clipBounds?: { top: number; bottom: number },
): void {
	const adapter = getRenderAdapter();
	const chars = adapter.getBorderChars(props.borderStyle ?? 'single');
	const style: RenderStyle = props.borderColor ? { fg: props.borderColor } : {};

	const showTop = props.borderTop !== false;
	const showBottom = props.borderBottom !== false;
	const showLeft = props.borderLeft !== false;
	const showRight = props.borderRight !== false;

	// Helper to check if a row is visible
	const isRowVisible = (row: number): boolean => {
		if (!clipBounds) return buffer.inBounds(0, row);
		return row >= clipBounds.top && row < clipBounds.bottom && buffer.inBounds(0, row);
	};

	// Top border
	if (showTop && isRowVisible(y)) {
		if (showLeft) buffer.drawChar(x, y, chars.topLeft, style);
		for (let col = x + 1; col < x + width - 1; col++) {
			if (buffer.inBounds(col, y)) {
				buffer.drawChar(col, y, chars.horizontal, style);
			}
		}
		if (showRight && buffer.inBounds(x + width - 1, y)) {
			buffer.drawChar(x + width - 1, y, chars.topRight, style);
		}
	}

	// Side borders
	for (let row = y + 1; row < y + height - 1; row++) {
		if (!isRowVisible(row)) continue;
		if (showLeft) buffer.drawChar(x, row, chars.vertical, style);
		if (showRight && buffer.inBounds(x + width - 1, row)) {
			buffer.drawChar(x + width - 1, row, chars.vertical, style);
		}
	}

	// Bottom border
	const bottomY = y + height - 1;
	if (showBottom && isRowVisible(bottomY)) {
		if (showLeft) buffer.drawChar(x, bottomY, chars.bottomLeft, style);
		for (let col = x + 1; col < x + width - 1; col++) {
			if (buffer.inBounds(col, bottomY)) {
				buffer.drawChar(col, bottomY, chars.horizontal, style);
			}
		}
		if (showRight && buffer.inBounds(x + width - 1, bottomY)) {
			buffer.drawChar(x + width - 1, bottomY, chars.bottomRight, style);
		}
	}
}

// ============================================================================
// Text Rendering
// ============================================================================

/**
 * Render a Text node.
 */
function renderText(
	node: InkxNode,
	buffer: RenderBuffer,
	layout: Rect,
	props: TextProps,
	scrollOffset = 0,
	clipBounds?: { top: number; bottom: number },
): void {
	const { x } = layout;
	const y = layout.y - scrollOffset;

	// Collect text content from children
	const text = collectTextContent(node);
	if (!text) return;

	// Map underline style to supported values
	const underlineStyle = props.underlineStyle as
		| 'single'
		| 'double'
		| 'curly'
		| 'dotted'
		| 'dashed'
		| undefined;

	// Build style from props
	const style: RenderStyle = {
		fg: props.color ?? undefined,
		bg: props.backgroundColor ?? undefined,
		attrs: {
			bold: props.bold,
			dim: props.dim,
			italic: props.italic,
			underline: props.underline,
			underlineStyle,
			underlineColor: props.underlineColor ?? undefined,
			strikethrough: props.strikethrough,
			inverse: props.inverse,
		},
	};

	// Simple text rendering - draw at position
	// TODO: Handle wrapping, truncation for canvas (currently simple single-line)
	if (clipBounds && (y < clipBounds.top || y >= clipBounds.bottom)) {
		return; // Skip if outside clip bounds
	}

	buffer.drawText(x, y, text, style);
}

/**
 * Collect text content from a node and its children.
 */
function collectTextContent(node: InkxNode): string {
	// Raw text nodes have textContent set directly
	if (node.isRawText && node.textContent !== undefined) {
		return node.textContent;
	}

	let result = '';
	for (const child of node.children) {
		result += collectTextContent(child);
	}
	return result;
}

// ============================================================================
// Scroll Indicators
// ============================================================================

interface ScrollState {
	offset: number;
	contentHeight: number;
	viewportHeight: number;
	firstVisibleChild: number;
	lastVisibleChild: number;
	stickyChildren?: Array<{
		index: number;
		naturalTop: number;
		renderOffset: number;
	}>;
}

/**
 * Render scroll indicators for a scrollable container.
 */
function renderScrollIndicators(
	_node: InkxNode,
	buffer: RenderBuffer,
	layout: Rect,
	props: BoxProps,
	scrollState: ScrollState,
): void {
	const { x, width, height } = layout;
	const y = layout.y;

	const border = props.borderStyle ? getBorderSize(props) : { top: 0, bottom: 0, right: 0 };
	const canScrollUp = scrollState.offset > 0;
	const canScrollDown =
		scrollState.offset + scrollState.viewportHeight < scrollState.contentHeight;

	const indicatorX = x + width - border.right - 1;
	const style: RenderStyle = { fg: props.borderColor ?? '#808080' };

	// Up indicator
	if (canScrollUp) {
		const indicatorY = y + border.top;
		if (buffer.inBounds(indicatorX, indicatorY)) {
			buffer.drawChar(indicatorX, indicatorY, '▲', style);
		}
	}

	// Down indicator
	if (canScrollDown) {
		const indicatorY = y + height - border.bottom - 1;
		if (buffer.inBounds(indicatorX, indicatorY)) {
			buffer.drawChar(indicatorX, indicatorY, '▼', style);
		}
	}
}

// ============================================================================
// Children Rendering
// ============================================================================

/**
 * Render children of a scroll container.
 */
function renderScrollContainerChildren(
	node: InkxNode,
	buffer: RenderBuffer,
	props: BoxProps,
	clipBounds?: { top: number; bottom: number },
): void {
	const layout = node.contentRect;
	const ss = node.scrollState as ScrollState | undefined;
	if (!layout || !ss) return;

	const border = props.borderStyle
		? getBorderSize(props)
		: { top: 0, bottom: 0, left: 0, right: 0 };
	const padding = getPadding(props);

	const nodeClip = {
		top: layout.y + border.top + padding.top,
		bottom: layout.y + layout.height - border.bottom - padding.bottom,
	};

	const childClipBounds = clipBounds
		? {
				top: Math.max(clipBounds.top, nodeClip.top),
				bottom: Math.min(clipBounds.bottom, nodeClip.bottom),
			}
		: nodeClip;

	// Render visible children
	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];
		if (!child) continue;
		const childProps = child.props as BoxProps;

		if (childProps.position === 'sticky') continue;
		if (i < ss.firstVisibleChild || i > ss.lastVisibleChild) continue;

		renderNodeToBuffer(child, buffer, ss.offset, childClipBounds);
	}

	// Render sticky children
	if (ss.stickyChildren) {
		for (const sticky of ss.stickyChildren) {
			const child = node.children[sticky.index];
			if (!child?.contentRect) continue;

			const stickyScrollOffset = sticky.naturalTop - sticky.renderOffset;
			renderNodeToBuffer(child, buffer, stickyScrollOffset, childClipBounds);
		}
	}
}

/**
 * Render children of a normal container.
 */
function renderNormalChildren(
	node: InkxNode,
	buffer: RenderBuffer,
	scrollOffset: number,
	props: BoxProps,
	clipBounds?: { top: number; bottom: number },
): void {
	const layout = node.contentRect;
	if (!layout) return;

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

		effectiveClipBounds = clipBounds
			? {
					top: Math.max(clipBounds.top, nodeClip.top),
					bottom: Math.min(clipBounds.bottom, nodeClip.bottom),
				}
			: nodeClip;
	}

	for (const child of node.children) {
		renderNodeToBuffer(child, buffer, scrollOffset, effectiveClipBounds);
	}
}
