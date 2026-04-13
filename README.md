# Silvery — React for modern terminal apps

**Powerful apps. Polished UIs. Proudly terminal.**

- **[Ink-compatible](https://silvery.dev/guide/silvery-vs-ink#compatibility)** — same `Box`, `Text`, `useInput` API. Most code works with just an import change. 918/931 Ink 7.0 tests pass. Drop-in migration via [`@silvery/ink`](https://silvery.dev/guide/silvery-vs-ink)
- **React 18 + 19** — hooks, refs, effects, suspense — all works
- **Flexbox layout** — `Box` with `flexDirection`, `padding`, `gap`, `flexGrow`, just like Ink
- **3–27× faster** (typically 15–20×) than Ink in mounted rerender benchmarks

```console
$ npm install silvery react
```

```tsx
import { useState } from "react"
import { render, Box, Text, useInput } from "silvery"

function Counter() {
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
  })
  return (
    <Box borderStyle="round" padding={1}>
      <Text>Count: {count}</Text>
    </Box>
  )
}

await render(<Counter />).run()
```

### Shiny new stuff

- **[Best-in-class performance](https://silvery.dev/guide/silvery-vs-ink#performance-size)** — 3–27× faster (typically 15–20×) than Ink in mounted rerender benchmarks, 10–20× less terminal output. Cell-level dirty tracking, only changed cells emit. Per-node skip for unchanged subtrees. Works in inline mode with native scrollback, not just fullscreen
- **Pure TypeScript, zero native deps** — no WASM, no build steps. [Layout via Flexily](https://silvery.dev/guide/layout-engine) (or Yoga). Works on Alpine, CI, Docker, everywhere
- **[Web-like responsive layout](https://silvery.dev/guide/silvery-vs-ink#responsive-layout)** — `useBoxRect()` returns actual dimensions during render. No post-render measurement, no two-pass layout cycle. Enables:
  - [Scroll containers](https://silvery.dev/guide/scrolling) — `overflow="scroll"` with virtualization
  - [Sticky positioning](https://silvery.dev/guide/layout-coordinates) — `position="sticky"` for headers and footers
  - [ANSI-aware compositing](https://silvery.dev/guide/ansi-layering) — color blending with alpha across overlapping layers
- **[Inline, fullscreen, or both](https://silvery.dev/guide/runtime-layers)** — same components, one-line switch. All with incremental rendering:
  - [Fullscreen](https://silvery.dev/guide/runtime-getting-started) — alt screen, traditional TUI
  - [Inline with dynamic scrollback](https://silvery.dev/examples/scrollback) — live React zone at bottom, completed items graduate to terminal-owned scrollback. Native Cmd+F and text selection
  - [Virtual inline](https://silvery.dev/design/dynamic-scrollback) — alt screen + app-managed scrollback history, scrollable and searchable
- **[Web-like interaction](https://silvery.dev/guide/event-handling)** — full keyboard and mouse events that just work. Modifier keys, mouse buttons, and drag all combine seamlessly into a single event model. Enables:
  - [Focus scopes](https://silvery.dev/guide/silvery-vs-ink#focus-system) — spatial arrow-key nav, Tab/Escape, click-to-focus
  - [Text selection](https://silvery.dev/guide/text-selection) — mouse drag, word/line, `userSelect` boundaries, Alt+drag override
  - [Find](https://silvery.dev/guide/find) — `Ctrl+F` with match highlighting and `n`/`N` navigation
  - [Copy-mode](https://silvery.dev/guide/clipboard) — `Esc, v` for vim-style keyboard selection and yanking
  - [Drag-and-drop](https://silvery.dev/guide/event-handling) — mouse drag with hit testing
- **[Rich component library](https://silvery.dev/guides/components)** — 45+ components: TextInput, SelectList, ListView, Table, TreeView, Tabs, CommandPalette, ModalDialog, Toast, and more. Every component automatically participates in focus, mouse, and keybindings (readline, vim) — no wiring needed. [38 theme palettes](https://silvery.dev/guide/styling) with semantic tokens (`$primary`, `$error`) and auto-detected terminal colors
- **[Playwright-style testing](https://silvery.dev/guide/testing)** — 3,000+ tests. Full access to terminal internals (scrollback buffer, cursor position, cell styles, window dimensions):
  - `createRenderer` — fast unit tests with auto-refreshing CSS locators, cell-level color assertions, frame-by-frame inspection
  - [Termless](https://termless.dev) — like Playwright for terminals. Full ANSI fidelity with [10 swappable backends](https://termless.dev/guide/backends) (xterm.js, Ghostty, Alacritty, WezTerm, Kitty, and more)
  - [`SILVERY_STRICT`](https://silvery.dev/guide/debugging) — multi-level verification: buffer (incremental vs fresh), ANSI (internal parser), terminal (cross-backend), and accumulated replay
- **[Composable architecture](https://silvery.dev/guide/providers)** — every layer is independently swappable. [DI](https://silvery.dev/guide/providers) via `pipe()` providers:
  - [Layout](https://silvery.dev/guide/layout-engine) — Flexily or Yoga
  - [State](https://silvery.dev/guide/runtime-layers) — BYO (useState, Zustand, Jotai, Redux)
  - [Term](https://silvery.dev/guide/runtime-layers) — real, headless, emulator
  - [App](https://silvery.dev/guide/runtime-layers) — from stringify to rich app (withFocus, withDomEvents, withCommands). Render to terminal, Canvas, or DOM
- **[All modern terminal protocols](https://silvery.dev/guide/silvery-vs-ink#terminal-protocol-coverage)** — [60 years of terminal protocols](https://terminfo.dev/about), unified into clean APIs. 100+ escape sequences you'll never have to write — auto-negotiated and gracefully degraded: [Kitty keyboard](https://terminfo.dev) + [SGR mouse](https://terminfo.dev) become rich events with modifiers; [hyperlinks](https://terminfo.dev) are just props; [clipboard](https://terminfo.dev) is a function call. Truecolor, underline styles, synchronized output, bracketed paste, focus reporting, resize detection, inline images, and [more](https://silvery.dev/guide/silvery-vs-ink#terminal-protocol-coverage)

### Why Silvery?

Silvery grew out of building a complex terminal app — a multi-pane workspace with thousands of nodes. Components needed to know their size during render. Updates needed to be fast. Scroll containers, mouse events, focus scopes, and Playwright-style testing needed to just work. What started as a renderer grew into a layout engine, then 45+ components, theming, testing infrastructure, and eventually a framework.

Along the way, three principles emerged. Take the best from the web, stay true to the terminal, and raise the bar for developer ergonomics, architecture composability, and performance.

[The Silvery Way](https://silvery.dev/guide/the-silvery-way) · [Silvery vs Ink](https://silvery.dev/guide/silvery-vs-ink) · [About](https://silvery.dev/about)

### Next steps

- [Quick start](https://silvery.dev/getting-started/quick-start) — install, first app, deploy
- [Interactive examples](https://silvery.dev/examples) — `npx @silvery/examples` to try them locally
- [Silvery vs Ink](https://silvery.dev/guide/silvery-vs-ink) — feature comparison and migration guide

## Packages

| Package                           | Description                                                       |
| --------------------------------- | ----------------------------------------------------------------- |
| `silvery`                         | Components, hooks, renderer — the one package you need            |
| `@silvery/ink` / `@silvery/chalk` | Ink compatibility — 918/931 Ink 7.0 tests, 32/32 Chalk tests      |
| `@silvery/test`                   | Playwright-style testing — locators, `press()`, buffer assertions |
| `@silvery/create`                 | Composable app builder — `pipe()` providers                       |
| `@silvery/theme`                  | 38 palettes, semantic tokens, auto-detect                         |
| `@silvery/commander`              | **Beautiful CLIs for free** — help renders through Silvery itself |
| `@silvery/headless`               | Pure state machines — portable, no React                          |
| `@silvery/ansi`                   | Terminal primitives — styling, SGR, detection                     |

## Ecosystem

Standalone projects Silvery builds on — each stands on its own:

| Project                                | What                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------- |
| [Flexily](https://beorn.codes/flexily) | Pure JS flexbox layout engine (Yoga-compatible, 2.5× faster, zero WASM) |
| [Termless](https://termless.dev)       | Headless terminal testing — like Playwright for terminal apps           |
| [terminfo.dev](https://terminfo.dev)   | Terminal feature compatibility database (161 features, 19 terminals)    |
| [Loggily](https://loggily.dev)         | Structured logging + tracing + metrics                                  |

## Coming

- **Renderers** — Canvas 2D, Web DOM (experimental today, production later)
- **Frameworks** — Svelte, Solid.js, Vue adapters
- **@silvery/create** — Structured state management with commands, keybindings, effects-as-data

**Runtimes:** Bun >= 1.0 and Node.js >= 23.6. CLI (`silvery` command) requires Bun.

## Inspirations

Silvery builds on ideas from [Ink](https://github.com/vadimdemedes/ink) (React for terminals), [Ratatui](https://ratatui.rs/) (cell-level buffer model), [shadcn/ui](https://ui.shadcn.com/) (polished defaults, semantic theming), [SlateJS](https://www.slatejs.org/) (plugin composition, operations-as-data), [The Elm Architecture](https://guide.elm-lang.org/architecture/) / [BubbleTea](https://github.com/charmbracelet/bubbletea) (TEA state machines), the CSS/Web platform (flexbox, container queries, DOM events, focus scopes), [VS Code](https://code.visualstudio.com/) (command palette, keybindings), [Playwright](https://playwright.dev/) (locator-based testing), [ProseMirror](https://prosemirror.net/) (selection model), [Blessed](https://github.com/chjj/blessed) (rich terminal UIs in JS), and [Textual](https://textual.textualize.io/) (CSS-like terminal theming).

## License

MIT
