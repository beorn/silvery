# What the Architecture Enables

Because all state lives in the model, all changes flow through `update`, and all effects are data, a set of powerful capabilities fall out naturally.

This document extracts the advanced architectural capabilities from the [Event Handling](../guides/event-handling.md) guide. For the core plugin model and graduated levels, see that guide.

## Effect Combinators

Effects are data — plain objects returned from `update`. The kernel runs them. Hightea provides combinators for common async patterns:

```tsx
import { none, batch, dispatch, debounce, throttle } from "@hightea/term/core"

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

| Combinator                 | What it does                                    |
| -------------------------- | ----------------------------------------------- |
| `none`                     | No-op (placeholder)                             |
| `batch(e1, e2, ...)`       | Multiple effects, flattened                     |
| `dispatch(msg)`            | Queue another message                           |
| `debounce(id, ms, effect)` | Cancel previous with same id, wait ms, then run |
| `throttle(id, ms, effect)` | Run at most once per ms window                  |
| `delay(ms, effect)`        | Run effect after ms                             |

Because effects are data, the kernel can inspect, log, and replay them. `debounce("search", ...)` with an id means the kernel tracks active timers — cancel-and-restart is automatic.

## Structured Logging

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
          changed: diff(model, newModel), // only the fields that changed
          effects: effects.map((e) => e.type ?? e.effect),
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

## Undo

Since slices are pure `(msg, state) → state`, undo is a generic plugin that records transitions and reverses them:

```tsx
function withUndo<M extends { undo: UndoState }>(opts?: { maxHistory?: number }): AppPlugin {
  return {
    slice: (msg: AppEvent, undo: UndoState): UndoState => {
      if (msg.type === "undo:push")
        return {
          past: [...undo.past.slice(-(opts?.maxHistory ?? 100) + 1), msg.data.snapshot],
          future: [],
        }
      if (msg.type === "undo:undo" && undo.past.length > 0)
        return {
          past: undo.past.slice(0, -1),
          future: [...undo.future, msg.data.current],
        }
      if (msg.type === "undo:redo" && undo.future.length > 0)
        return {
          past: [...undo.past, msg.data.current],
          future: undo.future.slice(0, -1),
        }
      return undo
    },

    plugin: (app) => {
      // After each user action, snapshot the model for undo
      app.subscribe(
        (s) => s,
        (model, prevModel) => {
          if (isUserAction(model.lastMsg)) {
            app.dispatch.undo.push({ snapshot: prevModel })
          }
        },
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

## Time-Travel Debugging

Undo is just the user-facing version. The same infrastructure enables full time-travel: record every `(msg, model)` pair, step forward and backward, fork from any point. Because there's no hidden state, replaying messages into a fresh `createApp` reproduces the exact same state.

```tsx
// Record
const history: Array<{ msg: AppEvent; model: Model }> = []
app.subscribe(
  (s) => s,
  (model) => {
    history.push({ msg: model.lastMsg, model: structuredClone(model) })
  },
)

// Replay to any point
function replayTo(index: number) {
  app.store.setState(history[index].model)
}
```

This is the payoff of the full architecture: every moment is a snapshot, every transition is data, every session is replayable.

## See Also

- [Event Handling](../guides/event-handling.md) — the core plugin model and graduated levels
- [State Management](../guides/state-management.md) — ops as data, effects as data
- [Runtime Layers](../guides/runtime-layers.md) — createStore, plugin composition API
