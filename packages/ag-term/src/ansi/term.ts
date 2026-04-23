/**
 * Term interface and createTerm() factory.
 *
 * Term is the central abstraction for terminal interaction:
 * - Detection: hasCursor(), hasInput(), hasColor(), hasUnicode()
 * - Dimensions: cols, rows
 * - I/O: stdout, stdin, write(), writeLine()
 * - Provider: getState(), subscribe(), events() — typed key/mouse/resize
 * - Styling: Chainable styles via Proxy (term.bold.red('text'))
 * - Lifecycle: Disposable pattern via Symbol.dispose
 *
 * @example
 * ```ts
 * // Styling
 * const term = createTerm()
 * console.log(term.bold.red('error'))
 *
 * // Full terminal app
 * using term = createTerm()
 * await run(<App />, term)
 * ```
 */

import { createMixedStyle, createStyle, type Style } from "@silvery/ansi"
import type {
  ColorLevel,
  CreateTermOptions,
  TermEmulator,
  TermEmulatorBackend,
  TermScreen,
  TerminalCaps,
} from "./types"
import type { TerminalBuffer } from "../buffer"
import { createTextFrame } from "../buffer"
import type { TextFrame } from "@silvery/ag/text-frame"
import { outputPhase } from "../pipeline/output-phase"
import {
  defaultCaps,
  detectColor,
  detectCursor,
  detectInput,
  detectTerminalCaps,
  detectUnicode,
} from "./detection"
import { createInputOwner, type InputOwner as Input } from "../runtime/input-owner"
export type { Input }
import { createOutput, type Output } from "../runtime/devices/output"
export type { Output }
import {
  createFixedSize,
  createSize,
  type Size,
  type SizeSnapshot,
} from "../runtime/devices/size"
export type { Size, SizeSnapshot }
import { createModes, type Modes } from "../runtime/devices/modes"
export type { Modes }
import { createSignals, type Signals } from "../runtime/devices/signals"
export type { Signals }
import {
  createConsole,
  type Console as DeviceConsole,
  type ConsoleCaptureOptions,
  type ConsoleStats,
} from "../runtime/devices/console"
import { createConsoleRouter } from "../runtime/devices/console-router"
export type { DeviceConsole as Console, ConsoleCaptureOptions, ConsoleStats }
import { splitRawInput, parseKey } from "@silvery/ag/keys"
import { isMouseSequence, parseMouseSequence } from "../mouse"
import { parseFocusEvent } from "../focus-reporting"
import { parseBracketedPaste } from "../bracketed-paste"
import { STDIN_SYMBOL, STDOUT_SYMBOL } from "../runtime/term-internal"

export type { OutputOptions } from "../runtime/devices/output"

// =============================================================================
// ANSI Utilities
// =============================================================================

/**
 * ANSI escape code pattern for stripping.
 */
const ANSI_REGEX =
  /\x1b\[[0-9;:]*m|\x9b[0-9;:]*m|\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)|\x9d8;;[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)/g

/**
 * Strip all ANSI escape codes from a string.
 */
function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "")
}

// =============================================================================
// Style Chain Types
// =============================================================================

/**
 * All chalk style method names that can be chained.
 */
type ChalkStyleName =
  // Modifiers
  | "reset"
  | "bold"
  | "dim"
  | "italic"
  | "underline"
  | "overline"
  | "inverse"
  | "hidden"
  | "strikethrough"
  | "visible"
  // Foreground colors
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray"
  | "grey"
  | "blackBright"
  | "redBright"
  | "greenBright"
  | "yellowBright"
  | "blueBright"
  | "magentaBright"
  | "cyanBright"
  | "whiteBright"
  // Background colors
  | "bgBlack"
  | "bgRed"
  | "bgGreen"
  | "bgYellow"
  | "bgBlue"
  | "bgMagenta"
  | "bgCyan"
  | "bgWhite"
  | "bgGray"
  | "bgGrey"
  | "bgBlackBright"
  | "bgRedBright"
  | "bgGreenBright"
  | "bgYellowBright"
  | "bgBlueBright"
  | "bgMagentaBright"
  | "bgCyanBright"
  | "bgWhiteBright"

/**
 * StyleChain provides chainable styling methods.
 * Each property returns a new chain, and the chain is callable.
 */
