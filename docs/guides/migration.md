# Silvery Migration Guide

## Overview

Silvery is a drop-in replacement for Ink. Change your imports, and your app works.

---

## Quick Start

### Step 1: Install Silvery

```bash
bun remove ink ink-testing-library
bun add @silvery/term
```

### Step 2: Update Imports

```diff
- import { Box, Text, render, useInput, useApp } from 'ink';
+ import { Box, Text, render, useInput, useApp } from '@silvery/term';

- import { render } from 'ink-testing-library';
+ import { createRenderer } from '@silvery/term/testing';
```

That's it. `render(<App />)` works without any term parameter — just add `await`:

```typescript
// Ink
const { unmount, waitUntilExit } = render(<App />)

// silvery — just add await
const { unmount, waitUntilExit } = await render(<App />)
```

### Step 3: Run Tests

```bash
bun test
```

Most apps should work at this point. Read on for known differences.

### Advanced: Explicit Terminal Control

For production apps that need more control, you can create a term explicitly:

```typescript
import { render, createTerm } from '@silvery/term';

using term = createTerm();
const { unmount, waitUntilExit } = await render(<App />, term);
```

**Why use `createTerm()`?**

- **Different contexts**: Swap term configurations for production, testing, or CI (colors, dimensions, capabilities).
- **Better testing**: Mock terms that capture output, simulate terminal sizes, or disable colors.
- **Explicit cleanup**: The `using` keyword (TC39 Explicit Resource Management) automatically restores cursor, raw mode, and alternate screen when the scope exits.

Without `createTerm()`, Silvery creates a default term internally — matching Ink's behavior exactly.

---

## What Works Identically

These APIs are 100% compatible:

| Category       | APIs                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| **Components** | `<Box>`, `<Text>`, `<Newline>`, `<Spacer>`, `<Static>`                   |
| **Hooks**      | `useInput()`, `useApp()`, `useStdout()`                                  |
| **Render**     | `render(<App />)` — no term parameter needed                             |
| **Styling**    | All Chalk styles work unchanged                                          |
| **Flexbox**    | All flexbox props (direction, justify, align, wrap, grow, shrink, basis) |
| **Borders**    | All border styles (single, double, round, bold, etc.)                    |

---

## What's Different

### 1. Components Know Their Size (The Big Win)

**Ink**: Components don't know their computed dimensions.

```typescript
// Ink: Must manually thread width
function Card({ width }: { width: number }) {
  return <Text>{truncate(title, width)}</Text>;
}

// Parent must pass width down
<Card width={availableWidth - padding * 2} />
```

**Silvery**: Components can ask for their size.

```typescript
// silvery: Components know their size
function Card() {
  const { width } = useContentRect();
  return <Text>{truncate(title, width)}</Text>;
}

// No prop threading needed
<Card />
```

### 2. Text Wraps by Default

**Ink**: Text overflows its container.

```typescript
// Ink: Text overflows, breaks layout
<Box width={10}>
  <Text>This is a very long text that overflows</Text>
</Box>
// Output: "This is a very long text that overflows" (broken layout)
```

**Silvery**: Text wraps to fit its container by default (word-aware wrapping).

```typescript
// silvery: Text wraps to container width
<Box width={10}>
  <Text>This is a very long text that overflows</Text>
</Box>
// Output:
// "This is a"
// "very long"
// "text that"
// "overflows"
```

You can also truncate with an ellipsis instead of wrapping:

```typescript
// Truncation modes
<Text wrap="truncate">This is a very long text</Text>      // "This is a…"
<Text wrap="truncate-start">This is a very long text</Text> // "…long text"
<Text wrap="truncate-middle">This is a very long text</Text> // "This…text"
```

**Migration**: If you rely on overflow behavior, add `wrap={false}` to disable both wrapping and truncation.

### 3. First Render May Show Zeros

**Ink**: Components render once with final output.

**Silvery**: Components using `useContentRect()` render twice:

1. First render: dimensions are `{ width: 0, height: 0 }`
2. Second render: dimensions are correct

```typescript
function Header() {
  const { width } = useContentRect();
  // First render: width=0, renders ""
  // Second render: width=80, renders "=" × 80
  return <Text>{'='.repeat(width)}</Text>;
}
```

**Migration**: This is usually invisible (both renders happen before first paint). But if you have logic that breaks on `width=0`, add a guard:

```typescript
function Header() {
  const { width } = useContentRect();
  if (width === 0) return null; // Or <Text>Loading...</Text>
  return <Text>{'='.repeat(width)}</Text>;
}
```

### 4. Scrolling Just Works

**Ink**: You need to implement virtualization manually with height estimation.

```typescript
// Ink: Complex virtualization setup
<ScrollableList
  items={items}
  height={availableHeight}
  estimateHeight={(item) => calculateHeight(item, width)}
  renderItem={(item) => <Card item={item} />}
/>
```

**Silvery**: Just render everything. Silvery handles the rest.

```typescript
// silvery: No virtualization config needed
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map((item) => <Card key={item.id} item={item} />)}
</Box>
```

Silvery measures all children via Yoga (fast), then only renders content for visible ones (skipping the expensive part). No height estimation needed.

**Migration**: Replace custom virtualization components with `overflow="scroll"`.

### 5. measureElement() Still Works But useContentRect() Is Better

**Ink**: Use `measureElement()` to get dimensions after render.

```typescript
// Ink: Measure after render
const ref = useRef()
const { width } = measureElement(ref.current)
// Need to manually trigger re-render if you want to use width
```

**Silvery**: `measureElement()` works for compatibility, but `useContentRect()` is simpler.

```typescript
// silvery: Just use the hook
const { width } = useContentRect()
// Automatically re-renders with correct dimensions
```

**Migration**: Replace `measureElement()` + manual re-render with `useContentRect()`.

---

## Known Incompatibilities

### Won't Fix

These behaviors differ by design:

| Behavior                | Ink       | Silvery | Reason                       |
| ----------------------- | --------- | ------- | ---------------------------- |
| Text overflow           | Overflows | Wraps   | Better default for TUIs      |
| First render dimensions | N/A       | Zeros   | Required for layout feedback |
| Internal APIs           | Exposed   | Hidden  | Not part of public API       |

### Edge Cases

These might cause issues in rare cases:

| Issue                   | Symptoms                | Workaround                                    |
| ----------------------- | ----------------------- | --------------------------------------------- |
| Rapid re-renders        | Flicker on fast updates | Silvery coalesces frames; usually not visible |
| Very deep nesting       | Slower layout           | Flatten component tree if possible            |
| Custom reconciler usage | Breaks                  | Not supported; use standard components        |

---

## Codemod (Planned)

A codemod will be available to automate common migrations:

```bash
# Future: Auto-migrate
npx silvery-codemod ./src

# What it does:
# 1. Updates imports from 'ink' to 'silvery'
# 2. Replaces measureElement() with useContentRect()
# 3. Adds wrap={false} where overflow was intentional
# 4. Warns about potential issues
```

---

## Testing Your Migration

### 1. Visual Regression

Compare output before and after:

```bash
# Before migration
bun run your-app > before.txt

# After migration
bun run your-app > after.txt

# Diff
diff before.txt after.txt
```

### 2. Run Your Test Suite

If you have tests using ink-testing-library, update to silvery/testing:

```typescript
import { createRenderer } from '@silvery/term/testing';

const render = createRenderer({ cols: 80, rows: 24 });

test('my component', () => {
  const app = render(<MyComponent />);
  expect(app.text).toMatchSnapshot();
});
```

### 3. Check for useContentRect() Opportunities

Search for manual width/height props:

```bash
# Find candidates for useContentRect()
grep -r "width={" src/
grep -r "height={" src/
```

---

## FAQ

### Q: Can I use Ink and Silvery in the same project?

**A**: No. They both try to control the terminal. Pick one.

### Q: Will Silvery track Ink's updates?

**A**: Silvery targets Ink 4.x API. We'll add new Ink features if they're useful, but we're not a fork—we're a compatible reimplementation.

### Q: What about ink-\* community packages?

**A**: Most should work unchanged. If they use Ink internals, they may need updates. File an issue if you find incompatibilities.

### Q: Is Silvery faster than Ink?

**A**: Similar performance for most apps. Silvery may be slightly slower on first render (two-phase), but faster on updates (smarter diffing). Benchmark your specific app.

### Q: Can I contribute to Silvery?

**A**: Yes! See [Architecture](../deep-dives/architecture.md) for the high-level pipeline.

---

## Getting Help

- **GitHub Issues**: Report bugs or request features
- **Migration Problems**: Tag issue with `migration`
- **Performance Issues**: Include benchmark data
