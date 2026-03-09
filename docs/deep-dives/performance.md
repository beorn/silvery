# Silvery Performance

Technical deep dive into Silvery's rendering pipeline optimizations. This document explains _how_ Silvery achieves its performance characteristics.

For raw benchmark numbers, see [benchmarks.md](../../../silvery-internal/benchmarks.md) (internal). For the head-to-head Ink comparison with context and code examples, see [Silvery vs Ink](../silvery-vs-ink.md).

## Key Insights

1. **Diff renders are 6-8x faster than first renders** -- incremental clone + dirty subtree skip means most of the buffer is preserved between frames.

2. **No-change frames are near-free at 7.5us** -- the dirty bounding box means zero rows are scanned when nothing changed.

3. **Content phase is fast at 1.7us** -- incremental clone + dirty skip. Output phase (7.5us for no-change, 45us for 10% changes) is the bottleneck for the diff path.

4. **displayWidth LRU cache** provides 45x speedup for repeated strings -- critical for TUI where the same text appears across frames.

5. **Style interning eliminates string building** -- ~15-50 unique styles per TUI, so caching SGR escape strings per style avoids per-cell string concatenation. A **style transition cache** further optimizes consecutive cells: with ~15-50 unique styles, there are at most ~2,500 possible transitions, and each (oldStyle, newStyle) pair is cached to avoid recomputing SGR diff strings.

6. **Inline incremental rendering matches fullscreen efficiency** -- inline mode previously regenerated the entire ANSI output from scratch every frame (~5,848 bytes at 50 items). Instance-scoped cursor tracking in `createOutputPhase()` enables buffer diffing with relative cursor positioning, reducing output to ~33-121 bytes per keystroke (28-192x fewer bytes).

## Optimizations by Phase

Silvery's five-phase render pipeline (measure, layout, content, output, buffer) contains 21 optimizations across 7 categories.

### 1. Reconciler

| #   | Optimization                    | Description                                                                                                                                              |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | **Granular dirty flags**        | Separate `contentDirty`, `layoutDirty`, `paintDirty` -- style-only changes skip layout, content changes skip paint. Props compared before marking dirty. |
| 1.2 | **Efficient dirty propagation** | `markSubtreeDirty()` early-exits at already-dirty ancestors. Virtual text nodes skip to nearest physical ancestor.                                       |

### 2. Measure Phase

| #   | Optimization               | Description                                                                              |
| --- | -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 2.1 | **Measurement caching**    | Per-node result cache keyed on `"${width}                                                | ${widthMode}"`, cached text collection, emoji code point cache. Skips re-measurement when content unchanged. |
| 2.2 | **displayWidth LRU cache** | 10,000-entry LRU (unicode.ts). Repeated string width lookups ~45x faster (8us to 180ns). |
| 2.3 | **Selective traversal**    | Only visits nodes with `width/height: "fit-content"`, skips fixed-size nodes.            |

### 3. Layout Phase

| #   | Optimization                 | Description                                                                                                               |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | **Layout early exit**        | `hasLayoutDirtyNodes()` skips entire `calculateLayout()` when no nodes are dirty and dimensions unchanged.                |
| 3.2 | **Change-gated propagation** | `layoutEqual()` and scroll offset compared to previous values -- dirty flags only propagated when values actually differ. |

### 4. Content Phase

| #   | Optimization               | Description                                                                                                                                                                                                                                                           |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | **Incremental rendering**  | Clone previous buffer; only re-render dirty subtrees. 7-flag fast-path skip (`contentDirty`, `paintDirty`, `layoutChangedThisFrame`, `subtreeDirty`, `childrenDirty`, `childPositionChanged`, `hasPrevBuffer`). Includes skipBgFill and scroll viewport clear gating. |
| 4.2 | **layoutChangedThisFrame** | Authoritative per-frame flag set by `propagateLayout`, cleared by content phase. Replaces stale `!rectEqual(prevLayout, contentRect)` which was permanently true when layout phase skipped. Reduces content phase from O(N) to O(dirty) on no-layout-change frames.   |
| 4.3 | **Viewport clipping**      | Early exit when node is entirely off-screen. Defense-in-depth for non-VirtualList containers.                                                                                                                                                                         |

### 5. Output Phase

