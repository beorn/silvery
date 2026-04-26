/**
 * silvery/input -- Terminal input protocols and low-level input handling.
 *
 * Mouse events (SGR), Kitty keyboard protocol, bracketed paste,
 * OSC 52 clipboard, and key parsing utilities.
 *
 * ```tsx
 * import { parseMouseSequence, enableKittyKeyboard, copyToClipboard } from '@silvery/ag-react/input'
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
  checkClickCount,
  createClickCountState,
  checkDoubleClick,
  createDoubleClickState,
  computeEnterLeave,
  type SilveryMouseEvent,
  type SilveryWheelEvent,
  type MouseEventProcessorOptions,
  type MouseEventProcessorState,
  type ClickCountState,
  type DoubleClickState,
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

// Post km-silvery.plateau-delete-legacy-shims (H6): `detectTerminalCaps`
// shim deleted — use `createTerminalProfile()` from the re-export below.
export { createTerminalProfile, type TerminalCaps, type TerminalProfile } from "./terminal-caps"

// =============================================================================
// Bracketed Paste
// =============================================================================

export {
  enableBracketedPaste,
  disableBracketedPaste,
  parseBracketedPaste,
  createBracketedPasteEvent,
  createInternalPasteEvent,
  PASTE_START,
  PASTE_END,
} from "./bracketed-paste"
export type { BracketedPasteResult, PasteEvent } from "./bracketed-paste"

// =============================================================================
// Clipboard
// =============================================================================

export { copyToClipboard, requestClipboard, parseClipboardResponse } from "./clipboard"
export {
  createOsc52Backend,
  createInternalClipboardBackend,
  createCompositeClipboard,
} from "./clipboard"
export type { ClipboardData, ClipboardBackend, ClipboardCapabilities } from "./clipboard"

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
} from "@silvery/ag/keys"
export type { ParsedKeypress, ParsedHotkey } from "@silvery/ag/keys"
