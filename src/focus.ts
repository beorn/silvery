/**
 * inkx/focus -- Tree-based focus management system.
 *
 * ```tsx
 * import { useFocusable, createFocusManager, InputLayerProvider, useInputLayer } from 'inkx/focus'
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Focus Manager (pure, no React)
// =============================================================================

export { createFocusManager } from "./focus-manager.js"
export type {
  FocusManager,
  FocusManagerOptions,
  FocusChangeCallback,
  FocusOrigin,
  FocusSnapshot,
} from "./focus-manager.js"

// =============================================================================
// Focus Queries
// =============================================================================

export {
  findFocusableAncestor,
  getTabOrder,
  findByTestID,
  findSpatialTarget,
  getExplicitFocusLink,
} from "./focus-queries.js"

// =============================================================================
// Focus Events
// =============================================================================

export { createKeyEvent, createFocusEvent, dispatchKeyEvent, dispatchFocusEvent } from "./focus-events.js"
export type { InkxKeyEvent, InkxFocusEvent, FocusEventProps } from "./focus-events.js"

// =============================================================================
// React Hooks
// =============================================================================

export { useFocusable } from "./hooks/useFocusable.js"
export type { UseFocusableResult } from "./hooks/useFocusable.js"

export { useFocusWithin } from "./hooks/useFocusWithin.js"
export { useFocusManager } from "./hooks/useFocusManager.js"
export type { UseFocusManagerResult } from "./hooks/useFocusManager.js"

// =============================================================================
// Contexts
// =============================================================================

export { FocusManagerContext } from "./context.js"

// =============================================================================
// Input Layer Stack (DOM-style event bubbling)
// =============================================================================

export {
  InputLayerProvider,
  InputLayerContext,
  useInputLayer,
  useInputLayerContext,
} from "./contexts/InputLayerContext.js"
export type {
  InputLayerHandler,
  InputLayer,
  InputLayerContextValue,
  InputLayerProviderProps,
} from "./contexts/InputLayerContext.js"

export { InputBoundary } from "./contexts/InputBoundary.js"
export type { InputBoundaryProps } from "./contexts/InputBoundary.js"
