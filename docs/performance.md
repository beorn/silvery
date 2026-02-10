# Inkx Performance Analysis

## Benchmark Results (M1 Max, Bun 1.3.9)

### inkx vs Ink 6 (Full Pipeline)

| Components | inkx (Flexx) | Ink 6 (Yoga NAPI) | Ratio     |
| ---------- | ------------ | ----------------- | --------- |
| 1          | 172 us       | 269 us            | inkx 1.6x |
| 100        | 45.9 ms      | 49.7 ms           | inkx 1.1x |
| 1000       | 443 ms       | 544 ms            | inkx 1.2x |

inkx uses `createRenderer()` (headless). Ink uses `render()` with mock stdout + unmount per iteration. Both include React reconciliation. See [benchmark README](../benchmarks/ink-comparison/README.md) for full methodology and additional comparisons.

### inkx Pipeline Summary

| Operation                     | Time  | Notes                  |
| ----------------------------- | ----- | ---------------------- |
| Full render (simple, first)   | 54us  | First render, no diff  |
| Full render (simple, diff)    | 25us  | With buffer diffing    |
| Full render (50 items, first) | 159us | Complex tree           |
| Full render (50 items, diff)  | 88us  | Complex tree with diff |
| contentPhase (100 children)   | 26us  | Optimized with caching |
| layoutPhase (100 children)    | 25us  | Flexx layout           |

### Layout Engine Comparison

| Benchmark             | Flexx (JS) | Yoga WASM | Yoga NAPI (C++) |
| --------------------- | ---------- | --------- | --------------- |
| 100 nodes flat list   | 87 us      | 88 us     | 200 us          |
| 50-node kanban (3col) | 62 us      | 58 us     | 136 us          |

Flexx and Yoga WASM perform similarly. Both are ~2x faster than Yoga NAPI (native C++) due to NAPI bridge overhead.

### Key Optimizations Implemented

#### Round 1: Content & Diff Foundations

1. **displayWidth LRU cache**: String width calculation is expensive (~8us).
   Added a 1000-entry LRU cache that reduces repeated lookups to ~180ns (45x faster).

2. **Buffer-level cellEquals**: The output diff now uses `buffer.cellEquals()` which
   compares packed Uint32Array integers before falling back to full cell comparison.
   This made "no changes" diff 3.3x faster.

3. **Dimension-aware diffing**: Buffer diff now handles size mismatches properly,
   only comparing the overlapping region and adding new cells as needed.

#### Round 2: Output Pipeline (2026-02-10)

4. **True Color Map skip in fill()** (buffer.ts): `fill()` was calling `Map.delete()`
   per cell for fgColors/bgColors/underlineColors even when maps were empty. Now checks
   `map.size > 0` before the delete loop. Saves ~3 Map operations × 4000 cells per clear.

5. **Row-level dirty tracking** (buffer.ts, output-phase.ts): Added `_dirtyRows: Uint8Array`
   bitset to TerminalBuffer. `setCell()` and `fill()` mark rows dirty. `diffBuffers()` skips
   clean rows entirely. For cursor movement (2-4 rows change out of ~50), this eliminates
   ~90% of cell comparisons. Lifecycle: fresh buffers start all-dirty, `clone()` starts
   all-clean, content phase marks dirty rows, diff skips clean rows.

6. **Style interning + SGR caching** (output-phase.ts): Unique style combinations are
   interned to a string key, and the corresponding SGR escape string is cached in a
   `Map<string, string>`. Eliminates repeated `styleToAnsi()` string building (~10
   concatenations per style change) in the diff output hot path.

7. **Viewport clipping in content phase** (content-phase.ts): Early exit in
   `renderNodeToBuffer()` when a node is entirely off-screen (`screenY >= buffer.height`
   or `screenY + layout.height <= 0`). Defense-in-depth for non-VirtualList containers.

### Performance Improvements

#### Round 1 (Content & Diff)

