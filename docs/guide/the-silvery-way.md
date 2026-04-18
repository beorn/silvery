# The Silvery Way

_How to build the shiniest Silvery apps_

Silver tarnishes when you don't take care of it. So does your code. These are the principles that keep Silvery apps **shiny** (best practices) — and the anti-patterns that let them go **tarnished** (common pitfalls).

Each principle is something people get wrong. If you're coming from Ink, Blessed, or raw ANSI — we've all been there. These patterns are natural starting points, but Silvery gives you better tools. If you're already doing the shiny thing, skip ahead.

## Three foundations

The ten principles below all flow from three broader convictions:

1. **Take the best from the web.** Flexbox, scroll containers, DOM-style events, focus scopes, Playwright-style testing, design tokens — thirty years of web UI produced ideas worth keeping. If you'd reach for it on the web, reach for it in Silvery.

2. **Stay true to the terminal.** Cells, screens, buffers, ANSI, scrollback. The terminal is the medium, and Silvery embraces it. When a feature maps onto a terminal protocol — Kitty keyboard, OSC 52 clipboard, DEC mode 2026 — we expose it honestly, not as a polyfill.

3. **Raise the bar.** For developer ergonomics, architecture composability, and performance. The ten principles below are what this looks like in practice — each one exists because a shiny path is worth building and maintaining.

## 1. Use the Built-in Components

Silvery ships 45+ components — all available from `import { ... } from "silvery"`. They handle keyboard navigation, theming, mouse support, kill ring, word movement, scroll indicators, and dozens of edge cases you haven't thought of yet. When you reimplement them, you lose all of that.

::: tip ✨ Shiny

```tsx
<SelectList items={items} onSelect={handleSelect} />
<TextInput value={query} onChange={setQuery} />
<VirtualList items={data} renderItem={renderRow} interactive />
<ModalDialog title="Confirm" onClose={close}>Are you sure?</ModalDialog>
<Spinner label="Loading..." />
<ProgressBar value={0.7} />
<Tabs items={tabs} selected={activeTab} onSelect={setActiveTab} />
<CommandPalette commands={commands} />
```

All themed. All mouse-aware. All keyboard-navigable out of the box — saving you time and bugs.
:::

::: danger 🩶 Tarnished

```tsx
// Manual cursor tracking — loses j/k wrapping, mouse, scroll, selection theming
const [cursor, setCursor] = useState(0)
useInput((input) => {
  if (input === "j") setCursor((c) => Math.min(c + 1, items.length - 1))
  if (input === "k") setCursor((c) => Math.max(c - 1, 0))
})

// Manual text handling — no Ctrl+A/E/K/U/W, no Alt+B/F, no kill ring, no clipboard
useInput((input, key) => {
  if (key.backspace) setText((t) => t.slice(0, -1))
  else if (!key.ctrl) setText((t) => t + input)
})
```

You'll spend a week reimplementing what [`SelectList`](/guides/components#selectlist) and [`TextInput`](/guides/components#textinput) give you in one line.
:::

→ [Components guide](/guides/components) · [Components & hooks reference](/reference/components-hooks)

## 2. Think in Flexbox

Silvery uses CSS flexbox via [Flexily](/guide/layout-engine) — same mental model as web development. Let the layout engine compute positions and sizes. Components know their own size via `useBoxRect()` — synchronous, during render, no effects, no 0×0 flash.

::: tip ✨ Shiny

```tsx
// Fill remaining space
<Box flexGrow={1}><Text>I expand</Text></Box>

// Spacing with gap, not margins on every child
<Box flexDirection="column" gap={1}>
  <Header />
  <Content />
  <Footer />
</Box>

// Responsive layout — adapt to available space
function Panel() {
  const rect = useBoxRect()
  return rect.width < 40 ? <Compact /> : <Full />
}
```

`flexGrow` fills space. `padding`/`paddingX` for internal spacing. `gap` between children. `justifyContent="flex-end"` pins to bottom. `useBoxRect()` for responsive adaptation.
:::

::: danger 🩶 Tarnished

