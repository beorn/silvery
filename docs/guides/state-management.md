# State Management Guide

> Start simple. Add structure when complexity demands it. Each level changes exactly one thing.

inkx supports a progression of state management approaches. Most apps never need to go beyond Level 2. Each level builds on the previous — the concepts carry forward, and you can mix levels within a single app.

## The Levels

```
Level 1: Component State     useState/useReducer             — local, per-component
Level 2: Shared State        Zustand (createApp)             — shared, centralized
Level 3: Actions             Zustand + dispatch/reducer      — structured, testable
Level 4: Pure                Zustand + tea() + effects-data  — pure, serializable, replayable
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

**Good for**: Single-component apps, prototypes, simple tools. State is local, self-contained, and only one component needs it.

**You'll outgrow this when**: Multiple components need the same state, you're prop-drilling through layers that don't use the data, or you want to test state transitions without mounting React.

### Level 2: Shared State

**What this enables**: Any component can read any state via selectors — no prop drilling. Components subscribe to individual slices, so only the ones that read a changed field re-render. Key handling is centralized instead of scattered across components.

`createApp()` provides a Zustand store shared across all components:

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
```

**Good for**: Most interactive TUI apps. Dashboards, file browsers, list views, dialogs. State is shared but the transitions are simple enough to express as `set()` calls.

**You'll outgrow this when**: State transitions get complex — multiple fields updated together, conditional logic in `set()` callbacks, side effects mixed with state changes, or you want to test state logic without mounting components.

### Level 3: Actions

**What this enables**: State transitions become testable without React — call the reducer, assert on the result. Actions are serializable data that documents what happened. You can log, inspect, and replay action streams. The reducer is a pure function: same input, same output.

Replace imperative `set()` calls with a dispatch/reducer pattern:

```tsx
type Action =
  | { type: "MOVE_CURSOR"; delta: number }
  | { type: "TOGGLE_DONE"; index: number }
  | { type: "ADD_ITEM"; text: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "MOVE_CURSOR":
      return { ...state, cursor: clamp(state.cursor + action.delta, 0, state.items.length - 1) }
    case "TOGGLE_DONE":
      return { ...state, items: state.items.map((item, i) => (i === action.index ? { ...item, done: !item.done } : item)) }
    case "ADD_ITEM":
      return { ...state, items: [...state.items, { text: action.text, done: false }] }
  }
}

// With zustand-tea middleware:
const useStore = create(tea(reducer))

// Key handler dispatches actions instead of calling set()
function handleKey(input: string, dispatch: Dispatch<Action>) {
  if (input === "j") dispatch({ type: "MOVE_CURSOR", delta: 1 })
  if (input === "x") dispatch({ type: "TOGGLE_DONE", index: cursor })
}
```

**Testing is trivial** — no React, no mocks, no async:

```tsx
test("MOVE_CURSOR clamps at bottom", () => {
  const state = { cursor: 2, items: ["a", "b", "c"] }
  const next = reducer(state, { type: "MOVE_CURSOR", delta: 1 })
  expect(next.cursor).toBe(2) // clamped
})
```

**Good for**: Apps with structured state transitions. The reducer is pure and testable, actions document what happened. This is the sweet spot for most complex TUI apps.

**You'll outgrow this when**: You need side effects (HTTP, file I/O, timers) and they're tangled into your action handlers. When you want to test that an action *triggers* a save without actually saving. When you need undo/redo, action replay, or collaborative editing.

### Level 4: Pure (Effects as Data)

**What this enables**: The reducer becomes a *pure function* — given the same state and action, it always returns the same result. Side effects are data objects you can assert on in tests, not I/O calls buried in handlers. Effect runners are swappable: production runners do real I/O, test runners collect and assert, replay runners skip I/O. This unlocks undo/redo (invertible operations), collaborative editing (serializable ops over the network), AI automation (actions as tool calls), and platform portability (same reducer in terminal and browser).

The reducer returns `[state, effects]` instead of just `state`. Effects describe what should happen — the runtime executes them:

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
      const items = state.items.map((item, i) => (i === action.index ? { ...item, done: !item.done } : item))
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

// The tea() middleware handles both return shapes:
// - Plain state → no effects
// - [state, effects] → run effect handlers
const useStore = create(tea(reducer, effectRunners))
```

**Testing the full round-trip** — assert on what the reducer *says should happen*, not on whether it happened:

```tsx
import { collect } from "zustand-tea"

