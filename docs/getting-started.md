# Getting Started with inkx/runtime

inkx/runtime is a layered TUI framework built on AsyncIterables. It's like a game loop for terminals: events come in, state updates, view renders.

## Choose Your Layer

inkx/runtime has three layers. Pick the one that matches your needs:

| Layer | Entry Point       | Best For                   | State Management     |
| ----- | ----------------- | -------------------------- | -------------------- |
| 1     | `createRuntime()` | Maximum control, Elm-style | Your choice          |
| 2     | `run()`           | React hooks                | `useState/useEffect` |
| 3     | `createApp()`     | Complex apps               | Zustand store        |

**Start with Layer 2** (`run()`) for most apps. Move to Layer 1 for control or Layer 3 for complex state.

## Quick Start: Layer 2 (Recommended)

```typescript
import { run, useInput, type Key } from 'inkx/runtime';
import { Text } from 'inkx';

function Counter() {
  const [count, setCount] = useState(0);

  useInput((input, key) => {
    if (input === 'j') setCount(c => c + 1);
    if (input === 'k') setCount(c => c - 1);
    if (key.upArrow) setCount(c => c + 1);
    if (key.downArrow) setCount(c => c - 1);
    if (input === 'q') return 'exit';
  });

  return <Text>Count: {count}</Text>;
}

await run(<Counter />);
```

That's it. Full React with keyboard input.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: createApp().run()                                 │
│           Zustand store, flattened providers, useApp        │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: run()  ← Start here                               │
│           React components, useInput, useState              │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: createRuntime()                                   │
│           events(), render(), user-driven loop              │
├─────────────────────────────────────────────────────────────┤
│  Layer 0: layout() / diff()                                 │
│           Pure functions, static output                      │
└─────────────────────────────────────────────────────────────┘
```

## Layer 2: React Hooks (`run()`)

Use `run()` when you want React hooks (useState, useEffect) with minimal setup.

```typescript
import { run, useInput, useExit, type Key } from 'inkx/runtime';
import { Box, Text } from 'inkx';
import { useState, useCallback } from 'react';

function App() {
  const [items, setItems] = useState(['Apple', 'Banana', 'Cherry']);
  const [cursor, setCursor] = useState(0);

  // useCallback prevents re-subscriptions
  const handleInput = useCallback((input: string, key: Key) => {
    if (input === 'j' || key.downArrow) setCursor(c => Math.min(c + 1, items.length - 1));
    if (input === 'k' || key.upArrow) setCursor(c => Math.max(c - 1, 0));
    if (input === 'q') return 'exit';
  }, [items.length]);

  useInput(handleInput);

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

const handle = await run(<App />);
await handle.waitUntilExit();
```

### Key Object

The `Key` object tells you which special keys were pressed:

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

Example usage:

```typescript
useInput((input, key) => {
  // Check modifiers
  if (key.ctrl && input === "c") return "exit" // Ctrl+C

  // Check special keys
  if (key.return) submit()
  if (key.escape) cancel()

  // Check arrow keys
  if (key.upArrow) moveCursor(-1)
  if (key.downArrow) moveCursor(1)

  // Check regular input
  if (input.length === 1) addChar(input)
})
```

### RunHandle API

```typescript
interface RunHandle {
  text: string // Current rendered text (no ANSI)
  waitUntilExit(): Promise<void>
  unmount(): void
  press(key: string): Promise<void> // For testing
}
```

## Layer 3: Zustand Store (`createApp()`)

Use `createApp()` when you need:

- Shared state across many components
- Fine-grained subscriptions (no prop drilling)
- Complex state logic

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

### Key Handler Signature (Layer 3)

```typescript
type KeyHandler<S> = (
  input: string,
  key: Key,
  ctx: { set: SetState<S>; get: GetState<S> },
) => void | "exit"
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

## Layer 1: Full Control (`createRuntime()`)

Use `createRuntime()` when you want:

- Full control over the event loop
- Elm-style architecture (Model-Update-View)
- Custom event sources
- Maximum testability

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

## Examples

| File                  | Layer | Description             |
| --------------------- | ----- | ----------------------- |
| `hello-runtime.tsx`   | 1     | Minimal static render   |
| `runtime-counter.tsx` | 1     | Counter with schedule() |
| `mode3-counter.tsx`   | 1     | Elm-style with keyboard |
| `run-counter.tsx`     | 2     | React hooks counter     |
| `app-todo.tsx`        | 3     | Todo list with Zustand  |

Run examples:

```bash
bun examples/run-counter.tsx
bun examples/app-todo.tsx
```

## Testing

All layers support testing without a real terminal:

```typescript
// Layer 2
const handle = await run(<Counter />, { cols: 80, rows: 24 });
expect(handle.text).toContain('Count: 0');
await handle.press('j');
expect(handle.text).toContain('Count: 1');
handle.unmount();

// Layer 3
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
| Props for callbacks    | Store actions (Layer 3)                     |

## Next Steps

1. Try the examples: `bun examples/run-counter.tsx`
2. Read the source: `src/runtime/` has all implementations
3. Build something: Start with Layer 2, upgrade to Layer 3 if needed
