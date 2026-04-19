/**
 * Advanced Clipboard — OSC 5522 (Kitty clipboard protocol)
 *
 * Extends OSC 52 with MIME type support, large payload chunking,
 * and paste events. Falls back to OSC 52 when 5522 is not available.
 *
 * Protocol overview (from kitty docs):
 * - Write:  ESC ] 5522 ; type=write ST  →  wdata chunks  →  empty wdata
 * - Read:   ESC ] 5522 ; type=read ; <base64 mime list> ST
 * - Paste mode: CSI ? 5522 h (enable) / CSI ? 5522 l (disable)
 *
 * Metadata is colon-separated key=value pairs. Payloads are base64-encoded.
 * Data chunks are at most 4096 bytes before base64 encoding.
 *
 * Supported by: Kitty 0.28+. Ghostty is considering adoption.
 *
 * @see https://sw.kovidgoyal.net/kitty/clipboard/
 * @module
 */

// ============================================================================
// Constants
// ============================================================================

const ESC = "\x1b"
const ST = `${ESC}\\`
const OSC_5522 = `${ESC}]5522;`

/** Default chunk size in bytes (before base64 encoding) */
const DEFAULT_CHUNK_SIZE = 4096

/** Enable paste events mode */
export const ENABLE_PASTE_EVENTS = `${ESC}[?5522h`

/** Disable paste events mode */
export const DISABLE_PASTE_EVENTS = `${ESC}[?5522l`

// ============================================================================
// Types
// ============================================================================

/** A single clipboard entry with MIME type and data. */
export interface ClipboardEntry {
  /** MIME type (e.g. "text/plain", "text/html", "image/png") */
  mime: string
  /** Content — string for text types, Uint8Array for binary */
  data: string | Uint8Array
}

/** Options for creating an advanced clipboard. */
export interface AdvancedClipboardOptions {
  /** Write escape sequences to the terminal */
  write: (data: string) => void
  /** Subscribe to terminal input data. Returns unsubscribe function. */
  onData: (handler: (data: string) => void) => () => void
  /** Max bytes per chunk before base64 encoding (default: 4096) */
  chunkSize?: number
  /** Whether the terminal supports OSC 5522 (default: false — uses OSC 52 fallback) */
  supported?: boolean
}

/** Advanced clipboard with MIME type support and paste events. */
export interface AdvancedClipboard {
  /** Copy entries with MIME type support */
  copy(entries: ClipboardEntry[]): void
  /** Copy plain text (convenience) */
  copyText(text: string): void
  /** Copy with HTML alternative */
  copyRich(text: string, html: string): void
  /** Subscribe to paste events. Returns unsubscribe function. */
  onPaste(handler: (entries: ClipboardEntry[]) => void): () => void
  /** Whether the terminal supports OSC 5522 */
  readonly supported: boolean
  /** Clean up subscriptions */
  dispose(): void
}

// ============================================================================
// Encoding Helpers
// ============================================================================

/** Encode string as base64 */
function toBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64")
}

/** Encode bytes as base64 */
function bytesToBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64")
}

/** Decode base64 to string */
function fromBase64(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf-8")
}

/** Decode base64 to bytes */
function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"))
}

/** Convert entry data to a Buffer for chunking */
function entryDataToBuffer(data: string | Uint8Array): Buffer {
  if (typeof data === "string") {
    return Buffer.from(data, "utf-8")
  }
  return Buffer.from(data)
}

// ============================================================================
// Protocol Helpers
// ============================================================================

/**
 * Build an OSC 5522 sequence.
 *
 * @param metadata - colon-separated key=value pairs
 * @param payload - optional base64 payload
 */
function osc5522(metadata: string, payload?: string): string {
  if (payload !== undefined) {
    return `${OSC_5522}${metadata};${payload}${ST}`
  }
  return `${OSC_5522}${metadata}${ST}`
}

/**
 * Generate chunked wdata sequences for a single MIME entry.
 *
 * Each chunk is at most chunkSize bytes before base64 encoding.
 * An empty wdata with just the mime signals end of data for that type.
 */
function* generateChunks(entry: ClipboardEntry, chunkSize: number): Generator<string> {
  const mimeB64 = toBase64(entry.mime)
  const raw = entryDataToBuffer(entry.data)

  if (raw.length === 0) {
    // Even empty data sends one chunk then a terminator
    yield osc5522(`type=wdata:mime=${mimeB64}`, "")
  } else {
    for (let offset = 0; offset < raw.length; offset += chunkSize) {
      const chunk = raw.subarray(offset, offset + chunkSize)
      const b64 = bytesToBase64(new Uint8Array(chunk))
      yield osc5522(`type=wdata:mime=${mimeB64}`, b64)
    }
  }

  // Empty wdata signals end of this MIME type's data
  yield osc5522("type=wdata")
}

// ============================================================================
// OSC 52 Fallback
// ============================================================================

/**
 * Copy plain text via OSC 52 (fallback for terminals without 5522 support).
 */
function osc52Copy(write: (data: string) => void, text: string): void {
  const base64 = toBase64(text)
  write(`${ESC}]52;c;${base64}\x07`)
}

// ============================================================================
// Response Parsing
// ============================================================================

/** Parsed OSC 5522 response from terminal */
interface ParsedResponse {
  type: string
  status?: string
  mime?: string
  payload?: string
}

/**
 * Parse an OSC 5522 response sequence.
 *
 * Format: ESC ] 5522 ; metadata ; payload ST
 * Metadata: colon-separated key=value pairs
 */
