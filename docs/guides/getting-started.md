# Getting Started with inkx/runtime

> Start simple, sip some TEA, or go full TEA. This tutorial is the "start simple" part — five lines to a working app.

inkx/runtime is a layered TUI framework built on React. Write terminal apps the same way you write web apps — with components, hooks, and state. When you're ready to grow, the [State Management](state-management.md) and [Event Handling](event-handling.md) guides show how each level builds on the last.

## Your First App

The fastest way to build an interactive terminal app is `run()`:

```typescript
import { run, useInput } from 'inkx/runtime';
import { Text } from 'inkx';
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  useInput((input, key) => {
    if (input === 'j' || key.downArrow) setCount(c => c + 1);
    if (input === 'k' || key.upArrow) setCount(c => c - 1);
    if (input === 'q') return 'exit';
  });

  return <Text>Count: {count} (j/k to change, q to quit)</Text>;
}

await run(<Counter />);
```

That's a complete, working TUI app. `run()` handles terminal setup, keyboard input, rendering, and cleanup. You write React components.

## Building with run()

### Keyboard Input

Use `useInput` to handle keyboard events. Return `'exit'` from the handler to quit the app.

```typescript
import { run, useInput, type Key } from "inkx/runtime"

useInput((input: string, key: Key) => {
  // Regular characters
  if (input === "a") doSomething()

  // Special keys
  if (key.return) submit()
  if (key.escape) cancel()
  if (key.tab) nextField()

  // Arrow keys
  if (key.upArrow) moveCursor(-1)
  if (key.downArrow) moveCursor(1)

  // Modifiers
  if (key.ctrl && input === "c") return "exit"

  // Text input
  if (input.length === 1) addChar(input)
})
```

The `Key` object provides booleans for special keys and modifiers:

```typescript
interface Key {
  // Navigation
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  pageDown: boolean
  pageUp: boolean
  home: boolean
  end: boolean

  // Action keys
  return: boolean // Enter key
  escape: boolean
  tab: boolean
  backspace: boolean
  delete: boolean

  // Modifiers
  ctrl: boolean // ⌃ Ctrl
  shift: boolean // ⇧ Shift
  meta: boolean // ⌥ Opt/Alt
  super: boolean // ⌘ Cmd/Super (requires Kitty protocol)
  hyper: boolean // ✦ Hyper (requires Kitty protocol)

  // Kitty protocol extensions
  eventType?: 1 | 2 | 3 // 1=press, 2=repeat, 3=release (requires REPORT_EVENTS)
}
```

Wrap handlers in `useCallback` when they depend on state to prevent unnecessary re-subscriptions:

```typescript
const handleInput = useCallback(
  (input: string, key: Key) => {
    if (input === "j" || key.downArrow) setCursor((c) => Math.min(c + 1, items.length - 1))
    if (input === "k" || key.upArrow) setCursor((c) => Math.max(c - 1, 0))
    if (input === "q") return "exit"
  },
  [items.length],
)

useInput(handleInput)
```

### Layout Feedback

Components can know their size during render -- inkx's core innovation:

```typescript
import { useContentRect } from 'inkx';

function ResponsivePanel() {
  const { width, height } = useContentRect();

  return (
    <Box flexDirection="column">
      <Text>Panel is {width}x{height}</Text>
      {height > 10 && <Text>Extra content when tall enough</Text>}
    </Box>
  );
}
```

### Terminal Capabilities

Access terminal info and styling with `useTerm`:

```typescript
import { useTerm } from 'inkx';

function StatusLine() {
  const term = useTerm();

  return (
    <Text>
      {term.hasColor() ? term.green('OK') : 'OK'}
      {` ${term.cols}x${term.rows}`}
    </Text>
  );
}
```

### A Complete Example: Interactive List

Putting hooks together into a real app:

```typescript
import { run, useInput, useExit, type Key } from 'inkx/runtime';
import { Box, Text, useContentRect } from 'inkx';
import { useState, useCallback } from 'react';

function App() {
  const [items, setItems] = useState(['Apple', 'Banana', 'Cherry']);
  const [cursor, setCursor] = useState(0);
  const { width } = useContentRect();

  const handleInput = useCallback((input: string, key: Key) => {
    if (input === 'j' || key.downArrow) setCursor(c => Math.min(c + 1, items.length - 1));
    if (input === 'k' || key.upArrow) setCursor(c => Math.max(c - 1, 0));
    if (input === 'q') return 'exit';
  }, [items.length]);

  useInput(handleInput);

  return (
    <Box flexDirection="column">
      <Text bold>{'─'.repeat(width)}</Text>
      {items.map((item, i) => (
        <Text key={item} color={i === cursor ? 'cyan' : undefined}>
          {i === cursor ? '› ' : '  '}{item}
        </Text>
      ))}
    </Box>
  );
}

const handle = await run(<App />);
await handle.waitUntilExit();
```

### RunHandle API

`run()` returns a handle for programmatic control:

```typescript
interface RunHandle {
  text: string // Current rendered text (no ANSI)
  waitUntilExit(): Promise<void>
  unmount(): void
  press(key: string): Promise<void> // For testing
}
```

### Advanced Input: Kitty Protocol and Mouse

Enable Cmd ⌘, Hyper ✦ modifiers and mouse tracking via `run()` options:

```typescript
import { run, useInput } from "inkx/runtime"
import { KittyFlags } from "inkx"

function App() {
  useInput((input, key) => {
    if (key.super && input === "s") save()          // ⌘S
    if (key.super && key.shift && input === "p") {   // ⌘⇧P
      openCommandPalette()
    }
    if (input === "q") return "exit"
  })
  return <Text>Press ⌘S to save</Text>
}

await run(<App />, {
  kitty: true,   // Auto-detect Kitty protocol, enable ⌘/✦ modifiers
  mouse: true,   // Enable mouse click/scroll/drag events
})
```

See [Input Features](../reference/input-features.md) for the full reference.

## Testing

All layers support testing without a real terminal:

```typescript
// run()
const handle = await run(<Counter />, { cols: 80, rows: 24 });
expect(handle.text).toContain('Count: 0');
await handle.press('j');
expect(handle.text).toContain('Count: 1');
handle.unmount();

// createApp()
const handle = await app.run(<App />, { cols: 80, rows: 24 });
expect(handle.store.getState().count).toBe(0);
await handle.press('j');
expect(handle.store.getState().count).toBe(1);
handle.unmount();
```

## Migration from Ink

inkx/runtime is compatible with existing inkx components. Key differences:

| Ink                    | inkx/runtime                                |
| ---------------------- | ------------------------------------------- |
| `useInput(input, key)` | `useInput(input, key)` (same signature!)    |
| `useApp().exit()`      | `return 'exit'` from handler or `useExit()` |
| Props for callbacks    | Store actions (createApp)                   |

## Next Steps

1. Try the examples: `bun examples/run-counter.tsx`
2. For deeper understanding of inkx's runtime architecture, see [runtime-layers.md](runtime-layers.md)
3. Read the source: `src/runtime/` has all implementations
4. Build something: Start with `run()`, upgrade to `createApp()` if needed
