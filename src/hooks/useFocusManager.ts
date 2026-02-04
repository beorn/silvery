/**
 * Inkx useFocusManager Hook
 *
 * Provides methods to control focus management for all components.
 * Compatible with Ink's useFocusManager API.
 */

import { useContext } from "react"
import { FocusContext } from "../context.js"

// ============================================================================
// Types
// ============================================================================

export interface UseFocusManagerResult {
  /** Enable focus management for all components */
  enableFocus: () => void
  /** Disable focus management for all components */
  disableFocus: () => void
  /** Focus the next focusable component */
  focusNext: () => void
  /** Focus the previous focusable component */
  focusPrevious: () => void
  /** Focus a specific component by ID */
  focus: (id: string) => void
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing focus across all focusable components.
 *
 * @example
 * ```tsx
 * function Navigation() {
 *   const { focusNext, focusPrevious, disableFocus } = useFocusManager();
 *
 *   useInput((input, key) => {
 *     if (key.tab) {
 *       if (key.shift) {
 *         focusPrevious();
 *       } else {
 *         focusNext();
 *       }
 *     }
 *
 *     if (key.escape) {
 *       disableFocus();
 *     }
 *   });
 *
 *   return <Text>Tab to navigate</Text>;
 * }
 * ```
 */
export function useFocusManager(): UseFocusManagerResult {
  const context = useContext(FocusContext)

  if (!context) {
    throw new Error("useFocusManager must be used within an Inkx application")
  }

  return {
    enableFocus: context.enableFocus,
    disableFocus: context.disableFocus,
    focusNext: context.focusNext,
    focusPrevious: context.focusPrevious,
    focus: context.focus,
  }
}
