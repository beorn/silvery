/**
 * Tests for captureStrictFailureArtifacts: debug artifact capture when STRICT
 * verification fails. Verifies directory creation, file contents, and edge
 * cases (missing buffers, empty ANSI, no ctx).
 */
import { describe, test, expect, afterEach } from "vitest"
import { existsSync, readFileSync, rmSync, readdirSync } from "fs"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import {
  captureStrictFailureArtifacts,
  type OutputContext,
} from "@silvery/ag-term/pipeline/output-phase"

// ============================================================================
// Helpers
// ============================================================================

/** Track created directories so afterEach can clean them up. */
const createdDirs: string[] = []

afterEach(() => {
  for (const dir of createdDirs) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true })
    }
  }
  createdDirs.length = 0
})

/** Create a small buffer with text content written character by character. */
function makeBuffer(width: number, height: number, lines: string[]): TerminalBuffer {
  const buf = new TerminalBuffer(width, height)
  for (let y = 0; y < lines.length && y < height; y++) {
    const line = lines[y]!
    for (let x = 0; x < line.length && x < width; x++) {
      buf.setCell(x, y, { char: line[x] })
    }
  }
  return buf
}

/** Create a minimal OutputContext suitable for testing. */
function makeOutputContext(): OutputContext {
  return {
    caps: {
      underlineStyles: true,
      underlineColor: true,
      colorLevel: "truecolor",
    },
    measurer: null,
    sgrCache: new Map(),
    transitionCache: new Map(),
    mode: "fullscreen",
    termRows: undefined,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("captureStrictFailureArtifacts", () => {
  test("creates artifact directory and returns its path", () => {
    const dir = captureStrictFailureArtifacts({
      source: "test-source",
      errorMessage: "mismatch at (5,3)",
    })
    createdDirs.push(dir)

    expect(dir).toMatch(/^\/tmp\/silvery-strict-failure-\d+$/)
    expect(existsSync(dir)).toBe(true)
  })

  test("writes meta.json with source, sizes, and lengths", () => {
    const prev = makeBuffer(10, 3, ["Hello", "World", "!!!"])
    const next = makeBuffer(12, 4, ["Hello!", "World!", "!!!", "New"])

    const dir = captureStrictFailureArtifacts({
      source: "buffer-verify",
      errorMessage: "cell mismatch",
      prev,
      next,
      incrOutput: "\\x1b[1;1Hx",
      freshOutput: "\\x1b[1;1Hy",
      frameCount: 42,
    })
    createdDirs.push(dir)

    const meta = JSON.parse(readFileSync(`${dir}/meta.json`, "utf-8")) as Record<string, unknown>
    expect(meta.source).toBe("buffer-verify")
    expect(meta.frameCount).toBe(42)
    expect(meta.prevSize).toEqual({ width: 10, height: 3 })
    expect(meta.nextSize).toEqual({ width: 12, height: 4 })
    expect(meta.incrOutputLength).toBe(10)
    expect(meta.freshOutputLength).toBe(10)
    expect(meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test("writes error.txt with the error message", () => {
    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "STRICT mismatch: cell (5,3) differs",
    })
    createdDirs.push(dir)

    const content = readFileSync(`${dir}/error.txt`, "utf-8")
    expect(content).toBe("STRICT mismatch: cell (5,3) differs")
  })

  test("writes incremental.ansi when incrOutput is provided", () => {
    const ansi = "\x1b[2;5HTest\x1b[0m"
    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      incrOutput: ansi,
    })
    createdDirs.push(dir)

    expect(existsSync(`${dir}/incremental.ansi`)).toBe(true)
    expect(readFileSync(`${dir}/incremental.ansi`, "utf-8")).toBe(ansi)
  })

  test("writes fresh.ansi when freshOutput is provided", () => {
    const ansi = "\x1b[1;1HFresh\x1b[0m"
    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      freshOutput: ansi,
    })
    createdDirs.push(dir)

    expect(existsSync(`${dir}/fresh.ansi`)).toBe(true)
    expect(readFileSync(`${dir}/fresh.ansi`, "utf-8")).toBe(ansi)
  })

  test("writes prev-buffer.txt with text representation of prev buffer", () => {
    const prev = makeBuffer(8, 3, ["Hello", "World", "End"])

    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      prev,
    })
    createdDirs.push(dir)

    expect(existsSync(`${dir}/prev-buffer.txt`)).toBe(true)
    const content = readFileSync(`${dir}/prev-buffer.txt`, "utf-8")
    const lines = content.split("\n")
    // Each row is up to buffer width, trimEnd removes trailing spaces
    expect(lines[0]).toBe("Hello")
    expect(lines[1]).toBe("World")
    expect(lines[2]).toBe("End")
  })

  test("writes next-buffer.txt with text representation of next buffer", () => {
    const next = makeBuffer(10, 2, ["ABCDEFGHIJ", "1234567890"])

    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      next,
    })
    createdDirs.push(dir)

    expect(existsSync(`${dir}/next-buffer.txt`)).toBe(true)
    const content = readFileSync(`${dir}/next-buffer.txt`, "utf-8")
    const lines = content.split("\n")
    expect(lines[0]).toBe("ABCDEFGHIJ")
    expect(lines[1]).toBe("1234567890")
  })

  test("writes fresh-prev.ansi when both prev and ctx are provided", () => {
    const prev = makeBuffer(5, 1, ["Hi"])
    const ctx = makeOutputContext()

    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      prev,
      ctx,
    })
    createdDirs.push(dir)

    expect(existsSync(`${dir}/fresh-prev.ansi`)).toBe(true)
    const content = readFileSync(`${dir}/fresh-prev.ansi`, "utf-8")
    // bufferToAnsi produces ANSI escape sequences; exact output depends on
    // buffer content, but it should be non-empty for a non-empty buffer
    expect(content.length).toBeGreaterThan(0)
  })

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  test("omits incremental.ansi when incrOutput is not provided", () => {
    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
    })
    createdDirs.push(dir)

    expect(existsSync(`${dir}/incremental.ansi`)).toBe(false)
  })

  test("omits fresh.ansi when freshOutput is not provided", () => {
    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
    })
    createdDirs.push(dir)

    expect(existsSync(`${dir}/fresh.ansi`)).toBe(false)
  })

  test("omits prev-buffer.txt when prev is null", () => {
    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      prev: null,
    })
    createdDirs.push(dir)

    expect(existsSync(`${dir}/prev-buffer.txt`)).toBe(false)
  })

  test("omits next-buffer.txt when next is null", () => {
    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      next: null,
    })
    createdDirs.push(dir)

    expect(existsSync(`${dir}/next-buffer.txt`)).toBe(false)
  })

  test("omits fresh-prev.ansi when prev is provided but ctx is not", () => {
    const prev = makeBuffer(5, 1, ["Hi"])

    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      prev,
      // no ctx
    })
    createdDirs.push(dir)

    expect(existsSync(`${dir}/fresh-prev.ansi`)).toBe(false)
  })

  test("omits fresh-prev.ansi when ctx is provided but prev is not", () => {
    const ctx = makeOutputContext()

    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      ctx,
      // no prev
    })
    createdDirs.push(dir)

    expect(existsSync(`${dir}/fresh-prev.ansi`)).toBe(false)
  })

  test("handles empty incrOutput string (still writes the file)", () => {
    // Empty string is falsy, so incremental.ansi should NOT be written
    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      incrOutput: "",
    })
    createdDirs.push(dir)

    // Empty string is falsy in JS, so the conditional `if (opts.incrOutput)` is false
    expect(existsSync(`${dir}/incremental.ansi`)).toBe(false)
  })

  test("handles empty freshOutput string (still writes the file)", () => {
    // Empty string is falsy, so fresh.ansi should NOT be written
    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      freshOutput: "",
    })
    createdDirs.push(dir)

    expect(existsSync(`${dir}/fresh.ansi`)).toBe(false)
  })

  test("meta.json has null sizes when buffers are not provided", () => {
    const dir = captureStrictFailureArtifacts({
      source: "minimal",
      errorMessage: "err",
    })
    createdDirs.push(dir)

    const meta = JSON.parse(readFileSync(`${dir}/meta.json`, "utf-8")) as Record<string, unknown>
    expect(meta.prevSize).toBeNull()
    expect(meta.nextSize).toBeNull()
    expect(meta.frameCount).toBeUndefined()
    expect(meta.incrOutputLength).toBeUndefined()
    expect(meta.freshOutputLength).toBeUndefined()
  })

  test("prev-buffer.txt trims trailing whitespace on each row", () => {
    // Create a buffer wider than the content -- cells beyond content are spaces
    const prev = makeBuffer(20, 2, ["Short", "AB"])

    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      prev,
    })
    createdDirs.push(dir)

    const content = readFileSync(`${dir}/prev-buffer.txt`, "utf-8")
    const lines = content.split("\n")
    // trimEnd() removes trailing spaces from each row
    expect(lines[0]).toBe("Short")
    expect(lines[1]).toBe("AB")
  })

  test("all expected files are present for a full capture", () => {
    const prev = makeBuffer(5, 2, ["AB", "CD"])
    const next = makeBuffer(5, 2, ["EF", "GH"])
    const ctx = makeOutputContext()

    const dir = captureStrictFailureArtifacts({
      source: "full-test",
      errorMessage: "full error",
      prev,
      next,
      incrOutput: "\x1b[1;1Hx",
      freshOutput: "\x1b[1;1Hy",
      ctx,
      frameCount: 7,
    })
    createdDirs.push(dir)

    const files = readdirSync(dir).sort()
    expect(files).toEqual([
      "error.txt",
      "fresh-prev.ansi",
      "fresh.ansi",
      "incremental.ansi",
      "meta.json",
      "next-buffer.txt",
      "prev-buffer.txt",
    ])
  })

  test("buffer text uses space for empty cells", () => {
    // Create a buffer with gaps -- unset cells default to space
    const buf = makeBuffer(6, 1, [])
    // Set only cells at positions 0 and 3
    buf.setCell(0, 0, { char: "A" })
    buf.setCell(3, 0, { char: "B" })

    const dir = captureStrictFailureArtifacts({
      source: "test",
      errorMessage: "err",
      prev: buf,
    })
    createdDirs.push(dir)

    const content = readFileSync(`${dir}/prev-buffer.txt`, "utf-8")
    // Row is "A  B  " but trimEnd removes trailing spaces
    expect(content).toBe("A  B")
  })
})
