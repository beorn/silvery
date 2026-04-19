# App Composition

How silvery apps are built, piece by piece.

## Simple Apps

```tsx
import { run, useInput } from "silvery/runtime"
import { Box, Text } from "silvery"

function App() {
  useInput((input, key) => {
    if (key.escape) return "exit"
  })
  return (
    <Box>
      <Text>Hello</Text>
    </Box>
  )
}

await run(<App />)
```

`run()` handles terminal setup, alternate screen, raw mode, and cleanup.

## Complex Apps

For apps with structured state, commands, and focus management, use `createApp` with a Zustand-compatible store and event handlers:

```tsx
import { createApp } from "@silvery/create/create-app"
import { pipe, withCommands } from "@silvery/create/plugins"

const app = createApp(
  () => (set, get) => ({
    count: 0,
    increment: () => set((s) => ({ count: s.count + 1 })),
  }),
  {
    "term:key": ({ input }, { set }) => {
      if (input === "j") set((s) => ({ count: s.count + 1 }))
      if (input === "q") return "exit"
    },
  },
)

await app.run(<Counter />, { stdin, stdout, mouse: true })
```

### Plugin Composition

Plugins add capabilities via `pipe()`:

```tsx
import { pipe, withFocus, withDomEvents, withTerminal } from "@silvery/create/plugins"

const fullApp = pipe(
  app,
  withTerminal(process, { mouse: true, kitty: true }),
  withFocus({ copyMode: true, find: true }),
  withDomEvents({ dragThreshold: 3 }),
)
await fullApp.run(<Board />)
```

Each `with*` plugin configures one concern. See [Providers and Plugins](../guide/providers.md) for the full list.

### Event Flow

Terminal events flow through a multi-stage pipeline:

1. **Raw** — modifier tracking (always runs)
2. **Focused** — dispatch to focused component's `onKeyDown` (consumes if handled)
3. **Fallback** — `useInput` handlers (only if focus didn't consume)
4. **App handler** — the event handler map passed to `createApp`

Focused components always get events before `useInput` hooks.

## Testing

Three levels, from fast to full-fidelity:

```tsx
// Headless — fast, stripped text (~5ms/op)
const app = render(<MyComponent />, { cols: 80, rows: 24 })
app.press("j")
expect(app.text).toContain("Count: 1")

// Emulator — full ANSI through xterm.js (~50ms/op)
using term = createTermless({ cols: 80, rows: 24 })
const handle = await run(<App />, term)
expect(term.screen).toContainText("Hello")

// Live terminal — real I/O
await run(<App />)
```

## Plugin Internals

Silvery ships two plugin families that compose via `pipe()` and coexist in the production stack. The consumer API (`run()`, `createApp()`, `useInput`, `pipe()`) is stable.

### 1. Test-harness plugins (wrap `App.press()`)

Imported from `@silvery/ag-term/plugins` (or the re-export barrel `@silvery/create/plugins`). These wrap the `App` handle returned by `createApp({...})` / `withApp()` and extend its keyboard test surface:

- `withTerminal(process, options)` — raw mode / alt-screen / paste / mouse / kitty setup; attaches `app.term`.
- `withFocus(options)` — Tab/Shift+Tab cycling, Escape blur, optional copy-mode (Esc+v) and Ctrl+F find. Attaches `app.focusManager`.
- `withCommands`, `withKeybindings`, `withDomEvents`, `withDiagnostics`, `withLinks`, `withRender` — each wraps a slice of the harness API.

### 2. Runtime apply-chain plugins (wrap `BaseApp.apply(op)`)

Exported from `@silvery/create/runtime/*` (and the `@silvery/create/plugins` barrel). These plug into the event-loop apply chain driven by `processEventBatch`:

- `withTerminalChain` — observer for modifier state, `term:resize`, `term:focus`.
- `withPasteChain` — focused `onPaste` > global `usePaste` handlers.
- `withInputChain` — the fallback useInput store.
- `withFocusChain({ dispatchKey, hasActiveFocus })` — focused-element key dispatch. Goes outermost so focused components consume before `useInput`.

The chain substrate is `createBaseApp()` from `@silvery/create/runtime/base-app`. Plugins follow a one-line idiom — capture `const prev = app.apply`, then replace `app.apply` with a wrapper that delegates to `prev(op)` for ops it doesn't handle. `apply(op) -> false | Effect[]`; runners call `app.dispatch(op)` then `app.drainEffects()` to get the render/exit/suspend/render-barrier effects to enact.

```ts
import {
  createBaseApp,
  withTerminalChain,
  withPasteChain,
  withInputChain,
  withFocusChain,
  runEventBatch,
} from "@silvery/create/plugins"
import { pipe } from "@silvery/create/pipe"

const app = pipe(
  createBaseApp(),
  withTerminalChain(),
  withPasteChain({ routeToFocused: dispatchPasteToFocus }),
  withInputChain,
  withFocusChain({ dispatchKey, hasActiveFocus }),
)

await runEventBatch(app, events, {
  onRender: () => doRender(),
  onExit: (e) => shutdown(e),
  onSuspend: () => performSuspend(),
  onBarrier: () => flushAndRender(),
})
```

### Relation to the event-handling doc

The public hooks (`useInput`, `usePaste`, `useExit`, `useModifierKeys`) are documented in [Event Handling](../guide/event-handling.md). The staged migration from `RuntimeContext.on("input"|"paste"|"focus")` to the apply-chain plugin stores is tracked in bead `km-silvery.tea-useinput` (Phase 2 of the `km-silvery.tea` epic). The substrate (`base-app`, four plugins, event-loop, lifecycle-effects) has shipped with 90 passing tests; the `processEventBatch` wiring and ag-react hook repoint are staged follow-ups so behavioural equivalence tests stay green at every step.
