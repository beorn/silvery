# Terminal Capabilities Reference

_Terminal protocol support last verified: 2026-03._

This document explains terminal capabilities, the `ansi` and `silvery` packages, and how to choose the right render strategy.

## The Two Core Capabilities

Terminal output boils down to **two independent capabilities**:

### 1. Cursor Control (`term.hasCursor()`)

Can the terminal interpret ANSI CSI (Control Sequence Introducer) escape sequences?

```
ESC [ <params> <command>
```

If **yes**, ALL cursor operations work:

- Move cursor: `\x1b[A` (up), `\x1b[B` (down), `\x1b[H` (home)
- Clear: `\x1b[2J` (screen), `\x1b[K` (line)
- Alternate screen: `\x1b[?1049h` (enter), `\x1b[?1049l` (leave)
- Hide/show cursor: `\x1b[?25l` / `\x1b[?25h`

If **no**, only append-only output works (use `renderString()`).

**Detection:**

```ts
term.hasCursor() // stdout.isTTY && TERM !== 'dumb'
```

### 2. Color Level (`term.hasColor()`)

What color codes does the terminal support?

| Level         | Detection                     | Codes              |
| ------------- | ----------------------------- | ------------------ |
| `null`        | `NO_COLOR` set or `TERM=dumb` | None               |
| `'basic'`     | Most terminals                | 16 ANSI colors     |
| `'256'`       | `TERM` contains `256color`    | `\x1b[38;5;Nm`     |
| `'truecolor'` | `COLORTERM=truecolor`         | `\x1b[38;2;R;G;Bm` |

**Detection:**

```ts
term.hasColor() // null | 'basic' | '256' | 'truecolor'
```

### 3. Input Capability (`term.hasInput()`)

Can the app read individual keystrokes (raw mode)?

```ts
term.hasInput() // stdin.isTTY && setRawMode available
```

Required for: `useInput`, keyboard navigation, interactive TUIs.

## Why These Three Are Enough

You might think there are separate capabilities for "line update", "region update", "fullscreen". But these are **app choices**, not terminal capabilities. If cursor control works, ALL cursor operations work.

## Environment Factors

Beyond raw capabilities, the **environment** affects what's practical:

### TTY Status

```ts
process.stdout.isTTY // true if connected to terminal
```

When `false` (piped, redirected, CI):

- Cursor control codes are written but ignored/garbled
- Output may be buffered differently
- No resize events

### Exclusive Output

Does your app have exclusive access to stdout?

| Situation                     | Exclusive? | Safe Strategies            |
| ----------------------------- | ---------- | -------------------------- |
| Standalone CLI                | Yes        | fullscreen, inline, stream |
| Test reporter (worker output) | No         | stream or `<Console />`    |
| Subprocess                    | Maybe      | depends on parent          |

If you don't have exclusive stdout, use the `<Console />` component to handle interleaved output.

## Render Functions

### `render(element, term)` - Interactive Rendering

```ts
using term = createTerm()
using app = await render(<App />, term)
using app = await render(<App />, term, { fullscreen: true })
```

- Default: **inline mode** (updates in place from current cursor)
- Optional: `fullscreen: true` for alternate screen buffer
- Requires: cursor control (`term.hasCursor()`)
- Returns a Disposable

**Options:**

```ts
{
  fullscreen?: boolean    // Use alternate screen (default: false)
  exitOnCtrlC?: boolean   // Exit on Ctrl+C (default: true)
}
```

**Instance methods:**

```ts
app.rerender(<App newProps />)
app.clear()
await app.waitUntilExit()
app.dispose()  // or app.unmount()
```

### `renderString()` - Static Rendering

```ts
const output: string = renderString(<Summary />)
const output: string = renderString(<Summary />, { width: 80, plain: true })
```

- Returns a string (caller decides where to write)
- No cursor control needed - always safe
- Use for: logging, streaming, static output, testing

**Options:**

```ts
{
  width?: number    // Default: 80
  plain?: boolean   // Strip ANSI codes (default: false)
}
```

### When to Use Which

| Situation              | Function                                | Why                 |
| ---------------------- | --------------------------------------- | ------------------- |
| Fullscreen TUI         | `render(<App />, { fullscreen: true })` | Takes over terminal |
| Progress bar           | `render(<Progress />)`                  | Updates in place    |
| Worker output handling | `<Console />` component                 | Composition pattern |
| CI / no cursor         | `renderString(<Summary />)`             | Always safe         |
| Streaming output       | `renderString()` in a loop              | Append-only         |
| Piped output           | `renderString(<X />, { plain: true })`  | No ANSI codes       |

