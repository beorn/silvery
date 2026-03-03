# State Management

> Five levels of React state management — from `useState` to composable state machines.

Every React app starts simple. Then requirements arrive — shared state, undo, testing, modularity — and each one tempts you to reach for a new library or rewrite from scratch. This guide shows a different path: a progression where each level builds on the last with minimal changes, and you only adopt what you need.

The patterns are general. Ops as data, effects as data, and composable state machines work in any React framework. If you've heard of [The Elm Architecture](https://guide.elm-lang.org/architecture/) (TEA), that's where Levels 3+4 land — and you arrive there incrementally, not all at once. [inkx](https://github.com/nicktomlin/inkx) provides tooling that makes each transition seamless.

```
keypress → store.apply(op) → domain logic → [new state, effects] → effect runners → I/O
               ↑                                                         │
               └──────────── dispatch effect (cross-machine) ────────────┘
```

| Level | You need it when... | What you get |
|-------|---------------------|-------------|
| **1 — Local** | Starting out | Just React |
| **2 — Shared** | Two components need the same state | Centralized store, selective re-renders |
| **3 — Ops as Data** | You want undo, logging, or AI automation | Serializable operations |
| **4 — Effects as Data** | You want tests without mocks | Pure domain logic, swappable I/O |
| **5 — Composition** | Multiple independent concerns | State machines that talk through data |

Most apps stop at Level 2. Signals (fine-grained reactivity) are orthogonal — they optimize re-renders at any level.

---

## Level 1: Local State

You're building a counter. One component, one piece of state. This is React at its simplest — no libraries, no abstractions, no decisions to make.

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

**The wall**: A second component needs the same state.

---

## Level 2: Shared Store

The counter grows into a todo list. You add a sidebar that shows how many items are done, and suddenly two components need the same data. You could lift state to a parent and pass it down as props — but that gets tedious fast, and every state change re-renders the entire tree below the parent.

The standard solution is a shared store. [Zustand](https://github.com/pmndrs/zustand) is a great fit — lightweight, hook-based, no boilerplate. You put state and actions in one object, and components subscribe to only the slices they care about.

The double-arrow `() => (set, get) => ({...})` is Zustand's [state creator](https://zustand.docs.pmnd.rs/guides/updating-state) pattern — `set` merges new state, `get` reads current state:

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
    key(input, key, { store }) {
      if (input === "j") store.moveCursor(1)
      if (input === "k") store.moveCursor(-1)
      if (input === "x") store.toggleDone()
      if (input === "q") return "exit"
    },
  },
)
```

Components access the store via `useApp(selector)`. Selectors are a widespread pattern — Redux, Zustand, MobX, Recoil all use them. The idea: a function that extracts the slice of state a component cares about. Zustand (and Redux) track which slice each component selected and only re-render when that slice changes. `useApp(s => s.cursor)` re-renders only when the cursor changes, not when items change:

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

> **Why Zustand over React Context?** Context re-renders every consumer when *any* part of the context changes. Zustand only re-renders components whose selected slice actually changed. For apps with frequent updates (cursor movement, typing), this difference is night and day.

> **inkx**: `createApp()` is a Zustand middleware that bundles the store with centralized key handling, terminal I/O, and exit handling into a single `app.run(<Component />)` call. Without inkx, you'd wire Zustand, keyboard input, and lifecycle yourself — the store pattern is the same.

**The wall**: You want undo/redo. But `store.toggleDone()` mutates state and is gone — there's no record of what happened.

### Scaling with Signals

As your app grows, selectors show their cost. Zustand runs *every* selector on *every* store update — 100 `<Row>` components each with `useApp(s => s.rows.get(id))` means 100 selector calls when the cursor moves, even though only 2 rows changed.

[Signals](https://github.com/tc39/proposal-signals) (TC39 proposal, stage 1) flip this. Components read `.value` and automatically subscribe to exactly what they touched — no diffing, no linear scan. Same model as SolidJS and Vue 3. We use [Preact's implementation](https://github.com/preactjs/signals) (`@preact/signals-core`).

With signals, the factory returns a plain object — signals *are* the reactive state, so you don't need Zustand's `set()`:

```tsx
import { signal, computed, batch } from "@preact/signals-core"

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

