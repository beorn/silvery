/**
 * Terminal Edit Context
 *
 * W3C EditContext-aligned interface for terminal text editing.
 * Factory function returns a plain object -- no class, per km principles.
 *
 * Uses text-cursor.ts for all cursor <-> visual position math.
 * Uses text-ops.ts for invertible text operations.
 *
 * Architecture layer 1 -- stateful, but no hooks, no components.
 *
 * @example
 * ```ts
 * import { createTermEditContext } from '@silvery/react'
 *
 * using ctx = createTermEditContext({ text: "hello world", wrapWidth: 40 })
 * ctx.onTextUpdate((op) => undoStack.push(op))
 *
 * ctx.insertChar("!")          // "hello world!"
 * ctx.moveCursor("left")       // cursor before "!"
 * ctx.deleteForward()          // "hello world"
 * ```
 */

import {
  cursorToRowCol,
  cursorMoveUp,
  cursorMoveDown,
  getWrappedLines,
  countVisualLines,
} from "@silvery/tea/text-cursor"
import type { TextOp } from "@silvery/tea/text-ops"

// =============================================================================
// Types
// =============================================================================

/** Platform-agnostic text editing contract, aligned with W3C EditContext. */
export interface EditContextLike {
  /** Current text content (readonly -- mutate via updateText). */
  readonly text: string
  /** Start of the selection range (or cursor position if no selection). */
  readonly selectionStart: number
  /** End of the selection range (equals selectionStart when no selection). */
  readonly selectionEnd: number

  /**
   * Replace text in [rangeStart, rangeEnd) with newText.
   * Adjusts selection if it falls within the affected range.
   * Returns the TextOp describing the mutation (for undo).
   */
  updateText(rangeStart: number, rangeEnd: number, newText: string): TextOp

  /** Move the selection/cursor. If end is omitted, collapses to a caret. */
  updateSelection(start: number, end?: number): void

  /** Subscribe to text mutations. Returns an unsubscribe function. */
  onTextUpdate(handler: (op: TextOp) => void): () => void

  /** Subscribe to selection changes. Returns an unsubscribe function. */
  onSelectionChange(handler: (start: number, end: number) => void): () => void
}

/** Terminal-specific extensions over EditContextLike. */
export interface TermEditContext extends EditContextLike {
  /** Current wrap width for visual line calculations. */
  readonly wrapWidth: number

  /**
   * Sticky column for vertical cursor movement. Set when the cursor moves
   * up/down, cleared on horizontal movement. Allows the cursor to return
   * to its preferred column when moving through lines of varying length.
   */
  readonly stickyX: number | null

  /**
   * Move the cursor one step in the given direction.
   * Returns false if the cursor is already at the boundary (first/last
   * visual line for up/down, position 0/end for left/right).
   */
  moveCursor(direction: "up" | "down" | "left" | "right"): boolean

  /**
   * Check whether the cursor is at the boundary in the given direction.
   * "up" = cursor is on the first visual line.
   * "down" = cursor is on the last visual line.
   */
  atBoundary(direction: "up" | "down"): boolean

  /** Insert a character (or string) at the current cursor position. */
  insertChar(char: string): TextOp

  /** Delete one character before the cursor. Null if at position 0. */
  deleteBackward(): TextOp | null

  /** Delete one character after the cursor. Null if at end of text. */
  deleteForward(): TextOp | null

  /** Delete the word before the cursor. Null if at position 0. */
  deleteWord(): TextOp | null

  /** Delete from cursor to start of the current visual line. Null if at line start. */
  deleteToStart(): TextOp | null

  /** Delete from cursor to end of the current visual line. Null if at line end. */
  deleteToEnd(): TextOp | null

  /** Get the current text content. */
  getContent(): string

  /** Get the cursor offset (alias for selectionStart). */
  getCursorOffset(): number

  /** Set the cursor offset (collapses selection). */
  setCursorOffset(offset: number): void

