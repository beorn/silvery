/**
 * Clipboard Backend Abstraction
 *
 * Pluggable clipboard system with support for multiple backends.
 * The default backend uses OSC 52 for terminal clipboard access.
 *
 * Architecture:
 * - ClipboardBackend: interface for clipboard read/write
 * - ClipboardData: multi-format clipboard content (text, markdown, html, internal)
 * - createOsc52Backend: OSC 52 terminal clipboard (default)
 * - createInternalClipboardBackend: in-memory store for rich app-internal paste
 * - createCompositeClipboard: fan-out writes to multiple backends
 *
 * OSC 52 Protocol:
 * - Copy:    ESC ] 52 ; c ; <base64> BEL
 * - Query:   ESC ] 52 ; c ; ? BEL
 * - Response: ESC ] 52 ; c ; <base64> BEL  (or ST terminator)
 *
 * Supported by: Ghostty, Kitty, WezTerm, iTerm2, xterm, foot, tmux
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Multi-format clipboard content.
 *
 * Plain text is always present. Optional rich formats allow applications
 * to provide structured data for within-app paste without losing it
 * through the plain-text-only system clipboard.
 */
export interface ClipboardData {
  /** Plain text content (always present) */
  text: string
  /** Markdown representation */
  markdown?: string
  /** HTML representation */
  html?: string
  /** App-specific structured data (e.g., node tree for structured paste) */
  internal?: unknown
}

/**
 * Clipboard backend capabilities.
 *
 * `text` is always true — every backend supports plain text.
 * Rich format support is backend-dependent.
 */
export interface ClipboardCapabilities {
  readonly text: true
  readonly html?: boolean
  readonly markdown?: boolean
  readonly internal?: boolean
}

/**
 * Pluggable clipboard backend.
 *
 * Backends handle the transport of clipboard data to/from the system
 * or an in-memory store. The framework writes ClipboardData; the backend
 * decides what formats it can actually carry.
 */
export interface ClipboardBackend {
  /** Write clipboard data. Backends may ignore formats they don't support. */
  write(data: ClipboardData): void | Promise<void>
  /** Read clipboard contents as plain text. Not all backends support read. */
  read?(): Promise<string>
  /** What formats this backend supports */
  readonly capabilities: ClipboardCapabilities
}

// ============================================================================
// Writable interface (avoid coupling to Node.js WriteStream)
// ============================================================================

/** Minimal writable interface for clipboard output */
interface Writable {
  write(data: string): boolean | void
}

// ============================================================================
// OSC 52 Constants
// ============================================================================

const ESC = "\x1b"
const BEL = "\x07"

/** OSC 52 response prefix */
const OSC52_PREFIX = `${ESC}]52;c;`

// ============================================================================
// OSC 52 Backend
// ============================================================================

/**
 * Create an OSC 52 clipboard backend.
 *
 * Writes plain text to the system clipboard via the terminal's OSC 52 support.
 * Works across SSH sessions. Rich formats (markdown, html, internal) are
 * silently ignored — OSC 52 only carries plain text.
 *
 * Quirks:
 * - Some terminals limit payload size (~100KB)
 * - tmux requires `set -g set-clipboard on`
 * - Some terminals only support BEL terminator (not ST)
 */
export function createOsc52Backend(stdout: Writable): ClipboardBackend {
  return {
    write(data: ClipboardData): void {
      const base64 = Buffer.from(data.text, "utf-8").toString("base64")
      stdout.write(`${ESC}]52;c;${base64}${BEL}`)
    },

    async read(): Promise<string> {
      // OSC 52 read requires async response parsing from stdin.
      // The query is sent here; the caller must parse the response
      // from the terminal input stream using parseClipboardResponse().
      stdout.write(`${ESC}]52;c;?${BEL}`)
      // Note: actual response arrives asynchronously via stdin.
      // This is a limitation of the terminal protocol — true async
      // read requires coordination with the input parser.
      return ""
    },

    capabilities: { text: true },
  }
}

// ============================================================================
// Internal Clipboard Backend
// ============================================================================

