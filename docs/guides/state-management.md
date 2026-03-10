# State Management

Start with `useState` — standard React. When state gets shared across components, move to a store. When you need undo or replay, make state transitions into data. When side effects need testing, return them as data too. Each sip makes your app more testable and composable — take them one at a time, when the complexity justifies it.

For the full conceptual progression with both state management _and_ event handling evolving together, see [Terminal Apps](/guides/terminal-apps).

## `useState` — Local State

Standard React. Perfect for local UI state — form fields, toggles, hover states, animation flags.

```tsx
import { useState } from "react"
import { run, useInput } from "@silvery/term/runtime"
import { Text } from "silvery"

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

State lives inside a component. Input handling is a function call. Both invisible to everything outside this component.

**When to move on:** A second component needs the same state, and threading it through props means every intermediate component has to know about data it doesn't use.

## `createApp()` — Shared State

`createApp()` is a [Zustand](https://github.com/pmndrs/zustand) middleware that bundles the store with centralized key handling, terminal I/O, and exit handling into a single `app.run(<Component />)` call.

```tsx
import { createApp, useApp } from "@silvery/term/runtime"
import { Box, Text } from "silvery"

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))

const app = createApp(
  () => (set, get) => ({
    cursor: 0,
    items: [
      { id: "1", text: "Buy milk", done: false },
      { id: "2", text: "Write docs", done: true },
      { id: "3", text: "Fix bug", done: false },
    ],
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
  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={item.id} color={cursor === i ? "cyan" : undefined}>
          {cursor === i ? "> " : "  "}
          {item.done ? "[x] " : "[ ] "}
          {item.text}
        </Text>
      ))}
    </Box>
  )
}

function StatusBar() {
  const items = useApp((s) => s.items)
  const done = items.filter((i) => i.done).length
  return <Text dimColor>{done}/{items.length} done</Text>
}

await app.run(
  <Box flexDirection="column">
    <TodoList />
    <StatusBar />
  </Box>,
)
```

> **Why Zustand over React Context?** Context re-renders every consumer when _any_ part changes. Zustand only re-renders components whose selected slice actually changed — critical for high-frequency updates like cursor movement and typing.
>
> **Why not `useReducer`?** React's `useReducer` is dispatch + a pure reducer. Solid for a single component tree, but no cross-component subscriptions and no selector — every dispatch re-renders every consumer. Zustand adds the subscription layer that makes it scale.

As your app grows, selectors show their cost — Zustand runs every selector on every store update. [Signals](../reference/signals.md) solve this: components read `.value` and automatically subscribe to exactly what they touched. You'll see signals in the later sections — `createSlice` uses them for state.

**When to move on:** You want undo — but `store.toggleDone()` mutated state and vanished. You want customizable keybindings — but `onClick={() => selectCard()}` has no name to remap. Both problems have the same root: behavior is function calls that execute and disappear. You need to turn behavior into data.

## `createSlice()` — Actions as Data

`createSlice` turns state transitions into serializable data. You write handlers; it infers the op union:

```tsx
import { createSlice } from "@silvery/term/core"

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

Once operations are data: **undo/redo** (push ops onto a stack, pop to undo), **collaboration** (send ops over the wire), **time-travel debugging** (record every op, scrub through history), **AI automation** (ops are structured data an LLM can emit), **testing** (assert on what ops were produced).

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

**When to move on:** You want to test `toggleDone` — but it calls `fs.writeFile()` and `showToast()` directly. You need to make side effects visible.

## `createEffects()` — Side Effects as Data

`createEffects()` defines your effect vocabulary in one place — types, builders, and runners all inferred from a single definition:

```tsx
import { createEffects } from "@silvery/tea"

const fx = createEffects({
  persist: async ({ data }: { data: unknown }) => {
    await fs.writeFile("data.json", JSON.stringify(data))
  },
  toast: ({ message }: { message: string }) => {
    showToast(message)
  },
})
```

The `Effect` union is inferred from the runner param types — no manual type declaration:

```tsx
type Effect = typeof fx.Effect
// { type: "persist"; data: unknown } | { type: "toast"; message: string }
```

Each key on `fx` doubles as a typed builder:

```tsx
fx.persist({ data: items }) // → { type: "persist", data: items }
fx.toast({ message: "hi" }) // → { type: "toast", message: "hi" }
fx.nope({ bad: true }) // compile error — no "nope" effect defined
```

### Using with `createSlice`

Handlers return `typeof fx.Effect[]`. Mix freely — pure state updates return nothing, effectful ones return the array:

```tsx
const TodoList = createSlice(
  () => ({ cursor: signal(0), items: signal<Item[]>([...]) }),
  {
    moveCursor(s, { delta }: { delta: number }) {
      s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
    },
    toggleDone(s, { index }: { index: number }): typeof fx.Effect[] {
      s.items.value = s.items.value.map((item, i) =>
        i === index ? { ...item, done: !item.done } : item
      )
      return [
        fx.persist({ data: s.items.value }),
        fx.toast({ message: `Toggled ${s.items.value[index].text}` }),
      ]
    },
  },
)
```

### Wiring into `createApp`

Pass `fx` directly — `createApp` uses the same object as the runner map:

```tsx
const app = createApp(
  () => {
    const { state, apply } = TodoList.create()
    return { ...state, apply }
  },
  { effects: fx },
)
```

### Dispatch-back pattern

For async results that re-enter the domain, runners receive `dispatch` as a second argument:

```tsx
const fx = createEffects({
  persist: async ({ data }: { data: unknown }) => {
    await fs.writeFile("data.json", JSON.stringify(data))
  },
  fetch: async ({ url, onSuccess }: { url: string; onSuccess: TodoOp }, dispatch) => {
    const data = await fetch(url).then((r) => r.json())
    dispatch({ ...onSuccess, data })
  },
})

// Handler:
loadItems(s: State): typeof fx.Effect[] {
  return [fx.fetch({ url: "/api/items", onSuccess: { op: "setItems" } })]
}
```

The fetch result re-enters the domain through `dispatch()`, so it shows up in logs, undo history, and time-travel debugging.

### Testing

Handlers are pure — call them directly, assert on returned effects. The builders double as expected-value constructors:

```tsx
test("toggleDone persists and toasts", () => {
  const s = { cursor: signal(0), items: signal([{ text: "Buy milk", done: false }]) }
  const effects = TodoList.toggleDone(s, { index: 0 })
  expect(effects).toContainEqual(fx.persist({ data: expect.any(Array) }))
  expect(effects).toContainEqual(fx.toast({ message: "Toggled Buy milk" }))
})
```

No mocks, no fakes, no async. `collect()` normalizes results for reducers that mix pure and effectful cases — see [Runtime Layers](/guide/runtime-layers).

> **The pattern has a name.** If you've followed from `useState` to here, you've arrived at [The Elm Architecture](https://guide.elm-lang.org/architecture/) (TEA): every state change is a serializable action, every side effect is a return value, and the domain is a pure function. Elm enforces this at the language level; Silvery lets you grow into it one step at a time.

## `createStore()` — Standalone Store

For apps that don't need `createApp`'s Zustand integration, `createStore()` provides a standalone store with plugin composition:

```tsx
import { createStore } from "@silvery/term/store"

const store = createStore(initialState, update, {
  effects: fx,
  plugins: [withUndo(), withLogging()],
})
```

Plugin composition via `compose(withFocusManagement(), withUndo())(update)` adds cross-cutting concerns without touching individual machines. The same `fx` from `createEffects()` works here — one definition, multiple wiring points.

See [Runtime Layers](/guide/runtime-layers) for the full API.

## Appendix A: Under the Hood — It's Just Objects

There's no magic behind `createSlice` or `createEffects`. Ops and effects are plain JSON objects. `createSlice` generates a discriminated union and a dispatch function from your handler map. `createEffects` generates builder functions that stamp `{ type: key, ...params }` and stores the runners for later lookup. That's it.

You can build the same thing by hand:

```tsx
// An op is a plain object with a discriminant
const op = { op: "moveCursor", delta: 1 }

// An effect is a plain object with a discriminant
const effect = { type: "persist", data: [1, 2, 3] }

// A handler is a pure function: (state, op) → state, or → [state, effects]
function update(state, op) {
  if (op.op === "increment") return { ...state, count: state.count + 1 }
  if (op.op === "save") return [state, [{ type: "persist", data: state }]]
  return state
}

// A runner is a function that performs the side effect
const runners = {
  persist: ({ data }) => fs.writeFile("data.json", JSON.stringify(data)),
}

// A store is anything that holds state and dispatches ops
function createStore(state, update, runners) {
  return {
    dispatch(op) {
      const result = update(state, op)
      const [next, effects] = Array.isArray(result) ? result : [result, []]
      state = next
      for (const e of effects) runners[e.type]?.(e)
    },
    getState: () => state,
  }
}
```

Everything Silvery provides — `createSlice`, `createEffects`, `tea()`, `createApp` — is convenience and type safety layered on top of this. The underlying data is always plain serializable objects, so you can:

- **Log and replay**: ops and effects are JSON — write them to a file, replay them later
- **Send over the wire**: ops work as WebSocket messages, HTTP payloads, or IPC
- **Integrate with other state managers**: feed ops into Redux, MobX, or your own store
- **Build custom tooling**: time-travel debuggers, AI agents, test harnesses — anything that can read JSON can drive your app
- **Swap runners per environment**: production hits the real API, tests collect effects, replays skip I/O entirely

The abstractions earn their keep through type inference and boilerplate reduction, but they never lock you in. If `createEffects` doesn't fit your setup, write your own builders. If `createSlice` is too opinionated, hand-roll the union. The protocol is the objects, not the library.

## Appendix B: Scaling with Signals

You've already seen signals throughout this guide — `createSlice` state factories return them:

```tsx
const TodoList = createSlice(
  () => ({
    cursor: signal(0),
    items: signal<Item[]>([...]),
    doneCount: computed(() => items.value.filter((i) => i.done).length),
  }),
  { ... },
)
```

`signal()` is the store state. `computed()` is derived state that sits on top — `doneCount` recomputes only when `items` changes, not on cursor moves. Components read `.value` and automatically subscribe to exactly what they touched. No selectors, no `useApp(s => s.foo)`, no manual subscription management.

This is ergonomic by design: Silvery bridges signals to Zustand under the hood, so you write `.value` and reactivity just works — from store definition through to component re-renders. Combined with per-entity signals (`Map<string, Signal<T>>`) and `VirtualList`, this scales to thousands of items with O(visible) re-renders.

See [Scaling with Signals](../reference/signals.md) for per-entity patterns, batching, and VirtualList integration.

## Appendix C: Designing Robust Ops

Index-based ops (`toggleDone, index: 2`) work for single-session undo but break under reordering, concurrency, or offline sync. Prefer identity-based, ideally idempotent ops for collaboration and AI automation.

See [Designing Robust Ops](../reference/robust-ops.md) for the full guide.
