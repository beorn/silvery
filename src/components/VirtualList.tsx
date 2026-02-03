/**
 * VirtualList Component
 *
 * React-level virtualization for long lists. Only renders items within the
 * visible viewport plus overscan, using placeholder boxes for virtual height.
 *
 * Uses inkx overflow="scroll" internally for native scrolling support.
 *
 * @example
 * ```tsx
 * import { VirtualList } from 'inkx';
 *
 * <VirtualList
 *   items={cards}
 *   height={20}
 *   itemHeight={1}
 *   scrollTo={selectedIndex}
 *   renderItem={(card, index) => (
 *     <TreeCard key={card.id} card={card} isSelected={index === selected} />
 *   )}
 * />
 * ```
 */
import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Box } from './Box.js';
import createDebug from 'debug';

const debug = createDebug('inkx:virtuallist');

// =============================================================================
// Types
// =============================================================================

export interface VirtualListProps<T> {
	/** Array of items to render */
	items: T[];

	/** Height of the list viewport in rows */
	height: number;

	/** Height of each item in rows (default: 1) */
	itemHeight?: number;

	/** Index to keep visible (scrolls if off-screen) */
	scrollTo?: number;

	/** Extra items to render above/below viewport for smooth scrolling (default: 5) */
	overscan?: number;

	/** Maximum items to render at once (default: 100) */
	maxRendered?: number;

	/** Render function for each item */
	renderItem: (item: T, index: number) => React.ReactNode;

	/** Show overflow indicators (▲N/▼N) */
	overflowIndicator?: boolean;

	/** Optional key extractor (defaults to index) */
	keyExtractor?: (item: T, index: number) => string | number;

	/** Width of the list (optional, uses parent width if not specified) */
	width?: number;
}

