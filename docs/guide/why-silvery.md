# Why Silvery?

Silvery started from a single frustration — **React terminal components can't know their own size during render** — and grew into a ground-up reimplementation that also addresses incremental rendering, terminal protocol support, and native dependency elimination.

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

Beyond responsive layout, the renderer provides:

- **Per-node incremental rendering** — 7 independent dirty flags per node; only changed nodes re-render ([benchmarks](/guide/silvery-vs-ink#performance))
- **ANSI-aware cell compositing** — proper style stacking, not just string concatenation
- **Comprehensive terminal protocol support** — Kitty keyboard, SGR mouse, OSC 52 clipboard, synchronized output, Sixel/Kitty graphics, and more ([full list](/guide/silvery-vs-ink#terminal-protocol-coverage))
- **Pure TypeScript** — no WASM, no C++, no native dependencies. Runs on Node, Bun, and Deno
- **Stable memory** — normal JavaScript garbage collection, no WASM heap growth

Optional packages extend the renderer into a full framework:

- **30+ components** (`@silvery/ui`) — TextArea, VirtualList, Table, CommandPalette, and more ([component catalog](/guide/components))
- **Rich interaction** (`@silvery/term`) — mouse events, spatial focus navigation, command system with keybindings, input layer stack
- **TEA state machines** (`@silvery/tea`) — pure `(action, state) → [state, effects]` for testing, replay, and undo
- **Theming** (`@silvery/theme`) — 38 palettes with semantic color tokens

If you know React, you know Silvery — the core API (`Box`, `Text`, `useInput`, `render`) is familiar. See the [getting started guide](/getting-started/quick-start) to try it, or the [detailed comparison](/guide/silvery-vs-ink) for technical details.
