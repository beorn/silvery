/**
 * Silvery Hooks
 *
 * React hooks for building terminal UI applications.
 */

// Layout
export { useContentRect, useContentRectCallback, useScreenRect, type Rect } from "./useLayout";

// Input
export { useInput, type Key, type InputHandler, type UseInputOptions } from "./useInput";

// Runtime
export { useRuntime } from "./useRuntime";

// App
export { useApp, type UseAppResult } from "./useApp";

// Stdio
export { useStdout, type UseStdoutResult } from "./useStdout";

// Focus (tree-based system)
export { useFocusable, type UseFocusableResult } from "./useFocusable";
export { useFocusWithin } from "./useFocusWithin";
export { useFocusManager, type UseFocusManagerResult } from "./useFocusManager";

// Input Layer Stack
export { useInputLayer, useInputLayerContext, type InputLayerHandler } from "./useInputLayer";

// Scroll Region Optimization
export { useScrollRegion } from "./useScrollRegion";
export type { UseScrollRegionOptions, UseScrollRegionResult } from "./useScrollRegion";
