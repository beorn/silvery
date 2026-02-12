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
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  pageUp: boolean
  pageDown: boolean
  home: boolean
  end: boolean
  return: boolean
  escape: boolean
  tab: boolean
  backspace: boolean
  delete: boolean
  ctrl: boolean
  shift: boolean
  meta: boolean
}
```

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

## useFocus

Manage focus for interactive components:

```tsx
import { useFocus } from "inkx"

function ListItem({ id }) {
  const { isFocused } = useFocus({ id })
  return <Text color={isFocused ? "blue" : undefined}>{id}</Text>
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
