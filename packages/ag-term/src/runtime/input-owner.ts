/**
 * Input owner — mediates ALL stdin raw-mode + data access within a silvery
 * session. Mirrors `Output` (`./devices/output.ts`) for stdout and
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
 * One `stdin.on("data", …)` listener for the owner's lifetime. Incoming
 * chunks drain through two phases:
 *
 * 1. **Probes** (registration-ordered) — `probe(opts)` callers consume
 *    response bytes via a custom parser. First match wins, consumed bytes
 *    are spliced out of the shared buffer.
 * 2. **Typed event parser** — whatever probes don't consume is parsed into
 *    key/mouse/paste/focus events and fanned out to `onKey/onMouse/onPaste/onFocus`
 *    subscribers. The parser handles bracketed paste, mouse sequences, focus
 *    events, CSI/SS3 sequences, and cross-chunk incomplete CSI buffering.
 *
 * Raw mode and bracketed paste are set ONCE at construction (when `modes`
 * is provided) and restored ONCE at dispose. The owner never toggles these
 * mid-session. Tenants use `probe()` for one-shot OSC queries or subscribe
 * to the typed event handlers; neither touches termios directly.
 *
 * ## Relation to Output
 *
 * The owner is agnostic to whether Output is activated. If it is, the caller
 * passes a write function that routes through `output.write`; if not, a bare
 * `stdout.write` is fine. The owner's concern is stdin.
 */

import { createLogger } from "loggily"
import { type Key, parseKey } from "./keys"
import {
  isMouseSequence,
  parseMouseSequence,
  type ParseMouseOptions,
  type ParsedMouse,
} from "../mouse"
import { parseBracketedPaste } from "../bracketed-paste"
import { parseFocusEvent } from "../focus-reporting"
import type { Modes } from "./devices/modes"

const BRACKETED_PASTE_ON = "\x1b[?2004h"
const BRACKETED_PASTE_OFF = "\x1b[?2004l"

const log = createLogger("silvery:input-owner")

// ============================================================================
// Types
// ============================================================================

/** Structured key event — input string + parsed Key metadata. */
export interface KeyEvent {
  input: string
  key: Key
}

/** Structured paste event — the text that was pasted (without markers). */
export interface PasteEvent {
  text: string
}

/** Structured focus event — whether the terminal gained or lost focus. */
export interface FocusEvent {
  focused: boolean
}

export interface InputOwner extends Disposable {
  /**
   * Write a query to stdout, accumulate stdin response bytes, run `parse`
   * against the accumulated buffer on each chunk. Resolves with the first
   * non-null parse result; resolves with `null` if `timeoutMs` elapses first.
   *
   * Consumed bytes (`consumed` from the parse result) are spliced out of the
   * shared buffer. Bytes before/after the consumed region remain available
   * to subsequent probes and/or the event parser.
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
   * Subscribe to parsed key events (press, repeat, release — handler filters
   * as needed). Returns an unsubscribe function.
   */
  onKey(handler: (event: KeyEvent) => void): () => void

  /**
   * Subscribe to parsed mouse events (SGR-encoded button + motion). Returns
   * an unsubscribe function.
   */
  onMouse(handler: (event: ParsedMouse) => void): () => void

  /**
   * Subscribe to bracketed-paste events. The `text` field holds the pasted
   * content with markers stripped. Returns an unsubscribe function.
   */
  onPaste(handler: (event: PasteEvent) => void): () => void

  /**
   * Subscribe to focus-in / focus-out events (CSI I / CSI O). Returns an
   * unsubscribe function.
   */
  onFocus(handler: (event: FocusEvent) => void): () => void

  /**
   * Inject a synthetic key event. Used by emulator-backed terms
   * (`createTerm({ cols, rows, emulator })`) and test helpers to fan out to
   * the same subscribers as real stdin parsing would.
   */
  sendKey(event: KeyEvent): void

  /**
   * Inject a synthetic mouse event (same rationale as sendKey).
   */
  sendMouse(event: ParsedMouse): void

  /**
   * Inject a synthetic paste event (same rationale as sendKey).
   */
  sendPaste(event: PasteEvent): void

