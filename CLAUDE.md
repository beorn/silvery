# inkx - Terminal UI React Framework

React-based terminal UI framework with layout feedback. Ink-compatible API with components that know their size.

## Quick Start

```tsx
import { run, useInput } from "inkx/runtime"
import { Box, Text } from "inkx"

function App() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "j" || key.downArrow) setCount((c) => c + 1)
    if (input === "k" || key.upArrow) setCount((c) => c - 1)
    if (input === "q") return "exit"
  })

  return <Text>Count: {count}</Text>
}

await run(<App />)
```

## Architecture

inkx's core innovation is **two-phase rendering with synchronous layout feedback** - components know their size during render, not after.

- [docs/architecture.md](docs/architecture.md) - Layer diagram, RenderAdapter interface
- [docs/getting-started.md](docs/getting-started.md) - Runtime layers and patterns
- [docs/internals.md](docs/internals.md) - Reconciler implementation

## Runtime Layers

| Layer | Entry Point       | Best For                   | State Management     |
| ----- | ----------------- | -------------------------- | -------------------- |
| 1     | `createRuntime()` | Maximum control, Elm-style | Your choice          |
| 2     | `run()`           | React hooks (recommended)  | `useState/useEffect` |
| 3     | `createApp()`     | Complex apps               | Zustand store        |

### Layer 2: run() (Recommended)

```tsx
import { run, useInput, type Key } from "inkx/runtime"
import { Text } from "inkx"

function Counter() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (input === "j") setCount((c) => c + 1)
    if (input === "q") return "exit"
  })

  return <Text>Count: {count}</Text>
}

await run(<Counter />)
```

### Layer 3: createApp() with Zustand

```tsx
import { createApp, useApp, type Key } from "inkx/runtime"

const app = createApp(
  () => (set, get) => ({
    cursor: 0,
    moveCursor: (d) => set((s) => ({ cursor: s.cursor + d })),
  }),
  {
    key: (input, key, { get }) => {
      if (input === "j" || key.downArrow) get().moveCursor(1)
      if (input === "q") return "exit"
    },
  },
)

function App() {
  const cursor = useApp((s) => s.cursor)
  return <Text>Cursor: {cursor}</Text>
}

await app.run(<App />)
```

## Components

See [docs/components.md](docs/components.md) for full reference. Key components: Box, Text, VirtualList, Static, Console, TextInput, ReadlineInput, TextArea, Link.

## Layout Hooks

```tsx
const { width, height } = useContentRect() // Content area dimensions
const { x, y } = useScreenRect() // Absolute screen position
```

See [docs/hooks.md](docs/hooks.md) for all hooks.

## Input Layer Stack

Solves the race condition with async useEffect registration where multiple components register input handlers in unpredictable order. Without this, dialogs and inputs that mount asynchronously may not receive keystrokes.

**How it works:** DOM-style event bubbling with LIFO (last-in-first-out) stack. The most recently registered layer gets first chance to handle input. If it returns `true`, the event is consumed. If `false`, it bubbles to the next layer.

**API:**

| Export               | Description                                   |
| -------------------- | --------------------------------------------- |
| `InputLayerProvider` | Wrap app to enable input layer stack          |
| `useInputLayer`      | `(id: string, handler: InputHandler) => void` |

Handler signature: `(input: string, key: Key) => boolean` - return `true` to consume, `false` to bubble. The `Key` object includes `super` and `hyper` booleans (Kitty protocol) and an optional `eventType` (1=press, 2=repeat, 3=release).

**Example: Dialog with text input**

```tsx
function SearchDialog() {
  useInputLayer("search-input", (input, key) => {
    if (key.escape) {
      close()
      return true
    }
    if (key.return) {
      submit()
      return true
    }
    if (key.backspace) {
      deleteChar()
      return true
    }
    if (input >= " ") {
      appendChar(input)
      return true
    }
    return false // Let navigation keys bubble to parent
  })

  return (
    <Box borderStyle="single">
      <Text>Search: {query}</Text>
    </Box>
  )
}
```

