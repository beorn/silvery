# Why Silvery?

Silvery is a React framework for terminal UIs. It solves a fundamental problem that Ink — the current standard — can't fix without a rewrite: **components don't know their own size**.

## The Problem

In Ink, React renders _before_ layout runs. Components never learn their dimensions. Every app that needs responsive content threads width props through the entire tree:

```tsx
// Ink: width props cascade everywhere
function Board({ width }: { width: number }) {
  const colWidth = Math.floor((width - 2) / 3)
  return (
    <Box flexDirection="row">
      <Column width={colWidth} items={todo} />
      <Column width={colWidth} items={doing} />
      <Column width={colWidth} items={done} />
    </Box>
  )
}
```

This is [Ink's #1 issue](https://github.com/vadimdemedes/ink/issues/5), open since 2016. It can't be fixed without changing Ink's render pipeline — which would be a breaking rewrite.

## The Fix

Silvery runs layout first, then lets components render with actual dimensions:

```tsx
// Silvery: No width props needed
function Card({ item }: { item: Item }) {
  const { width } = useContentRect() // Just ask
  return <Text>{truncate(item.title, width - 4)}</Text>
}
```

This unlocks scrollable containers (`overflow="scroll"`), auto-truncation, and any feature that depends on "how much space do I have?"

## What Else

Beyond layout feedback, Silvery provides:

- **100x faster interactive updates** — per-node dirty tracking vs Ink's full-tree re-render
- **Constant memory** — pure JS layout engine (Flexily) vs Yoga's monotonically growing WASM memory
- **Modern input** — Kitty keyboard, SGR mouse, focus management, command system, keybindings
- **23+ components** — TextArea, VirtualList, SelectList, Table, Image, Console, and more
- **Zero native deps** — no C++ addons, no WASM blobs, runs on any JS runtime
- **Flicker-free** — synchronized terminal updates, incremental buffer diff

If you know Ink, you already know Silvery — `Box`, `Text`, `useInput`, `render()` all work the same way. See the [migration guide](/guide/migration) for the 5-minute switch.

For the full feature-by-feature comparison with benchmarks, see [Silvery vs Ink](/guide/migration).
