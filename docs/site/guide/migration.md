# Migration from Ink

InkX is designed as a drop-in replacement for Ink. Most apps require only an import change.

## Quick Start

### Step 1: Install InkX

```bash
# Replace ink with inkx
bun remove ink ink-testing-library
bun add inkx inkx-testing-library
```

### Step 2: Update Imports

```diff
- import { Box, Text, render, useInput, useApp } from 'ink';
+ import { Box, Text, render, useInput, useApp } from 'inkx';

- import { render } from 'ink-testing-library';
+ import { render } from 'inkx-testing-library';
```

### Step 3: Run Tests

```bash
bun test
```

Most apps should work at this point.

## What Works Identically

These APIs are 100% compatible:

| Category | APIs |
|----------|------|
| **Components** | `<Box>`, `<Text>`, `<Newline>`, `<Spacer>`, `<Static>` |
| **Hooks** | `useInput()`, `useApp()`, `useStdout()`, `useStdin()` |
| **Render** | `render()`, `render(element, options)` |
| **Styling** | All Chalk styles work unchanged |
| **Flexbox** | All flexbox props (direction, justify, align, wrap, grow, shrink, basis) |
| **Borders** | All border styles (single, double, round, bold, etc.) |

## What's Different

### 1. Components Know Their Size (The Big Win)

**Ink**: Must manually thread width props.

```tsx
// Ink: Width must be passed down
function Card({ width }: { width: number }) {
  return <Text>{truncate(title, width)}</Text>;
}

<Card width={availableWidth - padding * 2} />
```

**InkX**: Components can ask for their size.

```tsx
// InkX: Just ask
function Card() {
  const { width } = useLayout();
  return <Text>{truncate(title, width)}</Text>;
}

<Card />
```

### 2. Text Auto-Truncates

**Ink**: Text overflows its container.

```tsx
// Ink: Broken layout
<Box width={10}>
  <Text>This is a very long text</Text>
</Box>
// Output: "This is a very long text" (overflows)
```

**InkX**: Text truncates to fit.

```tsx
// InkX: Clean truncation
<Box width={10}>
  <Text>This is a very long text</Text>
</Box>
// Output: "This is a…"

// Opt out if needed
<Text wrap={false}>This overflows intentionally</Text>
```

**Migration**: If you rely on overflow, add `wrap={false}`.

### 3. First Render Shows Zeros

**Ink**: Components render once with final output.

**InkX**: Components using `useLayout()` render twice. First render has `{ width: 0, height: 0 }`, second has actual values.

```tsx
function Header() {
  const { width } = useLayout();
  // First render: width=0
  // Second render: width=80
  return <Text>{"=".repeat(width)}</Text>;
}
```

This is usually invisible (both renders happen before first paint). Add a guard if needed:

```tsx
function Header() {
  const { width } = useLayout();
  if (width === 0) return null;
  return <Text>{"=".repeat(width)}</Text>;
}
```

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

**InkX**: Just render everything.

```tsx
// InkX: No config needed
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map(item => <Card key={item.id} item={item} />)}
</Box>
```

**Migration**: Replace virtualization components with `overflow="scroll"`.

### 5. measureElement() → useLayout()

**Ink**: Use `measureElement()` after render.

```tsx
const ref = useRef();
const { width } = measureElement(ref.current);
// Need manual re-render to use width
```

**InkX**: `measureElement()` works for compatibility, but `useLayout()` is simpler.

```tsx
const { width } = useLayout();
// Automatically re-renders with correct values
```

## Known Incompatibilities

### By Design

| Behavior | Ink | InkX | Reason |
|----------|-----|------|--------|
| Text overflow | Overflows | Truncates | Better default |
| First render dimensions | N/A | Zeros | Required for layout feedback |
| Internal APIs | Exposed | Hidden | Not public API |

### Edge Cases

| Issue | Symptoms | Workaround |
|-------|----------|------------|
| Rapid re-renders | Flicker | InkX coalesces frames; usually fine |
| Deep nesting | Slower layout | Flatten tree if possible |
| Custom reconciler | Breaks | Not supported |

## Removing Width Prop Threading

After migrating, you can simplify your code by removing manual width calculations:

### Before (Ink)

```tsx
function Board({ width }: { width: number }) {
  const colWidth = Math.floor((width - 2) / 3);
  return (
    <Box>
      <Column width={colWidth} />
      <Column width={colWidth} />
      <Column width={colWidth} />
    </Box>
  );
}

function Column({ width, items }) {
  return (
    <Box width={width}>
      {items.map(item => <Card width={width - 2} item={item} />)}
    </Box>
  );
}
```

### After (InkX)

```tsx
function Board() {
  return (
    <Box>
      <Column />
      <Column />
      <Column />
    </Box>
  );
}

function Column({ items }) {
  return (
    <Box flexGrow={1}>
      {items.map(item => <Card item={item} />)}
    </Box>
  );
}

function Card({ item }) {
  const { width } = useLayout();
  // Use width only where actually needed
}
```

## Getting Help

- **GitHub Issues**: Report bugs or request features
- **Migration Problems**: Tag issue with `migration`
