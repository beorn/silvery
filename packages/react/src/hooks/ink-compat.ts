/**
 * Ink-Compatible Focus Hooks
 *
 * Thin wrappers around silvery's focus system that provide ink's simpler API.
 * Used for compatibility with code written for ink's useFocus/useFocusManager.
 *
 * ink API differences from silvery:
 * - useFocus returns { isFocused } (silvery's useFocusable returns { focused })
 * - useFocus accepts { autoFocus, isActive, id } options
 * - useFocusManager returns { focusNext, focusPrevious, focus(id) }
 */

import { useFocusable } from "./useFocusable"
import { useFocusManager as useSilveryFocusManager } from "./useFocusManager"

// ============================================================================
// useFocus (ink-compatible)
// ============================================================================

export interface UseFocusOptions {
  /** Auto-focus this component on mount */
  autoFocus?: boolean
  /** Whether this component is active/focusable (not currently used, kept for API compat) */
  isActive?: boolean
  /** Unique identifier for this focusable (not currently used, kept for API compat) */
  id?: string
}

export interface UseFocusResult {
  /** Whether this component is currently focused */
  isFocused: boolean
}

/**
 * ink-compatible useFocus hook.
 *
 * Wraps silvery's useFocusable with ink's simpler API.
 *
 * ink API: useFocus({ autoFocus?, isActive?, id? }) => { isFocused }
 * silvery API: useFocusable() => { focused, focus(), blur(), focusOrigin }
 *
 * Note: autoFocus is handled by silvery's Box autoFocus prop, not by this hook.
 * The isActive and id options are accepted for API compatibility but are
 * not currently wired through — silvery uses testID and focusable props on Box.
 *
 * @example
 * ```tsx
 * function FocusableItem() {
 *   const { isFocused } = useFocus()
 *   return (
 *     <Box testID="item" focusable>
 *       <Text color={isFocused ? 'green' : 'white'}>Item</Text>
 *     </Box>
 *   )
 * }
 * ```
 */
export function useFocus(_opts?: UseFocusOptions): UseFocusResult {
  const { focused } = useFocusable()
  return { isFocused: focused }
}

// ============================================================================
// useFocusManager (ink-compatible)
// ============================================================================

export interface InkUseFocusManagerResult {
  /** Focus the next focusable element */
  focusNext: () => void
  /** Focus the previous focusable element */
  focusPrevious: () => void
  /** Focus a specific element by id */
  focus: (id: string) => void
  /** Enable focus management (no-op, kept for ink API compatibility) */
  enableFocus: () => void
  /** Disable focus management (no-op, kept for ink API compatibility) */
  disableFocus: () => void
}

/**
 * ink-compatible useFocusManager hook.
 *
 * Wraps silvery's useFocusManager with ink's API shape.
 *
 * ink API: useFocusManager() => { focusNext, focusPrevious, focus(id), enableFocus, disableFocus }
 * silvery API: useFocusManager() => { activeElement, activeId, focus, focusNext, focusPrev, blur, ... }
 *
 * @example
 * ```tsx
 * function Navigation() {
 *   const { focusNext, focusPrevious } = useFocusManager()
 *
 *   useInput((input, key) => {
 *     if (key.tab && key.shift) focusPrevious()
 *     else if (key.tab) focusNext()
 *   })
 *
 *   return <Text>Tab to navigate</Text>
 * }
 * ```
 */
export function useInkFocusManager(): InkUseFocusManagerResult {
  const fm = useSilveryFocusManager()
  return {
    focusNext: fm.focusNext,
    focusPrevious: fm.focusPrevious,
    focus: (id: string) => fm.focus(id),
    enableFocus: fm.enableFocus,
    disableFocus: fm.disableFocus,
  }
}
