# State Management

> Start simple. Add structure when complexity demands it.

This guide describes state management patterns for interactive applications. The patterns are general — ops as data and effects as data work in any framework (Redux, Elm, and event sourcing use the same ideas). inkx makes the progression seamless by composing [Zustand](https://github.com/pmndrs/zustand) (store) with [Signals](https://github.com/tc39/proposal-signals) (fine-grained reactivity), so you can start simple and scale up without rewriting. Where inkx adds specific tooling, it's noted inline.

| Level | What you get |
|-------|-------------|
| **1 — Component** | Local state, no abstractions |
| **2 — Shared** | Shared store, centralized keys |
| **3 — Ops as Data** | Undo/redo, replay, AI automation |
| **4 — Effects as Data** | Testable I/O, swappable runners |

Most apps only need Level 2.

## Your First App (Level 1)

A counter. State lives in the component — just React. (`useState` is standard React; `useInput` and `run` are inkx's keyboard hook and app runner.)

```tsx
import { useState } from "react"
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

## Sharing State (Level 2)

The counter grows into a todo list. A sidebar shows the count of done items while the main view shows the list. Both need the same data.

The standard approach is a shared store with centralized key handling. `createApp()` creates a [Zustand](https://github.com/pmndrs/zustand) store — the double-arrow `() => (set, get) => ({...})` is Zustand's [state creator](https://zustand.docs.pmnd.rs/guides/updating-state) pattern, where `set` merges new state and `get` reads current state:

```tsx
import { createApp, useApp } from "inkx/runtime"
import { Box, Text } from "inkx"

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))

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
    // key() receives each keypress. Return "exit" to shut down the app.
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

**What inkx adds**: `createApp()` is a Zustand middleware that bundles the store with centralized key handling, terminal I/O, and exit handling into a single `app.run(<Component />)` call. `useApp(selector)` is a thin wrapper around Zustand's `useStore`. Without inkx, you'd wire Zustand, keyboard input, and lifecycle yourself — the store pattern is the same.

## Adding Signals

As your app grows, selectors start to show their cost. Zustand runs *every* selector on *every* store update — if you have 100 `<Row>` components each with `useApp(s => s.rows.get(id))`, that's 100 selector calls every time the cursor moves, even though only 2 rows actually need to re-render.