export type StyleChain = {
  /**
   * Apply styles to text.
   */
  (text: string): string
  (template: TemplateStringsArray, ...values: unknown[]): string

  /**
   * RGB foreground color.
   */
  rgb(r: number, g: number, b: number): StyleChain

  /**
   * Hex foreground color.
   */
  hex(color: string): StyleChain

  /**
   * 256-color foreground.
   */
  ansi256(code: number): StyleChain

  /**
   * RGB background color.
   */
  bgRgb(r: number, g: number, b: number): StyleChain

  /**
   * Hex background color.
   */
  bgHex(color: string): StyleChain

  /**
   * 256-color background.
   */
  bgAnsi256(code: number): StyleChain
} & {
  /**
   * Chainable style properties.
   */
  readonly [K in ChalkStyleName]: StyleChain
}

// =============================================================================
// Term Interface
// =============================================================================

/**
 * Term — the central abstraction for terminal interaction.
 *
 * Term is both a styling helper (chainable ANSI via Proxy) and a
 * Provider (state + typed events). Pass it to `run()` or `createApp()`.
 *
 * Provides:
 * - Capability detection (cached on creation)
 * - Dimensions (live from stream)
 * - I/O (stdout, stdin, write, writeLine)
 * - Provider (getState, subscribe, events — key/mouse/resize)
 * - Styling (chainable via Proxy)
 * - Disposable lifecycle
 *
 * @example
 * ```ts
 * using term = createTerm()
 * await run(<App />, term)
 * ```
 */
export interface Term extends Disposable, StyleChain {
  // -------------------------------------------------------------------------
  // Detection Methods
  // -------------------------------------------------------------------------

  /**
   * Check if terminal supports cursor control (repositioning).
   * Returns false for dumb terminals and piped output.
   */
  hasCursor(): boolean

  /**
   * Check if terminal can read raw keystrokes.
   * Requires stdin to be a TTY with raw mode support.
   */
  hasInput(): boolean

  /**
   * Check color level supported by terminal.
   * Returns null if no color support.
   */
  hasColor(): ColorLevel | null

  /**
   * Check if terminal can render unicode symbols.
   */
  hasUnicode(): boolean

  /**
   * Terminal capabilities profile.
   * Detected when stdin is a TTY, undefined otherwise.
   * Override via createTerm({ caps: { ... } }).
   */
  readonly caps: TerminalCaps | undefined

  // -------------------------------------------------------------------------
  // Sub-owners replace direct stdin/stdout (Phase 8 of km-silvery.term-sub-owners)
  //
  // The public Term interface no longer exposes raw NodeJS.ReadStream /
  // WriteStream. Direct access was the leak vector that produced the
  // 2026-04-22 wasRaw race class. Use the typed sub-owners instead:
  //   - term.input   — reads / probes (was: term.stdin.on('data', …))
  //   - term.output  — writes (was: term.stdout.write(…))
  //   - term.modes   — raw mode + protocol toggles (was: term.stdin.setRawMode)
  //   - term.size    — cols/rows + resize subscription
  //   - term.signals — process signal scope
  //   - term.console — patched console capture
  //
  // Silvery's own runtime (run.tsx adapters) still needs the raw streams to
  // bridge to legacy createApp.run() options — those access them via the
  // package-private accessor `getInternalStreams(term)` from `./term-internal`.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Sub-owners (the typed I/O surface — see km-silvery.term-sub-owners)
  //
  // Each sub-owner owns one class of shared global I/O state for the Term's
  // lifetime. Race-free by construction: only one writer per resource.
  // -------------------------------------------------------------------------

  /**
   * Input owner — mediates ALL stdin reads + raw-mode + data subscription.
   * Use `term.input.probe(…)` for terminal queries (color, cursor, kitty, etc.)
   * and `term.input.onData(…)` for primary key/mouse stream consumers.
   *
   * Replaces direct `process.stdin.setRawMode` / `stdin.on('data', …)` —
   * those patterns race under async (the 2026-04-22 wasRaw class).
   *
   * Lazily constructed on first access for Node-backed Terms.
   * Undefined for headless Terms (no stdin to own).
   */
  readonly input: Input | undefined