## Console Patching

When using `inline` or `fullscreen` modes, external console.log calls would corrupt the display. Silvery can intercept these:

```ts
await render(<App />, { patchConsole: true })
```

Behavior:

1. Intercepts `console.log`, `console.error`, etc.
2. Pauses UI rendering
3. Outputs console content above the UI
4. Re-renders UI below

This is how Ink handles the same problem.

**For test reporters:** Console patching lets you buffer worker output and display it cleanly alongside your UI.

## Creating a Term

```ts
import { createTerm } from "@silvery/ansi"

// Default (process.stdout/stdin) - Disposable
using term = createTerm()

// Custom streams
using term = createTerm({ stdout: customOut, stdin: customIn })

// For testing
using term = createTerm({
  stdout: new MockWriteStream({ cols: 80, rows: 24 }),
  stdin: new MockReadStream(),
})
```

## Term API

```ts
// Detection
term.hasCursor() // boolean - can use cursor control?
term.hasInput() // boolean - can read keystrokes (raw mode)?
term.hasColor() // null | 'basic' | '256' | 'truecolor'

// Dimensions
term.cols // number | undefined
term.rows // number | undefined

// Styling
term.chalk.red("error")
term.chalk.bold.green("success")

// Utilities
term.stripAnsi(str)
term.write(str)

// Cleanup
term.dispose() // or let `using` handle it
```

## Code Examples

### Detect Before Rendering

```ts
import { createTerm } from '@silvery/ansi'
import { render, renderString } from '@silvery/term'

using term = createTerm()

if (term.hasCursor() && term.hasInput()) {
  // Full interactive TUI
  using app = await render(<InteractiveApp />, { fullscreen: true })
  await app.waitUntilExit()
} else if (term.hasCursor()) {
  // Output-only live updates
  using app = await render(<ProgressDisplay />)
} else {
  // Static output
  console.log(renderString(<SimpleOutput />, { width: term.cols }))
}
```

### Adaptive Components

```tsx
import { useTerm, Box, Text } from "@silvery/term"

function StatusLine({ status }: { status: string }) {
  const term = useTerm()

  // Same component, adapts to capabilities
  const color = term.hasColor() ? "green" : undefined

  return (
    <Box>
      <Text color={color}>{status}</Text>
    </Box>
  )
}
```

### Console Component

```tsx
import { createTerm } from "@silvery/ansi"
import { render, Console, Box, Text } from "@silvery/term"

using term = createTerm()

using app = await render(
  <Box flexDirection="column">
    <Console /> {/* Worker output appears here */}
    <Text>My UI below</Text>
  </Box>,
)

// Now console.log() calls appear in the Console component
console.log("This shows in <Console />")
```

### Test Reporter Pattern

```tsx
import { createTerm } from "@silvery/ansi"
import { render, renderString, Console, Box } from "@silvery/term"

class Reporter {
  private term = createTerm()
  private app: RenderInstance | null = null

  async onTestRunStart() {
    if (this.term.hasCursor()) {
      this.app = await render(
        this.term,
        <Box flexDirection="column">
          <Console />
          <ReporterUI state={this.state} />
        </Box>,
      )
    }
  }

  onTestCaseResult(result: TestResult) {
    if (this.app) {
      this.setState({ results: [...this.state.results, result] })
    } else {
      console.log(renderString(<ResultDot result={result} />))
    }
  }

  onTestRunEnd() {
    this.app?.dispose()
    console.log(renderString(<Summary stats={this.stats} />))
    this.term.dispose()
  }
}
```

### Using Disposables

```ts
// Automatic cleanup with `using`
{
  using term = createTerm()
  using app = await render(<App />)

  // ... app runs ...

}  // Both cleaned up automatically

// Manual cleanup
const term = createTerm()
const app = await render(<App />)
// ...
app.dispose()
term.dispose()
```

## Synchronized Update Mode (DEC 2026)

Silvery automatically wraps all terminal output with **Synchronized Update Mode** sequences (`CSI ? 2026 h` / `CSI ? 2026 l`). This tells the terminal to batch output and paint atomically, preventing visual tearing during rapid screen updates.

