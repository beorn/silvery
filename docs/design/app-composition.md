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
  return <Box><Text>Hello</Text></Box>
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
    increment: () => set(s => ({ count: s.count + 1 })),
  }),
  {
    "term:key": ({ input }, { set }) => {
      if (input === "j") set(s => ({ count: s.count + 1 }))
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

The internal plugin composition model (how `createApp` routes events, how `with*` plugins interact) is under active development. The consumer API (`run()`, `createApp()`, `useInput`, `pipe()`) is stable.
