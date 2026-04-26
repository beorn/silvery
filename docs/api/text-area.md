# TextArea

Multi-line text input with word wrapping, scrolling, selection, and full readline-style editing. Built on the same kill ring and word movement as TextInput.

## Import

```tsx
import { TextArea } from "silvery"
```

## Usage

```tsx
// Chat input — defaults give content-sized auto-grow (1..8 rows)
const [value, setValue] = useState("")

<TextArea
  value={value}
  onChange={setValue}
  onSubmit={send}
  placeholder="Type a message..."
/>
```

## Sizing — `field-sizing` API

TextArea mirrors the CSS [`field-sizing`](https://developer.mozilla.org/en-US/docs/Web/CSS/field-sizing) property. The two modes are:

| Mode                  | Visible row count                       | Use case                             |
| --------------------- | --------------------------------------- | ------------------------------------ |
| `"content"` (default) | `clamp(minRows, wrappedLines, maxRows)` | Chat / messaging input — auto-grow   |
| `"fixed"`             | exactly `rows`                          | Code editor pane, designed footprint |

In content mode the widget expands as the user types, capped at `maxRows`. Beyond that the buffer scrolls. Visual line counting respects soft wrap — a long single logical line that wraps to multiple visual rows counts toward `minRows`/`maxRows`.

```tsx
// Default — chat-input (content mode, 1..8 rows)
<TextArea value={msg} onChange={setMsg} onSubmit={send} />

// Fixed 16-row code editor
<TextArea value={code} onChange={setCode} fieldSizing="fixed" rows={16} />

// Compose box — grows up to 12 rows then scrolls
<TextArea value={msg} onChange={setMsg} maxRows={12} />
```

## Props

| Prop               | Type                                      | Default          | Description                                                                |
| ------------------ | ----------------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| `value`            | `string`                                  | —                | Current value (controlled mode)                                            |
| `defaultValue`     | `string`                                  | `""`             | Initial value (uncontrolled mode)                                          |
| `onChange`         | `(value: string) => void`                 | —                | Called when value changes                                                  |
| `onSubmit`         | `(value: string) => void`                 | —                | Called on submit key combo                                                 |
| `submitKey`        | `"ctrl+enter" \| "enter" \| "meta+enter"` | `"ctrl+enter"`   | Key to trigger submit                                                      |
| `placeholder`      | `string`                                  | `""`             | Placeholder text when empty                                                |
| `isActive`         | `boolean`                                 | —                | Override focus system for input capture                                    |
| `fieldSizing`      | `"content" \| "fixed"`                    | `"content"`      | CSS field-sizing analog — auto-grow vs fixed                               |
| `rows`             | `number`                                  | `1`              | Visible row count in `"fixed"` mode (mirrors HTML `<textarea rows>`)       |
| `minRows`          | `number`                                  | `1`              | Minimum visible rows in `"content"` mode                                   |
| `maxRows`          | `number`                                  | `8`              | Maximum visible rows in `"content"` mode (scrolls beyond)                  |
| `cursorStyle`      | `"block" \| "underline"`                  | `"block"`        | Visual cursor style when unfocused                                         |
| `scrollMargin`     | `number`                                  | `1`              | Context lines above/below cursor when scrolling                            |
| `disabled`         | `boolean`                                 | —                | Ignore input and dim text                                                  |
| `maxLength`        | `number`                                  | —                | Maximum characters allowed                                                 |
| `borderStyle`      | `string`                                  | —                | Border style (e.g., `"round"`, `"single"`)                                 |
| `borderColor`      | `string`                                  | `"$border"`      | Border color when unfocused                                                |
| `focusBorderColor` | `string`                                  | `"$focusborder"` | Border color when focused                                                  |
| `testID`           | `string`                                  | —                | Test ID for focus system identification                                    |
| `wrap`             | `"soft" \| "off"`                         | `"soft"`         | Soft-wrap long logical lines (default) or keep them on a single visual row |
| `color`            | `string`                                  | —                | Foreground color for body text (e.g., `"$fg-muted"`)                       |
| `dim`              | `boolean`                                 | `false`          | Shortcut for `color="$fg-muted"` — body text dims to muted                 |

### Migrating from `height`

The legacy `height` prop has been removed. Pick the new sizing prop based on the original intent:

| Old usage                                        | New usage                                         |
| ------------------------------------------------ | ------------------------------------------------- |
| `<TextArea height={N} />`                        | `<TextArea fieldSizing="fixed" rows={N} />`       |
| Hand-rolled `height={Math.min(N, lines.length)}` | `<TextArea maxRows={N} />` (default content mode) |
| Chat input where `height` tracked content        | `<TextArea />` (defaults are chat-input)          |

### Ref Handle (TextAreaHandle)

Access via `useRef<TextAreaHandle>()`:

| Method            | Type                              | Description                 |
| ----------------- | --------------------------------- | --------------------------- |
| `clear()`         | `() => void`                      | Clear the input             |
| `getValue()`      | `() => string`                    | Get current value           |
| `setValue(value)` | `(value: string) => void`         | Set value programmatically  |
| `getSelection()`  | `() => TextAreaSelection \| null` | Get current selection range |

## Keyboard Shortcuts

| Key                        | Action                         |
| -------------------------- | ------------------------------ |
| `Arrow keys`               | Move cursor (clears selection) |
| `Shift+Arrow`              | Extend selection               |
| `Shift+Home/End`           | Select to line boundaries      |
| `Ctrl+Shift+Arrow`         | Word-wise selection            |
| `Ctrl+A`                   | Select all text                |
| `Ctrl+E`                   | End of line                    |
| `Ctrl+P` / `Ctrl+N`        | Up / Down line (Emacs aliases) |
| `Home` / `End`             | Beginning/end of line          |
| `Alt+B` / `Alt+F`          | Move by word                   |
| `Ctrl+W` / `Alt+Backspace` | Kill word backward             |
| `Alt+D`                    | Kill word forward              |
| `Ctrl+K`                   | Kill to end of line            |
| `Ctrl+U`                   | Kill to beginning of line      |
| `Ctrl+Y`                   | Yank (paste from kill ring)    |
| `Alt+Y`                    | Cycle kill ring                |
| `Ctrl+T`                   | Transpose characters           |
| `PageUp` / `PageDown`      | Scroll by viewport height      |

## Examples

### Chat Input with Enter to Submit

```tsx
<TextArea
  value={message}
  onChange={setMessage}
  onSubmit={sendMessage}
  submitKey="enter"
  placeholder="Type a message..."
/>
```

With `submitKey="enter"`, pressing Enter submits. Use Shift+Enter or the default `"ctrl+enter"` for newlines. Defaults to content-mode auto-grow (`minRows=1`, `maxRows=8`).

### Bordered Editor

```tsx
<TextArea
  value={content}
  onChange={setContent}
  fieldSizing="fixed"
  rows={15}
  borderStyle="round"
  placeholder="Write your note..."
/>
```

### Disabled State

```tsx
<TextArea value={readOnlyContent} fieldSizing="fixed" rows={10} disabled />
```

When disabled, text is dimmed and all input is ignored.
