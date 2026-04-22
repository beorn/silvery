/**
 * Input owner — mediates ALL stdin raw-mode + data access within a silvery
 * session. Mirrors `OutputGuard` (`../ansi/output-guard.ts`) for stdout and
 * `forwardConsole` in loggily's worker.ts for cross-process output: one owner
 * per resource, tenants issue capability requests.
 *
 * ## Why
 *
 * `process.stdin` is a global, multi-tenant resource. The historical pattern —
 * each probe captures `wasRaw = stdin.isRaw` on entry and restores it in a
 * `finally` — races silently under async. When the tenants overlap (e.g.
 * `probeColors` invoked from a React `useEffect` during `term-provider.events()`
 * startup), the last `finally` to run wins, silently disabling raw mode and
 * killing the host TUI's input. See silvery commits `2d9ab59f` + `cea0460b`
 * for tenant-side patches that make each probe *individually* race-safe via
 * the `didSetRaw + listenerCount > 0` guard. Those patches stopped the bleed
 * but the ownership vacuum remained.
 *
 * ## The shape
 *
 * - Construction: sets raw mode, resumes, sets utf8 encoding ONCE. Attaches
 *   the single `stdin.on("data", …)` listener.
 * - `probe(opts)`: register a parser; on each incoming chunk the owner
 *   appends to a buffer, runs registered parsers (in registration order);
 *   the first parser whose `parse(buffer)` returns non-null consumes its
 *   declared bytes and resolves. Times out with `null` after `timeoutMs`.
 * - `onData(handler)`: anything not consumed by a probe fans out to
 *   subscribers (the term-provider's key/mouse pipeline).
 * - Dispose: restores raw=false, pauses stdin, removes the single listener,
 *   resolves all pending probes with `null`, clears all timers. Idempotent.
 *
 * ## Termios contract
 *
 * Raw mode is set ONCE at construction, restored ONCE at dispose. The owner
 * never toggles raw mid-session. Tenants requesting `probe()` don't touch
 * termios at all — they get a response-parse capability, not a terminal-io
 * capability.
 *
 * ## Relation to OutputGuard
 *
 * The owner is agnostic to whether OutputGuard is installed. If it is, the
 * caller passes a write function that routes through `outputGuard.writeStdout`;
 * if not, a bare `stdout.write` is fine. The owner's concern is stdin.
 *
 * ## Migration path
 *
 * Phase 1 (this bead): `probeColors` accepts an optional `InputOwner`. Host
 * TUI sessions construct one at `run()`/`createApp.run()` startup and thread
 * it through. Standalone callers (non-TUI) keep the existing race-safe
 * `didSetRaw + listenerCount` fallback in `probeColors`.
 *
 * Phase 2 (follow-up, separate bead): migrate the other three stdin probes —
 * `queryCursorFromStdio`, `detectKittyFromStdio`, `queryDeviceAttributes`,
 * plus the text-sizing + width-detection probes in create-app.tsx — onto
 * `inputOwner.probe()`. Once all five consumers are migrated, the inline
 * `stdin.setRawMode/on("data")` blocks in create-app.tsx can be deleted
 * entirely: the term-provider becomes the sole setter, and the owner replaces
 * `stdinCleanup` as the single termios-lifecycle authority.
 */

import { createLogger } from "loggily"

const log = createLogger("silvery:input-owner")

export interface InputOwner extends Disposable {
  /**
   * Write a query to stdout, accumulate stdin response bytes, run `parse`
   * against the accumulated buffer on each chunk. Resolves with the first
   * non-null parse result; resolves with `null` if `timeoutMs` elapses first.
   *
   * Consumed bytes (`consumed` from the parse result) are spliced out of the
   * shared buffer. Bytes before/after the consumed region remain available
   * to subsequent probes and/or the `onData` fanout.
   */
  probe<T>(opts: {
    /** Bytes to write to stdout. May be "" for pure-listen probes. */
    query: string
    /**
     * Run on the accumulated buffer each time new bytes arrive.
     * Return `null` when the buffer doesn't contain a parseable response yet;
     * return `{ result, consumed }` to resolve the probe with `result` and
     * splice `consumed` bytes out of the buffer.
     *
     * NOTE: `consumed` need not equal the full buffer length; probes may
     * consume a prefix or a middle slice. The owner splices the FIRST
     * `consumed` bytes from the buffer — parsers that match a non-prefix
     * region should locate + return the exact consumed prefix length.
     */
    parse: (acc: string) => { result: T; consumed: number } | null
    /** Maximum wait in ms before resolving with `null`. */
    timeoutMs: number
  }): Promise<T | null>

