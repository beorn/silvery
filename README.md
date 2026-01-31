# Inkx

**Ink, but components know their size.**

## Quick Start

```tsx
// Interactive app with term
import { render, Box, Text, createTerm } from 'inkx'

using term = createTerm()
await render(
  <Box><Text>{term.green('Hello')} world</Text></Box>,
  term
)
```

```tsx
// Static rendering (no terminal needed)
import { renderStatic, Box, Text } from 'inkx'

const output = await renderStatic(<Box><Text>Hello world</Text></Box>)
console.log(output)
```

```tsx
// Console capture - logs appear above status line
import { render, Box, Text, Console, createTerm, patchConsole } from 'inkx'

using term = createTerm()
using console = patchConsole(globalThis.console)
await render(
  <Box flexDirection="column">
    <Console console={console} />
    <Text>Status: running</Text>
  </Box>,
  term
)

console.log('This appears above status line')
```

## The Problem Inkx Solves

```tsx
// Ink: manually thread width through every component
function Card({ width }: { width: number }) {
  return <Text>{truncate(title, width)}</Text>;
}

// Inkx: just ask
function Card() {
  const { width } = useContentRect();
  return <Text>{truncate(title, width)}</Text>;
}
```

## Status

**Alpha** — core functionality complete, used in production apps.

| Component                                      | Status      |
| ---------------------------------------------- | ----------- |
| Core components (Box, Text)                    | Complete    |
| Hooks (useContentRect, useInput, useApp, useTerm) | Complete    |
| React reconciler (React 19 compatible)         | Complete    |
| Flexx layout engine (default, 2.5x faster)     | Complete    |
| Yoga layout engine (WASM, optional)            | Complete    |
| Terminal output (double-buffered diffing)      | Complete    |
| `overflow="scroll"`                            | Complete    |
| Unicode/emoji/CJK handling                     | Complete    |
| Style layering (preserve underlines)           | Complete    |
| Visual regression tests                        | Planned     |
| Ink API compatibility                          | In progress |

## Inkx vs Ink

Based on analysis of Ink's [100+ open issues](https://github.com/vadimdemedes/ink/issues) and recent PRs, Inkx solves problems Ink architecturally cannot:

| Pain Point          | Ink Status                                                                        | Inkx Status                                |
| ------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| **Scrolling**       | [Open since 2019](https://github.com/vadimdemedes/ink/issues/222) (5.5+ years!)   | ✅ `overflow="scroll"` just works          |
| **Layout feedback** | [Architecturally impossible](https://github.com/vadimdemedes/ink/issues/5)        | ✅ `useContentRect()` returns dimensions |
| **Text overflow**   | [Multiple issues](https://github.com/vadimdemedes/ink/issues/584) - breaks layout | ✅ Auto-truncates by default               |
| **Cursor API**      | [Open since 2019](https://github.com/vadimdemedes/ink/issues/251) (6+ years!)     | 🔜 Planned - layout feedback enables this  |

**What Ink gets right** (and Inkx maintains):

- React-based declarative API
- Flexbox layout (Flexx default, Yoga optional)
- Chalk compatibility
- `useInput()` keyboard handling

**Where Inkx strives to do better**:

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
  const { width } = useContentRect(); // ← just ask
  return <Text>{truncate(item.title, width - 4)}</Text>;
}
```

## API

Drop-in Ink replacement with term injection:

```tsx
import { Box, Text, render, useInput, useApp, createTerm, useTerm } from "inkx";

using term = createTerm()
await render(<App />, term)
```

**Core hooks**:
- `useContentRect()` — returns `{ width, height, x, y }` (component's computed dimensions)
- `useTerm()` — returns the `Term` instance for styling and capability detection

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

## NewWay vs OldWay

Inkx prefers **explicit term injection** over implicit globals. This makes code more testable, dependencies clearer, and cleanup automatic via `Disposable`.

### Why NewWay?

| Aspect | OldWay | NewWay |
|--------|--------|--------|
| **Dependencies** | Implicit globals | Explicit injection |
| **Testing** | Mock globals | Inject test term |
| **Cleanup** | Manual | Automatic via `using` |
| **Terminal detection** | Global functions | Instance methods |

### Migration Patterns

**Rendering**

```tsx
// Static mode - no term needed, renders once
import { render, Box, Text } from 'inkx'
const output = await render(<App />)  // renders to string

// Interactive mode - pass term for live updates
import { render, Box, Text, createTerm } from 'inkx'
using term = createTerm()
await render(<App />, term)  // ✅ components can useTerm()
```

**Styling**

```tsx
// OldWay - global chalk instance
import chalk from 'chalk'
console.log(chalk.red('error'))

// NewWay - flattened styling via term
import { createTerm } from 'inkx'
using term = createTerm()
console.log(term.red('error'))
console.log(term.bold.green('success'))
```

**Terminal Detection**

```tsx
// OldWay - global detection functions
import { isTTY } from 'some-package'
if (isTTY()) { ... }

// NewWay - instance-based detection
using term = createTerm()
term.hasCursor()   // Can reposition cursor?
term.hasInput()    // Can read raw keystrokes?
term.hasColor()    // 'basic' | '256' | 'truecolor' | null
term.hasUnicode()  // Can render unicode?
```

### Anti-Patterns to Avoid

```tsx
// ❌ Not awaiting async render
render(<App />, term)

// ❌ Mixing chalk backgrounds with Box backgroundColor
<Box backgroundColor="cyan">
  <Text>{chalk.bgBlack('text')}</Text>  // Visual artifacts
</Box>
```

**Correct patterns:**

```tsx
// ✅ Pass term for interactive mode
using term = createTerm()
await render(<App />, term)

// ✅ Use bgOverride for intentional background mixing
import { bgOverride } from '@beorn/chalkx'
<Box backgroundColor="cyan">
  <Text>{bgOverride(chalk.bgBlack('intentional'))}</Text>
</Box>
```

### Why Term Matters

- **Testability**: Inject mock term with specific capabilities, no global mocking needed
- **Multiple contexts**: Each render can have different terminal configurations
- **Consistent styling**: Components share term via React context (`useTerm()`)
- **Explicit cleanup**: Disposable pattern with `using` keyword ensures proper teardown
- **No global state**: Detection cached per-term instance, not globally

### Key APIs for NewWay

| API | Description |
|-----|-------------|
| `createTerm()` | Create a Term instance (Disposable) |
| `render(element, term?)` | Render element; term optional for static mode |
| `renderStatic(element)` | One-shot static render to string |
| `useTerm()` | Access term in components |
| `Console` | Render captured console output |
| `patchConsole(console)` | Capture console calls (Disposable) |

**Note**: `useLayout` is a deprecated alias for `useContentRect`. Use `useContentRect` in new code.

## Testing

Inkx provides a Playwright-inspired testing API with **auto-refreshing locators** that eliminate stale reference bugs:

```tsx
import { render, Box, Text } from 'inkx'

test('renders and responds to input', async () => {
  const app = await render(
    <Box testID="main">
      <Text>Hello World</Text>
    </Box>,
    { columns: 80, rows: 24 }
  )

  // Plain text assertions (no ANSI codes)
  expect(app.text).toContain('Hello World')

  // Auto-refreshing locators - same object, fresh results after state changes
  expect(app.getByTestId('main').boundingBox()?.width).toBe(80)
  expect(app.getByText('Hello').count()).toBe(1)

  // Playwright-style keyboard input
  await app.press('ArrowDown')
  await app.press('Enter')

  // Debug output
  app.debug()
})
```

**Key features:**
- `app.text` — plain text output (no ANSI)
- `app.getByTestId()` / `app.getByText()` — auto-refreshing locators
- `app.locator('[selector]')` — CSS-style selectors
- `app.press()` — async keyboard input with await
- `app.term.cell(x, y)` — terminal buffer inspection

The auto-refresh eliminates a common testing pain point:

```tsx
// Same locator object works after state changes
const cursor = app.locator('[data-cursor]')
await app.press('j')
expect(cursor.textContent()).toBe('item2')  // Same locator, fresh result
```

## Why a New Project?

**Ink's limitation is architectural, not a missing feature.**

Ink renders components _before_ Yoga calculates layout. By the time dimensions are known, React is done. This has been a [known issue](https://github.com/vadimdemedes/ink/issues/5) since 2016.

```
Ink:   React render → VDOM → Yoga layout → Terminal output
                                   ↓
                              (too late!)

Inkx:  React render → VDOM → Yoga layout → React re-render with sizes → Terminal output
                                   ↓                ↑
                                   └────────────────┘
```

Inkx uses **two-phase rendering** (the standard approach in browsers, Flutter, SwiftUI). First pass builds the tree, Yoga calculates layout, second pass lets components use their actual sizes via `useContentRect()`.

**For detailed comparison**: See [docs/ink-comparison.md](docs/ink-comparison.md) for analysis of Ink's 100+ open issues and how Inkx addresses them.

## Layout Engine Selection

Inkx supports two layout engines:

| Engine | Bundle | Speed | Initialization |
|--------|--------|-------|----------------|
| **Flexx** (default) | 7 KB gzip | 2.5x faster | Synchronous |
| **Yoga** (optional) | 38 KB gzip | Baseline | Async (WASM) |

**Select engine via render option:**

```tsx
await render(<App />, term, { layoutEngine: 'yoga' })  // Use Yoga
await render(<App />, term, { layoutEngine: 'flexx' }) // Use Flexx (default)
```

**Or via environment variable:**

```bash
INKX_ENGINE=yoga bun run app.ts   # Force Yoga
INKX_ENGINE=flexx bun test        # Force Flexx
```

Priority: `render({ layoutEngine })` → `INKX_ENGINE` env → `'flexx'` (default)

**When to use Yoga:**
- Need RTL text direction support
- Require battle-tested stability in complex layouts
- Already using Yoga in React Native ecosystem

**When to use Flexx:**
- Building terminal UIs (simpler layouts)
- Want faster startup and smaller bundles
- Prefer synchronous initialization

## Related Projects

| Project                                         | Role                                                     |
| ----------------------------------------------- | -------------------------------------------------------- |
| [Ink](https://github.com/vadimdemedes/ink)      | API compatibility target. Inkx is a drop-in replacement. |
| [Flexx](../beorn-flexx/)                        | Default layout engine (2.5x faster, 5x smaller).         |
| [Yoga](https://yogalayout.dev/)                 | Optional layout engine (WASM, more mature).              |
| [Chalk](https://github.com/chalk/chalk)         | ANSI styling. Inkx preserves chalk strings.              |
| [Textual](https://textual.textualize.io/)       | Python TUI with proper layout. Major inspiration.        |
| [Ratatui](https://ratatui.rs/)                  | Rust TUI with layout feedback.                           |
| [Bubbletea](https://github.com/charmbracelet/bubbletea) | Go TUI with dimension awareness.                 |

## Docs

Full documentation at `docs/site/` (VitePress):

- **Getting Started** — installation, basic usage
- **API Reference** — Box, Text, hooks (useContentRect, useInput, useApp, useTerm)
- **Guides** — scrolling, text handling, migration from Ink
- **Architecture** — render pipeline, reconciler internals

Run locally: `cd docs/site && bun run dev`

## Style Layering

Inkx implements **category-based style merging** that preserves semantic information through state changes (like selection). This is especially useful for TUI applications where selection overlays shouldn't destroy underlying styles like error underlines.

### Style Categories

| Category | Properties | Merge Behavior |
|----------|------------|----------------|
| **Container** | `bg` | Replace (overlay wins) |
| **Text** | `fg` | Replace (overlay wins) |
| **Decorations** | `underline`, `underlineStyle`, `underlineColor`, `strikethrough` | Preserved (OR merge) |
| **Emphasis** | `bold`, `dim`, `italic` | Preserved (OR merge) |
| **Transform** | `inverse` | Applied last, not inherited |

### Example: Selection Preserves Underlines

```tsx
// Without style layering (typical behavior):
// Selection (yellow bg + black text) DESTROYS red underline

// With inkx style layering:
// Selection preserves the red underline!
<Text
  color={isSelected ? 'black' : 'white'}
  backgroundColor={isSelected ? 'yellow' : undefined}
  underlineStyle="curly"
  underlineColor="red"  // Preserved through selection!
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
import { mergeStyles } from 'inkx'

const result = mergeStyles(baseStyle, overlayStyle, {
  preserveDecorations: false,  // Overlay can clear decorations
  preserveEmphasis: false,     // Overlay can clear emphasis
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