  /**
   * Output owner — single-owner stdout/stderr/console mediator.
   * Use `term.output.write(…)` for render-pipeline output.
   *
   * When activated (after protocol setup), intercepts `process.stdout` /
   * `process.stderr` / `console.*` so only silvery's render pipeline reaches
   * the terminal. Non-silvery writes are suppressed (stdout) or redirected to
   * `DEBUG_LOG` / buffered (stderr). One stable owner per Term, toggled via
   * `activate()` / `deactivate()` for pause/resume cycles.
   *
   * Lazily constructed on first access for Node-backed Terms.
   * Undefined for headless and emulator-backed Terms (no real stdout to own).
   */
  readonly output: Output | undefined

  /**
   * Size owner — single source of truth for terminal dimensions, exposed as
   * alien-signals `ReadSignal`s.
   *
   * `term.size.cols()` / `term.size.rows()` / `term.size.snapshot()` read the
   * current value and, inside `computed` / `effect`, subscribe to changes.
   * The first read installs the stdout `resize` listener; SIGWINCH bursts
   * coalesce to one notification per 16ms frame (one 60Hz frame).
   *
   * Replaces direct `process.stdout.columns` / `stdout.rows` reads — those
   * return stale snapshots under concurrent resize and scatter coalescing
   * logic across every consumer.
   *
   * Callers read dimensions via `term.size.cols()` / `term.size.rows()` —
   * the shorthand getters `term.cols` / `term.rows` were removed in Phase 8
   * as part of km-silvery.term-interface-diet (single source of truth).
   */
  readonly size: Size

  /**
   * Modes owner — single authority for terminal protocol modes, exposed as
   * alien-signals `Signal<T>`s.
   *
   * Each mode is a callable signal: `term.modes.rawMode`, `altScreen`,
   * `bracketedPaste`, `kittyKeyboard` (`number | false`), `mouse`,
   * `focusReporting`. Read via `modes.altScreen()`, write via
   * `modes.altScreen(true)`, subscribe via `effect(() => modes.altScreen())`.
   * Same-value writes don't re-emit ANSI (alien-signals equality). `dispose`
   * restores exactly what this owner activated.
   *
   * Replaces the scattered `enableMouse()` / `enableKittyKeyboard()` /
   * `enableBracketedPaste()` / `enableFocusReporting()` call sites that
   * previously toggled terminal state from every subsystem. Those shared
   * globals are the same leak vector that produced the 2026-04-22 wasRaw
   * race class — concentrating them behind one owner makes them race-free.
   */
  readonly modes: Modes

  /**
   * Signals owner — single coordinator for every process-signal handler
   * bound to this Term's lifetime.
   *
   * `term.signals.on("SIGINT", handler, { priority, before, after, name })`
   * registers a teardown handler. One shared `process.on(signal, …)` listener
   * is installed per signal, regardless of how many handlers the owner
   * manages. On `dispose()` (called from `term[Symbol.dispose]`), every
   * handler runs in priority / dependency order, each wrapped in try/catch
   * so one failure doesn't block the rest.
   *
   * Replaces ad-hoc `process.on("SIGINT", …)` / `process.once("SIGTERM", …)`
   * call sites scattered across runtime + apps. The 2026-04-22 shared-global
   * audit found 78 such sites with no documented cleanup order — late
   * handlers could crash while earlier handlers' resources leaked. The owner
   * gives every Term exactly one entry-point to the signal graph.
   *
   * Present on every Term variant — even headless / emulator-backed — since
   * signal handling is cross-cutting and benefits from consistent teardown
   * semantics in tests as well as production.
   */
  readonly signals: Signals

  /**
   * Console owner — single-owner console.* interceptor for the Term's lifetime.
   *
   * Starts inert. Call `term.console.capture({suppress:true})` once the alt
   * screen is active to route `console.log/info/warn/error/debug` into a
   * buffer instead of the screen; then `term.console.replay(stdout, stderr)`
   * on exit to re-emit captured entries to the normal streams. React apps
   * read via `subscribe` + `getSnapshot` (see `<Console>` + `useConsole`).
   *
   * Replaces the standalone console-patching helper — same implementation,
   * Term-owned lifecycle. Undefined for Terms that don't own a real console
   * (headless dims + emulator-backed), which never render through the global
   * terminal and therefore have nothing to corrupt.
   */
  readonly console: DeviceConsole | undefined

  // -------------------------------------------------------------------------
  // I/O Methods
  // -------------------------------------------------------------------------

  /**
   * Write string to stdout.
   */
  write(str: string): void

  /**
   * Write string followed by newline to stdout.
   */
  writeLine(str: string): void

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  /**
   * Strip ANSI escape codes from string.
   */
  stripAnsi(str: string): string

