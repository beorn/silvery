# Silvery

**Polished Terminal UIs in React.**

Responsive layouts, scrollable containers, 100x+ faster incremental updates, and full support for modern terminal capabilities. 30+ components from TextInput to VirtualList. Pure TypeScript, no WASM.

```
npm install silvery react
```

> **Status:** Alpha — under active development. APIs may change. Early adopters and feedback welcome.

**Runtimes:** Library works with Bun >= 1.0 and Node.js >= 18. CLI (`silvery` command) requires Bun.

```tsx
import { useState } from "react"
import { render, Box, Text, useInput, useContentRect, createTerm } from "silvery"

function App() {
  const { width } = useContentRect()
  const [count, setCount] = useState(0)

  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "k") setCount((c) => c - 1)
    if (input === "q") return "exit"
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Counter ({width} cols wide)</Text>
      <Text>Count: {count}</Text>
      <Text dim>j/k = change, q = quit</Text>
    </Box>
  )
}

using term = createTerm()
await render(<App />, term).run()
```

## Renderer

### Responsive layout

`useContentRect()` returns actual dimensions synchronously -- no post-layout effect, no `{width: 0, height: 0}` on first render. Components adapt to their available space immediately.

```tsx
function Responsive() {
  const { width } = useContentRect()
  return width > 80 ? <FullDashboard /> : <CompactView />
}
```

### Scrollable containers

`overflow="scroll"` with `scrollTo` -- the framework handles measurement, clipping, and scroll position. No manual virtualization needed.

```tsx
<Box height={20} overflow="scroll" scrollTo={selectedIndex}>
  {items.map((item) => (
    <Card key={item.id} item={item} />
  ))}
</Box>
```

### Per-node dirty tracking

Seven independent dirty flags per node. When a user presses a key, only the affected nodes re-render -- bypassing React reconciliation entirely for unchanged subtrees. Typical interactive updates complete in ~170 microseconds for 1000 nodes, compared to full-tree re-renders.

### Multi-target rendering

Terminal today, Canvas 2D and DOM experimental. Same React components, different rendering backends.

## Framework Layers (Optional)

### Input layer stack

DOM-style event bubbling with modal isolation. Opening a dialog automatically captures input -- no manual guard checks in every handler.

```tsx
<InputLayerProvider>
  <Board />
  {isOpen && <Dialog />} {/* Dialog captures input; Board doesn't see it */}
</InputLayerProvider>
```

### Spatial focus navigation

Tree-based focus with scopes, arrow-key directional movement, click-to-focus, and `useFocusWithin`. Go beyond tab-order.

### Command and keybinding system

Named commands with IDs, help text, configurable keybindings, and runtime introspection. Build discoverable, AI-automatable interfaces.

```tsx
const MyComponent = withCommands(BaseComponent, () => [
  { id: "save", label: "Save", keys: ["ctrl+s"], action: () => save() },
  { id: "quit", label: "Quit", keys: ["q", "ctrl+c"], action: () => exit() },
])
```

### Mouse support

SGR mouse protocol with DOM-style event props -- `onClick`, `onMouseDown`, `onWheel`, hit testing, drag support.

### Multi-line text editing

Built-in `TextArea` with word wrap, scrolling, cursor movement, selection, and undo/redo via `EditContext`.

### 30+ built-in components

TextArea, TextInput, VirtualList, SelectList, Table, CommandPalette, ModalDialog, Tabs, TreeView, SplitView, Toast, Image, and more -- all with built-in scrolling, focus, and input handling.

### Theme system

`@silvery/theme` with 38 built-in palettes and semantic color tokens (`$primary`, `$error`, `$border`, etc.) that adapt automatically.

### TEA state machines

Optional [Elm Architecture](https://guide.elm-lang.org/architecture/) alongside React hooks. Pure `(action, state) -> [state, effects]` functions for testable, replayable, undoable UI logic.

## Packages

| Package                              | Description                               |
| ------------------------------------ | ----------------------------------------- |
| [`silvery`](packages/)               | Umbrella -- re-exports `@silvery/react`   |
| [`@silvery/react`](packages/react)   | React reconciler, hooks, renderer         |
| [`@silvery/term`](packages/term)     | Terminal rendering pipeline, ANSI styling |
| [`@silvery/ui`](packages/ui)         | Component library (30+ components)        |
| [`@silvery/theme`](packages/theme)   | Theming with 38 palettes                  |
| [`@silvery/tea`](packages/tea)       | TEA state machine store                   |
| [`@silvery/compat`](packages/compat) | Ink/Chalk compatibility layers            |
| [`@silvery/test`](packages/test)     | Testing utilities and locators            |

## Compatibility

`silvery/ink` and `silvery/chalk` provide compatibility layers for existing React terminal apps. The core API (`Box`, `Text`, `useInput`, `render`) is intentionally familiar -- most existing code works with minimal changes. See the [migration guide](docs/guide/migration.md) for details.

## When to Use Silvery

Silvery is designed for **complex interactive TUIs** — dashboards, editors, kanban boards, chat interfaces. If you need scrollable containers, mouse support, spatial focus, or components that adapt to their size, Silvery provides these out of the box.

For simple one-shot CLI prompts or spinners, mature alternatives with larger plugin ecosystems may be a better fit today.

## Ecosystem

| Project                                    | What                                                           |
| ------------------------------------------ | -------------------------------------------------------------- |
| [Termless](https://termless.dev)           | Headless terminal testing -- like Playwright for terminal apps |
| [Flexily](https://beorn.github.io/flexily) | Pure JS flexbox layout engine (Yoga-compatible, zero WASM)     |
| [Loggily](https://beorn.github.io/loggily) | Debug + structured logging + tracing                           |

See the [roadmap](https://silvery.dev/roadmap) for what's next.

## Performance

_Apple M1 Max, Bun 1.3.9. Reproduce: `bun run bench:compare`_

| Scenario                                | Silvery | Ink 5   |
| --------------------------------------- | ------- | ------- |
| Cold render (1 component)               | 165 us  | 271 us  |
| Cold render (1000 components)           | 463 ms  | 541 ms  |
| Typical interactive update (1000 nodes) | 169 us  | 20.7 ms |
| Layout (50-node kanban)                 | 57 us   | 88 us   |

**Why the difference?** Interactive updates (cursor move, scroll, toggle) typically change one or two nodes. Silvery's per-node dirty tracking updates only those nodes — 169 us for a 1000-node tree. Traditional full-tree renderers re-render the entire React tree and run complete layout on every state change — 20.7 ms. For the updates that dominate interactive use, Silvery is ~100x faster.

Full re-renders where the entire tree changes are comparable or faster in full-tree renderers (simpler string concatenation vs Silvery's 5-phase pipeline). That trade-off is inherent to supporting responsive layout, and full re-renders are rare in interactive apps.

## Documentation

Full docs at [silvery.dev](https://silvery.dev) -- getting started guide, API reference, component catalog, and migration guide.

## Development

```bash
bun install
bun test
bun run lint
```

## License

MIT
