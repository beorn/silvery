# useInput

Handle keyboard input in your app.

## Import

```tsx
import { useInput } from "inkx"
```

## Usage

```tsx
function App() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (key.upArrow) setCount((c) => c + 1)
    if (key.downArrow) setCount((c) => c - 1)
    if (input === "q") process.exit()
  })

  return <Text>Count: {count}</Text>
}
```

## Signature

```tsx
useInput(
  callback: (input: string, key: Key) => void,
  options?: { isActive?: boolean }
)
```

### Parameters

| Parameter          | Type                                | Description                                   |
| ------------------ | ----------------------------------- | --------------------------------------------- |
| `callback`         | `(input: string, key: Key) => void` | Called on each keypress                       |
| `options.isActive` | `boolean`                           | Whether to listen for input (default: `true`) |

### Key Object

| Property     | Type      | Description           |
| ------------ | --------- | --------------------- |
| `upArrow`    | `boolean` | Up arrow key          |
| `downArrow`  | `boolean` | Down arrow key        |
| `leftArrow`  | `boolean` | Left arrow key        |
| `rightArrow` | `boolean` | Right arrow key       |
| `return`     | `boolean` | Enter/Return key      |
| `escape`     | `boolean` | Escape key            |
| `ctrl`       | `boolean` | Control modifier      |
| `shift`      | `boolean` | Shift modifier        |
| `meta`       | `boolean` | Meta/Command modifier |
| `tab`        | `boolean` | Tab key               |
| `backspace`  | `boolean` | Backspace key         |
| `delete`     | `boolean` | Delete key            |
| `pageUp`     | `boolean` | Page Up key           |
| `pageDown`   | `boolean` | Page Down key         |

## Examples

### Navigation

```tsx
function Menu({ items }: { items: string[] }) {
  const [selected, setSelected] = useState(0)

  useInput((input, key) => {
    if (key.upArrow) {
      setSelected((s) => Math.max(0, s - 1))
    }
    if (key.downArrow) {
      setSelected((s) => Math.min(items.length - 1, s + 1))
    }
    if (key.return) {
      console.log(`Selected: ${items[selected]}`)
    }
  })

  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={i} inverse={i === selected}>
          {i === selected ? "> " : "  "}
          {item}
        </Text>
      ))}
    </Box>
  )
}
```

### Keyboard Shortcuts

```tsx
function App() {
  const { exit } = useApp()

  useInput((input, key) => {
    // Ctrl+C to exit
    if (input === "c" && key.ctrl) {
      exit()
    }

    // Ctrl+S to save
    if (input === "s" && key.ctrl) {
      save()
    }

    // 'h' for help
    if (input === "h") {
      showHelp()
    }
  })

  return <Text>Press h for help, Ctrl+C to quit</Text>
}
```

### Conditional Input

```tsx
function Modal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  // Only listen when modal is open
  useInput(
    (input, key) => {
      if (key.escape) onClose()
    },
    { isActive: isOpen },
  )

  if (!isOpen) return null

  return (
    <Box borderStyle="double">
      <Text>Press Escape to close</Text>
    </Box>
  )
}
```

### Text Input

```tsx
function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  useInput((input, key) => {
    if (key.backspace) {
      onChange(value.slice(0, -1))
    } else if (key.return) {
      // Submit
    } else if (input && !key.ctrl && !key.meta) {
      onChange(value + input)
    }
  })

  return (
    <Box>
      <Text>{value}</Text>
      <Text inverse> </Text>
    </Box>
  )
}
```

### Vi-style Movements

```tsx
function ViNavigation() {
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useInput((input) => {
    switch (input) {
      case "h": // Left
        setPosition((p) => ({ ...p, x: Math.max(0, p.x - 1) }))
        break
      case "j": // Down
        setPosition((p) => ({ ...p, y: p.y + 1 }))
        break
      case "k": // Up
        setPosition((p) => ({ ...p, y: Math.max(0, p.y - 1) }))
        break
      case "l": // Right
        setPosition((p) => ({ ...p, x: p.x + 1 }))
        break
    }
  })

  return (
    <Text>
      Position: ({position.x}, {position.y})
    </Text>
  )
}
```

## Notes

- Input is only captured when the app is in raw mode (default for `render()`)
- Multiple `useInput` hooks can be active simultaneously
- Use `isActive: false` to temporarily disable input handling