export interface VirtualListHandle {
	/** Scroll to a specific item index */
	scrollToItem(index: number): void;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_ITEM_HEIGHT = 1;
const DEFAULT_OVERSCAN = 5;
const DEFAULT_MAX_RENDERED = 100;

// Padding from edge before scrolling (in items)
const SCROLL_PADDING = 2;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Calculate edge-based scroll offset.
 * Only scrolls when cursor approaches the edge of the visible area.
 */
function calcEdgeBasedScrollOffset(
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
 * VirtualList - React-level virtualized list with native inkx scrolling.
 *
 * Only renders items within the visible viewport plus overscan.
 * Uses placeholder boxes for virtual height to maintain scrollbar position.
 *
 * Scroll state management:
 * - When scrollTo is defined: actively track and scroll to that index
 * - When scrollTo is undefined: completely freeze scroll state (do nothing)
 *
 * This freeze behavior is critical for multi-column layouts where only one
 * column is "selected" at a time. Non-selected columns must not recalculate
 * their scroll position.
 */
function VirtualListInner<T>(
	{
		items,
		height,
		itemHeight = DEFAULT_ITEM_HEIGHT,
		scrollTo,
		overscan = DEFAULT_OVERSCAN,
		maxRendered = DEFAULT_MAX_RENDERED,
		renderItem,
		overflowIndicator,
		keyExtractor,
		width,
	}: VirtualListProps<T>,
	ref: React.ForwardedRef<VirtualListHandle>,
): React.ReactElement {
	// Scroll state: the selected index and computed scroll offset
	// Using state (not refs) to ensure React re-renders when we scroll imperatively
	const [scrollState, setScrollState] = useState<{ selectedIndex: number; scrollOffset: number }>({
		selectedIndex: scrollTo ?? 0,
		scrollOffset: 0,
	});

	// Calculate how many items fit in the viewport
	const visibleItemCount = Math.max(1, Math.floor(height / itemHeight));

	// Expose scrollToItem method via ref for imperative scrolling
	useImperativeHandle(
		ref,
		() => ({
			scrollToItem(index: number) {
				const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
				setScrollState((prev) => {
					const newOffset = calcEdgeBasedScrollOffset(clampedIndex, prev.scrollOffset, visibleItemCount, items.length);
					return { selectedIndex: clampedIndex, scrollOffset: newOffset };
				});
			},
		}),
		[items.length, visibleItemCount],
	);

	// Update scroll state when scrollTo prop changes (only when defined)
	// This is the key fix: we only update state when scrollTo is defined
	// When scrollTo becomes undefined, we do NOTHING - state is frozen
	useEffect(() => {
		if (scrollTo === undefined) {
			// Frozen: do not update state at all
			return;
		}

		const clampedIndex = Math.max(0, Math.min(scrollTo, items.length - 1));
		setScrollState((prev) => {
			const newOffset = calcEdgeBasedScrollOffset(clampedIndex, prev.scrollOffset, visibleItemCount, items.length);

			// Only update if something actually changed
			if (prev.selectedIndex === clampedIndex && prev.scrollOffset === newOffset) {
				return prev;
			}

			debug('scrollTo changed: %d -> offset=%d (was %d)', scrollTo, newOffset, prev.scrollOffset);
			return { selectedIndex: clampedIndex, scrollOffset: newOffset };
		});
	}, [scrollTo, items.length, visibleItemCount]);

	// Determine the current selected index to use for rendering
	// When scrollTo is defined, use it directly (for immediate visual feedback)
	// When undefined, use the frozen state
	const currentSelectedIndex =
		scrollTo !== undefined ? Math.max(0, Math.min(scrollTo, items.length - 1)) : scrollState.selectedIndex;

	// Calculate virtualization window
	const { startIndex, endIndex, topPlaceholderHeight, bottomPlaceholderHeight } = useMemo(() => {
		const totalItems = items.length;

		// For small lists, render everything
		if (totalItems <= maxRendered) {
			return {
				startIndex: 0,
				endIndex: totalItems,
				topPlaceholderHeight: 0,
				bottomPlaceholderHeight: 0,
			};
		}

		// Center the window around the selected item
		const halfWindow = Math.floor(maxRendered / 2);
		let start = Math.max(0, currentSelectedIndex - halfWindow);
		let end = Math.min(totalItems, start + maxRendered);

		// Adjust start if we hit the end
		if (end === totalItems) {
			start = Math.max(0, end - maxRendered);
		}

		// Add overscan
		start = Math.max(0, start - overscan);
		end = Math.min(totalItems, end + overscan);

		// Calculate placeholder heights
		const topHeight = start * itemHeight;
		const bottomHeight = (totalItems - end) * itemHeight;

		return {
			startIndex: start,
			endIndex: end,
			topPlaceholderHeight: topHeight,
			bottomPlaceholderHeight: bottomHeight,
		};
	}, [items.length, currentSelectedIndex, maxRendered, overscan, itemHeight]);

	// Empty state
	if (items.length === 0) {
		return (
			<Box flexDirection="column" height={height} width={width}>
				{/* Empty - nothing to render */}
			</Box>
		);
	}

	// Get the slice of items to render
	const visibleItems = items.slice(startIndex, endIndex);

	// Calculate scrollTo index for inkx Box
	// inkx scrollTo expects the INDEX of the child to scroll into view
	// Account for top placeholder being child 0 when present
	const hasTopPlaceholder = topPlaceholderHeight > 0;
	const selectedIndexInSlice = currentSelectedIndex - startIndex;
	// Ensure the index is valid (within the rendered slice)
	const isSelectedInSlice = selectedIndexInSlice >= 0 && selectedIndexInSlice < visibleItems.length;
	const scrollToIndex = hasTopPlaceholder ? selectedIndexInSlice + 1 : selectedIndexInSlice;

	// Only pass scrollTo to inkx Box when:
	// 1. scrollTo prop is defined (we're actively scrolling)
	// 2. The selected index is within the rendered slice
	const boxScrollTo = scrollTo !== undefined && isSelectedInSlice ? Math.max(0, scrollToIndex) : undefined;

	return (
		<Box
			flexDirection="column"
			height={height}
			width={width}
			overflow="scroll"
			scrollTo={boxScrollTo}
			overflowIndicator={overflowIndicator}
		>
			{/* Top placeholder for virtual height */}
			{topPlaceholderHeight > 0 && <Box height={topPlaceholderHeight} flexShrink={0} />}

			{/* Render visible items */}
			{visibleItems.map((item, i) => {
				const actualIndex = startIndex + i;
				const key = keyExtractor ? keyExtractor(item, actualIndex) : actualIndex;
				return <React.Fragment key={key}>{renderItem(item, actualIndex)}</React.Fragment>;
			})}

			{/* Bottom placeholder for virtual height */}
			{bottomPlaceholderHeight > 0 && <Box height={bottomPlaceholderHeight} flexShrink={0} />}
		</Box>
	);
}

// Export with forwardRef - use type assertion for generic component
export const VirtualList = forwardRef(VirtualListInner) as <T>(
	props: VirtualListProps<T> & { ref?: React.ForwardedRef<VirtualListHandle> },
) => React.ReactElement;
