# Silvery Benchmarks

Raw benchmark data for Silvery performance. All numbers from Apple M1 Max, macOS, Bun 1.3.9, February 2026.

Reproduce with `bun run bench` (internal) or `bun run bench:compare` (Silvery vs Ink). See [benchmark suite README](../benchmarks/ink-comparison/README.md) for Ink comparison methodology.

For technical explanations of these optimizations, see [Performance Deep Dive](deep-dives/performance.md). For the head-to-head Ink comparison with context and code examples, see [Silvery vs Ink](silvery-vs-ink.md).

---

## Silvery Internal Benchmarks

### Full Pipeline

| Metric                            | Time  |
| --------------------------------- | ----- |
| `executeRender (simple, first)`   | 75us  |
| `executeRender (simple, diff)`    | 9us   |
| `executeRender (50 items, first)` | 189us |
| `executeRender (50 items, diff)`  | 32us  |

Diff renders are 6-8x faster than first renders thanks to incremental rendering.

### By Phase

| Phase                         | Time  | Notes                             |
| ----------------------------- | ----- | --------------------------------- |
| `measurePhase (simple)`       | 4ns   | Cached, no dirty nodes            |
| `measurePhase (100 children)` | 523ns | Selective traversal               |
| `layoutPhase (simple)`        | 442ns | Flexily layout                    |
| `layoutPhase (100 children)`  | 24us  | Flexily layout                    |
| `contentPhase (simple)`       | 1.7us | Incremental clone + dirty skip    |
| `contentPhase (100 children)` | 3.4us | Incremental clone + dirty skip    |
| `outputPhase (no changes)`    | 7.5us | Dirty bounding box skips all rows |
| `outputPhase (10% changes)`   | 45us  | Row-level dirty + style cache     |
| `outputPhase (first render)`  | 70us  | Full buffer diff                  |

### Buffer Operations

| Operation       | Time  |
| --------------- | ----- |
| `fill 80x24`    | 3.0us |
| `setCell`       | 28ns  |
| `getCellChar`   | 5.1ns |
| `getCellBg`     | 8.7ns |
| `readCellInto`  | 18ns  |
| `cellEquals`    | 18ns  |
| `create 80x24`  | 1.7us |
| `create 200x50` | 3.7us |

---

## Silvery vs Ink Benchmarks

### Typical Frame Update (Interactive)

When a user presses a key (cursor move, selection change, typing), this is what each framework does to update the screen:

| Nodes | Silvery (dirty-tracking) | Ink 6 (full re-render) | Ratio         |
| ----- | ------------------------ | ---------------------- | ------------- |
| 100   | 18us                     | 2.1ms                  | Silvery ~117x |
| 1000  | 101us                    | 19.9ms                 | Silvery ~197x |

Silvery tracks which nodes changed and only re-renders the dirty subtree -- no React reconciliation needed. Ink has no incremental mode, so every frame update triggers a full React re-render of the entire tree. The gap grows with tree size because Silvery's cost is proportional to the _change_ while Ink's cost is proportional to the _tree_.

### First Render (Full Pipeline)

| Components | Silvery (Flexily) | Ink 6 (Yoga NAPI) | Ratio        |
| ---------- | ------------------ | ----------------- | ------------ |
| 1          | 169 us             | 257 us            | Silvery 1.5x |
| 100        | 44.2 ms            | 50.5 ms           | Silvery 1.1x |
| 1000       | 446 ms             | 546 ms            | Silvery 1.2x |

Both include React reconciliation. First-render performance is similar -- the incremental machinery doesn't help here.

### Full Pipeline (React Reconciliation + Layout + Output)

| Components             | Silvery (Flexily) | Ink 6 (Yoga NAPI) | Faster       |
| ---------------------- | ------------------ | ----------------- | ------------ |
| 1 Box+Text (80x24)     | 165 us             | 271 us            | Silvery 1.6x |
| 100 Box+Text (80x24)   | 45.0 ms            | 49.4 ms           | Silvery 1.1x |
| 1000 Box+Text (120x40) | 463 ms             | 541 ms            | Silvery 1.2x |

