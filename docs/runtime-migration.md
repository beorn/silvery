# Migration Guide: inkx → inkx/runtime

This guide explains how to migrate from the legacy inkx API to the new inkx/runtime.

## Why Migrate?

The new `inkx/runtime` API provides:

- **AsyncIterable-first architecture** - Composable event streams
- **Layered design** - Pick the abstraction level you need
- **Better testing** - All layers testable without a terminal
- **Zustand integration** - Fine-grained subscriptions for complex apps
- **Rich Key parsing** - Arrow keys, modifiers, special keys out of the box

## Import Changes

| Old (inkx)                        | New (inkx/runtime)                        |
| --------------------------------- | ----------------------------------------- |
| `import { render } from 'inkx'`   | `import { run } from 'inkx/runtime'`      |
| `import { useInput } from 'inkx'` | `import { useInput } from 'inkx/runtime'` |
| `import { useApp } from 'inkx'`   | `import { useExit } from 'inkx/runtime'`  |

## useInput Signature

The `useInput` signature is the same as the original Ink:

```typescript
// Both old and new use this signature:
useInput((input: string, key: Key) => {
  if (input === "q") return "exit"
  if (key.upArrow) moveCursor(-1)
  if (key.ctrl && input === "c") return "exit"
})
```

The `Key` object contains:

- Arrow keys: `upArrow`, `downArrow`, `leftArrow`, `rightArrow`
- Navigation: `pageUp`, `pageDown`, `home`, `end`
- Special keys: `return`, `escape`, `tab`, `backspace`, `delete`
- Modifiers: `ctrl`, `shift`, `meta`

## Exit Handling

| Old                                  | New                          |
| ------------------------------------ | ---------------------------- |
| `const { exit } = useApp(); exit();` | `return 'exit'` from handler |
| Imperative call                      | Declarative return value     |

Or use the `useExit()` hook for imperative exit:

```typescript
const exit = useExit()
// Later...
exit()
```

## Layer Selection

Choose based on your needs:

| Need          | Layer | Import                  |
| ------------- | ----- | ----------------------- |
| React hooks   | 2     | `run, useInput`         |
| Zustand store | 3     | `createApp, useApp`     |
| Full control  | 1     | `createRuntime, layout` |

## Migration Examples

### Basic App (Layer 2)

**Before:**

```tsx
import { render, useInput, useApp } from "inkx"

function App() {
  const [count, setCount] = useState(0)
  const { exit } = useApp()

  useInput((input, key) => {
    if (input === "j") setCount((c) => c + 1)
    if (key.upArrow) setCount((c) => c + 1)
    if (input === "q") exit()
  })

  return <Text>Count: {count}</Text>
}

await render(<App />)
```

**After:**

```tsx
import { run, useInput } from "inkx/runtime"

function App() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "j") setCount((c) => c + 1)
    if (key.upArrow) setCount((c) => c + 1)
    if (input === "q") return "exit" // Return 'exit' instead of calling exit()
  })

  return <Text>Count: {count}</Text>
}

await run(<App />)
```

### Complex App (Layer 3)

**Before:**

```tsx
import { render, useInput } from "inkx"
// Manual prop drilling for state

function App({ items, cursor, onMove }) {
  useInput((input) => {
    if (input === "j") onMove(1)
    if (input === "k") onMove(-1)
  })
  return <List items={items} cursor={cursor} />
}

// State management outside component tree
```

**After:**

```tsx
import { createApp, useApp, type Key } from "inkx/runtime"

const app = createApp(
  () => (set) => ({
    items: [],
    cursor: 0,
    moveCursor: (d) => set((s) => ({ cursor: s.cursor + d })),
  }),
  {
    key: (input, key, { get }) => {
      if (input === "j" || key.downArrow) get().moveCursor(1)
      if (input === "k" || key.upArrow) get().moveCursor(-1)
      if (input === "q") return "exit"
    },
  },
)

function App() {
  const items = useApp((s) => s.items) // Fine-grained subscription
  const cursor = useApp((s) => s.cursor) // Only re-renders when these change
  return <List items={items} cursor={cursor} />
}

await app.run(<App />)
```

## Testing

| Old                           | New                                 |
| ----------------------------- | ----------------------------------- |
| Mock terminal, capture output | `handle.text` accessor              |
| Complex setup                 | `const handle = await run(<App />)` |
| Manual unmount                | `handle.unmount()`                  |

## Components Stay the Same

Box, Text, and other components work identically:

```tsx
// Same in both APIs
import { Box, Text } from "inkx"

function Card() {
  return (
    <Box borderStyle="round" padding={1}>
      <Text bold>Title</Text>
    </Box>
  )
}
```

## Deprecated APIs

The following from the old inkx API are **deprecated** and will be removed:

| Deprecated           | Replacement                                |
| -------------------- | ------------------------------------------ |
| `render()`           | `run()` from inkx/runtime                  |
| `useInput` from inkx | `useInput` from inkx/runtime               |
| `useApp()` for exit  | `useExit()` or `return 'exit'`             |
| `RenderScheduler`    | Built into `run()` with automatic batching |

## Future

The legacy `inkx` API will be removed in the next major version. The `inkx/runtime` API is the only recommended path for new development.
