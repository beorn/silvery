# Cursor API

This document describes the design for `useCursor()` - a hook for managing terminal cursor position and visibility in text input scenarios.

## Overview

Terminal applications with text input (editors, input fields, command lines) need precise control over the cursor. Unlike web browsers where the cursor is managed automatically by `<input>` elements, terminal UIs must explicitly position and style the cursor.

hightea provides two approaches to cursor display:

1. **Rendered cursor** - A character (like `_` or `|`) rendered as part of the UI
2. **Terminal cursor** - The actual blinking cursor controlled via ANSI escape sequences

The `useCursor()` hook manages the terminal cursor using position-based coordinates relative to the component:

```tsx
useCursor({
  col: cursorCol,    // Column offset within component
  row: cursorRow,    // Row offset within component
  visible: isFocused, // Show/hide cursor
  shape: "bar",      // Optional: "block" | "underline" | "bar" | "default"
})
```

## Use Cases

### 1. Single-Line Text Input

A basic text field showing a cursor at the insertion point:

```tsx
function TextInput({ value, onChange }: Props) {
  const { focused } = useFocusable()
  const { cursor, show, hide } = useCursor()

  useEffect(() => {
    focused ? show() : hide()
  }, [focused])

  return (
    <Box>
      <Text>{value}</Text>
      {focused && <Text inverse> </Text>}
    </Box>
  )
}
```

### 2. Multi-Line Text Editor

A text editor where the cursor can be anywhere in a document:

```tsx
function Editor({ lines }: { lines: string[] }) {
  const { x, y } = useContentRect()
  const { cursor, moveTo } = useCursor()
  const [cursorPos, setCursorPos] = useState({ line: 0, col: 0 })

  // Position terminal cursor based on layout + cursor position
  useEffect(() => {
    moveTo(x + cursorPos.col, y + cursorPos.line)
  }, [x, y, cursorPos])

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
    </Box>
  )
}
```

### 3. Command Palette / Search Box

An input field with autocomplete suggestions:

```tsx
function CommandPalette() {
  const [query, setQuery] = useState("")
  const [cursorIndex, setCursorIndex] = useState(0)
  const { focused } = useFocusable()
  const { cursor, setStyle } = useCursor({ style: "bar" })

  // Insert cursor character at position
  const displayValue = useMemo(() => {
    const before = query.slice(0, cursorIndex)
    const after = query.slice(cursorIndex)
    return { before, after }
  }, [query, cursorIndex])

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{displayValue.before}</Text>
        <Text inverse> </Text>
        <Text>{displayValue.after}</Text>
      </Box>
      <Suggestions query={query} />
    </Box>
  )
}
```

## API Design

### CursorState

```typescript
interface CursorState {
  /** Whether the cursor is currently visible */
  visible: boolean

  /** Absolute X position in terminal coordinates (0-indexed) */
  x: number

  /** Absolute Y position in terminal coordinates (0-indexed) */
  y: number

  /** Cursor appearance style */
  style: "block" | "underline" | "bar"
}
```

### useCursor Hook

```typescript
interface UseCursorOptions {
  /** Initial visibility state (default: false) */
  initialVisible?: boolean

  /** Initial cursor style (default: 'block') */
  style?: CursorState["style"]

  /**
   * Blink rate in milliseconds (default: 530, matching xterm)
   * Set to 0 to disable blinking
   */
  blinkRate?: number
}

interface UseCursorResult {
  /** Current cursor state */
  cursor: CursorState

  /** Show the terminal cursor */
  show: () => void

  /** Hide the terminal cursor */
  hide: () => void

  /** Move cursor to absolute terminal position */
  moveTo: (x: number, y: number) => void

  /** Move cursor relative to current position */
  moveBy: (dx: number, dy: number) => void

  /** Change cursor style */
  setStyle: (style: CursorState["style"]) => void
}

function useCursor(options?: UseCursorOptions): UseCursorResult
```

## Integration with Layout

The key insight is that `useContentRect()` provides _absolute_ terminal coordinates via `x` and `y`. This allows cursor positioning relative to a component:

