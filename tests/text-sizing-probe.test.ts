/**
 * Text sizing probe tests.
 *
 * Tests for OSC 66 progressive enhancement:
 * - Probe correctly detects supported terminal (mock write/read)
 * - Probe correctly handles timeout
 * - Probe result caching works (keyed by explicit fingerprint)
 *
 * Post km-silvery.unicode-plateau Phase 2 (2026-04-23): this module reads
 * zero environment variables. Every test passes an explicit fingerprint
 * (or caps object) instead of mutating process.env — the module has no
 * ambient authority to exercise. The terminal-type → textSizing
 * mapping (Kitty ≥ 0.40 true, older Kitty false, Ghostty false, etc.)
 * lives in `createTerminalProfile` and is tested in
 * packages/ansi/tests/profile.test.ts.
 */
import { describe, expect, test, beforeEach } from "vitest"
import {
  detectTextSizingSupport,
  getTerminalFingerprint,
  getCachedProbeResult,
  setCachedProbeResult,
  clearProbeCache,
  type TextSizingProbeResult,
} from "../packages/ag-term/src/text-sizing"

// Canonical fingerprints used across the test suite — identify a terminal
// deterministically without ever touching process.env.
const KITTY_040 = getTerminalFingerprint({ program: "kitty", version: "0.40.0" })
const GHOSTTY_13 = getTerminalFingerprint({ program: "Ghostty", version: "1.3.0" })

// ============================================================================
// Probe detection
// ============================================================================

describe("detectTextSizingSupport", () => {
  beforeEach(() => {
    clearProbeCache()
  })

  test("detects support when cursor advances by 2 columns", async () => {
    // CPR response: cursor at row 1, column 3 (1-indexed)
    // means the space wrapped in OSC 66 w=2 occupied 2 cells
    let written = ""
    const write = (data: string) => {
      written += data
    }
    const read = () => Promise.resolve("\x1b[1;3R")

    const result = await detectTextSizingSupport(write, read, KITTY_040)

    expect(result.supported).toBe(true)
    expect(result.widthOnly).toBe(false)
    // Should have written the probe sequence
    expect(written).toContain("\x1b]66;w=2;")
    expect(written).toContain("\x1b[6n")
  })

  test("detects no support when cursor advances by 1 column", async () => {
    // CPR response: cursor at row 1, column 2 (1-indexed)
    // means the terminal ignored OSC 66 and the space occupied 1 cell
    const write = (_data: string) => {}
    const read = () => Promise.resolve("\x1b[1;2R")

    const result = await detectTextSizingSupport(write, read, GHOSTTY_13)

    expect(result.supported).toBe(false)
  })

  test("detects no support when cursor stays at column 1", async () => {
    // OSC 66 swallowed entirely, cursor didn't move
    const write = (_data: string) => {}
    const read = () => Promise.resolve("\x1b[1;1R")

    const result = await detectTextSizingSupport(write, read, GHOSTTY_13)

    expect(result.supported).toBe(false)
  })
})

// ============================================================================
// Timeout handling
// ============================================================================

describe("probe timeout", () => {
  beforeEach(() => {
    clearProbeCache()
  })

  test("returns not supported on timeout", async () => {
    const write = (_data: string) => {}
    // read() that never resolves
    const read = () => new Promise<string>(() => {})

    const result = await detectTextSizingSupport(write, read, "timeout-term@1.0", 50)

    expect(result.supported).toBe(false)
    expect(result.widthOnly).toBe(false)
  })

  test("returns not supported when read rejects", async () => {
    const write = (_data: string) => {}
    const read = () => Promise.reject(new Error("stdin closed"))

    const result = await detectTextSizingSupport(write, read, "reject-term@1.0")

    expect(result.supported).toBe(false)
  })
})

// ============================================================================
// Cache (keyed by explicit fingerprint)
// ============================================================================