Layers are identified by `id` for debugging. When a dialog mounts, its layer goes on top of the stack and receives all input first until it unmounts.

### Architecture Note

`useInputLayer` is a low-level primitive for raw key capture with consumption semantics. For command-driven apps, the **prescribed pattern** is [focus-based input routing](docs/focus-routing.md):

- **Don't** use `useInputLayer` in individual components for discrete commands (navigation, toggles, mode switches)
- **Do** use the command system with mode/context for all discrete key-to-action mapping
- **Do** use `useInputLayer` only for: (1) the single base layer that bridges raw keys to the command system, and (2) dialog navigation (Enter, Escape, arrows)

See [docs/focus-routing.md](docs/focus-routing.md) for the full pattern: context keys, when predicates, TextEditTarget, and text input as fallback.

The hook silently no-ops without `InputLayerProvider` — ensure test harnesses wrap with it.

## Testing

```tsx
import { createRenderer } from "inkx/testing"

const render = createRenderer({ cols: 80, rows: 24 }) // or { kittyMode: true } for Super/Hyper

test("renders and handles input", async () => {
  const app = render(<MyComponent />)

  expect(app.text).toContain("Hello")
  await app.press("j")
  expect(app.text).toContain("Selected: 1")

  // Auto-refreshing locators
  const cursor = app.locator("[data-cursor]")
  expect(cursor.textContent()).toBe("item1")
  await app.press("j")
  expect(cursor.textContent()).toBe("item2") // Same locator, fresh result
})
```

**Testing API:**

| Method                         | Returns        | Description                          |
| ------------------------------ | -------------- | ------------------------------------ |
| `app.text`                     | `string`       | Plain text output (no ANSI)          |
| `app.ansi`                     | `string`       | Output with ANSI codes               |
| `app.press(key)`               | `Promise`      | Send keyboard input                  |
| `app.click(x, y, opts?)`       | `Promise`      | Simulate mouse click at coordinates  |
| `app.doubleClick(x, y, opts?)` | `Promise`      | Simulate double-click at coordinates |
| `app.wheel(x, y, delta)`       | `Promise`      | Simulate wheel scroll at coordinates |
| `app.getByTestId(id)`          | `Locator`      | Find by testID prop                  |
| `app.getByText(text)`          | `Locator`      | Find by text content                 |
| `app.locator(sel)`             | `Locator`      | CSS-style attribute selector         |
| `locator.textContent()`        | `string`       | Get element text                     |
| `locator.boundingBox()`        | `Rect \| null` | Get position and size                |
| `locator.count()`              | `number`       | Count matches                        |

## Kitty Keyboard Protocol

inkx supports the [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) for unambiguous key identification. This enables modifiers that legacy ANSI cannot represent (Cmd ⌘, Hyper ✦) and event type reporting (press/repeat/release).

**Protocol control** (exported from `inkx`):

| Function                      | Description                                       |
| ----------------------------- | ------------------------------------------------- |
| `enableKittyKeyboard(flags?)` | Send `CSI > flags u`. Default: `DISAMBIGUATE` (1) |
| `disableKittyKeyboard()`      | Send `CSI < u` to pop mode stack                  |
| `queryKittyKeyboard()`        | Send `CSI ? u` to detect support                  |

**Flags** (`KittyFlags`): `DISAMBIGUATE` (1), `REPORT_EVENTS` (2), `REPORT_ALTERNATE` (4), `REPORT_ALL_KEYS` (8), `REPORT_TEXT` (16).

**Key fields** (on `Key`, `ParsedKeypress`, `ParsedHotkey`):

