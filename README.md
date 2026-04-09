# Silvery

**Polished Terminal UIs in React.**

Ink-compatible React renderer for terminals — same `Box`, `Text`, `useInput` API you know. Plus everything you wish Ink had.

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
- **Ink/Chalk compatible** — same component model, [`@silvery/ink`](https://github.com/beorn/silvery/tree/main/packages/ink) compatibility layer for migrating existing Ink applications

### Better

- **Smaller install** — <500 KB gzipped (Ink 6 pulls 16MB into node_modules)
- **Pure TypeScript, zero native deps** — no WASM, no build steps — works on Alpine, CI, Docker, everywhere
- **Incremental rendering** — per-node dirty tracking, [~100x faster interactive updates](tests/perf/render.bench.ts)
- **Responsive layout** — `useBoxRect()` returns actual dimensions synchronously during render
- **Dynamic scrollback** — renders (and re-renders!) into the terminal's scroll history, not just alternate screen
- **Scrollable containers** — `overflow="scroll"` with automatic measurement and clipping
- **Theme system** — 38 palettes, semantic design/color tokens (`$primary`, `$error`), auto-detects terminal colors
- **30+ components** — TextInput, TextArea, SelectList, ListView, Table, TreeView, Console, Tabs, CommandPalette, ModalDialog, Toast, and more
- **Focus system** — scoped focus, arrow-key directional nav, click-to-focus
- **Text selection** — mouse drag, word/line selection, `userSelect` boundaries, Alt+drag override. Works out of the box with `withDomEvents()`
- **Find** — `Ctrl+F` buffer search with match highlighting and `n`/`N` navigation. Works out of the box with `withFocus()`
- **Copy-mode** — `Esc, v` for vim-style keyboard-driven text selection and yanking
- **Drag-and-drop** — mouse drag with hit testing, automatic via `withDomEvents()`
- **Extremely composable** — use as just a renderer (`render`), add a runtime (`run`), or build full apps with any React state library (useState, Zustand, Jotai, Redux). Swap terminal backends (real TTY, headless, xterm.js emulator) for testing. Embed silvery components in existing CLIs. Use the layout engine standalone. Render to terminal, or (experimental) Canvas, or DOM
- **Most complete terminal protocol support** — 100+ escape sequences, all auto-negotiated: 12 OSC (hyperlinks, clipboard, palette, text sizing, semantic prompts, notifications), 35+ CSI (cursor, mouse modes, paste, focus, sync output, device queries), 50+ SGR (6 underline styles, underline colors, truecolor, 256-color), full Kitty keyboard (5 flags), full SGR mouse (any-event, drag, wheel)

## Packages

| Package                                                                     | Description                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`silvery`](https://github.com/beorn/silvery)                               | Components, hooks, renderer — the one package you need                   |
| [`@silvery/test`](https://github.com/beorn/silvery/tree/main/packages/test) | Testing utilities and locators                                           |
| [`@silvery/ink`](https://github.com/beorn/silvery/tree/main/packages/ink)   | Ink compatibility layer — migrate existing Ink apps with minimal changes |

## Ecosystem

| Project                                    | What                                                          |
| ------------------------------------------ | ------------------------------------------------------------- |
| [Termless](https://termless.dev)           | Headless terminal testing — like Playwright for terminal apps |
| [Flexily](https://beorn.github.io/flexily) | Pure JS flexbox layout engine (Yoga-compatible, zero WASM)    |
| [Loggily](https://beorn.github.io/loggily) | Debug + structured logging + tracing                          |
| [terminfo.dev](https://terminfo.dev)       | Terminal feature support database, powered by Termless        |

## Coming

- **Renderers** — Canvas 2D, Web DOM (experimental today, production later)
- **Frameworks** — Svelte, Solid.js, Vue adapters
- **@silvery/create** — Structured state management with commands, keybindings, effects-as-data

**Runtimes:** Bun >= 1.0 and Node.js >= 18. CLI (`silvery` command) requires Bun.

## License

MIT
