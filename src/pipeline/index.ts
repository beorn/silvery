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

import type { TerminalBuffer } from '../buffer.js';
import type { InkxNode } from '../types.js';

// Re-export types
export type { CellChange, BorderChars } from './types.js';

// Re-export phase functions
export { measurePhase } from './measure-phase.js';
export { layoutPhase, layoutEqual, scrollPhase } from './layout-phase.js';
export { contentPhase, clearBgConflictWarnings } from './content-phase.js';
export { outputPhase } from './output-phase.js';

import { clearBgConflictWarnings, contentPhase } from './content-phase.js';
import { layoutPhase, scrollPhase } from './layout-phase.js';
// Import for orchestration
import { measurePhase } from './measure-phase.js';
import { outputPhase } from './output-phase.js';

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
	// Clear per-render caches
	clearBgConflictWarnings();

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
