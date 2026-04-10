# Input Architecture

> This page documents the internal input event pipeline -- from raw terminal bytes to React component handlers. For the public API (hooks, props, commands), see [Event Handling](event-handling.md). For terminal protocol details, see [Kitty Protocol](kitty-protocol.md).

## Overview

Every keypress travels through five stages before reaching application code:

```
stdin bytes
    |
    v
 Terminal Provider          splitRawInput() -- chunk splitting, CSI buffering
    |
    v
 Parser                    parseKeypress() / parseKey() -- structured Key objects
    |
    v
 Event Loop                processEventBatch() -- batching, filtering, bridging
    |
    v
 Focus Dispatch            dispatchKeyEvent() -- capture / target / bubble phases
    |
    v
 Hooks & Handlers          useInput(), onKeyDown, withCommands()
```

Each stage has a single responsibility and passes structured data to the next. Release events, modifier-only events, and paste sequences are filtered at specific stages so downstream consumers see only what they need.

## Stage 1: Terminal Provider

`createTermProvider()` in `@silvery/ag-term` wraps stdin/stdout as a `Provider` with a typed async event stream.

**Chunk handling.** When the OS buffers key repeat events, stdin delivers multiple keystrokes in a single read (e.g., `"jjjjj"` for a held `j` key). The `onChunk()` handler splits these into individual sequences before parsing:

```
stdin data event: "jjj\x1b[A\x1b[A"
                      |
                splitRawInput()
                      |
        ["j", "j", "j", "\x1b[A", "\x1b[A"]
```

`splitRawInput()` recognizes three sequence types:

- **Single bytes** -- printable characters and ctrl codes
- **CSI sequences** -- `ESC [` ... terminator (letter or `~`)
- **SS3 sequences** -- `ESC O` + letter (function keys on some terminals)
- **Meta sequences** -- `ESC` + char or `ESC ESC` + CSI

**Cross-chunk buffering.** When a CSI sequence splits across two stdin data events (common with SGR mouse sequences), the incomplete prefix is buffered and prepended to the next chunk.

**Bracketed paste.** Paste content is detected before splitting -- the entire paste arrives as a single `{ type: "paste" }` event, not as individual keystrokes.

Each parsed sequence becomes a typed `ProviderEvent`:

- `{ type: "key", data: { input, key } }` -- keyboard input
- `{ type: "mouse", data: ParsedMouse }` -- mouse sequences
- `{ type: "paste", data: { text } }` -- bracketed paste
- `{ type: "resize", data: { cols, rows } }` -- terminal resize
- `{ type: "focus", data: { focused } }` -- terminal focus in/out

## Stage 2: Parser

`parseKeypress()` and `parseKey()` in `@silvery/ag` convert raw terminal sequences into structured `Key` objects.

### Two-layer output

`parseKey()` returns `[input, key]` where these serve different purposes:

- **`input`** is normalized for keybinding matching. Shifted punctuation is decomposed: `#` becomes `input="3"` with `key.shift=true`, so `shift+3` matches. Uppercase letters become lowercase + shift.
- **`key.text`** is the actual typed character. For text insertion, always use `key.text ?? input` -- this ensures Shift+3 inserts `#` and option+e inserts the accent.

Rule: keybinding resolution uses `input`. Text insertion uses `key.text`.

### Kitty protocol parsing

When the Kitty keyboard protocol is active, the parser handles the enhanced `CSI u` format:

```
CSI codepoint ; modifiers : eventType u
CSI codepoint : shifted : base ; modifiers : eventType u
```

This extracts:

- **Modifier flags** -- ctrl, shift, alt, super, hyper, capsLock, numLock (bitmask)
- **Event type** -- `"press"` (1), `"repeat"` (2), `"release"` (3)
- **Shifted codepoint** -- for correct shifted punctuation on non-US layouts
- **Text codepoints** -- with `REPORT_TEXT` flag (16)

Legacy CSI sequences (arrows, function keys) are also enhanced with the `:eventType` field when Kitty is active: `CSI number ; modifiers : eventType {letter|~}`.

### Default Kitty flags

Silvery enables flags 1 + 2 + 8 = **11** by default:

- **DISAMBIGUATE** (1) -- unambiguous `CSI u` encoding for all keys
- **REPORT_EVENTS** (2) -- press, repeat, and release events
- **REPORT_ALL_KEYS** (8) -- even plain letters get `CSI u` encoding, enabling modifier-only detection

## Stage 3: Event Loop

