/**
 * Silvery Layout Benchmarks
 *
 * Measures layout computation in isolation — no React, no rendering.
 * Uses the layout engine abstraction directly (Flexily by default).
 *
 * Tests at terminal-relevant scales: 100 and 1000 nodes.
 * Includes both cold (create + layout) and warm (re-layout) scenarios.
 *
 * Run: bun vitest bench vendor/silvery/tests/perf/layout.bench.ts
 */

import { bench, describe, beforeEach } from "vitest"
import {
	ensureDefaultLayoutEngine,
	getLayoutEngine,
	getConstants,
	type LayoutNode,
} from "@silvery/term/layout-engine"

// Top-level await for layout engine initialization —
// beforeAll with async doesn't reliably complete before bench() in vitest bench mode.
await ensureDefaultLayoutEngine()
const engine = getLayoutEngine()
const C = getConstants()

// ============================================================================
// Tree Builders (pure layout nodes, no React)
// ============================================================================

function createFlatTree(count: number, width: number, height: number): LayoutNode {
	const root = engine.createNode()
	root.setWidth(width)
	root.setHeight(height)
	root.setFlexDirection(C.FLEX_DIRECTION_COLUMN)

	for (let i = 0; i < count; i++) {
		const child = engine.createNode()
		child.setHeight(1)
		child.setFlexGrow(1)
		root.insertChild(child, i)
	}
	return root
}

function createDeepTree(depth: number, width: number, height: number): LayoutNode {
	const root = engine.createNode()
	root.setWidth(width)
	root.setHeight(height)

	let current = root
	for (let i = 0; i < depth; i++) {
		const child = engine.createNode()
		child.setFlexGrow(1)
		child.setPadding(C.EDGE_LEFT, 1)
		current.insertChild(child, 0)
		current = child
	}
	return root
}

function createKanbanTree(
	columns: number,
	cardsPerColumn: number,
	width: number,
	height: number,
): LayoutNode {
	const root = engine.createNode()
	root.setWidth(width)
	root.setHeight(height)
	root.setFlexDirection(C.FLEX_DIRECTION_ROW)
	root.setGap(C.GUTTER_ALL, 1)

	for (let col = 0; col < columns; col++) {
		const column = engine.createNode()
		column.setFlexGrow(1)
		column.setFlexDirection(C.FLEX_DIRECTION_COLUMN)
		column.setGap(C.GUTTER_ALL, 1)

		// Header
		const header = engine.createNode()
		header.setHeight(1)
		column.insertChild(header, 0)

		// Cards
		for (let card = 0; card < cardsPerColumn; card++) {
			const cardNode = engine.createNode()
			cardNode.setHeight(3)
			cardNode.setPadding(C.EDGE_LEFT, 1)
			column.insertChild(cardNode, card + 1)
		}

		root.insertChild(column, col)
	}
	return root
}

function createDashboardTree(widgetCount: number, width: number, height: number): LayoutNode {
	const root = engine.createNode()
	root.setWidth(width)
	root.setHeight(height)
	root.setFlexDirection(C.FLEX_DIRECTION_COLUMN)

	// Header
	const header = engine.createNode()
	header.setHeight(1)
	root.insertChild(header, 0)

	// Main content area
	const main = engine.createNode()
	main.setFlexGrow(1)
	main.setFlexDirection(C.FLEX_DIRECTION_ROW)
	main.setGap(C.GUTTER_ALL, 1)

	// Sidebar
	const sidebar = engine.createNode()
	sidebar.setWidth(20)
	sidebar.setFlexDirection(C.FLEX_DIRECTION_COLUMN)
	for (let i = 0; i < 5; i++) {
		const navItem = engine.createNode()
		navItem.setHeight(1)
		sidebar.insertChild(navItem, i)
	}
	main.insertChild(sidebar, 0)

	// Content
	const content = engine.createNode()
	content.setFlexGrow(1)
	content.setFlexDirection(C.FLEX_DIRECTION_COLUMN)
	for (let i = 0; i < widgetCount; i++) {
		const widget = engine.createNode()
		widget.setFlexGrow(1)
		widget.setJustifyContent(C.JUSTIFY_SPACE_BETWEEN)
		widget.setAlignItems(C.ALIGN_CENTER)
		content.insertChild(widget, i)
	}
	main.insertChild(content, 1)
	root.insertChild(main, 1)

	// Footer
	const footer = engine.createNode()
	footer.setHeight(1)
	root.insertChild(footer, 2)

	return root
}

