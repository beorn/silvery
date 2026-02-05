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

## Layout Hooks

Components can access their computed dimensions:

```tsx
import { Box, Text, useContentRect } from "inkx"

function ResponsiveCard() {
  const { width, height } = useContentRect()
  return <Text>{`Size: ${width}x${height}`}</Text>
}
```

## Components

### Box

Container with flexbox layout:

```tsx
<Box flexDirection="column" padding={1} borderStyle="single">
  <Text>Content</Text>
</Box>
```

### Text

Styled text with auto-truncation:

```tsx
<Text color="green" bold>Success</Text>
<Text underlineStyle="curly" underlineColor="red">Error</Text>
```

**Text Style Props:**

| Prop              | Type           | Description                                                       |
| ----------------- | -------------- | ----------------------------------------------------------------- |
| `color`           | string         | Foreground color (named, hex, or rgb())                           |
| `backgroundColor` | string         | Background color                                                  |
| `bold`            | boolean        | Bold text                                                         |
| `dim`             | boolean        | Dimmed text                                                       |
| `italic`          | boolean        | Italic text                                                       |
| `underline`       | boolean        | Simple underline                                                  |
| `underlineStyle`  | UnderlineStyle | `'single'` \| `'double'` \| `'curly'` \| `'dotted'` \| `'dashed'` |
| `underlineColor`  | string         | Underline color (independent of text color)                       |
| `strikethrough`   | boolean        | Strikethrough text                                                |
| `inverse`         | boolean        | Swap foreground/background                                        |

### Scrollable Containers

```tsx
<Box overflow="scroll" height={10} scrollTo={selectedIndex}>
  {items.map((item, i) => (
    <Text key={i}>{item.name}</Text>
  ))}
</Box>
```

### VirtualList

For large lists (100+ items):

```tsx
<VirtualList
  items={cards}
  height={20}
  itemHeight={1}
  scrollTo={selectedIndex}
  renderItem={(card, index) => <Text key={card.id}>{card.name}</Text>}
/>
```

## Input Handling

### Key Object

```typescript
interface Key {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  pageUp: boolean
  pageDown: boolean
  home: boolean
  end: boolean
  return: boolean
  escape: boolean
  tab: boolean
  backspace: boolean
  delete: boolean
  ctrl: boolean
  shift: boolean
  meta: boolean
}
```

### TextInput / ReadlineInput

```tsx
import { TextInput, ReadlineInput } from "inkx"

<TextInput
  value={query}
  onChange={setQuery}
  onSubmit={(value) => console.log("Submitted:", value)}
  placeholder="type here..."
/>

<ReadlineInput
  value={command}
  onChange={setCommand}
  onSubmit={executeCommand}
  prompt="$ "
/>
```

ReadlineInput supports full readline shortcuts: Ctrl+A/E (start/end), Ctrl+W (delete word), Ctrl+K (kill to end), Ctrl+Y (yank), etc.

## Input Layer Stack

Solves the race condition with async useEffect registration where multiple components register input handlers in unpredictable order. Without this, dialogs and inputs that mount asynchronously may not receive keystrokes.

**How it works:** DOM-style event bubbling with LIFO (last-in-first-out) stack. The most recently registered layer gets first chance to handle input. If it returns `true`, the event is consumed. If `false`, it bubbles to the next layer.

**API:**

| Export               | Description                                   |
| -------------------- | --------------------------------------------- |
| `InputLayerProvider` | Wrap app to enable input layer stack          |
| `useInputLayer`      | `(id: string, handler: InputHandler) => void` |

Handler signature: `(input: string, key: Key) => boolean` - return `true` to consume, `false` to bubble.

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

## Testing

```tsx
import { createRenderer } from "inkx/testing"

const render = createRenderer({ cols: 80, rows: 24 })

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

| Method                  | Returns   | Description                  |
| ----------------------- | --------- | ---------------------------- | --------------------- |
| `app.text`              | `string`  | Plain text output (no ANSI)  |
| `app.ansi`              | `string`  | Output with ANSI codes       |
| `app.press(key)`        | `Promise` | Send keyboard input          |
| `app.getByTestId(id)`   | `Locator` | Find by testID prop          |
| `app.getByText(text)`   | `Locator` | Find by text content         |
| `app.locator(sel)`      | `Locator` | CSS-style attribute selector |
| `locator.textContent()` | `string`  | Get element text             |
| `locator.boundingBox()` | `Rect     | null`                        | Get position and size |
| `locator.count()`       | `number`  | Count matches                |

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
import { Box, Text, Newline, Spacer, Static, Console, VirtualList } from "inkx"

// Input components
import { TextInput, ReadlineInput, useReadline } from "inkx"

// Hooks
import { useContentRect, useScreenRect, useInput, useApp, useTerm } from "inkx"

// Input layer stack (for dialogs/modals)
import { InputLayerProvider, useInputLayer } from "inkx"

// Render functions
import { render, renderStatic, renderString } from "inkx"

// Testing
import { createRenderer, keyToAnsi, debugTree } from "inkx/testing"

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
})

// Commands now run invariant checks automatically
await driver.cmd.down() // Throws if any check fails
```

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

| Document                                                       | Description                           |
| -------------------------------------------------------------- | ------------------------------------- |
| [docs/architecture.md](docs/architecture.md)                   | Core architecture and RenderAdapter   |
| [docs/getting-started.md](docs/getting-started.md)             | Runtime layers and tutorial           |
| [docs/testing.md](docs/testing.md)                             | Testing strategy, locators, and API   |
| [docs/internals.md](docs/internals.md)                         | Reconciler and 5-phase pipeline       |
| [docs/migration.md](docs/migration.md)                         | Ink to inkx migration guide           |
| [docs/runtime-migration.md](docs/runtime-migration.md)         | Legacy inkx to inkx/runtime migration |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md)                     | Benchmarks and optimization           |
| [docs/ink-comparison.md](docs/ink-comparison.md)               | Ink issues and Inkx solutions         |
| [docs/streams.md](docs/streams.md)                             | AsyncIterable stream helpers          |
| [docs/terminal-capabilities.md](docs/terminal-capabilities.md) | Terminal detection and render modes   |
