# Inkx

**Ink, but components know their size.**

```tsx
// Ink: manually thread width through every component
function Card({ width }: { width: number }) {
  return <Text>{truncate(title, width)}</Text>;
}

// Inkx: just ask
function Card() {
  const { width } = useLayout();
  return <Text>{truncate(title, width)}</Text>;
}
```

## Status

**Alpha** — core functionality complete, used in production apps.

| Component                                      | Status      |
| ---------------------------------------------- | ----------- |
| Core components (Box, Text)                    | Complete    |
| Hooks (useLayout, useInput, useApp, useStdout) | Complete    |
| React reconciler (React 19 compatible)         | Complete    |
| Yoga integration                               | Complete    |
| Terminal output (double-buffered diffing)      | Complete    |
| `overflow="scroll"`                            | Complete    |
| Visual regression tests                        | Planned     |
| Ink API compatibility                          | In progress |

## Why Inkx Over Ink?

Based on analysis of Ink's [100+ open issues](https://github.com/vadimdemedes/ink/issues) and recent PRs, Inkx solves problems Ink architecturally cannot:

| Pain Point          | Ink Status                                                                        | Inkx Status                                |
| ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| **Scrolling**       | [Open since 2019](https://github.com/vadimdemedes/ink/issues/222) (5.5+ years!)   | ✅ `overflow="scroll"` just works          |
| **Layout feedback** | [Architecturally impossible](https://github.com/vadimdemedes/ink/issues/5)        | ✅ `useLayout()` returns actual dimensions |
| **Text overflow**   | [Multiple issues](https://github.com/vadimdemedes/ink/issues/584) - breaks layout | ✅ Auto-truncates by default               |
| **Cursor API**      | [Open since 2019](https://github.com/vadimdemedes/ink/issues/251) (6+ years!)     | 🔜 Planned - layout feedback enables this  |

**What Ink gets right** (and Inkx maintains):

- React-based declarative API
- Flexbox layout via Yoga
- Chalk compatibility
- `useInput()` keyboard handling

**Where Inkx can do better**:

- Components know their dimensions without prop threading
- Scrolling without manual virtualization
- Text truncation that preserves ANSI codes

## The Problem

Ink renders components _before_ layout. Components can't know their dimensions, so you manually calculate and pass widths everywhere:

```tsx
// Ink: width props cascade through the entire tree
function Board({ width }: { width: number }) {
  const colWidth = Math.floor((width - 2) / 3);
  return (
    <Box flexDirection="row">
      <Column width={colWidth} items={todo} />
      <Column width={colWidth} items={doing} />
      <Column width={colWidth} items={done} />
    </Box>
  );
}

function Column({ width, items }: { width: number; items: Item[] }) {
  return (
    <Box width={width}>
      {items.map((item) => (
        <Card width={width - 2} item={item} />
      ))}
    </Box>
  );
}

function Card({ width, item }: { width: number; item: Item }) {
  return <Text>{truncate(item.title, width - 4)}</Text>;
}
```

Real apps have 100+ lines of this. Every layout change means updating arithmetic everywhere.

## The Solution

Inkx calculates layout first, then renders. Components query their size:

```tsx
// Inkx: no width props needed
function Board() {
  return (
    <Box flexDirection="row">
      <Column items={todo} />
      <Column items={doing} />
      <Column items={done} />
    </Box>
  );
}

function Column({ items }: { items: Item[] }) {
  return (
    <Box flexGrow={1}>
      {items.map((item) => (
        <Card item={item} />
      ))}
    </Box>
  );
}

function Card({ item }: { item: Item }) {
  const { width } = useLayout(); // ← just ask
  return <Text>{truncate(item.title, width - 4)}</Text>;
}
```

## API

Drop-in Ink replacement:

```tsx
import { Box, Text, render, useInput, useApp } from "inkx";
```

**New**: `useLayout()` returns `{ width, height, x, y }`.

**Implemented**: `overflow="scroll"` with `scrollTo={index}` for automatic scrolling:

```tsx
// Just works - no height estimation, no virtualization config
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map((item) => (
    <Card key={item.id} item={item} />
  ))}
</Box>
```

Scroll containers show visual indicators on borders (e.g., `▼3` showing 3 items below).

**Coming soon**: Text auto-truncation (opt out with `wrap="truncate"`).

## Why a New Project?

**This can't be fixed in Ink.** The limitation is architectural, not a missing feature.

### How React DOM works

In web React, you rarely think about this because CSS handles it:

```tsx
// Web React: CSS does the work
function Card() {
  return (
    <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
  );
}
```

The browser's layout engine calculates dimensions, then CSS properties like `text-overflow: ellipsis` apply _after_ the width is known. You don't pass width props around.

When you _do_ need dimensions in React DOM, you use refs and `useLayoutEffect`:

```tsx
// Web React: read layout after browser computes it
function Card() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    if (ref.current) {
      setWidth(ref.current.offsetWidth); // Browser already calculated this
    }
  }, []);

  return <div ref={ref}>{truncate(title, width)}</div>;
}
```

This works because `useLayoutEffect` runs _after_ DOM mutation but _before_ paint—the browser has already computed layout. React DOM leverages the browser's two-phase architecture.

**Ink can't do this** because there's no browser. Ink _is_ the layout engine, and it runs layout _after_ React finishes, not between commit and paint.

### How browsers do it (under the hood)

Browsers solve this with **two-phase rendering**:

1. **Style/Layout phase** — build the render tree, calculate all box sizes
2. **Paint phase** — draw pixels using the computed sizes

JavaScript can query layout anytime via `getBoundingClientRect()` or `offsetWidth`. The browser already computed it. CSS features like `text-overflow: ellipsis` work because the browser truncates _after_ knowing the container width.

This is the normal, well-understood approach. Every native UI toolkit works this way—Cocoa, Qt, WPF, Flutter, browser engines. **Inkx follows this standard pattern.**

### Why Ink doesn't work this way

Ink's render cycle:

```
React render → VDOM → Yoga layout → Terminal output
     ↑                    ↓
     └────── no path ─────┘
```

Components render _before_ Yoga calculates layout. By the time Yoga runs, React is done—the text content is already decided.

**But Yoga supports querying layout!** Yes—Yoga calculates layout correctly. The problem is _when_ Ink asks React to render. Ink builds the component tree first, hands it to Yoga, then writes to the terminal. Components never get a chance to see Yoga's results.

### Why Ink won't fix this

This has been a [known issue](https://github.com/vadimdemedes/ink/issues/387) since 2020. The Ink maintainers haven't fixed it because:

1. **It's a breaking architectural change** — not a bug fix, but a redesign of how rendering works
2. **It requires two render passes** — doubles complexity and has performance implications
3. **Ink is stable/maintenance mode** — the API is frozen, major changes aren't happening
4. **It works for Ink's target use case** — simple CLI output where manual width-passing is tolerable

For serious TUI apps (dashboards, editors, complex layouts), you either thread widths manually through hundreds of components, or you use a different framework.

### What Inkx does differently

Inkx inverts the render order:

```
React render → VDOM → Yoga layout → React re-render with sizes → Terminal output
                           ↓                ↑
                           └────────────────┘
```

First render builds the tree structure. Yoga calculates layout. Second render lets components use their actual sizes. This is how browsers work, just adapted for React's model.

This requires a custom React renderer that intercepts the render cycle—not something you can add to Ink without replacing its core.

## Related Work

Inkx builds on and learns from many projects. Credit where due:

### Direct Foundation

| Project                                                                                   | Relationship                                                                                                                 |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [Ink](https://github.com/vadimdemedes/ink)                                                | API compatibility target. Inkx aims to be a drop-in replacement. Ink pioneered React-in-terminal and proved the model works. |
| [Yoga](https://yogalayout.dev/)                                                           | Default layout engine. Facebook's flexbox implementation via WASM.                                                           |
| [Flexx](../beorn-flexx/)                                                                  | Alternative layout engine. Pure JS, 2.5x faster, 5x smaller than Yoga. See below.                                            |
| [Chalk](https://github.com/chalk/chalk)                                                   | ANSI styling (same as Ink). Inkx preserves Chalk strings through truncation and wrapping.                                    |
| [React Reconciler](https://github.com/facebook/react/tree/main/packages/react-reconciler) | Custom renderer API. How both Ink and Inkx integrate with React.                                                             |

### Layout Engine Options

Inkx supports two layout engines:

| Engine             | Bundle (gzip) | Performance | Initialization | Use When                             |
| ------------------ | ------------- | ----------- | -------------- | ------------------------------------ |
| **Yoga** (default) | 38 KB         | 316 µs      | Async          | Need RTL, baseline, aspect-ratio     |
| **Flexx**          | 7 KB          | 125 µs      | Sync           | Want smaller bundles, faster startup |

Flexx is **2.5x faster** and **5x smaller**, but doesn't support RTL or baseline alignment. For terminal UIs, both are fast enough—choose based on bundle size and feature needs.

### Prior Art (TUI Frameworks with Proper Layout)

These frameworks solved the layout feedback problem. Inkx brings their approach to React/TypeScript:

| Framework                                               | Language | Layout Feedback | Notes                                                                              |
| ------------------------------------------------------- | -------- | --------------- | ---------------------------------------------------------------------------------- |
| [Textual](https://textual.textualize.io/)               | Python   | ✅              | Modern TUI framework. Excellent architecture, CSS-like styling. Major inspiration. |
| [Ratatui](https://ratatui.rs/)                          | Rust     | ✅              | Immediate-mode TUI. Components receive their `Rect` with dimensions.               |
| [Brick](https://github.com/jtdaugherty/brick)           | Haskell  | ✅              | Declarative TUI. `Widget` rendering receives available space.                      |
| [Cursive](https://github.com/gyscos/cursive)            | Rust     | ✅              | Views receive size constraints before drawing.                                     |
| [Bubbletea](https://github.com/charmbracelet/bubbletea) | Go       | ✅              | Elm-architecture TUI. `WindowSizeMsg` provides dimensions.                         |

### Alternatives Considered

| Approach                                                             | Why Not                                                                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Fork Ink**                                                         | Ink's architecture is the problem. Would need to maintain fork indefinitely with invasive changes.  |
| **Build on [blessed](https://github.com/chjj/blessed)**              | Abandoned (last commit 2017). Imperative API, no React.                                             |
| **Build on [terminal-kit](https://github.com/cronvel/terminal-kit)** | Low-level primitives, no component model. Would need to build React layer from scratch.             |
| **Port Textual to JS**                                               | Significant effort, different idioms, would lose Ink ecosystem compatibility.                       |
| **Use [Taffy](https://github.com/DioxusLabs/taffy) (Rust/WASM)**     | Better flexbox than Yoga, but adds WASM complexity. Can switch layout engine to it later if needed. |

### Browser Rendering (Architecture Reference)

Inkx follows the standard two-phase approach used by all major rendering engines:

- **WebKit/Blink/Gecko** — Style → Layout → Paint → Composite
- **Flutter** — Build → Layout → Paint → Composite
- **SwiftUI/AppKit** — measurementContainer → layout → render
- **React Native** — Uses Yoga, but native views receive layout results before rendering

The pattern is universal: calculate sizes first, render content second.

## Docs

Full documentation at `docs/site/` (VitePress):

- **Getting Started** — installation, basic usage
- **API Reference** — Box, Text, hooks (useLayout, useInput, useApp, useStdout)
- **Guides** — scrolling, text handling, migration from Ink
- **Architecture** — render pipeline, reconciler internals

Run locally: `cd docs/site && bun run dev`

## Chalk/ANSI Compatibility

Inkx fully supports chalk/ANSI styling in text content. The render pipeline:

1. `hasAnsi()` detects ANSI codes in text
2. `parseAnsiText()` extracts styled segments
3. `mergeAnsiStyle()` merges ANSI styles with inkx base styles
4. **ANSI styles override base styles** when both are present

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
import { bgOverride } from "@beorn/chalkx";

// When you deliberately want both backgrounds:
<Box backgroundColor="cyan">
  <Text>{bgOverride(chalk.bgBlack("intentional"))}</Text>
</Box>;
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
