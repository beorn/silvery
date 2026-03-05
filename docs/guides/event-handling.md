# Event Handling

> Start simple, sip some TEA, or go full TEA. Begin with `useInput` and a callback. Graduate to composable plugins when you need them. Every step is additive — you never rewrite, you grow.

Most TUI frameworks force a choice: simple callbacks that don't scale, or a full architecture you adopt all at once. inkx gives you a graduated path where each level builds on the last. Your first app is five lines. Your complex app — with vim modes, AI automation, customizable keybindings, and file watchers — uses the same primitives, just composed differently.

The payoff at the end of the path: **all state in one model**, all changes through one `update` function, all I/O through composable plugins. The entire app becomes inspectable, serializable, replayable, and testable — from headless unit tests to AI-driven automation. You get there incrementally, one sip at a time.

| Level | You need it when... | What inkx provides |
|-------|--------------------|--------------------|
| **1 — Callbacks** | Starting out | `useInput` — just a function |
| **2 — Component Handlers** | Clicks, per-component keys | `withDomEvents()` — React-style `onClick`/`onKeyDown` with bubbling |
| **3 — Commands** | Undo, replay, AI automation | `withCommands()` — key/mouse → named serializable actions |
| **4 — App Plugins** | Vim modes, chords, custom sources | Slice + plugin — state in the model, reactions via subscribe |

Most simple apps stop at Level 1. Apps with mouse interaction reach Level 2. Complex TUIs with customizable keybindings and AI automation land at Level 3. Level 4 is for custom event processing, sources, and protocols — but by then you're writing pure functions that compose, not framework boilerplate.

This guide is the companion to [State Management](state-management.md). State management answers "how do I organize my data?"; event handling answers "how do I respond to the world?". They meet at commands — where input becomes data, and the app becomes a pure pipeline from events to state to screen.

### The kernel and defaults

Under the hood, `run()` is sugar over `pipe()` with sensible defaults. The kernel — `createApp(store)` — is just a typed event loop: `update`, `dispatch`, `run`. Everything else is plugins.

```tsx
// Simple: batteries included
await run(store, <App />)

// Equivalent to:
const app = pipe(
  createApp(store),               // kernel: event loop + state
  withReact(<App />),             // rendering: React reconciler + virtual buffer
  withTerminal(process),          // ALL terminal I/O: stdin→events, stdout→output, lifecycle, protocols
  withFocus(),                    // processing: Tab/Shift+Tab, focus scopes
  withDomEvents(),                // processing: dispatch to component tree
)
await app.run()

// Power user: pick exactly what you need
const app = pipe(
  createApp(store),
  withReact(<Board />),
  withTerminal(process),
  withDomEvents(),
  withCommands(registry),
  withKeybindings(bindings),
  withDiagnostics(),
)
```

This means you can also run **without** certain plugins:

```tsx
// Headless testing — no terminal, no rendering, just state + commands
const app = pipe(createApp(store), withCommands(registry))
app.dispatch({ type: "term:key", data: { input: "j", key: parseKey("j") } })

// Static rendering — render once, output, exit
const app = pipe(createApp(store), withStaticRender(<Report />))

// Replay — feed recorded events instead of stdin
const app = pipe(createApp(store), withReact(<Board />), withReplaySource(recording))
```

---

## Level 1: Callbacks

You're building a counter. One component, one handler. `useInput` gives you every keypress as a string — do what you want with it.

```tsx
import { run, useInput } from "inkx/runtime"
import { Text } from "inkx"

function Counter() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "k") setCount((c) => c - 1)
    if (input === "q") return "exit"
  })

  return <Text>Count: {count}</Text>
}

await run(<Counter />)
```

`useInput` registers a callback that receives raw key data. `run()` manages terminal I/O — raw mode, alternate screen, cleanup. Return `"exit"` to quit.

This is enough for dashboards, simple lists, and anything where one handler can see all input.

**The wall**: You add a sidebar and a main panel. Both need to handle clicks. You want `<Text onClick={...}>` like React DOM — but there's no DOM in a terminal, and `useInput` doesn't know about spatial coordinates.

---

## Level 2: Component Handlers