| Field            | Type          | Description                                                        |
| ---------------- | ------------- | ------------------------------------------------------------------ |
| `super`          | `boolean`     | Cmd ⌘ / Super modifier (Kitty bit 3)                               |
| `hyper`          | `boolean`     | Hyper ✦ modifier (Kitty bit 4)                                     |
| `eventType`      | `1 \| 2 \| 3` | Press (1), repeat (2), release (3). Requires `REPORT_EVENTS` flag. |
| `shiftedKey`     | `string`      | Character produced when Shift is held (Kitty shifted codepoint)    |
| `baseLayoutKey`  | `string`      | Key on standard US layout (for non-Latin keyboards)                |
| `capsLock`       | `boolean`     | CapsLock is active (Kitty modifier bit 6)                          |
| `numLock`        | `boolean`     | NumLock is active (Kitty modifier bit 7)                           |
| `associatedText` | `string`      | Decoded text from Kitty `REPORT_TEXT` mode                         |

**Protocol detection** (exported from `inkx`):

| Function                                        | Description                           |
| ----------------------------------------------- | ------------------------------------- |
| `detectKittySupport(write, read, timeout?)`     | Low-level: send query, parse response |
| `detectKittyFromStdio(stdout, stdin, timeout?)` | Convenience: detect using real stdio  |

**Auto-enable**: Pass `kitty: true` to `run()` — inkx sends the query, enables the protocol if supported, and disables on cleanup.

```tsx
await run(<App />, { kitty: true }) // Auto-detect and enable
await run(<App />, { kitty: KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS }) // Specific flags
```

**Testing**: Use `keyToKittyAnsi(key)` (from `inkx/testing`) to generate Kitty ANSI sequences, and `kittyMode: true` on `createRenderer` / `createApp` to route `press()` through Kitty encoding.

```tsx
import { keyToKittyAnsi } from "inkx/testing"

keyToKittyAnsi("Super+j") // '\x1b[106;9u'
keyToKittyAnsi("Hyper+Control+x") // '\x1b[120;21u'
```

## macOS Modifier Symbols

Hotkey strings accept macOS symbols as modifier prefixes — no `+` separator needed:

| Symbol | Modifier    | Key field   |
| ------ | ----------- | ----------- |
| ⌘      | Cmd (Super) | `key.super` |
| ⌥      | Opt (Alt)   | `key.meta`  |
| ⌃      | Ctrl        | `key.ctrl`  |
| ⇧      | Shift       | `key.shift` |
| ✦      | Hyper       | `key.hyper` |

```tsx
import { parseHotkey, matchHotkey } from "inkx"

parseHotkey("⌘j") // { key: 'j', super: true, ... }
parseHotkey("⌃⇧a") // { key: 'a', ctrl: true, shift: true, ... }
parseHotkey("✦⌘x") // { key: 'x', hyper: true, super: true, ... }
parseHotkey("ctrl+j") // Same as ⌃j — lowercase aliases also work
```

All modifier aliases: `ctrl`/`control`/`⌃`, `shift`/`⇧`, `alt`/`opt`/`option`/`⌥`, `cmd`/`command`/`super`/`⌘`, `hyper`/`✦`.

## Mouse Events (SGR Protocol)

inkx supports SGR mouse tracking (mode 1006) for click, drag, and scroll events.

**Parsing** (exported from `inkx`):

| Function                    | Description                                      |
| --------------------------- | ------------------------------------------------ |
| `parseMouseSequence(input)` | Parse SGR mouse sequence → `ParsedMouse \| null` |
| `isMouseSequence(input)`    | Check if a raw input string is a mouse sequence  |

**ParsedMouse** fields:

| Field    | Type      | Description                              |
| -------- | --------- | ---------------------------------------- |
| `button` | `number`  | 0=left, 1=middle, 2=right                |
| `x`      | `number`  | Column (0-indexed)                       |
| `y`      | `number`  | Row (0-indexed)                          |
| `action` | `string`  | `"down"`, `"up"`, `"move"`, or `"wheel"` |
| `delta`  | `number`  | Wheel: -1=up, +1=down                    |
| `shift`  | `boolean` | ⇧ Shift was held                         |
| `meta`   | `boolean` | ⌥ Alt/Meta was held                      |
| `ctrl`   | `boolean` | ⌃ Ctrl was held                          |

