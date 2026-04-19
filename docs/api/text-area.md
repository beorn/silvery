# TextArea

Multi-line text input with word wrapping, scrolling, selection, and full readline-style editing. Built on the same kill ring and word movement as TextInput.

## Import

```tsx
import { TextArea } from "silvery"
```

## Usage

```tsx
const [value, setValue] = useState("")

<TextArea
  value={value}
  onChange={setValue}
  height={10}
  placeholder="Type here..."
/>
```

## Props

| Prop               | Type                                      | Default          | Description                                     |
| ------------------ | ----------------------------------------- | ---------------- | ----------------------------------------------- |
| `value`            | `string`                                  | —                | Current value (controlled mode)                 |
| `defaultValue`     | `string`                                  | `""`             | Initial value (uncontrolled mode)               |
| `onChange`         | `(value: string) => void`                 | —                | Called when value changes                       |
| `onSubmit`         | `(value: string) => void`                 | —                | Called on submit key combo                      |
| `submitKey`        | `"ctrl+enter" \| "enter" \| "meta+enter"` | `"ctrl+enter"`   | Key to trigger submit                           |
| `placeholder`      | `string`                                  | `""`             | Placeholder text when empty                     |
| `isActive`         | `boolean`                                 | —                | Override focus system for input capture         |
| `height`           | `number`                                  | _required_       | Visible height in rows                          |
| `cursorStyle`      | `"block" \| "underline"`                  | `"block"`        | Visual cursor style when unfocused              |
| `scrollMargin`     | `number`                                  | `1`              | Context lines above/below cursor when scrolling |
| `disabled`         | `boolean`                                 | —                | Ignore input and dim text                       |
| `maxLength`        | `number`                                  | —                | Maximum characters allowed                      |
| `borderStyle`      | `string`                                  | —                | Border style (e.g., `"round"`, `"single"`)      |
| `borderColor`      | `string`                                  | `"$border"`      | Border color when unfocused                     |
| `focusBorderColor` | `string`                                  | `"$focusborder"` | Border color when focused                       |
| `testID`           | `string`                                  | —                | Test ID for focus system identification         |

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
  height={3}
  placeholder="Type a message..."
/>
```

With `submitKey="enter"`, pressing Enter submits. Use Shift+Enter or the default `"ctrl+enter"` for newlines.

### Bordered Editor

```tsx
<TextArea
  value={content}
  onChange={setContent}
  height={15}
  borderStyle="round"
  placeholder="Write your note..."
/>
```

### Disabled State

```tsx
<TextArea value={readOnlyContent} height={10} disabled />
```

When disabled, text is dimmed and all input is ignored.
