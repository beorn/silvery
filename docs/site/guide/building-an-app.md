# Building an App

Every level in this guide turns something invisible into data. Local state hides transitions inside function calls. Callbacks hide what the user intended. Each level you adopt makes one more category of hidden behavior visible — as serializable, inspectable, testable data. You adopt each level only when you need it, never rewrite, and never pay for what you don't use.

The app evolves: Counter → Todo list → Board. At each level, both state management and event handling advance together — because in a real app, they're inseparable.

| Level                                 | App                     | State                                       | Events                                      | What becomes data               |
| ------------------------------------- | ----------------------- | ------------------------------------------- | ------------------------------------------- | ------------------------------- |
| **1 — Starting Simple**               | Counter                 | `useState`                                  | `useInput` callback                         | _(nothing yet)_                 |
| **2 — Shared State + Spatial Events** | Todo list               | `createApp`/Zustand store                   | `withDomEvents()` — onClick, onKeyDown      | Shared state, spatial targeting |
| **3 — Everything is Data**            | Board                   | `createSlice` + ops-as-data                 | `withCommands` — named serializable actions | State transitions + user intent |
| **4 — Pure Functions**                | Board + I/O             | Effects as data (return `[state, effects]`) | Custom plugins (vim modes, file watchers)   | Side effects + event processing |
| **5 — Composable Machines**           | Board + Dialog + Search | Multiple slices, dispatch effects           | Plugin composition (`pipe()`)               | Cross-module communication      |

Most web apps stop at Level 2. TUI apps with keyboard-driven interaction, undo, and multi-pane layouts often reach Level 3. The patterns are general — ops as data, effects as data, composable state machines work in any React framework. If you've heard of [The Elm Architecture](https://guide.elm-lang.org/architecture/) (TEA), that's where Levels 3+4 land. You arrive there incrementally — one sip at a time.

---

## Level 1: Starting Simple

You're building a counter. One component, one piece of state, one input handler. This is React at its simplest.

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

```
Count: 0
```

Press `j` a few times:

```
Count: 3
```

`useState` is standard React. `useInput` is Silvery's keyboard hook — a callback that receives raw key data; `run` starts the app and manages terminal I/O.

At Level 1, state lives inside a component and input handling is a function call — both invisible to everything outside this component.

**The wall**: A second component needs the same state — and threading it through props means every intermediate component has to know about data it doesn't use. And you want click targets — but `useInput` doesn't know about spatial coordinates.

---

## Level 2: Shared State + Spatial Events

The counter grows into a todo list. You add a sidebar that shows how many items are done, and suddenly two components need the same data. Meanwhile, you want clickable items — `<Text onClick={...}>` like React DOM.

### Shared store

The standard solution is a shared store. [Zustand](https://github.com/pmndrs/zustand) is a great fit — lightweight, hook-based, no boilerplate. You put state and actions in one object, and components subscribe to only the slices they care about.

The double-arrow `() => (set, get) => ({...})` is Zustand's [state creator](https://zustand.docs.pmnd.rs/guides/updating-state) pattern — `set` merges new state, `get` reads current state:

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

Components access the store via `useApp(selector)`. Selectors are a widespread pattern — Redux, Zustand, MobX, Recoil all use them. The idea: a function that extracts the slice of state a component cares about. Zustand tracks which slice each component selected and only re-renders when that slice changes:

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
  return (
    <Text dimColor>
      {done}/{items.length} done
    </Text>
  )
}

await app.run(
  <Box flexDirection="column">
    <TodoList />
    <StatusBar />
  </Box>,
)
```

```
> [ ] Buy milk
  [x] Write docs
  [ ] Fix bug
1/3 done
```

> **Why Zustand over React Context?** Context re-renders every consumer when _any_ part changes. Zustand only re-renders components whose selected slice actually changed — critical for high-frequency updates like cursor movement and typing.

> **Silvery:** `createApp()` is a Zustand middleware that bundles the store with centralized key handling, terminal I/O, and exit handling into a single `app.run(<Component />)` call.

### Component event handlers

The `withDomEvents()` plugin adds React-style event handlers to Silvery components. Events bubble up the tree, components can stop propagation, and hit testing maps mouse coordinates to nodes:

```tsx
import { pipe, withDomEvents } from "@silvery/term/runtime"

