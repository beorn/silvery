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

import { isProtocolError } from "@silvery/ansi"
import type {
  ProbeTransactionOptions,
  ProbeTransactionRecognition,
  ProbeTransactionResult,
  ProbeTransactionSpan,
} from "@silvery/ansi"
export type {
  ProbeTransactionOptions,
  ProbeTransactionRecognition,
  ProbeTransactionResult,
  ProbeTransactionSpan,
} from "@silvery/ansi"
import { createLogger } from "loggily"
import { type Key, parseKey } from "./keys"
import {
  createMouseUnitVerifier,
  isMouseSequence,
  type MouseCoordinateInterpretation,
  type ParseMouseOptions,
  type ParsedMouse,
} from "../mouse"
import { parseBracketedPasteEnvelope } from "../bracketed-paste"
import { parseClipboardResponseEnvelope } from "../clipboard"
import { parseFocusEvent } from "../focus-reporting"
import {
  parseNotificationReplyEnvelope,
  type TerminalNotificationActivation,
} from "../ansi/notification"
import type { Modes } from "./devices/modes"

const BRACKETED_PASTE_ON = "\x1b[?2004h"
const BRACKETED_PASTE_OFF = "\x1b[?2004l"
const ESC_DISAMBIGUATION_MS = 25
const SET_MOUSE_OPTIONS = Symbol("silvery.input.setMouseOptions")
const GET_MOUSE_INTERPRETATION = Symbol("silvery.input.mouseInterpretation")

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
   * Consumed UTF-16 code units (`consumed` from the parse result) are spliced out of the
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
     * splice `consumed` UTF-16 code units out of the buffer.
     *
     * NOTE: `consumed` need not equal the full buffer length; probes may
     * consume a prefix or a middle slice. The owner splices the FIRST
     * `consumed` bytes from the buffer — parsers that match a non-prefix
     * region should locate + return the exact consumed prefix length.
     */
    parse: (acc: string) => { result: T; consumed: number } | null
    /** Maximum call-to-result wait, including any time queued behind a transaction. */
    timeoutMs: number
  }): Promise<T | null>

  /**
   * Own one bounded multi-response query transaction until its recognizer
   * reaches a completion barrier. Unlike {@link probe}, pending bytes remain
   * transaction-exclusive instead of falling through to typed input.
   *
   * `consumed` spans are exact half-open offsets into the accumulated buffer.
   * On close, bytes outside those spans replay through the typed parser once,
   * in arrival order, before queued ordinary probes may write.
   *
   * A second transaction fails loud with `status: "busy"`. Buffer overflow,
   * timeout, parser failure, and write failure are typed results rather than
   * silent truncation or interleaving.
   */
  probeTransaction<T>(opts: ProbeTransactionOptions<T>): Promise<ProbeTransactionResult<T>>

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

  /** Subscribe to parsed OSC 99 activation replies. */
  onNotificationActivationReply(
    handler: (event: TerminalNotificationActivation) => void,
  ): () => void

  /**
   * Inject raw terminal input through the canonical parser. Emulator-backed
   * Terms use this instead of maintaining a second protocol parser.
   */
  sendRaw(data: string | Buffer): void

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
   * set for a caller-managed handoff.
   *
   * Silvery's runtime does not use this escape hatch: probes and normal input
   * share one owner instead. Removing a listener while raw mode remains set
   * creates an ownerless interval unless the caller supplies stronger atomic
   * handoff machinery than Node streams provide.
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
   * into SGR-Pixels mode 1016 and cell metrics are known. Pixel units are
   * applied only once the event stream proves them — see
   * `createMouseUnitVerifier` in `../mouse`.
   */
  mouse?: ParseMouseOptions
  /**
   * Live terminal grid, read per mouse event to verify coordinate units.
   * Defaults to `stdout.columns` / `stdout.rows`; a Term passes its `size`
   * device so resizes are seen immediately.
   */
  size?: () => { cols: number; rows: number }
}

interface ProbeEntry {
  parse: (acc: string) => { result: unknown; consumed: number } | null
  resolve: (value: unknown) => void
  timer: ReturnType<typeof setTimeout>
  settled: boolean
}

