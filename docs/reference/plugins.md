# Plugin Composition

Silvery provides SlateJS-style plugins for extending app functionality. Plugins compose together to create "drivers" for automated testing and AI interaction. For the graduated introduction to the plugin architecture, see [Building an App](../guide/building-an-app.md). For the API reference, see [Event Handling](../guide/event-handling.md).

## Built-in Plugins

Every built-in behavior is a plugin. `run()` composes them for you; `pipe()` lets you pick.

### Kernel

| Plugin             | Role   | What it does                                                                                |
| ------------------ | ------ | ------------------------------------------------------------------------------------------- |
| `createApp(store)` | Kernel | Typed event loop: `update`, `dispatch`, `events`, `run`. No rendering, no terminal, no I/O. |

### Rendering

| Plugin              | Role      | What it does                                                                                                                    |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `withReact(<El />)` | Rendering | React reconciler + virtual buffer. Mounts the element, renders into a `TerminalBuffer`, re-renders reactively on store changes. |

### Terminal I/O

| Plugin                         | Role                       | What it does                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `withTerminal(process, opts?)` | Source + Output + Protocol | **All terminal I/O in one plugin.** stdin → typed events (`term:key`, `term:mouse`, `term:paste`). stdout → alternate screen, raw mode, incremental diff output. SIGWINCH → `term:resize`. Lifecycle (Ctrl+Z suspend/resume, Ctrl+C exit). Protocols (SGR mouse, Kitty keyboard, bracketed paste) controlled via options. |

Mouse, Kitty keyboard, and bracketed paste are **on by default** — no configuration needed. Options for disabling or customizing: `{ mouse?: boolean, kitty?: boolean | KittyFlags, paste?: boolean, onSuspend?, onResume?, onInterrupt? }`

Internally, `withTerminal` composes the lower-level concerns (input parsing, output rendering, resize handling, protocol negotiation, lifecycle management). You never need to think about them separately unless you're building something exotic like a multiplexer or test harness.

### Event Processing

| Plugin               | Role             | What it does                                                                                                                                                                                                   |
| -------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `withFocus()`        | Processing       | Focus manager: Tab/Shift+Tab navigation, Enter to enter scope, Escape to exit. Dispatches `onKeyDown`/`onKeyDownCapture` through focus tree (capture → target → bubble).                                       |
| `withDomEvents()`    | Processing       | DOM-like event dispatch for mouse: hit testing via `screenRect`, bubbling through ancestors. `onClick`, `onDoubleClick`, `onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseEnter`, `onMouseLeave`, `onWheel`. |
| `withCommands(opts)` | Processing + API | Resolves key and mouse events to named commands via a binding table. Adds `.cmd` proxy for programmatic invocation. Adds `.getState()` for introspection.                                                      |

### Testing / Automation

| Plugin                      | Role | What it does                                                                                                                              |
| --------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `withKeybindings(bindings)` | API  | Intercepts `press()` to resolve keybindings → commands before passing through. `press("j")` becomes `cmd.cursor_down()`.                  |
| `withDiagnostics(opts?)`    | API  | Adds render invariant checks after each command: incremental vs fresh render, stability, replay, layout. Captures screenshots on failure. |

### How `run()` composes them

```tsx
// run(store, element, options) is equivalent to:
function run(store, element, options = {}) {
  return pipe(
    createApp(store),
    withReact(element),
    withTerminal(process, options), // mouse, kitty, paste all on by default
    withFocus(),
    withDomEvents(),
  ).run();
}
```

Every option on `run()` maps to a plugin. When you need more control — custom processing, custom sources, testing drivers — drop down to `pipe()` and compose exactly what you need.

## Plugin API Details

## withCommands

Adds a `cmd` object for direct command invocation with metadata.

```tsx
import { withCommands } from "@silvery/term";

const app = withCommands(render(<Board />), {
  registry: commandRegistry,
  getContext: () => buildCommandContext(state),
  handleAction: (action) => dispatch(action),
  getKeybindings: () => keybindings,
});

// Direct command invocation
await app.cmd.down();
await app.cmd["cursor_down"]();

// Command metadata
app.cmd.down.id; // 'cursor_down'
app.cmd.down.name; // 'Move Down'
app.cmd.down.help; // 'Move cursor down'
app.cmd.down.keys; // ['j', 'ArrowDown']

// Introspection
app.cmd.all(); // All commands with metadata
app.getState(); // { screen, commands, focus }
```

## withKeybindings

Routes `press()` calls to commands via keybinding lookup. Wraps a `withCommands`-enhanced app.

```tsx
import { withKeybindings } from "@silvery/term";

const app = withKeybindings(withCommands(render(<Board />), cmdOpts), {
  bindings: defaultKeybindings,
  getKeyContext: () => ({ mode: "normal", hasSelection: false }),
});

// Press 'j' -> resolves to cursor_down -> calls app.cmd.down()
await app.press("j");

// Unbound keys pass through to useInput handlers
await app.press("x");
```

## withDiagnostics

Adds buffer and rendering invariant checks after command execution. Imported from `silvery/toolbelt`.

```tsx
import { withDiagnostics } from "@silvery/term/toolbelt";

const driver = withDiagnostics(app, {
  checkIncremental: true, // Verify incremental vs fresh render match
  checkStability: true, // Verify cursor moves don't change content
  checkReplay: true, // Verify ANSI replay produces correct result
  captureOnFailure: true, // Save screenshot on diagnostic failure
  screenshotDir: "/tmp/silvery-diagnostics",
});

// Commands now run invariant checks automatically
await driver.cmd.down(); // Throws if any check fails (with screenshot path)
```

## Screenshots

The App interface supports direct screenshot capture via `bufferToHTML()` + lazy Playwright rendering:

```tsx
const png = await app.screenshot("/tmp/board.png"); // Save to file
const buffer = await app.screenshot(); // Get Buffer
```

No TTY server or external processes needed. Playwright is lazy-loaded on first call.

## Driver Pattern

Compose plugins to create a "driver" for automated testing or AI interaction:

```tsx
function createBoardDriver(repo: Repo, rootId: string) {
  const { app, state, dispatch } = setupBoardApp(repo, rootId);

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
  );
}
```

A driver gives AI agents or test scripts a structured interface:

1. **See screen**: `driver.text` or `driver.ansi`
2. **List commands**: `driver.cmd.all()`
3. **Execute commands**: `await driver.cmd.down()`
4. **Get state**: `driver.getState()`
5. **Take screenshot**: `await driver.screenshot("/tmp/state.png")`

This pattern decouples the automation interface from the UI implementation, so tests and AI agents work through the same command system as keyboard users.
