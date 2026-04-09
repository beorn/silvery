# Silvery vs Blessed

_Information about Blessed as of March 2026._

## Why This Page Exists

If you're building a terminal UI in JavaScript, you've probably encountered Blessed. For years it was the only serious option for curses-style TUI development in Node.js. But Blessed has been unmaintained since 2015, and the ecosystem has moved on.

This page compares the two so you can make an informed decision -- particularly if you're maintaining a Blessed-based app and considering what comes next.

## The Two Projects

[Blessed](https://github.com/chjj/blessed) (2013) is a curses-like terminal interface library for Node.js. It reimplements ncurses entirely in JavaScript (~16,000 lines), providing a widget system with screens, boxes, lists, forms, tables, and more. The last tagged release (v0.1.81) was in 2015. The last commit to the main repository was in 2017. There are community forks ([neo-blessed](https://github.com/embarklabs/neo-blessed), [blessed-ng](https://github.com/nicholasgasior/blessed-ng)) that apply maintenance patches, but none have substantially evolved the architecture.

[Silvery](https://github.com/beorn/silvery) (2025) is a React-based terminal UI framework for TypeScript. Modern rendering pipeline, CSS flexbox layout, incremental rendering, comprehensive terminal protocol support. Actively developed.

## At a Glance

| Aspect               | Blessed                                                 | Silvery                                                                         |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Status**           | Unmaintained (last release 2015)                        | Active development                                                              |
| **Language**         | JavaScript (CommonJS)                                   | TypeScript (ESM)                                                                |
| **Architecture**     | Curses-style (Screen → Widget tree)                     | React declarative (JSX component tree)                                          |
| **API style**        | Imperative (create, set, append, render)                | Declarative (JSX, props, hooks)                                                 |
| **Layout**           | Manual positioning (top/left/width/height, percentages) | CSS flexbox (Flexily engine)                                                    |
| **Rendering**        | Full screen redraw                                      | Per-node incremental with cell-level diff                                       |
| **Terminal parsing** | Built-in terminfo/termcap parser                        | Built-in ANSI parser + capability detection                                     |
| **Components**       | ~40 widgets (list, table, form, textbox, etc.)          | 45+ components (VirtualList, TextArea, SelectList, Table, CommandPalette, etc.) |
| **Mouse support**    | X10 protocol (basic)                                    | SGR protocol with DOM-style events                                              |
| **Keyboard**         | Traditional terminal input                              | Kitty keyboard protocol (all 5 flags)                                           |
| **Unicode/emoji**    | Limited (width calculation issues)                      | Full support (grapheme splitting, display width, CJK, emoji ZWJ)                |
| **True color**       | Partial (256 color default)                             | Full (16/256/truecolor, automatic downsampling)                                 |
| **Testing**          | None built-in                                           | `@silvery/test` + Termless (terminal emulator)                                  |
| **Theme system**     | Manual styling                                          | 38 palettes, semantic tokens, auto-detection                                    |
| **Native deps**      | None                                                    | None                                                                            |
| **Node.js version**  | 0.10+ (era-appropriate)                                 | 18+ (modern ESM)                                                                |
| **npm downloads**    | ~1.6M/week (legacy installs)                            | New                                                                             |

## Architecture: Imperative vs Declarative

This is the fundamental difference. Blessed uses an imperative, curses-style API. Silvery uses React's declarative model.

### Blessed: Imperative Widgets

```javascript
const blessed = require("blessed")

const screen = blessed.screen({ smartCSR: true })

const box = blessed.box({
  top: "center",
  left: "center",
  width: "50%",
  height: "50%",
  content: "Hello {bold}world{/bold}!",
  tags: true,
  border: { type: "line" },
  style: {
    fg: "white",
    bg: "magenta",
    border: { fg: "#f0f0f0" },
    hover: { bg: "green" },
  },
})

screen.append(box)
box.focus()
screen.render()

screen.key(["escape", "q", "C-c"], () => process.exit(0))
```

You create widget objects, set properties, append them to a screen, and call `render()`. State changes mean mutating widget properties and calling `render()` again.

### Silvery: Declarative Components

```tsx
function App() {
  return (
    <Box alignItems="center" justifyContent="center" width="100%" height="100%">
      <Box borderStyle="single" borderColor="$border" padding={1} width="50%" height="50%">
        <Text bold>Hello world!</Text>
      </Box>
    </Box>
  )
}

await render(<App />)
```

You describe what the UI should look like. React handles diffing and updates. State changes via hooks trigger re-renders automatically.

The declarative approach eliminates an entire class of bugs -- forgetting to call `render()`, mutating widgets in the wrong order, orphaned event listeners, manual DOM-like manipulation that gets out of sync with state.

## Layout

### Blessed: Manual Positioning

Blessed uses absolute and percentage-based positioning:

```javascript
const sidebar = blessed.box({
  top: 0,
  left: 0,
  width: "30%",
  height: "100%",
})

const content = blessed.box({
  top: 0,
  left: "30%",
  width: "70%",
  height: "100%-2", // Leave room for status bar
})

const statusBar = blessed.box({
  bottom: 0,
  left: 0,
  width: "100%",
  height: 2,
})
```

Layout is manual arithmetic -- you calculate positions and sizes yourself. Percentage-based sizing helps, but there is no automatic flex-grow, no wrapping, no gap spacing, no alignment. Nested layouts require careful coordinate math.

### Silvery: CSS Flexbox

```tsx
<Box flexDirection="row" height="100%">
  <Box width="30%">
    <Sidebar />
  </Box>
  <Box flexGrow={1} flexDirection="column">
    <Box flexGrow={1}>
      <Content />
    </Box>
    <Box height={2}>
      <StatusBar />
    </Box>
  </Box>
</Box>
```

The Flexily layout engine handles flexbox automatically -- `flexGrow`, `flexShrink`, `flexWrap`, `gap`, `alignItems`, `justifyContent`, `padding`, `margin`, and `border`. Components can read their computed dimensions during render via `useBoxRect()`.

For anything beyond trivial layouts, the difference is substantial. A three-column kanban board with variable-height cards in Blessed requires tracking positions for every element. In Silvery, it's nested flex containers.

## Unicode and Emoji

Blessed was built in the era of ASCII terminals. Its character width calculation has known issues with:

- **CJK characters** -- double-width characters often misalign subsequent content
- **Emoji** -- particularly ZWJ (zero-width joiner) sequences and modifier sequences
- **Combining characters** -- diacritical marks and other combining marks
- **Grapheme clusters** -- characters that span multiple Unicode code points

Silvery handles all of these natively with 28+ built-in Unicode utility functions:

- Grapheme cluster splitting (UAX #29)
- East Asian Width for display width calculation
- CJK detection
- ANSI-aware text truncation, wrapping, and slicing
- Emoji ZWJ sequence handling

This matters more than it might seem -- any app displaying user-generated content, filenames, or international text will hit these issues in Blessed.

## Terminal Protocol Support

Blessed was state-of-the-art for 2013. The terminal landscape has changed substantially since then.

| Feature                 | Blessed                                | Silvery                                                                 |
| ----------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| **Color**               | 16/256 (truecolor partial)             | 16/256/truecolor with automatic downsampling                            |
| **Mouse**               | X10 protocol (basic click)             | SGR 1006 (large coordinates, precise tracking, drag)                    |
| **Keyboard**            | Traditional input parsing              | Kitty keyboard protocol (disambiguate Ctrl+I/Tab, press/repeat/release) |
| **Underline styles**    | Single only                            | ISO 8613-6 (single, double, curly, dotted, dashed + color)              |
| **Clipboard**           | Via external tools (`pbcopy`, `xclip`) | OSC 52 (works over SSH, no external tools)                              |
| **Hyperlinks**          | None                                   | OSC 8 clickable URLs                                                    |
| **Images**              | None                                   | Kitty graphics + Sixel with auto-detect                                 |
| **Synchronized output** | None                                   | DEC mode 2026 (flicker-free in tmux/Zellij)                             |
| **Bracketed paste**     | None                                   | `usePaste` hook with automatic mode toggling                            |
| **Focus events**        | None                                   | DEC mode 1004 (focus in/out reporting)                                  |
| **Window title**        | Via `screen.title`                     | OSC 0/2                                                                 |
| **Terminal detection**  | terminfo/termcap parsing               | DA1/DA2/DA3, XTVERSION + terminfo queries                               |
| **Cursor styles**       | Limited                                | Full DECSCUSR (block, underline, bar, blinking)                         |

Modern terminals (Kitty, Ghostty, WezTerm, iTerm2, Windows Terminal) support protocols that didn't exist when Blessed was written. Applications built with Blessed cannot take advantage of these without significant patching.

For compatibility data across terminals, see [terminfo.dev](https://terminfo.dev).

## Rendering

### Blessed

Blessed renders by writing the full screen content on each `render()` call, with some optimization via `smartCSR` (scroll region detection) and `fastCSR`. The rendering is direct string output -- no intermediate buffer, no cell-level diffing.

### Silvery

Silvery uses a 5-phase pipeline:

1. **Measure** -- calculate content sizes
2. **Layout** -- flexbox via Flexily, with caching for unchanged subtrees
3. **Content** -- render only dirty nodes (7 independent dirty flags per node)
4. **Output** -- cell-level buffer diff, emit minimal ANSI
5. **Flush** -- synchronized output (DEC 2026) for flicker-free display

A typical interactive update (cursor move) touches a few nodes and takes ~169 us in a 1000-node tree. Blessed re-renders the entire screen.

## Event Handling

### Blessed

Blessed uses Node.js EventEmitter-style events:

```javascript
box.on("click", function (mouse) {
  // Handle click
})

screen.key(["q", "C-c"], function () {
  process.exit(0)
})

box.key("enter", function () {
  // Handle enter on this widget
})
```

Events are flat -- there is no bubbling, no capturing, no `stopPropagation`. Key handlers on the screen receive all input. Managing focus and input isolation requires manual state tracking.

### Silvery

Silvery uses DOM-style event handling with input layering:

```tsx
<InputLayerProvider>
  <Box onClick={(e) => selectItem(e.target)}>
    <Text>Click me</Text>
  </Box>

  {isDialogOpen && (
    <ModalDialog onClose={() => setDialogOpen(false)}>{/* Dialog consumes input, parent never sees it */}</ModalDialog>
  )}
</InputLayerProvider>
```

Input layers isolate automatically -- a modal dialog captures all input without every other handler needing guard checks. Focus scopes provide spatial navigation (arrow keys move between adjacent components).

## Testing

Blessed has no built-in testing support. Testing a Blessed app means either testing business logic separately from the UI, or building custom test harnesses around the screen object.

Silvery provides two testing layers:

```tsx
// Fast: headless renderer
using app = await createRenderer(<App />, { cols: 80, rows: 24 })
expect(app).toContainText("Hello")
await app.press("j")
expect(app.getByRole("listitem", { selected: true })).toHaveTextContent("Item 2")
```

```tsx
// Full: terminal emulator (Termless)
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

## Community Forks

Blessed has several community forks that apply maintenance patches:

- **[neo-blessed](https://github.com/embarklabs/neo-blessed)** -- the most active fork, positioned as a drop-in replacement. Applies bug fixes and compatibility patches, with recent npm releases (v2.0.2 as of early 2026).
- **[blessed-ng](https://github.com/nicholasgasior/blessed-ng)** -- another community maintenance fork.
- **[@terminal-junkies/neo-blessed](https://www.npmjs.com/package/@terminal-junkies/neo-blessed)** -- a fork of neo-blessed with additional bug fixes.

These forks keep Blessed usable on modern Node.js versions, but none have changed the fundamental architecture. They are maintenance patches, not evolution.

## Migration Considerations

If you're maintaining a Blessed app and considering a move, here's what to expect:

### What changes

- **Imperative to declarative** -- `blessed.box({...})` becomes `<Box {...}>`. Widget mutation becomes React state + hooks.
- **Manual positioning to flexbox** -- `top: 5, left: '30%'` becomes `<Box flexDirection="row">`. Most layouts get simpler.
- **CommonJS to ESM** -- `require('blessed')` becomes `import { Box, Text } from 'silvery'`.
- **Event handlers** -- `widget.on('click', fn)` becomes `<Box onClick={fn}>`. `screen.key(...)` becomes `useInput(...)` or the command system.

### What stays similar

- **Component tree** -- Blessed's Screen/Box hierarchy maps to React's component tree
- **Box model** -- padding, margin, border concepts are the same
- **Terminal abstraction** -- both abstract over raw terminal I/O

### What you gain

- CSS flexbox layout, eliminating manual coordinate math
- React's component model (hooks, context, composition, third-party libraries)
- Incremental rendering (orders of magnitude faster updates for large trees)
- Modern terminal protocols (Kitty keyboard, SGR mouse, images, clipboard)
- Full Unicode/emoji support
- Built-in testing with Termless
- Active maintenance and development

## When to Choose

### Keep Blessed when:

- **Legacy maintenance** -- an existing Blessed app is stable and only needs minor fixes
- **No resources to migrate** -- the migration effort is not justified for an app that is working and not actively developed
- **Specific Blessed widgets** -- you depend on Blessed-specific widgets (terminal emulator, video player, IRC client widgets) that have no Silvery equivalent

### Choose Silvery when:

- **New project** -- there is no reason to start a new project with an unmaintained framework
- **Active development** -- if you're building features, not just maintaining, the modern tooling pays for itself
- **Complex UIs** -- multi-pane layouts, scrollable containers, and responsive design are dramatically easier with flexbox
- **Modern terminals** -- if your users have Kitty, Ghostty, WezTerm, or iTerm2, Silvery can take advantage of their capabilities
- **Unicode content** -- international text, emoji, CJK characters work correctly out of the box
- **Testing** -- Termless provides test coverage for terminal rendering that Blessed cannot match
- **TypeScript** -- type safety, editor support, and modern JavaScript patterns
