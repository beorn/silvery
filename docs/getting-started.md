# Getting Started with inkx/runtime

inkx/runtime is a layered TUI framework built on React. Write terminal apps the same way you write web apps -- with components, hooks, and state.

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

The `Key` object provides booleans for special keys:

```typescript
interface Key {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  pageDown: boolean
  pageUp: boolean
  home: boolean
  end: boolean
  return: boolean // Enter key
  escape: boolean
  ctrl: boolean // Ctrl modifier
  shift: boolean // Shift modifier
  tab: boolean
  backspace: boolean
  delete: boolean
  meta: boolean // Alt/Option modifier
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

## When You Need More: createApp()

For apps with complex shared state, `createApp()` adds a Zustand store with centralized event handling. Components subscribe to individual slices of state -- no prop drilling, no unnecessary re-renders.

Use `createApp()` when you have:

- Shared state across many components
- Fine-grained subscriptions
- Complex state logic that benefits from centralized updates

```typescript
import { createApp, useApp, type Key } from 'inkx/runtime';
import { Box, Text } from 'inkx';

// Define the app with store factory and event handlers
const app = createApp(
  // Store factory: receives injected values, returns Zustand state creator
  ({ maxItems }: { maxItems: number }) => (set, get) => ({
    items: [] as string[],
    cursor: 0,
    addItem: (text: string) => set(s => ({
      items: s.items.length < maxItems
        ? [...s.items, text]
        : s.items
    })),
    moveCursor: (delta: number) => set(s => ({
      cursor: Math.max(0, Math.min(s.cursor + delta, s.items.length - 1))
    })),
  }),

  // Event handlers: handle keyboard at app level
  {
    key: (input, key, { get }) => {
      if (input === 'j' || key.downArrow) get().moveCursor(1);
      if (input === 'k' || key.upArrow) get().moveCursor(-1);
      if (input === 'a') get().addItem(`Item ${Date.now()}`);
      if (input === 'q') return 'exit';
    },
  }
);

// Components use useApp for fine-grained subscriptions
function ItemList() {
  const items = useApp(s => s.items);
  const cursor = useApp(s => s.cursor);

  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={item} color={i === cursor ? 'cyan' : undefined}>
          {i === cursor ? '› ' : '  '}{item}
        </Text>
      ))}
    </Box>
  );
}

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>My Items</Text>
      <ItemList />
    </Box>
  );
}

// Run with injected values
const handle = await app.run(<App />, { maxItems: 100 });
await handle.waitUntilExit();

// Access final state
console.log('Final items:', handle.store.getState().items);
```

### Key Handler Signature (createApp)

```typescript
type KeyHandler<S> = (input: string, key: Key, ctx: { set: SetState<S>; get: GetState<S> }) => void | "exit"
```

### AppHandle API

```typescript
interface AppHandle<S> {
  text: string
  store: StoreApi<S> // Full Zustand store access
  waitUntilExit(): Promise<void>
  unmount(): void
  press(key: string): Promise<void>
}
```

## Maximum Control: createRuntime()

For Elm-style architecture, custom event loops, or integration with external event sources, `createRuntime()` gives you full control over the render loop. This is the escape hatch -- most apps don't need it.

```typescript
import { createRuntime, layout, ensureLayoutEngine, merge } from 'inkx/runtime';
import { Text } from 'inkx';

// Initialize layout engine once
await ensureLayoutEngine();

// Create render target
const target = {
  write: (frame: string) => process.stdout.write(frame),
  getDims: () => ({ cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 }),
  onResize: (handler: (dims) => void) => {
    process.stdout.on('resize', () => handler(target.getDims()));
    return () => process.stdout.off('resize', handler);
  },
};

// State
interface State { count: number; shouldExit: boolean }

// Pure reducer
function reducer(state: State, event: Event): State {
  if (event.type === 'key') {
    if (event.key === 'j') return { ...state, count: state.count + 1 };
    if (event.key === 'k') return { ...state, count: state.count - 1 };
    if (event.key === 'q') return { ...state, shouldExit: true };
  }
  return state;
}

// Pure view
function view(state: State) {
  return <Text>Count: {state.count}</Text>;
}

// Event loop
using runtime = createRuntime({ target });

let state: State = { count: 0, shouldExit: false };

// Merge keyboard events with runtime events (resize, effects)
const keyboardEvents = createKeyboardSource();  // Your implementation
const allEvents = merge(keyboardEvents, runtime.events());

for await (const event of allEvents) {
  state = reducer(state, event);

  const buffer = layout(view(state), runtime.getDims());
  runtime.render(buffer);

  if (state.shouldExit) break;
}
```

### Schedule Effects

```typescript
// Schedule async work
runtime.schedule(async () => {
  const data = await fetchData()
  return data
})

// Receive result as event
for await (const event of runtime.events()) {
  if (event.type === "effect") {
    console.log("Data:", event.result)
  }
}

// Cancel with AbortSignal
const controller = new AbortController()
runtime.schedule(async () => await longTask(), { signal: controller.signal })
controller.abort() // Cancels the effect
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  createApp().run()                                           │
│           Zustand store, flattened providers, useApp         │
├─────────────────────────────────────────────────────────────┤
│  run()  ← Start here                                        │
│           React components, useInput, useState               │
├─────────────────────────────────────────────────────────────┤
│  createRuntime()                                             │
│           events(), render(), user-driven loop               │
├─────────────────────────────────────────────────────────────┤
│  layout() / diff()                                           │
│           Pure functions, static output                       │
└─────────────────────────────────────────────────────────────┘
```

Each layer builds on the one below. `run()` uses `createRuntime()` internally; `createApp()` uses `run()` internally.

## Stream Helpers

All layers use AsyncIterable streams. Compose them with helpers:

```typescript
import { merge, map, filter, takeUntil, throttle } from "inkx/runtime"

// Merge multiple sources
const events = merge(keyboardEvents, timerEvents)

// Transform
const keyEvents = map(rawKeys, (k) => ({ type: "key", key: k }))

// Filter
const letters = filter(keyEvents, (e) => e.key.length === 1)

// Stop on signal
const bounded = takeUntil(events, abortSignal)

// Throttle
const throttled = throttle(mouseMoves, 16) // ~60fps
```

## Tick Sources

For animations and periodic updates:

```typescript
import { createTick, createFrameTick, createAdaptiveTick } from "inkx/runtime"

// Fixed interval
const everySecond = createTick(1000)

// 60fps
const frames = createFrameTick()

// Adaptive (slows when idle)
const adaptive = createAdaptiveTick()

// Use with merge
const events = merge(keyboard, createTick(100))
for await (const event of events) {
  if (event.type === "tick") {
    // Update animation
  }
}
```

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

## Examples

| File                  | Layer             | Description             |
| --------------------- | ----------------- | ----------------------- |
| `run-counter.tsx`     | `run()`           | React hooks counter     |
| `app-todo.tsx`        | `createApp()`     | Todo list with Zustand  |
| `hello-runtime.tsx`   | `createRuntime()` | Minimal static render   |
| `runtime-counter.tsx` | `createRuntime()` | Counter with schedule() |
| `mode3-counter.tsx`   | `createRuntime()` | Elm-style with keyboard |

Run examples:

```bash
bun examples/run-counter.tsx
bun examples/app-todo.tsx
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
2. Read the source: `src/runtime/` has all implementations
3. Build something: Start with `run()`, upgrade to `createApp()` if needed
