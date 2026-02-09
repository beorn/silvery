# inkx vs Ink

[Ink](https://github.com/vadimdemedes/ink) (2017) brought React to the terminal. ~1.3M npm weekly downloads (Feb 2026), 50+ community components, used by Gatsby, Prisma, Terraform CDK, Shopify CLI, and many more. Mature, stable, well-documented.

[inkx](https://github.com/beorn/inkx) (2025) started as a ground-up reimplementation of Ink's rendering with two-phase rendering — components know their dimensions during render, not after. It has since grown into a broader app framework with runtime layers, state management integration, command/keybinding systems, and plugin composition. This makes a direct 1:1 comparison somewhat apples-to-oranges: Ink is a focused React renderer, while inkx is closer to a full terminal app toolkit.

See [migration guide](migration.md) for switching the rendering layer.

---

## Shared Foundation

inkx and Ink share the same core ideas — the migration path is intentionally short:

- **React component model** — JSX, hooks (`useState`, `useEffect`, `useMemo`, etc.), reconciliation, keys
- **Box + Text primitives** — Flexbox layout via `<Box>` with direction/padding/margin/border, styled text via `<Text>`
- **Flexbox layout** — Both use CSS-like flexbox (inkx via Flexx or Yoga, Ink via Yoga NAPI)
- **`useInput` hook** — Same callback signature `(input, key) => void` for keyboard handling
- **`useApp` / exit pattern** — `useApp()` to access app-level methods including `exit()`
- **`Static` component** — Render content above the interactive area (log lines, completed items)
- **`Spacer` / `Newline`** — Same utility components
- **Border styles** — `single`, `double`, `round`, `bold`, `classic`, etc.
- **`measureElement`** — Both offer ways to measure rendered elements (inkx also has `useContentRect`)
- **Node.js streams** — Both render to stdout, read from stdin

If your app uses `Box`, `Text`, `useInput`, and basic hooks, it works in both with minimal changes.

---

## Feature & Performance Comparison

_Performance: Apple M1 Max, Bun 1.3.9, Feb 2026. Run: `bun run bench:compare`_

### Architecture & Rendering

| Feature | inkx | Ink |
|---------|------|-----|
| React version | 19 | 18 |
| **Layout feedback** | `useContentRect()` / `useScreenRect()` | None — thread width props manually ([#5](https://github.com/vadimdemedes/ink/issues/5), open since 2016) |
| **Scrollable containers** | `overflow="scroll"` with auto-measurement | Third-party or manual ([#222](https://github.com/vadimdemedes/ink/issues/222), [#765](https://github.com/vadimdemedes/ink/issues/765)) |
| **Text truncation** | Auto, ANSI-aware | Manual per-component ([#584](https://github.com/vadimdemedes/ink/issues/584)) |
| Layout engines | [Flexx](https://github.com/beorn/flexx) (7 KB, pure JS) or Yoga (WASM) — no native deps | Yoga NAPI (native C++ addon) |
| Incremental rendering | Per-node dirty tracking | Full re-render ([PR #836](https://github.com/vadimdemedes/ink/pull/836) exploring) |
| Render targets | Terminal, Canvas, DOM | Terminal only |
| Static rendering | `renderStatic()` | `Static` component |
| CJK/IME sync | DEC 2026 synchronized update (automatic) | In progress ([#759](https://github.com/vadimdemedes/ink/issues/759), [PR #846](https://github.com/vadimdemedes/ink/pull/846)) |
| Non-TTY fallback | `renderStatic()` | [PR #854](https://github.com/vadimdemedes/ink/pull/854) |
| Concurrent React | Not yet | [PR #850](https://github.com/vadimdemedes/ink/pull/850) exploring |

### Input & Interaction

| Feature | inkx | Ink |
|---------|------|-----|
| Input handling | `InputLayerProvider` stack (DOM-style bubbling) | `useInput` only |
| Kitty keyboard protocol | `keyToKittyAnsi()` + auto-detection | [PR #852](https://github.com/vadimdemedes/ink/pull/852) in review |
| Cursor API | `useCursor()` — component-relative positioning | None ([#251](https://github.com/vadimdemedes/ink/issues/251), open since 2019) |
| TextArea | Planned — multi-line editing with layout feedback | None ([#676](https://github.com/vadimdemedes/ink/issues/676)) |
| Mouse support | HitRegistry with z-index | Basic via `useInput` |
| Unicode/CJK | Built-in grapheme splitting + display width | Third-party `string-width` |
| Console capture | Built-in `Console` component | `patchConsole()` |
| Exit handling | `useExit` + `using` cleanup | `process.exit` handling |
| Accessibility | Basic | [PR #823](https://github.com/vadimdemedes/ink/pull/823) (screen reader) |

### Developer Experience

| Feature | inkx | Ink |
|---------|------|-----|
| TypeScript | Native, strict mode | TS support |
| Plugin composition | `withCommands` / `withKeybindings` / `withDiagnostics` | None |
| Testing | `createRenderer` + Playwright-style locators | ink-testing-library |
| Community | New | 50+ components, ~1.3M npm weekly (Feb 2026) |
| Bundle (gzip) | ~45 KB (Flexx) / ~76 KB (Yoga) | ~52 KB |
| Maintenance | Active development | Maintenance mode |

### Performance

| Scenario | inkx | Ink | |
|----------|------|-----|---|
| Cold render (1 component) | 165 µs | 271 µs | inkx 1.6x faster |
| Cold render (1000 components) | 463 ms | 541 ms | inkx 1.2x faster |
| Full React rerender (1000 components) | 630 ms | 20.7 ms | Ink 30x faster |
| **Typical interactive update** | **169 µs** | **20.7 ms** | **inkx 122x faster** |
| Layout (50-node kanban) | 57 µs (Flexx) | 136 µs (Yoga NAPI) | Flexx 2.4x faster |
| Terminal resize (1000 nodes) | 21 µs | Full re-render | — |
| Buffer diff (80x24, 10% changed) | 34 µs | N/A (row-based strings) | — |

**Understanding the rerender row:** When the _entire_ component tree re-renders from scratch (e.g., replacing the root element), Ink is 30x faster because its output is just string concatenation. inkx runs a 5-phase pipeline (measure → layout → content → output) after React reconciliation — that's the cost of layout feedback. But this scenario almost never happens in real apps.

**The row that matters — "typical interactive update":** When a user presses a key (cursor move, scroll, toggle), only the changed nodes need updating. inkx has per-node dirty tracking that bypasses React entirely — 169 µs for 1000 nodes. Ink must re-render the full React tree for _any_ state change — 20.7 ms. In practice, inkx is **122x faster** for the updates that actually happen during interactive use.

**Native dependencies:** inkx with Flexx requires zero native dependencies (pure JS/TS). Ink requires Yoga NAPI, a native C++ addon that must be compiled per-platform.

---

## Key Differences

### Layout Feedback

Ink's longest-standing issue ([#5](https://github.com/vadimdemedes/ink/issues/5), opened 2016): components can't know their own dimensions. Ink renders components _before_ Yoga calculates layout. By the time dimensions are known, React is done.

inkx runs layout first, then components render with actual dimensions:

```tsx
// Ink: width props must cascade through the entire tree
function Card({ width }: { width: number }) {
  return <Text>{truncate(title, width)}</Text>
}

// inkx: components query their own dimensions
function Card() {
  const { width } = useContentRect()
  return <Text>{truncate(title, width)}</Text>
}
```

This enables scrolling, auto-truncation, and any feature that needs to know "how much space do I have?"

### Scrolling

Ink's #1 feature request ([#222](https://github.com/vadimdemedes/ink/issues/222), open since 2019):

```tsx
// Ink: manual virtualization, height estimation, width threading
<VirtualList
  items={items}
  height={availableHeight}
  estimateHeight={(item) => calculateHeight(item, width)}
  renderItem={(item) => <Card item={item} />}
/>

// inkx: render everything, let the framework handle overflow
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map(item => <Card key={item.id} item={item} />)}
</Box>
```

### CJK/IME Input

Terminal multiplexers (tmux, Zellij) can misinterpret frame boundaries during IME composition, causing 200-500ms latency and character dropping. inkx wraps all TTY output with DEC 2026 synchronized update sequences automatically. Disable with `INKX_SYNC_UPDATE=0`.

---

## Layout Engines

inkx supports pluggable layout engines with the same flexbox API:

| | Flexx (default) | Yoga (WASM) |
|---|---|---|
| Size (gzip) | 7 KB | 38 KB |
| Language | Pure JS | C++ → WASM |
| Initialization | Synchronous | Async |
| 100-node layout | 85 µs | 88 µs |
| 50-node kanban | 57 µs | 54 µs |
| RTL direction | Supported | Supported |
| Baseline alignment | Not supported | Supported |

Both are fast enough for 60fps terminal UIs. Flexx is 5x smaller with comparable performance. See [Flexx vs Yoga](../../beorn-flexx/docs/yoga-comparison.md) for details.

Note: Ink 6 uses Yoga NAPI (native C++), which is ~2x slower than both Flexx and Yoga WASM due to JS↔C++ bridge overhead.

---

## Real-World Scenarios

### Dashboard with Resizable Panes

Components need to know their dimensions to render content appropriately (charts, tables, wrapped text).

- **Ink**: Thread terminal width through props, re-calculate on resize, re-render entire tree.
- **inkx**: Each pane reads `useContentRect()` and adapts. Resize triggers layout-only pass (21 µs for 1000 nodes).

See [examples/dashboard](../examples/dashboard/) for a working multi-pane dashboard.

### Scrollable Task List

A list of 500+ items where the user navigates with j/k.

- **Ink**: Requires manual virtualization with height estimation. Height calculation is error-prone without layout feedback.
- **inkx**: `overflow="scroll"` handles everything. VirtualList component optimizes large lists.

See [examples/task-list](../examples/task-list/) for a working example.

### Kanban Board

3+ columns of cards, each column independently scrollable, cards showing truncated content.

- **Ink**: Complex width-threading (board→column→card), manual scroll per column, manual truncation.
- **inkx**: Columns and cards auto-size. Each column scrolls independently. Text auto-truncates.

See [examples/kanban](../examples/kanban/) for a working 3-column board.

### Search with Live Filtering

Type-ahead search with debounced results rendering.

- **Ink**: `useInput` for text capture, manual list rendering.
- **inkx**: `InputLayerProvider` for text input isolation, `useContentRect` for result count fitting.

See [examples/search-filter](../examples/search-filter/) using `useTransition` + `useDeferredValue`.

### Simple CLI Prompt

One-shot question → answer → exit.

- **Ink**: Excellent — large ecosystem of prompt components (ink-select-input, ink-text-input, ink-spinner).
- **inkx**: Works, but fewer ready-made components. Ink's ecosystem is the better choice here.

---

## Compatibility Coverage

Tested scenarios derived from common Ink issues:

| Scenario | inkx Test | Ink Issue |
|----------|-----------|-----------|
| CJK character rendering (Chinese, Japanese, Korean) | `ime.test.tsx` | [#759](https://github.com/vadimdemedes/ink/issues/759) |
| Double-width character alignment | `ime.test.tsx`, `wide-char-truncate.test.ts` | [#759](https://github.com/vadimdemedes/ink/issues/759) |
| Emoji ZWJ sequences | `ime.test.tsx` | — |
| ANSI-aware text truncation | `text-truncate-width.test.ts` | [#584](https://github.com/vadimdemedes/ink/issues/584) |
| Rapid keystrokes (burst input) | `input.test.tsx` | [PR #782](https://github.com/vadimdemedes/ink/pull/782) |
| borderDimColor | `border-dim-color.test.tsx` | [#840](https://github.com/vadimdemedes/ink/issues/840) |
| Large component counts (1000+) | `performance.test.tsx`, `memory.test.tsx` | [#694](https://github.com/vadimdemedes/ink/issues/694) |
| Home/End key support | `keys.test.ts` | [PR #829](https://github.com/vadimdemedes/ink/pull/829) |
| Process exit timing | `exit.test.tsx` | [#796](https://github.com/vadimdemedes/ink/issues/796) |
| tmux rendering | `terminal-multiplexers.test.ts`, `sync-update.test.ts` | [PR #846](https://github.com/vadimdemedes/ink/pull/846) |
| Zellij rendering | `terminal-multiplexers.test.ts` | [PR #846](https://github.com/vadimdemedes/ink/pull/846) |

---

## Appendix: Detailed Benchmarks

_Apple M1 Max, Bun 1.3.9, Feb 2026. Reproduce: `bun run bench:compare`_

### Full Pipeline (React Reconciliation + Layout + Output)

| Components | inkx (Flexx) | Ink 6 (Yoga NAPI) | Faster |
|------------|-------------|-------------------|--------|
| 1 Box+Text (80x24) | 165 µs | 271 µs | inkx 1.6x |
| 100 Box+Text (80x24) | 45.0 ms | 49.4 ms | inkx 1.1x |
| 1000 Box+Text (120x40) | 463 ms | 541 ms | inkx 1.2x |

inkx uses `createRenderer()` (headless). Ink uses `render()` with mock stdout + unmount per iteration.

### React Rerender (Apples-to-Apples)

Both trigger full React reconciliation via `app.rerender()`:

| Components | inkx | Ink 6 | Faster |
|------------|------|-------|--------|
| 100 Box+Text (80x24) | 64.3 ms | 2.3 ms | Ink 28x |
| 1000 Box+Text (120x40) | 630 ms | 20.7 ms | Ink 30x |

Ink is faster because it writes directly to a string buffer. inkx runs the 5-phase pipeline after reconciliation.

### inkx Dirty-Tracking Update (No Ink Equivalent)

Per-node dirty tracking bypasses React entirely:

| Nodes | First Render | Dirty Update | Faster |
|-------|-------------|-------------|--------|
| 1 | 311 µs | 38 µs | 8x |
| 100 | 23 ms | 46 µs | 500x |
| 1000 | 236 ms | 169 µs | 1396x |

This is the typical update path for interactive TUIs (cursor movement, scroll, single-node edits).

### Buffer Diff

| Scenario | Time |
|----------|------|
| 80x24, no changes | 28 µs |
| 80x24, 10% changed | 34 µs |
| 80x24, full repaint | 59 µs |
| 200x50, no changes | 146 µs |

Packed Uint32Array cell comparison with cursor-movement optimization.

### Layout Engine (Pure Layout, No React)

| Benchmark | Flexx (JS) | Yoga WASM | Yoga NAPI (C++) |
|-----------|-----------|-----------|-----------------|
| 100 nodes flat | 85 µs | 88 µs | 197 µs |
| 50-node kanban | 57 µs | 54 µs | 136 µs |

### Resize (Layout Only)

| Nodes | Time |
|-------|------|
| 10 | 250 ns |
| 100 | 2 µs |
| 1000 | 21 µs |

### Bundle Size

| Package | Size (gzip) |
|---------|------------|
| inkx + Flexx | ~45 KB |
| inkx + Yoga | ~76 KB |
| Ink | ~52 KB |

---

## References

### Ink Issues

- [#5 — Box dimensions](https://github.com/vadimdemedes/ink/issues/5) (2016)
- [#222 — Scrolling](https://github.com/vadimdemedes/ink/issues/222) (2019)
- [#251 — Cursor support](https://github.com/vadimdemedes/ink/issues/251) (2019)
- [#584 — Text overflow](https://github.com/vadimdemedes/ink/issues/584)
- [#676 — Multi-line input](https://github.com/vadimdemedes/ink/issues/676)
- [#694 — Large component performance](https://github.com/vadimdemedes/ink/issues/694)
- [#759 — CJK/IME input](https://github.com/vadimdemedes/ink/issues/759)
- [#765 — Scrolling primitives](https://github.com/vadimdemedes/ink/issues/765)
- [#796 — Exit timing](https://github.com/vadimdemedes/ink/issues/796)
- [#824 — Kitty protocol](https://github.com/vadimdemedes/ink/issues/824)
- [#840 — borderDimColor](https://github.com/vadimdemedes/ink/issues/840)

### Ink PRs

- [#782 — Rapid input](https://github.com/vadimdemedes/ink/pull/782)
- [#823 — Screen reader](https://github.com/vadimdemedes/ink/pull/823)
- [#829 — Home/End keys](https://github.com/vadimdemedes/ink/pull/829)
- [#836 — Incremental rendering](https://github.com/vadimdemedes/ink/pull/836)
- [#846 — Synchronized Update Mode](https://github.com/vadimdemedes/ink/pull/846)
- [#850 — Concurrent rendering](https://github.com/vadimdemedes/ink/pull/850)
- [#852 — Kitty keyboard](https://github.com/vadimdemedes/ink/pull/852)
- [#854 — Non-TTY fallback](https://github.com/vadimdemedes/ink/pull/854)
