/**
 * Cross-render color level — one app's terminal caps must not restyle another's.
 *
 * `createPipeline()` mirrors `caps.colorLevel` into module state so
 * `render-helpers`' `parseColor()` / `getTextStyle()` can dispatch on tier
 * without access to an OutputContext. It is called once per app construction
 * (create-app.tsx) and on cap re-detection — never per frame — so nothing
 * re-establishes it before a render reads it. In a process with two apps
 * against terminals of different color support, whichever constructed LAST
 * decides the tier for BOTH.
 *
 * What that changes is the monochrome branch. At `"mono"`, `parseColor()`
 * returns null for `$tokens` and `getTextStyle()` injects per-token SGR attrs
 * from `DEFAULT_MONO_ATTRS`, so a mono terminal keeps its hierarchy as
 * bold / dim / italic / underline / inverse. Flip the tier out from under a
 * mono app and those attrs stop being injected — while its own output phase
 * (which holds `colorLevel` per instance, in a closure) still strips the color
 * it would have emitted instead. The app renders flat: no color, no hierarchy.
 *
 * Calibrated emission for `<Text color="$fg-accent">`:
 *   mono      → `\x1b[1m` (bold), no color SGR
 *   truecolor → `\x1b[38;2;235;203;139m`, no bold
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"

import { Box, Text } from "../../src/index.js"
import type { TerminalCaps } from "../../packages/ansi/src/caps"
import { createTerminalProfile } from "../../packages/ansi/src/profile"
import { run, type RunHandle } from "../../packages/ag-term/src/runtime/run"
import { useInput } from "../../packages/ag-react/src/hooks/useInput"

// ============================================================================
// Harness — raw ANSI capture through the headless `writable` path.
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

/** Caps shared by both terminals; only `colorLevel` differs between them. */
const BASE_CAPS = {
  cursor: true,
  input: false,
  colorForced: false,
  colorProvenance: "caller-caps" as const,
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
  overline: true,
  underlineStyles: ["double", "curly", "dotted", "dashed"] as const,
  underlineColor: true,
  textSizing: false,
  maybeDarkBackground: true,
  maybeNerdFont: false,
  maybeWideEmojis: true,
} satisfies Partial<TerminalCaps>

/** SGR 1 (bold) — the attr `$fg-accent` carries at mono tier. */
function hasBold(ansi: string): boolean {
  for (const m of ansi.matchAll(/\x1b\[([0-9;]*)m/g)) {
    if (m[1]!.split(";").includes("1")) return true
  }
  return false
}

/** Any fg color SGR — truecolor or 256. */
function hasColor(ansi: string): boolean {
  return /\x1b\[[0-9;]*38;[25];/.test(ansi)
}

/** Guard against a vacuous pass: the frame must actually have repainted a cell. */
function repainted(frame: string): boolean {
  // A cursor-position move plus the changed digit — the incremental diff
  // re-emits only the cell that changed, not the whole token string.
  return /\x1b\[\d+;\d+H/.test(frame) && /[0-9]/.test(frame.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ""))
}

/** The token text repaints on every keypress, so each frame re-emits its SGR. */
function Counter() {
  const [n, setN] = useState(0)
  useInput(() => setN((v) => v + 1))
  return (
    <Box>
      <Text color="$fg-accent">tick{n}</Text>
    </Box>
  )
}

async function startApp(
  colorLevel: "mono" | "truecolor",
  sink: ReturnType<typeof makeSink>,
): Promise<RunHandle> {
  const handle = await run(<Counter />, {
    writable: sink.writable,
    cols: 20,
    rows: 2,
    profile: createTerminalProfile({
      env: {},
      stdout: { isTTY: false },
      colorLevel,
      caps: BASE_CAPS,
    }),
  })
  await new Promise((r) => setImmediate(r))
  return handle
}

// ============================================================================
// Tests
// ============================================================================

describe("color level: cross-render tier leakage", () => {
  test("control: a mono app alone keeps its SGR attrs across frames", async () => {
    const sink = makeSink()
    const app = await startApp("mono", sink)
    try {
      expect(hasBold(sink.raw)).toBe(true)
      expect(hasColor(sink.raw)).toBe(false)

      const mark = sink.raw.length
      await app.press("j")
      await new Promise((r) => setImmediate(r))
      const frame2 = sink.raw.slice(mark)

      expect(repainted(frame2)).toBe(true)
      expect(hasBold(frame2)).toBe(true)
      expect(hasColor(frame2)).toBe(false)
    } finally {
      app.unmount()
    }
  })

  test("subject: a truecolor peer must not strip the mono app's SGR attrs", async () => {
    const sink = makeSink()
    const app = await startApp("mono", sink)
    const peerSink = makeSink()
    let peer: RunHandle | undefined
    try {
      expect(hasBold(sink.raw)).toBe(true)

      // A second app against a truecolor terminal. It never touches the mono
      // app — it only exists in the same process.
      peer = await startApp("truecolor", peerSink)

      const mark = sink.raw.length
      await app.press("j")
      await new Promise((r) => setImmediate(r))
      const frame2 = sink.raw.slice(mark)

      // The mono app repainted its token text and must still carry the mono
      // hierarchy attrs. Its own output phase strips color regardless, so
      // losing the attrs leaves the frame with no styling at all.
      expect(repainted(frame2)).toBe(true)
      expect(hasBold(frame2)).toBe(true)
    } finally {
      peer?.unmount()
      app.unmount()
    }
  })

  test("subject, reversed: a mono peer must not strip the truecolor app's colors", async () => {
    const sink = makeSink()
    const app = await startApp("truecolor", sink)
    const peerSink = makeSink()
    let peer: RunHandle | undefined
    try {
      expect(hasColor(sink.raw)).toBe(true)

      peer = await startApp("mono", peerSink)

      const mark = sink.raw.length
      await app.press("j")
      await new Promise((r) => setImmediate(r))
      const frame2 = sink.raw.slice(mark)

      // `parseColor()` resolves $tokens against the tier; at mono it returns
      // null, so the truecolor app would repaint its token text colorless.
      expect(repainted(frame2)).toBe(true)
      expect(hasColor(frame2)).toBe(true)
    } finally {
      peer?.unmount()
      app.unmount()
    }
  })
})
