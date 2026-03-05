# Migration from Ink

inkx is designed as a drop-in replacement for Ink. Most apps require only an import change.

## Quick Start

### Step 1: Install inkx

```bash
# Replace ink with inkx
bun remove ink ink-testing-library
bun add @hightea/term
```

### Step 2: Update Imports

```diff
- import { Box, Text, render, useInput, useApp } from 'ink';
+ import { Box, Text, render, useInput, useApp, createTerm } from '@hightea/term';

- import { render } from 'ink-testing-library';
+ import { render } from '@hightea/term/testing';
```

### Step 3: Update render() Calls

```diff
- render(<App />);
+ using term = createTerm();
+ await render(<App />, term);
```

### Step 4: Run Tests

```bash
bun test
```

Most apps should work at this point.

## What Works Identically

These APIs are 100% compatible:

| Category       | APIs                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| **Components** | `<Box>`, `<Text>`, `<Newline>`, `<Spacer>`, `<Static>`                   |
| **Hooks**      | `useInput()`, `useApp()`, `useStdout()`                                  |
| **Styling**    | All Chalk styles work unchanged                                          |
| **Flexbox**    | All flexbox props (direction, justify, align, wrap, grow, shrink, basis) |
| **Borders**    | All border styles (single, double, round, bold, etc.)                    |

## What's Different

### 1. Term-First Rendering (Required)

**Ink**: Render with just the element.

```tsx
// Ink
render(<App />)
```

**inkx**: Create a term first.

```tsx
// inkx
using term = createTerm()
await render(<App />, term)
```

This enables `useTerm()` in components for terminal capabilities.

### 2. Components Know Their Size (The Big Win)

**Ink**: Must manually thread width props.

```tsx
// Ink: Width must be passed down
function Card({ width }: { width: number }) {
  return <Text>{truncate(title, width)}</Text>
}

;<Card width={availableWidth - padding * 2} />
```

**inkx**: Components can ask for their size.

```tsx
// inkx: Just ask
function Card() {
  const { width } = useContentRect()
  return <Text>{truncate(title, width)}</Text>
}

;<Card />
```

### 3. Text Auto-Truncates

**Ink**: Text overflows its container.

```tsx
// Ink: Broken layout
<Box width={10}>
  <Text>This is a very long text</Text>
</Box>
// Output: "This is a very long text" (overflows)
```

**inkx**: Text truncates to fit.

```tsx
// inkx: Clean truncation
<Box width={10}>
  <Text>This is a very long text</Text>
</Box>
// Output: "This is a..."

// Opt out if needed
<Text wrap={false}>This overflows intentionally</Text>
```

**Migration**: If you rely on overflow, add `wrap={false}`.

### 4. First Render Shows Zeros

**Ink**: Components render once with final output.

**inkx**: Components using `useContentRect()` render twice. First render has `{ width: 0, height: 0 }`, second has actual values.

```tsx
function Header() {
  const { width } = useContentRect()
  // First render: width=0
  // Second render: width=80
  return <Text>{"=".repeat(width)}</Text>
}
```

This is usually invisible (both renders happen before first paint). Add a guard if needed:

```tsx
function Header() {
  const { width } = useContentRect()
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

**inkx**: Just render everything.

```tsx
// inkx: No config needed
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map((item) => (
    <Card key={item.id} item={item} />
  ))}
</Box>
```

**Migration**: Replace virtualization components with `overflow="scroll"`.

### 6. measureElement() -> useContentRect()

**Ink**: Use `measureElement()` after render.

```tsx
const ref = useRef()
const { width } = measureElement(ref.current)
// Need manual re-render to use width
```

**inkx**: `measureElement()` works for compatibility, but `useContentRect()` is simpler.

```tsx
const { width } = useContentRect()
// Automatically re-renders with correct values
```

### 7. Hook Naming

**Ink**: `useLayout` (if available)

**inkx**: `useContentRect()` is preferred. `useLayout` is a deprecated alias.

```diff
- const { width } = useLayout();
+ const { width } = useContentRect();
```

## Known Incompatibilities

### By Design

| Behavior                | Ink       | inkx      | Reason                       |
| ----------------------- | --------- | --------- | ---------------------------- |
| Text overflow           | Overflows | Truncates | Better default               |
| First render dimensions | N/A       | Zeros     | Required for layout feedback |
| Internal APIs           | Exposed   | Hidden    | Not public API               |

### Edge Cases

| Issue             | Symptoms      | Workaround                          |
| ----------------- | ------------- | ----------------------------------- |
| Rapid re-renders  | Flicker       | inkx coalesces frames; usually fine |
| Deep nesting      | Slower layout | Flatten tree if possible            |
| Custom reconciler | Breaks        | Not supported                       |

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

### After (inkx)

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
