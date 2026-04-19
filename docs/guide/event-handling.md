# Event Handling

> This page documents Silvery's event handling APIs. For the guided progression from callbacks to composable plugins, see [Building an App](../guides/terminal-apps.md).

## InputRouter and Feature Registration

Under the hood, Silvery uses an **InputRouter** (`@silvery/create/internal/`) to dispatch keyboard and mouse events to registered feature handlers. Features like `SelectionFeature`, `FindFeature`, `CopyModeFeature`, and `DragFeature` register themselves with the router via the **CapabilityRegistry**. This happens automatically when you use the corresponding providers — you don't need to configure the router directly.

The `CapabilityRegistry` also powers React hooks like `useSelection()`, which read feature state without needing provider wrappers.

## `withDomEvents()` — Component Event Handlers

Adds React-style event handlers to Silvery components. Events bubble up the tree, components can stop propagation, and hit testing maps mouse coordinates to nodes. Also activates `SelectionFeature` (text selection) and `DragFeature` (drag-and-drop).

```tsx
import { pipe, withDomEvents, withReact } from "@silvery/create/plugins"

const app = pipe(createApp(store), withReact(<Board />), withDomEvents())
```

### How it works

`withDomEvents()` overrides `app.update` to intercept events before the base handler:

- **Keyboard events**: dispatched through the focus tree (capture phase → target → bubble phase). Components with `onKeyDown` or `onKeyDownCapture` receive a `KeyEvent` with `stopPropagation()` and `preventDefault()`.
- **Mouse events**: hit-tested against the render tree using `scrollRect`. The deepest node at `(x, y)` receives the event, which bubbles up through ancestors.

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

| Prop               | Event Type          | Bubbles             |
| ------------------ | ------------------- | ------------------- |
| `onClick`          | `SilveryMouseEvent` | Yes                 |
| `onDoubleClick`    | `SilveryMouseEvent` | Yes                 |
| `onMouseDown`      | `SilveryMouseEvent` | Yes                 |
| `onMouseUp`        | `SilveryMouseEvent` | Yes                 |
| `onMouseMove`      | `SilveryMouseEvent` | Yes                 |
| `onMouseEnter`     | `SilveryMouseEvent` | No                  |
| `onMouseLeave`     | `SilveryMouseEvent` | No                  |
| `onWheel`          | `SilveryWheelEvent` | Yes                 |
| `onKeyDown`        | `SilveryKeyEvent`   | Yes                 |
| `onKeyDownCapture` | `SilveryKeyEvent`   | Yes (capture phase) |

## `withCommands()` — Named Serializable Actions

Turns input into named, serializable commands. Keys and clicks resolve to commands; commands produce actions.

```tsx
import {
  pipe,
  withDomEvents,
  withCommands,
  withReact,
  createCommandRegistry,
} from "@silvery/create/plugins"

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

## App Plugin Anatomy

Every extension — `withDomEvents`, `withCommands`, `withKeybindings`, `withDiagnostics` — is an app plugin: a function that takes an app and returns an enhanced app.

```tsx
import type { AppPlugin } from "@silvery/create/plugins"

type AppPlugin<A, B> = (app: A) => B
```

A plugin is a function that takes an app and returns an enhanced version. It can wrap existing methods (like `press()` or `run()`), add new properties, or store configuration for the runtime:

```tsx
import { withTerminal } from "@silvery/create/plugins"

// withTerminal captures process streams and terminal options,
// then wraps run() to inject them:
const app = pipe(
  createApp(store),
  withReact(<Board />),
  withTerminal(process, { mouse: true, kitty: true }),
)
// app.terminalOptions is now available
// app.run() will configure stdin/stdout automatically
```

Plugins compose cleanly because each one wraps or extends the app object without mutating the original. The `pipe()` chain flows left-to-right, with each plugin seeing the result of the previous one.

### Subscriptions and cleanup

Plugins react to model changes via `app.subscribe`. Cleanup is automatic via `using`:

```tsx
using app = pipe(createApp(store), withTerminal(process), withFocus())
await app.run()
// all subscriptions cleaned up via [Symbol.dispose]
```

The rule: **subscribers never mutate the model.** They either do I/O or dispatch.

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

## EventMap Type Safety

All event types flow through a single `EventMap`:

```tsx
interface EventMap {
  "term:key": { input: string; key: Key }
  "term:mouse": ParsedMouse
  "term:paste": { text: string }
  "term:resize": { cols: number; rows: number }
}