### How It Works

```
\x1b[?2026h   ← Begin: terminal buffers all subsequent output
...output...   ← Cursor movement, style changes, text — all buffered
\x1b[?2026l   ← End: terminal paints everything in one atomic update
```

Without this, the terminal may paint intermediate states mid-render, causing visible flicker — especially noticeable in multiplexers like tmux.

### Terminal Support

| Terminal         | Supported | Notes          |
| ---------------- | --------- | -------------- |
| Ghostty          | Yes       |                |
| Kitty            | Yes       |                |
| WezTerm          | Yes       |                |
| iTerm2           | Yes       |                |
| Foot             | Yes       |                |
| Alacritty        | Yes       | 0.14+          |
| tmux             | Yes       | 3.2+           |
| Contour          | Yes       |                |
| Terminal.app     | No        | Safely ignored |
| Windows Terminal | No        | Safely ignored |

Terminals that don't support it **safely ignore** the sequences — they pass through as no-ops.

### Configuration

Sync update is enabled by default. To disable:

```bash
SILVERY_SYNC_UPDATE=0 bun km view /path
```

Only applies in TTY mode. Non-TTY modes (line-by-line, static, plain) skip sync wrapping.

### Feature Detection (DECRPM)

Terminals can be queried for DEC 2026 support via DECRPM:

```
Query:    CSI ? 2026 $ p
Response: CSI ? 2026 ; <value> $ y
```

Where `value` is: 0=unknown, 1=set, 2=reset, 3=permanent set, 4=permanent reset.

Silvery does not currently query support — it always emits the sequences since unsupported terminals ignore them harmlessly.

## Kitty Keyboard Protocol

The [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) provides unambiguous key identification, distinguishing modifiers that legacy ANSI cannot (Cmd ⌘, Hyper ✦) and reporting event types (press, repeat, release).

### Auto-Enable/Disable

`run()` **auto-detects** Kitty protocol support and enables it by default on supported terminals (Ghostty, Kitty, WezTerm, foot). No configuration needed:

```typescript
import { run } from "@silvery/term/runtime"

// Kitty protocol is auto-enabled — ⌘ and ✦ modifiers just work
await run(<App />)
```

To opt out or use specific flags:

```typescript
import { KittyFlags } from "@silvery/term"

// Disable Kitty protocol (legacy ANSI only)
await run(<App />, { kitty: false })

// Specific flags (key release events, associated text, etc.)
await run(<App />, {
  kitty: KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS
})
```

When Kitty protocol is enabled (auto-detected or explicit):

1. Silvery enables with `KittyFlags.DISAMBIGUATE` (flag 1)
2. On app exit, Silvery sends `CSI < u` to restore the previous keyboard mode

When `kitty: <number>`, Silvery enables with the specified flags directly.

### Protocol Detection

For manual detection outside of `run()`:

```typescript
import { detectKittyFromStdio, detectKittySupport, type KittyDetectResult } from "@silvery/term"

// Convenience: uses real stdin/stdout
const result = await detectKittyFromStdio(process.stdout, process.stdin, 200)
// result: { supported: boolean, flags: number, buffered?: string }

// Low-level: custom I/O functions
const result = await detectKittySupport(
  (s) => socket.write(s), // write function
  (ms) => readWithTimeout(ms), // read function (returns string | null)
  200, // timeout in ms
)
```

The `buffered` field contains any non-response data read during detection (user input that arrived while waiting).

### Protocol Control

Manual control functions (auto-enable handles these for you):

```typescript
import { enableKittyKeyboard, disableKittyKeyboard, queryKittyKeyboard, KittyFlags } from "@silvery/term"

// Enable with default flags (disambiguate only)
stdout.write(enableKittyKeyboard())

// Enable with specific flags
stdout.write(enableKittyKeyboard(KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS))

// Query terminal support (response: CSI ? flags u)
stdout.write(queryKittyKeyboard())

// Disable (pop mode stack)
stdout.write(disableKittyKeyboard())
```

### Flags

| Flag               | Value | Description                                  |
| ------------------ | ----- | -------------------------------------------- |
| `DISAMBIGUATE`     | 1     | Disambiguate escape codes                    |
| `REPORT_EVENTS`    | 2     | Report event types (press/repeat/release)    |
| `REPORT_ALTERNATE` | 4     | Report alternate keys (shifted, base layout) |
| `REPORT_ALL_KEYS`  | 8     | Report all keys as escape codes              |
| `REPORT_TEXT`      | 16    | Report associated text as codepoints         |

