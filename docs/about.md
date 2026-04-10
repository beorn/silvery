---
title: About Silvery
description: "About Silvery — a React TUI framework for modern terminal applications. Origin story, technical approach, and ecosystem."
---

# About Silvery

Polished terminal apps in React. 45+ components, layout-first rendering, broad terminal protocol support. Pure TypeScript, no WASM. Runs on Bun and Node.js (23.6+).

## How It Started

I was building a terminal application — a multi-pane workspace with a kanban-style board, thousands of nodes, and keyboard-driven navigation. I started with [Ink](https://github.com/vadimdemedes/ink), which is a great project and the right choice for most terminal apps.

I ran into two problems I couldn't work around:

**Components can't know their size during render.** In Ink, React renders first, then Yoga calculates layout. So when your component runs, it doesn't know how wide its container is. Ink 7.0 added `useBoxMetrics()`, which provides dimensions after the first layout via `useEffect` — but the first render still sees `{width: 0, height: 0}`, and nested responsive components each need their own measure→rerender cycle.

**Every update re-reconciles the entire tree.** When a user moves a cursor in a 1000-node tree, Ink re-runs React reconciliation and Yoga layout for the full tree. Ink 7.0 added line-level incremental output, but the React and layout passes still walk everything. For my application, that took about 20 milliseconds per keypress — noticeable at 60fps.

I needed layout to run _before_ rendering (so components could access their dimensions), and per-node dirty tracking (so only changed nodes would re-render). That required a different rendering pipeline, which meant building a new renderer.

What started as fixing two Ink limitations grew into something much broader — a complete terminal UI framework with its own layout engine, 45+ components, theming, terminal protocol negotiation, state machines, and testing infrastructure. The renderer and incremental rendering were the starting point, but they're a small part of what Silvery is today.

## How It Grew

The renderer needed a layout engine. I started with a two-phase layout based on Yoga, but questioned whether the WASM tax was worth paying — the async initialization, the binary blob, the separate memory heap. So I built [Flexily](https://beorn.codes/flexily), a pure-TypeScript flexbox engine that follows the W3C spec. It turned out to be 2.5× faster than Yoga WASM, with zero native dependencies.

Testing the renderer meant testing against real terminals. I missed Playwright — the confidence you get from running your app in a real browser and asserting on what the user sees. So I built [Termless](https://termless.dev), which runs your terminal app through real parser backends (xterm.js, vt100, Ghostty, Kitty, Alacritty, and more) in-process. Playwright-style testing for the terminal.

But there was a surprising lack of information about what terminals actually support. Which ones handle Kitty keyboard? OSC 52 clipboard? Sixel graphics? The answers were scattered across source code, GitHub issues, and trial-and-error. So I built [terminfo.dev](https://terminfo.dev) — an empirical compatibility database covering 161 features across 19 terminals, all probed via Termless.

Inside Silvery itself, the same pattern repeated. The framework needed a theme system that auto-detects terminal colors and adjusts for contrast — that became [@silvery/theme](https://silvery.dev/themes) with 38 palettes and semantic tokens. It needed built-in testing utilities — that became [@silvery/test](https://silvery.dev/examples/testing) with Playwright-style locators and `press()` simulation. CLI apps needed beautiful help text — that became [@silvery/commander](https://silvery.dev/reference/commander), which renders its help through Silvery itself.

It's a little addictive, owning the entire pipeline. Each piece you build reveals the next opportunity. And there are a lot of opportunities that have come — and will come — out of having every layer work together.

Along the way, three principles emerged. Take the best from the web, stay true to the terminal, and raise the bar for developer ergonomics, architecture composability, and performance.

## How It Works

**Layout first, then render.** Silvery inverts the pipeline: [Flexily](https://beorn.codes/flexily) (a Yoga-compatible layout engine) calculates positions and sizes, then React renders components with their actual content box available via `useBoxRect()`:

```tsx
function IssueCard({ issue }: { issue: Issue }) {
  const { width } = useBoxRect()
  return width >= 32 ? <FullCard issue={issue} /> : <CompactCard issue={issue} />
}
```

Because width is known during render, this works on the first paint — no prop drilling, no measurement pass, no `width: 0` flash. The same mechanism makes `overflow="scroll"` and automatic text truncation possible.

**Incremental rendering.** Each node tracks dirty state independently. A typical interactive update — cursor move in a 1000-node tree — takes 169 microseconds. The [benchmark comparison](/guide/silvery-vs-ink#performance) has the full numbers and methodology.

**Pure TypeScript.** The entire stack, including the layout engine, is TypeScript with no native dependencies. No WASM heap to manage, no platform-specific binaries, no C++ build step.

**[The Silvery Way](/guide/the-silvery-way).** Ten design principles for building terminal apps with Silvery. The short version: use the high-level components (SelectList, TextInput, VirtualList), use semantic theme tokens (`$primary`, `$muted`), and let the framework handle focus management, key bindings, and scrolling.

## Ecosystem

All MIT-licensed, all part of the same development effort.

### Packages

| Package                           | Description                                                              |
| --------------------------------- | ------------------------------------------------------------------------ |
| `silvery`                         | Components, hooks, renderer — the one package you need                   |
| `@silvery/ink` / `@silvery/chalk` | Ink compatibility — 99% of Ink 7.0 tests, 100% of Chalk tests            |
| `@silvery/test`                   | Playwright-style testing — locators, `press()`, buffer assertions        |
| `@silvery/create`                 | Composable app builder — `pipe()` providers _(under active development)_ |
| `@silvery/theme`                  | 38 palettes, semantic tokens (`$primary`, `$muted`), auto-detect         |
| `@silvery/commander`              | **Beautiful CLIs for free** — help renders through Silvery itself        |
| `@silvery/headless`               | Pure state machines — portable, embeddable, no React                     |
| `@silvery/ansi`                   | Terminal primitives — styling, SGR, truecolor, detection                 |

### Standalone projects

Each stands on its own — Silvery builds on them, but they work independently:

- **[Flexily](https://beorn.codes/flexily)** — Pure-TypeScript flexbox layout engine, Yoga-compatible, W3C spec. 2.5× faster than Yoga WASM, zero native dependencies.
- **[Termless](https://termless.dev)** — Headless terminal testing against 10+ real parser backends. Like Playwright for terminal apps.
- **[terminfo.dev](https://terminfo.dev)** — Terminal feature compatibility database. 161 features × 19 terminals, empirically probed via Termless.
- **[Loggily](https://beorn.codes/loggily)** — Structured logging + span tracing + metrics in one library. Zero dependencies.

## Numbers

- 45+ components — Box, Text, SelectList, VirtualList, CommandPalette, TreeView, Table, Form, and more
- 23 color palettes with semantic tokens and WCAG-aware contrast
- [~99% of Ink 7.0's test suite (918/931)](/guide/silvery-vs-ink#compatibility) passes via the compatibility layer
- Runs on Bun and Node.js 23.6+

Silvery is a good fit for interactive, keyboard-heavy terminal apps with large or responsive UIs. For simpler CLIs, output-only tools, or apps that rebuild the full screen on every update, [Ink](https://github.com/vadimdemedes/ink) is a solid choice with a bigger ecosystem. If you don't want React or TypeScript, frameworks in Go, Python, and Rust may be a better fit.

## Inspirations

Silvery stands on the shoulders of many great projects:

- **[Ink](https://github.com/vadimdemedes/ink)** — defined React for terminals. Silvery's API is intentionally Ink-compatible.
- **[Chalk](https://github.com/chalk/chalk)** — terminal string styling. Silvery includes a full Chalk compat layer (100% test pass).
- **[Ratatui](https://ratatui.rs/)** — the cell-level buffer model and immediate-mode rendering approach.
- **[SlateJS](https://www.slatejs.org/)** — plugin composition via `pipe()`, operations-as-data, middleware transforms.
- **[The Elm Architecture](https://guide.elm-lang.org/architecture/) / [BubbleTea](https://github.com/charmbracelet/bubbletea)** — TEA state machines: `(action, state) → [state, effects]`.
- **CSS/Web platform** — flexbox layout, container queries (`useBoxRect`), DOM-style events, focus scopes, `overflow: scroll`, `position: sticky`.
- **[VS Code](https://code.visualstudio.com/)** — command palette, keybinding system with when-predicates.
- **[Playwright](https://playwright.dev/)** — locator-based testing API (`getByText`, `press()`).
- **[ProseMirror](https://prosemirror.net/)** — selection model and state machine approach to editing.
- **[Pretext](https://chenglou.me/pretext/)** — text layout beyond CSS. Inspired Silvery's text layout algorithms (snug-content, balanced, optimal wrapping).
- **[Blessed](https://github.com/chjj/blessed)** — proved rich terminal UIs are possible in JavaScript.
- **[Textual](https://textual.textualize.io/)** — CSS-like theming and widget library for terminals.

See also: [Silvery vs Ink](/guide/silvery-vs-ink), [Silvery vs BubbleTea](/guide/silvery-vs-bubbletea), [Silvery vs Textual](/guide/silvery-vs-textual), [Silvery vs Blessed](/guide/silvery-vs-blessed).

## Author

[Bjørn Stabell](https://beorn.codes) — entrepreneur and technologist based in the SF Bay Area. Building companies and developer tools since 2000.

Currently building AI products for knowledge work, and open-source infrastructure for the terminal ecosystem: [Silvery](https://silvery.dev), [terminfo.dev](https://terminfo.dev), [Termless](https://termless.dev), [Flexily](https://beorn.codes/flexily), and [Loggily](https://beorn.codes/loggily).

[beorn.codes](https://beorn.codes) · [GitHub](https://github.com/beorn) · [LinkedIn](https://linkedin.com/in/beorn) · [X](https://x.com/beorn)
