/**
 * ANSI terminal control helpers.
 *
 * All functions have moved to @silvery/ansi (terminal-control.ts).
 * Re-exported here to preserve the @silvery/ag-term/ansi import path.
 */

export {
  enterAltScreen,
  leaveAltScreen,
  clearScreen,
  clearLine,
  cursorTo,
  cursorHome,
  cursorHide,
  cursorShow,
  cursorStyle,
  setTitle,
  enableMouse,
  disableMouse,
  enableBracketedPaste,
  disableBracketedPaste,
  enableSyncUpdate,
  disableSyncUpdate,
  setScrollRegion,
  resetScrollRegion,
  scrollUp,
  scrollDown,
  enableKittyKeyboard,
  disableKittyKeyboard,
} from "@silvery/ansi"