function ItemList() {
  const items = useApp((s) => s.items)
  const cursor = useApp((s) => s.cursor)

  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Box key={item.id} onClick={() => store.setCursor(i)} onDoubleClick={() => store.startEdit(i)}>
          <Text color={i === cursor ? "cyan" : undefined}>
            {i === cursor ? "> " : "  "}
            {item.text}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

const app = pipe(createApp(store), withReact(<Board />), withDomEvents())
```

`withDomEvents()` intercepts events before the base handler. Keyboard events dispatch through the focus tree (capture → target → bubble). Mouse events are hit-tested against the render tree — the deepest node at `(x, y)` receives the event, which bubbles up through ancestors. Same event model as React DOM: `onClick`, `onDoubleClick`, `onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseEnter`, `onMouseLeave`, `onWheel`, `onKeyDown`, `onKeyDownCapture`.

State is shared and renders are efficient. Clicks resolve to components and events bubble. But the transitions and handlers are still invisible.

**The wall**: You want undo — but `store.toggleDone()` mutated state and vanished. You want customizable keybindings — but `onClick={() => selectCard()}` has no name to show in a command palette, no binding to remap. Both problems have the same root: behavior is function calls that execute and disappear. You need to turn behavior into data.

---

## Level 3: Everything is Data

This is the level where Silvery's architecture clicks. Two invisible things become data at once — because they're the same insight applied to two domains.

### State side: ops as data

In Level 2, store methods are function calls that mutate and disappear. **The fix**: turn operations into data. Instead of calling functions that mutate state, call functions that produce a serializable description of _what happened_:

```tsx
store.apply({ op: "moveCursor", delta: 1 })
store.apply({ op: "toggleDone", index: 2 })
```

These are just JSON — plain objects you can inspect, store, and manipulate. Once operations are data:

- **Undo/redo** — push ops onto a stack, pop to undo
- **Collaboration** — send ops over the wire
- **Time-travel debugging** — record every op, scrub through history
- **AI automation** — ops are structured data an LLM can emit
- **Testing** — assert on what ops were produced, not on internal state mutations

Silvery provides `createSlice` — you write only the handlers, it infers the op union from your handler names and parameter types:

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

Now undo is trivial — define an `inverse` function that returns the op which would undo a given op:

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

function applyWithUndo(op: TodoOp) {
  undoStack.push(inverse(op))
  TodoList.apply(state, op)
}
```

TypeScript's exhaustive narrowing ensures every op has an inverse — add an op to `createSlice` and forget to handle it in `inverse`, the compiler tells you.

### Event side: commands

Meanwhile, event handlers have the same problem. `if (input === "j") moveCursor(1)` is a function call — there's no data to serialize, no name for a command palette, no binding to remap.

**The fix**: turn input into named, serializable commands. Declare that `j` maps to the command `cursor_down`, and `cursor_down` produces the action `{ op: "moveCursor", delta: 1 }`:

```tsx
import { pipe, withDomEvents, withCommands } from "@silvery/term/runtime"

const registry = createCommandRegistry({
  cursor_down: {
    name: "Move Down",
    execute: (ctx) => ({ op: "moveCursor", delta: 1 }),
  },
  cursor_up: {
    name: "Move Up",
    execute: (ctx) => ({ op: "moveCursor", delta: -1 }),
  },
  toggle_done: {
    name: "Toggle Done",
    execute: (ctx) => ({ op: "toggleDone", index: ctx.cursor }),
  },
  select_node: {
    name: "Select",
    execute: (ctx) => ({ op: "select", nodeId: ctx.clickedNodeId }),
  },
})

const app = pipe(
  createApp(store),
  withReact(<Board />),
  withDomEvents(),
  withCommands({
    registry,
    getContext: () => buildContext(store),
    handleAction: (action) => store.apply(action),
    bindings: {
      key: { j: "cursor_down", k: "cursor_up", x: "toggle_done" },
      mouse: {
        click: (node) => "select_node",
        doubleClick: () => "enter_edit",
      },
    },
  }),
)
```

Once input is data:

- **Customizable keybindings** — the binding table is data, users can remap
- **Command palette** — `app.cmd.all()` lists every command with name, description, and current keys
- **AI automation** — `await app.cmd.cursor_down()` drives the app programmatically
- **Mouse commands** — clicks resolve to the same named actions as keys

### Same insight, both sides

Notice the pattern: Level 2 had function calls on both sides — `store.toggleDone()` and `onClick={() => selectCard()}`. Level 3 turns both into data — ops describe state changes, commands describe user intent. Both are serializable, inspectable, replayable.

Together they make the entire app automatable: commands describe input, ops describe state changes. The pipeline is now visible end to end:

```
keypress/click → command → op → state change → screen
```

The driver pattern makes this concrete for testing and AI:

```tsx
const driver = pipe(app, withKeybindings(bindings), withDiagnostics())

driver.cmd.all() // list available commands
await driver.cmd.cursor_down() // execute by name
driver.getState() // inspect state
```

### Hybrid: components + commands

Component handlers and commands coexist naturally. `withDomEvents()` fires first; if a component handles an event (stopPropagation), commands never see it. Unhandled events fall through to command resolution. `TextInput` handles its own keys via `onKeyDown`, while navigation and actions go through commands.

Behavior is data now — serializable, reversible, replayable on both the state and event sides. But our domain functions still perform I/O directly.

**The wall**: You want to test `toggleDone` — but it calls `fs.writeFile()` and `showToast()` directly. You want vim-style modal input — but the built-in command resolution is single-key. Both sides need the same thing: make the processing itself visible.

---

## Level 4: Pure Functions

### State side: effects as data

In Level 3, state transitions are visible — but functions still perform I/O directly. **The fix** is the same trick: make effects into data. Instead of _doing_ I/O, domain functions _describe_ what should happen:

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

Tests assert on what the function _says should happen_ — no mocks, no fakes, no I/O:

```tsx
test("toggleDone persists and toasts", () => {
  const s = { cursor: signal(0), items: signal([{ text: "Buy milk", done: false }]) }
  const effects = TodoList.toggleDone(s, { index: 0 })
  expect(effects).toContainEqual({ effect: "persist", data: expect.any(Array) })
  expect(effects).toContainEqual({ effect: "toast", message: "Toggled Buy milk" })
})
```

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
  },
)
```

For async results that need to feed back into the domain, use the **dispatch-back pattern** — the effect describes what to fetch and what op to dispatch with the result:

```tsx
type Effect =
  | { effect: "persist"; data: unknown }
  | { effect: "fetch"; url: string; onSuccess: TodoOp }

