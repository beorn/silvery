/**
 * Regression guard for the 2026-07-02 Ghostty-WASM singleton split.
 *
 * @termless/ghostty holds a module-level `sharedGhostty` WASM singleton, set by
 * `initGhostty()` and read synchronously by `createGhosttyBackend()`. The
 * SILVERY_STRICT_TERMINAL / cursor verifiers used to load @termless/* via
 * `createRequire`, which under vitest's module runner produced a SECOND module
 * instance whose `sharedGhostty` was null even after the ESM instance had been
 * initialized. The verifier's ghostty backend then errored ("WASM not loaded")
 * or diverged from the ghostty terminal every other consumer shares. The
 * contract-test culprit was fixed in silvery 4641f71b; output-verify.ts +
 * cursor-diagnostics.ts were the remaining production-side instances.
 *
 * The invariant these tests pin: the strict verifier observes the SAME
 * @termless module instance (and therefore the same loaded-WASM state) as the
 * ESM graph — createTermless, createGhosttyBackend, and a plain
 * `import … from "@termless/ghostty"` all resolve to one instance.
 *
 * Bead: createrequire-ban (wave 3 — the incident siblings).
 */
// @termless-backend: ghostty
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "silvery"
import React from "react"
import { initGhostty } from "@termless/ghostty"
import {
  preloadStrictTerminalBackends,
  getTermlessCore,
  getTermlessXterm,
  getTermlessGhostty,
} from "@silvery/ag-term/strict-terminal-backends"
import { createApp } from "../packages/ag-term/src/runtime/create-app"

let origStrictTerminal: string | undefined

beforeEach(() => {
  origStrictTerminal = process.env.SILVERY_STRICT_TERMINAL
})

afterEach(async () => {
  if (origStrictTerminal === undefined) delete process.env.SILVERY_STRICT_TERMINAL
  else process.env.SILVERY_STRICT_TERMINAL = origStrictTerminal
  // Other suites in this worker rely on the backends staying preloaded (via
  // @silvery/test's top-level preload). Restore after any reset here.
  await preloadStrictTerminalBackends({ ghostty: true, initGhosttyWasm: false })
})

function Counter({ n }: { n: number }) {
  return (
    <Box flexDirection="column">
      <Text>Count: {n}</Text>
      <Text>Static line</Text>
    </Box>
  )
}

describe("SILVERY_STRICT terminal backends — single ESM instance", () => {
  // The red-first behavioral check: reproduces the incident end-to-end. Under
  // the old createRequire load the verifier's @termless/ghostty is a second
  // instance whose sharedGhostty is null, so the FIRST ghostty frame throws
  // "WASM not loaded". With the ESM-graph load it shares the WASM the test
  // initialized below and the frame verifies cleanly.
  test("STRICT_TERMINAL=ghostty verifier shares the ESM ghostty WASM singleton", async () => {
    await initGhostty() // load WASM on the ESM @termless/ghostty instance

    process.env.SILVERY_STRICT_TERMINAL = "ghostty"
    const render = createRenderer({ cols: 40, rows: 10 })

    // First render initializes the persistent ghostty verify terminal.
    const app = render(<Counter n={0} />)
    expect(app.text).toContain("Count: 0")

    // Incremental frame → verifyTerminalEquivalence feeds both the persistent
    // and a fresh ghostty terminal. No throw ⇒ the verifier used the shared WASM.
    app.rerender(<Counter n={1} />)
    expect(app.text).toContain("Count: 1")

    app.rerender(<Counter n={2} />)
    expect(app.text).toContain("Count: 2")
  })

  // The structural guard: the sync accessors return the very module objects a
  // plain dynamic import resolves. `toBe` fails if a load ever regresses to
  // createRequire (a distinct instance).
  test("sync accessors return the ESM-graph @termless module instances", async () => {
    await preloadStrictTerminalBackends({ ghostty: true, initGhosttyWasm: false })

    const core = await import("@termless/core")
    const xterm = await import("@termless/xtermjs")
    const ghostty = await import("@termless/ghostty")

    expect(getTermlessCore()).toBe(core)
    expect(getTermlessXterm()).toBe(xterm)
    expect(getTermlessGhostty()).toBe(ghostty)
  })

  // NO SILENT ERRORS: a consumed-but-not-preloaded backend must throw a loud,
  // actionable error rather than degrade silently.
  test("a sync accessor throws loud when the backend was not preloaded", async () => {
    // The cache is a Symbol.for global so every module instance shares it; no module reset reaches it, so the test
    // empties that registry slot (E-1, 25632).
    Reflect.deleteProperty(globalThis, Symbol.for("@silvery/ag-term:strict-terminal-backends"))
    try {
      expect(() => getTermlessGhostty()).toThrow(/preloaded/)
      expect(() => getTermlessCore()).toThrow(/preloadStrictTerminalBackends/)
    } finally {
      await preloadStrictTerminalBackends({ ghostty: true, initGhosttyWasm: false })
    }
  })

  // 26496: km starts through createApp().run(), not run(). Only run() preloaded the backends, so the first strict
  // frame of any createApp consumer failed loud at startup. The app must preload at its own async setup boundary.
  test("createApp().run() preloads the backends itself before its first strict frame", async () => {
    Reflect.deleteProperty(globalThis, Symbol.for("@silvery/ag-term:strict-terminal-backends"))
    process.env.SILVERY_STRICT_TERMINAL = "xterm"
    let written = ""
    const handle = await createApp(() => () => ({})).run(<Counter n={0} />, {
      writable: { write: (data: string) => void (written += data) },
      cols: 40,
      rows: 10,
    })
    try {
      expect(written).toContain("Count: 0")
      expect(getTermlessXterm()).toBe(await import("@termless/xtermjs"))
    } finally {
      handle.unmount()
    }
  })
})
