/**
 * Error types for silvery terminal rendering.
 *
 * Separated from scheduler.ts to allow React-free barrel imports.
 * Keep this file React-free — only plain types allowed.
 */

import type { RenderPhaseStats } from "./pipeline/types"

/** Structured mismatch data attached to the error (mirrors MismatchDebugContext shape) */
export interface MismatchErrorData {
  /** Render-phase instrumentation snapshot (nodes visited/rendered/skipped, per-flag breakdown) */
  renderPhaseStats?: RenderPhaseStats
  /** Debug context for the mismatched cell (from debug-mismatch.ts) */
  mismatchContext?: unknown
}

/**
 * Error thrown when SILVERY_STRICT detects a mismatch.
 * This error should NOT be caught by general error handlers - it indicates
 * a bug in incremental rendering that needs to be fixed.
 *
 * When SILVERY_STRICT fires, the error automatically includes:
 * - Render-phase instrumentation (nodes visited/rendered/skipped, per-flag breakdown)
 * - Cell attribution (which node owns the mismatched cell, dirty flags, scroll context)
 */
export class IncrementalRenderMismatchError extends Error {
  /** Render-phase instrumentation snapshot */
  renderPhaseStats?: RenderPhaseStats
  /** Debug context for the mismatched cell */
  mismatchContext?: unknown

  constructor(message: string, data?: MismatchErrorData) {
    super(message)
    this.name = "IncrementalRenderMismatchError"
    this.renderPhaseStats = data?.renderPhaseStats
    this.mismatchContext = data?.mismatchContext
  }
}
