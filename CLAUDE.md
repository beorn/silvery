# inkx - Terminal UI React Framework

React-based terminal UI framework with layout feedback. Ink-compatible API with components that know their size.

## Architecture Overview

inkx's core innovation is **two-phase rendering with synchronous layout feedback** — components know their size during render, not after.

See [docs/architecture.md](docs/architecture.md) for:
- Layer diagram (@inkx/core → RenderAdapter → targets)
- RenderAdapter interface for future targets (Canvas, React Native)
- Infinite loop prevention and containment rules

See [docs/roadmap.md](docs/roadmap.md) for the maximum vision:
- Tier 2: Enhanced Terminal (Cursor API, mouse support)
- Tier 3: Canvas/WebGL (recommended next validation target)
- Tier 4: React Native (high value - FlatList replacement)

## inkx/runtime (Recommended)

The new `inkx/runtime` API provides a layered, AsyncIterable-first architecture. **Use this for new development.**

### Quick Start (Layer 2)

```tsx
import { run, useInput, type Key } from 'inkx/runtime';
import { Text } from 'inkx';

function Counter() {
  const [count, setCount] = useState(0);

  useInput((input, key) => {
    if (input === 'j' || key.downArrow) setCount(c => c + 1);
    if (input === 'k' || key.upArrow) setCount(c => c - 1);
    if (input === 'q') return 'exit';  // Return 'exit' to exit
  });

  return <Text>Count: {count}</Text>;
}

await run(<Counter />);
```

### Layers

| Layer | Entry Point | Best For | State Management |
|-------|-------------|----------|------------------|
| 1 | `createRuntime()` | Maximum control, Elm-style | Your choice |
| 2 | `run()` | React hooks (recommended) | `useState/useEffect` |
| 3 | `createApp()` | Complex apps | Zustand store |

### Layer 3: Zustand Store

```tsx
import { createApp, useApp, type Key } from 'inkx/runtime';

const app = createApp(
  () => (set, get) => ({
    cursor: 0,
    moveCursor: (d) => set(s => ({ cursor: s.cursor + d })),
  }),
  {
    key: (input, key, { get }) => {
      if (input === 'j' || key.downArrow) get().moveCursor(1);
      if (input === 'k' || key.upArrow) get().moveCursor(-1);
      if (input === 'q') return 'exit';
    },
  }
);

function App() {
  const cursor = useApp(s => s.cursor);  // Fine-grained subscription
  return <Text>Cursor: {cursor}</Text>;
}

await app.run(<App />);
```

### Key Object

The `Key` object provides rich key parsing:

```typescript
interface Key {
  upArrow: boolean;      downArrow: boolean;
  leftArrow: boolean;    rightArrow: boolean;
  pageUp: boolean;       pageDown: boolean;
  home: boolean;         end: boolean;
  return: boolean;       escape: boolean;
  tab: boolean;          backspace: boolean;
  delete: boolean;
  ctrl: boolean;         shift: boolean;       meta: boolean;
}
```

### Imports

```tsx
// Layer 2 (recommended)
import { run, useInput, useExit, type Key } from 'inkx/runtime';

// Layer 3 (complex apps)
import { createApp, useApp, type Key } from 'inkx/runtime';

// Layer 1 (full control)
import { createRuntime, layout, ensureLayoutEngine, merge } from 'inkx/runtime';

// Components (same as always)
import { Box, Text } from 'inkx';
```

### Testing

```tsx
const handle = await run(<Counter />, { cols: 80, rows: 24 });
expect(handle.text).toContain('Count: 0');
await handle.press('j');
expect(handle.text).toContain('Count: 1');
handle.unmount();
```

### Frame Iteration

`AppRunner` (returned by `createApp().run()`) is both `PromiseLike` and `AsyncIterable` — iterate frames for fuzz testing:

```tsx
const app = createApp((inject) => ({ count: 0 }), { onKey: (s) => ({ count: s.count + 1 }) });
for await (const frame of app.run(<Counter />, { cols: 80, rows: 24 })) {
  // frame is a Buffer with rendered output after each event
  expect(frame.text).toBeDefined();
}
```

See `docs/getting-started.md` for full documentation.

## Layout Engine

inkx supports multiple layout engines:

| Engine | Description |
|--------|-------------|
| `flexx` (default) | Zero-allocation Flexx, optimized for high-frequency layout |
| `flexx-classic` | Classic Flexx algorithm, for debugging/compatibility |
| `yoga` | Facebook's WASM-based flexbox (most mature) |

