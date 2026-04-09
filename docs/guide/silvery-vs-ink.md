# Silvery vs Ink

_External project claims last verified: 2026-04. Ink version: 7.0.0._

## Why This Page Exists

Ink is excellent for simpler, text-first terminal apps and has years of maturity and a large ecosystem. Silvery exists because we needed different primitives for large interactive layouts — specifically, components that know their own dimensions during render, and a rendering pipeline that commits frames atomically.

In Ink, React renders first, then Yoga calculates layout. Components that need to adapt to their available space (truncate text, choose compact vs full layout, fit columns to width) must use post-render effects or prop drilling. This is a known limitation ([Ink #5](https://github.com/vadimdemedes/ink/issues/5), open since 2016). It works fine for many apps, but it becomes a constraint when building complex interactive UIs like kanban boards, text editors, or multi-pane dashboards.

Addressing it required a different rendering pipeline — layout first, then render, with atomic commit — which meant building a new renderer. On top of that core, optional framework layers provide input management, commands, mouse support, 45+ components, theming, and TEA state machines.

## The atomicity story

The deepest architectural difference between Silvery and Ink is **frame atomicity**: in Silvery, a frame is either fully committed to the terminal or not at all. There are no intermediate states a user can observe. In Ink, intermediate states are constantly observable, which is why Ink apps exhibit flicker, component dropout during scroll, and half-updated frames.

Silvery's pipeline is atomic in three dimensions simultaneously:

1. **Atomic in time.** `layout → render → diff → output` runs as a single synchronous transaction per frame. React's concurrent mode cannot interrupt mid-commit. When a frame starts committing, it finishes committing before any other work runs.

2. **Atomic in space.** [Flexily](https://beorn.codes/flexily) computes the full layout tree before React renders anything, so `useBoxRect()` returns the same layout values for every component in the tree, sampled at the same moment. No part of the tree is ever at a different layout state than another part. Children always see consistent parent dimensions because the layout was computed once, up front, for the whole tree.

3. **Atomic in content.** Every frame emission is wrapped in DEC mode 2026 (synchronized output bracketing). The terminal either sees the full new frame or the full old frame — never a half-drawn mixture. Cell-level diffing + relative cursor addressing means the emission is small enough to fit inside a single sync barrier without tearing.

The consequence: **no symptom class that stems from non-atomic rendering can occur in Silvery.** Not flicker during streaming. Not component dropout on scroll. Not stuttering in alt-screen. Not half-updated trees. Not tearing. These are not bugs Silvery needs to fix — they are bugs Silvery's architecture makes impossible to experience.

This matters most for streaming apps (AI agents, log viewers, test runners, build tools) and long-running interactive apps where users scroll while content is updating. See the [blog post on Claude Code's rendering dilemma](/blog/claude-code-rendering-dilemma) for the full architectural walkthrough.

## The Two Projects

[Ink](https://github.com/vadimdemedes/ink) (2017) brought React to the terminal. ~1.3M npm weekly downloads, 50+ community components, used by Gatsby, Prisma, Terraform CDK, Shopify CLI, Claude Code, and many more. Mature, stable, actively maintained, and battle-tested across thousands of production CLIs. Ink is a focused, reliable React renderer.

[Silvery](https://github.com/beorn/silvery) (2025) is a ground-up reimplementation with a different rendering architecture. At its core, it's a renderer — `Box`, `Text`, `useInput`, `render()` work the same as Ink. It ships 45+ components, state machines (`@silvery/create`), and theming — all available from a single `import from "silvery"`. Silvery is newer and has a smaller community.

> Silvery also compares favorably to terminal UI frameworks beyond Ink (BubbleTea, Textual, Notcurses, FTXUI, blessed) — the renderer architecture, React ecosystem access, and TypeScript-first design are unique advantages.

See the [migration guide](/getting-started/migrate-from-ink) for switching from Ink.

> Performance numbers in this document are from the **Ink comparison benchmark suite**. Reproduce with `bun run bench` for raw benchmark tables.

## Compatibility at a Glance

Silvery passes **918+ of Ink 7.0's 931 tests** (~98.6%) when tested with the Flexily layout engine. Chalk compatibility is **32/32 (100%)**. These numbers come from cloning the real Ink and Chalk repos and running their original test suites against silvery's compat layer (`bun run compat`).

The remaining failures break down as:

| Category                           | Failures | Why                                                                                         |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| Flexily W3C spec divergence        | 4        | [flex-wrap (2), aspect ratio (2)](#flexily-vs-yoga-philosophy) — Flexily follows W3C spec, Yoga has non-spec behaviors silvery intentionally doesn't match |
| Build artifact checks              | 2        | Ink expects `./build/` dir — silvery publishes TypeScript source plus pre-built `dist/`     |
| Minor rendering edge cases         | ~6       | dim+bold SGR order (2), measure-element timing (1), render-to-string timing (1), misc       |

**What recently shipped to compat (2026-04-09 parallel agent sweep):**
- `BackgroundContext` shim — Ink 7.0's context-based bg inheritance (+27 tests)
- `maxFps` render throttling option (+3 tests)
- Kitty protocol negotiation bytes matching Ink's behavior (+3 tests)
- Debug-mode cursor API shim (+3 tests)
- `wrap="hard"` text wrapping (+1 test)
- CJK wide-char overlay clearing (+2 tests)
- Flexily overflow clipping at container edges (+3 tests)
- Per-side `borderBackgroundColor` props (+5 tests)

All new Ink 7.0 hooks (useAnimation, useBoxMetrics, useCursor, usePaste, useWindowSize, useIsScreenReaderEnabled) have full shims or direct re-exports.

If you need exact Yoga layout parity, Silvery supports Yoga as a pluggable layout engine.

The compat layer is built as thin adapters (~50 lines each) that bridge Ink's APIs to silvery-native systems. `withInk()` composes `withInkCursor()` + `withInkFocus()` — you can use them individually or drop them as you adopt silvery-native APIs. See [compatibility reference](/reference/compatibility) for the full API mapping and [compat layer architecture](/reference/compatibility#compat-layer-architecture) for how the bridge works.

## Shared Foundation

Silvery and Ink share the same core ideas -- the migration path is intentionally short:

- **React 19 component model** -- JSX, hooks (`useState`, `useEffect`, `useMemo`, etc.), reconciliation, keys
- **Box + Text primitives** -- Flexbox layout via `<Box>` with direction/padding/margin/border, styled text via `<Text>`
- **Flexbox layout** -- Both use CSS-like flexbox (Silvery via Flexily or Yoga, Ink via Yoga WASM)
- **`useInput` hook** -- Same callback signature `(input, key) => void` for keyboard handling
- **`useApp` / exit pattern** -- `useApp()` to access app-level methods including `exit()`
- **`Static` component** -- Render content above the interactive area (log lines, completed items)
- **`Spacer` / `Newline` / `Transform`** -- Same utility components
- **Border styles** -- `single`, `double`, `round`, `bold`, `classic`, etc.
- **`measureElement`** -- Both offer ways to measure rendered elements
- **Layout metrics** -- Both provide hooks for element dimensions (`useBoxRect` / `useBoxMetrics`)
- **Kitty keyboard protocol** -- Both support extended modifiers and key event types
- **`renderToString`** -- Both support synchronous string rendering without terminal setup
- **Cursor positioning** -- Both provide `useCursor()` for IME support
- **Animation** -- Both provide `useAnimation()` for frame-based animations (Ink 7.0+)
- **Paste events** -- Both provide `usePaste()` with bracketed paste mode (Ink 7.0+)
- **Window size** -- Both provide `useWindowSize()` for reactive terminal dimensions (Ink 7.0+)
- **Screen reader support** -- Ink has ARIA roles/states; Silvery has basic support
- **Node.js streams** -- Both render to stdout, read from stdin

If your app uses `Box`, `Text`, `useInput`, and basic hooks, it works in both with minimal changes.

## Where They Differ

Both are React renderers at the core. The rendering architecture is the primary differentiator. Silvery's optional packages then add framework-level features on top. The differences fall into three categories:

### Rendering Architecture

| Feature                   | Silvery                                                                                                | Ink                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Responsive layout**     | `useBoxRect()` / `useScrollRect()` -- synchronous, available during render                             | `useBoxMetrics()` -- post-layout via `useEffect`, returns 0x0 until first measure (released in v7.0.0)                                     |
| **Incremental rendering** | Per-node dirty tracking with 7 independent flags; cell-level buffer diff                               | Line-based diff (opt-in `incrementalRendering` option in v7.0.0); unchanged lines skipped, but any change rewrites entire line             |
| **ANSI compositing**      | Cell-level buffer with proper style stacking; ANSI sequences composed, not passed through              | String concatenation; ANSI sequences emitted inline, no compositing layer                                                                  |
| **Scrollable containers** | `overflow="scroll"` with `scrollTo` -- framework handles measurement and clipping                      | `overflow` supports `visible` and `hidden` only; scrolling requires manual virtualization                                                  |
| **Dynamic scrollback**    | `useScrollback` -- items graduate from interactive area to terminal history (like Claude Code needs)   | None -- all items must stay in the render tree                                                                                             |
| **Text truncation**       | Automatic, ANSI-aware; text clips at Box boundaries                                                    | Manual per-component ([#584](https://github.com/vadimdemedes/ink/issues/584))                                                              |
| **CSS/W3C alignment**     | Flexbox defaults match W3C spec (`flexDirection: row`); `outlineStyle` (CSS outline, no layout impact) | Non-standard defaults (`flexDirection: column`); no outline                                                                                |
| **Layout engines**        | [Flexily](https://beorn.codes/flexily) (19 KB gzip, pure JS) or Yoga WASM — pluggable                  | Yoga WASM only (`yoga-layout` v3)                                                                                                          |
| **Render targets**        | Terminal, Canvas 2D, DOM (experimental)                                                                | Terminal only                                                                                                                              |
| **Native dependencies**   | None -- pure TypeScript                                                                                | Yoga WASM binary blob (no native compilation, but not pure JS)                                                                             |
| **Memory profile**        | Constant -- Flexily uses normal JS GC                                                                  | Yoga WASM uses a linear memory heap that can grow over long sessions ([discussion](https://github.com/anthropics/claude-code/issues/4953)) |
| **Layout caching**        | Flexily fingerprints + caches unchanged subtrees                                                       | Full tree recomputation on every layout pass                                                                                               |
| **Synchronized output**   | DEC synchronized output (mode 2026) for flicker-free rendering in tmux/Zellij                          | None                                                                                                                                       |
| **Bracketed paste**       | `usePaste` hook with automatic mode toggling                                                           | `usePaste` hook (released in v7.0.0)                                                                                                       |
| **Initialization**        | Synchronous -- pure TypeScript import                                                                  | Async WASM loading                                                                                                                         |

### Interaction Model

| Feature               | Silvery                                                                                          | Ink                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **Input handling**    | `InputLayerProvider` stack with DOM-style bubbling, modal isolation, `stopPropagation`           | `useInput` only -- flat, all handlers receive all input, no isolation                 |
| **Focus system**      | Tree-based: scopes, spatial navigation (arrow keys), click-to-focus, `useFocusWithin`            | Tab-based: `useFocus` with autoFocus, programmatic focus by ID, no spatial navigation |
| **Command system**    | `withCommands` -- named commands with ID, help text, keybindings, runtime introspection          | None                                                                                  |
| **Keybinding system** | `withKeybindings` -- configurable, context-aware resolution, macOS symbols (`parseHotkey("⌘K")`) | None                                                                                  |
| **Mouse support**     | SGR protocol, DOM-style event props (`onClick`, `onMouseDown`, `onWheel`), hit testing, drag     | None                                                                                  |
| **TextInput**         | Built-in with readline, cursor movement, selection                                               | None (third-party `ink-text-input`)                                                   |
| **TextArea**          | Multi-line editing with word wrap, scroll, undo/redo via `EditContext`                           | None ([#676](https://github.com/vadimdemedes/ink/issues/676))                         |
| **Image rendering**   | `<Image>` -- Kitty graphics + Sixel with auto-detect and text fallback                           | None                                                                                  |
| **Clipboard**         | OSC 52 `copyToClipboard`/`requestClipboard` -- works across SSH                                  | None                                                                                  |
| **Hyperlinks**        | `<Link>` -- OSC 8 clickable URLs                                                                 | OSC 8 hyperlinks (fixed in v6.8.0)                                                    |
| **Scrollback mode**   | `useScrollback` -- completed items freeze into terminal history                                  | None -- must keep all items in render tree                                            |

### Developer Experience

| Feature                 | Silvery                                                                                                                                                   | Ink                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Component library**   | 30+ built-in (VirtualList, TextArea, SelectList, Table, CommandPalette, ModalDialog, Tabs, TreeView, Toast, Spinner, ProgressBar, Image, SplitView, etc.) | 5 built-in (Box, Text, Static, Newline, Spacer) + 50+ third-party                 |
| **TEA state machines**  | Built-in `@silvery/create`: pure `(action, state) -> [state, effects]` reducers with replay, undo, and serializable actions                               | None -- React hooks only (Zustand/Redux usable via React, but no TEA integration) |
| **Plugin composition**  | `withCommands` / `withKeybindings` / `withDiagnostics` / `withRender`                                                                                     | None                                                                              |
| **Testing**             | Built-in `@silvery/test`: `createRenderer` + Playwright-style auto-locators, buffer assertions, visual snapshots                                          | `ink-testing-library` (third-party)                                               |
| **Render invariants**   | `withDiagnostics` -- verifies incremental render matches fresh render                                                                                     | None                                                                              |
| **Screenshots**         | `bufferToHTML()` + Playwright -- programmatic visual capture                                                                                              | None                                                                              |
| **Theme system**        | `@silvery/theme` with 38 built-in palettes, semantic color tokens, auto-detection                                                                         | None (manual chalk styling)                                                       |
| **Unicode utilities**   | Built-in: 28+ functions for grapheme splitting, display width, CJK detection, ANSI-aware truncation                                                       | Third-party: `string-width`, `cli-truncate`, `wrap-ansi`, `slice-ansi`            |
| **Console capture**     | Built-in `<Console />` component (composable, embeddable)                                                                                                 | `patchConsole()` (intercept-only)                                                 |
| **Resource cleanup**    | `using` / Disposable -- automatic teardown                                                                                                                | Manual `unmount()`                                                                |
| **Stream helpers**      | AsyncIterable: merge, map, filter, throttle, debounce                                                                                                     | None                                                                              |
| **Animation**           | `useAnimation`, easing functions, `useAnimatedTransition`                                                                                                 | `useAnimation` with frame/time/delta (v7.0.0) -- no easing or transitions         |
| **Non-TTY detection**   | `isTTY()`, `resolveNonTTYMode()`, `renderString()` fallback                                                                                               | Terminal size detection for piped processes (v6.7.0)                              |
| **Terminal inspection** | `SILVERY_DEV=1` inspector with tree visualization, dirty flags, focus path                                                                                | React DevTools integration                                                        |
| **Community**           | New                                                                                                                                                       | Mature ecosystem, ~1.3M npm weekly downloads                                      |

## Performance

_Post STRICT env bug fix, 2026-04-09. Reproduce: `bun run bench`_

Silvery wins **all 16 benchmark scenarios** vs Ink 7.0 on mounted workloads — the fair and realistic comparison. Both frameworks keep a mounted app and call `rerender()`, measuring what users actually experience during interaction.

### Canonical — mounted app, what users experience

| Scenario                            | Silvery advantage |
| ----------------------------------- | ----------------- |
| Mounted cursor move 100-item        | **2.56×**         |
| Mounted kanban single text change   | **3.36×**         |
| Memo'd 100-item single toggle       | **4.59×**         |
| Memo'd 500-item single toggle       | **5.15×**         |
| Memo'd kanban 5×20 single card edit | **3.75×**         |

Lead with these. They measure the hot path (user interaction → selective rerender).

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

### Incremental rendering — the output-phase story

Silvery emits **28–192× less output** than a full redraw on incremental updates. This isn't a CPU benchmark — it's a raw bytes-to-terminal measurement. The cell-level buffer diff identifies exactly the cells that changed, and relative cursor addressing (`CSI NA/NB/CR/NC`) emits only those cells. Tmux, SSH, screen recorders, and tiling window managers all thank you.

### Bundle size

| Package                                | Minified + Gzipped | vs Ink+Yoga |
| -------------------------------------- | ------------------ | ----------- |
| Ink 7.0 + Yoga WASM (baseline)         | 116.6 KB           | 1.00×       |
| `silvery/runtime` (core + flexily)     | **114.9 KB**       | **0.99× (tied)** |
| `silvery/ink` (Ink compat layer)       | 119.2 KB           | 1.02×       |

Bundle parity with Ink+Yoga, zero WASM, zero native dependencies, instant startup (no async WASM init).

### Benchmark methodology

- **Hardware**: Apple M5 Max, 128 GB RAM
- **Runtime**: Bun 1.3.9+
- **Tooling**: [mitata](https://github.com/evanwashere/mitata) for statistical benchmarking with warmup + automatic iteration count
- **STRICT mode**: Disabled for benchmark runs (`SILVERY_STRICT=0`). A prior env-parsing bug treated `"0"` as truthy; that was fixed 2026-04-09 and all numbers here are post-fix.
- **Fair comparison**: Mounted scenarios keep both frameworks' React trees mounted and call `rerender()` — the realistic path for interactive apps
- **Reproduce**: Clone the repo and `bun run bench`

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

## Real-World Context

These differences surface in practice. Some examples from production Ink-based CLIs:

- **Memory**: Long-running Ink apps can encounter memory growth from Yoga's WASM linear memory, which cannot shrink once allocated (e.g., [Claude Code discussion](https://github.com/anthropics/claude-code/issues/4953)). Silvery's pure JavaScript layout engine uses normal garbage collection, avoiding this particular class of issue.
- **Flicker**: Earlier Ink versions [cleared the entire terminal area](https://github.com/vadimdemedes/ink/issues/359) on each render. Ink v6.5.0+ added line-based incremental rendering and v6.7.0 added synchronized updates, significantly improving this. Silvery's cell-level dirty tracking and buffer diff take a different approach to the same problem.
- **Interactive features**: Apps that grow beyond simple CLI prompts often need mouse support, scrollable containers, and complex focus management. In Ink, these require additional libraries or manual implementation. Silvery includes them as built-in framework layers.

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

## Appendix: Detailed Benchmarks

_Apple M1 Max, Bun 1.3.9, Feb 2026. Reproduce: `bun run bench:compare`_

### Full Pipeline (React Reconciliation + Layout + Output)

| Components             | Silvery (Flexily) | Ink 6 (Yoga WASM) | Faster       |
| ---------------------- | ----------------- | ----------------- | ------------ |
| 1 Box+Text (80x24)     | 165 us            | 271 us            | Silvery 1.6x |
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
| 1     | 311 us       | 38 us        | 8x     |
| 100   | 23 ms        | 46 us        | 500x   |
| 1000  | 236 ms       | 169 us       | 1396x  |

This is the typical update path for interactive TUIs (cursor movement, scroll, single-node edits).

### Buffer Diff

| Scenario            | Time   |
| ------------------- | ------ |
| 80x24, no changes   | 28 us  |
| 80x24, 10% changed  | 34 us  |
| 80x24, full repaint | 59 us  |
| 200x50, no changes  | 146 us |

Packed Uint32Array cell comparison with cursor-movement optimization.

### Layout Engine (Pure Layout, No React)

| Benchmark      | Flexily (JS) | Yoga WASM |
| -------------- | ------------ | --------- |
| 100 nodes flat | 85 us        | 88 us     |
| 50-node kanban | 57 us        | 54 us     |

### Resize (Layout Only)

| Nodes | Time   |
| ----- | ------ |
| 10    | 250 ns |
| 100   | 2 us   |
| 1000  | 21 us  |

### Bundle Size

| Package           | Size (gzip) |
| ----------------- | ----------- |
| Silvery + Flexily | ~45 KB      |
| Silvery + Yoga    | ~76 KB      |
| Ink               | ~52 KB      |
