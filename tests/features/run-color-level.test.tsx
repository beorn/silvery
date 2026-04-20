/**
 * `run({ colorLevel })` — programmatic color-tier override.
 *
 * Covers:
 * - ColorTier ⇄ caps.colorLevel mapping (helpers exported from run.tsx)
 * - env-var precedence (NO_COLOR > FORCE_COLOR > option > auto-detect)
 * - end-to-end: forcing `"mono"` strips color SGRs from the ANSI stream
 *   (the single tier the output phase already honors for inline hex +
 *   $tokens alike). Other tiers are exercised via the mapping helpers
 *   and env-precedence cases; theme pre-quantization (hex leaves reaching
 *   canonical 16-slot / 256-cube values) is covered by
 *   `packages/ansi/tests/pick-color-level.test.ts`.
 *
 * Strategy: use the `writable` option to capture raw ANSI. `run({ writable,
 * cols, rows })` takes the headless code path — no alt-screen, no OSC theme
 * detection, deterministic output suitable for regex assertions.
 */

import React from "react"
import { afterEach, describe, expect, test, beforeEach } from "vitest"

import { Box, Text } from "../../src/index.js"
import {
  run,
  capsLevelToTier,
  tierToCapsLevel,
  type RunHandle,
} from "../../packages/ag-term/src/runtime/run"

// ============================================================================
// Env-var scaffolding — isolate each test from the ambient environment.
// ============================================================================

let savedNoColor: string | undefined
let savedForceColor: string | undefined

beforeEach(() => {
  savedNoColor = process.env.NO_COLOR
  savedForceColor = process.env.FORCE_COLOR
  delete process.env.NO_COLOR
  delete process.env.FORCE_COLOR
})

afterEach(() => {
  if (savedNoColor === undefined) delete process.env.NO_COLOR
  else process.env.NO_COLOR = savedNoColor
  if (savedForceColor === undefined) delete process.env.FORCE_COLOR
  else process.env.FORCE_COLOR = savedForceColor
})

// ============================================================================
// Raw-ANSI capture helper — routes run() output into a string sink.
// ============================================================================

function makeSink() {
  let buf = ""
  return {
    writable: {
      write(data: string) {
        buf += data
      },
    },
    get raw() {
      return buf
    },
  }
}

async function runCapturing(
  element: React.ReactElement,
  opts: { colorLevel?: "mono" | "ansi16" | "256" | "truecolor" } = {},
): Promise<string> {
  const sink = makeSink()
  let handle: RunHandle | undefined
  try {
    handle = await run(element, {
      writable: sink.writable,
      cols: 40,
      rows: 3,
      caps: {
        // Default to truecolor caps so the "no option" case has a predictable
        // baseline — otherwise non-TTY auto-detection would pick "none" and
        // strip color from every test (including the ones that should keep it).
        program: "ghostty",
        term: "xterm-ghostty",
        colorLevel: "truecolor",
        kittyKeyboard: false,
        kittyGraphics: false,
        sixel: false,
        osc52: false,
        hyperlinks: false,
        notifications: false,
        bracketedPaste: true,
        mouse: false,
        syncOutput: false,
        unicode: true,
        underlineStyles: true,
        underlineColor: true,
        textEmojiWide: true,
        textSizingSupported: false,
        darkBackground: true,
        nerdfont: false,
      },
      ...opts,
    })
  } finally {
    // One more tick so the async render completes and the writable flushes.
    await new Promise((r) => setImmediate(r))
    handle?.unmount()
  }
  return sink.raw
}

// ============================================================================
// Tier ⇄ caps spelling round-trip
// ============================================================================

describe("tierToCapsLevel / capsLevelToTier", () => {
  test("round-trips every tier through the caps spelling", () => {
    const tiers = ["mono", "ansi16", "256", "truecolor"] as const
    for (const tier of tiers) {
      expect(capsLevelToTier(tierToCapsLevel(tier))).toBe(tier)
    }
  })

  test("tierToCapsLevel emits the internal caps vocabulary", () => {
    expect(tierToCapsLevel("mono")).toBe("none")
    expect(tierToCapsLevel("ansi16")).toBe("basic")
    expect(tierToCapsLevel("256")).toBe("256")
    expect(tierToCapsLevel("truecolor")).toBe("truecolor")
  })
})

