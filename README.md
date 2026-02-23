# inkx

React for modern terminals.

[![npm version](https://img.shields.io/npm/v/inkx.svg)](https://www.npmjs.com/package/inkx)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Terminals have evolved — Kitty, Ghostty, WezTerm, and iTerm2 support graphics, mouse tracking, keyboard protocols, clipboard access, and hardware-accelerated scrolling. But React terminal frameworks haven't kept up.

inkx brings all of it to React. Full mouse and keyboard support, inline images, scrollable containers, layout-aware components, and a hybrid React/Elm architecture — in one framework, with zero native dependencies.

![Dashboard with multiple panes, borders, and colors](docs/images/dashboard.png)

## Why inkx?

**Components that know their size.** `useContentRect()` gives components their actual dimensions during render — no width prop drilling, no second render pass, no guessing. This is [Ink's oldest open issue](https://github.com/vadimdemedes/ink/issues/5) (2016) and React's biggest layout gap, solved.

**Every modern terminal protocol.** [Kitty keyboard](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) (all 5 flags), SGR mouse (click, drag, scroll), inline images (Kitty graphics + Sixel), OSC 52 clipboard (works over SSH), OSC 8 hyperlinks, DECSTBM scroll regions, DEC 2026 synchronized updates (flicker-free in tmux/Zellij), and bracketed paste. No other JavaScript TUI framework exposes all of these.

**122x faster interactive updates.** Per-node dirty tracking bypasses React reconciliation entirely for keystroke updates. When a user presses a key, only the changed nodes re-render — 169µs for 1000 nodes vs Ink's 20.7ms full re-render. See [benchmarks](docs/deep-dives/performance.md).

**React + Elm in one framework.** Three runtime layers: Elm-style pure reducers for predictable state (`createRuntime`), React hooks for most apps (`run`), and Zustand stores for complex state (`createApp`). Choose the right paradigm per use case — no other TUI framework offers all three.

**Pure TypeScript, zero native dependencies.** The [Flexx](https://github.com/beorn/flexx) layout engine is 7KB of pure JavaScript — no WASM, no C++ compilation, no memory growth. Ink's Yoga WASM has a [known linear memory bug](https://github.com/anthropics/claude-code/issues/4953) that caused 120GB RAM usage in production.

## Built for AI-powered CLIs

inkx was designed alongside Claude Code, Anthropic's AI coding assistant. Features that matter for AI tools:

- **Scrollable containers** that handle variable-length LLM output without manual dimension management — `overflow="scroll"` just works
- **Command introspection** — `cmd.all()` lets AI agents discover available commands; `cmd.down()` executes them programmatically
- **[CLAUDE.md](CLAUDE.md)** — AI-readable framework reference that ships with the package, optimized for LLM context windows

Equally at home in any interactive terminal app — dashboards, developer tools, task managers, data explorers.

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

## Key Features

### Layout & Rendering

- **`useContentRect()` / `useScreenRect()`** — components query their own dimensions synchronously during render
- **Five-phase pipeline** with per-node dirty tracking — only changed nodes re-render
- **Pluggable layout** — [Flexx](https://github.com/beorn/flexx) (default, pure JS, 7KB) or Yoga (WASM)
- **Layout caching** — Flexx fingerprints nodes; unchanged subtrees skip recomputation entirely
- **Incremental terminal output** — buffer diff emits only changed cells, not full-screen repaints

### Components & Input

- **23 built-in components** — Box, Text, VirtualList, TextInput, ReadlineInput, TextArea, Link, Console, Table, SelectList, Image, and more
- **`overflow="scroll"`** with `scrollTo` — scrollable containers without manual virtualization ([Ink's #1 feature request](https://github.com/vadimdemedes/ink/issues/222) since 2019)
- **Input layer stack** — DOM-style event bubbling for modal dialogs and text input isolation
- **Focus system** — tree-based with scopes, spatial navigation, autoFocus, click-to-focus
- **Mouse support** (SGR protocol) — click, double-click, scroll, drag with DOM-style event props (`onClick`, `onWheel`, etc.)

![Scrollable task list with selection and priority badges](docs/images/task-list.png)

### Terminal Protocols

- **[Kitty keyboard](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)** — Cmd ⌘, Hyper ✦, key release events, auto-detect
- **Kitty graphics + Sixel** — inline images with auto-detection and text fallback
- **OSC 52 clipboard** — copy/paste that works across SSH sessions
- **DECSTBM scroll regions** — hardware-accelerated scrolling
- **Synchronized updates** (DEC 2026) — atomic screen painting, flicker-free in tmux/Zellij
- **Bracketed paste** — built-in with `usePaste` hook
- **Adaptive rendering** — `term.hasCursor()`, `term.hasColor()`, `term.hasInput()` for graceful degradation

### Developer Experience

- **Drop-in Ink replacement** — same Box, Text, useInput, useApp, Static, Spacer. [Migration guide](docs/guides/migration.md)
- **Plugin composition** — `withCommands`, `withKeybindings`, `withDiagnostics` (SlateJS-inspired)
- **Playwright-style testing** — `createRenderer`, `getByTestId`, `getByText`, `locator()`, `app.press()`
- **`withDiagnostics`** — incremental vs fresh render verification catches rendering regressions in CI
- **Theming** — `ThemeProvider` with semantic `$token` colors (dark/light built-in)
- **28+ unicode utilities** — grapheme splitting, display width, CJK/emoji support
- **AsyncIterable helpers** — merge, map, filter, throttle, debounce, batch

![Kanban board with cards, tags, and column navigation](docs/images/kanban.png)

## Architecture

Three runtime layers from low-level to high-level:

| Layer | Entry Point       | Style         | Best For                       |
| ----- | ----------------- | ------------- | ------------------------------ |
| 1     | `createRuntime()` | Elm-inspired  | Pure reducer + event stream    |
| 2     | `run()`           | React hooks   | Most apps (recommended)        |
| 3     | `createApp()`     | Zustand store | Complex apps with many sources |

Each wraps the one below. Layer 1 gives you a pure event loop with AsyncIterable — `reducer(state, event) → state`, `view(state) → JSX`, `schedule()` for async effects. Layer 2 adds React hooks. Layer 3 adds centralized state with a provider pattern.

The render target is pluggable via `RenderAdapter`. ~60% of inkx code (reconciler, layout, hooks) is target-independent.

| Target    | Status       | Use Case                      |
| --------- | ------------ | ----------------------------- |
| Terminal  | Production   | TUI apps (primary target)     |
| Canvas 2D | Experimental | Data viz, games, design tools |
| DOM       | Experimental | Accessibility, text selection |

## Trade-offs

inkx optimizes for interactive apps where parts of the UI update frequently. For workloads that re-render the entire component tree from scratch (not typical for interactive CLIs), Ink's simpler reconciliation is ~30x faster. inkx's five-phase pipeline is the cost of layout feedback — and the reason interactive updates are 122x faster. See [detailed comparison](docs/ink-comparison.md).

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

See [examples/index.md](examples/index.md) for descriptions.

## Documentation

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
| [Ink Comparison](docs/ink-comparison.md)          | Detailed feature and performance comparison    |
| [Migration](docs/guides/migration.md)             | Ink → inkx guide                               |
| [Troubleshooting](docs/troubleshooting.md)        | Common issues and debugging                    |

See [docs/README.md](docs/README.md) for the complete documentation index.

## Related Projects

| Project                                    | Role                                            |
| ------------------------------------------ | ----------------------------------------------- |
| [Ink](https://github.com/vadimdemedes/ink) | API compatibility target                        |
| [Flexx](https://github.com/beorn/flexx)    | Default layout engine (2.5x faster, 5x smaller) |
| [chalkx](https://github.com/beorn/chalkx)  | Terminal primitives (re-exported by inkx)       |
| [Yoga](https://yogalayout.dev/)            | Optional layout engine (WASM)                   |

## License

MIT
