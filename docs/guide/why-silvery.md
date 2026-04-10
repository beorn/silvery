# Why Silvery?

Silvery started from a single frustration — **React terminal components can't know their own size during render** — and grew into a ground-up reimplementation with a different architectural commitment: **atomic frame rendering**. Every frame is either fully committed to the terminal or not at all. No intermediate states. No flicker. No component dropout on scroll. No half-updated trees.

## The Core Problem

In existing React terminal frameworks, React renders components first, then a layout engine (like Yoga) calculates positions and sizes. Components render at `width: 0` on the first pass, layout runs, and then components re-render with real dimensions. This "two-pass dance" means intermediate states are observable — and when the renderer is interrupted (by React fiber, by the terminal painting mid-emission, by a scroll event triggering re-layout), those broken intermediate states end up on screen.

You see this in real apps: flicker during streaming. Components appearing and disappearing during scroll. Blank cells in the middle of a layout. The app works fine in demo videos but falls apart under real interaction.

This has been a [known limitation](https://github.com/vadimdemedes/ink/issues/5) in existing frameworks since 2016. Addressing it requires a fundamentally different rendering pipeline — one where layout runs before render, and where frame emission commits atomically.

## Silvery's Approach

Silvery inverts the order: layout runs first, then components render with actual dimensions available via `useBoxRect()`:

```tsx
function Card({ item }: { item: Item }) {
  const { width } = useBoxRect()
  return <Text>{truncate(item.title, width - 4)}</Text>
}
```

No prop drilling, no post-render measurement, no `width: 0` on first paint. This architectural change also unlocks native scrollable containers (`overflow="scroll"`) and automatic text truncation -- features that depend on knowing "how much space do I have?"

## Performance

Silvery's atomic layout-first pipeline + cell-level buffer diff make it **2.5–5.2× faster than Ink 7.0** on the scenarios that matter for interactive apps. The output phase emits **28–192× less output** to the terminal than a full redraw.

### Benchmark Comparison — mounted workloads (what users experience)

| Scenario                            | Silvery advantage |
| ----------------------------------- | ----------------- |
| Mounted cursor move 100-item        | **2.56×**         |
| Mounted kanban single text change   | **3.36×**         |
| Memo'd 100-item single toggle       | **4.59×**         |
| Memo'd 500-item single toggle       | **5.15×**         |
| Memo'd kanban 5×20 single card edit | **3.75×**         |

_Reproduce: `bun run bench`. Silvery wins all 16 benchmark scenarios. Full results in [Silvery vs Ink Performance](/guide/silvery-vs-ink#performance)._

### Bundle size — parity with Ink+Yoga

| Package                            | Minified + Gzipped  |
| ---------------------------------- | ------------------- |
| Ink 7.0 + Yoga WASM (baseline)     | 116.6 KB            |
| `silvery/runtime` (core + flexily) | **114.9 KB (tied)** |

Pure TypeScript, zero WASM, zero native dependencies, instant startup (no async WASM init).

### Why the speedup

Silvery tracks 7 independent dirty flags per node. When a user presses a key, only the nodes that actually changed are re-rendered — React reconciliation, layout, and content generation are all skipped for unchanged nodes. The cell-level output phase then emits only the cells that differ from the previous frame, using relative cursor positioning to keep the wire size minimal.

## Components

Silvery ships 45+ components organized across several categories:

**Layout:** Box, Spacer, Fill, Newline, Divider, SplitView

**Input:** TextInput, TextArea, SelectList, CommandPalette, Form, Toggle, SearchBar

**Display:** Text, Badge, Spinner, ProgressBar, Table, Tabs, Toast, Tooltip, Skeleton, Typography

**Navigation:** TreeView, ListView, VirtualList, Breadcrumb

**Containers:** Screen, ModalDialog, PickerDialog, ScrollbackView, ScrollbackList, ErrorBoundary, Console

**Interaction:** Mouse events, spatial focus navigation (`focusScope` on Box), command system with keybindings, input layer stack

**Theming:** 38 palettes with semantic color tokens (`$primary`, `$success`, `$muted`, `$danger`), auto-detection of terminal background color, WCAG-aware contrast. See the [theme explorer](/themes) to preview all palettes.

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

- **Atomic frame commit** — every frame wrapped in DEC mode 2026 (synchronized output). The terminal either sees old frame or new frame, never a half-drawn mixture. No flicker, no tearing, no component dropout during scroll.
- **ANSI-aware cell compositing** — proper style stacking, not just string concatenation
- **Pure TypeScript** — no WASM, no C++, no native dependencies. Runs on Node, Bun, and Deno
- **Stable memory** — normal JavaScript garbage collection, no WASM heap growth
- **~99% Ink 7.0 test compatibility** — 918/931 tests pass. Existing Ink code works with minimal changes via the `silvery/ink` compatibility layer

Optional packages extend the renderer into a full framework:

- **Rich interaction** -- mouse events, spatial focus navigation, command system with keybindings, input layer stack
- **Theming** -- 38 palettes with semantic color tokens, auto-detects terminal colors
- **TEA state machines** (`@silvery/create`, optional) -- pure `(action, state) -> [state, effects]` for testing, replay, and undo

If you know React, you know Silvery -- the core API (`Box`, `Text`, `useInput`, `render`) is familiar. See the [getting started guide](/getting-started/quick-start) to try it, or the [detailed comparison](/guide/silvery-vs-ink) for the full technical breakdown.

## Get Started

Ready to try Silvery? The [quick start guide](/getting-started/quick-start) gets you from zero to a running terminal app in under 5 minutes. If you're migrating from Ink, see the [migration guide](/getting-started/migrate-from-ink) -- most Ink code works with minimal changes.