Flags are a bitfield. Combine with `|`: `KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS`.

### Sequence Format

Full Kitty sequence format:

```
CSI codepoint[:shifted_codepoint[:base_layout_key]] [; modifiers[:event_type] [; text_codepoints]] u
```

### Modifier Parsing

Modifiers are a 1-based bitfield (subtract 1 for the raw bitfield):

| Bit | Modifier | macOS Name |
| --- | -------- | ---------- |
| 0   | Shift    | ⇧ Shift    |
| 1   | Alt/Meta | ⌥ Opt      |
| 2   | Ctrl     | ⌃ Ctrl     |
| 3   | Super    | ⌘ Cmd      |
| 4   | Hyper    | ✦ Hyper    |
| 6   | CapsLock | CapsLock   |
| 7   | NumLock  | NumLock    |

All seven modifiers are independently distinguishable. Parsed values on the `Key` object:

```typescript
useInput((input, key) => {
  if (key.super && input === "j") handleCmdJ() // ⌘J
  if (key.hyper && key.ctrl) handleHyperCtrl() // ✦⌃
})
```

### Extended Key Fields

Available on `ParsedKeypress` (from `parseKeypress()`):

| Field            | Type          | Flag Required      | Description                                    |
| ---------------- | ------------- | ------------------ | ---------------------------------------------- |
| `eventType`      | `1 \| 2 \| 3` | `REPORT_EVENTS`    | 1=press, 2=repeat, 3=release                   |
| `shiftedKey`     | `string`      | `REPORT_ALTERNATE` | Character when ⇧ is held                       |
| `baseLayoutKey`  | `string`      | `REPORT_ALTERNATE` | Key on US layout (for international keyboards) |
| `capsLock`       | `boolean`     | Any                | CapsLock is active                             |
| `numLock`        | `boolean`     | Any                | NumLock is active                              |
| `associatedText` | `string`      | `REPORT_TEXT`      | Actual text the key produces                   |

### Event Types

When `REPORT_EVENTS` (flag 2) is enabled, the terminal reports press (1), repeat (2), and release (3) events:

```typescript
useInput((input, key) => {
  if (key.eventType === 1) onKeyDown(input) // Initial press
  if (key.eventType === 2) onKeyRepeat(input) // Key held down
  if (key.eventType === 3) onKeyUp(input) // Key released
})
```

### Terminal Support

| Terminal     | Kitty Protocol | Cmd ⌘ | Hyper ✦ | Event Types |
| ------------ | -------------- | ----- | ------- | ----------- |
| Ghostty      | Yes            | Yes   | Yes     | Yes         |
| Kitty        | Yes            | Yes   | Yes     | Yes         |
| WezTerm      | Yes            | Yes   | Yes     | Yes         |
| foot         | Yes            | Yes   | Yes     | Yes         |
| iTerm2       | No             | No    | No      | No          |
| Terminal.app | No             | No    | No      | No          |

Unsupported terminals ignore the enable sequence — no error, no side effects.

## Mouse Protocol (SGR 1006)

Silvery supports SGR mouse tracking for click, drag, scroll, and motion events.

### Auto-Enable/Disable

Mouse tracking is **enabled by default** in `run()`. When active, the terminal captures mouse events and native text selection (copy/paste) requires holding Shift (or Option on macOS in some terminals).

```typescript
// Mouse is on by default — click, scroll, and drag events just work
await run(<App />)

// Disable to restore native copy/paste behavior
await run(<App />, { mouse: false })
```

Silvery enables three mouse modes together:

| Mode            | Sequence     | Description                           |
| --------------- | ------------ | ------------------------------------- |
| X10 basic       | `CSI ?1000h` | Button press events                   |
| Button tracking | `CSI ?1002h` | Press + drag motion                   |
| SGR encoding    | `CSI ?1006h` | Extended format (no 223-column limit) |

On cleanup, all three are disabled in reverse order.

### SGR Sequence Format

```
CSI < button;column;row M     (press/motion)
CSI < button;column;row m     (release)
```

Column and row are 1-indexed in the protocol, parsed to 0-indexed by `parseMouseSequence()`.

### Parsing