  // -------------------------------------------------------------------------
  // Terminal Emulator (present when created with a termless backend)
  // -------------------------------------------------------------------------

  /**
   * Visible screen region. Only available when created with a terminal backend.
   * Provides getText(), getLines(), containsText() for assertions.
   */
  readonly screen?: TermScreen

  /**
   * Scrollback region. Only available when created with a terminal backend.
   * Provides getText(), getLines(), containsText() for assertions.
   */
  readonly scrollback?: TermScreen

  /**
   * Cell-level access for the visible screen — row-first order.
   * Returns resolved RGB colors, attributes, wide-char info.
   * Only available on emulator-backed terms (createTermless).
   */
  cell?(
    row: number,
    col: number,
  ): { readonly fg: unknown; readonly bg: unknown; readonly char: string }

  /**
   * Row-level access for the visible screen.
   * Only available on emulator-backed terms (createTermless).
   */
  row?(n: number): {
    getText(): string
    cell(col: number): { readonly fg: unknown; readonly bg: unknown; readonly char: string }
  }

  /**
   * Resize the terminal emulator. Only available when created with a terminal backend.
   * Resizes the underlying emulator and triggers a re-render in the app.
   */
  resize?(cols: number, rows: number): void

  // -------------------------------------------------------------------------
  // Paint (rendered buffer → output)
  // -------------------------------------------------------------------------

  /**
   * Paint a rendered buffer to produce ANSI output.
   * Diffs buffer against prev (fresh render if prev is null).
   * Updates term.frame with an immutable TextFrame snapshot.
   * Returns the ANSI output string.
   * For emulator backends, also feeds the output to the emulator.
   * For headless terms, returns empty string.
   */
  paint?(buffer: TerminalBuffer, prev: TerminalBuffer | null): string

  /**
   * Last painted TextFrame. Set after each paint() call.
   * Immutable snapshot with cell-level access and resolved RGB colors.
   */
  readonly frame?: TextFrame
}

// =============================================================================
// Shared Helpers
// =============================================================================

/** Mock stdout that feeds a terminal emulator and supports resize events. */
function createEmulatorStdout(feed: (data: string) => void, cols: number, rows: number) {
  const resizeListeners = new Set<() => void>()
  const stdout: { columns: number; rows: number } & Record<string, unknown> = {
    write: (data: string | Uint8Array) => {
      feed(typeof data === "string" ? data : new TextDecoder().decode(data))
      return true
    },
    on: (event: string, handler: () => void) => {
      if (event === "resize") resizeListeners.add(handler)
    },
    off: (event: string, handler: () => void) => {
      if (event === "resize") resizeListeners.delete(handler)
    },
    isTTY: true,
    columns: cols,
    rows: rows,
  }
  return {
    stdout: stdout as unknown as NodeJS.WriteStream,
    resizeListeners,
    updateDims(c: number, r: number) {
      stdout.columns = c
      stdout.rows = r
    },
  }
}

/**
 * Finalize termBase into a Term: add frame getter, delegate emulator properties,
 * wrap with style chain Proxy.
 */
function finalizeTerm(
  style: Style,
  termBase: Record<string, unknown>,
  frame: { get: () => TextFrame | undefined },
  opts?: {
    defineProperties?: Record<string, PropertyDescriptor>
    delegateFrom?: object
  },
): Term {
  Object.defineProperty(termBase, "frame", { get: frame.get, enumerable: true })
  if (opts?.defineProperties) Object.defineProperties(termBase, opts.defineProperties)
  if (opts?.delegateFrom) {
    for (const key of Object.keys(opts.delegateFrom)) {
      if (key in termBase) continue
      const val = (opts.delegateFrom as any)[key]
      Object.defineProperty(
        termBase,
        key,
        typeof val === "function"
          ? { value: (...args: unknown[]) => (opts.delegateFrom as any)[key](...args) }
          : { get: () => (opts.delegateFrom as any)[key] },
      )
    }
  }
  return createMixedStyle(style, termBase) as unknown as Term
}

// =============================================================================
// createTerm Factory
// =============================================================================

