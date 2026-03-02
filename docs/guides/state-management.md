# State Management Guide

> Start simple. Add structure when complexity demands it. Each level changes exactly one thing.

inkx supports a progression of state management approaches. Most apps never need to go beyond Level 2. Each level builds on the previous — the concepts carry forward, and you can mix levels within a single app.

## The Levels

```
Level 1: Component State     useState/useReducer       — local, per-component
Level 2: Shared State        createApp + set/get        — shared, centralized
Level 3: Actions             createApp + reducer        — structured, testable
Level 4: Pure                createApp + reducer + effects  — pure, serializable, replayable
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

**The solution**: `createApp()` provides shared state across all components. Components subscribe to individual slices via `useApp(selector)` — only the ones that read a changed field re-render. Key handling moves to one place.

This is equivalent to Zustand's `create()` + `useStore(selector)` pattern, or Redux's `useSelector()` — but `createApp` integrates the store with the app lifecycle (input, exit, effects) so you don't wire them separately.

```tsx
import { createApp, useApp } from "inkx/runtime"

const app = createApp(
  () => (set, get) => ({
    cursor: 0,
    items: ["first", "second", "third"],
    moveCursor: (d: number) =>
      set((s) => ({ cursor: Math.max(0, Math.min(s.cursor + d, s.items.length - 1)) })),
  }),
  {
    key: (input, key, { get }) => {
      if (input === "j") get().moveCursor(1)
      if (input === "k") get().moveCursor(-1)
      if (input === "q") return "exit"
    },
  },
)

function ItemList() {
  const items = useApp((s) => s.items)
  const cursor = useApp((s) => s.cursor)
  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={item} color={i === cursor ? "cyan" : undefined}>
          {i === cursor ? "> " : "  "}
          {item}
        </Text>
      ))}
    </Box>
  )
}

await app.run(<ItemList />)
```

Good for most interactive TUI apps — dashboards, file browsers, list views, dialogs. State is shared but the transitions are simple enough to express as `set()` calls.

### Level 3: Actions

**The problem**: State transitions get complex — multiple fields updated together, conditional logic in `set()` callbacks, no clear record of *what happened*. You can't test state logic without mounting React components.

**The solution**: Pass a reducer to `createApp()` instead of a store factory. State transitions become a pure function you can test by calling it directly — no React, no mocks, no async. Actions are serializable data that documents what happened: you can log, inspect, and replay them.

This is the same pattern as Redux (`(state, action) → state`) or Elm's `update` function. The difference is ergonomic: `createApp` wires the reducer into the app lifecycle (input routing, exit handling) and `useApp` provides selector-based subscriptions — no Provider wrappers, no `connect()`, no boilerplate.

```tsx
import { createApp, useApp } from "inkx/runtime"

interface State {
  cursor: number
  items: { text: string; done: boolean }[]
}

type Action =
  | { type: "MOVE_CURSOR"; delta: number }
  | { type: "TOGGLE_DONE"; index: number }
  | { type: "ADD_ITEM"; text: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "MOVE_CURSOR":
      return { ...state, cursor: clamp(state.cursor + action.delta, 0, state.items.length - 1) }
    case "TOGGLE_DONE":
      return { ...state, items: state.items.map((item, i) =>
        i === action.index ? { ...item, done: !item.done } : item
      ) }
    case "ADD_ITEM":
      return { ...state, items: [...state.items, { text: action.text, done: false }] }
  }
}

const app = createApp(reducer, {
  init: { cursor: 0, items: [] },
  key: (input, key, { dispatch }) => {
    if (input === "j") dispatch({ type: "MOVE_CURSOR", delta: 1 })
    if (input === "k") dispatch({ type: "MOVE_CURSOR", delta: -1 })
    if (input === "x") dispatch({ type: "TOGGLE_DONE", index: get().cursor })
    if (input === "q") return "exit"
  },
})
```

Testing is trivial — call the function, check the result:

```tsx
test("MOVE_CURSOR clamps at bottom", () => {
  const state = { cursor: 2, items: [{ text: "a" }, { text: "b" }, { text: "c" }] }
  const next = reducer(state, { type: "MOVE_CURSOR", delta: 1 })
  expect(next.cursor).toBe(2) // clamped
})
```

No React, no mocks, no async.

Good for apps with structured state transitions. This is the sweet spot for most complex TUI apps.

### Level 4: Pure (Effects as Data)

**The problem**: Side effects (file I/O, HTTP, timers, toasts) are tangled into your action handlers. You can test that state changed, but not that a save was triggered or a notification was sent — not without mocking the world. Undo/redo requires snapshotting because transitions aren't invertible. Collaborative editing requires serializable operations, but your effects are function calls.

**The solution**: The reducer returns `[state, effects]` instead of just `state`. Effects are data objects describing what should happen — the runtime executes them. The reducer never touches I/O, making it a true pure function. Effect runners are swappable: production runners do real I/O, test runners collect and assert, replay runners skip I/O. This unlocks undo/redo (invertible operations), collaborative editing (serializable ops), AI automation (actions as tool calls), and platform portability (same reducer in terminal and browser).

This is the Elm Architecture: `update : Msg -> Model -> (Model, Cmd Msg)`. Also implemented by redux-loop and Hyperapp v2. inkx uses the same `Array.isArray` detection as Hyperapp — return plain state when there are no effects, return `[state, effects]` when there are. No wrapper types, no special constructors.

```tsx
type Effect =
  | { type: "persist"; data: unknown }
  | { type: "toast"; message: string }
  | { type: "dispatch"; action: Action }

