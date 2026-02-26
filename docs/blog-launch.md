# inkx: React Terminal UIs Where Components Know Their Size

React components have never been able to know their own dimensions during render. In the DOM, you reach for `ResizeObserver` and accept a layout jank flash. In React Native, you guess at `FlatList` item heights and hope the scroll doesn't stutter. In terminal UIs built with [Ink](https://github.com/vadimdemedes/ink), you thread `width` props through every level of the component tree.

inkx takes a different approach. It runs layout _before_ content rendering, so components access their actual dimensions synchronously via a hook:

```tsx
function Card() {
  const { width, height } = useContentRect()
  return <Text>{truncate(title, width - 2)}</Text>
}
```

No prop drilling. No second render pass. No guessing.

This is the same insight behind [WPF's Measure/Arrange](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/layout) (2006), [CSS Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries) (2022), and Facebook's [Litho/ComponentKit](https://github.com/facebook/litho) (which yielded 35% scroll performance gains in the Facebook app). inkx brings two-phase rendering to React with a five-phase pipeline: reconcile, measure, layout, content, output.

## Why this matters for AI tool builders

If you're building a CLI assistant, an AI coding tool, or any terminal application that works with an LLM, you've probably hit two problems:

1. **Variable-length AI output** -- LLM responses range from a single line to hundreds of lines. You need scrollable containers that adapt to available space, not fixed-height viewports with manual virtualization.

2. **Programmatic control** -- An AI agent needs to read the screen, discover available commands, and execute them. Most terminal UI frameworks treat this as an afterthought.

inkx was designed with both of these as first-class concerns.

### Scrollable containers that just work

Ink's most-requested feature since 2019 ([#222](https://github.com/vadimdemedes/ink/issues/222)) is scrolling. Without layout feedback, you can't know how much content fits -- so you end up estimating heights, manually virtualizing, and passing width down through every component.

In inkx, scrolling is a style property:

```tsx
<Box overflow="scroll" scrollTo={selectedIdx}>
  {messages.map((msg) => (
    <Message key={msg.id} content={msg.content} />
  ))}
</Box>
```

Each `Message` component can call `useContentRect()` to know exactly how wide it is and truncate or wrap accordingly. The framework handles overflow measurement, scroll position, and viewport clipping. No height estimation required.

For streaming AI output, the `scrollback` rendering mode freezes completed items into terminal scrollback while keeping the active UI compact:

```tsx
const frozenCount = useScrollback(items, {
  frozen: (item) => item.complete,
  render: (item) => `  done: ${item.title}`,
})

<VirtualList items={items} virtualized={(item) => item.complete} ... />
```

### A command system built for AI introspection

inkx includes a plugin composition system inspired by SlateJS. The `withCommands` plugin adds a `cmd` object that exposes every command with its metadata:

```tsx
const app = withCommands(render(<Board />), {
  registry: commandRegistry,
  getContext: () => buildCommandContext(state),
  handleAction: (action) => dispatch(action),
  getKeybindings: () => keybindings,
})

// An AI agent can discover all available commands
app.cmd.all()
// [
//   { id: "cursor_down", name: "Move Down", keys: ["j", "ArrowDown"] },
//   { id: "cursor_up", name: "Move Up", keys: ["k", "ArrowUp"] },
//   { id: "toggle_done", name: "Toggle Done", keys: ["x"] },
//   ...
// ]

// Execute commands by name
await app.cmd.down()
await app.cmd["cursor_down"]()

// Read the full app state
app.getState()
// { screen: "...", commands: [...], focus: { id: "task-3", text: "Write docs" } }
```

This means an LLM doesn't need to guess at ANSI escape sequences or simulate raw keystrokes. It calls `cmd.all()` to see what's possible, `getState()` to read the screen, and `cmd.down()` to act. The command system handles keybinding resolution, context predicates, and action dispatch.

The `withKeybindings` plugin routes key presses through the same system:

```tsx
const app = withKeybindings(withCommands(render(<Board />), cmdOpts), {
  bindings: defaultKeybindings,
  getKeyContext: () => ({ mode: "normal", hasSelection: false }),
})

// Press 'j' -> resolves to cursor_down -> executes
await app.press("j")
```

And `withDiagnostics` adds automated invariant checking after every command -- incremental vs. fresh render comparison, cursor stability verification, ANSI replay correctness:

```tsx
const driver = withDiagnostics(app, {
  checkIncremental: true,
  checkStability: true,
  captureOnFailure: true,
})

// Every command now verifies rendering correctness automatically
await driver.cmd.down() // Throws with screenshot path if any check fails
```

### CLAUDE.md as the AI-readable API reference

inkx ships with a [CLAUDE.md](https://github.com/beorn/inkx/blob/main/CLAUDE.md) -- a structured reference document designed for LLM consumption. It contains the complete API surface (imports, component props, hook signatures, common patterns, anti-patterns) in a format that Claude Code, Cursor, and other AI coding tools can ingest directly.

This isn't documentation written for humans and then fed to an AI. It's a parallel artifact: the same API, organized for how LLMs read code. Quick start, import paths, testing API, debugging flags -- all in one file, optimized for context window efficiency.

When an AI assistant works on an inkx codebase, it reads `CLAUDE.md` and immediately knows:

- How to import components (`import { Box, Text } from "inkx"`)
- How to write tests (`createRenderer` + Playwright-style locators)
- What patterns to avoid (mixing chalk backgrounds with Box backgroundColor)
- How to debug issues (`INKX_STRICT=1`, `DEBUG=inkx:*`)

## The five-phase pipeline

Here's what happens when your component renders:

```
Phase 0: RECONCILIATION
  React builds the component tree. Components register content
  callbacks -- they don't produce output yet.

Phase 1: MEASURE
  Nodes with intrinsic sizing (fit-content) get measured.

Phase 2: LAYOUT
  The layout engine (Flexx or Yoga) computes positions and
  dimensions for every node. useContentRect() subscribers
  receive their values.

Phase 3: CONTENT RENDER
  Now components render their actual content, with real
  dimensions available synchronously via hooks.

Phase 4: DIFF & OUTPUT
  Buffer comparison against the previous frame. Only changed
  cells emit ANSI sequences.
```

The key insight: layout calculation is fast (~57us for a 50-node kanban board). Content rendering is where the time goes. By computing layout first, components render exactly the right content on the first pass.

## Performance

Real numbers on Apple M1 Max, Bun 1.3.9 (February 2026). Reproducible via `bun run bench:compare`. See [performance.md](deep-dives/performance.md) for current numbers and the full optimization catalog.

> Performance numbers in this post are from launch benchmarks (January 2025). Numbers have been updated to reflect the February 2026 benchmark run.

**The number that matters -- typical interactive update:**

| Scenario                        | inkx       | Ink     |                       |
| ------------------------------- | ---------- | ------- | --------------------- |
| User presses a key (1000 nodes) | **169 us** | 20.7 ms | **inkx 200x+ faster** |

When a user presses `j` to move a cursor, inkx's dirty tracking updates only the changed nodes -- bypassing React entirely. Ink must re-render the full React tree for any state change.

**Full pipeline (cold render):**

| Components   | inkx (Flexx) | Ink (Yoga NAPI) |                  |
| ------------ | ------------ | --------------- | ---------------- |
| 1 Box+Text   | 165 us       | 271 us          | inkx 1.6x faster |
| 100 Box+Text | 45.0 ms      | 49.4 ms         | inkx 1.1x faster |

**Layout engine (pure layout, no React):**

| Benchmark      | Flexx (JS) | Yoga WASM | Yoga NAPI (C++) |
| -------------- | ---------- | --------- | --------------- |
| 100 nodes flat | 85 us      | 88 us     | 197 us          |
| 50-node kanban | 57 us      | 54 us     | 136 us          |

[Flexx](https://github.com/beorn/flexx), inkx's default layout engine, is a 7 KB (gzipped) pure JavaScript flexbox implementation -- no native dependencies, no WASM. It matches Yoga's correctness on the flexbox subset that terminal UIs need, at 2.4x the speed of Yoga NAPI.

**Where Ink wins:** When the entire component tree re-renders from scratch (replacing the root element), Ink is 30x faster because its output is just string concatenation. But this scenario almost never happens in real apps -- it's the equivalent of unmounting and remounting your entire UI.

## Drop-in Ink replacement

inkx is API-compatible with Ink. Same `Box`, `Text`, `useInput`, `useApp`, `Static`, `Spacer` components. Same hook signatures. If your app works with Ink, it works with inkx with minimal changes:

```tsx
// Before (Ink)
import { render, Box, Text, useInput, useApp } from "ink"

// After (inkx)
import { render, Box, Text, useApp } from "inkx"
import { useInput } from "inkx/runtime"
```

What you gain:

- `useContentRect()` and `useScreenRect()` -- layout feedback during render
- `overflow="scroll"` -- native scrollable containers
- Auto text truncation (ANSI-aware)
- Input layer stack with DOM-style event bubbling
- Plugin composition (`withCommands`, `withKeybindings`, `withDiagnostics`)
- Playwright-style test locators (`getByTestId`, `getByText`, `locator()`)
- Zero native dependencies with Flexx (no Yoga NAPI compile step)

## Testing

inkx includes a headless renderer with Playwright-inspired locators:

```tsx
import { createRenderer } from "inkx/testing"

const render = createRenderer({ cols: 80, rows: 24 })

test("navigates list with keyboard", async () => {
  const app = render(<TaskList items={items} />)

  const cursor = app.locator("[data-cursor]")
  expect(cursor.textContent()).toBe("Write docs")

  await app.press("j")
  expect(cursor.textContent()).toBe("Fix bug")

  await app.press("x")
  expect(app.getByTestId("status").textContent()).toBe("done")
})
```

No real terminal needed. No mock stdout. Configurable dimensions, synchronous assertions, and `app.press()` for keyboard simulation. The same `withDiagnostics` plugin that powers AI automation also powers your test suite -- every command execution can automatically verify rendering correctness.

## Getting started

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

## Status

inkx is **experimental** -- actively developed and used in production (it powers [km](https://github.com/beorn/km), a terminal workspace for knowledge workers), but APIs may change. The terminal render target is stable. Canvas and DOM render targets are prototypes.

The core architecture (reconciler, layout hooks, five-phase pipeline) is solid and well-tested. The plugin system (`withCommands`, `withKeybindings`, `withDiagnostics`) has been stable through months of daily production use.

If you're building terminal UIs for AI tools and you want components that know their size, scrollable containers that handle variable-length output, and a command system that AI agents can introspect -- give inkx a look.

- [GitHub](https://github.com/beorn/inkx)
- [npm](https://www.npmjs.com/package/inkx)
- [Documentation](https://github.com/beorn/inkx/tree/main/docs)
- [inkx vs Ink](https://github.com/beorn/inkx/blob/main/docs/inkx-vs-ink.md)
- [CLAUDE.md](https://github.com/beorn/inkx/blob/main/CLAUDE.md) (the AI-readable reference)
