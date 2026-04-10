# Silvery — React for modern terminal apps

**Powerful apps. Polished UIs. Proudly terminal.**

Ink-compatible React renderer for interactive terminal apps. Same `Box`, `Text`, `useInput` API you know. 3–6× faster on mounted workloads.

> **Work in progress.** APIs may change. Feedback welcome.

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

### Familiar

- **React 18 + 19** — hooks, refs, effects, suspense — all works
- **Flexbox layout** — `Box` with `flexDirection`, `padding`, `gap`, `flexGrow`, just like Ink
- **Ink/Chalk compatible** — [`@silvery/ink`](https://silvery.dev/guide/silvery-vs-ink) and `@silvery/chalk` drop-in compat layers. 99% of Ink's + 100% of Chalk's test suites pass. See the [full feature comparison](https://silvery.dev/guide/silvery-vs-ink)

### Shiny new stuff

- **[3–6× faster incremental rendering](https://silvery.dev/guide/silvery-vs-ink#performance-size)** — cell-level dirty tracking, only changed cells emit to the terminal. Per-node skip for unchanged subtrees. Works in inline mode with native scrollback, not just fullscreen
- **[Layout-first rendering](https://silvery.dev/guide/silvery-vs-ink#responsive-layout)** — `useBoxRect()` returns actual dimensions during render. No post-render measurement, no two-pass layout cycle. Enables `overflow="scroll"`, `position="sticky"`, and ANSI-aware compositing with color blending
- **[Dynamic scrollback](https://silvery.dev/examples/scrollback)** — live React zone at the bottom, completed items graduate to terminal-owned scrollback. Cmd+F and text selection work natively. Inline mode gets fullscreen-level performance; fullscreen mode gets inline-level UX (app-managed scrollback). No hard split between the two
- **Pure TypeScript, zero native deps** — no WASM, no build steps. Works on Alpine, CI, Docker, everywhere
- **[Ink-compatible](https://silvery.dev/guide/silvery-vs-ink#compatibility)** — 918/931 Ink 7.0 tests pass on silvery's compat layer. Drop-in migration via [`@silvery/ink`](https://silvery.dev/guide/silvery-vs-ink). See the [full feature comparison](https://silvery.dev/guide/silvery-vs-ink)
- **[Theme system](https://silvery.dev/guide/styling)** — 38 palettes, semantic design/color tokens (`$primary`, `$error`), auto-detects terminal colors
- **[45+ components](https://silvery.dev/guides/components)** — TextInput, TextArea, SelectList, ListView, Table, TreeView, Console, Tabs, CommandPalette, ModalDialog, Toast, and more
- **[Focus system](https://silvery.dev/guide/silvery-vs-ink#focus-system)** — scoped focus, arrow-key directional nav, click-to-focus
- **Text selection** — mouse drag, word/line selection, `userSelect` boundaries, Alt+drag override. Works out of the box with `withDomEvents()`
- **Find** — `Ctrl+F` buffer search with match highlighting and `n`/`N` navigation. Works out of the box with `withFocus()`
- **Copy-mode** — `Esc, v` for vim-style keyboard-driven text selection and yanking
- **Drag-and-drop** — mouse drag with hit testing, automatic via `withDomEvents()`
- **Extremely composable** — use as just a renderer (`render`), add a runtime (`run`), or build full apps with any React state library (useState, Zustand, Jotai, Redux). Swap terminal backends (real TTY, headless, xterm.js emulator) for [testing](https://silvery.dev/guide/testing). Embed silvery components in existing CLIs. Use the layout engine standalone. Render to terminal, or (experimental) Canvas, or DOM
- **[Terminal protocol support](https://silvery.dev/guide/silvery-vs-ink#terminal-protocol-coverage)** — 100+ escape sequences, all auto-negotiated: 12 OSC (hyperlinks, clipboard, palette, text sizing, semantic prompts, notifications), 35+ CSI (cursor, mouse modes, paste, focus, sync output, device queries), 50+ SGR (6 underline styles, underline colors, truecolor, 256-color), full Kitty keyboard (5 flags), full SGR mouse (any-event, drag, wheel)

### Why Silvery?

Silvery grew out of building a complex terminal app — a multi-pane workspace with thousands of nodes. Components needed to know their size during render. Updates needed to be fast. Scroll containers, mouse events, focus scopes, and Playwright-style testing needed to just work. What started as a renderer grew into a layout engine, then 45+ components, theming, testing infrastructure, and eventually a framework.

Along the way, three principles emerged. Take the best from the web, stay true to the terminal, and raise the bar for developer ergonomics, architecture composability, and performance.

[The Silvery Way](https://silvery.dev/guide/the-silvery-way) · [Silvery vs Ink](https://silvery.dev/guide/silvery-vs-ink) · [About](https://silvery.dev/about)

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
| [Loggily](https://beorn.codes/loggily) | Structured logging + tracing + metrics                                  |

## Coming

- **Renderers** — Canvas 2D, Web DOM (experimental today, production later)
- **Frameworks** — Svelte, Solid.js, Vue adapters
- **@silvery/create** — Structured state management with commands, keybindings, effects-as-data

**Runtimes:** Bun >= 1.0 and Node.js >= 18. CLI (`silvery` command) requires Bun.

## Inspirations

Silvery builds on ideas from [Ink](https://github.com/vadimdemedes/ink) (React for terminals), [Ratatui](https://ratatui.rs/) (cell-level buffer model), [SlateJS](https://www.slatejs.org/) (plugin composition, operations-as-data), [The Elm Architecture](https://guide.elm-lang.org/architecture/) / [BubbleTea](https://github.com/charmbracelet/bubbletea) (TEA state machines), the CSS/Web platform (flexbox, container queries, DOM events, focus scopes), [VS Code](https://code.visualstudio.com/) (command palette, keybindings), [Playwright](https://playwright.dev/) (locator-based testing), [ProseMirror](https://prosemirror.net/) (selection model), [Blessed](https://github.com/chjj/blessed) (rich terminal UIs in JS), and [Textual](https://textual.textualize.io/) (CSS-like terminal theming).

## License

MIT
