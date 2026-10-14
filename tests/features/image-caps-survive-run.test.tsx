/**
 * 19668 contract: the resolved terminal caps survive `run()` into `TermContext`,
 * and `<Image>` gates its graphics protocol on the caps of the term it is
 * actually painting into — so a terminal whose AUTHORITATIVE kitty support is
 * false receives NO Kitty graphics APC bytes (the welcome escape-flood).
 *
 * Two layers:
 *   1. options-path `run()` threads explicit caps into TermContext (the chain
 *      the runtime probe feeds: probeTerminalProfile resolves caps → run() →
 *      createApp/TermContext). Probe authority itself is pinned in
 *      packages/ansi/tests/kitty-graphics-probe.test.ts.
 *   2. `<Image>` rendered under a term whose caps say no-kitty emits no APC
 *      (captured byte-level through a real emulator term), and the kitty-capable
 *      case still does — proving the gate is the caps, not ambient stdout.
 */

import React, { useContext } from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
// Exercise the same public lazy-image entry used by Welcome, including its package export resolution.
import { Image } from "silvery/ui/image"
import { run } from "../../packages/ag-term/src/runtime/run"
import { createTerm, createTerminalProfile } from "../../packages/ag-term/src/ansi"
import { TermContext } from "../../packages/ag-react/src/context"
import "@termless/test/matchers"

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGIAAQAABQABDQottAAAAABJRU5ErkJggg==",
  "base64",
)
const APC_OPEN = "\x1b_G"

// --- Layer 1: caps survive options-path run() into TermContext ---------------

let observedKitty: unknown = "unset"
function CapsProbe(): React.ReactElement {
  const term = useContext(TermContext)
  observedKitty = term ? term.caps.kittyGraphics : null
  return <Text>probe</Text>
}

async function termContextKittyFor(kittyGraphics: boolean): Promise<unknown> {
  observedKitty = "unset"
  const profile = createTerminalProfile({
    env: {},
    stdout: { isTTY: false },
    caps: { kittyGraphics, sixel: false } as never,
  })
  const handle = await run(
    <Box>
      <CapsProbe />
    </Box>,
    {
      profile,
      cols: 40,
      rows: 6,
      writable: { write: () => true } as never,
    } as never,
  )
  await new Promise<void>((r) => setTimeout(r, 80))
  handle.unmount()
  return observedKitty
}

describe("19668: explicit caps survive run() into TermContext", () => {
  test("caps.kittyGraphics=false reaches the Image's TermContext", async () => {
    expect(await termContextKittyFor(false)).toBe(false)
  })
  test("caps.kittyGraphics=true reaches the Image's TermContext", async () => {
    expect(await termContextKittyFor(true)).toBe(true)
  })
})

// --- Layer 2: <Image> gates the APC on the term's caps (byte-level) ----------

async function imageApcUnderTermCaps(kittyGraphics: boolean): Promise<string> {
  using emulator = createTermless({ cols: 40, rows: 10 })
  // A term whose caps are the authority for the Image's protocol decision.
  using capsTerm = createTerm({ cols: 40, rows: 10, caps: { kittyGraphics, sixel: false } })
  const handle = await run(
    <Box flexDirection="column" padding={1}>
      <TermContext.Provider value={capsTerm}>
        <Image src={TINY_PNG} width={10} height={5} protocol="kitty" fallback="[logo]" />
      </TermContext.Provider>
    </Box>,
    emulator,
  )
  await new Promise<void>((r) => setTimeout(r, 120))
  const out = emulator.out.getText()
  handle.unmount()
  return out
}

describe("19668: <Image> gates Kitty APC on the render term's caps", () => {
  test("no-kitty caps → NO graphics APC reaches the terminal", async () => {
    const out = await imageApcUnderTermCaps(false)
    expect(out, "a non-kitty term must not receive graphics APC bytes").not.toContain(APC_OPEN)
  })
  test("kitty-capable caps → the graphics APC IS emitted", async () => {
    const out = await imageApcUnderTermCaps(true)
    expect(out, "a kitty-capable term still gets the image").toContain(APC_OPEN)
  })
})
