# term.modes

Single authority for terminal protocol modes, exposed as reactive signals. Owns raw mode, alternate screen, bracketed paste, Kitty keyboard, mouse tracking, and focus reporting.

`term.modes` consolidates the previously-scattered `enableMouse()` / `enableKittyKeyboard()` / `enableBracketedPaste()` / `setRawMode(true)` calls into a single owner whose state is a bundle of callable alien-signals `Signal<T>`s. Reads, writes, and subscriptions all flow through the same API.

## Shape

```ts
import type { Signal } from "@silvery/signals"

interface Modes extends Disposable {
  readonly rawMode: Signal<boolean>
  readonly altScreen: Signal<boolean>
  readonly bracketedPaste: Signal<boolean>
  readonly kittyKeyboard: Signal<number | false>
  readonly mouse: Signal<boolean>
  readonly focusReporting: Signal<boolean>
}
```

Each property is an alien-signals `Signal` — a callable value with three roles:

- **Read:** `modes.altScreen()` → `boolean`
- **Write:** `modes.altScreen(true)` — an internal effect emits the enable/disable ANSI as a side-effect
- **Subscribe:** `effect(() => modes.altScreen())` — fires on every change

## Access

```ts
using term = createTerm()
term.modes.altScreen(true)
term.modes.rawMode(true)
```

`term.modes` is always present (including on headless and emulator-backed Terms — they receive a no-op owner so callers don't need to branch). Construction is free — no ANSI or termios toggle until the first write to a signal.

## Reading and writing

Same-value writes are no-ops. alien-signals compares the new value against the current value and does not notify dependents when they match, so `modes.altScreen(true)` twice produces one enable sequence, and asking the enabled state after the second call still returns `true`:

```ts
modes.altScreen(true) // emits CSI ? 1049 h
modes.altScreen(true) // no-op — alien-signals equality
modes.altScreen() // true
modes.altScreen(false) // emits CSI ? 1049 l
```

## Subscribing

Any code path that wants to react to a mode change can open an effect:

```ts
import { effect } from "@silvery/signals"

const stop = effect(() => {
  if (modes.focusReporting()) {
    // react to focus-reporting becoming active
  }
})

// later
stop()
```

Because the owner itself installs one effect per mode to emit ANSI, subscribers run independently of the ANSI side-effect.

## Mode-by-mode behaviour

### `rawMode`

Toggles stdin termios raw mode. Uses the stdin stream passed at construction (normally `process.stdin`).

- TTY stdin: calls `stdin.setRawMode(on)`.
- Non-TTY stdin: no-op on the stream; the signal still reflects the intent (useful for tests).

Prefer a single `modes.rawMode(true)` at session start. Do not capture-and-restore around async work — see [the `wasRaw` anti-pattern note](/guide/term#anti-patterns).

### `altScreen`

Writes DEC private mode 1049 — enters the alternate screen buffer, hides the scrollback, and on restore brings the scrollback back:

- `true` → `CSI ? 1049 h`
- `false` → `CSI ? 1049 l`

### `bracketedPaste`

DEC private mode 2004 — the terminal wraps pasted text in `ESC [ 200 ~` / `ESC [ 201 ~`, letting the input parser treat paste as one event rather than synthetic keystrokes.

### `kittyKeyboard`

Enables the [Kitty keyboard protocol](/guide/kitty-protocol) with a flags bitfield; `false` disables. The owner writes the matching `CSI > flags u` / `CSI < u` sequence from `@silvery/ansi` on every change, so switching from one bitfield to another produces a fresh enable sequence.

```ts
import { KittyFlags } from "@silvery/ag-term/runtime"

term.modes.kittyKeyboard(
  KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS | KittyFlags.REPORT_TEXT,
)
```

| Flag                          | Bit | Meaning                                       |
| ----------------------------- | --- | --------------------------------------------- |
| `KittyFlags.DISAMBIGUATE`     | 1   | Disambiguate escape codes                     |
| `KittyFlags.REPORT_EVENTS`    | 2   | Report event types (press / repeat / release) |
| `KittyFlags.REPORT_ALTERNATE` | 4   | Report alternate keys                         |
| `KittyFlags.REPORT_ALL_KEYS`  | 8   | Report all keys as escape codes               |
| `KittyFlags.REPORT_TEXT`      | 16  | Report associated text                        |

### `mouse`

SGR mouse tracking — xterm modes 1003 (all motion + clicks) and 1006 (SGR encoding). Produces precise button + modifier reports.

### `focusReporting`

DEC private mode 1004 — the terminal emits `ESC [ I` / `ESC [ O` when the window gains or loses focus, letting the app dim / brighten UI accordingly.

## Suspend / resume

The only legitimate mid-session toggle path is `SIGTSTP` (Ctrl+Z). Before suspending, write `false` to each active mode:

```ts
term.modes.focusReporting(false)
term.modes.mouse(false)
term.modes.kittyKeyboard(false)
term.modes.bracketedPaste(false)
term.modes.altScreen(false)
term.modes.rawMode(false)
```

…and on resume (`SIGCONT`), re-apply in reverse order. Because every toggle goes through the owner, its internal state stays consistent and dispose still restores correctly.

## `dispose()`

Restores **only** what this owner activated, in reverse order:

1. `focusReporting(false)` → `CSI ? 1004 l`
2. `mouse(false)` → `CSI ? 1006 l` then `CSI ? 1003 l`
3. `kittyKeyboard(false)` → `CSI < u`
4. `bracketedPaste(false)` → `CSI ? 2004 l`
5. `altScreen(false)` → `CSI ? 1049 l`
6. `rawMode(false)` (stdin termios)

Dispose is implemented by writing `false` to each ever-activated signal — the same effect that emitted the enable ANSI now emits the disable ANSI. Modes that were never set stay untouched — this is important on shared stdin where a neighbouring owner may have them set intentionally. Idempotent.

## See also

- [term.input](/api/term-input) — coexists with raw mode but is the mediator for stdin data
- [term.output](/api/term-output) — writes ANSI on behalf of mode-signal effects once Output is active
- [Kitty Protocol](/guide/kitty-protocol) — what the flags mean
- [Term — the I/O umbrella](/guide/term)
