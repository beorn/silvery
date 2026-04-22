# Text Selection

Silvery captures all mouse events via DECSET 1003, which kills native terminal text selection. Silvery's text selection system restores that capability — and goes further with contain boundaries, semantic copy, and vim-style copy-mode.

## How It's Activated

Text selection is a **runtime feature** (`SelectionFeature`) that activates automatically when you use `withDomEvents()`:

```typescript
const app = pipe(
  createApp(store),
  withReact(<App />),
  withTerminal(process),
  withFocus(),
  withDomEvents(),    // ← text selection is included
)
```

No explicit hook setup is needed. To observe selection state from a React component, use the `useSelection()` hook:

```tsx
import { useSelection } from "silvery"

function SelectionStatus() {
  const selection = useSelection()
  if (!selection?.active) return null
  return <Text>Selection active</Text>
}
```

`useSelection()` is the recommended API — it reads from the `CapabilityRegistry`, so no provider wrapper is needed. The older `useTerminalSelection` hook and `TerminalSelectionProvider` component remain as fallback options.

## The `userSelect` Prop

Control which elements are text-selectable with the `userSelect` prop on `Box`:

```tsx
import { Box, Text } from "silvery"

function App() {
  return (
    <Box flexDirection="column">
      {/* Selectable by default */}
      <Text>Drag to select this text</Text>

      {/* Non-selectable buttons */}
      <Box userSelect="none">
        <Text>Click me — no text selection</Text>
      </Box>

      {/* Selection stays inside this container */}
      <Box userSelect="contain">
        <Text>Selection cannot escape this boundary</Text>
      </Box>
    </Box>
  )
}
```

### Values

| Value     | Behavior                                                          |
| --------- | ----------------------------------------------------------------- |
| `auto`    | Inherit from parent. Root resolves to `text`.                     |
| `none`    | Not selectable. Mouse-drag does not start text selection.         |
| `text`    | Force selectable, even if parent is `none`.                       |
| `contain` | Selectable, but selection range cannot escape this node's bounds. |

### Common Patterns

| Surface            | `userSelect` | Why                                        |
| ------------------ | ------------ | ------------------------------------------ |
| Read-only text     | `auto`       | Default — users expect to select text      |
| Help dialog        | `contain`    | Selectable, but selection stays in dialog  |
| Detail pane        | `contain`    | Selectable, scoped to pane                 |
| Board card         | `none`       | Interactive node — click, drag, not select |
| Button / toolbar   | `none`       | Clickable chrome, not text content         |
| Status bar         | `none`       | UI chrome, not content                     |
| Decorative overlay | `text`       | Force selectable even if parent is `none`  |

## Mouse Selection

### Basic Drag

Click and drag to select text. The selection highlight follows your mouse across lines, respecting `userSelect` boundaries.

```
mousedown → set anchor point
mousemove → extend selection to cursor
mouseup   → selection persists (explicit copy needed)
```

A small drag threshold (distance + time) prevents accidental selections on normal clicks.

### Word and Line Selection

- **Double-click**: Select the word under the cursor (whitespace/punctuation boundaries)
- **Triple-click**: Select the entire line

Both use the existing double-click detection (300ms window, 2-cell threshold) extended to triple-click.

### Copy Behavior

By default, selection persists after mouseup — you must explicitly copy with `y` or your app's copy command. This avoids clipboard spam from accidental selections.

For tmux-style auto-copy on mouseup, configure the `SelectionFeature` via `withDomEvents()` options (or use the legacy `useTerminalSelection({ copyOnSelect: true })` hook).

## Alt+Drag Override

When Silvery captures mouse events, native terminal selection is unavailable. Alt+drag is the escape hatch — hold Alt and drag to force text selection, regardless of `userSelect` settings.

```
Alt + mousedown → always starts text selection
                  ignores userSelect="none"
                  ignores draggable
```

When a user tries to drag on a `userSelect="none"` element without Alt, a transient hint appears: "Hold Alt to select text".

The modifier key is configurable via the `SelectionFeature` options (default is Alt).

## Contain Boundaries

`userSelect="contain"` creates a selection boundary. Selection started inside a container cannot extend beyond its edges — the selection range is clamped to the container's screen rect.

```tsx
function Dialog() {
  return (
    <Box userSelect="contain" borderStyle="round" padding={1}>
      <Text>Select this text — it won't escape the dialog</Text>
      <Text>Even if you drag way past the border</Text>
    </Box>
  )
}
```

### Nested Boundaries

When boundaries are nested, the **innermost `contain` wins**:

```tsx
<Box userSelect="contain">
  {" "}
  {/* outer boundary */}
  <Text>Title</Text>
  <Box userSelect="contain">
    {" "}
    {/* inner boundary — wins */}
    <Text>Scrollable content</Text>
  </Box>
</Box>
```

Selection started in the inner container is scoped to the inner container, even though the outer container also has `contain`.

### Independence from Overflow

`userSelect="contain"` is independent of `overflow`. A Box can clip overflow without constraining selection, or constrain selection without clipping overflow:

```tsx
{
  /* Clips content, but selection can cross into adjacent panes */
}
;<Box overflow="hidden">...</Box>

{
  /* Doesn't clip, but selection stays inside */
}
;<Box userSelect="contain">...</Box>

{
  /* Both: clips AND constrains selection */
}
;<Box overflow="hidden" userSelect="contain">
  ...
</Box>
```

## Keyboard Copy-Mode

Enter copy-mode with a keybinding to navigate and select text without the mouse. Vim-style navigation:

| Key       | Action                     |
| --------- | -------------------------- |
| `h/j/k/l` | Move cursor                |
| `w/b/e`   | Word motion                |
| `0/$`     | Line start/end             |
| `v`       | Start character visual     |
| `V`       | Start line visual          |
| `y`       | Yank selection → clipboard |
| `Esc`     | Exit copy-mode             |

Copy-mode shares the selection range with mouse selection. If you start a mouse drag during copy-mode, the mouse takes over and copy-mode exits.

## How It Works

Selection operates at the **buffer layer**, not the component layer. Components never re-render for selection changes.

1. **Render phase**: Each cell gets a `SELECTABLE_FLAG` (bit 31) based on resolved `userSelect`
2. **Mouse/keyboard input**: Updates a `SelectionRange` (anchor + head coordinates)
3. **Style composition**: Selected cells get highlight styling before diff/output
4. **Output**: Normal diff renderer outputs the composed cells — one pass, no overlay

This means selection composes correctly with existing cell styles, wide characters, and find highlights — all handled by the normal renderer.

## See Also

- [Clipboard](/guide/clipboard) — clipboard backends, semantic copy, paste handling
- [Find](/guide/find) — buffer search, virtual list search, match navigation
- [Event Handling](/guide/event-handling) — mouse events, pointer props