function reducer(state: State, action: Action): State | [State, Effect[]] {
  switch (action.type) {
    // No effects needed — return state directly (Level 3 style)
    case "MOVE_CURSOR":
      return { ...state, cursor: clamp(state.cursor + action.delta, 0, state.items.length - 1) }

    // Effects needed — return [state, effects] tuple
    case "TOGGLE_DONE": {
      const items = state.items.map((item, i) =>
        i === action.index ? { ...item, done: !item.done } : item
      )
      return [
        { ...state, items },
        [
          { type: "persist", data: items },
          { type: "toast", message: `Marked ${items[action.index].text} as done` },
        ],
      ]
    }

    case "ADD_ITEM":
      return [
        { ...state, items: [...state.items, { text: action.text, done: false }] },
        [{ type: "persist", data: state.items }],
      ]
  }
}

const app = createApp(reducer, {
  init: { cursor: 0, items: [] },
  effects: {
    persist: async (effect) => { await fs.writeFile("data.json", JSON.stringify(effect.data)) },
    toast: (effect) => { showToast(effect.message) },
    dispatch: (effect, dispatch) => { dispatch(effect.action) },
  },
  key: (input, key, { dispatch }) => {
    if (input === "j") dispatch({ type: "MOVE_CURSOR", delta: 1 })
    if (input === "x") dispatch({ type: "TOGGLE_DONE", index: get().cursor })
    if (input === "q") return "exit"
  },
})
```

The `createApp` API is the same at every level — you just pass a reducer instead of a store factory, and optionally declare effect runners. The middleware handles both return shapes automatically: plain state (no effects) and `[state, effects]` tuple.

Assert on what the reducer *says should happen*, not on whether it happened:

```tsx
import { collect } from "inkx"

test("TOGGLE_DONE persists and toasts", () => {
  const state = { cursor: 0, items: [{ text: "Buy milk", done: false }] }
  const [next, effects] = collect(reducer(state, { type: "TOGGLE_DONE", index: 0 }))

  expect(next.items[0].done).toBe(true)
  expect(effects).toContainEqual({ type: "persist", data: expect.any(Array) })
  expect(effects).toContainEqual({ type: "toast", message: "Marked Buy milk as done" })
})
```

No mocks. No I/O. No async.

**The upgrade is per-case, not per-app.** Within a single reducer, some cases return plain state (Level 3) and others return `[state, effects]` (Level 4). You don't rewrite everything — you upgrade individual cases as they need effects.

### Reactive Subscriptions

At Levels 2-3, `useApp(selector)` re-evaluates every selector on every state change — components bail out if their slice didn't change, but the check is O(selectors). This is fine for dozens of subscribers but breaks down at scale (1000+ list items each subscribing to cursor position).

For large state trees, Level 4 pairs with `Reactive<T>` — a signal primitive that notifies only when a specific value changes:

```tsx
import { Reactive, useReactive } from "inkx"

// State fields that need granular subscriptions are Reactive<T>
interface State {
  cursor: Reactive<number>
  items: Reactive<Item[]>
  folds: Map<string, Reactive<boolean>>
}

// .apply() writes directly to reactive fields
function reducer(state: State, action: Action): State | [State, Effect[]] {
  switch (action.type) {
    case "MOVE_CURSOR":
      state.cursor.value = clamp(state.cursor.value + action.delta, 0, state.items.value.length - 1)
      return state  // mutation is intentional — Reactive<T> handles notification
  }
}

