/**
 * Silvery Render Pipeline
 *
 * Re-exports from the pipeline/ directory for backwards compatibility.
 * See pipeline/index.ts for the main implementation.
 */

export {
  // Types
  type CellChange,
  type BorderChars,
  type ExecuteRenderOptions,
  type PipelineConfig,
  // Phase functions
  measurePhase,
  layoutPhase,
  rectEqual,
  scrollPhase,
  screenRectPhase,
  renderPhase,
  outputPhase,
  // Utilities
  clearBgConflictWarnings,
  setBgConflictMode,
  // Orchestration
  executeRender,
  executeRenderAdapter,
  type PipelineContext,
} from "./pipeline/index"