```typescript
import { parseMouseSequence, isMouseSequence, type ParsedMouse } from "@silvery/term"

// Quick check
if (isMouseSequence(rawInput)) {
  const event = parseMouseSequence(rawInput)
  // event: { button: 0, x: 9, y: 4, action: "down", shift: false, meta: false, ctrl: false }
}
```

The runtime handles mouse parsing automatically — mouse sequences are dispatched as `mouse` events instead of being passed to `useInput`.

### Button Encoding

| Bits | Value | Meaning                           |
| ---- | ----- | --------------------------------- |
| 0-1  | 0-2   | Button: 0=left, 1=middle, 2=right |
| 2    | +4    | ⇧ Shift held                      |
| 3    | +8    | ⌥ Meta/Alt held                   |
| 4    | +16   | ⌃ Ctrl held                       |
| 5    | +32   | Motion (drag)                     |
| 6-7  | +64   | Wheel: 0=up, 1=down               |

### Terminal Support

| Terminal     | SGR Mouse | Notes |
| ------------ | --------- | ----- |
| Ghostty      | Yes       |       |
| Kitty        | Yes       |       |
| WezTerm      | Yes       |       |
| iTerm2       | Yes       |       |
| foot         | Yes       |       |
| Terminal.app | Yes       | Basic |
| xterm        | Yes       | 277+  |

## OSC 52 Clipboard

Silvery provides clipboard access via the OSC 52 terminal protocol. This works across SSH sessions — the clipboard operation is handled by the local terminal, not the remote host.

### Protocol

```
Copy:     ESC ] 52 ; c ; <base64> BEL
Query:    ESC ] 52 ; c ; ? BEL
Response: ESC ] 52 ; c ; <base64> BEL  (or ST terminator)
```