The counter grows into an interactive board. You need click targets, hover effects, and keyboard handlers on specific components — not a single global callback for everything.

The `withDomEvents()` plugin adds React-style event handlers to inkx components. Events bubble up the tree, components can stop propagation, and hit testing maps mouse coordinates to nodes:

```tsx
import { createApp, useApp } from "inkx/runtime"
import { Box, Text } from "inkx"

function ItemList() {
  const items = useApp((s) => s.items)
  const cursor = useApp((s) => s.cursor)

  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Box
          key={item.id}
          onClick={() => store.setCursor(i)}
          onDoubleClick={() => store.startEdit(i)}
        >
          <Text color={i === cursor ? "cyan" : undefined}>
            {i === cursor ? "> " : "  "}{item.text}
          </Text>
        </Box>
      ))}
    </Box>
  )
}
```

Enable it with a plugin — one line:

```tsx
import { pipe, withDomEvents } from "inkx/runtime"

const app = pipe(
  createApp(store),
  withReact(<Board />),
  withDomEvents(),
)
```

### How it works

`withDomEvents()` overrides `app.update` to intercept events before the base handler:

- **Keyboard events**: dispatched through the focus tree (capture phase → target → bubble phase). Components with `onKeyDown` or `onKeyDownCapture` receive a `KeyEvent` with `stopPropagation()` and `preventDefault()`.
- **Mouse events**: hit-tested against the render tree using `screenRect`. The deepest node at `(x, y)` receives the event, which bubbles up through ancestors. `onClick`, `onDoubleClick`, `onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseEnter`, `onMouseLeave`, `onWheel` — same as React DOM.

If a component calls `event.stopPropagation()`, the event is consumed — the base handler never sees it. Unhandled events pass through to whatever is next in the pipeline.

```tsx
<Box onKeyDown={(e) => {
  if (e.key.escape) {
    closeDialog()
    e.stopPropagation()  // don't let Escape reach the parent
  }
}}>
  <TextInput value={query} onChange={setQuery} />
</Box>
```

### Available event handler props

| Prop | Event Type | Bubbles |
|------|-----------|---------|
| `onClick` | `InkxMouseEvent` | Yes |
| `onDoubleClick` | `InkxMouseEvent` | Yes |
| `onMouseDown` | `InkxMouseEvent` | Yes |
| `onMouseUp` | `InkxMouseEvent` | Yes |
| `onMouseMove` | `InkxMouseEvent` | Yes |
| `onMouseEnter` | `InkxMouseEvent` | No |
| `onMouseLeave` | `InkxMouseEvent` | No |
| `onWheel` | `InkxWheelEvent` | Yes |
| `onKeyDown` | `InkxKeyEvent` | Yes |
| `onKeyDownCapture` | `InkxKeyEvent` | Yes (capture phase) |

Component handlers are familiar to React developers, spatial (you click on things), and compositional (events bubble through the tree). This is enough for most interactive UIs.

**The wall**: You want customizable keybindings. But `onClick={() => selectCard()}` is a function call — there's no data to serialize, no name to show in a command palette, no binding to remap. The user can't change "j means down" without editing code.

---

## Level 3: Commands

In Level 2, event handlers are function calls that execute and vanish. There's no record — no action vocabulary, no keybinding table, no data for AI to work with.

**The fix**: turn input into named, serializable commands. Instead of `if (input === "j") moveCursor(1)`, declare that `j` maps to the command `cursor_down`, and `cursor_down` produces the action `{ op: "moveCursor", delta: 1 }`. The mapping is data; the action is data; everything between keypress and state change is visible and customizable.

