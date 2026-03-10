# Getting Started with `silvery/runtime`

This is the "start simple" part — five lines to a working app. `silvery/runtime` is a layered TUI framework built on React. Write terminal apps the same way you write web apps — with components, hooks, and state. When you outgrow `useState`, [Building an App](building-an-app.md) shows how to graduate without rewriting. The core idea: each level you adopt turns something that was hidden — state transitions, side effects, user intent — into visible, inspectable data. You only pay for what you need.

## Your First App

Create a terminal with `createTerm()`, then pass it to `run()`:

```typescript
import { createTerm } from 'silvery';
import { run, useInput } from '@silvery/term/runtime';
import { Text } from '@silvery/term';
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

using term = createTerm();
await run(<Counter />, term);
```

Run it and you'll see:

```
Count: 0 (j/k to change, q to quit)
```

Press `j` a few times:

```
Count: 3 (j/k to change, q to quit)
```

That's a complete, working TUI app. `run()` handles terminal setup, keyboard input, rendering, and cleanup. You write React components.

## Building with run()

### Keyboard Input

Use `useInput` to handle keyboard events. Return `'exit'` from the handler to quit the app.

```typescript
import { run, useInput, type Key } from "@silvery/term/runtime";

useInput((input: string, key: Key) => {
  // Regular characters
  if (input === "a") doSomething();

  // Special keys
  if (key.return) submit();
  if (key.escape) cancel();
  if (key.tab) nextField();

  // Arrow keys
  if (key.upArrow) moveCursor(-1);
  if (key.downArrow) moveCursor(1);

  // Modifiers
  if (key.ctrl && input === "c") return "exit";

  // Text input
  if (input.length === 1) addChar(input);
});
```

The `Key` object provides booleans for special keys and modifiers:

```typescript
interface Key {
  // Navigation
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageDown: boolean;
  pageUp: boolean;
  home: boolean;
  end: boolean;

  // Action keys
  return: boolean; // Enter key
  escape: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;

  // Modifiers
  ctrl: boolean; // ⌃ Ctrl
  shift: boolean; // ⇧ Shift
  meta: boolean; // ⌥ Opt/Alt
  super: boolean; // ⌘ Cmd/Super (requires Kitty protocol)
  hyper: boolean; // ✦ Hyper (requires Kitty protocol)

  // Kitty protocol extensions
  eventType?: 1 | 2 | 3; // 1=press, 2=repeat, 3=release (requires REPORT_EVENTS)
}
```

Wrap handlers in `useCallback` when they depend on state to prevent unnecessary re-subscriptions:

```typescript
const handleInput = useCallback(
  (input: string, key: Key) => {
    if (input === "j" || key.downArrow) setCursor((c) => Math.min(c + 1, items.length - 1));
    if (input === "k" || key.upArrow) setCursor((c) => Math.max(c - 1, 0));
    if (input === "q") return "exit";
  },
  [items.length],
);

useInput(handleInput);
```

### Responsive Layout

Components can know their size during render:

```typescript
import { useContentRect } from '@silvery/term';

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
import { useTerm } from '@silvery/term';

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
import { run, useInput, useExit, type Key } from '@silvery/term/runtime';
import { Box, Text, useContentRect } from '@silvery/term';
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
  text: string; // Current rendered text (no ANSI)
  waitUntilExit(): Promise<void>;
  unmount(): void;
  press(key: string): Promise<void>; // For testing
}
```

### Advanced Input: Kitty Protocol and Mouse

Enable Cmd ⌘, Hyper ✦ modifiers and mouse tracking via `run()` options:

```typescript
import { run, useInput } from "@silvery/term/runtime"
import { KittyFlags } from "@silvery/term"

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

### Browser Rendering (xterm.js)

The same `run()` API works in the browser via [xterm.js](https://xtermjs.org/). Pass a `terminal` option pointing to an xterm.js `Terminal` instance, and silvery renders to it instead of `process.stdout`:

```tsx
import { run, useInput } from "@silvery/term/runtime";
import { Box, Text } from "silvery";
import { Terminal } from "@xterm/xterm";
import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);

  useInput((input, key) => {
    if (input === "j" || key.downArrow) setCount((c) => c + 1);
    if (input === "k" || key.upArrow) setCount((c) => c - 1);
    if (input === "q") return "exit";
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Browser Counter</Text>
      <Text>Count: {count} (j/k to change, q to quit)</Text>
    </Box>
  );
}

// Set up xterm.js
const term = new Terminal({ cols: 80, rows: 24 });
term.open(document.getElementById("terminal")!);

// Same run() API — just add { terminal }
const handle = await run(<App />, {
  terminal: term,
  mouse: true,
});
```

**Same components, same hooks, same code** -- the only difference is passing `{ terminal: term }` instead of letting `run()` use `process.stdout`.

Key differences from Node.js mode:

- **No Kitty protocol** -- xterm.js has its own keyboard handling, so `kitty` option is ignored
- **No Ctrl+Z suspend** -- suspend/resume is a Node.js concept
- **Resize handling** -- xterm.js doesn't emit SIGWINCH. Resize the terminal externally (e.g., via `FitAddon`) and the app re-renders automatically
- **Mouse events** -- `mouse: true` enables SGR mouse tracking, which xterm.js supports natively

::: info Legacy API
For simpler use cases where you don't need the full runtime (no `useInput`, no focus management, no event loop), `renderToXterm()` from `@silvery/term/xterm` provides a lightweight renderer. The `run()` API is recommended for new apps because it provides the complete feature set.
:::

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

`silvery/runtime` is compatible with existing Silvery components. Key differences:

| Ink                    | `silvery/runtime`                           |
| ---------------------- | ------------------------------------------- |
| `useInput(input, key)` | `useInput(input, key)` (same signature!)    |
| `useApp().exit()`      | `return 'exit'` from handler or `useExit()` |
| Props for callbacks    | Store actions (createApp)                   |

## What's Next

When your app outgrows `useState` and `useInput`, the progression guide shows how to grow without rewriting:

- [Building an App](building-an-app.md) — from Counter to full TEA, one level at a time

For API details, see [State Management](state-management.md) and [Event Handling](event-handling.md). You can also explore the [Components](../reference/components.md) and [Hooks](../reference/hooks.md) references.
