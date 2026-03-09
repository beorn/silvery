# Text Cursor Utilities

Pure functions for mapping between flat character offsets and visual (row, col) positions in word-wrapped text. Layer 0 of the text editing architecture.

## Why This Exists

Terminal text editors face a fundamental alignment problem: the cursor position in the underlying text (a flat offset) doesn't correspond to what the user sees on screen after word wrapping. A character at offset 45 might be on visual line 3, column 5 -- but only if you use the _same_ wrapping algorithm as the renderer.

The text-cursor module solves this by using `wrapText()` from `unicode.ts` internally -- the same function the silvery rendering pipeline uses, with matching `trim=true` behavior. This guarantees cursor positions always match what's displayed on screen. The trim parameter is critical: the renderer trims trailing spaces at word-wrap break points and leading spaces on continuation lines. Without matching trim behavior, cursor offsets drift from visual positions on wrapped text.

## Architecture

text-cursor is **Layer 0** of a 4-layer text editing stack inspired by the web's [EditContext API](https://developer.mozilla.org/en-US/docs/Web/API/EditContext_API):

| Layer | Module           | What It Does                                  | Status                        |
| ----- | ---------------- | --------------------------------------------- | ----------------------------- |
| 0     | `text-cursor.ts` | Pure functions: offset ↔ visual position      | Available                     |
| 1     | `useTextEdit()`  | Hook: text state + cursor nav + stickyX       | Planned                       |
| 2     | `EditableText`   | Component: renders wrapped text with cursor   | Planned                       |
| 3     | `TextArea`       | Full widget: EditableText + scroll + useInput | Existing (will be refactored) |

Each layer builds on the one below. Layer 0 has no state, no hooks, no React dependency -- just pure functions. This means you can use it with any state management approach (Slate, Zustand, custom hooks, etc.).

## API Reference

All functions are exported from `silvery`:

```ts
import {
  cursorToRowCol,
  getWrappedLines,
  rowColToCursor,
  cursorMoveUp,
  cursorMoveDown,
  countVisualLines,
} from "@silvery/term"
import type { WrappedLine } from "@silvery/term"
```

---

### cursorToRowCol(text, cursor, wrapWidth)

Convert a flat cursor offset to a visual (row, col) position in word-wrapped text.

```ts
function cursorToRowCol(text: string, cursor: number, wrapWidth: number): { row: number; col: number }
```

```ts
// Single line, no wrapping needed
cursorToRowCol("hello world", 5, 80)
// { row: 0, col: 5 }

// Text wraps at width 8: "hello wo" / "rld"
cursorToRowCol("hello world", 9, 8)
// { row: 1, col: 1 } — "r" is col 1 on visual line 1

// Multi-line text
cursorToRowCol("first\nsecond", 8, 80)
// { row: 1, col: 2 } — "c" in "second"
```

---

### getWrappedLines(text, wrapWidth)

Get all wrapped display lines with their starting character offsets.

```ts
function getWrappedLines(text: string, wrapWidth: number): WrappedLine[]
```

```ts
interface WrappedLine {
  line: string // Text content of this visual line
  startOffset: number // Offset in the original text where this line starts
}
```

```ts
getWrappedLines("hello world", 8)
// [
//   { line: "hello wo", startOffset: 0 },
//   { line: "rld",      startOffset: 8 },
// ]

getWrappedLines("first\nsecond", 80)
// [
//   { line: "first",  startOffset: 0 },
//   { line: "second", startOffset: 6 },
// ]
```

The `startOffset` enables converting a (row, col) back to a flat offset: `offset = lines[row].startOffset + col`.

---

### rowColToCursor(text, row, col, wrapWidth)

Convert a visual (row, col) to a flat cursor offset. Clamps `col` to the line length if it exceeds it (important for stickyX on short lines).

```ts
function rowColToCursor(text: string, row: number, col: number, wrapWidth: number): number
```

```ts
rowColToCursor("hello world", 0, 5, 80)
// 5

// Col exceeds line length — clamps to end
rowColToCursor("hi\nbye", 0, 10, 80)
// 2 (clamped to end of "hi")
```

---

### cursorMoveUp(text, cursor, wrapWidth, stickyX?)

Move the cursor up one visual line. Returns the new cursor offset, or `null` if already on the first visual line.

```ts
function cursorMoveUp(text: string, cursor: number, wrapWidth: number, stickyX?: number): number | null
```

```ts
// Move up from second line to first
cursorMoveUp("hello\nworld", 8, 80)
// 2 — moved from col 2 in "world" to col 2 in "hello"

// Already on first line — returns null (boundary)
cursorMoveUp("hello\nworld", 2, 80)
// null
```

