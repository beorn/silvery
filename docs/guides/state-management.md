# State Management Guide

> Start simple. Add structure when complexity demands it. Each level changes exactly one thing.

inkx supports a progression of state management approaches. Most apps never need to go beyond Level 2. Each level builds on the previous — the concepts carry forward, and you can mix levels within a single app.

### What inkx composes

inkx's state management is a thin integration layer over established libraries, not a from-scratch framework:

| Concern | Library | What it does |
|---------|---------|--------------|
| Reactive primitives | [`@preact/signals-core`](https://github.com/preactjs/signals) | `signal()`, `computed()`, `.value`, auto-tracking |
| Store container | [Zustand](https://github.com/pmndrs/zustand) | Store identity, middleware pipeline, React integration |
| App lifecycle | inkx `createApp()` | Terminal I/O, key routing, effect dispatch, exit handling |

`createApp()` creates a Zustand store whose state fields are Preact signals. inkx bridges the two with a middleware that uses `effect()` from `@preact/signals-core` to watch all signals in the store — when any signal's `.value` changes, the middleware notifies Zustand's subscribers. This means both subscription models work:

- **Signal subscriptions**: Components read `.value` directly — fine-grained, automatic
- **Zustand subscriptions**: `useApp(s => s.cursor.value)` — selector-based, familiar

When updating multiple signals at once, wrap them in `batch()` from `@preact/signals-core` so the bridge fires once rather than per-signal:

```tsx
import { batch } from "@preact/signals-core"

batch(() => {
  cursor.value = 0
  items.value = newItems
  filter.value = ""
})
// → single Zustand notification, single re-render
```

inkx adds a second middleware that intercepts `Effect[]` returns from domain functions and routes them to declared effect runners. Everything else — the signal reactivity, the store subscription model, the React hooks — comes from the underlying libraries.

`createApp()` returns more than just the store — it bundles terminal I/O, key routing, effect dispatch, and exit handling into a single `app.run(<Component />)` call. Components access the store via `useApp()`, which returns the object your factory created (signals, computed values, methods). Prefer `useApp(s => s.cursor.value)` (selector extracting a primitive) over bare `useApp()` — selectors let Zustand skip re-renders when unrelated signals change.

## The Levels

```
Level 1: Component State     useState/useReducer              — local, per-component
Level 2: Shared State        createApp + signal/computed      — shared, reactive
Level 3: Pure Transitions    createApp + domain functions     — structured, testable
Level 4: Effects as Data     createApp + [state, effects]     — pure, serializable, replayable
```

### Level 1: Component State

The simplest model. State lives in individual components. No coordination overhead, no abstractions — just React.

```tsx
import { run, useInput } from "inkx/runtime"
import { Text } from "inkx"

function Counter() {
  const [count, setCount] = useState(0)

  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "k") setCount((c) => c - 1)
  })

  return <Text>Count: {count}</Text>
}

await run(<Counter />)
```

Good for single-component apps, prototypes, and simple tools where state is local and self-contained.

### Level 2: Shared State

**The problem**: Multiple components need the same state. You're passing props through layers that don't use them. Key handling is scattered across components instead of centralized.

**The solution**: `createApp()` provides shared state across all components. State lives in signals (`signal()` and `computed()` from [`@preact/signals-core`](https://github.com/preactjs/signals)) — components that read a signal re-render only when that signal changes. Key handling moves to one place.

```tsx
import { createApp, useApp } from "inkx/runtime"
import { signal, computed } from "@preact/signals-core"

const app = createApp(
  () => {
    const cursor = signal(0)
    const items = signal(["first", "second", "third"])
    const currentItem = computed(() => items.value[cursor.value])

    return {
      cursor,
      items,
      currentItem,
      moveCursor(delta: number) {
        cursor.value = clamp(cursor.value + delta, 0, items.value.length - 1)
      },
    }
  },
  {
    key(input, key, { store }) {
      if (input === "j") store.moveCursor(1)
      if (input === "k") store.moveCursor(-1)
      if (input === "q") return "exit"
    },
  },
)

function ItemList() {
  const { cursor, items } = useApp()
  return (
    <Box flexDirection="column">
      {items.value.map((item, i) => (
        <Text key={item} color={cursor.value === i ? "cyan" : undefined}>
          {cursor.value === i ? "> " : "  "}
          {item}
        </Text>
      ))}
    </Box>
  )
}

await app.run(<ItemList />)
```

`signal()` creates reactive state. `computed()` derives from other signals — `currentItem` recomputes only when `cursor` or `items` change. Components read `.value` and automatically subscribe — no selectors, no `connect()`. This is the same model as SolidJS, Vue 3, and the [TC39 Signals proposal](https://github.com/tc39/proposal-signals).

Good for most interactive TUI apps — dashboards, file browsers, list views, dialogs.

### Level 3: Pure Transitions

**The problem**: State transitions get complex — multiple fields updated together, conditional logic scattered across methods, no clear record of *what happened*. You can't test state logic without the store.

**The solution**: Extract transitions into domain functions. The store shape stays the same — signals, computed, methods — but methods now delegate to functions you can test by calling directly.

These functions mutate signals (`s.cursor.value = ...`) but perform no I/O — their only effect is changing state. They're "pure" in the sense that matters: deterministic, no external side effects, fully testable by calling with fresh signals and checking the result. Think of them like Immer reducers — pure from the outside, internally mutative. This is intentional: signals are designed as long-lived mutable containers, and returning new state objects would break the reactivity model.

```tsx
import { createApp, useApp } from "inkx/runtime"
import { signal, computed, type Signal } from "@preact/signals-core"

interface State {
  cursor: Signal<number>
  items: Signal<{ text: string; done: boolean }[]>
}

// Domain logic — testable without the store
const TodoList = {
  moveCursor(s: State, delta: number) {
    s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
  },
  toggleDone(s: State, index: number) {
    s.items.value = s.items.value.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    )
  },
  addItem(s: State, text: string) {
    s.items.value = [...s.items.value, { text, done: false }]
  },
}

const app = createApp(
  () => {
    const cursor = signal(0)
    const items = signal<{ text: string; done: boolean }[]>([])
    const state = { cursor, items }

    return {
      cursor,
      items,
      currentItem: computed(() => items.value[cursor.value]),
      doneCount: computed(() => items.value.filter(i => i.done).length),
      moveCursor: (d: number) => TodoList.moveCursor(state, d),
      toggleDone: (i: number) => TodoList.toggleDone(state, i),
      addItem: (t: string) => TodoList.addItem(state, t),
    }
  },
  {
    key(input, key, { store }) {
      if (input === "j") store.moveCursor(1)
      if (input === "k") store.moveCursor(-1)
      if (input === "x") store.toggleDone(store.cursor.value)
      if (input === "q") return "exit"
    },
  },
)
```

Testing is direct — create fresh signals, call the function, check the result:

```tsx
test("moveCursor clamps at bottom", () => {
  const s = { cursor: signal(2), items: signal([{ text: "a" }, { text: "b" }, { text: "c" }]) }
  TodoList.moveCursor(s, 1)
  expect(s.cursor.value).toBe(2) // clamped
})
```

No React, no store, no mocks. The store methods are thin wrappers — all logic lives in the domain functions.

Good for apps with structured state transitions. This is the sweet spot for most complex TUI apps.

### Level 4: Effects as Data

**The problem**: Side effects (file I/O, HTTP, timers, toasts) are tangled into your store methods. You can test that state changed, but not that a save was triggered or a notification was sent — not without mocking the world. Undo/redo requires snapshotting. Collaborative editing requires serializable operations, but your effects are function calls.

**The solution**: Domain functions return effects alongside state mutations. Effects are data objects describing what should happen — the runtime executes them. The domain function never touches I/O, making it testable and replayable. Effect runners are swappable: production runners do real I/O, test runners collect and assert.

This is the Elm Architecture: `update : Msg -> Model -> (Model, Cmd Msg)`. Also implemented by redux-loop and Hyperapp v2.

```tsx
type Effect =
  | { type: "persist"; data: unknown }
  | { type: "toast"; message: string }

const TodoList = {
  // No effects — same as Level 3
  moveCursor(s: State, delta: number) {
    s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
  },

  // Returns effects as data
  toggleDone(s: State, index: number): Effect[] {
    s.items.value = s.items.value.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    )
    return [
      { type: "persist", data: s.items.value },
      { type: "toast", message: `Marked ${s.items.value[index].text} as done` },
    ]
  },

  addItem(s: State, text: string): Effect[] {
    s.items.value = [...s.items.value, { text, done: false }]
    return [{ type: "persist", data: s.items.value }]
  },
}

const app = createApp(
  () => {
    const cursor = signal(0)
    const items = signal<Item[]>([])
    const state = { cursor, items }

    return {
      cursor,
      items,
      currentItem: computed(() => items.value[cursor.value]),
      doneCount: computed(() => items.value.filter(i => i.done).length),
      moveCursor: (d: number) => TodoList.moveCursor(state, d),
      toggleDone: (i: number) => TodoList.toggleDone(state, i),
      addItem: (t: string) => TodoList.addItem(state, t),
    }
  },
  {
    effects: {
      persist: async (effect) => { await fs.writeFile("data.json", JSON.stringify(effect.data)) },
      toast: (effect) => { showToast(effect.message) },
    },
    key(input, key, { store }) {
      if (input === "j") store.moveCursor(1)
      if (input === "x") store.toggleDone(store.cursor.value)
      if (input === "q") return "exit"
    },
  },
)
```

The store looks identical to Level 3. The only change is that some domain functions now return `Effect[]` — `createApp` intercepts the return and routes effects to the declared runners.

Assert on what the domain function *says should happen*, not on whether it happened:

```tsx
test("toggleDone persists and toasts", () => {
  const s = { cursor: signal(0), items: signal([{ text: "Buy milk", done: false }]) }
  const effects = TodoList.toggleDone(s, 0)

  expect(s.items.value[0].done).toBe(true)
  expect(effects).toContainEqual({ type: "persist", data: expect.any(Array) })
  expect(effects).toContainEqual({ type: "toast", message: "Marked Buy milk as done" })
})
```

No mocks. No I/O. No async.

**The upgrade is per-function, not per-app.** Within a single domain object, some functions return nothing (Level 3) and others return `Effect[]` (Level 4). You upgrade individual functions as they need effects.

### Scaling with Signals

At small scale, a few signals in a store is all you need. At large scale (1000+ items, tree views, document editors), you want per-entity signals so that editing one node doesn't re-render others.

The pattern: `Map<string, Signal<T>>` for per-entity reactive state, `computed()` for derived views:

```tsx
import { signal, computed, type Signal } from "@preact/signals-core"

// Per-entity signals — editing one node doesn't touch others
const nodes = new Map<string, Signal<NodeData>>()
const cursor = signal<string>("node-1")
const folds = new Map<string, Signal<boolean>>()

// Derived — recomputes only when its specific dependencies change
const currentNode = computed(() => nodes.get(cursor.value)?.value)
const visibleCount = computed(() => {
  let count = 0
  for (const [id, folded] of folds) if (!folded.value) count++
  return count
})
```

Inside a store, the same pattern:

```tsx
const app = createApp(
  () => {
    const cursor = signal<string>("root")
    const nodes = new Map<string, Signal<NodeData>>()
    const folds = new Map<string, Signal<boolean>>()

    return {
      cursor,
      nodes,
      folds,
      currentNode: computed(() => nodes.get(cursor.value)?.value),
      visibleCount: computed(() => [...folds.values()].filter(f => !f.value).length),
      moveTo(nodeId: string) { cursor.value = nodeId },
      toggleFold(nodeId: string) {
        const f = folds.get(nodeId)
        if (f) f.value = !f.value
      },
    }
  },
)
```

Cursor move: `cursor` signal notifies, `currentNode` recomputes, components reading `currentNode` re-render. Components reading other nodes — unaffected. With `VirtualList` limiting mounted components to ~30-50 visible items, this is O(visible) not O(total).

**Cleanup**: When items are removed, delete their signals from the Map. The bridge middleware tracks signals it discovers in the store — stale signals left in a Map will continue to be watched. For collections that churn frequently, remove the signal from the Map when the entity is deleted:

```tsx
removeNode(nodeId: string) {
  nodes.delete(nodeId)
  folds.delete(nodeId)
}
```

**You don't need per-entity signals for most apps.** A few top-level signals in the store handles dozens of components fine. Reach for `Map<string, Signal<T>>` when you have per-entity state with many concurrent subscribers — typically virtualized lists, tree views, or document editors.

## When to Use Each Level

| Signal | Level |
|--------|-------|
| One component, simple state | 1 — Component |
| Multiple components share state | 2 — Shared |
| Complex transitions, want testable state logic | 3 — Pure Transitions |
| Side effects in transitions, want pure/testable/replayable | 4 — Effects as Data |
| Undo/redo, collaborative editing, action replay | 4 — Effects as Data |
| AI automation (operations as tool calls) | 4 — Effects as Data |

## Composing Machines

Level 4 domain objects are just functions — you can structure them however you like. For complex apps, a useful pattern is decomposing into independent state machines that communicate through effects:

```tsx
const Board = {
  moveCursor(s: BoardState, delta: number) { ... },
  fold(s: BoardState, nodeId: string): Effect[] { ... },
}

const Dialog = {
  open(s: DialogState, kind: string) { ... },
  confirm(s: DialogState): Effect[] {
    s.open.value = false
    return [{ type: "dispatch", op: "addItem", text: s.value.value }]
  },
}

const Search = {
  setQuery(s: SearchState, query: string) { ... },
  submit(s: SearchState): Effect[] { ... },
}
```

Machines compose via dispatch effects — no machine imports another. `Dialog.confirm()` says "dispatch addItem" as a data object; the effect runner routes it to the right domain function.

Each machine is independently testable. Communication is through serializable effect objects. A full-scale application might have 5-10 machines covering board navigation, text editing, dialogs, search, and undo/redo — all pure functions operating on signals, composing through effects.

### Combining state within a store

All machines share a single `createApp()` store. Each machine owns its slice of signal state — the store factory wires them together:

```tsx
const app = createApp(
  () => {
    // Each machine gets its own signals
    const boardState = { cursor: signal(0), items: signal<Item[]>([]) }
    const dialogState = { open: signal(false), value: signal("") }
    const searchState = { query: signal(""), results: signal<string[]>([]) }

    return {
      // Expose signals for components
      ...boardState,
      dialog: dialogState,
      search: searchState,

      // Methods delegate to domain functions
      moveCursor: (d: number) => Board.moveCursor(boardState, d),
      fold: (id: string) => Board.fold(boardState, id),
      openDialog: (kind: string) => Dialog.open(dialogState, kind),
      confirmDialog: () => Dialog.confirm(dialogState),
      setQuery: (q: string) => Search.setQuery(searchState, q),
      submitSearch: () => Search.submit(searchState),
    }
  },
  {
    effects: {
      dispatch: (effect) => { /* route to the right domain function */ },
      persist: async (effect) => { /* save to disk */ },
    },
    key(input, key, { store }) {
      if (input === "/") store.openDialog("search")
      if (input === "j") store.moveCursor(1)
      if (input === "q") return "exit"
    },
  },
)
```

Components pick what they need — they only re-render when the signals they read change:

```tsx
function SearchBar() {
  const { search } = useApp()
  // Only re-renders when query or results change — cursor moves don't affect it
  return <Text>Search: {search.query.value} ({search.results.value.length} results)</Text>
}
```

One store, multiple machines, fine-grained subscriptions. No prop drilling, no selector boilerplate, no unnecessary re-renders.

## Prior Art

| System | Level | Approach |
|--------|-------|----------|
| React useState | 1 | Component-local state |
| Zustand | 2 | Shared store with selectors (`useStore(s => s.field)`) |
| `@preact/signals-core` | 2-4 | `signal()` / `computed()` / `.value` — **inkx's reactive foundation** |
| SolidJS | 2-4 | `createSignal()` / `createMemo()` / fine-grained reactivity |
| Vue 3 | 2-4 | `ref()` / `computed()` / fine-grained reactivity |
| TC39 Signals (Stage 1) | — | `Signal.State()` / `Signal.Computed()` — emerging standard |
| Elm | 4 | `update : Msg -> Model -> (Model, Cmd Msg)` — the original effects-as-data |
| redux-loop | 4 | Reducer returns [state, effects] — Elm Architecture for Redux |
| Hyperapp v2 | 4 | Optional tuple return (same Array.isArray detection) |
| inkx createStore | 4 | Non-React TEA container: `(msg, model) → [model, effects]` (see [Runtime Layers](runtime-layers.md)) |

## See Also

- [Runtime Layers](runtime-layers.md) — createRuntime, createStore, run, createApp API reference