```tsx
import { pipe, withDomEvents, withCommands } from "inkx/runtime"

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

### What commands buy you

Once input is data, a whole class of problems becomes trivial:

- **Customizable keybindings** — the binding table is data, users can remap
- **Command palette** — `app.cmd.all()` lists every command with name, description, and current keys
- **AI automation** — `await app.cmd.cursor_down()` drives the app programmatically
- **Replay** — record the command stream, play it back
- **Testing** — `await app.cmd.toggle_done()` is more readable than `await app.press("x")`
- **Mouse commands** — clicks resolve to the same named actions as keys, unified in one vocabulary

### Mouse commands

Mouse events resolve to commands through the same registry. Click on a node → hit test finds the target → mouse binding resolves to `"select_node"` → command executes → action dispatched. Same path as keyboard, same serialization, same replay.

```tsx
mouse: {
  click: (node, mods) => {
    if (mods.ctrl) return "toggle_select"
    return "select_node"
  },
  doubleClick: () => "enter_edit",
  wheel: (delta) => delta < 0 ? "scroll_up" : "scroll_down",
}
```

### Hybrid: components + commands

Component handlers and commands aren't mutually exclusive. `withDomEvents()` fires first; if a component handles an event (stopPropagation), commands never see it. Unhandled events fall through to command resolution.

This is the natural pattern for complex apps: `TextInput` handles its own keys via `onKeyDown`, while navigation and actions go through commands.

```tsx
const app = pipe(
  createApp(store),
  withReact(<Board />),
  withDomEvents(),      // component handlers fire first
  withCommands(opts),   // unhandled events resolve to commands
)
```

### The driver pattern (testing + AI)

The `withKeybindings` and `withDiagnostics` plugins extend the app's external API for testing and automation:

```tsx
const driver = pipe(
  app,
  withKeybindings(bindings),  // press("j") → resolves keybinding → command
  withDiagnostics(),          // adds render invariant checks after each command
)

// AI or test can:
driver.cmd.all()              // list available commands
await driver.cmd.cursor_down() // execute by name
driver.getState()             // inspect state
await driver.screenshot()     // capture screen
```

This is the same app — just with more capabilities layered on. [State Management Level 3](state-management.md#level-3-ops-as-data--reduxs-insight) (ops as data) meets event handling Level 3 (commands). Together they make the entire app automatable: commands describe input, ops describe state changes, both are serializable data.

**The wall**: You want vim-style modal input (normal/insert/visual) or multi-key chords (gg, leader sequences). The built-in command resolution is single-key. You need to intercept events before they reach commands, with your own stateful logic.

---

## Level 4: App Plugins

Every extension in this guide — `withDomEvents`, `withCommands`, `withKeybindings`, `withDiagnostics` — is the same thing: an app plugin. A function that takes an app and returns an enhanced app.

```tsx
type AppPlugin<M, Msg> = (app: App<M, Msg>) => App<M, Msg>
```

This is the [SlateJS](https://docs.slatejs.org/concepts/08-plugins) editor model: `withHistory(withReact(createEditor()))`. Each plugin overrides methods on the app — `update` for event processing, `events` for event sources, `press`/`click` for the external API, or adds entirely new capabilities (`.cmd`, `.getState()`).

You compose them with `pipe()`:

```tsx
const app = pipe(
  createApp(store),                 // kernel: event loop + state
  withReact(<Board />),             // rendering: React + virtual buffer
  withTerminal(process),              // terminal: stdin→events, stdout→output, lifecycle, protocols
  withFocus(),                      // processing: Tab navigation, focus scopes
  withDomEvents(),                  // processing: dispatch to component tree
  withCommands(opts),               // processing: resolve to named commands
  withKeybindings(bindings),        // API: press() → keybinding resolution
  withDiagnostics(),                // API: render invariant checks
)
```

### Plugin anatomy

A plugin has two parts: a **slice** (pure reducer for its state) and a **plugin function** (event wiring, subscriptions, API surface):

```tsx
function withTerminal(proc: NodeJS.Process) {
  return {
    // Slice: pure (msg, sliceState) → sliceState — handles state transitions
    slice: (msg: AppEvent, term: TermState): TermState => {
      if (msg.type === "term:resize")
        return { ...term, cols: msg.data.cols, rows: msg.data.rows }
      return term
    },

    // Plugin: event sources, subscriptions, API — no direct model mutation
    plugin: (app) => {
      const { events } = app
      app.events = () => [...events(), terminalInput(proc.stdin), resizeStream(proc.stdout)]

      // I/O reaction: write to stdout when buffer changes
      app.subscribe(s => s.renderBuffer, (buf) => diffAndWrite(proc.stdout, buf))

      return app
    },
  }
}
```

The kernel composes all slices — every slice sees every message, no plugin can clobber another's state. Plugins wire events and react to model changes, but **never mutate the model directly**. All state changes flow through `update`.

### Subscriptions and cleanup

Plugins react to model changes via `app.subscribe`. The app collects subscriptions in a `DisposableStack` — cleanup is automatic:

```tsx
plugin: (app) => {
  // I/O: no state change
  app.subscribe(s => s.focus.activeId, (id) => scrollIntoView(id))

  // Dispatch: goes through update, which may change state
  app.subscribe(s => s.term.rows, () => app.dispatch.focus.revalidate())

  return app
}
```

```tsx
using app = pipe(createApp(store), withTerminal(process), withFocus())
await app.run()
// all subscriptions cleaned up via [Symbol.dispose]
```

The rule: **subscribers never mutate the model.** They either do I/O or dispatch — which goes through `update`.

### Typed dispatch

`app.dispatch` is both callable and a typed proxy. The `EventMap` drives autocomplete:

```tsx
// Proxy — namespace:action from the property chain
app.dispatch.focus.revalidate()
app.dispatch.focus.changed({ from: "a", to: "b" })
app.dispatch.term.resize({ cols: 80, rows: 24 })

