/**
 * ANSI terminal control utilities
 *
 * @example
 * ```ts
 * import {
 *   CURSOR_HIDE,
 *   CURSOR_SHOW,
 *   CLEAR_LINE,
 *   write,
 *   isTTY,
 * } from "./index";
 *
 * if (isTTY()) {
 *   write(CURSOR_HIDE);
 *   // ... do work ...
 *   write(CURSOR_SHOW);
 * }
 * ```
 */

// Re-export all from cli/ansi.ts
export {
  // Cursor control
  CURSOR_HIDE,
  CURSOR_SHOW,
  CURSOR_TO_START,
  CURSOR_SAVE,
  CURSOR_RESTORE,
  cursorUp,
  cursorDown,
  // Line/screen clearing
  CLEAR_LINE,
  CLEAR_LINE_END,
  CLEAR_SCREEN,
  // Writing utilities
  write,
  writeLine,
  withCursor,
  // Terminal detection
  isTTY,
  getTerminalWidth,
} from "../cli/ansi"

// 34249: the ANSI tokenizer, exported here because this package already depends on
// @silvery/ag-term; the root entry re-exports this module, so `silvery/ui/ansi` carries it.
// The SUBPATH, not the package barrel (@cto, 34249): importing "@silvery/ag-term" pulls the whole
// terminal runtime in behind a tokenizer — measured at 89-105 ms and 79 MB for the subpath surface's
// 1-2 ms and 17 MB — and an entry that exports one function should not carry the other.
export { tokenizeAnsi, type AnsiToken } from "@silvery/ag-term/ansi-sanitize"
