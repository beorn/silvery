/**
 * Inkx useApp Hook
 *
 * Provides access to app-level controls like exit.
 * Compatible with Ink's useApp API.
 */

import { useContext } from "react";
import { AppContext } from "../context.js";

// ============================================================================
// Types
// ============================================================================

export interface UseAppResult {
  /**
   * Exit the application.
   * Optionally pass an error to indicate the app exited due to an error.
   */
  exit: (error?: Error) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for accessing app-level controls.
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
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("useApp must be used within an Inkx application");
  }

  return {
    exit: context.exit,
  };
}