  /**
   * Subscribe to non-probe data — bytes that arrived when no active probe
   * matched. The term-provider's key/mouse parser is the canonical consumer.
   * Returns an unsubscribe function.
   */
  onData(handler: (chunk: string) => void): () => void

  /** True once construction succeeded and dispose() hasn't run. */
  readonly active: boolean
  /** Number of probes successfully resolved (result, not null) since activation. */
  readonly resolvedCount: number
  /** Number of probes that timed out since activation. */
  readonly timedOutCount: number

  dispose(): void
  [Symbol.dispose](): void
}

export interface InputOwnerOptions {
  /**
   * Alternate writer for outgoing query bytes (e.g.
   * `outputGuard.writeStdout`). Defaults to `stdout.write.bind(stdout)`.
   */
  writeStdout?: (data: string) => boolean | void
}

interface ProbeEntry {
  parse: (acc: string) => { result: unknown; consumed: number } | null
  resolve: (value: unknown) => void
  timer: ReturnType<typeof setTimeout>
  settled: boolean
}

export function createInputOwner(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  options: InputOwnerOptions = {},
): InputOwner {
  const writeStdout = options.writeStdout ?? ((data: string) => stdout.write(data))

  // Termios setup — ONCE. The contract is: if we're not a TTY, we become a
  // no-op owner (probes will time out, onData never fires); stdin is left
  // untouched. Exit early from termios setup but still install listeners
  // against a memory-only buffer so callers don't need to branch.
  const isTTY = Boolean(stdin.isTTY)
  let rawWasSet = false
  if (isTTY) {
    try {
      // Capture the prior state so dispose() can decide whether to restore
      // or no-op. In the canonical TUI lifecycle the owner is the FIRST
      // raw-mode setter of the session; `wasRaw` should be false. We record
      // it defensively so an owner constructed inside an already-raw session
      // (e.g. nested run()) doesn't flip raw=false on dispose and kill the
      // outer owner's input.
      const wasRaw = stdin.isRaw
      if (!wasRaw) {
        stdin.setRawMode(true)
        rawWasSet = true
      }
      stdin.resume()
      stdin.setEncoding("utf8")
    } catch (err) {
      log?.warn?.(`termios setup failed: ${String(err)}`)
    }
  }

  // Per-owner state.
  let buffer = ""
  const probes: ProbeEntry[] = []
  const dataSubscribers = new Set<(chunk: string) => void>()
  let resolvedCount = 0
  let timedOutCount = 0
  let disposed = false

  // Drain the current buffer against probes (in registration order) until
  // no probe consumes anything. Whatever remains is fanned out to data
  // subscribers. Called after every chunk and after every probe registration
  // (so probes that match already-buffered bytes resolve immediately).
  function drain(): void {
    if (disposed) return

    // Loop because one probe resolving may leave bytes that unblock the next.
    let progress = true
    while (progress && probes.length > 0 && buffer.length > 0) {
      progress = false
      for (let i = 0; i < probes.length; i++) {
        const entry = probes[i]!
        if (entry.settled) continue
        let parsed: { result: unknown; consumed: number } | null
        try {
          parsed = entry.parse(buffer)
        } catch (err) {
          log?.warn?.(`probe parse threw: ${String(err)}`)
          // A throwing parser is a bug in the caller. Resolve with null so
          // we don't deadlock; remove the probe; continue draining.
          entry.settled = true
          clearTimeout(entry.timer)
          entry.resolve(null)
          progress = true
          break
        }
        if (parsed !== null) {
          const consumed = Math.max(0, Math.min(parsed.consumed, buffer.length))
          buffer = buffer.slice(consumed)
          entry.settled = true
          clearTimeout(entry.timer)
          resolvedCount++
          entry.resolve(parsed.result)
          progress = true
          break
        }
      }
      // Sweep settled entries out of the array after each iteration to keep
      // the order-sensitive registration indices stable for the next pass.
      for (let i = probes.length - 1; i >= 0; i--) {
        if (probes[i]!.settled) probes.splice(i, 1)
      }
    }

    // Fan out any remaining bytes to non-probe subscribers. We deliver the
    // full remaining buffer and then clear it — subscribers (the key parser)
    // own their own incomplete-sequence buffering.
    if (buffer.length > 0 && dataSubscribers.size > 0) {
      const chunk = buffer
      buffer = ""
      for (const handler of dataSubscribers) {
        try {
          handler(chunk)
        } catch (err) {
          log?.warn?.(`onData handler threw: ${String(err)}`)
        }
      }
    }
  }

  // Single stdin listener — the whole reason this file exists. No other
  // code in the session should call stdin.on("data", …) or stdin.setRawMode.
  const onChunk = (chunk: string | Buffer) => {
    if (disposed) return
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8")
    drain()
  }
  if (isTTY) stdin.on("data", onChunk)

  function probe<T>(opts: {
    query: string
    parse: (acc: string) => { result: T; consumed: number } | null
    timeoutMs: number
  }): Promise<T | null> {
    if (disposed) return Promise.resolve(null)
    if (!isTTY) {
      // Non-TTY owners still accept probes — they just time out. The caller
      // gets a clean `null` instead of having to branch.
      return new Promise((resolve) => setTimeout(() => resolve(null), opts.timeoutMs))
    }

    return new Promise<T | null>((resolve) => {
      let settled = false
      const entry: ProbeEntry = {
        parse: opts.parse as (acc: string) => { result: unknown; consumed: number } | null,
        resolve: (value) => {
          if (settled) return
          settled = true
          resolve(value as T | null)
        },
        timer: setTimeout(() => {
          if (entry.settled) return
          entry.settled = true
          // Remove from probes array (drain's settled-sweep will also catch
          // this, but timeouts can fire between chunks when drain isn't
          // running — remove eagerly).
          const idx = probes.indexOf(entry)
          if (idx >= 0) probes.splice(idx, 1)
          timedOutCount++
          entry.resolve(null)
        }, opts.timeoutMs),
        settled: false,
      }
      probes.push(entry)

      // Write the query AFTER registering. Terminal responses typically arrive
      // async, but a mocked terminal (tests) may respond synchronously inside
      // the write call — we need the probe registered first so the response
      // doesn't fall through to onData subscribers.
      if (opts.query.length > 0) {
        try {
          writeStdout(opts.query)
        } catch (err) {
          // A failing write isn't recoverable from the probe side. Resolve
          // with null; timer will be cleared by settled-check.
          log?.warn?.(`probe query write failed: ${String(err)}`)
          clearTimeout(entry.timer)
          entry.settled = true
          const idx = probes.indexOf(entry)
          if (idx >= 0) probes.splice(idx, 1)
          entry.resolve(null)
          return
        }
      }

      // If the buffer already contains a parseable response (e.g. two probes
      // issued back-to-back and the terminal answered both at once), drain
      // now so the second probe doesn't have to wait for the next chunk.
      if (buffer.length > 0) drain()
    })
  }

  function onData(handler: (chunk: string) => void): () => void {
    dataSubscribers.add(handler)
    return () => {
      dataSubscribers.delete(handler)
    }
  }

  function dispose(): void {
    if (disposed) return
    disposed = true

    // Resolve any still-pending probes with null so awaiting callers don't
    // hang past session exit.
    for (const entry of probes) {
      if (entry.settled) continue
      entry.settled = true
      clearTimeout(entry.timer)
      try {
        entry.resolve(null)
      } catch {
        // ignore — downstream already handled
      }
    }
    probes.length = 0
    dataSubscribers.clear()
    buffer = ""

    if (isTTY) {
      try {
        stdin.off("data", onChunk)
      } catch {
        // listener already removed
      }
      try {
        if (rawWasSet) stdin.setRawMode(false)
      } catch {
        // stdin may already be closed
      }
      try {
        stdin.pause()
      } catch {
        // stdin may already be closed
      }
    }

    log?.debug?.(`disposed (resolved=${resolvedCount}, timedOut=${timedOutCount})`)
  }

  return {
    probe,
    onData,
    get active() {
      return !disposed
    },
    get resolvedCount() {
      return resolvedCount
    },
    get timedOutCount() {
      return timedOutCount
    },
    dispose,
    [Symbol.dispose]: dispose,
  }
}
