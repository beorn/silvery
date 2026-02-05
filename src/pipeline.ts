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
  type ExecuteRenderOptions,
  // Phase functions
  measurePhase,
  layoutPhase,
  rectEqual,
  scrollPhase,
  screenRectPhase,
  contentPhase,
  outputPhase,
  // Utilities
  clearBgConflictWarnings,
  setBgConflictMode,
  // Orchestration
  executeRender,
} from "./pipeline/index.js"
