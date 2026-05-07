# Hooks

Silvery provides hooks for input handling, layout queries, terminal access, and interaction features.

## Interaction Feature Hooks

These hooks read state from the interactions runtime (features registered in the `CapabilityRegistry`). They require no provider wrappers — just use the corresponding `with*` provider in your app's `pipe()` chain.

### useSelection

Reads the current text selection state from the `SelectionFeature`. Available when `withDomEvents()` is in the provider chain.

```tsx
import { useSelection } from "silvery"

function SelectionIndicator() {
  const selection = useSelection()
  if (!selection?.active) return null
  return <Text>Selected: {selection.text}</Text>
}
```

Returns `TerminalSelectionState | undefined` — `undefined` when no selection feature is registered.

::: info Legacy hooks
The following hooks are superseded by the feature-based architecture but still exist for backwards compatibility: `useTerminalSelection`, `usePointerState`, `useFind`, `useFindProvider`, `useCopyMode`, `useCopyProvider`. New code should use `useSelection()` and the automatic feature activation via `withDomEvents()` / `withFocus()`.
:::

## useBoxRect

Returns the computed dimensions of the component's content area — width, height, and position.

```tsx
import { Box, Text, useBoxRect } from "silvery"

function SizedBox() {
  const { width, height, x, y } = useBoxRect()

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
`useLayout` is a deprecated alias for `useBoxRect`. Both work identically, but prefer `useBoxRect` for new code.
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
  const { width } = useBoxRect()

  // Guard against first render if needed
  if (width === 0) return null

  return <Text>{"=".repeat(width)}</Text>
}
```

In practice, both renders happen before the first paint, so this is usually invisible.

### MeasuredBox primitive

For the common pattern of "render based on my own measured size," use the [`<MeasuredBox>`](../api/measured-box.md) primitive instead of writing the `useBoxRect() + width > 0 ? <Inner /> : null` dance by hand:

```tsx
import { MeasuredBox } from "silvery"
;<MeasuredBox width="100%" flexDirection="column" alignItems="center">
  {({ width }) => <Banner availableWidth={width} />}
</MeasuredBox>
```

`MeasuredBox` defers rendering its render-prop children until the outer Box's measured width is non-zero — eliminating the width=0 sentinel frame.

## useTerm

Access the Term instance for terminal capabilities and styling.

```tsx
import { useTerm } from "silvery"

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
import { useInput } from "silvery"

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
import { useApp } from "silvery"

function App() {
  const { exit, panic } = useApp()

  useInput((input) => {
    if (input === "q") exit()
    if (input === "P") panic("fatal provider invariant", { title: "my-app" })
  })

  return <Text>Press q to quit</Text>
}
```

### Return Value

| Property | Type                                                | Description                                                                |
| -------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| `exit`   | `(error?: Error) => void`                           | Exit the app                                                               |
| `panic`  | `(reason: unknown, options?: PanicOptions) => void` | Restore the terminal, then print a copyable fatal diagnostic to `stderr`   |

## useStdout

Access stdout stream and dimensions.

```tsx
import { useStdout } from "silvery"

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
import { useFocusable, Box, Text } from "silvery"

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
import { useFocusWithin } from "silvery"

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
import { useFocusManager } from "silvery"

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