**Runtime**: Pass `mouse: true` to `run()` — inkx enables SGR tracking and dispatches mouse events.

```tsx
await run(<App />, { mouse: true })
```

### DOM-Level Mouse Events

Components can receive mouse events via React DOM-compatible props:

```tsx
<Box onClick={(e) => selectCard()} onDoubleClick={(e) => editCard()} onWheel={(e) => scroll(e.deltaY)}>
  <Text
    onClick={(e) => {
      e.stopPropagation()
      handleTextClick()
    }}
  >
    Click me
  </Text>
</Box>
```

**Event handler props** (on `BoxProps` and `TextProps`):

| Prop            | Event Type       | Bubbles |
| --------------- | ---------------- | ------- |
| `onClick`       | `InkxMouseEvent` | Yes     |
| `onDoubleClick` | `InkxMouseEvent` | Yes     |
| `onMouseDown`   | `InkxMouseEvent` | Yes     |
| `onMouseUp`     | `InkxMouseEvent` | Yes     |
| `onMouseMove`   | `InkxMouseEvent` | Yes     |
| `onMouseEnter`  | `InkxMouseEvent` | No      |
| `onMouseLeave`  | `InkxMouseEvent` | No      |
| `onWheel`       | `InkxWheelEvent` | Yes     |

**InkxMouseEvent** fields: `clientX`, `clientY`, `button`, `altKey`, `ctrlKey`, `metaKey`, `shiftKey`, `target`, `currentTarget`, `type`, `nativeEvent`, `stopPropagation()`, `preventDefault()`.

**InkxWheelEvent** extends InkxMouseEvent with: `deltaY` (-1=up, +1=down), `deltaX` (always 0).

**Hit testing**: Automatic tree-based using `screenRect` (last sibling wins for z-order, overflow:hidden clips).

See [docs/input-features.md](docs/input-features.md) for comprehensive input documentation and [docs/terminal-capabilities.md](docs/terminal-capabilities.md) for protocol details and terminal support matrix.

## Focus System (Tree-Based)

inkx provides a tree-based focus system that operates directly on the InkxNode render tree. Focus is managed by a standalone `FocusManager` (no React dependency) with React hooks for component integration.

### Props (on Box)

| Prop               | Type      | Description                                          |
| ------------------ | --------- | ---------------------------------------------------- |
| `focusable`        | `boolean` | Node can receive focus                               |
| `autoFocus`        | `boolean` | Focus this node on mount                             |
| `focusScope`       | `boolean` | Creates a focus scope (Tab cycles within subtree)    |
| `nextFocusUp`      | `string`  | testID to focus when pressing Up (explicit override) |
| `nextFocusDown`    | `string`  | testID to focus when pressing Down                   |
| `nextFocusLeft`    | `string`  | testID to focus when pressing Left                   |
| `nextFocusRight`   | `string`  | testID to focus when pressing Right                  |
| `onFocus`          | function  | Called when this node gains focus                    |
| `onBlur`           | function  | Called when this node loses focus                    |
| `onKeyDown`        | function  | Called on key down (bubble phase)                    |
| `onKeyDownCapture` | function  | Called on key down (capture phase)                   |

### Hooks

```tsx
import { useFocusable, useFocusWithin } from "inkx"

// Make a component focusable
function Panel() {
  const { focused, focus, blur, focusOrigin } = useFocusable()
  return (
    <Box testID="panel" focusable borderColor={focused ? "green" : "gray"}>
      <Text>{focused ? "Focused" : "Unfocused"}</Text>
    </Box>
  )
}

// Check if focus is within a subtree
function Sidebar() {
  const hasFocus = useFocusWithin("sidebar")
  return (
    <Box testID="sidebar" borderColor={hasFocus ? "blue" : "gray"}>
      <FocusableItem testID="item1" />
      <FocusableItem testID="item2" />
    </Box>
  )
}
```

