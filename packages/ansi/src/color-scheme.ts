/**
 * Color scheme detection via Mode 2031.
 *
 * Mode 2031 is a terminal protocol for reporting the current color scheme
 * (dark/light). It works cross-platform (Linux, Windows Terminal, SSH sessions)
 * unlike macOS-only AppleInterfaceStyle detection.
 *
 * Protocol:
 * - Enable:  \x1b[?2031h
 * - Disable: \x1b[?2031l
 * - Response: \x1b[?2031;1n (dark) or \x1b[?2031;2n (light)
 * - Terminal sends the same response when the scheme changes
 *
 * @see https://contour-terminal.org/vt-extensions/color-palette-update-notifications/
 */

// =============================================================================
// Constants
// =============================================================================

const ESC = "\x1b"
const CSI = `${ESC}[`

/** Enable Mode 2031 color scheme reporting */
export const ENABLE_COLOR_SCHEME_REPORTING = `${CSI}?2031h`

/** Disable Mode 2031 color scheme reporting */
export const DISABLE_COLOR_SCHEME_REPORTING = `${CSI}?2031l`

/** Response pattern: \x1b[?2031;Nn where N is 1 (dark) or 2 (light) */
const MODE_2031_RESPONSE_RE = /\x1b\[\?2031;([12])n/

// =============================================================================
// Types
// =============================================================================

export type ColorScheme = "dark" | "light" | "unknown"

export interface ColorSchemeDetector extends Disposable {
  /** Current detected scheme */
  readonly scheme: ColorScheme
  /** Subscribe to scheme changes. Returns unsubscribe function. */
  subscribe(listener: (scheme: "dark" | "light") => void): () => void
  /** Start detection (sends Mode 2031 enable to terminal) */
  start(): void
  /** Stop detection (sends Mode 2031 disable to terminal) */
  stop(): void
}

export interface ColorSchemeDetectorOptions {
  /** Write data to the terminal */
  write: (data: string) => void
  /** Subscribe to terminal input. Returns unsubscribe function. */
  onData: (handler: (data: string) => void) => () => void
  /** Fallback detection when Mode 2031 is not supported */
  fallback?: () => ColorScheme
  /** Timeout in ms to wait for Mode 2031 response (default: 200) */
  timeoutMs?: number
}

// =============================================================================
// Parser
// =============================================================================

/**
 * Parse a Mode 2031 response from terminal input data.
 * Returns "dark", "light", or null if not a Mode 2031 response.
 */
export function parseColorSchemeResponse(data: string): "dark" | "light" | null {
  const match = MODE_2031_RESPONSE_RE.exec(data)
  if (!match) return null
  return match[1] === "1" ? "dark" : "light"
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a color scheme detector using Mode 2031.
 *
 * Strategy:
 * 1. Send Mode 2031 enable sequence
 * 2. Parse response within timeout
 * 3. If no response: terminal doesn't support 2031, use fallback
 * 4. If response: use it, continue listening for change notifications
 * 5. On dispose: send disable sequence
 *
 * @example
 * ```ts
 * const detector = createColorSchemeDetector({
 *   write: (data) => process.stdout.write(data),
 *   onData: (handler) => {
 *     process.stdin.on("data", handler)
 *     return () => process.stdin.off("data", handler)
 *   },
 *   fallback: () => "dark",
 * })
 * detector.start()
 * console.log(detector.scheme) // "unknown" until response arrives
 * detector.subscribe((scheme) => console.log("scheme changed:", scheme))
 * ```
 */
export function createColorSchemeDetector(options: ColorSchemeDetectorOptions): ColorSchemeDetector {
  const { write, onData, fallback, timeoutMs = 200 } = options

  let scheme: ColorScheme = "unknown"
  let started = false
  let stopped = false
  let unsubData: (() => void) | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let mode2031Supported = false

  const listeners = new Set<(scheme: "dark" | "light") => void>()

  function handleResponse(detected: "dark" | "light") {
    mode2031Supported = true
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (scheme !== detected) {
      scheme = detected
      for (const listener of listeners) {
        listener(detected)
      }
    }
  }

  function handleData(data: string) {
    const result = parseColorSchemeResponse(data)
    if (result !== null) {
      handleResponse(result)
    }
  }

  function applyFallback() {
    if (mode2031Supported || stopped) return
    if (fallback) {
      const result = fallback()
      if (result !== "unknown" && scheme === "unknown") {
        scheme = result
        for (const listener of listeners) {
          listener(result)
        }
      }
    }
  }

  return {
    get scheme() {
      return scheme
    },

    subscribe(listener: (scheme: "dark" | "light") => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    start() {
      if (started || stopped) return
      started = true

      // Subscribe to terminal input to catch responses
      unsubData = onData(handleData)

      // Send Mode 2031 enable
      write(ENABLE_COLOR_SCHEME_REPORTING)

      // Set timeout for fallback
      timeoutId = setTimeout(applyFallback, timeoutMs)
    },

    stop() {
      if (!started || stopped) return
      stopped = true

      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }

      if (unsubData) {
        unsubData()
        unsubData = null
      }

      // Send Mode 2031 disable
      write(DISABLE_COLOR_SCHEME_REPORTING)

      listeners.clear()
    },

    [Symbol.dispose]() {
      if (started && !stopped) {
        // Only send disable if we successfully enabled
        stopped = true

        if (timeoutId !== null) {
          clearTimeout(timeoutId)
          timeoutId = null
        }

        if (unsubData) {
          unsubData()
          unsubData = null
        }

        write(DISABLE_COLOR_SCHEME_REPORTING)
        listeners.clear()
      }
    },
  }
}
