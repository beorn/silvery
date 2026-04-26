# term.input

Single-owner stdin mediator for a Silvery session. Owns raw mode, the single `data` listener, and probe response routing.

`term.input` replaces direct `process.stdin.setRawMode`, `process.stdin.on("data", …)`, and the capture-and-restore `wasRaw` pattern that races under async. One owner per Term — tenants request capabilities (`probe`, `onData`), they don't touch stdin.

## Shape

```ts
interface Input extends Disposable {
  probe<T>(opts: {
    query: string
    parse: (acc: string) => { result: T; consumed: number } | null
    timeoutMs: number
  }): Promise<T | null>
  onData(handler: (chunk: string) => void): () => void
  readonly active: boolean
  readonly resolvedCount: number
  readonly timedOutCount: number
}
```

## Access

```ts
using term = createTerm()

if (!term.input) {
  // headless term, or stdin is not a TTY — probes + onData unavailable
  return
}
```

`term.input` is `undefined` for headless Terms and for Node-backed Terms whose stdin is not a TTY (piped input, `/dev/null`). The getter is lazy — the InputOwner is constructed on first access and cached for the Term's lifetime.

## Termios contract

The owner sets raw mode **once** at construction, restores it **once** at dispose. It never toggles raw mid-session. If you need a different mode, request it through [`term.modes`](/api/term-modes); the owner coexists with — but does not manage — the protocol modes.

If raw mode is already set when the owner is constructed (e.g. a pre-session probe ran and handed off), the owner records that and skips the terminal flip. Dispose only restores modes the owner itself activated, so the next owner's stdin setup is safe.

## `probe(opts)`

Issue a terminal query, accumulate response bytes into the shared buffer, run `parse` on each chunk, resolve with the first match.

| Option      | Type                                            | Meaning                                                      |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `query`     | `string`                                        | Bytes to write to stdout. `""` for pure-listen probes.       |
| `parse`     | `(acc: string) => { result; consumed } \| null` | Return `null` until the buffer is parseable.                 |
| `timeoutMs` | `number`                                        | Resolves with `null` if no match arrives within this window. |

### OSC query pattern

```ts
// Ask the terminal for its background color (OSC 11).
const bg = await term.input!.probe({
  query: "\x1b]11;?\x07",
  parse: (acc) => {
    const match = acc.match(/\x1b\]11;rgb:([0-9a-f/]+)\x07/)
    if (!match) return null
    return { result: match[1]!, consumed: match[0].length }
  },
  timeoutMs: 50,
})
```

### Concurrent probes

You can issue several probes at once. The owner tries parsers in registration order on every chunk. A probe that returns `{ result, consumed }` consumes its bytes from the shared buffer; remaining bytes continue through subsequent parsers (and finally to `onData` subscribers).

```ts
const [colors, cursor, kitty] = await Promise.all([
  probeColors(stdin, stdout, { inputOwner: term.input }),
  queryCursorPosition(term.input!),
  detectKittyKeyboard(term.input!),
])
```

Probes are order-sensitive: put strict parsers (fixed-length responses) before lenient ones (regex-on-buffer).

### Parse result `consumed`

`consumed` is the number of bytes the owner should splice from the buffer front. It need not equal the full buffer length — parsers that match a non-prefix region should locate and return the exact prefix length to splice.

### Timeout semantics

A timed-out probe resolves with `null`. The shared buffer continues draining; a late response for the timed-out probe falls through to `onData` subscribers (the key parser typically discards unrecognized bytes).

## `onData(handler)`

Subscribe to non-probe data — any bytes that arrive when no registered probe consumed them. The term-provider's key/mouse parser is the canonical consumer.

```ts
const unsubscribe = term.input!.onData((chunk) => {
  // Process bytes that didn't match any pending probe.
})
```

Returns an unsubscribe function. Multiple subscribers can coexist; each gets the full chunk.

## Lifecycle + stats

- `active` — `true` until `dispose()` runs.
- `resolvedCount` / `timedOutCount` — cumulative counts for diagnostics.
- `dispose()` (and `Symbol.dispose`) — restores raw to `false` (unless constructed with `retainRawModeOnDispose`), pauses stdin, removes the listener, resolves pending probes with `null`, clears timers. Idempotent.

The Term's own `dispose()` cascades to `term.input.dispose()` — normal `using term = createTerm()` usage requires no explicit disposal.

## See also

- [term.modes](/api/term-modes) — protocol-mode setters (raw mode coexists with input ownership)
- [term.output](/api/term-output) — stdout/stderr mediator
- [Term — the I/O umbrella](/guide/term) — the overall architecture