// Domain stays pure — no await, no callback:
loadItems(s: State): Effect[] {
  return [{ effect: "fetch", url: "/api/items", onSuccess: { op: "setItems" } }]
}

// The runner does async work and dispatches the result as a new op:
effects: {
  fetch: async ({ url, onSuccess }, { store }) => {
    const data = await fetch(url).then(r => r.json())
    store.apply({ ...onSuccess, data })
  },
}
```

Step back: `apply(state, op) → [new state, effects]`. This is [The Elm Architecture](https://guide.elm-lang.org/architecture/) — Elm calls it `update msg model = (model, cmd)`. You arrived here incrementally, but you now have what Elm enforces at the language level: every state change is an explicit op, every side effect is a return value, and the entire domain is a pure function.

### Event side: app plugins

Every extension in this guide — `withDomEvents`, `withCommands`, `withKeybindings` — is the same thing: an app plugin. A function that takes an app and returns an enhanced app:

```tsx
type AppPlugin<M, Msg> = (app: App<M, Msg>) => App<M, Msg>
```

This is the [SlateJS](https://docs.slatejs.org/concepts/08-plugins) editor model: `withHistory(withReact(createEditor()))`. Each plugin overrides methods on the app — `update` for event processing, `events` for event sources. You compose them with `pipe()`:

```tsx
const app = pipe(
  createApp(store), // kernel: event loop + state
  withReact(<Board />), // rendering: React + virtual buffer
  withTerminal(process), // terminal: stdin→events, stdout→output
  withFocus(), // processing: Tab navigation, focus scopes
  withDomEvents(), // processing: dispatch to component tree
  withCommands(opts), // processing: key/mouse → named commands
  withKeybindings(bindings), // API: press() → keybinding resolution
  withDiagnostics(), // API: render invariant checks
)
```

A plugin has two parts: a **slice** (pure reducer for its state) and a **plugin function** (event wiring, subscriptions, API surface):

```tsx
function withVimModes() {
  return {
    slice: (msg: AppEvent, vim: VimState): VimState => {
      if (msg.type !== "term:key") return vim
      if (vim.mode === "normal" && msg.data.input === "i") return { ...vim, mode: "insert" }
      if (vim.mode === "insert" && msg.data.key.escape) return { ...vim, mode: "normal" }
      return vim
    },

    plugin: (app) => {
      const { update } = app
      app.update = (msg, model) => {
        if (msg.type === "term:key" && model.vim.mode === "insert") {
          return update(msg, model) // skip command resolution, let it reach text input
        }
        return update(msg, model)
      }
      return app
    },
  }
}
```

Mode lives **in the model**, not in a closure — so it's inspectable, serializable, and survives replay.

### Three mechanisms for event sources

Not all sources need to be app plugins. Silvery provides three mechanisms:

| Mechanism            | Lifecycle                           | Use when...                                       |
| -------------------- | ----------------------------------- | ------------------------------------------------- |
| **App plugins**      | Static — created once at app setup  | Always-on sources: stdin, resize, timers          |
| **React components** | Reactive — mount/unmount with state | Conditional sources: file watchers, network polls |
| **Effects**          | One-shot — triggered by update      | Request/response: fetch, save, notifications      |

React components are the most natural way to add reactive sources:

```tsx
function FileWatcher({ path }: { path: string }) {
  const dispatch = useDispatch()

  useEffect(() => {
    const watcher = watch(path, (ev) => dispatch({ type: "fs:change", data: ev }))
    return () => watcher.close()
  }, [path])

  return null // renderless
}
```

Vault opens → component mounts → watcher starts. Vault closes → unmounts → stops. React's reconciler IS the subscription manager.

Both sides of Level 4 do the same thing: make processing visible. Effects-as-data makes I/O visible on the state side. Plugins make event processing visible on the event side. Everything the app does is now data.

**The wall**: Your single slice is 400 lines. A search feature change breaks the cursor because they share state and a single `apply()`.

---

## Level 5: Composable Machines

Everything lives in one slice. That worked when the app was small, but now board, dialog, and search are entangled.

**The fix:** Each area of concern becomes its own slice with its own state, ops, and `.apply()`. We call this a **state machine** — a slice + the state it operates on + the set of ops it accepts. The key rule: **no state machine imports another**. They communicate through dispatch effects:

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
    },
    key(input, key, { store }) {
      if (input === "/") store.dialog.dispatch({ op: "open", kind: "search" })
      if (input === "j") store.board.dispatch({ op: "moveCursor", delta: 1 })
      if (input === "q") return "exit"
    },
  },
)
```

