/**
 * Defaults contract — `createApp()` + `.run()` (Layer 3 entry point).
 *
 * See tests/contracts/README.md for the convention.
 *
 * `createApp` is the provider/store-aware sibling of `run()`. `run()` is a
 * thin wrapper — it constructs an empty-store `createApp(() => () => ({}))`
 * and forwards `AppRunOptions`. The documented defaults of both surfaces must
 * therefore be in lockstep: if a default drifts on one side, the other
 * inherits the bug.
 *
 * Seed row in this file: the selection/mouse coupling, exercised directly
 * against `createApp().run(<App/>, { ..., mouse: true })` with a termless-
 * backed Term via `run()`'s Term path (which internally calls createApp).
 *
 * The other two seeds (FORCE_COLOR, click-vs-drag) are not `createApp`-
 * specific — they live in `run-defaults.contract.test.tsx`. We keep this
 * file small and let it grow in Phase 2 with createApp-specific defaults
 * (virtualInline, alternateScreen, kittyMode, provider wiring).
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"

import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

function SelectableContent() {
  return (
    <Box flexDirection="column">
      <Text>Hello World of Selection</Text>
      <Text>Second row here</Text>
    </Box>
  )
}

// ============================================================================
// Seed — selection defaults to true when mouse: true is passed (createApp path)
// ============================================================================
//
// `run(<App/>, term, opts)` (Term path, run.tsx:237) instantiates
// `createApp(() => () => ({}))` and forwards `opts` as `AppRunOptions`. This
// test exercises the same default-resolution code as the run-defaults file,
// but through the `createApp().run()` composition — catching drift between
// the two surfaces.

describe("contract: createApp AppRunOptions.selection", () => {
  test("contract: selection defaults to true when mouse: true (createApp composition)", async () => {
    using term = createTermless({ cols: 40, rows: 5 })

    // Routes through createApp() internally — see run.tsx:294-306.
    const handle = await run(<SelectableContent />, term, { mouse: true })
    await settle()
    term.clipboard.clear()

    await term.mouse.drag({ from: [0, 0], to: [10, 0] })
    await settle(200)

    expect(term.clipboard.last).not.toBeNull()
    expect(term.clipboard.last!.length).toBeGreaterThan(0)

    handle.unmount()
  })

  test("contract: explicit selection: false disables even when mouse: true", async () => {
    using term = createTermless({ cols: 40, rows: 5 })

    const handle = await run(<SelectableContent />, term, {
      mouse: true,
      selection: false,
    })
    await settle()
    term.clipboard.clear()

    await term.mouse.drag({ from: [0, 0], to: [10, 0] })
    await settle(200)

    // Opt-out wins — OSC 52 must stay silent.
    expect(term.clipboard.last).toBeNull()

    handle.unmount()
  })
})

// ============================================================================
// Seed — panicOnRenderError defaults to "auto" → no panic in test env
// ============================================================================
//
// `AppRunOptions.panicOnRenderError` docstring says:
//   - `true`: always panic on render errors.
//   - `false`: never panic.
//   - `"auto"` (default): panic in non-test environments, capture-and-resume
//     in tests.
//
// The test environment is detected via NODE_ENV === "test" / VITEST /
// __vitest_worker__. Since these tests run under vitest, the auto-detect
// MUST resolve to "false" (no panic) — otherwise the existing test
// infrastructure that intentionally renders broken components would exit
// the test runner. This contract pins that behavior.

function ThrowOnMount(): React.ReactElement {
  throw new Error("contract: defaults synthetic render error")
}

function createMockStdoutForPanicContract() {
  const written: string[] = []
  const writable = {
    write(data: string | Uint8Array) {
      written.push(typeof data === "string" ? data : Buffer.from(data).toString("utf8"))
      return true
    },
    isTTY: true,
    columns: 40,
    rows: 5,
    fd: -1,
    on: () => writable,
    off: () => writable,
    once: () => writable,
    emit: () => true,
    removeListener: () => writable,
    addListener: () => writable,
  } as unknown as NodeJS.WriteStream
  return { writable, written }
}

function createMockStdinForPanicContract(): NodeJS.ReadStream {
  const stdin = {
    isTTY: true,
    isRaw: false,
    fd: 0,
    setRawMode(raw: boolean) {
      stdin.isRaw = raw
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

describe("contract: AppRunOptions.panicOnRenderError", () => {
  test('contract: default ("auto") does NOT panic in vitest environment', async () => {
    // Bun gotcha: assigning undefined doesn't clear process.exitCode. Use 0.
    const origExitCode = process.exitCode
    process.exitCode = 0

    const origStderrWrite = process.stderr.write
    const origStdoutWrite = process.stdout.write
    try {
      process.stderr.write = (() => true) as typeof process.stderr.write
      process.stdout.write = (() => true) as typeof process.stdout.write

      const { writable: stdout } = createMockStdoutForPanicContract()
      // panicOnRenderError omitted — must default to "auto" → resolve to
      // false in vitest, so the render error is captured by
      // SilveryErrorBoundary and the process is not exited.
      const handle = await run(<ThrowOnMount />, {
        cols: 40,
        rows: 5,
        stdout,
        stdin: createMockStdinForPanicContract(),
        guardOutput: true,
        kitty: false,
        textSizing: false,
        widthDetection: false,
      } as never)

      await new Promise((resolve) => setTimeout(resolve, 60))

      // The contract: in a test environment, the default ("auto") MUST NOT
      // trigger panicApp. If it did, process.exitCode would have flipped to
      // 1 from recordPanic.
      expect(process.exitCode).not.toBe(1)

      handle.unmount()
      await new Promise((resolve) => setTimeout(resolve, 30))
    } finally {
      process.stderr.write = origStderrWrite
      process.stdout.write = origStdoutWrite
      process.exitCode = origExitCode
    }
  })
})

// ============================================================================
// Phase 2 backlog — createApp-specific defaults still to cover
// ============================================================================
//
// These defaults are owned by `AppRunOptions` in create-app.tsx and are NOT
// exercised by `run()`-only tests. They each need their own contract once
// Phase 2 lands.
//
// - `alternateScreen` — default: false (createApp direct); run() sets true via mode.
// - `virtualInline` — default: false
// - `kittyMode` / `kitty` — default: auto
// - `mouse` — default: false in createApp direct; true via run()'s Term path
// - `suspendOnCtrlZ` — default: true
// - `exitOnCtrlC` — default: true
// - `guardOutput` — default: true (critical — disabling without knowing it
//   breaks alt-screen isolation; run() sets false for emulator-backed terms)
// - Provider composition defaults (withFocus, withDomEvents wiring) — see
//   runtime/with-*.ts files.
//
// TODO (Phase 2 bead km-silvery.defaults-contract-tests): port each above to
// a contract test. Some will need to call createApp() directly with a wired
// mock stdin/stdout because run() masks them.
