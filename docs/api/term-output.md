# term.output

Single-owner stdout / stderr / console mediator for a Silvery session. Intercepts foreign writes during alt-screen rendering so only the render pipeline reaches the terminal.

`term.output` replaces the old `OutputGuard` helper. Same implementation, Term-owned lifecycle.

## Shape

```ts
import type { ReadSignal } from "@silvery/signals"

interface Output extends Disposable {
  write(data: string | Uint8Array): boolean
  readonly active: ReadSignal<boolean>
  activate(options?: OutputOptions): void
  deactivate(): void
  readonly suppressedCount: number
  readonly redirectedCount: number
  dispose(): void
}

interface OutputOptions {
  stderrLog?: string
  bufferStderr?: boolean
}
```

`active` is a read-only alien-signal — call `term.output.active()` to read, or subscribe with `effect(() => term.output.active())`. Only the owner's `activate()` / `deactivate()` writes to it. `suppressedCount` and `redirectedCount` stay as plain numbers — they advance on every write and reactivity would flood subscribers.

```ts
import { effect } from "@silvery/signals"

effect(() => {
  if (term.output?.active()) {
    // intercepts live — silvery is the only writer
  }
})
```

## Access

```ts
using term = createTerm()

if (!term.output) {
  // headless or emulator-backed Term — no real stdout to own
  return
}
```

`term.output` is `undefined` on headless Terms and emulator-backed (termless) Terms — they have no real stdout to mediate. On Node-backed Terms it is constructed eagerly but **inactive**: no intercepts are installed until you call `activate()`.

## Lifecycle

Unlike `term.input`, Output starts deactivated. Installing stdout intercepts before protocol setup would suppress the setup ANSI itself. The canonical order is:

1. Construct the Term.
2. Enter the alt screen via `term.modes.altScreen(true)` (raw ANSI reaches the terminal).
3. `term.output.activate()` — from now on only `term.output.write(…)` bypasses the intercept.
4. Render loop.
5. On exit, `term.output.deactivate()` restores originals.
6. `dispose()` is automatic via `using`.

Inside Silvery's runtime this order is managed for you. You only reach for `activate()` / `deactivate()` when building a custom runtime or temporarily pausing the Output intercept (log-dump workflows, suspend/resume).

## `write(data)`

Write render output to stdout. When active, bypasses the intercept; when inactive, forwards to the current `stdout.write`.

```ts
term.output!.write(ansiDiff)
```

Every write from Silvery's render pipeline goes through this method. It is the **only** path that reaches stdout while Output is active.

## `activate(options?)`

Installs the intercepts:

- `process.stdout.write` — foreign writes are suppressed (return `true`, count in `suppressedCount`).
- `process.stderr.write` — redirected to `options.stderrLog` or `process.env.DEBUG_LOG` (file), buffered (if `bufferStderr: true` and flushed on deactivate), or silently dropped.
- `console.log/info/warn/error/debug` — redirected through the same stderr sink (Bun / Node's console bypasses `process.stderr.write`, so both paths need patching).

Idempotent — calling `activate()` while already active is a no-op. Options provided at construction (`createOutput(defaults)`) are merged with `activate()` options.

```ts
// Redirect all foreign stderr to /tmp/session.log for post-mortem.
term.output!.activate({ stderrLog: "/tmp/session.log" })
```

## `deactivate()`

Restores the original `stdout.write`, `stderr.write`, and `console.*` methods. Closes the stderr log fd if open. Flushes buffered stderr (if `bufferStderr: true` was used) through the original stream so the operator sees it post-exit.

Idempotent. Safe to call before `dispose()`, which will re-call it.

## Suppression vs redirection

| Stream           | While active       | Where it goes                                                |
| ---------------- | ------------------ | ------------------------------------------------------------ |
| stdout (foreign) | **Suppressed**     | Dropped — `suppressedCount++`, preview logged at debug level |
| stdout (silvery) | **Passes through** | Real terminal (via saved original `write`)                   |
| stderr (any)     | **Redirected**     | `stderrLog` file, `bufferStderr`, or dropped                 |
| console.\*       | **Redirected**     | Same sink as stderr                                          |

Foreign stdout is silently dropped because any external library printing to stdout during alt-screen would corrupt the rendered frame. If the app needs a chatter channel, point `DEBUG_LOG=/tmp/debug.log` at a file and stderr + console writes land there.

## Relation to `term.console`

`term.output` is a **sink** — foreign console writes are dropped or funnelled to the stderr log.

[`term.console`](/api/term-console) is a **tap** — it records every `console.*` call into an in-memory buffer that can be replayed to the real streams at exit, or rendered inside the TUI.

Call order matters: `term.console.capture()` first, then `term.output.activate()`, so the tap records the entry before the sink drops it. Restore in reverse: `term.output.deactivate()` then `term.console.restore()`.

## See also

- [term.console](/api/term-console) — console.\* capture + replay
- [term.modes](/api/term-modes) — protocol-mode setup (called before `activate`)
- [Term — the I/O umbrella](/guide/term)
