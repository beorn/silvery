# TextInput

Full readline-style single-line text input with kill ring, word movement, cursor positioning, and password masking.

## Import

```tsx
import { TextInput } from "silvery"
```

## Usage

```tsx
const [value, setValue] = useState("")

<TextInput
  value={value}
  onChange={setValue}
  onSubmit={(val) => console.log("Submitted:", val)}
  placeholder="Type here..."
/>
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `string` | — | Current value (controlled mode) |
| `defaultValue` | `string` | `""` | Initial value (uncontrolled mode) |
| `onChange` | `(value: string) => void` | — | Called when value changes |
| `onSubmit` | `(value: string) => void` | — | Called when Enter is pressed |
| `onEOF` | `() => void` | — | Called on Ctrl+D with empty input |
| `placeholder` | `string` | `""` | Placeholder text when empty |
| `isActive` | `boolean` | — | Override focus system for input capture |
| `prompt` | `string` | `""` | Prompt prefix (e.g., `"$ "` or `"> "`) |
| `promptColor` | `string` | `"$control"` | Prompt color |
| `color` | `string` | — | Text color |
| `cursorStyle` | `"block" \| "underline"` | `"block"` | Visual cursor style when unfocused |
| `showUnderline` | `boolean` | `false` | Show underline decoration below input |
| `underlineWidth` | `number` | `40` | Width of the underline decoration |
| `mask` | `string` | — | Mask character for passwords (e.g., `"*"`) |
| `borderStyle` | `string` | — | Border style (e.g., `"round"`, `"single"`) |
| `borderColor` | `string` | `"$border"` | Border color when unfocused |
| `focusBorderColor` | `string` | `"$focusborder"` | Border color when focused |
| `testID` | `string` | — | Test ID for focus system identification |

### Ref Handle (TextInputHandle)

Access via `useRef<TextInputHandle>()`:

| Method | Type | Description |
| --- | --- | --- |
| `clear()` | `() => void` | Clear the input |
| `getValue()` | `() => string` | Get current value |
| `setValue(value)` | `(value: string) => void` | Set value programmatically |
| `getKillRing()` | `() => string[]` | Get kill ring contents |

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+A` / `Home` | Beginning of line |
| `Ctrl+E` / `End` | End of line |
| `Ctrl+B` / `Left` | Move cursor left |
| `Ctrl+F` / `Right` | Move cursor right |
| `Alt+B` | Move word backward |
| `Alt+F` | Move word forward |
| `Ctrl+W` / `Alt+Backspace` | Kill word backward |
| `Alt+D` | Kill word forward |
| `Ctrl+U` | Kill to beginning of line |
| `Ctrl+K` | Kill to end of line |
| `Ctrl+Y` | Yank (paste from kill ring) |
| `Alt+Y` | Cycle kill ring |
| `Ctrl+T` | Transpose characters |

## Examples

### With Border

```tsx
<TextInput
  value={search}
  onChange={setSearch}
  placeholder="Search..."
  borderStyle="round"
/>
```

The border color automatically changes between `borderColor` and `focusBorderColor` based on focus state.

### Password Input

```tsx
<TextInput
  value={password}
  onChange={setPassword}
  onSubmit={handleLogin}
  mask="*"
  placeholder="Password"
/>
```

### With Prompt

```tsx
<TextInput
  value={command}
  onChange={setCommand}
  onSubmit={executeCommand}
  prompt="$ "
  promptColor="$success"
/>
```