Returns `null` at the boundary to signal the caller should handle cross-block navigation (e.g., moving to the previous text block in a document editor).

---

### cursorMoveDown(text, cursor, wrapWidth, stickyX?)

Move the cursor down one visual line. Returns the new cursor offset, or `null` if already on the last visual line.

```ts
function cursorMoveDown(text: string, cursor: number, wrapWidth: number, stickyX?: number): number | null
```

```ts
// Move down from first line to second
cursorMoveDown("hello\nworld", 3, 80)
// 9 — moved from col 3 in "hello" to col 3 in "world"

// Already on last line — returns null (boundary)
cursorMoveDown("hello\nworld", 8, 80)
// null
```

---

### countVisualLines(text, wrapWidth)

Count the total number of visual lines after word wrapping.

```ts
function countVisualLines(text: string, wrapWidth: number): number
```

```ts
countVisualLines("hello world", 80)
// 1

countVisualLines("hello world", 8)
// 2 — wraps to "hello wo" / "rld"

countVisualLines("one\ntwo\nthree", 80)
// 3
```

## stickyX Behavior

When navigating vertically through lines of different lengths, the cursor should "remember" its preferred column rather than drifting left on short lines.

Consider this text at width 20:

```
This is a long line..  <- cursor at col 18
short                  <- only 5 chars
Another long line...   <- want cursor at col 18 again
```

Without stickyX, pressing Down from col 18 would clamp to col 5 on "short", then pressing Down again would move to col 5 on the next line -- the cursor drifts left permanently.

With stickyX, the caller preserves the original column:

```ts
const originalCol = 18
const stickyX = originalCol

// Down from "This is a long line.." col 18
const pos1 = cursorMoveDown(text, cursor, 20, stickyX)
// Lands at col 5 (clamped to "short" length), but stickyX=18 is preserved

// Down again from "short"
const pos2 = cursorMoveDown(text, pos1!, 20, stickyX)
// Lands at col 18 on "Another long line..." — stickyX restored
```

The text-cursor functions accept `stickyX` but don't store it -- the caller manages the sticky state. This keeps Layer 0 pure and stateless. Layer 1 (`useTextEdit`, planned) will manage stickyX automatically.

## Common Patterns

### External State Management

Use text-cursor functions with your own state (Slate, Zustand, or plain React state):

```ts
import { cursorToRowCol, cursorMoveDown, cursorMoveUp, countVisualLines } from "@silvery/term"

// In your state manager or hook:
function handleArrowDown(text: string, cursor: number, width: number, stickyX: number) {
  const newCursor = cursorMoveDown(text, cursor, width, stickyX)
  if (newCursor !== null) {
    return { cursor: newCursor, stickyX } // Stay in same block
  }
  // null = boundary — move to next block
  return moveToNextBlock(stickyX)
}
```

### Cross-Block Navigation

The `null` return from `cursorMoveUp` / `cursorMoveDown` signals a boundary. In a block-based editor (like Slate or a markdown document), use this to transition between blocks:

```ts
function handleVerticalMove(direction: "up" | "down", block: Block, cursor: number, width: number, stickyX: number) {
  const moveFn = direction === "up" ? cursorMoveUp : cursorMoveDown
  const newCursor = moveFn(block.text, cursor, width, stickyX)

  if (newCursor !== null) {
    // Stayed within the block
    return { blockId: block.id, cursor: newCursor }
  }

  // Crossed the boundary — move to adjacent block
  const adjacent = direction === "up" ? getPreviousBlock(block.id) : getNextBlock(block.id)

  if (!adjacent) return null // No adjacent block

  // Enter adjacent block at the correct visual position
  const lines = countVisualLines(adjacent.text, width)
  const targetRow = direction === "up" ? lines - 1 : 0
  const newOffset = rowColToCursor(adjacent.text, targetRow, stickyX, width)

  return { blockId: adjacent.id, cursor: newOffset }
}
```

### Rendering a Cursor Indicator

Use `cursorToRowCol` to position a cursor overlay in your component:

```tsx
function TextWithCursor({ text, cursor, width }: Props) {
  const { row, col } = cursorToRowCol(text, cursor, width)
  const lines = getWrappedLines(text, width)

  return (
    <Box flexDirection="column">
      {lines.map((wl, i) => (
        <Text key={i}>{i === row ? wl.line.slice(0, col) + "|" + wl.line.slice(col) : wl.line}</Text>
      ))}
    </Box>
  )
}
```
