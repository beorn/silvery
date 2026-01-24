/**
 * Inkx Render Pipeline
 *
 * Re-exports from the pipeline/ directory for backwards compatibility.
 * See pipeline/index.ts for the main implementation.
 */

export {
  // Types
  type CellChange,
  type BorderChars,
  // Phase functions
  measurePhase,
  layoutPhase,
  layoutEqual,
  rectEqual,
  scrollPhase,
  screenRectPhase,
  contentPhase,
  outputPhase,
  // Utilities
  clearBgConflictWarnings,
  // Orchestration
  executeRender,
} from "./pipeline/index.js";