/**
 * Create a Term instance.
 *
 * Factory overloads:
 * - `createTerm()` — Node.js terminal (auto-detect from process.stdin/stdout)
 * - `createTerm({ stdout, stdin, ... })` — Node.js with custom streams/overrides
 * - `createTerm({ cols, rows })` — Headless for testing (no I/O, fixed dims)
 * - `createTerm(backend, { cols, rows })` — Terminal emulator backend (termless) for testing
 * - `createTerm(emulator)` — Pre-created termless Terminal
 *
 * Detection results are cached at creation time for consistency.
 *
 * @example
 * ```ts
 * // Full terminal app
 * using term = createTerm()
 * await run(<App />, term)
 *
 * // Headless for testing
 * const term = createTerm({ cols: 80, rows: 24 })
 *
 * // Terminal emulator (termless) for full ANSI testing
 * using term = createTerm(createXtermBackend(), { cols: 80, rows: 24 })
 * await run(<App />, term)
 * expect(term.screen).toContainText("Hello")
 *
 * // Custom streams
 * const term = createTerm({ stdout: customStream })
 * ```
 */
export function createTerm(options?: CreateTermOptions): Term
export function createTerm(dims: { cols: number; rows: number }): Term
export function createTerm(backend: TermEmulatorBackend, dims: { cols: number; rows: number }): Term
export function createTerm(emulator: TermEmulator): Term
export function createTerm(
  first?: CreateTermOptions | { cols: number; rows: number } | TermEmulator | TermEmulatorBackend,
  second?: { cols: number; rows: number },
): Term {
  // Two-arg: createTerm(backend, { cols, rows }) — raw backend + dims
  if (second && first && isTermBackend(first)) {
    // Lazy require — @termless/core is an optional dependency, only needed
    // for emulator backends. Using a variable prevents static analysis from
    // trying to resolve it at bundle/parse time.
    const mod = "@termless/core"
    const { createTerminal } = require(mod) as {
      createTerminal: (opts: {
        backend: TermEmulatorBackend
        cols: number
        rows: number
      }) => TermEmulator
    }
    const emulator = createTerminal({ backend: first as TermEmulatorBackend, ...second })
    return createBackendTerm(emulator)
  }
  // Detect terminal emulator (termless Terminal): has feed + screen
  if (first && isTermEmulator(first)) {
    return createBackendTerm(first as TermEmulator)
  }
  // Detect headless dims: has cols + rows but no stdout/stdin/color/caps
  if (first && isHeadlessDims(first)) {
    return createHeadlessTerm(first as { cols: number; rows: number })
  }
  return createNodeTerm((first as CreateTermOptions) ?? {})
}

/** Detect terminal emulator (termless Terminal): has feed() + screen */
function isTermEmulator(obj: unknown): obj is TermEmulator {
  if (typeof obj !== "object" || obj === null) return false
  const o = obj as Record<string, unknown>
  return typeof o.feed === "function" && typeof o.screen === "object" && o.screen !== null
}

/** Detect terminal emulator backend (termless TerminalBackend): has init() + name */
function isTermBackend(obj: unknown): obj is TermEmulatorBackend {
  if (typeof obj !== "object" || obj === null) return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.init === "function" && typeof o.name === "string" && typeof o.destroy === "function"
  )
}

/** Detect headless dims: has cols and rows numbers, no stdout */
function isHeadlessDims(obj: unknown): boolean {
  if (typeof obj !== "object" || obj === null) return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.cols === "number" && typeof o.rows === "number" && !("stdout" in o) && !("stdin" in o)
  )
}

/**
 * Create a Node.js terminal with full Provider capabilities.
 */