```tsx
// Manual arithmetic — breaks on resize, breaks with padding, breaks with borders
<Box width={terminalWidth - sidebarWidth - 2}>

// Fake padding with spaces
<Text>{"  "}Hello{"  "}</Text>

// Prop-drilling dimensions through 5 components
<Layout width={w}>
  <Sidebar width={Math.floor(w * 0.3)}>
    <Panel width={Math.floor(w * 0.3) - 2}>
```

If you're doing arithmetic with widths, you're fighting the layout engine instead of using it.
:::

→ [Layout engine](/guide/layout-engine) · [useBoxRect](/api/use-box-rect) · [Box](/api/box) · [Layout examples](/examples/layout)

## 3. Let the Framework Scroll

`overflow="scroll"` measures children, determines visibility, renders only what fits, and shows scroll indicators. It handles variable heights. All in one prop.

::: tip ✨ Shiny

```tsx
// Automatic scrolling — just tell it what to keep visible
<Box overflow="scroll" scrollTo={selectedIndex} height={20}>
  {items.map((item, i) => <Row key={i} item={item} />)}
</Box>

// Streaming content — chat, logs, agent output
<ScrollbackView>{messages}</ScrollbackView>

// Clip without scroll indicators
<Box overflow="hidden">
  <Text>{longContent}</Text>
</Box>
```

:::

::: danger 🩶 Tarnished

```tsx
// Manual slicing — wrong heights, no indicators, no variable-height items
const visible = items.slice(scrollOffset, scrollOffset + pageSize)
// ... 40 lines of offset tracking, boundary clamping, page-up/page-down ...
{
  scrollOffset > 0 && <Text color="gray">▲ {scrollOffset} more</Text>
}
```

Manual scroll offset tracking is the #1 source of off-by-one bugs in terminal apps. Let the framework handle it.
:::

→ [Scrolling guide](/guide/scrolling) · [Scroll regions reference](/reference/scroll-regions) · [Scrollback examples](/examples/scrollback)

## 4. Focus Control

[`silvery`](/reference/packages) provides tree-based focus with spatial navigation. Focus determines which component receives input. Without focus management, overlapping key handlers create chaos — a modal opens but the background still handles keys.

::: tip ✨ Shiny

```tsx
// Calling useFocus() registers this component in the focus tree
function SearchBox() {
  const { isFocused } = useFocus() // isFocused can be used for styling
  return <TextInput value={query} onChange={setQuery} />
}

// Input layer stack — modals automatically consume input
;<ModalDialog title="Delete?" onClose={close}>
  {/* No guards needed — background input is automatically blocked */}
  <Text>This cannot be undone.</Text>
</ModalDialog>

// Programmatic focus navigation
focusNext() // Tab-like cycling
focusPrev() // Shift-Tab
setFocus(id) // Jump to specific component
```

:::

::: danger 🩶 Tarnished

```tsx
// Guard clauses in every handler — easy to forget one
useInput((input) => {
  if (isDialogOpen) return  // Forgot this? Background responds to keys
  if (isSearching) return   // Another guard
  if (isPanelOpen) return   // And another
  // actual logic buried under guards
})

// Manual focus boolean threaded through props
<Sidebar isFocused={activePanel === "sidebar"} />
<Content isFocused={activePanel === "content"} />
```

If you're writing `if (isDialogOpen) return` in your input handlers, you don't have focus management — you have guard clauses pretending to be focus management.
:::

→ [Focus hooks](/api/use-focus) · [Input features](/reference/input-features)

## 5. Command System <Badge type="info" text="@silvery/create" />

