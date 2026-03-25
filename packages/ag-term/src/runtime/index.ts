/**
 * silvery-loop Runtime Module
 *
 * Provides the core primitives for the silvery-loop architecture:
 *
 * Layer 0: Pure render functions
 * - layout() - React element → Buffer
 * - diff() - Buffer diff → ANSI patch
 *
 * Layer 1: Runtime kernel (createRuntime)
 * - events() - AsyncIterable event stream
 * - schedule() - Effect scheduling
 * - render() - Output to target
 *
 * Stream helpers
 * - merge, map, filter, takeUntil, etc.
 */

// Types
export type {
  Buffer,
  Dims,
  Event,
  RenderTarget,
  Runtime,
  RuntimeOptions,
  // Provider types
  Provider,
  ProviderEvent,
  NamespacedEvent,
  ProviderEventKey,
  EventData,
} from "./types"

// Terminal provider
export {
  createTermProvider,
  type TermProvider,
  type TermState,
  type TermEvents,
  type TermProviderOptions,
} from "./term-provider"

// Layer 0: Pure render functions
export { layout, layoutSync, ensureLayoutEngine, type LayoutOptions } from "./layout"
export { diff, render, type DiffMode } from "./diff"

// Buffer helper
export { createBuffer } from "./create-buffer"

// Layer 1: Runtime kernel
export { createRuntime } from "./create-runtime"

// Layer 2: React integration
// NOTE: RunHandle intentionally NOT re-exported from barrel.
// Use pipe(create(), withAg(), withTerm()) for new apps.
// Tests that need RunHandle import directly from "./run".
export {
  run,
  useInput,
  useExit,
  usePaste,
  type RunOptions,
  type InputHandler,
  type PasteHandler,
  type Key,
} from "./run"

// Key parsing utilities
export { parseKey, emptyKey } from "./keys"

// Terminal lifecycle (suspend/resume, interrupt)
export {
  captureTerminalState,
  restoreTerminalState,
  resumeTerminalState,
  performSuspend,
  CTRL_C,
  CTRL_Z,
  type TerminalLifecycleOptions,
  type TerminalState,
} from "./terminal-lifecycle"

// Layer 1.5: TEA store (re-exported for discoverability)
export { createStore, silveryUpdate, defaultInit, withFocusManagement } from "@silvery/create/store"
export type { StoreConfig, StoreApi } from "@silvery/create/store"

// Layer 3: Store integration (canonical home: @silvery/create, re-exported for compat)
// NOTE: AppHandle is intentionally NOT re-exported — it's an era2b concept.
// Use @silvery/create directly for createApp/AppHandle.
export {
  createApp,
  useApp,
  useAppShallow,
  StoreContext,
  type AppDefinition,
  type AppRunOptions,
  type AppRunner,
  type EventHandler,
  type EventHandlers,
  type EventHandlerContext,
} from "@silvery/create/create-app"

// Time/tick sources
export { createTick, createFrameTick, createSecondTick, createAdaptiveTick } from "./tick"

// Stream helpers (re-export from streams module)
export {
  merge,
  map,
  filter,
  filterMap,
  takeUntil,
  take,
  throttle,
  debounce,
  batch,
  concat,
  zip,
  fromArray,
  fromArrayWithDelay,
} from "@silvery/create/streams"
