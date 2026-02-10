# inkx

React rendering where components know their size.

[![npm version](https://img.shields.io/npm/v/inkx.svg)](https://www.npmjs.com/package/inkx)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## The Problem

React components can't know their dimensions during render. This is universal:

- **React DOM** — ResizeObserver dance, second render, layout jank
- **React Native** — FlatList getItemLayout guesses, scroll jank
- **Ink** — manual width-prop threading through entire tree

inkx solves this with a five-phase pipeline: reconcile, measure, layout, content, output. Layout is computed _before_ content rendering. Components access their dimensions synchronously via `useContentRect()`.

```tsx
// Ink: width props cascade through entire tree
<Board width={80}>
  <Column width={26}>
    <Card width={24} />
  </Column>
</Board>

// inkx: just ask
<Board>
  <Column>
    <Card />  {/* useContentRect() inside */}
  </Column>
</Board>
```

Same insight as WPF Measure/Arrange (2006), CSS Container Queries (2022), and Facebook Litho/ComponentKit (35% scroll perf gains).

## Quick Start

```tsx
import { run, useInput } from "inkx/runtime"
import { Box, Text, useContentRect } from "inkx"

function App() {
  const { width } = useContentRect()
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "j" || key.downArrow) setCount((c) => c + 1)
    if (input === "k" || key.upArrow) setCount((c) => c - 1)
    if (input === "q") return "exit"
  })

  return (
    <Box flexDirection="column">
      <Text>Terminal width: {width}</Text>
      <Text>Count: {count}</Text>
    </Box>
  )
}

await run(<App />)
```

```bash
bun add inkx react @beorn/flexx
```

## Architecture at a Glance

Three runtime layers from low-level to high-level:

| Layer | Entry Point       | Style         | Best For                       |
| ----- | ----------------- | ------------- | ------------------------------ |
| 1     | `createRuntime()` | Elm-inspired  | Pure reducer + event stream    |
| 2     | `run()`           | React hooks   | Most apps (recommended)        |
| 3     | `createApp()`     | Zustand store | Complex apps with many sources |

Each wraps the one below. Layer 1 gives you a pure event loop with AsyncIterable — `reducer(state, event) → state`, `view(state) → JSX`, `schedule()` for async effects. Layer 2 adds React hooks. Layer 3 adds centralized state with a provider pattern.

## Terminal Rendering Modes

inkx supports several rendering strategies for terminal output:

| Mode           | Screen Buffer | Scrollback        | Input | Use Case                       |
| -------------- | ------------- | ----------------- | ----- | ------------------------------ |
| **Fullscreen** | Alternate     | None              | Yes   | TUI apps (takes over terminal) |
| **Inline**     | Normal        | Exists but unused | Yes   | Progress bars, prompts         |
| **Scrollback** | Normal        | Active            | Yes   | CLI tools with history         |
| **Static**     | N/A           | Append-only       | No    | CI, piped output, logging      |

**Fullscreen** uses the alternate screen buffer — content disappears when the app exits. Best for interactive TUI applications.

```tsx
using term = createTerm()
await render(<App />, term, { fullscreen: true })
```

**Inline** renders in the normal screen buffer, updating in place from the current cursor position. Scrollback exists but isn't actively used.

```tsx
using term = createTerm()
await render(<ProgressBar />, term)
```

**Scrollback** — completed items freeze and scroll into terminal scrollback via `useScrollback` + VirtualList's `frozen` prop. The active UI shrinks as items complete. Users scroll up with native terminal features to review history. Similar to pi-tui and Rich's Live.

```tsx
const frozenCount = useScrollback(items, {
  frozen: (item) => item.complete,
  render: (item) => `  ✓ ${item.title}`,
})

<VirtualList items={items} frozen={(item) => item.complete} ... />
```

**Static** renders once to a string — no cursor control needed, safe for piped output and CI environments.

```tsx
const output = renderString(<Summary />, { width: 80 })
console.log(output)

// Strip ANSI codes for piped output
const plain = renderString(<Report />, { width: 80, plain: true })
```

## Render Targets

The RenderAdapter interface separates core logic (reconciler, layout, hooks) from output.

| Target       | Status       | Use Case                            |
| ------------ | ------------ | ----------------------------------- |
| Terminal     | Production   | TUI apps (primary target)           |
| Canvas 2D    | Experimental | Data viz, games, design tools       |
| DOM          | Experimental | Accessibility, text selection       |
| WebGL        | Future       | High-performance Canvas alternative |
| React Native | Future       | Solve FlatList height estimation    |

~60% of inkx code (reconciler, layout, hooks) is target-independent.

## Key Features

### Layout & Rendering

- `useContentRect()` / `useScreenRect()` — sync layout feedback during render
- Five-phase pipeline with dirty tracking
- Pluggable layout: [Flexx](https://github.com/beorn/flexx) (default, pure JS) or Yoga (WASM)
- 165µs cold render, 169µs dirty update for 1000 nodes ([benchmarks](docs/ink-comparison.md#performance))

### Components

- **Box** — flexbox container with borders, padding, overflow
- **Text** — styled text with auto-truncation, extended underlines
- **VirtualList** — efficient rendering for large lists (100+ items)
- **Console** — captures and displays `console.log` output
- **TextInput** / **ReadlineInput** — text input with readline shortcuts (Ctrl+A/E/W/K/Y)
- `overflow="scroll"` with `scrollTo` — no manual virtualization needed

### Input & Interaction

- Input layer stack — DOM-style event bubbling (LIFO)
- Plugin composition: withCommands, withKeybindings, withDiagnostics
- HitRegistry — mouse/click support (coming soon)

### Testing

- `createRenderer` with configurable dimensions
- Playwright-style locators: `getByTestId`, `getByText`, `locator()`
- `withDiagnostics`: incremental vs fresh render verification

### Unicode & Streams

- 28+ unicode utilities (grapheme splitting, display width, CJK, emoji)
- AsyncIterable helpers: merge, map, filter, throttle, debounce, batch

## Ink Compatibility

Drop-in replacement for [Ink](https://github.com/vadimdemedes/ink). Same components, same hooks API. See [migration guide](docs/migration.md) and [detailed comparison](docs/ink-comparison.md) for feature/performance differences.

## Status

**Experimental** — actively developed, used in production apps, but APIs may change and things may break. The terminal render target is stable; non-TUI render targets (Canvas, DOM) are prototypes only.

| Feature                                           | Status       |
| ------------------------------------------------- | ------------ |
| Core components (Box, Text)                       | Stable       |
| Hooks (useContentRect, useInput, useApp, useTerm) | Stable       |
| React reconciler (React 19)                       | Stable       |
| Flexx layout engine (default)                     | Stable       |
| Yoga layout engine (WASM, optional)               | Stable       |
| Terminal target                                   | Production   |
| Canvas / DOM targets                              | Prototype    |

## Examples

```bash
bun run examples/dashboard/index.tsx      # Multi-pane dashboard
bun run examples/kanban/index.tsx         # 3-column kanban board
bun run examples/task-list/index.tsx      # Scrollable task list
bun run examples/search-filter/index.tsx  # useTransition + useDeferredValue
bun run examples/async-data/index.tsx     # Suspense + async loading
bun run examples/scrollback/index.tsx    # Scrollback mode (frozen items)
```

See [examples/index.md](examples/index.md) for descriptions.

## Documentation

| Document                                   | Description                                              |
| ------------------------------------------ | -------------------------------------------------------- |
| [Getting Started](docs/getting-started.md) | Runtime layers and tutorial                              |
| [Components](docs/components.md)           | Box, Text, VirtualList, Console, inputs                  |
| [Hooks](docs/hooks.md)                     | useContentRect, useScreenRect, useInput, useApp, useTerm |
| [Architecture](docs/architecture.md)       | Pipeline, RenderAdapter interface                        |
| [Testing](docs/testing.md)                 | Strategy, locators, withDiagnostics                      |
| [Internals](docs/internals.md)             | Reconciler deep dive                                     |
| [Performance](docs/performance.md)         | Benchmarks and optimization                              |
| [Streams](docs/streams.md)                 | AsyncIterable helpers                                    |
| [Focus Routing](docs/focus-routing.md)     | Input routing pattern                                    |
| [Ink Comparison](docs/ink-comparison.md)   | Detailed comparison                                      |
| [Migration](docs/migration.md)             | Ink → inkx guide                                         |
| [Roadmap](docs/roadmap.md)                 | Render targets and future plans                          |

## Related Projects

| Project                                    | Role                                            |
| ------------------------------------------ | ----------------------------------------------- |
| [Ink](https://github.com/vadimdemedes/ink) | API compatibility target                        |
| [Flexx](https://github.com/beorn/flexx)    | Default layout engine (2.5x faster, 5x smaller) |
| [chalkx](https://github.com/beorn/chalkx)  | Terminal primitives (re-exported by inkx)       |
| [Yoga](https://yogalayout.dev/)            | Optional layout engine (WASM)                   |

## License

MIT
