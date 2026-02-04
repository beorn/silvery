# Hooks

Inkx provides the same hooks as Ink, plus layout feedback hooks.

## useContentRect

**Inkx only** - The key addition. Returns the computed dimensions of the component's container.

```tsx
import { Box, Text, useContentRect } from "inkx"

function SizedBox() {
  const { width, height, x, y } = useContentRect()

  return (
    <Box borderStyle="single">
      <Text>
        Size: {width}x{height}
      </Text>
      <Text>
        Position: ({x}, {y})
      </Text>
    </Box>
  )
}
```

::: info Note
`useLayout` is a deprecated alias for `useContentRect`. Both work identically, but prefer `useContentRect` for new code.
:::

### Return Value

| Property | Type     | Description                  |
| -------- | -------- | ---------------------------- |
| `width`  | `number` | Computed width in characters |
| `height` | `number` | Computed height in lines     |
| `x`      | `number` | X position from left edge    |
| `y`      | `number` | Y position from top edge     |

### First Render Behavior

On the first render, dimensions are `{ width: 0, height: 0, x: 0, y: 0 }`. This is because layout hasn't been computed yet. The component will immediately re-render with correct values.

```tsx
function Header() {
  const { width } = useContentRect()

  // Guard against first render if needed
  if (width === 0) return null

  return <Text>{"=".repeat(width)}</Text>
}
```

In practice, both renders happen before the first paint, so this is usually invisible.

## useTerm

**Inkx only** - Access the Term instance for terminal capabilities and styling.

```tsx
import { useTerm } from "inkx"

function ColoredOutput() {
  const term = useTerm()

  return (
    <Box>
      <Text>{term.green("Success!")} Operation completed.</Text>
      <Text>
        Terminal size: {term.columns}x{term.rows}
      </Text>
    </Box>
  )
}
```

### Return Value

Returns the `Term` instance passed to `render()`. Provides:

| Property/Method | Description                        |
| --------------- | ---------------------------------- |
| `columns`       | Terminal width                     |
| `rows`          | Terminal height                    |
| `hasColor()`    | Check if terminal supports colors  |
| Color methods   | `red()`, `green()`, `bold()`, etc. |

## useInput

Handle keyboard input.

```tsx
import { useInput } from "inkx"

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

### Parameters

```tsx
useInput(
  (input: string, key: Key) => void,
  options?: { isActive?: boolean }
)
```

### Key Object

| Property     | Type      | Description           |
| ------------ | --------- | --------------------- |
| `upArrow`    | `boolean` | Up arrow pressed      |
| `downArrow`  | `boolean` | Down arrow pressed    |
| `leftArrow`  | `boolean` | Left arrow pressed    |
| `rightArrow` | `boolean` | Right arrow pressed   |
| `return`     | `boolean` | Enter/Return pressed  |
| `escape`     | `boolean` | Escape pressed        |
| `ctrl`       | `boolean` | Control key held      |
| `shift`      | `boolean` | Shift key held        |
| `meta`       | `boolean` | Meta/Command key held |
| `tab`        | `boolean` | Tab pressed           |
| `backspace`  | `boolean` | Backspace pressed     |
| `delete`     | `boolean` | Delete pressed        |

## useApp

Access app-level controls.

```tsx
import { useApp } from "inkx"

function App() {
  const { exit } = useApp()

  useInput((input) => {
    if (input === "q") exit()
  })

  return <Text>Press q to quit</Text>
}
```

### Return Value

| Property | Type                      | Description  |
| -------- | ------------------------- | ------------ |
| `exit`   | `(error?: Error) => void` | Exit the app |

## useStdout

Access stdout stream and dimensions.

```tsx
import { useStdout } from "inkx"

function App() {
  const { stdout, write } = useStdout()

  return (
    <Text>
      Terminal: {stdout.columns}x{stdout.rows}
    </Text>
  )
}
```

### Return Value

| Property | Type                     | Description              |
| -------- | ------------------------ | ------------------------ |
| `stdout` | `NodeJS.WriteStream`     | stdout stream            |
| `write`  | `(data: string) => void` | Write directly to stdout |

## useStdin

Access stdin stream.

```tsx
import { useStdin } from "inkx"

function App() {
  const { stdin, setRawMode, isRawModeSupported } = useStdin()
  // ...
}
```

### Return Value

| Property             | Type                      | Description                   |
| -------------------- | ------------------------- | ----------------------------- |
| `stdin`              | `NodeJS.ReadStream`       | stdin stream                  |
| `setRawMode`         | `(mode: boolean) => void` | Enable/disable raw mode       |
| `isRawModeSupported` | `boolean`                 | Whether raw mode is supported |

## useFocus

Manage focus state for a component.

```tsx
import { useFocus, Box, Text } from "inkx"

function FocusableItem({ label }: { label: string }) {
  const { isFocused } = useFocus()

  return (
    <Box borderStyle={isFocused ? "double" : "single"}>
      <Text>{label}</Text>
    </Box>
  )
}
```

### Return Value

| Property    | Type      | Description                       |
| ----------- | --------- | --------------------------------- |
| `isFocused` | `boolean` | Whether this component is focused |

### Options

```tsx
useFocus({
  autoFocus?: boolean;  // Focus on mount
  isActive?: boolean;   // Can receive focus
  id?: string;          // Focus ID for programmatic focus
})
```

## useFocusManager

Control focus programmatically.

```tsx
import { useFocusManager } from "inkx"

function App() {
  const { focusNext, focusPrevious, focus } = useFocusManager()

  useInput((input, key) => {
    if (key.tab && key.shift) focusPrevious()
    else if (key.tab) focusNext()
  })

  return (
    <Box flexDirection="column">
      <FocusableItem label="First" />
      <FocusableItem label="Second" />
      <FocusableItem label="Third" />
    </Box>
  )
}
```

### Return Value

| Property        | Type                   | Description                        |
| --------------- | ---------------------- | ---------------------------------- |
| `focusNext`     | `() => void`           | Focus next focusable component     |
| `focusPrevious` | `() => void`           | Focus previous focusable component |
| `focus`         | `(id: string) => void` | Focus component by ID              |
