# Migration from Ink

Silvery is a drop-in replacement for Ink. Change your imports, and your app works.

## You Don't Have to Migrate

Silvery includes a full Ink compatibility layer. Just swap the import path:

```diff
- import { Box, Text, render } from "ink"
+ import { Box, Text, render } from "silvery/ink"
```

That's it. Your existing Ink app runs on Silvery's renderer — getting incremental rendering, layout feedback, and all the performance improvements for free. No other code changes needed.

When you're ready for the full Silvery API (and we recommend it eventually — the API is cleaner and more powerful), follow the migration steps below.

## Quick Start

### Step 1: Install Silvery

```bash
bun remove ink ink-testing-library
bun add silvery
```

### Step 2: Update Imports

```diff
- import { Box, Text, render, useInput, useApp } from 'ink'
+ import { Box, Text, render, useInput, useApp } from 'silvery'

- import { render } from 'ink-testing-library'
+ import { render } from '@silvery/test'
```

That's it. Silvery's `render()` is sync and returns a handle — call `.run()` to start the event loop:

```tsx
// Ink
const { unmount, waitUntilExit } = render(<App />)

// Silvery
const app = render(<App />)
await app.run()
```

### Step 3: Run Tests

```bash
bun test
```

Most apps should work at this point.

### Advanced: Explicit Terminal Control

For production apps that need more control, you can create a term explicitly:

```tsx
import { render, createTerm } from "silvery"

using term = createTerm()
const app = render(<App />, term)
await app.run()
```

**Why use `createTerm()`?**

- **Different contexts**: Swap term configurations for production, testing, or CI (colors, dimensions, capabilities).
- **Better testing**: Mock terms that capture output, simulate terminal sizes, or disable colors.
- **Explicit cleanup**: The `using` keyword (TC39 Explicit Resource Management) automatically restores cursor, raw mode, and alternate screen when the scope exits.

Without `createTerm()`, Silvery creates a default term internally — matching Ink's behavior exactly.

::: tip render() is synchronous
`render()` returns a `RenderHandle` synchronously. Call `.run()` to start the event loop — it returns a promise that resolves when the app exits. This two-step pattern gives you a chance to configure the handle before starting.
:::

## What Works Identically

These APIs are 100% compatible:

| Category       | APIs                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| **Render**     | `render(<App />)` -- no term parameter needed                            |
| **Components** | `<Box>`, `<Text>`, `<Newline>`, `<Spacer>`, `<Static>`                   |
| **Hooks**      | `useInput()`, `useApp()`, `useStdout()`, `useAnimation()`, `usePaste()`, `useCursor()`, `useBoxMetrics()`, `useWindowSize()`, `useIsScreenReaderEnabled()` |
| **Styling**    | All Chalk styles work unchanged                                          |
| **Flexbox**    | All flexbox props (direction, justify, align, wrap, grow, shrink, basis) |
| **Borders**    | All border styles (single, double, round, bold, etc.)                    |

## What's Different

### 1. Components Know Their Size (The Big Win)

**Ink**: Must manually thread width props.

```tsx
// Ink: Width must be passed down
function Card({ width }: { width: number }) {
  return <Text>{truncate(title, width)}</Text>
}

function App() {
  return <Card width={availableWidth - padding * 2} />
}
```

**Silvery**: Components can ask for their size.

```tsx
// Silvery: Just ask
function Card() {
  const { width } = useBoxRect()
  return <Text>{truncate(title, width)}</Text>
}

function App() {
  return <Card /> // No width prop needed!
}
```

::: info Why can't Ink do this with measureElement()?
This is the terminal equivalent of [CSS container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries) — components adapt to their container's size, not the viewport. The web spent a decade wanting this because the alternatives (media queries + JS measurement) had the same problems.

Ink's `measureElement()` is like `ResizeObserver` — it reads dimensions _after_ rendering. By the time you know the size, you've already drawn the wrong thing. Feeding dimensions back requires `useEffect` + `setState`, triggering a visible re-render. With nested responsive components (board → column → card), each level needs its own measure→rerender cycle — N nesting levels means N visible flickers.

Silvery's `useBoxRect()` is like container queries — the layout engine computes dimensions _before_ content renders, so all components get correct sizes in one batch. No flicker, no plumbing, no cascading re-renders.
:::

### 2. flexDirection Defaults to `row` (CSS spec)

**Ink**: Box defaults to `flexDirection="column"` (non-standard, but convenient for document flow).

**Silvery**: Box defaults to `flexDirection="row"` (W3C CSS spec). The root node and `<Screen>` still default to `column`.

```tsx
// Ink: children stack vertically by default
<Box>
  <Text>Line 1</Text>
  <Text>Line 2</Text>
</Box>
// Output:
// Line 1
// Line 2

// Silvery: children flow horizontally by default
<Box>
  <Text>Line 1</Text>
  <Text>Line 2</Text>
</Box>
// Output: Line 1Line 2
```

**Migration**: Add `flexDirection="column"` to any `<Box>` that relies on Ink's vertical stacking default. The root element and `<Screen>` already default to `column`, so top-level layouts usually work without changes.

