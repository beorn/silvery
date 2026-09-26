# term.input

Single-owner stdin mediator for a Silvery session. Owns raw mode, the single `data` listener, and probe response routing.

`term.input` replaces direct `process.stdin.setRawMode`, `process.stdin.on("data", …)`, and the capture-and-restore `wasRaw` pattern that races under async. One owner per Term — tenants request capabilities (`probe`, typed event subscriptions), they don't touch stdin.

## Shape

```ts
interface Input extends Disposable {
  probe<T>(opts: {
    query: string
    parse: (acc: string) => { result: T; consumed: number } | null
    timeoutMs: number
  }): Promise<T | null>
  probeTransaction<T>(opts: {
    query: string
    recognize: (
      acc: string,
    ) =>
      | { status: "pending"; consumed: readonly Span[] }
      | { status: "complete"; consumed: readonly Span[]; value: T }
    timeoutMs: number
    maxBufferBytes: number
  }): Promise<ProbeTransactionResult<T>>
  onKey(handler: (event: KeyEvent) => void): () => void
  onMouse(handler: (event: ParsedMouse) => void): () => void
  onPaste(handler: (event: PasteEvent) => void): () => void
  onFocus(handler: (event: FocusEvent) => void): () => void
  // Mode-2031 color-scheme notice (`CSI ? 997 ; 1|2 n`); needs term.modes.colorSchemeReporting(true)
  onColorSchemeNotice(handler: (scheme: "dark" | "light") => void): () => void
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

| Option      | Type                                            | Meaning                                                                  |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `query`     | `string`                                        | Bytes to write to stdout. `""` for pure-listen probes.                   |
| `parse`     | `(acc: string) => { result; consumed } \| null` | Return `null` until the buffer is parseable.                             |
| `timeoutMs` | `number`                                        | Maximum call-to-result wait, including time queued behind a transaction. |

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

Probes are order-sensitive: put strict parsers (fixed-length responses) before lenient ones (regex-on-buffer). Registering a probe and writing its query are atomic: the owner installs the parser first, so even a synchronous terminal reply cannot leak into normal input.

### Parse result `consumed`

`consumed` is the number of UTF-16 code units the owner should splice from the buffer front. It need not equal the full buffer length — parsers that match a non-prefix region should locate and return the exact prefix length to splice.

### Timeout semantics

A timed-out probe resolves with `null`. The shared buffer continues draining; a late response for the timed-out probe falls through to the typed event parser (which typically discards an unrecognized terminal reply).

## `probeTransaction(opts)`

Use a transaction when one atomic query produces several protocol responses and a final response acts as the completion barrier. The transaction has exclusive ownership of accumulated stdin bytes until it completes, times out, overflows, or fails. Its recognizer reports exact half-open UTF-16 code-unit spans for protocol text; every gap is replayed through the typed input parser once, in its original input batch and arrival order, before queued ordinary probes start. `maxBufferBytes` remains a UTF-8 byte bound.

```ts
const result = await term.input!.probeTransaction({
  query: `${kittyQuery}${xtversionQuery}${da1Query}`,
  recognize: recognizeTerminalCapabilities,
  timeoutMs: 150,
  maxBufferBytes: 4096,
})

if (result.status === "complete") {
  useEvidence(result.value)
}
```

The result is typed and fail-loud: `complete`, `timeout`, `busy`, `overflow`, or `error`. Starting a transaction while another transaction or an ordinary probe is active returns `busy` without writing its query. Ordinary probes requested during a transaction queue until replay finishes, but their timeout still starts at the original call. Overflow reports both the configured bound and received byte count; it never silently truncates the buffer.

Transactions are the only supported way to correlate several responses. Do not install a temporary stdin listener or run several ordinary probes in parallel for a protocol handshake—the session still has exactly one parser and one raw-mode owner.

## Typed event subscriptions

Bytes no active probe consumes pass through the owner's canonical parser exactly once. Subscribe to the structured event family you need:

```ts
const stopKeys = term.input!.onKey(({ input, key }) => handleKey(input, key))
const stopMouse = term.input!.onMouse((event) => handleMouse(event))
const stopPaste = term.input!.onPaste(({ text }) => insert(text))
const stopFocus = term.input!.onFocus(({ focused }) => setFocused(focused))
```

Each method returns an unsubscribe function. Multiple subscribers can coexist, but none attaches another stdin listener; the InputOwner fans out the parsed event.

## Lifecycle + stats

- `active` — `true` until `dispose()` runs.
- `resolvedCount` / `timedOutCount` — cumulative counts for diagnostics.
- `dispose()` (and `Symbol.dispose`) — restores the terminal state this owner activated, pauses stdin, removes the listener, resolves ordinary probes with `null`, resolves an active transaction with typed `error: disposed`, and clears timers. Idempotent.

The Term's own `dispose()` cascades to `term.input.dispose()` — normal `using term = createTerm()` usage requires no explicit disposal.

## See also

- [term.modes](/api/term-modes) — protocol-mode setters (raw mode coexists with input ownership)
- [term.output](/api/term-output) — stdout/stderr mediator
- [Term — the I/O umbrella](/reference/term) — the overall architecture
