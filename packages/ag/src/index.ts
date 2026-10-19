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
export { BUILT_IN_BORDER_PRESETS, builtInBorderPreset } from "./border-presets"
export type { BorderPreset, BuiltInBorderStyle } from "./border-presets"
export { rectEqual } from "./types"
export type {
  Rect,
  AgNode,
  AgNodeType,
  BoxProps,
  TextProps,
  TextTruncateHook,
  TextTruncateResult,
  TextMeasure,
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
  AnchorEdge,
  AnchorRef,
  Decoration,
  Placement,
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

// Viewport (nested-cell-domain composition primitive — see bead @km/silvery/15513)
// Deprecated by Islands (@km/silvery/15646); Phase 4 of that epic deletes this surface.
export type {
  CellBuffer,
  ViewportRect,
  ViewportCursorStyle,
  ViewportInputMode,
  ViewportPalette,
  ViewportContext,
  ForeignSource,
  ViewportRef,
  ViewportProps,
  ViewportNodeState,
} from "./viewport-types"
export { createCellBuffer } from "./viewport-buffer"
export type { MutableCellBuffer } from "./viewport-buffer"

// Islands — built-in guests (Phase 2 of @km/silvery/15646)
export { createIsland } from "./island"
export type { CreateIslandOptions, CreateIslandResult } from "./island"
export { snapshotGuest, sandbox, synthesizeOSCResponse } from "./island-guests"
export type { SnapshotGuestOptions, SnapshotGuestHandle, SandboxOptions } from "./island-guests"

// Islands (cell-grid mount primitive — see bead @km/silvery/15646)
export type {
  IslandSignal,
  IslandCapabilities,
  IslandArtifactCapabilities,
  IslandOutputArtifact,
  IslandOutputArtifactOwner,
  IslandHydrate,
  IslandPalettePolicy,
  IslandSizeOwner,
  IslandOutputOwner,
  IslandInputOwner,
  IslandModesOwner,
  IslandSignalsOwner,
  IslandPaletteOwner,
  IslandProtocolModes,
  IslandHandle,
  IslandContext,
  IslandGuest,
  IslandNodeState,
  IslandCursorState,
  IslandKeyEvent,
  IslandMouseEvent,
  IslandInputEvent,
  IslandCommandPrefix,
} from "./island-types"

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
  markDirty,
  setDirty,
  createEpochOwner,
  type EpochOwner,
  type EpochNode,
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
export * from "./interaction-treatment"

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
  observeLayoutSignal,
  syncRectSignals,
  syncTextContentSignal,
  syncFocusedSignal,
  syncDecorationRects,
  computeContentRect,
  computeCursorRect,
  computeFocusedNodeId,
  computeSelectionFragments,
  computeAnchorRect,
  computeDecorationRects,
  findActiveCursorRect,
  findActiveCursorRectWithProvenance,
  findActiveFocusedNodeId,
  findActiveSelectionFragments,
  findActiveDecorationRects,
  findAnchor,
  type LayoutSignals,
  type ScrollStateSnapshot,
  type CursorRect,
  type CursorProvenance,
  type ActiveCursorResult,
  type DecorationRect,
} from "./layout-signals"

// Wrap-measurer registry (Option B — runtime-supplied wrap geometry)
export {
  setWrapMeasurer,
  getWrapMeasurer,
  type WrapMeasurer,
  type WrapSlice,
} from "./wrap-measurer"

// Overlay/anchor placement (Phase 4c — overlay-anchor v1)
export { placeFloating } from "./place-floating"

// OverlayLayer per-frame artifact (Phase 4c — overlay-anchor v1)
export { collectOverlayLayer, type OverlayLayer } from "./overlay-layer"

// Shared integer width apportionment (one allocator for tables, boards, lanes)
export {
  apportion,
  apportionRealWidths,
  apportionTension,
  findApportionBandViolation,
  parseTrackBand,
  TRACK_BAND_ATTR,
  type ApportionBandViolation,
  type ApportionOptions,
  type ApportionResult,
  type ApportionTrack,
  type RealizedTrack,
} from "./apportion"
