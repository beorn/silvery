# Silvery

**Polished Terminal UIs in React.**

Ink-compatible React renderer for terminals — same `Box`, `Text`, `useInput` API you know. Plus everything you wish Ink had.

> **Note:** Under active development. APIs may change. Feedback welcome.

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
- **Ink/Chalk compatible** — same component model, `@silvery/ink` compatibility layer for migration

### Better

- **Smaller install** — ~177 KB gzipped all included (Ink 6 pulls 16MB into node_modules)
- **Pure TypeScript, zero native deps** — no WASM, no build steps — works on Alpine, CI, Docker, everywhere
- **Incremental rendering** — per-node dirty tracking, [~100x faster interactive updates](tests/perf/render.bench.ts)
- **Responsive layout** — `useContentRect()` returns actual dimensions synchronously during render
- **Dynamic scrollback** — renders into the terminal's scroll history, not just alternate screen
- **Scrollable containers** — `overflow="scroll"` with automatic measurement and clipping
- **Theme system** — 38 palettes, semantic design/color tokens (`$primary`, `$error`), auto-detects terminal colors
- **30+ components** — TextInput, TextArea, SelectList, VirtualList, Table, Tabs, CommandPalette, ModalDialog, Toast, and more
- **Focus system** — scoped focus, arrow-key directional nav, click-to-focus
- **Most complete terminal protocol support** — Kitty keyboard (all 5 flags), SGR mouse (any-event + drag + wheel), bracketed paste, focus reporting, OSC 8 hyperlinks, OSC 52 clipboard, OSC 4/10/11 palette and theme detection, OSC 66 text sizing, OSC 133 semantic prompts, synchronized output, extended underlines (curly, dotted, dashed), underline colors, cursor shapes, device attribute queries — all auto-negotiated

## Packages

| Package         | Description                                                                                |
| --------------- | ------------------------------------------------------------------------------------------ |
| `silvery`       | Components, hooks, renderer — the one package you need                                     |
| `@silvery/test` | Testing utilities and locators                                                             |
| `@silvery/ink`  | Ink compatibility layer                                                                    |
| `@silvery/tea`  | Optional [TEA](https://guide.elm-lang.org/architecture/) state management for complex apps |

## Ecosystem

| Project                                    | What                                                          |
| ------------------------------------------ | ------------------------------------------------------------- |
| [Termless](https://termless.dev)           | Headless terminal testing — like Playwright for terminal apps |
| [Flexily](https://beorn.github.io/flexily) | Pure JS flexbox layout engine (Yoga-compatible, zero WASM)    |
| [Loggily](https://beorn.github.io/loggily) | Debug + structured logging + tracing                          |

## Coming

- **Renderers** — Canvas 2D, Web DOM (experimental today, production later)
- **Frameworks** — Svelte, Solid.js, Vue adapters
- **@silvery/tea** — Structured state management with commands, keybindings, effects-as-data

**Runtimes:** Bun >= 1.0 and Node.js >= 18. CLI (`silvery` command) requires Bun.

## License

MIT
