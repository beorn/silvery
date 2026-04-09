# Silvery vs Ink Benchmarks

Head-to-head comparison of Silvery and Ink 7.0 rendering performance.

## Run

```bash
bun run bench           # default reporter
bun run bench:compare   # verbose reporter
```

## What's measured

Both frameworks render identical React component trees. Silvery uses `createRenderer()` (headless). Ink uses `render()` with mock stdout or `renderToString()`.

### Mounted workloads (what users experience)

Both keep a mounted app and call `rerender()` — the realistic path for interactive apps:

- Cursor move in 100-item list
- Single text change in kanban board
- Memo'd 100-item / 500-item single toggle
- Memo'd kanban 5x20 single card edit

### Cold renders

Both use their fastest synchronous render path:

- Flat lists (10, 100 items at 80x24 and 200x60)
- Styled lists, kanban boards, deep trees

### Methodology

- **Tooling**: [vitest bench](https://vitest.dev/guide/features#benchmarking) with [mitata](https://github.com/evanwashere/mitata)
- **STRICT mode**: Disabled (`SILVERY_STRICT=0`) to avoid O(cells) verification overhead
- **Ink version**: 7.0.0 (installed as devDependency)
- **Fair comparison**: Same React trees, same terminal dimensions, same iteration methodology

## Latest results

See the [Silvery vs Ink comparison page](https://silvery.dev/guide/silvery-vs-ink#performance) for formatted results.

Silvery wins all 16 scenarios. Range: 2.5-5.2x on mounted workloads.
