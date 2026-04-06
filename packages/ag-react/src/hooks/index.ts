/**
 * Silvery Hooks
 *
 * React hooks for building terminal UI applications.
 */

// Layout
export {
  useContentRect,
  useContentRectCallback,
  useScreenRect,
  useRenderRect,
  useRenderRectCallback,
  type Rect,
} from "./useLayout"

// Input
export { useInput, type Key, type InputHandler, type UseInputOptions } from "./useInput"

// Runtime
export { useRuntime } from "./useRuntime"

// App
export { useApp, type UseAppResult } from "./useApp"

// Stdio
export { useStdout, type UseStdoutResult } from "./useStdout"
export { useStderr, type UseStderrResult } from "./useStderr"

// Focus (tree-based system)
export { useFocusable, type UseFocusableResult } from "./useFocusable"
export { useFocusWithin } from "./useFocusWithin"
export { useFocusManager, type UseFocusManagerResult } from "./useFocusManager"

// Input Layer Stack
export { useInputLayer, useInputLayerContext, type InputLayerHandler } from "./useInputLayer"

// Terminal Focus
export { useTerminalFocused } from "./useTerminalFocused"

// Scroll Region Optimization
export { useScrollRegion } from "./useScrollRegion"
export type { UseScrollRegionOptions, UseScrollRegionResult } from "./useScrollRegion"

// Terminal Selection (buffer-level text copy/paste)
export {
  useTerminalSelection,
  useTerminalSelectionContext,
  TerminalSelectionProvider,
  getInternalClipboard,
} from "./useTerminalSelection"
export type { UseTerminalSelectionResult } from "./useTerminalSelection"

// Find (visible-buffer text search + optional FindProvider for virtual lists)
export { useFind } from "./useFind"
export type { UseFindResult, UseFindOptions } from "./useFind"

// Find Provider (virtual list model-level search)
export { FindProviderComponent, useFindProvider } from "./useFindProvider"

// Copy Mode (keyboard-driven selection)
export { useCopyMode } from "./useCopyMode"
export type { UseCopyModeResult, UseCopyModeOptions } from "./useCopyMode"

// Semantic Copy Provider
export { CopyProvider, useCopyProvider } from "./useCopyProvider"

// Paste Handler
export { PasteProvider, usePaste } from "./usePaste"
export type { PasteHandler } from "./usePaste"

// Paste Event Bridge (runtime → PasteHandler context)
export { usePasteEvents } from "./usePasteEvents"

// Pointer State Machine (gesture disambiguation)
export { usePointerState, resolveUserSelect, resolveNodeDraggable } from "./usePointerState"
export type { UsePointerStateOptions, UsePointerStateResult } from "./usePointerState"

// Interactive State
export { useInteractiveState } from "./useInteractiveState"

// List Item
export { useListItem } from "./useListItem"
export type { ListItemContext } from "./useListItem"
