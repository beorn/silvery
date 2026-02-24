# inkx Performance

Technical deep dive into inkx's rendering pipeline optimizations. This document explains _how_ inkx achieves its performance characteristics.

For raw benchmark numbers, see [benchmarks.md](../benchmarks.md). For the head-to-head Ink comparison with context and code examples, see [inkx vs Ink](../inkx-vs-ink.md).

## Key Insights

1. **Diff renders are 6-8x faster than first renders** -- incremental clone + dirty subtree skip means most of the buffer is preserved between frames.

2. **No-change frames are near-free at 7.5us** -- the dirty bounding box means zero rows are scanned when nothing changed.

3. **Content phase is fast at 1.7us** -- incremental clone + dirty skip. Output phase (7.5us for no-change, 45us for 10% changes) is the bottleneck for the diff path.

4. **displayWidth LRU cache** provides 45x speedup for repeated strings -- critical for TUI where the same text appears across frames.

5. **Style interning eliminates string building** -- ~15-50 unique styles per TUI, so caching SGR escape strings per style avoids per-cell string concatenation. A **style transition cache** further optimizes consecutive cells: with ~15-50 unique styles, there are at most ~2,500 possible transitions, and each (oldStyle, newStyle) pair is cached to avoid recomputing SGR diff strings.

## Optimizations by Phase

inkx's five-phase render pipeline (measure, layout, content, output, buffer) contains 21 optimizations across 7 categories.

### 1. Reconciler

| #   | Optimization                    | Description                                                                                                                                             |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | **Granular dirty flags**        | Separate `contentDirty`, `layoutDirty`, `paintDirty` -- style-only changes skip layout, content changes skip paint. Props compared before marking dirty. |
| 1.2 | **Efficient dirty propagation** | `markSubtreeDirty()` early-exits at already-dirty ancestors. Virtual text nodes skip to nearest physical ancestor.                                      |

### 2. Measure Phase

| #   | Optimization               | Description                                                                              |
| --- | -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 2.1 | **Measurement caching**    | Per-node result cache keyed on `"${width}                                                | ${widthMode}"`, cached text collection, emoji code point cache. Skips re-measurement when content unchanged. |
| 2.2 | **displayWidth LRU cache** | 10,000-entry LRU (unicode.ts). Repeated string width lookups ~45x faster (8us to 180ns). |
| 2.3 | **Selective traversal**    | Only visits nodes with `width/height: "fit-content"`, skips fixed-size nodes.            |

### 3. Layout Phase

| #   | Optimization                 | Description                                                                                                              |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 3.1 | **Layout early exit**        | `hasLayoutDirtyNodes()` skips entire `calculateLayout()` when no nodes are dirty and dimensions unchanged.               |
| 3.2 | **Change-gated propagation** | `layoutEqual()` and scroll offset compared to previous values -- dirty flags only propagated when values actually differ. |

### 4. Content Phase

| #   | Optimization              | Description                                                                                                                                                                                                                                                  |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4.1 | **Incremental rendering** | Clone previous buffer; only re-render dirty subtrees. 7-flag fast-path skip (`contentDirty`, `paintDirty`, `layoutChangedThisFrame`, `subtreeDirty`, `childrenDirty`, `childPositionChanged`, `hasPrevBuffer`). Includes skipBgFill and scroll viewport clear gating. |
| 4.2 | **layoutChangedThisFrame** | Authoritative per-frame flag set by `propagateLayout`, cleared by content phase. Replaces stale `!rectEqual(prevLayout, contentRect)` which was permanently true when layout phase skipped. Reduces content phase from O(N) to O(dirty) on no-layout-change frames. |
| 4.3 | **Viewport clipping**     | Early exit when node is entirely off-screen. Defense-in-depth for non-VirtualList containers.                                                                                                                                                                |

### 5. Output Phase

