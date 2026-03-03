# State Management

> Start simple. Add structure when complexity demands it.

This guide describes state management patterns for interactive applications. The patterns are general — ops as data and effects as data work in any framework. Where inkx adds specific tooling, it's noted inline.

| Level | What you get |
|-------|-------------|
| **1 — Component** | Local state, no abstractions |
| **2 — Shared** | Shared store, centralized keys (+ optional signals for fine-grained reactivity) |
| **3 — Ops as Data** | Undo/redo, replay, AI automation |
| **4 — Effects as Data** | Testable I/O without mocks, swappable runners |

Most apps only need Level 2.

## Your First App (Level 1)

A counter. State lives in the component — just React.

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

`useState` is standard React. `useInput` is inkx's keyboard hook; `run` starts the app and manages terminal I/O.

This works until a second component needs the same state.

## Sharing State (Level 2)

The counter grows into a todo list. A sidebar shows the count of done items while the main view shows the list. Both need the same data.

The standard approach is a shared store with centralized key handling. `createApp()` wraps a [Zustand](https://github.com/pmndrs/zustand) store — the double-arrow `() => (set, get) => ({...})` is Zustand's [state creator](https://zustand.docs.pmnd.rs/guides/updating-state) pattern, where `set` merges new state and `get` reads current state:

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

### Scaling with Signals

As your app grows, selectors start to show their cost. Zustand runs *every* selector on *every* store update — if you have 100 `<Row>` components each with `useApp(s => s.rows.get(id))`, that's 100 selector calls every time the cursor moves, even though only 2 rows actually need to re-render.

[Signals](https://github.com/tc39/proposal-signals) flip this. Instead of declaring what you read (selectors), components just read `.value` and automatically subscribe to exactly what they touched — no diffing, no linear scan. This is the same model as SolidJS and Vue 3. inkx uses [Preact's implementation](https://github.com/preactjs/signals) (`@preact/signals-core`).

With signals, the factory returns a plain object — signals *are* the reactive state, so you don't need Zustand's `set()` to trigger updates:

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

`signal()` creates reactive state. `computed()` derives from other signals — `doneCount` recomputes only when `items` changes, not when cursor moves. When updating multiple signals at once, wrap in `batch()` so subscribers are notified once:

```tsx
import { batch } from "@preact/signals-core"

batch(() => {
  cursor.value = 0
  items.value = newItems
  filter.value = ""
})
// → single notification, single re-render
```

**What inkx adds**: A bridge middleware that connects signals to Zustand — when any signal's `.value` changes, Zustand subscribers are also notified. This is why we use `@preact/signals-core` (not `-react`): inkx's bridge handles the React integration. Both subscription models work side by side: signal `.value` reads (automatic, fine-grained) and `useApp(s => s.cursor.value)` selectors (familiar).

## "I Want Undo" (Level 3)

Your todo list works. Now you want undo/redo. The problem: `store.toggleDone()` mutates state and is gone — you can't record what happened, replay it, or reverse it.

The fix: make operations visible by turning them into data. This requires a small refactor: function arguments change from positional (`moveCursor(1)`) to named objects (`moveCursor({ delta: 1 })`) so the params double as a serializable operation payload. Then add a `store.apply()` that takes a plain object describing the operation:

```tsx
store.apply({ op: "moveCursor", delta: 1 })
store.apply({ op: "toggleDone", index: 2 })
```

These are just JSON — `JSON.stringify()` them into a log, record them in an undo stack, send them over the wire.

One constraint: **function arguments must be named params objects** so the params double as the operation payload. `moveCursor(1)` can't self-describe what "1" means; `moveCursor({ delta: 1 })` can — and it's the op payload minus the `op` tag:

```tsx
// These are equivalent — both produce { op: "moveCursor", delta: 1 }:
store.moveCursor({ delta: 1 })                    // direct (type-safe)
store.apply({ op: "moveCursor", delta: 1 })       // as data (serializable)
```

Both calling conventions produce the same serializable operation — `store.moveCursor({ delta: 1 })` routes through `.apply()` internally, so undo/replay/logging captures it either way.

To implement this, pull the logic into a domain object. Each function takes a params object (matching the op fields), and `.apply()` dispatches by name:

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

The store exposes both calling conventions — direct methods for everyday code, `.apply()` for when you need the data:

```tsx
const app = createApp(
  () => {
    const state = { cursor: signal(0), items: signal<Item[]>([...]) }
    const apply = (op: TodoOp) => TodoList.apply(state, op)
    return {
      ...state,
      doneCount: computed(() => state.items.value.filter(i => i.done).length),
      apply,
      moveCursor: (p: { delta: number }) => apply({ op: "moveCursor", ...p }),
      toggleDone: (p: { index: number }) => apply({ op: "toggleDone", ...p }),
    }
  },
  {
    key(input, key, { store }) {
      // Both styles work — use whichever fits:
      if (input === "j") store.moveCursor({ delta: 1 })
      if (input === "k") store.moveCursor({ delta: -1 })
      if (input === "x") store.apply({ op: "toggleDone", index: store.cursor.value })
      if (input === "q") return "exit"
    },
  },
)
```

**What this enables**:
- **Undo/redo**: Record ops in a stack, replay or invert them
- **Logging**: `JSON.stringify(op)` — see exactly what happened
- **AI automation**: Ops are tool call results — an AI can drive your app
- **Collaboration**: Send ops over the wire to other clients
- **Time-travel**: Replay any sequence from an initial state

Level 3 is a pure pattern — no inkx-specific tooling needed. The domain object, op types, and `.apply()` dispatcher are plain TypeScript.

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

## "I Want Tests Without Mocks" (Level 4)

Your app has I/O — saving to disk, showing notifications, fetching data. You could abstract the I/O behind an interface and swap implementations (dependency injection). That works for platform portability, but your tests still need to set up fakes, and you can't inspect what the function *intended* to do — only what the fake recorded.

The fix is the same trick as Level 3: make effects into data. Instead of *doing* I/O, domain functions *describe* what should happen. Tests assert on what the function *says* — no mocks, no I/O, no async. The only change from Level 3: functions that need I/O return an `Effect[]`:

```tsx
type Effect =
  | { effect: "persist"; data: unknown }
  | { effect: "toast"; message: string }

const TodoList = {
  // No effects — same as before:
  moveCursor(s: State, { delta }: { delta: number }) {
    s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
  },

  // Returns effects as data — this is what changed:
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

Same shape as ops — discriminator (`effect`) + named params. This is where the payoff comes: tests assert on what the function *says should happen* — no mocks, no fakes, no I/O, no async:

```tsx
test("toggleDone persists and toasts", () => {
  const s = { cursor: signal(0), items: signal([{ text: "Buy milk", done: false }]) }
  const effects = TodoList.toggleDone(s, { index: 0 })
  expect(effects).toContainEqual({ effect: "persist", data: expect.any(Array) })
  expect(effects).toContainEqual({ effect: "toast", message: "Toggled Buy milk" })
})
```

Compare this with the DI approach: you'd need a `FakePersistenceService`, wire it through a constructor, call the function, then inspect what the fake recorded. Here you just check what the function returned. The domain logic is pure — the test is three lines.

The runtime dispatches effects to actual runners. Swap them per platform:

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

**The upgrade is per-function, not per-app.** Some functions return nothing, others return `Effect[]`. You upgrade individual functions as they need effects.

**What inkx adds**: The `effects` option in `createApp()` intercepts effect arrays returned from `.apply()` and routes them to declared runners automatically. Without inkx, you'd write a thin dispatcher yourself — the pattern is the same.

## Composing Domain Objects

As your app grows, you'll have multiple areas of concern — a board, a search dialog, a settings panel. Each is a domain object (like `TodoList` above) with its own state, ops, and `.apply()`. We call this combination a **state machine**: a domain object + the state it operates on + a set of ops it accepts.

The key rule: no domain object imports another. They communicate through dispatch effects — the same data-as-effects pattern from Level 4:

```typescript
const Board = {
  moveCursor(s: BoardState, { delta }: { delta: number }) { ... },
  fold(s: BoardState, { nodeId }: { nodeId: string }): Effect[] { ... },
  apply(s: BoardState, op: BoardOp) { ... },
}

const Dialog = {
  open(s: DialogState, { kind }: { kind: string }) { ... },
  confirm(s: DialogState): Effect[] {
    s.open.value = false
    return [{ effect: "dispatch", target: "board", op: "addItem", text: s.value.value }]
  },
  apply(s: DialogState, op: DialogOp) { ... },
}
```

`Dialog.confirm()` says "dispatch addItem to board" as a data object. The effect runner routes it:

```tsx
const app = createApp(
  () => {
    const boardState = { cursor: signal(0), items: signal<Item[]>([]) }
    const dialogState = { open: signal(false), value: signal("") }
    const searchState = { query: signal(""), results: signal<string[]>([]) }

    const machines = {
      board: (op: BoardOp) => Board.apply(boardState, op),
      dialog: (op: DialogOp) => Dialog.apply(dialogState, op),
      search: (op: SearchOp) => Search.apply(searchState, op),
    }

    return {
      ...boardState,
      dialog: dialogState,
      search: searchState,
      ...machines,
    }
  },
  {
    effects: {
      dispatch: ({ target, op, ...params }, { store }) => {
        // Route to the named machine
        const apply = (store as any)[target]
        if (apply) return apply({ op, ...params })
      },
      persist: async ({ data }) => { /* save to disk */ },
    },
    key(input, key, { store }) {
      if (input === "/") store.dialog({ op: "open", kind: "search" })
      if (input === "j") store.board({ op: "moveCursor", delta: 1 })
      if (input === "q") return "exit"
    },
  },
)
```

Each domain object is independently testable — call `Dialog.confirm(state)` and assert on the returned effects without touching Board at all. Communication is through serializable effect objects, which you can log, replay, or intercept.

Components pick what they need — they only re-render when the signals they read change. (`useApp()` without a selector returns the whole store object, but since `search.query` is a signal, only components that read `.value` subscribe to changes.)

```tsx
function SearchBar() {
  const { search } = useApp()
  return <Text>Search: {search.query.value} ({search.results.value.length} results)</Text>
}
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
