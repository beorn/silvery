/**
 * Term interface and createTerm() factory.
 *
 * Term is the central abstraction for terminal interaction:
 * - Detection: hasCursor(), hasInput(), hasColor(), hasUnicode()
 * - Dimensions: cols, rows
 * - I/O: stdout, stdin, write(), writeLine()
 * - Styling: Chainable styles via Proxy (term.bold.red('text'))
 * - Lifecycle: Disposable pattern via Symbol.dispose
 */

import { Chalk, type ChalkInstance } from "chalk"
import type { ColorLevel, CreateTermOptions, TerminalCaps } from "./types"
import { defaultCaps, detectColor, detectCursor, detectInput, detectTerminalCaps, detectUnicode } from "./detection"

// =============================================================================
// ANSI Utilities
// =============================================================================

/**
 * ANSI escape code pattern for stripping.
 */
const ANSI_REGEX = /\x1b\[[0-9;:]*m|\x1b\]8;;[^\x1b]*\x1b\\/g

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
 * Term interface for terminal interaction.
 *
 * Provides:
 * - Capability detection (cached on creation)
 * - Dimensions (live from stream)
 * - I/O (stdout, stdin, write, writeLine)
 * - Styling (chainable via Proxy)
 * - Disposable lifecycle
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
  // Utilities
  // -------------------------------------------------------------------------

  /**
   * Strip ANSI escape codes from string.
   */
  stripAnsi(str: string): string
}

// =============================================================================
// createTerm Factory
// =============================================================================

/**
 * Create a Term instance with optional overrides.
 *
 * Detection results are cached at creation time for consistency.
 * Use overrides for testing or to force specific capabilities.
 *
 * @example
 * ```ts
 * // Auto-detect everything
 * const term = createTerm()
 *
 * // Force no colors (for testing)
 * const term = createTerm({ color: null })
 *
 * // Custom streams
 * const term = createTerm({ stdout: customStream })
 * ```
 */
export function createTerm(options: CreateTermOptions = {}): Term {
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

  // Create chalk instance with appropriate color level
  const chalkLevel = cachedColor === null ? 0 : cachedColor === "basic" ? 1 : cachedColor === "256" ? 2 : 3
  const chalkInstance = new Chalk({ level: chalkLevel })

  // Base term object with methods
  const termBase = {
    // Detection methods
    hasCursor: () => cachedCursor,
    hasInput: () => cachedInput,
    hasColor: () => cachedColor,
    hasUnicode: () => cachedUnicode,

    // Terminal capabilities
    caps: detectedCaps,

    // Streams
    stdout,
    stdin,

    // I/O methods
    write: (str: string) => {
      stdout.write(str)
    },
    writeLine: (str: string) => {
      stdout.write(str + "\n")
    },

    // Utilities
    stripAnsi,

    // Disposable
    [Symbol.dispose]: () => {
      // no-op — placeholder for future cleanup logic
    },
  }

  // Create proxy that wraps chalk for styling
  const term = createStyleProxy(chalkInstance, termBase)

  // Add dynamic dimension getters
  Object.defineProperty(term, "cols", {
    get: () => (stdout.isTTY ? stdout.columns : undefined),
    enumerable: true,
  })

  Object.defineProperty(term, "rows", {
    get: () => (stdout.isTTY ? stdout.rows : undefined),
    enumerable: true,
  })

  return term as Term
}

// =============================================================================
// Style Proxy Implementation
// =============================================================================

/**
 * Create a proxy that combines term methods with chalk styling.
 *
 * The proxy makes the term object:
 * - Callable: term('text') applies current styles
 * - Chainable: term.bold.red('text') chains styles
 */
function createStyleProxy(chalkInstance: ChalkInstance, termBase: object): Term {
  return createChainProxy(chalkInstance, termBase)
}

/**
 * Create a chainable proxy that wraps a chalk instance.
 */
function createChainProxy(currentChalk: ChalkInstance, termBase: object): Term {
  const handler: ProxyHandler<ChalkInstance> = {
    // Make the proxy callable
    apply(_target, _thisArg, args) {
      // Handle both regular calls and template literals
      if (args.length === 1 && typeof args[0] === "string") {
        return currentChalk(args[0])
      }
      // Template literal call
      if (args.length > 0 && Array.isArray(args[0]) && "raw" in args[0]) {
        return currentChalk(args[0] as TemplateStringsArray, ...args.slice(1))
      }
      return currentChalk(String(args[0] ?? ""))
    },

    // Handle property access for chaining
    get(target, prop, receiver) {
      // Check termBase first for term-specific methods/properties
      if (prop in termBase) {
        const value = (termBase as Record<string | symbol, unknown>)[prop]
        // Return methods bound to termBase, or values directly
        if (typeof value === "function") {
          return value
        }
        return value
      }

      // Handle symbol properties
      if (typeof prop === "symbol") {
        if (prop === Symbol.dispose) {
          return (termBase as Record<symbol, unknown>)[Symbol.dispose]
        }
        return Reflect.get(target, prop, receiver)
      }

      // Handle chalk methods that take arguments and return a new chain
      if (prop === "rgb" || prop === "bgRgb") {
        return (r: number, g: number, b: number) => {
          const newChalk = currentChalk[prop](r, g, b) as ChalkInstance
          return createChainProxy(newChalk, termBase)
        }
      }

      if (prop === "hex" || prop === "bgHex") {
        return (color: string) => {
          const newChalk = currentChalk[prop](color) as ChalkInstance
          return createChainProxy(newChalk, termBase)
        }
      }

      if (prop === "ansi256" || prop === "bgAnsi256") {
        return (code: number) => {
          const newChalk = currentChalk[prop](code) as ChalkInstance
          return createChainProxy(newChalk, termBase)
        }
      }

      // Handle style properties (bold, red, etc.) - return new chain
      const chalkProp = currentChalk[prop as keyof ChalkInstance]
      if (chalkProp !== undefined) {
        // If it's a chalk chain property, wrap it in a new proxy
        if (typeof chalkProp === "function" || typeof chalkProp === "object") {
          return createChainProxy(chalkProp as ChalkInstance, termBase)
        }
        return chalkProp
      }

      return undefined
    },

    // Report that we have term properties
    has(_target, prop) {
      if (prop in termBase) return true
      if (typeof prop === "string" && prop in currentChalk) return true
      return false
    },
  }

  // Use a function as the proxy target so it's callable
  const proxyTarget = Object.assign(function () {}, currentChalk)
  return new Proxy(proxyTarget, handler) as unknown as Term
}
