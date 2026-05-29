# Term — the I/O umbrella

`Term` is Silvery's terminal abstraction. It wraps the one shared global you can't escape — the user's terminal — and exposes it as a set of **typed sub-owners**, one per class of I/O state. Instead of the host, the app, and every helper each reaching for `process.stdin` and `process.stdout`, every concern has a single owner that lives for the Term's lifetime.

This page is the roadmap to those sub-owners. For each one there's an API reference with the full surface.

## Why sub-owners

`process.stdin` and `process.stdout` are multi-tenant globals. So are the protocol modes that toggle on top of them — raw mode, alternate screen, bracketed paste, Kitty keyboard, mouse tracking, focus reporting — and the resize events, signal handlers, and `console.*` interceptors that live alongside them.

The historical pattern was "polite snapshot, polite restore":

```ts
// Tarnished — async-unsafe capture/restore
const wasRaw = stdin.isRaw
if (!wasRaw) stdin.setRawMode(true)
try {
  await doProbe()
} finally {
  if (!wasRaw) stdin.setRawMode(false) // ← races with other tenants
}
```

When two tenants overlap across an `await`, the last `finally` to run wins — silently disabling raw mode and killing the host's input. The async concurrency makes the failure non-deterministic, which is why the pattern looks safe until the day it isn't.

Sub-owners fix the class of bug, not the symptom. Each one owns exactly one resource, is set once at session start, and restored once at dispose. Tenants don't toggle globals — they ask the owner for a capability and the owner routes the work.

## The six sub-owners

Each sub-owner is a field on `Term`. They are constructed lazily (cheap — no syscalls, no ANSI until you write a signal or call a setter), share the Term's dispose lifetime, and expose their state as alien-signals (callable getters — `modes.altScreen()`, `size.cols()`, `output.active()`, `console.capturing()`) plus imperative mutators where applicable. `Symbol.dispose` restores everything the owner activated.

| Sub-owner      | Owns                                                          | Reference                         |
| -------------- | ------------------------------------------------------------- | --------------------------------- |
| `term.input`   | stdin raw mode, the single `data` listener, probe responses   | [term.input](/api/term-input)     |
| `term.output`  | stdout, stderr, and `console.*` during the alt-screen session | [term.output](/api/term-output)   |
| `term.modes`   | Raw mode, alt screen, bracketed paste, Kitty, mouse, focus    | [term.modes](/api/term-modes)     |
| `term.size`    | Terminal cols/rows — live, reactive, coalesced on resize      | [term.size](/api/term-size)       |
| `term.signals` | `SIGINT`/`SIGTERM`/`SIGTSTP`/`exit` handler scope             | [term.signals](/api/term-signals) |
| `term.console` | `console.log/info/warn/error/debug` capture + replay          | [term.console](/api/term-console) |

`term.input`, `term.output`, and `term.console` are `undefined` on Terms that don't own a real terminal (headless test terms, emulator-backed terms). The others are always present.

## Anti-patterns

**Never touch `process.stdin` or `process.stdout` from app code.** Silvery owns them for the Term's lifetime. Any `process.stdin.setRawMode(…)`, `process.stdout.write(…)`, or `process.stdin.on("data", …)` outside the sub-owners will race the session.

**Never reach for raw streams.** `term.stdin` and `term.stdout` are not part of the `Term` interface — the sub-owners are the only supported surface. Any helper you write for input or output should accept a sub-owner (`Input`, `Output`), never a `NodeJS.ReadStream` or `NodeJS.WriteStream`.

**Never toggle a protocol mode mid-session.** `term.modes` is set once at startup and restored once on dispose. Suspend/resume flows (SIGTSTP) are the only legitimate mid-session toggles, and they still go through `term.modes` so the owner's state stays consistent.

**Never call `patchConsole()` directly.** The standalone helper has been folded into `term.console`. Use `term.console.capture({ suppress: true })` and `term.console.replay(stdout, stderr)` at exit.

## How-to recipes

### Probe the terminal for capabilities

`term.input.probe(…)` issues a query, collects response bytes from the shared buffer, and resolves with the first match — without touching raw mode or installing a new listener.

```ts
using term = createTerm()
if (!term.input) return // non-TTY — skip the probe

// Ask the terminal for its background color (OSC 11).
const bg = await term.input.probe({
  query: "\x1b]11;?\x07",
  parse: (acc) => {
    const match = acc.match(/\x1b\]11;rgb:([0-9a-f/]+)\x07/)
    if (!match) return null
    return { result: match[1], consumed: match[0].length }
  },
  timeoutMs: 50,
})
```

Multiple probes can run concurrently — the owner tries parsers in registration order and returns bytes one parser consumes to the shared buffer for the next.

### Enter the alternate screen

`term.modes.altScreen(true)` writes DEC 1049 through `term.output`, and `dispose()` restores it. Each mode on `term.modes` is an alien-signals `Signal` — call with no arguments to read, call with a value to write, subscribe via `effect(() => term.modes.altScreen())`.

```ts
using term = createTerm()
term.modes.altScreen(true)
term.modes.rawMode(true)
term.modes.bracketedPaste(true)
// render loop…
// dispose restores everything this owner activated, in reverse order.
```

The full session startup happens in one place. No subsystem re-toggles the modes later.

### React to resize

`term.size` is backed by [alien-signals](https://github.com/stackblitz/alien-signals) and coalesces PTY burst resizes within one 60 Hz frame (16 ms). `cols`, `rows`, and `snapshot` are callable `ReadSignal`s — read with `size.cols()`, subscribe with `effect(() => size.cols())`:

```ts
using term = createTerm()
import { effect } from "@silvery/signals"

console.log(`starting at ${term.size.cols()}×${term.size.rows()}`)

const stop = effect(() => {
  console.log(`resized to ${term.size.cols()}×${term.size.rows()}`)
})
// stop() to unsubscribe
```

Inside React, `useBoxRect` and the runtime context already read through `term.size` — components get rect updates without subscribing directly.

### Capture `console.*` during the TUI session

`term.console` taps the global console so stray logs don't corrupt the alt screen, and replays them to the real streams on exit.

```ts
using term = createTerm()

term.console.capture({ suppress: true })
// render loop…

// At exit, replay the captured log to the normal streams:
if (term.console) {
  term.console.replay(process.stdout, process.stderr)
  const { total, errors, warnings } = term.console.getStats()
  console.log(`${total} log lines (${errors} errors, ${warnings} warnings)`)
}
```

## Ownership axiom

Silvery owns terminal I/O. Components and helpers never touch `process.*` or emit ANSI directly. They go through the Term's sub-owners. When a feature needs something the sub-owners don't cover, grow the sub-owner — don't punch through it.

This is the structural answer to the whole class of races that kept surfacing in pre-owner silvery: if there's exactly one writer per resource, there's nothing to race.
