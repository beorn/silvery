/**
 * Inkx Render Pipeline
 *
 * The 5-phase rendering architecture:
 *
 * Phase 0: RECONCILIATION (React)
 *   React reconciliation builds the InkxNode tree.
 *   Components register layout constraints via props.
 *
 * Phase 1: MEASURE (for fit-content nodes)
 *   Traverse nodes with width/height="fit-content"
 *   Measure intrinsic content size
 *   Set Yoga constraints based on measurement
 *
 * Phase 2: LAYOUT
 *   Run yoga.calculateLayout()
 *   Propagate computed dimensions to all nodes
 *   Notify useLayout() subscribers
 *
 * Phase 3: CONTENT RENDER
 *   Render each node to the TerminalBuffer
 *   Handle text truncation, styling, borders
 *
 * Phase 4: DIFF & OUTPUT
 *   Compare current buffer with previous
 *   Emit minimal ANSI sequences for changes
 */

import {
	type Cell,
	type Color,
	type Style,
	TerminalBuffer,
	cellEquals,
	styleEquals,
} from './buffer.js';
import type { BoxProps, ComputedLayout, InkxNode, TextProps } from './types.js';
import { type StyledSegment, displayWidthAnsi, hasAnsi, parseAnsiText } from './unicode.js';

// ============================================================================
// Phase 1: Measure Phase
// ============================================================================

/**
 * Handle fit-content nodes by measuring their intrinsic content size.
 *
 * Traverses the tree and for any node with width="fit-content" or
 * height="fit-content", measures the content and sets the Yoga constraint.
 */
export function measurePhase(root: InkxNode): void {
	traverseTree(root, (node) => {
		// Skip nodes without Yoga (raw text nodes)
		if (!node.layoutNode) return;

		const props = node.props as BoxProps;

		if (props.width === 'fit-content' || props.height === 'fit-content') {
			const intrinsicSize = measureIntrinsicSize(node);

			if (props.width === 'fit-content') {
				node.layoutNode.setWidth(intrinsicSize.width);
			}
			if (props.height === 'fit-content') {
				node.layoutNode.setHeight(intrinsicSize.height);
			}
		}
	});
}

/**
 * Measure the intrinsic size of a node's content.
 *
 * For text nodes: measures the text width and line count.
 * For box nodes: recursively measures children based on flex direction.
 */
function measureIntrinsicSize(node: InkxNode): {
	width: number;
	height: number;
} {
	if (node.type === 'inkx-text') {
		const text = node.textContent ?? '';
		const lines = text.split('\n');
		const width = Math.max(...lines.map((line) => getTextWidth(line)));
		return {
			width,
			height: lines.length,
		};
	}

	// For boxes, measure based on flex direction
	const props = node.props as BoxProps;
	const isRow = props.flexDirection === 'row' || props.flexDirection === 'row-reverse';

	let width = 0;
	let height = 0;

	for (const child of node.children) {
		const childSize = measureIntrinsicSize(child);

		if (isRow) {
			width += childSize.width;
			height = Math.max(height, childSize.height);
		} else {
			width = Math.max(width, childSize.width);
			height += childSize.height;
		}
	}

	// Add padding
	const padding = getPadding(props);
	width += padding.left + padding.right;
	height += padding.top + padding.bottom;

	// Add border
	if (props.borderStyle) {
		const border = getBorderSize(props);
		width += border.left + border.right;
		height += border.top + border.bottom;
	}

	return { width, height };
}

// ============================================================================
// Phase 2: Layout Phase
// ============================================================================

/**
 * Run Yoga layout calculation and propagate dimensions to all nodes.
 *
 * @param root The root InkxNode
 * @param width Terminal width in columns
 * @param height Terminal height in rows
 */
