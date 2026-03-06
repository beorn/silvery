# State Management

> This page documents hightea's state management APIs. For the guided progression from `useState` to TEA, see [Building an App](building-an-app.md).

---

## `createApp()` — Zustand Store

`createApp()` is a Zustand middleware that bundles the store with centralized key handling, terminal I/O, and exit handling into a single `app.run(<Component />)` call.

```tsx
import { createApp, useApp } from "@hightea/term/runtime"

const app = createApp(
  () => (set, get) => ({
    cursor: 0,
    items: [...],
    moveCursor(delta: number) {
      set((s) => ({ cursor: clamp(s.cursor + delta, 0, s.items.length - 1) }))
    },
    toggleDone() {
      set((s) => ({
        items: s.items.map((item, i) => (i === s.cursor ? { ...item, done: !item.done } : item)),
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

The double-arrow `() => (set, get) => ({...})` is Zustand's [state creator](https://zustand.docs.pmnd.rs/guides/updating-state) pattern — `set` merges new state, `get` reads current state.

### `useApp(selector)`

Components access the store via `useApp(selector)`. Zustand tracks which slice each component selected and only re-renders when that slice changes:

```tsx
function TodoList() {
  const cursor = useApp((s) => s.cursor)
  const items = useApp((s) => s.items)
  // only re-renders when cursor or items change
}
```

> **Why Zustand over React Context?** Context re-renders every consumer when _any_ part changes. Zustand only re-renders components whose selected slice actually changed — critical for high-frequency updates like cursor movement and typing.
>
> **Why not `useReducer`?** React's `useReducer` is ops-as-data in disguise — `dispatch(action)` + a pure reducer. Solid for a single component tree, but no cross-component subscriptions and no selector — every dispatch re-renders every consumer. Zustand adds the subscription layer that makes it scale.

As your app grows, selectors show their cost — Zustand runs every selector on every store update. If that becomes a bottleneck, [Signals](../reference/signals.md) give you fine-grained subscriptions. Skip them unless you have performance issues.

---

## `createSlice()` — Ops as Data

`createSlice` turns state transitions into serializable data. You write handlers; it infers the op union:

```tsx
import { createSlice } from "@hightea/term/core"

const TodoList = createSlice(
  () => ({ cursor: signal(0), items: signal<Item[]>([...]) }),
  {
    moveCursor(s, { delta }: { delta: number }) {
      s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
    },
    toggleDone(s, { index }: { index: number }) {
      s.items.value = s.items.value.map((item, i) =>
        i === index ? { ...item, done: !item.done } : item
      )
    },
  },
)

type TodoOp = typeof TodoList.Op
// { op: "moveCursor"; delta: number } | { op: "toggleDone"; index: number }
```

### Wiring into the store

The store wires in via `.create()`:

```tsx
const app = createApp(
  () => {
    const { state, apply } = TodoList.create()
    return {
      ...state,
      doneCount: computed(() => state.items.value.filter((i) => i.done).length),
      apply,
    }
  },
  {
    key(input, key, { store }) {
      if (input === "j") store.apply({ op: "moveCursor", delta: 1 })
      if (input === "k") store.apply({ op: "moveCursor", delta: -1 })
      if (input === "x") store.apply({ op: "toggleDone", index: store.cursor.value })
      if (input === "q") return "exit"
    },
  },
)
```

### Undo pattern

Define an `inverse` function — TypeScript's exhaustive narrowing ensures every op has an inverse:

```tsx
function inverse(op: TodoOp): TodoOp {
  switch (op.op) {
    case "moveCursor":
      return { op: "moveCursor", delta: -op.delta }
    case "toggleDone":
      return op // toggling is its own inverse
  }
}

const undoStack: TodoOp[] = []
const redoStack: TodoOp[] = []

function applyWithUndo(op: TodoOp) {
  undoStack.push(inverse(op))
  TodoList.apply(state, op)
  redoStack.length = 0
}

