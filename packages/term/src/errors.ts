/**
 * Error types for silvery terminal rendering.
 *
 * Separated from scheduler.ts to allow React-free barrel imports.
 */

/**
 * Error thrown when SILVERY_CHECK_INCREMENTAL detects a mismatch.
 * This error should NOT be caught by general error handlers - it indicates
 * a bug in incremental rendering that needs to be fixed.
 */
export class IncrementalRenderMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncrementalRenderMismatchError";
  }
}
