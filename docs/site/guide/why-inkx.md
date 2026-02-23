# Why Inkx?

Inkx solves a fundamental architectural limitation in Ink that forces you to manually thread width props through your entire component tree.

## The Problem

In Ink, components render _before_ Yoga computes layout. By the time layout is computed, React has already finished rendering. Components can't know their dimensions:

```tsx
// Ink: Width props cascade everywhere
function Board({ width }: { width: number }) {
  const colWidth = Math.floor((width - 2) / 3)
  return (
    <Box flexDirection="row">
      <Column width={colWidth} items={todo} />
      <Column width={colWidth} items={doing} />
      <Column width={colWidth} items={done} />
    </Box>
  )
}

function Column({ width, items }: { width: number; items: Item[] }) {
  return (
    <Box width={width}>
      {items.map((item) => (
        <Card width={width - 2} item={item} />
      ))}
    </Box>
  )
}

function Card({ width, item }: { width: number; item: Item }) {
  return <Text>{truncate(item.title, width - 4)}</Text>
}
```

Real apps have **100+ lines** of this. Every layout change means updating arithmetic everywhere.

## The Solution

Inkx uses two-phase rendering:

1. **Phase 1**: React renders component structure (not content)
2. **Phase 2**: Yoga computes layout
3. **Phase 3**: React re-renders with dimensions available

Components can query their size via `useContentRect()`:

```tsx
// Inkx: No width props needed
function Board() {
  return (
    <Box flexDirection="row">
      <Column items={todo} />
      <Column items={doing} />
      <Column items={done} />
    </Box>
  )
}

function Column({ items }: { items: Item[] }) {
  return (
    <Box flexGrow={1}>
      {items.map((item) => (
        <Card item={item} />
      ))}
    </Box>
  )
}

function Card({ item }: { item: Item }) {
  const { width } = useContentRect() // Just ask!
  return <Text>{truncate(item.title, width - 4)}</Text>
}
```

## Why This Can't Be Fixed in Ink

This isn't a missing feature - it's architectural. Ink's render flow:

```
React render() → Build Yoga tree → Yoga computes layout → Write to terminal
                                         ↓
                              (dimensions computed here)
                                         ↓
                              (but never exposed to React)
```

Fixing this requires:

1. Render to collect constraints (not content)
2. Compute layout
3. Re-render with dimensions

This is a breaking API change. Ink's maintainer has shown no interest in major architecture changes - and that's understandable. Ink is stable, widely used, and works for its target use case.

## Inkx vs Ink Comparison

| Feature           | Ink                        | Inkx                       |
| ----------------- | -------------------------- | -------------------------- |
| Layout feedback   | ❌ Must thread width props | ✅ `useContentRect()` hook |
| Text truncation   | ❌ Overflows container     | ✅ Auto-truncates          |
| Scrolling         | ❌ Manual virtualization   | ✅ `overflow="scroll"`     |
| API compatibility | -                          | ✅ Drop-in replacement     |

## Runtime Stability

Beyond layout feedback, inkx + Flexx eliminates several classes of runtime issues that affect long-running TUI applications.

### No WASM Memory Growth

Yoga's WASM linear memory grows monotonically — every layout computation allocates from a linear memory region that cannot shrink. Over hours of interactive use, this accumulates into hundreds of megabytes. The only fix is resetting the entire WASM module, which drops all cached state.

Flexx is pure TypeScript. It allocates and frees normally via the JS garbage collector. Long-running sessions use constant memory regardless of how many layout passes have run.

### Layout Caching

Flexx fingerprints each node's constraints and caches layout results. When a single card changes in a 1000-node tree, only that card and its ancestors recompute layout. Static regions (status bars, headers, borders) have zero layout cost after first render.

Yoga recomputes the full tree on every layout pass. For applications with mostly-static chrome and a small interactive region, this wastes >95% of layout work.

### Incremental Rendering

Ink re-renders the entire React tree for any state change, then rewrites the full terminal screen. For streaming output (LLM responses, log tailing, progress updates), this means hundreds of full-screen repaints per second.

inkx tracks dirty flags per node. A cursor move in a 1000-node tree costs 169µs (vs 20.7ms for Ink — 122x faster). The buffer diff then emits only changed cells to the terminal, reducing I/O by 90%+ for typical interactive updates.

### Zero Initialization

Yoga WASM requires async loading — the module must be fetched, compiled, and instantiated before any layout can occur. Applications that want fast startup must defer this loading, adding complexity.

Flexx is synchronous TypeScript. `import` and go — no async initialization, no deferred loading, no WASM compilation step.

### No Native Dependencies

Yoga NAPI (used by Ink) is a C++ addon compiled per platform. Build failures on CI, incompatible Node versions, and missing build tools are common friction points. Yoga WASM avoids the build step but adds the memory growth problem.