Silvery uses `createRenderer()` (headless). Ink uses `render()` with mock stdout + unmount per iteration.

### React Rerender (Apples-to-Apples)

Both trigger full React reconciliation via `app.rerender()`:

| Components             | Silvery | Ink 6   | Faster  |
| ---------------------- | ------- | ------- | ------- |
| 100 Box+Text (80x24)   | 64.3 ms | 2.3 ms  | Ink 28x |
| 1000 Box+Text (120x40) | 630 ms  | 20.7 ms | Ink 30x |

Ink is faster because it writes directly to a string buffer. Silvery runs the 5-phase pipeline after reconciliation.

### Silvery Dirty-Tracking Update (No Ink Equivalent)

Per-node dirty tracking bypasses React entirely:

| Nodes | First Render | Dirty Update | Faster |
| ----- | ------------ | ------------ | ------ |
| 1     | 311 us       | 38 us        | 8x     |
| 100   | 23 ms        | 46 us        | 500x   |
| 1000  | 236 ms       | 169 us       | 1396x  |

This is the typical update path for interactive TUIs (cursor movement, scroll, single-node edits).

### Buffer Diff

| Scenario            | Time   |
| ------------------- | ------ |
| 80x24, no changes   | 28 us  |
| 80x24, 10% changed  | 34 us  |
| 80x24, full repaint | 59 us  |
| 200x50, no changes  | 146 us |

Packed Uint32Array cell comparison with cursor-movement optimization.

---

## Layout Engine Comparison

### Pure Layout (No React)

| Benchmark             | Flexily (JS) | Yoga WASM | Yoga NAPI (C++) |
| --------------------- | ------------ | --------- | --------------- |
| 100 nodes flat list   | 90 us        | 84 us     | 234 us          |
| 50-node kanban (3col) | 54 us        | 61 us     | 154 us          |

Flexily (pure JS, 7KB) is 2.6x faster than Yoga NAPI for flat layouts. Matches Yoga WASM for kanban. Both significantly faster than Yoga NAPI (C++) due to NAPI bridge overhead.

### Resize (Layout Only)

| Nodes | Time   |
| ----- | ------ |
| 10    | 250 ns |
| 100   | 2 us   |
| 1000  | 21 us  |

---

## Bundle Size

| Package            | Size (gzip) |
| ------------------ | ----------- |
| Silvery + Flexily | ~45 KB      |
| Silvery + Yoga     | ~76 KB      |
| Ink                | ~52 KB      |

---

## Summary Table

| Scenario                              | Silvery          | Ink                     |                          |
| ------------------------------------- | ---------------- | ----------------------- | ------------------------ |
| Cold render (1 component)             | 165 us           | 271 us                  | Silvery 1.6x faster      |
| Cold render (1000 components)         | 463 ms           | 541 ms                  | Silvery 1.2x faster      |
| Full React rerender (1000 components) | 630 ms           | 20.7 ms                 | Ink 30x faster           |
| **Typical interactive update**        | **169 us**       | **20.7 ms**             | **Silvery 100x+ faster** |
| Layout (50-node kanban)               | 57 us (Flexily) | 136 us (Yoga NAPI)      | Flexily 2.4x faster     |
| Terminal resize (1000 nodes)          | 21 us            | Full re-render          | --                       |
| Buffer diff (80x24, 10% changed)      | 34 us            | N/A (row-based strings) | --                       |

**Understanding the rerender row:** When the _entire_ component tree re-renders from scratch (e.g., replacing the root element), Ink is 30x faster because its output is just string concatenation. Silvery runs a 5-phase pipeline (measure, layout, content, output) after React reconciliation -- that's the cost of layout feedback. But this scenario almost never happens in real apps.

**The row that matters -- "typical interactive update":** When a user presses a key (cursor move, scroll, toggle), only the changed nodes need updating. Silvery has per-node dirty tracking that bypasses React entirely -- 169 us for 1000 nodes. Ink must re-render the full React tree for _any_ state change -- 20.7 ms. In practice, Silvery is **100x+ faster** for the updates that actually happen during interactive use.