// Raw — when you already have a message object
app.dispatch({ type: "focus:revalidate" })
```

### Writing your own plugin

Here's a vim mode plugin. Note: mode lives **in the model**, not in a closure — so it's inspectable, serializable, and survives replay:

```tsx
function withVimModes() {
  return {
    slice: (msg: AppEvent, vim: VimState): VimState => {
      if (msg.type !== "term:key") return vim
      if (vim.mode === "normal" && msg.data.input === "i")
        return { ...vim, mode: "insert" }
      if (vim.mode === "insert" && msg.data.key.escape)
        return { ...vim, mode: "normal" }
      return vim
    },

    plugin: (app) => {
      const { update } = app
      app.update = (msg, model) => {
        // In insert mode, keys pass through to text input
        // In normal mode, keys pass through to command resolution
        // Mode switching is handled by the slice — no interception needed
        if (msg.type === "term:key" && model.vim.mode === "insert") {
          // Skip command resolution, let it reach text input
          return update(msg, model)
        }
        return update(msg, model)
      }
      return app
    },
  }
}
```

Stack it:

```tsx
using app = pipe(
  createApp(store, {
    slices: { term: withTerminal(process).slice, vim: withVimModes().slice },
  }),
  withTerminal(process).plugin,
  withReact(<Board />),
  withDomEvents(),
  withVimModes().plugin,
  withCommands(opts),
)
```

### Custom event sources

Plugins can add event sources by overriding `app.events`:

```tsx
function withFileWatcher(path: string) {
  return {
    slice: (msg: AppEvent, fs: FsState): FsState => {
      if (msg.type === "fs:change") return { ...fs, lastChange: msg.data }
      return fs
    },

    plugin: (app) => {
      const { events } = app
      app.events = () => [...events(), fileWatch(path)]
      return app
    },
  }
}
```

### Three mechanisms for event sources

Not all sources need to be app plugins. inkx provides three mechanisms, each for a different lifecycle:

| Mechanism | Lifecycle | Use when... |
|-----------|----------|-------------|
| **App plugins** | Static — created once at app setup | Always-on sources: stdin, resize, timers |
| **React components** | Reactive — mount/unmount with state | Conditional sources: file watchers, network polls |
| **Effects** | One-shot — triggered by update | Request/response: fetch, save, notifications |

React components are the most natural way to add reactive sources — they mount when state says so and clean up automatically:

```tsx
function FileWatcher({ path }: { path: string }) {
  const dispatch = useDispatch()

  useEffect(() => {
    const watcher = watch(path, (ev) =>
      dispatch({ type: "fs:change", data: ev })
    )
    return () => watcher.close()
  }, [path])

  return null  // renderless
}

// In your view — declarative, reactive
function App() {
  const vaultPath = useApp((s) => s.vaultPath)
  return <>
    <Board />
    {vaultPath && <FileWatcher path={vaultPath} />}
  </>
}
```

Vault opens → component mounts → watcher starts. Vault closes → unmounts → stops. Path changes → effect re-runs. React's reconciler IS the subscription manager.

### Type-safe events

All event types flow through a single `EventMap` — the contract between sources and update:

```tsx
interface EventMap {
  "term:key":    { input: string; key: Key }
  "term:mouse":  ParsedMouse
  "term:paste":  { text: string }
  "term:resize": { cols: number; rows: number }
}