`processEventBatch()` in `create-app.tsx` processes all queued provider events in a single batch before rendering. For a burst of 3 `j` presses: handler1 -> handler2 -> handler3 -> one render.

### Bridge to RuntimeContext

All key events are bridged to `RuntimeContext` listeners first, before any filtering:

```typescript
for (const event of events) {
  if (event.type === "term:key") {
    for (const listener of runtimeInputListeners) {
      listener(input, parsedKey)
    }
  }
}
```

This ensures `useModifierKeys()` sees every event -- including modifier-only and release events that are filtered out for app handlers.

### Event filtering

After the bridge, the event loop filters for app handlers using `isModifierOnlyEvent()` from `@silvery/ag/keys` (single source of truth — shared by useInput and create-app):

1. **Release events** (`key.eventType === "release"`) -- skipped. App handlers expect press-only semantics.
2. **Modifier-only events** (`isModifierOnlyEvent(input, key)`) -- skipped. Only `useModifierKeys()` consumes these.
3. **Press and repeat events** -- continue to focus dispatch and app handlers.

## Stage 4: Focus Dispatch

`dispatchKeyEvent()` in `@silvery/ag` routes key events through the render tree using DOM-style phases.

### Press and repeat events

Three phases, matching React DOM behavior:

1. **Capture phase** (root -> target): walks ancestors root-first, calling `onKeyDownCapture` handlers
2. **Target phase**: calls the focused node's `onKeyDown`
3. **Bubble phase** (target -> root): walks ancestors target-first, calling `onKeyDown` handlers

Any handler can call `event.stopPropagation()` to halt traversal, or `event.preventDefault()` to suppress default behavior (like focus navigation).

### Release events

Release events are currently filtered at Stage 3 (processEventBatch) before reaching focus dispatch. The `dispatchKeyEvent()` function supports `onKeyUp` routing (target + bubble, no capture phase), but processEventBatch skips release events so they never reach Stage 4. Release events are consumed by `useModifierKeys()` and `useInput({onRelease})` via RuntimeContext listeners, which are bridged before the Stage 3 filter.

> **Note:** React DOM does have both `onKeyUp` and `onKeyUpCapture`. Silvery's choice to skip the capture phase for release is a deliberate simplification, not matching React DOM.

### Focus navigation defaults

After dispatch, if no handler consumed the event, the event loop handles default focus navigation:

- **Tab** -- `focusManager.focusNext(root)`
- **Shift+Tab** -- `focusManager.focusPrev(root)`
- **Enter** on a `focusScope` node -- enter that scope
- **Escape** -- exit scope or blur

These defaults only fire when `dispatchKeyEvent()` did not set `propagationStopped` or `defaultPrevented`.

## Stage 5: Hooks and Handlers

### Hook hierarchy

All hooks are defined in `@silvery/ag-react/hooks/` and re-exported from `silvery` and `silvery/runtime`. There is ONE implementation per hook — no duplicates across packages.

| Hook                 | Purpose                         | Sees releases?         | Sees modifier-only? |
| -------------------- | ------------------------------- | ---------------------- | ------------------- |
| `useInput()`         | Primary key handling            | Via `onRelease` option | No (filtered)       |
| `useModifierKeys()`  | Track held modifier state       | Yes (all events)       | Yes                 |
| `useInputLayer()`    | Layered input with bubbling     | No                     | No                  |
| `useExit()`          | Programmatic exit               | N/A                    | N/A                 |
| `usePasteCallback()` | Simple paste text callback      | N/A                    | N/A                 |
| `usePaste()`         | Context-based rich paste events | N/A                    | N/A                 |

**`useInput(handler, options?)`** -- the primary input hook. Subscribes to `RuntimeContext` "input" events. Filters out modifier-only events via `isModifierOnlyEvent()` from `@silvery/ag/keys`. Routes release events to the `onRelease` callback if provided, otherwise drops them. Return `"exit"` to quit the app. See [Event Handling](event-handling.md) for the full API.

**`useModifierKeys(options?)`** -- tracks which modifier keys (Cmd, Ctrl, Alt, Shift) are currently held. Uses `useSyncExternalStore` backed by a per-runtime singleton store. The `enabled` option controls subscription -- set to `false` to avoid re-renders when the component doesn't need modifier state.

**`useInputLayer(name, handler)`** -- registers a handler in a layered stack. Layers receive input in child-first order (like DOM bubbling). Return `true` to consume the event, `false` to let it bubble.

### Planned hooks