```tsx
function PositionedInput() {
  const { x, y, width } = useContentRect()
  const { moveTo } = useCursor()
  const [text, setText] = useState("")
  const [cursorCol, setCursorCol] = useState(0)

  // The cursor position is:
  // - Component's x position (from layout)
  // - Plus the cursor column within the text
  useEffect(() => {
    moveTo(x + cursorCol, y)
  }, [x, y, cursorCol])

  useInput((input, key) => {
    if (key.leftArrow && cursorCol > 0) {
      setCursorCol((c) => c - 1)
    }
    if (key.rightArrow && cursorCol < text.length) {
      setCursorCol((c) => c + 1)
    }
    // ... handle typing
  })

  return <Text>{text}</Text>
}
```

### Layout Coordinate System

```
Terminal (0,0) ─────────────────────────────────────────►
    │
    │   ┌─ Box (x=5, y=2) ───────────────────┐
    │   │                                     │
    │   │   ┌─ Inner (x=7, y=4) ──────────┐  │
    │   │   │                              │  │
    │   │   │  Hello, world█               │  │
    │   │   │         ▲                    │  │
    │   │   │         │                    │  │
    │   │   │  cursor at (19, 4)           │  │
    │   │   │  = layout.x + cursorCol      │  │
    │   │   │  = 7 + 12                    │  │
    │   │   └──────────────────────────────┘  │
    │   └─────────────────────────────────────┘
    ▼
```

## Terminal Cursor vs Rendered Cursor

### Terminal Cursor

The _terminal cursor_ is the actual cursor controlled by ANSI escape sequences:

```
ESC[?25h  - Show cursor (DECTCEM)
ESC[?25l  - Hide cursor (DECTCEM)
ESC[H     - Move to home
ESC[y;xH  - Move to row y, column x (1-indexed)
ESC[nA    - Move up n lines
ESC[nB    - Move down n lines
ESC[nC    - Move right n columns
ESC[nD    - Move left n columns
```

**Pros:**

- Automatically blinks (no extra code)
- Native look and feel
- Works with screen readers

**Cons:**

- Only one cursor per terminal
- Positioning requires knowing absolute coordinates
- Style options vary by terminal

### Rendered Cursor

A _rendered cursor_ is a styled character in the output:

```tsx
// Common patterns:
<Text inverse> </Text>           // Block cursor
<Text underline> </Text>         // Underline cursor
<Text color="cyan">│</Text>      // Bar cursor
<Text backgroundColor="cyan">█</Text>  // Solid block
```

**Pros:**

- Full styling control
- Can have multiple cursors
- Works anywhere in the layout

**Cons:**

- Must implement blinking manually
- May look different from native cursor
- Accessibility concerns

### Recommendation

Use **rendered cursor** for visual feedback (the character at cursor position styled differently) combined with **terminal cursor** for accessibility and native feel:

```tsx
function TextInput({ value }: { value: string }) {
  const { focused } = useFocusable()
  const { x, y } = useContentRect()
  const { moveTo, show, hide } = useCursor()
  const [cursorCol, setCursorCol] = useState(value.length)

  useEffect(() => {
    if (focused) {
      moveTo(x + cursorCol, y)
      show()
    } else {
      hide()
    }
  }, [focused, x, y, cursorCol])

  // Rendered cursor for visual feedback
  const before = value.slice(0, cursorCol)
  const at = value[cursorCol] ?? " "
  const after = value.slice(cursorCol + 1)

  return (
    <Box>
      <Text>{before}</Text>
      <Text inverse={focused}>{at}</Text>
      <Text>{after}</Text>
    </Box>
  )
}
```

## Cursor Styles (DECSCUSR)

hightea supports DECSCUSR cursor shape control via the `shape` parameter on `useCursor()`:

```tsx
useCursor({
  col: cursorCol,
  row: cursorRow,
  visible: true,
  shape: "bar",  // "block" | "underline" | "bar" | "default"
})
```

ANSI escape sequences used:

| Code      | Style              | Description      |
| --------- | ------------------ | ---------------- |
| `ESC[0 q` | Default            | Terminal default |
| `ESC[1 q` | Blinking block     | █ blinking       |
| `ESC[2 q` | Steady block       | █ steady         |
| `ESC[3 q` | Blinking underline | \_ blinking      |
| `ESC[4 q` | Steady underline   | \_ steady        |
| `ESC[5 q` | Blinking bar       | │ blinking       |
| `ESC[6 q` | Steady bar         | │ steady         |

**Terminal support:**

| Terminal         | DECSCUSR Support |
| ---------------- | ---------------- |
| xterm            | Full             |
| iTerm2           | Full             |
| Kitty            | Full             |
| WezTerm          | Full             |
| macOS Terminal   | Partial (no bar) |
| GNOME Terminal   | Full             |
| Windows Terminal | Full             |

## Blink Rate

The `useCursor` hook optionally manages cursor blinking:

```tsx
const { cursor } = useCursor({
  blinkRate: 530, // xterm default is 530ms
})
```

If using terminal cursor, blinking is handled natively. For rendered cursors, the hook can provide a `blink` state:

```tsx
interface UseCursorResult {
  // ...existing...

  /** Current blink state (true = visible phase) */
  blinkOn: boolean
}

// Usage with rendered cursor
function BlinkingCursor() {
  const { blinkOn } = useCursor({ blinkRate: 530 })

  return blinkOn ? <Text inverse> </Text> : <Text> </Text>
}
```

## Integration with Focus

Cursor visibility should typically follow focus state:

```tsx
function FocusableInput() {
  const { focused } = useFocusable()
  const { show, hide } = useCursor()

  useEffect(() => {
    focused ? show() : hide()
  }, [focused])

  // ...
}
```

For multiple focusable inputs, each should hide cursor when losing focus:

```tsx
function Form() {
  return (
    <Box flexDirection="column">
      <FocusableInput label="Name" />
      <FocusableInput label="Email" />
      <FocusableInput label="Message" />
    </Box>
  )
}
```

## Integration with useInput

Cursor movement typically responds to keyboard input:

```tsx
function EditableText({ value, onChange }: Props) {
  const [cursorPos, setCursorPos] = useState(value.length)

  useInput((input, key) => {
    if (key.leftArrow) {
      setCursorPos((p) => Math.max(0, p - 1))
    } else if (key.rightArrow) {
      setCursorPos((p) => Math.min(value.length, p + 1))
    } else if (key.home) {
      setCursorPos(0)
    } else if (key.end) {
      setCursorPos(value.length)
    } else if (key.backspace && cursorPos > 0) {
      onChange(value.slice(0, cursorPos - 1) + value.slice(cursorPos))
      setCursorPos((p) => p - 1)
    } else if (key.delete && cursorPos < value.length) {
      onChange(value.slice(0, cursorPos) + value.slice(cursorPos + 1))
    } else if (input && !key.ctrl && !key.meta) {
      onChange(value.slice(0, cursorPos) + input + value.slice(cursorPos))
      setCursorPos((p) => p + input.length)
    }
  })

  // Render with cursor
  return (
    <Box>
      <Text>{value.slice(0, cursorPos)}</Text>
      <Text inverse>{value[cursorPos] ?? " "}</Text>
      <Text>{value.slice(cursorPos + 1)}</Text>
    </Box>
  )
}
```

## Wide Character Handling

CJK and emoji characters occupy two terminal columns. Cursor positioning must account for this:

```tsx
import { stringWidth } from "string-width"

function wideAwareSlice(
  str: string,
  cursorCol: number,
): {
  before: string
  at: string
  after: string
} {
  let width = 0
  let beforeEnd = 0

  for (const char of str) {
    const charWidth = stringWidth(char)
    if (width + charWidth > cursorCol) {
      break
    }
    width += charWidth
    beforeEnd++
  }

  const before = str.slice(0, beforeEnd)
  const atChar = str[beforeEnd] ?? " "
  const after = str.slice(beforeEnd + 1)

  return { before, at: atChar, after }
}
```

## Implementation Notes

### Cursor Position Tracking

The hook must track where the cursor actually is vs where it should be:

```typescript
// Internal state
interface CursorInternal {
  // Where cursor IS (after last ANSI output)
  actualX: number
  actualY: number

  // Where cursor SHOULD BE (user intent)
  targetX: number
  targetY: number

  // Only emit movement when actual != target
  needsMove: boolean
}
```

