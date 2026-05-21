/**
 * Tests for clipboard backend abstraction.
 *
 * Covers:
 * - ClipboardBackend interface compliance (OSC 52, internal, composite)
 * - Internal clipboard store (write, read, getData, timestamp)
 * - Composite clipboard (fan-out writes, first-reader-wins reads)
 * - Bracketed paste detection and PasteEvent creation
 * - Backwards-compatible API (copyToClipboard, requestClipboard, parseClipboardResponse)
 */
import { describe, test, expect, vi, beforeEach } from "vitest"
// Note: Uses relative imports for worktree compatibility. In the main repo,
// these would be @silvery/ag-term/clipboard and @silvery/ag-term/bracketed-paste.
import {
  createOsc52Backend,
  createInternalClipboardBackend,
  createCompositeClipboard,
  copyToClipboard,
  requestClipboard,
  parseClipboardResponse,
  type ClipboardData,
  type ClipboardBackend,
} from "../packages/ag-term/src/clipboard"
import {
  parseBracketedPaste,
  createBracketedPasteEvent,
  createInternalPasteEvent,
  PASTE_START,
  PASTE_END,
} from "../packages/ag-term/src/bracketed-paste"

// ============================================================================
// Helpers
// ============================================================================

function createMockStdout() {
  const written: string[] = []
  const write = vi.fn((data: string) => {
    written.push(data)
    return true
  })
  return { write, written } as any // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ============================================================================
// OSC 52 Backend
// ============================================================================

describe("createOsc52Backend", () => {
  test("write sends base64-encoded text via OSC 52", () => {
    const stdout = createMockStdout()
    const backend = createOsc52Backend(stdout)

    backend.write({ text: "Hello, World!" })

    expect(stdout.write).toHaveBeenCalledOnce()
    const written = stdout.written[0]!
    // Should be ESC ] 52 ; c ; <base64> BEL
    expect(written).toMatch(/^\x1b\]52;c;[A-Za-z0-9+/=]+\x07$/)
    // Decode and verify
    const base64 = written.slice(7, -1) // strip ESC]52;c; and BEL
    expect(Buffer.from(base64, "base64").toString("utf-8")).toBe("Hello, World!")
  })

  test("write ignores rich formats (markdown, html, internal)", () => {
    const stdout = createMockStdout()
    const backend = createOsc52Backend(stdout)

    backend.write({
      text: "plain",
      markdown: "**rich**",
      html: "<b>rich</b>",
      internal: { nodes: [1, 2, 3] },
    })

    // Only one write — the plain text via OSC 52
    expect(stdout.write).toHaveBeenCalledOnce()
    const base64 = stdout.written[0]!.slice(7, -1)
    expect(Buffer.from(base64, "base64").toString("utf-8")).toBe("plain")
  })

  test("write handles empty text", () => {
    const stdout = createMockStdout()
    const backend = createOsc52Backend(stdout)

    backend.write({ text: "" })

    expect(stdout.write).toHaveBeenCalledOnce()
    const base64 = stdout.written[0]!.slice(7, -1)
    expect(Buffer.from(base64, "base64").toString("utf-8")).toBe("")
  })

  test("write handles unicode text", () => {
    const stdout = createMockStdout()
    const backend = createOsc52Backend(stdout)

    backend.write({ text: "こんにちは 🌍" })

    const base64 = stdout.written[0]!.slice(7, -1)
    expect(Buffer.from(base64, "base64").toString("utf-8")).toBe("こんにちは 🌍")
  })

  test("read sends OSC 52 query", async () => {
    const stdout = createMockStdout()
    const backend = createOsc52Backend(stdout)

    await backend.read!()

    expect(stdout.write).toHaveBeenCalledOnce()
    expect(stdout.written[0]).toBe("\x1b]52;c;?\x07")
  })

  test("capabilities reports text only", () => {
    const stdout = createMockStdout()
    const backend = createOsc52Backend(stdout)

    expect(backend.capabilities.text).toBe(true)
    expect(backend.capabilities.html).toBeUndefined()
    expect(backend.capabilities.markdown).toBeUndefined()
    expect(backend.capabilities.internal).toBeUndefined()
  })
})

// ============================================================================
// Internal Clipboard Backend
// ============================================================================