// Derived discriminated union — narrows in switch
type AppEvent<K extends keyof EventMap = keyof EventMap> =
  K extends K ? { type: K; data: EventMap[K] } : never
```

Sources are typed against the map — they can only produce events they declare:

```tsx
function terminalInput(stdin): EventStream<AppEvent<"term:key" | "term:mouse" | "term:paste">>
```

Extend the map for custom events:

```tsx
interface MyEventMap extends EventMap {
  "fs:change": { path: string; kind: string }
  "timer:tick": { now: number }
}
```

TypeScript narrows automatically in update:

```tsx
function update(msg: AppEvent<keyof MyEventMap>, model: Model) {
  switch (msg.type) {
    case "term:key":   msg.data.input    // string
    case "fs:change":  msg.data.path     // string
    case "timer:tick": msg.data.now      // number
  }
}
```

### How `run()` wires it all

`app.run()` is called once. It:

1. Calls `app.events()` to get all static event streams
2. Merges them into a single `AsyncIterable`
3. Batches events by microtask (multiple events before next tick = one batch)
4. For each batch: calls `app.update(msg, model)` → new model + effects
5. React re-renders reactively when the model/store changes
6. Effect runners execute returned effects

The event loop is simple because the complexity lives in the plugins, not the runtime.

---

## The Plugin Model

Step back and look at what you have. Every extension — from terminal I/O to vim modes to file watchers — has the same shape: a **slice** (pure reducer for its model state) and a **plugin** (event wiring, subscriptions, API). All state lives in the model. All state changes flow through `update`. Plugins react to model changes via subscriptions, and clean up automatically via `using`.

```
using app = pipe(
  createApp(store, { slices })     kernel: event loop + composed reducers
  ├─ withReact(<View />)           rendering: React + virtual buffer
  ├─ withTerminal(process)         terminal: stdin→events, stdout→output, lifecycle, protocols
  ├─ withFocus()                   processing: Tab navigation, focus scopes
  ├─ withDomEvents()               processing: dispatch to components
  ├─ withVimModes()                processing: modal key routing
  ├─ withCommands(opts)            processing: key/mouse → named commands
  ├─ withKeybindings(bindings)     API: press() → keybinding resolution
  └─ withDiagnostics()             API: render invariant checks
)
```

Three roles, one type:

| Role | What it does | How |
|------|-------------|-----|
| **Source** | Produces events | Overrides `app.events` |
| **Processor** | Transforms/consumes events | Wraps `app.update` |
| **Reactor** | Responds to model changes | `app.subscribe` (I/O or dispatch) |
| **Driver** | Enhances external API | `app.press`, `app.cmd`, etc. |

A single plugin can fill multiple roles — `withCommands` wraps `update` (processing) AND adds `.cmd` (API). `withTerminal` adds sources AND subscribes to render buffer (reactor). There's no taxonomy to learn; it's just functions enriching an object.

### Sipping TEA

The architecture supports incremental adoption of [The Elm Architecture](https://guide.elm-lang.org/architecture/) — you don't have to drink the whole pot at once.

1. **`useState`** — state in components. Quick to start, hard to test, impossible to replay.
2. **Shared store** — state in Zustand. Components share state, but handlers are still imperative `set()` calls.
3. **Commands** — input as data. Keys and clicks become named, serializable actions. But state changes are still imperative.
4. **Slices** — state changes as data. Pure `(msg, state) → state` reducers. All state in the model, all transitions traceable.
5. **Effects as data** — side effects as data. `update` returns `[model, effects]`. The entire app is a pure function.

At each step you have a working app. You can have some commands going through pure slices and others still calling `store.setState()`. The kernel doesn't care — it processes events the same way regardless. Migrate one slice at a time, validate it works, move to the next.

The payoff at step 5: **snapshot** any moment, **replay** any session, **time-travel** through history, **test** with zero I/O. Because all state is in the model and all changes flow through `update`, there's nothing hidden, nothing to reconstruct.

### Relationship to state management

This guide is the input side of the same architecture described in [State Management](state-management.md):

| State Management | Event Handling |
|-----------------|---------------|
| Level 2: Shared store | Level 1: useInput callbacks |
| Level 3: Ops as data | Level 3: Commands (input as data) |
| Level 4: Effects as data | Level 4: Typed event sources |
| Level 5: Composition | Level 4: Plugin composition |

They meet at Level 3 — commands produce ops, ops describe state changes, both are serializable data. Together they make the entire app a pure pipeline from input to output: events → commands → ops → state → effects → I/O.

---

## Built-in Plugins

Every built-in behavior is a plugin. `run()` composes them for you; `pipe()` lets you pick.

### Kernel

| Plugin | Role | What it does |
|--------|------|-------------|
| `createApp(store)` | Kernel | Typed event loop: `update`, `dispatch`, `events`, `run`. No rendering, no terminal, no I/O. |

### Rendering

| Plugin | Role | What it does |
|--------|------|-------------|
| `withReact(<El />)` | Rendering | React reconciler + virtual buffer. Mounts the element, renders into a `TerminalBuffer`, re-renders reactively on store changes. |

### Terminal I/O

| Plugin | Role | What it does |
|--------|------|-------------|
| `withTerminal(process, opts?)` | Source + Output + Protocol | **All terminal I/O in one plugin.** stdin → typed events (`term:key`, `term:mouse`, `term:paste`). stdout → alternate screen, raw mode, incremental diff output. SIGWINCH → `term:resize`. Lifecycle (Ctrl+Z suspend/resume, Ctrl+C exit). Protocols (SGR mouse, Kitty keyboard, bracketed paste) controlled via options. |

Mouse, Kitty keyboard, and bracketed paste are **on by default** — no configuration needed. Options for disabling or customizing: `{ mouse?: boolean, kitty?: boolean | KittyFlags, paste?: boolean, onSuspend?, onResume?, onInterrupt? }`

Internally, `withTerminal` composes the lower-level concerns (input parsing, output rendering, resize handling, protocol negotiation, lifecycle management). You never need to think about them separately unless you're building something exotic like a multiplexer or test harness.

### Event Processing

| Plugin | Role | What it does |
|--------|------|-------------|
| `withFocus()` | Processing | Focus manager: Tab/Shift+Tab navigation, Enter to enter scope, Escape to exit. Dispatches `onKeyDown`/`onKeyDownCapture` through focus tree (capture → target → bubble). |
| `withDomEvents()` | Processing | DOM-like event dispatch for mouse: hit testing via `screenRect`, bubbling through ancestors. `onClick`, `onDoubleClick`, `onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseEnter`, `onMouseLeave`, `onWheel`. |
| `withCommands(opts)` | Processing + API | Resolves key and mouse events to named commands via a binding table. Adds `.cmd` proxy for programmatic invocation. Adds `.getState()` for introspection. |

### Testing / Automation

| Plugin | Role | What it does |
|--------|------|-------------|
| `withKeybindings(bindings)` | API | Intercepts `press()` to resolve keybindings → commands before passing through. `press("j")` becomes `cmd.cursor_down()`. |
| `withDiagnostics(opts?)` | API | Adds render invariant checks after each command: incremental vs fresh render, stability, replay, layout. Captures screenshots on failure. |

### How `run()` composes them

```tsx
// run(store, element, options) is equivalent to:
function run(store, element, options = {}) {
  return pipe(
    createApp(store),
    withReact(element),
    withTerminal(process, options),  // mouse, kitty, paste all on by default
    withFocus(),
    withDomEvents(),
  ).run()
}
```

Every option on `run()` maps to a plugin. When you need more control — custom processing, custom sources, testing drivers — drop down to `pipe()` and compose exactly what you need.

---

## What the Architecture Enables

Because all state lives in the model, all changes flow through `update`, and all effects are data, a set of powerful capabilities fall out naturally.

### Effect combinators

Effects are data — plain objects returned from `update`. The kernel runs them. inkx provides combinators for common async patterns:

```tsx
import { none, batch, dispatch, debounce, throttle } from "inkx/core"