// ============================================================================
// Flat Hierarchy
// ============================================================================

describe("Layout: Flat Hierarchy", () => {
	// Pre-create trees for "layout only" benchmarks
	const flat100 = createFlatTree(100, 80, 24)
	const flat1000 = createFlatTree(1000, 120, 40)

	bench("100 nodes — layout only", () => {
		flat100.markDirty()
		flat100.calculateLayout(80, 24, C.DIRECTION_LTR)
	})

	bench("1000 nodes — layout only", () => {
		flat1000.markDirty()
		flat1000.calculateLayout(120, 40, C.DIRECTION_LTR)
	})

	bench("100 nodes — create + layout", () => {
		const tree = createFlatTree(100, 80, 24)
		tree.calculateLayout(80, 24, C.DIRECTION_LTR)
	})

	bench("1000 nodes — create + layout", () => {
		const tree = createFlatTree(1000, 120, 40)
		tree.calculateLayout(120, 40, C.DIRECTION_LTR)
	})
})

// ============================================================================
// Deep Hierarchy
// ============================================================================

describe("Layout: Deep Hierarchy", () => {
	const deep50 = createDeepTree(50, 80, 24)
	const deep100 = createDeepTree(100, 80, 24)
	const deep200 = createDeepTree(200, 80, 24)

	bench("50 levels deep", () => {
		deep50.markDirty()
		deep50.calculateLayout(80, 24, C.DIRECTION_LTR)
	})

	bench("100 levels deep", () => {
		deep100.markDirty()
		deep100.calculateLayout(80, 24, C.DIRECTION_LTR)
	})

	bench("200 levels deep", () => {
		deep200.markDirty()
		deep200.calculateLayout(80, 24, C.DIRECTION_LTR)
	})
})

// ============================================================================
// Terminal TUI Patterns
// ============================================================================

describe("Layout: TUI Patterns", () => {
	const kanban30 = createKanbanTree(3, 10, 120, 40)
	const kanban150 = createKanbanTree(3, 50, 120, 40)
	const kanban300 = createKanbanTree(3, 100, 120, 40)
	const dashboard = createDashboardTree(5, 120, 40)

	bench("Kanban 3x10 (33 nodes)", () => {
		kanban30.markDirty()
		kanban30.calculateLayout(120, 40, C.DIRECTION_LTR)
	})

	bench("Kanban 3x50 (156 nodes)", () => {
		kanban150.markDirty()
		kanban150.calculateLayout(120, 40, C.DIRECTION_LTR)
	})

	bench("Kanban 3x100 (306 nodes)", () => {
		kanban300.markDirty()
		kanban300.calculateLayout(120, 40, C.DIRECTION_LTR)
	})

	bench("Dashboard (16 nodes)", () => {
		dashboard.markDirty()
		dashboard.calculateLayout(120, 40, C.DIRECTION_LTR)
	})

	bench("Kanban 3x50 — create + layout", () => {
		const tree = createKanbanTree(3, 50, 120, 40)
		tree.calculateLayout(120, 40, C.DIRECTION_LTR)
	})
})

// ============================================================================
// Incremental Layout (dirty tracking)
// ============================================================================

describe("Layout: Incremental (dirty tracking)", () => {
	let kanban: LayoutNode

	beforeEach(() => {
		kanban = createKanbanTree(3, 50, 120, 40)
		kanban.calculateLayout(120, 40, C.DIRECTION_LTR)
	})

	bench("Re-layout clean tree (no-op)", () => {
		kanban.calculateLayout(120, 40, C.DIRECTION_LTR)
	})

	bench("Re-layout after resize (120x40 -> 100x30)", () => {
		kanban.calculateLayout(100, 30, C.DIRECTION_LTR)
		kanban.calculateLayout(120, 40, C.DIRECTION_LTR)
	})
})