inkx + Flexx requires zero native dependencies. It runs identically on any JS runtime (Node, Bun, Deno) without platform-specific binaries.

### Built-in Unicode

CJK characters, emoji, and other wide characters occupy two terminal columns but one string position. Without wcwidth-aware measurement, layouts misalign — borders don't connect, columns shift, text overflows.

inkx includes 28+ unicode utilities (grapheme splitting, display width, CJK detection, emoji handling) as built-in primitives, not third-party dependencies. Text truncation, column alignment, and border rendering all account for display width automatically.

## Beyond Ink's Feature Set

inkx isn't just a faster Ink — it provides capabilities Ink doesn't have at all.

### Input

- **Kitty keyboard protocol** — Cmd ⌘, Hyper ✦, key release events, international keyboard layouts. Ink uses legacy ANSI with ambiguous key sequences (Ctrl+I vs Tab, Ctrl+M vs Enter).
- **Mouse support (SGR protocol)** — DOM-style event bubbling with click, double-click, scroll, drag. `onClick`, `onWheel`, `onMouseEnter` props on Box and Text. Ink has basic `useInput` only.
- **Focus system** — tree-based focus management with scopes, spatial navigation, autoFocus, click-to-focus. Tab between regions, each with its own input handling. Ink has no focus management.
- **Command + keybinding system** — `withCommands` gives every action an ID, name, help text, and configurable key binding. `withKeybindings` resolves keypresses to commands. Searchable command palette for free. Ink has no equivalent.
- **Input layer stack** — modal input handling for dialogs, search, confirmation prompts. Proper capture semantics prevent key leaking between layers. Ink has a flat `useInput` with no isolation.
- **Hotkey parsing** — native macOS symbol notation: `parseHotkey("⌘K")`, `matchHotkey(key, "⌃⇧A")`. Supports all modifier aliases.

### Rendering Modes

- **Scrollback mode** — completed items freeze into terminal scrollback via `useScrollback`. The active UI shrinks as items complete. Users scroll up with native terminal features. Perfect for streaming output where history matters but doesn't need to be re-rendered.
- **Synchronized updates (DEC 2026)** — wraps all terminal output atomically, preventing flicker in tmux and Zellij. Automatically enabled, safely ignored by unsupported terminals.
- **Adaptive rendering** — `term.hasCursor()`, `term.hasColor()`, `term.hasInput()` for graceful degradation. Non-TTY output uses `renderString()` automatically instead of special-casing the UI.
- **Kitty graphics protocol** — inline image display in the terminal. Working implementation with PNG display, pan, zoom, and gallery navigation.

### Components

- **Link** — OSC 8 hyperlinks. Clickable URLs and file paths in supporting terminals.
- **Console** — cleanly captures and displays `console.log` output alongside the UI. When an app spawns subprocesses, their stdout doesn't corrupt the display.
- **TextArea** — multi-line text input with word wrap, readline shortcuts, cursor movement, and scroll within the input area.

### Architecture

- **React 19** — Ink is still on React 18. React 19 brings `use()`, improved Suspense, and Actions.
- **3 runtime layers** — Layer 1 (Elm-style reducer), Layer 2 (React hooks), Layer 3 (Zustand store). Choose the right level of abstraction for your app's complexity.
- **`using` / Disposable cleanup** — automatic resource teardown prevents leaked processes and handles.
- **withDiagnostics** — built-in rendering invariant checks (incremental vs fresh render verification). Catches rendering regressions in CI without manual visual inspection.
- **Multiple render targets** — Terminal (production), Canvas 2D (implemented), DOM (implemented). Same React components, different output.
- **Screenshots** — `bufferToHTML()` + Playwright rendering for programmatic screenshot capture without external tools.

## Who Should Use Inkx?

**Use Inkx if you're building:**

- Complex layouts (dashboards, kanban boards, multi-pane UIs)
- Apps with dynamic content widths
- Scrollable lists with variable-height items
- Long-running interactive sessions (hours+) where memory stability matters
- Applications with streaming output (LLM responses, log viewers, real-time data)
- Apps that need mouse support, focus management, or customizable keybindings
- Cross-platform tools that must avoid native compilation

**Stick with Ink if you're building:**

- Simple CLI output (progress bars, spinners)
- Apps where manual width calculation is acceptable
- Apps that need Ink's large ecosystem of plugins

## Related Work

Inkx builds on proven patterns from:

- **[Textual](https://textual.textualize.io/)** (Python) - Modern TUI with CSS-like styling
- **[Ratatui](https://ratatui.rs/)** (Rust) - Immediate-mode TUI with layout feedback
- **[Flutter](https://flutter.dev/)** - "Constraints down, sizes up" model

The two-phase rendering pattern is standard in every major UI framework - browsers, native apps, mobile. Inkx brings this to React terminal UIs.
