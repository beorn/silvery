/**
 * Regression test for Bug C — silvercode startup log line briefly visible
 * then cleared/lost.
 *
 * Symptom: a stderr / console.* line emitted during silvercode's startup
 * (module-load `startupTick(...)` via loggily, accountly init noise, recall
 * index warnings, …) flashes on the user's main screen for one frame,
 * then disappears when silvery enters the alt-screen and runs `\x1b[2J\x1b[H`.
 * The line is *also* never captured by Output's buffer-and-replay default,
 * so on exit it's gone for good.
 *
 * Root cause (verified by reading createApp.tsx):
 *   - `\x1b[2J\x1b[H`         line 1864 — alt-screen clear.
 *   - `output.activate(...)`  line 1958 — buffering starts.
 *   The activate happens AFTER alt-screen entry + initial paint, so any
 *   stderr write that occurs during React render or during the protocol-
 *   setup window is dropped from the replay.
 *
 * Acceptance per Task #3:
 *   - No log content silently lost between startup and alt-screen entry.
 *   - On exit, all captured stderr/console output replays to the user's
 *     terminal (same as the buffer-and-replay default).
 *   - DEBUG_LOG mode still works (writes go to file instead of buffered).
 *
 * What this test does
 * -------------------
 * Renders a tiny React tree whose component synchronously calls
 * `process.stderr.write("EARLY_STARTUP_LINE\n")` from its render body.
 * That write happens during `doRender()` at create-app.tsx:1852, which is
 * BEFORE alt-screen entry (1859) and BEFORE `output.activate()` (1958) —
 * exactly the window where silvercode's startup chatter lives.
 *
 * On `handle.unmount()`, Output deactivates and flushes its buffer through
 * the original `process.stderr.write`. We capture every byte the original
 * receives and assert that the early line is part of the replay (i.e. the
 * "— silvery: replaying N captured stderr/console line(s) —" header appears
 * AND the line itself is in the flushed bytes).
 *
 * Today this test FAILS because the early write bypasses the buffer
 * entirely — the spy sees it immediately, but Output never captures it,
 * so the replay header is missing on deactivate.
 */

import React from "react"
import { describe, expect, test, vi } from "vitest"
import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 50) => new Promise((r) => setTimeout(r, ms))

const EARLY_LINE = "EARLY_STARTUP_LINE\n"
const REPLAY_HEADER = "silvery: replaying"

/**
 * Component that emits a stderr line during render — exactly when
 * silvercode's `startupTick("indexModuleEvaluated")` (via loggily ->
 * console.*) reaches stderr in the early-startup path.
 *
 * Using a ref + flag so the write happens ONCE on first render, not on
 * every re-render (otherwise the replay buffer fills with N copies and the
 * assertion stops being a clean "captured the early line" signal).
 */
let didEmit = false
function StartupNoiseApp() {
  if (!didEmit) {
    didEmit = true
    process.stderr.write(EARLY_LINE)
  }
  return (
    <Box flexDirection="column">
      <Text>silvercode-style app</Text>
    </Box>
  )
}

/** Build a writable that pretends to be a TTY-backed stdout. */
function createMockStdout(): { writable: NodeJS.WriteStream; written: string[] } {
  const written: string[] = []
  const writable = {
    write(data: string | Uint8Array) {
      written.push(typeof data === "string" ? data : Buffer.from(data).toString("utf8"))
      return true
    },
    isTTY: true,
    columns: 80,
    rows: 24,
    fd: 1,
    on: () => writable,
    off: () => writable,
    once: () => writable,
    emit: () => true,
    removeListener: () => writable,
    addListener: () => writable,
  } as unknown as NodeJS.WriteStream
  return { writable, written }
}

function createMockStdin(): NodeJS.ReadStream {
  const stdin = {
    isTTY: true,
    isRaw: false,
    fd: 0,
    setRawMode(_raw: boolean) {
      return stdin
    },
    resume() {
      return stdin
    },
    pause() {
      return stdin
    },
    setEncoding() {
      return stdin
    },
    read() {
      return null
    },
    on: () => stdin,
    off: () => stdin,
    once: () => stdin,
    removeListener: () => stdin,
    removeAllListeners: () => stdin,
    addListener: () => stdin,
    listenerCount: () => 0,
    listeners: () => [],
  } as unknown as NodeJS.ReadStream
  return stdin
}

describe("createApp: early-startup stderr is buffered, not lost to alt-screen clear", () => {
  test("stderr write during initial render is replayed on unmount", async () => {
    didEmit = false

    const flushed: string[] = []
    const origStderrWrite = process.stderr.write
    process.stderr.write = ((chunk: unknown) => {
      flushed.push(typeof chunk === "string" ? chunk : String(chunk))
      return true
    }) as typeof process.stderr.write

    try {
      const { writable: mockStdout } = createMockStdout()
      const mockStdin = createMockStdin()

      const handle = await run(<StartupNoiseApp />, {
        cols: 40,
        rows: 10,
        stdout: mockStdout,
        stdin: mockStdin,
        // Force the buffer-and-replay path even though stdout isn't
        // process.stdout — same flag silvercode hits in production.
        guardOutput: true,
        // Skip terminal probes (text sizing, width detection) so the
        // run doesn't write probe queries we'd have to capture as well.
        textSizing: false,
        widthDetection: false,
        // Skip the kitty-keyboard probe — we're not driving keystrokes.
        kitty: false,
      } as never)
      await settle(50)
      handle.unmount()
      await settle(50)

      const all = flushed.join("")

      // The bug: today the early line goes straight to the captured stderr
      // (that's why the user sees it briefly), but Output never captures it,
      // so the deactivate replay header is missing. Expected behaviour
      // post-fix: the early line is REPLAYED through Output's buffer-and-
      // flush path on deactivate, so a "replaying N captured" header
      // appears AND the early line is part of the flushed bytes.
      expect(all, "early-startup line must reach captured stderr").toContain(EARLY_LINE)
      expect(
        all,
        "Output's replay header must fire — proves the early line was buffered, not silently dropped on alt-screen clear",
      ).toContain(REPLAY_HEADER)
    } finally {
      process.stderr.write = origStderrWrite
    }
  })
})
