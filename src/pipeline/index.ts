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

import createDebug from "debug";
import type { TerminalBuffer } from "../buffer.js";
import type { InkxNode } from "../types.js";

const debug = createDebug("inkx:pipeline");

// Re-export types
export type { CellChange, BorderChars } from "./types.js";

// Re-export phase functions
export { measurePhase } from "./measure-phase.js";
export {
  layoutPhase,
  layoutEqual,
  rectEqual,
  scrollPhase,
  screenRectPhase,
  notifyLayoutSubscribers,
} from "./layout-phase.js";
export { contentPhase, clearBgConflictWarnings } from "./content-phase.js";
export { outputPhase } from "./output-phase.js";

import { clearBgConflictWarnings, contentPhase } from "./content-phase.js";
import {
  layoutPhase,
  notifyLayoutSubscribers,
  screenRectPhase,
  scrollPhase,
} from "./layout-phase.js";
// Import for orchestration
import { measurePhase } from "./measure-phase.js";
import { outputPhase } from "./output-phase.js";

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
  const start = Date.now();

  // Clear per-render caches
  clearBgConflictWarnings();

  // Phase 1: Measure (for fit-content nodes)
  const t1 = Date.now();
  measurePhase(root);
  debug("measure: %dms", Date.now() - t1);

  // Phase 2: Layout
  const t2 = Date.now();
  layoutPhase(root, width, height);
  debug("layout: %dms", Date.now() - t2);

  // Phase 2.5: Scroll calculation (for overflow='scroll' containers)
  scrollPhase(root);

  // Phase 2.6: Screen rect calculation (screen-relative positions)
  screenRectPhase(root);

  // Phase 2.7: Notify layout subscribers
  // This runs AFTER screenRectPhase so useScreenRectCallback reads correct positions
  notifyLayoutSubscribers(root);

  // Phase 3: Content render
  const t3 = Date.now();
  const buffer = contentPhase(root);
  debug("content: %dms", Date.now() - t3);

  // Phase 4: Diff and output
  const t4 = Date.now();
  const output = outputPhase(prevBuffer, buffer);
  debug("output: %dms (%d bytes)", Date.now() - t4, output.length);

  debug("total pipeline: %dms", Date.now() - start);

  return { output, buffer };
}