function createNodeTerm(options: CreateTermOptions): Term {
  const stdout = options.stdout ?? process.stdout
  const stdin = options.stdin ?? process.stdin

  // Cache detection results
  const cachedCursor = options.cursor ?? detectCursor(stdout)
  const cachedInput = detectInput(stdin)
  const cachedColor = options.color !== undefined ? options.color : detectColor(stdout)
  const cachedUnicode = options.unicode ?? detectUnicode()

  // Detect terminal capabilities (only when interactive)
  const detectedCaps = options.caps
    ? { ...defaultCaps(), ...options.caps }
    : stdin.isTTY
      ? detectTerminalCaps()
      : undefined

  // Create style instance with appropriate color level
  const styleInstance = createStyle({ level: cachedColor })

  // Size owner — single source of truth for cols/rows. Subscribes to stdout's
  // `resize` event with 16ms coalescing so burst SIGWINCH from tmux/cmux/
  // Ghostty tab switches collapses to one notification. Constructed eagerly
  // so term.size is valid for any consumer.
  // See km-silvery.term-sub-owners Phase 5.
  const size = createSize(stdout)

  let _frame: TextFrame | undefined

  // Sub-owner storage declared up-front so `ownedWrite` below can reference
  // `_output` in its closure. `_input` is constructed eagerly for TTY-backed
  // terms (single stdin owner for the session's lifetime); `_output` is
  // populated lazily by `getOutput()`.
  let _output: Output | null = null

  // Writer router: every silvery-owned ANSI write (modes toggles, term.write,
  // probe queries via InputOwner) flows through this single function. When
  // `Output` is active, foreign `stdout.write` is patched into a
  // suppress/redirect sink, so owned writes MUST go through `output.write(...)`
  // which bypasses the sink. When `Output` is inactive, the raw `stdout.write`
  // is safe. Without this, any mode toggle or probe query after
  // `output.activate()` goes to the patched `process.stdout.write` and can
  // be dropped. Pro-review finding, 2026-04-22.
  const ownedWrite = (s: string): boolean => {
    const out = _output
    if (out && out.active()) return out.write(s)
    return stdout.write(s)
  }

  // Modes owner — single authority for terminal protocol modes (raw, alt-
  // screen, paste, kitty keyboard, mouse, focus reporting). Consolidates
  // the scattered enable*/disable* call sites. See Phase 4. Declared before
  // Input because Input routes raw-mode + bracketed-paste through modes.
  const modes = createModes({
    write: ownedWrite,
    stdin,
  })

  // Eager Input — constructed at term creation for TTY-backed Node terms.
  // Owns stdin's raw mode + data listener + bracketed-paste protocol for the
  // Term's lifetime. Single stdin authority — no other code should call
  // stdin.on("data", …) or stdin.setRawMode. Non-TTY backed terms (tests,
  // piped stdin) get undefined; callers branch off `term.input` existence.
  // See km-silvery.term-sub-owners Phase 2 + km-silvery.input-structured-events.
  const _input: Input | null = stdin.isTTY
    ? createInputOwner(stdin, stdout, { writeStdout: ownedWrite, modes })
    : null
  const getInput = (): Input | undefined => _input ?? undefined

  // Shared ConsoleRouter — the single patcher for console.*. Both Console
  // (tap) and Output (sink) register against it so activation order no
  // longer matters. Pro review 2026-04-22 P0-3 structural fix.
  const consoleRouter = createConsoleRouter(globalThis.console)

  // Lazy Output — constructed on first access. Owns stdout/stderr/console
  // intercepts for the Term's lifetime. Starts deactivated; caller activates
  // after protocol setup. See km-silvery.term-sub-owners Phase 3.
  // Only available when stdout is the real process.stdout (mocks + emulators
  // don't benefit from the global-patching guard).
  const getOutput = (): Output | undefined => {
    if (stdout !== process.stdout) return undefined
    if (!_output) {
      _output = createOutput(undefined, consoleRouter)
    }
    return _output
  }

  // Console owner — captures console.* during alt-screen rendering. Shares
  // the Term's ConsoleRouter so its tap lives on the same patch site as
  // Output's sink. See km-silvery.term-sub-owners Phase 7 + Phase C (Pro
  // review follow-up).
  const consoleOwner = createConsole(globalThis.console, consoleRouter)

  // Signals owner — coordinates process-signal handlers for this Term's
  // lifetime. No process-level listener is installed until the first `on()`
  // call. Replaces the 78+ scattered `process.on(SIG…, …)` sites found in the
  // 2026-04-22 shared-global audit. See Phase 6.
  const signals = createSignals()

  const termBase = {
    hasCursor: () => cachedCursor,
    hasInput: () => cachedInput,
    hasColor: () => cachedColor,
    hasUnicode: () => cachedUnicode,
    caps: detectedCaps,
    size,
    modes,
    signals,
    console: consoleOwner,
    write: (str: string) => {
      ownedWrite(str)
    },
    writeLine: (str: string) => {
      ownedWrite(str + "\n")
    },
    stripAnsi,
    paint: (buffer: TerminalBuffer, prev: TerminalBuffer | null): string => {
      const output = outputPhase(prev, buffer)
      _frame = createTextFrame(buffer)
      return output
    },
    [Symbol.dispose]: () => {
      // Run signal teardown FIRST so handlers can still touch sub-owners
      // (input/output/modes) while they're alive. After this, we drop each
      // owner in reverse-construction order.
      signals.dispose()
      if (_input) _input[Symbol.dispose]()
      if (_output) _output[Symbol.dispose]()
      consoleOwner[Symbol.dispose]()
      // Dispose the shared router AFTER both Console and Output have been
      // torn down (above) so no latent taps/sinks reference a disposed
      // router.
      consoleRouter.dispose()
      modes[Symbol.dispose]()
      size[Symbol.dispose]()
    },
  }
  // Raw streams live under private Symbol keys — invisible to Object.keys
  // and unreachable via `(term as any).stdin`. Only `getInternalStreams()`
  // from runtime/term-internal.ts can read them, and that module's import
  // is restricted to silvery's runtime/ + ansi/ by the ownership lint.
  Object.defineProperty(termBase, STDIN_SYMBOL, {
    value: stdin,
    enumerable: false,
    writable: false,
    configurable: false,
  })
  Object.defineProperty(termBase, STDOUT_SYMBOL, {
    value: stdout,
    enumerable: false,
    writable: false,
    configurable: false,
  })

  return finalizeTerm(
    styleInstance,
    termBase,
    { get: () => _frame },
    {
      defineProperties: {
        input: { get: () => getInput(), enumerable: true },
        output: { get: () => getOutput(), enumerable: true },
      },
    },
  )
}

