/**
 * silvery/toolbelt - Diagnostic and helper tools for debugging TUI rendering
 *
 * Central import for all diagnostic utilities. Use this when you need to:
 * - Debug incremental rendering issues
 * - Verify ANSI replay correctness
 * - Check buffer content stability
 *
 * @example
 * ```typescript
 * import {
 *   withDiagnostics,
 *   VirtualTerminal,
 *   IncrementalRenderMismatchError,
 *   compareBuffers,
 *   formatMismatch,
 * } from '@silvery/ag-term/toolbelt';
 *
 * // All checks enabled by default when plugin is used
 * using baseDriver = createBoardDriver(repo, rootId);
 * const driver = withDiagnostics(baseDriver);
 *
 * // Or disable specific checks
 * using baseDriver = createBoardDriver(repo, rootId);
 * const driver = withDiagnostics(baseDriver, {
 *   checkReplay: false  // skip ANSI replay check
 * });
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Diagnostic Plugin
// =============================================================================

export {
  withDiagnostics,
  checkLayoutInvariants,
  VirtualTerminal,
  type DiagnosticOptions,
} from "../plugins/with-diagnostics"

// =============================================================================
// Error Types
// =============================================================================

export { IncrementalRenderMismatchError } from "../scheduler"

// =============================================================================
// Buffer Comparison
// =============================================================================

export { compareBuffers, formatMismatch, type BufferMismatch } from "../compare-buffers"

// =============================================================================
// Pipeline Internals (for manual ANSI replay verification)
// =============================================================================

export { outputPhase } from "../pipeline"

// =============================================================================
// Mismatch Debug Utilities
// =============================================================================

export {
  findNodeAtPosition,
  findAllContainingNodes,
  getNodeDebugInfo,
  buildMismatchContext,
  formatMismatchContext,
  type NodeDebugInfo,
  type MismatchDebugContext,
} from "../debug-mismatch"
