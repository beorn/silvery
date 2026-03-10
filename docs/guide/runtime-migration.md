# Migration Guide: Silvery → `silvery/runtime`

This guide explains how to migrate from the legacy Silvery API to the new `silvery/runtime`.

## Why Migrate?

The new `silvery/runtime` API provides:

- **AsyncIterable-first architecture** - Composable event streams
- **Layered design** - Pick the abstraction level you need
- **Better testing** - All layers testable without a terminal
- **Zustand integration** - Fine-grained subscriptions for complex apps
- **Rich Key parsing** - Arrow keys, modifiers, special keys out of the box
- **Unified API for Node.js and browser** - Same `run()` call with `{ terminal }` for xterm.js

## Import Changes

| Old (Silvery)                                         | New (silvery/runtime)                              |
| ----------------------------------------------------- | -------------------------------------------------- |
| `import { render } from '@silvery/term'`              | `import { run } from '@silvery/term/runtime'`      |
| `import { useInput } from '@silvery/term'`            | `import { useInput } from '@silvery/term/runtime'` |
| `import { useApp } from '@silvery/term'`              | `import { useExit } from '@silvery/term/runtime'`  |
| `import { renderToXterm } from '@silvery/term/xterm'` | `import { run } from '@silvery/term/runtime'`      |

## useInput Signature

The `useInput` signature is the same as the original Ink:

```typescript
// Both old and new use this signature:
useInput((input: string, key: Key) => {
  if (input === "q") return "exit";
  if (key.upArrow) moveCursor(-1);
  if (key.ctrl && input === "c") return "exit";
});
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
const exit = useExit();
// Later...
exit();
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
import { render, useInput, useApp } from "@silvery/term";

function App() {
  const [count, setCount] = useState(0);
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === "j") setCount((c) => c + 1);
    if (key.upArrow) setCount((c) => c + 1);
    if (input === "q") exit();
  });

  return <Text>Count: {count}</Text>;
}

await render(<App />);
```

**After:**

```tsx
import { run, useInput } from "@silvery/term/runtime";

function App() {
  const [count, setCount] = useState(0);

  useInput((input, key) => {
    if (input === "j") setCount((c) => c + 1);
    if (key.upArrow) setCount((c) => c + 1);
    if (input === "q") return "exit"; // Return 'exit' instead of calling exit()
  });

  return <Text>Count: {count}</Text>;
}

await run(<App />);
```

### Complex App (Layer 3)

**Before:**

```tsx
import { render, useInput } from "@silvery/term";
// Manual prop drilling for state

function App({ items, cursor, onMove }) {
  useInput((input) => {
    if (input === "j") onMove(1);
    if (input === "k") onMove(-1);
  });
  return <List items={items} cursor={cursor} />;
}

// State management outside component tree
```

**After:**

```tsx
import { createApp, useApp, type Key } from "@silvery/term/runtime";

const app = createApp(
  () => (set) => ({
    items: [],
    cursor: 0,
    moveCursor: (d) => set((s) => ({ cursor: s.cursor + d })),
  }),
  {
    key: (input, key, { get }) => {
      if (input === "j" || key.downArrow) get().moveCursor(1);
      if (input === "k" || key.upArrow) get().moveCursor(-1);
      if (input === "q") return "exit";
    },
  },
);

function App() {
  const items = useApp((s) => s.items); // Fine-grained subscription
  const cursor = useApp((s) => s.cursor); // Only re-renders when these change
  return <List items={items} cursor={cursor} />;
}

await app.run(<App />);
```

## Testing

| Old                           | New                                 |
| ----------------------------- | ----------------------------------- |
| Mock terminal, capture output | `handle.text` accessor              |
| Complex setup                 | `const handle = await run(<App />)` |
| Manual unmount                | `handle.unmount()`                  |

## Browser Rendering (xterm.js)

**Before:**

```tsx
import { renderToXterm } from "@silvery/term/xterm";

const instance = renderToXterm(<App />, term, {
  input: {
    onKey: (data) => handleKey(data),
    onMouse: ({ x, y, button }) => handleMouse(x, y, button),
    onFocus: (focused) => handleFocus(focused),
  },
});

// Resize
instance.resize(term.cols, term.rows);

// Cleanup
instance.unmount();
```

**After:**

```tsx
import { run } from "@silvery/term/runtime";

const handle = await run(<App />, {
  terminal: term,
  mouse: true,
});

// Cleanup
handle.unmount();
```

With `run()`, input handling moves into the component tree via `useInput()` and the focus system -- no manual event bus needed. Mouse events and focus are handled automatically by the runtime.

## Components Stay the Same

Box, Text, and other components work identically:

```tsx
// Same in both APIs
import { Box, Text } from "silvery";

function Card() {
  return (
    <Box borderStyle="round" padding={1}>
      <Text bold>Title</Text>
    </Box>
  );
}
```

## Deprecated APIs

The following from the old Silvery API are **deprecated** and will be removed:

| Deprecated              | Replacement                                             |
| ----------------------- | ------------------------------------------------------- |
| `render()`              | `run()` from silvery/runtime                            |
| `renderToXterm()`       | `run(<App />, { terminal: term })` from silvery/runtime |
| `useInput` from Silvery | `useInput` from silvery/runtime                         |
| `useApp()` for exit     | `useExit()` or `return 'exit'`                          |
| `RenderScheduler`       | Built into `run()` with automatic batching              |

## Future

The legacy `silvery` API will be removed in the next major version. The `silvery/runtime` API is the only recommended path for new development.