function undo() {
  const op = undoStack.pop()
  if (!op) return
  redoStack.push(inverse(op))
  TodoList.apply(state, op)
}
```

### Manual pattern (without `createSlice`)

Without `createSlice`, you write the discriminated union and switch yourself — three artifacts per op (union variant, handler, switch case):

```tsx
type TodoOp = { op: "moveCursor"; delta: number } | { op: "toggleDone"; index: number }

const TodoList = {
  moveCursor(s: State, { delta }: { delta: number }) { ... },
  toggleDone(s: State, { index }: { index: number }) { ... },

  apply(s: State, op: TodoOp) {
    switch (op.op) {
      case "moveCursor": return TodoList.moveCursor(s, op)
      case "toggleDone": return TodoList.toggleDone(s, op)
    }
  },
}
```

`createSlice` eliminates this ceremony — you write only the handlers.

For identity-based ops that survive reordering and concurrency, see [Designing Robust Ops](../reference/robust-ops.md).

---

## `tea()` — Zustand TEA Middleware

Functions that need I/O return an `Effect[]` instead of performing side effects directly:

```tsx
toggleDone(s, { index }: { index: number }): Effect[] {
  s.items.value = s.items.value.map((item, i) =>
    i === index ? { ...item, done: !item.done } : item
  )
  return [
    { effect: "persist", data: s.items.value },
    { effect: "toast", message: `Toggled ${s.items.value[index].text}` },
  ]
}
```

Tests assert on returned effects — no mocks, no fakes:

```tsx
test("toggleDone persists and toasts", () => {
  const s = { cursor: signal(0), items: signal([{ text: "Buy milk", done: false }]) }
  const effects = TodoList.toggleDone(s, { index: 0 })
  expect(effects).toContainEqual({ effect: "persist", data: expect.any(Array) })
  expect(effects).toContainEqual({ effect: "toast", message: "Toggled Buy milk" })
})
```

The `effects` option in `createApp()` intercepts effect arrays returned from `.apply()` and routes them to declared runners:

```tsx
const app = createApp(
  () => { ... },
  {
    effects: {
      persist: async ({ data }) => { await fs.writeFile("data.json", JSON.stringify(data)) },
      toast: ({ message }) => { showToast(message) },
    },
  },
)
```

### Dispatch-back pattern

For async results that need to re-enter the domain:

```tsx
type Effect =
  | { effect: "persist"; data: unknown }
  | { effect: "fetch"; url: string; onSuccess: TodoOp }

loadItems(s: State): Effect[] {
  return [{ effect: "fetch", url: "/api/items", onSuccess: { op: "setItems" } }]
}

effects: {
  fetch: async ({ url, onSuccess }, { store }) => {
    const data = await fetch(url).then(r => r.json())
    store.apply({ ...onSuccess, data })
  },
}
```

The fetch result re-enters the domain through `apply()`, so it shows up in logs, undo history, and time-travel debugging.

### `collect()` for testing

`tea()` provides `collect()` to capture effects in tests without running them. See [Runtime Layers](runtime-layers.md) for the full API.

---

## `createStore()` — Standalone TEA Store

For apps that don't need `createApp`'s Zustand integration, `createStore()` provides a standalone TEA store with plugin composition:

```tsx
import { createStore } from "@hightea/term/store"

const store = createStore(initialState, update, {
  effects: { persist, toast },
  plugins: [withUndo(), withLogging()],
})
```

Plugin composition via `compose(withFocusManagement(), withUndo())(update)` adds cross-cutting concerns without touching individual machines.

See [Runtime Layers](runtime-layers.md) for the full API.

---

## Appendix A: Scaling with Signals

Signals (fine-grained reactivity via `@preact/signals-core`) are orthogonal to the levels — they optimize re-renders at any level by replacing selector-based subscriptions with automatic dependency tracking. Combined with per-entity signals and VirtualList, they scale to thousands of items.

See [Scaling with Signals](../reference/signals.md) for the full guide.

---

## Appendix B: Designing Robust Ops

Index-based ops (`toggleDone, index: 2`) work for single-session undo but break under reordering, concurrency, or offline sync. Prefer identity-based, ideally idempotent ops for collaboration and AI automation.

See [Designing Robust Ops](../reference/robust-ops.md) for the full guide.
