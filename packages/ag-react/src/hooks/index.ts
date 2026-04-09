/**
 * Silvery Hooks
 *
 * React hooks for building terminal UI applications.
 */

// Layout
export {
  useContentRect,
  useContentRectCallback,
  useScrollRect,
  useScreenRect,
  useScreenRectCallback,
  type Rect,
} from "./useLayout"

// Box metrics (Ink-compatible — returns { width, height, left, top, hasMeasured })
export { useBoxMetrics, type BoxMetrics } from "./useBoxMetrics"

// Animation (Ink-compatible — Phase 1: shared-scheduler frame counter)
export { useAnimation, type UseAnimationOptions, type UseAnimationResult } from "./useAnimation"

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
export { useFocus, type UseFocusOptions, type UseFocusResult } from "./useFocus"
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

// Paste Handler
export { PasteProvider, usePaste } from "./usePaste"
export type { PasteHandler } from "./usePaste"

// Paste Event Bridge (runtime → PasteHandler context)
export { usePasteEvents } from "./usePasteEvents"

// Selection (capability-based — reads from CapabilityRegistry)
export { useSelection } from "./useSelection"

// Find State (capability-based — reads from CapabilityRegistry)
export { useFindState } from "./useFindState"

// Copy Mode State (capability-based — reads from CapabilityRegistry)
export { useCopyModeState } from "./useCopyModeState"

// Drag State (capability-based — reads from CapabilityRegistry)
export { useDragState } from "./useDragState"

// Interactive State
export { useInteractiveState } from "./useInteractiveState"

// List Item
export { useListItem } from "./useListItem"
export type { ListItemContext } from "./useListItem"
export { useColorScheme } from "./useColorScheme"
