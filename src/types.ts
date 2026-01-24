/**
 * Inkx Types
 *
 * Core types for the Inkx renderer architecture.
 */

import type { LayoutNode } from './layout-engine.js';

// ============================================================================
// Layout Types
// ============================================================================

/**
 * A rectangle with position and size.
 * All values are in terminal columns/rows (integers).
 */
export interface Rect {
	/** X position (0-indexed terminal column) */
	x: number;
	/** Y position (0-indexed terminal row) */
	y: number;
	/** Width in terminal columns */
	width: number;
	/** Height in terminal rows */
	height: number;
}

/**
 * @deprecated Use Rect instead. Alias kept for backwards compatibility.
 */
export type ComputedLayout = Rect;

/**
 * Check if two rects are equal (same position and size).
 */
export function rectEqual(a: Rect | null, b: Rect | null): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// ============================================================================
// Node Types
// ============================================================================

/**
 * Inkx node types - the primitive elements in the render tree.
 */
export type InkxNodeType = 'inkx-root' | 'inkx-box' | 'inkx-text';

/**
 * Flexbox properties that can be applied to Box nodes.
 */
export interface FlexboxProps {
	// Size
	width?: number | string;
	height?: number | string;
	minWidth?: number | string;
	minHeight?: number | string;
	maxWidth?: number | string;
	maxHeight?: number | string;

	// Flex
	flexGrow?: number;
	flexShrink?: number;
	flexBasis?: number | string;
	flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
	flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';

	// Alignment
	alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
	alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
	alignContent?:
		| 'flex-start'
		| 'flex-end'
		| 'center'
		| 'stretch'
		| 'space-between'
		| 'space-around';
	justifyContent?:
		| 'flex-start'
		| 'flex-end'
		| 'center'
		| 'space-between'
		| 'space-around'
		| 'space-evenly';

	// Spacing
	padding?: number;
	paddingTop?: number;
	paddingBottom?: number;
	paddingLeft?: number;
	paddingRight?: number;
	paddingX?: number;
	paddingY?: number;
	margin?: number;
	marginTop?: number;
	marginBottom?: number;
	marginLeft?: number;
	marginRight?: number;
	marginX?: number;
	marginY?: number;
	gap?: number;

	// Position
	position?: 'relative' | 'absolute' | 'sticky';

	// Sticky offsets (only used when position='sticky')
	// The element will "stick" when it reaches this offset from the container edge
	stickyTop?: number;
	stickyBottom?: number;

	// Display
	display?: 'flex' | 'none';

	// Overflow
	overflow?: 'visible' | 'hidden' | 'scroll';

	// Scroll control (only used when overflow='scroll')
	scrollTo?: number;
}

/**
 * Props for testing and identification.
 * These props are stored in the node for DOM query access.
 */
export interface TestProps {
	/** Test ID for querying nodes (like Playwright's data-testid) */
	testID?: string;
	/** Allow arbitrary data-* attributes for testing */
	[key: `data-${string}`]: unknown;
}

/**
 * Style properties for text rendering.
 */
export interface StyleProps {
	color?: string;
	backgroundColor?: string;
	bold?: boolean;
	dim?: boolean;
	/** Alias for dim (Ink compatibility) */
	dimColor?: boolean;
	italic?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
	inverse?: boolean;
}

/**
 * Props for Box component.
 */
export interface BoxProps extends FlexboxProps, StyleProps, TestProps {
	borderStyle?:
		| 'single'
		| 'double'
		| 'round'
		| 'bold'
		| 'singleDouble'
		| 'doubleSingle'
		| 'classic';
	borderColor?: string;
	borderTop?: boolean;
	borderBottom?: boolean;
	borderLeft?: boolean;
	borderRight?: boolean;
	onLayout?: (layout: Rect) => void;
}

/**
 * Props for Text component.
 */
export interface TextProps extends StyleProps, TestProps {
	children?: React.ReactNode;
	wrap?: 'wrap' | 'truncate' | 'truncate-start' | 'truncate-middle' | 'truncate-end' | boolean;
}

/**
 * The core Inkx node - represents an element in the render tree.
 *
 * Each node has:
 * - A Yoga node for layout calculation
 * - Computed layout after Yoga runs
 * - Subscribers that get notified when layout changes
 * - Dirty flags for incremental updates
 */