### Batching Cursor Updates

Multiple `moveTo()` calls in the same frame should be batched:

```tsx
// These should result in ONE cursor movement
moveTo(10, 5)
moveTo(15, 5)
moveTo(20, 5)
// Only the final position (20, 5) should be sent
```

### Lifecycle Considerations

Cursor state should be cleaned up when component unmounts:

```typescript
useEffect(() => {
  return () => {
    // Hide cursor when component unmounts
    // to avoid orphaned visible cursor
    hide()
  }
}, [])
```

## Example: Complete TextInput Component

```tsx
import { useState, useEffect, useMemo } from "react"
import { Box, Text, useFocusable, useCursor, useInput, useContentRect } from "@hightea/term"

interface TextInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function TextInput({ value, onChange, placeholder = "" }: TextInputProps) {
  const { focused } = useFocusable()
  const { x, y } = useContentRect()
  const { show, hide, moveTo } = useCursor({ style: "bar" })
  const [cursorPos, setCursorPos] = useState(value.length)

  // Keep cursor within bounds when value changes externally
  useEffect(() => {
    if (cursorPos > value.length) {
      setCursorPos(value.length)
    }
  }, [value.length])

  // Manage terminal cursor visibility and position
  useEffect(() => {
    if (focused) {
      moveTo(x + cursorPos, y)
      show()
    } else {
      hide()
    }
  }, [focused, x, y, cursorPos])

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!focused) return

      if (key.leftArrow) {
        setCursorPos((p) => Math.max(0, p - 1))
      } else if (key.rightArrow) {
        setCursorPos((p) => Math.min(value.length, p + 1))
      } else if (key.home) {
        setCursorPos(0)
      } else if (key.end) {
        setCursorPos(value.length)
      } else if (key.backspace && cursorPos > 0) {
        onChange(value.slice(0, cursorPos - 1) + value.slice(cursorPos))
        setCursorPos((p) => p - 1)
      } else if (key.delete && cursorPos < value.length) {
        onChange(value.slice(0, cursorPos) + value.slice(cursorPos + 1))
      } else if (input && !key.ctrl && !key.meta) {
        onChange(value.slice(0, cursorPos) + input + value.slice(cursorPos))
        setCursorPos((p) => p + input.length)
      }
    },
    { isActive: focused },
  )

  // Render text with visual cursor indicator
  const displayContent = useMemo(() => {
    if (!value && !focused) {
      return <Text dimColor>{placeholder}</Text>
    }

    const before = value.slice(0, cursorPos)
    const at = value[cursorPos] ?? " "
    const after = value.slice(cursorPos + 1)

    return (
      <>
        <Text>{before}</Text>
        <Text inverse={focused}>{at}</Text>
        <Text>{after}</Text>
      </>
    )
  }, [value, cursorPos, focused, placeholder])

  return <Box borderStyle={focused ? "round" : "single"}>{displayContent}</Box>
}
```

## Future Considerations

### Selection Ranges

For text selection, extend the API:

```typescript
interface SelectionState {
  start: number
  end: number
}

interface UseCursorResult {
  // ...existing...
  selection: SelectionState | null
  setSelection: (start: number, end: number) => void
  clearSelection: () => void
}
```

### Multiple Cursors

For multi-cursor editing (like VS Code):

```typescript
function useMultiCursor(): {
  cursors: CursorState[]
  addCursor: (x: number, y: number) => void
  removeCursor: (index: number) => void
}
```

### Cursor Animation

Smooth cursor movement for better UX:

```typescript
interface UseCursorOptions {
  // ...existing...

  /** Animate cursor movement (default: false) */
  animate?: boolean

  /** Animation duration in ms (default: 100) */
  animationDuration?: number
}
```

## Related Documentation

- [useContentRect](/api/use-content-rect) - Get component dimensions and position
- [Focus Hooks](/api/use-focus) - Manage focus state
- [useInput](/api/use-input) - Handle keyboard input
- [Input Limitations](/guide/input-limitations) - Terminal input constraints
