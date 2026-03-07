/**
 * Hightea Hooks
 *
 * React hooks for building terminal UI applications.
 */

// Layout
export { useContentRect, useContentRectCallback, useScreenRect, type Rect } from "./useLayout.js"

// Input
export { useInput, type Key, type InputHandler, type UseInputOptions } from "./useInput.js"

// Runtime
export { useRuntime } from "./useRuntime.js"

// App
export { useApp, type UseAppResult } from "./useApp.js"

// Stdio
export { useStdout, type UseStdoutResult } from "./useStdout.js"

// Focus (tree-based system)
export { useFocusable, type UseFocusableResult } from "./useFocusable.js"
export { useFocusWithin } from "./useFocusWithin.js"
export { useFocusManager, type UseFocusManagerResult } from "./useFocusManager.js"

// Input Layer Stack
export { useInputLayer, useInputLayerContext, type InputLayerHandler } from "./useInputLayer.js"

// Scroll Region Optimization
export { useScrollRegion } from "./useScrollRegion.js"
export type { UseScrollRegionOptions, UseScrollRegionResult } from "./useScrollRegion.js"

// Ink-compatible focus hooks
export { useFocus, useInkFocusManager } from "./ink-compat.js"
export type { UseFocusOptions, UseFocusResult, InkUseFocusManagerResult } from "./ink-compat.js"
