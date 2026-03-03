# State Management

> Start simple. Add structure when complexity demands it.

inkx composes [Zustand](https://github.com/pmndrs/zustand) (store + React hooks) with optional [Preact Signals](https://github.com/preactjs/signals) (fine-grained reactivity). This guide walks through the progression — each section builds on the previous code.

| Level | inkx API | What you get |
|-------|----------|-------------|
| **1 — Component** | `run()` + `useState` | Local state, no abstractions |
| **2 — Shared** | `createApp()` + `useApp()` | Shared store, centralized keys |
| **3 — Ops as Data** | + domain objects with `.apply()` | Undo/redo, replay, AI automation |
| **4 — Effects as Data** | + `effects` option in `createApp()` | Testable I/O, swappable runners |

Most apps only need Level 2. Levels 3-4 follow a general architecture pattern described in [Operations and Effects as Data](as-data-patterns.md).

## Your First App

A counter. State lives in the component — just React.

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

This works until a second component needs the same state.

## Sharing State

The counter grows into a todo list. A sidebar shows the count of done items while the main view shows the list. Both need the same data.

`createApp()` gives you a Zustand store shared across all components, centralized key handling, terminal I/O, and exit handling — all bundled into `app.run(<Component />)`:

```tsx
import { createApp, useApp } from "inkx/runtime"

const app = createApp(
  () => (set, get) => ({
    cursor: 0,
    items: [
      { text: "Buy milk", done: false },
      { text: "Write docs", done: true },
      { text: "Fix bug", done: false },
    ],
    moveCursor(delta: number) {
      set(s => ({ cursor: clamp(s.cursor + delta, 0, s.items.length - 1) }))
    },
    toggleDone() {
      set(s => ({
        items: s.items.map((item, i) =>
          i === s.cursor ? { ...item, done: !item.done } : item
        ),
      }))
    },
  }),
  {
    key(input, key, { store }) {
      if (input === "j") store.moveCursor(1)
      if (input === "k") store.moveCursor(-1)
      if (input === "x") store.toggleDone()
      if (input === "q") return "exit"
    },
  },
)
```

Components access the store via `useApp(selector)`. The selector tells Zustand which slice to watch — `useApp(s => s.cursor)` re-renders only when the cursor changes, not when items change:

```tsx
function TodoList() {
  const cursor = useApp(s => s.cursor)
  const items = useApp(s => s.items)
  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={item.text} color={cursor === i ? "cyan" : undefined}>
          {cursor === i ? "> " : "  "}
          {item.done ? "[x] " : "[ ] "}
          {item.text}
        </Text>
      ))}
    </Box>
  )
}

function StatusBar() {
  const items = useApp(s => s.items)
  const done = items.filter(i => i.done).length
  return <Text dimColor>{done}/{items.length} done</Text>
}

await app.run(
  <Box flexDirection="column">
    <TodoList />
    <StatusBar />
  </Box>
)
```

This is enough for most apps — dashboards, file browsers, list views, dialogs.

## Adding Signals

As your app grows, selectors start to show their cost. Zustand runs *every* selector on *every* store update — if you have 100 `<Row>` components each with `useApp(s => s.rows.get(id))`, that's 100 selector calls every time the cursor moves, even though only 2 rows actually need to re-render.

Signals flip this. Instead of declaring what you read (selectors), components just read `.value` and automatically subscribe to exactly what they touched — no diffing, no linear scan:

```tsx
import { createApp, useApp } from "inkx/runtime"
import { signal, computed } from "@preact/signals-core"

const app = createApp(
  () => {
    const cursor = signal(0)
    const items = signal([
      { text: "Buy milk", done: false },
      { text: "Write docs", done: true },
      { text: "Fix bug", done: false },
    ])
    const doneCount = computed(() => items.value.filter(i => i.done).length)

    return {
      cursor,
      items,
      doneCount,
      moveCursor(delta: number) {
        cursor.value = clamp(cursor.value + delta, 0, items.value.length - 1)
      },
      toggleDone() {
        const i = cursor.value
        items.value = items.value.map((item, j) =>
          j === i ? { ...item, done: !item.done } : item
        )
      },
    }
  },
  {
    key(input, key, { store }) {
      if (input === "j") store.moveCursor(1)
      if (input === "k") store.moveCursor(-1)
      if (input === "x") store.toggleDone()
      if (input === "q") return "exit"
    },
  },
)
```

`signal()` creates reactive state. `computed()` derives from other signals — `doneCount` recomputes only when `items` changes, not when cursor moves. This is the same model as SolidJS, Vue 3, and the [TC39 Signals proposal](https://github.com/tc39/proposal-signals).

inkx bridges signals and Zustand with a middleware — when any signal's `.value` changes, Zustand subscribers are also notified. Both subscription models work side by side: signal `.value` reads (automatic) and `useApp(s => s.cursor.value)` selectors (familiar).

When updating multiple signals at once, wrap in `batch()` so the bridge fires once:

```tsx
import { batch } from "@preact/signals-core"

batch(() => {
  cursor.value = 0
  items.value = newItems
  filter.value = ""
})
// → single Zustand notification, single re-render
```

## Extracting Domain Functions

The store is getting complex. Pull transition logic into a domain object so you can test it without React, without a store, without mocks:

```tsx
const TodoList = {
  moveCursor(s: State, delta: number) {
    s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
  },
  toggleDone(s: State, index: number) {
    s.items.value = s.items.value.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    )
  },
}

test("moveCursor clamps at bottom", () => {
  const s = {
    cursor: signal(2),
    items: signal([{ text: "a", done: false }, { text: "b", done: false }, { text: "c", done: false }]),
  }
  TodoList.moveCursor(s, 1)
  expect(s.cursor.value).toBe(2) // clamped
})
```

The domain functions mutate signals but perform no I/O — deterministic, fully testable. Think Immer reducers: pure from the outside, internally mutative.

The store becomes a thin shell that wires domain functions to keys:

```tsx
const app = createApp(
  () => {
    const state = {
      cursor: signal(0),
      items: signal<Item[]>([...]),
    }
    return {
      ...state,
      doneCount: computed(() => state.items.value.filter(i => i.done).length),
      moveCursor: (d: number) => TodoList.moveCursor(state, d),
      toggleDone: () => TodoList.toggleDone(state, state.cursor.value),
    }
  },
  {
    key(input, key, { store }) {
      if (input === "j") store.moveCursor(1)
      if (input === "k") store.moveCursor(-1)
      if (input === "x") store.toggleDone()
      if (input === "q") return "exit"
    },
  },
)
```

This is where most apps stop. The next two levels add structure for undo/redo and testable I/O — see [Operations and Effects as Data](as-data-patterns.md) for the full pattern. The short version:

**Level 3 — Ops as data**: Change `moveCursor(s, delta)` to `moveCursor(s, { delta })` — params objects instead of positional args. Add an `.apply(state, { op: "moveCursor", delta: 1 })` dispatcher. Operations become serializable JSON, enabling undo/redo, replay, logging, and AI automation.

**Level 4 — Effects as data**: Domain functions return `Effect[]` — plain objects like `{ effect: "persist", data: items }`. inkx's effects middleware intercepts these returns and routes them to declared runners:

```tsx
const app = createApp(
  () => { ... },
  {
    effects: {
      persist: async ({ data }) => { await fs.writeFile("data.json", JSON.stringify(data)) },
      toast: ({ message }) => { showToast(message) },
    },
    key(input, key, { store }) { ... },
  },
)
```

## Scaling

For most apps, a few top-level signals in the store is all you need. At scale (1,000+ items), two techniques help:

**Per-entity signals** — `Map<string, Signal<T>>` gives each item its own signal. Edit one item → only that item's subscribers re-render:

```tsx
const app = createApp(
  () => {
    const cursor = signal<string>("item-0")
    const items = new Map<string, Signal<ItemData>>()

    return {
      cursor,
      items,
      currentItem: computed(() => items.get(cursor.value)?.value),
      updateItem(id: string, data: ItemData) {
        const s = items.get(id)
        if (s) s.value = data  // only this item's subscribers re-render
      },
      removeItem(id: string) {
        items.delete(id)  // clean up — stale signals keep being watched
      },
    }
  },
)
```

**VirtualList** — only mount the ~50 visible items. Combined with per-entity signals: edit one item → 1 re-render. Move cursor → 2 re-renders. O(visible), not O(total).

## Composing Machines

For complex apps, decompose into independent domain objects that each own a slice of signal state. All share a single `createApp()` store:

```tsx
const app = createApp(
  () => {
    const boardState = { cursor: signal(0), items: signal<Item[]>([]) }
    const dialogState = { open: signal(false), value: signal("") }
    const searchState = { query: signal(""), results: signal<string[]>([]) }

    return {
      ...boardState,
      dialog: dialogState,
      search: searchState,
      applyBoard: (op: BoardOp) => Board.apply(boardState, op),
      applyDialog: (op: DialogOp) => Dialog.apply(dialogState, op),
      applySearch: (op: SearchOp) => Search.apply(searchState, op),
    }
  },
  {
    effects: {
      dispatch: ({ op, ...params }) => { /* route to the right machine */ },
      persist: async ({ data }) => { /* save to disk */ },
    },
    key(input, key, { store }) {
      if (input === "/") store.applyDialog({ op: "open", kind: "search" })
      if (input === "j") store.applyBoard({ op: "moveCursor", delta: 1 })
      if (input === "q") return "exit"
    },
  },
)
```

Components pick what they need — they only re-render when the signals they read change:

```tsx
function SearchBar() {
  const { search } = useApp()
  return <Text>Search: {search.query.value} ({search.results.value.length} results)</Text>
}
```

Machines communicate through dispatch effects (see [Composing Machines](as-data-patterns.md#composing-machines)) — no machine imports another.

## See Also

- [Operations and Effects as Data](as-data-patterns.md) — the architecture pattern behind Levels 3-4
- [Runtime Layers](runtime-layers.md) — createRuntime, createStore, run, createApp API reference
