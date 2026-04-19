/**
 * silvery/focus -- Tree-based focus management system.
 *
 * ```tsx
 * import { useFocusable, createFocusManager, InputLayerProvider, useInputLayer } from '@silvery/ag-react/focus'
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Focus Manager (pure, no React)
// =============================================================================

export { createFocusManager } from "@silvery/ag/focus-manager"
export type {
  FocusManager,
  FocusManagerOptions,
  FocusChangeCallback,
  FocusOrigin,
  FocusSnapshot,
} from "@silvery/ag/focus-manager"

// =============================================================================
// Focus Queries
// =============================================================================

export {
  findFocusableAncestor,
  getTabOrder,
  findByTestID,
  findSpatialTarget,
  getExplicitFocusLink,
} from "@silvery/ag/focus-queries"

// =============================================================================
// Focus Events
// =============================================================================

export {
  createKeyEvent,
  createFocusEvent,
  dispatchKeyEvent,
  dispatchFocusEvent,
} from "@silvery/ag/focus-events"
export type { SilveryKeyEvent, SilveryFocusEvent, FocusEventProps } from "@silvery/ag/focus-events"

// =============================================================================
// React Hooks
// =============================================================================

export { useFocusable } from "./hooks/useFocusable"
export type { UseFocusableResult } from "./hooks/useFocusable"

export { useFocusWithin } from "./hooks/useFocusWithin"
export { useFocusManager } from "./hooks/useFocusManager"
export type { UseFocusManagerResult } from "./hooks/useFocusManager"

// =============================================================================
// Contexts
// =============================================================================

export { FocusManagerContext } from "./context"

// =============================================================================
// Input Layer Stack (DOM-style event bubbling)
// =============================================================================

export {
  InputLayerProvider,
  InputLayerContext,
  useInputLayer,
  useInputLayerContext,
} from "./contexts/InputLayerContext"
export type {
  InputLayerHandler,
  InputLayer,
  InputLayerContextValue,
  InputLayerProviderProps,
} from "./contexts/InputLayerContext"

export { InputBoundary } from "./contexts/InputBoundary"
export type { InputBoundaryProps } from "./contexts/InputBoundary"