interface ProbeTransactionEntry {
  recognize: (acc: string) => ProbeTransactionRecognition<unknown>
  resolve: (value: ProbeTransactionResult<unknown>) => void
  timer: ReturnType<typeof setTimeout>
  maxBufferBytes: number
  consumed: readonly ProbeTransactionSpan[]
  chunks: CapturedInputChunk[]
  settled: boolean
}

interface CapturedInputChunk {
  readonly start: number
  readonly end: number
  readonly receivedAt: number | undefined
  readonly inputBatchId: number | undefined
}

interface QueuedProbeStart {
  start: () => void
  cancel: () => void
}

interface ConfigurableInputOwner extends InputOwner {
  [SET_MOUSE_OPTIONS](options: ParseMouseOptions | undefined): void
  [GET_MOUSE_INTERPRETATION](): MouseCoordinateInterpretation
}

/** Configure startup-discovered mouse metrics without widening Term.input's public API. */
export function setInputOwnerMouseOptions(
  input: InputOwner,
  options: ParseMouseOptions | undefined,
): void {
  const configure = (input as ConfigurableInputOwner)[SET_MOUSE_OPTIONS]
  if (!configure) throw new Error("InputOwner does not support negotiated mouse options")
  configure(options)
}

/**
 * Read which coordinate units the owner is applying to mouse events, and
 * whether a negotiated pixel mode has been proven by the stream. This is the
 * diagnostic for a mis-mapped click: it says which interpretation was live
 * instead of leaving the reader to re-derive it. Same symbol-keyed shape as
 * {@link setInputOwnerMouseOptions}, so Term.input's public API stays put.
 */