// ============================================================================
// End-to-end — caps.colorLevel override observable in the ANSI stream
// ============================================================================

function Swatch({ hex }: { hex: string }) {
  return (
    <Box>
      <Text color={hex}>X</Text>
    </Box>
  )
}

function TokenSwatch() {
  return (
    <Box>
      <Text color="$fg-accent">X</Text>
    </Box>
  )
}

describe("run({ colorLevel }) — options path", () => {
  test("default (no option) emits truecolor SGR for inline hex", async () => {
    const ansi = await runCapturing(<Swatch hex="#88c0d0" />)
    expect(ansi).toMatch(/\x1b\[[0-9;]*38;2;\d+;\d+;\d+/)
  })

  test("colorLevel: 'mono' strips inline hex → no color SGR at all", async () => {
    const ansi = await runCapturing(<Swatch hex="#88c0d0" />, { colorLevel: "mono" })
    expect(ansi).not.toMatch(/\x1b\[[0-9;]*38;2;/)
    expect(ansi).not.toMatch(/\x1b\[[0-9;]*38;5;/)
  })

  test("colorLevel: 'mono' strips $token colors → no color SGR at all", async () => {
    const ansi = await runCapturing(<TokenSwatch />, { colorLevel: "mono" })
    expect(ansi).not.toMatch(/\x1b\[[0-9;]*38;2;/)
    expect(ansi).not.toMatch(/\x1b\[[0-9;]*38;5;/)
  })

  test("colorLevel: 'truecolor' passes inline hex through unchanged", async () => {
    const ansi = await runCapturing(<Swatch hex="#88c0d0" />, { colorLevel: "truecolor" })
    // #88c0d0 = rgb(136, 192, 208)
    expect(ansi).toMatch(/\x1b\[[0-9;]*38;2;136;192;208/)
  })
})

// ============================================================================
// Env-var precedence
// ============================================================================

describe("env-var precedence over colorLevel option", () => {
  test("NO_COLOR=1 wins over colorLevel: 'truecolor' (→ mono)", async () => {
    process.env.NO_COLOR = "1"
    const ansi = await runCapturing(<Swatch hex="#88c0d0" />, { colorLevel: "truecolor" })
    expect(ansi).not.toMatch(/\x1b\[[0-9;]*38;2;/)
    expect(ansi).not.toMatch(/\x1b\[[0-9;]*38;5;/)
  })

  test("FORCE_COLOR=3 wins over colorLevel: 'mono' (→ truecolor passes hex)", async () => {
    process.env.FORCE_COLOR = "3"
    const ansi = await runCapturing(<Swatch hex="#88c0d0" />, { colorLevel: "mono" })
    expect(ansi).toMatch(/\x1b\[[0-9;]*38;2;136;192;208/)
  })

  test("FORCE_COLOR=0 wins over colorLevel: 'truecolor' (→ mono)", async () => {
    process.env.FORCE_COLOR = "0"
    const ansi = await runCapturing(<Swatch hex="#88c0d0" />, { colorLevel: "truecolor" })
    expect(ansi).not.toMatch(/\x1b\[[0-9;]*38;2;/)
    expect(ansi).not.toMatch(/\x1b\[[0-9;]*38;5;/)
  })

  test("NO_COLOR wins over FORCE_COLOR=3 (→ mono)", async () => {
    process.env.NO_COLOR = "1"
    process.env.FORCE_COLOR = "3"
    const ansi = await runCapturing(<Swatch hex="#88c0d0" />, { colorLevel: "truecolor" })
    expect(ansi).not.toMatch(/\x1b\[[0-9;]*38;2;/)
    expect(ansi).not.toMatch(/\x1b\[[0-9;]*38;5;/)
  })
})
