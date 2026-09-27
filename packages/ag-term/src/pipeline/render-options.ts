import type { CursorState } from "@silvery/ag-react/hooks/useCursor"

/**
 * Options for render pipeline callers.
 */
export interface ExecuteRenderOptions {
  /**
   * Render mode: fullscreen or inline.
   * Default: 'fullscreen'
   */
  mode?: "fullscreen" | "inline"

  /**
   * Skip notifying layout subscribers.
   * Use for static/one-shot renders where layout feedback isn't needed.
   * Default: false
   */
  skipLayoutNotifications?: boolean

  /**
   * Skip scroll state updates.
   * Use for fresh render comparisons (SILVERY_STRICT) to avoid mutating state.
   * Default: false
   */
  skipScrollStateUpdates?: boolean

  /**
   * Number of lines written to stdout between renders (inline mode only).
   * Used to adjust cursor positioning when external code (e.g., useScrollback)
   * writes directly to stdout between renders.
   * Default: 0
   */
  scrollbackOffset?: number

  /**
   * Terminal height in rows (inline mode only).
   * Used to clamp cursor-up offset when content exceeds terminal height.
   * Without this, content taller than the terminal causes rendering corruption
   * because cursor-up can't reach lines that scrolled off screen.
   */
  termRows?: number

  /**
   * Cursor position from useCursor() (inline mode only).
   * When provided, the output phase positions the real terminal cursor
   * at this location instead of leaving it at the end of content.
   */
  cursorPos?: CursorState | null
}