  /** Count of visual lines after word wrapping. */
  getVisualLineCount(): number

  /** Cursor position as visual (row, col). */
  getCursorRowCol(): { row: number; col: number }

  /** Update the wrap width (e.g., on terminal resize). */
  setWrapWidth(width: number): void

  /** Cleanup: clears all subscriber arrays. */
  [Symbol.dispose](): void
}

/** Options for createTermEditContext. */
export interface TermEditContextOptions {
  /** Initial text content. Defaults to "". */
  text?: string
  /** Initial selection start. Defaults to 0. */
  selectionStart?: number
  /** Initial selection end. Defaults to selectionStart. */
  selectionEnd?: number
  /** Wrap width for visual line calculations. Defaults to 80. */
  wrapWidth?: number
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a terminal edit context.
 *
 * Returns a plain TermEditContext object with mutable internal state.
 * All cursor-to-visual-position math delegates to text-cursor.ts.
 */
export function createTermEditContext(options?: TermEditContextOptions): TermEditContext {
  // Internal mutable state
  let _text = options?.text ?? ""
  let _selectionStart = options?.selectionStart ?? 0
  let _selectionEnd = options?.selectionEnd ?? _selectionStart
  let _wrapWidth = options?.wrapWidth ?? 80
  let _stickyX: number | null = null

  // Subscriber arrays
  let _textHandlers: Array<(op: TextOp) => void> = []
  let _selectionHandlers: Array<(start: number, end: number) => void> = []

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function clampOffset(offset: number): number {
    return Math.max(0, Math.min(offset, _text.length))
  }

  function fireTextUpdate(op: TextOp): void {
    for (const handler of _textHandlers) handler(op)
  }

  function fireSelectionChange(): void {
    for (const handler of _selectionHandlers) handler(_selectionStart, _selectionEnd)
  }

  /**
   * Scan backward from offset to find the start of a word-delete range.
   * Skips trailing whitespace, then deletes through word characters.
   */
  function wordDeleteStart(offset: number): number {
    let pos = offset
    // Skip whitespace backward
    while (pos > 0 && isWhitespace(_text[pos - 1]!)) pos--
    // Skip word characters backward
    while (pos > 0 && !isWhitespace(_text[pos - 1]!)) pos--
    return pos
  }

  /**
   * Find the start of the current visual line for the given cursor offset.
   */
  function visualLineStart(offset: number): number {
    const lines = getWrappedLines(_text, _wrapWidth)
    const { row } = cursorToRowCol(_text, offset, _wrapWidth)
    const line = lines[row]
    return line ? line.startOffset : 0
  }

  /**
   * Find the end of the current visual line for the given cursor offset.
   */
  function visualLineEnd(offset: number): number {
    const lines = getWrappedLines(_text, _wrapWidth)
    const { row } = cursorToRowCol(_text, offset, _wrapWidth)
    const line = lines[row]
    if (!line) return _text.length
    return line.startOffset + line.line.length
  }

  // ---------------------------------------------------------------------------
  // EditContextLike implementation
  // ---------------------------------------------------------------------------

  function updateText(rangeStart: number, rangeEnd: number, newText: string): TextOp {
    const start = clampOffset(rangeStart)
    const end = clampOffset(rangeEnd)

    if (start > end) {
      throw new RangeError(`updateText: rangeStart (${start}) > rangeEnd (${end})`)
    }

    const deletedText = _text.slice(start, end)
    _text = _text.slice(0, start) + newText + _text.slice(end)

    // Build the TextOp describing this mutation (for undo).
    let op: TextOp
    if (deletedText.length > 0 && newText.length === 0) {
      op = { type: "delete", offset: start, text: deletedText }
    } else if (deletedText.length === 0 && newText.length > 0) {
      op = { type: "insert", offset: start, text: newText }
    } else {
      // Replace: both deletion and insertion. Use a replace op so that
      // invertTextOp can produce the correct inverse (swap deleted/text).
      op = { type: "replace", offset: start, text: newText, deleted: deletedText }
    }

    // Adjust selection: place cursor at end of inserted text
    _selectionStart = start + newText.length
    _selectionEnd = _selectionStart

    fireTextUpdate(op)
    fireSelectionChange()
    return op
  }

  function updateSelection(start: number, end?: number): void {
    _selectionStart = clampOffset(start)
    _selectionEnd = end !== undefined ? clampOffset(end) : _selectionStart
    fireSelectionChange()
  }

  function onTextUpdate(handler: (op: TextOp) => void): () => void {
    _textHandlers.push(handler)
    return () => {
      _textHandlers = _textHandlers.filter((h) => h !== handler)
    }
  }

  function onSelectionChange(handler: (start: number, end: number) => void): () => void {
    _selectionHandlers.push(handler)
    return () => {
      _selectionHandlers = _selectionHandlers.filter((h) => h !== handler)
    }
  }

  // ---------------------------------------------------------------------------
  // TermEditContext extensions
  // ---------------------------------------------------------------------------

  function moveCursor(direction: "up" | "down" | "left" | "right"): boolean {
    const hasSelection = _selectionStart !== _selectionEnd

    switch (direction) {
      case "left": {
        _stickyX = null
        if (hasSelection) {
          // Collapse to the left edge of the selection
          const left = Math.min(_selectionStart, _selectionEnd)
          _selectionStart = left
          _selectionEnd = left
          fireSelectionChange()
          return true
        }
        if (_selectionStart === 0) return false
        _selectionStart = _selectionStart - 1
        _selectionEnd = _selectionStart
        fireSelectionChange()
        return true
      }
      case "right": {
        _stickyX = null
        if (hasSelection) {
          // Collapse to the right edge of the selection
          const right = Math.max(_selectionStart, _selectionEnd)
          _selectionStart = right
          _selectionEnd = right
          fireSelectionChange()
          return true
        }
        if (_selectionStart >= _text.length) return false
        _selectionStart = _selectionStart + 1
        _selectionEnd = _selectionStart
        fireSelectionChange()
        return true
      }
      case "up": {
        // Collapse selection first, then move up
        if (hasSelection) {
          const left = Math.min(_selectionStart, _selectionEnd)
          _selectionStart = left
          _selectionEnd = left
        }
        if (_stickyX === null) {
          const { col } = cursorToRowCol(_text, _selectionStart, _wrapWidth)
          _stickyX = col
        }
        const next = cursorMoveUp(_text, _selectionStart, _wrapWidth, _stickyX)
        if (next === null) {
          if (hasSelection) fireSelectionChange()
          return false
        }
        _selectionStart = next
        _selectionEnd = next
        fireSelectionChange()
        return true
      }
      case "down": {
        // Collapse selection first, then move down
        if (hasSelection) {
          const right = Math.max(_selectionStart, _selectionEnd)
          _selectionStart = right
          _selectionEnd = right
        }
        if (_stickyX === null) {
          const { col } = cursorToRowCol(_text, _selectionStart, _wrapWidth)
          _stickyX = col
        }
        const next = cursorMoveDown(_text, _selectionStart, _wrapWidth, _stickyX)
        if (next === null) {
          if (hasSelection) fireSelectionChange()
          return false
        }
        _selectionStart = next
        _selectionEnd = next
        fireSelectionChange()
        return true
      }
    }
  }

  function atBoundary(direction: "up" | "down"): boolean {
    if (direction === "up") {
      const { row } = cursorToRowCol(_text, _selectionStart, _wrapWidth)
      return row === 0
    }
    const { row } = cursorToRowCol(_text, _selectionStart, _wrapWidth)
    const totalLines = countVisualLines(_text, _wrapWidth)
    return row >= totalLines - 1
  }

  function insertChar(char: string): TextOp {
    _stickyX = null
    return updateText(_selectionStart, _selectionEnd, char)
  }

  function deleteBackward(): TextOp | null {
    _stickyX = null
    if (_selectionStart !== _selectionEnd) {
      const start = Math.min(_selectionStart, _selectionEnd)
      const end = Math.max(_selectionStart, _selectionEnd)
      return updateText(start, end, "")
    }
    if (_selectionStart === 0) return null
    return updateText(_selectionStart - 1, _selectionStart, "")
  }

  function deleteForward(): TextOp | null {
    _stickyX = null
    if (_selectionStart !== _selectionEnd) {
      const start = Math.min(_selectionStart, _selectionEnd)
      const end = Math.max(_selectionStart, _selectionEnd)
      return updateText(start, end, "")
    }
    if (_selectionStart >= _text.length) return null
    return updateText(_selectionStart, _selectionStart + 1, "")
  }

  function deleteWord(): TextOp | null {
    _stickyX = null
    if (_selectionStart !== _selectionEnd) {
      const start = Math.min(_selectionStart, _selectionEnd)
      const end = Math.max(_selectionStart, _selectionEnd)
      return updateText(start, end, "")
    }
    if (_selectionStart === 0) return null
    const start = wordDeleteStart(_selectionStart)
    if (start === _selectionStart) return null
    return updateText(start, _selectionStart, "")
  }

  function deleteToStart(): TextOp | null {
    _stickyX = null
    if (_selectionStart !== _selectionEnd) {
      const start = Math.min(_selectionStart, _selectionEnd)
      const end = Math.max(_selectionStart, _selectionEnd)
      return updateText(start, end, "")
    }
    const lineStart = visualLineStart(_selectionStart)
    if (lineStart === _selectionStart) return null
    return updateText(lineStart, _selectionStart, "")
  }

  function deleteToEnd(): TextOp | null {
    _stickyX = null
    if (_selectionStart !== _selectionEnd) {
      const start = Math.min(_selectionStart, _selectionEnd)
      const end = Math.max(_selectionStart, _selectionEnd)
      return updateText(start, end, "")
    }
    const lineEnd = visualLineEnd(_selectionStart)
    if (lineEnd === _selectionStart) return null
    return updateText(_selectionStart, lineEnd, "")
  }

  function getContent(): string {
    return _text
  }

  function getCursorOffset(): number {
    return _selectionStart
  }

  function setCursorOffset(offset: number): void {
    _stickyX = null
    updateSelection(offset)
  }

  function getVisualLineCount(): number {
    return countVisualLines(_text, _wrapWidth)
  }

  function getCursorRowCol(): { row: number; col: number } {
    return cursorToRowCol(_text, _selectionStart, _wrapWidth)
  }

  function setWrapWidth(width: number): void {
    if (width <= 0) {
      throw new RangeError(`setWrapWidth: width must be positive, got ${width}`)
    }
    _wrapWidth = width
  }

  function dispose(): void {
    _textHandlers = []
    _selectionHandlers = []
  }

  // ---------------------------------------------------------------------------
  // Return plain object
  // ---------------------------------------------------------------------------

  return {
    get text() {
      return _text
    },
    get selectionStart() {
      return _selectionStart
    },
    get selectionEnd() {
      return _selectionEnd
    },
    get wrapWidth() {
      return _wrapWidth
    },
    get stickyX() {
      return _stickyX
    },

    updateText,
    updateSelection,
    onTextUpdate,
    onSelectionChange,

    moveCursor,
    atBoundary,
    insertChar,
    deleteBackward,
    deleteForward,
    deleteWord,
    deleteToStart,
    deleteToEnd,
    getContent,
    getCursorOffset,
    setCursorOffset,
    getVisualLineCount,
    getCursorRowCol,
    setWrapWidth,

    [Symbol.dispose]: dispose,
  }
}

// =============================================================================
// Helpers (below exports per inverted pyramid)
// =============================================================================

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r"
}
