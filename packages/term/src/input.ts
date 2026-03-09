/**
 * silvery/input -- Terminal input protocols and low-level input handling.
 *
 * Mouse events (SGR), Kitty keyboard protocol, bracketed paste,
 * OSC 52 clipboard, and key parsing utilities.
 *
 * ```tsx
 * import { parseMouseSequence, enableKittyKeyboard, copyToClipboard } from '@silvery/react/input'
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Mouse Parsing (SGR mode 1006)
// =============================================================================

export { parseMouseSequence, isMouseSequence, type ParsedMouse } from "./mouse"

// =============================================================================
// Mouse Events (DOM-level)
// =============================================================================

export {
  hitTest,
  createMouseEvent,
  createWheelEvent,
  dispatchMouseEvent,
  processMouseEvent,
  createMouseEventProcessor,
  checkDoubleClick,
  createDoubleClickState,
  computeEnterLeave,
  type SilveryMouseEvent,
  type SilveryWheelEvent,
  type MouseEventProps,
  type MouseEventProcessorOptions,
  type MouseEventProcessorState,
} from "./mouse-events"

// =============================================================================
// Hit Registry (mouse target resolution)
// =============================================================================

export {
  HitRegistry,
  HitRegistryContext,
  useHitRegistry,
  useHitRegion,
  useHitRegionCallback,
  resetHitRegionIdCounter,
  Z_INDEX,
} from "./hit-registry"
export type { HitTarget, HitRegion } from "./hit-registry"

// =============================================================================
// ANSI Escape Sequences
// =============================================================================

export {
  ANSI,
  BEL,
  enableMouse,
  disableMouse,
  KittyFlags,
  enableKittyKeyboard,
  disableKittyKeyboard,
  queryKittyKeyboard,
  notify,
  notifyITerm2,
  notifyKitty,
  reportDirectory,
} from "./output"

// =============================================================================
// Kitty Protocol Detection
// =============================================================================

export { detectKittySupport, detectKittyFromStdio, type KittyDetectResult } from "./kitty-detect"

// =============================================================================
// Terminal Capability Detection
// =============================================================================

export { detectTerminalCaps, type TerminalCaps } from "./terminal-caps"

// =============================================================================
// Bracketed Paste
// =============================================================================

export {
  enableBracketedPaste,
  disableBracketedPaste,
  parseBracketedPaste,
  PASTE_START,
  PASTE_END,
} from "./bracketed-paste"
export type { BracketedPasteResult } from "./bracketed-paste"

// =============================================================================
// OSC 52 Clipboard
// =============================================================================

export { copyToClipboard, requestClipboard, parseClipboardResponse } from "./clipboard"

// =============================================================================
// Key Parsing
// =============================================================================

export {
  keyToName,
  keyToModifiers,
  parseHotkey,
  matchHotkey,
  parseKeypress,
  parseKey,
  emptyKey,
} from "@silvery/tea/keys"
export type { ParsedKeypress, ParsedHotkey } from "@silvery/tea/keys"