describe("createInternalClipboardBackend", () => {
  test("write stores data, read returns text", async () => {
    const backend = createInternalClipboardBackend()

    backend.write({ text: "hello" })

    expect(await backend.read!()).toBe("hello")
  })

  test("getData returns full ClipboardData with rich formats", () => {
    const backend = createInternalClipboardBackend()
    const data: ClipboardData = {
      text: "plain",
      markdown: "**bold**",
      html: "<b>bold</b>",
      internal: { type: "node", id: 42 },
    }

    backend.write(data)

    const stored = backend.getData()
    expect(stored).toEqual(data)
  })

  test("getData returns defensive copy", () => {
    const backend = createInternalClipboardBackend()
    backend.write({ text: "hello" })

    const a = backend.getData()
    const b = backend.getData()
    expect(a).toEqual(b)
    expect(a).not.toBe(b) // different object references
  })

  test("getData returns null before any write", () => {
    const backend = createInternalClipboardBackend()
    expect(backend.getData()).toBeNull()
  })

  test("read returns empty string before any write", async () => {
    const backend = createInternalClipboardBackend()
    expect(await backend.read!()).toBe("")
  })

  test("getTimestamp returns 0 before any write", () => {
    const backend = createInternalClipboardBackend()
    expect(backend.getTimestamp()).toBe(0)
  })

  test("getTimestamp updates on write", () => {
    const backend = createInternalClipboardBackend()
    const before = Date.now()

    backend.write({ text: "hello" })

    const ts = backend.getTimestamp()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(Date.now())
  })

  test("subsequent writes overwrite previous data", async () => {
    const backend = createInternalClipboardBackend()

    backend.write({ text: "first", markdown: "# First" })
    backend.write({ text: "second" })

    expect(await backend.read!()).toBe("second")
    expect(backend.getData()).toEqual({ text: "second" })
    expect(backend.getData()!.markdown).toBeUndefined()
  })

  test("capabilities reports all formats", () => {
    const backend = createInternalClipboardBackend()

    expect(backend.capabilities.text).toBe(true)
    expect(backend.capabilities.html).toBe(true)
    expect(backend.capabilities.markdown).toBe(true)
    expect(backend.capabilities.internal).toBe(true)
  })
})

// ============================================================================
// Composite Clipboard
// ============================================================================

describe("createCompositeClipboard", () => {
  test("write fans out to all backends", () => {
    const stdout = createMockStdout()
    const osc52 = createOsc52Backend(stdout)
    const internal = createInternalClipboardBackend()
    const composite = createCompositeClipboard(osc52, internal)

    composite.write({ text: "hello", markdown: "**hello**" })

    // OSC 52 got the write (text only)
    expect(stdout.write).toHaveBeenCalledOnce()
    // Internal got the full write
    expect(internal.getData()).toEqual({ text: "hello", markdown: "**hello**" })
  })

  test("read returns from first backend that has content", async () => {
    const internal = createInternalClipboardBackend()
    internal.write({ text: "from internal" })

    const stdout = createMockStdout()
    const osc52 = createOsc52Backend(stdout)

    // Internal is first — it has content, so it wins
    const composite = createCompositeClipboard(internal, osc52)
    const text = await composite.read!()
    expect(text).toBe("from internal")
  })

  test("read skips backends without read support", async () => {
    const noReadBackend: ClipboardBackend = {
      write() {},
      capabilities: { text: true },
      // no read method
    }
    const internal = createInternalClipboardBackend()
    internal.write({ text: "fallback" })

    const composite = createCompositeClipboard(noReadBackend, internal)
    expect(await composite.read!()).toBe("fallback")
  })

  test("read returns empty string when no backends have content", async () => {
    const internal = createInternalClipboardBackend()
    // No writes yet — read returns ""
    const composite = createCompositeClipboard(internal)
    expect(await composite.read!()).toBe("")
  })

  test("capabilities merge from all backends", () => {
    const stdout = createMockStdout()
    const osc52 = createOsc52Backend(stdout) // text only
    const internal = createInternalClipboardBackend() // all formats

    const composite = createCompositeClipboard(osc52, internal)

    expect(composite.capabilities.text).toBe(true)
    expect(composite.capabilities.html).toBe(true)
    expect(composite.capabilities.markdown).toBe(true)
    expect(composite.capabilities.internal).toBe(true)
  })

  test("capabilities with text-only backends", () => {
    const stdout = createMockStdout()
    const osc52a = createOsc52Backend(stdout)
    const osc52b = createOsc52Backend(stdout)

    const composite = createCompositeClipboard(osc52a, osc52b)

    expect(composite.capabilities.text).toBe(true)
    expect(composite.capabilities.html).toBeFalsy()
    expect(composite.capabilities.markdown).toBeFalsy()
    expect(composite.capabilities.internal).toBeFalsy()
  })

  test("handles async write backends", async () => {
    let resolved = false
    const asyncBackend: ClipboardBackend = {
      async write() {
        await new Promise((r) => setTimeout(r, 1))
        resolved = true
      },
      capabilities: { text: true },
    }

    const composite = createCompositeClipboard(asyncBackend)
    const result = composite.write({ text: "async" })

    // Should return a promise since backend is async
    expect(result).toBeInstanceOf(Promise)
    await result
    expect(resolved).toBe(true)
  })

  test("write with zero backends is a no-op", () => {
    const composite = createCompositeClipboard()
    // Should not throw
    composite.write({ text: "hello" })
  })
})