### FocusManager API (standalone, no React)

```tsx
import { createFocusManager } from "inkx"

const fm = createFocusManager()
fm.focus(node, "programmatic") // Focus a node
fm.focusById("panel", root) // Focus by testID
fm.blur() // Clear focus
fm.focusNext(root) // Tab to next focusable
fm.focusPrev(root) // Tab to previous
fm.focusDirection(root, "down") // Spatial navigation
fm.enterScope("dialog") // Push focus scope
fm.exitScope() // Pop focus scope
fm.activeId // Current focused testID
fm.focusOrigin // "keyboard" | "mouse" | "programmatic"
```

### Click-to-Focus

Click-to-focus is built into the mouse event pipeline. Pass `focusManager` to `createMouseEventProcessor()`:

```tsx
const fm = createFocusManager()
const mouseState = createMouseEventProcessor({ focusManager: fm })
// On mousedown, the pipeline finds the nearest focusable ancestor and focuses it
```

The `run()` and `createApp()` runtimes wire this automatically.

## Layout Engine

inkx supports multiple layout engines:

| Engine            | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| `flexx` (default) | Zero-allocation Flexx, optimized for high-frequency layout |
| `yoga`            | Facebook's WASM-based flexbox (most mature)                |

```tsx
await render(<App />, term, { layoutEngine: "yoga" })
// Or: INKX_ENGINE=yoga bun run app.ts
```

## Imports

```tsx
// Runtime (recommended for new apps)
import { run, useInput, useExit, type Key } from "inkx/runtime"
import { createApp, useApp } from "inkx/runtime"

// Components
import { Box, Text, Link, Newline, Spacer, Static, Console, VirtualList } from "inkx"

// Input components
import { TextInput, ReadlineInput, useReadline } from "inkx"

// Hooks
import { useContentRect, useScreenRect, useInput, useApp, useTerm } from "inkx"

// Focus system (tree-based)
import { useFocusable, useFocusWithin } from "inkx"
import { createFocusManager, type FocusManager } from "inkx"
import { FocusManagerContext } from "inkx"

// Input layer stack (for dialogs/modals)
import { InputLayerProvider, useInputLayer } from "inkx"

// Text cursor utilities (Layer 0)
import { cursorToRowCol, getWrappedLines, rowColToCursor, cursorMoveUp, cursorMoveDown, countVisualLines } from "inkx"
import type { WrappedLine } from "inkx"

// Kitty keyboard protocol
import { KittyFlags, enableKittyKeyboard, disableKittyKeyboard, queryKittyKeyboard } from "inkx"
import { detectKittySupport, detectKittyFromStdio } from "inkx"

// Mouse events (SGR protocol)
import { parseMouseSequence, isMouseSequence, type ParsedMouse } from "inkx"
import { enableMouse, disableMouse } from "inkx"

// Mouse events (DOM-level)
import { hitTest, processMouseEvent, createMouseEventProcessor } from "inkx"
import type { InkxMouseEvent, InkxWheelEvent, MouseEventProps, MouseEventProcessorOptions } from "inkx"

// Hotkey parsing (supports macOS symbols ⌘⌥⌃⇧✦)
import { parseHotkey, matchHotkey } from "inkx"

// Render functions
import { render, renderStatic, renderString } from "inkx"

// Testing
import { createRenderer, keyToAnsi, keyToKittyAnsi, debugTree } from "inkx/testing"

// Term primitives (re-exported from chalkx)
import { createTerm, patchConsole, type Term, type StyleChain } from "inkx"
```

## Common Patterns

### Basic Interactive App

```tsx
import { render, Box, Text, useInput, useApp, createTerm } from "inkx"

function App() {
  const { exit } = useApp()
  const term = useTerm()

  useInput((input, key) => {
    if (input === "q" || key.escape) exit()
  })

  return <Text>{term.green("Press q to quit")}</Text>
}

using term = createTerm()
await render(<App />, term)
```