**Option 1: Pass to render()**
```tsx
await render(<App />, term, { layoutEngine: 'yoga' })
await renderStatic(<Report />, { layoutEngine: 'flexx' })
```

**Option 2: Environment variable** (fallback when option not provided)
```bash
INKX_ENGINE=yoga bun run app.ts
INKX_ENGINE=flexx bun test
```

Priority: `render({ layoutEngine })` → `INKX_ENGINE` env → `'flexx'`

## Imports

All exports are **named exports**:

```tsx
// Components
import { Box, Text, Newline, Spacer, Static, Console } from 'inkx'

// Hooks
import { useContentRect, useScreenRect, useInput, useApp, useTerm, useConsole } from 'inkx'

// Render functions
import { render, renderSync, renderStatic, renderString } from 'inkx'

// Layout engine (for manual control - usually not needed)
import { setLayoutEngine, initYogaEngine, createFlexxEngine } from 'inkx'

// Term primitives (re-exported from chalkx - prefer importing from inkx)
import { createTerm, patchConsole, type Term, type StyleChain, type PatchedConsole } from 'inkx'

// Testing
import { createRenderer, bufferToText, stripAnsi, keyToAnsi, debugTree } from 'inkx/testing'
```

## Common Patterns

### Basic Interactive App

```tsx
import { render, Box, Text, useInput, useApp, useTerm, createTerm } from 'inkx'

function App() {
  const { exit } = useApp()
  const term = useTerm()

  useInput((input, key) => {
    if (input === 'q' || key.escape) exit()
  })

  return (
    <Box flexDirection="column">
      <Text>{term.green('Press q to quit')}</Text>
    </Box>
  )
}

// Element first, then term
using term = createTerm()
await render(<App />, term)
```

### Console Capture

```tsx
import { render, Box, Text, Console, createTerm, patchConsole, type PatchedConsole } from 'inkx'

function App({ console: patched }: { console: PatchedConsole }) {
  return (
    <Box flexDirection="column">
      <Console console={patched} />
      <Text>Status: running</Text>
    </Box>
  )
}

{
  using term = createTerm()
  using patched = patchConsole(console)
  const app = await render(<App console={patched} />, term)

  // Console.log calls now appear in <Console />
  console.log('This appears above the status line')

  await app.waitUntilExit()
}
```

### Static Rendering (No Terminal)

For one-shot CLI output, CI, or piped output where you don't need a terminal:

```tsx
import { render, renderStatic, Box, Text } from 'inkx'

// Option 1: render() without term - auto-detects static mode
const output = await render(<Summary stats={stats} />)

// Option 2: renderStatic() - explicit convenience function
const output = await renderStatic(<Summary stats={stats} />)
console.log(output)

// Plain text (no ANSI codes) for piped output
const plain = await renderStatic(<Report />, { plain: true })

// Custom width for layout
const wide = await renderStatic(<Table />, { width: 120 })
```

### Layout Feedback (Main Feature)

```tsx
import { Box, Text, useContentRect } from 'inkx'

function ResponsiveCard() {
  // Components know their size - no width prop threading needed
  const { width, height } = useContentRect()
  return <Text>{`Size: ${width}x${height}`}</Text>
}
```

### Access Term in Components

```tsx
import { useTerm } from 'inkx'

function ColoredOutput() {
  const term = useTerm()

  // Use term's capabilities
  if (term.hasColor()) {
    return <Text>{term.green('✓')} Passed</Text>
  }
  return <Text>[OK] Passed</Text>
}
```

### Testing Components (App API)

```tsx
import { createRenderer } from 'inkx/testing'
import { Text, Box } from 'inkx'

const render = createRenderer({ cols: 80, rows: 24 })

test('renders content', () => {
  const app = render(
    <Box id="main">
      <Text>Hello</Text>
    </Box>
  )

  // Plain text (no ANSI) - use for assertions
  expect(app.text).toContain('Hello')

  // ANSI output (with colors) - use for debugging with visual inspection
  console.log(app.ansi)

  // Auto-refreshing locators (no stale locator problem!)
  expect(app.getByText('Hello').count()).toBe(1)
  expect(app.locator('#main').boundingBox()?.width).toBe(80)

  // Debug output
  app.debug()
})
```

### Querying by ID vs testID

Two ways to identify components for testing:

```tsx
// Option 1: id prop with #id selector (preferred - matches CSS conventions)
<Box id="sidebar">...</Box>
app.locator('#sidebar').textContent()

// Option 2: testID prop with getByTestId (React Testing Library style)
<Box testID="sidebar">...</Box>
app.getByTestId('sidebar').textContent()
```

Both work identically. Use `id` for consistency with CSS selectors, or `testID` if you prefer the React Testing Library convention.
```

### Keyboard Input Testing

Use `app.press()` for Playwright-style keyboard input:

```tsx
import { createRenderer } from 'inkx/testing'

const render = createRenderer({ cols: 80, rows: 24 })

test('handles keyboard input', async () => {
  const app = render(<MyComponent />)

  // Single keys (awaitable, chainable)
  await app.press('Enter')
  await app.press('Escape')
  await app.press('ArrowUp')
  await app.press('ArrowDown')
  await app.press('Tab')

  // Modifier combinations
  await app.press('Control+c')
  await app.press('Control+d')
  await app.press('Shift+Tab')

  expect(app.text).toContain('expected result')
})
```

### Auto-refreshing Locators

The key innovation: locators re-evaluate on every access, eliminating stale locator bugs:

```tsx
test('locators auto-refresh after input', async () => {
  const app = render(<Board />)
  const cursor = app.locator('[data-cursor]')

  // Same locator object, but result updates after state change
  expect(cursor.textContent()).toBe('item1')
  await app.press('j')
  expect(cursor.textContent()).toBe('item2')  // Auto-refreshed!
})
```

### Terminal Access

```tsx
test('inspect terminal buffer', () => {
  const app = render(<MyComponent />)

  // Screen-space access via app.term
  const cell = app.term.cell(10, 5)
  const node = app.term.nodeAt(10, 5)

  console.log(app.term.text)
  console.log(app.term.columns, app.term.rows)
})
```

### Debugging Tests

```tsx
import { createRenderer, debugTree } from 'inkx/testing'

const render = createRenderer({ cols: 80, rows: 24 })

test('debugging example', () => {
  const app = render(<MyComponent />)

  // Print current frame (plain text)
  app.debug()

  // For colored output (debugging visual issues)
  console.log(app.ansi)

  // For plain text output (assertions, comparisons)
  console.log(app.text)
})
```

### Debugging TUI at Runtime

When debugging a live TUI app, use `DEBUG_LOG` to write debug output to a file (since the terminal is occupied by the TUI):

```bash
# Write debug output to file instead of terminal
DEBUG=inkx:* DEBUG_LOG=/tmp/inkx.log bun km view /path

# In another terminal, watch the log
tail -f /tmp/inkx.log
```

**Debug namespaces:**
- `inkx:*` - All inkx internals
- `inkx:render` - Render cycle
- `inkx:useInput` - Keyboard input handling
- `inkx:scheduler` - React scheduler
- `inkx:pipeline` - Render pipeline
- `flexx:layout` - Layout calculations (in flexx, not inkx)

**Adding debug statements:**
```typescript
import createDebug from 'debug'
const debug = createDebug('inkx:myfeature')

debug('state change', { before, after })
```

## React Compatibility

### forwardRef on Box/Text

Box and Text support `forwardRef` for imperative access to layout information:

```tsx
import { useRef } from 'react'
import { Box, Text, type BoxHandle, type TextHandle } from 'inkx'

function MyComponent() {
  const boxRef = useRef<BoxHandle>(null)
  const textRef = useRef<TextHandle>(null)

  useEffect(() => {
    // BoxHandle methods
    const node = boxRef.current?.getNode()           // Yoga/Flexx node
    const content = boxRef.current?.getContentRect() // { x, y, width, height }
    const screen = boxRef.current?.getScreenRect()   // absolute screen coords

    // TextHandle methods
    const textNode = textRef.current?.getNode()
  }, [])

  return (
    <Box ref={boxRef}>
      <Text ref={textRef}>Content</Text>
    </Box>
  )
}
```

### onLayout Callback

Box accepts an `onLayout` prop called when layout changes:

```tsx
<Box onLayout={(layout) => console.log('Size:', layout.width, layout.height)}>
  <Text>Resizable content</Text>
</Box>
```

The `layout` object contains `{ x, y, width, height }` in content coordinates.

### ErrorBoundary Component

Catch render errors with the built-in ErrorBoundary:

```tsx
import { ErrorBoundary, Box, Text } from 'inkx'