Text is base64-encoded in the escape sequence. Terminals support both BEL (`\x07`) and ST (`ESC \`) as terminators.

### API

```tsx
import { copyToClipboard, requestClipboard, parseClipboardResponse } from "@silvery/term"

// Copy text to system clipboard
copyToClipboard(process.stdout, "Hello, clipboard!")

// Request clipboard contents (terminal sends response asynchronously)
requestClipboard(process.stdout)

// Parse the terminal's response
const text = parseClipboardResponse(rawInput) // string | null
```

| Function                 | Description                                                     |
| ------------------------ | --------------------------------------------------------------- |
| `copyToClipboard`        | Write base64-encoded text to clipboard via OSC 52               |
| `requestClipboard`       | Send OSC 52 query to request clipboard contents                 |
| `parseClipboardResponse` | Decode an OSC 52 response (handles both BEL and ST terminators) |

### Terminal Support

| Terminal     | OSC 52 | Notes                     |
| ------------ | ------ | ------------------------- |
| Ghostty      | Yes    |                           |
| Kitty        | Yes    |                           |
| WezTerm      | Yes    |                           |
| iTerm2       | Yes    |                           |
| xterm        | Yes    |                           |
| foot         | Yes    |                           |
| tmux         | Yes    | `set -g set-clipboard on` |
| Terminal.app | No     |                           |

### SSH Transparency

OSC 52 is particularly useful over SSH because the escape sequence is forwarded through the SSH connection to the local terminal. The clipboard operation happens on the user's machine, not the remote server. This means `copyToClipboard` works even in remote sessions without any special configuration.

## Bracketed Paste Mode

Bracketed paste mode lets the app distinguish pasted text from typed input. When enabled, the terminal wraps pasted content with start/end markers, delivering it as a single event rather than individual keystrokes.

### Protocol

DEC private mode 2004:

```
Enable:       CSI ? 2004 h      (ESC [ ? 2004 h)
Disable:      CSI ? 2004 l      (ESC [ ? 2004 l)
Paste start:  CSI 200 ~         (ESC [ 200 ~)
Paste end:    CSI 201 ~         (ESC [ 201 ~)
```

### API

```tsx
import { enableBracketedPaste, disableBracketedPaste, parseBracketedPaste, PASTE_START, PASTE_END } from "@silvery/term"

// Enable/disable (the run() runtime handles this automatically)
enableBracketedPaste(process.stdout)
disableBracketedPaste(process.stdout)

// Parse pasted content from raw input
const result = parseBracketedPaste(rawInput)
if (result) {
  console.log("Pasted:", result.content)
}
```

| Export                  | Description                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `enableBracketedPaste`  | Write `CSI ? 2004 h` to enable paste bracketing                                     |
| `disableBracketedPaste` | Write `CSI ? 2004 l` to disable paste bracketing                                    |
| `parseBracketedPaste`   | Extract paste content from raw input (returns `{ type: "paste", content }` or null) |
| `PASTE_START`           | The paste start marker string (`ESC [ 200 ~`)                                       |
| `PASTE_END`             | The paste end marker string (`ESC [ 201 ~`)                                         |

### Runtime Integration

The `run()` runtime automatically enables bracketed paste mode. Use the `usePaste` hook (from `silvery/runtime`) to receive paste events:

```tsx
import { usePaste } from "@silvery/term/runtime"

usePaste((text) => {
  insertText(text)
})
```

For the `render()` API, use the `onPaste` option on `useInput`:

```tsx
useInput(handler, { onPaste: (text) => handlePaste(text) })
```

### Terminal Support

| Terminal  | Bracketed Paste | Notes |
| --------- | --------------- | ----- |
| Ghostty   | Yes             |       |
| Kitty     | Yes             |       |
| WezTerm   | Yes             |       |
| iTerm2    | Yes             |       |
| Alacritty | Yes             |       |
| xterm     | Yes             |       |
| tmux      | Yes             |       |
| foot      | Yes             |       |

## Terminal Notifications

Silvery provides a notification API that auto-detects the terminal and sends notifications using the best available method.

```tsx
import { notify, notifyITerm2, notifyKitty, BEL } from "@silvery/term"

// Auto-detect terminal and send notification
notify(process.stdout, "Build complete", { title: "silvery" })

// Terminal-specific functions
notifyITerm2("Build complete") // OSC 9 (iTerm2)
notifyKitty("Build complete", { title: "silvery" }) // OSC 99 (Kitty)
```

| Function       | Protocol | Description                                         |
| -------------- | -------- | --------------------------------------------------- |
| `notify`       | Auto     | Detects terminal via `TERM_PROGRAM`/`TERM` env vars |
| `notifyITerm2` | OSC 9    | Returns iTerm2 notification escape string           |
| `notifyKitty`  | OSC 99   | Returns Kitty notification escape string            |
| `BEL`          | BEL      | Basic terminal bell character (`\x07`)              |

`notify()` auto-selects: iTerm2 uses OSC 9, Kitty uses OSC 99, other terminals fall back to BEL (audible/visual bell).

## Standards Reference

### ECMA-48 (ISO 6429)

The standard defining CSI and OSC sequences. Published 1976, still the foundation.

- CSI format: `ESC [ <params> <intermediate> <final>`
- OSC format: `ESC ] <params> <ST>`

### XTerm Control Sequences

De facto standard for modern terminals. Extends ECMA-48 with:

- Mouse reporting
- Bracketed paste
- Window manipulation
- True color

Documentation: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html

### terminfo/termcap

Database of terminal capabilities. Largely obsolete for modern apps - most now assume xterm-compatible baseline.

Key capability names:

- `cup` - cursor position
- `clear` - clear screen
- `smcup`/`rmcup` - enter/exit alternate screen
- `setaf`/`setab` - set foreground/background color

## Text Sizing Protocol (OSC 66)

The text sizing protocol (OSC 66) lets the app specify how many cells a character should occupy. This solves the measurement/rendering mismatch for Private Use Area (PUA) characters (nerdfont icons, powerline symbols) that are measured as 1-cell but rendered as 2-cell by modern terminals.

Text sizing is **auto-enabled by default** in `run()` on supported terminals:

```tsx
// Text sizing is on by default (auto-detected)
await run(<App />)

// Force disable
await run(<App />, { textSizing: false })
```

See [text-sizing.md](text-sizing.md) for full documentation.

| Terminal  | OSC 66 Support |
| --------- | -------------- |
| Kitty     | v0.40+         |
| Ghostty   | Yes            |
| WezTerm   | No             |
| iTerm2    | No             |
| Alacritty | No             |

## See Also

- [ANSI escape code (Wikipedia)](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [Escape Code Standards (Julia Evans)](https://jvns.ca/blog/2025/03/07/escape-code-standards/)
- [The Chaos of Terminal Standards](https://or1k.net/posts/ansi-escape-codes-terminal-standards/)
