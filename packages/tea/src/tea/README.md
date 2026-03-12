# silvery/tea

Zustand middleware for TEA (The Elm Architecture) effects-as-data pattern.

A ~30-line middleware that lets Zustand reducers optionally return `[state, effects]`
alongside plain state. Gradual adoption: start with pure state updates (Level 3),
add effects-as-data when you need side effects (Level 4).

## Install

```ts
import { tea, collect } from "@silvery/tea"
import type { TeaResult, TeaReducer, EffectRunners, TeaSlice, EffectLike } from "@silvery/tea"
```

Not a standalone package. Exported as a sub-path from Silvery.

## Quick Start

Level 3 — ops as data. The reducer takes state and an operation, returns new state.
`tea()` wraps it as a Zustand state creator with `dispatch`.

```ts
import { createStore } from "zustand"
import { tea } from "@silvery/tea"

interface State {
  count: number
}

type Op = { type: "increment" } | { type: "decrement" } | { type: "reset" }

function reducer(state: State, op: Op): State {
  switch (op.type) {
    case "increment":
      return { ...state, count: state.count + 1 }
    case "decrement":
      return { ...state, count: state.count - 1 }
    case "reset":
      return { ...state, count: 0 }
  }
}

const store = createStore(tea({ count: 0 }, reducer))

store.getState().dispatch({ type: "increment" })
store.getState().count // 1
```

No effects, no runners, no ceremony. Plain `(state, op) => state`.

## Effects

Level 4 — effects as data. Same middleware, same reducer signature. When an operation
needs a side effect, return `[state, effects]` instead of plain state. Mix freely
on a per-case basis.

```ts
import { createStore } from "zustand"
import { tea, type TeaResult, type EffectRunners } from "@silvery/tea"

// Effects are plain objects with a `type` discriminant
const log = (msg: string) => ({ type: "log" as const, msg })
const save = (url: string, body: unknown) => ({ type: "save" as const, url, body })

type MyEffect = ReturnType<typeof log> | ReturnType<typeof save>

interface State {
  count: number
}

type Op = { type: "increment" } | { type: "save" }

function reducer(state: State, op: Op): TeaResult<State, MyEffect> {
  switch (op.type) {
    case "increment":
      return { ...state, count: state.count + 1 } // Level 3: plain state
    case "save":
      return [state, [save("/api/count", state), log("saved")]] // Level 4: [state, effects]
  }
}

// Effect runners: swappable for production, test, replay
const runners: EffectRunners<MyEffect, Op> = {
  log: (effect) => console.log(effect.msg),
  save: async (effect, dispatch) => {
    await fetch(effect.url, { method: "POST", body: JSON.stringify(effect.body) })
    // Round-trip: dispatch back into the reducer (Elm's Cmd Msg pattern)
    dispatch({ type: "increment" })
  },
}

const store = createStore(tea({ count: 0 }, reducer, { runners }))

store.getState().dispatch({ type: "save" })
// -> state unchanged, effects executed: POST /api/count + console.log("saved")
```

### Detection mechanism

`Array.isArray` distinguishes plain state (object) from `[state, effects]` (array).
Safe because Zustand state is always an object — never an array.

### Effect execution

Effects run synchronously after state update, in order. Each effect is routed to a
runner by its `type` field. Runners receive a `dispatch` callback for round-trip
communication. Unmatched effects (no runner for that type) are silently dropped.

## API Reference

### `tea(initialState, reducer, options?)`

Zustand `StateCreator` middleware. Returns a store shape of `S & { dispatch }`.

| Parameter      | Type                   | Description                                              |
| -------------- | ---------------------- | -------------------------------------------------------- |
| `initialState` | `S extends object`     | Initial domain state                                     |
| `reducer`      | `TeaReducer<S, Op, E>` | Pure reducer: `(state, op) => state \| [state, effects]` |
| `options`      | `TeaOptions<E, Op>`    | Optional `{ runners }` for effect execution              |

Returns: `StateCreator<TeaSlice<S, Op>>`

### `collect(result)`

Test helper. Normalizes a reducer result to `[state, effects]` regardless of what
the reducer returned.

| Parameter | Type              | Description                      |
| --------- | ----------------- | -------------------------------- |
| `result`  | `TeaResult<S, E>` | Return value from a reducer call |

Returns: `[S, E[]]` — always a tuple. Plain state becomes `[state, []]`.

### Types

```ts
// An effect must have a `type` discriminant
type EffectLike = { type: string }

// Reducer return: plain state (no effects) or [state, effects]
type TeaResult<S, E extends EffectLike = EffectLike> = S | readonly [S, E[]]

// A reducer function
type TeaReducer<S, Op, E extends EffectLike = EffectLike> = (state: S, op: Op) => TeaResult<S, E>

// Runners keyed by effect type. Each receives the effect + dispatch for round-trips.
type EffectRunners<E extends EffectLike, Op = unknown> = {
  [K in E["type"]]?: (effect: Extract<E, { type: K }>, dispatch: (op: Op) => void) => void | Promise<void>
}

// Options for tea()
interface TeaOptions<E extends EffectLike, Op> {
  runners?: EffectRunners<E, Op>
}

// The store shape: domain state + dispatch
type TeaSlice<S, Op> = S & { dispatch: (op: Op) => void }
```

## Testing

Reducers are pure functions. Test them directly without a store. `collect()` normalizes
the return value so assertions work uniformly whether the reducer returned plain state
or a tuple.

```ts
import { collect } from "@silvery/tea"

const initial: State = { count: 0 }

// Level 3 case: plain state
const [state1, effects1] = collect(reducer(initial, { type: "increment" }))
expect(state1.count).toBe(1)
expect(effects1).toEqual([])

// Level 4 case: state + effects
const [state2, effects2] = collect(reducer(initial, { type: "save" }))
expect(state2).toEqual(initial)
expect(effects2).toContainEqual(save("/api/count", initial))
expect(effects2).toContainEqual(log("saved"))
```

Effect runners are tested separately — inject mock dispatch, assert on calls:

```ts
const dispatched: Op[] = []
const mockDispatch = (op: Op) => dispatched.push(op)

runners.save!(save("/api/count", { count: 5 }), mockDispatch)
// assert: dispatched contains expected round-trip ops
```

## Prior Art

| System                                                  | Approach                                      | Difference                                            |
| ------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| [redux-loop](https://github.com/redux-loop/redux-loop)  | Redux middleware, `loop(state, effects)`      | Store enhancer, more API surface. tea() is ~30 lines. |
| [Hyperapp v2](https://github.com/jorgebucaran/hyperapp) | `[state, effects]` tuples from actions        | Full framework. tea() is just a Zustand middleware.   |
| [Elm](https://guide.elm-lang.org/effects/)              | `Cmd Msg` — effects return messages to update | The original. tea() adapts this to JS/Zustand.        |

The key insight shared by all: effects are **data**, not imperative calls. The reducer
declares _what_ should happen; runners decide _how_. This makes reducers pure, testable,
and replayable.

## See Also

- [docs/guide/state-management.md](../../docs/guide/state-management.md) — full state management guide covering createApp, createSlice, selectors, and effects middleware