  /**
   * Inject a synthetic focus event (same rationale as sendKey).
   */
  sendFocus(event: FocusEvent): void

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
   * Alternate writer for outgoing query bytes (e.g. `output.write`). Defaults
   * to `stdout.write.bind(stdout)`.
   */
  writeStdout?: (data: string) => boolean | void
  /**
   * When true, `dispose()` does NOT drop raw mode. The listener is still
   * removed and pending probes still resolve with null, but raw mode stays
   * set so the next owner (typically the term-provider's events() generator)
   * can take over seamlessly.
   *
   * Use this when the owner is the pre-session probe window AND a follow-up
   * stdin consumer will re-set raw=true immediately.
   */
  retainRawModeOnDispose?: boolean
  /**
   * Shared Modes owner (from Term). When provided, the input owner drives
   * `stdin.setRawMode` + bracketed paste through `modes.rawMode(true/false)`
   * + `modes.bracketedPaste(true/false)` so there is exactly one writer.
   * Fallback to direct stdin calls + no bracketed-paste toggle when absent
   * keeps the standalone/tests path working without a full Term.
   */
  modes?: Modes
  /**
   * Enable bracketed paste at construction. Defaults to true when `modes`
   * is provided and the owner is TTY-backed. Set to false for unit tests
   * that don't want any protocol bytes written to stdout.
   */
  enableBracketedPaste?: boolean
  /**
   * Mouse coordinate parser options. Use this when the terminal has been put
   * into SGR-Pixels mode 1016 and cell metrics are known.
   */
  mouse?: ParseMouseOptions
}

interface ProbeEntry {
  parse: (acc: string) => { result: unknown; consumed: number } | null
  resolve: (value: unknown) => void
  timer: ReturnType<typeof setTimeout>
  settled: boolean
}

// ============================================================================
// Input Splitting (moved from term-provider.ts)
// ============================================================================

/**
 * Result of splitting raw input — includes parsed sequences and any trailing
 * incomplete CSI sequence that needs cross-chunk buffering.
 */
interface SplitResult {
  sequences: string[]
  incomplete: string | null
}

/**
 * Split a raw stdin chunk into individual key sequences.
 *
 * When the OS buffers key repeat events, stdin delivers multiple keystrokes
 * in a single read (e.g., "jjjjj" for held 'j'). `parseKey` expects one
 * keystroke at a time, so we split first.
 *
 * When a CSI sequence (ESC [ ...) ends at the chunk boundary without a
 * terminator, it is returned as `incomplete` so the caller can buffer it
 * and prepend to the next chunk. This handles SGR mouse sequences that
 * split across stdin data events (e.g., '\x1b[<0;58;8' + 'M').
 */
function splitRawInput(raw: string): SplitResult {
  const sequences: string[] = []
  let i = 0
  while (i < raw.length) {
    if (raw[i] === "\x1b") {
      // Escape sequence
      if (i + 1 >= raw.length) {
        // Bare ESC at end
        sequences.push("\x1b")
        i++
      } else if (raw[i + 1] === "[") {
        // CSI sequence: ESC [ ... <letter or ~>
        let j = i + 2
        while (j < raw.length && !isCSITerminator(raw[j]!)) j++
        if (j < raw.length) {
          j++ // include terminator
          sequences.push(raw.slice(i, j))
          i = j
        } else {
          // Incomplete CSI — hit end of chunk without finding terminator.
          return { sequences, incomplete: raw.slice(i) }
        }
      } else if (raw[i + 1] === "O") {
        // SS3 sequence: ESC O <letter>
        const end = Math.min(i + 3, raw.length)
        sequences.push(raw.slice(i, end))
        i = end
      } else if (raw[i + 1] === "\x1b") {
        // Double ESC: meta + escape, OR meta + CSI/SS3 sequence
        if (i + 2 < raw.length && raw[i + 2] === "[") {
          let j = i + 3
          while (j < raw.length && !isCSITerminator(raw[j]!)) j++
          if (j < raw.length) {
            j++
            sequences.push(raw.slice(i, j))
            i = j
          } else {
            return { sequences, incomplete: raw.slice(i) }
          }
        } else if (i + 2 < raw.length && raw[i + 2] === "O") {
          const end = Math.min(i + 4, raw.length)
          sequences.push(raw.slice(i, end))
          i = end
        } else {
          sequences.push("\x1b\x1b")
          i += 2
        }
      } else {
        // Meta key: ESC + char
        sequences.push(raw.slice(i, i + 2))
        i += 2
      }
    } else {
      // Single byte (printable char, ctrl code, etc.)
      sequences.push(raw[i]!)
      i++
    }
  }
  return { sequences, incomplete: null }
}

