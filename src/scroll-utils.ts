/**
 * Scroll Utilities
 *
 * Shared functions for edge-based scrolling behavior across VirtualList,
 * HorizontalVirtualList, and other scroll-aware components.
 */

/**
 * Calculate edge-based scroll offset.
 *
 * Only scrolls when cursor approaches the edge of the visible area.
 * This provides smoother scrolling by starting to scroll before hitting
 * the absolute edge, maintaining context around the selected item.
 *
 * ## Algorithm
 *
 * The viewport is divided into zones:
 * ```
 * |<padding>|<------ safe zone ------>|<padding>|
 * |  scroll |    no scroll needed     | scroll  |
 * |  if <   |                         | if >    |
 * ```
 *
 * When the selected item enters a padding zone, the viewport scrolls
 * to keep the item visible with margin.
 *
 * ## Asymmetry Note
 *
 * The +1 in the "scroll down/right" case is intentional:
 * - Offset points to the TOP/LEFT of the viewport
 * - We want the selected item to be `padding` items from the BOTTOM/RIGHT
 * - Formula: `selectedIndex - visibleCount + padding + 1`
 *
 * Example: visibleCount=10, padding=2, selectedIndex=15
 *   offset = 15 - 10 + 2 + 1 = 8
 *   viewport shows items 8-17, selected item 15 is at position 7 (2 from bottom)
 *
 * @param selectedIndex - Currently selected item index
 * @param currentOffset - Current scroll offset (topmost/leftmost visible item)
 * @param visibleCount - Number of items visible in viewport
 * @param totalCount - Total number of items
 * @param padding - Items to keep visible before/after cursor (default: 1)
 * @returns New scroll offset
 */
export function calcEdgeBasedScrollOffset(
	selectedIndex: number,
	currentOffset: number,
	visibleCount: number,
	totalCount: number,
	padding = 1,
): number {
	// If everything fits, no scrolling needed
	if (totalCount <= visibleCount) return 0;

	// Calculate visible range
	const visibleStart = currentOffset;
	const visibleEnd = currentOffset + visibleCount - 1;

	// Define the "safe zone" where cursor doesn't trigger scroll
	const paddedStart = visibleStart + padding;
	const paddedEnd = visibleEnd - padding;

	let newOffset = currentOffset;

	if (selectedIndex < paddedStart) {
		// Scrolling UP/LEFT: place item `padding` rows from top
		newOffset = Math.max(0, selectedIndex - padding);
	} else if (selectedIndex > paddedEnd) {
		// Scrolling DOWN/RIGHT: place item `padding` rows from bottom
		// The +1 converts from 0-indexed offset to correct position
		newOffset = Math.min(totalCount - visibleCount, selectedIndex - visibleCount + padding + 1);
	}

	// Clamp to valid range
	return Math.max(0, Math.min(newOffset, totalCount - visibleCount));
}
