/**
 * inkx/input -- Terminal input protocols and low-level input handling.
 *
 * Mouse events (SGR), Kitty keyboard protocol, bracketed paste,
 * OSC 52 clipboard, and key parsing utilities.
 *
 * ```tsx
 * import { parseMouseSequence, enableKittyKeyboard, copyToClipboard } from 'inkx/input'
 * ```
 *
 * @packageDocumentation
 */

// =============================================================================
// Mouse Parsing (SGR mode 1006)
// =============================================================================

export { parseMouseSequence, isMouseSequence, type ParsedMouse } from "./mouse.js"

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
  type InkxMouseEvent,
  type InkxWheelEvent,
  type MouseEventProps,
  type MouseEventProcessorOptions,
  type MouseEventProcessorState,
} from "./mouse-events.js"

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
} from "./hit-registry.js"
export type { HitTarget, HitRegion } from "./hit-registry.js"

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
} from "./output.js"

// =============================================================================
// Kitty Protocol Detection
// =============================================================================

export { detectKittySupport, detectKittyFromStdio, type KittyDetectResult } from "./kitty-detect.js"

// =============================================================================
// Terminal Capability Detection
// =============================================================================

export { detectTerminalCaps, type TerminalCaps } from "./terminal-caps.js"

// =============================================================================
// Bracketed Paste
// =============================================================================

export {
  enableBracketedPaste,
  disableBracketedPaste,
  parseBracketedPaste,
  PASTE_START,
  PASTE_END,
} from "./bracketed-paste.js"
export type { BracketedPasteResult } from "./bracketed-paste.js"

// =============================================================================
// OSC 52 Clipboard
// =============================================================================

export { copyToClipboard, requestClipboard, parseClipboardResponse } from "./clipboard.js"

// =============================================================================
// Key Parsing
// =============================================================================

export { keyToName, keyToModifiers, parseHotkey, matchHotkey, parseKeypress, parseKey, emptyKey } from "./keys.js"
export type { ParsedKeypress, ParsedHotkey } from "./keys.js"