`signal()` creates reactive state. `computed()` derives from signals — `doneCount` recomputes only when `items` changes, not on cursor moves. `batch()` groups multiple signal writes into a single notification:

```tsx
batch(() => {
  cursor.value = 0
  items.value = newItems
  filter.value = ""
})
// → one notification, one re-render
```

Signals are orthogonal to the levels — you can use them at Level 2 or Level 5. They're a performance optimization, not a conceptual shift. If your app doesn't have performance issues with selectors, skip them.

> **inkx**: A bridge middleware connects signals to Zustand — when any signal's `.value` changes, Zustand subscribers are also notified. This is why we use `@preact/signals-core` (not `-react`): inkx's bridge handles the React integration.

---

## Level 3: Ops as Data

Your todo list works. A user toggles an item, realizes it was wrong, and reaches for Ctrl+Z. Nothing happens — because `store.toggleDone()` is a function call. It mutated state and vanished. There's no record of what happened, nothing to reverse, nothing to replay.

**The fix**: make operations visible by turning them into data. Instead of calling functions that mutate state, call functions that produce a serializable description of *what happened*:

```tsx
store.apply({ op: "moveCursor", delta: 1 })
store.apply({ op: "toggleDone", index: 2 })
```

These are just JSON — plain objects you can inspect, store, and manipulate. Once operations are data, a whole class of problems becomes trivial:

- **Undo/redo** — push ops onto a stack, pop to undo
- **Time-travel debugging** — record every op, scrub back and forth through app history like [Redux DevTools](https://github.com/reduxjs/redux-devtools)
- **Logging & audit trails** — `JSON.stringify(op)` — see exactly what the user did, when, in what order
- **Bug reproduction** — save an op sequence from production, replay it locally to reproduce the exact bug
- **AI automation** — ops are structured data — an LLM can drive your app by emitting ops
- **Collaboration** — send ops over the wire to other clients
- **Testing** — assert on what ops were produced, not on internal state mutations

None of this is possible when operations are function calls that vanish after execution.

This requires one refactor: function arguments change from positional to named objects, so the params double as the operation payload. `moveCursor(1)` can't self-describe what "1" means; `moveCursor({ delta: 1 })` can — it's the op payload minus the `op` tag:

```tsx
// These are equivalent — both produce { op: "moveCursor", delta: 1 }:
store.moveCursor({ delta: 1 })                    // direct (type-safe)
store.apply({ op: "moveCursor", delta: 1 })       // as data (serializable)
```

Both conventions produce the same serializable operation. `store.moveCursor({ delta: 1 })` routes through `.apply()` internally, so undo/replay/logging captures it either way.

### Extracting a Slice

Pull the logic out of the store into a **slice** — a plain TypeScript object that owns a piece of state and the operations on it (same idea as Redux Toolkit's [`createSlice`](https://redux-toolkit.js.org/api/createSlice), but without the framework). Each function takes state and a params object, and `.apply()` dispatches by name:

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
      if (input === "j") store.moveCursor({ delta: 1 })
      if (input === "k") store.moveCursor({ delta: -1 })
      if (input === "x") store.apply({ op: "toggleDone", index: store.cursor.value })
      if (input === "q") return "exit"
    },
  },
)
```

Now let's make good on the first promise — undo. It's just an array and a pointer:

```tsx
const undoStack: TodoOp[] = []
const redoStack: TodoOp[] = []

function applyWithUndo(op: TodoOp) {
  // Capture the inverse before applying
  const inverse = TodoList.inverse(state, op)
  TodoList.apply(state, op)
  undoStack.push(inverse)
  redoStack.length = 0  // new action clears redo
}

