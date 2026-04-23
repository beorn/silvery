/**
 * DEC Width Mode Detection (xterm patch #407)
 *
 * Queries the terminal for its character width settings using DECRQM
 * (DEC Private Mode Request). This replaces guesswork with definitive
 * answers from the terminal itself.
 *
 * Modes:
 * - 1020: UTF-8 mode
 * - 1021: CJK ambiguous width (1 or 2 cells)
 * - 1022: Emoji width (1 or 2 cells)
 * - 1023: Private-use area width (1 or 2 cells)
 *
 * Protocol:
 * - Query:    CSI ? {mode} $ p    (DECRQM)
 * - Response: CSI ? {mode} ; {Ps} $ y  (DECRPM)
 *
 * Where Ps is:
 *   1 = set (enabled / wide / 2-cell)
 *   2 = reset (disabled / narrow / 1-cell)
 *   0 = not recognized
 *   3 = permanently set
 *   4 = permanently reset
 *
 * @see https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 */

/** Well-known xterm width DEC mode numbers. */
export const WidthMode = {
  /** UTF-8 mode */
  UTF8: 1020,
  /** CJK ambiguous character width */
  CJK_WIDTH: 1021,
  /** Emoji width */
  EMOJI_WIDTH: 1022,
  /** Private-use area width */
  PRIVATE_USE_WIDTH: 1023,
} as const

/** Terminal-reported character width configuration. */
export interface TerminalWidthConfig {
  /** Whether terminal uses UTF-8 mode */
  utf8: boolean
  /** How terminal handles CJK ambiguous width (1 or 2) */
  cjkWidth: 1 | 2
  /** How terminal handles emoji width (1 or 2) */
  emojiWidth: 1 | 2
  /** How terminal handles private-use area width (1 or 2) */
  privateUseWidth: 1 | 2
}

/** Width detector with async detect() and cleanup. */
export interface WidthDetector {
  /** Detected configuration (null until detection completes) */
  readonly config: TerminalWidthConfig | null
  /** Query terminal for width settings */
  detect(): Promise<TerminalWidthConfig>
  /** Clean up resources */
  dispose(): void
}

/** Options for creating a width detector. */
export interface WidthDetectorOptions {
  /** Write data to the terminal */
  write: (data: string) => void
  /** Subscribe to terminal input data; returns unsubscribe function */
  onData: (handler: (data: string) => void) => () => void
  /** Per-mode timeout in milliseconds (default: 200) */
  timeoutMs?: number
}

/** Default configuration when detection fails or times out. */
export const DEFAULT_WIDTH_CONFIG: TerminalWidthConfig = {
  utf8: true,
  cjkWidth: 1,
  emojiWidth: 2,
  privateUseWidth: 1,
}

/** Regex for DECRPM response: CSI ? mode ; Ps $ y */
const DECRPM_RE = /\x1b\[\?(\d+);(\d+)\$y/g

/**
 * Parse a DECRPM response value into a boolean (set/reset).
 * 1 and 3 (permanently set) = true, everything else = false.
 */
function isSet(ps: number): boolean {
  return ps === 1 || ps === 3
}

/**
 * Query a single DEC width mode via DECRQM.
 * Returns the Ps value from the DECRPM response, or null on timeout.
 */
function queryWidthMode(
  write: (data: string) => void,
  onData: (handler: (data: string) => void) => () => void,
  mode: number,
  timeoutMs: number,
): Promise<number | null> {
  return new Promise<number | null>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let unsubscribe: (() => void) | null = null
    let buffer = ""

    function cleanup() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (unsubscribe !== null) {
        unsubscribe()
        unsubscribe = null
      }
    }

    unsubscribe = onData((data: string) => {
      buffer += data
      // Try to find DECRPM response for our mode
      DECRPM_RE.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = DECRPM_RE.exec(buffer)) !== null) {
        const reportedMode = parseInt(match[1]!, 10)
        if (reportedMode === mode) {
          const ps = parseInt(match[2]!, 10)
          cleanup()
          resolve(ps)
          return
        }
      }
    })

    timer = setTimeout(() => {
      cleanup()
      resolve(null)
    }, timeoutMs)

    // Send DECRQM query: CSI ? {mode} $ p
    write(`\x1b[?${mode}$p`)
  })
}

/**
 * Apply detected width configuration to terminal capabilities.
 *
 * Post km-silvery.caps-restructure (Phase 7, 2026-04-23): `textEmojiWide`
 * moved from caps onto {@link TerminalHeuristics}. This helper still lives
 * on ag-term (terminal-facing) and takes the raw caps + heuristics pair,
 * returning `{ caps, heuristics }` with the DEC width overlay applied. The
 * mapping is:
 * - emojiWidth=2 → heuristics.textEmojiWide=true
 * - privateUseWidth=2 → caps.textSizing=true (PUA treated as 2-wide)
 *
 * CJK width and UTF-8 mode are informational — they don't yet map to
 * caps/heuristics fields but are available in TerminalWidthConfig for consumers.
 */
export function applyWidthConfig<
  C extends { textSizing: boolean },
  H extends { textEmojiWide: boolean },
>(caps: C, heuristics: H, config: TerminalWidthConfig): { caps: C; heuristics: H } {
  return {
    caps: { ...caps, textSizing: config.privateUseWidth === 2 },
    heuristics: { ...heuristics, textEmojiWide: config.emojiWidth === 2 },
  }
}

/**
 * Create a width detector that queries the terminal for DEC modes 1020-1023.
 *
 * @example
 * ```ts
 * const detector = createWidthDetector({
 *   write: (data) => process.stdout.write(data),
 *   onData: (handler) => {
 *     process.stdin.on('data', (chunk) => handler(chunk.toString()))
 *     return () => process.stdin.removeListener('data', handler)
 *   },
 * })
 *
 * const config = await detector.detect()
 * console.log(config.emojiWidth) // 1 or 2
 * detector.dispose()
 * ```
 */
export function createWidthDetector(options: WidthDetectorOptions): WidthDetector {
  const { write, onData, timeoutMs = 200 } = options
  let config: TerminalWidthConfig | null = null
  let disposed = false

  return {
    get config() {
      return config
    },

    async detect(): Promise<TerminalWidthConfig> {
      if (disposed) return config ?? { ...DEFAULT_WIDTH_CONFIG }
      if (config !== null) return config

      // Query all 4 modes sequentially (each waits for its response)
      const utf8Ps = await queryWidthMode(write, onData, WidthMode.UTF8, timeoutMs)
      const cjkPs = await queryWidthMode(write, onData, WidthMode.CJK_WIDTH, timeoutMs)
      const emojiPs = await queryWidthMode(write, onData, WidthMode.EMOJI_WIDTH, timeoutMs)
      const puaPs = await queryWidthMode(write, onData, WidthMode.PRIVATE_USE_WIDTH, timeoutMs)

      config = {
        utf8: utf8Ps !== null ? isSet(utf8Ps) : DEFAULT_WIDTH_CONFIG.utf8,
        cjkWidth: cjkPs !== null ? (isSet(cjkPs) ? 2 : 1) : DEFAULT_WIDTH_CONFIG.cjkWidth,
        emojiWidth: emojiPs !== null ? (isSet(emojiPs) ? 2 : 1) : DEFAULT_WIDTH_CONFIG.emojiWidth,
        privateUseWidth:
          puaPs !== null ? (isSet(puaPs) ? 2 : 1) : DEFAULT_WIDTH_CONFIG.privateUseWidth,
      }

      return config
    },

    dispose() {
      disposed = true
    },
  }
}
