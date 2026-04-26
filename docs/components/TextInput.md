# TextInput

Full readline-style single-line text input with kill ring, word movement, and all standard shortcuts. Built on the `useReadline` hook.

## Import

```tsx
import { TextInput } from "silvery"
```

## Props

| Prop               | Type                      | Default             | Description                                              |
| ------------------ | ------------------------- | ------------------- | -------------------------------------------------------- |
| `value`            | `string`                  | --                  | Current value (controlled mode)                          |
| `defaultValue`     | `string`                  | `""`                | Initial value (uncontrolled mode)                        |
| `onChange`         | `(value: string) => void` | --                  | Called when value changes                                |
| `onSubmit`         | `(value: string) => void` | --                  | Called when Enter is pressed                             |
| `onEOF`            | `() => void`              | --                  | Called on Ctrl+D with empty input                        |
| `placeholder`      | `string`                  | `""`                | Placeholder text when empty                              |
| `isActive`         | `boolean`                 | --                  | Whether input is focused/active (overrides focus system) |
| `prompt`           | `string`                  | `""`                | Prompt prefix (e.g., "$ " or "> ")                       |
| `promptColor`      | `string`                  | `"$control"`        | Prompt color                                             |
| `color`            | `string`                  | --                  | Text color                                               |
| `cursorStyle`      | `"block" \| "underline"`  | `"block"`           | Cursor style                                             |
| `showUnderline`    | `boolean`                 | `false`             | Show underline below input                               |
| `underlineWidth`   | `number`                  | `40`                | Underline width                                          |
| `mask`             | `string`                  | --                  | Mask character for passwords                             |
| `borderStyle`      | `string`                  | --                  | Border style (wraps input in bordered Box)               |
| `borderColor`      | `string`                  | `"$border-default"` | Border color when unfocused                              |
| `focusBorderColor` | `string`                  | `"$border-focus"`   | Border color when focused                                |
| `testID`           | `string`                  | --                  | Test ID for focus system identification                  |

### Ref: TextInputHandle

```ts
interface TextInputHandle {
  clear: () => void
  getValue: () => string
  setValue: (value: string) => void
  getKillRing: () => string[]
}
```

## Keyboard Shortcuts

| Key                    | Action                       |
| ---------------------- | ---------------------------- |
| Ctrl+A / Home          | Beginning of line            |
| Ctrl+E / End           | End of line                  |
| Ctrl+B / Left          | Move cursor left             |
| Ctrl+F / Right         | Move cursor right            |
| Alt+B                  | Move word backwards          |
| Alt+F                  | Move word forwards           |
| Ctrl+W / Alt+Backspace | Delete word backwards (kill) |
| Alt+D                  | Delete word forwards (kill)  |
| Ctrl+U                 | Delete to beginning (kill)   |
| Ctrl+K                 | Delete to end (kill)         |
| Ctrl+Y                 | Yank (paste from kill ring)  |
| Alt+Y                  | Cycle kill ring              |
| Ctrl+T                 | Transpose characters         |

## Usage

```tsx
const [value, setValue] = useState('')

<TextInput
  value={value}
  onChange={setValue}
  onSubmit={(val) => console.log('Submitted:', val)}
  placeholder="Type here..."
/>

// With border and prompt
<TextInput
  value={query}
  onChange={setQuery}
  prompt="/ "
  borderStyle="round"
  placeholder="Search..."
/>

// Password input
<TextInput value={password} onChange={setPassword} mask="*" />
```

## See Also

- [TextArea](./TextArea.md) -- multi-line text input
- [CursorLine](./CursorLine.md) -- cursor rendering primitive
