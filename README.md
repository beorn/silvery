# Inkx

**Ink, but components know their size.**

A React-based terminal UI framework where components can query their computed dimensions via `useContentRect()`. Drop-in Ink replacement with layout feedback.

## Installation

```bash
bun add inkx
```

## Quick Start

```tsx
import { render, Box, Text, useContentRect, createTerm } from "inkx"

function Card() {
  const { width } = useContentRect() // Components know their size!
  return <Text>{truncate(title, width)}</Text>
}

using term = createTerm()
await render(<App />, term)
```

## The Problem Inkx Solves

Ink renders components _before_ layout calculation. Components can't know their dimensions, forcing you to manually thread width props through every layer:

```tsx
// Ink: width props cascade through entire tree
<Board width={80}>
  <Column width={26}>
    <Card width={24} />
  </Column>
</Board>

// Inkx: just ask
<Board>
  <Column>
    <Card />  {/* useContentRect() inside */}
  </Column>
</Board>
```

## Key Features

| Feature             | Description                                          |
| ------------------- | ---------------------------------------------------- |
| **Layout feedback** | `useContentRect()` returns `{ width, height, x, y }` |
| **Scrolling**       | `overflow="scroll"` with `scrollTo={index}`          |
| **Term injection**  | `useTerm()` for styling and capability detection     |
| **Console capture** | `<Console />` component for log output               |
| **React 19**        | forwardRef, ErrorBoundary, Suspense, useTransition   |
| **Flexx layout**    | 2.5x faster than Yoga, 5x smaller bundle             |

## inkx/runtime (New API)

The new `inkx/runtime` module provides a layered, AsyncIterable-first architecture. **Use this for new development.**

```tsx
import { run, useInput, type Key } from "inkx/runtime"
import { Text } from "inkx"

function Counter() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "j" || key.downArrow) setCount((c) => c + 1)
    if (input === "k" || key.upArrow) setCount((c) => c - 1)
    if (input === "q") return "exit"
  })

  return <Text>Count: {count}</Text>
}

await run(<Counter />)
```

**Three layers to choose from:**

| Layer | Entry             | Best For                   |
| ----- | ----------------- | -------------------------- |
| 1     | `createRuntime()` | Maximum control, Elm-style |
| 2     | `run()`           | React hooks (recommended)  |
| 3     | `createApp()`     | Complex apps with Zustand  |

**Rich Key object** with arrow keys, modifiers, navigation:

```tsx
useInput((input, key) => {
  if (key.upArrow) moveCursor(-1)
  if (key.ctrl && input === "c") return "exit"
  if (key.return) submit()
})
```

See `docs/getting-started.md` and `docs/runtime-migration.md` for details.

## Status

**Alpha** — core functionality complete, used in production apps.

- Core components (Box, Text) - Complete
- Hooks (useContentRect, useInput, useApp, useTerm) - Complete
- React reconciler (React 19 compatible) - Complete
- Flexx layout engine (default) - Complete
- Yoga layout engine (WASM, optional) - Complete
- Visual regression tests - Planned

## Web Targets (Experimental)

inkx can render to Canvas and DOM in addition to terminal:

```tsx
// Canvas rendering
import { renderToCanvas, Box, Text } from "inkx/canvas"
renderToCanvas(<App />, canvas, { fontSize: 14 })

// DOM rendering (text-selectable, accessible)
import { renderToDOM, Box, Text } from "inkx/dom"
renderToDOM(<App />, container, { fontSize: 14 })
```

See [docs/roadmap.md](docs/roadmap.md) for the full vision including WebGL and React Native.

## Documentation

| Resource                                         | Description                          |
| ------------------------------------------------ | ------------------------------------ |
| [CLAUDE.md](CLAUDE.md)                           | Full API reference with all patterns |
| [examples/](examples/)                           | Runnable examples with source code   |
| [docs/internals.md](docs/internals.md)           | Architecture for contributors        |
| [docs/ink-comparison.md](docs/ink-comparison.md) | Detailed Ink comparison              |

## Examples

**Terminal:**

```bash
bun run examples/dashboard/index.tsx      # Multi-pane dashboard
bun run examples/kanban/index.tsx         # 3-column kanban board
bun run examples/task-list/index.tsx      # Scrollable task list
bun run examples/search-filter/index.tsx  # useTransition + useDeferredValue
bun run examples/async-data/index.tsx     # Suspense + async loading
bun run examples/layout-ref/index.tsx     # forwardRef + onLayout
```

**Web (Canvas/DOM):**

```bash
bun run build:web                         # Build browser bundles
open examples/web/canvas.html             # Canvas adapter demo
open examples/web/dom.html                # DOM adapter demo
```

See [examples/index.md](examples/index.md) for descriptions.

## Related Projects