[Signals](https://github.com/tc39/proposal-signals) flip this. Instead of declaring what you read (selectors), components just read `.value` and automatically subscribe to exactly what they touched — no diffing, no linear scan. This is the same model as SolidJS, Vue 3, and the TC39 Signals proposal. inkx uses [Preact's implementation](https://github.com/preactjs/signals) (`@preact/signals-core`).

With signals, the factory returns a plain object instead of using Zustand's `(set, get)` — signals *are* the reactive state, so you don't need `set()` to trigger updates. We use `@preact/signals-core` (not `@preact/signals-react`) because inkx's bridge middleware handles the React integration — it notifies Zustand whenever any signal changes, which triggers React re-renders through the normal Zustand subscription path.

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

`signal()` creates reactive state. `computed()` derives from other signals — `doneCount` recomputes only when `items` changes, not when cursor moves.

When updating multiple signals at once, wrap in `batch()` so subscribers are notified once:

```tsx
import { batch } from "@preact/signals-core"

batch(() => {
  cursor.value = 0
  items.value = newItems
  filter.value = ""
})
// → single notification, single re-render
```

**What inkx adds**: A bridge middleware that connects signals to Zustand — when any signal's `.value` changes, Zustand subscribers are also notified. Both subscription models work side by side: signal `.value` reads (automatic, fine-grained) and `useApp(s => s.cursor.value)` selectors (familiar). Without inkx, you'd use signals directly or write your own bridge.

## "I Want Undo" (Level 3)

Your todo list works. Now you want undo/redo. The problem: `store.toggleDone()` mutates state and is gone — you can't record what happened, replay it, or reverse it.

The fix is to make operations into data — plain JSON objects the system can see. This means pulling logic out of the store into a domain object with params-object style functions and an `.apply()` dispatcher:

```tsx
type TodoOp =
  | { op: "moveCursor"; delta: number }
  | { op: "toggleDone"; index: number }

const TodoList = {
  moveCursor(s: State, { delta }: { delta: number }) {
    s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
  },
  toggleDone(s: State, { index }: { index: number }) {
    s.items.value = s.items.value.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    )
  },

  apply(s: State, op: TodoOp) {
    const { op: name, ...params } = op
    return (TodoList as any)[name](s, params)
  },
}
```

Now every user action is a serializable object — `{ op: "toggleDone", index: 2 }` — that you can record in a stack, replay from the beginning, or send over the wire. The store becomes a thin shell:

```tsx
const app = createApp(
  () => {
    const state = { cursor: signal(0), items: signal<Item[]>([...]) }
    return {
      ...state,
      doneCount: computed(() => state.items.value.filter(i => i.done).length),
      apply: (op: TodoOp) => TodoList.apply(state, op),
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

Ops are just JSON — plain objects with a discriminator and named params. Same shape as Redux actions, Elm messages, and event sourcing events. No classes, no closures, no symbols. (The `as any` cast in `.apply()` is the trade-off for keeping the dispatcher generic. For full type safety, use a `switch` on `op.op` instead.)

**What this enables**:
- **Undo/redo**: Record ops in a stack, replay or invert them
- **Logging**: `JSON.stringify(op)` — see exactly what happened
- **AI automation**: Ops are tool call results — an AI can drive your app
- **Collaboration**: Send ops over the wire to other clients
- **Time-travel**: Replay any sequence from an initial state

### Designing Robust Ops

The examples above use index-based ops: `{ op: "toggleDone", index: 2 }`. This works for undo within a single session, but breaks as soon as ops need to survive reordering — undo after other edits, concurrent ops from multiple users, or offline sync. If someone inserts an item at index 1, your `index: 2` now points to the wrong item.

**Prefer identity-based ops**: `{ op: "toggleDone", id: "abc123" }`. An op that says "toggle item abc123" works regardless of what order it arrives in. This is the same principle behind CRDTs (Conflict-free Replicated Data Types) — operations that commute (produce the same result regardless of order) are safe for concurrent and distributed use.

```typescript
// Fragile — depends on ordering
type FragileOp = { op: "toggleDone"; index: number }

// Robust — works regardless of order
type RobustOp = { op: "toggleDone"; id: string }

// Even better — idempotent (applying twice = applying once)
type IdempotentOp = { op: "setDone"; id: string; done: boolean }
```

The spectrum from fragile to robust:

| Op style | Undo | Concurrent edits | Offline sync |
|----------|------|-------------------|-------------|
| `index: 2` | Fragile | Breaks | Breaks |
| `id: "abc"` + toggle | Works | Works | Applies twice = toggled twice |
| `id: "abc"` + `done: true` | Works | Works | Applies twice = same result (idempotent) |

The last form — `{ op: "setDone", id: "abc", done: true }` — is fully idempotent: applying it any number of times produces the same state. This is the gold standard for ops that may be replayed or delivered more than once.

You don't need to start here. Index-based ops are fine for simple undo in a single session. But when you add collaboration, offline sync, or AI automation (where ops may arrive out of order), design your ops to be identity-based and ideally idempotent.

## "I Want to Ship to Terminal and Web" (Level 4)

Your app has I/O — saving to disk, showing notifications, fetching data. The domain logic is the same on both platforms, but the I/O is different: `fs.writeFile` on terminal, `localStorage` on web, and nothing during tests.

The fix is the same trick: make effects into data. Instead of *doing* I/O, domain functions *describe* what should happen:

```tsx
type Effect =
  | { effect: "persist"; data: unknown }
  | { effect: "toast"; message: string }

const TodoList = {
  moveCursor(s: State, { delta }: { delta: number }) {
    s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
  },

  toggleDone(s: State, { index }: { index: number }): Effect[] {
    s.items.value = s.items.value.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    )
    return [
      { effect: "persist", data: s.items.value },
      { effect: "toast", message: `Toggled ${s.items.value[index].text}` },
    ]
  },

  apply(s: State, op: TodoOp) { ... },
}
```

Same shape as ops — discriminator (`effect`) + named params. The runtime dispatches effects to runners. When your domain function's `.apply()` returns an `Effect[]`, `createApp` catches the return value and calls the matching runner for each effect. Swap the runners per platform:

```tsx
const app = createApp(
  () => { ... },
  {
    effects: {
      // Terminal: write to disk
      persist: async ({ data }) => { await fs.writeFile("data.json", JSON.stringify(data)) },
      toast: ({ message }) => { showToast(message) },
      // Web: same domain logic, different runners
      // persist: async ({ data }) => { localStorage.setItem("data", JSON.stringify(data)) },
    },
    key(input, key, { store }) { ... },
  },
)
```

Tests assert on what the function *says should happen* — no mocks, no I/O, no async:

```tsx
test("toggleDone persists and toasts", () => {
  const s = { cursor: signal(0), items: signal([{ text: "Buy milk", done: false }]) }
  const effects = TodoList.toggleDone(s, { index: 0 })
  expect(effects).toContainEqual({ effect: "persist", data: expect.any(Array) })
})
```

**The upgrade is per-function, not per-app.** Some functions return nothing, others return `Effect[]`. You upgrade individual functions as they need effects.

**What inkx adds**: The `effects` option in `createApp()` intercepts effect arrays returned from domain functions and routes them to declared runners automatically. Without inkx, you'd write a thin dispatcher yourself — the pattern is the same.

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

For complex apps, decompose into independent domain objects that each own a slice of state. No machine imports another — they communicate through dispatch effects:

```typescript
const Board = {
  moveCursor(s: BoardState, { delta }: { delta: number }) { ... },
  fold(s: BoardState, { nodeId }: { nodeId: string }): Effect[] { ... },
  apply(s: BoardState, op: BoardOp) { ... },
}

const Dialog = {
  open(s: DialogState, { kind }: { kind: string }) { ... },
  confirm(s: DialogState): Effect[] {
    s.open = false
    return [{ effect: "dispatch", op: "addItem", text: s.value }]
  },
  apply(s: DialogState, op: DialogOp) { ... },
}
```

`Dialog.confirm()` says "dispatch addItem" as a data object; the effect runner routes it to the right domain function. Each machine is independently testable — communication is through serializable effect objects.

All machines share a single store:

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

Components pick what they need — they only re-render when the signals they read change. (`useApp()` without a selector returns the whole store object, but since `search.query` is a signal, only components that read `.value` subscribe to changes.)

```tsx
function SearchBar() {
  const { search } = useApp()
  return <Text>Search: {search.query.value} ({search.results.value.length} results)</Text>
}
```

## Prior Art

The ops-as-data and effects-as-data patterns have been independently discovered many times:

| System | What it makes data | Approach |
|--------|-------------------|----------|
| Redux | Operations | `dispatch(action)` + reducer |
| Event sourcing | Operations | Events as plain objects — store, replay, project |
| Elm | Ops + effects | `update : Msg -> Model -> (Model, Cmd Msg)` |
| redux-loop | Effects | Reducer returns `[state, effects]` |
| Hyperapp v2 | Effects | Optional tuple return from actions |
| Command pattern | Operations | Encapsulate request as object |

## See Also

- [Runtime Layers](runtime-layers.md) — createRuntime, createStore, run, createApp API reference
