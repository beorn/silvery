/**
 * Kitty keyboard protocol manager.
 *
 * Handles lifecycle (enable/disable/auto-detect) for the Kitty keyboard
 * protocol. Used by both test and interactive rendering paths.
 *
 * @see https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 */

import { enableKittyKeyboard, disableKittyKeyboard, queryKittyKeyboard, KittyFlags } from "./output"

/** Regex to match a Kitty keyboard query response: CSI ? <digits> u */
const KITTY_RESPONSE_RE = /\x1b\[\?(\d+)u/

/** Regex to match a partial Kitty keyboard query response: ESC [ ? <digits> (at least one digit, no trailing 'u') */
const KITTY_PARTIAL_RE = /\x1b\[\?\d+$/

/** Kitty protocol manager handle. */
export interface KittyManager {
  /** Whether the kitty keyboard protocol is currently enabled. */
  enabled: boolean
  /** Disable the protocol and clean up any pending detection. */
  cleanup(): void
}

/** Options for configuring the kitty keyboard protocol manager. */
export interface KittyManagerOptions {
  /** Detection mode: "enabled" activates immediately, "auto" probes the terminal, "disabled" does nothing. */
  mode?: "auto" | "enabled" | "disabled"
  /** Bitmask of KittyFlags to enable.
   *  Default: DISAMBIGUATE | REPORT_EVENTS | REPORT_ALL_KEYS (11).
   *  REPORT_ALL_KEYS provides shifted_codepoint for correct shifted punctuation
   *  (e.g., Shift+1 → '!' on US layout). Without it, key.text for shifted keys
   *  is the base character ('1'), which breaks hotkey matching and text input. */
  flags?: number
}

/**
 * Create a kitty protocol manager that handles setup and teardown.
 *
 * Supports three modes:
 * - "enabled": enable immediately if stdin/stdout are TTYs
 * - "auto": probe the terminal for support, enable if detected
 * - "disabled" / undefined: do nothing
 */
export function createKittyManager(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  opts: KittyManagerOptions | undefined,
): KittyManager {
  let enabled = false
  let cancelDetection: (() => void) | undefined

  function enable(flagBitmask: number): void {
    stdout.write(enableKittyKeyboard(flagBitmask))
    enabled = true
  }

  if (opts) {
    const mode = opts.mode ?? "auto"
    // Default: DISAMBIGUATE | REPORT_EVENTS | REPORT_ALL_KEYS (11).
    // REPORT_ALL_KEYS provides shifted_codepoint so shifted punctuation
    // (Shift+1 → '!') produces correct key.text and matchHotkey results.
    // All Kitty-supporting terminals handle these flags (Ghostty, WezTerm,
    // iTerm2, Alacritty, Kitty, VS Code, Warp — see terminfo.dev).
    const flagBitmask = opts.flags ?? KittyFlags.DISAMBIGUATE | KittyFlags.REPORT_EVENTS | KittyFlags.REPORT_ALL_KEYS
    const isTTY = (stdin as any)?.isTTY && (stdout as any)?.isTTY

    if (isTTY) {
      if (mode === "enabled") {
        enable(flagBitmask)
      } else if (mode === "auto") {
        cancelDetection = initKittyAutoDetection(stdin, stdout, flagBitmask, enable)
      }
    }
  }

  return {
    get enabled() {
      return enabled
    },
    cleanup() {
      if (cancelDetection) {
        cancelDetection()
        cancelDetection = undefined
      }
      if (enabled) {
        stdout.write(disableKittyKeyboard())
        enabled = false
      }
    },
  }
}

/**
 * Initialize kitty keyboard auto-detection.
 *
 * Queries the terminal for support, listens for the response, and enables
 * the protocol if supported. Returns a cleanup function to cancel detection.
 *
 * Uses a synchronous event-based approach (not async) because render() must
 * return synchronously. Delegates to @silvery/ag-term for escape sequences.
 */
function initKittyAutoDetection(
  stdin: NodeJS.ReadStream,
  stdout: NodeJS.WriteStream,
  flagBitmask: number,
  onEnable: (flags: number) => void,
): () => void {
  // Buffer incoming data as raw bytes to preserve binary integrity (e.g., split UTF-8 sequences).
  // We always work with the concatenated raw bytes and only decode to string for regex matching.
  const rawChunks: Buffer[] = []
  let cleaned = false
  let unmounted = false

  /** Decode the full concatenated buffer to string for regex matching. */
  function getBufferAsString(): string {
    return Buffer.concat(rawChunks).toString()
  }

  const cleanup = (): void => {
    if (cleaned) return
    cleaned = true
    clearTimeout(timer)
    stdin.removeListener("data", onData)

    // Re-emit any buffered data that wasn't the protocol response.
    // Strip both complete protocol responses and partial protocol prefixes
    // (e.g., "\x1b[?1" without the trailing "u") — these are protocol artifacts, not user data.
    const allBytes = Buffer.concat(rawChunks)
    rawChunks.length = 0
    const fullString = allBytes.toString()
    let remaining = fullString.replace(KITTY_RESPONSE_RE, "")
    remaining = remaining.replace(KITTY_PARTIAL_RE, "")

    if (remaining.length > 0) {
      // Find where the remaining content starts in the original byte stream
      // by computing the byte offset of the protocol prefix that was stripped.
      const protocolPrefix = fullString.slice(0, fullString.indexOf(remaining))
      const prefixByteLen = Buffer.byteLength(protocolPrefix)
      stdin.unshift(allBytes.subarray(prefixByteLen))
    }
  }

  const onData = (data: Uint8Array | string): void => {
    // Buffer raw bytes. For strings, convert to Buffer to preserve byte-level integrity.
    rawChunks.push(typeof data === "string" ? Buffer.from(data) : Buffer.from(data))

    // Decode the full accumulated buffer to check for the protocol response.
    // This ensures correct handling of multi-byte sequences split across chunks.
    if (KITTY_RESPONSE_RE.test(getBufferAsString())) {
      cleanup()
      if (!unmounted) {
        onEnable(flagBitmask)
      }
    }
  }

  // Attach listener before writing the query so synchronous responses are not missed
  stdin.on("data", onData)
  const timer = setTimeout(cleanup, 200)

  stdout.write(queryKittyKeyboard())

  return () => {
    unmounted = true
    cleanup()
  }
}
