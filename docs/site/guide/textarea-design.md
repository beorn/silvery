# TextArea Component Design

This document describes the TextArea component in silvery. The core component is implemented and shipped, with some advanced features still planned.

## Overview

TextArea provides multi-line text editing in terminal applications. It combines:

- Multi-line text input with cursor navigation
- Line wrapping behavior
- Vertical scrolling when content exceeds visible area
- Text selection (always enabled)

```tsx
import { TextArea } from "@silvery/term"

function App() {
  const [value, setValue] = useState("")

  return <TextArea value={value} onChange={setValue} height={5} placeholder="Type your message..." />
}
```

## Motivation

### Why Not Single-Line TextInput?

Single-line input is sufficient for simple prompts, but many applications need:

- **Chat interfaces** - Message composition with multi-line support
- **Code editors** - Editing multi-line snippets
- **Note taking** - Free-form text entry
- **Configuration editors** - Multi-line config values

Ink users have requested this ([#676](https://github.com/vadimdemedes/ink/issues/676)) but Ink's architecture makes it difficult. silvery's `useContentRect()` provides the dimension awareness needed to implement TextArea properly.

### Challenges in Terminal

Unlike web text inputs, terminal TextArea must handle:

1. **No native widget** - Must render character-by-character
2. **Double-width characters** - CJK characters occupy 2 cells
3. **Cursor positioning** - Manual ANSI escape sequences
4. **Line wrapping** - Must calculate wrap points ourselves
5. **Scrolling** - Content can exceed visible area
6. **Input handling** - Raw terminal keypresses, no clipboard API

## API

```typescript
interface TextAreaProps {
  /** Current value (controlled) */
  value?: string
  /** Initial value (uncontrolled) */
  defaultValue?: string
  /** Called when value changes */
  onChange?: (value: string) => void
  /** Called on submit (Ctrl+Enter by default, or Enter if submitKey="enter") */
  onSubmit?: (value: string) => void
  /** Key to trigger submit: "ctrl+enter" (default), "enter", or "meta+enter" */
  submitKey?: "ctrl+enter" | "enter" | "meta+enter"
  /** Placeholder text when empty */
  placeholder?: string
  /** Whether input is focused/active (overrides focus system) */
  isActive?: boolean
  /** Visible height in rows (required) */
  height: number
  /** Cursor style: 'block' (inverse) or 'underline' */
  cursorStyle?: "block" | "underline"
  /** Number of context lines to keep visible above/below cursor when scrolling (default: 1) */
  scrollMargin?: number
  /** When true, ignore all input and dim the text */
  disabled?: boolean
  /** Maximum number of characters allowed */
  maxLength?: number
  /** Test ID for focus system identification */
  testID?: string
}
```

### Minimal Example

```tsx
const [text, setText] = useState("")

;<TextArea value={text} onChange={setText} height={5} />
```

### Chat Input Example

```tsx
const [message, setMessage] = useState("")

;<TextArea
  value={message}
  onChange={setMessage}
  height={3}
  placeholder="Type a message..."
  submitKey="enter"
  onSubmit={(msg) => {
    sendMessage(msg)
    setMessage("")
  }}
/>
```

Note: `submitKey="enter"` means Enter submits, Shift+Enter inserts newline. This is the chat convention.

### Code Editor Example

```tsx
const [code, setCode] = useState("")

;<TextArea value={code} onChange={setCode} height={10} submitKey="ctrl+enter" />
```

## Visual Design

### Basic Layout

```
+------------------------------------------+
| Hello world                              |  <- Line 1
| This is a multi-line█text area          |  <- Line 2 (cursor shown as block)
| with content that spans multiple         |  <- Line 3
| lines.                                   |  <- Line 4
|                                          |  <- Line 5 (empty, within height)
+------------------------------------------+
```

### With Placeholder (Empty State)

```
+------------------------------------------+
| Type your message...                     |  <- Placeholder (dimmed)
|                                          |
|                                          |
+------------------------------------------+
```

### With Scrolling

When content exceeds visible height, scroll indicators appear:

```
+------------------------------------------+
| ▲ 2 lines above                          |  <- Scroll indicator
| visible line 3                           |
| visible line 4█                          |  <- Cursor on this line
| visible line 5                           |
| ▼ 3 lines below                          |  <- Scroll indicator
+------------------------------------------+
```

### With Selection

When selection is enabled:

```
+------------------------------------------+
| Hello world                              |
| This is a [multi-line] text area        |  <- Selected text in inverse
| with content that spans multiple         |
+------------------------------------------+
```

Selection uses inverse video (swap foreground/background) to match terminal conventions.

### Focus States

```
Focused:
+------------------------------------------+
| Hello█world                              |  <- Cursor visible
+------------------------------------------+

Unfocused:
+------------------------------------------+
| Hello world                              |  <- No cursor
+------------------------------------------+

Disabled:
+------------------------------------------+
| Hello world                              |  <- Dimmed text
+------------------------------------------+
```

## Cursor Model

### Position Representation

```typescript
interface CursorPosition {
  /** Line index (0-based) */
  line: number

  /** Column index (0-based, in grapheme clusters) */
  column: number
}
```

**Important**: Column is measured in grapheme clusters, not bytes or code points.

```
Text: "Hello 世界"
       0123456789  <- visual columns

Cursor at column 6 is before "世"
Cursor at column 7 is before "界" (not between bytes of "世")
```

### Cursor vs Selection

TextArea always supports text selection:

- Track both anchor and cursor
- Shift+arrows extend selection
- Selection is `{ anchor: CursorPosition, cursor: CursorPosition }`
- When no selection is active, `selectionAnchor` is `null`

### Cursor Movement

| Key        | Action                            |
| ---------- | --------------------------------- |
| Left       | Move left one grapheme            |
| Right      | Move right one grapheme           |
| Up         | Move to same column in line above |
| Down       | Move to same column in line below |
| Home       | Move to start of line             |
| End        | Move to end of line               |
| Ctrl+Home  | Move to start of document         |
| Ctrl+End   | Move to end of document           |
| Ctrl+Left  | Move to previous word boundary    |
| Ctrl+Right | Move to next word boundary        |

Add Shift to any navigation key to extend selection.

### Column Memory

When moving vertically, the cursor "remembers" its target column:

```
Line 1: "Short"
Line 2: "This is a longer line"
Line 3: "Hi"

Starting at end of Line 2 (column 21):
  - Press Up -> moves to column 5 (end of Line 1)
  - Press Down -> returns to column 21 (Line 2)
  - Press Down -> moves to column 2 (end of Line 3)
  - Press Up -> returns to column 21 (Line 2)  <- remembered!
```

This matches behavior in most text editors.

## Line Wrapping

### Soft Wrap vs Hard Wrap

TextArea uses **soft wrap** (visual only):

- Long lines wrap visually to fit width
- No newline characters inserted
- Original text preserved exactly

```
Input: "This is a very long line that exceeds the width"
Width: 20

Display:
"This is a very long "  <- visual line 1
"line that exceeds th"  <- visual line 2 (wrapped)
"e width"               <- visual line 3 (wrapped)

Stored: "This is a very long line that exceeds the width" (unchanged)
```

### Wrap Points

Wrapping prefers breaking at:

1. Whitespace (space, tab)
2. After punctuation
3. After CJK characters (which can break anywhere)
4. Anywhere (last resort)

```typescript
function findWrapPoint(line: string, width: number): number {
  // 1. If line fits, no wrap needed
  if (visualWidth(line) <= width) return line.length

  // 2. Find last breakable point within width
  let lastBreak = -1
  let currentWidth = 0

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const charWidth = getCharWidth(char)

    if (currentWidth + charWidth > width) {
      // Would exceed width
      return lastBreak >= 0 ? lastBreak + 1 : i
    }

    currentWidth += charWidth

    // Track break opportunities
    if (isWhitespace(char) || isPunctuation(char) || isCJK(char)) {
      lastBreak = i
    }
  }

  return line.length
}
```

### Wrapped Line Navigation

Arrow keys navigate visual lines, not logical lines:

```
Logical line: "Hello world this is wrapped"
Visual:
  "Hello world "     <- visual line 0
  "this is wrapped"  <- visual line 1

Cursor at end of "world":
  - Press Down -> moves to "wrapped" (visual line 1)
  - Press Up -> moves back to "world" (visual line 0)
```

## Scrolling Behavior

### Scroll State

```typescript
interface ScrollState {
  /** First visible line (0-based) */
  scrollTop: number
}
```

### Auto-Scroll on Cursor Move

The viewport follows the cursor:

```typescript
function adjustScroll(cursor: CursorPosition, scrollTop: number, visibleLines: number): number {
  const cursorLine = cursor.line

  // Cursor above viewport
  if (cursorLine < scrollTop) {
    return cursorLine
  }

  // Cursor below viewport
  if (cursorLine >= scrollTop + visibleLines) {
    return cursorLine - visibleLines + 1
  }

  // Cursor visible, no change
  return scrollTop
}
```

### Scroll Margin

Optional padding to keep cursor away from edges:

```typescript
const SCROLL_MARGIN = 1 // Keep 1 line of context

// Scroll when cursor is within margin of edge
if (cursorLine < scrollTop + SCROLL_MARGIN) {
  scrollTop = Math.max(0, cursorLine - SCROLL_MARGIN)
}
if (cursorLine >= scrollTop + visibleLines - SCROLL_MARGIN) {
  scrollTop = cursorLine - visibleLines + SCROLL_MARGIN + 1
}
```

## Text Editing Operations

### Insert Character

```typescript
function insertChar(value: string, cursor: CursorPosition, char: string): { value: string; cursor: CursorPosition } {
  const offset = positionToOffset(value, cursor)
  const newValue = value.slice(0, offset) + char + value.slice(offset)

  return {
    value: newValue,
    cursor: { line: cursor.line, column: cursor.column + 1 },
  }
}
```

### Insert Newline

```typescript
function insertNewline(value: string, cursor: CursorPosition): { value: string; cursor: CursorPosition } {
  const offset = positionToOffset(value, cursor)
  const newValue = value.slice(0, offset) + "\n" + value.slice(offset)

  return {
    value: newValue,
    cursor: { line: cursor.line + 1, column: 0 },
  }
}
```

### Delete Character (Backspace)

```typescript
function deleteBackward(value: string, cursor: CursorPosition): { value: string; cursor: CursorPosition } {
  if (cursor.line === 0 && cursor.column === 0) {
    return { value, cursor } // Nothing to delete
  }

  const offset = positionToOffset(value, cursor)
  const prevGrapheme = getPreviousGrapheme(value, offset)
  const newValue = value.slice(0, offset - prevGrapheme.length) + value.slice(offset)

  // Calculate new cursor position
  const newCursor =
    cursor.column > 0
      ? { line: cursor.line, column: cursor.column - 1 }
      : {
          line: cursor.line - 1,
          column: getLineLength(value, cursor.line - 1),
        }

  return { value: newValue, cursor: newCursor }
}
```

### Delete Forward

```typescript
function deleteForward(value: string, cursor: CursorPosition): { value: string; cursor: CursorPosition } {
  const offset = positionToOffset(value, cursor)
  if (offset >= value.length) {
    return { value, cursor } // Nothing to delete
  }

  const nextGrapheme = getNextGrapheme(value, offset)
  const newValue = value.slice(0, offset) + value.slice(offset + nextGrapheme.length)

  return { value: newValue, cursor } // Cursor stays in place
}
```

## Selection Operations

Selection is always available:

### Extend Selection

```typescript
function extendSelection(selection: Selection, direction: "left" | "right" | "up" | "down"): Selection {
  // Anchor stays fixed, cursor moves
  return {
    anchor: selection.anchor,
    cursor: moveCursor(selection.cursor, direction),
  }
}
```

### Delete Selection

```typescript
function deleteSelection(value: string, selection: Selection): { value: string; cursor: CursorPosition } {
  const [start, end] = normalizeSelection(selection)
  const startOffset = positionToOffset(value, start)
  const endOffset = positionToOffset(value, end)

  return {
    value: value.slice(0, startOffset) + value.slice(endOffset),
    cursor: start,
  }
}
```

### Select All (Ctrl+A)

```typescript
function selectAll(value: string): Selection {
  return {
    anchor: { line: 0, column: 0 },
    cursor: getEndPosition(value),
  }
}
```

## Key Bindings

### Standard Editing

| Key       | Action                     |
| --------- | -------------------------- |
| Printable | Insert character at cursor |
| Enter     | Insert newline OR submit   |
| Backspace | Delete character before    |
| Delete    | Delete character after     |
| Tab       | Insert tab OR focus next   |

### Navigation

| Key        | Action                 |
| ---------- | ---------------------- |
| Arrows     | Move cursor            |
| Home       | Start of line          |
| End        | End of line            |
| Ctrl+Home  | Start of document      |
| Ctrl+End   | End of document        |
| Ctrl+Arrow | Word-wise movement     |
| Page Up    | Scroll up one screen   |
| Page Down  | Scroll down one screen |

### Selection

| Key            | Action               |
| -------------- | -------------------- |
| Shift+Arrow    | Extend selection     |
| Shift+Home     | Select to line start |
| Shift+End      | Select to line end   |
| Ctrl+A         | Select all           |
| Ctrl+Shift+Arr | Select word-wise     |

### Submit Behavior

The `submitKey` prop controls Enter behavior:

| submitKey      | Enter   | Shift+Enter | Ctrl+Enter |
| -------------- | ------- | ----------- | ---------- |
| `"enter"`      | Submit  | Newline     | Newline    |
| `"ctrl+enter"` | Newline | Newline     | Submit     |
| `"meta+enter"` | Newline | Newline     | Newline    |

Note: `meta+enter` requires the [Kitty keyboard protocol](/guide/kitty-protocol) since legacy ANSI cannot encode Meta+Enter. The terminal sends `CSI 13;3u` which silvery parses into `key.return + key.meta`.

## CJK and Unicode Handling

### Character Width

```typescript
// Use string-width or similar library
import stringWidth from "string-width"

function getCharWidth(char: string): number {
  return stringWidth(char) // Returns 1 or 2
}
```

### Grapheme Clusters

Use a grapheme splitter to handle:

- Emoji with ZWJ (e.g., family emoji)
- Combining characters
- Regional indicators (flags)

```typescript
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function splitGraphemes(text: string): string[] {
  return [...segmenter.segment(text)].map((s) => s.segment)
}
```

### Cursor in Wide Characters

The cursor should never land "inside" a wide character:

```
Text: "Hello世界"
       012345678  <- cursor positions

Valid: 0,1,2,3,4,5,6,8 (after 世, after 界)
Invalid: 7 (would be "inside" 世)
```

## State Management

### Internal State

```typescript
interface TextAreaState {
  // Cursor position (always tracked)
  cursor: CursorPosition

  // Selection anchor (only when selection enabled and active)
  selectionAnchor: CursorPosition | null

  // Scroll position
  scrollTop: number

  // Column memory for vertical movement
  targetColumn: number

  // Focus state
  isFocused: boolean
}
```

### Hook Architecture

TextArea can be built with a custom hook for flexibility:

```typescript
interface UseTextAreaOptions {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  submitKey?: "ctrl+enter" | "meta+enter" | "enter"
}

interface UseTextAreaReturn {
  // Computed from value
  lines: string[]
  visualLines: VisualLine[]

  // Cursor/selection state
  cursor: CursorPosition
  selection: Selection | null

  // Scroll state
  scrollTop: number

  // Event handlers
  handleInput: (input: string, key: Key) => void

  // Imperative API
  moveCursor: (direction: Direction) => void
  selectAll: () => void
}

function useTextArea(options: UseTextAreaOptions): UseTextAreaReturn
```

This allows building custom TextArea variants while reusing the core logic.

## Integration with useContentRect

TextArea benefits from silvery's `useContentRect()`:

```tsx
function TextArea({ value, onChange, height = 3 }: TextAreaProps) {
  const { width } = useContentRect()

  // Calculate visible lines based on actual width
  const visualLines = useMemo(() => wrapText(value, width), [value, width])

  return (
    <Box flexDirection="column" height={height}>
      {visualLines.slice(scrollTop, scrollTop + height).map((line, i) => (
        <Text key={i}>{renderLine(line, cursor, selection)}</Text>
      ))}
    </Box>
  )
}
```

Without `useContentRect()`, we'd need to thread width props down, complicating the API.

## Rendering Pipeline

### 1. Split into Lines

```typescript
const lines = value.split("\n")
```

### 2. Wrap Lines

```typescript
const visualLines = lines.flatMap((line) => wrapLine(line, width))
```

### 3. Slice to Viewport

```typescript
const visibleLines = visualLines.slice(scrollTop, scrollTop + height)
```

### 4. Render Each Line

```typescript
function renderLine(line: string, cursor: CursorPosition, selection: Selection | null, lineIndex: number): string {
  let result = ""

  for (let col = 0; col < line.length; col++) {
    const char = line[col]
    const isUnderCursor = lineIndex === cursor.line && col === cursor.column
    const isSelected = selection && isInSelection(lineIndex, col, selection)

    if (isUnderCursor) {
      result += chalk.inverse(char || " ")
    } else if (isSelected) {
      result += chalk.inverse(char)
    } else {
      result += char
    }
  }

  // Render cursor at end of line if needed
  if (lineIndex === cursor.line && cursor.column === line.length) {
    result += chalk.inverse(" ")
  }

  return result
}
```

## Accessibility

### Screen Reader Support

TextArea should announce:

- Current line/column position
- Selected text range
- Error states

```typescript
// Use ARIA live regions via Static output
<Static items={announcements}>
  {(msg) => <Text>{msg}</Text>}
</Static>
```

### Keyboard-Only Operation

All functionality accessible via keyboard. No mouse-only features.

## Performance Considerations

### Large Documents

For documents with 1000+ lines:

- Only wrap visible lines + buffer
- Debounce onChange during rapid typing
- Consider virtual scrolling for extreme cases

### Rapid Input

Use requestAnimationFrame/setImmediate to batch updates:

```typescript
function handleInput(char: string) {
  pendingInput += char
  if (!rafScheduled) {
    rafScheduled = true
    setImmediate(() => {
      flushInput()
      rafScheduled = false
    })
  }
}
```

## Future Enhancements

### Clipboard Support

Terminal clipboard is complex (OSC 52). Initial version may omit cut/copy/paste.

### Undo/Redo

Stack-based undo with coalescing for typed sequences.

### Syntax Highlighting

Could integrate with tree-sitter or highlight.js for code editing.

### IME Support

Composition window positioning for CJK input methods. Requires terminal-specific handling.

## Implementation Status

All core phases are implemented and shipped:

- **Phase 1** (shipped): Basic multi-line editing — insert/delete, cursor movement (arrows, Home, End, Ctrl+Home, Ctrl+End), soft wrapping, scrolling
- **Phase 2** (shipped): Word-wise movement, column memory, scroll margin (`scrollMargin` prop), placeholder text, disabled state, maxLength
- **Phase 3** (shipped): Text selection — Shift+Arrow, Shift+Home/End, Ctrl+A (select all), delete/replace selection on type

Remaining planned features:

- Clipboard (OSC 52)
- Undo/redo
- IME improvements

## References

- [Ink #676](https://github.com/vadimdemedes/ink/issues/676) - Multi-line input request
- [Ink #251](https://github.com/vadimdemedes/ink/issues/251) - Cursor support
- [Textual Input Widget](https://textual.textualize.io/widgets/input/) - Python TUI implementation
- [ProseMirror](https://prosemirror.net/) - Web editor architecture (selection model inspiration)
- [string-width](https://github.com/sindresorhus/string-width) - Character width calculation
- [Intl.Segmenter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter) - Built-in grapheme cluster splitting