export function getInputOwnerMouseInterpretation(input: InputOwner): MouseCoordinateInterpretation {
  const read = (input as ConfigurableInputOwner)[GET_MOUSE_INTERPRETATION]
  if (!read) throw new Error("InputOwner does not expose its mouse coordinate interpretation")
  return read()
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
        // Bare ESC at the chunk boundary may be either the Escape key or the
        // prefix of a CSI/SS3/meta sequence arriving in the next read.
        return { sequences, incomplete: raw.slice(i) }
      }
      if (raw[i + 1] === "[") {
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
  let incompleteSequence: string | null = null
  let incompletePaste: string | null = null
  let incompleteNotification: string | null = null
  let incompleteSequenceTimer: ReturnType<typeof setTimeout> | null = null
  let incompleteSequenceImmediate: ReturnType<typeof setImmediate> | null = null
  const probes: ProbeEntry[] = []
  let transaction: ProbeTransactionEntry | null = null
  const queuedProbeStarts: QueuedProbeStart[] = []
  const keyHandlers = new Set<(e: KeyEvent) => void>()
  const mouseHandlers = new Set<(e: ParsedMouse) => void>()
  const pasteHandlers = new Set<(e: PasteEvent) => void>()
  const focusHandlers = new Set<(e: FocusEvent) => void>()
  const notificationActivationHandlers = new Set<(e: TerminalNotificationActivation) => void>()
  // UPSTREAM-WAITING(herdr#unfiled): Delete when herdr forwards pixel units under 1016
  // Bead: @km/all/12134-upstream-waiting/24675-herdr-reports-sgr-pixels-mode-set-while-forwarding-cell-unit-mouse-coordinates
  // Escalate by: 2027-03-16
  // Coordinate units come from the stream, not from the options alone: a
  // negotiated pixel mode is applied only after an event proves it. The
  // verifier owns that latch; the owner wires its two announcements to the
  // logger so the state is never silent.
  const mouseUnits = createMouseUnitVerifier(options.mouse, {
    size: options.size ?? (() => ({ cols: Number(stdout.columns), rows: Number(stdout.rows) })),
    onChange: (interpretation, reason) => {
      const grid = interpretation.lastGrid
      const gridText =
        grid && Number.isFinite(grid.cols) && Number.isFinite(grid.rows)
          ? `${grid.cols}x${grid.rows}`
          : "unknown — the size source reports no grid, so pixel units can never be proven here"
      if (reason === "proven") {
        log?.debug?.(
          `mouse units: pixel units proven at event ${interpretation.verifiedAtEvent} (grid ${gridText})`,
        )
        return
      }
      log?.warn?.(
        `mouse units: SGR-Pixels (1016) negotiated but the first event fits the cell grid (${gridText}); ` +
          `reading coordinates as CELLS until an event exceeds the grid proves pixel units. ` +
          `A multiplexer that forwards cell units under 1016 (@si/select/24649) reads correctly this way; ` +
          `a true pixel terminal proves itself on its first event outside the top-left cells.`,
      )
    },
  })
  let resolvedCount = 0
  let timedOutCount = 0
  let disposed = false
  let inputBatchSeq = 0

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
  function dispatchSequence(raw: string, receivedAt?: number, inputBatchId?: number): void {
    const focus = parseFocusEvent(raw)
    if (focus) {
      fire(focusHandlers, { focused: focus.type === "focus-in" })
      return
    }
    if (isMouseSequence(raw)) {
      const mouse = mouseUnits.parse(raw)
      if (mouse) {
        const event = { ...mouse, receivedAt, inputBatchId }
        // Action-specific debug — silvery:input-owner only logs the
        // less-frequent wheel and click actions to avoid drowning move
        // streams. Use `silvery:input-owner` namespace for live capture.
        // Bead: @km/code/trackpad-wheel-not-scrolling.
        if (mouse.action === "wheel" || mouse.action === "down" || mouse.action === "up") {
          const interpretation = mouseUnits.interpretation()
          const units =
            interpretation.negotiated === "pixel" && !interpretation.pixelVerified
              ? "cell(pixel-unproven)"
              : interpretation.units
          log?.debug?.(
            `parsed mouse: action=${mouse.action} button=${mouse.button} x=${mouse.x} y=${mouse.y} delta=${mouse.delta ?? 0} units=${units} bytes=${JSON.stringify(raw)}`,
          )
        }
        fire(mouseHandlers, event)
        return
      }
      // Mouse sequence detected but failed to parse — log raw bytes so
      // we can spot terminal-specific formats the parser doesn't handle.
      log?.warn?.(`mouse sequence failed to parse: ${JSON.stringify(raw)}`)
    }
    const [input, key] = parseKey(raw)
    fire(keyHandlers, { input, key })
  }

  function clearIncompleteTimer(): void {
    if (incompleteSequenceTimer !== null) {
      clearTimeout(incompleteSequenceTimer)
      incompleteSequenceTimer = null
    }
    if (incompleteSequenceImmediate !== null) {
      clearImmediate(incompleteSequenceImmediate)
      incompleteSequenceImmediate = null
    }
  }

  function scheduleIncompleteFlush(receivedAt?: number, inputBatchId?: number): void {
    if (incompleteSequence !== "\x1b") return
    clearIncompleteTimer()
    incompleteSequenceTimer = setTimeout(() => {
      incompleteSequenceTimer = null
      // Yield through the check phase before committing standalone Escape.
      // If the event loop was busy while the timeout expired, already-ready
      // stdin tail bytes get one poll phase to arrive and reassemble first.
      incompleteSequenceImmediate = setImmediate(() => {
        incompleteSequenceImmediate = null
        if (disposed || incompleteSequence !== "\x1b") return
        incompleteSequence = null
        dispatchSequence("\x1b", receivedAt, inputBatchId)
      })
    }, ESC_DISAMBIGUATION_MS)
  }

  function dispatchRawChunk(chunk: string, receivedAt?: number, inputBatchId?: number): void {
    if (chunk.length === 0) return
    const { sequences, incomplete } = splitRawInput(chunk)
    incompleteSequence = incomplete
    scheduleIncompleteFlush(receivedAt, inputBatchId)
    for (const raw of sequences) dispatchSequence(raw, receivedAt, inputBatchId)
  }

  function validateConsumedSpans(
    spans: readonly ProbeTransactionSpan[],
    capturedLength: number,
  ): readonly ProbeTransactionSpan[] | null {
    let priorEnd = 0
    for (const span of spans) {
      if (
        !Number.isInteger(span.start) ||
        !Number.isInteger(span.end) ||
        span.start < priorEnd ||
        span.start < 0 ||
        span.end <= span.start ||
        span.end > capturedLength
      ) {
        return null
      }
      priorEnd = span.end
    }
    return spans
  }

  function unconsumedChunk(
    captured: string,
    chunk: CapturedInputChunk,
    spans: readonly ProbeTransactionSpan[],
  ): string {
    let cursor = chunk.start
    let replay = ""
    for (const span of spans) {
      if (span.end <= chunk.start) continue
      if (span.start >= chunk.end) break
      const consumedStart = Math.max(span.start, chunk.start)
      const consumedEnd = Math.min(span.end, chunk.end)
      replay += captured.slice(cursor, consumedStart)
      cursor = Math.max(cursor, consumedEnd)
    }
    return replay + captured.slice(cursor, chunk.end)
  }

  function startQueuedProbes(): void {
    if (transaction !== null || queuedProbeStarts.length === 0) return
    const queued = queuedProbeStarts.splice(0)
    for (const entry of queued) entry.start()
  }

  function settleTransaction(
    entry: ProbeTransactionEntry,
    result: ProbeTransactionResult<unknown>,
    spans: readonly ProbeTransactionSpan[],
  ): void {
    if (entry.settled || transaction !== entry) return
    entry.settled = true
    clearTimeout(entry.timer)
    transaction = null

    const captured = buffer
    const replayChunks = entry.chunks.map((chunk) => ({
      ...chunk,
      text: unconsumedChunk(captured, chunk, spans),
    }))
    buffer = ""
    entry.resolve(result)

    // Replay closes before any queued ordinary probe can write. JavaScript's
    // run-to-completion semantics ensure no fresh stdin callback can interleave
    // between the close, replay, and queue activation.
    for (const chunk of replayChunks) {
      if (chunk.text.length === 0) continue
      buffer += chunk.text
      drain(chunk.receivedAt, chunk.inputBatchId)
    }
    startQueuedProbes()
  }

  // Drain the current buffer against probes (in registration order). Anything
  // probes don't consume flows into the event parser, which fires typed
  // handlers for each parsed sequence.
  function drain(receivedAt?: number, inputBatchId?: number): void {
    if (disposed) return

    if (transaction !== null) {
      const entry = transaction
      const receivedBytes = Buffer.byteLength(buffer, "utf8")
      if (receivedBytes > entry.maxBufferBytes) {
        settleTransaction(
          entry,
          {
            status: "overflow",
            maxBufferBytes: entry.maxBufferBytes,
            receivedBytes,
          },
          entry.consumed,
        )
        return
      }

      let recognized: ProbeTransactionRecognition<unknown>
      try {
        recognized = entry.recognize(buffer)
      } catch (err) {
        settleTransaction(
          entry,
          { status: "error", reason: "recognizer-threw", message: String(err) },
          entry.consumed,
        )
        return
      }
      const consumed = validateConsumedSpans(recognized.consumed, buffer.length)
      if (consumed === null) {
        settleTransaction(
          entry,
          { status: "error", reason: "invalid-consumed-span" },
          entry.consumed,
        )
        return
      }
      entry.consumed = consumed
      if (recognized.status === "complete") {
        resolvedCount++
        settleTransaction(entry, { status: "complete", value: recognized.value }, consumed)
      }
      return
    }

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

    // Prepend any buffered incomplete escape/control sequence from a prior
    // chunk so split SGR mouse sequences (e.g. '\x1b[<0;58;8' + 'M')
    // reassemble.
    let chunk = buffer
    buffer = ""
    if (incompleteSequence !== null) {
      clearIncompleteTimer()
      chunk = incompleteSequence + chunk
      incompleteSequence = null
    }
    if (incompletePaste !== null) {
      chunk = incompletePaste + chunk
      incompletePaste = null
    }
    if (incompleteNotification !== null) {
      chunk = incompleteNotification + chunk
      incompleteNotification = null
    }

    // Bracketed paste is detected before splitting into individual keys —
    // paste content is one logical event, not a stream of keystrokes.
    //
    // The parser may throw ProtocolError when PASTE_START is found but no
    // PASTE_END follows in this chunk. That commonly indicates a stream-
    // split paste (the rest arrives in the next TTY read), so we buffer and
    // retry before splitting into key events. This preserves paste atomicity
    // while still emitting a debug-log breadcrumb so chronic protocol-format
    // problems become visible. Bead reference:
    // @km/silvery/15127-custom-protocol-implementation/protocol-loud-errors.
    let remaining = chunk
    while (remaining.length > 0) {
      let pasteEnvelope: ReturnType<typeof parseBracketedPasteEnvelope> = null
      try {
        pasteEnvelope = parseBracketedPasteEnvelope(remaining)
      } catch (err) {
        if (isProtocolError(err)) {
          incompletePaste = remaining
          log?.debug?.(
            `bracketed paste parser buffered incomplete input: ${err.reason} (parser=${err.parser}, len=${err.inputLength})`,
          )
          return
        } else {
          log?.warn?.(`bracketed paste parser threw: ${String(err)}`)
        }
      }

      let clipboardEnvelope: ReturnType<typeof parseClipboardResponseEnvelope> = null
      try {
        clipboardEnvelope = parseClipboardResponseEnvelope(remaining)
      } catch (err) {
        if (isProtocolError(err)) {
          log?.debug?.(
            `clipboard parser flagged malformed input: ${err.reason} (parser=${err.parser}, len=${err.inputLength})`,
          )
        } else {
          log?.warn?.(`clipboard parser threw: ${String(err)}`)
        }
      }

      const notificationEnvelope = parseNotificationReplyEnvelope(remaining)
      const notificationIsFirst =
        notificationEnvelope !== null &&
        (!pasteEnvelope || notificationEnvelope.start <= pasteEnvelope.start) &&
        (!clipboardEnvelope || notificationEnvelope.start <= clipboardEnvelope.start)

      if (notificationIsFirst) {
        dispatchRawChunk(remaining.slice(0, notificationEnvelope.start), receivedAt, inputBatchId)
        if (notificationEnvelope.status === "incomplete") {
          incompleteNotification = remaining.slice(notificationEnvelope.start)
          return
        }
        if (notificationEnvelope.activation !== null) {
          fire(notificationActivationHandlers, notificationEnvelope.activation)
        }
        remaining = remaining.slice(notificationEnvelope.end)
        continue
      }

      if (pasteEnvelope && (!clipboardEnvelope || pasteEnvelope.start <= clipboardEnvelope.start)) {
        dispatchRawChunk(remaining.slice(0, pasteEnvelope.start), receivedAt, inputBatchId)
        fire(pasteHandlers, { text: pasteEnvelope.result.content })
        remaining = remaining.slice(pasteEnvelope.end)
        continue
      }

      if (clipboardEnvelope) {
        dispatchRawChunk(remaining.slice(0, clipboardEnvelope.start), receivedAt, inputBatchId)
        fire(pasteHandlers, { text: clipboardEnvelope.text })
        remaining = remaining.slice(clipboardEnvelope.end)
        continue
      }

      dispatchRawChunk(remaining, receivedAt, inputBatchId)
      return
    }
  }

  // Single stdin listener — the whole reason this file exists. No other
  // code in the session should call stdin.on("data", …) or stdin.setRawMode.
  function sendRaw(chunk: string | Buffer): void {
    if (disposed) return
    const receivedAt = performance.now()
    const inputBatchId = ++inputBatchSeq
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8")
    if (transaction !== null) {
      transaction.chunks.push({
        start: buffer.length,
        end: buffer.length + text.length,
        receivedAt,
        inputBatchId,
      })
    }
    buffer += text
    drain(receivedAt, inputBatchId)
  }
  const onChunk = (chunk: string | Buffer) => sendRaw(chunk)
  if (isTTY) stdin.on("data", onChunk)

  function probe<T>(opts: {
    query: string
    parse: (acc: string) => { result: T; consumed: number } | null
    timeoutMs: number
  }): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
      const deadline = performance.now() + opts.timeoutMs
      let resolved = false
      let queuedTimer: ReturnType<typeof setTimeout> | null = null
      const resolveOnce = (value: T | null) => {
        if (resolved) return
        resolved = true
        if (queuedTimer !== null) clearTimeout(queuedTimer)
        resolve(value)
      }
      const start = () => {
        if (resolved) return
        if (queuedTimer !== null) {
          clearTimeout(queuedTimer)
          queuedTimer = null
        }
        const remainingMs = Math.max(0, deadline - performance.now())
        if (remainingMs === 0) {
          timedOutCount++
          resolveOnce(null)
          return
        }
        if (disposed) {
          resolveOnce(null)
          return
        }
        if (!isTTY) {
          setTimeout(() => resolveOnce(null), remainingMs)
          return
        }

        let settled = false
        const entry: ProbeEntry = {
          parse: opts.parse as (acc: string) => { result: unknown; consumed: number } | null,
          resolve: (value) => {
            if (settled) return
            settled = true
            resolveOnce(value as T | null)
          },
          timer: setTimeout(() => {
            if (entry.settled) return
            entry.settled = true
            const idx = probes.indexOf(entry)
            if (idx >= 0) probes.splice(idx, 1)
            timedOutCount++
            entry.resolve(null)
          }, remainingMs),
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
      }

      if (transaction !== null) {
        const queued: QueuedProbeStart = {
          start,
          cancel: () => resolveOnce(null),
        }
        queuedTimer = setTimeout(() => {
          const index = queuedProbeStarts.indexOf(queued)
          if (index >= 0) queuedProbeStarts.splice(index, 1)
          timedOutCount++
          resolveOnce(null)
        }, opts.timeoutMs)
        queuedProbeStarts.push(queued)
      } else start()
    })
  }

  function probeTransaction<T>(
    opts: ProbeTransactionOptions<T>,
  ): Promise<ProbeTransactionResult<T>> {
    if (disposed) return Promise.resolve({ status: "error", reason: "disposed" })
    if (
      !Number.isFinite(opts.timeoutMs) ||
      opts.timeoutMs < 0 ||
      !Number.isSafeInteger(opts.maxBufferBytes) ||
      opts.maxBufferBytes <= 0
    ) {
      return Promise.resolve({ status: "error", reason: "invalid-options" })
    }
    if (transaction !== null || probes.length > 0) return Promise.resolve({ status: "busy" })

    return new Promise<ProbeTransactionResult<T>>((resolve) => {
      const entry: ProbeTransactionEntry = {
        recognize: opts.recognize as (acc: string) => ProbeTransactionRecognition<unknown>,
        resolve: (value) => resolve(value as ProbeTransactionResult<T>),
        timer: setTimeout(() => {
          if (entry.settled || transaction !== entry) return
          timedOutCount++
          settleTransaction(entry, { status: "timeout" }, entry.consumed)
        }, opts.timeoutMs),
        maxBufferBytes: opts.maxBufferBytes,
        consumed: [],
        chunks:
          buffer.length === 0
            ? []
            : [{ start: 0, end: buffer.length, receivedAt: undefined, inputBatchId: undefined }],
        settled: false,
      }
      transaction = entry

      if (!isTTY) return
      try {
        if (opts.query.length > 0) writeStdout(opts.query)
      } catch (err) {
        settleTransaction(
          entry,
          { status: "error", reason: "write-failed", message: String(err) },
          [],
        )
      }
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

  function onNotificationActivationReply(
    handler: (e: TerminalNotificationActivation) => void,
  ): () => void {
    notificationActivationHandlers.add(handler)
    return () => {
      notificationActivationHandlers.delete(handler)
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

  function setMouseOptions(next: ParseMouseOptions | undefined): void {
    if (disposed) return
    mouseUnits.setOptions(next)
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
    for (const queued of queuedProbeStarts.splice(0)) queued.cancel()
    if (transaction !== null && !transaction.settled) {
      const entry = transaction
      transaction = null
      entry.settled = true
      clearTimeout(entry.timer)
      entry.resolve({ status: "error", reason: "disposed" })
    }
    keyHandlers.clear()
    mouseHandlers.clear()
    pasteHandlers.clear()
    focusHandlers.clear()
    notificationActivationHandlers.clear()
    clearIncompleteTimer()
    buffer = ""
    incompleteSequence = null
    incompletePaste = null
    incompleteNotification = null

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

  const owner: InputOwner = {
    probe,
    probeTransaction,
    onKey,
    onMouse,
    onPaste,
    onFocus,
    onNotificationActivationReply,
    sendRaw,
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
  Object.defineProperty(owner, SET_MOUSE_OPTIONS, { value: setMouseOptions })
  Object.defineProperty(owner, GET_MOUSE_INTERPRETATION, { value: mouseUnits.interpretation })
  return owner
}
