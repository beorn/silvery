# Event Handling

> This page documents hightea's event handling APIs. For the guided progression from callbacks to composable plugins, see [Building an App](building-an-app.md).

---

## `withDomEvents()` — Component Event Handlers

Adds React-style event handlers to hightea components. Events bubble up the tree, components can stop propagation, and hit testing maps mouse coordinates to nodes.

```tsx
import { pipe, withDomEvents } from "@hightea/term/runtime"

const app = pipe(createApp(store), withReact(<Board />), withDomEvents())
```

### How it works

`withDomEvents()` overrides `app.update` to intercept events before the base handler:

- **Keyboard events**: dispatched through the focus tree (capture phase → target → bubble phase). Components with `onKeyDown` or `onKeyDownCapture` receive a `KeyEvent` with `stopPropagation()` and `preventDefault()`.
- **Mouse events**: hit-tested against the render tree using `screenRect`. The deepest node at `(x, y)` receives the event, which bubbles up through ancestors.

```tsx
<Box
  onKeyDown={(e) => {
    if (e.key.escape) {
      closeDialog()
      e.stopPropagation() // don't let Escape reach the parent
    }
  }}
>
  <TextInput value={query} onChange={setQuery} />
</Box>
```

### Available event handler props

| Prop               | Event Type       | Bubbles             |
| ------------------ | ---------------- | ------------------- |
| `onClick`          | `HighteaMouseEvent` | Yes                 |
| `onDoubleClick`    | `HighteaMouseEvent` | Yes                 |
| `onMouseDown`      | `HighteaMouseEvent` | Yes                 |
| `onMouseUp`        | `HighteaMouseEvent` | Yes                 |
| `onMouseMove`      | `HighteaMouseEvent` | Yes                 |
| `onMouseEnter`     | `HighteaMouseEvent` | No                  |
| `onMouseLeave`     | `HighteaMouseEvent` | No                  |
| `onWheel`          | `HighteaWheelEvent` | Yes                 |
| `onKeyDown`        | `HighteaKeyEvent`   | Yes                 |
| `onKeyDownCapture` | `HighteaKeyEvent`   | Yes (capture phase) |

---

## `withCommands()` — Named Serializable Actions

Turns input into named, serializable commands. Keys and clicks resolve to commands; commands produce actions.

```tsx
import { pipe, withDomEvents, withCommands } from "@hightea/term/runtime"

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

### Mouse commands

Mouse events resolve to commands through the same registry. Click on a node → hit test finds the target → mouse binding resolves to command → command executes → action dispatched. Same path as keyboard, same serialization, same replay.

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

Component handlers and commands coexist. `withDomEvents()` fires first; if a component handles an event (stopPropagation), commands never see it. Unhandled events fall through to command resolution.

```tsx
const app = pipe(
  createApp(store),
  withReact(<Board />),
  withDomEvents(), // component handlers fire first
  withCommands(opts), // unhandled events resolve to commands
)
```

### The driver pattern (testing + AI)

```tsx
const driver = pipe(app, withKeybindings(bindings), withDiagnostics())

driver.cmd.all() // list available commands
await driver.cmd.cursor_down() // execute by name
driver.getState() // inspect state
await driver.screenshot() // capture screen
```

---

## App Plugin Anatomy

> **Status:** The individual plugins are implemented and in production use. The unified `pipe()` composition model is the architectural direction — some details may evolve.

Every extension — `withDomEvents`, `withCommands`, `withKeybindings`, `withDiagnostics` — is an app plugin: a function that takes an app and returns an enhanced app.

```tsx
type AppPlugin<M, Msg> = (app: App<M, Msg>) => App<M, Msg>
```

A plugin has two parts: a **slice** (pure reducer for its state) and a **plugin function** (event wiring, subscriptions, API surface):

```tsx
function withTerminal(proc: NodeJS.Process) {
  return {
    slice: (msg: AppEvent, term: TermState): TermState => {
      if (msg.type === "term:resize") return { ...term, cols: msg.data.cols, rows: msg.data.rows }
      return term
    },

    plugin: (app) => {
      const { events } = app
      app.events = () => [...events(), terminalInput(proc.stdin), resizeStream(proc.stdout)]

      app.subscribe(
        (s) => s.renderBuffer,
        (buf) => diffAndWrite(proc.stdout, buf),
      )

      return app
    },
  }
}
```

The kernel composes all slices — every slice sees every message, no plugin can clobber another's state. Plugins wire events and react to model changes, but **never mutate the model directly**. All state changes flow through `update`.

### Subscriptions and cleanup

Plugins react to model changes via `app.subscribe`. Cleanup is automatic via `using`:

```tsx
using app = pipe(createApp(store), withTerminal(process), withFocus())
await app.run()
// all subscriptions cleaned up via [Symbol.dispose]
```

The rule: **subscribers never mutate the model.** They either do I/O or dispatch.

---

## Event Sources

### Three mechanisms

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

### App plugin event sources

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

---

## EventMap Type Safety

All event types flow through a single `EventMap`:

```tsx
interface EventMap {
  "term:key": { input: string; key: Key }
  "term:mouse": ParsedMouse
  "term:paste": { text: string }
  "term:resize": { cols: number; rows: number }
}