| #   | Optimization                                | Description                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | **Row-level dirty tracking + bounding box** | `_dirtyRows: Uint8Array` bitset + `_minDirtyRow`/`_maxDirtyRow`. Diff scans only dirty row range. No-change frames skip entirely.                                                                                                                                    |
| 5.2 | **Row-level bulk compare**                  | `rowMetadataEquals()` + `rowCharsEquals()` pre-check catches dirty-but-unchanged rows before per-cell diff.                                                                                                                                                          |
| 5.3 | **Packed cell comparison**                  | `cellEquals()` compares packed Uint32 metadata first, then char, then true color maps only if flags indicate.                                                                                                                                                        |
| 5.4 | **Style interning + SGR cache**             | Style combinations interned to string key; SGR escape strings cached. Eliminates per-cell `styleToAnsi()` string building.                                                                                                                                           |
| 5.5 | **Zero-allocation diff pipeline**           | Pre-allocated `CellChange` pool reused across frames. Reusable style object mutated in-place. In-place insertion sort for position ordering.                                                                                                                         |
| 5.6 | **Optimized ANSI output**                   | Relative cursor moves (`CUF`/`CUD`) for small jumps, `\r\n` for next-line-column-0. Style coalescing emits SGR only on transitions. Dimension-aware diffing for size mismatches.                                                                                     |
| 5.7 | **Wide character atomic diff**              | Wide char + continuation cell treated as a single atomic unit during cell-level diff. Orphaned continuation cells (main cell unchanged) trigger re-emit of the main cell from the buffer. Eliminates previous full-row fallback for rows containing wide characters. |

### 6. Buffer

| #   | Optimization                   | Description                                                                                                                                                     |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | **Packed cell representation** | 32-bit packed metadata (fg8+bg8+attrs8+underline3+flags5) + `string[]` chars. Sparse `Map<offset, RGB>` for true color. `fill()` packs once, assigns to region. |
| 6.2 | **Zero-allocation accessors**  | `getCellChar()`, `getCellBg()`, etc. read without Cell allocation. `readCellInto()` mutates caller-provided object for hot loops.                               |
| 6.3 | **Native memory operations**   | `scrollRegion()` uses `Uint32Array.copyWithin()`. `clone()` starts clean (dirty rows zeroed). True color Map skip in `fill()`.                                  |

### 7. Identity Fast Paths

| #   | Optimization                     | Description                                                                              |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| 7.1 | **Reference equality shortcuts** | `rectEqual()`, `styleEquals()`, `colorEquals()` check `a === b` before field comparison. |

**21 optimizations across 7 pipeline phases.**

### Wide Character Diff

The wide character atomic diff optimization (5.7) is validated by `tests/damage-rects.bench.ts` and `tests/wide-char-diff.test.tsx`. Previously, rows containing wide characters fell back to full-row rendering. Now, the cell-level diff treats each wide character and its continuation cell as a single atomic unit, enabling per-cell diffing even for CJK-heavy content.

## Investigated and Rejected

| Technique                    | Why Not                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| **Scroll regions** (DECSTBM) | Full-width only -- doesn't help multi-column layouts. ~100 lines of code for narrow benefit. |
| **Grapheme interning**       | Char comparison is already fast (3.8ns getCellChar). Not worth the refactor.                |
| **64-bit cell packing**      | JS has no native u64. BigInt is slower than u32+string.                                     |
| **ANSI compression**         | Style coalescing (5.6) already handles redundant codes.                                     |
| **Worker thread layout**     | Layout is <25us for typical trees -- not a bottleneck.                                       |

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
2. **Minimize re-renders** -- use React.memo() for static content
3. **Avoid deeply nested trees** -- flatten when possible
4. **Use `overflow: 'scroll'`** for long lists (enables VirtualList culling)
5. **Batch state updates** -- scheduler coalesces rapid changes

### For Contributors

1. **Avoid calling `displayWidth()` in hot paths** -- cache results
2. **Check dirty flags before work** -- early exit is cheap
3. **Prefer mutation over allocation** in render loop
4. **Profile before optimizing** -- `bun run bench` before and after
