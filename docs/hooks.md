# Hooks

## useContentRect

Returns the content area dimensions (excluding padding and borders) of the nearest Box ancestor.

```tsx
import { useContentRect } from "inkx"

function ResponsiveCard() {
  const { width, height, x, y } = useContentRect()
  return <Text>{`Content area: ${width}x${height} at (${x},${y})`}</Text>
}
```

This is inkx's core innovation — components know their size _during_ render, not after.

## useScreenRect

Returns the absolute screen position and dimensions.

```tsx
import { useScreenRect } from "inkx"

function Tooltip() {
  const { x, y, width, height } = useScreenRect()
  // Position tooltip relative to screen coordinates
}
```

## useInput

Registers a keyboard input handler. Return `"exit"` to exit the app.

```tsx
import { useInput, type Key } from "inkx/runtime"

function App() {
  useInput((input: string, key: Key) => {
    if (input === "j" || key.downArrow) moveCursor(1)
    if (input === "k" || key.upArrow) moveCursor(-1)
    if (input === "q") return "exit"
  })
}
```

### Key Object

```typescript
interface Key {
  // Navigation
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  pageUp: boolean
  pageDown: boolean
  home: boolean
  end: boolean

  // Action keys
  return: boolean
  escape: boolean
  tab: boolean
  backspace: boolean
  delete: boolean

  // Modifiers — always available
  ctrl: boolean // ⌃ Ctrl
  shift: boolean // ⇧ Shift
  meta: boolean // ⌥ Opt/Alt

  // Modifiers — require Kitty protocol (pass kitty: true to run())
  super: boolean // ⌘ Cmd/Super
  hyper: boolean // ✦ Hyper

  // Kitty protocol extensions
  eventType?: 1 | 2 | 3 // 1=press, 2=repeat, 3=release (requires REPORT_EVENTS flag)
}
```

**Modifier symbols**: Use macOS symbols in `parseHotkey()` for concise hotkey definitions:

```tsx
import { parseHotkey, matchHotkey } from "inkx"

const save = parseHotkey("⌘s")
const palette = parseHotkey("⌃⇧p")
const hyperJump = parseHotkey("✦j")

useInput((input, key) => {
  if (matchHotkey(save, key, input)) save()
  if (matchHotkey(palette, key, input)) openPalette()
})
```

See [Input Features](input-features.md) for the full modifier reference, mouse events, and Kitty protocol details.

## useApp

Access app-level controls:

```tsx
import { useApp } from "inkx"

function App() {
  const { exit } = useApp()

  useInput((input) => {
    if (input === "q") exit()
  })
}
```

With Layer 3 (createApp), `useApp` also accesses the Zustand store:

```tsx
const cursor = useApp((s) => s.cursor)
```

## useTerm

Access terminal capabilities and styling:

```tsx
import { useTerm } from "inkx"

function StatusLine() {
  const term = useTerm()

  return (
    <Text>
      {term.hasColor() ? term.green("OK") : "OK"}
      {` ${term.cols}x${term.rows}`}
    </Text>
  )
}
```

## useFocusable

Makes a component focusable within the tree-based focus system. Reads focus state from `FocusManager` via `useSyncExternalStore`.

The component must have a `testID` prop and `focusable` on its Box ancestor. Optionally set `autoFocus` for initial focus on mount.

```tsx
import { useFocusable } from "inkx"

function FocusablePanel() {
  const { focused, focus, blur, focusOrigin } = useFocusable()
  return (
    <Box testID="panel" focusable borderStyle="single" borderColor={focused ? "green" : "gray"}>
      <Text>{focused ? "Focused!" : "Click to focus"}</Text>
    </Box>
  )
}
```

| Return        | Type                                              | Description                        |
| ------------- | ------------------------------------------------- | ---------------------------------- |
| `focused`     | `boolean`                                         | Whether this node is focused       |
| `focus`       | `() => void`                                      | Focus this node programmatically   |
| `blur`        | `() => void`                                      | Remove focus from this node        |
| `focusOrigin` | `"keyboard" \| "mouse" \| "programmatic" \| null` | How focus was most recently gained |

## useFocusWithin

Returns `true` if focus is anywhere within a subtree. Walks from the focused node up to check if it passes through the given `testID`.

```tsx
import { useFocusWithin } from "inkx"

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

## useScrollback

Push frozen items to terminal scrollback. Tracks a contiguous frozen prefix — when the count increases, renders newly frozen items and writes them to stdout.

Pair with VirtualList's `frozen` prop for the complete experience.

```tsx
import { useScrollback } from "inkx"

const frozenCount = useScrollback(items, {
  frozen: (item) => item.complete,
  render: (item) => `  ✓ ${item.title}`,
})
```

| Option   | Type                                  | Description                               |
| -------- | ------------------------------------- | ----------------------------------------- |
| `frozen` | `(item: T, index: number) => boolean` | Predicate for frozen items                |
| `render` | `(item: T, index: number) => string`  | Render item to string for stdout          |
| `stdout` | `{ write(data: string): boolean }`    | Output stream (default: `process.stdout`) |

Returns the current frozen count (contiguous prefix length).

**Requires inline mode** — scrollback only exists in the normal screen buffer.