Each state machine is independently testable — call `Dialog.confirm(dialogState)` directly and assert on the effects it returns, without touching Board.

On the event side, the full plugin architecture composes the same way:

```
using app = pipe(
  createApp(store, { slices })     kernel: event loop + composed reducers
  ├─ withReact(<View />)           rendering: React + virtual buffer
  ├─ withTerminal(process)         terminal: stdin→events, stdout→output
  ├─ withFocus()                   processing: Tab navigation, focus scopes
  ├─ withDomEvents()               processing: dispatch to components
  ├─ withVimModes()                processing: modal key routing
  ├─ withCommands(opts)            processing: key/mouse → named commands
  ├─ withKeybindings(bindings)     API: press() → keybinding resolution
  └─ withDiagnostics()             API: render invariant checks
)
```

Here's the full architecture — notice it's the same shape at every scale:

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

---

## Trade-offs: When Data Goes Too Far

The progression from functions to data is not free. Each level buys something real — but it also costs something real.

**When plain functions are fine.** At Levels 1 and 2, `store.toggleDone()` and `onClick={...}` are direct function calls. Simple, debuggable, zero indirection. If you haven't hit one of the walls, stay here. Most dashboards, list views, and CRUD apps never need more. The walls are real requirements, not aspirations; if you haven't hit the wall, don't climb it.

