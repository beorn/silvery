# silvery

**The shiny new renderer** — polished terminal UIs in React.

Silvery is a drop-in replacement for [Ink](https://github.com/vadimdemedes/ink) and [Chalk](https://github.com/chalk/chalk) that's dramatically faster, has more features, and fixes long-standing limitations. If you're building terminal UIs with React, silvery gives you everything Ink promised — and delivers.

## Why silvery?

### Drop-in Ink/Chalk replacement

Migrate incrementally. `silvery/ink` and `silvery/chalk` are compatibility layers that let you switch with minimal changes, then adopt new features at your own pace.

```bash
# Before
bun add ink chalk
# After
bun add silvery react
```

```tsx
// Compatibility imports (works immediately)
import { render, Box, Text } from "silvery/ink"
import chalk from "silvery/chalk"

// Or use silvery directly
import { run, Box, Text } from "silvery"
```

### 100x+ faster incremental renders

Per-node dirty tracking with 7 independent flags. Only changed nodes re-render. On typical UIs, silvery produces 28-192x fewer bytes than a full re-render.

### Layout feedback (Ink's #1 missing feature)

Components can query their own dimensions with `useContentRect()`. No width prop drilling. This was Ink's oldest open issue (2016) — silvery solves it.

```tsx
function Responsive() {
  const { width } = useContentRect()
  return width > 60 ? <FullLayout /> : <CompactLayout />
}
```

### Scrollable containers (Ink's #1 feature request)

`overflow="scroll"` with `scrollTo()` just works. No manual virtualization needed. Ink users have requested this since 2019.

```tsx
<Box height={10} overflow="scroll">
  {items.map(item => <Text key={item.id}>{item.name}</Text>)}
</Box>
```

### Every terminal protocol

Kitty keyboard, SGR mouse, images (sixel + kitty), clipboard, hyperlinks, synchronized updates, cursor styles — all built-in, all auto-detected.

### 23+ components

Box, Text, VirtualList, TextArea, SelectList, Table, Image, Spinner, ProgressBar, and more. Plus a complete theming system with 45 built-in color palettes.

### TEA state machines (optional)

For complex interactive UIs, silvery includes Elm-style `(action, state) -> [state, effects]` reducers alongside standard React hooks. Choose the right paradigm per component — or mix them.

### Built for AI agents

Command introspection for AI agents, programmatic screenshots, scrollable streaming output. Ship a `CLAUDE.md` with your CLI and let AI operate it.

## Packages

| Package | Description |
| --- | --- |
| [`silvery`](packages/) | Umbrella package (re-exports all `@silvery/*`) |
| [`@silvery/react`](packages/react) | Core React reconciler and hooks |
| [`@silvery/term`](packages/term) | Terminal rendering target |
| [`@silvery/ansi`](packages/ansi) | ANSI styling (chalk replacement) |
| [`@silvery/theme`](packages/theme) | Theming with 45 built-in palettes |
| [`@silvery/tea`](packages/tea) | TEA state machine store |
| [`@silvery/ui`](packages/ui) | Component library (23+ components) |
| [`@silvery/compat`](packages/compat) | Ink/Chalk compatibility layers (drop-in migration) |
| [`@silvery/test`](packages/test) | Testing utilities |

## Quick start

```bash
bun add silvery react
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
