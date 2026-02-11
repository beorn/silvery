# Inkx Performance

## Benchmarks (M1 Max, Bun 1.3.9)

### Full Pipeline

| Metric                           | Time    |
| -------------------------------- | ------- |
| `executeRender (simple, first)`  | 75us    |
| `executeRender (simple, diff)`   | 9us     |
| `executeRender (50 items, first)`| 189us   |
| `executeRender (50 items, diff)` | 32us    |

Diff renders are 6-8x faster than first renders thanks to incremental rendering.

### By Phase

| Phase                            | Time    | Notes                             |
| -------------------------------- | ------- | --------------------------------- |
| `measurePhase (simple)`          | 4ns     | Cached, no dirty nodes            |
| `measurePhase (100 children)`    | 523ns   | Selective traversal               |
| `layoutPhase (simple)`           | 442ns   | Flexx layout                      |
| `layoutPhase (100 children)`     | 24us    | Flexx layout                      |
| `contentPhase (simple)`          | 1.7us   | Incremental clone + dirty skip    |
| `contentPhase (100 children)`    | 3.4us   | Incremental clone + dirty skip    |
| `outputPhase (no changes)`       | 7.5us   | Dirty bounding box skips all rows |
| `outputPhase (10% changes)`      | 45us    | Row-level dirty + style cache     |
| `outputPhase (first render)`     | 70us    | Full buffer diff                  |

### Buffer Operations

| Operation          | Time   |
| ------------------ | ------ |
| `fill 80x24`      | 3.0us  |
| `setCell`          | 28ns   |
| `getCellChar`      | 5.1ns  |
| `getCellBg`        | 8.7ns  |
| `readCellInto`     | 18ns   |
| `cellEquals`       | 18ns   |
| `create 80x24`     | 1.7us  |
| `create 200x50`    | 3.7us  |

### inkx Dirty-Tracking Diff Render (No Ink Equivalent)

inkx tracks dirty nodes and only re-renders what changed. Ink has no incremental mode —
it re-renders the entire React tree every frame.

| Nodes | inkx diff render |
| ----- | ---------------- |
| 1     | 9us              |
| 100   | 18us             |
| 1000  | 101us            |

These are the times for typical frame updates (cursor movement, selection changes, typing)
where only 1-2 nodes change. Ink would need a full React re-render for the same update.

### First Render (Full Pipeline)

| Components | inkx (Flexx) | Ink 6 (Yoga NAPI) | Ratio     |
| ---------- | ------------ | ----------------- | --------- |
| 1          | 169 us       | 257 us            | inkx 1.5x |
| 100        | 44.2 ms      | 50.5 ms           | inkx 1.1x |
| 1000       | 446 ms       | 546 ms            | inkx 1.2x |

Both include React reconciliation. First-render performance is similar — the incremental
machinery doesn't help here. See [benchmark README](../benchmarks/ink-comparison/README.md).

### Layout Engine Comparison

| Benchmark             | Flexx (JS) | Yoga WASM | Yoga NAPI (C++) |
| --------------------- | ---------- | --------- | --------------- |
| 100 nodes flat list   | 90 us      | 84 us     | 234 us          |
| 50-node kanban (3col) | 54 us      | 61 us     | 154 us          |

Flexx (pure JS, 7KB) is 2.6x faster than Yoga NAPI for flat layouts. Matches Yoga WASM
for kanban. Both significantly faster than Yoga NAPI (C++) due to NAPI bridge overhead.

## Key Insights

1. **Diff renders are 6-8x faster than first renders** — incremental clone + dirty subtree skip means most of the buffer is preserved between frames.

2. **No-change frames are near-free at 7.5us** — the dirty bounding box means zero rows are scanned when nothing changed.

3. **Content phase is fast at 1.7us** — incremental clone + dirty skip. Output phase (7.5us for no-change, 45us for 10% changes) is the bottleneck for the diff path.

4. **displayWidth LRU cache** provides 45x speedup for repeated strings — critical for TUI where the same text appears across frames.

5. **Style interning eliminates string building** — ~15-50 unique styles per TUI, so caching SGR escape strings per style avoids per-cell string concatenation.

## Optimizations by Phase

### 1. Reconciler

| # | Optimization | Description |
|---|---|---|
| 1.1 | **Granular dirty flags** | Separate `contentDirty`, `layoutDirty`, `paintDirty` — style-only changes skip layout, content changes skip paint. Props compared before marking dirty. |
| 1.2 | **Efficient dirty propagation** | `markSubtreeDirty()` early-exits at already-dirty ancestors. Virtual text nodes skip to nearest physical ancestor. |

### 2. Measure Phase

| # | Optimization | Description |
|---|---|---|
| 2.1 | **Measurement caching** | Per-node result cache keyed on `"${width}|${widthMode}"`, cached text collection, emoji code point cache. Skips re-measurement when content unchanged. |
| 2.2 | **displayWidth LRU cache** | 10,000-entry LRU (unicode.ts). Repeated string width lookups ~45x faster (8us to 180ns). |
| 2.3 | **Selective traversal** | Only visits nodes with `width/height: "fit-content"`, skips fixed-size nodes. |