function isCSITerminator(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "~"
}

// ============================================================================
// Implementation
// ============================================================================

export function createInputOwner(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  options: InputOwnerOptions = {},
): InputOwner {
  const writeStdout = options.writeStdout ?? ((data: string) => stdout.write(data))

  // Termios setup — ONCE. When non-TTY, we become a no-op owner (probes time
  // out, event subscribers never fire); stdin is left untouched. We still
  // install the structure against an in-memory buffer so callers don't need
  // to branch.
  const isTTY = Boolean(stdin.isTTY)
  const injectedModes = options.modes
  let rawWasSet = false
  let bracketedPasteWasSet = false
  if (isTTY) {
    try {
      // Capture the prior state so dispose() decides whether to restore or
      // no-op. In the canonical TUI lifecycle the owner is the FIRST
      // raw-mode setter of the session; `wasRaw` should be false. We record
      // it defensively so an owner constructed inside an already-raw session
      // (e.g. nested run()) doesn't flip raw=false on dispose and kill the
      // outer owner's input.
      const wasRaw = stdin.isRaw
      if (!wasRaw) {
        // Single writer: drive through Modes when provided. Fallback to
        // direct stdin call when constructed without a Modes owner
        // (standalone / test path).
        if (injectedModes) injectedModes.rawMode(true)
        else stdin.setRawMode(true)
        rawWasSet = true
      }
      stdin.resume()
      stdin.setEncoding("utf8")

      // Bracketed paste — default-on for any TTY-backed owner. Route through
      // Modes when provided (single-writer invariant); otherwise write the
      // protocol bytes directly through `writeStdout` so standalone/test
      // paths still get paste detection. Opt-out via `enableBracketedPaste:
      // false` for unit tests that don't want protocol bytes written.
      const shouldEnablePaste = options.enableBracketedPaste ?? true
      if (shouldEnablePaste) {
        if (injectedModes) injectedModes.bracketedPaste(true)
        else writeStdout(BRACKETED_PASTE_ON)
        bracketedPasteWasSet = true
      }
    } catch (err) {
      log?.warn?.(`termios setup failed: ${String(err)}`)
    }
  }

  // Per-owner state.
  let buffer = ""
  let incompleteCSI: string | null = null
  const probes: ProbeEntry[] = []
  const keyHandlers = new Set<(e: KeyEvent) => void>()
  const mouseHandlers = new Set<(e: ParsedMouse) => void>()
  const pasteHandlers = new Set<(e: PasteEvent) => void>()
  const focusHandlers = new Set<(e: FocusEvent) => void>()
  let resolvedCount = 0
  let timedOutCount = 0
  let disposed = false

  // Fire an event to every handler in a set, catching throws so one broken
  // subscriber doesn't prevent others from seeing the event.
  function fire<T>(handlers: Set<(e: T) => void>, event: T): void {
    for (const handler of handlers) {
      try {
        handler(event)
      } catch (err) {
        log?.warn?.(`handler threw: ${String(err)}`)
      }
    }
  }

  /**
   * Parse one CSI/SS3/meta/control/printable sequence into the right event
   * type and fire it. Order: focus → mouse → key (catch-all).
   */
  function dispatchSequence(raw: string): void {
    const focus = parseFocusEvent(raw)
    if (focus) {
      fire(focusHandlers, { focused: focus.type === "focus-in" })
      return
    }
    if (isMouseSequence(raw)) {
      const mouse = parseMouseSequence(raw, options.mouse)
      if (mouse) {
        fire(mouseHandlers, mouse)
        return
      }
    }
    const [input, key] = parseKey(raw)
    fire(keyHandlers, { input, key })
  }

  // Drain the current buffer against probes (in registration order). Anything
  // probes don't consume flows into the event parser, which fires typed
  // handlers for each parsed sequence.
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
      for (let i = probes.length - 1; i >= 0; i--) {
        if (probes[i]!.settled) probes.splice(i, 1)
      }
    }

    // Parser phase: run leftover bytes through the typed event parser.
    if (buffer.length === 0) return

    // Prepend any buffered incomplete CSI from a prior chunk so split SGR
    // mouse sequences (e.g. '\x1b[<0;58;8' + 'M') reassemble.
    let chunk = buffer
    buffer = ""
    if (incompleteCSI !== null) {
      chunk = incompleteCSI + chunk
      incompleteCSI = null
    }

    // Bracketed paste is detected before splitting into individual keys —
    // paste content is one logical event, not a stream of keystrokes.
    const pasteResult = parseBracketedPaste(chunk)
    if (pasteResult) {
      fire(pasteHandlers, { text: pasteResult.content })
      return
    }

    const { sequences, incomplete } = splitRawInput(chunk)
    incompleteCSI = incomplete
    for (const raw of sequences) dispatchSequence(raw)
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
      // Non-TTY owners still accept probes — they just time out.
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
          const idx = probes.indexOf(entry)
          if (idx >= 0) probes.splice(idx, 1)
          timedOutCount++
          entry.resolve(null)
        }, opts.timeoutMs),
        settled: false,
      }
      probes.push(entry)

      // Write the query AFTER registering. Terminal responses typically
      // arrive async, but a mocked terminal may respond synchronously inside
      // the write — we need the probe registered first so the response
      // doesn't fall through to the event parser.
      if (opts.query.length > 0) {
        try {
          writeStdout(opts.query)
        } catch (err) {
          log?.warn?.(`probe query write failed: ${String(err)}`)
          clearTimeout(entry.timer)
          entry.settled = true
          const idx = probes.indexOf(entry)
          if (idx >= 0) probes.splice(idx, 1)
          entry.resolve(null)
          return
        }
      }

      // Drain eagerly so a probe registered against already-buffered bytes
      // resolves immediately.
      if (buffer.length > 0) drain()
    })
  }

  function onKey(handler: (e: KeyEvent) => void): () => void {
    keyHandlers.add(handler)
    return () => {
      keyHandlers.delete(handler)
    }
  }

  function onMouse(handler: (e: ParsedMouse) => void): () => void {
    mouseHandlers.add(handler)
    return () => {
      mouseHandlers.delete(handler)
    }
  }

  function onPaste(handler: (e: PasteEvent) => void): () => void {
    pasteHandlers.add(handler)
    return () => {
      pasteHandlers.delete(handler)
    }
  }

  function onFocus(handler: (e: FocusEvent) => void): () => void {
    focusHandlers.add(handler)
    return () => {
      focusHandlers.delete(handler)
    }
  }

  function sendKey(event: KeyEvent): void {
    if (disposed) return
    fire(keyHandlers, event)
  }

  function sendMouse(event: ParsedMouse): void {
    if (disposed) return
    fire(mouseHandlers, event)
  }

  function sendPaste(event: PasteEvent): void {
    if (disposed) return
    fire(pasteHandlers, event)
  }

  function sendFocus(event: FocusEvent): void {
    if (disposed) return
    fire(focusHandlers, event)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true

    // Resolve pending probes with null so awaiting callers don't hang.
    for (const entry of probes) {
      if (entry.settled) continue
      entry.settled = true
      clearTimeout(entry.timer)
      try {
        entry.resolve(null)
      } catch {
        // downstream already handled
      }
    }
    probes.length = 0
    keyHandlers.clear()
    mouseHandlers.clear()
    pasteHandlers.clear()
    focusHandlers.clear()
    buffer = ""
    incompleteCSI = null

    if (isTTY) {
      try {
        stdin.off("data", onChunk)
      } catch {
        // listener already removed
      }
      if (!options.retainRawModeOnDispose) {
        try {
          // Disable bracketed paste FIRST (before raw-mode restore) so the
          // enable/disable pair nests inside the raw-mode lifetime.
          if (bracketedPasteWasSet) {
            if (injectedModes) injectedModes.bracketedPaste(false)
            else writeStdout(BRACKETED_PASTE_OFF)
          }
        } catch {
          // stdin may already be closed
        }
        try {
          if (rawWasSet) {
            if (injectedModes) injectedModes.rawMode(false)
            else stdin.setRawMode(false)
          }
        } catch {
          // stdin may already be closed
        }
        try {
          stdin.pause()
        } catch {
          // stdin may already be closed
        }
      }
    }

    log?.debug?.(`disposed (resolved=${resolvedCount}, timedOut=${timedOutCount})`)
  }

  return {
    probe,
    onKey,
    onMouse,
    onPaste,
    onFocus,
    sendKey,
    sendMouse,
    sendPaste,
    sendFocus,
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
