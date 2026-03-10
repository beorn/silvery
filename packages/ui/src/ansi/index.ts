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
 * } from "@silvery/ui/ansi";
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
} from "../cli/ansi";
