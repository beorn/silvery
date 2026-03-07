/**
 * Hightea useApp Hook
 *
 * Provides access to app-level controls like exit, pause, resume.
 * Backed by RuntimeContext (unified input + app controls).
 *
 * Unlike useInput (which throws outside a runtime), useApp returns
 * no-op values in static mode — exit/pause/resume are safe to call
 * but do nothing. This allows components to be rendered statically
 * for testing or string output.
 */

import { useContext } from "react"
import { RuntimeContext } from "../context.js"

// ============================================================================
// Types
// ============================================================================

export interface UseAppResult {
  /**
   * Exit the application.
   * Optionally pass an error to indicate the app exited due to an error.
   * No-op in static mode.
   */
  exit: (error?: Error) => void
  /**
   * Pause rendering output (for screen switching). Input still works.
   * Returns undefined if not supported.
   */
  pause?: () => void
  /**
   * Resume rendering after pause. Forces a full redraw.
   * Returns undefined if not supported.
   */
  resume?: () => void
}

// No-op fallback for static mode
const staticResult: UseAppResult = {
  exit: () => {},
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for accessing app-level controls.
 *
 * Returns no-op values in static mode (no RuntimeContext).
 * Use useRuntime() if you need to distinguish between modes.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { exit } = useApp();
 *
 *   useInput((input) => {
 *     if (input === 'q') {
 *       exit();
 *     }
 *   });
 *
 *   return <Text>Press q to quit</Text>;
 * }
 * ```
 */
export function useApp(): UseAppResult {
  const rt = useContext(RuntimeContext)

  if (!rt) {
    return staticResult
  }

  return {
    exit: rt.exit,
    pause: rt.pause,
    resume: rt.resume,
  }
}
