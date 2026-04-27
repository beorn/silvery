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

// Input owner — single-owner stdin mediator (mirrors Output for stdout).
// See ./input-owner.ts for the wasRaw anti-pattern it replaces.
export { createInputOwner, type InputOwner, type InputOwnerOptions } from "./input-owner"

// Modes — single owner for terminal protocol modes (raw, alt-screen,
// bracketed paste, kitty keyboard, mouse, focus reporting).
// Consolidates the scattered enable*/disable* calls; see ./devices/modes.ts.
export {
  createModes,
  KittyFlags,
  type Modes,
  type ModeName,
  type CreateModesOptions,
} from "./devices/modes"

// Signals — single owner for process-signal handlers with topologically-
// ordered, error-isolated teardown. See ./devices/signals.ts for rationale
// and the 2026-04-22 shared-global audit.
export {
  createSignals,
  type Signals,
  type SignalName,
  type SignalOnOptions,
  type SignalUnregister,
  type CreateSignalsOptions,
} from "./devices/signals"

// Layer 0: Pure render functions
export { layout, layoutSync, ensureLayoutEngine, type LayoutOptions } from "./layout"
export { diff, render, type DiffMode } from "./diff"

// Wrap-measurer registration — installs the terminal grapheme-aware
// `wrapTextWithOffsets` into `@silvery/ag`'s Option-B registry at module
// load. The side-effect import is what arms `computeSelectionFragments`
// for soft-wrap-aware selection geometry; the named exports are for tests
// that need to toggle the registration to exercise the `\n`-only fallback.
export {
  installTerminalWrapMeasurer,
  uninstallTerminalWrapMeasurer,
  restoreDefaultWrapMeasurer,
  isTerminalWrapMeasurerInstalled,
} from "./wrap-measurer-registration"

// Buffer helper
export { createBuffer } from "./create-buffer"

// Layer 1: Runtime kernel
export { createRuntime } from "./create-runtime"

// Layer 2 (themed shortcut): runThemed — detectScheme + ThemeProvider + run
export { runThemed } from "./themed"
export type { RunThemedOptions } from "./themed"

// Shared internal: wrapWithThemedProvider — detect + wrap without run().
// Use this for pipe-chain boot helpers (createThemedApp, withTheme, etc.)
// that need the ThemeProvider wrap but supply their own boot step.
export { wrapWithThemedProvider } from "./wrap-with-themed-provider"
export type {
  ThemedProviderOptions,
  WrapWithThemedProviderResult,
} from "./wrap-with-themed-provider"

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
  type UseInputOptions,
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

// Layer 3: Store integration (canonical home: @silvery/ag-term/runtime/create-app)
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
} from "./create-app"

// Time/tick sources
export { createTick, createFrameTick, createSecondTick, createAdaptiveTick } from "./tick"

// Scope-aware tick (km-silvery.scope-resource-ownership Phase 1).
// Demonstrates the opaque-branded-handle + per-scope-accounting pattern.
export { createScopedTick, type TickHandle } from "./scoped-tick"

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