// ============================================================================
// Bracketed Paste Detection
// ============================================================================

describe("parseBracketedPaste", () => {
  test("extracts content from complete bracketed paste", () => {
    const input = `${PASTE_START}Hello, World!${PASTE_END}`
    const result = parseBracketedPaste(input)

    expect(result).toEqual({ type: "paste", content: "Hello, World!" })
  })

  test("returns null for input without paste markers", () => {
    expect(parseBracketedPaste("just some text")).toBeNull()
  })

  test("throws ProtocolError for incomplete paste (PASTE_START only)", () => {
    // PASTE_START found but no PASTE_END — the parser committed to bracketed
    // paste and must fail loudly so the dispatch boundary can decide whether
    // to buffer (stream-split paste) or log + drop (protocol violation).
    // See @km/silvery/15127-custom-protocol-implementation/protocol-loud-errors.
    expect(() => parseBracketedPaste(`${PASTE_START}partial content`)).toThrow(/PASTE_END/)
  })

  test("handles multiline pasted content", () => {
    const content = "line 1\nline 2\nline 3"
    const input = `${PASTE_START}${content}${PASTE_END}`
    const result = parseBracketedPaste(input)

    expect(result).toEqual({ type: "paste", content })
  })

  test("handles paste markers surrounded by other input", () => {
    const input = `some keys${PASTE_START}pasted text${PASTE_END}more keys`
    const result = parseBracketedPaste(input)

    expect(result).toEqual({ type: "paste", content: "pasted text" })
  })

  test("handles empty paste content", () => {
    const input = `${PASTE_START}${PASTE_END}`
    const result = parseBracketedPaste(input)

    expect(result).toEqual({ type: "paste", content: "" })
  })
})

// ============================================================================
// PasteEvent Creation
// ============================================================================

describe("createBracketedPasteEvent", () => {
  test("creates event from BracketedPasteResult", () => {
    const event = createBracketedPasteEvent({ type: "paste", content: "hello" })

    expect(event.text).toBe("hello")
    expect(event.source).toBe("bracketed")
    expect(event.structured).toBeUndefined()
  })
})

describe("createInternalPasteEvent", () => {
  test("creates event with structured data", () => {
    const data: ClipboardData = {
      text: "hello",
      markdown: "**hello**",
      internal: { nodeId: 42 },
    }

    const event = createInternalPasteEvent(data)

    expect(event.text).toBe("hello")
    expect(event.source).toBe("internal")
    expect(event.structured).toBe(data)
  })
})

// ============================================================================
// Backwards-compatible API
// ============================================================================

describe("copyToClipboard (legacy)", () => {
  test("writes OSC 52 sequence to stdout", () => {
    const stdout = createMockStdout()
    copyToClipboard(stdout as unknown as NodeJS.WriteStream, "test text")

    const written = stdout.written[0]!
    expect(written).toMatch(/^\x1b\]52;c;[A-Za-z0-9+/=]+\x07$/)
    const base64 = written.slice(7, -1)
    expect(Buffer.from(base64, "base64").toString("utf-8")).toBe("test text")
  })
})

describe("requestClipboard (legacy)", () => {
  test("writes OSC 52 query to stdout", () => {
    const stdout = createMockStdout()
    requestClipboard(stdout as unknown as NodeJS.WriteStream)

    expect(stdout.written[0]).toBe("\x1b]52;c;?\x07")
  })
})

describe("parseClipboardResponse", () => {
  test("decodes valid OSC 52 response with BEL terminator", () => {
    const text = "Hello"
    const base64 = Buffer.from(text).toString("base64")
    const input = `\x1b]52;c;${base64}\x07`

    expect(parseClipboardResponse(input)).toBe("Hello")
  })

  test("decodes valid OSC 52 response with ST terminator", () => {
    const text = "Hello"
    const base64 = Buffer.from(text).toString("base64")
    const input = `\x1b]52;c;${base64}\x1b\\`

    expect(parseClipboardResponse(input)).toBe("Hello")
  })

  test("returns null for non-clipboard input", () => {
    expect(parseClipboardResponse("random text")).toBeNull()
  })

  test("rejects query marker (not a response)", () => {
    expect(parseClipboardResponse("\x1b]52;c;?\x07")).toBeNull()
  })

  test("throws ProtocolError for unterminated response", () => {
    // OSC 52 prefix present (we committed to this protocol) but no BEL/ST
    // terminator. The parser must fail loudly so the dispatch boundary
    // surfaces the malformed terminal output.
    // See @km/silvery/15127-custom-protocol-implementation/protocol-loud-errors.
    const base64 = Buffer.from("hello").toString("base64")
    expect(() => parseClipboardResponse(`\x1b]52;c;${base64}`)).toThrow(/terminator/i)
  })
})
