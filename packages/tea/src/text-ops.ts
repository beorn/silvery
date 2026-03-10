/**
 * Text Operations -- invertible, composable text mutations.
 *
 * Every text change produces a TextOp that can be inverted (for undo)
 * and composed (for merging consecutive typing). Foundation for
 * operations-based undo/redo without document snapshots.
 *
 * Architecture layer 0 -- no state, no hooks, no components.
 *
 * @example
 * ```ts
 * import { applyTextOp, invertTextOp, mergeTextOps } from '@silvery/react'
 *
 * const op: TextOp = { type: "insert", offset: 5, text: "hello" }
 * const result = applyTextOp("world", op)  // "worlhellod"
 * const inv = invertTextOp(op)             // { type: "delete", offset: 5, text: "hello" }
 * ```
 */

// =============================================================================
// Types
// =============================================================================

/**
 * An invertible text operation.
 *
 * - `insert`: text was inserted at `offset`
 * - `delete`: text was deleted starting at `offset` (the deleted content is
 *   stored in `text` so the operation can be inverted)
 */
export type TextOp =
  | { type: "insert"; offset: number; text: string }
  | { type: "delete"; offset: number; text: string };

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Apply a text operation to a string, returning the modified string.
 *
 * Throws if the offset is out of bounds or if a delete operation's stored
 * text doesn't match what's actually in the string at that position.
 */
export function applyTextOp(text: string, op: TextOp): string {
  if (op.offset < 0 || op.offset > text.length) {
    throw new RangeError(
      `TextOp offset ${op.offset} out of bounds for text of length ${text.length}`,
    );
  }

  if (op.type === "insert") {
    return text.slice(0, op.offset) + op.text + text.slice(op.offset);
  }

  // delete
  const end = op.offset + op.text.length;
  if (end > text.length) {
    throw new RangeError(
      `TextOp delete extends past end: offset=${op.offset}, deleteLen=${op.text.length}, textLen=${text.length}`,
    );
  }
  const actual = text.slice(op.offset, end);
  if (actual !== op.text) {
    throw new Error(
      `TextOp delete mismatch at offset ${op.offset}: expected ${JSON.stringify(op.text)}, got ${JSON.stringify(actual)}`,
    );
  }
  return text.slice(0, op.offset) + text.slice(end);
}

/**
 * Invert a text operation (insert becomes delete and vice versa).
 *
 * The inverse of an insert at offset N is a delete of the same text at
 * offset N; the inverse of a delete is an insert.
 */
export function invertTextOp(op: TextOp): TextOp {
  if (op.type === "insert") {
    return { type: "delete", offset: op.offset, text: op.text };
  }
  return { type: "insert", offset: op.offset, text: op.text };
}

/**
 * Attempt to merge two consecutive text operations into one.
 *
 * Returns the merged operation, or `null` if the operations can't be merged.
 *
 * Merge rules:
 * - Two inserts where `b` starts exactly where `a` ends -> single insert
 * - Two deletes where `b` ends exactly where `a` starts (backspace sequence)
 *   -> single delete covering both ranges
 * - Two deletes where `b` starts at `a`'s offset (forward-delete sequence)
 *   -> single delete covering both ranges
 * - Otherwise -> null (can't merge)
 */
export function mergeTextOps(a: TextOp, b: TextOp): TextOp | null {
  // insert + insert: b inserts right after a's inserted text
  if (a.type === "insert" && b.type === "insert") {
    if (b.offset === a.offset + a.text.length) {
      return { type: "insert", offset: a.offset, text: a.text + b.text };
    }
    return null;
  }

  // delete + delete
  if (a.type === "delete" && b.type === "delete") {
    // Backspace sequence: b deletes the character just before a's range.
    // After a deletes at offset X, the next backspace deletes at offset X-1.
    if (b.offset + b.text.length === a.offset) {
      return { type: "delete", offset: b.offset, text: b.text + a.text };
    }
    // Forward-delete sequence: b deletes at the same position as a (because
    // after a removed its text, the next character slid into the same offset).
    if (b.offset === a.offset) {
      return { type: "delete", offset: a.offset, text: a.text + b.text };
    }
    return null;
  }

  // insert + delete that exactly cancels the insert
  if (a.type === "insert" && b.type === "delete") {
    if (b.offset === a.offset && b.text === a.text) {
      return null; // operations cancel out
    }
  }

  return null;
}
