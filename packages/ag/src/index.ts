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
  CursorOffset,
  CursorShape,
  SelectionIntent,
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
  isModifierOnlyEvent,
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
export {
  createKeyEvent,
  createFocusEvent,
  dispatchKeyEvent,
  dispatchFocusEvent,
} from "./focus-events"
export type { SilveryKeyEvent, SilveryFocusEvent, FocusEventProps } from "./focus-events"

// Drag Event Types
export type { DragEventPayload, DragEventProps } from "./drag-event-types"

// Mouse Event Types
export type { SilveryMouseEvent, SilveryWheelEvent, MouseEventProps } from "./mouse-event-types"

// Layout Types
export type { LayoutNode, MeasureFunc, MeasureMode } from "./layout-types"

// Render Epoch + Bit-Packed Dirty Flags
export {
  INITIAL_EPOCH,
  CONTENT_BIT,
  STYLE_PROPS_BIT,
  BG_BIT,
  CHILDREN_BIT,
  SUBTREE_BIT,
  ABS_CHILD_BIT,
  DESC_OVERFLOW_BIT,
  ALL_RECONCILER_BITS,
  ALL_BITS,
  getRenderEpoch,
  advanceRenderEpoch,
  isCurrentEpoch,
  isDirty,
  isAnyDirty,
  setDirtyBit,
} from "./epoch"

// Focus Queries
export {
  findFocusableAncestor,
  getTabOrder,
  findEnclosingScope,
  findByTestID,
  findSpatialTarget,
  getExplicitFocusLink,
} from "./focus-queries"

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
  trackContentDirty,
  trackScrollDirty,
  hasContentDirty,
  hasScrollDirty,
  getContentDirtyNodes,
  clearDirtyTracking,
} from "./dirty-tracking"

// Layout Signals (rects + textContent + focused — unified module)
export {
  getLayoutSignals,
  hasLayoutSignals,
  syncRectSignals,
  syncTextContentSignal,
  syncFocusedSignal,
  computeContentRect,
  computeCursorRect,
  computeFocusedNodeId,
  computeSelectionFragments,
  findActiveCursorRect,
  findActiveFocusedNodeId,
  findActiveSelectionFragments,
  type LayoutSignals,
  type ScrollStateSnapshot,
  type CursorRect,
} from "./layout-signals"

// Wrap-measurer registry (Option B — runtime-supplied wrap geometry)
export {
  setWrapMeasurer,
  getWrapMeasurer,
  type WrapMeasurer,
  type WrapSlice,
} from "./wrap-measurer"
