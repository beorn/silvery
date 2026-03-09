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
 * } from '@silvery/term/toolbelt';
 *
 * // All checks enabled by default when plugin is used
 * const driver = withDiagnostics(createBoardDriver(repo, rootId));
 *
 * // Or disable specific checks
 * const driver = withDiagnostics(createBoardDriver(repo, rootId), {
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
} from "@silvery/tea/with-diagnostics"

// =============================================================================
// Error Types
// =============================================================================

export { IncrementalRenderMismatchError } from "../scheduler"

// =============================================================================
// Buffer Comparison
// =============================================================================

export { compareBuffers, formatMismatch, type BufferMismatch } from "@silvery/test/compare-buffers"

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
} from "@silvery/test/debug-mismatch"