/**
 * In-memory clipboard store for within-app paste.
 *
 * Stores the full ClipboardData including rich formats that OSC 52 can't carry.
 * Used alongside OSC 52 so plain text goes to the system clipboard while
 * rich data is available for internal paste operations.
 */
export function createInternalClipboardBackend(): ClipboardBackend & {
  /** Get the stored clipboard data, or null if empty */
  getData(): ClipboardData | null
  /** Get the timestamp of the last write */
  getTimestamp(): number
} {
  let stored: ClipboardData | null = null
  let timestamp = 0

  return {
    write(data: ClipboardData): void {
      stored = { ...data }
      timestamp = Date.now()
    },

    async read(): Promise<string> {
      return stored?.text ?? ""
    },

    getData(): ClipboardData | null {
      return stored ? { ...stored } : null
    },

    getTimestamp(): number {
      return timestamp
    },

    capabilities: { text: true, html: true, markdown: true, internal: true },
  }
}

// ============================================================================
// Composite Clipboard
// ============================================================================

/**
 * Create a composite clipboard that writes to multiple backends.
 *
 * Writes fan out to all backends. Reads come from the first backend
 * that supports read (in order). This lets you do OSC 52 + internal
 * store simultaneously: plain text goes to system clipboard, rich
 * data stays in memory for structured paste.
 */
export function createCompositeClipboard(...backends: ClipboardBackend[]): ClipboardBackend {
  return {
    write(data: ClipboardData): void | Promise<void> {
      const promises: Promise<void>[] = []
      for (const backend of backends) {
        const result = backend.write(data)
        if (result instanceof Promise) {
          promises.push(result)
        }
      }
      if (promises.length > 0) {
        return Promise.all(promises).then(() => undefined)
      }
    },

    async read(): Promise<string> {
      for (const backend of backends) {
        if (backend.read) {
          const text = await backend.read()
          if (text) return text
        }
      }
      return ""
    },

    capabilities: {
      text: true,
      html: backends.some((b) => b.capabilities.html) || undefined,
      markdown: backends.some((b) => b.capabilities.markdown) || undefined,
      internal: backends.some((b) => b.capabilities.internal) || undefined,
    },
  }
}

// ============================================================================
// Backwards-compatible API (delegates to OSC 52)
// ============================================================================

/**
 * Copy text to the system clipboard via OSC 52.
 * Encodes the text as base64 and writes the OSC 52 sequence to stdout.
 *
 * @deprecated Use createOsc52Backend() for new code.
 * Deletion tracked: km-silvery.delete-clipboard-legacy-api
 */
export function copyToClipboard(stdout: NodeJS.WriteStream, text: string): void {
  const base64 = Buffer.from(text).toString("base64")
  stdout.write(`${ESC}]52;c;${base64}${BEL}`)
}

/**
 * Request clipboard contents via OSC 52.
 * Writes the OSC 52 query sequence. The terminal will respond with
 * an OSC 52 response containing the clipboard contents as base64.
 * Use parseClipboardResponse() to decode the response.
 *
 * @deprecated Use createOsc52Backend() for new code.
 * Deletion tracked: km-silvery.delete-clipboard-legacy-api
 */
export function requestClipboard(stdout: NodeJS.WriteStream): void {
  stdout.write(`${ESC}]52;c;?${BEL}`)
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse an OSC 52 clipboard response and decode the base64 content.
 *
 * Returns the decoded clipboard text, or null if the input is not
 * an OSC 52 clipboard response.
 *
 * Handles both BEL (\x07) and ST (ESC \) terminators.
 */
export function parseClipboardResponse(input: string): string | null {
  const prefixIdx = input.indexOf(OSC52_PREFIX)
  if (prefixIdx === -1) return null

  const contentStart = prefixIdx + OSC52_PREFIX.length

  // Reject the query marker — it's not a response
  if (input[contentStart] === "?") return null

  // Find terminator: BEL (\x07) or ST (ESC \)
  let contentEnd = input.indexOf(BEL, contentStart)
  if (contentEnd === -1) {
    contentEnd = input.indexOf(`${ESC}\\`, contentStart)
  }
  if (contentEnd === -1) return null

  const base64 = input.slice(contentStart, contentEnd)
  return Buffer.from(base64, "base64").toString("utf-8")
}
