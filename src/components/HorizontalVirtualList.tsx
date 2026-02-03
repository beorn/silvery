/**
 * HorizontalVirtualList Component
 *
 * React-level virtualization for horizontal lists. Only renders items within the
 * visible viewport plus overscan, using placeholder boxes for virtual width.
 *
 * Uses the shared useVirtualization hook for consistency with VirtualList.
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
import React, { forwardRef, useImperativeHandle } from 'react';
import { Box } from './Box.js';
import { Text } from './Text.js';
import { useVirtualization } from '../hooks/useVirtualization.js';

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

/**
 * Padding from edge before scrolling (in items).
 *
 * Horizontal lists use padding=1 since columns are wider and fewer fit on screen.
 * Vertical lists (VirtualList) use padding=2 for more context visibility.
 *
 * @see calcEdgeBasedScrollOffset in scroll-utils.ts for the algorithm
 */
const SCROLL_PADDING = 1;

// =============================================================================
// Component
// =============================================================================

/**
 * HorizontalVirtualList - React-level virtualized horizontal list.
 *
 * Only renders items within the visible viewport plus overscan.
 *
 * Scroll state management (via useVirtualization hook):
 * - When scrollTo is defined: actively track and scroll to that index
 * - When scrollTo is undefined: completely freeze scroll state (do nothing)
 *
 * This freeze behavior is critical for multi-column layouts where only one
 * column is "selected" at a time. Non-selected columns must not recalculate
 * their scroll position.
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
	// Use shared virtualization hook
	const { startIndex, endIndex, hiddenBefore, hiddenAfter, scrollToItem } = useVirtualization({
		items,
		viewportSize: width,
		itemSize: itemWidth,
		scrollTo,
		scrollPadding: SCROLL_PADDING,
		overscan,
		maxRendered,
		gap,
	});

	// Expose scrollToItem method via ref for imperative scrolling
	useImperativeHandle(ref, () => ({ scrollToItem }), [scrollToItem]);

	// Empty state
	if (items.length === 0) {
		return (
			<Box flexDirection="row" width={width} height={height}>
				{/* Empty - nothing to render */}
			</Box>
		);
	}

	// Get visible items
	const visibleItems = items.slice(startIndex, endIndex);

	// Determine if we need to show overflow indicators
	const showLeftIndicator = overflowIndicator && hiddenBefore > 0;
	const showRightIndicator = overflowIndicator && hiddenAfter > 0;

	return (
		<Box flexDirection="row" width={width} height={height} overflow="hidden">
			{/* Left overflow indicator */}
			{showLeftIndicator && (
				<Box flexShrink={0}>
					<Text dimColor>◀{hiddenBefore}</Text>
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
					<Text dimColor>{hiddenAfter}▶</Text>
				</Box>
			)}
		</Box>
	);
}

// Export with forwardRef - use type assertion for generic component
export const HorizontalVirtualList = forwardRef(HorizontalVirtualListInner) as <T>(
	props: HorizontalVirtualListProps<T> & { ref?: React.ForwardedRef<HorizontalVirtualListHandle> },
) => React.ReactElement;
