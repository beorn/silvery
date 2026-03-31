/**
 * Tests for the output guard — intercepts process.stdout/stderr writes in alt screen mode.
 *
 * Run: bun vitest run --project vendor vendor/silvery/tests/features/output-guard.test.ts
 */
import { describe, expect, test, afterEach } from "vitest"
import { createOutputGuard, type OutputGuard } from "@silvery/ag-term/ansi/output-guard"
import { readFileSync, unlinkSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("createOutputGuard", () => {
  let guard: OutputGuard | null = null

  afterEach(() => {
    // Always dispose the guard to restore process streams
    if (guard) {
      guard.dispose()
      guard = null
    }
  })

  test("suppresses non-silvery stdout writes", () => {
    // Save what the test setup installed as stdout.write
    const setupWrite = process.stdout.write

    guard = createOutputGuard()

    // The guard replaces stdout.write — non-silvery writes should be suppressed
    // (return true but not call the original)
    const result = process.stdout.write("rogue output")
    expect(result).toBe(true)

    // After dispose, the original (setup) write should be restored
    guard.dispose()
    expect(process.stdout.write).toBe(setupWrite)
    guard = null
  })

  test("allows silvery render output through writeStdout", () => {
    // Track what gets written through the original (pre-guard) stdout.write
    const written: string[] = []
    const setupWrite = process.stdout.write
    // Replace with a spy before creating the guard
    process.stdout.write = ((chunk: any) => {
      written.push(typeof chunk === "string" ? chunk : chunk.toString())
      return true
    }) as any

    guard = createOutputGuard()

    // writeStdout should allow output through to the saved original
    guard.writeStdout("\x1b[2J") // Pure ANSI control sequence (won't trigger test setup error)

    // The output went through our spy
    expect(written).toEqual(["\x1b[2J"])

    // Regular write should be suppressed
    process.stdout.write("rogue")
    expect(written).toEqual(["\x1b[2J"]) // No new entry

    guard.dispose()
    guard = null
    // Restore the setup write
    process.stdout.write = setupWrite
  })

  test("redirects stderr to log file", () => {
    const logPath = join(tmpdir(), `output-guard-test-${Date.now()}.log`)

    guard = createOutputGuard({ stderrLog: logPath })

    // Write to stderr — should go to file, not terminal
    process.stderr.write("debug message 1\n")
    process.stderr.write("debug message 2\n")

    // Read the log file
    const content = readFileSync(logPath, "utf-8")
    expect(content).toContain("debug message 1")
    expect(content).toContain("debug message 2")

    guard.dispose()
    guard = null

    // Cleanup temp file
    if (existsSync(logPath)) unlinkSync(logPath)
  })

  test("suppresses stderr when no file and no buffer", () => {
    // Save original env
    const origDebugLog = process.env.DEBUG_LOG
    delete process.env.DEBUG_LOG

    guard = createOutputGuard()

    // This should be suppressed (no file, no buffer option)
    const result = process.stderr.write("suppressed stderr\n")
    expect(result).toBe(true) // Returns true (pretends success)

    guard.dispose()
    guard = null

    // Restore env
    if (origDebugLog !== undefined) {
      process.env.DEBUG_LOG = origDebugLog
    }
  })

  test("buffers stderr and flushes on dispose", () => {
    // Save original env
    const origDebugLog = process.env.DEBUG_LOG
    delete process.env.DEBUG_LOG

    // Track what the original stderr write receives
    const flushed: string[] = []
    const setupStderr = process.stderr.write
    process.stderr.write = ((chunk: any) => {
      flushed.push(typeof chunk === "string" ? chunk : chunk.toString())
      return true
    }) as any

    guard = createOutputGuard({ bufferStderr: true })

    // Write some stderr while guarded
    process.stderr.write("buffered line 1\n")
    process.stderr.write("buffered line 2\n")

    // Nothing flushed yet (it's buffered)
    expect(flushed).toEqual([])

    // Dispose flushes the buffer through the original stderr
    guard.dispose()
    guard = null

    expect(flushed).toContain("buffered line 1\n")
    expect(flushed).toContain("buffered line 2\n")

    // Restore setup stderr
    process.stderr.write = setupStderr

    // Restore env
    if (origDebugLog !== undefined) {
      process.env.DEBUG_LOG = origDebugLog
    }
  })

  test("dispose restores original write methods", () => {
    const origStdout = process.stdout.write
    const origStderr = process.stderr.write

    guard = createOutputGuard()

    // Methods should be intercepted (different from originals)
    expect(process.stdout.write).not.toBe(origStdout)
    expect(process.stderr.write).not.toBe(origStderr)

    guard.dispose()
    guard = null

    // Methods should be restored
    expect(process.stdout.write).toBe(origStdout)
    expect(process.stderr.write).toBe(origStderr)
  })

  test("dispose is idempotent", () => {
    guard = createOutputGuard()
    guard.dispose()
    guard.dispose() // Should not throw
    guard.dispose() // Should not throw
    guard = null
  })

  test("active property reflects guard state", () => {
    guard = createOutputGuard()
    expect(guard.active).toBe(true)

    guard.dispose()
    expect(guard.active).toBe(false)
    guard = null
  })

  test("Symbol.dispose works for using pattern", () => {
    const origStdout = process.stdout.write

    {
      using g = createOutputGuard()
      expect(process.stdout.write).not.toBe(origStdout)
    }

    // After scope exit, should be restored
    expect(process.stdout.write).toBe(origStdout)
  })

  test("writeStdout returns boolean", () => {
    // Use a spy that doesn't actually write to terminal
    const setupWrite = process.stdout.write
    process.stdout.write = (() => true) as any

    guard = createOutputGuard()
    const result = guard.writeStdout("\x1b[H") // Pure ANSI — won't trigger test setup error

    expect(typeof result).toBe("boolean")

    guard.dispose()
    guard = null
    process.stdout.write = setupWrite
  })

  test("stderr from DEBUG_LOG env var", () => {
    const logPath = join(tmpdir(), `output-guard-env-test-${Date.now()}.log`)
    const origDebugLog = process.env.DEBUG_LOG
    process.env.DEBUG_LOG = logPath

    guard = createOutputGuard() // Should pick up DEBUG_LOG from env

    process.stderr.write("env-directed log\n")

    const content = readFileSync(logPath, "utf-8")
    expect(content).toContain("env-directed log")

    guard.dispose()
    guard = null

    // Restore env and cleanup
    if (origDebugLog !== undefined) {
      process.env.DEBUG_LOG = origDebugLog
    } else {
      delete process.env.DEBUG_LOG
    }
    if (existsSync(logPath)) unlinkSync(logPath)
  })

  test("concurrent writeStdout calls work correctly", () => {
    const written: string[] = []
    const setupWrite = process.stdout.write
    process.stdout.write = ((chunk: any) => {
      written.push(typeof chunk === "string" ? chunk : chunk.toString())
      return true
    }) as any

    guard = createOutputGuard()

    // Multiple silvery writes in sequence
    guard.writeStdout("\x1b[H")
    guard.writeStdout("\x1b[2J")
    guard.writeStdout("\x1b[0m")

    expect(written).toHaveLength(3)

    // Interleaved non-silvery writes are suppressed
    process.stdout.write("rogue 1")
    guard.writeStdout("\x1b[K")
    process.stdout.write("rogue 2")

    expect(written).toHaveLength(4) // Only the silvery write added

    guard.dispose()
    guard = null
    process.stdout.write = setupWrite
  })

  test("suppressedCount tracks suppressed stdout writes", () => {
    guard = createOutputGuard()

    expect(guard.suppressedCount).toBe(0)

    process.stdout.write("rogue 1")
    expect(guard.suppressedCount).toBe(1)

    process.stdout.write("rogue 2")
    process.stdout.write("rogue 3")
    expect(guard.suppressedCount).toBe(3)

    // writeStdout does not increment suppressed count
    guard.writeStdout("\x1b[H")
    expect(guard.suppressedCount).toBe(3)
  })

  test("redirectedCount tracks redirected stderr writes", () => {
    // Save original env
    const origDebugLog = process.env.DEBUG_LOG
    delete process.env.DEBUG_LOG

    guard = createOutputGuard()

    expect(guard.redirectedCount).toBe(0)

    process.stderr.write("stderr 1\n")
    expect(guard.redirectedCount).toBe(1)

    process.stderr.write("stderr 2\n")
    process.stderr.write("stderr 3\n")
    expect(guard.redirectedCount).toBe(3)

    guard.dispose()
    guard = null

    // Restore env
    if (origDebugLog !== undefined) {
      process.env.DEBUG_LOG = origDebugLog
    }
  })
})