### Static Rendering (No Terminal)

```tsx
import { renderStatic } from "inkx"

const output = await renderStatic(<Summary stats={stats} />)
console.log(output)

// Plain text (no ANSI codes) for piped output
const plain = await renderStatic(<Report />, { plain: true })
```

### Console Capture

```tsx
import { render, Console, patchConsole } from "inkx"

function App({ console: patched }) {
  return (
    <Box flexDirection="column">
      <Console console={patched} />
      <Text>Status: running</Text>
    </Box>
  )
}

using patched = patchConsole(console)
await render(<App console={patched} />, term)

console.log("This appears in the Console component")
```

## Anti-Patterns

### Wrong: Mixing chalk backgrounds with Box backgroundColor

```tsx
// WRONG - causes visual artifacts
;<Box backgroundColor="cyan">
  <Text>{chalk.bgBlack("text")}</Text>
</Box>

// RIGHT - use bgOverride from chalkx
import { bgOverride } from "chalkx"
;<Box backgroundColor="cyan">
  <Text>{bgOverride(chalk.bgBlack("text"))}</Text>
</Box>
```

### Wrong: Old render API order

```tsx
// WRONG - old API (term first)
await render(term, <App />)

// RIGHT - element first, term optional
await render(<App />, term)
await render(<App />) // static mode
```

### Wrong: Using stdin.write() for keyboard input

```tsx
// WRONG - manual ANSI sequences
app.stdin.write("\x1b[A")

// RIGHT - Playwright-style API
await app.press("ArrowUp")
```

## Debugging

### Runtime Debug

```bash
# Enable incremental vs fresh render comparison
INKX_STRICT=1 bun km view /path/to/vault

# Write debug output to file
DEBUG=inkx:* DEBUG_LOG=/tmp/inkx.log bun km view /path
tail -f /tmp/inkx.log
```

### Test Debug

```tsx
const app = render(<MyComponent />)
app.debug() // Print current frame
console.log(app.ansi) // With colors
```

## Plugin Composition (withCommands, withKeybindings, withDiagnostics)

inkx provides SlateJS-style plugins for extending app functionality. These compose together for testing and AI automation.

### withCommands - Command System

Adds a `cmd` object for direct command invocation with metadata:

```tsx
import { withCommands } from "inkx"

const app = withCommands(render(<Board />), {
  registry: commandRegistry,
  getContext: () => buildCommandContext(state),
  handleAction: (action) => dispatch(action),
  getKeybindings: () => keybindings,
})

// Direct command invocation
await app.cmd.down()
await app.cmd["cursor_down"]()

// Command metadata
app.cmd.down.id // 'cursor_down'
app.cmd.down.name // 'Move Down'
app.cmd.down.help // 'Move cursor down'
app.cmd.down.keys // ['j', 'ArrowDown']

// Introspection for AI
app.cmd.all() // All commands with metadata
app.getState() // { screen, commands, focus }
```

### withKeybindings - Keybinding Resolution

Routes `press()` calls to commands via keybinding lookup:

```tsx
import { withKeybindings } from "inkx"

const app = withKeybindings(withCommands(render(<Board />), cmdOpts), {
  bindings: defaultKeybindings,
  getKeyContext: () => ({ mode: "normal", hasSelection: false }),
})

// Press 'j' -> resolves to cursor_down -> calls app.cmd.down()
await app.press("j")

// Unbound keys pass through to useInput handlers
await app.press("x")
```

### withDiagnostics - Testing Invariants

Adds buffer and rendering checks after command execution:

```tsx
import { withDiagnostics } from "inkx/toolbelt"

const driver = withDiagnostics(createBoardDriver(repo, rootId), {
  checkIncremental: true, // Verify incremental vs fresh render
  checkStability: true, // Verify cursor moves don't change content
  checkReplay: true, // Verify ANSI replay produces correct result
  captureOnFailure: true, // Save screenshot on diagnostic failure
  screenshotDir: "/tmp/inkx-diagnostics", // Default directory
})

// Commands now run invariant checks automatically
await driver.cmd.down() // Throws if any check fails (with screenshot path)
```

