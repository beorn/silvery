# inkx

React 19 for modern terminals. Pure TypeScript — no WASM, no C++, no native deps.

[![npm version](https://img.shields.io/npm/v/inkx.svg)](https://www.npmjs.com/package/inkx)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

<table>
<tr>
<th>Unique to inkx</th>
<th>Terminal Protocols</th>
<th>Developer Experience</th>
</tr>
<tr>
<td>
  <a href="docs/deep-dives/performance.md">122x faster</a> updates<br>
  Reactive layout<br>
  AI-ready commands<br>
  TEA/Elm + React + Zustand<br>
  Terminal, Canvas, DOM targets<br>
  Per-node dirty tracking<br>
  No WASM, no C++
</td>
<td>
  Mouse — click, drag, scroll<br>
  Kitty keyboard<br>
  Inline images<br>
  Clipboard over SSH<br>
  Hyperlinks, truecolor<br>
  Scrollback buffers<br>
  Synchronized output
</td>
<td>
  Playwright-style testing<br>
  Plugin composition<br>
  Drop-in Ink replacement<br>
  Screenshot capture<br>
  <code>$token</code> theming<br>
  23+ components<br>
  Scrollable containers
</td>
</tr>
</table>

## Why inkx?

**Components that know their size.** `useContentRect()` gives every component its rendered width and height — synchronously, during render. No prop drilling, no second pass, no ResizeObserver. This is [Ink's oldest open issue](https://github.com/vadimdemedes/ink/issues/5) (2016), solved.

**Every modern terminal protocol.** [Kitty keyboard](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) (all 5 flags including Cmd/Super), SGR mouse (click, drag, scroll with DOM-style event bubbling), inline images (Kitty graphics + Sixel), OSC 52 clipboard (works over SSH), OSC 8 hyperlinks, DECSTBM scroll regions, synchronized updates (flicker-free in tmux/Zellij), and bracketed paste. All built-in, all auto-detected, all with graceful fallback.

**[122x faster interactive updates.](docs/deep-dives/performance.md)** Per-node dirty tracking with 7 independent dirty flags per node. When a user presses a key, only changed nodes re-render — [169us for 1000 nodes vs Ink's 20.7ms](docs/deep-dives/performance.md#incremental-rendering). Buffer diffing emits only changed cells, reducing terminal I/O by 90%+.

**Scrollable containers — just work.** `overflow="scroll"` with `scrollTo`, hardware-accelerated DECSTBM scroll regions, and VirtualList for huge datasets. [Ink's #1 feature request](https://github.com/vadimdemedes/ink/issues/222) since 2019, solved.

**Three render targets.** Terminal, Canvas 2D, and DOM. Same React components, same layout engine — different output. See the [live demo](https://beorn.github.io/inkx/examples/live-demo).

## Build Any Terminal App

- **[AI Assistants & Chat](https://beorn.github.io/inkx/use-cases/ai-assistants)** — Streaming output, scrollback history, command palettes
- **[Dashboards & Monitoring](https://beorn.github.io/inkx/use-cases/dashboards)** — Multi-pane layouts with real-time data
- **[Kanban & Project Boards](https://beorn.github.io/inkx/use-cases/kanban-boards)** — Multi-column navigation with cards and focus management
- **[CLI Wizards & Setup Tools](https://beorn.github.io/inkx/use-cases/cli-wizards)** — Step-by-step forms, selections, progress tracking
- **[Developer Tools](https://beorn.github.io/inkx/use-cases/developer-tools)** — REPLs, log viewers, debuggers, profilers
- **[Data Explorers & Tables](https://beorn.github.io/inkx/use-cases/data-explorers)** — Virtual lists, filtering, search, sortable tables

## Quick Start

```bash
bun add inkx react @beorn/flexx
```

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

## What's Inside

### Components (23+)

- **Core:** Box, Text, Newline, Spacer, Static, Transform
- **Input:** TextInput, ReadlineInput, TextArea (multi-line with readline shortcuts)
- **Data:** VirtualList, SelectList, Table, Console
- **Display:** Spinner, ProgressBar, Badge, Divider, Image, Link
- **`overflow="scroll"`** with `scrollTo` — scrollable containers without manual virtualization ([Ink's #1 feature request](https://github.com/vadimdemedes/ink/issues/222) since 2019)

### Input & Focus

- **Input layer stack** — DOM-style event bubbling for modal dialogs and text input isolation
- **Tree-based focus** — scopes, spatial navigation (Up/Down/Left/Right), autoFocus, click-to-focus
- **Command system** — every action gets an ID, name, help text, and configurable keybinding
- **Keybinding resolution** — keypresses route through bindings to commands; searchable command palette for free
- **Hotkey parsing** — native macOS symbols: `parseHotkey("⌘K")`, `matchHotkey(key, "⌃⇧A")`

### Three Runtime Architectures

| Layer | Entry Point       | Style         | Best For                       |
| ----- | ----------------- | ------------- | ------------------------------ |
| 1     | `createRuntime()` | Elm-inspired  | Pure reducer + event stream    |
| 2     | `run()`           | React hooks   | Most apps (recommended)        |
| 3     | `createApp()`     | Zustand store | Complex apps with many sources |

Each wraps the one below. Choose the right paradigm per use case — all three in one framework.

### Developer Experience

- **Drop-in Ink replacement** — same Box, Text, useInput, useApp, Static, Spacer. [Migration guide](docs/guides/migration.md)
- **Playwright-style testing** — `createRenderer`, `getByTestId`, `getByText`, `locator()`, `app.press()`
- **Plugin composition** — `withCommands`, `withKeybindings`, `withDiagnostics` (SlateJS-inspired)
- **Screenshot capture** — `app.screenshot()` renders buffer to PNG via Playwright
- **Theming** — `ThemeProvider` with semantic `$token` colors (dark/light built-in)
- **Built for AI** — Command introspection for agents, programmatic screenshots, CLAUDE.md ships with the package
- **Pure TypeScript, zero native deps** — runs on Node, Bun, Deno. No WASM, no C++, no memory growth.

## Trade-offs

inkx optimizes for interactive apps where parts of the UI update frequently. For workloads that re-render the entire component tree from scratch (not typical for interactive CLIs), Ink's simpler reconciliation is [~30x faster](docs/deep-dives/performance.md). inkx's five-phase pipeline is the cost of layout feedback — and the reason interactive updates are [122x faster](docs/deep-dives/performance.md#incremental-rendering). See [detailed comparison](docs/ink-comparison.md).

## Ink Compatibility

Drop-in replacement for [Ink](https://github.com/vadimdemedes/ink). Same components, same hooks API:

```tsx
// Before (Ink)
import { render, Box, Text, useInput, useApp } from "ink"

// After (inkx)
import { render, Box, Text, useApp } from "inkx"
import { useInput } from "inkx/runtime"
```

What you gain: layout feedback, scrollable containers, mouse support, focus management, Kitty keyboard, images, clipboard, theming, plugin composition, Playwright-style testing, and zero native dependencies. See [migration guide](docs/guides/migration.md) for details.

## Status

Actively developed and used in production ([km](https://github.com/beorn/km), a terminal workspace for knowledge workers). APIs may change. The core architecture (reconciler, layout hooks, five-phase pipeline, plugin system) has been stable through months of daily production use.

| Feature                                            | Status     |
| -------------------------------------------------- | ---------- |
| Core components (Box, Text, VirtualList, inputs)   | Stable     |
| Hooks (useContentRect, useInput, useApp, useTerm)  | Stable     |
| React reconciler (React 19)                        | Stable     |
| Flexx layout engine                                | Stable     |
| Plugin system (commands, keybindings, diagnostics) | Stable     |
| Terminal target                                    | Production |
| Canvas / DOM targets                               | Prototype  |

## Examples

```bash
bun run examples/dashboard/index.tsx      # Multi-pane dashboard
bun run examples/kanban/index.tsx         # 3-column kanban board
bun run examples/task-list/index.tsx      # Scrollable task list
bun run examples/search-filter/index.tsx  # useTransition + useDeferredValue
bun run examples/async-data/index.tsx     # Suspense + async loading
bun run examples/textarea/index.tsx       # Multi-line text input
bun run examples/scrollback/index.tsx     # Scrollback mode (frozen items)
```

See [examples/index.md](examples/index.md) for descriptions and the [live demo](https://beorn.github.io/inkx/examples/live-demo) for browser-rendered examples.

## Documentation

Full docs at **[beorn.github.io/inkx](https://beorn.github.io/inkx/)**

| Document                                          | Description                                    |
| ------------------------------------------------- | ---------------------------------------------- |
| [Getting Started](docs/guides/getting-started.md) | First app tutorial, basic input, layout        |
| [Runtime Layers](docs/guides/runtime-layers.md)   | createRuntime, createStore, createApp, streams |
| [Components](docs/reference/components.md)        | Box, Text, VirtualList, Console, inputs        |
| [Hooks](docs/reference/hooks.md)                  | useContentRect, useInput, useApp, useTerm      |
| [Architecture](docs/deep-dives/architecture.md)   | Pipeline, RenderAdapter interface              |
| [Testing](docs/testing.md)                        | Strategy, locators, withDiagnostics            |
| [Performance](docs/deep-dives/performance.md)     | Benchmarks and optimization                    |
| [Plugins](docs/reference/plugins.md)              | withCommands, withKeybindings, withDiagnostics |
| [Migration](docs/guides/migration.md)             | Ink -> inkx guide                              |

## Related Projects

| Project                                    | Role                                            |
| ------------------------------------------ | ----------------------------------------------- |
| [Ink](https://github.com/vadimdemedes/ink) | API compatibility target                        |
| [Flexx](https://github.com/beorn/flexx)    | Default layout engine (2.5x faster, 5x smaller) |
| [Yoga](https://yogalayout.dev/)            | Optional layout engine (WASM)                   |

## License

MIT
