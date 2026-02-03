/**
 * HorizontalVirtualList Component
 *
 * React-level virtualization for horizontal lists. Only renders items within the
 * visible viewport plus overscan, using placeholder boxes for virtual width.
 *
 * @example
 * ```tsx
 * import { HorizontalVirtualList } from 'inkx';
 *
 * <HorizontalVirtualList
 *   items={columns}
 *   width={80}
 *   itemWidth={20}
 *   scrollTo={selectedIndex}
 *   renderItem={(column, index) => (
 *     <Column key={column.id} column={column} isSelected={index === selected} />
 *   )}
 * />
 * ```
 */
import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { Box } from './Box.js';
import { Text } from './Text.js';

// =============================================================================
// Types
// =============================================================================

export interface HorizontalVirtualListProps<T> {
	/** Array of items to render */
	items: T[];

	/** Width of the list viewport in columns */
	width: number;

	/** Width of each item (fixed number or function for variable widths) */
	itemWidth: number | ((item: T, index: number) => number);

	/** Index to keep visible (scrolls if off-screen) */
	scrollTo?: number;

	/** Extra items to render left/right of viewport for smooth scrolling (default: 1) */
	overscan?: number;

	/** Maximum items to render at once (default: 20) */
	maxRendered?: number;

	/** Render function for each item */
	renderItem: (item: T, index: number) => React.ReactNode;

	/** Show overflow indicators (◀N/▶N) */
	overflowIndicator?: boolean;

	/** Optional key extractor (defaults to index) */
	keyExtractor?: (item: T, index: number) => string | number;

	/** Height of the list (optional, uses parent height if not specified) */
	height?: number;

	/** Gap between items in columns (default: 0) */
	gap?: number;

	/** Render separator between items (alternative to gap) */
	renderSeparator?: () => React.ReactNode;
}