Named, serializable, introspectable actions. Commands make your app automatable (AI agents invoke commands by name), testable (fire commands in tests), and discoverable ([`CommandPalette`](/guides/components#shadcn-style-components) lists them all).

> Part of [`@silvery/create`](https://www.npmjs.com/package/@silvery/create) — the optional app architecture layer. `@silvery/create` is under active development; the command system API is evolving.

::: tip ✨ Shiny

```tsx
// Declare commands with metadata
const app = withCommands({
  "file.save": { label: "Save File", handler: save },
  "file.open": { label: "Open File", handler: open },
  "view.toggle-sidebar": { label: "Toggle Sidebar", handler: toggleSidebar },
})

// Keybindings reference command names
withKeybindings({
  "ctrl+s": "file.save",
  "ctrl+o": "file.open",
  "ctrl+b": "view.toggle-sidebar",
})

// AI agent can invoke by name
agent.executeCommand("file.save")

// All commands discoverable via palette
<CommandPalette commands={commands} />
```

:::

::: danger 🩶 Tarnished

```tsx
// Anonymous handlers — can't list, can't replay, can't automate
useInput((input, key) => {
  if (key.ctrl && input === "s") save()
  if (key.ctrl && input === "o") open()
  if (key.ctrl && input === "b") toggleSidebar()
})
// AI agent forced to simulate keypresses
// No way to list available actions
// No command palette possible
```

Keybindings are a UI detail. Commands are the API. Build on commands; bind keys to them.
:::

→ [Event handling](/guide/event-handling)

## 6. Style using Design Tokens

Components express semantic intent — color, hierarchy, state — via **tokens and presets**. The token system decides the concrete rendering details: which hex value, which SGR attributes, which tier-appropriate fallback. Components never reach for raw rendering primitives (hex colors, ANSI escapes, or SGR modifiers like `dim` / `bold` / `italic` / `underline`).

[`silvery/theme`](/reference/packages) auto-detects your terminal's palette via OSC queries — no configuration needed. ~33 semantic tokens and typography presets adapt to every terminal theme. 38 built-in palettes (Catppuccin, Nord, Dracula, Tokyo Night, Solarized, …) work automatically.

### Why not SGR in components

Terminal SGR codes (`bold`, `dim`, `italic`, `underline`, `inverse`, `strikethrough`) have **uneven support** across emulators — `dim` does alpha-blending on some, intensity-reduction on others, nothing on older terminals. `bold` sometimes brightens color, sometimes only affects font weight. Writing these in components guarantees inconsistent results.

Tokens avoid this. At truecolor, `$faint` resolves to a specific pre-dimmed hex — deterministic on any terminal. At ANSI 16 where we can't express intermediate intensities, the renderer emits SGR 2 as a necessary concession. Components never make that choice; derivation does.

::: tip ✨ Shiny

```tsx
// Semantic tokens — adapt to any theme automatically
<Text color="$primary">Selected item</Text>
<Text color="$success">✓ Saved</Text>
<Text color="$error">✗ Failed</Text>
<Text color="$muted">Last modified 2h ago</Text>
<Box borderColor="$border" borderStyle="round" />

// Typography presets — semantic intent, not manual attrs
<H1>Page title</H1>         // $primary + bold (composed by preset)
<Strong>urgent</Strong>      // bold
<Em>aside</Em>               // italic
<Small>fine print</Small>    // $faint (pre-dimmed hex at truecolor)
<Link>clickable</Link>       // $link + underline (composed by preset)

// Status indicators: shape + color (colorblind-safe)
<Text color="$success">✓</Text>   // done
<Text color="$muted">○</Text>     // pending
<Text color="$error">✗</Text>     // failed
```

:::

::: danger 🩶 Tarnished

```tsx
// Hardcoded colors — wrong in light themes, wrong in high-contrast
<Text color="#ff0000">Error</Text>
<Text color="red">Error</Text>

// ANSI escapes in strings — bypasses the theme entirely
console.log("\x1b[31;1mError\x1b[0m")

// Raw SGR attrs in component code — unreliable across terminals
<Text dimColor>Last modified 2h ago</Text>           // → use $muted or <Small>
<Text bold underline>Warning</Text>                   // → use <H2> or semantic token
<Text italic>aside</Text>                             // → use <Em>

// Manual composition of tokens with attrs — double trouble
<Text color="$muted" dimColor>Fine print</Text>       // → use <Small>

// Color-only status (colorblind users can't distinguish)
<Text color="green">●</Text>  // done? pending? who knows without color
```

Hardcoded colors marry one theme. Raw SGR marries whatever that specific terminal does with SGR 2 and SGR 1. **Semantic tokens and typography presets marry them all.**
:::

→ [Styling guide](/guide/styling) · [Theming reference](/reference/theming) · [Themes gallery](/themes)

## 7. Compose with Factory Functions

Classes encourage hidden state and rigid hierarchies. Factory functions return plain objects with explicit deps — composable, testable, swappable.

::: tip ✨ Shiny

```tsx
// render() takes explicit deps — term is optional, options are plain objects
const app = render(<App />, term, { incremental: true })

// createRenderer() for tests — explicit config, no global state
const render = createRenderer({ cols: 80, rows: 24 })
const app = render(<MyComponent />)
expect(app.text).toContain("Hello")
```

With `@silvery/create`, this extends to app-level composition via `pipe()`:

```tsx
// Each function adds a capability — explicit, composable, no inheritance
const app = pipe(createApp(), withFocus(), withDomEvents(), withCommands(opts))
```

:::

::: danger 🩶 Tarnished

```tsx
// Class hierarchy — rigid, hard to test, hard to compose
class MyApp extends BaseApp {
  constructor() {
    super() // What does this do? Who knows
    this.state = {} // Hidden mutable state
  }
}

// Global singletons — untestable, can't run two instances
const app = GlobalApp.getInstance()
```

Composition scales. Inheritance doesn't.
:::

→ [Plugins](/reference/plugins)

## 8. Compose and Clean Up with `using`

Silvery uses factory functions that return disposable objects. `using` (TC39 Explicit Resource Management) ties their lifetime to scope — no leaked terminals, no orphaned processes, no hung event loops. Composition and cleanup are the same pattern: build up resources, and `using` tears them down in reverse order.

::: tip ✨ Shiny

```tsx
// Compose resources — each one is automatically cleaned up on any exit
using term = createTerm()
using app = render(<App />, term)
using console = patchConsole(term) // redirect console.log through term
await app.run()
// On exit (success, error, Ctrl+C):
// 1. console restored  2. app unmounted  3. terminal restored
// Reverse order, guaranteed, every path
```

:::

::: danger 🩶 Tarnished

```tsx
// Manual cleanup — forgotten in error paths, Ctrl+C leaves terminal broken
const term = createTerm()
const console = patchConsole(term)
try {
  const app = render(<App />, term)
  await app.run()
} finally {
  console.dispose() // Did you remember both?
  term.dispose() // In the right order?
}
```

`using` is one keyword per resource. Manual cleanup is a bug waiting to happen.
:::

Silvery objects that support `using`:

| Object                                      | What it cleans up                                |
| ------------------------------------------- | ------------------------------------------------ |
| `createTerm()`                              | Restores terminal mode, cursor, alternate screen |
| `render()` / `app.run()`                    | Unmounts React tree, stops event loop            |
| `createScope()`                             | Cancels child tasks, clears timers               |
| `createEditContext()`                       | Releases input layer bindings                    |
| `patchConsole()`                            | Restores original console methods                |
| `Spinner` / `ProgressBar` / `MultiProgress` | Stops animation, clears interval                 |
| `createScreenshot()`                        | Closes screenshot file handle                    |

The pattern extends to your own code — any factory that returns `{ [Symbol.dispose]() { ... } }` works with `using`. Silvery's plugin composition (`pipe()`, `withScope()`) uses the same mechanism internally.

→ [render()](/api/render) · [Lifecycle](/reference/lifecycle)

## 9. Gradually Sip TEA

Simple apps work great with `useState` and `useInput`. But as complexity grows — undo/redo, customizable keybindings, command palettes, collaborative editing, AI-driven automation — you need structured state management. Silvery makes this graduation seamless.

The idea: [The Elm Architecture](https://guide.elm-lang.org/architecture/) models every interaction as `(action, state) → [state, effects]`. Actions are data (serializable, replayable, undoable). Effects are data (testable, interceptable). You adopt it gradually — no big rewrite, just replace one `setState` at a time.

::: tip ✨ Shiny — sip at your own pace

```tsx
// Level 1: useState + useInput — just React, nothing extra
const [count, setCount] = useState(0)
useInput((input) => {
  if (input === "j") setCount((c) => c + 1)
})

// Level 2: useReducer — actions as data, one step toward TEA
const [state, dispatch] = useReducer(reducer, initialState)
// Now you can log actions, replay them, test the reducer in isolation

// Level 3: Zustand / external store — shared state across components
// Level 4: @silvery/create — commands, keybindings, effects-as-data (coming soon)
```

Each level works independently. Some apps never need more than `useState`. Others need undo from day one — start at Level 2. The framework doesn't force a choice; it makes graduation painless.
:::

**When to graduate:**

- **Need undo/redo?** → actions as data (Level 2+)
- **Need customizable keybindings?** → named commands (Level 4)
- **Need a command palette?** → discoverable command registry (Level 4)
- **Need replay/recording?** → serializable actions + effects (Level 4)
- **Need AI automation?** → commands as a tool surface (Level 4)

::: warning Coming Soon
`@silvery/create` (Level 4 — commands, keybindings, composable plugins) is under active development. Levels 1-3 work today with any React state library.
:::

## 10. Test Against What the User Sees

[`@silvery/test`](/reference/packages) gives you headless rendering with Playwright-style locators. State assertions pass while the screen is garbled — `selectedIndex === 2` doesn't catch the selection rendering on the wrong row, or the border overlapping content, or the scroll indicator showing the wrong count. Test what the user actually sees.

For full ANSI verification (colors, cursor positioning, scrollback), use [Termless](https://termless.dev) — headless terminal testing, like Playwright for terminals. It runs a real terminal emulator in-process so you can assert on exactly what would appear on screen, including escape sequences and wide characters. See [terminfo.dev](https://terminfo.dev) for how different terminals handle the same sequences — useful when your app needs to work across Ghostty, iTerm2, Windows Terminal, and more.

::: tip ✨ Shiny

```tsx
// Headless rendering with Playwright-style locators
const app = createRenderer(<MyList items={items} />)

app.press("j")
app.press("j")
expect(app.text).toContain("▶ Third item") // What the user sees

// Full buffer assertions — catches rendering bugs
expect(app.getByText("Third item")).toHaveStyle({ inverse: true })

// Resize the virtual terminal — test responsive layouts
app.resize(40, 10) // narrow terminal
expect(app.text).not.toContain("Sidebar") // collapsed at small widths
app.resize(120, 40) // wide terminal
expect(app.text).toContain("Sidebar") // visible again

// Inspect the scrollback buffer — chat apps, logs, streaming output
// Content that scrolled off-screen is still in the buffer
expect(app.scrollback).toContain("Message from 10 minutes ago")
```

Things you can't easily test any other way: terminal resize behavior, scrollback buffer contents, incremental rendering correctness.
:::

::: danger 🩶 Tarnished

```tsx
// State-only test — passes even if rendering is broken
expect(store.getState().selectedIndex).toBe(2)
// Screen could show index 0 selected. Test still passes.

// Snapshot of ANSI strings — brittle, unreadable diffs
expect(output).toMatchInlineSnapshot(`"\u001b[1m\u001b[34m..."`)

// Manual resize testing — drag the terminal corner, squint at the output
// "Looks fine to me" — until it doesn't, and you can't reproduce the bug

// Manual scrollback checking — scroll up, visually scan for the right line
// Hope you remember what it's supposed to look like
```

Manual visual testing is slow, unrepeatable, and doesn't catch regressions. If you're resizing your terminal by hand to check layouts, that's a test you should automate.
:::

→ [Testing guide](/guide/testing) · [Testing examples](/examples/testing) · [Termless](https://termless.dev) · [terminfo.dev](https://terminfo.dev)

## The Silvery Way, at a Glance

1. **Use the built-in components** — don't reimplement what silvery already ships
2. **Think in flexbox** — let the layout engine do the math
3. **Let the framework scroll** — `overflow="scroll"`, not manual slicing
4. **Control focus** — use the focus tree, not guard clauses
5. **Use the command system** — named actions, not anonymous handlers
6. **Use semantic theme colors** — `$tokens`, not hardcoded values
7. **Compose with factory functions** — `pipe()`, not class hierarchies
8. **Compose and clean up with `using`** — factory functions + scope-bound lifetime
9. **Gradually sip TEA** — hooks → reducer → store → @silvery/create, at your own pace
10. **Test what the user sees** — render the buffer, not just the state

Keep it shiny. ✨