### Screenshots

The App interface supports direct screenshot capture via `bufferToHTML()` + lazy Playwright rendering:

```tsx
const png = await app.screenshot("/tmp/board.png") // Save to file
const buffer = await app.screenshot() // Get Buffer
```

No TTY server or external processes needed. Playwright is lazy-loaded on first call.

### Driver Pattern for Testing/AI

Compose plugins to create a "driver" for automated testing or AI interaction:

```tsx
function createBoardDriver(repo: Repo, rootId: string) {
  const { app, state, dispatch } = setupBoardApp(repo, rootId)

  return withDiagnostics(
    withKeybindings(
      withCommands(app, {
        registry: commandRegistry,
        getContext: () => buildContext(state),
        handleAction: dispatch,
        getKeybindings: () => keybindings,
      }),
      { bindings: keybindings, getKeyContext: () => state.keyContext },
    ),
  )
}

// AI can now:
// 1. See screen: driver.text
// 2. List commands: driver.cmd.all()
// 3. Execute commands: await driver.cmd.down()
// 4. Get state: driver.getState()
```

## Key Differences from Ink

1. **Element-first rendering**: `render(<App />, term)` - element first, term optional
2. **Static mode**: `render(<App />)` without term renders once and exits
3. **Layout feedback**: `useContentRect()` / `useScreenRect()` give actual dimensions
4. **Term context**: `useTerm()` provides terminal capabilities to components
5. **Auto-truncation**: Text truncates by default (use `wrap={false}` to overflow)

## Documentation

**Maintenance**: When adding or modifying performance optimizations in buffer.ts, output-phase.ts,
content-phase.ts, or other pipeline files, update [docs/performance.md](docs/performance.md) —
both the "All Optimizations" catalog and the benchmark tables. Run `bun run bench` before and after
to capture numbers.

| Document                                                       | Description                                              |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| [docs/README.md](docs/README.md)                               | Documentation table of contents                          |
| [docs/getting-started.md](docs/getting-started.md)             | Runtime layers and tutorial                              |
| [docs/components.md](docs/components.md)                       | Box, Text, VirtualList, Console, inputs                  |
| [docs/hooks.md](docs/hooks.md)                                 | useContentRect, useScreenRect, useInput, useApp, useTerm |
| [docs/input-features.md](docs/input-features.md)               | Keyboard, mouse, hotkeys, modifier symbols               |
| [docs/architecture.md](docs/architecture.md)                   | Core architecture and RenderAdapter                      |
| [docs/testing.md](docs/testing.md)                             | Testing strategy, locators, and API                      |
| [docs/internals.md](docs/internals.md)                         | Reconciler and 5-phase pipeline                          |
| [docs/performance.md](docs/performance.md)                     | Benchmarks and optimization (**keep up-to-date!**)       |
| [docs/streams.md](docs/streams.md)                             | AsyncIterable stream helpers                             |
| [docs/text-cursor.md](docs/text-cursor.md)                     | Cursor offset ↔ visual position mapping (Layer 0)        |
| [docs/focus-routing.md](docs/focus-routing.md)                 | Focus-based input routing pattern                        |
| [docs/ink-comparison.md](docs/ink-comparison.md)               | Ink issues and Inkx solutions                            |
| [docs/migration.md](docs/migration.md)                         | Ink to inkx migration guide                              |
| [docs/runtime-migration.md](docs/runtime-migration.md)         | Legacy inkx to inkx/runtime migration                    |
| [docs/terminal-capabilities.md](docs/terminal-capabilities.md) | Terminal detection, render modes, protocols              |
| [docs/roadmap.md](docs/roadmap.md)                             | Render targets and future plans                          |
