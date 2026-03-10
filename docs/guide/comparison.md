# TUI Framework Comparison

A feature comparison of major terminal UI frameworks across languages and ecosystems. Covers rendering, terminal protocols, layout, components, developer experience, and architecture. Values reflect the state of each framework as of early 2026.

> For an in-depth Silvery vs Ink analysis with code examples, benchmarks, and migration guidance, see [silvery-vs-ink.md](silvery-vs-ink.md).

**Legend:** ✅ Full support (built-in, documented) | ⚡ Best-in-class | 🔶 Partial support | ❌ Not supported | 🔧 Community/plugin

---

## Rendering

| Feature                                   | Silvery                                                | Ink                           | BubbleTea        | Textual               | Notcurses                 | FTXUI           | blessed   |
| ----------------------------------------- | ------------------------------------------------------ | ----------------------------- | ---------------- | --------------------- | ------------------------- | --------------- | --------- |
| Incremental rendering (dirty tracking)    | ⚡ Per-node dirty flags [^1]                           | ❌ Full repaint               | ❌ Full repaint  | ✅ Dirty widgets      | ⚡ Damage map per ncplane | ❌ Full repaint | 🔶 Manual |
| Style transition cache (minimal SGR diff) | ⚡ Interned styles + cached SGR transitions [^2]       | ❌                            | ❌               | 🔶                    | ✅                        | ❌              | ❌        |
| Damage rectangles / dirty regions         | ⚡ Row-level bounding box + bitset                     | ❌                            | ❌               | ✅ Per-widget regions | ⚡ Per-plane damage       | ❌              | ❌        |
| Double buffering                          | ✅ Packed Uint32Array cells                            | ❌ String-based               | ✅               | ✅                    | ✅ ncplanes               | ✅              | 🔶        |
| Synchronized output (DEC 2026)            | ⚡ Automatic                                           | ❌ [^3]                       | ✅ v2 alpha      | ✅                    | ✅                        | ❌              | ❌        |
| Wide character support (CJK)              | ⚡ Built-in wcwidth + grapheme splitting + atomic diff | 🔶 Third-party `string-width` | ✅               | ✅                    | ⚡ Built-in wcwidth       | ✅              | 🔶        |
| Frame rate limiting                       | ✅ Scheduler coalescing                                | ❌                            | 🔶 Manual `tick` | ✅ Configurable FPS   | ✅                        | ✅              | ❌        |

[^1]: Silvery tracks 7 independent dirty flags per node (`contentDirty`, `layoutDirty`, `paintDirty`, `subtreeDirty`, `childrenDirty`, `childPositionChanged`, `hasPrevBuffer`), enabling style-only changes to skip layout and content changes to skip paint.

[^2]: With ~15-50 unique styles per TUI, Silvery caches all (oldStyle, newStyle) SGR transition strings (~2,500 possible pairs), eliminating per-cell string building.

