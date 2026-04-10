# Silvery vs Blessed

_External project claims last verified: 2026-04. Blessed version: 0.1.81 (last release 2015)._

[Blessed](https://github.com/chjj/blessed) (2013) pioneered rich terminal UIs in Node.js by reimplementing ncurses entirely in JavaScript (~16,000 lines). Its curses-like API — screens, boxes, lists, forms, tables, and a terminal-within-terminal widget — was state-of-the-art for its era. The last tagged release (v0.1.81) was 2015; the last commit to the main repository was January 2016. Community forks ([neo-blessed](https://github.com/embarklabs/neo-blessed), [blessed-ng](https://github.com/nicholasgasior/blessed-ng)) apply maintenance patches but haven't substantially changed the architecture. Despite being unmaintained, Blessed still sees ~1M+ npm weekly downloads — a testament to how many production CLIs depend on it.

Silvery (2025) is a ground-up reimplementation with a React component model, CSS flexbox layout, and an incremental rendering pipeline. Different era, different architecture, different trade-offs.

Silvery grew out of building a complex terminal app where components needed to know their size during render, updates needed to be fast, and scroll containers, mouse events, focus scopes, and Playwright-style testing needed to just work. Three principles emerged: take the best from the web, stay true to the terminal, and raise the bar for developer ergonomics, architecture composability, and performance.

## Highlights

The biggest differences at a glance:

- **React declarative vs curses imperative** — Silvery uses JSX, hooks, and React's component model. Blessed uses `create → set → append → render()` with manual state mutation. The declarative approach eliminates a class of bugs: forgotten `render()` calls, out-of-order widget mutations, orphaned event listeners.
- **CSS flexbox layout** — `flexGrow`, `flexWrap`, `gap`, `alignItems`, `justifyContent` via the Flexily engine. Blessed uses manual absolute/percentage positioning with coordinate math.
- **Layout-first rendering** — components know their size _during_ render via `useBoxRect()`, not after. Blessed has no equivalent.
- **Cell-level incremental rendering** — per-node dirty tracking (7 flags/node), cell-level buffer diff, minimal ANSI output. Blessed uses a screen damage buffer with region-level diffing; Silvery's cell-level tracking is more granular.
- **Modern terminal protocols** — Kitty keyboard (all 5 flags), SGR mouse, OSC 52 clipboard, Kitty graphics + Sixel, synchronized output (DEC 2026), extended underlines. Blessed was built for the 2013 terminal landscape.
- **45+ built-in components** — VirtualList, Table, TreeView, CommandPalette, Toast, Tabs, SplitView, TextArea, ModalDialog, and more.
- **Multi-backend test matrix** — [Termless](https://termless.dev) runs tests across 10+ real terminal parsers (xterm.js, vt100, Ghostty, Kitty, Alacritty, ...). Blessed has no built-in testing support.
- **Dynamic scrollback** — items graduate to terminal history automatically; inline/fullscreen hybrid modes blur the boundary. Blessed has neither.
- **Fast incremental rendering** — cell-level dirty tracking. See [benchmarks](/guide/silvery-vs-ink#performance-size) for details.
- **38 palettes, semantic tokens** — theme system with `$primary`, `$muted`, auto-detection. Blessed uses manual styling.

**Where Blessed is stronger:**

- **Familiar to systems programmers** — Blessed's curses-like API (`screen.key(...)`, `box.on('click', ...)`, `screen.render()`) maps directly to ncurses concepts. If you're coming from C/Python curses, Blessed feels natural.
- **Extensive widget set for its era** — form controls, a built-in terminal emulator widget, video player widget, IRC client widgets — specialized components that Silvery doesn't replicate.
- **Direct screen buffer manipulation** — Blessed exposes low-level screen buffer access for custom rendering. Silvery abstracts through a pipeline.
- **Still works in production** — despite being unmaintained, Blessed runs in thousands of deployed CLIs. The API is frozen, which means stability for apps that don't need new features.
- **Zero-config terminal compatibility** — Blessed's terminfo/termcap parser handles obscure terminals. Silvery targets modern terminals (Kitty, Ghostty, WezTerm, iTerm2, Windows Terminal).

**What's the same:** both are pure JavaScript/TypeScript with no native dependencies. Both abstract over raw terminal I/O. Both provide a widget/component tree model. Both handle padding, margin, and borders. Both work with Node.js.

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

## Feature Matrix

Blessed first, Silvery second. Features marked "core" are built into the framework.

### Layout

| Feature                   | Blessed                                                       | Silvery                                                                     |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Positioning model**     | Manual absolute/percentage (`top`, `left`, `width`, `height`) | CSS flexbox (Flexily engine)                                                |
| **Flex layout**           | Experimental Layout element (inline/grid); no flexbox         | `flexGrow`, `flexShrink`, `flexWrap`, `gap`, `alignItems`, `justifyContent` |
| **Responsive layout**     | Manual resize handling                                        | `useBoxRect()` — dimensions available _during_ render, first pass           |
| **Scrollable containers** | Built-in scroll on widgets (`.scrollTo()`, `.scroll()`)       | `overflow="scroll"` + `scrollTo` — framework-level, handles clipping        |
| **Sticky headers**        | Not supported                                                 | `position="sticky"` in scroll containers                                    |
| **Nested layouts**        | Careful coordinate math for each level                        | Nested flex containers — automatic                                          |

### Rendering

| Feature                    | Blessed                                                                                                            | Silvery                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| **Rendering model**        | Screen damage buffer with two buffers — only draws changes (CSR/BCE); `smartCSR`/`fastCSR` optimize scroll regions | 5-phase pipeline: measure → layout → content → output → flush                            |
| **Incremental rendering**  | Region-level via `smartCSR` / `fastCSR`                                                                            | Cell-level dirty tracking (7 flags/node), cell-level buffer diff                         |
| **Output efficiency**      | Region-level diff via damage buffer                                                                                | **10–20× less output** — cell-level diff + relative cursor addressing                    |
| **Inline mode**            | Not supported — always fullscreen                                                                                  | Cell-level incremental with native scrollback preserved                                  |
| **Dynamic scrollback**     | Not supported                                                                                                      | Items graduate to terminal history; Cmd+F works                                          |
| **Fullscreen-like inline** | Not supported                                                                                                      | Inline mode with fullscreen performance — cell-level incremental + scrollback graduation |
| **Synchronized output**    | Not supported                                                                                                      | DEC mode 2026 — flicker-free in tmux/Zellij                                              |

### Interaction

| Feature                   | Blessed                                                    | Silvery                                                                        |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Mouse**                 | SGR (?1006), URxvt (?1015), and X10 protocols              | SGR 1006 (large coordinates, precise tracking, drag, wheel)                    |
| **Event model**           | EventEmitter with bubbling (cancel via `return false`)     | DOM-style bubbling, `stopPropagation`, input layering                          |
| **Input isolation**       | Manual state checking in every handler                     | `InputLayerProvider` — modal dialogs consume input automatically               |
| **Focus system**          | Widget-level `.focus()`                                    | Tree-based: scopes, spatial nav (arrow keys), click-to-focus, `useFocusWithin` |
| **Text selection + find** | Not in core                                                | Mouse drag, `Ctrl+F` search, `Esc,v` keyboard selection                        |
| **Command system**        | Not in core                                                | Named commands, context-aware keys, `parseHotkey("⌘K")`                        |
| **Clipboard**             | Built-in `copyToClipboard()` via iTerm2 sequence (limited) | OSC 52 — works over SSH, no external tools                                     |

### Terminal Protocol Support

Blessed was state-of-the-art for 2013. The terminal landscape has changed substantially since then.

| Feature                 | Blessed                    | Silvery                                                                                |
| ----------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| **Color**               | 16/256 (truecolor partial) | 16/256/truecolor with automatic downsampling                                           |
| **Keyboard**            | Traditional input parsing  | Kitty keyboard protocol (all 5 flags: disambiguate, events, alternate, all keys, text) |
| **Underline styles**    | Single only                | ISO 8613-6 (single, double, curly, dotted, dashed + color)                             |
| **Hyperlinks**          | Not supported              | OSC 8 clickable URLs                                                                   |
| **Images**              | Not supported              | Kitty graphics + Sixel with auto-detect and text fallback                              |
| **Bracketed paste**     | Not supported              | `usePaste` hook with automatic mode toggling                                           |
| **Focus events**        | Supported (focus/blur)     | DEC mode 1004 (focus in/out reporting)                                                 |
| **Window title**        | Via `screen.title`         | OSC 0/2                                                                                |
| **Terminal detection**  | terminfo/termcap parsing   | DA1/DA2/DA3, XTVERSION + terminfo queries                                              |
| **Cursor styles**       | Limited                    | Full DECSCUSR (block, underline, bar, blinking)                                        |
| **Synchronized output** | Not supported              | DEC mode 2026 (flicker-free in tmux/Zellij)                                            |

Modern terminals (Kitty, Ghostty, WezTerm, iTerm2, Windows Terminal) support protocols that didn't exist when Blessed was written. Applications built with Blessed cannot take advantage of these without significant patching.

For compatibility data across terminals, see [terminfo.dev](https://terminfo.dev).

### Components & Framework

| Feature                         | Blessed                                                  | Silvery                                                                                        |
| ------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Built-in widgets/components** | ~40 widgets (list, table, form, textbox, terminal, etc.) | **45+** components (VirtualList, Table, CommandPalette, TreeView, Toast, Tabs, SplitView, ...) |
| **Specialized widgets**         | Terminal emulator, video player, IRC widgets             | None — focused on general-purpose UI components                                                |
| **Theme system**                | Manual styling                                           | 38 palettes, semantic tokens (`$primary`, `$muted`), auto-detect                               |
| **Plugin composition**          | Not in core                                              | `withCommands` / `withKeybindings` / `withDomEvents` / `withFocus`                             |
| **TEA state machines**          | Not in core                                              | `@silvery/create`: `(action, state) → [state, effects]`, replay, undo                          |
| **Animation**                   | Not built-in                                             | `useAnimation` + easing functions + `useAnimatedTransition`                                    |
| **Resource cleanup**            | Manual                                                   | `using` / Disposable — automatic teardown                                                      |

### Unicode & Emoji

| Feature                  | Blessed                                                           | Silvery                                                                   |
| ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **CJK characters**       | `fullUnicode` mode for double-width chars and surrogate pairs     | Full support (East Asian Width, proper display width)                     |
| **Emoji**                | Partial — `fullUnicode` handles basics; ZWJ sequences still break | Full support (ZWJ sequences, modifier sequences, grapheme splitting)      |
| **Combining characters** | `fullUnicode` mode handles combining chars                        | UAX #29 grapheme cluster splitting                                        |
| **ANSI-aware text ops**  | Basic                                                             | 28+ built-in functions (truncation, wrapping, slicing, width calculation) |

### Testing

| Feature                        | Blessed       | Silvery                                                                                                                                                                            |
| ------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Test library**               | Not built-in  | Built-in `@silvery/test` with Playwright-style locators, `press()`, buffer assertions                                                                                              |
| **Headless rendering**         | Not supported | `createTerm({ cols, rows })` — no terminal needed                                                                                                                                  |
| **Terminal emulator in tests** | Not supported | `createTermless()` via [Termless](https://termless.dev) — in-process terminal emulation with 10+ backends: xterm.js, vt100, libvterm, Ghostty, Kitty, Alacritty, WezTerm, and more |
| **Render invariant checks**    | Not supported | `SILVERY_STRICT=1` verifies incremental = fresh on every frame                                                                                                                     |
| **Visual snapshots**           | Not supported | `bufferToHTML()`, Playwright capture, and Termless `.tape` recordings → animated GIF, PNG, SVG with 77 themes                                                                      |

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

Events bubble from child to parent; propagation can be cancelled by returning `false`. There is no capturing phase or `stopPropagation`. Key handlers on the screen receive all input. Managing focus and input isolation requires manual state tracking.

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
- Incremental rendering (10–20× less output per update)
- Modern terminal protocols (Kitty keyboard, SGR mouse, images, clipboard)
- Full Unicode/emoji support
- Built-in testing with Termless (10+ terminal backends)
- 38 theme palettes with semantic tokens
- Active maintenance and development

## When to Choose What

Both tools serve different needs. The right choice depends on your situation.

### Keep Blessed when:

- **Legacy maintenance** -- an existing Blessed app is stable and only needs minor fixes
- **No resources to migrate** -- the migration effort is not justified for an app that is working and not actively developed
- **Specific Blessed widgets** -- you depend on Blessed-specific widgets (terminal emulator, video player, IRC client widgets) that have no Silvery equivalent
- **Obscure terminal support** -- you target terminals that only work with terminfo/termcap and don't support modern protocols

### Choose Silvery when:

- **New project** -- Blessed was excellent for its era; Silvery targets a newer terminal baseline with active maintenance
- **Active development** -- if you're building features, not just maintaining, the modern tooling pays for itself
- **Complex UIs** -- multi-pane layouts, scrollable containers, and responsive design are dramatically easier with flexbox
- **Modern terminals** -- if your users have Kitty, Ghostty, WezTerm, or iTerm2, Silvery can take advantage of their capabilities
- **Unicode content** -- international text, emoji, CJK characters work correctly out of the box
- **Testing** -- Termless provides test coverage across 10+ terminal backends that Blessed cannot match
- **TypeScript** -- type safety, editor support, and modern JavaScript patterns
- **Performance** -- fast incremental rendering with cell-level dirty tracking. See [benchmarks](/guide/silvery-vs-ink#performance-size) for details
