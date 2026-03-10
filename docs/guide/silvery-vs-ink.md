# Silvery vs Ink

## Why Silvery Exists

Silvery started from a single frustration: **React terminal components can't know their own size during render.** In Ink, React renders first, then Yoga calculates layout — so components that need to adapt (truncate text, choose compact vs full layout, fit columns) must use post-render effects or prop drilling. This limitation ([Ink #5](https://github.com/vadimdemedes/ink/issues/5), open since 2016) cascades: no native scrolling, no automatic text truncation, no responsive layouts without workarounds.

Fixing it required a different rendering pipeline — layout first, then render — which meant building from scratch. Once the core was working, the project grew into a full terminal app framework: input layering, commands, mouse support, 30+ components, theming, and TEA state machines.

## The Two Projects

[Ink](https://github.com/vadimdemedes/ink) (2017) brought React to the terminal. ~1.3M npm weekly downloads, 50+ community components, used by Gatsby, Prisma, Terraform CDK, Shopify CLI, Claude Code, and many more. Mature, stable, actively maintained. Ink is a focused React renderer.

[Silvery](https://github.com/beorn/silvery) (2025) is a ground-up reimplementation with a different rendering architecture. At its core, it's a renderer — `Box`, `Text`, `useInput`, `render()` work the same as Ink. But it also ships optional framework layers (`@silvery/ui`, `@silvery/tea`, `@silvery/theme`) for teams that want a complete toolkit. Use as little or as much as you need.

> For how Silvery compares to terminal UI frameworks beyond Ink (BubbleTea, Textual, Notcurses, FTXUI, blessed), see [comparison.md](comparison.md).

See [migration guide](migration.md) for switching from Ink.

> Performance numbers in this document are from the **Ink comparison benchmark suite**. Reproduce with `bun run bench` for raw benchmark tables.

---

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
- **Layout metrics** -- Both provide hooks for element dimensions (`useContentRect` / `useBoxMetrics`)
- **Kitty keyboard protocol** -- Both support extended modifiers and key event types
- **`renderToString`** -- Both support synchronous string rendering without terminal setup
- **Cursor positioning** -- Both provide `useCursor()` for IME support
- **Screen reader support** -- Ink has ARIA roles/states; Silvery has basic support
- **Node.js streams** -- Both render to stdout, read from stdin

If your app uses `Box`, `Text`, `useInput`, and basic hooks, it works in both with minimal changes.

---

## Where They Differ

Both are React renderers at the core. Silvery's optional packages add framework-level features. The differences fall into three categories: rendering architecture, interaction model, and developer tooling.

### Rendering Architecture

| Feature                     | Silvery                                                                              | Ink                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Responsive layout**       | `useContentRect()` / `useScreenRect()` -- synchronous, available during render       | `useBoxMetrics()` -- post-layout via `useEffect`, returns 0x0 until first measure                                                          |
| **Incremental rendering**   | Per-node dirty tracking with 7 independent flags; cell-level buffer diff             | Line-based diff (opt-in since v6.5.0); unchanged lines skipped, but any change rewrites entire line                                        |
| **ANSI compositing**        | Cell-level buffer with proper style stacking; ANSI sequences composed, not passed through | String concatenation; ANSI sequences emitted inline, no compositing layer                                                                 |
| **Scrollable containers**   | `overflow="scroll"` with `scrollTo` -- framework handles measurement and clipping    | `overflow` supports `visible` and `hidden` only; scrolling requires manual virtualization                                                  |
| **Dynamic scrollback**      | `useScrollback` -- items graduate from interactive area to terminal history (like Claude Code needs) | None -- all items must stay in the render tree                                                                                 |
| **Text truncation**         | Automatic, ANSI-aware; text clips at Box boundaries                                  | Manual per-component ([#584](https://github.com/vadimdemedes/ink/issues/584))                                                              |
| **CSS/W3C alignment**       | Flexbox defaults match W3C spec (`flexDirection: row`); `outlineStyle` (CSS outline, no layout impact) | Non-standard defaults (`flexDirection: column`); no outline                                                                   |
| **Layout engines**          | [Flexily](https://beorn.github.io/flexily) (7 KB, pure JS) or Yoga WASM -- pluggable | Yoga WASM only (`yoga-layout` v3)                                                                                                          |
| **Render targets**          | Terminal, Canvas 2D, DOM (experimental)                                              | Terminal only                                                                                                                              |
| **Native dependencies**     | None -- pure TypeScript                                                              | Yoga WASM binary blob (no native compilation, but not pure JS)                                                                             |
| **Memory profile**          | Constant -- Flexily uses normal JS GC                                                | Yoga WASM uses a linear memory heap that can grow over long sessions ([discussion](https://github.com/anthropics/claude-code/issues/4953)) |
| **Layout caching**          | Flexily fingerprints + caches unchanged subtrees                                     | Full tree recomputation on every layout pass                                                                                               |
| **Synchronized output**     | DEC synchronized output (mode 2026) for flicker-free rendering in tmux/Zellij        | None                                                                                                                                       |
| **Bracketed paste**         | `usePaste` hook with automatic mode toggling                                         | None                                                                                                                                       |
| **Initialization**          | Synchronous -- pure TypeScript import                                                | Async WASM loading                                                                                                                         |

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

| Feature                 | Silvery                                                                                                                                                   | Ink                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Component library**   | 30+ built-in (VirtualList, TextArea, SelectList, Table, CommandPalette, ModalDialog, Tabs, TreeView, Toast, Spinner, ProgressBar, Image, SplitView, etc.) | 5 built-in (Box, Text, Static, Newline, Spacer) + 50+ third-party      |
| **TEA state machines**  | Built-in `@silvery/tea`: pure `(action, state) -> [state, effects]` reducers with replay, undo, and serializable actions | None -- React hooks only (Zustand/Redux usable via React, but no TEA integration) |
| **Plugin composition**  | `withCommands` / `withKeybindings` / `withDiagnostics` / `withRender`                                                                                     | None                                                                   |
| **Testing**             | Built-in `@silvery/test`: `createRenderer` + Playwright-style auto-locators, buffer assertions, visual snapshots | `ink-testing-library` (third-party)                                    |
| **Render invariants**   | `withDiagnostics` -- verifies incremental render matches fresh render                                                                                     | None                                                                   |
| **Screenshots**         | `bufferToHTML()` + Playwright -- programmatic visual capture                                                                                              | None                                                                   |
| **Theme system**        | `@silvery/theme` with 38 built-in palettes, semantic color tokens, auto-detection                                                                         | None (manual chalk styling)                                            |
| **Unicode utilities**   | Built-in: 28+ functions for grapheme splitting, display width, CJK detection, ANSI-aware truncation                                                       | Third-party: `string-width`, `cli-truncate`, `wrap-ansi`, `slice-ansi` |
| **Console capture**     | Built-in `<Console />` component (composable, embeddable)                                                                                                 | `patchConsole()` (intercept-only)                                      |
| **Resource cleanup**    | `using` / Disposable -- automatic teardown                                                                                                                | Manual `unmount()`                                                     |
| **Stream helpers**      | AsyncIterable: merge, map, filter, throttle, debounce                                                                                                     | None                                                                   |
| **Animation**           | `useAnimation`, easing functions, `useAnimatedTransition`                                                                                                 | None (manual `setInterval`)                                            |
| **Non-TTY detection**   | `isTTY()`, `resolveNonTTYMode()`, `renderString()` fallback                                                                                               | Terminal size detection for piped processes (v6.7.0)                   |
| **Terminal inspection** | `SILVERY_DEV=1` inspector with tree visualization, dirty flags, focus path                                                                                | React DevTools integration                                             |
| **Community**           | New                                                                                                                                                       | Mature ecosystem, ~1.3M npm weekly downloads                           |

---

## Performance

_Apple M1 Max, Bun 1.3.9, Feb 2026. Reproduce: `bun run bench:compare`_

_Benchmarks measure a specific scenario for each row. "Typical interactive update" = single setState in a mounted 1000-node tree (e.g., moving a cursor). Silvery updates only the dirty subtree; Ink reconciles all nodes._

| Scenario                              | Silvery         | Ink               |                          |
| ------------------------------------- | --------------- | ----------------- | ------------------------ |
| Cold render (1 component)             | 165 us          | 271 us            | Silvery 1.6x faster      |
| Cold render (1000 components)         | 463 ms          | 541 ms            | Silvery 1.2x faster      |
| Full React rerender (1000 components) | 630 ms          | 20.7 ms           | Ink 30x faster           |
| **Typical interactive update**        | **169 us**      | **20.7 ms**       | **Silvery 100x+ faster** |
| Layout (50-node kanban)               | 57 us (Flexily) | 88 us (Yoga WASM) | Flexily 1.5x faster      |
| Terminal resize (1000 nodes)          | 21 us           | Full re-render    | --                       |
| Buffer diff (80x24, 10% changed)      | 34 us           | N/A (line-based)  | --                       |

**Understanding the rerender row:** When the _entire_ component tree re-renders from scratch (e.g., replacing the root element), Ink is 30x faster because its output is string concatenation. Silvery runs a 5-phase pipeline (measure, layout, content, output) after React reconciliation -- that is the cost of responsive layout. But this scenario rarely happens in real apps.

**The row that matters -- "typical interactive update":** When a user presses a key (cursor move, scroll, toggle), only the changed nodes need updating. Silvery has per-node dirty tracking that bypasses React entirely -- 169 us for 1000 nodes. Ink's incremental rendering (v6.5.0+) improves output by skipping unchanged _lines_, but it still re-renders the entire React tree and runs full Yoga layout on every state change -- 20.7 ms. Silvery's dirty tracking skips React reconciliation, layout, and content generation for unchanged nodes -- a fundamentally different approach.

---

## Key Differences Explained

### Responsive Layout

The core architectural difference. Ink renders components, then runs Yoga layout. `useBoxMetrics()` provides dimensions _after_ layout via `useEffect`, meaning the first render always sees `{width: 0, height: 0}`. Silvery runs layout first, then renders components with actual dimensions via `useContentRect()`.

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

// Silvery: useContentRect returns actual dimensions immediately
function Card() {
  const { width } = useContentRect()
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

Ink provides tab-order focus with `useFocus()` -- components are focused in render order via Tab key. Silvery provides tree-based focus with scopes, spatial navigation (arrow keys move focus directionally), click-to-focus, `useFocusWithin`, and programmatic control:

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

### Mouse Support

Silvery implements SGR mouse protocol (mode 1006) with DOM-style event handling:

```tsx
// Silvery: DOM-style mouse events
<Box onClick={(e) => selectItem(e.target)} onMouseDown={(e) => startDrag(e)} onWheel={(e) => scroll(e.deltaY)}>
  <Text>Click me</Text>
</Box>
```

Ink has no mouse support.

---

## Layout Engines

Silvery supports pluggable layout engines with the same flexbox API:

|                    | Flexily (default) | Yoga (WASM) |
| ------------------ | ----------------- | ----------- |
| Size (gzip)        | 7 KB              | 38 KB       |
| Language           | Pure JS           | C++ -> WASM |
| Initialization     | Synchronous       | Async       |
| 100-node layout    | 85 us             | 88 us       |
| 50-node kanban     | 57 us             | 54 us       |
| RTL direction      | Supported         | Supported   |
| Baseline alignment | Not supported     | Supported   |

Both are fast enough for 60fps terminal UIs. Flexily is 5x smaller with comparable performance. See the [Flexily docs](https://beorn.github.io/flexily) for details.

---

## When to Choose What

### Choose Ink when:

- You need a mature ecosystem with community components
- Your app is a simple CLI prompt (one-shot interaction)
- You want the safety of a battle-tested, widely-deployed renderer
- You do not need scrolling, mouse, or complex focus management

### Choose Silvery when:

- You are building a complex interactive TUI (kanban board, text editor, dashboard)
- You need scrollable containers, mouse support, or spatial focus navigation
- You want a command system with keybindings and introspection
- You need components to know their dimensions during render
- You want multi-target rendering (terminal + canvas + DOM)
- You care about interactive update performance (dirty tracking vs full re-render)
- You want a complete component library without assembling third-party packages

---

## Real-World Scenarios

### Dashboard with Resizable Panes

Components need to know their dimensions to render content appropriately (charts, tables, wrapped text).

- **Ink**: Use `useBoxMetrics` (post-layout, starts at 0x0). Re-render entire tree on resize.
- **Silvery**: Each pane reads `useContentRect()` and adapts immediately. Resize triggers layout-only pass (21 us for 1000 nodes).

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
- **Silvery**: `InputLayerProvider` for text input isolation, `useContentRect` for result count fitting, `useDeferredValue` for responsive filtering.

### Simple CLI Prompt

One-shot question, answer, exit.

- **Ink**: Excellent -- large ecosystem of prompt components (ink-select-input, ink-text-input, ink-spinner).
- **Silvery**: Built-in TextInput, SelectList, Spinner components. Works, but the community ecosystem is smaller.

---

## Real-World Impact

These are not theoretical differences. Production Ink-based CLIs have encountered several of these limitations:

- **Memory**: Large-scale Ink apps have encountered memory growth from Yoga's WASM linear memory, which cannot shrink once allocated (e.g., [Claude Code saw its process balloon over time](https://github.com/anthropics/claude-code/issues/4953)). Silvery avoids this class of problem by using a pure JavaScript layout engine with normal garbage collection.
- **Flicker**: Earlier Ink versions [cleared the entire terminal area](https://github.com/vadimdemedes/ink/issues/359) on each render, causing visible flicker, especially in tmux. Ink v6.5.0+ added line-based incremental rendering and v6.7.0 added synchronized updates to mitigate this. Silvery's cell-level dirty tracking and buffer diff provide more granular flicker prevention.
- **Missing capabilities**: Production CLIs have needed mouse support, customizable keybindings, scrollable containers, and complex focus management -- features that require additional libraries or manual implementation in Ink but are built into Silvery.

---

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

---

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
