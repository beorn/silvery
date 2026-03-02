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

Standard React. State lives in individual components via `useState` or `useReducer`.

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

**When this works**: Single-component apps, prototypes, simple tools. State is local, self-contained, and only one component needs it.

**When to move on**: When multiple components need the same state, or you're passing props through layers that don't use them (prop drilling), or you want to test state transitions without mounting React components.

### Level 2: Shared State

`createApp()` provides a Zustand store shared across all components. Components subscribe to individual slices — only the ones that read a field re-render when it changes.

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

**What changed**: State moved from component to store. Components read via `useApp()` selectors instead of props. Key handling is centralized in `createApp()` event handlers.

**When this works**: Most interactive TUI apps. Dashboards, file browsers, list views, dialogs. State is shared but the transitions are simple enough to express as `set()` calls.

**When to move on**: When state transitions get complex — multiple fields updated together, conditional logic in `set()` callbacks, side effects mixed with state changes, or you want to test state logic without mounting components.

### Level 3: Actions

Replace imperative `set()` calls with a dispatch/reducer pattern. State transitions are explicit, named, and testable as data.

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

**What changed**: `set()` calls became action objects. State transitions are in a pure function. Actions are serializable — you can log them, replay them, inspect them.

**Testing is now trivial**:

```tsx
test("MOVE_CURSOR clamps at bottom", () => {
  const state = { cursor: 2, items: ["a", "b", "c"] }
  const next = reducer(state, { type: "MOVE_CURSOR", delta: 1 })
  expect(next.cursor).toBe(2) // clamped
})
```

No React, no mocks, no async — call the function, check the result.

**When this works**: Apps with structured state transitions. The reducer is pure and testable, actions document what happened. This is the sweet spot for most complex TUI apps.

**When to move on**: When you need side effects (HTTP, file I/O, timers) and they're tangled into your action handlers. When you want to test that an action *triggers* a save without actually saving. When you need undo/redo, action replay, or collaborative editing.

### Level 4: Pure (Effects as Data)

The reducer returns `[state, effects]` instead of just `state`. Effects are data objects describing what should happen — the runtime executes them. The reducer never touches I/O.

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

**What changed**: Side effects moved from imperative code to data. The reducer is now a *pure function* — given the same state and action, it always returns the same result. Effects are handled by separate runners that can be swapped for testing.

**Testing the full round-trip**:

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

No mocks. No I/O. No async. You assert on what the reducer *says should happen*, not on whether it happened.

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
