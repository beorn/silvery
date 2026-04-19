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
import type { ProviderEvent } from "../runtime/types"
import { createTermProvider, type TermState, type TermEvents } from "../runtime/term-provider"
import { splitRawInput, parseKey } from "@silvery/ag/keys"
import { isMouseSequence, parseMouseSequence } from "../mouse"
import { parseFocusEvent } from "../focus-reporting"
import { parseBracketedPaste } from "../bracketed-paste"

// Re-export Provider-related types for convenience
export type { TermState, TermEvents } from "../runtime/term-provider"

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
  // Streams
  // -------------------------------------------------------------------------

  /**
   * Output stream (defaults to process.stdout).
   */
  readonly stdout: NodeJS.WriteStream

  /**
   * Input stream (defaults to process.stdin).
   */
  readonly stdin: NodeJS.ReadStream

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
  // Provider (state + events)
  // -------------------------------------------------------------------------

  /**
   * Get current terminal state (dimensions).
   * Always returns defined values (falls back to 80x24).
   */
  getState(): TermState

  /**
   * Subscribe to terminal state changes (resize).
   * Returns unsubscribe function.
   */
  subscribe(listener: (state: TermState) => void): () => void

  /**
   * Event stream — yields typed key, mouse, and resize events.
   * Enables raw mode on stdin when iterated. Cleans up on return.
   */
  events(): AsyncIterable<ProviderEvent<TermEvents>>

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

/** Parse raw terminal input into typed events (key, mouse, paste, focus). */
function parseInputEvents(data: string): ProviderEvent<TermEvents>[] {
  const events: ProviderEvent<TermEvents>[] = []
  const pasteResult = parseBracketedPaste(data)
  if (pasteResult) {
    events.push({ type: "paste", data: { text: pasteResult.content } })
  } else {
    for (const raw of splitRawInput(data)) {
      const focusEvent = parseFocusEvent(raw)
      if (focusEvent) {
        events.push({ type: "focus", data: { focused: focusEvent.type === "focus-in" } })
        continue
      }
      if (isMouseSequence(raw)) {
        const parsed = parseMouseSequence(raw)
        if (parsed) events.push({ type: "mouse", data: parsed })
        continue
      }
      const [input, key] = parseKey(raw)
      events.push({ type: "key", data: { input, key } })
    }
  }
  return events
}

/** Event queue with async generator for term providers. */
function createEventQueue(controller: AbortController) {
  const queue: ProviderEvent<TermEvents>[] = []
  let resolve: (() => void) | null = null
  let disposed = false

  function push(...events: ProviderEvent<TermEvents>[]) {
    queue.push(...events)
    if (resolve) {
      const r = resolve
      resolve = null
      r()
    }
  }

  async function* events(): AsyncIterable<ProviderEvent<TermEvents>> {
    if (disposed) return
    while (!disposed && !controller.signal.aborted) {
      if (queue.length === 0) {
        await new Promise<void>((r) => {
          resolve = r
          controller.signal.addEventListener("abort", () => r(), { once: true })
        })
      }
      if (disposed || controller.signal.aborted) break
      while (queue.length > 0) yield queue.shift()!
    }
  }

  return {
    push,
    events,
    dispose() {
      disposed = true
    },
  }
}

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

  // Lazy Provider — only created when getState/subscribe/events is called.
  // This avoids adding a resize listener for styling-only usage.
  let provider: ReturnType<typeof createTermProvider> | null = null
  const getProvider = () => {
    if (!provider) {
      provider = createTermProvider(stdin, stdout, {
        cols: stdout.columns || 80,
        rows: stdout.rows || 24,
      })
    }
    return provider
  }

  let _frame: TextFrame | undefined

  const termBase = {
    hasCursor: () => cachedCursor,
    hasInput: () => cachedInput,
    hasColor: () => cachedColor,
    hasUnicode: () => cachedUnicode,
    caps: detectedCaps,
    stdout,
    stdin,
    write: (str: string) => {
      stdout.write(str)
    },
    writeLine: (str: string) => {
      stdout.write(str + "\n")
    },
    getState: (): TermState => getProvider().getState(),
    subscribe: (listener: (state: TermState) => void): (() => void) =>
      getProvider().subscribe(listener),
    events: (): AsyncIterable<ProviderEvent<TermEvents>> => getProvider().events(),
    stripAnsi,
    paint: (buffer: TerminalBuffer, prev: TerminalBuffer | null): string => {
      const output = outputPhase(prev, buffer)
      _frame = createTextFrame(buffer)
      return output
    },
    [Symbol.dispose]: () => {
      if (provider) provider[Symbol.dispose]()
    },
  }

  return finalizeTerm(
    styleInstance,
    termBase,
    { get: () => _frame },
    {
      defineProperties: {
        cols: { get: () => (stdout.isTTY ? stdout.columns : undefined), enumerable: true },
        rows: { get: () => (stdout.isTTY ? stdout.rows : undefined), enumerable: true },
      },
    },
  )
}

