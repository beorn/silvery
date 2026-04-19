# @silvery/headless — Pure State Machines

`@silvery/headless` provides pure state machines for UI interactions — no React, no rendering, no side effects. Each machine is a `(state, action) -> state` function you can use anywhere: terminal, browser, tests, or server.

## Why Headless?

Interactive UI components need state logic (cursor position, selection range, kill ring). That logic shouldn't be coupled to a rendering framework. Headless machines extract it into pure functions that:

- **Test trivially** — no DOM, no terminal, no mocking
- **Compose freely** — wrap with React hooks, zustand, signals, or a bare loop
- **Port anywhere** — same readline logic works in terminal and browser
- **Replay and undo** — serializable actions enable time-travel debugging

## createMachine\<S, A\>

The observable container that wraps any update function:

```typescript
import { createMachine, type Machine, type UpdateFn } from "@silvery/headless"

// Define your pure update function
const counterUpdate: UpdateFn<number, "inc" | "dec"> = (state, action) =>
  action === "inc" ? state + 1 : state - 1

// Wrap it in an observable container
const counter: Machine<number, "inc" | "dec"> = createMachine(counterUpdate, 0)

counter.state // 0
counter.send("inc") // dispatches through update function
counter.state // 1

// Subscribe to changes
const unsub = counter.subscribe((state) => console.log("count:", state))
counter.send("inc") // logs "count: 2"
unsub()

// Escape hatch: replace state directly (for controlled mode sync)
counter.setState(10)
```

### Machine Interface

```typescript
interface Machine<S, A> {
  readonly state: S // Current state (read-only)
  send(action: A): void // Dispatch an action
  subscribe(listener: (state: S) => void): () => void // Subscribe; returns unsubscribe
  setState(state: S): void // Replace state directly
}

type UpdateFn<S, A> = (state: S, action: A) => S
```

`send()` only notifies subscribers when the update function returns a new reference (`next !== current`). This makes identity-based change detection work naturally with immutable state.

## Existing Machines

### readline — Text editing with readline keybindings

Pure state machine for single-line text editing. Cursor movement, character editing, kill ring with yank cycling — all as immutable state transitions.

```typescript
import {
  readlineUpdate,
  createReadlineState,
  type ReadlineState,
  type ReadlineAction,
} from "@silvery/headless"

let state = createReadlineState({ value: "hello world", cursor: 5 })
state = readlineUpdate(state, { type: "kill_to_end" })
// state.value === 'hello', state.killRing === ['world']

state = readlineUpdate(state, { type: "yank" })
// state.value === 'hello world' (yanked from kill ring)
```

**Actions**: `move_left`, `move_right`, `move_word_left`, `move_word_right`, `move_start`, `move_end`, `insert`, `delete_back`, `delete_forward`, `transpose`, `kill_word_back`, `kill_word_forward`, `kill_to_start`, `kill_to_end`, `yank`, `yank_cycle`, `set_value`

### select-list — Cursor navigation over a list

Pure state machine for navigating a list with a cursor. The machine tracks the index and count; actual items are external.

```typescript
import {
  selectListUpdate,
  createSelectListState,
  type SelectListState,
  type SelectListAction,
} from "@silvery/headless"

let state = createSelectListState({ count: 10 })
state = selectListUpdate(state, { type: "move_down" })
// state.index === 1

state = selectListUpdate(state, { type: "move_last" })
// state.index === 9
```

**Actions**: `move_down`, `move_up`, `move_to`, `move_first`, `move_last`, `page_down`, `page_up`, `set_count`

Actions that move accept an optional `isDisabled` predicate to skip disabled items.

### Interaction Features (Runtime-Level)

The following interaction capabilities are implemented as **runtime features** in `@silvery/ag-term/features/`, not as headless machines. They are wired automatically by providers:

- **SelectionFeature** — text selection with mouse drag, word/line selection, contain boundaries. Activated by `withDomEvents()`.
- **FindFeature** — buffer-level text search with match highlighting and navigation. Activated by `withFocus()` (`Ctrl+F`).
- **CopyModeFeature** — vim-style keyboard-driven text selection. Activated by `withFocus()` (`Esc, v`).
- **DragFeature** — mouse drag-and-drop with hit testing. Activated by `withDomEvents()`.

See [Text Selection](/guide/text-selection), [Find](/guide/find), and [Event Handling](/guide/event-handling) for usage details.

## React Integration

`@silvery/headless` includes React hooks that bridge machines to component state via `useReducer`:

```typescript
import { useSelectList, useReadline } from "@silvery/headless"

function MyList({ items }) {
  const [state, send] = useSelectList({ count: items.length })
  // state.index is the cursor position
  // send({ type: 'move_down' }) to navigate
}

function MyInput() {
  const [state, send] = useReadline({ value: "" })
  // state.value, state.cursor
  // send({ type: 'insert', text: 'a' })
}
```

These hooks use the same pure update functions — they just wrap them in `useReducer` for React's state management.

## How Machines Connect to Providers

Providers (see [Providers and Plugins](./providers.md)) wire machines into the app's event flow. The pattern:

1. A **headless machine** defines the pure state logic (`@silvery/headless`)
2. A **provider** creates the machine instance, subscribes to app events, and dispatches actions
3. **React hooks** read the machine's state for rendering

This keeps state logic testable and portable while providers handle the wiring.

## Writing a New Machine

### 1. Define State and Actions

```typescript
// clipboard.ts
export interface ClipboardState {
  readonly entries: readonly string[]
  readonly current: number
}

export type ClipboardAction =
  | { type: "copy"; text: string }
  | { type: "cycle_next" }
  | { type: "cycle_prev" }
```

### 2. Write the Pure Update Function

```typescript
export function clipboardUpdate(state: ClipboardState, action: ClipboardAction): ClipboardState {
  switch (action.type) {
    case "copy":
      return { entries: [action.text, ...state.entries].slice(0, 20), current: 0 }
    case "cycle_next":
      return { ...state, current: Math.min(state.current + 1, state.entries.length - 1) }
    case "cycle_prev":
      return { ...state, current: Math.max(state.current - 1, 0) }
    default:
      return state
  }
}

export function createClipboardState(): ClipboardState {
  return { entries: [], current: 0 }
}
```

### 3. Export from the Package Index

```typescript
// index.ts
export {
  clipboardUpdate,
  createClipboardState,
  type ClipboardState,
  type ClipboardAction,
} from "./clipboard"
```

### Naming Conventions

Follow these naming conventions consistently across all machines.

- **Files**: flat, no suffix — `readline.ts`, `select-list.ts`, NOT `readline-machine.ts`
- **Update function**: `{name}Update(state, action)` — e.g., `readlineUpdate`, `selectListUpdate`
- **State factory**: `create{Name}State(opts)` — e.g., `createReadlineState`
- **Types**: `{Name}State`, `{Name}Action` — e.g., `ReadlineState`, `ReadlineAction`
- **Machine instances**: created via `createMachine(update, initialState)` by the consumer

The machine file exports the pure update function and types. The `createMachine()` container is used by consumers (providers, hooks, tests) who need observability — the update function itself is framework-agnostic.
