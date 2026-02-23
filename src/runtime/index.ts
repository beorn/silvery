/**
 * inkx-loop Runtime Module
 *
 * Provides the core primitives for the inkx-loop architecture:
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
} from "./types.js"

// Terminal provider
export {
  createTermProvider,
  type TermProvider,
  type TermState,
  type TermEvents,
  type TermProviderOptions,
} from "./term-provider.js"

// Layer 0: Pure render functions
export { layout, layoutSync, ensureLayoutEngine, type LayoutOptions } from "./layout.js"
export { diff, render, type DiffMode } from "./diff.js"

// Buffer helper
export { createBuffer } from "./create-buffer.js"

// Layer 1: Runtime kernel
export { createRuntime } from "./create-runtime.js"

// Layer 2: React integration
export {
  run,
  useInput,
  useExit,
  usePaste,
  type RunOptions,
  type RunHandle,
  type InputHandler,
  type PasteHandler,
  type Key,
} from "./run.js"

// Key parsing utilities
export { parseKey, emptyKey } from "./keys.js"

// Layer 1.5: TEA store (re-exported for discoverability)
export { createStore, inkxUpdate, defaultInit, withFocusManagement } from "../store/index.js"
export type { StoreConfig, StoreApi } from "../store/index.js"

// Layer 3: Store integration
export {
  createApp,
  useApp,
  useAppShallow,
  StoreContext,
  type AppDefinition,
  type AppHandle,
  type AppRunOptions,
  type AppRunner,
  type EventHandler,
  type EventHandlers,
  type EventHandlerContext,
} from "./create-app.js"

// Time/tick sources
export { createTick, createFrameTick, createSecondTick, createAdaptiveTick } from "./tick.js"

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
} from "../streams/index.js"
