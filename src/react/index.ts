/**
 * inkx/react — React hooks and runtime API.
 *
 * This sub-path export provides all React-dependent functionality:
 * - Focus hooks: useFocusable, useFocusWithin, useFocusManager
 * - Layout hooks: useContentRect, useScreenRect
 * - App hooks: useApp, useInput, useTerm
 * - Runtime: run(), createApp()
 * - Contexts: FocusManagerContext, etc.
 *
 * For pure functions and types with no React dependency, use `inkx/core`.
 * For the TEA store, use `inkx/store`.
 *
 * @packageDocumentation
 */

// =============================================================================
// Focus Hooks
// =============================================================================

export { useFocusable } from "../hooks/useFocusable.js"
export type { UseFocusableResult } from "../hooks/useFocusable.js"

export { useFocusWithin } from "../hooks/useFocusWithin.js"

export { useFocusManager } from "../hooks/useFocusManager.js"
export type { UseFocusManagerResult } from "../hooks/useFocusManager.js"

// =============================================================================
// Layout Hooks
// =============================================================================

export { useContentRect, useContentRectCallback, useScreenRect, useScreenRectCallback } from "../hooks/useLayout.js"
export type { Rect } from "../hooks/useLayout.js"

// =============================================================================
// App Hooks
// =============================================================================

export { useApp } from "../hooks/useApp.js"
export type { UseAppResult } from "../hooks/useApp.js"

export { useInput } from "../hooks/useInput.js"
export type { Key, InputHandler, UseInputOptions } from "../hooks/useInput.js"

export { useRuntime } from "../hooks/useRuntime.js"

export { useTerm } from "../hooks/useTerm.js"

export { useConsole } from "../hooks/useConsole.js"

export {
  useCursor,
  resetCursorState,
  getCursorState,
  subscribeCursor,
  createCursorStore,
  CursorProvider,
} from "../hooks/useCursor.js"
export type { CursorPosition, CursorState, CursorAccessors, CursorStore } from "../hooks/useCursor.js"

// =============================================================================
// Edit Context Hook
// =============================================================================

export { useEditContext, activeEditContextRef, activeEditTargetRef } from "../hooks/use-edit-context.js"
export type { UseEditContextOptions, UseEditContextResult, EditTarget } from "../hooks/use-edit-context.js"

// =============================================================================
// Contexts
// =============================================================================

export { FocusManagerContext, TermContext, RuntimeContext } from "../context.js"
export type { RuntimeContextValue, BaseRuntimeEvents } from "../context.js"

// =============================================================================
// Runtime (Layer 2 + 3)
// =============================================================================

export { run, useInput as useRuntimeInput, useExit } from "../runtime/run.js"
export type { RunOptions, RunHandle } from "../runtime/run.js"

export { createApp, useApp as useAppStore, useAppShallow, StoreContext } from "../runtime/create-app.js"
export type {
  AppDefinition,
  AppHandle,
  AppRunOptions,
  AppRunner,
  EventHandler,
  EventHandlers,
  EventHandlerContext,
} from "../runtime/create-app.js"

// =============================================================================
// Input Layer Stack
// =============================================================================

export {
  InputLayerProvider,
  InputLayerContext,
  useInputLayer,
  useInputLayerContext,
} from "../contexts/InputLayerContext.js"
export type {
  InputLayerHandler,
  InputLayer,
  InputLayerContextValue,
  InputLayerProviderProps,
} from "../contexts/InputLayerContext.js"