| #   | Optimization                                | Description                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | **Row-level dirty tracking + bounding box** | `_dirtyRows: Uint8Array` bitset + `_minDirtyRow`/`_maxDirtyRow`. Diff scans only dirty row range. No-change frames skip entirely.                                                                                                                                                                                                                  |
| 5.2 | **Row-level bulk compare**                  | `rowMetadataEquals()` + `rowCharsEquals()` pre-check catches dirty-but-unchanged rows before per-cell diff.                                                                                                                                                                                                                                        |
| 5.3 | **Packed cell comparison**                  | `cellEquals()` compares packed Uint32 metadata first, then char, then true color maps only if flags indicate.                                                                                                                                                                                                                                      |
| 5.4 | **Style interning + SGR cache**             | Style combinations interned to string key; SGR escape strings cached. Eliminates per-cell `styleToAnsi()` string building.                                                                                                                                                                                                                         |
| 5.5 | **Zero-allocation diff pipeline**           | Pre-allocated `CellChange` pool reused across frames. Reusable style object mutated in-place. In-place insertion sort for position ordering.                                                                                                                                                                                                       |
| 5.6 | **Optimized ANSI output**                   | Relative cursor moves (`CUF`/`CUD`) for small jumps, `\r\n` for next-line-column-0. Style coalescing emits SGR only on transitions. Dimension-aware diffing for size mismatches.                                                                                                                                                                   |
| 5.7 | **Wide character atomic diff**              | Wide char + continuation cell treated as a single atomic unit during cell-level diff. Orphaned continuation cells (main cell unchanged) trigger re-emit of the main cell from the buffer. Eliminates previous full-row fallback for rows containing wide characters.                                                                               |
| 5.8 | **Inline incremental rendering**            | Instance-scoped cursor tracking in `createOutputPhase()` closure enables buffer diffing for inline mode. Uses relative cursor positioning (`CUU`/`CUD`/`\r`/`CUF`) instead of absolute. Falls back to full render when guard conditions fail (scrollback, resize, height change). 28-192x fewer bytes vs full re-render.                           |
| 5.9 | **Scrollback resize re-emission**           | On terminal resize, useScrollback re-renders frozen items at the new width and re-emits all to stdout. Necessary because the output phase clears the visible screen on resize, wiping visible frozen items. Resets output phase cursor tracking so the next render uses the first-render path. O(1) on normal frames, O(N) on resize (infrequent). |

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

**22 optimizations across 7 pipeline phases.**

### Wide Character Diff

The wide character atomic diff optimization (5.7) is validated by `tests/damage-rects.bench.ts` and `tests/wide-char-diff.test.tsx`. Previously, rows containing wide characters fell back to full-row rendering. Now, the cell-level diff treats each wide character and its continuation cell as a single atomic unit, enabling per-cell diffing even for CJK-heavy content.

### Inline Incremental Rendering

In fullscreen mode, `diffBuffers` + `changesToAnsi` emit only changed cells (~21 bytes/keystroke). In inline mode, `inlineFullRender()` previously regenerated the entire ANSI output from scratch every frame because inline mode has external stdout writes (scrollback freezing) that shift cursor position.

`inlineIncrementalRender()` uses the same buffer diffing when safe, falling back to `inlineFullRender()` when guard conditions fail:

| Guard Condition             | Why Required                                                  |
| --------------------------- | ------------------------------------------------------------- |
| `scrollbackOffset === 0`    | External writes shift cursor — can't use relative positioning |
| Same buffer dimensions      | Resize needs full re-render                                   |
| Same content height         | Height change needs full re-render                            |
| Cursor tracking initialized | First render must be full                                     |

**Relative cursor positioning**: `changesToAnsi()` accepts `mode: "inline"` and uses `\x1b[NA` (up), `\x1b[NB` (down), `\r` (carriage return), `\x1b[NC` (forward) instead of `\x1b[row;colH` (absolute).

**Instance-scoped state**: Inter-frame cursor tracking (`InlineCursorState`) is captured in the `createOutputPhase()` closure — no module-level globals. Bare `outputPhase()` calls get fresh state (always fall back to full render).

| Scenario          | Full Render | Incremental | Reduction |
| ----------------- | ----------- | ----------- | --------- |
| 10 rows, 1 change | 1,196 bytes | 42 bytes    | 28x       |
| 30 rows, 1 change | 3,540 bytes | 33 bytes    | 107x      |
| 50 rows, 1 change | 6,324 bytes | 33 bytes    | 192x      |

Benchmarks: `tests/inline-output.bench.ts`, `examples/interactive/inline-bench.tsx`.

### Scrollback Resize Re-emission

Frozen items in terminal scrollback are rendered at a specific width. When the terminal resizes, the output phase clears the entire visible screen before rendering live content — wiping any frozen items that are visible. `useScrollback` re-emits all frozen items on every width change:

1. Store the rendered string for each frozen item when it's written to stdout
2. On width change, re-render each item via the `render()` callback at the new width
3. Clear visible screen and re-emit all frozen items at the new width
4. Reset the output phase's cursor tracking so the next render uses the first-render path (no clear prefix)

Re-emission always happens on width change because the output phase would otherwise wipe visible frozen items. The cost is O(N) `renderStringSync` on resize (infrequent). Normal frames are O(1) (width unchanged → skip).

Tests: `tests/scrollback-resize.test.tsx`.

## Investigated and Rejected

| Technique                    | Why Not                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| **Scroll regions** (DECSTBM) | Full-width only -- doesn't help multi-column layouts. ~100 lines of code for narrow benefit. |
| **Grapheme interning**       | Char comparison is already fast (3.8ns getCellChar). Not worth the refactor.                 |
| **64-bit cell packing**      | JS has no native u64. BigInt is slower than u32+string.                                      |
| **ANSI compression**         | Style coalescing (5.6) already handles redundant codes.                                      |
| **Worker thread layout**     | Layout is <25us for typical trees -- not a bottleneck.                                       |

## Profiling Guide

### Run Benchmarks

```bash
cd vendor/silvery
bun run bench           # Internal benchmarks
bun run bench:compare   # Head-to-head silvery vs Ink 6
```

### Profile Specific Phases

```typescript
import { measurePhase, layoutPhase, contentPhase, outputPhase } from "@silvery/term/pipeline"

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