function update(msg: AppEvent, model: Model): [Model, Effect[]] {
  switch (msg.type) {
    case "term:key":
      if (msg.data.input === "/") {
        return [{ ...model, searching: true }, []]
      }
      if (model.searching) {
        const query = model.query + msg.data.input
        return [
          { ...model, query },
          // Debounce: wait 150ms after last keystroke before searching
          [debounce("search", 150, dispatch({ type: "search:execute", data: { query } }))],
        ]
      }
      return [model, [none]]

    case "search:execute":
      return [model, [{ effect: "fetch", url: `/api/search?q=${msg.data.query}` }]]

    default:
      return [model, [none]]
  }
}
```

| Combinator | What it does |
|-----------|-------------|
| `none` | No-op (placeholder) |
| `batch(e1, e2, ...)` | Multiple effects, flattened |
| `dispatch(msg)` | Queue another message |
| `debounce(id, ms, effect)` | Cancel previous with same id, wait ms, then run |
| `throttle(id, ms, effect)` | Run at most once per ms window |
| `delay(ms, effect)` | Run effect after ms |

Because effects are data, the kernel can inspect, log, and replay them. `debounce("search", ...)` with an id means the kernel tracks active timers — cancel-and-restart is automatic.

### Structured logging

Since every state change flows through `update`, logging is a one-line plugin:

```tsx
function withLogging(): AppPlugin {
  return {
    plugin: (app) => {
      const { update } = app
      app.update = (msg, model) => {
        const [newModel, effects] = update(msg, model)
        console.log({
          msg: msg.type,
          data: msg.data,
          changed: diff(model, newModel),   // only the fields that changed
          effects: effects.map(e => e.type ?? e.effect),
        })
        return [newModel, effects]
      }
      return app
    },
  }
}
```

```tsx
// Output:
// { msg: "term:key", data: { input: "j" }, changed: { cursor: 3 }, effects: ["none"] }
// { msg: "focus:changed", data: { from: "item2", to: "item3" }, changed: { focus: {...} }, effects: [] }
```

Every event, every state change, every effect — in one stream. Filter by namespace, replay from a log file, or pipe to an AI for analysis. Because effects are data too, the log captures the full picture: what happened, what changed, and what side effects were requested.

For production, write to a file instead of console:

```tsx
using app = pipe(
  createApp(store, { slices }),
  withLogging({ output: "/tmp/app.log", filter: (msg) => msg.type !== "term:mouse" }),
  // ... other plugins
)
```

### Undo

Since slices are pure `(msg, state) → state`, undo is a generic plugin that records transitions and reverses them:

```tsx
function withUndo<M extends { undo: UndoState }>(opts?: { maxHistory?: number }): AppPlugin {
  return {
    slice: (msg: AppEvent, undo: UndoState): UndoState => {
      if (msg.type === "undo:push") return {
        past: [...undo.past.slice(-(opts?.maxHistory ?? 100) + 1), msg.data.snapshot],
        future: [],
      }
      if (msg.type === "undo:undo" && undo.past.length > 0) return {
        past: undo.past.slice(0, -1),
        future: [...undo.future, msg.data.current],
      }
      if (msg.type === "undo:redo" && undo.future.length > 0) return {
        past: [...undo.past, msg.data.current],
        future: undo.future.slice(0, -1),
      }
      return undo
    },

    plugin: (app) => {
      // After each user action, snapshot the model for undo
      app.subscribe(
        s => s,
        (model, prevModel) => {
          if (isUserAction(model.lastMsg)) {
            app.dispatch.undo.push({ snapshot: prevModel })
          }
        }
      )

      // Expose convenience API
      app.undo = () => app.dispatch.undo.undo({ current: app.store.getState() })
      app.redo = () => app.dispatch.undo.redo({ current: app.store.getState() })

      return app
    },
  }
}
```

Add it to the pipe:

```tsx
using app = pipe(
  createApp(store, { slices: { ...slices, undo: withUndo().slice } }),
  withUndo({ maxHistory: 50 }).plugin,
  // ...
)