test("TOGGLE_DONE persists and toasts", () => {
  const state = { cursor: 0, items: [{ text: "Buy milk", done: false }] }
  const [next, effects] = collect(reducer(state, { type: "TOGGLE_DONE", index: 0 }))

  expect(next.items[0].done).toBe(true)
  expect(effects).toContainEqual({ type: "persist", data: expect.any(Array) })
  expect(effects).toContainEqual({ type: "toast", message: "Marked Buy milk as done" })
})
```

No mocks. No I/O. No async.

**Effect runners** are separate, swappable interpreters:

```tsx
const effectRunners = {
  persist: async (effect) => { await fs.writeFile("data.json", JSON.stringify(effect.data)) },
  toast: (effect) => { showToast(effect.message) },
  dispatch: (effect, dispatch) => { dispatch(effect.action) },
}

// In tests: runners that just collect effects
// In production: runners with real I/O
// In replay mode: runners that skip I/O
```

## When to Use Each Level

| Signal | Level |
|--------|-------|
| One component, simple state | 1 — Component |
| Multiple components share state | 2 — Shared |
| Complex transitions, want testable state logic | 3 — Actions |
| Side effects in transitions, want pure/testable/replayable | 4 — Pure |
| Undo/redo, collaborative editing, action replay | 4 — Pure |
| AI automation (actions as tool calls) | 4 — Pure |

**The upgrade is per-case, not per-app.** Within a single Level 4 reducer, some cases return plain state (Level 3) and others return `[state, effects]` (Level 4). You don't rewrite everything — you upgrade individual action handlers as they need effects.

## Composing Machines

At Level 4, complex apps decompose into independent state machines that communicate through effects:

```tsx
// Each domain is a pure function
function boardReducer(state: BoardState, action: BoardAction): BoardState | [BoardState, Effect[]] { ... }
function dialogReducer(state: DialogState, action: DialogAction): DialogState | [DialogState, Effect[]] { ... }
function searchReducer(state: SearchState, action: SearchAction): SearchState | [SearchState, Effect[]] { ... }

// Machines compose via dispatch effects
function dialogReducer(state, action) {
  case "CONFIRM":
    return [
      { ...state, open: false },
      [{ type: "dispatch", action: { type: "CREATE_ITEM", text: state.value } }],
    ]
}
// Dialog doesn't know about Board — it just says "dispatch this action"
// The effect runner routes it to the right reducer
```

Each machine is independently testable. No machine imports another. Communication is through serializable effect objects.

## km: A Complete Level 4 Application

[km](https://github.com/beorn/km) is a full-featured TUI workspace built on inkx. It demonstrates the complete Level 4 architecture at scale:

- **Board navigation**: `Board.apply(state, op) → [state, effects]` — cursor movement, folding, zoom, multi-select
- **Text editing**: `PlainText.apply(state, op) → [state, effects]` — readline-style character editing, kill ring via effects
- **Dialogs**: `Dialog.apply(state, op) → [state, effects]` — search, create item, filter — all dispatch results to board
- **Undo/redo**: `withHistory` plugin wraps `.apply()` — records invertible operations, replays them for undo
- **Command system**: Maps keys → semantic operations → dispatches to the right machine
- **Platform portable**: Same `.apply()` functions work in terminal (inkx) and browser (React DOM)

The progression was gradual — km started at Level 2, moved action handlers to Level 3, then migrated effects to data (Level 4) one handler at a time. The `tea()` middleware made this possible without rewriting the app.

## Prior Art

| System | Level | Approach |
|--------|-------|----------|
| React useState | 1 | Component-local state |
| Redux | 3 | dispatch + reducer (actions as data) |
| redux-loop | 4 | Reducer returns [state, effects] — Elm Architecture for Redux |
| Hyperapp v2 | 3-4 | Optional tuple return (same Array.isArray detection as tea()) |
| Elm | 4 | `update : Msg -> Model -> (Model, Cmd Msg)` — the original |
| inkx createStore | 4 | `(msg, model) → [model, effects]` with plugin composition |
| zustand-tea | 3-4 | Zustand middleware — gradual, per-case, mixed effects |

## See Also

- [Runtime Layers](runtime-layers.md) — createRuntime, createStore, run, createApp API reference
- [km TEA State Machines](../../../docs/design/tea-state-machines.md) — full architecture for a Level 4 app