type AppEvent<K extends keyof EventMap = keyof EventMap> = K extends K ? { type: K; data: EventMap[K] } : never
```

Sources are typed against the map:

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

### Typed dispatch

`app.dispatch` is both callable and a typed proxy:

```tsx
app.dispatch.focus.revalidate()
app.dispatch.focus.changed({ from: "a", to: "b" })
app.dispatch.term.resize({ cols: 80, rows: 24 })

// Raw — when you already have a message object
app.dispatch({ type: "focus:revalidate" })
```

---

## Plugin Catalog

### The kernel and defaults

`run()` is sugar over `pipe()` with sensible defaults:

```tsx
// Simple: batteries included
await run(store, <App />)

// Equivalent to:
const app = pipe(
  createApp(store), // kernel: event loop + state
  withReact(<App />), // rendering: React reconciler + virtual buffer
  withTerminal(process), // ALL terminal I/O: stdin→events, stdout→output, lifecycle
  withFocus(), // processing: Tab/Shift+Tab, focus scopes
  withDomEvents(), // processing: dispatch to component tree
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

### Plugin roles

| Role          | What it does               | How                               |
| ------------- | -------------------------- | --------------------------------- |
| **Source**    | Produces events            | Overrides `app.events`            |
| **Processor** | Transforms/consumes events | Wraps `app.update`                |
| **Reactor**   | Responds to model changes  | `app.subscribe` (I/O or dispatch) |
| **Driver**    | Enhances external API      | `app.press`, `app.cmd`, etc.      |

A single plugin can fill multiple roles — `withCommands` wraps `update` AND adds `.cmd`. `withTerminal` adds sources AND subscribes to render buffer.

### Built-in plugins

| Plugin                      | Role               | What it does                                      |
| --------------------------- | ------------------ | ------------------------------------------------- |
| `withReact(<View />)`       | Rendering          | React reconciler + virtual buffer                 |
| `withTerminal(process)`     | Source + Reactor   | stdin→events, stdout→output, lifecycle, protocols |
| `withFocus()`               | Processor          | Tab/Shift+Tab navigation, focus scopes            |
| `withDomEvents()`           | Processor          | React-style event dispatch to component tree      |
| `withCommands(opts)`        | Processor + Driver | Key/mouse → named commands, `.cmd` API            |
| `withKeybindings(bindings)` | Driver             | `press()` → keybinding resolution                 |
| `withDiagnostics()`         | Driver             | Render invariant checks                           |

For the full API, see [Plugins Reference](../reference/plugins.md).

---

## See Also

- [Building an App](building-an-app.md) — guided progression from callbacks to composable plugins
- [State Management](state-management.md) — createApp, createSlice, tea() middleware, createStore
- [Runtime Layers](runtime-layers.md) — createApp, createRuntime, createStore API reference
- [Input Features](../reference/input-features.md) — keyboard, mouse, hotkeys, modifier symbols
- [Focus Routing](../deep-dives/focus-routing.md) — focus-based input routing pattern
- [Plugins Reference](../reference/plugins.md) — withCommands, withKeybindings, withDiagnostics API