::: tip Why not match Ink's default?
Silvery follows the CSS spec so that flexbox knowledge from web development transfers directly. See [Flexily vs Yoga Philosophy](/guide/silvery-vs-ink#flexily-vs-yoga-philosophy) for the full rationale. If you prefer exact Ink layout behavior, you can [use Yoga as the layout engine](/guide/silvery-vs-ink#flexily-vs-yoga-philosophy).
:::

### 3. Text Wraps by Default

**Ink**: Text overflows its container.

```tsx
// Ink: Broken layout
<Box width={10}>
  <Text>This is a very long text</Text>
</Box>
// Output: "This is a very long text" (overflows)
```

**Silvery**: Text wraps to fit its container by default (word-aware wrapping).

```tsx
// Silvery: Text wraps to container width
<Box width={10}>
  <Text>This is a very long text</Text>
</Box>
// Output:
// "This is a"
// "very long"
// "text"
```

You can also truncate with an ellipsis instead of wrapping:

```tsx
// Truncation modes
<Text wrap="truncate">This is a very long text</Text>      // "This is a…"
<Text wrap="truncate-start">This is a very long text</Text> // "…long text"
<Text wrap="truncate-middle">This is a very long text</Text> // "This…text"
```

**Migration**: If you rely on overflow, add `wrap={false}` to disable both wrapping and truncation.

### 4. First Render Shows Zeros

**Ink**: Components render once with final output.

**Silvery**: Components using `useBoxRect()` render twice. First render has `{ width: 0, height: 0 }`, second has actual values.

```tsx
function Header() {
  const { width } = useBoxRect()
  // First render: width=0
  // Second render: width=80
  return <Text>{"=".repeat(width)}</Text>
}
```

This is usually invisible (both renders happen before first paint). Add a guard if needed:

```tsx
function Header() {
  const { width } = useBoxRect()
  if (width === 0) return null
  return <Text>{"=".repeat(width)}</Text>
}
```

### 5. Scrolling Just Works

**Ink**: Manual virtualization with height estimation.

```tsx
// Ink: Complex setup
<ScrollableList
  items={items}
  height={availableHeight}
  estimateHeight={(item) => calculateHeight(item, width)}
  renderItem={(item) => <Card item={item} />}
/>
```

**Silvery**: Just render everything.

```tsx
// Silvery: No config needed
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map((item) => (
    <Card key={item.id} item={item} />
  ))}
</Box>
```

**Migration**: Replace virtualization components with `overflow="scroll"`.

### 6. measureElement() / useLayout() -> useBoxRect()

Replace `measureElement()` and `useLayout()` with `useBoxRect()` — see [section 1](#_1-components-know-their-size-the-big-win) above for why this is a significant upgrade, not just a rename.

```diff
- const ref = useRef()
- const { width } = measureElement(ref.current)
+ const { width } = useBoxRect()

- const { width } = useLayout()
+ const { width } = useBoxRect()
```

## Known Incompatibilities

### By Design

| Behavior                | Ink       | Silvery | Reason                         |
| ----------------------- | --------- | ------- | ------------------------------ |
| Default `flexDirection` | `column`  | `row`   | W3C CSS spec compliance        |
| Text overflow           | Overflows | Wraps   | Better default                 |
| First render dimensions | N/A       | Zeros   | Required for responsive layout |
| Internal APIs           | Exposed   | Hidden  | Not public API                 |

### Layout Engine Differences

If your Ink app uses advanced flexbox features (`flexWrap`, `alignContent`, percentage `flexBasis`, absolute positioning with offsets), the default Flexily layout engine may produce slightly different results than Yoga. This is because Flexily follows the CSS spec where Yoga diverges — see [Flexily vs Yoga Philosophy](/guide/silvery-vs-ink#flexily-vs-yoga-philosophy).

**For exact Ink layout parity**, install Yoga and switch the layout engine:

```bash
bun add yoga-wasm-web
```

```tsx
import { render } from "silvery"

const app = render(<App />, { layoutEngine: "yoga" })
await app.run()
```

Or set `SILVERY_ENGINE=yoga` to switch globally without code changes.

Most Ink apps use simple layouts that work identically in both engines.

## Removing Width Prop Threading

After migrating, you can simplify your code by removing manual width calculations:

### Before (Ink)

```tsx
function Board({ width }: { width: number }) {
  const colWidth = Math.floor((width - 2) / 3)
  return (
    <Box>
      <Column width={colWidth} />
      <Column width={colWidth} />
      <Column width={colWidth} />
    </Box>
  )
}

function Column({ width, items }) {
  return (
    <Box width={width}>
      {items.map((item) => (
        <Card width={width - 2} item={item} />
      ))}
    </Box>
  )
}
```

### After (Silvery)

```tsx
function Board() {
  return (
    <Box>
      <Column />
      <Column />
      <Column />
    </Box>
  )
}

function Column({ items }) {
  return (
    <Box flexGrow={1}>
      {items.map((item) => (
        <Card item={item} />
      ))}
    </Box>
  )
}

function Card({ item }) {
  const { width } = useBoxRect()
  // Use width only where actually needed
}
```

## Advanced: Plugin System

Silvery will offer a composable plugin system for complex apps that need to mix Ink compatibility adapters (focus, cursor) with Silvery-native APIs. This is coming in a future release — for now, `render()` covers all migration use cases.

## Getting Help

- **GitHub Issues**: Report bugs or request features
- **Migration Problems**: Tag issue with `migration`
