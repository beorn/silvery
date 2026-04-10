# Silvery vs Bubble Tea

_External project claims last verified: 2026-04. Bubble Tea version: 2.x._

[Bubble Tea](https://github.com/charmbracelet/bubbletea) (2020, [Charm](https://charm.sh)) is a Go framework for building terminal UIs using The Elm Architecture. Programs are defined by three functions: `Init`, `Update`, and `View`. The [Charm ecosystem](https://charm.sh) includes [Bubbles](https://github.com/charmbracelet/bubbles) (reusable components), [Lip Gloss](https://github.com/charmbracelet/lipgloss) (styling), [Huh](https://github.com/charmbracelet/huh) (form building), and [Wish](https://github.com/charmbracelet/wish) (SSH server for TUI apps). Widely adopted, well-documented, and actively maintained — stable v2.0.0 shipped February 24, 2026 (latest v2.0.2, March 2026) with cell-based rendering, SGR mouse, Kitty keyboard, and more. Bubble Tea is the standard TUI framework for Go.

Silvery is a ground-up React-based terminal UI framework for TypeScript. It combines React's component model with TEA-style state machines (via `@silvery/create`), CSS flexbox layout (via Flexily), and a rendering pipeline that gives components their dimensions during render. Newer, smaller community, but more built-in features.

Silvery grew out of building a complex terminal app where components needed to know their size during render, updates needed to be fast, and scroll containers, mouse events, focus scopes, and Playwright-style testing needed to just work. Three principles emerged: take the best from the web, stay true to the terminal, and raise the bar for developer ergonomics, architecture composability, and performance.

## Highlights

The biggest differences at a glance:

- **CSS flexbox layout** — components auto-size with flex-grow, wrapping, gap, and alignment. Bubble Tea has no layout engine; you join strings manually with Lip Gloss and thread widths/heights yourself.
- **Layout-first rendering** — components know their size _during_ render via `useBoxRect()`. Bubble Tea v2's `View()` returns a `tea.View` struct (not just a string), but there is no layout feedback — you must pass sizes down through model state.
- **React component model** — hooks, context, Suspense, third-party React libraries all work. Bubble Tea uses Go structs with manual message routing.
- **45+ built-in components** — VirtualList, Table, CommandPalette, TreeView, Toast, Tabs, SplitView, ModalDialog, Image, TextArea, and more. Bubbles provides ~12 components.
- **Incremental rendering** — cell-level dirty tracking skips unchanged nodes. Bubble Tea v2's cell-based renderer diffs at the cell level too, but re-runs `View()` for the full tree on every update.
- **DOM-style mouse events** — `onClick`, `onWheel`, `onMouseDown` with hit testing and drag support. Bubble Tea v2 has SGR mouse with typed messages (`MouseClickMsg`, `MouseReleaseMsg`, etc.), but events are routed through `Update` without DOM-style bubbling or hit testing.
- **38 palettes with semantic tokens** — `$primary`, `$muted`, `$border` with auto-detection. Lip Gloss provides chainable style functions with color downsampling.
- **Multi-backend test matrix** — [Termless](https://termless.dev) runs tests across 10+ real terminal parsers (xterm.js, vt100, Ghostty, Kitty, Alacritty, ...). `teatest` uses golden file comparison.
- **Dynamic scrollback** — items graduate to terminal history; inline/fullscreen hybrid modes. Bubble Tea v2 supports inline mode but has no scrollback graduation mechanism.
- **Fast incremental rendering** — cell-level dirty tracking means most of the tree is skipped on interactive updates. Performance is comparable to Ink 7.0 — see [benchmarks](/guide/silvery-vs-ink#performance-size) for details.

**Where Bubble Tea is stronger:**

- **Compiled Go** — single static binary, ~1 ms startup, no runtime dependency. Ideal for distributing CLI tools. Silvery requires Node.js or Bun (~50–150 ms startup).
- **TEA is native** — The Elm Architecture is Bubble Tea's core, not an optional layer. Every program is a pure `(Msg, Model) → (Model, Cmd)` function. In Silvery, TEA is available via `@silvery/create` but layered on top of React.
- **Community** — the Charm ecosystem (Bubble Tea, Bubbles, Lip Gloss, Huh, Wish, Log) is cohesive, well-documented, and widely adopted. Thousands of Go CLI tools use it. Silvery is newer with a smaller community.
- **No React overhead** — Bubble Tea has no reconciler, no virtual tree, no hooks lifecycle. The update loop is a simple Go function. For simple TUIs, this directness is an advantage.
- **Go ecosystem** — any Go library works alongside Bubble Tea. Strong concurrency primitives (goroutines, channels) are built into the language.

**What's the same:** Both use TEA (Model/Update/View pattern), both support Kitty keyboard protocol (Bubble Tea requests basic key disambiguation and event types by default; does not document all five progressive-enhancement flags), SGR mouse protocol, OSC 52 clipboard, bracketed paste, alternate screen, synchronized output (DEC 2026), and cell-based rendering. Both are pure implementations with no native dependencies in their respective languages.

## Feature Matrix

Bubble Tea first, Silvery second. Features marked "core" are built into the framework; "ecosystem" means available via official packages.

### Layout & Rendering

| Feature                      | Bubble Tea v2                                                                          | Silvery                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Layout engine**            | None — manual string joining via Lip Gloss (`JoinHorizontal`, `JoinVertical`, `Place`) | CSS flexbox (Flexily) — flex-grow, wrap, gap, padding, margin, alignment             |
| **Responsive layout**        | Manual: pass `SetWidth`/`SetHeight` to child models, recalculate on resize             | `useBoxRect()` — dimensions available _during_ render, first pass                    |
| **Rendering approach**       | Cell-based renderer (v2): `View()` returns `tea.View` struct, framework diffs cells    | Cell-level buffer with style stacking, 7 dirty flags/node, incremental skip          |
| **Incremental rendering**    | Re-runs full `View()` on every message, then cell-diffs the output                     | Per-node dirty tracking — unchanged subtrees skip render + diff entirely             |
| **Scrollable containers**    | Viewport bubble (manual sizing, scroll offset management)                              | `overflow="scroll"` + `scrollTo` — core framework, handles clipping                  |
| **Sticky headers**           | Not in core                                                                            | `position="sticky"` in scroll containers                                             |
| **Dynamic scrollback**       | Not in core — v2 supports inline mode, but no scrollback graduation mechanism          | Items graduate to terminal history; Cmd+F works on graduated content                 |
| **Inline/fullscreen hybrid** | v2 supports inline, full-window, or a mix; `View.AltScreen` is a per-view setting      | Inline mode with fullscreen-level performance; fullscreen with scrollback graduation |
| **Render targets**           | Terminal only                                                                          | Terminal, Canvas 2D, DOM (experimental)                                              |

### Interaction

| Feature                   | Bubble Tea v2                                                                                            | Silvery                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Mouse support**         | SGR mouse — typed `MouseClickMsg`, `MouseReleaseMsg`, `MouseMotionMsg`, `MouseWheelMsg` through `Update` | SGR mouse with DOM-style events: `onClick`, `onWheel`, `onMouseDown`, hit testing, drag |
| **Input handling**        | All messages go through single `Update` function                                                         | DOM-style bubbling, modal isolation, `stopPropagation`, input layers                    |
| **Focus system**          | Manual — manage focused component in model state                                                         | Tree-based: scopes, spatial nav (arrow keys), click-to-focus, `useFocusWithin`          |
| **Text selection + find** | Not in core                                                                                              | Mouse drag, `Ctrl+F` search, `Esc,v` keyboard selection                                 |
| **Command system**        | Not in core                                                                                              | Named commands, context-aware keys, `parseHotkey("⌘K")`                                 |
| **Clipboard**             | OSC 52 (v2)                                                                                              | OSC 52 `copyToClipboard`/`requestClipboard`                                             |
| **Image rendering**       | Not in core (ecosystem libraries available)                                                              | Core: `<Image>` — Kitty graphics + Sixel + text fallback                                |

### Components & Framework

| Feature                 | Bubble Tea v2                                                                                                               | Silvery                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Built-in components** | Bubbles: ~12 (spinner, textinput, textarea, viewport, table, list, filepicker, paginator, progress, help, timer, stopwatch) | **45+** core (VirtualList, Table, CommandPalette, TreeView, Toast, Tabs, SplitView, ModalDialog, Image, TextArea, ...) |
| **Forms**               | [Huh](https://github.com/charmbracelet/huh) — form builder with groups, validation, accessibility                           | Built-in form components (TextInput, SelectList, Checkbox, etc.)                                                       |
| **Theme system**        | Lip Gloss: chainable style functions, auto color downsampling (truecolor → 256 → 16)                                        | 38 palettes, semantic tokens (`$primary`, `$muted`), auto-detect terminal scheme                                       |
| **TEA state machines**  | Core — every program is `Init`/`Update`/`View`                                                                              | Optional via `@silvery/create`: `(action, state) → [state, effects]`, replay, undo                                     |
| **Composition**         | Embed models in parent, forward messages manually                                                                           | React JSX nesting + `pipe()` provider composition                                                                      |
| **SSH server**          | [Wish](https://github.com/charmbracelet/wish) — serve TUI apps over SSH                                                     | None                                                                                                                   |
| **Animation**           | `tea.Tick` commands for timer-based animation                                                                               | `useAnimation` + easing functions + `useAnimatedTransition`                                                            |
| **Resource cleanup**    | `tea.Quit` command                                                                                                          | `using` / Disposable — automatic teardown                                                                              |

### Testing

| Feature                        | Bubble Tea v2                                                         | Silvery                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Test library**               | `teatest` — send messages, assert model state, golden file comparison | `@silvery/test` with Playwright-style locators, `press()`, buffer assertions                                                 |
| **Pure function testing**      | Direct: call `Update(msg, model)` and assert returned model + cmd     | Direct: call TEA reducer and assert state + effects                                                                          |
| **Headless rendering**         | Not in core                                                           | `createTerm({ cols, rows })` — no terminal needed                                                                            |
| **Terminal emulator in tests** | Not in core                                                           | `createTermless()` via [Termless](https://termless.dev) — 10+ backends: xterm.js, vt100, Ghostty, Kitty, Alacritty, and more |
| **Render invariant checks**    | Not in core                                                           | `SILVERY_STRICT=1` verifies incremental = fresh on every frame                                                               |
| **Visual snapshots**           | Golden file comparison (string output)                                | `bufferToHTML()`, Playwright capture, `.tape` recordings → animated GIF, PNG, SVG                                            |

### Performance & Distribution

| Aspect                       | Bubble Tea v2                                                     | Silvery                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Language**                 | Compiled Go                                                       | TypeScript (Bun or Node.js)                                                                                                  |
| **Startup time**             | ~1 ms (compiled binary)                                           | ~50–150 ms (JS runtime initialization)                                                                                       |
| **Distribution**             | Single static binary — `go build`, cross-compile, no dependencies | Requires Node.js/Bun runtime; bundle with `bun build` or ship as npm package                                                 |
| **Interactive update speed** | Fast (compiled Go, cell diff)                                     | Fast incremental rendering — cell-level dirty tracking skips unchanged subtrees entirely. Performance is comparable to Ink 7.0 — see [benchmarks](/guide/silvery-vs-ink#performance-size) for details |
| **Output efficiency**        | Cell-based diff (v2)                                              | **10–20× less output** — cell-level diff + relative cursor addressing                                                        |
| **Memory**                   | Go GC with low pause times                                        | Normal JS GC; graduated scrollback frees React tree                                                                          |
| **Native dependencies**      | None (compiled Go)                                                | None (pure TypeScript)                                                                                                       |
| **Type safety**              | Go's type system (interfaces, generics since 1.18)                | TypeScript strict mode (generics, discriminated unions, branded types)                                                       |

## Key Differences Explained

### Layout

This is the most significant architectural difference.

**Bubble Tea has no layout engine.** You build layouts by joining strings with [Lip Gloss](https://github.com/charmbracelet/lipgloss):

```go
// Bubble Tea + Lip Gloss: manual layout via string joining
left := lipgloss.NewStyle().Width(30).Render(sidebar.View())
right := lipgloss.NewStyle().Width(50).Render(content.View())
layout := lipgloss.JoinHorizontal(lipgloss.Top, left, right)
```

You must calculate widths and heights yourself, pass them down to child models with `SetWidth`/`SetHeight`, and recalculate on terminal resize. There is no automatic flex-grow, no wrapping, no gap, no alignment that responds to available space.

**Silvery has CSS flexbox** via the Flexily layout engine:

```tsx
// Silvery: CSS flexbox layout
<Box flexDirection="row" gap={1}>
  <Box width={30}>
    <Sidebar />
  </Box>
  <Box flexGrow={1}>
    <Content />
  </Box>
</Box>
```

Components can read their computed dimensions during render via `useBoxRect()`. No manual size threading, no resize handlers calculating widths. The layout engine handles flex-grow, flex-shrink, wrapping, padding, margin, borders, gap, and alignment automatically.

For simple UIs (a list, a form, a spinner), this difference barely matters. For complex UIs (multi-pane dashboards, kanban boards, text editors with sidebars), it's substantial.

### TEA: Same Pattern, Different Surfaces

Both frameworks build on The Elm Architecture, but they expose it differently.

Bubble Tea is TEA all the way down. Every program is a `Model` struct with `Init`, `Update`, and `View` methods. Composition means embedding models and forwarding messages:

```go
// Bubble Tea: pure TEA
type Model struct {
    spinner  spinner.Model
    list     list.Model
    quitting bool
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    switch msg := msg.(type) {
    case tea.KeyPressMsg:
        if msg.String() == "q" {
            m.quitting = true
            return m, tea.Quit
        }
    }
    var cmd tea.Cmd
    m.list, cmd = m.list.Update(msg)
    return m, cmd
}

func (m Model) View() tea.View {
    return m.list.View()
}
```

Silvery uses React for the component tree and rendering, with TEA available as an optional layer via `@silvery/create` for state management:

```tsx
// Silvery: React components, optional TEA for state
function App() {
  const { width } = useBoxRect()
  const [items] = useState(loadItems)

  return (
    <Box flexDirection="column">
      <SelectList items={items} />
    </Box>
  )
}
```

```tsx
// Silvery TEA (optional, via @silvery/create):
// Pure (action, state) => [state, effects] for testable state machines
const [state, dispatch] = useTea(reducer, initialState)
```

The practical difference: in Bubble Tea, you manage all state transitions and message routing yourself — this is explicit and testable (you can call `Update` directly in tests). In Silvery, React handles the component tree, reconciliation, and rendering — you only use TEA where you want explicit state machine semantics (complex interactions, undo/redo, replay).

### Composition

Bubble Tea composes models by embedding them in parent models and manually routing messages. This is explicit but can become verbose with deeply nested UIs:

```go
// Bubble Tea: manual message routing
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    var cmds []tea.Cmd

    // Route to each child
    m.header, cmd = m.header.Update(msg)
    cmds = append(cmds, cmd)
    m.sidebar, cmd = m.sidebar.Update(msg)
    cmds = append(cmds, cmd)
    m.content, cmd = m.content.Update(msg)
    cmds = append(cmds, cmd)

    return m, tea.Batch(cmds...)
}
```

Silvery uses React's component tree -- composition is JSX nesting:

```tsx
// Silvery: React composition
function App() {
  return (
    <Box flexDirection="row">
      <Sidebar />
      <Box flexDirection="column" flexGrow={1}>
        <Header />
        <Content />
      </Box>
    </Box>
  )
}
```

### Styling

**Lip Gloss** provides chainable style functions:

```go
style := lipgloss.NewStyle().
    Bold(true).
    Foreground(lipgloss.Color("205")).
    Background(lipgloss.Color("236")).
    Padding(0, 1)

rendered := style.Render("Hello")
```

Lip Gloss v2 integrates with Bubble Tea for automatic color downsampling -- truecolor styles degrade gracefully on 256-color or 16-color terminals.

**Silvery** uses semantic theme tokens with 38 built-in palettes:

```tsx
<Text color="$primary">Important</Text>
<Text color="$muted">Secondary</Text>
<Box borderStyle="round" borderColor="$border">
  <Text>Framed content</Text>
</Box>
```

Silvery auto-detects the terminal's color scheme and selects an appropriate palette. Both approaches work well; Lip Gloss gives more explicit control, Silvery provides more consistency across terminals.

### Testing

**Bubble Tea** has `teatest` for integration-style testing:

```go
func TestApp(t *testing.T) {
    m := NewModel()
    tm := teatest.NewTestModel(t, m,
        teatest.WithInitialTermSize(80, 24),
    )

    tm.Send(tea.KeyPressMsg{Runes: []rune("j")})
    out := tm.FinalOutput(t)
    teatest.RequireEqualOutput(t, out) // golden file comparison
}
```

Testing is straightforward because TEA models are pure functions -- you can call `Update` directly with any message and assert the resulting model state.

**Silvery** has two testing layers:

```tsx
// Fast: headless renderer with auto-locators
import { createRenderer } from "@silvery/test"

using app = await createRenderer(<App />, { cols: 80, rows: 24 })
expect(app).toContainText("Hello")
await app.press("j")
expect(app.getByRole("listitem", { selected: true })).toHaveTextContent("Item 2")
```

```tsx
// Full: terminal emulator (Termless) for ANSI verification
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"

using term = createTermless({ cols: 80, rows: 24 })
const handle = await run(<App />, term)

expect(term.screen).toContainText("Dashboard")
expect(term.cell(0, 10)).toBeBold()
expect(term.row(0)).toHaveFg({ r: 255, g: 255, b: 255 })
await handle.press("j") // Navigate down
expect(term.scrollback).toContainText("Previous item")
```

Silvery's Termless runs a real terminal emulator in-process -- you can verify ANSI escape sequences, resolved RGB colors per cell, bold/italic/underline attributes, cursor position, and scrollback content. Bubble Tea's golden file approach compares rendered string output, which works well for catching regressions but doesn't validate terminal protocol correctness.

## Performance

Bubble Tea compiles to a native binary. Startup is near-instant (~1 ms). Rendering is fast because Go is compiled and garbage-collected with low pause times. The `View` function produces a string on every update; Bubble Tea v2's cell-based renderer then diffs at the cell level.

Silvery runs on a JavaScript runtime (Bun or Node.js). Startup includes runtime initialization (~50–150 ms). Once running, Silvery's incremental rendering skips unchanged nodes entirely — a typical interactive update (cursor move in a 1000-node tree) takes ~169 us. The 5-phase pipeline (measure, layout, content, diff, output) has overhead for full re-renders, but interactive updates are sub-millisecond because most of the tree is skipped.

**For CLIs that start, do one thing, and exit**, Go's startup advantage is real — 1 ms vs 50–150 ms matters when users run the command hundreds of times a day. **For interactive TUIs that run for minutes or hours**, runtime startup is irrelevant and per-update performance matters more. Silvery's cell-level dirty tracking skips unchanged subtrees entirely rather than re-running the full view function. Performance is comparable to Ink 7.0 — see [benchmarks](/guide/silvery-vs-ink#performance-size) for details.

## Ecosystem

The [Charm ecosystem](https://charm.sh) is cohesive and well-designed:

| Package                                                  | What                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Bubble Tea](https://github.com/charmbracelet/bubbletea) | Core framework                                                                                                            |
| [Bubbles](https://github.com/charmbracelet/bubbles)      | Components (spinner, textinput, textarea, viewport, table, list, filepicker, paginator, progress, help, timer, stopwatch) |
| [Lip Gloss](https://github.com/charmbracelet/lipgloss)   | Styling and layout                                                                                                        |
| [Huh](https://github.com/charmbracelet/huh)              | Forms and prompts                                                                                                         |
| [Wish](https://github.com/charmbracelet/wish)            | SSH server for TUI apps                                                                                                   |
| [Log](https://github.com/charmbracelet/log)              | Styled logging                                                                                                            |

Silvery's ecosystem is smaller but more integrated:

| Package             | What                                    |
| ------------------- | --------------------------------------- |
| `silvery`           | Core renderer + 45+ components          |
| `@silvery/create`   | TEA state machines                      |
| `@silvery/test`     | Testing (headless + Termless emulator)  |
| `@silvery/theme`    | 38 palettes, semantic tokens            |
| `@silvery/commands` | Command system with keybindings         |
| `@silvery/ansi`     | Terminal primitives, styling, detection |

Bubble Tea benefits from the broader Go ecosystem -- any Go library works alongside it. Silvery benefits from the React/npm ecosystem -- any React pattern (hooks, context, suspense) works inside it.

## When to Choose What

Both are excellent tools. The right choice depends on what you're building and in which language.

### Choose Bubble Tea when:

- **Your project is in Go** — Bubble Tea is the standard TUI framework for Go, and mixing languages adds complexity
- **You want a single binary** — Go compiles to a static binary with no runtime dependencies, ideal for distributing CLI tools (`brew install`, `go install`, download from GitHub releases)
- **You prefer pure TEA** — if you want the Elm Architecture without React's abstraction layer, Bubble Tea is TEA in its most direct form. Every program is a testable `(Msg, Model) → (Model, Cmd)` function
- **Simple-to-medium complexity UIs** — for CLIs, dashboards, and tools where manual layout is manageable, Bubble Tea's explicit approach works well
- **Startup time matters** — compiled Go starts in ~1 ms; JavaScript runtimes need 50–150 ms. For commands users run hundreds of times a day, this adds up
- **SSH-served TUIs** — [Wish](https://github.com/charmbracelet/wish) lets you serve Bubble Tea apps over SSH with no client-side installation

### Choose Silvery when:

- **Your project is in TypeScript/JavaScript** — using a Go framework from a Node.js project means running a subprocess or rewriting in Go
- **Complex layouts** — CSS flexbox handles multi-pane, responsive UIs that would require substantial manual calculation in Bubble Tea
- **React ecosystem** — hooks, context, component composition, third-party React libraries all work directly
- **Rich built-in components** — 45+ components (VirtualList, TextArea, Table, CommandPalette, ModalDialog) without assembling individual packages
- **Mouse interaction** — DOM-style event handling (`onClick`, `onWheel`, drag) with hit testing
- **Interactive update performance** — per-node dirty tracking for sub-millisecond updates in large trees
- **Terminal protocol depth** — image rendering, extended underlines, OSC sequences, terminal capability detection via [terminfo.dev](https://terminfo.dev)
- **Testing terminal output** — [Termless](https://termless.dev) gives you a real terminal emulator in-process with 10+ backends for verifying ANSI output, not just string snapshots
- **Inline/fullscreen hybrid** — inline mode with fullscreen performance, or fullscreen with scrollback graduation