// Components subscribe to individual signals — O(1) per change
function ListItem({ index }: { index: number }) {
  const cursor = useReactive(state.cursor)
  const items = useReactive(state.items)
  const isCurrent = cursor === index

  return (
    <Text color={isCurrent ? "cyan" : undefined}>
      {isCurrent ? "> " : "  "}{items[index].text}
    </Text>
  )
}
```

Cursor move: 1 signal notifies, all mounted `ListItem` components re-evaluate `cursor === index`, only the 2 that changed (old and new) re-render. With `VirtualList` limiting mounted items to ~30-50 visible, this is O(visible) not O(total).

`Reactive<T>` replaces the need for Jotai atoms, Zustand selectors, or Redux's `useSelector` at this scale. It's equivalent to SolidJS signals or Vue refs, but integrated with React via `useSyncExternalStore`.

**You don't need Reactive<T> for most apps.** `useApp(selector)` is simpler and works well up to hundreds of subscribers. Reach for `Reactive<T>` when you have per-entity state with 1000+ potential subscribers — typically virtualized lists, tree views, or document editors.

## When to Use Each Level

| Signal | Level |
|--------|-------|
| One component, simple state | 1 — Component |
| Multiple components share state | 2 — Shared |
| Complex transitions, want testable state logic | 3 — Actions |
| Side effects in transitions, want pure/testable/replayable | 4 — Pure |
| Undo/redo, collaborative editing, action replay | 4 — Pure |
| AI automation (actions as tool calls) | 4 — Pure |

## Composing Machines

Level 4 reducers are just functions — you can structure them however you like. For complex apps, a useful pattern is decomposing into independent state machines that communicate through effects:

```tsx
// Each domain is a pure function with the same signature
function boardReducer(state: BoardState, action: BoardAction): BoardState | [BoardState, Effect[]] { ... }
function dialogReducer(state: DialogState, action: DialogAction): DialogState | [DialogState, Effect[]] { ... }
function searchReducer(state: SearchState, action: SearchAction): SearchState | [SearchState, Effect[]] { ... }

// Machines compose via dispatch effects — no machine imports another
function dialogReducer(state: DialogState, action: DialogAction) {
  switch (action.type) {
    case "CONFIRM":
      return [
        { ...state, open: false },
        [{ type: "dispatch", action: { type: "CREATE_ITEM", text: state.value } }],
      ]
    // ...
  }
}
// Dialog says "dispatch this action" — the effect runner routes it to the right reducer
```

Each machine is independently testable. Communication is through serializable effect objects.

## km: A Complete Level 4 Application

[km](https://github.com/beorn/km) is a full-featured TUI workspace built on inkx. It demonstrates the complete Level 4 architecture at scale — every subsystem is a pure `(state, op) → [state, effects]` function (km calls these "noun-singletons" with an `.apply()` convention, following the SlateJS pattern):

- **Board navigation**: `Board.apply(state, op) → [state, effects]` — cursor movement, folding, zoom, multi-select
- **Text editing**: `PlainText.apply(state, op) → [state, effects]` — readline-style character editing, kill ring via effects
- **Dialogs**: `Dialog.apply(state, op) → [state, effects]` — search, create item, filter — all dispatch results to board
- **Undo/redo**: `withHistory` plugin wraps `.apply()` — records invertible operations, replays them for undo
- **Command system**: Maps keys → semantic operations → dispatches to the right machine
- **Platform portable**: Same `.apply()` functions work in terminal (inkx) and browser (React DOM)

The top-level reducer delegates to domain machines:

```tsx
function reducer(state: AppState, action: AppAction) {
  switch (action.type) {
    case "insert_text": {
      const [text, effects] = PlainText.apply(state.text, action)
      return [{ ...state, text }, effects]
    }
    case "cursor_down": {
      const [board, effects] = Board.apply(state.board, action)
      return [{ ...state, board }, effects]
    }
  }
}
```

The progression was gradual — km started at Level 2, moved action handlers to Level 3, then migrated effects to data (Level 4) one handler at a time.

## Prior Art

| System | Level | Approach |
|--------|-------|----------|
| React useState | 1 | Component-local state |
| Zustand | 2 | Shared store with selectors (`useStore(s => s.field)`) |
| Redux | 3 | `(state, action) → state` with `useSelector` |
| Elm | 4 | `update : Msg -> Model -> (Model, Cmd Msg)` — the original |
| redux-loop | 4 | Reducer returns [state, effects] — Elm Architecture for Redux |
| Hyperapp v2 | 4 | Optional tuple return (same Array.isArray detection) |
| SolidJS signals | — | Fine-grained reactivity (equivalent to `Reactive<T>`) |
| Vue refs | — | Fine-grained reactivity (equivalent to `Reactive<T>`) |
| inkx createStore | 4 | Non-React TEA container: `(msg, model) → [model, effects]` (see [Runtime Layers](runtime-layers.md)) |

## See Also

- [Runtime Layers](runtime-layers.md) — createRuntime, createStore, run, createApp API reference
- [km TEA State Machines](../../../docs/design/tea-state-machines.md) — full architecture for a Level 4 app