**`useKeyPress()`** -- (planned) a higher-level hook with declarative keybinding matching, replacing the manual `if (input === "j")` pattern.

**`useTextInput()`** -- (planned) dedicated text capture hook that handles `key.text`, IME, paste, and undo. Currently, `TextInput` and `TextArea` components implement this internally.

## Command System Integration

`withCommands()` from `@silvery/commands` layers on top of the input pipeline. It does not replace it -- it wraps the app's `update` method to intercept events after component handlers:

```
Key event
  |-> withDomEvents() -- component onKeyDown/onKeyUp handlers
  |     (stopPropagation? done)
  |-> withCommands() -- resolve key to named command, execute, dispatch action
```

The pipeline order in `pipe()` determines priority:

```typescript
const app = pipe(
  createApp(store),
  withReact(<Board />),
  withDomEvents(),   // fires first -- component handlers can consume events
  withCommands(opts), // unhandled events resolve to commands
)
```

Commands are serializable `(key) -> commandId -> action` -- enabling replay, undo, and AI automation. See [Event Handling -- withCommands()](event-handling.md#withcommands-named-serializable-actions) for the API.

## Testing Input

### Termless (full pipeline)

`createTermless()` runs the complete input pipeline through a real xterm.js emulator. Use `handle.press()` to send Playwright-style key names:

```typescript
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"

using term = createTermless({ cols: 80, rows: 24 })
const handle = await run(<App />, term)

await handle.press("j")              // single key
await handle.press("Control+c")      // modifier combo
await handle.press("ArrowDown")      // named key
```

`press()` converts Playwright key names to ANSI sequences via `keyToAnsi()`, writes them to the emulator's input, and waits for the render to settle.

### Headless renderer (unit tests)

`createRenderer()` from `@silvery/test` provides a lighter-weight test environment. Use `press()` for individual keys:

```typescript
import { createRenderer } from "@silvery/test"

const { press, lastFrame } = createRenderer(<Counter />)
await press("j")
expect(lastFrame()).toContainText("1")
```

### Synthetic events in component tests

For testing `onKeyDown`/`onKeyUp` handlers directly, create synthetic events with `createKeyEvent()`:

```typescript
import { createKeyEvent } from "@silvery/ag/focus-events"
import { parseKey } from "@silvery/ag/keys"

const [input, key] = parseKey("j")
const event = createKeyEvent(input, key, targetNode)
dispatchKeyEvent(event)
expect(event.propagationStopped).toBe(true)
```

## Common Patterns

### Dialog key handling

Dialogs capture Escape in the bubble phase to close themselves, preventing it from reaching parent handlers:

```tsx
<Box
  onKeyDown={(e) => {
    if (e.nativeEvent.key.escape) {
      closeDialog()
      e.stopPropagation()
    }
  }}
>
  <TextInput value={query} onChange={setQuery} />
</Box>
```

### Text input vs discrete commands

Components that accept text input (search bars, editors) use `key.text` for insertion and `useInput` for control keys. The two paths are distinct:

```tsx
useInput((input, key) => {
  if (key.return) {
    submit()
    return
  }
  if (key.escape) {
    cancel()
    return
  }

  // Text insertion: use key.text (actual character) not input (normalized)
  const char = key.text ?? input
  if (char.length === 1 && char >= " ") {
    insertText(char)
  }
})
```

### Mode-based routing

Applications with modal interfaces (vim-style normal/insert/visual) route input based on the current mode. The command system supports this via context-dependent keybindings:

```typescript
withCommands({
  registry,
  getContext: () => ({ mode: store.getState().mode, cursor: store.getState().cursor }),
  bindings: {
    key: {
      i: "enter_insert", // only active in normal mode (registry checks context)
      Escape: "exit_insert",
    },
  },
})
```

### Release events for interaction feedback

Track key-down/key-up pairs for hold-to-preview or scroll acceleration:

```tsx
useInput(
  (input, key) => {
    if (key.downArrow) startScrolling()
  },
  {
    onRelease: (input, key) => {
      if (key.downArrow) stopScrolling()
    },
  },
)
```

This requires the Kitty protocol with `REPORT_EVENTS` (enabled by default).

## See Also

- [Event Handling](event-handling.md) -- public API reference (hooks, props, commands, plugins)
- [Kitty Protocol](kitty-protocol.md) -- terminal protocol details, flag configuration, terminal support matrix
- [Input Limitations](input-limitations.md) -- what traditional terminals cannot report
- [Headless Machines](headless-machines.md) -- pure state machines for input processing (Readline, SelectList)