| Metric                           | Before    | After    | Improvement     |
| -------------------------------- | --------- | -------- | --------------- |
| `displayWidth ASCII`             | 8,181ns   | 181ns    | **45x faster**  |
| `displayWidth mixed`             | 3,016ns   | 173ns    | **17x faster**  |
| `outputPhase (no changes)`       | 76,191ns  | 23,276ns | **3.3x faster** |
| `outputPhase (10% changes)`      | 85,229ns  | 36,906ns | **2.3x faster** |
| `contentPhase (100 children)`    | 503,000ns | 26,011ns | **19x faster**  |
| `executeRender (simple, diff)`   | 76,601ns  | 25,230ns | **3x faster**   |
| `executeRender (50 items, diff)` | 362,000ns | 87,953ns | **4x faster**   |

#### Round 2 (Output Pipeline, 2026-02-10)

| Metric                           | Before (R1) | After (R2) | Improvement     |
| -------------------------------- | ----------- | ---------- | --------------- |
| `fill 80x24`                     | 12,938ns    | 3,114ns    | **4.2x faster** |
| `executeRender (simple, diff)`   | 42,724ns    | 9,477ns    | **4.5x faster** |
| `executeRender (50 items, diff)` | 117,000ns   | 34,449ns   | **3.4x faster** |

#### Round 3 (Diff Micro-optimizations, 2026-02-10)

8. **Dirty row bounding box** (buffer.ts): Added `_minDirtyRow`/`_maxDirtyRow` tracking.
   Instead of scanning all rows `[0, height)`, `diffBuffers()` scans only `[min, max]`.
   Fresh buffers and `fill()` update bounds; `clone()` starts with bounds at -1 (no dirty rows).

9. **Row-level bulk compare** (buffer.ts, output-phase.ts): `rowMetadataEquals()` and
   `rowCharsEquals()` compare entire row slices before per-cell diff. Catches rows marked
   dirty (e.g., by `fill()` or `scrollRegion()`) but with unchanged content — avoids
   per-cell `cellEquals()` function call overhead.

10. **Relative cursor moves** (output-phase.ts): Same-row forward uses `CUF` (`\x1b[C` /
    `\x1b[${dx}C`). Column-0-down uses `\r\n` / `\r\x1b[${dy}B`. Avoids absolute
    `\x1b[y;xH` for small jumps, reducing escape sequence bytes.

| Metric                           | Before (R2) | After (R3) | Improvement     |
| -------------------------------- | ----------- | ---------- | --------------- |
| `outputPhase (no changes)`       | 33,609ns    | 7,643ns    | **4.4x faster** |
| `executeRender (simple, diff)`   | 8,890ns     | 9,037ns    | similar         |
| `executeRender (50 items, diff)` | 34,412ns    | 32,486ns   | slightly faster |

The big win is the no-changes case — bounding box eliminates all row scanning when nothing changed.

### Key Findings

1. **Diff path is now faster than first render**: With optimizations, diff renders
   take 2.1x less time than first renders (was 1.5x slower before).

2. **Cache hit rate matters**: The displayWidth cache provides massive speedups
   for repeated strings (common in UIs with consistent text content).

3. **Layout is consistently fast**: Yoga layout for 100 children takes ~25us
   thanks to dirty tracking - similar to optimized content phase.

4. **Unicode operations remain expensive**: `splitGraphemes` still takes 10us
   for ASCII strings - consider caching if profiling shows hot paths.

## All Optimizations (by Pipeline Phase)

### 1. Reconciler (reconcile-phase, host-config, helpers)

| # | Optimization | Description |
|---|---|---|
| 1.1 | **contentDirty / layoutDirty flags** | Separate flags for content vs layout changes. `contentPropsChanged()` and `layoutPropsChanged()` compare old/new props — only mark dirty if actually changed. |
| 1.2 | **subtreeDirty propagation** | `markSubtreeDirty()` walks ancestors but early-exits when already dirty (`while (node && !node.subtreeDirty)`). |
| 1.3 | **Virtual text ancestor lookup** | `markLayoutAncestorDirty()` skips virtual nodes without layout, finds nearest physical ancestor. |
| 1.4 | **paintDirty separation** | Style-only changes (color, border style) don't trigger layout recalculation. |

### 2. Measure Phase (measure-phase, reconciler/nodes)

