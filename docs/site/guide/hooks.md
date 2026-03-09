# Hooks

silvery provides the same hooks as Ink, plus layout feedback hooks.

## useContentRect

**silvery only** - The key addition. Returns the computed dimensions of the component's container.

```tsx
import { Box, Text, useContentRect } from "@silvery/term"

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

**silvery only** - Access the Term instance for terminal capabilities and styling.

```tsx
import { useTerm } from "@silvery/term"

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
import { useInput } from "@silvery/term"

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
import { useApp } from "@silvery/term"

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
import { useStdout } from "@silvery/term"

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

## useFocusable

Returns focus state for the nearest focusable ancestor. The component must be rendered inside a `<Box focusable>` with a `testID`.

```tsx
import { useFocusable, Box, Text } from "@silvery/term"

function FocusableItem({ label }: { label: string }) {
  const { focused } = useFocusable()

  return (
    <Box testID={label} focusable borderStyle={focused ? "double" : "single"}>
      <Text>{label}</Text>
    </Box>
  )
}
```

### Return Value

| Property      | Type                                              | Description                                |
| ------------- | ------------------------------------------------- | ------------------------------------------ |
| `focused`     | `boolean`                                         | Whether this component currently has focus |
| `focus`       | `() => void`                                      | Programmatically focus this component      |
| `blur`        | `() => void`                                      | Programmatically blur this component       |
| `focusOrigin` | `"keyboard" \| "mouse" \| "programmatic" \| null` | How focus was acquired                     |

Focus behavior is configured via Box props: `focusable`, `autoFocus`, `focusScope`, `onFocus`, `onBlur`, `onKeyDown`.

## useFocusWithin

Returns whether any descendant of the specified Box (by `testID`) has focus.

```tsx
import { useFocusWithin } from "@silvery/term"

function Sidebar() {
  const hasFocus = useFocusWithin("sidebar")

  return (
    <Box testID="sidebar" borderColor={hasFocus ? "blue" : "gray"}>
      <FocusableItem testID="item1" />
      <FocusableItem testID="item2" />
    </Box>
  )
}
```

## useFocusManager

Access the focus manager for programmatic focus control.

```tsx
import { useFocusManager } from "@silvery/term"

function App() {
  const { activeId, focusNext, focusPrev, focus, blur } = useFocusManager()

  return (
    <Box flexDirection="column">
      <Text>Active: {activeId ?? "none"}</Text>
      <FocusableItem label="First" />
      <FocusableItem label="Second" />
      <FocusableItem label="Third" />
    </Box>
  )
}
```

### Return Value

| Property        | Type                   | Description                          |
| --------------- | ---------------------- | ------------------------------------ |
| `activeId`      | `string \| null`       | testID of the currently focused node |
| `activeElement` | `SilveryNode \| null`  | The currently focused node           |
| `focused`       | `boolean`              | Whether any node has focus           |
| `focus`         | `(id: string) => void` | Focus a specific component by testID |
| `focusNext`     | `() => void`           | Focus next focusable component       |
| `focusPrev`     | `() => void`           | Focus previous focusable component   |
| `blur`          | `() => void`           | Clear focus from all components      |