type AppEvent<K extends keyof EventMap = keyof EventMap> = K extends K
  ? { type: K; data: EventMap[K] }
  : never
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

## Focus Management

Silvery provides two complementary hooks for focus management, plus a parent-level awareness hook:

### `useFocus(options?)` -- Ink-compatible

Matches Ink 7.0's signature. Best for components that need simple focus tracking.

```tsx
import { useFocus } from "silvery"

function MyInput() {
  const { isFocused, focus } = useFocus({ id: "my-input", autoFocus: true })
  return <Box borderColor={isFocused ? "cyan" : "gray"}>...</Box>
}
```

| Option      | Type      | Default        | Description                                                |
| ----------- | --------- | -------------- | ---------------------------------------------------------- |
| `id`        | `string`  | auto-generated | Stable focus ID                                            |
| `autoFocus` | `boolean` | `false`        | Focus on mount                                             |
| `isActive`  | `boolean` | `true`         | When false, skipped in tab order and never reports focused |

Returns `{ isFocused: boolean, focus: (id: string) => void }`.

### `useFocusable()` -- Silvery-native

Reads `testID` and `autoFocus` from the parent `<Box>` props. Richer return type with focus origin tracking.

```tsx
import { useFocusable } from "silvery"

function Panel() {
  const { focused, focusOrigin, focus, blur } = useFocusable()
  // focusOrigin: "keyboard" | "mouse" | "programmatic" | null
  return (
    <Box testID="panel" focusable>
      <Text>{focused ? `Focused via ${focusOrigin}` : "Unfocused"}</Text>
    </Box>
  )
}
```

### `useFocusWithin()` -- Parent awareness

Returns `true` when any descendant of the current component is focused. No Ink equivalent.

```tsx
function Sidebar() {
  const hasFocus = useFocusWithin()
  return <Box borderColor={hasFocus ? "blue" : "gray"}>...</Box>
}
```

### `useFocusManager()` -- Global control

```tsx
const {
  activeId, // currently focused component's ID
  activeScopeId, // active peer focus scope
  focus, // focus by node or id
  focusNext, // Tab
  focusPrev, // Shift+Tab
  blur, // clear focus
  activateScope, // switch peer scope (WPF model)
} = useFocusManager()
```

### When to use which

| Need                                  | Use                                                       |
| ------------------------------------- | --------------------------------------------------------- |
| Simple focus tracking (Ink migration) | `useFocus({ id })`                                        |
| Focus origin ("keyboard" vs "mouse")  | `useFocusable()`                                          |
| Parent knows if descendants focused   | `useFocusWithin()`                                        |
| Control focus from anywhere           | `useFocusManager()`                                       |
| Focus scopes (dialogs, modals)        | `<Box focusScope>` + `activateScope()`                    |
| Spatial navigation (grid layouts)     | `focusManager.focusDirection("up"/"down"/"left"/"right")` |

## See Also

- [Building an App](../guides/terminal-apps.md) — guided progression from callbacks to composable plugins
- [Input Architecture](input-architecture.md) -- internal pipeline from stdin to hooks
- [State Management](../guides/state-management.md) — createApp, createSlice, tea() middleware, createStore
- [Runtime Layers](runtime-layers.md) — createApp, createRuntime, createStore API reference
- [Input Features](../reference/input-features.md) — keyboard, mouse, hotkeys, modifier symbols
- [Plugins Reference](../reference/plugins.md) — withCommands, withKeybindings, withDiagnostics API
