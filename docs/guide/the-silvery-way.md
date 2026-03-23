# The Silvery Way

_How to build the shiniest Silvery apps_

Silver tarnishes when you don't take care of it. So does your code. These are the principles that keep Silvery apps **shiny** (best practices) — and the anti-patterns that let them go **tarnished** (common pitfalls).

Each principle is something people get wrong. If you're coming from Ink, Blessed, or raw ANSI — we've all been there. These patterns are natural starting points, but Silvery gives you better tools. If you're already doing the shiny thing, skip ahead.

## 1. Use the Built-in Components

[`silvery/ui`](/reference/packages) ships 30+ components. They handle keyboard navigation, theming, mouse support, kill ring, word movement, scroll indicators, and dozens of edge cases you haven't thought of yet. When you reimplement them, you lose all of that.

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

Silvery uses CSS flexbox via [Flexily](/guide/layout-engine) — same mental model as web development. Let the layout engine compute positions and sizes. Components know their own size via `useContentRect()` — synchronous, during render, no effects, no 0×0 flash.

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
  const rect = useContentRect()
  return rect.width < 40 ? <Compact /> : <Full />
}
```

`flexGrow` fills space. `padding`/`paddingX` for internal spacing. `gap` between children. `justifyContent="flex-end"` pins to bottom. `useContentRect()` for responsive adaptation.
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

→ [Layout engine](/guide/layout-engine) · [useContentRect](/api/use-content-rect) · [Box](/api/box) · [Layout examples](/examples/layout)

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

## 5. Command System

Named, serializable, introspectable actions. Commands make your app automatable (AI agents invoke commands by name), testable (fire commands in tests), and discoverable ([`CommandPalette`](/guides/components#shadcn-style-components) lists them all).

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

## 6. Semantic Theme Colors

[`silvery/theme`](/reference/packages) auto-detects your terminal's palette via OSC queries — no configuration needed. Use semantic tokens and your app looks right in every terminal theme. 38 built-in palettes (Catppuccin, Nord, Dracula, Tokyo Night, Solarized, and more) work automatically.

::: tip ✨ Shiny

```tsx
// Semantic tokens — adapt to any theme automatically
<Text color="$primary">Selected item</Text>
<Text color="$success">✓ Saved</Text>
<Text color="$error">✗ Failed</Text>
<Text color="$muted">Last modified 2h ago</Text>
<Box borderColor="$border" borderStyle="round" />

// 33 tokens: $primary, $secondary, $success, $warning, $error,
// $info, $muted, $border, $surface, $text, and more

// Status indicators: shape + color (colorblind-safe)
<Text color="$success">✓</Text>   // done
<Text color="$muted">○</Text>     // pending
<Text color="$error">✗</Text>     // failed
```

:::

::: danger 🩶 Tarnished

```tsx
// Hardcoded colors — wrong in light themes, wrong in high-contrast, wrong in everything
<Text color="#ff0000">Error</Text>
<Text color="red">Error</Text>

// ANSI escapes in strings — bypasses the theme entirely
console.log("\x1b[31mError\x1b[0m")

// Color-only status (colorblind users can't distinguish)
<Text color="green">●</Text>  // done? pending? who knows without color
```

If you hardcode a color, you've married one theme. Semantic tokens marry them all.
:::

→ [Styling guide](/guide/styling) · [Theming reference](/reference/theming) · [Themes gallery](/themes)

## 7. Compose with Factory Functions

Classes encourage hidden state and rigid hierarchies. Factory functions return plain objects with explicit deps — composable, testable, swappable. Silvery's plugin system is built on this: `pipe()` chains plugins together, each adding a capability.

::: tip ✨ Shiny

```tsx
// Composable plugins via pipe() — no inheritance hierarchy
const app = pipe(baseApp, withFocus(), withDomEvents(), withCommands(opts))

// Explicit dependencies — no hidden globals
function createEditor({ storage, parser }) {
  return { open, save, close }
}

// Easy to test — just pass mock deps
const editor = createEditor({ storage: mockStorage, parser: mockParser })
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

## 8. Clean Up with `using`

`using` (TC39 Explicit Resource Management) ensures cleanup on every exit path — no leaked terminals, no orphaned processes, no hung event loops. One keyword replaces an entire class of bugs.

::: tip ✨ Shiny

```tsx
// Automatic cleanup — terminal restored on any exit (success, error, Ctrl+C)
using term = createTerm()
await render(<App />, term)
// term is disposed when it goes out of scope — always
```

:::

::: danger 🩶 Tarnished

```tsx
// Manual cleanup — forgotten in error paths, Ctrl+C leaves terminal broken
const term = createTerm()
try {
  await render(<App />, term)
} finally {
  term.dispose() // Forgot this path? Terminal stays in raw mode
}
```

`using` is one keyword. Manual cleanup is a bug waiting to happen.
:::

→ [render()](/api/render) · [Lifecycle](/reference/lifecycle)

## 9. Start Simple, Scale Architecture

`useState` and `useReducer` are the right starting point. They work great for most terminal apps. Don't add architecture until the complexity demands it.

::: tip ✨ Shiny — escalation ladder

```tsx
// Level 1: local hooks — perfect for simple apps
function Counter() {
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === "j") setCount((c) => c + 1)
  })
  return <Text>Count: {count}</Text>
}

// Level 2: useReducer/context — when state gets shared
const reducer = (state, action) => {
  switch (action.type) {
    case "increment":
      return { ...state, count: state.count + 1 }
    case "decrement":
      return { ...state, count: state.count - 1 }
  }
}

// Level 3: external store (zustand, jotai, etc.) — when you need subscriptions
// Level 4: @silvery/tea — when you need commands, keybindings, effects-as-data
```

Each level is independently useful. Move to the next only when you feel the pain the current level can't solve. Most apps live at level 1 or 2.
:::

::: danger 🩶 Tarnished — architecture astronautics

```tsx
// Don't reach for createApp + store + dispatch for a counter.
// That's a 50-line app wearing a 500-line suit.
```

Architecture is a response to complexity, not a starting point. If `useState` solves your problem, that's the shiny way.
:::

→ [Application Architecture](/guides/state-management) — when and how to graduate from hooks to structured state management

## 10. Test Against What the User Sees

[`@silvery/test`](/reference/packages) (optional package) gives you headless rendering with Playwright-style locators. State assertions pass while the screen is garbled — `selectedIndex === 2` doesn't catch the selection rendering on the wrong row, or the border overlapping content, or the scroll indicator showing the wrong count. Test what the user actually sees.

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

→ [Testing guide](/guide/testing) · [Testing examples](/examples/testing)

## The Silvery Way, at a Glance

1. **Use the built-in components** — don't reimplement what [`silvery/ui`](/reference/packages) already handles
2. **Think in flexbox** — let the layout engine do the math
3. **Let the framework scroll** — `overflow="scroll"`, not manual slicing
4. **Control focus** — use the focus tree, not guard clauses
5. **Use the command system** — named actions, not anonymous handlers
6. **Use semantic theme colors** — `$tokens`, not hardcoded values
7. **Compose with factory functions** — `pipe()`, not class hierarchies
8. **Clean up with `using`** — one keyword, zero leaks
9. **Start simple, scale architecture** — useState → useReducer → external store → @silvery/tea, one step at a time
10. **Test what the user sees** — render the buffer, not just the state

Keep it shiny. ✨
