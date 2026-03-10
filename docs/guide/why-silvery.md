# Why Silvery?

Silvery exists because of a fundamental constraint in how React terminal frameworks handle layout: **components can't know their own size during render**.

## The Core Problem

In existing React terminal frameworks, React renders components first, then a layout engine (like Yoga) calculates positions and sizes. By the time layout runs, rendering is already done. Components that need to adapt to their available space — truncating text, choosing between compact and full layouts, fitting content into columns — have to work around this with prop drilling or post-render effects.

This has been a [known limitation](https://github.com/vadimdemedes/ink/issues/5) in existing frameworks since 2016. Addressing it requires a fundamentally different rendering pipeline.

## Silvery's Approach

Silvery inverts the order: layout runs first, then components render with actual dimensions available via `useContentRect()`:

```tsx
function Card({ item }: { item: Item }) {
  const { width } = useContentRect()
  return <Text>{truncate(item.title, width - 4)}</Text>
}
```

No prop drilling, no post-render measurement, no `width: 0` on first paint. This architectural change also unlocks native scrollable containers (`overflow="scroll"`) and automatic text truncation — features that depend on knowing "how much space do I have?"

## What Else Comes With It

Beyond layout feedback, Silvery provides a complete terminal app toolkit:

- **Fast interactive updates** — per-node dirty tracking means only changed nodes re-render ([benchmarks](/guide/silvery-vs-ink#performance))
- **Stable memory** — pure JavaScript layout engine with normal garbage collection
- **Rich interaction** — mouse events, spatial focus navigation, command system with keybindings, input layer stack
- **30+ built-in components** — TextArea, VirtualList, Table, CommandPalette, and more ([component catalog](/guide/components))
- **Zero native dependencies** — pure TypeScript, runs on Node, Bun, and Deno

If you know React, you know Silvery — the core API (`Box`, `Text`, `useInput`, `render`) is familiar. See the [getting started guide](/getting-started/quick-start) to try it, or the [detailed comparison](/guide/silvery-vs-ink) for technical details.