**The costs of Level 3+:**

- **Verbosity.** With `createSlice`, adding an op is one function. Callers write `{ op: "moveCursor", delta: 1 }` instead of `moveCursor(1)`. Command registries and binding tables add surface area.
- **Indirection.** Stack traces go through `apply()` → handler and through command resolution → action dispatch. You lose some "click to navigate" convenience. Name things well and keep modules small.
- **Type ceremony.** If you pattern-match on the op union elsewhere (e.g. `inverse`), you maintain that switch yourself. `createSlice` eliminates the union definition, but not all downstream consumers.
- **Plugin ordering.** `withVimModes()` before `withCommands()` means vim intercepts first. The override chain is a stack of closures, so debugging goes through multiple layers.

**When to use functions inside data.** Even at Level 4-5, not everything needs to be data. Effect _runners_ are functions. Computed values are functions. React components are functions. The boundary: **crossing module boundaries** (between slices, between domain and I/O) should be data; **within a module** (the implementation of a single op handler), use whatever's clearest.

**How Silvery minimizes the costs:**

- **Wiring** — `createApp()` handles the store-to-effects-to-runners pipeline. Declare effect runners once.
- **Composition** — `createStore()` with plugin composition adds cross-cutting concerns without per-op boilerplate.
- **Debugging** — `withDiagnostics()` validates rendering, `SILVERY_INSTRUMENT=1` exposes per-frame counters.
- **Driver pattern** — `withCommands()` + `withKeybindings()` give you a `driver.cmd.all()` API — the dispatcher is no longer opaque.

**The honest rule of thumb**: if you can't name a specific benefit you'd get from making something data (undo? replay? testing without mocks? customizable bindings?), keep it as a function call. The progression is opt-in at every level — and opting out is a valid choice.

---

## Prior Art

The core ideas — making operations, effects, and events into data — have been discovered many times.

| System                                                        | What it covers                | Approach                                                                                         |
| ------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------ |
| **[Elm](https://guide.elm-lang.org/architecture/)**           | State + Effects + Composition | `update : Msg -> Model -> (Model, Cmd Msg)` — the gold standard. Enforces TEA at language level. |
| [Redux](https://redux.js.org/)                                | State (ops as data)           | `dispatch(action)` + reducer. Effects live in middleware (thunks/sagas), not return values.      |
| [redux-loop](https://github.com/redux-loop/redux-loop)        | State + Effects               | Extends Redux: reducer returns `[state, effects]` — completing the TEA shape.                    |
| **[SlateJS](https://docs.slatejs.org/)**                      | Event plugins                 | `withHistory(withReact(createEditor()))` — same `(editor) => editor` plugin shape.               |
| [ProseMirror](https://prosemirror.net/)                       | Event plugins                 | Structured plugin hooks — more constrained, easier to reason about.                              |
| [Express](https://expressjs.com/) / [Koa](https://koajs.com/) | Event middleware              | `app.use(middleware)` — onion model composition.                                                 |
| **Silvery**                                                   | All of the above              | `createSlice` + `tea()` for state; `pipe()` + plugins for events. Incremental adoption.          |

Redux got Level 3 right but stopped there. redux-loop completed the TEA shape. SlateJS pioneered the plugin-by-override model. This guide pieces these ideas into a single incremental progression for React.

---

## The Takeaway

You don't choose a framework. You choose how visible your app's behavior is.

At Level 1, keypresses enter callbacks and state changes happen inside components — both invisible. At Level 5, every event has a type, every action has a name, every state change is an op, every side effect is a return value, every plugin is a composable function. The entire pipeline is inspectable data: events → commands → ops → state → effects → screen.

The more visible your behavior is — the easier your app is to test, debug, automate, customize, and scale. But visibility has a cost: verbosity, indirection, and ceremony. The right level is the one where the benefits you actually use outweigh the boilerplate you actually write. Silvery doesn't force you into any of this. You grow into it one level at a time.

## See Also

- [Functional Core, Imperative Shell](https://kennethlange.com/functional-core-imperative-shell/) — the architectural principle behind Levels 3-5
- [The Elm Architecture](https://guide.elm-lang.org/architecture/) — the gold standard for ops + effects as data