### 3. Layout Phase

| # | Optimization | Description |
|---|---|---|
| 3.1 | **Layout early exit** | `hasLayoutDirtyNodes()` skips entire `calculateLayout()` when no nodes are dirty and dimensions unchanged. |
| 3.2 | **Change-gated propagation** | `layoutEqual()` and scroll offset compared to previous values — dirty flags only propagated when values actually differ. |

### 4. Content Phase

| # | Optimization | Description |
|---|---|---|
| 4.1 | **Incremental rendering** | Clone previous buffer; only re-render dirty subtrees. 7-flag fast-path skip (`contentDirty`, `paintDirty`, `layoutChanged`, `subtreeDirty`, `childrenDirty`, `childPositionChanged`, `hasPrevBuffer`). Includes skipBgFill and scroll viewport clear gating. |
| 4.2 | **Viewport clipping** | Early exit when node is entirely off-screen. Defense-in-depth for non-VirtualList containers. |

### 5. Output Phase

| # | Optimization | Description |
|---|---|---|
| 5.1 | **Row-level dirty tracking + bounding box** | `_dirtyRows: Uint8Array` bitset + `_minDirtyRow`/`_maxDirtyRow`. Diff scans only dirty row range. No-change frames skip entirely. |
| 5.2 | **Row-level bulk compare** | `rowMetadataEquals()` + `rowCharsEquals()` pre-check catches dirty-but-unchanged rows before per-cell diff. |
| 5.3 | **Packed cell comparison** | `cellEquals()` compares packed Uint32 metadata first, then char, then true color maps only if flags indicate. |
| 5.4 | **Style interning + SGR cache** | Style combinations interned to string key; SGR escape strings cached. Eliminates per-cell `styleToAnsi()` string building. |
| 5.5 | **Zero-allocation diff pipeline** | Pre-allocated `CellChange` pool reused across frames. Reusable style object mutated in-place. In-place insertion sort for position ordering. |
| 5.6 | **Optimized ANSI output** | Relative cursor moves (`CUF`/`CUD`) for small jumps, `\r\n` for next-line-column-0. Style coalescing emits SGR only on transitions. Dimension-aware diffing for size mismatches. |

### 6. Buffer

| # | Optimization | Description |
|---|---|---|
| 6.1 | **Packed cell representation** | 32-bit packed metadata (fg8+bg8+attrs8+underline3+flags5) + `string[]` chars. Sparse `Map<offset, RGB>` for true color. `fill()` packs once, assigns to region. |
| 6.2 | **Zero-allocation accessors** | `getCellChar()`, `getCellBg()`, etc. read without Cell allocation. `readCellInto()` mutates caller-provided object for hot loops. |
| 6.3 | **Native memory operations** | `scrollRegion()` uses `Uint32Array.copyWithin()`. `clone()` starts clean (dirty rows zeroed). True color Map skip in `fill()`. |

### 7. Identity Fast Paths

| # | Optimization | Description |
|---|---|---|
| 7.1 | **Reference equality shortcuts** | `rectEqual()`, `styleEquals()`, `colorEquals()` check `a === b` before field comparison. |

**20 optimizations across 7 pipeline phases.**

## Investigated and Rejected

| Technique | Why Not |
|---|---|
| **Scroll regions** (DECSTBM) | Full-width only — doesn't help multi-column layouts. ~100 lines of code for narrow benefit. |
| **Grapheme interning** | Char comparison is already fast (3.8ns getCellChar). Not worth the refactor. |
| **64-bit cell packing** | JS has no native u64. BigInt is slower than u32+string. |
| **ANSI compression** | Style coalescing (5.6) already handles redundant codes. |
| **Worker thread layout** | Layout is <25us for typical trees — not a bottleneck. |

## Profiling Guide

### Run Benchmarks

```bash
cd vendor/beorn-inkx
bun run bench           # Internal benchmarks
bun run bench:compare   # Head-to-head inkx vs Ink 6
```

### Profile Specific Phases

```typescript
import { measurePhase, layoutPhase, contentPhase, outputPhase } from "inkx/pipeline"

const start = performance.now()
measurePhase(root)
console.log("measure:", performance.now() - start)
```

### Memory Profiling

```bash
bun --inspect run examples/dashboard/index.tsx
# Open chrome://inspect in Chrome
```

## Best Practices

### For Users

1. **Use `display: 'none'`** for hidden components (skips layout entirely)
2. **Minimize re-renders** — use React.memo() for static content
3. **Avoid deeply nested trees** — flatten when possible
4. **Use `overflow: 'scroll'`** for long lists (enables VirtualList culling)
5. **Batch state updates** — scheduler coalesces rapid changes

### For Contributors

1. **Avoid calling `displayWidth()` in hot paths** — cache results
2. **Check dirty flags before work** — early exit is cheap
3. **Prefer mutation over allocation** in render loop
4. **Profile before optimizing** — `bun run bench` before and after