function undo() {
  const op = undoStack.pop()
  if (!op) return
  const inverse = TodoList.inverse(state, op)
  TodoList.apply(state, op)
  redoStack.push(inverse)
}
```

Each slice provides an `inverse(state, op)` that returns the op which would undo it — `setDone(id, true)` → `setDone(id, false)`. The stack is just an array of plain objects. Serializable, inspectable, trivial to persist.

This is a pure pattern — no framework tooling needed. The slice, op types, and `.apply()` dispatcher are plain TypeScript.

**The wall**: Your app does I/O — saving to disk, showing notifications, fetching data. Testing domain logic requires mocking all of it.

### Designing Robust Ops

The examples use index-based ops: `{ op: "toggleDone", index: 2 }`. This works for single-session undo but breaks when ops need to survive reordering — undo after other edits, concurrent users, or offline sync. If someone inserts at index 1, your `index: 2` now points to the wrong item.

**Prefer identity-based ops**: `{ op: "toggleDone", id: "abc123" }`. This is the same principle behind CRDTs — operations that commute (same result regardless of order) are safe for concurrent use.

```typescript
// Fragile — depends on ordering
type FragileOp = { op: "toggleDone"; index: number }

// Robust — works regardless of order
type RobustOp = { op: "toggleDone"; id: string }

// Gold standard — idempotent (applying twice = applying once)
type IdempotentOp = { op: "setDone"; id: string; done: boolean }
```

| Op style | Undo | Concurrent | Offline sync |
|----------|------|------------|-------------|
| `index: 2` | Fragile | Breaks | Breaks |
| `id: "abc"` + toggle | Works | Works | Double-toggle risk |
| `id: "abc"` + `done: true` | Works | Works | Idempotent |

You don't need to start here. Index-based is fine for simple undo. But when you add collaboration, offline sync, or AI automation — design identity-based, ideally idempotent.

---

## Level 4: Effects as Data

Your todo list saves to disk, shows toast notifications, and fetches from an API. You write tests for the domain logic, but they're slow and brittle — every test needs a fake filesystem, a mock toast service, and a stub HTTP client. You spend more time maintaining test infrastructure than writing actual tests.

**The fix** is the same trick as Level 3: make effects into data. Instead of *doing* I/O, domain functions *describe* what should happen. The only change: functions that need I/O return an `Effect[]`:

```tsx
type Effect =
  | { effect: "persist"; data: unknown }
  | { effect: "toast"; message: string }