/** Stand-in ReadStream for Modes on headless / emulator-backed Terms.
 *
 * Not a TTY, so `setRawMode` is a no-op on the underlying stream. The Modes
 * owner tracks intent (e.g. `isRawMode`) but emits no ANSI and touches no
 * real termios — correct for testing / emulator backends.
 */
const HEADLESS_STDIN: NodeJS.ReadStream = {
  isTTY: false,
  setRawMode() {
    return this as NodeJS.ReadStream
  },
} as unknown as NodeJS.ReadStream

/** Create a headless terminal for testing — no I/O, fixed dimensions. */
function createHeadlessTerm(dims: { cols: number; rows: number }): Term {
  let disposed = false
  let _frame: TextFrame | undefined
  const size = createFixedSize(dims)
  // Modes owner for the headless term: writes go to a sink, stdin is
  // non-TTY so raw-mode toggles are tracked but never applied. Keeps the
  // `term.modes` surface uniform across Term variants.
  const modes = createModes({ write: () => {}, stdin: HEADLESS_STDIN })
  // Signals owner — handlers register lazily; dispose removes them. Same
  // shape as Node-backed Term so test code that mounts a Signals consumer
  // works in both contexts.
  const signals = createSignals()

  const termBase = {
    hasCursor: () => false,
    hasInput: () => false,
    hasColor: () => null as ColorLevel | null,
    hasUnicode: () => false,
    caps: undefined as TerminalCaps | undefined,
    size,
    modes,
    signals,
    console: undefined as DeviceConsole | undefined,
    write: () => {},
    writeLine: () => {},
    stripAnsi,
    paint: (_buffer: TerminalBuffer, _prev: TerminalBuffer | null): string => {
      _frame = createTextFrame(_buffer)
      return ""
    },
    [Symbol.dispose]: () => {
      if (disposed) return
      disposed = true
      signals[Symbol.dispose]()
      modes[Symbol.dispose]()
      size[Symbol.dispose]()
    },
  }
  // Headless exposes process.stdin/stdout under the same symbol-keyed slots
  // so getInternalStreams() returns stable refs across Term variants.
  Object.defineProperty(termBase, STDIN_SYMBOL, {
    value: process.stdin,
    enumerable: false,
    writable: false,
    configurable: false,
  })
  Object.defineProperty(termBase, STDOUT_SYMBOL, {
    value: process.stdout,
    enumerable: false,
    writable: false,
    configurable: false,
  })

  return finalizeTerm(
    createStyle({ level: null }),
    termBase,
    { get: () => _frame },
    {
      defineProperties: {
        // Headless Terms have no real stdin to own — sub-owner is undefined.
        input: { get: () => undefined, enumerable: true },
        // Headless Terms have no real stdout to own — sub-owner is undefined.
        output: { get: () => undefined, enumerable: true },
      },
    },
  )
}

