/**
 * ClipboardCapability tests.
 *
 * Covers:
 * - createOSC52Clipboard encodes text as base64 and writes OSC 52 sequence
 * - wrapClipboardBackend delegates to backend.write()
 * - Multi-byte / Unicode text is encoded correctly
 */

import { describe, test, expect, vi } from "vitest"
import {
  createOSC52Clipboard,
  wrapClipboardBackend,
} from "../../packages/ag-term/src/features/clipboard-capability"

// ============================================================================
// OSC 52 clipboard
// ============================================================================

describe("createOSC52Clipboard", () => {
  test("copies text via OSC 52 sequence", () => {
    const write = vi.fn()
    const clipboard = createOSC52Clipboard(write)

    clipboard.copy("Hello World")

    expect(write).toHaveBeenCalledTimes(1)
    const output = write.mock.calls[0]![0] as string

    // Should start with OSC 52 prefix
    expect(output).toMatch(/^\x1b]52;c;/)
    // Should end with ST (BEL)
    expect(output).toMatch(/\x07$/)

    // Decode the base64 payload
    const match = output.match(/\x1b\]52;c;([A-Za-z0-9+/=]+)\x07/)
    expect(match).toBeTruthy()
    const decoded = Buffer.from(match![1]!, "base64").toString("utf-8")
    expect(decoded).toBe("Hello World")
  })

  test("encodes Unicode text correctly", () => {
    const write = vi.fn()
    const clipboard = createOSC52Clipboard(write)

    clipboard.copy("Héllo Wörld 🌍")

    const output = write.mock.calls[0]![0] as string
    const match = output.match(/\x1b\]52;c;([A-Za-z0-9+/=]+)\x07/)
    expect(match).toBeTruthy()
    const decoded = Buffer.from(match![1]!, "base64").toString("utf-8")
    expect(decoded).toBe("Héllo Wörld 🌍")
  })

  test("handles empty string", () => {
    const write = vi.fn()
    const clipboard = createOSC52Clipboard(write)

    clipboard.copy("")

    expect(write).toHaveBeenCalledTimes(1)
    const output = write.mock.calls[0]![0] as string
    const match = output.match(/\x1b\]52;c;([A-Za-z0-9+/=]*)\x07/)
    expect(match).toBeTruthy()
    const decoded = Buffer.from(match![1]!, "base64").toString("utf-8")
    expect(decoded).toBe("")
  })
})

// ============================================================================
// ClipboardBackend wrapper
// ============================================================================

describe("wrapClipboardBackend", () => {
  test("delegates copy to backend.write()", () => {
    const backend = { write: vi.fn(), read: vi.fn() }
    const clipboard = wrapClipboardBackend(backend as any)

    clipboard.copy("test text")

    expect(backend.write).toHaveBeenCalledTimes(1)
    expect(backend.write).toHaveBeenCalledWith({ text: "test text" })
  })
})
