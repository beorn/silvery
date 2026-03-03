# State Management

> inkx makes it easy to graduate from local state to composable state machines — adopt each level only when you need it.

Your first inkx app uses `useState` and `useInput`. That's enough for a counter, a file browser, a simple list. Then your TUI grows — shared state across panes, undo, testable I/O, independent modules — and each requirement tempts you to reach for a new library or rewrite from scratch.

This guide shows a different path. Each level builds on the last with minimal changes. inkx provides tooling at each step — `createApp`, `createSlice`, effect runners, plugin composition — so the transition is mechanical, not architectural. You never rewrite; you graduate.

The patterns themselves are general — ops as data, effects as data, composable state machines work in any React framework. If you've heard of [The Elm Architecture](https://guide.elm-lang.org/architecture/) (TEA), that's where Levels 3+4 land. You arrive there incrementally, not all at once.

| Level | You need it when... | What inkx provides |
|-------|---------------------|-------------|
| **1 — Local** | Starting out | `useState` + `useInput` — just React |
| **2 — Shared** | Multiple components need the same state | `createApp` + `useApp` — centralized store, selective re-renders |
| **3 — Ops as Data** *(Redux's insight)* | Undo, collaboration, or automation | `createSlice` — typed operations, zero boilerplate |
| **4 — Effects as Data** *(Elm's insight)* | Pure logic, testable I/O | Effect runners — deterministic functions, swappable I/O |
| **5 — Composition** | Independent modules | Multiple slices — state machines that talk through data |

Most web apps stop at Level 2. TUI apps with keyboard-driven interaction, undo, and multi-pane layouts often reach Level 3. [Signals](#appendix-a-scaling-with-signals) (fine-grained reactivity) are orthogonal — they optimize re-renders at any level.

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

**The wall**: A second component needs the same state — and threading it through five levels of props means every intermediate component has to know about data it doesn't use.

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
      { id: "1", text: "Buy milk", done: false },
      { id: "2", text: "Write docs", done: true },
      { id: "3", text: "Fix bug", done: false },
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

Components access the store via `useApp(selector)`. Selectors are a widespread pattern — Redux, Zustand, MobX[^mobx], Recoil[^recoil] all use them. The idea: a function that extracts the slice of state a component cares about. Zustand (and Redux) track which slice each component selected and only re-render when that slice changes. `useApp(s => s.cursor)` re-renders only when the cursor changes, not when items change:

```tsx
function TodoList() {
  const cursor = useApp(s => s.cursor)
  const items = useApp(s => s.items)
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

> **Why Zustand over React Context?** Context is fine for low-frequency global state (current user, theme, locale). But it re-renders every consumer when *any* part of the context changes — so for high-frequency updates (cursor movement, typing, selections), it becomes a bottleneck. Zustand only re-renders components whose selected slice actually changed.
>
> **Why not `useReducer`?** React's built-in `useReducer` is Level 3 in disguise — `dispatch(action)` + a pure reducer is ops-as-data. It's a solid choice for complex state in a single component tree. The limitation: it doesn't give you cross-component subscriptions. Every consuming component must be a child of the provider, and there's no selector — every dispatch re-renders every consumer. Zustand adds the subscription layer that makes it scale.

> **inkx**: `createApp()` is a Zustand middleware that bundles the store with centralized key handling, terminal I/O, and exit handling into a single `app.run(<Component />)` call. Without inkx, you'd wire Zustand, keyboard input, and lifecycle yourself — the store pattern is the same.

As your app grows, selectors show their cost — Zustand runs *every* selector on *every* store update, even when only one slice changed. [Signals](#appendix-a-scaling-with-signals) solve this with fine-grained subscriptions: components read `.value` and automatically subscribe to exactly what they touched. Signals are a performance optimization, not a conceptual shift — skip them unless you have performance issues.

State is shared and renders are efficient. But the transitions themselves are still invisible.

**The wall**: You want undo. But `store.toggleDone()` is a function call — it mutated state and vanished. There's nothing to reverse, nothing to send to another client, nothing to replay.

---

## Level 3: Ops as Data — Redux's Insight

In Level 2, store methods are function calls that mutate and disappear. There's no lasting record — no event log, no action vocabulary, no data to intercept. The problem isn't any single missing feature; it's that transitions are invisible by design.

**The fix**: make operations visible by turning them into data. Instead of calling functions that mutate state, call functions that produce a serializable description of *what happened*:

```tsx
store.apply({ op: "moveCursor", delta: 1 })
store.apply({ op: "toggleDone", index: 2 })
```

These are just JSON — plain objects you can inspect, store, and manipulate. Once operations are data, a whole class of problems becomes trivial:

- **Undo/redo** — push ops onto a stack, pop to undo
- **Collaboration** — send ops over the wire; they're the natural unit of real-time sync
- **Time-travel debugging** — record every op, scrub through history like [Redux DevTools](https://github.com/reduxjs/redux-devtools)
- **Logging & bug reproduction** — `JSON.stringify(op)` gives an audit trail; save the sequence from production, replay locally
- **Middleware** — analytics, error tracking, persistence all observe the same op stream without coupling to handlers
- **AI automation** — ops are structured data an LLM can emit to drive your app
- **Testing** — assert on what ops were produced, not on internal state mutations

None of this is possible when operations are function calls that vanish after execution. This is the key mental shift: you're no longer *calling behavior* — you're *describing intent*. The store becomes a deterministic interpreter that processes descriptions, not a bag of functions that performs actions.

This requires one refactor: function arguments change from positional to named objects, so the params double as the operation payload. `moveCursor(1)` can't self-describe what "1" means; `{ op: "moveCursor", delta: 1 }` can — it's a self-describing, serializable action.

### Slicing up State

Pull the logic out of the store into a **slice** — a plain object that owns a piece of state and the operations on it. A slice has three parts: a discriminated union[^discriminated-union] of op types, handler functions for each op, and a `switch`-based dispatcher:

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
    switch (op.op) {
      case "moveCursor": return TodoList.moveCursor(s, op)
      case "toggleDone": return TodoList.toggleDone(s, op)
    }
  },
}
```

The `switch` is the type safety bridge — when `op.op` is `"moveCursor"`, TypeScript narrows the params to `{ delta: number }` automatically. Add an op variant, forget a case → compile error. That's three artifacts per op (union variant, handler, switch case), which is more ceremony than Level 2's direct function calls. The trade: you get exhaustive narrowing, a serializable action vocabulary, and a single entry point for all state transitions.

inkx provides `createSlice` to eliminate the union and the switch — you write only the handlers:

```tsx
import { createSlice } from "inkx/core"

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
```

`createSlice` infers the op union from your handler names and parameter types — TypeScript derives the state type from the factory, so you never write it twice:

```tsx
type TodoOp = typeof TodoList.Op
// { op: "moveCursor"; delta: number } | { op: "toggleDone"; index: number }
```

Adding a new op means adding one function. TypeScript still catches exhaustiveness errors: if you pattern-match on `TodoOp` elsewhere (e.g. an `inverse` function for undo), a missing case is a compile error.

The store wires in via `.create()`. (This example uses [signals](#appendix-a-scaling-with-signals) for reactivity; plain Zustand `set()`/`get()` works too.)

```tsx
const app = createApp(
  () => {
    const { state, apply } = TodoList.create()
    return {
      ...state,
      doneCount: computed(() => state.items.value.filter(i => i.done).length),
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

Now let's make good on the first promise — undo. You define an `inverse` function that returns the op which would undo a given op — `moveCursor(+1)` → `moveCursor(-1)`, toggling is its own inverse. The undo stack is just an array:

```tsx
type TodoOp = typeof TodoList.Op

function inverse(op: TodoOp): TodoOp {
  switch (op.op) {
    case "moveCursor": return { op: "moveCursor", delta: -op.delta }
    case "toggleDone": return op  // toggling is its own inverse
  }
}

const undoStack: TodoOp[] = []
const redoStack: TodoOp[] = []

function applyWithUndo(op: TodoOp) {
  undoStack.push(inverse(op))
  TodoList.apply(state, op)
  redoStack.length = 0  // new action clears redo
}

function undo() {
  const op = undoStack.pop()
  if (!op) return
  redoStack.push(inverse(op))
  TodoList.apply(state, op)
}
```

Notice that `inverse` pattern-matches on the same `TodoOp` union — TypeScript's exhaustive narrowing ensures every op has an inverse. If you add an op to `createSlice` and forget to handle it in `inverse`, the compiler tells you. The stack itself is just plain objects — serializable, inspectable, trivial to persist. In production, cap the stack size to avoid unbounded memory growth (Redux DevTools does the same).

Whether you use `createSlice` or the manual pattern, the slice, op types, and `.apply()` dispatcher are plain TypeScript. You can add convenience wrappers (`store.moveCursor = (p) => store.apply({ op: "moveCursor", ...p })`) if you prefer method-style calls in everyday code — both paths route through `apply()`, so undo/replay/logging captures them either way.

The examples above use index-based ops (`toggleDone, index: 2`), which work for single-session undo. For collaboration, offline sync, or AI automation, prefer identity-based ops that survive reordering — see [Appendix B: Designing Robust Ops](#appendix-b-designing-robust-ops).

Behavior is data now — serializable, reversible, replayable. But our domain functions still perform I/O directly: saving to disk, showing notifications, fetching from APIs.

**The wall**: You want to test `toggleDone` — but it calls `fs.writeFile()` and `showToast()` directly. You need mocks for everything.

---

## Level 4: Effects as Data — Elm's Insight

In Level 3, we made state transitions visible — but functions still perform I/O directly. The function signature doesn't tell you what side effects it has. You can't swap runners per platform, can't audit I/O from types, can't test without faking every service.

**The fix** is the same trick as Level 3: make effects into data. Instead of *doing* I/O, domain functions *describe* what should happen. The only change: functions that need I/O return an `Effect[]`:

```tsx
type Effect =
  | { effect: "persist"; data: unknown }
  | { effect: "toast"; message: string }

const TodoList = createSlice(
  () => ({ cursor: signal(0), items: signal<Item[]>([...]) }),
  {
    // Pure — same as before:
    moveCursor(s, { delta }: { delta: number }) {
      s.cursor.value = clamp(s.cursor.value + delta, 0, s.items.value.length - 1)
    },

    // Returns effects as data:
    toggleDone(s, { index }: { index: number }): Effect[] {
      s.items.value = s.items.value.map((item, i) =>
        i === index ? { ...item, done: !item.done } : item
      )
      return [
        { effect: "persist", data: s.items.value },
        { effect: "toast", message: `Toggled ${s.items.value[index].text}` },
      ]
    },
  },
)
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

No mocks. No fakes. No I/O. No async. The function's return type tells you *everything* it can do — state change plus a list of effects. You can read it, test it, and audit it without tracing through call chains. Compare with DI[^di]: you'd need a `FakePersistenceService`, wire it through a constructor, call the function, then inspect what the fake recorded. Here you just check what the function returned.

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

Notice the `persist` runner is already `async` — the runtime handles promises automatically. But what if the result of an async operation needs to feed back into the domain? For example, a fetch whose response should update state. The domain function can't `await` (it's pure), so instead it returns an effect that describes what to fetch *and* what op to dispatch with the result:

```tsx
type Effect =
  | { effect: "persist"; data: unknown }
  | { effect: "toast"; message: string }
  | { effect: "fetch"; url: string; onSuccess: TodoOp }

// The domain function stays pure — no await, no callback:
loadItems(s: State): Effect[] {
  return [{ effect: "fetch", url: "/api/items", onSuccess: { op: "setItems" } }]
}

// The runner does the async work and dispatches the result as a new op:
effects: {
  fetch: async ({ url, onSuccess }, { store }) => {
    const data = await fetch(url).then(r => r.json())
    store.apply({ ...onSuccess, data })
  },
}
```

This **dispatch-back pattern** keeps the entire async cycle in the same ops-as-data flow — the fetch result re-enters the domain through `apply()`, so it shows up in logs, undo history, and time-travel debugging just like any other op.

**The upgrade is per-function, not per-app.** Functions that don't need I/O stay unchanged. You upgrade individual functions as they need effects.

Step back and look at what you have: `apply(state, op) → [new state, effects]`. This is [The Elm Architecture](https://guide.elm-lang.org/architecture/) (TEA) — Elm calls it `update msg model = (model, cmd)`. You arrived here incrementally, but you now have what Elm enforces at the language level: every state change is an explicit op (predictable, replayable), every side effect is a return value (testable without mocks), and the entire domain is a pure function from input to output (portable across platforms). The difference is that Elm makes you pay the full cost upfront; here you adopted each piece only when you needed it.

Notice the throughline: **every level turns something invisible into data**. Level 3 turned behavior into data (ops). Level 4 turned I/O into data (effects). Level 5 will turn cross-module communication into data (dispatch effects). Each time something becomes data instead of behavior, it becomes loggable, replayable, testable, portable, and interceptable. That's the unifying thesis of this entire progression.

> **inkx**: The `effects` option in `createApp()` intercepts effect arrays returned from `.apply()` and routes them to declared runners automatically. inkx also provides a standalone TEA store (`createStore()` from `inkx/store`) with plugin composition — see [Runtime Layers](runtime-layers.md).

**The wall**: Your single slice is 400 lines. A search feature change breaks the cursor because they share state and a single `apply()`.

---

## Level 5: Composing State Machines

Up to now, everything lives in one slice. That worked when the app was small, but now board, dialog, and search are entangled — different concerns sharing state, competing for the same `apply()`, impossible to develop or test independently.

**The fix:** Each area of concern becomes its own slice with its own state, ops, and `.apply()`. We call this combination a **state machine** — a slice + the state it operates on + the set of ops it accepts. (Not a formal statechart[^statecharts] with explicit states and guards — just a self-contained module with well-defined transitions. If your interactions grow complex enough to need the formalism, [XState](https://xstate.js.org/) provides it.)

The key rule: **no state machine imports another**. They communicate through dispatch effects — the same pattern from Level 4:

```typescript
const Board = createSlice(
  () => ({ cursor: signal(0), items: signal<Item[]>([]) }),
  {
    moveCursor(s, { delta }: { delta: number }) { ... },
    fold(s, { nodeId }: { nodeId: string }): Effect[] { ... },
  },
)

const Dialog = createSlice(
  () => ({ open: signal(false), value: signal("") }),
  {
    open(s, { kind }: { kind: string }) { ... },
    confirm(s): Effect[] {
      s.open.value = false
      return [{ effect: "dispatch", target: "board", op: "addItem", text: s.value.value }]
    },
  },
)
```

`Dialog.confirm()` doesn't call Board directly. It returns `{ effect: "dispatch", target: "board", op: "addItem" }` — a data object. The effect runner routes it:

```tsx
const app = createApp(
  () => {
    const board = Board.create()
    const dialog = Dialog.create()
    const search = Search.create()

    // Each machine gets a namespace: state fields + dispatch
    return {
      board: { ...board.state, dispatch: board.apply },
      dialog: { ...dialog.state, dispatch: dialog.apply },
      search: { ...search.state, dispatch: search.apply },
    }
  },
  {
    effects: {
      dispatch: ({ target, op, ...params }, { store }) => {
        const machine = (store as any)[target]
        if (machine?.dispatch) return machine.dispatch({ op, ...params })
      },
      persist: async ({ data }) => { /* ... */ },
    },
    key(input, key, { store }) {
      if (input === "/") store.dialog.dispatch({ op: "open", kind: "search" })
      if (input === "j") store.board.dispatch({ op: "moveCursor", delta: 1 })
      if (input === "q") return "exit"
    },
  },
)
```

Each state machine is independently testable — call `Dialog.confirm(dialogState)` directly and assert on the effects it returns, without touching Board. Features stop sharing state and start exchanging messages — each machine can be developed, tested, and replaced independently.

Here's the full architecture at Level 5 — notice it's the same shape at every scale:

```
keypress / mouse / timer
         ↓
   dispatch(op)
         ↓
  machine.apply(state, op)
         ↓
  [new state, effects[]]
         ↓
   effect runners
    ├─ persist  → disk / localStorage
    ├─ toast    → notification UI
    ├─ fetch    → network → dispatch(result)
    └─ dispatch → another machine.apply(...)
```

Components pick what they need:

```tsx
function SearchBar() {
  const search = useApp(s => s.search)
  return <Text>Search: {search.query.value} ({search.results.value.length} results)</Text>
}
```

When your list grows to thousands of items and the cursor stutters, two techniques help at any level: per-entity signals and virtualization. See [Appendix C: Scaling to Thousands of Items](#appendix-c-scaling-to-thousands-of-items).

---

## Prior Art

The core idea — making operations and effects into data — has been discovered many times. [Elm](https://guide.elm-lang.org/architecture/) is the purest expression: the language enforces TEA, so every Elm app gets predictability, testability, and time-travel for free. The trade-off is that you pay the full architecture cost upfront, even for a counter.

| System | Levels | Approach |
|--------|--------|----------|
| **[Elm](https://guide.elm-lang.org/architecture/)** | **3+4+5** | **`update : Msg -> Model -> (Model, Cmd Msg)` — the gold standard** |
| [Redux](https://redux.js.org/) | 3 | `dispatch(action)` + reducer (ops as data, but effects live in middleware) |
| [redux-loop](https://github.com/redux-loop/redux-loop) | 3+4 | Extends Redux: reducer returns `[state, effects]` |
| [Hyperapp](https://github.com/jorgebucaran/hyperapp) v2 | 3+4 | Optional tuple return from actions |
| [XState](https://xstate.js.org/) | 5 | Statecharts[^statecharts] — formal state machines with explicit states, transitions, and composition |
| [MobX](https://mobx.js.org/) | 2 | Observable state with automatic tracking (OO-reactive, trades predictability for convenience) |
| [Event sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) | 3 | Events as plain objects — store, replay, project |
| [Command pattern](https://en.wikipedia.org/wiki/Command_pattern) | 3 | Encapsulate request as object (GoF[^gof]) |

Redux got Level 3 right but stopped there — side effects live in thunks and sagas[^thunks-sagas], not in the update function's return value. redux-loop and Hyperapp v2 completed the TEA shape by returning effects as data. This guide isn't reinventing the wheel — it's showing how to roll it out gradually.

This guide pieces these ideas into a single incremental progression for React: you get Elm's benefits without Elm's upfront cost, adopting each level only when you need it.

---

## Trade-offs: When Data Goes Too Far

The progression from functions to data is not free. Each level buys something real — but it also costs something real.

**When plain functions are fine.** At Levels 1 and 2, `store.toggleDone()` is a direct function call. It's simple, debuggable, and the call stack tells you exactly what happened. If you haven't hit one of these walls, stay here. Most dashboards, list views, and CRUD apps never need more. The guide's "walls" are real requirements, not aspirations; if you haven't hit the wall, don't climb it.

**The costs of making everything data.** Once you move to Level 3+:

- **Verbosity.** With `createSlice`, adding an op is one function — the same cost as Level 2. With the manual pattern, each op requires a union variant, a handler, and a switch case — three artifacts to maintain. Either way, callers write `{ op: "moveCursor", delta: 1 }` instead of `moveCursor(1)`.
- **Indirection.** When something goes wrong, the stack trace goes through `apply()` → handler instead of directly to the function. You lose some "click to navigate" convenience in your editor. Naming your ops well (and keeping slices small) mitigates this.
- **Type ceremony.** With the manual pattern, discriminated unions are powerful but verbose — every new operation means updating the union type and adding a switch case. `createSlice` eliminates this; you write the handler and the types are inferred. But even with `createSlice`, if you pattern-match on the op union elsewhere (e.g. an `inverse` function), you maintain that switch yourself.
- **Debugging the dispatcher.** When you log `{ op: "moveCursor", delta: 1 }`, you see *what* happened but not *why* the code decided to dispatch it. The dispatch site might be in a key handler, an effect runner, or another machine's effect. Good naming and tooling (Redux DevTools) help, but there's inherently more indirection to trace.

**When to use functions inside data.** Even at Level 4-5, not everything needs to be data. Effect *runners* are functions — they take effect descriptions and do real I/O. Computed values (`doneCount`) are functions. React components are functions. The boundary is: **crossing module boundaries** (between slices, between domain and I/O) should be data; **within a module** (the implementation of a single op handler), use whatever's clearest. `s.items.value.map(...)` inside `toggleDone` is a normal function call, and it should stay that way.

**How inkx minimizes the costs.** The trade-offs above are real, but framework tooling can absorb most of the mechanical pain:

- **Wiring** — `createApp()` handles the store-to-effects-to-runners pipeline. You declare effect runners once; the middleware intercepts `Effect[]` returns from `.apply()` and routes them automatically. No manual plumbing per call.
- **Composition** — `createStore()` with plugin composition (`compose(withFocusManagement(), withUndo())(update)`) adds cross-cutting concerns like focus, undo, or logging without touching individual machines. Each plugin wraps the update function — middleware-style, no per-op boilerplate.
- **Debugging** — `withDiagnostics()` validates incremental rendering, `INKX_INSTRUMENT=1` exposes per-frame counters, and the inspector (`INKX_DEV=1`) dumps the full node tree. These replace the "printf debugging through a dispatcher" problem with structured introspection.
- **Driver pattern** — `withCommands()` + `withKeybindings()` give you a `driver.cmd.down()` API where each command carries metadata (name, keys, help text). The dispatcher is no longer opaque — `driver.cmd.all()` lists every available action with its keybinding.

`createSlice` absorbs the union type + switch ceremony; the infrastructure around it (store creation, effect routing, plugin composition, debugging) is where inkx absorbs the rest so your slices stay focused on domain logic. See [Runtime Layers](runtime-layers.md) for the full API.

**The honest rule of thumb**: if you can't name a specific benefit you'd get from making something data (undo? replay? testing without mocks?), keep it as a function call. The progression is opt-in at every level — and opting out is a valid choice.

---

## The Takeaway

You don't choose a state management library. You choose how visible your state transitions are.

**The Elm Architecture (TEA)** is the formal name for what Levels 3+4 build: `update(msg, model) → (newModel, effects)`. Every state change is an explicit message (op). Every side effect is a return value, not a hidden call. The domain is a pure function from input to output. Elm the language enforces this from line one; this guide shows you can arrive there incrementally in React, adopting each piece only when a real requirement demands it.

The more visible your transitions are — the easier your app is to test, debug, automate, and scale. But visibility has a cost: verbosity, indirection, and ceremony. The right level is the one where the benefits you actually use outweigh the boilerplate you actually write. React doesn't force you into any of this. You grow into it one level at a time, and you never have to adopt more than you need.

## See Also

- [Runtime Layers](runtime-layers.md) — createRuntime, createStore, run, createApp API reference
- [Functional Core, Imperative Shell](https://kennethlange.com/functional-core-imperative-shell/) — the architectural principle behind Levels 3-5
- Dan Abramov, [You Might Not Need Redux](https://medium.com/@dan_abramov/you-might-not-need-redux-be46360cf367) — when (and when not) to reach for ops-as-data

---

## Appendix A: Scaling with Signals

As your app grows, selectors show their cost. Zustand runs *every* selector on *every* store update — 100 `<Row>` components each with `useApp(s => s.rows.get(id))` means 100 selector calls when the cursor moves, even though only 2 rows changed.

[Signals](https://github.com/tc39/proposal-signals) (TC39 proposal, stage 1) flip this. Components read `.value` and automatically subscribe to exactly what they touched — no diffing, no linear scan. Same model as [SolidJS](https://www.solidjs.com/) and [Vue 3](https://vuejs.org/). We use [Preact's implementation](https://github.com/preactjs/signals) (`@preact/signals-core`).

With signals, the factory returns a plain object — signals *are* the reactive state, so you don't need Zustand's `set()`:

```tsx
import { signal, computed, batch } from "@preact/signals-core"

const app = createApp(
  () => {
    const cursor = signal(0)
    const items = signal([
      { id: "1", text: "Buy milk", done: false },
      { id: "2", text: "Write docs", done: true },
      { id: "3", text: "Fix bug", done: false },
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

## Appendix B: Designing Robust Ops

The examples in Level 3 use index-based ops: `{ op: "toggleDone", index: 2 }`. This works for single-session undo but breaks when ops need to survive reordering — undo after other edits, concurrent users, or offline sync. If someone inserts at index 1, your `index: 2` now points to the wrong item.

**Prefer identity-based ops**: `{ op: "toggleDone", id: "abc123" }`. This is the same principle behind CRDTs[^crdt] — operations that commute (produce the same result regardless of order) are safe for concurrent use.

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

## Appendix C: Scaling to Thousands of Items

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

[^mobx]: [MobX](https://mobx.js.org/) — observable state management with automatic dependency tracking. OO-reactive: convenient but trades away the predictability of explicit ops.
[^recoil]: [Recoil](https://recoiljs.org/) — Meta's experimental atomic state management for React, where state is split into independent "atoms" with derived "selectors."
[^discriminated-union]: [Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions) — a TypeScript pattern where a union of object types shares a common tag field (here `op`). The compiler narrows the type in each `switch` case, giving you exhaustive type checking with zero runtime cost.
[^di]: [Dependency injection](https://en.wikipedia.org/wiki/Dependency_injection) (DI) — passing dependencies (database, HTTP client, etc.) into a function rather than hardcoding them. Testing-friendly, but requires wiring and fake implementations.
[^crdt]: [CRDTs](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) (Conflict-free Replicated Data Types) — data structures designed for distributed systems that can be edited independently on multiple replicas and merged without conflicts.
[^statecharts]: [Statecharts](https://statecharts.dev/) — an extension of finite state machines with hierarchy, concurrency, and history. Introduced by David Harel in 1987. [XState](https://xstate.js.org/) is the leading JavaScript implementation.
[^gof]: [Gang of Four](https://en.wikipedia.org/wiki/Design_Patterns) — the classic *Design Patterns* book (Gamma, Helm, Johnson, Vlissides, 1994) that cataloged 23 object-oriented patterns including Command.
[^thunks-sagas]: [Thunks](https://redux.js.org/usage/writing-logic-thunks) are functions returned from action creators that receive `dispatch` — they do async work then dispatch plain actions. [Sagas](https://redux-saga.js.org/) use generator functions to orchestrate side effects as a declarative, testable layer separate from reducers.