// In keybindings:
bindings: { key: { "ctrl+z": "undo", "ctrl+shift+z": "redo" } }
```

Because the model is one serializable object, snapshotting is `structuredClone(model)`. Restoring is replacing the model. No custom logic per feature — undo works across all slices at once.

### Time-travel debugging

Undo is just the user-facing version. The same infrastructure enables full time-travel: record every `(msg, model)` pair, step forward and backward, fork from any point. Because there's no hidden state, replaying messages into a fresh `createApp` reproduces the exact same state.

```tsx
// Record
const history: Array<{ msg: AppEvent; model: Model }> = []
app.subscribe(s => s, (model) => {
  history.push({ msg: model.lastMsg, model: structuredClone(model) })
})

// Replay to any point
function replayTo(index: number) {
  app.store.setState(history[index].model)
}
```

This is the payoff of "sipping TEA" all the way: every moment is a snapshot, every transition is data, every session is replayable.

---

## Prior Art

The composable plugin model draws from several traditions:

| System | Pattern | Similarity |
|--------|---------|------------|
| **[SlateJS](https://docs.slatejs.org/)** | `withHistory(withReact(createEditor()))` | Same `(editor) => editor` plugin shape — override methods via closure |
| **[Lexical](https://lexical.dev/)** (Facebook) | Command registration + listeners | Plugins declare what they handle rather than wrapping everything |
| **[ProseMirror](https://prosemirror.net/)** | Structured plugin hooks | `handleKeyDown`, `decorations`, transaction filters — declarative, less free-form |
| **[Express](https://expressjs.com/)** / **[Koa](https://koajs.com/)** | `app.use(middleware)` | Onion model — last registered = outermost wrapper |
| **[Redux](https://redux.js.org/)** middleware | `(store) => (next) => (action) => result` | `(inner) => wrapped` composition |
| **[Elm](https://guide.elm-lang.org/)** subscriptions | `subscriptions : Model -> Sub Msg` | Declarative event sources (we use React components instead) |
| **DOM Events** | `addEventListener`, capture/bubble | `withDomEvents()` implements this for terminal UI |

The key insight from SlateJS: the editor (or app) is a plain object with overridable methods. Plugins don't use a special registration API — they just override methods and capture the originals via closure. This makes every plugin independently testable and composable without framework support.

The contrast from Lexical and ProseMirror: more structured plugin models are easier to reason about and debug, at the cost of flexibility. inkx takes the SlateJS path (maximum flexibility) but mitigates with clear conventions, good defaults via `run()`, and dev tooling (`withDiagnostics`).

---

## Trade-offs

**When callbacks are fine.** At Level 1, `useInput` is a function call — simple, debuggable, zero indirection. If you have one component handling all input, stay here. Most simple tools never need more.

**The costs of component handlers (Level 2).** Hit testing runs on every mouse event. Event dispatch walks the tree. For most apps this is negligible, but with thousands of nodes and high-frequency mouse events (drag), it shows up. Profile before optimizing.

**The costs of commands (Level 3).** Same trade-offs as [ops as data](state-management.md#trade-offs-when-data-goes-too-far): more indirection, a command registry to maintain, binding tables to keep in sync. The payoff — customizable bindings, AI automation, replay — is real but only matters if you use it.

**The costs of custom plugins (Level 4).** Plugin ordering matters — `withVimModes()` before `withCommands()` means vim intercepts first. The override chain is a stack of closures, so debugging goes through multiple layers. Name your plugins well and keep them focused.

**The honest rule of thumb**: if `useInput` handles your needs, stop at Level 1. If you need clicks, go to Level 2. If you need customizable bindings or automation, go to Level 3. Level 4 is for when the built-ins don't cover your use case. Each level adds power and complexity in equal measure.

---

## See Also

- [State Management](state-management.md) — the companion guide: how to organize data (ops, effects, composition)
- [Runtime Layers](runtime-layers.md) — createApp, createRuntime, createStore API reference
- [Input Features Reference](../reference/input-features.md) — keyboard, mouse, hotkeys, modifier symbols
- [Focus Routing](../deep-dives/focus-routing.md) — focus-based input routing pattern
- [Plugins Reference](../reference/plugins.md) — withCommands, withKeybindings, withDiagnostics API
