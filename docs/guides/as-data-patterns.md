# Operations and Effects as Data

> You can only manipulate what you can see.

This guide describes a general architecture pattern for interactive applications — not specific to inkx or any framework. The idea: progressively turn your app's behavior into plain data objects so the system can inspect, record, and replay what happens.

| What becomes data | What the system can now do |
|-------------------|---------------------------|
| **State** | Share, observe, derive, persist |
| **Operations** | Undo/redo, replay, log, AI automation, collaboration |
| **Effects** | Test I/O without mocking, swap runners, serialize side effects |

Most apps only need shared state. Reach for ops-as-data when you need undo or replay. Reach for effects-as-data when you need testable I/O.

## Operations as Data

Start with plain domain functions — state in, mutation out:

```typescript
const Tasks = {
  moveCursor(s: State, delta: number) {
    s.cursor = clamp(s.cursor + delta, 0, s.items.length - 1)
  },
  toggleDone(s: State, index: number) {
    s.items[index].done = !s.items[index].done
  },
}

Tasks.moveCursor(state, 1)
Tasks.toggleDone(state, 3)
```

This works — but the system can't see what happened. It only sees that state changed. You can't undo, replay, or log what the user did.

**The fix**: switch from positional args to a params object, add a discriminator field. The operation *is* the params with an `op` tag:

```typescript
type TaskOp =
  | { op: "moveCursor"; delta: number }
  | { op: "toggleDone"; index: number }

const Tasks = {
  moveCursor(s: State, { delta }: { delta: number }) {
    s.cursor = clamp(s.cursor + delta, 0, s.items.length - 1)
  },
  toggleDone(s: State, { index }: { index: number }) {
    s.items[index].done = !s.items[index].done
  },

  apply(s: State, op: TaskOp) {
    const { op: name, ...params } = op
    return (Tasks as any)[name](s, params)
  },
}
```

Both calling styles work — direct calls for simplicity, `.apply()` when you need serialization:

```typescript
// Direct (simple, type-safe)
Tasks.moveCursor(state, { delta: 1 })

// As data (serializable — undo, replay, log, send over wire)
Tasks.apply(state, { op: "moveCursor", delta: 1 })

JSON.stringify({ op: "moveCursor", delta: 1 })
// → '{"op":"moveCursor","delta":1}'
```

Ops are just JSON — plain objects with a discriminator and named params. Same shape as Redux actions, Elm messages, and event sourcing events. No classes, no closures, no symbols.

**What this enables**:
- **Undo/redo**: Record ops in a stack, replay or invert them
- **Logging**: `JSON.stringify(op)` — see exactly what happened
- **AI automation**: Ops are tool call results — an AI can drive your app
- **Collaboration**: Send ops over the wire to other clients
- **Time-travel**: Replay any sequence from an initial state

## Effects as Data

Domain functions that do I/O are hard to test — you need mocks, stubs, and async. The same trick works: instead of *doing* the side effect, *describe* it as data.

```typescript
type Effect =
  | { effect: "persist"; data: unknown }
  | { effect: "toast"; message: string }

const Tasks = {
  // No effects — returns nothing
  moveCursor(s: State, { delta }: { delta: number }) {
    s.cursor = clamp(s.cursor + delta, 0, s.items.length - 1)
  },

  // Returns effects as data
  toggleDone(s: State, { index }: { index: number }): Effect[] {
    s.items[index].done = !s.items[index].done
    return [
      { effect: "persist", data: s.items },
      { effect: "toast", message: `Toggled ${s.items[index].text}` },
    ]
  },

  apply(s: State, op: TaskOp) {
    const { op: name, ...params } = op
    return (Tasks as any)[name](s, params)
  },
}
```

Same shape as ops — discriminator (`effect`) + named params. The runtime dispatches effects to runners:

```typescript
const runners = {
  persist: async ({ data }) => { await fs.writeFile("data.json", JSON.stringify(data)) },
  toast: ({ message }) => { showNotification(message) },
}

const effects = Tasks.apply(state, op)
if (effects) for (const e of effects) runners[e.effect](e)
```

Test what the function *says should happen*, not whether it happened:

```typescript
test("toggleDone persists and toasts", () => {
  const state = { cursor: 0, items: [{ text: "Buy milk", done: false }] }
  const effects = Tasks.toggleDone(state, { index: 0 })

  expect(state.items[0].done).toBe(true)
  expect(effects).toContainEqual({ effect: "persist", data: expect.any(Array) })
  expect(effects).toContainEqual({ effect: "toast", message: "Toggled Buy milk" })
})
```

No mocks. No I/O. No async.

**The upgrade is per-function, not per-app.** Some functions return nothing, others return `Effect[]`. You upgrade individual functions as they need effects.

**What this enables**:
- **Testable I/O**: Assert on effect data, not mocked calls
- **Swappable runners**: Production persists to disk, tests collect into an array
- **Serializable effects**: Log and replay side effects
- **Composable**: Batch, deduplicate, or reorder effects before running

## Composing Machines

For complex apps, decompose into independent state machines that communicate through effects:

```typescript
const Board = {
  moveCursor(s: BoardState, { delta }: { delta: number }) { ... },
  fold(s: BoardState, { nodeId }: { nodeId: string }): Effect[] { ... },
  apply(s: BoardState, op: BoardOp) { ... },
}

const Dialog = {
  open(s: DialogState, { kind }: { kind: string }) { ... },
  confirm(s: DialogState): Effect[] {
    s.open = false
    return [{ effect: "dispatch", op: "addItem", text: s.value }]
  },
  apply(s: DialogState, op: DialogOp) { ... },
}
```

No machine imports another. `Dialog.confirm()` says "dispatch addItem" as a data object; the effect runner routes it to the right domain function. Each machine is independently testable — communication is through serializable effect objects.

For how to wire multiple machines into a single store, see [Composing Machines in a Store](state-management.md#composing-machines).

## Prior Art

| System | What it makes data | Approach |
|--------|-------------------|----------|
| Redux | Operations | `dispatch(action)` + reducer |
| Event sourcing | Operations | Events as plain objects — store, replay, project |
| Elm | Ops + effects | `update : Msg -> Model -> (Model, Cmd Msg)` |
| redux-loop | Effects | Reducer returns `[state, effects]` |
| Hyperapp v2 | Effects | Optional tuple return from actions |
| Command pattern | Operations | Encapsulate request as object |
