# TextArea

Multi-line text input with word wrapping, scrolling, selection, and cursor movement. Uses `useBoxRect` for width-aware word wrapping and scroll tracking to keep the cursor visible. Built on the `useTextArea` hook.

## Import

```tsx
import { TextArea } from "silvery"
```

## Props

| Prop               | Type                                      | Default          | Description                                              |
| ------------------ | ----------------------------------------- | ---------------- | -------------------------------------------------------- |
| `value`            | `string`                                  | --               | Current value (controlled mode)                          |
| `defaultValue`     | `string`                                  | `""`             | Initial value (uncontrolled mode)                        |
| `onChange`         | `(value: string) => void`                 | --               | Called when value changes                                |
| `onSubmit`         | `(value: string) => void`                 | --               | Called on submit                                         |
| `submitKey`        | `"ctrl+enter" \| "enter" \| "meta+enter"` | `"ctrl+enter"`   | Key to trigger submit                                    |
| `placeholder`      | `string`                                  | `""`             | Placeholder text when empty                              |
| `isActive`         | `boolean`                                 | --               | Whether input is focused/active (overrides focus system) |
| `fieldSizing`      | `"content" \| "fixed"`                    | `"content"`      | CSS field-sizing analog — auto-grow with content vs fixed |
| `rows`             | `number`                                  | `1`              | Visible row count in `"fixed"` mode                      |
| `minRows`          | `number`                                  | `1`              | Minimum rows in `"content"` mode                         |
| `maxRows`          | `number`                                  | `8`              | Maximum rows in `"content"` mode (scrolls beyond)        |
| `cursorStyle`      | `"block" \| "underline"`                  | `"block"`        | Cursor style                                             |
| `scrollMargin`     | `number`                                  | `1`              | Context lines above/below cursor when scrolling          |
| `disabled`         | `boolean`                                 | --               | Ignore all input and dim text                            |
| `maxLength`        | `number`                                  | --               | Maximum number of characters allowed                     |
| `borderStyle`      | `string`                                  | --               | Border style (wraps input in bordered Box)               |
| `borderColor`      | `string`                                  | `"$border-default"` | Border color when unfocused                           |
| `focusBorderColor` | `string`                                  | `"$border-focus"`   | Border color when focused                             |
| `testID`           | `string`                                  | --               | Test ID for focus system identification                  |
| `onEdge`           | `(edge) => boolean`                       | --               | Fires when arrow key pressed AT buffer boundary          |

### Ref: TextAreaHandle

```ts
interface TextAreaHandle {
  clear: () => void
  getValue: () => string
  setValue: (value: string) => void
  /** Set cursor position. Clamped to value length, scrolls to keep visible. */
  setCursor: (offset: number) => void
  getSelection: () => TextAreaSelection | null
}

type TextAreaSelection = { start: number; end: number }
```

`setCursor` is useful when you replace `value` and want the cursor at a specific offset (e.g. cursor-at-start after a swap-and-handoff). `setValue` always places the cursor at the end; pair it with `setCursor(0)` to land at the start instead.

## Keyboard Shortcuts

| Key                    | Action                            |
| ---------------------- | --------------------------------- |
| Arrow keys             | Move cursor (clears selection)    |
| Shift+Arrow            | Extend selection                  |
| Shift+Home/End         | Select to line boundaries         |
| Ctrl+Shift+Arrow       | Word-wise selection               |
| Ctrl+A                 | Select all text                   |
| Ctrl+E                 | End of line                       |
| Home/End               | Beginning/end of line             |
| Alt+B/F                | Move by word (wraps across lines) |
| Ctrl+W / Alt+Backspace | Delete word backwards (kill ring) |
| Alt+D                  | Delete word forwards (kill ring)  |
| Ctrl+K                 | Kill to end of line               |
| Ctrl+U                 | Kill to beginning of line         |
| Ctrl+Y                 | Yank (paste from kill ring)       |
| Alt+Y                  | Cycle kill ring                   |
| Ctrl+T                 | Transpose characters              |
| PageUp/PageDown        | Scroll by viewport height         |

## Sizing — `field-sizing` API

TextArea mirrors the CSS [`field-sizing`](https://developer.mozilla.org/en-US/docs/Web/CSS/field-sizing) property. `"content"` (default) auto-grows with input clamped between `minRows` and `maxRows`; `"fixed"` keeps the widget at exactly `rows` regardless of content.

| Old usage                              | New usage                                            |
| -------------------------------------- | ---------------------------------------------------- |
| `<TextArea height={N} />`              | `<TextArea fieldSizing="fixed" rows={N} />`         |
| Hand-rolled `height={Math.min(N, lines.length)}` | `<TextArea maxRows={N} />` (default content mode)   |
| Chat input where `height` tracked content | `<TextArea />` (defaults are chat-input)            |

## Usage

```tsx
const [value, setValue] = useState('')

// Defaults give chat-input behavior — auto-grows 1..8 rows.
<TextArea
  value={value}
  onChange={setValue}
  onSubmit={(val) => console.log('Submitted:', val)}
  placeholder="Type here..."
/>

// Fixed-height editor pane.
<TextArea
  value={value}
  onChange={setValue}
  fieldSizing="fixed"
  rows={10}
/>
```

## Edge Callbacks: `onEdge`

`onEdge` fires when an arrow key is pressed AT the buffer boundary — where the key would otherwise be a no-op or clamp. It enables cross-widget focus handoff for composite editors that stack multiple `TextArea`s and want arrow keys to flow between them.

```ts
type Edge = "top" | "bottom" | "left" | "right"
onEdge?: (edge: Edge) => boolean
```

| Edge       | Fires when                                              |
| ---------- | ------------------------------------------------------- |
| `"top"`    | Up is pressed at `cursorRow === 0`                      |
| `"bottom"` | Down is pressed at the last row                         |
| `"left"`   | Left is pressed at the start of the buffer (`offset 0`) |
| `"right"`  | Right is pressed at the end of the buffer               |

- **Return `true`** to consume the key — the cursor stays put and the arrow event is fully handled.
- **Return `false`** (or omit the handler) to fall through to the default clamp behavior.
- Not fired when Shift is held — `Shift+Arrow` extends selection instead and is reserved for future use.

### Example: two-pane composite editor

```tsx
const [topValue, setTopValue] = useState("")
const [botValue, setBotValue] = useState("")
const [focused, setFocused] = useState<"top" | "bot">("top")

return (
  <Box flexDirection="column">
    <TextArea
      value={topValue}
      onChange={setTopValue}
      isActive={focused === "top"}
      fieldSizing="fixed"
      rows={5}
      onEdge={(edge) => {
        if (edge === "bottom") {
          setFocused("bot")
          return true // consume — focus moved to the lower pane
        }
        return false
      }}
    />
    <Divider />
    <TextArea
      value={botValue}
      onChange={setBotValue}
      isActive={focused === "bot"}
      fieldSizing="fixed"
      rows={5}
      onEdge={(edge) => {
        if (edge === "top") {
          setFocused("top")
          return true
        }
        return false
      }}
    />
  </Box>
)
```

## See Also

- [TextInput](./TextInput.md) -- single-line text input
- [EditContextDisplay](./EditContextDisplay.md) -- read-only multi-line display with cursor
