/**
 * @silvery/tea — TEA (The Elm Architecture) state machines, focus system, and utilities.
 *
 * Pure TypeScript core with no React dependency. Provides:
 * - TEA types and effect constructors (core/)
 * - TEA store with focus management (store/)
 * - Zustand TEA middleware (tea/)
 * - Focus manager, events, and queries
 * - Key parsing and hotkey matching
 * - Text cursor utilities
 * - AsyncIterable stream helpers (streams/)
 * - Plugin composition (withCommands, withKeybindings, withDiagnostics, withRender)
 *
 * @packageDocumentation
 */

// =============================================================================
// Core (TEA types, effects, plugin composition, focus manager, slices)
// =============================================================================

export {
  // TEA effect constructors
  none,
  batch,
  dispatch,
  // Plugin composition
  compose,
  // Focus manager
  createFocusManager,
  // Slices
  createSlice,
} from "./core"
export type {
  // TEA types
  SilveryModel,
  SilveryMsg,
  Effect,
  Sub,
  Direction,
  Plugin,
  // Focus manager types
  FocusManager,
  FocusManagerOptions,
  FocusChangeCallback,
  FocusOrigin,
  FocusSnapshot,
  // Focus event types
  SilveryKeyEvent,
  SilveryFocusEvent,
  FocusEventProps,
  // Slice types
  Slice,
  SliceWithInit,
  InferOp,
  // Shared types
  TeaNode,
  Rect,
} from "./core"

// Focus events
export { createKeyEvent, createFocusEvent, dispatchKeyEvent, dispatchFocusEvent } from "./focus-events"

// Focus queries
export {
  findFocusableAncestor,
  getTabOrder,
  findByTestID,
  findSpatialTarget,
  getExplicitFocusLink,
} from "./focus-queries"

// =============================================================================
// Store (TEA-style state container)
// =============================================================================

export { createStore, silveryUpdate, defaultInit, withFocusManagement } from "./store"
export type { StoreConfig, StoreApi } from "./store"

// =============================================================================
// Tea (Zustand middleware)
// =============================================================================

export { tea, collect } from "./tea"
export type { TeaResult, TeaReducer, EffectRunners, TeaSlice, EffectLike, TeaOptions } from "./tea"

// =============================================================================
// Keys
// =============================================================================

export { keyToName, keyToModifiers, parseHotkey, matchHotkey, parseKeypress, parseKey, emptyKey } from "./keys"
export type { ParsedKeypress, ParsedHotkey, Key } from "./keys"

// =============================================================================
// Text Cursor Utilities
// =============================================================================

export {
  cursorToRowCol,
  getWrappedLines,
  rowColToCursor,
  cursorMoveUp,
  cursorMoveDown,
  countVisualLines,
} from "./text-cursor"
export type { WrappedLine } from "./text-cursor"

// =============================================================================
// Text Operations
// =============================================================================

export { applyTextOp, invertTextOp, mergeTextOps } from "./text-ops"
export type { TextOp } from "./text-ops"

// =============================================================================
// Text Decorations
// =============================================================================

export { splitIntoSegments, createSearchDecorations, adjustDecorations } from "./text-decorations"
export type {
  Decoration,
  DecorationStyle,
  StyledSegment as DecorationSegment,
  SelectionRange,
} from "./text-decorations"

// =============================================================================
// Types
// =============================================================================

export { rectEqual } from "./types"

// =============================================================================
// Tree Utilities
// =============================================================================

export { getAncestorPath, pointInRect } from "./tree-utils"

// =============================================================================
// Streams (AsyncIterable helpers)
// =============================================================================

export {
  merge,
  map,
  filter,
  filterMap,
  takeUntil,
  take,
  throttle,
  debounce,
  batch as batchStream,
  concat,
  zip,
  fromArray,
  fromArrayWithDelay,
} from "./streams"

// =============================================================================
// Plugin Composition — pipe() and plugins
// =============================================================================

export { pipe } from "./pipe"
export type { AppPlugin } from "./pipe"

export { withReact } from "./with-react"
export type { AppWithReact } from "./with-react"

export { withTerminal } from "./with-terminal"
export type { WithTerminalOptions, AppWithTerminal, ProcessLike } from "./with-terminal"

export { withFocus } from "./with-focus"
export type { WithFocusOptions, AppWithFocus } from "./with-focus"

export { withDomEvents } from "./with-dom-events"
export type { WithDomEventsOptions } from "./with-dom-events"

export { createCommandRegistry } from "./create-command-registry"
export type { CommandDefInput, CommandDefs } from "./create-command-registry"

export { withCommands } from "./with-commands"
export type {
  WithCommandsOptions,
  CommandDef,
  CommandRegistryLike,
  CommandInfo,
  Command,
  Cmd,
  AppWithCommands,
  AppState,
  KeybindingDef,
} from "./with-commands"

export { withKeybindings } from "./with-keybindings"
export type { WithKeybindingsOptions, KeybindingContext, ExtendedKeybindingDef } from "./with-keybindings"

export { withDiagnostics, checkLayoutInvariants, VirtualTerminal } from "./with-diagnostics"
export type { DiagnosticOptions } from "./with-diagnostics"

export { withRender } from "./with-render"
export type { RenderTerm } from "./with-render"

// =============================================================================
// Plugins barrel (re-exports all of the above)
// =============================================================================

export { IncrementalRenderMismatchError } from "./plugins"