export function layoutPhase(root: InkxNode, width: number, height: number): void {
	// Only recalculate if something changed
	if (!hasLayoutDirtyNodes(root)) {
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
	let scrollOffset = 0;
	const scrollTo = props.scrollTo;

	if (scrollTo !== undefined && scrollTo >= 0 && scrollTo < childPositions.length) {
		// Find the target child
		const target = childPositions.find((c) => c.index === scrollTo);
		if (target) {
			// Center the target child in the viewport (if possible)
			const targetMid = (target.top + target.bottom) / 2;
			const viewportMid = viewportHeight / 2;
			scrollOffset = Math.max(0, targetMid - viewportMid);

			// Clamp to valid range
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

// ============================================================================
// Phase 3: Content Phase
// ============================================================================

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

	// Check if this is a scrollable container
	const isScrollContainer = props.overflow === 'scroll' && node.scrollState;

	// Render based on node type
	if (node.type === 'inkx-box') {
		renderBox(node, buffer, layout, props, clipBounds);

		// If scrollable, render overflow indicators
		if (isScrollContainer && node.scrollState) {
			renderScrollIndicators(node, buffer, layout, props, node.scrollState);
		}
	} else if (node.type === 'inkx-text') {
		renderText(node, buffer, layout, props, scrollOffset, clipBounds);
	}

	// Render children
	if (isScrollContainer && node.scrollState) {
		// For scroll containers, only render visible children with offset
		const ss = node.scrollState;
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
	} else {
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

	// Clear content dirty flag
	node.contentDirty = false;
}

/**
 * Render scroll indicators on the border (e.g., "─▲42─" / "─▼42─").
 * Renders indicators directly on the border line for a cleaner look.
 */
function renderScrollIndicators(
	_node: InkxNode,
	buffer: TerminalBuffer,
	layout: ComputedLayout,
	props: BoxProps,
	ss: NonNullable<InkxNode['scrollState']>,
): void {
	const border = props.borderStyle
		? getBorderSize(props)
		: { top: 0, bottom: 0, left: 0, right: 0 };

	const indicatorStyle: Style = {
		fg: props.borderColor ? parseColor(props.borderColor) : 8, // Gray/dim
		bg: null,
		attrs: { dim: true },
	};

	// Top indicator (on top border, right side)
	if (ss.hiddenAbove > 0 && border.top > 0) {
		const indicator = `▲${ss.hiddenAbove}`;
		const x = layout.x + layout.width - border.right - indicator.length - 1;
		const y = layout.y;
		renderTextLine(buffer, x, y, indicator, indicatorStyle);
	}

	// Bottom indicator (on bottom border, right side)
	if (ss.hiddenBelow > 0 && border.bottom > 0) {
		const indicator = `▼${ss.hiddenBelow}`;
		const x = layout.x + layout.width - border.right - indicator.length - 1;
		const y = layout.y + layout.height - 1;
		renderTextLine(buffer, x, y, indicator, indicatorStyle);
	}
}

/**
 * Render a Box node.
 */
function renderBox(
	_node: InkxNode,
	buffer: TerminalBuffer,
	layout: ComputedLayout,
	props: BoxProps,
	clipBounds?: { top: number; bottom: number },
): void {
	const { x, y, width, height } = layout;

	// Skip if completely outside clip bounds
	if (clipBounds && (y + height <= clipBounds.top || y >= clipBounds.bottom)) {
		return;
	}

	// Fill background if set
	if (props.backgroundColor) {
		const bg = parseColor(props.backgroundColor);
		// Clip background fill to bounds
		if (clipBounds) {
			const clippedY = Math.max(y, clipBounds.top);
			const clippedHeight = Math.min(y + height, clipBounds.bottom) - clippedY;
			if (clippedHeight > 0) {
				buffer.fill(x, clippedY, width, clippedHeight, { bg });
			}
		} else {
			buffer.fill(x, y, width, height, { bg });
		}
	}

	// Render border if set
	if (props.borderStyle) {
		renderBorder(buffer, x, y, width, height, props, clipBounds);
	}
}

/**
 * Render a Text node.
 */
function renderText(
	node: InkxNode,
	buffer: TerminalBuffer,
	layout: ComputedLayout,
	props: TextProps,
	scrollOffset = 0,
	clipBounds?: { top: number; bottom: number },
): void {
	const { x, width, height } = layout;
	let { y } = layout;

	// Apply scroll offset
	y -= scrollOffset;

	// Clip to bounds if specified
	if (clipBounds) {
		if (y + height <= clipBounds.top || y >= clipBounds.bottom) {
			return; // Completely outside clip bounds
		}
	}

	// Collect text content from this node and all children
	// This handles both raw text nodes and <Text>content</Text> wrapper nodes
	const text = collectTextContent(node);

	// Get style
	const style = getTextStyle(props);

	// Handle wrapping/truncation
	const lines = formatTextLines(text, width, props.wrap);

	// Render each line
	for (let lineIdx = 0; lineIdx < lines.length && lineIdx < height; lineIdx++) {
		const lineY = y + lineIdx;
		// Skip lines outside clip bounds
		if (clipBounds && (lineY < clipBounds.top || lineY >= clipBounds.bottom)) {
			continue;
		}
		const line = lines[lineIdx];
		renderTextLine(buffer, x, lineY, line, style);
	}
}

/**
 * Recursively collect text content from a node and its children.
 * Handles both raw text nodes (textContent set directly) and
 * Text component wrappers (text in children).
 */
function collectTextContent(node: InkxNode): string {
	// If this node has direct text content, return it
	if (node.textContent !== undefined) {
		return node.textContent;
	}

	// Otherwise, collect from children
	let result = '';
	for (const child of node.children) {
		result += collectTextContent(child);
	}
	return result;
}

/**
 * Format text into lines based on wrap mode.
 */
function formatTextLines(text: string, width: number, wrap: TextProps['wrap']): string[] {
	const lines = text.split('\n');

	// No wrapping, just return lines
	if (wrap === false || wrap === 'truncate-end' || wrap === 'truncate') {
		return lines.map((line) => truncateText(line, width, 'end'));
	}

	if (wrap === 'truncate-start') {
		return lines.map((line) => truncateText(line, width, 'start'));
	}

	if (wrap === 'truncate-middle') {
		return lines.map((line) => truncateText(line, width, 'middle'));
	}

	// wrap === true or wrap === 'wrap' - word wrap
	const wrappedLines: string[] = [];
	for (const line of lines) {
		if (getTextWidth(line) <= width) {
			wrappedLines.push(line);
		} else {
			// Simple character wrap (TODO: proper word wrap)
			let remaining = line;
			while (remaining.length > 0) {
				const chunk = sliceByWidth(remaining, width);
				wrappedLines.push(chunk);
				remaining = remaining.slice(chunk.length);
			}
		}
	}
	return wrappedLines;
}

/**
 * Truncate text to fit within width.
 */
function truncateText(text: string, width: number, mode: 'start' | 'middle' | 'end'): string {
	const textWidth = getTextWidth(text);
	if (textWidth <= width) return text;

	const ellipsis = '\u2026'; // ...
	const availableWidth = width - 1; // Reserve space for ellipsis

	if (availableWidth <= 0) {
		return width > 0 ? ellipsis : '';
	}

	if (mode === 'end') {
		return sliceByWidth(text, availableWidth) + ellipsis;
	}

	if (mode === 'start') {
		return ellipsis + sliceByWidthFromEnd(text, availableWidth);
	}

	// middle
	const halfWidth = Math.floor(availableWidth / 2);
	const startPart = sliceByWidth(text, halfWidth);
	const endPart = sliceByWidthFromEnd(text, availableWidth - halfWidth);
	return startPart + ellipsis + endPart;
}

/**
 * Render a single line of text to the buffer.
 */
function renderTextLine(
	buffer: TerminalBuffer,
	x: number,
	y: number,
	text: string,
	baseStyle: Style,
): void {
	// Check if text contains ANSI escape sequences
	if (hasAnsi(text)) {
		renderAnsiTextLine(buffer, x, y, text, baseStyle);
		return;
	}

	// Regular text without ANSI codes
	let col = x;

	for (const char of text) {
		if (col >= buffer.width) break;

		const charWidth = getCharWidth(char);

		buffer.setCell(col, y, {
			char,
			fg: baseStyle.fg,
			bg: baseStyle.bg,
			attrs: baseStyle.attrs,
			wide: charWidth === 2,
			continuation: false,
		});

		if (charWidth === 2 && col + 1 < buffer.width) {
			// Wide character continuation cell
			buffer.setCell(col + 1, y, {
				char: '',
				fg: baseStyle.fg,
				bg: baseStyle.bg,
				attrs: baseStyle.attrs,
				wide: false,
				continuation: true,
			});
			col += 2;
		} else {
			col++;
		}
	}
}

/**
 * Render text line with ANSI escape sequences.
 * Parses ANSI codes and applies styles to individual segments.
 */
function renderAnsiTextLine(
	buffer: TerminalBuffer,
	x: number,
	y: number,
	text: string,
	baseStyle: Style,
): void {
	const segments = parseAnsiText(text);
	let col = x;

	for (const segment of segments) {
		// Merge segment style with base style
		const style = mergeAnsiStyle(baseStyle, segment);

		for (const char of segment.text) {
			if (col >= buffer.width) break;

			const charWidth = getCharWidth(char);

			buffer.setCell(col, y, {
				char,
				fg: style.fg,
				bg: style.bg,
				attrs: style.attrs,
				wide: charWidth === 2,
				continuation: false,
			});

			if (charWidth === 2 && col + 1 < buffer.width) {
				buffer.setCell(col + 1, y, {
					char: '',
					fg: style.fg,
					bg: style.bg,
					attrs: style.attrs,
					wide: false,
					continuation: true,
				});
				col += 2;
			} else {
				col++;
			}
		}
	}
}

/**
 * Merge ANSI segment style with base style.
 * ANSI styles override base styles where specified.
 */
function mergeAnsiStyle(base: Style, segment: StyledSegment): Style {
	let fg = base.fg;
	let bg = base.bg;

	// Convert ANSI SGR code to our color format
	if (segment.fg !== undefined && segment.fg !== null) {
		fg = ansiColorToColor(segment.fg, false);
	}
	if (segment.bg !== undefined && segment.bg !== null) {
		bg = ansiColorToColor(segment.bg, true);
	}

	// Merge attributes - start with base, then apply ANSI overrides
	const attrs = {
		...base.attrs,
		bold: segment.bold || base.attrs.bold,
		dim: segment.dim || base.attrs.dim,
		italic: segment.italic || base.attrs.italic,
		underline: segment.underline || base.attrs.underline,
		inverse: segment.inverse || base.attrs.inverse,
	};

	return { fg, bg, attrs };
}

/**
 * Convert ANSI SGR color code to our Color type.
 * Color is: number (256-color index) | { r, g, b } (true color) | null
 */
function ansiColorToColor(code: number, _isBg: boolean): Color {
	// True color (packed RGB with 0x1000000 marker from parseAnsiText)
	if (code >= 0x1000000) {
		const r = (code >> 16) & 0xff;
		const g = (code >> 8) & 0xff;
		const b = code & 0xff;
		return { r, g, b };
	}

	// 256 color palette index (0-255)
	if (code < 30 || (code >= 38 && code < 40) || (code >= 48 && code < 90)) {
		// Direct palette index - map common ones
		const paletteMap: Record<number, number> = {
			0: 0, // black
			1: 1, // red
			2: 2, // green
			3: 3, // yellow
			4: 4, // blue
			5: 5, // magenta
			6: 6, // cyan
			7: 7, // white
			8: 8, // gray
			9: 9, // redBright
			10: 10, // greenBright
			11: 11, // yellowBright
			12: 12, // blueBright
			13: 13, // magentaBright
			14: 14, // cyanBright
			15: 15, // whiteBright
		};
		return paletteMap[code] ?? code;
	}

	// Standard foreground colors (30-37) map to palette 0-7
	if (code >= 30 && code <= 37) {
		return code - 30;
	}

	// Standard background colors (40-47) map to palette 0-7
	if (code >= 40 && code <= 47) {
		return code - 40;
	}

	// Bright foreground colors (90-97) map to palette 8-15
	if (code >= 90 && code <= 97) {
		return code - 90 + 8;
	}

	// Bright background colors (100-107) map to palette 8-15
	if (code >= 100 && code <= 107) {
		return code - 100 + 8;
	}

	return null;
}

/**
 * Render a border around a box.
 */
function renderBorder(
	buffer: TerminalBuffer,
	x: number,
	y: number,
	width: number,
	height: number,
	props: BoxProps,
	clipBounds?: { top: number; bottom: number },
): void {
	const chars = getBorderChars(props.borderStyle ?? 'single');
	const color = props.borderColor ? parseColor(props.borderColor) : null;

	const showTop = props.borderTop !== false;
	const showBottom = props.borderBottom !== false;
	const showLeft = props.borderLeft !== false;
	const showRight = props.borderRight !== false;

	// Helper to check if a row is visible within clip bounds
	const isRowVisible = (row: number): boolean => {
		if (!clipBounds) return row >= 0 && row < buffer.height;
		return row >= clipBounds.top && row < clipBounds.bottom && row < buffer.height;
	};

	// Top border
	if (showTop && isRowVisible(y)) {
		if (showLeft) buffer.setCell(x, y, { char: chars.topLeft, fg: color });
		for (let col = x + 1; col < x + width - 1 && col < buffer.width; col++) {
			buffer.setCell(col, y, { char: chars.horizontal, fg: color });
		}
		if (showRight && x + width - 1 < buffer.width) {
			buffer.setCell(x + width - 1, y, { char: chars.topRight, fg: color });
		}
	}

	// Side borders
	for (let row = y + 1; row < y + height - 1; row++) {
		if (!isRowVisible(row)) continue;
		if (showLeft) buffer.setCell(x, row, { char: chars.vertical, fg: color });
		if (showRight && x + width - 1 < buffer.width) {
			buffer.setCell(x + width - 1, row, { char: chars.vertical, fg: color });
		}
	}

	// Bottom border
	const bottomY = y + height - 1;
	if (showBottom && isRowVisible(bottomY)) {
		if (showLeft) {
			buffer.setCell(x, bottomY, { char: chars.bottomLeft, fg: color });
		}
		for (let col = x + 1; col < x + width - 1 && col < buffer.width; col++) {
			buffer.setCell(col, bottomY, { char: chars.horizontal, fg: color });
		}
		if (showRight && x + width - 1 < buffer.width) {
			buffer.setCell(x + width - 1, bottomY, {
				char: chars.bottomRight,
				fg: color,
			});
		}
	}
}

// ============================================================================
// Phase 4: Output Phase
// ============================================================================

/**
 * Cell change for diffing.
 */
export interface CellChange {
	x: number;
	y: number;
	cell: Cell;
}

/**
 * Diff two buffers and produce minimal ANSI output.
 *
 * @param prev Previous buffer (null on first render)
 * @param next Current buffer
 * @returns ANSI escape sequence string
 */
export function outputPhase(prev: TerminalBuffer | null, next: TerminalBuffer): string {
	// First render: output entire buffer
	if (!prev) {
		return bufferToAnsi(next);
	}

	// Diff and emit only changes
	const changes = diffBuffers(prev, next);

	if (changes.length === 0) {
		return ''; // No changes
	}

	return changesToAnsi(changes);
}

/**
 * Convert entire buffer to ANSI string.
 */
function bufferToAnsi(buffer: TerminalBuffer): string {
	let output = '';
	let currentStyle: Style | null = null;

	// Move cursor to home position
	output += '\x1b[H';

	for (let y = 0; y < buffer.height; y++) {
		if (y > 0) output += '\n';

		for (let x = 0; x < buffer.width; x++) {
			const cell = buffer.getCell(x, y);

			// Skip continuation cells
			if (cell.continuation) continue;

			// Update style if changed
			const cellStyle: Style = { fg: cell.fg, bg: cell.bg, attrs: cell.attrs };
			if (!styleEquals(currentStyle, cellStyle)) {
				output += styleToAnsi(cellStyle);
				currentStyle = cellStyle;
			}

			output += cell.char;
		}
	}

	// Reset style at end
	output += '\x1b[0m';

	return output;
}

/**
 * Diff two buffers and return list of changes.
 */
function diffBuffers(prev: TerminalBuffer, next: TerminalBuffer): CellChange[] {
	const changes: CellChange[] = [];

	for (let y = 0; y < next.height; y++) {
		for (let x = 0; x < next.width; x++) {
			const nextCell = next.getCell(x, y);
			const prevCell = prev.getCell(x, y);

			if (!cellEquals(prevCell, nextCell)) {
				changes.push({ x, y, cell: nextCell });
			}
		}
	}

	return changes;
}

/**
 * Convert cell changes to optimized ANSI output.
 */
function changesToAnsi(changes: CellChange[]): string {
	// Sort by position for optimal cursor movement
	changes.sort((a, b) => a.y - b.y || a.x - b.x);

	let output = '';
	let cursorX = -1;
	let cursorY = -1;
	let currentStyle: Style | null = null;

	for (const { x, y, cell } of changes) {
		// Skip continuation cells
		if (cell.continuation) continue;

		// Move cursor if needed (cursor must be exactly at target position)
		if (y !== cursorY || x !== cursorX) {
			if (y === cursorY + 1 && x === 0) {
				// Next line at column 0, use newline (more efficient)
				output += '\r\n';
			} else {
				// Absolute position (1-indexed)
				output += `\x1b[${y + 1};${x + 1}H`;
			}
		}

		// Update style if changed
		const cellStyle: Style = { fg: cell.fg, bg: cell.bg, attrs: cell.attrs };
		if (!styleEquals(currentStyle, cellStyle)) {
			output += styleToAnsi(cellStyle);
			currentStyle = cellStyle;
		}

		// Write character
		output += cell.char;
		cursorX = x + (cell.wide ? 2 : 1);
		cursorY = y;
	}

	// Reset style at end
	if (currentStyle) {
		output += '\x1b[0m';
	}

	return output;
}

/**
 * Convert style to ANSI escape sequence.
 */
function styleToAnsi(style: Style): string {
	const codes: number[] = [0]; // Reset first

	// Foreground color
	if (style.fg !== null) {
		const fgCode = colorToAnsiFg(style.fg);
		if (fgCode) codes.push(...fgCode);
	}

	// Background color
	if (style.bg !== null) {
		const bgCode = colorToAnsiBg(style.bg);
		if (bgCode) codes.push(...bgCode);
	}

	// Attributes
	if (style.attrs.bold) codes.push(1);
	if (style.attrs.dim) codes.push(2);
	if (style.attrs.italic) codes.push(3);
	if (style.attrs.underline) codes.push(4);
	if (style.attrs.inverse) codes.push(7);
	if (style.attrs.strikethrough) codes.push(9);

	return `\x1b[${codes.join(';')}m`;
}

// ============================================================================
// Execute Render (Orchestration)
// ============================================================================

/**
 * Execute the full render pipeline.
 *
 * @param root The root InkxNode
 * @param width Terminal width
 * @param height Terminal height
 * @param prevBuffer Previous buffer for diffing (null on first render)
 * @returns Object with ANSI output and current buffer
 */
export function executeRender(
	root: InkxNode,
	width: number,
	height: number,
	prevBuffer: TerminalBuffer | null,
): { output: string; buffer: TerminalBuffer } {
	// Phase 1: Measure (for fit-content nodes)
	measurePhase(root);

	// Phase 2: Layout
	layoutPhase(root, width, height);

	// Phase 2.5: Scroll calculation (for overflow='scroll' containers)
	scrollPhase(root);

	// Phase 3: Content render
	const buffer = contentPhase(root);

	// Phase 4: Diff and output
	const output = outputPhase(prevBuffer, buffer);

	return { output, buffer };
}

// ============================================================================
// Helper Functions
// ============================================================================

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
 * Get text display width (accounting for wide characters and ANSI codes).
 * Uses ANSI-aware width calculation to handle styled text.
 */
function getTextWidth(text: string): number {
	return displayWidthAnsi(text);
}

/**
 * Get single character width.
 */
function getCharWidth(char: string): number {
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
		return 2;
	}

	return 1;
}

/**
 * Slice text by display width (from start).
 */
function sliceByWidth(text: string, maxWidth: number): string {
	let width = 0;
	let result = '';

	for (const char of text) {
		const charWidth = getCharWidth(char);
		if (width + charWidth > maxWidth) break;
		result += char;
		width += charWidth;
	}

	return result;
}

/**
 * Slice text by display width (from end).
 */
function sliceByWidthFromEnd(text: string, maxWidth: number): string {
	const chars = [...text];
	let width = 0;
	let startIdx = chars.length;

	for (let i = chars.length - 1; i >= 0; i--) {
		const charWidth = getCharWidth(chars[i]);
		if (width + charWidth > maxWidth) break;
		width += charWidth;
		startIdx = i;
	}

	return chars.slice(startIdx).join('');
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

/**
 * Get text style from props.
 */
function getTextStyle(props: TextProps): Style {
	return {
		fg: props.color ? parseColor(props.color) : null,
		bg: props.backgroundColor ? parseColor(props.backgroundColor) : null,
		attrs: {
			bold: props.bold,
			dim: props.dim || props.dimColor, // dimColor is Ink compatibility alias
			italic: props.italic,
			underline: props.underline,
			strikethrough: props.strikethrough,
			inverse: props.inverse,
		},
	};
}

/**
 * Parse color string to Color type.
 * Supports: named colors, hex (#rgb, #rrggbb), rgb(r,g,b)
 */
function parseColor(color: string): Color {
	// Named colors map to 256-color indices
	const namedColors: Record<string, number> = {
		black: 0,
		red: 1,
		green: 2,
		yellow: 3,
		blue: 4,
		magenta: 5,
		cyan: 6,
		white: 7,
		gray: 8,
		grey: 8,
		blackBright: 8,
		redBright: 9,
		greenBright: 10,
		yellowBright: 11,
		blueBright: 12,
		magentaBright: 13,
		cyanBright: 14,
		whiteBright: 15,
	};

	if (color in namedColors) {
		return namedColors[color];
	}

	// Hex color
	if (color.startsWith('#')) {
		const hex = color.slice(1);
		if (hex.length === 3) {
			const r = Number.parseInt(hex[0] + hex[0], 16);
			const g = Number.parseInt(hex[1] + hex[1], 16);
			const b = Number.parseInt(hex[2] + hex[2], 16);
			return { r, g, b };
		}
		if (hex.length === 6) {
			const r = Number.parseInt(hex.slice(0, 2), 16);
			const g = Number.parseInt(hex.slice(2, 4), 16);
			const b = Number.parseInt(hex.slice(4, 6), 16);
			return { r, g, b };
		}
	}

	// rgb(r,g,b)
	const rgbMatch = color.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
	if (rgbMatch) {
		return {
			r: Number.parseInt(rgbMatch[1], 10),
			g: Number.parseInt(rgbMatch[2], 10),
			b: Number.parseInt(rgbMatch[3], 10),
		};
	}

	return null;
}

/**
 * Convert color to ANSI foreground codes.
 */
function colorToAnsiFg(color: Color): number[] | null {
	if (color === null) return null;

	if (typeof color === 'number') {
		// 256-color
		return [38, 5, color];
	}

	// True color
	return [38, 2, color.r, color.g, color.b];
}

/**
 * Convert color to ANSI background codes.
 */
function colorToAnsiBg(color: Color): number[] | null {
	if (color === null) return null;

	if (typeof color === 'number') {
		// 256-color
		return [48, 5, color];
	}

	// True color
	return [48, 2, color.r, color.g, color.b];
}

/**
 * Border character sets.
 */
interface BorderChars {
	topLeft: string;
	topRight: string;
	bottomLeft: string;
	bottomRight: string;
	horizontal: string;
	vertical: string;
}

/**
 * Get border characters for a style.
 */
function getBorderChars(style: BoxProps['borderStyle']): BorderChars {
	const borders: Record<NonNullable<BoxProps['borderStyle']>, BorderChars> = {
		single: {
			topLeft: '\u250c',
			topRight: '\u2510',
			bottomLeft: '\u2514',
			bottomRight: '\u2518',
			horizontal: '\u2500',
			vertical: '\u2502',
		},
		double: {
			topLeft: '\u2554',
			topRight: '\u2557',
			bottomLeft: '\u255a',
			bottomRight: '\u255d',
			horizontal: '\u2550',
			vertical: '\u2551',
		},
		round: {
			topLeft: '\u256d',
			topRight: '\u256e',
			bottomLeft: '\u2570',
			bottomRight: '\u256f',
			horizontal: '\u2500',
			vertical: '\u2502',
		},
		bold: {
			topLeft: '\u250f',
			topRight: '\u2513',
			bottomLeft: '\u2517',
			bottomRight: '\u251b',
			horizontal: '\u2501',
			vertical: '\u2503',
		},
		singleDouble: {
			topLeft: '\u2553',
			topRight: '\u2556',
			bottomLeft: '\u2559',
			bottomRight: '\u255c',
			horizontal: '\u2500',
			vertical: '\u2551',
		},
		doubleSingle: {
			topLeft: '\u2552',
			topRight: '\u2555',
			bottomLeft: '\u2558',
			bottomRight: '\u255b',
			horizontal: '\u2550',
			vertical: '\u2502',
		},
		classic: {
			topLeft: '+',
			topRight: '+',
			bottomLeft: '+',
			bottomRight: '+',
			horizontal: '-',
			vertical: '|',
		},
	};

	return borders[style ?? 'single'];
}
