# Silvery vs Ink

_External project claims last verified: 2026-04. Ink version: 7.0.0._

Silvery is a ground-up React terminal renderer with a different rendering architecture. Same `Box`, `Text`, `useInput` API — <a href="#compatibility" title="918+/931 Ink 7.0 tests pass. ~12 intentional differences: Flexily follows W3C spec where Yoga doesn't (4), build artifact format (2), minor edge cases (~6). Silvery supports Yoga as a pluggable engine for exact parity.">99% of Ink's tests pass</a> on silvery's compat layer. [Migration guide →](/getting-started/migrate-from-ink)

## Feature Matrix

Ink first, Silvery second. Features marked "core" are built into the framework; "ecosystem" means available via official or third-party packages.

### Rendering

| Feature | Ink 7.0 | Silvery |
|---|---|---|
| **ANSI compositing** | String concatenation; no compositing layer | Cell-level buffer with style stacking + color blending |
| **Incremental rendering (fullscreen)** | Line-level diff; any change rewrites entire line | Cell-level dirty tracking (7 flags/node), cell-level buffer diff |
| **Incremental rendering (inline mode)** | Full redraw every frame | Cell-level diff works in inline mode with native scrollback |
| **Responsive layout** | `useBoxMetrics()` — post-layout via `useEffect`, returns 0×0 first | `useBoxRect()` — dimensions available _during_ render, first pass |
| **Scrollable containers** | `visible`/`hidden` only; ecosystem packages available ([#222](https://github.com/vadimdemedes/ink/issues/222), [ink-scroll-view](https://github.com/grahammendick/ink-scroll-view)) | `overflow="scroll"` + `scrollTo` — core framework, handles clipping |
| **Sticky headers** | None | `position="sticky"` in scroll containers |
| **Dynamic scrollback** | All items stay in render tree | Items automatically graduate to terminal history; Cmd+F works |
| **Inline-like fullscreen** | None | Alt-screen with scrollback graduation — fullscreen control + inline UX |
| **Render targets** | Terminal only | Terminal, Canvas 2D, DOM (experimental) |

### Performance & Size

| Metric | Ink 7.0 | Silvery |
|---|---|---|
| **Speed (mounted workloads)** | Baseline | **3–5× faster** in our benchmarks ([reproduce](https://github.com/beorn/silvery/tree/main/benchmarks)) |
| **Output efficiency** | Full line rewrite per change | **28–192× less output** — cell-level diff + relative cursor addressing |
| **Bundle size (gzipped)** | 116.6 KB (Ink + Yoga WASM) | 114.9 KB (runtime + Flexily) — parity |
| **Layout engine** | Yoga WASM only (~45 KB, async init) | [Flexily](https://beorn.codes/flexily) (pure JS, ~2 KB, sync) or Yoga — pluggable |
| **Layout caching** | Full tree recomputation every pass | Fingerprint + cache unchanged subtrees |
| **Memory (long sessions)** | Yoga WASM linear heap can grow | Normal JS GC; graduated scrollback frees React tree |
| **Native dependencies** | Yoga WASM binary blob | None — pure TypeScript |
| **Initialization** | Async WASM loading | Synchronous import |

### Interaction

| Feature | Ink 7.0 | Silvery |
|---|---|---|
| **Mouse + drag-and-drop** | None | SGR mouse, `onClick`/`onWheel`, hit testing, drag |
| **Input layering** | Flat: all handlers see all input | DOM-style bubbling, modal isolation, `stopPropagation` |
| **Focus system** | Tab-order (`useFocus`, `useFocusManager`) | Tree-based: scopes, spatial nav (arrow keys), click-to-focus, `useFocusWithin` |
| **Text selection + find + copy-mode** | None | Mouse drag, `Ctrl+F` search, `Esc,v` keyboard selection |
| **TextInput / TextArea** | Ecosystem: [`@inkjs/ui`](https://github.com/vadimdemedes/ink-ui) TextInput, [`ink-text-input`](https://github.com/vadimdemedes/ink-text-input) | Core: built-in readline, cursor, selection, undo/redo |
| **Command + keybinding system** | None | Named commands, context-aware keys, `parseHotkey("⌘K")` |
| **Clipboard** | None | OSC 52 — works across SSH |
| **Image rendering** | Ecosystem: [`ink-picture`](https://github.com/Kevin-S-Guo/ink-picture) | Core: `<Image>` — Kitty graphics + Sixel + text fallback |
| **Hyperlinks** | OSC 8 (v6.8.0+) | `<Link>` — OSC 8 clickable URLs |

### Components & Framework

| Feature | Ink 7.0 | Silvery |
|---|---|---|
| **Built-in components** | 6 core (Box, Text, Static, Newline, Spacer, Transform) | **45+** core (VirtualList, Table, CommandPalette, TreeView, Toast, Tabs, SplitView, ...) |
| **Official component library** | [`@inkjs/ui`](https://github.com/vadimdemedes/ink-ui): 13 input-focused components (TextInput, Select, MultiSelect, Spinner, ProgressBar, ConfirmInput, EmailInput, PasswordInput, Badge, Alert, StatusMessage, lists) | 45+ components built into core — includes advanced widgets (Table, TreeView, CommandPalette, Toast, SplitView, ModalDialog, Tabs, TextArea, VirtualList) |
| **Third-party ecosystem** | 50+ community packages ([ecosystem list](https://github.com/vadimdemedes/ink#community)) | Newer, smaller community |
| **Theme system** | Manual chalk styling | 38 palettes, semantic tokens (`$primary`, `$muted`), auto-detect |
| **Accessibility** | `aria-role`, `aria-label`, `aria-state`, `useIsScreenReaderEnabled` | Basic support |
| **TEA state machines** | None | `@silvery/create`: `(action, state) → [state, effects]`, replay, undo |
| **Plugin composition** | None | `withCommands` / `withKeybindings` / `withDomEvents` / `withFocus` |
| **Animation** | `useAnimation` (frame/time/delta, v7.0+) | `useAnimation` + easing functions + `useAnimatedTransition` |
| **Resource cleanup** | Manual `unmount()` | `using` / Disposable — automatic teardown |

### Testing

| Feature | Ink 7.0 | Silvery |
|---|---|---|
| **Test library** | [`ink-testing-library`](https://github.com/vadimdemedes/ink-testing-library) (official) | Built-in `@silvery/test` with Playwright-style locators, `press()`, buffer assertions |
| **Headless rendering** | None (always renders to stdout) | `createTerm({ cols, rows })` — no terminal needed |
| **Terminal emulator in tests** | None | `createTermless()` — real xterm.js emulator in-process |
| **Render invariant checks** | None | `SILVERY_STRICT=1` verifies incremental = fresh on every frame |
| **Multi-backend verification** | None | STRICT checks against vt100, xterm.js, and Ghostty backends |
| **Visual snapshots** | None | `bufferToHTML()` + Playwright programmatic capture |

### API & DX

| Feature | Ink 7.0 | Silvery |
|---|---|---|
| **Simple API** | `render(<App />)` | `render(<App />)` — same. `run(<App />)` adds runtime. `pipe()` for advanced composition |
| **React DevTools** | Supported | `SILVERY_DEV=1` inspector (tree visualization, dirty flags, focus path) |
| **Unicode utilities** | Third-party (`string-width`, `slice-ansi`, etc.) | Built-in: 28+ functions for grapheme splitting, display width, CJK, ANSI-aware truncation |
| **Console capture** | `patchConsole()` (intercept-only) | Built-in `<Console />` component (composable, embeddable) |
| **Non-TTY detection** | Terminal size for piped processes (v6.7.0) | `isTTY()`, `resolveNonTTYMode()`, `renderString()` fallback |
| **Community** | ~1.3M npm weekly downloads, mature ecosystem | Newer, smaller community |
| **Documentation** | Extensive README, many community examples | Growing docs site (silvery.dev) |

### Both have

React 19, Box/Text, flexbox, `useInput`, `useApp`/exit, `Static`, `Transform`, border styles, `measureElement`, Kitty keyboard, `renderToString`, `useCursor`, `usePaste`, `useAnimation`, `useWindowSize`, DEC mode 2026 (synchronized output), `useFocus`/`useFocusManager`, alternate screen, concurrent mode, Suspense.

## Performance

_Reproduce: `bun run bench`_

Silvery wins **all 16 benchmark scenarios** vs Ink 7.0 on mounted workloads — the fair comparison (both frameworks keep a mounted app and call `rerender()`).

### Canonical — mounted app, what users experience

| Scenario                            | Silvery advantage |
| ----------------------------------- | ----------------- |
| Mounted cursor move 100-item        | **2.56×**         |
| Mounted kanban single text change   | **3.36×**         |
| Memo'd 100-item single toggle       | **4.59×**         |
| Memo'd 500-item single toggle       | **5.15×**         |
| Memo'd kanban 5×20 single card edit | **3.75×**         |

### Cold render (createRenderer reuse)

| Scenario               | Silvery advantage |
| ---------------------- | ----------------- |
| Flat list 10 (80×24)   | **3.37×**         |
| Flat list 100 (80×24)  | **3.53×**         |
| Flat list 100 (200×60) | **4.56×**         |
| Styled list 100        | **3.76×**         |
| Kanban 5×10            | **3.99×**         |
| Kanban 5×20 (200×60)   | **4.77×**         |
| Deep tree 20           | **2.59×**         |
| Deep tree 50           | **2.73×**         |

### Output efficiency

Silvery emits **28–192× less output** to the terminal than a full redraw on incremental updates. Cell-level buffer diff + relative cursor addressing.

### Bundle size

| Package                                | Minified + Gzipped | vs Ink+Yoga |
| -------------------------------------- | ------------------ | ----------- |
| Ink 7.0 + Yoga WASM (baseline)         | 116.6 KB           | 1.00×       |
| `silvery/runtime` (core + flexily)     | **114.9 KB**       | **0.99× (tied)** |
| `silvery/ink` (Ink compat layer)       | 119.2 KB           | 1.02×       |

### Methodology

- **Tooling**: [mitata](https://github.com/evanwashere/mitata) with warmup + automatic iteration count
- **STRICT mode** disabled (`SILVERY_STRICT=0`). A prior env-parsing bug treated `"0"` as truthy; fixed 2026-04-09.
- **Fair comparison**: Mounted scenarios keep both frameworks' React trees mounted and call `rerender()`
- **Reproduce**: `bun run bench`

## Compatibility

Silvery passes **918+ of Ink 7.0's 931 tests** (~98.6%). Chalk: **32/32 (100%)**. Run `bun run compat` to verify.

### What we chose to do differently {#what-we-chose-differently}

The ~12 remaining test failures are **intentional design choices**, not bugs:

- **W3C flexbox spec over Yoga quirks** (4 tests) — Flexily follows the W3C flexbox specification for flex-wrap and aspect-ratio behavior. Yoga has non-standard behaviors here that Ink tests expect. We chose spec compliance. If you need exact Yoga parity, silvery supports Yoga as a pluggable engine.
- **TypeScript source over compiled build artifacts** (2 tests) — Ink expects a `./build/` directory. Silvery ships raw TypeScript source (for Bun) + pre-built `dist/` (for Node). The tests check for file paths that don't exist in silvery's layout.
- **Minor rendering edge cases** (~6 tests) — SGR attribute ordering (dim+bold emission order differs), `measureElement` timing in synchronous render, and `renderToString` effect ordering. These produce identical visual output in practice.

::: details Remaining failures breakdown
| Category                           | Failures | Why |
| ---------------------------------- | -------- | --- |
| Flexily W3C spec divergence        | 4        | flex-wrap (2), aspect ratio (2) — Flexily follows W3C, Yoga doesn't |
| Build artifact checks              | 2        | Ink expects `./build/`; silvery ships TypeScript + `dist/` |
| Minor rendering edge cases         | ~6       | SGR order (2), measure timing (1), render-to-string timing (1), misc |
:::

::: details Recently shipped compat (2026-04-09)
- `BackgroundContext` shim (+27 tests)
- `maxFps` render throttling (+3)
- Kitty protocol negotiation bytes (+3)
- Debug-mode cursor API (+3)
- `wrap="hard"` (+1), CJK overlay (+2), overflow clipping (+3), per-side `borderBackgroundColor` (+5)
:::

All Ink 7.0 hooks have full shims. [Full API mapping →](/reference/compatibility)

If you need exact Yoga layout parity, Silvery supports Yoga as a pluggable engine.

## Key Differences Explained

### Responsive Layout

The core architectural difference — think [CSS container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries) for terminals. On the web, container queries were the #1 requested feature for a decade because the alternatives (media queries + ResizeObserver) meant rendering first, measuring after, then re-rendering with correct values. Terminal UIs hit the same wall.

Ink renders components, then runs Yoga layout. `useBoxMetrics()` provides dimensions _after_ layout via `useEffect`, meaning the first render always sees `{width: 0, height: 0}`. With nested responsive components (board → column → card), each level needs its own measure→rerender cycle — N nesting levels, N visible flickers. Silvery runs layout first, then renders all components with actual dimensions via `useBoxRect()` in one batch.

```tsx
// Ink: useBoxMetrics returns 0x0 on first render, updates via effect
function Card() {
  const ref = useRef(null)
  const { width, hasMeasured } = useBoxMetrics(ref)
  if (!hasMeasured)
    return (
      <Box ref={ref}>
        <Text>Loading...</Text>
      </Box>
    )
  return (
    <Box ref={ref}>
      <Text>{truncate(title, width)}</Text>
    </Box>
  )
}

// Silvery: useBoxRect returns actual dimensions immediately
function Card() {
  const { width } = useBoxRect()
  return <Text>{truncate(title, width)}</Text>
}
```

This difference cascades into scrolling, auto-truncation, responsive layouts, and any feature that needs to know "how much space do I have?" during the render pass rather than after it.

### Scrolling

Ink's `overflow` property supports `visible` and `hidden` -- not `scroll`. Scrolling remains the #1 feature request ([#222](https://github.com/vadimdemedes/ink/issues/222), open since 2019):

```tsx
// Ink: manual virtualization with height estimation
<VirtualList
  items={items}
  height={availableHeight}
  estimateHeight={(item) => calculateHeight(item, width)}
  renderItem={(item) => <Card item={item} />}
/>

// Silvery: render everything, let the framework handle it
<Box overflow="scroll" scrollTo={selectedIdx}>
  {items.map(item => <Card key={item.id} item={item} />)}
</Box>
```

### Input Layering

Ink's `useInput` is flat -- all registered handlers receive all input. Opening a modal dialog means manually checking flags in every handler:

```tsx
// Ink: every handler must check modal state
useInput((input, key) => {
  if (isDialogOpen) return  // must guard in EVERY handler
  if (input === 'j') moveDown()
})

// Silvery: input layers isolate automatically
<InputLayerProvider>
  <Board />        {/* receives input when dialog is closed */}
  {isOpen && <Dialog />}  {/* consumes input, board never sees it */}
</InputLayerProvider>
```

### Focus System

Ink provides tab-order focus with `useFocus()` — components register in a flat list and cycle via Tab/Shift+Tab. Silvery provides tree-based focus with scopes, spatial navigation (arrow keys move focus directionally based on layout position), click-to-focus, `useFocusWithin`, and DOM-style focus/blur events:

```tsx
// Silvery: spatial focus navigation
<FocusScope>
  <Row>
    <FocusableCard /> {/* Left arrow → previous, Right arrow → next */}
    <FocusableCard />
    <FocusableCard />
  </Row>
</FocusScope>
```

**Compat bridge:** `withInkFocus()` provides Ink's flat-list focus system as a thin plugin. Apps using Ink's `useFocus()` / `useFocusManager()` work unchanged. For new code, silvery's `useFocusable()` is strictly better — spatial awareness, focus scopes, event dispatch. See [Compat Layer Architecture](/reference/compatibility#compat-layer-architecture).

### Mouse Support

Silvery implements SGR mouse protocol (mode 1006) with DOM-style event handling:

```tsx
// Silvery: DOM-style mouse events
<Box onClick={(e) => selectItem(e.target)} onMouseDown={(e) => startDrag(e)} onWheel={(e) => scroll(e.deltaY)}>
  <Text>Click me</Text>
</Box>
```

Ink has no mouse support.

## Layout Engines

Silvery supports pluggable layout engines with the same flexbox API:

|                    | Flexily (default) | Yoga (WASM) |
| ------------------ | ----------------- | ----------- |
| Size (gzip)        | 19 KB             | 53 KB       |
| Language           | Pure JS           | C++ -> WASM |
| Initialization     | Synchronous       | Async       |
| 100-node layout    | 85 us             | 88 us       |
| 50-node kanban     | 57 us             | 54 us       |
| RTL direction      | Supported         | Supported   |
| Baseline alignment | Not supported     | Supported   |

Both are fast enough for 60fps terminal UIs. Flexily is ~3x smaller with comparable performance. See the [Flexily docs](https://beorn.codes/flexily) for details.

### Flexily vs Yoga Philosophy

Flexily intentionally follows the **W3C CSS Flexbox specification** where Yoga diverges from it. These aren't bugs — they're design choices that make Flexily behave like browsers do:

| Behavior                           | Flexily (CSS spec)         | Yoga (Ink)                   | Why it matters                                                                                                                                                                        |
| ---------------------------------- | -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default `flexDirection`            | `row`                      | `column`                     | CSS §9.1: initial value is `row`. Ink chose `column` for document-flow convenience, but it surprises anyone coming from web CSS.                                                      |
| `overflow:hidden` + `flexShrink:0` | Item shrinks to fit parent | Item expands to content size | CSS §4.5: overflow containers have `min-size: auto = 0`. Without this, an `overflow:hidden` child with 30 lines inside a height-10 parent computes as height 30 — defeating clipping. |
| `alignContent` distribution        | Matches browser behavior   | Slightly different spacing   | Minor differences in how cross-axis space is distributed across flex lines.                                                                                                           |

**If you prefer browser-standard flexbox**, use Flexily (the default). **If you need exact Ink layout parity**, install Yoga and switch:

```bash
bun add yoga-wasm-web
```

```tsx
import { render } from "silvery"

await render(<App />, { layoutEngine: "yoga" })
```

Or set `SILVERY_ENGINE=yoga` to switch globally without code changes.

Most Ink apps use simple layouts (`flexDirection="column"`, padding, borders) that work identically in both engines. The differences surface with advanced flexbox features like `flexWrap`, `alignContent`, and percentage-based `flexBasis`.

## Terminal Protocol Coverage

Silvery implements a comprehensive set of terminal protocols. This matters for cross-terminal compatibility, modern features (images, clipboard, extended keyboard), and correct rendering in multiplexers like tmux and Zellij.

### Escape Sequences

| Category                | Protocol                                                                        | Silvery | Ink     |
| ----------------------- | ------------------------------------------------------------------------------- | ------- | ------- |
| **SGR Styling**         | 16/256/Truecolor, bold, italic, dim, underline, strikethrough, inverse          | Full    | Full    |
| **Extended Underlines** | ISO 8613-6: single, double, curly, dotted, dashed + underline color (SGR 58/59) | Full    | None    |
| **Cursor Control**      | CUP, CUU/D/F/B, EL, ED, DECSCUSR (block/underline/bar cursors)                  | Full    | Partial |
| **Scroll Regions**      | DECSTBM (set/reset), SU/SD (scroll up/down)                                     | Full    | None    |

### DEC Private Modes

| Mode         | What                                        | Silvery | Ink                         |
| ------------ | ------------------------------------------- | ------- | --------------------------- |
| 25 (DECTCEM) | Cursor visibility                           | Yes     | Yes                         |
| 1000 (X10)   | Basic mouse tracking                        | Yes     | No                          |
| 1002         | Button event tracking (press + drag)        | Yes     | No                          |
| 1004         | Focus in/out reporting                      | Yes     | No                          |
| 1006 (SGR)   | Extended mouse protocol (large coordinates) | Yes     | No                          |
| 1049         | Alternate screen buffer                     | Yes     | Yes                         |
| 2004         | Bracketed paste mode                        | Yes     | Post-v6.8.0 (as of 2026-03) |
| 2026         | Synchronized output (flicker-free)          | Yes     | No                          |
| DECRPM       | Mode query (`CSI ? mode $ p`)               | Yes     | No                          |

### OSC Sequences

| OSC | What                                                | Silvery | Ink |
| --- | --------------------------------------------------- | ------- | --- |
| 0/2 | Window title                                        | Yes     | No  |
| 4   | Palette color query/set                             | Yes     | No  |
| 7   | Directory reporting (shell integration)             | Yes     | No  |
| 8   | Hyperlinks (clickable URLs)                         | Yes     | No  |
| 9   | iTerm2 notifications                                | Yes     | No  |
| 22  | Mouse cursor shape (pointer, text, crosshair, etc.) | Yes     | No  |
| 52  | Clipboard access (copy/paste over SSH)              | Yes     | No  |
| 66  | Text sizing protocol (Kitty v0.40+, Ghostty)        | Yes     | No  |
| 99  | Kitty notifications                                 | Yes     | No  |
| 133 | Semantic prompt markers (shell integration)         | Yes     | No  |

### Keyboard & Input

| Protocol           | What                                                          | Silvery | Ink                                          |
| ------------------ | ------------------------------------------------------------- | ------- | -------------------------------------------- |
| Kitty keyboard     | All 5 flags (disambiguate, events, alternate, all keys, text) | Full    | Added on master (post-v6.8.0, as of 2026-03) |
| Modifier detection | Shift, Alt, Ctrl, Super/Cmd, Hyper, CapsLock, NumLock         | Full    | Basic                                        |
| Key event types    | Press, repeat, release                                        | Full    | Press only                                   |
| Bracketed paste    | `usePaste` hook with auto-enable                              | Full    | `usePaste` hook (post-v6.8.0, as of 2026-03) |
| Focus reporting    | Focus in/out events                                           | Full    | None                                         |

### Graphics

| Protocol       | What                                                         | Silvery | Ink  |
| -------------- | ------------------------------------------------------------ | ------- | ---- |
| Kitty graphics | PNG transmission with chunking, ID-based management          | Full    | None |
| Sixel          | RGBA-to-Sixel encoder with color quantization                | Full    | None |
| Auto-detect    | Try Kitty, fall back to Sixel, fall back to text placeholder | Yes     | N/A  |

### Terminal Queries

| Query       | What                       | Silvery | Ink |
| ----------- | -------------------------- | ------- | --- |
| CPR (DSR 6) | Cursor position            | Yes     | No  |
| CSI 14t     | Pixel dimensions           | Yes     | No  |
| CSI 18t     | Text area size (rows/cols) | Yes     | No  |
| DA1/DA2/DA3 | Device attributes          | Yes     | No  |
| XTVERSION   | Terminal identification    | Yes     | No  |

Silvery uses these queries at startup for capability detection — automatically enabling Kitty keyboard, SGR mouse, synchronized output, and other features based on what the terminal supports.

## When to Choose What

Both are good tools. The right choice depends on what you're building.

### Choose Ink when:

- **Simpler CLIs and prompts**: One-shot interactions, confirmation dialogs, progress indicators, setup wizards -- Ink handles these well with minimal setup
- **Ecosystem matters**: Ink has ~1.3M weekly downloads, 50+ community components, and widespread adoption. If you need `ink-select-input`, `ink-table`, or other community packages, Ink's ecosystem is larger
- **Battle-tested stability**: Ink has been in production across thousands of CLIs since 2017. It's a known quantity with well-understood behavior
- **Team familiarity**: If your team already knows Ink, the context switch cost may not be worth it for a simple app
- **You don't need layout-aware rendering**: If your components don't need to adapt to their available space, Ink's simpler pipeline is a fine fit

### Choose Silvery when:

- **Complex interactive TUIs**: Kanban boards, text editors, multi-pane dashboards -- apps where components need to know their dimensions during render
- **Scrollable containers**: `overflow="scroll"` with native measurement, rather than manual virtualization
- **Mouse support and spatial focus**: Click-to-focus, arrow-key navigation between components, drag support
- **Command system**: Named commands with keybindings, help text, and runtime introspection
- **Interactive update performance**: Per-node dirty tracking for sub-millisecond updates in large trees
- **Built-in component library**: 45+ components without assembling third-party packages
- **Multi-target rendering**: Terminal today, Canvas 2D and DOM in the future

## Real-World Scenarios

### Dashboard with Resizable Panes

Components need to know their dimensions to render content appropriately (charts, tables, wrapped text).

- **Ink**: Use `useBoxMetrics` (post-layout, starts at 0x0). Re-render entire tree on resize.
- **Silvery**: Each pane reads `useBoxRect()` and adapts immediately. Resize triggers layout-only pass (21 us for 1000 nodes).

### Scrollable Task List

A list of 500+ items where the user navigates with j/k.

- **Ink**: Requires manual virtualization with height estimation. `overflow` only supports `visible`/`hidden`.
- **Silvery**: `overflow="scroll"` handles everything. VirtualList component optimizes large lists.

### Kanban Board

3+ columns of cards, each column independently scrollable, cards showing truncated content.

- **Ink**: Manual scroll per column, manual truncation, width-threading through props.
- **Silvery**: Columns and cards auto-size. Each column scrolls independently. Text auto-truncates.

### Search with Live Filtering

Type-ahead search with debounced results rendering.

- **Ink**: `useInput` for text capture, manual list rendering. No input isolation between search box and results.
- **Silvery**: `InputLayerProvider` for text input isolation, `useBoxRect` for result count fitting, `useDeferredValue` for responsive filtering.

### Simple CLI Prompt

One-shot question, answer, exit.

- **Ink**: Excellent -- large ecosystem of prompt components (ink-select-input, ink-text-input, ink-spinner).
- **Silvery**: Built-in TextInput, SelectList, Spinner components. Works, but the community ecosystem is smaller.

## Compatibility Coverage

Tested scenarios derived from common Ink issues:

| Scenario                                            | Silvery Test                                           | Ink Issue                                               |
| --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| CJK character rendering (Chinese, Japanese, Korean) | `ime.test.tsx`                                         | [#759](https://github.com/vadimdemedes/ink/issues/759)  |
| Double-width character alignment                    | `ime.test.tsx`, `wide-char-truncate.test.ts`           | [#759](https://github.com/vadimdemedes/ink/issues/759)  |
| Emoji ZWJ sequences                                 | `ime.test.tsx`                                         | --                                                      |
| ANSI-aware text truncation                          | `text-truncate-width.test.ts`                          | [#584](https://github.com/vadimdemedes/ink/issues/584)  |
| Rapid keystrokes (burst input)                      | `input.test.tsx`                                       | [PR #782](https://github.com/vadimdemedes/ink/pull/782) |
| borderDimColor                                      | `border-dim-color.test.tsx`                            | [#840](https://github.com/vadimdemedes/ink/issues/840)  |
| Large component counts (1000+)                      | `performance.test.tsx`, `memory.test.tsx`              | [#694](https://github.com/vadimdemedes/ink/issues/694)  |
| Home/End key support                                | `keys.test.ts`                                         | [PR #829](https://github.com/vadimdemedes/ink/pull/829) |
| Process exit timing                                 | `exit.test.tsx`                                        | [#796](https://github.com/vadimdemedes/ink/issues/796)  |
| tmux rendering                                      | `terminal-multiplexers.test.ts`, `sync-update.test.ts` | [PR #846](https://github.com/vadimdemedes/ink/pull/846) |
| Zellij rendering                                    | `terminal-multiplexers.test.ts`                        | [PR #846](https://github.com/vadimdemedes/ink/pull/846) |

