# Why InkX?

InkX solves a fundamental architectural limitation in Ink that forces you to manually thread width props through your entire component tree.

## The Problem

In Ink, components render *before* Yoga computes layout. By the time layout is computed, React has already finished rendering. Components can't know their dimensions:

```tsx
// Ink: Width props cascade everywhere
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
      {items.map(item => <Card width={width - 2} item={item} />)}
    </Box>
  );
}

function Card({ width, item }: { width: number; item: Item }) {
  return <Text>{truncate(item.title, width - 4)}</Text>;
}
```

Real apps have **100+ lines** of this. Every layout change means updating arithmetic everywhere.

## The Solution

InkX uses two-phase rendering:

1. **Phase 1**: React renders component structure (not content)
2. **Phase 2**: Yoga computes layout
3. **Phase 3**: React re-renders with dimensions available

Components can query their size via `useLayout()`:

```tsx
// InkX: No width props needed
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
      {items.map(item => <Card item={item} />)}
    </Box>
  );
}

function Card({ item }: { item: Item }) {
  const { width } = useLayout();  // Just ask!
  return <Text>{truncate(item.title, width - 4)}</Text>;
}
```

## Why This Can't Be Fixed in Ink

This isn't a missing feature - it's architectural. Ink's render flow:

```
React render() → Build Yoga tree → Yoga computes layout → Write to terminal
                                         ↓
                              (dimensions computed here)
                                         ↓
                              (but never exposed to React)
```

Fixing this requires:
1. Render to collect constraints (not content)
2. Compute layout
3. Re-render with dimensions

This is a breaking API change. Ink's maintainer has shown no interest in major architecture changes - and that's understandable. Ink is stable, widely used, and works for its target use case.

## InkX vs Ink Comparison

| Feature | Ink | InkX |
|---------|-----|------|
| Layout feedback | ❌ Must thread width props | ✅ `useLayout()` hook |
| Text truncation | ❌ Overflows container | ✅ Auto-truncates |
| Scrolling | ❌ Manual virtualization | ✅ `overflow="scroll"` |
| API compatibility | - | ✅ Drop-in replacement |

## Who Should Use InkX?

**Use InkX if you're building:**
- Complex layouts (dashboards, kanban boards, multi-pane UIs)
- Apps with dynamic content widths
- Scrollable lists with variable-height items

**Stick with Ink if you're building:**
- Simple CLI output (progress bars, spinners)
- Apps where manual width calculation is acceptable
- Apps that need Ink's large ecosystem of plugins

## Related Work

InkX builds on proven patterns from:

- **[Textual](https://textual.textualize.io/)** (Python) - Modern TUI with CSS-like styling
- **[Ratatui](https://ratatui.rs/)** (Rust) - Immediate-mode TUI with layout feedback
- **[Flutter](https://flutter.dev/)** - "Constraints down, sizes up" model

The two-phase rendering pattern is standard in every major UI framework - browsers, native apps, mobile. InkX brings this to React terminal UIs.