describe("probe result caching", () => {
  beforeEach(() => {
    clearProbeCache()
  })

  test("caches successful probe result", async () => {
    let readCount = 0
    const write = (_data: string) => {}
    const read = () => {
      readCount++
      return Promise.resolve("\x1b[1;3R")
    }

    // First call — runs the probe
    const result1 = await detectTextSizingSupport(write, read, KITTY_040)
    expect(result1.supported).toBe(true)
    expect(readCount).toBe(1)

    // Second call with same fingerprint — should use cache, not call read again
    const result2 = await detectTextSizingSupport(write, read, KITTY_040)
    expect(result2.supported).toBe(true)
    expect(readCount).toBe(1)
  })

  test("caches negative probe result", async () => {
    let readCount = 0
    const write = (_data: string) => {}
    const read = () => {
      readCount++
      return Promise.resolve("\x1b[1;2R")
    }

    const result1 = await detectTextSizingSupport(write, read, GHOSTTY_13)
    expect(result1.supported).toBe(false)
    expect(readCount).toBe(1)

    const result2 = await detectTextSizingSupport(write, read, GHOSTTY_13)
    expect(result2.supported).toBe(false)
    expect(readCount).toBe(1)
  })

  test("different fingerprints keep independent cache entries", async () => {
    // Kitty 0.40 → supported. Ghostty 1.3 → not supported. Both cached under
    // their own keys so they don't poison each other.
    const goodRead = () => Promise.resolve("\x1b[1;3R")
    const badRead = () => Promise.resolve("\x1b[1;2R")
    const write = (_data: string) => {}

    await detectTextSizingSupport(write, goodRead, KITTY_040)
    await detectTextSizingSupport(write, badRead, GHOSTTY_13)

    expect(getCachedProbeResult(KITTY_040)?.supported).toBe(true)
    expect(getCachedProbeResult(GHOSTTY_13)?.supported).toBe(false)
  })

  test("clearProbeCache resets cache", async () => {
    let readCount = 0
    const write = (_data: string) => {}
    const read = () => {
      readCount++
      return Promise.resolve("\x1b[1;3R")
    }

    await detectTextSizingSupport(write, read, KITTY_040)
    expect(readCount).toBe(1)

    clearProbeCache()

    await detectTextSizingSupport(write, read, KITTY_040)
    expect(readCount).toBe(2)
  })

  test("getCachedProbeResult returns undefined when no cache", () => {
    expect(getCachedProbeResult("nonexistent@0")).toBeUndefined()
  })

  test("setCachedProbeResult stores and retrieves result", () => {
    const result: TextSizingProbeResult = { supported: true, widthOnly: false }
    setCachedProbeResult(KITTY_040, result)

    expect(getCachedProbeResult(KITTY_040)).toEqual(result)
  })
})

// ============================================================================
// Fingerprint construction (caps-driven, no env reads)
// ============================================================================

describe("getTerminalFingerprint", () => {
  test("combines program and version", () => {
    expect(getTerminalFingerprint({ program: "kitty", version: "0.40.0" })).toBe("kitty@0.40.0")
    expect(getTerminalFingerprint({ program: "Ghostty", version: "1.3.0" })).toBe("Ghostty@1.3.0")
  })

  test("falls back to 'unknown' for empty program / version", () => {
    // Empty strings come from `defaultCaps()` or a Term built without a TTY.
    // Fingerprint stays stable — cache keys still partition correctly.
    expect(getTerminalFingerprint({ program: "", version: "" })).toBe("unknown@unknown")
    expect(getTerminalFingerprint({ program: "kitty", version: "" })).toBe("kitty@unknown")
    expect(getTerminalFingerprint({ program: "", version: "0.40.0" })).toBe("unknown@0.40.0")
  })

  test("is deterministic — same caps → same fingerprint", () => {
    const caps = { program: "WezTerm", version: "20241231-000000" }
    expect(getTerminalFingerprint(caps)).toBe(getTerminalFingerprint(caps))
  })
})
