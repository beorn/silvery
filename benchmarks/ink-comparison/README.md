# inkx vs Ink Performance Benchmark Suite

Head-to-head performance comparison between inkx and Ink. Since Ink is not installed as a dependency, inkx benchmarks run directly and Ink reference points are documented from published benchmarks and analysis.

## Running

```bash
cd /Users/beorn/Code/pim/km
bun run vendor/beorn-inkx/benchmarks/ink-comparison/run.ts
```

## Benchmark Categories

### 1. Render Time

Measures time to render React component trees of varying sizes (1, 100, 1000 Box+Text components) through the full inkx pipeline: reconciliation, layout, content rendering, and buffer output.

### 2. Pipeline Render

Low-level `executeRender` benchmarks bypassing React reconciliation. Measures pure pipeline throughput for first renders and diff renders.

### 3. Diff Performance

Buffer comparison benchmarks measuring the output phase that computes terminal escape sequences from two buffers. Tests: no changes, 10% changes, full repaint, and large buffers.

### 4. Resize Handling

Time to re-layout trees of 10, 100, and 1000 nodes after a terminal resize (80x24 to 120x40).

### 5. Layout Engine Comparison

Direct comparison of Flexx (pure JS) vs Yoga (WASM) layout engines on identical trees.

### 6. Memory Usage

Heap delta for rendering 100-component apps, measured via `process.memoryUsage()`.

## Ink Reference Points

Ink does not ship benchmarks. Reference points are derived from:

- **Ink PR #836** (incremental rendering): Reports ~2x speedup for partial updates
- **Ink issue #694** (large component counts): Users report degradation at 500+ components
- **Ink's Yoga dependency**: Same WASM engine, so layout performance is comparable when inkx uses Yoga

### Known Architectural Differences

| Aspect             | inkx                                     | Ink                                        |
| ------------------ | ---------------------------------------- | ------------------------------------------ |
| Layout feedback    | Two-phase render, components know size   | Single-phase, no size feedback             |
| Diff algorithm     | Cell-level with packed integer fast-path | Row-based string comparison                |
| Layout engine      | Flexx (default) or Yoga                  | Yoga only                                  |
| Incremental render | Dirty tracking per-node                  | Full tree re-render (PR #836 adds partial) |
| Text truncation    | Auto-truncate during content phase       | Manual, per-component                      |

These architectural differences mean inkx has higher per-frame overhead for simple renders (two-phase vs one-phase) but scales better for complex UIs (dirty tracking, layout feedback eliminates prop threading).