export interface HorizontalVirtualListHandle {
	/** Scroll to a specific item index */
	scrollToItem(index: number): void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_OVERSCAN = 1;
const DEFAULT_MAX_RENDERED = 20;

// Padding from edge before scrolling (in items)
const SCROLL_PADDING = 1;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get width for a specific item.
 */
function getItemWidth<T>(
	item: T,
	index: number,
	itemWidth: number | ((item: T, index: number) => number),
): number {
	return typeof itemWidth === 'function' ? itemWidth(item, index) : itemWidth;
}

/**
 * Calculate how many items fit in the viewport starting from a given index.
 */
function calcVisibleCount<T>(
	items: T[],
	startIndex: number,
	viewportWidth: number,
	itemWidth: number | ((item: T, index: number) => number),
	gap: number,
): number {
	let usedWidth = 0;
	let count = 0;

	for (let i = startIndex; i < items.length && usedWidth < viewportWidth; i++) {
		const width = getItemWidth(items[i], i, itemWidth);
		usedWidth += width + (count > 0 ? gap : 0);
		count++;
	}

	return Math.max(1, count);
}

/**
 * Calculate edge-based scroll offset for horizontal scrolling.
 * Only scrolls when cursor approaches the edge of the visible area.
 */
function calcHorizontalEdgeScroll(
	selectedIndex: number,
	currentOffset: number,
	visibleCount: number,
	totalCount: number,
): number {
	if (totalCount <= visibleCount) return 0;

	const visibleStart = currentOffset;
	const visibleEnd = currentOffset + visibleCount - 1;
	const paddedStart = visibleStart + SCROLL_PADDING;
	const paddedEnd = visibleEnd - SCROLL_PADDING;

	let newOffset = currentOffset;

	if (selectedIndex < paddedStart) {
		newOffset = Math.max(0, selectedIndex - SCROLL_PADDING);
	} else if (selectedIndex > paddedEnd) {
		newOffset = Math.min(totalCount - visibleCount, selectedIndex - visibleCount + SCROLL_PADDING + 1);
	}

	return Math.max(0, Math.min(newOffset, totalCount - visibleCount));
}

// =============================================================================
// Component
// =============================================================================

/**
 * HorizontalVirtualList - React-level virtualized horizontal list.
 *
 * Only renders items within the visible viewport plus overscan.
 * Uses placeholder boxes for virtual width to maintain scroll position.
 */
function HorizontalVirtualListInner<T>(
	{
		items,
		width,
		itemWidth,
		scrollTo,
		overscan = DEFAULT_OVERSCAN,
		maxRendered = DEFAULT_MAX_RENDERED,
		renderItem,
		overflowIndicator,
		keyExtractor,
		height,
		gap = 0,
		renderSeparator,
	}: HorizontalVirtualListProps<T>,
	ref: React.ForwardedRef<HorizontalVirtualListHandle>,
): React.ReactElement {
	// Track scroll offset (item index) for edge-based scrolling
	const scrollOffsetRef = useRef(0);

	// Expose scrollToItem method via ref
	useImperativeHandle(ref, () => ({
		scrollToItem(index: number) {
			scrollOffsetRef.current = Math.max(0, Math.min(index, items.length - 1));
		},
	}));

	// Empty state - handle early
	if (items.length === 0) {
		return (
			<Box flexDirection="row" width={width} height={height}>
				{/* Empty - nothing to render */}
			</Box>
		);
	}

	// Calculate the target index for scroll
	const targetIndex = scrollTo ?? scrollOffsetRef.current;
	const clampedIndex = Math.min(Math.max(0, targetIndex), items.length - 1);

	// Estimate how many items fit in viewport (for edge-based scroll calculation)
	const avgItemWidth =
		typeof itemWidth === 'function'
			? items.reduce((sum, item, i) => sum + getItemWidth(item, i, itemWidth), 0) / items.length
			: itemWidth;
	const estimatedVisibleCount = Math.max(1, Math.floor(width / (avgItemWidth + gap)));

	// Calculate scroll offset using edge-based scrolling
	let scrollOffset = scrollOffsetRef.current;
	if (scrollTo !== undefined) {
		scrollOffset = calcHorizontalEdgeScroll(
			clampedIndex,
			scrollOffsetRef.current,
			estimatedVisibleCount,
			items.length,
		);
		scrollOffsetRef.current = scrollOffset;
	}

	// Calculate virtualization window (inline, not memoized, since scrollOffset changes)
	const totalItems = items.length;
	let startIndex: number;
	let endIndex: number;

	// For small lists, render everything
	if (totalItems <= maxRendered) {
		startIndex = 0;
		endIndex = totalItems;
	} else {
		// Start from scroll offset, add overscan
		startIndex = Math.max(0, scrollOffset - overscan);

		// Calculate how many items we can render
		const visibleFromStart = calcVisibleCount(items, startIndex, width, itemWidth, gap);
		endIndex = Math.min(totalItems, startIndex + visibleFromStart + overscan * 2);

		// Cap at maxRendered - center around target
		if (endIndex - startIndex > maxRendered) {
			const halfWindow = Math.floor(maxRendered / 2);
			startIndex = Math.max(0, clampedIndex - halfWindow);
			endIndex = Math.min(totalItems, startIndex + maxRendered);

			// Adjust if we hit the end
			if (endIndex === totalItems) {
				startIndex = Math.max(0, endIndex - maxRendered);
			}
		}
	}

	// Count hidden items
	const hiddenLeft = startIndex;
	const hiddenRight = items.length - endIndex;

	// Get visible items
	const visibleItems = items.slice(startIndex, endIndex);

	// Determine if we need to show overflow indicators
	const showLeftIndicator = overflowIndicator && hiddenLeft > 0;
	const showRightIndicator = overflowIndicator && hiddenRight > 0;

	return (
		<Box flexDirection="row" width={width} height={height} overflow="hidden">
			{/* Left overflow indicator */}
			{showLeftIndicator && (
				<Box flexShrink={0}>
					<Text dimColor>◀{hiddenLeft}</Text>
				</Box>
			)}

			{/* Render visible items */}
			{visibleItems.map((item, i) => {
				const actualIndex = startIndex + i;
				const key = keyExtractor ? keyExtractor(item, actualIndex) : actualIndex;
				const isLast = i === visibleItems.length - 1;

				return (
					<React.Fragment key={key}>
						{renderItem(item, actualIndex)}
						{!isLast && renderSeparator && renderSeparator()}
						{!isLast && gap > 0 && !renderSeparator && <Box width={gap} flexShrink={0} />}
					</React.Fragment>
				);
			})}

			{/* Right overflow indicator */}
			{showRightIndicator && (
				<Box flexShrink={0}>
					<Text dimColor>{hiddenRight}▶</Text>
				</Box>
			)}
		</Box>
	);
}

// Export with forwardRef - use type assertion for generic component
export const HorizontalVirtualList = forwardRef(HorizontalVirtualListInner) as <T>(
	props: HorizontalVirtualListProps<T> & { ref?: React.ForwardedRef<HorizontalVirtualListHandle> },
) => React.ReactElement;
