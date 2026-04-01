# Silvery vs Textual

_Information about Textual as of March 2026._

## Why This Page Exists

Textual is the leading TUI framework for Python, built by the creator of Rich. Both Textual and Silvery aim to bring web-style development patterns to the terminal -- CSS-like styling, component trees, reactive state. They arrive at similar goals from different languages and different architectures.

This page compares them honestly so you can pick the right one.

## The Two Projects

[Textual](https://github.com/Textualize/textual) (2021, [Textualize](https://www.textualize.io)) is a Python framework for building terminal UIs. Created by Will McGuigan (author of Rich), it uses a widget tree with CSS-like styling (TCSS), reactive attributes, and asyncio for event handling. Large widget library, active development, and a growing community. Apps can run in both terminal and web browser via [Textual Web](https://textual.textualize.io). See the [documentation](https://textual.textualize.io) for the full API reference.

[Silvery](https://github.com/beorn/silvery) (2025) is a React-based terminal UI framework for TypeScript. It uses React's component model with CSS flexbox layout (via Flexily), incremental rendering, and comprehensive terminal protocol support. Newer and smaller community, but more built-in terminal features.

## At a Glance

| Aspect              | Textual                                                                                                               | Silvery                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Language**        | Python                                                                                                                | TypeScript                                                                                                                          |
| **Architecture**    | Widget tree + TCSS + reactive attributes                                                                              | React component tree + CSS flexbox                                                                                                  |
| **Styling**         | TCSS (CSS subset in `.tcss` files)                                                                                    | Semantic theme tokens + inline props                                                                                                |
| **Layout**          | Dock, grid, horizontal, vertical                                                                                      | CSS flexbox (Flexily engine)                                                                                                        |
| **Components**      | 40+ built-in (DataTable, Input, Button, Select, Tree, TextArea, Markdown, RichLog, Sparkline, Tabs, OptionList, etc.) | 30+ built-in (VirtualList, TextArea, SelectList, Table, CommandPalette, ModalDialog, Tabs, TreeView, Toast, Image, SplitView, etc.) |
| **Testing**         | Pilot mode (async, simulated events)                                                                                  | `@silvery/test` (headless renderer, locators) + Termless (terminal emulator)                                                        |
| **Mouse support**   | Full (click, scroll, hover)                                                                                           | SGR protocol with DOM-style events                                                                                                  |
| **Keyboard**        | Standard terminal input                                                                                               | Kitty keyboard protocol (all 5 flags)                                                                                               |
| **Focus system**    | Tab-based with focusable widgets                                                                                      | Tree-based with scopes, spatial navigation                                                                                          |
| **Scrolling**       | Built-in per-widget, ScrollableContainer                                                                              | `overflow="scroll"`, VirtualList                                                                                                    |
| **Clipboard**       | Python-level (`pyperclip` etc.)                                                                                       | OSC 52 (works over SSH)                                                                                                             |
| **Image rendering** | None built-in                                                                                                         | Kitty graphics + Sixel with auto-detect                                                                                             |
| **Web target**      | Textual Web (serve TUI in browser)                                                                                    | Experimental (Canvas 2D, DOM)                                                                                                       |
| **Runtime**         | CPython / PyPy                                                                                                        | Node.js / Bun / Deno                                                                                                                |
| **Native deps**     | None                                                                                                                  | None                                                                                                                                |
| **Community**       | Large (Python TUI standard)                                                                                           | New                                                                                                                                 |

## CSS: TCSS vs Flexbox Props

Both frameworks bring CSS concepts to the terminal, but in different ways.

### Textual's TCSS

Textual has its own CSS dialect (TCSS) written in `.tcss` files. It supports selectors, pseudo-classes, and a subset of CSS properties adapted for terminals:

```python
# Python widget
class Sidebar(Widget):
    pass

class MainApp(App):
    CSS = """
    Sidebar {
        dock: left;
        width: 30;
        background: $surface;
    }

    Sidebar:focus-within {
        border: tall $accent;
    }

    #content {
        height: 1fr;
    }
    """

    def compose(self):
        yield Sidebar()
        yield Container(id="content")
```

TCSS supports type selectors, ID selectors (`#id`), class selectors (`.class`), pseudo-classes (`:focus`, `:hover`, `:disabled`), and combinators. Properties include `dock`, `width`, `height`, `margin`, `padding`, `background`, `color`, `border`, `display`, `visibility`, `overflow`, and layout-specific properties like `grid-size-columns` and `grid-size-rows`.

The separation of styling from code is a strength -- you can restyle widgets without changing Python code, and TCSS hot-reloads during development.

### Silvery's Flexbox Props

Silvery uses React props for styling, with semantic theme tokens:

```tsx
function App() {
  return (
    <Box flexDirection="row">
      <Box width={30} borderStyle="round" borderColor="$border">
        <Sidebar />
      </Box>
      <Box flexGrow={1} flexDirection="column">
        <Header />
        <Content />
      </Box>
    </Box>
  )
}
```

Layout is CSS flexbox via the Flexily engine -- `flexDirection`, `flexGrow`, `flexShrink`, `flexWrap`, `gap`, `alignItems`, `justifyContent`, `padding`, `margin`, and `border` all work as they do in browser CSS.

Silvery does not have external stylesheet files. Styling is inline (props) or via theme tokens (`$primary`, `$muted`, `$border`). This is closer to React Native or Tailwind than traditional CSS.

**Trade-off:** TCSS gives you selector-based styling with hot-reload and separation of concerns. Silvery's inline props are more explicit and co-located with components but lack the cascading and selector power of TCSS.

## Layout

### Textual

Textual offers several layout systems:

- **Vertical** -- stack widgets top-to-bottom (default)
- **Horizontal** -- arrange widgets left-to-right
- **Grid** -- CSS Grid-style rows and columns
- **Dock** -- pin widgets to screen edges (top, bottom, left, right)

```python
class MyApp(App):
    CSS = """
    #sidebar { dock: left; width: 30; }
    #main { height: 1fr; }
    #footer { dock: bottom; height: 3; }
    """

    def compose(self):
        yield Sidebar(id="sidebar")
        yield Container(id="main")
        yield Footer(id="footer")
```

The `fr` (fraction) unit distributes remaining space proportionally, similar to CSS Grid. Dock pulls widgets to edges before remaining space is calculated.

### Silvery

Silvery uses CSS flexbox exclusively:

```tsx
<Box flexDirection="row" height="100%">
  <Box width={30}>
    <Sidebar />
  </Box>
  <Box flexGrow={1} flexDirection="column">
    <Box flexGrow={1}>
      <Content />
    </Box>
    <Box height={3}>
      <Footer />
    </Box>
  </Box>
</Box>
```

No grid layout, no dock. Everything is flexbox. This is limiting compared to Textual's layout variety, but flexbox handles most TUI layouts well -- and if you know CSS flexbox from web development, there is nothing new to learn.

Silvery's key layout advantage is `useContentRect()` -- components know their dimensions during render, not after. Textual widgets can query their size via `self.size` but this is set during the layout phase, similar to how web components work.

## Widget Libraries

Both frameworks have substantial widget libraries.

### Textual Widgets

Textual ships 40+ widgets. A representative sample:

| Widget                                | What                                            |
| ------------------------------------- | ----------------------------------------------- |
| `Button`                              | Clickable button with variants                  |
| `Input`                               | Single-line text input                          |
| `TextArea`                            | Multi-line text editor with syntax highlighting |
| `DataTable`                           | Sortable, scrollable data grid                  |
| `Tree`                                | Expandable tree view                            |
| `Select` / `SelectionList`            | Dropdown and multi-select                       |
| `Markdown` / `MarkdownViewer`         | Markdown rendering                              |
| `RichLog`                             | Scrollable log output with Rich formatting      |
| `Tabs` / `TabbedContent`              | Tabbed container                                |
| `Sparkline`                           | Inline data visualization                       |
| `ProgressBar` / `LoadingIndicator`    | Progress feedback                               |
| `Header` / `Footer`                   | App chrome                                      |
| `ListView` / `OptionList`             | Scrollable item lists                           |
| `DirectoryTree`                       | File browser                                    |
| `Switch` / `Checkbox` / `RadioButton` | Toggle controls                                 |

### Silvery Components

Silvery ships 30+ components:

| Component                 | What                                              |
| ------------------------- | ------------------------------------------------- |
| `TextInput`               | Single-line with readline (Ctrl+A/E/K/U, Alt+B/F) |
| `TextArea`                | Multi-line with word wrap, scroll, undo/redo      |
| `SelectList`              | Interactive list with j/k navigation              |
| `VirtualList`             | Virtualized scrolling for large datasets          |
| `Table`                   | Tabular data display                              |
| `TreeView`                | Expandable tree                                   |
| `Tabs`                    | Tabbed navigation                                 |
| `CommandPalette`          | Fuzzy command search (VS Code-style)              |
| `ModalDialog`             | Modal with focus trapping                         |
| `Toast`                   | Notification popups                               |
| `Spinner` / `ProgressBar` | Progress feedback                                 |
| `Image`                   | Kitty graphics / Sixel with auto-detect           |
| `SplitView`               | Resizable split panes                             |
| `Console`                 | Composable console output                         |
| `Link`                    | OSC 8 clickable hyperlinks                        |

Textual's widget library is larger and more mature. Silvery's is smaller but includes some unique components (CommandPalette, Image, SplitView) and all components integrate with the framework's focus system and input layering.

## Reactive State

### Textual

Textual uses reactive attributes -- decorated properties that automatically trigger UI updates:

```python
class Counter(Widget):
    count = reactive(0)

    def watch_count(self, new_value: int) -> None:
        self.query_one("#display").update(str(new_value))

    def on_button_pressed(self, event: Button.Pressed) -> None:
        self.count += 1
```

The `reactive` descriptor + `watch_*` pattern is similar to Vue's watchers. State changes automatically invalidate the widget for re-rendering.

### Silvery

Silvery uses React's standard state model:

```tsx
function Counter() {
  const [count, setCount] = useState(0)
  return (
    <Box>
      <Text>{count}</Text>
      <Button onPress={() => setCount((c) => c + 1)}>+1</Button>
    </Box>
  )
}
```

React hooks (`useState`, `useReducer`, `useContext`, `useMemo`, `useCallback`) work as expected. For complex state, `@silvery/create` provides TEA-style pure reducers with serializable actions.

Both approaches work well. Textual's reactive attributes are more implicit (mutation triggers updates). React's hooks are more explicit (state updates must go through setter functions).

## Testing

### Textual Pilot

Textual's `pilot` mode runs the app headlessly for testing:

```python
async def test_counter():
    app = CounterApp()
    async with app.run_test() as pilot:
        await pilot.press("up")
        assert app.query_one("#count").renderable == "1"
        await pilot.click("#reset")
        assert app.query_one("#count").renderable == "0"
```

You can press keys, click widgets by CSS selector, and assert widget state. The app runs with a simulated terminal.

### Silvery Testing

Silvery has two testing layers:

```tsx
// Fast: headless renderer with Playwright-style locators
using app = await createRenderer(<App />, { cols: 80, rows: 24 })
expect(app).toContainText("Count: 0")
await app.press("up")
expect(app).toContainText("Count: 1")
```

```tsx
// Full: Termless (in-process terminal emulator)
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

Termless runs a real terminal emulator in-process, so you can verify resolved RGB colors per cell, bold/italic/underline attributes, cursor position, and scrollback content -- not just widget state. This is unique to Silvery and matters when testing terminal protocol correctness.

## Terminal Protocol Support

This is where the frameworks diverge significantly.

| Feature                 | Textual                    | Silvery                                                         |
| ----------------------- | -------------------------- | --------------------------------------------------------------- |
| **True color**          | Yes                        | Yes                                                             |
| **256 color**           | Yes                        | Yes                                                             |
| **Color downsampling**  | Yes (automatic)            | Yes (via `@silvery/ansi`)                                       |
| **Mouse support**       | Yes (click, scroll, hover) | Yes (SGR protocol, DOM-style events, drag)                      |
| **Kitty keyboard**      | No                         | All 5 flags (disambiguate, events, alternate, all keys, text)   |
| **Key event types**     | Press                      | Press, repeat, release                                          |
| **Synchronized output** | No                         | DEC mode 2026 (flicker-free in tmux/Zellij)                     |
| **Extended underlines** | Curly, dotted, dashed      | Full ISO 8613-6 (single, double, curly, dotted, dashed + color) |
| **Clipboard**           | Via system clipboard       | OSC 52 (works over SSH)                                         |
| **Hyperlinks**          | Yes (Rich links)           | OSC 8 with `<Link>` component                                   |
| **Images**              | No                         | Kitty graphics + Sixel with auto-detect                         |
| **Window title**        | Yes                        | OSC 0/2                                                         |
| **Terminal queries**    | Limited                    | DA1/DA2/DA3, XTVERSION, CPR, pixel dimensions                   |
| **Bracketed paste**     | Yes                        | Yes (`usePaste` hook)                                           |
| **Scroll regions**      | No                         | DECSTBM                                                         |
| **Cursor styles**       | Limited                    | Full DECSCUSR (block, underline, bar, blinking)                 |

Silvery's terminal protocol coverage is broader, particularly for Kitty keyboard (important for distinguishing Ctrl+I from Tab, Ctrl+M from Enter), synchronized output (eliminates flicker in terminal multiplexers), and image rendering.

Textual compensates with its web target -- Textual Web can serve any Textual app in a browser, which is a different kind of cross-platform story.

## Performance

Python and TypeScript are both interpreted languages, so neither has Go or Rust-level raw speed. In practice, terminal rendering is rarely the bottleneck -- network I/O, file access, and computation dominate.

**Textual** uses asyncio and careful caching. Widget rendering is optimized with Rich's rendering pipeline. Large DataTables use virtual scrolling for 1000+ rows.

**Silvery** uses incremental rendering with per-node dirty tracking. A typical interactive update (cursor move in a 1000-node tree) takes ~169 us because unchanged nodes are skipped entirely. The cell-level buffer diff means only changed characters generate output.

For most applications, both are fast enough. If you're building an app with thousands of rapidly updating nodes, Silvery's incremental approach has an advantage. If you're building a data dashboard that updates every few seconds, both handle it comfortably.

## Web Target

**Textual Web** can serve any Textual app as a web application -- users access it via a browser with no installation. This is a genuine differentiator for deployment scenarios (internal tools, dashboards, remote access):

```bash
textual serve myapp.py
```

**Silvery** has experimental Canvas 2D and DOM render targets. These are not production-ready but are on the roadmap. The architecture supports multi-target rendering because the layout and rendering pipeline is decoupled from terminal output.

## When to Choose

### Choose Textual when:

- **Your project is in Python** -- Textual integrates naturally with Python data science, web, and automation ecosystems
- **You want TCSS styling** -- separate stylesheet files with selectors, pseudo-classes, and hot-reload during development
- **Web deployment matters** -- Textual Web serves TUI apps in the browser with no client installation
- **Rich widget library** -- 40+ built-in widgets with consistent styling and behavior
- **Data-oriented apps** -- DataTable, Sparkline, RichLog, and Rich formatting are well-suited for dashboards and data tools
- **Grid layout** -- TCSS supports CSS Grid-style layouts alongside flexbox and dock

### Choose Silvery when:

- **Your project is in TypeScript/JavaScript** -- React components, npm packages, TypeScript type safety
- **Complex interactive UIs** -- kanban boards, text editors, multi-pane dashboards where layout-aware rendering matters
- **React ecosystem** -- hooks, context, component composition, suspense, and the full React mental model
- **Terminal protocol depth** -- Kitty keyboard, synchronized output, image rendering, clipboard over SSH, terminal capability detection via [terminfo.dev](https://terminfo.dev)
- **Testing terminal output** -- Termless verifies actual ANSI sequences and resolved colors, not just widget state
- **TEA state machines** -- `@silvery/create` provides pure `(action, state) -> [state, effects]` reducers alongside React
- **Input isolation** -- InputLayerProvider with DOM-style bubbling and `stopPropagation` for modal dialogs and layered UIs