/** Create a headless terminal for testing — no I/O, fixed dimensions. */
function createHeadlessTerm(dims: { cols: number; rows: number }): Term {
  let disposed = false
  const controller = new AbortController()
  let _frame: TextFrame | undefined

  const termBase = {
    hasCursor: () => false,
    hasInput: () => false,
    hasColor: () => null as ColorLevel | null,
    hasUnicode: () => false,
    caps: undefined as TerminalCaps | undefined,
    stdout: process.stdout,
    stdin: process.stdin,
    write: () => {},
    writeLine: () => {},
    getState: (): TermState => dims,
    subscribe: (): (() => void) => () => {},
    async *events(): AsyncIterable<ProviderEvent<TermEvents>> {
      if (disposed) return
      await new Promise<void>((r) =>
        controller.signal.addEventListener("abort", () => r(), { once: true }),
      )
    },
    stripAnsi,
    paint: (_buffer: TerminalBuffer, _prev: TerminalBuffer | null): string => {
      _frame = createTextFrame(_buffer)
      return ""
    },
    [Symbol.dispose]: () => {
      if (disposed) return
      disposed = true
      controller.abort()
    },
  }

  return finalizeTerm(
    createStyle({ level: null }),
    termBase,
    { get: () => _frame },
    {
      defineProperties: {
        cols: { get: () => dims.cols, enumerable: true },
        rows: { get: () => dims.rows, enumerable: true },
      },
    },
  )
}

/** Create a terminal backed by a termless emulator — real ANSI processing, screen/scrollback. */
function createBackendTerm(emulator: TermEmulator): Term {
  const controller = new AbortController()
  const eq = createEventQueue(controller)
  const { stdout, resizeListeners, updateDims } = createEmulatorStdout(
    (s) => emulator.feed(s),
    emulator.cols,
    emulator.rows,
  )
  const subscribers = new Set<(state: TermState) => void>()
  let _frame: TextFrame | undefined

  const termBase = {
    hasCursor: () => true,
    hasInput: () => true,
    hasColor: () => "truecolor" as ColorLevel | null,
    hasUnicode: () => true,
    caps: undefined as TerminalCaps | undefined,
    stdout,
    stdin: process.stdin,
    write: (str: string) => emulator.feed(str),
    writeLine: (str: string) => emulator.feed(str + "\n"),
    getState: (): TermState => ({ cols: emulator.cols, rows: emulator.rows }),
    subscribe: (listener: (state: TermState) => void): (() => void) => {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    },
    events: () => eq.events(),
    resize: (cols: number, rows: number) => {
      emulator.resize(cols, rows)
      subscribers.forEach((l) => l({ cols, rows }))
      eq.push({ type: "resize", data: { cols, rows } })
      updateDims(cols, rows)
      resizeListeners.forEach((l) => l())
    },
    sendInput: (data: string) => eq.push(...parseInputEvents(data)),
    stripAnsi,
    paint: (buffer: TerminalBuffer, prev: TerminalBuffer | null): string => {
      const output = outputPhase(prev, buffer)
      if (output) emulator.feed(output)
      _frame = createTextFrame(buffer)
      return output
    },
    _emulator: emulator,
    [Symbol.dispose]: () => {
      eq.dispose()
      controller.abort()
      subscribers.clear()
      emulator.close().catch(() => {})
    },
  }

  return finalizeTerm(
    createStyle({ level: "truecolor" }),
    termBase,
    { get: () => _frame },
    {
      defineProperties: {
        cols: { get: () => emulator.cols, enumerable: true },
        rows: { get: () => emulator.rows, enumerable: true },
        screen: { get: () => emulator.screen, enumerable: true },
        scrollback: { get: () => emulator.scrollback, enumerable: true },
      },
      delegateFrom: emulator,
    },
  )
}
