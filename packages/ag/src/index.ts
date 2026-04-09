/**
 * @silvery/ag — Core types and infrastructure for silvery.
 *
 * Contains foundational types (AgNode, BoxProps, TextProps, Rect),
 * keyboard parsing (parseKey, keyToAnsi, parseHotkey),
 * focus management (createFocusManager),
 * focus events (createKeyEvent, dispatchKeyEvent),
 * and tree utilities (getAncestorPath, pointInRect).
 *
 * @packageDocumentation
 */

// Types
export { rectEqual } from "./types"
export type {
  Rect,
  AgNode,
  AgNodeType,
  BoxProps,
  TextProps,
  FlexboxProps,
  StyleProps,
  TestProps,
  UnderlineStyle,
  InteractiveState,
  CellAttrs,
  Cell,
  TerminalBuffer,
  KeyEvent,
  MouseEvent,
  ResizeEvent,
  FocusEvent,
  BlurEvent,
  SignalEvent,
  CustomEvent,
  Event,
  EventSource,
} from "./types"

// Keys
export {
  parseKey,
  parseKeypress,
  emptyKey,
  keyToAnsi,
  keyToKittyAnsi,
  keyToName,
  keyToModifiers,
  splitRawInput,
  parseHotkey,
  matchHotkey,
  CODE_TO_KEY,
} from "./keys"
export type { Key, ParsedKeypress, ParsedHotkey, InputHandler } from "./keys"

// Focus Manager
export { createFocusManager } from "./focus-manager"
export type {
  FocusManager,
  FocusManagerOptions,
  FocusChangeCallback,
  FocusOrigin,
  FocusSnapshot,
} from "./focus-manager"

// Focus Events
export { createKeyEvent, createFocusEvent, dispatchKeyEvent, dispatchFocusEvent } from "./focus-events"
export type { SilveryKeyEvent, SilveryFocusEvent, FocusEventProps } from "./focus-events"

// Drag Event Types
export type { DragEventPayload, DragEventProps } from "./drag-event-types"

// TextFrame
export type { TextFrame, FrameCell, RGB } from "./text-frame"

// Interactive Signals
export {
  ensureInteractiveState,
  setHovered,
  setArmed,
  setSelected,
  setFocused,
  setDropTarget,
  clearInteractiveState,
} from "./interactive-signals"

// Tree Utilities
export { getAncestorPath, pointInRect } from "./tree-utils"

// Dirty Tracking
export {
  trackLayoutDirty,
  trackContentDirty,
  hasLayoutDirty,
  hasContentDirty,
  getLayoutDirtyNodes,
  getContentDirtyNodes,
  clearDirtyTracking,
  clearLayoutDirtyTracking,
} from "./dirty-tracking"