export interface InkxNode {
	/** Node type */
	type: InkxNodeType;

	/** Props passed to this node */
	props: BoxProps | TextProps | Record<string, unknown>;

	/** Child nodes */
	children: InkxNode[];

	/** Parent node (null for root) */
	parent: InkxNode | null;

	/** The layout node for layout calculation (null for raw text nodes) */
	layoutNode: LayoutNode | null;

	/** Computed layout from previous render (for change detection) */
	prevLayout: Rect | null;

	/**
	 * Content-relative position (like CSS offsetTop/offsetLeft).
	 * Position within the scrollable content, ignoring scroll offsets.
	 * Set after layout phase.
	 */
	contentRect: Rect | null;

	/**
	 * Screen-relative position (like CSS getBoundingClientRect).
	 * Actual position on the terminal screen, accounting for scroll offsets.
	 * Set after screen rect phase.
	 */
	screenRect: Rect | null;

	/**
	 * @deprecated Use contentRect instead. Alias kept for backwards compatibility.
	 */
	computedLayout: Rect | null;

	/** True if layout-affecting props changed and Yoga needs recalculation */
	layoutDirty: boolean;

	/** True if content changed but layout didn't */
	contentDirty: boolean;

	/** Callbacks subscribed to layout changes (used by useLayout) */
	layoutSubscribers: Set<() => void>;

	/** Text content for text nodes */
	textContent?: string;

	/** True if this is a raw text node (created by createTextInstance) */
	isRawText?: boolean;

	/** Scroll state for overflow='scroll' containers */
	scrollState?: {
		/** Current scroll offset (in terminal rows) */
		offset: number;
		/** Total content height (all children) */
		contentHeight: number;
		/** Visible height (container height minus borders/padding) */
		viewportHeight: number;
		/** Index of first visible child */
		firstVisibleChild: number;
		/** Index of last visible child */
		lastVisibleChild: number;
		/** Count of items hidden above viewport */
		hiddenAbove: number;
		/** Count of items hidden below viewport */
		hiddenBelow: number;
		/** Sticky children with their computed render positions */
		stickyChildren?: Array<{
			/** Index of the sticky child */
			index: number;
			/** Computed Y offset to render at (relative to viewport, not content) */
			renderOffset: number;
			/** Original natural Y position (before sticky adjustment) */
			naturalTop: number;
			/** Height of the sticky element */
			height: number;
		}>;
	};
}

// ============================================================================
// Terminal Buffer Types
// ============================================================================

/**
 * Text attributes that can be applied to a cell.
 */
export interface CellAttrs {
	bold?: boolean;
	dim?: boolean;
	italic?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
	inverse?: boolean;
}

/**
 * A single cell in the terminal buffer.
 */
export interface Cell {
	/** The character (grapheme cluster) in this cell */
	char: string;
	/** Foreground color (ANSI code or RGB) */
	fg: string | null;
	/** Background color (ANSI code or RGB) */
	bg: string | null;
	/** Text attributes */
	attrs: CellAttrs;
	/** True if this is a wide character (CJK) that takes 2 cells */
	wide: boolean;
	/** True if this cell is the continuation of a wide character */
	continuation: boolean;
}

/**
 * Interface for the terminal buffer.
 */
export interface TerminalBuffer {
	readonly width: number;
	readonly height: number;
	getCell(x: number, y: number): Cell;
	setCell(x: number, y: number, cell: Cell): void;
	clear(): void;
}

// ============================================================================
// Render Context Types
// ============================================================================

/**
 * Options passed to the render function.
 */
export interface RenderOptions {
	stdout?: NodeJS.WriteStream;
	stdin?: NodeJS.ReadStream;
	exitOnCtrlC?: boolean;
	debug?: boolean;
}

/**
 * The render instance returned by render().
 */
export interface RenderInstance {
	/** Re-render with new element */
	rerender: (element: React.ReactNode) => void;
	/** Unmount and clean up */
	unmount: () => void;
	/** Wait for render to complete */
	waitUntilExit: () => Promise<void>;
	/** Clear terminal output */
	clear: () => void;
}