| # | Optimization | Description |
|---|---|---|
| 2.1 | **Measure result cache** | Per-node `Map<cacheKey, result>` keyed on `"${width}|${widthMode}"`. Skips re-measurement when `contentDirty=false`. |
| 2.2 | **Cached text collection** | `cachedText` on nodes avoids re-collecting text from children when content unchanged. |
| 2.3 | **displayWidth LRU cache** | 10,000-entry LRU cache (unicode.ts). Repeated lookups ~45x faster (8µs → 180ns). |
| 2.4 | **Text presentation emoji cache** | Maps first code point → boolean to avoid repeated regex tests. |
| 2.5 | **Fit-content traversal only** | `measurePhase()` only visits nodes with `width/height: "fit-content"`, skips fixed-size nodes. |

### 3. Layout Phase (layout-phase)

| # | Optimization | Description |
|---|---|---|
| 3.1 | **hasLayoutDirtyNodes() early exit** | Skip entire `calculateLayout()` when no nodes are dirty and dimensions unchanged. |
| 3.2 | **layoutEqual() change detection** | `propagateLayout()` compares new layout to `prevLayout`; only marks ancestors dirty if layout actually changed. |
| 3.3 | **Scroll offset change detection** | `scrollPhase()` marks `subtreeDirty` only when scroll offset actually changed. |
| 3.4 | **Edge-based scrolling** | Only scroll when target is off-screen; preserve previous offset when target already visible. |
| 3.5 | **Lazy sticky child calculation** | Only compute sticky positions for nodes that actually have sticky children. |
| 3.6 | **Screen rect propagation** | `screenRectPhase()` propagates ancestor scroll offsets through tree once per frame. |

### 4. Content Phase (content-phase)

| # | Optimization | Description |
|---|---|---|
| 4.1 | **Incremental rendering via clone** | If previous buffer exists and dimensions match, `clone()` the buffer. Clean nodes keep pixels from clone — only dirty subtrees re-render. |
| 4.2 | **skipFastPath subtree skip** | Skip entire subtree when: `hasPrevBuffer && !contentDirty && !paintDirty && !layoutChanged && !subtreeDirty && !childrenDirty && !childPositionChanged`. |
| 4.3 | **skipBgFill optimization** | Skip background fill when: prev buffer exists, ancestor didn't clear region, and own properties unchanged. |
| 4.4 | **Viewport clipping** | Early exit in `renderNodeToBuffer()` when node is entirely off-screen (`screenY >= buffer.height` or `screenY + layout.height <= 0`). |
| 4.5 | **Scroll viewport clear gating** | Only clear viewport when scroll offset changed OR children restructured OR parent region changed. Does NOT clear for `subtreeDirty` alone (saved 12ms regression with 50 visible children). |
| 4.6 | **Child position change detection** | `hasChildPositionChanged()` detects sibling shifts from size changes — avoids full subtree re-render when only gap space changed. |

### 5. Output Phase (output-phase)

| # | Optimization | Description |
|---|---|---|
| 5.1 | **Row-level dirty tracking + bounding box** | `_dirtyRows: Uint8Array` bitset + `_minDirtyRow`/`_maxDirtyRow` bounds. `diffBuffers()` scans only `[min, max]` range, skipping clean rows (~90% skip for cursor movement). Bounding box eliminates scanning entirely for no-change frames. |
| 5.2 | **Packed cell comparison** | `cellEquals()` compares packed `Uint32Array` metadata first (single integer compare), then char, then true color maps only if flags indicate true color. |
| 5.3 | **Style interning + SGR cache** | `styleToKey()` serializes style to string key. `cachedStyleToAnsi()` caches the computed SGR escape string in `Map<string, string>`. ~15-50 unique styles per TUI. |
| 5.4 | **Pre-allocated diff pool** | `diffPool: CellChange[]` pre-allocated and reused across frames. Grows as needed, never shrinks. Returns pool+count instead of slicing. |
| 5.5 | **Reusable style object** | Single `reusableCellStyle` mutated in-place during diff traversal. Snapshot only on style change. |
| 5.6 | **Insertion sort for diff positions** | In-place insertion sort (optimal for mostly-sorted or small change counts). No array allocation. |
| 5.7 | **Cursor movement optimization** | Uses `\r\n` for next-line-column-0, relative `CUF`/`CUD` for small jumps, absolute only for large moves. Tracks `cursorX/cursorY` to skip cursor-move escapes for adjacent cells. |
| 5.8 | **Style coalescing** | Only emits style changes when transitioning between different styles. Consecutive same-style cells emit characters only. |
| 5.9 | **Dimension-aware diffing** | Handles buffer size mismatches by only comparing the overlapping region. |
| 5.10 | **Row-level bulk compare** | `rowMetadataEquals()` + `rowCharsEquals()` pre-check before per-cell diff. Catches rows marked dirty but with unchanged content. |