const TodoList = {
  // Pure — same as before:
  moveCursor(s: State, { delta }: { delta: number }) {
    s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
  },

  // Returns effects as data:
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

Same shape as ops — discriminator (`effect`) + named params. Here's the payoff — tests assert on what the function *says should happen*:

```tsx
test("toggleDone persists and toasts", () => {
  const s = { cursor: signal(0), items: signal([{ text: "Buy milk", done: false }]) }
  const effects = TodoList.toggleDone(s, { index: 0 })
  expect(effects).toContainEqual({ effect: "persist", data: expect.any(Array) })
  expect(effects).toContainEqual({ effect: "toast", message: "Toggled Buy milk" })
})
```

No mocks. No fakes. No I/O. No async. Compare with DI: you'd need a `FakePersistenceService`, wire it through a constructor, call the function, then inspect what the fake recorded. Here you just check what the function returned.

The runtime dispatches effects to actual runners — swap them per platform:

```tsx
const app = createApp(
  () => { ... },
  {
    effects: {
      persist: async ({ data }) => { await fs.writeFile("data.json", JSON.stringify(data)) },
      toast: ({ message }) => { showToast(message) },
      // Web: same domain logic, different runners
      // persist: async ({ data }) => { localStorage.setItem("data", JSON.stringify(data)) },
    },
    key(input, key, { store }) { ... },
  },
)
```

**The upgrade is per-function, not per-app.** Functions that don't need I/O stay unchanged. You upgrade individual functions as they need effects.

Step back and look at what you have: `apply(state, op) → [new state, effects]`. This is [The Elm Architecture](https://guide.elm-lang.org/architecture/) (TEA) — Elm calls it `update msg model = (model, cmd)`. You arrived here incrementally, but you now have what Elm enforces at the language level: every state change is an explicit op (predictable, replayable), every side effect is a return value (testable without mocks), and the entire domain is a pure function from input to output (portable across platforms). The difference is that Elm makes you pay the full cost upfront; here you adopted each piece only when you needed it.

> **inkx**: The `effects` option in `createApp()` intercepts effect arrays returned from `.apply()` and routes them to declared runners automatically. inkx also provides a standalone TEA store (`createStore()` from `inkx/store`) with plugin composition — see [Runtime Layers](runtime-layers.md).

**The wall**: Your app has a board, a search dialog, a settings panel. They all live in one slice and it's getting unwieldy.

---

## Level 5: Composing State Machines

Your app has a board, a search dialog, and a settings panel. They started as methods on one big slice, but now `Board.apply()` is 400 lines, search and settings keep stepping on each other's state, and every new feature risks breaking something unrelated.

Each area of concern becomes its own slice with its own state, ops, and `.apply()`. We call this combination a **state machine** — a slice + the state it operates on + the set of ops it accepts.

The key rule: **no state machine imports another**. They communicate through dispatch effects — the same pattern from Level 4:

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

`Dialog.confirm()` doesn't call Board directly. It returns `{ effect: "dispatch", target: "board", op: "addItem" }` — a data object. The effect runner routes it:

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

    return { ...boardState, dialog: dialogState, search: searchState, ...machines }
  },
  {
    effects: {
      dispatch: ({ target, op, ...params }, { store }) => {
        const apply = (store as any)[target]
        if (apply) return apply({ op, ...params })
      },
      persist: async ({ data }) => { /* ... */ },
    },
    key(input, key, { store }) {
      if (input === "/") store.dialog({ op: "open", kind: "search" })
      if (input === "j") store.board({ op: "moveCursor", delta: 1 })
      if (input === "q") return "exit"
    },
  },
)
```

Each state machine is independently testable — `Dialog.confirm(state)` returns effects you can assert on without touching Board. Communication is through serializable effect objects you can log, replay, or intercept.

Components pick what they need:

```tsx
function SearchBar() {
  const { search } = useApp()
  return <Text>Search: {search.query.value} ({search.results.value.length} results)</Text>
}
```

---

## Scaling

Your todo list has 5,000 items and the cursor stutters. At scale, two techniques apply at any level:

**Per-entity signals** — `Map<string, Signal<T>>` gives each item its own signal. Edit one item → 1 re-render:

```tsx
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
    items.delete(id)  // clean up — stale signals leak memory
  },
}
```

**VirtualList** — only mount the ~50 visible rows. Combined with per-entity signals: edit one item → 1 re-render. Move cursor → 2 re-renders. O(visible), not O(total).

---

## Prior Art

The core idea — making operations and effects into data — has been discovered many times. [Elm](https://guide.elm-lang.org/architecture/) is the purest expression: the language enforces TEA, so every Elm app gets predictability, testability, and time-travel for free. The trade-off is that you pay the full architecture cost upfront, even for a counter.

| System | Levels | Approach |
|--------|--------|----------|
| **Elm** | **3+4+5** | **`update : Msg -> Model -> (Model, Cmd Msg)` — the gold standard** |
| Redux | 3 | `dispatch(action)` + reducer (ops as data, but effects live in middleware) |
| redux-loop | 3+4 | Extends Redux: reducer returns `[state, effects]` |
| Hyperapp v2 | 3+4 | Optional tuple return from actions |
| Event sourcing | 3 | Events as plain objects — store, replay, project |
| Command pattern | 3 | Encapsulate request as object |

Redux got Level 3 right but stopped there — side effects live in thunks and sagas, not in the update function's return value. redux-loop and Hyperapp v2 completed the TEA shape by returning effects as data.

This guide pieces these ideas into a single incremental progression for React: you get Elm's benefits without Elm's upfront cost, adopting each level only when you need it.

## See Also

- [Runtime Layers](runtime-layers.md) — createRuntime, createStore, run, createApp API reference
