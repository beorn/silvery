# Silvery vs Ink

[Ink](https://github.com/vadimdemedes/ink) (2017) brought React to the terminal. ~1.3M npm weekly downloads (Feb 2026), 50+ community components, used by Gatsby, Prisma, Terraform CDK, Shopify CLI, and many more. Mature, stable, well-documented.

[Silvery](https://github.com/beorn/silvery) (2025) started as a ground-up reimplementation of Ink's rendering with two-phase rendering — components know their dimensions during render, not after. It has since grown into a broader app framework with runtime layers, state management integration, command/keybinding systems, and plugin composition. This makes a direct 1:1 comparison somewhat apples-to-oranges: Ink is a focused React renderer, while Silvery is closer to a full terminal app toolkit.

> For how Silvery compares to terminal UI frameworks beyond Ink (BubbleTea, Textual, Notcurses, FTXUI, blessed), see [comparison.md](comparison.md).

See [migration guide](migration.md) for switching the rendering layer.

> Performance numbers in this document are from the **Ink comparison benchmark suite**. Reproduce with `bun run bench` for raw benchmark tables.

---

## Shared Foundation

Silvery and Ink share the same core ideas — the migration path is intentionally short:

- **React component model** — JSX, hooks (`useState`, `useEffect`, `useMemo`, etc.), reconciliation, keys
- **Box + Text primitives** — Flexbox layout via `<Box>` with direction/padding/margin/border, styled text via `<Text>`
- **Flexbox layout** — Both use CSS-like flexbox (Silvery via Flexily or Yoga, Ink via Yoga NAPI)
- **`useInput` hook** — Same callback signature `(input, key) => void` for keyboard handling
- **`useApp` / exit pattern** — `useApp()` to access app-level methods including `exit()`
- **`Static` component** — Render content above the interactive area (log lines, completed items)
- **`Spacer` / `Newline`** — Same utility components
- **Border styles** — `single`, `double`, `round`, `bold`, `classic`, etc.
- **`measureElement`** — Both offer ways to measure rendered elements (Silvery also has `useContentRect`)
- **Node.js streams** — Both render to stdout, read from stdin

If your app uses `Box`, `Text`, `useInput`, and basic hooks, it works in both with minimal changes.

---

## Feature & Performance Comparison

_Performance: Apple M1 Max, Bun 1.3.9, Feb 2026. Run: `bun run bench:compare`_

### Runtime Stability

| Feature                     | Silvery                                                          | Ink                                                                              |
| --------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Memory in long sessions** | Constant — Flexily uses normal JS GC                             | Grows monotonically — Yoga WASM linear memory cannot shrink without module reset |
| **Layout caching**          | Flexily fingerprints + caches unchanged subtrees                 | Full tree recomputation on every pass                                            |
| **Initialization**          | Synchronous — pure TypeScript import                             | Async WASM loading (Yoga) or native compilation (Yoga NAPI)                      |
| **Native dependencies**     | None — pure JS/TS                                                | Yoga NAPI: C++ addon per platform; Yoga WASM: binary blob                        |
| **Streaming output perf**   | Dirty tracking + buffer diff — only changed cells emit           | Full-screen repaint on every state change                                        |
| **Synchronized updates**    | DEC 2026 automatic — atomic screen paint, no tmux/Zellij flicker | None                                                                             |
| **Resource cleanup**        | `using` / Disposable — automatic teardown                        | Manual `unmount()` / `process.exit` handling                                     |
| **Unicode/CJK**             | Built-in wcwidth, grapheme splitting, display width (28+ utils)  | Third-party `string-width`, no built-in truncation                               |
| **Border/overflow**         | Correct border text rendering, ANSI-aware auto-truncation        | Text can overflow borders; manual truncation per component                       |
| **Scrollback mode**         | `useScrollback` — completed items freeze into terminal history   | None — must keep all items in render tree                                        |
| **Console capture**         | Built-in `<Console />` — subprocess output alongside UI          | `patchConsole()` — intercepts but less composable                                |
| **Adaptive degradation**    | `term.hasCursor/hasColor/hasInput` + `renderString()` fallback   | Assumes TTY; non-TTY is [PR #854](https://github.com/vadimdemedes/ink/pull/854)  |
| **Image rendering**         | `<Image>` — Kitty graphics + Sixel with auto-detect and fallback | None                                                                             |
| **Clipboard (OSC 52)**      | `copyToClipboard`/`requestClipboard` — works across SSH          | None                                                                             |
| **Bracketed paste**         | Built-in runtime support with `usePaste` hook                    | None                                                                             |
| **Static rendering**        | `renderString()` — one-call string output, plain mode option     | Requires full `render()` setup even for non-interactive output                   |

### Architecture & Rendering

| Feature                   | Silvery                                                                                    | Ink                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| React version             | 19                                                                                         | 18                                                                                                                                     |
| **Layout feedback**       | `useContentRect()` / `useScreenRect()` — synchronous, per-component                        | `useBoxMetrics()` + `useWindowSize()` — post-layout via Yoga (added 2024)                                                              |
| **Scrollable containers** | `overflow="scroll"` with auto-measurement                                                  | Third-party or manual ([#222](https://github.com/vadimdemedes/ink/issues/222), [#765](https://github.com/vadimdemedes/ink/issues/765)) |
| **Text truncation**       | Auto, ANSI-aware                                                                           | Manual per-component ([#584](https://github.com/vadimdemedes/ink/issues/584))                                                          |
| Layout engines            | [Flexily](https://beorn.github.io/flexily) (7 KB, pure JS) or Yoga (WASM) — no native deps | Yoga NAPI (native C++ addon)                                                                                                           |
| Incremental rendering     | Per-node dirty tracking                                                                    | Full re-render ([PR #836](https://github.com/vadimdemedes/ink/pull/836) exploring)                                                     |
| Render targets            | Terminal, Canvas, DOM                                                                      | Terminal only                                                                                                                          |
| Static rendering          | `renderStatic()`                                                                           | `Static` component                                                                                                                     |
| CJK/IME sync              | DEC 2026 synchronized update (automatic)                                                   | In progress ([#759](https://github.com/vadimdemedes/ink/issues/759), [PR #846](https://github.com/vadimdemedes/ink/pull/846))          |
| Non-TTY fallback          | `renderStatic()`                                                                           | [PR #854](https://github.com/vadimdemedes/ink/pull/854)                                                                                |
| Concurrent React          | Not yet                                                                                    | [PR #850](https://github.com/vadimdemedes/ink/pull/850) exploring                                                                      |
| **Box outline**           | `outlineStyle` — CSS outline equivalent, no layout impact                                  | None                                                                                                                                   |
| **Transform component**   | `<Transform>` — per-line string transform (Ink-compatible)                                 | `<Transform>` — same API                                                                                                               |

### Input & Interaction

| Feature                 | Silvery                                                           | Ink                                                                     |
| ----------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Input handling          | `InputLayerProvider` stack (DOM-style bubbling, modal isolation)  | `useInput` only (flat, no isolation)                                    |
| Kitty keyboard protocol | Full spec: ⌘/✦ modifiers, press/repeat/release, auto-detect       | [PR #852](https://github.com/vadimdemedes/ink/pull/852) in review       |
| Focus system            | Tree-based: scopes, spatial navigation, autoFocus, click-to-focus | None                                                                    |
| Command system          | `withCommands` — ID, name, help, keybindings, introspection       | None                                                                    |
| Keybinding system       | `withKeybindings` — configurable, context-aware, macOS symbols    | None                                                                    |
| Mouse support           | SGR protocol, DOM-style event props, hit testing, wheel/drag      | Basic via `useInput`                                                    |
| Cursor API              | `useCursor()` — component-relative positioning                    | `useCursor()` — IME cursor positioning (added 2024)                     |
| TextArea                | Multi-line editing with word wrap, readline, scroll               | None ([#676](https://github.com/vadimdemedes/ink/issues/676))           |
| Hotkey parsing          | `parseHotkey("⌘K")` — macOS symbols ⌘⌥⌃⇧✦                         | None                                                                    |
| Hyperlinks              | `<Link>` — OSC 8 clickable URLs                                   | None                                                                    |
| Inline images           | Kitty graphics + Sixel — auto-detect with text fallback           | None                                                                    |
| Bracketed paste         | Built-in `usePaste` hook + runtime auto-enable                    | None                                                                    |
| OSC 52 clipboard        | `copyToClipboard`/`requestClipboard` — works across SSH           | None                                                                    |
| Outline prop            | `outlineStyle` — CSS outline equivalent without layout impact     | None                                                                    |
| Unicode/CJK             | Built-in grapheme splitting + display width (28+ utils)           | Third-party `string-width`                                              |
| Console capture         | Built-in `<Console />` component (composable)                     | `patchConsole()` (intercept-only)                                       |
| Exit handling           | `useExit` + `using` cleanup (Disposable)                          | `process.exit` handling                                                 |
| Accessibility           | Basic                                                             | [PR #823](https://github.com/vadimdemedes/ink/pull/823) (screen reader) |

### Developer Experience

| Feature            | Silvery                                                 | Ink                                         |
| ------------------ | ------------------------------------------------------- | ------------------------------------------- |
| React version      | 19                                                      | 18                                          |
| TypeScript         | Native, strict mode                                     | TS support                                  |
| Runtime layers     | 3 layers: Elm-style reducer, React hooks, Zustand store | Single render API                           |
| Plugin composition | `withCommands` / `withKeybindings` / `withDiagnostics`  | None                                        |
| Testing            | `createRenderer` + Playwright-style locators            | ink-testing-library                         |
| Render invariants  | `withDiagnostics` — incremental vs fresh verification   | None                                        |
| Screenshots        | `bufferToHTML()` + Playwright — programmatic capture    | None                                        |
| Render targets     | Terminal, Canvas 2D, DOM                                | Terminal only                               |
| Stream helpers     | AsyncIterable: merge, map, filter, throttle, debounce   | None                                        |
| Community          | New                                                     | 50+ components, ~1.3M npm weekly (Feb 2026) |
| Bundle (gzip)      | ~45 KB (Flexily) / ~76 KB (Yoga)                        | ~52 KB                                      |
| Maintenance        | Active development                                      | Maintenance mode                            |

### Performance

| Scenario                              | Silvery         | Ink                     |                          |
| ------------------------------------- | --------------- | ----------------------- | ------------------------ |
| Cold render (1 component)             | 165 µs          | 271 µs                  | Silvery 1.6x faster      |
| Cold render (1000 components)         | 463 ms          | 541 ms                  | Silvery 1.2x faster      |
| Full React rerender (1000 components) | 630 ms          | 20.7 ms                 | Ink 30x faster           |
| **Typical interactive update**        | **169 µs**      | **20.7 ms**             | **Silvery 100x+ faster** |
| Layout (50-node kanban)               | 57 µs (Flexily) | 136 µs (Yoga NAPI)      | Flexily 2.4x faster      |
| Terminal resize (1000 nodes)          | 21 µs           | Full re-render          | —                        |
| Buffer diff (80x24, 10% changed)      | 34 µs           | N/A (row-based strings) | —                        |

**Understanding the rerender row:** When the _entire_ component tree re-renders from scratch (e.g., replacing the root element), Ink is 30x faster because its output is just string concatenation. Silvery runs a 5-phase pipeline (measure → layout → content → output) after React reconciliation — that's the cost of layout feedback. But this scenario almost never happens in real apps.

**The row that matters — "typical interactive update":** When a user presses a key (cursor move, scroll, toggle), only the changed nodes need updating. Silvery has per-node dirty tracking that bypasses React entirely — 169 µs for 1000 nodes. Ink must re-render the full React tree for _any_ state change — 20.7 ms. In practice, Silvery is **100x+ faster** for the updates that actually happen during interactive use.

**Native dependencies:** Silvery with Flexily requires zero native dependencies (pure JS/TS). Ink requires Yoga NAPI, a native C++ addon that must be compiled per-platform.

---

## Key Differences

### Layout Feedback

Ink's longest-standing issue ([#5](https://github.com/vadimdemedes/ink/issues/5), opened 2016): components can't know their own dimensions. Ink renders components _before_ Yoga calculates layout. By the time dimensions are known, React is done.

Silvery runs layout first, then components render with actual dimensions:

```tsx
// Ink: width props must cascade through the entire tree
function Card({ width }: { width: number }) {
  return <Text>{truncate(title, width)}</Text>
}

// Silvery: components query their own dimensions
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

// Silvery: render everything, let the framework handle overflow
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map(item => <Card key={item.id} item={item} />)}
</Box>
```

### CJK/IME Input

Terminal multiplexers (tmux, Zellij) can misinterpret frame boundaries during IME composition, causing 200-500ms latency and character dropping. Silvery wraps all TTY output with DEC 2026 synchronized update sequences automatically. Disable with `SILVERY_SYNC_UPDATE=0`.

---

## Layout Engines

Silvery supports pluggable layout engines with the same flexbox API:

|                    | Flexily (default) | Yoga (WASM) |
| ------------------ | ----------------- | ----------- |
| Size (gzip)        | 7 KB              | 38 KB       |
| Language           | Pure JS           | C++ → WASM  |
| Initialization     | Synchronous       | Async       |
| 100-node layout    | 85 µs             | 88 µs       |
| 50-node kanban     | 57 µs             | 54 µs       |
| RTL direction      | Supported         | Supported   |
| Baseline alignment | Not supported     | Supported   |

Both are fast enough for 60fps terminal UIs. Flexily is 5x smaller with comparable performance. See the [Flexily docs](https://beorn.github.io/flexily) for details.

Note: Ink 6 uses Yoga NAPI (native C++), which is ~2x slower than both Flexily and Yoga WASM due to JS↔C++ bridge overhead.

---

## Real-World Scenarios

### Dashboard with Resizable Panes

Components need to know their dimensions to render content appropriately (charts, tables, wrapped text).

- **Ink**: Thread terminal width through props, re-calculate on resize, re-render entire tree.
- **Silvery**: Each pane reads `useContentRect()` and adapts. Resize triggers layout-only pass (21 µs for 1000 nodes).

### Scrollable Task List

A list of 500+ items where the user navigates with j/k.

- **Ink**: Requires manual virtualization with height estimation. Height calculation is error-prone without layout feedback.
- **Silvery**: `overflow="scroll"` handles everything. VirtualList component optimizes large lists.

### Kanban Board

3+ columns of cards, each column independently scrollable, cards showing truncated content.

- **Ink**: Complex width-threading (board→column→card), manual scroll per column, manual truncation.
- **Silvery**: Columns and cards auto-size. Each column scrolls independently. Text auto-truncates.

### Search with Live Filtering

Type-ahead search with debounced results rendering.

- **Ink**: `useInput` for text capture, manual list rendering.
- **Silvery**: `InputLayerProvider` for text input isolation, `useContentRect` for result count fitting.

This pattern uses `useTransition` + `useDeferredValue` for responsive filtering.

### Simple CLI Prompt

One-shot question → answer → exit.

- **Ink**: Excellent — large ecosystem of prompt components (ink-select-input, ink-text-input, ink-spinner).
- **Silvery**: Works, but fewer ready-made components. Ink's ecosystem is the better choice here.

---

## Compatibility Coverage

Tested scenarios derived from common Ink issues:

| Scenario                                            | Silvery Test                                           | Ink Issue                                               |
| --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| CJK character rendering (Chinese, Japanese, Korean) | `ime.test.tsx`                                         | [#759](https://github.com/vadimdemedes/ink/issues/759)  |
| Double-width character alignment                    | `ime.test.tsx`, `wide-char-truncate.test.ts`           | [#759](https://github.com/vadimdemedes/ink/issues/759)  |
| Emoji ZWJ sequences                                 | `ime.test.tsx`                                         | —                                                       |
| ANSI-aware text truncation                          | `text-truncate-width.test.ts`                          | [#584](https://github.com/vadimdemedes/ink/issues/584)  |
| Rapid keystrokes (burst input)                      | `input.test.tsx`                                       | [PR #782](https://github.com/vadimdemedes/ink/pull/782) |
| borderDimColor                                      | `border-dim-color.test.tsx`                            | [#840](https://github.com/vadimdemedes/ink/issues/840)  |
| Large component counts (1000+)                      | `performance.test.tsx`, `memory.test.tsx`              | [#694](https://github.com/vadimdemedes/ink/issues/694)  |
| Home/End key support                                | `keys.test.ts`                                         | [PR #829](https://github.com/vadimdemedes/ink/pull/829) |
| Process exit timing                                 | `exit.test.tsx`                                        | [#796](https://github.com/vadimdemedes/ink/issues/796)  |
| tmux rendering                                      | `terminal-multiplexers.test.ts`, `sync-update.test.ts` | [PR #846](https://github.com/vadimdemedes/ink/pull/846) |
| Zellij rendering                                    | `terminal-multiplexers.test.ts`                        | [PR #846](https://github.com/vadimdemedes/ink/pull/846) |

---

## Appendix: Detailed Benchmarks

_Apple M1 Max, Bun 1.3.9, Feb 2026. Reproduce: `bun run bench:compare`_

### Full Pipeline (React Reconciliation + Layout + Output)

| Components             | Silvery (Flexily) | Ink 6 (Yoga NAPI) | Faster       |
| ---------------------- | ----------------- | ----------------- | ------------ |
| 1 Box+Text (80x24)     | 165 µs            | 271 µs            | Silvery 1.6x |
| 100 Box+Text (80x24)   | 45.0 ms           | 49.4 ms           | Silvery 1.1x |
| 1000 Box+Text (120x40) | 463 ms            | 541 ms            | Silvery 1.2x |

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
| 1     | 311 µs       | 38 µs        | 8x     |
| 100   | 23 ms        | 46 µs        | 500x   |
| 1000  | 236 ms       | 169 µs       | 1396x  |

This is the typical update path for interactive TUIs (cursor movement, scroll, single-node edits).

### Buffer Diff

| Scenario            | Time   |
| ------------------- | ------ |
| 80x24, no changes   | 28 µs  |
| 80x24, 10% changed  | 34 µs  |
| 80x24, full repaint | 59 µs  |
| 200x50, no changes  | 146 µs |

Packed Uint32Array cell comparison with cursor-movement optimization.

### Layout Engine (Pure Layout, No React)

| Benchmark      | Flexily (JS) | Yoga WASM | Yoga NAPI (C++) |
| -------------- | ------------ | --------- | --------------- |
| 100 nodes flat | 85 µs        | 88 µs     | 197 µs          |
| 50-node kanban | 57 µs        | 54 µs     | 136 µs          |

### Resize (Layout Only)

| Nodes | Time   |
| ----- | ------ |
| 10    | 250 ns |
| 100   | 2 µs   |
| 1000  | 21 µs  |

### Bundle Size

| Package           | Size (gzip) |
| ----------------- | ----------- |
| Silvery + Flexily | ~45 KB      |
| Silvery + Yoga    | ~76 KB      |
| Ink               | ~52 KB      |

---

## Real-World Impact

These aren't theoretical differences. Production Ink-based CLIs have hit several of these issues:

- **Memory**: Claude Code (Anthropic's CLI, built on Ink) reported [120+ GB memory usage](https://github.com/anthropics/claude-code/issues/4953) from Yoga WASM linear memory growth, crashing every 30-60 minutes. Versions 2.1.47–2.1.50 each fixed WASM memory leaks. Silvery's pure-TS layout eliminates this entire bug category.
- **Flicker**: Ink's approach of [clearing the entire terminal](https://github.com/vadimdemedes/ink/issues/359) on each render causes visible flicker, especially in tmux. A [Hacker News discussion](https://news.ycombinator.com/item?id=46844822) noted that Ink "literally clears the entire terminal including scrollback buffer on each full render." Silvery's dirty tracking and DEC 2026 synchronized updates produce flicker-free output.
- **Performance**: Developers have noted ["rough edges in rendering performance"](https://www.libhunt.com/posts/1476376-claude-opus-4-6) with Ink-based tools. Silvery's 100x+ faster interactive updates (dirty tracking vs full re-render) directly address this.
- **Missing capabilities**: Production CLIs lack mouse support, customizable keybindings, focus management, and modern terminal protocol support — all built into Silvery.

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