/** Create a terminal backed by a termless emulator — real ANSI processing, screen/scrollback. */
function createBackendTerm(emulator: TermEmulator): Term {
  const { stdout, resizeListeners, updateDims } = createEmulatorStdout(
    (s) => emulator.feed(s),
    emulator.cols,
    emulator.rows,
  )
  let _frame: TextFrame | undefined
  const size = createFixedSize({ cols: emulator.cols, rows: emulator.rows })
  // Modes owner for emulator-backed terms: ANSI mode sequences would be
  // interpreted as input if fed to the emulator, so the write function is a
  // sink. The owner still tracks state (`modes.mouse()`, etc.) for parity
  // with Node terms, but the emulator itself decides what to accept.
  const modes = createModes({ write: () => {}, stdin: HEADLESS_STDIN })
  // Input sub-owner — non-TTY, pure event-bus mode. `sendInput(data)` parses
  // ANSI bytes and fans out to onKey/onMouse/onPaste/onFocus subscribers so
  // emulator-backed Terms share the same consumer shape as Node-backed.
  const input = createInputOwner(HEADLESS_STDIN, stdout, { enableBracketedPaste: false })
  // Signals owner — emulator-backed terms share the host process so exit /
  // SIGINT handlers remain meaningful. Construction is free (no process
  // listeners until first on()), and the contract promises signals on every
  // Term.
  const signals = createSignals()

  const termBase = {
    hasCursor: () => true,
    hasInput: () => true,
    hasColor: () => "truecolor" as ColorLevel | null,
    hasUnicode: () => true,
    caps: undefined as TerminalCaps | undefined,
    size,
    modes,
    signals,
    console: undefined as DeviceConsole | undefined,
    write: (str: string) => emulator.feed(str),
    writeLine: (str: string) => emulator.feed(str + "\n"),
    resize: (cols: number, rows: number) => {
      emulator.resize(cols, rows)
      updateDims(cols, rows)
      size.update(cols, rows)
      resizeListeners.forEach((l) => l())
    },
    sendInput: (data: string) => {
      // Parse the data into typed events and fan out via the input owner.
      const pasteResult = parseBracketedPaste(data)
      if (pasteResult) {
        input.sendPaste({ text: pasteResult.content })
        return
      }
      for (const raw of splitRawInput(data)) {
        const focusEvent = parseFocusEvent(raw)
        if (focusEvent) {
          input.sendFocus({ focused: focusEvent.type === "focus-in" })
          continue
        }
        if (isMouseSequence(raw)) {
          const parsed = parseMouseSequence(raw)
          if (parsed) input.sendMouse(parsed)
          continue
        }
        const [parsedInput, key] = parseKey(raw)
        input.sendKey({ input: parsedInput, key })
      }
    },
    stripAnsi,
    paint: (buffer: TerminalBuffer, prev: TerminalBuffer | null): string => {
      const output = outputPhase(prev, buffer)
      if (output) emulator.feed(output)
      _frame = createTextFrame(buffer)
      return output
    },
    _emulator: emulator,
    [Symbol.dispose]: () => {
      input[Symbol.dispose]()
      signals.dispose()
      modes[Symbol.dispose]()
      size[Symbol.dispose]()
      emulator.close().catch(() => {})
    },
  }
  // Emulator-backed terms expose the mock stdout (feed-into-emulator) and
  // the host's real stdin under the symbol slots so getInternalStreams()
  // returns stable refs for run()'s legacy options-bag bridge.
  Object.defineProperty(termBase, STDIN_SYMBOL, {
    value: process.stdin,
    enumerable: false,
    writable: false,
    configurable: false,
  })
  Object.defineProperty(termBase, STDOUT_SYMBOL, {
    value: stdout,
    enumerable: false,
    writable: false,
    configurable: false,
  })

  return finalizeTerm(
    createStyle({ level: "truecolor" }),
    termBase,
    { get: () => _frame },
    {
      defineProperties: {
        screen: { get: () => emulator.screen, enumerable: true },
        scrollback: { get: () => emulator.scrollback, enumerable: true },
        // Emulator-backed Terms expose a non-TTY InputOwner as a pure event
        // bus: consumers subscribe via input.on*, and `term.sendInput(data)`
        // parses bytes into sendKey/sendMouse/sendPaste/sendFocus calls.
        input: { get: () => input, enumerable: true },
        // Termless-backed Terms write through emulator.feed, not process.stdout —
        // no Output guard needed.
        output: { get: () => undefined, enumerable: true },
      },
      delegateFrom: emulator,
    },
  )
}