[^3]: Ink has a PR exploring synchronized updates (#846) but it is not yet merged.

---

## Terminal Protocols

| Feature                 | Silvery                                     | Ink                     | BubbleTea                     | Textual       | Notcurses | FTXUI | blessed |
| ----------------------- | ------------------------------------------- | ----------------------- | ----------------------------- | ------------- | --------- | ----- | ------- |
| Kitty keyboard protocol | ⚡ Full spec: all 5 flags, auto-detect [^4] | ❌ [^5]                 | 🔶 v2 alpha                   | ❌            | ❌        | ❌    | ❌      |
| Bracketed paste mode    | ✅ `usePaste` hook, auto-enable             | ❌                      | ✅ Default since v0.26        | ✅            | 🔶        | ❌    | ❌      |
| OSC 52 clipboard        | ✅ Copy + query, works over SSH             | ❌                      | 🔶 v2 alpha via terminfo `Ms` | ✅            | ✅        | ❌    | ❌      |
| OSC 8 hyperlinks        | ✅ `<Link>` component                       | ❌                      | ❌                            | ✅            | ✅        | ❌    | ❌      |
| OSC 9/99 notifications  | ✅ Auto-detect (iTerm2/Kitty)               | ❌                      | ❌                            | ✅ `notify()` | ✅        | ❌    | ❌      |
| SGR mouse events        | ✅ Click, drag, wheel, modifiers            | 🔶 Basic via `useInput` | ✅                            | ✅            | ✅        | ✅    | ✅      |
| Sixel images            | ✅ Auto-detect with fallback                | ❌                      | 🔧 `x/cellbuf`                | ❌            | ⚡        | ❌    | ❌      |
| Kitty graphics protocol | ✅ Auto-detect with fallback                | ❌                      | 🔧 `x/cellbuf`                | ❌            | ⚡        | ❌    | ❌      |
| Alternate screen        | ✅                                          | ✅                      | ✅                            | ✅            | ✅        | ✅    | ✅      |

[^4]: Silvery supports all Kitty flags: `DISAMBIGUATE`, `REPORT_EVENTS` (press/repeat/release), `REPORT_ALTERNATE`, `REPORT_ALL_KEYS`, `REPORT_TEXT`. Detects Cmd/Super and Hyper modifiers, CapsLock/NumLock. Auto-detects terminal support via `CSI ? u` query.

[^5]: Ink has a PR (#852) for Kitty keyboard support in review but not merged.

---

## Layout & Components

| Feature                                      | Silvery                                                       | Ink                             | BubbleTea                            | Textual                        | Notcurses               | FTXUI              | blessed                  |
| -------------------------------------------- | ------------------------------------------------------------- | ------------------------------- | ------------------------------------ | ------------------------------ | ----------------------- | ------------------ | ------------------------ |
| Layout engine                                | ⚡ Flexbox (Flexily 7KB pure JS or Yoga) [^6]                 | Flexbox (Yoga NAPI, native C++) | Manual                               | ⚡ CSS subset (grid + flexbox) | Manual ncplane stacking | Flexbox-like (C++) | Manual                   |
| React/component model                        | ⚡ React 19, JSX, hooks                                       | ✅ React 18, JSX, hooks         | Elm architecture (Model-Update-View) | Widget classes                 | C structs               | C++ components     | Event emitter objects    |
| Layout feedback (components know their size) | ⚡ `useContentRect()` / `useScreenRect()` — synchronous [^7]  | ❌ Open since 2016 (#5)         | ❌                                   | ✅ `size` property on widgets  | 🔶 ncplane dimensions   | 🔶                 | 🔶                       |
| Virtual list / lazy rendering                | ✅ `VirtualList` component                                    | ❌                              | 🔧 `list` Bubble                     | ✅ Built-in `ListView`         | ❌                      | ❌                 | ✅ `List`                |
| Text input components                        | ✅ TextInput (with readline), TextArea (multi-line)           | 🔧 `ink-text-input`             | 🔧 `textinput` Bubble                | ✅ `Input`, `TextArea`         | ❌                      | ✅ `Input`         | ✅ `Textbox`, `Textarea` |
| Focus management                             | ⚡ Tree-based: scopes, spatial nav, autoFocus, click-to-focus | ❌                              | ❌                                   | ✅                             | ❌                      | ✅                 | 🔶                       |
| Scroll containers                            | ✅ `overflow="scroll"` with auto-measurement                  | ❌ Open since 2019 (#222)       | 🔧 `viewport` Bubble                 | ✅ `ScrollableContainer`       | ✅ ncplane scrolling    | ✅                 | ✅                       |
| Theming / CSS                                | ✅ ThemeProvider + semantic tokens                            | 🔶 Style props                  | ❌                                   | ⚡ CSS files + live reload     | ❌                      | 🔶                 | 🔶                       |

[^6]: Silvery's Flexily layout engine is pure JavaScript (7 KB gzipped) with zero native dependencies. It matches Yoga WASM performance and is 2.4x faster than Yoga NAPI. Layout results are cached via fingerprinting, so unchanged subtrees skip recomputation entirely.

[^7]: Silvery's core innovation: two-phase rendering runs layout before components render, so `useContentRect()` returns actual dimensions synchronously during render, not via a post-render callback. This eliminates an entire category of bugs around "width is 0 on first render."

---

## Developer Experience

| Feature                             | Silvery                                                   | Ink                      | BubbleTea                   | Textual                            | Notcurses | FTXUI    | blessed             |
| ----------------------------------- | --------------------------------------------------------- | ------------------------ | --------------------------- | ---------------------------------- | --------- | -------- | ------------------- |
| Testing utilities (headless render) | ⚡ Playwright-style locators, auto-refreshing [^8]        | ✅ `ink-testing-library` | 🔧 `teatest`                | ✅ Pilot (async testing)           | ❌        | ❌       | ❌                  |
| Hot reload                          | 🔶 Via Bun/Node watch mode                                | 🔶 Via bundler           | ❌                          | ✅ CSS hot reload                  | ❌        | ❌       | ❌                  |
| DevTools / inspector                | 🔶 `withDiagnostics` invariant checker                    | ❌                       | ❌                          | ⚡ Web-based DevTools (DOM mirror) | ❌        | ❌       | ❌                  |
| Plugin composition                  | ✅ `withCommands` / `withKeybindings` / `withDiagnostics` | ❌                       | 🔶 Middleware via `tea.Cmd` | ❌                                 | ❌        | ❌       | ❌                  |
| Driver pattern (AI/test automation) | ⚡ Command introspection + state query + screenshot [^9]  | ❌                       | ❌                          | ❌                                 | ❌        | ❌       | ❌                  |
| TypeScript support                  | ⚡ Native, strict mode                                    | ✅                       | ❌ (Go)                     | ❌ (Python, typed)                 | ❌ (C)    | ❌ (C++) | 🔶 `@types/blessed` |
| Screenshots (buffer to image)       | ✅ `bufferToHTML()` + Playwright                          | ❌                       | ❌                          | ✅ SVG export                      | ❌        | ❌       | ❌                  |

[^8]: Silvery's `createRenderer` provides auto-refreshing locators (same locator object always queries fresh tree state), `getByTestId`/`getByText`/CSS attribute selectors, bounding box assertions, and Playwright-style `press()` input. Locators never go stale.

[^9]: The driver pattern composes `withCommands` + `withKeybindings` + `withDiagnostics` to expose all commands as callable functions with metadata (ID, name, help, keybindings). An AI agent can list available commands, inspect screen state, execute actions, and capture screenshots -- all programmatically.

---

## Architecture

| Feature                 | Silvery                                                | Ink                                       | BubbleTea                          | Textual                               | Notcurses                | FTXUI                    | blessed                |
| ----------------------- | ------------------------------------------------------ | ----------------------------------------- | ---------------------------------- | ------------------------------------- | ------------------------ | ------------------------ | ---------------------- |
| Rendering model         | Retained (React tree + dirty tracking)                 | Retained (React tree, full repaint)       | Immediate (Model-Update-View)      | Retained (widget tree)                | Retained (ncplane stack) | Immediate                | Retained (widget tree) |
| State management        | React hooks or Zustand store                           | React hooks                               | Elm-style (Model + Update + Cmd)   | Reactive attributes + message passing | Manual                   | Component state          | Event emitter          |
| Input handling          | InputLayer stack (DOM-style bubbling) + command system | `useInput` (flat, no isolation)           | `Update(msg)`                      | Message dispatch + bindings           | Direct ncplane input     | Event handler            | Event emitter          |
| Language / runtime      | TypeScript / Bun or Node.js                            | JavaScript / Node.js                      | Go                                 | Python (3.8+)                         | C (C99)                  | C++ (17)                 | JavaScript / Node.js   |
| Native dependencies     | None (pure JS/TS)                                      | Yoga NAPI (C++ addon)                     | None                               | None                                  | terminfo, FFI libs       | None                     | None                   |
| Memory in long sessions | Constant (normal JS GC)                                | Grows (Yoga WASM linear memory) [^10]     | Constant                           | Constant                              | Constant                 | Constant                 | Grows (known leaks)    |
| Render targets          | Terminal, Canvas 2D, DOM                               | Terminal only                             | Terminal only                      | Terminal + Web (Textual-web)          | Terminal only            | Terminal only            | Terminal only          |
| Community / ecosystem   | New (active development)                               | Mature (~1.3M npm weekly, 50+ components) | Large (Go ecosystem, 100+ Bubbles) | Growing (Python ecosystem)            | Niche (C specialists)    | Moderate (C++ community) | Legacy (unmaintained)  |
| Maintenance status      | Active                                                 | Maintenance mode                          | Active                             | Active                                | Slow / winding down      | Active                   | Unmaintained           |

[^10]: Ink uses Yoga WASM, whose linear memory grows monotonically and cannot shrink without a module reset. This has caused [120+ GB memory usage](https://github.com/anthropics/claude-code/issues/4953) in long-running production apps (e.g., Claude Code).

---

## Unique Strengths

> Performance claims below are summary figures. Reproduce with `bun run bench` for full benchmark data.

### Silvery

- **Two-phase rendering with layout feedback**: Components know their dimensions during render via `useContentRect()` -- the only React-based TUI framework where this works synchronously.
- **Per-node dirty tracking**: Interactive updates (keystroke, scroll) take ~169 us for 1000 nodes vs Ink's 20.7 ms full re-render -- 100x+ faster for the updates that matter.
- **Driver pattern for AI automation**: Composable plugins (`withCommands` + `withKeybindings` + `withDiagnostics`) expose the full command surface for programmatic control, introspection, and testing.

### Ink

- **Largest ecosystem**: ~1.3M npm weekly downloads, 50+ community components (prompts, spinners, tables, select inputs), used by Gatsby, Prisma, Terraform CDK, Shopify CLI.
- **Familiar React model**: Lowest learning curve for React developers -- standard hooks, JSX, and component patterns.
- **Battle-tested stability**: 8+ years of production use across thousands of CLI tools.

### BubbleTea

- **Elm architecture in Go**: Clean Model-Update-View pattern with immutable state. Easy to reason about, easy to test.
- **Rich component ecosystem**: 100+ community "Bubbles" (tables, file pickers, progress bars, viewports, markdown renderers).
- **Single binary deployment**: Go compiles to a static binary -- no runtime dependencies, no package manager.

### Textual

- **CSS theming**: Full CSS files with selectors, variables, and live reload. The closest any TUI framework gets to web-style styling.
- **Web-based DevTools**: A DOM mirror inspector running in the browser, with widget tree exploration, CSS debugging, and live editing.
- **Textual-web**: Serve any Textual app as a web application with no code changes.

### Notcurses

- **Best image rendering**: Native Sixel and Kitty graphics protocol support with per-pixel rendering. The gold standard for terminal graphics.
- **ncplane compositing**: Layered rendering planes with independent z-ordering, scrolling, and damage tracking. Arbitrary overlapping regions without manual clipping.
- **Performance ceiling**: C implementation with zero-copy rendering paths. Handles the highest throughput workloads (media players, data visualizers).

### FTXUI

- **Zero dependencies**: Pure C++17 with no external libraries. Single header inclusion for simple projects.
- **Immediate mode simplicity**: UI is a pure function of state -- no retained tree, no lifecycle management, no stale state bugs.
- **Cross-platform C++**: Works on Linux, macOS, Windows, and WebAssembly (Emscripten) from the same codebase.

### blessed (legacy)

- **Historical significance**: The original comprehensive Node.js TUI framework (2013). Inspired Ink's creation and influenced the terminal UI ecosystem.
- **Widget completeness**: The most complete built-in widget set of any Node.js TUI library (lists, forms, tables, file managers, terminals-in-terminals). No other Node.js framework matched its breadth.
- **Note**: Unmaintained since ~2017. `neo-blessed` is a community fork with minor fixes but no active development. Listed here for historical context.
