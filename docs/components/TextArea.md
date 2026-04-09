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
| `height`           | `number`                                  | **required**     | Visible height in rows                                   |
| `cursorStyle`      | `"block" \| "underline"`                  | `"block"`        | Cursor style                                             |
| `scrollMargin`     | `number`                                  | `1`              | Context lines above/below cursor when scrolling          |
| `disabled`         | `boolean`                                 | --               | Ignore all input and dim text                            |
| `maxLength`        | `number`                                  | --               | Maximum number of characters allowed                     |
| `borderStyle`      | `string`                                  | --               | Border style (wraps input in bordered Box)               |
| `borderColor`      | `string`                                  | `"$border"`      | Border color when unfocused                              |
| `focusBorderColor` | `string`                                  | `"$focusborder"` | Border color when focused                                |
| `testID`           | `string`                                  | --               | Test ID for focus system identification                  |

### Ref: TextAreaHandle

```ts
interface TextAreaHandle {
  clear: () => void
  getValue: () => string
  setValue: (value: string) => void
  getSelection: () => TextAreaSelection | null
}

type TextAreaSelection = { start: number; end: number }
```

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

## Usage

```tsx
const [value, setValue] = useState('')

<TextArea
  value={value}
  onChange={setValue}
  onSubmit={(val) => console.log('Submitted:', val)}
  height={10}
  placeholder="Type here..."
/>
```

## See Also

- [TextInput](./TextInput.md) -- single-line text input
- [EditContextDisplay](./EditContextDisplay.md) -- read-only multi-line display with cursor