| Project                                                 | Role                                                     |
| ------------------------------------------------------- | -------------------------------------------------------- |
| [Ink](https://github.com/vadimdemedes/ink)              | API compatibility target. Inkx is a drop-in replacement. |
| [Flexx](../beorn-flexx/)                                | Default layout engine (2.5x faster, 5x smaller).         |
| [Yoga](https://yogalayout.dev/)                         | Optional layout engine (WASM, more mature).              |
| [Chalk](https://github.com/chalk/chalk)                 | ANSI styling. Inkx preserves chalk strings.              |
| [Textual](https://textual.textualize.io/)               | Python TUI with proper layout. Major inspiration.        |
| [Ratatui](https://ratatui.rs/)                          | Rust TUI with layout feedback.                           |
| [Bubbletea](https://github.com/charmbracelet/bubbletea) | Go TUI with dimension awareness.                         |

## Docs

Full documentation at `docs/site/` (VitePress):

- **Getting Started** — installation, basic usage
- **API Reference** — Box, Text, hooks (useContentRect, useInput, useApp, useTerm)
- **Guides** — scrolling, text handling, migration from Ink
- **Architecture** — render pipeline, reconciler internals

**Architecture Deep Dives:**

- [docs/architecture.md](docs/architecture.md) — Core innovation, layer diagram, RenderAdapter interface
- [docs/roadmap.md](docs/roadmap.md) — Maximum roadmap for Canvas, React Native, and beyond
- [docs/design.md](docs/design.md) — Terminal implementation details
- [docs/internals.md](docs/internals.md) — React reconciler internals

Run locally: `cd docs/site && bun run dev`

## Style Layering

Inkx implements **category-based style merging** that preserves semantic information through state changes (like selection). This is especially useful for TUI applications where selection overlays shouldn't destroy underlying styles like error underlines.

### Style Categories

| Category        | Properties                                                       | Merge Behavior              |
| --------------- | ---------------------------------------------------------------- | --------------------------- |
| **Container**   | `bg`                                                             | Replace (overlay wins)      |
| **Text**        | `fg`                                                             | Replace (overlay wins)      |
| **Decorations** | `underline`, `underlineStyle`, `underlineColor`, `strikethrough` | Preserved (OR merge)        |
| **Emphasis**    | `bold`, `dim`, `italic`                                          | Preserved (OR merge)        |
| **Transform**   | `inverse`                                                        | Applied last, not inherited |

### Example: Selection Preserves Underlines

```tsx
// Without style layering (typical behavior):
// Selection (yellow bg + black text) DESTROYS red underline

// With inkx style layering:
// Selection preserves the red underline!
<Text
  color={isSelected ? "black" : "white"}
  backgroundColor={isSelected ? "yellow" : undefined}
  underlineStyle="curly"
  underlineColor="red" // Preserved through selection!
>
  overdue task
</Text>
```

### Underline Styles (SGR 4:x)

Inkx supports extended underline styles via the `underlineStyle` prop:

```tsx
<Text underlineStyle="single">standard underline</Text>
<Text underlineStyle="double">double underline</Text>
<Text underlineStyle="curly">curly/wavy underline</Text>
<Text underlineStyle="dotted">dotted underline</Text>
<Text underlineStyle="dashed">dashed underline</Text>
```

### Underline Color (SGR 58)

Set underline color independently of text color:

```tsx
<Text underlineStyle="curly" underlineColor="red">
  Error: file not found
</Text>

<Text underlineStyle="dashed" underlineColor="#0088ff">
  https://example.com
</Text>
```

### Controlling Merge Behavior

For advanced use cases, style merging behavior can be controlled:

```tsx
// In custom components using mergeStyles():
import { mergeStyles } from "inkx"

const result = mergeStyles(baseStyle, overlayStyle, {
  preserveDecorations: false, // Overlay can clear decorations
  preserveEmphasis: false, // Overlay can clear emphasis
})
```

## Chalk/ANSI Compatibility

Inkx fully supports chalk/ANSI styling in text content. The render pipeline:

1. `hasAnsi()` detects ANSI codes in text
2. `parseAnsiText()` extracts styled segments (including SGR 4:x and SGR 58)
3. `mergeAnsiStyle()` merges ANSI styles using category-based semantics
4. Decorations and emphasis are **preserved** through layers by default

### Background Conflict Detection

When using **both** chalk background colors **and** inkx `backgroundColor` on the same text, visual artifacts occur: chalk only colors text characters, while inkx fills the entire box area. This creates gaps in padding/empty space.

Inkx detects this conflict and **throws by default**:

```tsx
// This throws - chalk.bg* + inkx backgroundColor = visual bugs
<Box backgroundColor="cyan">
  <Text>{chalk.bgBlack("text")}</Text>
</Box>
```

**Safe patterns:**

```tsx
// OK: chalk bg without inkx bg
<Text>{chalk.bgYellow('highlighted')}</Text>

// OK: inkx bg without chalk bg
<Box backgroundColor="cyan"><Text>plain</Text></Box>

// OK: chalk fg/bold/italic with inkx bg
<Box backgroundColor="cyan"><Text>{chalk.bold.white('text')}</Text></Box>
```

**Configuration** via `INKX_BG_CONFLICT` environment variable:

- `throw` (default) — Throw error on conflict (fail fast for programming errors)
- `warn` — Console warning (deduplicated)
- `ignore` — No detection

**Intentional override** with `@beorn/chalkx`:

```tsx
import { bgOverride } from "@beorn/chalkx"

// When you deliberately want both backgrounds:
;<Box backgroundColor="cyan">
  <Text>{bgOverride(chalk.bgBlack("intentional"))}</Text>
</Box>
```

The `bgOverride()` wrapper tells inkx "I know what I'm doing" and skips detection.

## Known Limitations & Roadmap

Based on real-world Ink issues, these areas need attention:

### Text Wrapping

- **Character-based wrapping** — Text wraps at exact column boundaries, not word boundaries. Long words may be split mid-word. For word-aware wrapping, pre-process text with `wrap-ansi` or similar library.

### Being Investigated

- **CJK/IME input** — Ink's #1 pain point. Testing in progress.
- **Terminal multiplexers** — tmux/Zellij have unique challenges.

### Planned Improvements

- **Kitty keyboard protocol** — Better modifier key handling
- **Cursor API** (`useCursor()`) — Ink issue open 6+ years
- **Multi-line TextInput** — Common request for chat-like apps

### Testing Coverage Needed

- CJK character width calculation
- Emoji with ZWJ sequences
- Rapid keystroke handling
- Large component counts (100+)

See [docs/ink-comparison.md](docs/ink-comparison.md) for detailed analysis.

## License

MIT
