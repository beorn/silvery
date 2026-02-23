# Plugin Composition

inkx provides SlateJS-style plugins for extending app functionality. Plugins compose together to create "drivers" for automated testing and AI interaction.

## withCommands

Adds a `cmd` object for direct command invocation with metadata.

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

// Introspection
app.cmd.all() // All commands with metadata
app.getState() // { screen, commands, focus }
```

## withKeybindings

Routes `press()` calls to commands via keybinding lookup. Wraps a `withCommands`-enhanced app.

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

## withDiagnostics

Adds buffer and rendering invariant checks after command execution. Imported from `inkx/toolbelt`.

```tsx
import { withDiagnostics } from "inkx/toolbelt"

const driver = withDiagnostics(app, {
  checkIncremental: true, // Verify incremental vs fresh render match
  checkStability: true, // Verify cursor moves don't change content
  checkReplay: true, // Verify ANSI replay produces correct result
  captureOnFailure: true, // Save screenshot on diagnostic failure
  screenshotDir: "/tmp/inkx-diagnostics",
})

// Commands now run invariant checks automatically
await driver.cmd.down() // Throws if any check fails (with screenshot path)
```

## Screenshots

The App interface supports direct screenshot capture via `bufferToHTML()` + lazy Playwright rendering:

```tsx
const png = await app.screenshot("/tmp/board.png") // Save to file
const buffer = await app.screenshot() // Get Buffer
```

No TTY server or external processes needed. Playwright is lazy-loaded on first call.

## Driver Pattern

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
```

A driver gives AI agents or test scripts a structured interface:

1. **See screen**: `driver.text` or `driver.ansi`
2. **List commands**: `driver.cmd.all()`
3. **Execute commands**: `await driver.cmd.down()`
4. **Get state**: `driver.getState()`
5. **Take screenshot**: `await driver.screenshot("/tmp/state.png")`

This pattern decouples the automation interface from the UI implementation, so tests and AI agents work through the same command system as keyboard users.
