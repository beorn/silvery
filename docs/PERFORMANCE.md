# Inkx Performance Analysis

## Benchmark Results (M1 Max)

### Summary (After Optimizations)

| Operation                     | Time  | Notes                  |
| ----------------------------- | ----- | ---------------------- |
| Full render (simple, first)   | 54us  | First render, no diff  |
| Full render (simple, diff)    | 25us  | With buffer diffing    |
| Full render (50 items, first) | 159us | Complex tree           |
| Full render (50 items, diff)  | 88us  | Complex tree with diff |
| contentPhase (100 children)   | 26us  | Optimized with caching |
| layoutPhase (100 children)    | 25us  | Yoga is fast           |

### Key Optimizations Implemented

1. **displayWidth LRU cache**: String width calculation is expensive (~8us).
   Added a 1000-entry LRU cache that reduces repeated lookups to ~180ns (45x faster).

2. **Buffer-level cellEquals**: The output diff now uses `buffer.cellEquals()` which
   compares packed Uint32Array integers before falling back to full cell comparison.
   This made "no changes" diff 3.3x faster.

3. **Dimension-aware diffing**: Buffer diff now handles size mismatches properly,
   only comparing the overlapping region and adding new cells as needed.

### Performance Improvements

| Metric                           | Before    | After    | Improvement     |
| -------------------------------- | --------- | -------- | --------------- |
| `displayWidth ASCII`             | 8,181ns   | 181ns    | **45x faster**  |
| `displayWidth mixed`             | 3,016ns   | 173ns    | **17x faster**  |
| `outputPhase (no changes)`       | 76,191ns  | 23,276ns | **3.3x faster** |
| `outputPhase (10% changes)`      | 85,229ns  | 36,906ns | **2.3x faster** |
| `contentPhase (100 children)`    | 503,000ns | 26,011ns | **19x faster**  |
| `executeRender (simple, diff)`   | 76,601ns  | 25,230ns | **3x faster**   |
| `executeRender (50 items, diff)` | 362,000ns | 87,953ns | **4x faster**   |

### Key Findings

1. **Diff path is now faster than first render**: With optimizations, diff renders
   take 2.1x less time than first renders (was 1.5x slower before).

2. **Cache hit rate matters**: The displayWidth cache provides massive speedups
   for repeated strings (common in UIs with consistent text content).

3. **Layout is consistently fast**: Yoga layout for 100 children takes ~25us
   thanks to dirty tracking - similar to optimized content phase.

4. **Unicode operations remain expensive**: `splitGraphemes` still takes 10us
   for ASCII strings - consider caching if profiling shows hot paths.

## Current Optimizations

### Core Optimizations

1. **Dirty Tracking (layout-phase.ts)**
   - `layoutDirty` flag on nodes prevents unnecessary Yoga recalculation
   - `hasLayoutDirtyNodes()` early exit when nothing changed
   - `layoutEqual()` check before notifying subscribers

2. **Buffer Diffing (output-phase.ts)**
   - `diffBuffers()` uses buffer-level `cellEquals()` for fast integer comparison
   - Cursor position optimization (uses newlines when efficient)
   - Style coalescing (only emit style changes when needed)
   - Dimension-aware diffing handles resize gracefully

3. **Content Dirty Tracking (reconciler.ts)**
   - `contentDirty` flag on nodes
   - `layoutPropsChanged()` vs `contentPropsChanged()` separation
   - Only re-render nodes whose content actually changed

4. **Efficient Buffer Storage (buffer.ts)**
   - Uint32Array for packed cell metadata
   - Separate string array for characters
   - Map for true color storage (sparse)
   - Fast `cellEquals()` compares packed metadata before full comparison

5. **displayWidth LRU Cache (unicode.ts)**
   - 1000-entry LRU cache for string width calculations
   - Cache hits are ~45x faster than computing width
   - Automatically evicts oldest entries when full

### Medium-Effort Improvements

#### 1. Spatial Skip in contentPhase

Currently renders all nodes. Could skip nodes entirely outside viewport:

```typescript
// In renderNodeToBuffer
if (layout.y + layout.height < 0 || layout.y >= buffer.height) {
  return // Completely outside viewport
}
```

#### 2. Incremental Content Rendering

Only re-render nodes with `contentDirty=true` instead of recreating entire buffer:

```typescript
// Instead of: new TerminalBuffer()
// Reuse previous buffer and only update dirty regions
```

#### 3. Row-Based Diff in outputPhase

Current diff is cell-by-cell. Could batch by row:

```typescript
// Compare entire rows first using Uint32Array.equals
// Only do cell-by-cell comparison if row differs
```

### Major Optimizations (Future)

#### 1. Virtual Scrolling

For scroll containers with many children:

- Only create/render visible children
- Use placeholder nodes for off-screen items
- Recycle nodes as user scrolls

#### 2. Layout Caching

Cache Yoga layout results when dimensions don't change:

```typescript
// Key: (props_hash, available_width, available_height)
// Value: computed_layout
```

#### 3. Worker Thread for Layout

Move Yoga calculation to worker thread for large trees.

#### 4. Content Buffer Pooling

Reuse TerminalBuffer instances instead of allocating new ones each render.

## Profiling Guide

### Run Benchmarks

```bash
cd /Users/beorn/Code/pim/km/vendor/beorn-inkx
bun run bench
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
