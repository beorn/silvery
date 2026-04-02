# Why Silvery?

Silvery started from a single frustration -- **React terminal components can't know their own size during render** -- and grew into a ground-up reimplementation that also addresses incremental rendering, terminal protocol support, and native dependency elimination.

## The Core Problem

In existing React terminal frameworks, React renders components first, then a layout engine (like Yoga) calculates positions and sizes. By the time layout runs, rendering is already done. Components that need to adapt to their available space -- truncating text, choosing between compact and full layouts, fitting content into columns -- have to work around this with prop drilling or post-render effects.

This has been a [known limitation](https://github.com/vadimdemedes/ink/issues/5) in existing frameworks since 2016. Addressing it requires a fundamentally different rendering pipeline.

## Silvery's Approach

Silvery inverts the order: layout runs first, then components render with actual dimensions available via `useContentRect()`:

```tsx
function Card({ item }: { item: Item }) {
  const { width } = useContentRect()
  return <Text>{truncate(item.title, width - 4)}</Text>
}
```

No prop drilling, no post-render measurement, no `width: 0` on first paint. This architectural change also unlocks native scrollable containers (`overflow="scroll"`) and automatic text truncation -- features that depend on knowing "how much space do I have?"

## Performance

Silvery's incremental rendering engine tracks 7 independent dirty flags per node. When a user presses a key, only the nodes that actually changed are re-rendered -- React reconciliation, layout, and content generation are all skipped for unchanged nodes.

### Benchmark Comparison

| Scenario | Silvery | Ink | Result |
| --- | --- | --- | --- |
| Cold render (1 component) | 165 us | 271 us | Silvery 1.6x faster |
| Cold render (1000 components) | 463 ms | 541 ms | Silvery 1.2x faster |
| Full React rerender (1000 components) | 630 ms | 20.7 ms | Ink 30x faster |
| **Typical interactive update** | **169 us** | **20.7 ms** | **Silvery 100x+ faster** |
| Layout (50-node kanban) | 57 us (Flexily) | 88 us (Yoga WASM) | Flexily 1.5x faster |
| Terminal resize (1000 nodes) | 21 us | Full re-render | -- |
| Buffer diff (80x24, 10% changed) | 34 us | N/A (line-based) | -- |

_Apple M1 Max, 64 GB RAM, Bun 1.3.9, Feb 2026. Reproduce: `bun run bench:compare`_

The row that matters is **typical interactive update** -- what happens when a user presses a key in a mounted application. Silvery's per-node dirty tracking updates only the changed nodes (169 us). Ink re-renders the entire React tree and runs full Yoga layout (20.7 ms). Full React re-renders (replacing the root element) are slower in Silvery because its 5-phase pipeline has overhead, but this scenario rarely occurs in interactive apps. See the [detailed comparison](/guide/silvery-vs-ink#performance) for methodology and interpretation.

## Components

Silvery ships 45+ components organized across several categories:

**Layout:** Box, Spacer, Fill, Newline, Divider, SplitView

**Input:** TextInput, TextArea, SelectList, CommandPalette, Form, Toggle, SearchBar

**Display:** Text, Badge, Spinner, ProgressBar, Table, Tabs, Toast, Tooltip, Skeleton, Typography

**Navigation:** TreeView, ListView, VirtualList, Breadcrumb

**Containers:** Screen, ModalDialog, PickerDialog, ScrollbackView, ScrollbackList, ErrorBoundary, Console

**Interaction:** Mouse events, spatial focus navigation (`focusScope` on Box), command system with keybindings, input layer stack

**Theming:** 23 palettes with semantic color tokens (`$primary`, `$success`, `$muted`, `$danger`), auto-detection of terminal background color, WCAG-aware contrast. See the [theme explorer](/themes) to preview all palettes.

## Terminal Protocol Coverage

Silvery implements comprehensive terminal protocol support for cross-terminal compatibility and modern features:

**Styling:** 16/256/truecolor SGR, bold, italic, dim, underline, strikethrough, inverse, extended underlines (curly, dotted, dashed) with underline color.

**Keyboard:** Full Kitty keyboard protocol (all 5 flags -- disambiguate, event types, alternate keys, all keys, associated text), press/repeat/release events, modifier detection including Super/Cmd.

**Mouse:** X10, button event tracking, SGR extended protocol (coordinates beyond 223), focus in/out reporting, mouse cursor shape via OSC 22.

**Graphics:** Kitty graphics protocol (PNG transmission with chunking), Sixel encoding with color quantization, automatic fallback (Kitty to Sixel to text placeholder).

**Clipboard & Links:** OSC 52 clipboard access (works over SSH), OSC 8 hyperlinks.

**Output:** Synchronized output (DEC mode 2026) for flicker-free rendering, alternate screen buffer, scroll regions (DECSTBM), cursor shape control (DECSCUSR).

**Queries:** Cursor position (CPR), pixel dimensions (CSI 14t), text area size (CSI 18t), device attributes (DA1/DA2/DA3), terminal identification (XTVERSION). Used at startup for automatic capability detection.

For a feature-by-feature comparison with Ink, see the [protocol tables in the detailed comparison](/guide/silvery-vs-ink#terminal-protocol-coverage).

## What Else Comes With It

Beyond responsive layout, the renderer provides:

- **ANSI-aware cell compositing** -- proper style stacking, not just string concatenation
- **Pure TypeScript** -- no WASM, no C++, no native dependencies. Runs on Node, Bun, and Deno
- **Stable memory** -- normal JavaScript garbage collection, no WASM heap growth
- **98.9% Ink test compatibility** -- existing Ink code works with minimal changes via the `silvery/ink` compatibility layer

Optional packages extend the renderer into a full framework:

- **Rich interaction** -- mouse events, spatial focus navigation, command system with keybindings, input layer stack
- **Theming** -- 23 palettes with semantic color tokens, auto-detects terminal colors
- **TEA state machines** (`@silvery/create`, optional) -- pure `(action, state) -> [state, effects]` for testing, replay, and undo

If you know React, you know Silvery -- the core API (`Box`, `Text`, `useInput`, `render`) is familiar. See the [getting started guide](/getting-started/quick-start) to try it, or the [detailed comparison](/guide/silvery-vs-ink) for the full technical breakdown.

## Get Started

Ready to try Silvery? The [quick start guide](/getting-started/quick-start) gets you from zero to a running terminal app in under 5 minutes. If you're migrating from Ink, see the [migration guide](/getting-started/migrate-from-ink) -- most Ink code works with minimal changes.
