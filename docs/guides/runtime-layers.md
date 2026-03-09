# Runtime Layers Reference

silvery's runtime is organized in layers, each building on the one below — the infrastructure that makes the graduated path possible. For a quick tutorial, see [Getting Started](getting-started.md). For the graduated progression through state and events, see [Building an App](building-an-app.md).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  createApp().run()                                           │
│           Zustand store, flattened providers, useApp         │
├─────────────────────────────────────────────────────────────┤
│  run()  ← Start here                                        │
│           React components, useInput, useState               │
├─────────────────────────────────────────────────────────────┤
│  createStore()                                               │
│           TEA: (msg, model) → [model, effects]               │
├─────────────────────────────────────────────────────────────┤
│  createRuntime()                                             │
│           events(), render(), schedule(), user-driven loop   │
├─────────────────────────────────────────────────────────────┤
│  layout() / diff()                                           │
│           Pure functions, static output                       │
└─────────────────────────────────────────────────────────────┘
```

Each layer builds on the one below. `run()` uses `createRuntime()` internally; `createApp()` uses `run()` internally.

## Layer 3: createApp()

For apps with complex shared state, `createApp()` adds a Zustand store with centralized event handling. Components subscribe to individual slices of state -- no prop drilling, no unnecessary re-renders.

Use `createApp()` when you have:

- Shared state across many components
- Fine-grained subscriptions
- Complex state logic that benefits from centralized updates

```typescript
import { createApp, useApp, type Key } from '@silvery/term/runtime';
import { Box, Text } from '@silvery/term';

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

## Layer 1: createRuntime()

For Elm-style architecture, custom event loops, or integration with external event sources, `createRuntime()` gives you full control over the render loop. This is the escape hatch -- most apps don't need it.

```typescript
import { createRuntime, layout, ensureLayoutEngine, merge } from '@silvery/term/runtime';
import { Text } from '@silvery/term';

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

## Layer 1.5: createStore() (TEA)

Between `createRuntime()` and the React layers sits a pure **TEA (The Elm Architecture) store**. It has no React dependency — use it for Elm-style apps or as the state backbone under React components.

```typescript
import { createStore, silveryUpdate, defaultInit, withFocusManagement } from "@silvery/term/store"
import { type Effect, type SilveryModel, type SilveryMsg, none, batch, dispatch, compose } from "@silvery/term/core"

// Extend the base model with your state
interface AppModel extends SilveryModel {
  count: number
  items: string[]
}

type AppMsg = SilveryMsg | { type: "increment" } | { type: "add-item"; text: string }

// Pure update: (msg, model) → [newModel, effects]
function update(msg: AppMsg, model: AppModel): [AppModel, Effect[]] {
  switch (msg.type) {
    case "increment":
      return [{ ...model, count: model.count + 1 }, [none]]
    case "add-item":
      return [{ ...model, items: [...model.items, msg.text] }, [none]]
    default:
      // Delegate unhandled messages to the base silvery update
      return silveryUpdate(msg, model)
  }
}

// Compose plugins — withFocusManagement handles focus/blur/scope messages
const store = createStore({
  init: () => [{ ...defaultInit()[0], count: 0, items: [] } as AppModel, [none]],
  update: compose(withFocusManagement<AppModel, AppMsg>())(update),
})

// Dispatch messages
store.dispatch({ type: "increment" })
store.getModel().count // 1

// Subscribe to changes (compatible with React's useSyncExternalStore)
const unsubscribe = store.subscribe(() => {
  console.log("Model changed:", store.getModel().count)
})
```

### Effects

Effects are declarative descriptions of side effects, executed after each model update:

| Constructor          | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| `none`               | No-op (default return when no side effect needed)              |
| `dispatch(msg)`      | Queue another message (non-re-entrant — queued, not recursive) |
| `batch(e1, e2, ...)` | Multiple effects (auto-flattens nested batches, filters none)  |

```typescript
function update(msg: AppMsg, model: AppModel): [AppModel, Effect[]] {
  switch (msg.type) {
    case "save":
      // Set loading flag, then queue a "save-complete" message
      return [{ ...model, saving: true }, [dispatch({ type: "save-complete" } as AppMsg)]]
    case "save-complete":
      return [{ ...model, saving: false }, [none]]
    default:
      return [model, [none]]
  }
}
```

### Plugins (Middleware Composition)

Plugins wrap the update function, adding behavior before/after/around it:

```typescript
import { type Plugin, compose } from "@silvery/term/core"

// Logging plugin
const logging: Plugin<AppModel, AppMsg> = (inner) => (msg, model) => {
  console.log("→", msg.type)
  const result = inner(msg, model)
  console.log("←", result[0].count)
  return result
}

// Compose: first plugin is outermost (sees messages first)
const update = compose(logging, withFocusManagement())(baseUpdate)
```

### Connecting to createRuntime()

The store pairs with `createRuntime()` for a full Elm-style app:

```typescript
using runtime = createRuntime({ target })
const store = createStore({ init, update: compose(withFocusManagement())(update) })

for await (const event of merge(keyboardEvents, runtime.events())) {
  // Convert runtime events to messages and dispatch
  if (event.type === "key") {
    store.dispatch({ type: "term:key", key: event.key, input: event.input, ... })
  }

  // Render from current model
  const buffer = layout(view(store.getModel()), runtime.getDims())
  runtime.render(buffer)
}
```

## Stream Helpers

All layers use AsyncIterable streams. Compose them with helpers:

```typescript
import { merge, map, filter, takeUntil, throttle } from "@silvery/term/runtime"

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
import { createTick, createFrameTick, createAdaptiveTick } from "@silvery/term/runtime"

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
