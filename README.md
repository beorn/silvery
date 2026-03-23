# Silvery

**Polished Terminal UIs in React.**

Responsive layouts, scrollable containers, 100x+ faster incremental updates, and full support for modern terminal capabilities. 30+ components from TextInput to VirtualList. Pure TypeScript, no WASM.

```
npm install silvery react
```

> **Status:** Alpha — under active development. APIs may change. Early adopters and feedback welcome.

**Runtimes:** Bun >= 1.0 and Node.js >= 18. CLI (`silvery` command) requires Bun.

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

## What You Get

- **30+ components** — TextInput, TextArea, SelectList, VirtualList, Table, Tabs, CommandPalette, ModalDialog, SplitView, Toast, and more. All with keyboard navigation, focus, and scrolling built in.
- **Responsive layout** — `useContentRect()` returns actual dimensions synchronously. Components adapt to their space immediately.
- **Scrollable containers** — `overflow="scroll"` with automatic measurement and clipping. No manual virtualization.
- **Theme system** — 38 palettes with semantic tokens (`$primary`, `$error`, `$border`). Auto-detects your terminal's colors.
- **Focus navigation** — scoped focus, arrow-key directional movement, click-to-focus, `useFocusWithin`.
- **Mouse support** — full SGR protocol with `onClick`, `onMouseDown`, `onWheel`, hit testing, drag.
- **Per-node incremental rendering** — only changed nodes update. ~170us for interactive updates in a 1000-node tree.
- **Zero native dependencies** — pure JS layout engine ([Flexily](https://beorn.github.io/flexily)), no yoga binary, no WASM. Works everywhere.

## Compared to Ink

[Ink](https://github.com/vadimdemedes/ink) pioneered React in the terminal and remains a great choice for many apps. Silvery builds on that foundation with additional capabilities for complex interactive UIs — focus management, scrollable containers, mouse support, text editing, virtual lists, theming, and incremental rendering.

If you're already using Ink, `silvery/ink` provides a compatibility layer for gradual migration.

## Packages

| Package | Description |
|---|---|
| `silvery` | Components, hooks, renderer — the one package you need |
| `@silvery/tea` | Optional [TEA](https://guide.elm-lang.org/architecture/) state management for complex apps |
| `@silvery/test` | Testing utilities and locators |
| `@silvery/compat` | Ink/Chalk compatibility layers |

## Ecosystem

| Project | What |
|---|---|
| [Termless](https://termless.dev) | Headless terminal testing — like Playwright for terminal apps |
| [Flexily](https://beorn.github.io/flexily) | Pure JS flexbox layout engine (Yoga-compatible, zero WASM) |
| [Loggily](https://beorn.github.io/loggily) | Debug + structured logging + tracing |

## License

MIT
