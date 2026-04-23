/**
 * Term interface and createTerm() factory.
 *
 * Term is the central abstraction for terminal interaction:
 * - Caps + emulator identity: term.caps, term.emulator
 * - Dimensions: cols, rows (shorthand for term.size.cols() / .rows())
 * - I/O: write(), writeLine()
 * - Sub-owners: input, output, modes, size, signals, console
 * - Styling: Chainable styles via Proxy (term.bold.red('text'))
 * - Lifecycle: Disposable pattern via Symbol.dispose
 *
 * Post km-silvery.plateau-naming-polish (2026-04-23): `term.identity` became
 * `term.emulator` (matches TERM_PROGRAM provenance) and `term.heuristics` was
 * absorbed into `term.caps` with a `maybe` prefix per field
 * (`caps.maybeDarkBackground` etc.).
 *
 * Post km-silvery.caps-restructure (Phase 7, 2026-04-23): the legacy
 * `hasCursor()`/`hasInput()`/`hasColor()`/`hasUnicode()` methods are gone.
 * Callers read `term.caps.cursor`, `term.caps.input`, `term.caps.colorLevel`,
 * and `term.caps.unicode` directly — one source of truth.
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

import {
  createMixedStyle,
  createStyle,
  createTerminalProfile,
  type Style,
  type TerminalProfile,
  type TerminalEmulator,
} from "@silvery/ansi"
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
import { defaultCaps } from "./detection"
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
} & {
  // Extended underline terminators (Phase 6 of the unicode plateau,
  // 2026-04-23). These replaced the bare `curlyUnderline()` /
  // `styledUnderline()` etc. exports in `@silvery/ansi` — caps flow
  // through `createStyle(caps)` at Term construction instead of per-call.
  // Not chainable; take text as the final argument. Fall back to standard
  // SGR 4 when the requested style isn't in `term.caps.underlineStyles`
  // (post Phase 7 the field is an array, not a boolean). Declared in a separate
  // intersection member because TypeScript forbids mixing mapped types
  // with method signatures in the same object.
  curlyUnderline(text: string): string
  dottedUnderline(text: string): string
  dashedUnderline(text: string): string
  doubleUnderline(text: string): string
  underlineColor(r: number, g: number, b: number, text: string): string
  styledUnderline(
    name: import("./types.ts").UnderlineStyle,
    rgb: import("./types.ts").RGB,
    text: string,
  ): string
}

// =============================================================================
// Term Interface
// =============================================================================

/**
 * Term — the central abstraction for terminal interaction.
 *
 * Term is both a styling helper (chainable ANSI via Proxy) and the umbrella
 * for typed sub-owners (input / output / modes / size / signals / console).
 * Pass it to `run()` or `createApp()`.
 *
 * Provides:
 * - Capability detection (cached on creation)
 * - Dimensions (shorthand getters over `term.size`)
 * - I/O (write, writeLine + the per-resource sub-owners)
 * - Sub-owners: input (stdin/probes/events), output (stdout guard),
 *   modes (raw/alt-screen/paste/kitty/mouse/focus), size (dims + resize),
 *   signals (process signal scope), console (console.* capture)
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
  // Capability + identity surface (post km-silvery.caps-restructure Phase 7)
  //
  // The legacy hasCursor()/hasInput()/hasColor()/hasUnicode() methods are
  // deleted — they duplicated fields already on `caps`. Callers read:
  //   term.caps.cursor
  //   term.caps.input
  //   term.caps.colorLevel
  //   term.caps.unicode
  // -------------------------------------------------------------------------

  /**
   * Terminal capabilities profile.
   *
   * Always populated — every Term constructor commits to a full TerminalCaps.
   * Node-backed Terms with TTY stdin detect from the environment; non-TTY
   * Node terms, headless Terms, and emulator-backed Terms use sensible
   * deterministic defaults (`defaultCaps()` — truecolor, unicode, no kitty
   * keyboard). Override via `createTerm({ caps: { … } })`.
   *
   * Post km-silvery.terminal-profile-plateau Phase 2 this is non-optional —
   * callers no longer need `term.caps ?? detectTerminalCaps()` guards.
   *
   * Equivalent to `term.profile.caps`. The two views are guaranteed identical
   * — every Term constructor seeds `profile` from `caps` (or vice versa) via
   * `createTerminalProfile({ caps })` so there's only one source of truth.
   */
  readonly caps: TerminalCaps

  /**
   * Fully-resolved {@link TerminalProfile} for this Term — `caps`, `colorLevel`,
   * `colorForced`, and `colorProvenance` bundled into the single value
   * downstream consumers should pass through the pipeline.
   *
   * Every Term variant owns its profile. Node-backed Terms build it from the
   * TTY/env detection that populated `caps`; headless and emulator-backed
   * Terms build it from their deterministic caps. The profile's
   * `colorProvenance` is always `"caller-caps"` (and `colorForced` is `false`)
   * when the Term constructed it from `caps` — Term construction is not an
   * opportunity for env precedence (that happens at `run()` / `createApp()`
   * where `colorLevel` / `NO_COLOR` are applied).
   *
   * Prefer this over `term.caps` when calling downstream pipeline entry
   * points that accept a profile. run.tsx's Term branch reads it directly
   * instead of rebuilding via `createTerminalProfile({ caps: term.caps })`
   * — one detection, one profile, no double-pass.
   *
   * Post km-silvery.plateau-term-owns-profile (H15 of the /big review
   * 2026-04-23).
   */
  readonly profile: TerminalProfile

  /**
   * Environment identity — `program`, `version`, `TERM`. Convenience mirror
   * of `profile.emulator`. Callers that only need "who is the terminal?"
   * (diagnostics, probe-cache keys) read this instead of sitting on the full
   * protocol-flags surface of {@link caps}.
   *
   * Post km-silvery.plateau-naming-polish (2026-04-23): renamed from
   * `term.identity`; `TerminalIdentity` → `TerminalEmulator`.
   */
  readonly emulator: TerminalEmulator

  // -------------------------------------------------------------------------
  // Dimensions
  // -------------------------------------------------------------------------

  /**
   * Terminal width in columns.
   * Undefined if not a TTY or dimensions unavailable.
   */
  readonly cols: number | undefined

  /**
   * Terminal height in rows.
   * Undefined if not a TTY or dimensions unavailable.
   */
  readonly rows: number | undefined

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
   * `term.cols` / `term.rows` remain as shorthand getters that delegate to
   * this owner; they are slated for removal alongside `term.stdin/stdout` in
   * Phase 8.
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
export function createTerm(dims: {
  cols: number
  rows: number
  caps?: Partial<TerminalCaps>
}): Term
export function createTerm(
  backend: TermEmulatorBackend,
  dims: { cols: number; rows: number; caps?: Partial<TerminalCaps> },
): Term
export function createTerm(emulator: TermEmulator, opts?: { caps?: Partial<TerminalCaps> }): Term
export function createTerm(
  first?:
    | CreateTermOptions
    | { cols: number; rows: number; caps?: Partial<TerminalCaps> }
    | TermEmulator
    | TermEmulatorBackend,
  second?: { cols: number; rows: number; caps?: Partial<TerminalCaps> } | { caps?: Partial<TerminalCaps> },
): Term {
  // Two-arg: createTerm(backend, { cols, rows, caps? }) — raw backend + dims
  if (second && first && isTermBackend(first)) {
    const dims = second as { cols: number; rows: number; caps?: Partial<TerminalCaps> }
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
    const emulator = createTerminal({
      backend: first as TermEmulatorBackend,
      cols: dims.cols,
      rows: dims.rows,
    })
    return createBackendTerm(emulator, dims.caps)
  }
  // Detect terminal emulator (termless Terminal): has feed + screen
  if (first && isTermEmulator(first)) {
    const opts = second as { caps?: Partial<TerminalCaps> } | undefined
    return createBackendTerm(first as TermEmulator, opts?.caps)
  }
  // Detect headless dims: has cols + rows but no stdout/stdin/color/caps
  if (first && isHeadlessDims(first)) {
    const dims = first as { cols: number; rows: number; caps?: Partial<TerminalCaps> }
    return createHeadlessTerm({ cols: dims.cols, rows: dims.rows }, dims.caps)
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

  // Fully-resolved TerminalProfile — the single value that flows through
  // run() / createApp() for this Term's lifetime. Post km-silvery.plateau-
  // delete-legacy-shims (H6): this one call replaces the former
  // `detectColor(stdout)` + `detectTerminalCaps()` pair.
  //
  // Term-construction precedence (differs from profile-factory defaults):
  //   - `options.caps` present → caps base + `colorLevel` = caps.colorLevel.
  //     Treat explicit caps as a hard override that wins over env — a test
  //     harness or adapter passing `caps: { colorLevel: "truecolor" }` wants
  //     that tier regardless of what FORCE_COLOR / NO_COLOR say. This matches
  //     the legacy `detectTerminalCaps()` path which short-circuited on
  //     explicit caps.
  //   - `options.color` (legacy `ColorLevel | null`) → thread through
  //     `colorLevel` so it participates in the normal precedence chain.
  //   - non-TTY Node terms → `defaultCaps()` base + no caller override.
  //   - TTY Node terms → full env-based auto-detection.
  const profileCapsBase: Partial<TerminalCaps> | undefined = options.caps
    ? options.caps
    : stdin.isTTY
      ? undefined // let profile factory run full env detection
      : defaultCaps() // non-TTY: deterministic defaults, skip env probe
  const explicitColor =
    options.color === undefined ? undefined : (options.color ?? "mono")
  // Explicit caps override the env chain — tests and adapters that pass
  // `caps: { colorLevel: ... }` rely on the tier they specified. Promoting
  // the caps tier into `colorLevel` mostly re-establishes that, but the
  // profile factory still lets NO_COLOR / FORCE_COLOR win over overrides
  // (that's the documented chain). So when caps is explicit, we build the
  // profile with `env: {}` to neutralize env precedence at the factory
  // level — the caller's caps are authoritative for the Term's lifetime.
  const baseProfile: TerminalProfile = options.caps
    ? createTerminalProfile({
        env: {},
        stdout,
        stdin,
        caps: options.caps,
        colorLevel: explicitColor ?? options.caps.colorLevel,
      })
    : createTerminalProfile({
        stdout,
        stdin,
        caps: profileCapsBase,
        colorLevel: explicitColor,
      })

  // Apply legacy `options.cursor` / `options.unicode` overrides to caps so
  // the Term's profile is the one source of truth. Without this the old
  // `hasCursor()` / `hasUnicode()` values would disagree with `caps.cursor`
  // / `caps.unicode` once those methods are gone.
  const profile: TerminalProfile =
    options.cursor !== undefined || options.unicode !== undefined
      ? {
          ...baseProfile,
          caps: {
            ...baseProfile.caps,
            cursor: options.cursor ?? baseProfile.caps.cursor,
            unicode: options.unicode ?? baseProfile.caps.unicode,
          },
        }
      : baseProfile

  const detectedCaps: TerminalCaps = profile.caps
  const cachedColor: ColorLevel = profile.colorLevel

  // Create style instance with appropriate color level + caps. Caps drive
  // the extended-underline methods on Style (Phase 6 of the unicode
  // plateau, 2026-04-23) — `term.curlyUnderline("err")` respects the same
  // `term.caps.underlineStyles` gate the retired bare `curlyUnderline()`
  // export used. Post Phase 7: `underlineStyles` is an array; style.ts
  // projects that to a boolean "any extended style supported" for the
  // legacy style caps shape.
  const styleInstance = createStyle({
    level: cachedColor,
    caps: {
      underlineStyles: profile.caps.underlineStyles.length > 0,
      underlineColor: profile.caps.underlineColor,
    },
  })

  // Size owner — single source of truth for cols/rows. Subscribes to stdout's
  // `resize` event with 16ms coalescing so burst SIGWINCH from tmux/cmux/
  // Ghostty tab switches collapses to one notification. Constructed eagerly
  // so term.size and term.cols/rows are valid for any consumer.
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

  // Lazy Input — constructed on first access for TTY-backed Node terms.
  // Owns stdin's raw mode + data listener + bracketed-paste protocol for the
  // Term's lifetime once accessed. Lazy construction avoids piling up
  // listeners when cold Terms are constructed during startup orchestration
  // (km-cli's multi-step progress UI briefly instantiates several Terms
  // before the live TUI one — if Input were eager, each would attach an
  // 11th `data` listener on process.stdin). Non-TTY backed terms (tests,
  // piped stdin) get undefined; callers branch off `term.input` existence.
  // See km-silvery.term-sub-owners Phase 2 + km-silvery.input-structured-events.
  let _input: Input | null = null
  const getInput = (): Input | undefined => {
    if (!stdin.isTTY) return undefined
    if (!_input) {
      _input = createInputOwner(stdin, stdout, { writeStdout: ownedWrite, modes })
    }
    return _input
  }

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
    caps: detectedCaps,
    profile,
    emulator: profile.emulator,
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
        // cols / rows are shorthand for term.size.cols() / .rows(). Non-TTY
        // streams have no reliable dims — surface undefined then.
        cols: { get: () => (stdout.isTTY ? size.cols() : undefined), enumerable: true },
        rows: { get: () => (stdout.isTTY ? size.rows() : undefined), enumerable: true },
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
function createHeadlessTerm(
  dims: { cols: number; rows: number },
  capsOverride?: Partial<TerminalCaps>,
): Term {
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

  // Headless Terms are declaratively mono/no-input but still publish a full
  // TerminalCaps so downstream code (pipeline, measurer) gets the guaranteed
  // shape `Term.caps: TerminalCaps` promises. Default to `mono` colorLevel;
  // callers wanting a richer test surface can pass
  // `{ caps: { colorLevel: 'truecolor' } }` through createTermless.
  const headlessCaps: TerminalCaps = {
    ...defaultCaps(),
    colorLevel: "mono",
    unicode: false,
    mouse: false,
    bracketedPaste: false,
    ...capsOverride,
  }

  // Fully-resolved profile — identical caps, `source: "caller-caps"`. See the
  // Node-backed path for the H15 rationale.
  const profile: TerminalProfile = createTerminalProfile({
    env: {},
    stdin: undefined,
    stdout: { isTTY: false },
    caps: headlessCaps,
  })

  const termBase = {
    caps: profile.caps,
    profile,
    emulator: profile.emulator,
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
    // Headless: no color, no extended underline. Project the array form of
    // caps.underlineStyles to the boolean the Style caps shape expects.
    createStyle({
      level: null,
      caps: {
        underlineStyles: profile.caps.underlineStyles.length > 0,
        underlineColor: profile.caps.underlineColor,
      },
    }),
    termBase,
    { get: () => _frame },
    {
      defineProperties: {
        cols: { get: () => size.cols(), enumerable: true },
        rows: { get: () => size.rows(), enumerable: true },
        // Headless Terms have no real stdin to own — sub-owner is undefined.
        input: { get: () => undefined, enumerable: true },
        // Headless Terms have no real stdout to own — sub-owner is undefined.
        output: { get: () => undefined, enumerable: true },
      },
    },
  )
}

/** Create a terminal backed by a termless emulator — real ANSI processing, screen/scrollback. */
function createBackendTerm(emulator: TermEmulator, capsOverride?: Partial<TerminalCaps>): Term {
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

  // Emulator-backed terms (termless / xterm.js) render a known-capability
  // virtual terminal: truecolor, unicode, mouse, bracketed paste. These are
  // deterministic (no env sniffing), which is exactly what tests want.
  // `defaultCaps()` already matches this shape — keep it as the base so any
  // future default changes propagate without a second source of truth.
  //
  // Post km-silvery.unicode-plateau Phase 3/4 (2026-04-23): caps.cursor and
  // caps.input were added to TerminalCaps. `defaultCaps()` defaults them to
  // `false` (safe for headless / non-TTY). Emulator-backed terms are the
  // exception — they simulate a full TTY, so we override both to `true` to
  // match the hardcoded `hasCursor()` / `hasInput()` methods below. Without
  // this override, `term.caps.cursor not matching the hard-coded hasCursor=true on emulator Term (historic API — removed in Phase 7)` — a subtle
  // divergence any caps consumer would hit.
  const emulatorCaps: TerminalCaps = {
    ...defaultCaps(),
    cursor: true,
    input: true,
    ...capsOverride,
  }

  // Fully-resolved profile — same reasoning as the Node-backed path. Source
  // is always `"caller-caps"` because Term construction commits to the caps
  // before env-level overrides get a say.
  const profile: TerminalProfile = createTerminalProfile({
    env: {},
    stdin: undefined,
    stdout: { isTTY: false },
    caps: emulatorCaps,
  })

  const termBase = {
    caps: profile.caps,
    profile,
    emulator: profile.emulator,
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
    // Emulator-backed (termless / xterm.js): full truecolor + extended
    // underline — emulatorCaps defaults to the modern style set.
    createStyle({
      level: "truecolor",
      caps: {
        underlineStyles: profile.caps.underlineStyles.length > 0,
        underlineColor: profile.caps.underlineColor,
      },
    }),
    termBase,
    { get: () => _frame },
    {
      defineProperties: {
        cols: { get: () => size.cols(), enumerable: true },
        rows: { get: () => size.rows(), enumerable: true },
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
