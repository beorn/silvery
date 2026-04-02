# Silvery vs Bubble Tea

_Information about Bubble Tea as of March 2026._

## Why This Page Exists

Bubble Tea is the leading TUI framework in the Go ecosystem. It uses The Elm Architecture (TEA) -- the same functional pattern that inspired Silvery's `@silvery/create` state machines. If you're choosing between them, the decision usually starts with language: Go or TypeScript. But the architectural differences go deeper than that.

This page gives an honest comparison so you can pick the right tool for your project.

## The Two Projects

[Bubble Tea](https://github.com/charmbracelet/bubbletea) (2020, [Charm](https://charm.sh)) is a Go framework for building terminal UIs using The Elm Architecture. Programs are defined by three functions: `Init`, `Update`, and `View`. The [Charm ecosystem](https://charm.sh) includes [Bubbles](https://github.com/charmbracelet/bubbles) (reusable components), [Lip Gloss](https://github.com/charmbracelet/lipgloss) (styling), and [Huh](https://github.com/charmbracelet/huh) (form building). Widely adopted, well-documented, and actively maintained with v2 released in 2025.

[Silvery](https://github.com/beorn/silvery) (2025) is a React-based terminal UI framework for TypeScript. It combines React's component model with TEA-style state machines (via `@silvery/create`), CSS flexbox layout (via Flexily), and a rendering pipeline that gives components their dimensions during render. Newer, smaller community, but more built-in features.

## At a Glance

| Aspect              | Bubble Tea                                                                                                                  | Silvery                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Language**        | Go                                                                                                                          | TypeScript                                                                                                                          |
| **Layout**          | Manual string joining (Lip Gloss)                                                                                           | CSS flexbox (Flexily engine)                                                                                                        |
| **Architecture**    | Pure TEA (Model/Update/View)                                                                                                | React components + optional TEA (`@silvery/create`)                                                                                 |
| **Styling**         | Lip Gloss (chainable style functions)                                                                                       | `@silvery/theme` (38 palettes, semantic tokens)                                                                                     |
| **Components**      | Bubbles: ~12 (spinner, textinput, textarea, viewport, table, list, filepicker, paginator, progress, help, timer, stopwatch) | 30+ built-in (VirtualList, TextArea, SelectList, Table, CommandPalette, ModalDialog, Tabs, TreeView, Toast, Image, SplitView, etc.) |
| **Testing**         | `teatest` (Go testing, golden files)                                                                                        | `@silvery/test` (headless renderer, Playwright-style locators) + Termless (terminal emulator)                                       |
| **Mouse support**   | SGR mouse (v2)                                                                                                              | SGR mouse with DOM-style events (`onClick`, `onWheel`, `onMouseDown`)                                                               |
| **Keyboard**        | Kitty keyboard protocol (v2)                                                                                                | Kitty keyboard, all 5 flags                                                                                                         |
| **Focus system**    | Manual (manage in model state)                                                                                              | Tree-based with scopes, spatial navigation, click-to-focus                                                                          |
| **Scrolling**       | Viewport bubble (manual sizing)                                                                                             | `overflow="scroll"` (native, layout-integrated)                                                                                     |
| **Clipboard**       | OSC 52 (v2)                                                                                                                 | OSC 52 `copyToClipboard`/`requestClipboard`                                                                                         |
| **Image rendering** | None (community libraries)                                                                                                  | Built-in Kitty graphics + Sixel with auto-detect                                                                                    |
| **Native deps**     | None (compiled Go binary)                                                                                                   | None (pure TypeScript)                                                                                                              |
| **Binary size**     | Single static binary                                                                                                        | Requires Node.js/Bun runtime                                                                                                        |
| **Startup time**    | ~1 ms (compiled)                                                                                                            | ~50-150 ms (JS runtime init)                                                                                                        |
| **Community**       | Large (Go TUI standard)                                                                                                     | New                                                                                                                                 |

## Layout

This is the most significant difference between the two frameworks.

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

Components can read their computed dimensions during render via `useContentRect()`. No manual size threading, no resize handlers calculating widths. The layout engine handles flex-grow, flex-shrink, wrapping, padding, margin, borders, gap, and alignment automatically.

For simple UIs (a list, a form, a spinner), this difference barely matters. For complex UIs (multi-pane dashboards, kanban boards, text editors with sidebars), it's substantial.

## Architecture

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
  const { width } = useContentRect()
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

The practical difference: in Bubble Tea, you manage all state transitions and message routing yourself. In Silvery, React handles the component tree, reconciliation, and rendering -- you only use TEA where you want explicit state machine semantics (complex interactions, undo/redo, replay).

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

## Styling

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

## Testing

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

Bubble Tea compiles to a native binary. Startup is near-instant (~1 ms). Rendering is fast because Go is compiled and garbage-collected with low pause times. The View function produces a string on every update; Bubble Tea v2's cell-based renderer then diffs at the cell level.

Silvery runs on a JavaScript runtime (Bun or Node.js). Startup includes runtime initialization (~50-150 ms). Once running, Silvery's incremental rendering skips unchanged nodes entirely -- a typical interactive update (cursor move in a 1000-node tree) takes ~169 us. The 5-phase pipeline (measure, layout, content, diff, output) has overhead for full re-renders, but interactive updates are sub-millisecond because most of the tree is skipped.

For CLIs that start, do one thing, and exit, Go's startup advantage is real. For interactive TUIs that run for minutes or hours, runtime startup is irrelevant and per-update performance matters more.

## Ecosystem

The Charm ecosystem is cohesive and well-designed:

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

## When to Choose

### Choose Bubble Tea when:

- **Your project is in Go** -- Bubble Tea is the standard TUI framework for Go, and mixing languages adds complexity
- **You want a single binary** -- Go compiles to a static binary with no runtime dependencies, ideal for distribution
- **You prefer pure TEA** -- if you want the Elm Architecture without React's abstraction layer, Bubble Tea is TEA in its most direct form
- **Simple-to-medium complexity UIs** -- for CLIs, dashboards, and tools where manual layout is manageable, Bubble Tea's explicit approach works well
- **Startup time matters** -- compiled Go starts in ~1 ms; JavaScript runtimes need 50-150 ms

### Choose Silvery when:

- **Your project is in TypeScript/JavaScript** -- using a Go framework from a Node.js project means running a subprocess or rewriting in Go
- **Complex layouts** -- CSS flexbox handles multi-pane, responsive UIs that would require substantial manual calculation in Bubble Tea
- **React ecosystem** -- hooks, context, component composition, third-party React libraries all work directly
- **Rich built-in components** -- 45+ components (VirtualList, TextArea, Table, CommandPalette, ModalDialog) without assembling individual packages
- **Mouse interaction** -- DOM-style event handling (`onClick`, `onWheel`, drag) with hit testing
- **Terminal protocol depth** -- image rendering, extended underlines, OSC sequences, terminal capability detection via [terminfo.dev](https://terminfo.dev)
- **Testing terminal output** -- Termless gives you a real terminal emulator in-process for verifying ANSI output, not just string snapshots