<ErrorBoundary fallback={<Text color="red">Something went wrong</Text>}>
  <MyComponent />
</ErrorBoundary>
```

For custom error handling, pass a render function:

```tsx
<ErrorBoundary fallback={(error) => <Text color="red">{error.message}</Text>}>
  <MyComponent />
</ErrorBoundary>
```

### Concurrent Features

Re-exports from React for TUI responsiveness:

```tsx
import { useTransition, useDeferredValue, useId } from 'inkx'

function Search() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)  // Typing stays responsive
  const [isPending, startTransition] = useTransition()

  // Heavy updates marked as low-priority
  startTransition(() => loadMoreData())
}
```

### Suspense Support

Full React Suspense support for data fetching with `hideInstance`/`unhideInstance` implementation:

```tsx
import { Suspense } from 'react'
import { Box, Text } from 'inkx'

<Suspense fallback={<Text>Loading...</Text>}>
  <AsyncDataComponent />
</Suspense>
```

Components that throw promises will show the fallback until resolved. The suspended component is hidden (not unmounted), preserving state.

## Anti-Patterns

### Wrong: Mixing chalk backgrounds with Box backgroundColor

```tsx
// WRONG - causes visual artifacts, inkx throws by default
<Box backgroundColor="cyan">
  <Text>{chalk.bgBlack('text')}</Text>
</Box>

// RIGHT - use bgOverride from chalkx if intentional
import { bgOverride } from 'chalkx'
<Box backgroundColor="cyan">
  <Text>{bgOverride(chalk.bgBlack('text'))}</Text>
</Box>
```

### Wrong: Using .style() (removed API)

```tsx
// WRONG - .style() method was removed from chalkx
const term = useTerm()
term.style().red('error')

// RIGHT - term IS the style chain directly
const term = useTerm()
term.red('error')
term.bold.green('success')
```

### Wrong: Importing from chalkx when using inkx

```tsx
// WRONG - unnecessary extra import
import { createTerm } from 'chalkx'
import { render, Box, Text } from 'inkx'

// RIGHT - inkx re-exports term primitives
import { render, Box, Text, createTerm, type Term } from 'inkx'

// EXCEPTION: Extended ANSI features not re-exported by inkx
import { curlyUnderline, hyperlink } from 'chalkx'
```

### Wrong: Not awaiting async render

```tsx
// WRONG - render() is async
render(<App />, term)

// RIGHT
await render(<App />, term)
```

### Wrong: Using old createLocator pattern

```tsx
// WRONG - stale locators, manual refresh needed
const { getContainer } = render(<App />)
const locator = createLocator(getContainer())
stdin.write('j')
const freshLocator = createLocator(getContainer())  // Must manually refresh!

// RIGHT - auto-refreshing locators
const app = render(<App />)
const cursor = app.locator('[data-cursor]')
await app.press('j')
expect(cursor.textContent()).toBe('item2')  // Same locator, fresh result!
```

### Wrong: Old term-first render order

```tsx
// WRONG - old API (term first)
await render(term, <App />)

// RIGHT - new API (element first)
await render(<App />, term)
```

### Wrong: Using lastFrame() or frames array

```tsx
// WRONG - old way, returns ANSI from frames array
const frame = app.lastFrame()
const text = stripAnsi(frame)
const allFrames = app.frames  // also deprecated

// RIGHT - use app.text or app.ansi directly
const text = app.text   // plain text (no ANSI)
const ansi = app.ansi   // with ANSI styling
```

### Wrong: Using stdin.write() for keyboard input

```tsx
// WRONG - manual ANSI sequences
app.stdin.write('\x1b[A')  // up arrow
app.stdin.write('j')

// RIGHT - Playwright-style API
await app.press('ArrowUp')
await app.press('j')
```

### Wrong: Using getContainer() for locators

```tsx
// WRONG - stale results, manual refresh needed
const root = app.getContainer()
const locator = createLocator(root)

