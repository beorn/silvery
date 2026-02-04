# Inkx Migration Guide

## Overview

This guide helps you migrate from Ink to Inkx. Most apps require only an import change, but there are behavioral differences to be aware of.

---

## Quick Start

### Step 1: Install Inkx

```bash
# Replace ink with inkx
bun remove ink ink-testing-library
bun add inkx
```

### Step 2: Update Imports

```diff
- import { Box, Text, render, useInput, useApp } from 'ink';
+ import { Box, Text, render, useInput, useApp, createTerm } from 'inkx';

- import { render } from 'ink-testing-library';
+ import { createRenderer } from 'inkx/testing';
```

### Step 3: Run Tests

```bash
bun test
```

Most apps should work at this point. Read on for known differences.

---

## What Works Identically

These APIs are 100% compatible:

| Category       | APIs                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| **Components** | `<Box>`, `<Text>`, `<Newline>`, `<Spacer>`, `<Static>`                   |
| **Hooks**      | `useInput()`, `useApp()`, `useStdout()`, `useStdin()`                    |
| **Render**     | `render()`, `render(element, options)`                                   |
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

**Inkx**: Components can ask for their size.

```typescript
// Inkx: Components know their size
function Card() {
  const { width } = useLayout();
  return <Text>{truncate(title, width)}</Text>;
}

// No prop threading needed
<Card />
```

### 2. Text Auto-Truncates by Default

**Ink**: Text overflows its container.

```typescript
// Ink: Text overflows, breaks layout
<Box width={10}>
  <Text>This is a very long text that overflows</Text>
</Box>
// Output: "This is a very long text that overflows" (broken layout)
```

**Inkx**: Text truncates to fit.

```typescript
// Inkx: Text truncates automatically
<Box width={10}>
  <Text>This is a very long text that overflows</Text>
</Box>
// Output: "This is a…"

// Opt out with wrap={false}
<Box width={10}>
  <Text wrap={false}>This overflows intentionally</Text>
</Box>
```

**Migration**: If you rely on overflow behavior, add `wrap={false}`.

### 3. First Render May Show Zeros

**Ink**: Components render once with final output.

**Inkx**: Components using `useLayout()` render twice:

1. First render: dimensions are `{ width: 0, height: 0 }`
2. Second render: dimensions are correct

```typescript
function Header() {
  const { width } = useLayout();
  // First render: width=0, renders ""
  // Second render: width=80, renders "=" × 80
  return <Text>{'='.repeat(width)}</Text>;
}
```

**Migration**: This is usually invisible (both renders happen before first paint). But if you have logic that breaks on `width=0`, add a guard:

```typescript
function Header() {
  const { width } = useLayout();
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

**Inkx**: Just render everything. Inkx handles the rest.

```typescript
// Inkx: No virtualization config needed
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map((item) => <Card key={item.id} item={item} />)}
</Box>
```

Inkx measures all children via Yoga (fast), then only renders content for visible ones (skipping the expensive part). No height estimation needed.

**Migration**: Replace custom virtualization components with `overflow="scroll"`.

### 5. measureElement() Still Works But useLayout() Is Better

**Ink**: Use `measureElement()` to get dimensions after render.

```typescript
// Ink: Measure after render
const ref = useRef();
const { width } = measureElement(ref.current);
// Need to manually trigger re-render if you want to use width
```

**Inkx**: `measureElement()` works for compatibility, but `useLayout()` is simpler.

```typescript
// Inkx: Just use the hook
const { width } = useLayout();
// Automatically re-renders with correct dimensions
```

**Migration**: Replace `measureElement()` + manual re-render with `useLayout()`.

---

## Known Incompatibilities

### Won't Fix

These behaviors differ by design:

| Behavior                | Ink       | Inkx      | Reason                       |
| ----------------------- | --------- | --------- | ---------------------------- |
| Text overflow           | Overflows | Truncates | Better default for TUIs      |
| First render dimensions | N/A       | Zeros     | Required for layout feedback |
| Internal APIs           | Exposed   | Hidden    | Not part of public API       |

### Edge Cases

These might cause issues in rare cases:

| Issue                   | Symptoms                | Workaround                                 |
| ----------------------- | ----------------------- | ------------------------------------------ |
| Rapid re-renders        | Flicker on fast updates | Inkx coalesces frames; usually not visible |
| Very deep nesting       | Slower layout           | Flatten component tree if possible         |
| Custom reconciler usage | Breaks                  | Not supported; use standard components     |

---

## Codemod (Planned)

A codemod will be available to automate common migrations:

```bash
# Future: Auto-migrate
npx inkx-codemod ./src

# What it does:
# 1. Updates imports from 'ink' to 'inkx'
# 2. Replaces measureElement() with useLayout()
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

If you have tests using ink-testing-library, update to inkx/testing:

```typescript
import { createRenderer } from 'inkx/testing';

const render = createRenderer({ cols: 80, rows: 24 });

test('my component', () => {
  const app = render(<MyComponent />);
  expect(app.text).toMatchSnapshot();
});
```

### 3. Check for useLayout() Opportunities

Search for manual width/height props:

```bash
# Find candidates for useLayout()
grep -r "width={" src/
grep -r "height={" src/
```

---

## FAQ

### Q: Can I use Ink and Inkx in the same project?

**A**: No. They both try to control the terminal. Pick one.

### Q: Will Inkx track Ink's updates?

**A**: Inkx targets Ink 4.x API. We'll add new Ink features if they're useful, but we're not a fork—we're a compatible reimplementation.

### Q: What about ink-\* community packages?

**A**: Most should work unchanged. If they use Ink internals, they may need updates. File an issue if you find incompatibilities.

### Q: Is Inkx faster than Ink?

**A**: Similar performance for most apps. Inkx may be slightly slower on first render (two-phase), but faster on updates (smarter diffing). Benchmark your specific app.

### Q: Can I contribute to Inkx?

**A**: Yes! See [internals.md](internals.md) for architecture details.

---

## Getting Help

- **GitHub Issues**: Report bugs or request features
- **Migration Problems**: Tag issue with `migration`
- **Performance Issues**: Include benchmark data
