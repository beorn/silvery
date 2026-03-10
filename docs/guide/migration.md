# Migration from Ink

Silvery is a drop-in replacement for Ink. Change your imports, and your app works.

## Quick Start

### Step 1: Install Silvery

```bash
bun remove ink ink-testing-library
bun add silvery
```

### Step 2: Update Imports

```diff
- import { Box, Text, render, useInput, useApp } from 'ink';
+ import { Box, Text, render, useInput, useApp } from 'silvery';

- import { render } from 'ink-testing-library';
+ import { render } from '@silvery/test';
```

That's it. `render(<App />)` works without any term parameter — just add `await`:

```tsx
// Ink
const { unmount, waitUntilExit } = render(<App />)

// Silvery — just add await
const { unmount, waitUntilExit } = await render(<App />)
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
const { unmount, waitUntilExit } = await render(<App />, term)
```

**Why use `createTerm()`?**

- **Different contexts**: Swap term configurations for production, testing, or CI (colors, dimensions, capabilities).
- **Better testing**: Mock terms that capture output, simulate terminal sizes, or disable colors.
- **Explicit cleanup**: The `using` keyword (TC39 Explicit Resource Management) automatically restores cursor, raw mode, and alternate screen when the scope exits.

Without `createTerm()`, Silvery creates a default term internally — matching Ink's behavior exactly.

::: tip Why is render() async?
`render()` returns a handle synchronously (like Ink), but `await`-ing it waits for layout engine initialization. With Flexily (the default), this is near-instant — just a dynamic `import()`. With Yoga, it's a genuine WASM compilation step. For fully synchronous rendering, use `renderSync()` after initializing the engine manually. Most apps should just `await render(<App />)`.
:::

## What Works Identically

These APIs are 100% compatible:

| Category       | APIs                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| **Render**     | `render(<App />)` — no term parameter needed                             |
| **Components** | `<Box>`, `<Text>`, `<Newline>`, `<Spacer>`, `<Static>`                   |
| **Hooks**      | `useInput()`, `useApp()`, `useStdout()`                                  |
| **Styling**    | All Chalk styles work unchanged                                          |
| **Flexbox**    | All flexbox props (direction, justify, align, wrap, grow, shrink, basis) |
| **Borders**    | All border styles (single, double, round, bold, etc.)                    |

## What's Different

### 1. Components Know Their Size

**Ink**: Must manually thread width props.

```tsx
// Ink: Width must be passed down
function Card({ width }: { width: number }) {
  return <Text>{truncate(title, width)}</Text>
}

;<Card width={availableWidth - padding * 2} />
```

**Silvery**: Components can ask for their size.

```tsx
// Silvery: Just ask
function Card() {
  const { width } = useContentRect()
  return <Text>{truncate(title, width)}</Text>
}

;<Card />
```

### 2. Text Wraps by Default

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

### 3. Initial Render Dimensions

Silvery's `useContentRect()` returns `{ width: 0, height: 0 }` during the very first render pass of a component. The framework then runs layout and immediately triggers a second render with actual dimensions — both passes complete before any output reaches the terminal.

This is fundamentally different from Ink's `useBoxMetrics()`, which requires a visible re-render cycle via `useEffect`. In Silvery, the zeros are invisible to the user — they exist only as an internal implementation detail of the two-phase rendering pipeline.

If your component does math with width/height (like `"=".repeat(width)`), add a guard:

```tsx
function Header() {
  const { width } = useContentRect()
  if (width === 0) return null // Skip first layout pass
  return <Text>{"=".repeat(width)}</Text>
}
```

Most components work fine without a guard — `width: 0` just means "nothing to render yet" and the real dimensions arrive before the first paint.

### 4. Scrolling Just Works

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

### 5. measureElement() -> useContentRect()

**Ink**: Use `measureElement()` with a ref and `useEffect` to measure after render.

```tsx
// Ink
const ref = useRef()
useEffect(() => {
  const { width } = measureElement(ref.current)
  setWidth(width)
}, [])
return <Box ref={ref}>...</Box>
```

**Silvery**: `measureElement()` works for compatibility, but `useContentRect()` is simpler — no ref, no effect, no state.

```tsx
// Silvery
const { width } = useContentRect()
return <Box>...</Box> // No ref needed
```

### 6. Hook Naming

**Ink**: `useLayout` (if available)

**Silvery**: `useContentRect()` is preferred. `useLayout` is a deprecated alias.

```diff
- const { width } = useLayout();
+ const { width } = useContentRect();
```

## Known Incompatibilities

### By Design

| Behavior                | Ink       | Silvery | Reason                         |
| ----------------------- | --------- | ------- | ------------------------------ |
| Default flexDirection   | row       | row     | Now aligned with CSS/Ink       |
| Text overflow           | Overflows | Wraps   | Better default                 |
| First render dimensions | N/A       | Zeros   | Required for responsive layout |
| Internal APIs           | Exposed   | Hidden  | Not public API                 |

::: tip Default Flex Direction
Both Ink and Silvery default `<Box>` to `flexDirection="row"`, matching the W3C CSS spec.
:::

### ANSI Encoding Differences

Silvery and Ink/Chalk produce visually identical terminal output but different byte sequences. Silvery uses full SGR reset (`\x1b[0m`) instead of per-attribute closes (`\x1b[39m`, `\x1b[22m`).

**Impact**: Test assertions that compare exact ANSI strings will fail. Use `stripAnsi()` for content assertions instead:

```diff
- expect(lastFrame()).toBe(chalk.green('hello'))
+ expect(stripAnsi(lastFrame())).toBe('hello')
```

### Community Package Mapping

| Ink Package           | Silvery Equivalent         |
| --------------------- | -------------------------- |
| `ink-spinner`         | `@silvery/ui` `Spinner`    |
| `ink-select-input`    | `@silvery/ui` `SelectList` |
| `ink-text-input`      | `@silvery/ui` `TextInput`  |
| `ink-table`           | `@silvery/ui` `Table`      |
| `ink-testing-library` | `@silvery/test`            |
| `ink-link`            | `Link` (built-in)          |

Missing a package mapping? [File an issue](https://github.com/beorn/silvery/issues) or contribute a component.

## Migrating Tests

If you used `ink-testing-library`:

```bash
bun remove ink-testing-library
bun add @silvery/test
```

```diff
- import { render } from 'ink-testing-library'
+ import { createRenderer } from '@silvery/test'

- const { lastFrame } = render(<App />)
- expect(lastFrame()).toContain('hello')
+ const renderer = createRenderer(<App />)
+ expect(renderer.root).toContainText('hello')
```

`@silvery/test` provides auto-refreshing locators (`getByTestId`, `getByText`) and buffer assertions. See the [testing guide](/guide/testing) for details.

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
  const { width } = useContentRect()
  // Use width only where actually needed
}
```

## Getting Help

- **GitHub Issues**: Report bugs or request features
- **Migration Problems**: Tag issue with `migration`