// RIGHT - auto-refreshing locators via app
const locator = app.locator('#main')
const item = app.getByTestId('item')
```

## Style Props Reference

### Text Component Style Props

| Prop | Type | Description |
|------|------|-------------|
| `color` | string | Foreground color (named, hex, or rgb()) |
| `backgroundColor` | string | Background color |
| `bold` | boolean | Bold text |
| `dim` | boolean | Dimmed text |
| `italic` | boolean | Italic text |
| `underline` | boolean | Simple underline |
| `underlineStyle` | UnderlineStyle | `'single'` \| `'double'` \| `'curly'` \| `'dotted'` \| `'dashed'` |
| `underlineColor` | string | Underline color (independent of text color) |
| `strikethrough` | boolean | Strikethrough text |
| `inverse` | boolean | Swap foreground/background |

### UnderlineStyle Values

| Value | SGR Code | Description |
|-------|----------|-------------|
| `'single'` | 4:1 | Standard single underline |
| `'double'` | 4:2 | Double underline |
| `'curly'` | 4:3 | Wavy/curly underline (errors) |
| `'dotted'` | 4:4 | Dotted underline |
| `'dashed'` | 4:5 | Dashed underline |

### Style Layering

inkx uses category-based style merging that preserves semantic information:

```
┌─────────────────┬───────────────────────────────────────────┐
│ Category        │ Merge Behavior                            │
├─────────────────┼───────────────────────────────────────────┤
│ Container (bg)  │ Higher layer REPLACES lower               │
│ Text (fg)       │ Higher layer REPLACES lower               │
├─────────────────┼───────────────────────────────────────────┤
│ Decorations     │ PRESERVED through layers (OR merge)       │
│ (underline*,    │ underlineColor preserved independently    │
│  strikethrough) │                                           │
├─────────────────┼───────────────────────────────────────────┤
│ Emphasis        │ PRESERVED through layers (OR merge)       │
│ (bold, dim,     │                                           │
│  italic)        │                                           │
├─────────────────┼───────────────────────────────────────────┤
│ Transform       │ Applied LAST, not inherited               │
│ (inverse)       │ Swaps final fg/bg after all merging       │
└─────────────────┴───────────────────────────────────────────┘
```

### Usage Example: Selection with Preserved Decorations

```tsx
// Selection overlay preserves error underline
<Text
  color={isSelected ? 'black' : statusColor}
  backgroundColor={isSelected ? 'yellow' : undefined}
  underlineStyle={isOverdue ? 'curly' : undefined}
  underlineColor={isOverdue ? 'red' : undefined}
>
  {icon} {title}
</Text>
```

## Scrollable Containers

Box supports `overflow="scroll"` for creating scrollable regions with virtualized rendering.

### Basic Scrolling

```tsx
// Scrollable list with 100 items, only visible ones render
<Box overflow="scroll" height={10} scrollTo={selectedIndex}>
  {items.map((item, i) => (
    <Text key={i}>{item.name}</Text>
  ))}
</Box>
```

### Scroll Props

| Prop | Type | Description |
|------|------|-------------|
| `overflow` | `'visible'` \| `'hidden'` \| `'scroll'` | Overflow behavior |
| `scrollTo` | `number` | Child index to ensure visible (scroll to if off-screen) |
| `overflowIndicator` | `boolean` | Show ▲N/▼N indicators for hidden items |

### Overflow Indicators

For **bordered** containers, indicators appear on the border automatically:

```tsx
<Box overflow="scroll" height={10} borderStyle="single" scrollTo={cursor}>
  {items}  {/* Shows ───▲5─── on top border if 5 items hidden */}
</Box>
```

For **borderless** containers, use `overflowIndicator` to show indicators overlaid on content:

```tsx
<Box overflow="scroll" height={10} scrollTo={cursor} overflowIndicator>
  {items}  {/* Shows ▲5 at top-right, ▼3 at bottom-right */}
</Box>
```

### Scroll State

The scroll phase calculates which children are visible and stores state on the node:

```typescript
node.scrollState = {
  offset: number;           // Current scroll offset in rows
  contentHeight: number;    // Total content height
  viewportHeight: number;   // Visible height
  firstVisibleChild: number;
  lastVisibleChild: number;
  hiddenAbove: number;      // Count hidden above viewport
  hiddenBelow: number;      // Count hidden below viewport
}
```

### Sticky Headers

Children with `position="sticky"` pin to container edges when scrolled:

```tsx
<Box overflow="scroll" height={20} scrollTo={cursor}>
  <Box position="sticky" stickyTop={0}>
    <Text bold>Header (always visible)</Text>
  </Box>
  {items.map((item, i) => <Text key={i}>{item}</Text>)}
</Box>
```

## VirtualList Component

For large lists, use `VirtualList` for **React-level virtualization**. Unlike `overflow="scroll"` which only skips *rendering* non-visible children, VirtualList prevents React from *creating* elements for off-screen items.

### Basic Usage

```tsx
import { VirtualList } from 'inkx';

