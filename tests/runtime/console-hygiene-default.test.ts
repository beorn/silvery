/**
 * Console-hygiene default — silvery's run() activates Output with
 * `bufferStderr: true` by default (when DEBUG_LOG isn't set), so
 * `process.stderr.write` / `console.*` / `debug()` calls during alt-screen
 * are buffered and replayed to the normal terminal on exit.
 *
 * Bead: km-silvery.console-hygiene-default
 *
 * What this protects against:
 *   - The `debug` npm package writes to `process.stderr.write` directly.
 *     Without buffering, those writes either drop silently (the old default)
 *     or corrupt the alt-screen render. With buffering, they're captured
 *     and replayed on exit so the operator sees what was logged.
 *   - `silvery:perf` debug noise leaking into `bun design` (the bug that
 *     triggered this bead).
 */

import { describe, expect, test } from "vitest"
import { createOutput } from "@silvery/ag-term/runtime/devices/output"

describe("Output: bufferStderr default behavior", () => {
  test("activate({ bufferStderr: true }) buffers process.stderr.write", () => {
    const flushed: string[] = []
    const origStderrWrite = process.stderr.write
    process.stderr.write = ((chunk: unknown) => {
      flushed.push(typeof chunk === "string" ? chunk : String(chunk))
      return true
    }) as typeof process.stderr.write

    using output = createOutput()
    output.activate({ bufferStderr: true })

    process.stderr.write("captured 1\n")
    process.stderr.write("captured 2\n")

    // While active, no flushes through the original.
    expect(flushed).toEqual([])

    output.deactivate()

    // Replay header + the two captured lines.
    expect(flushed.some((line) => line.includes("replaying 2 captured"))).toBe(true)
    expect(flushed).toContain("captured 1\n")
    expect(flushed).toContain("captured 2\n")

    process.stderr.write = origStderrWrite
  })

  test("buffer is silent when nothing was captured (no noise on clean exit)", () => {
    const flushed: string[] = []
    const origStderrWrite = process.stderr.write
    process.stderr.write = ((chunk: unknown) => {
      flushed.push(typeof chunk === "string" ? chunk : String(chunk))
      return true
    }) as typeof process.stderr.write

    using output = createOutput()
    output.activate({ bufferStderr: true })
    // No stderr writes during alt-screen.
    output.deactivate()

    // No replay header on a clean run.
    expect(flushed.some((line) => line.includes("replaying"))).toBe(false)

    process.stderr.write = origStderrWrite
  })

  test("DEBUG_LOG file path overrides buffer mode", () => {
    const flushed: string[] = []
    const origStderrWrite = process.stderr.write
    process.stderr.write = ((chunk: unknown) => {
      flushed.push(typeof chunk === "string" ? chunk : String(chunk))
      return true
    }) as typeof process.stderr.write

    // When stderrLog (or DEBUG_LOG) is set, writes go to the file rather
    // than the buffer — even with bufferStderr: true. Buffer is the
    // fallback when no file is configured.
    using output = createOutput({ stderrLog: "/tmp/console-hygiene-test.log" })
    output.activate({ bufferStderr: true })
    process.stderr.write("file-bound\n")
    output.deactivate()

    // Nothing replayed through original stderr (went to file instead).
    expect(flushed.some((line) => line.includes("replaying"))).toBe(false)
    expect(flushed).not.toContain("file-bound\n")

    process.stderr.write = origStderrWrite
  })
})
