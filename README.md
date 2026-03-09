# Silvery

**Polished terminal UIs in React.**

Silvery is a React framework for building terminal applications — reconciler, layout engine, components, theming, and state management in one cohesive package. It builds on the foundation that [Ink](https://github.com/vadimdemedes/ink) and [Chalk](https://github.com/chalk/chalk) established, taking React-based terminal UIs further with faster rendering, more components, and capabilities that weren't possible before.

If you know Ink, you already know Silvery — the core API (`Box`, `Text`, `useInput`, `render`) is intentionally familiar. Silvery also ships `silvery/ink` and `silvery/chalk` compatibility layers for zero-effort migration of existing apps.

## What's new

### Fast incremental rendering

Per-node dirty tracking with 7 independent flags. Only changed nodes re-render — 28-192x fewer bytes on typical incremental updates.

### Layout feedback

Components query their own dimensions with `useContentRect()`. No width prop drilling needed.

```tsx
function Responsive() {
  const { width } = useContentRect()
  return width > 60 ? <FullLayout /> : <CompactLayout />
}
```

### Scrollable containers

`overflow="scroll"` with `scrollTo()` just works. No manual virtualization.

```tsx
<Box height={10} overflow="scroll">
  {items.map((item) => (
    <Text key={item.id}>{item.name}</Text>
  ))}
</Box>
```

### Modern terminal protocols

Kitty keyboard, SGR mouse, images (sixel + kitty), clipboard, hyperlinks, synchronized updates, cursor styles — all built-in, all auto-detected.

### 23+ components

Box, Text, VirtualList, TextArea, SelectList, Table, Image, Spinner, ProgressBar, and more. Plus a complete theming system with 45 built-in color palettes.

### [TEA](https://guide.elm-lang.org/architecture/) state machines (optional)

[The Elm Architecture](https://guide.elm-lang.org/architecture/) (TEA) models UI as pure `(action, state) -> [state, effects]` functions — making components testable, replayable, and easy to reason about. Use alongside standard React hooks, or mix both in the same app.

### Built for AI agents

Command introspection, programmatic screenshots, scrollable streaming output. Ship a `CLAUDE.md` with your CLI and let AI operate it.

## Packages

| Package                              | Description                                        |
| ------------------------------------ | -------------------------------------------------- |
| [`silvery`](packages/)               | Umbrella package (re-exports all `@silvery/*`)     |
| [`@silvery/react`](packages/react)   | Core React reconciler and hooks                    |
| [`@silvery/term`](packages/term)     | Terminal rendering target                          |
| [`@silvery/ansi`](packages/ansi)     | ANSI styling (chalk replacement)                   |
| [`@silvery/theme`](packages/theme)   | Theming with 45 built-in palettes                  |
| [`@silvery/tea`](packages/tea)       | TEA state machine store                            |
| [`@silvery/ui`](packages/ui)         | Component library (23+ components)                 |
| [`@silvery/compat`](packages/compat) | Ink/Chalk compatibility layers (drop-in migration) |
| [`@silvery/test`](packages/test)     | Testing utilities                                  |

## Quick start

```bash
npm install silvery react
```

```tsx
import { run, Box, Text, useInput } from "silvery"

function App() {
  const [count, setCount] = useState(0)

  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "q") return "exit"
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Silvery Counter</Text>
      <Text>Count: {count}</Text>
      <Text dimColor>j = increment, q = quit</Text>
    </Box>
  )
}

await run(<App />)
```

## Ecosystem

Silvery is part of a family of terminal-focused libraries:

| Project                                    | What                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| [termless](https://termless.dev)           | Headless terminal testing — like Playwright for terminal apps           |
| [flexily](https://beorn.github.io/flexily) | Pure JS flexbox layout engine — Yoga-compatible, 2.5x faster, zero WASM |
| [loggily](https://beorn.github.io/loggily) | Debug + structured logging + tracing in one library                     |

## Vision

Silvery starts with the terminal but aims further. The architecture separates rendering targets from the component model, opening the door to Canvas, DOM, and other backends — same React components, different outputs. See the [roadmap](docs/roadmap.md) for what's ahead.

## Documentation

Full docs at [silvery.dev](https://silvery.dev) — getting started guide, API reference, examples, migration guide from Ink.

## Development

```bash
bun install
bun test
bun run lint
```

## License

MIT