<VirtualList
  items={allCards}
  height={20}
  itemHeight={1}
  scrollTo={selectedIndex}
  renderItem={(card, index) => (
    <Text key={card.id}>{card.name}</Text>
  )}
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `items` | `T[]` | required | Array of items to render |
| `height` | `number` | required | Viewport height in rows |
| `itemHeight` | `number` | 1 | Height per item in rows |
| `scrollTo` | `number` | - | Index to keep visible |
| `overscan` | `number` | 5 | Extra items above/below viewport |
| `maxRendered` | `number` | 100 | Max items to render at once |
| `renderItem` | `(item, index) => ReactNode` | required | Render function |
| `keyExtractor` | `(item, index) => string` | - | Custom key function |
| `overflowIndicator` | `boolean` | - | Show ▲N/▼N indicators |
| `width` | `number` | - | Optional fixed width |

### When to Use

| Scenario | Component |
|----------|-----------|
| Small lists (<100 items) | `Box overflow="scroll"` |
| Large lists (100+ items) | `VirtualList` |
| Dynamic item heights | `Box overflow="scroll"` |
| Known fixed item heights | `VirtualList` (faster) |

### Performance Comparison

```tsx
// Box overflow="scroll" - React creates ALL elements, inkx skips rendering
<Box overflow="scroll" height={10}>
  {items.map(i => <Text>{i}</Text>)}  // 10,000 React elements created
</Box>

// VirtualList - React only creates VISIBLE elements
<VirtualList
  items={items}
  height={10}
  renderItem={(i) => <Text>{i}</Text>}  // ~110 React elements (100 + overscan)
/>
```

### With Selection State

```tsx
const renderCard = useCallback((card, index) => {
  const isSelected = index === selectedIndex;
  return <Card key={card.id} card={card} isSelected={isSelected} />;
}, [selectedIndex]);

<VirtualList
  items={cards}
  height={height}
  scrollTo={selectedIndex}
  renderItem={renderCard}
  keyExtractor={(card) => card.id}
/>
```

## Key Exports

| Export | Description |
|--------|-------------|
| `render(element, term?)` | Render element; term optional for static mode |
| `renderSync(element, term?)` | Sync render (requires layout engine initialized) |
| `renderStatic(element, opts?)` | Convenience for static one-shot rendering |
| `renderString(element, opts?)` | Render to string (alias for static mode) |
| `Console` | Renders captured console output |
| `useTerm()` | Access Term in components |
| `useConsole(patched)` | Subscribe to console entries |
| `Box`, `Text`, etc | UI components |
| `useContentRect()` | Get component dimensions |
| `useInput()` | Keyboard input |
| `createTerm()` | Create Term instance (re-exported from chalkx) |
| `patchConsole()` | Capture console output (re-exported from chalkx) |
| `mergeStyles()` | Category-based style merging function |
| `Term`, `StyleChain` | Types (re-exported from chalkx) |
| `setLayoutEngine(engine)` | Manually set layout engine instance |

## Background Conflict Detection

When using **both** chalk background colors **and** inkx `backgroundColor` on the same text, visual artifacts occur: chalk only colors text characters, while inkx fills the entire box area.

inkx detects this conflict and **throws by default**:

```tsx
// This throws - chalk.bg* + inkx backgroundColor = visual bugs
<Box backgroundColor="cyan">
  <Text>{chalk.bgBlack("text")}</Text>
</Box>
```

**Configuration** via `INKX_BG_CONFLICT` environment variable:
- `throw` (default) — Throw error on conflict
- `warn` — Console warning (deduplicated)
- `ignore` — No detection

**Intentional override** with `@beorn/chalkx`:

```tsx
import { bgOverride } from "@beorn/chalkx";

<Box backgroundColor="cyan">
  <Text>{bgOverride(chalk.bgBlack("intentional"))}</Text>
</Box>
```

## Key Differences from Ink

1. **Element-first rendering**: `render(<App />, term)` - element first, term optional
2. **Static mode**: `render(<App />)` without term renders once and exits
3. **Layout feedback**: `useContentRect()` / `useScreenRect()` give actual dimensions
4. **Term context**: `useTerm()` provides terminal capabilities to components
5. **Console capture**: `<Console />` component displays captured output
6. **Named exports only**: No default export
