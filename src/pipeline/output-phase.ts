/**
 * Phase 4: Output Phase
 *
 * Diff two buffers and produce minimal ANSI output.
 */

import {
  type CellAttrs,
  type Color,
  type Style,
  type TerminalBuffer,
  styleEquals,
} from "../buffer.js";
import type { CellChange } from "./types.js";

/**
 * Check if any text attributes are active.
 */
function hasActiveAttrs(attrs: CellAttrs): boolean {
  return !!(
    attrs.bold ||
    attrs.dim ||
    attrs.italic ||
    attrs.underline ||
    attrs.blink ||
    attrs.inverse ||
    attrs.hidden ||
    attrs.strikethrough
  );
}

/**
 * Diff two buffers and produce minimal ANSI output.
 *
 * @param prev Previous buffer (null on first render)
 * @param next Current buffer
 * @returns ANSI escape sequence string
 */
export function outputPhase(
  prev: TerminalBuffer | null,
  next: TerminalBuffer,
): string {
  // First render: output entire buffer
  if (!prev) {
    return bufferToAnsi(next);
  }

  // Diff and emit only changes
  const changes = diffBuffers(prev, next);

  if (changes.length === 0) {
    return ""; // No changes
  }

  return changesToAnsi(changes);
}

/**
 * Convert entire buffer to ANSI string.
 */
function bufferToAnsi(buffer: TerminalBuffer): string {
  let output = "";
  let currentStyle: Style | null = null;

  // Move cursor to home position
  output += "\x1b[H";

  for (let y = 0; y < buffer.height; y++) {
    // IMPORTANT: Use \r\n (carriage return + line feed), not just \n
    // A bare \n moves the cursor down but does NOT reset to column 0
    // This was the root cause of bug km-x7ih where row 0 content
    // appeared at the bottom of the screen
    //
    // IMPORTANT: Reset style before newline to prevent background color bleeding.
    // Without this reset, terminals may extend the current background color
    // to the edge of the terminal when outputting the newline, causing visual
    // artifacts like blank highlighted lines. (fix for km-2wh0)
    if (y > 0) {
      if (
        currentStyle &&
        (currentStyle.bg !== null || hasActiveAttrs(currentStyle.attrs))
      ) {
        output += "\x1b[0m";
        currentStyle = null;
      }
      output += "\r\n";
    }

    for (let x = 0; x < buffer.width; x++) {
      const cell = buffer.getCell(x, y);

      // Skip continuation cells
      if (cell.continuation) continue;

      // Update style if changed
      const cellStyle: Style = { fg: cell.fg, bg: cell.bg, attrs: cell.attrs };
      if (!styleEquals(currentStyle, cellStyle)) {
        output += styleToAnsi(cellStyle);
        currentStyle = cellStyle;
      }

      output += cell.char;
    }
  }

  // Reset style at end
  output += "\x1b[0m";

  return output;
}

/**
 * Diff two buffers and return list of changes.
 *
 * Optimization: Uses buffer's cellEquals method which can do fast
 * packed integer comparison before falling back to full cell comparison.
 */
function diffBuffers(prev: TerminalBuffer, next: TerminalBuffer): CellChange[] {
  const changes: CellChange[] = [];

  // Dimension mismatch means we need to re-render everything visible
  const height = Math.min(prev.height, next.height);
  const width = Math.min(prev.width, next.width);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Use buffer's optimized cellEquals which compares packed metadata first
      if (!next.cellEquals(x, y, prev)) {
        changes.push({ x, y, cell: next.getCell(x, y) });
      }
    }
  }

  // Handle size changes: add all cells in new areas
  if (next.width > prev.width) {
    for (let y = 0; y < next.height; y++) {
      for (let x = prev.width; x < next.width; x++) {
        changes.push({ x, y, cell: next.getCell(x, y) });
      }
    }
  }
  if (next.height > prev.height) {
    for (let y = prev.height; y < next.height; y++) {
      for (let x = 0; x < next.width; x++) {
        changes.push({ x, y, cell: next.getCell(x, y) });
      }
    }
  }

  return changes;
}

/**
 * Convert cell changes to optimized ANSI output.
 */
function changesToAnsi(changes: CellChange[]): string {
  // Sort by position for optimal cursor movement
  changes.sort((a, b) => a.y - b.y || a.x - b.x);

  let output = "";
  let cursorX = -1;
  let cursorY = -1;
  let currentStyle: Style | null = null;

  for (const { x, y, cell } of changes) {
    // Skip continuation cells
    if (cell.continuation) continue;

    // Move cursor if needed (cursor must be exactly at target position)
    if (y !== cursorY || x !== cursorX) {
      // Use \r\n optimization only if cursor is initialized AND we're moving
      // to the next line at column 0. Don't use it when cursorY is -1
      // (uninitialized) because that would incorrectly emit a newline at start.
      // Bug km-x7ih: This was causing the first row to appear at the bottom.
      if (cursorY >= 0 && y === cursorY + 1 && x === 0) {
        // Next line at column 0, use newline (more efficient)
        output += "\r\n";
      } else {
        // Absolute position (1-indexed)
        output += `\x1b[${y + 1};${x + 1}H`;
      }
    }

    // Update style if changed
    const cellStyle: Style = { fg: cell.fg, bg: cell.bg, attrs: cell.attrs };
    if (!styleEquals(currentStyle, cellStyle)) {
      output += styleToAnsi(cellStyle);
      currentStyle = cellStyle;
    }

    // Write character
    output += cell.char;
    cursorX = x + (cell.wide ? 2 : 1);
    cursorY = y;
  }

  // Reset style at end
  if (currentStyle) {
    output += "\x1b[0m";
  }

  return output;
}

/**
 * Convert style to ANSI escape sequence.
 */
function styleToAnsi(style: Style): string {
  const codes: number[] = [0]; // Reset first

  // Foreground color
  if (style.fg !== null) {
    const fgCode = colorToAnsiFg(style.fg);
    if (fgCode) codes.push(...fgCode);
  }

  // Background color
  if (style.bg !== null) {
    const bgCode = colorToAnsiBg(style.bg);
    if (bgCode) codes.push(...bgCode);
  }

  // Attributes
  if (style.attrs.bold) codes.push(1);
  if (style.attrs.dim) codes.push(2);
  if (style.attrs.italic) codes.push(3);
  if (style.attrs.underline) codes.push(4);
  if (style.attrs.inverse) codes.push(7);
  if (style.attrs.strikethrough) codes.push(9);

  return `\x1b[${codes.join(";")}m`;
}

/**
 * Convert color to ANSI foreground codes.
 */
function colorToAnsiFg(color: Color): number[] | null {
  if (color === null) return null;

  if (typeof color === "number") {
    // 256-color
    return [38, 5, color];
  }

  // True color
  return [38, 2, color.r, color.g, color.b];
}

/**
 * Convert color to ANSI background codes.
 */
function colorToAnsiBg(color: Color): number[] | null {
  if (color === null) return null;

  if (typeof color === "number") {
    // 256-color
    return [48, 5, color];
  }

  // True color
  return [48, 2, color.r, color.g, color.b];
}