export function parseOsc5522Response(input: string): ParsedResponse | null {
  // Find OSC 5522 prefix
  const prefixIdx = input.indexOf(OSC_5522)
  if (prefixIdx === -1) return null

  const afterPrefix = prefixIdx + OSC_5522.length

  // Find ST terminator (ESC \)
  const stIdx = input.indexOf(ST, afterPrefix)
  if (stIdx === -1) return null

  const body = input.slice(afterPrefix, stIdx)

  // Split metadata and payload at first semicolon
  const semiIdx = body.indexOf(";")
  const metadataStr = semiIdx === -1 ? body : body.slice(0, semiIdx)
  const payload = semiIdx === -1 ? undefined : body.slice(semiIdx + 1)

  // Parse metadata key=value pairs
  const pairs = metadataStr.split(":")
  const result: ParsedResponse = { type: "" }

  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=")
    if (eqIdx === -1) continue
    const key = pair.slice(0, eqIdx)
    const value = pair.slice(eqIdx + 1)

    switch (key) {
      case "type":
        result.type = value
        break
      case "status":
        result.status = value
        break
      case "mime":
        result.mime = value
        break
    }
  }

  if (payload !== undefined) {
    result.payload = payload
  }

  return result
}

/**
 * Parse a paste event notification from terminal.
 *
 * When paste events mode is enabled (CSI ? 5522 h), the terminal
 * sends available MIME types when the user pastes.
 *
 * Format: ESC ] 5522 ; type=read:status=DATA:mime=<b64mime> ; <b64data> ST
 */
export function parsePasteData(input: string): ClipboardEntry | null {
  const parsed = parseOsc5522Response(input)
  if (!parsed) return null
  if (parsed.type !== "read" || parsed.status !== "DATA") return null
  if (!parsed.mime || parsed.payload === undefined) return null

  const mime = fromBase64(parsed.mime)
  const isText = mime.startsWith("text/")

  if (isText) {
    return { mime, data: fromBase64(parsed.payload) }
  }
  return { mime, data: base64ToBytes(parsed.payload) }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create an advanced clipboard with OSC 5522 support.
 *
 * When `supported` is true, uses the full OSC 5522 protocol for
 * MIME-typed clipboard operations. When false (default), falls back
 * to OSC 52 for plain text only.
 *
 * @example
 * ```ts
 * const clipboard = createAdvancedClipboard({
 *   write: (data) => process.stdout.write(data),
 *   onData: (handler) => {
 *     process.stdin.on("data", (buf) => handler(buf.toString()))
 *     return () => process.stdin.removeListener("data", handler)
 *   },
 *   supported: true,
 * })
 *
 * // Copy with MIME types
 * clipboard.copy([
 *   { mime: "text/plain", data: "Hello" },
 *   { mime: "text/html", data: "<b>Hello</b>" },
 * ])
 *
 * // Subscribe to paste events
 * const unsub = clipboard.onPaste((entries) => {
 *   for (const entry of entries) {
 *     console.log(entry.mime, entry.data)
 *   }
 * })
 *
 * clipboard.dispose()
 * ```
 */
export function createAdvancedClipboard(options: AdvancedClipboardOptions): AdvancedClipboard {
  const { write, onData, chunkSize = DEFAULT_CHUNK_SIZE, supported = false } = options

  const pasteHandlers = new Set<(entries: ClipboardEntry[]) => void>()
  let inputUnsub: (() => void) | undefined

  // Accumulate paste data entries from multiple DATA responses
  let pendingEntries: ClipboardEntry[] = []

  // Set up input listener for paste events when we have handlers
  function ensureInputListener(): void {
    if (inputUnsub) return

    inputUnsub = onData((data: string) => {
      if (pasteHandlers.size === 0) return

      // Try to parse paste data from the input
      const entry = parsePasteData(data)
      if (entry) {
        pendingEntries.push(entry)
      }

      // Check for DONE signal — flush accumulated entries to handlers
      const parsed = parseOsc5522Response(data)
      if (parsed?.type === "read" && parsed.status === "DONE") {
        if (pendingEntries.length > 0) {
          const entries = pendingEntries
          pendingEntries = []
          for (const handler of pasteHandlers) {
            handler(entries)
          }
        }
      }
    })
  }

  return {
    get supported(): boolean {
      return supported
    },

    copy(entries: ClipboardEntry[]): void {
      if (!supported) {
        // Fallback: find text/plain entry and use OSC 52
        const textEntry = entries.find((e) => e.mime === "text/plain")
        if (textEntry) {
          const text =
            typeof textEntry.data === "string"
              ? textEntry.data
              : fromBase64(bytesToBase64(textEntry.data))
          osc52Copy(write, text)
        }
        return
      }

      // OSC 5522 write protocol:
      // 1. Send write start
      write(osc5522("type=write"))

      // 2. Send chunked data for each MIME entry
      for (const entry of entries) {
        for (const chunk of generateChunks(entry, chunkSize)) {
          write(chunk)
        }
      }
    },

    copyText(text: string): void {
      this.copy([{ mime: "text/plain", data: text }])
    },

    copyRich(text: string, html: string): void {
      this.copy([
        { mime: "text/plain", data: text },
        { mime: "text/html", data: html },
      ])
    },

    onPaste(handler: (entries: ClipboardEntry[]) => void): () => void {
      pasteHandlers.add(handler)
      ensureInputListener()

      return () => {
        pasteHandlers.delete(handler)
        if (pasteHandlers.size === 0 && inputUnsub) {
          inputUnsub()
          inputUnsub = undefined
        }
      }
    },

    dispose(): void {
      pasteHandlers.clear()
      pendingEntries = []
      if (inputUnsub) {
        inputUnsub()
        inputUnsub = undefined
      }
    },
  }
}