### 6. Buffer (buffer.ts)

| # | Optimization | Description |
|---|---|---|
| 6.1 | **Packed Uint32Array metadata** | Each cell packed into 32 bits: fg(8) + bg(8) + attrs(8) + underline(3) + flags(5). |
| 6.2 | **Sparse true color Maps** | `fgColors`, `bgColors`, `underlineColors` as `Map<offset, RGB>`. Only allocated for cells that use true color. |
| 6.3 | **True color Map skip in fill()** | Checks `map.size > 0` before delete loops. Saves ~3 Map operations × 4000 cells per clear. |
| 6.4 | **Zero-allocation cell accessors** | `getCellChar()`, `getCellBg()`, `getCellFg()`, `getCellAttrs()`, `isCellWide()`, `isCellContinuation()` — read without allocating Cell objects. |
| 6.5 | **readCellInto() / createMutableCell()** | Read cell into caller-provided object for hot loops. Avoids per-cell allocation. |
| 6.6 | **copyWithin() for scroll** | `scrollRegion()` uses `Uint32Array.copyWithin()` for native memcpy performance. |
| 6.7 | **fill() single-pack** | Resolves defaults and packs metadata once for entire region, then direct array assignment. |
| 6.8 | **Clone starts clean** | `clone()` sets `_dirtyRows.fill(0)` — content phase marks only modified rows dirty. |

### 7. Identity Fast Paths (throughout)

| # | Optimization | Description |
|---|---|---|
| 7.1 | **rectEqual() identity check** | `a === b` before field comparison. |
| 7.2 | **styleEquals() identity check** | Reference equality before deep comparison. |
| 7.3 | **colorEquals() fast paths** | Identity check, null handling, early exits before RGB comparison. |

**Total: 45+ distinct optimizations across all pipeline phases.**

## Future Optimizations

Based on analysis of ratatui, notcurses, crossterm, blessed, and bubbletea:

| Technique | Source | Effort | Expected Impact |
|---|---|---|---|
| **Synchronized output** (`CSI ? 2026 h/l`) | Notcurses, Textual | Low | Eliminates flicker/tearing |
| **Scroll regions** (IL/DL instead of redraw) | blessed, ncurses | Medium | O(1) scroll vs O(N) redraw |
| **ANSI compression** (strip redundant codes) | Bubbletea | Medium | Fewer bytes to terminal |
| **64-bit cell packing** (one compare per cell) | Notcurses | Medium | Faster diff |
| **Region bounding box** (only diff dirty rectangle) | General | Low-Medium | Skip more than row-level |
| **TypedArray bulk comparison** (SIMD/DataView) | General | Medium | Faster row equality check |
| **Virtual scrolling** | General | High | Only render visible children |
| **Worker thread layout** | General | High | Unblock main thread for large trees |

## Profiling Guide

### Run Benchmarks

```bash
cd /Users/beorn/Code/pim/km/vendor/beorn-inkx
bun run bench           # Internal benchmarks
bun run bench:compare   # Head-to-head inkx vs Ink 6
```

### Profile Specific Phases

```typescript
import {
  measurePhase,
  layoutPhase,
  contentPhase,
  outputPhase,
} from "inkx/pipeline"

const start = performance.now()
measurePhase(root)
console.log("measure:", performance.now() - start)
// ... etc
```

### Memory Profiling

```bash
bun --inspect run examples/dashboard/index.tsx
# Open chrome://inspect in Chrome
```

## Performance Best Practices

### For Users

1. **Use `display: 'none'`** for hidden components (skips layout entirely)
2. **Minimize re-renders** - use React.memo() for static content
3. **Avoid deeply nested trees** - flatten when possible
4. **Use `overflow: 'scroll'`** for long lists (enables culling)
5. **Batch state updates** - scheduler coalesces rapid changes

### For Contributors

1. **Avoid calling `displayWidth()` in hot paths** - cache results
2. **Check dirty flags before work** - early exit is cheap
3. **Prefer mutation over allocation** in render loop
4. **Profile before optimizing** - benchmarks don't lie
