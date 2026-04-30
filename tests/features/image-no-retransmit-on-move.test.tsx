/**
 * Regression: an `<Image>` whose screen position changes (e.g. on scroll)
 * must NOT re-transmit the full base64-encoded PNG every time. Pre-fix,
 * each position change ran `delete + encodeKittyImage(a=T) + place` —
 * the encode re-emitted the entire PNG payload (~MB of base64 for a
 * real banner asset), producing visible flicker on every scroll tick.
 *
 * Post-fix (km-silvery.image-flicker-on-scroll):
 *   - First paint: `a=t` (transmit only) once, then `a=p` to place
 *   - Subsequent moves: `a=d,p=…` (delete prior placement) + cursor +
 *     `a=p` (re-place) — no re-encode of the base64 blob.
 *
 * The test counts how many KItty APC envelopes carry an `a=t` or `a=T`
 * action (transmission) vs `a=p` (placement) across N moves and asserts
 * exactly one transmission.
 */

import React, { useEffect, useState } from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { Box, Image } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"
import { getInternalStreams } from "../../packages/ag-term/src/runtime/term-internal"

// Minimal PNG — enough bytes that re-transmission would be visible in
// the byte counts even on a fast emulator. The exact bytes don't
// matter; only the count of `a=t` vs `a=p` actions does.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGIAAQAABQABDQottAAAAABJRU5ErkJggg==",
  "base64",
)

const settle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Count APC envelopes whose first param matches /a=([Ttp])/. */
function countActions(stream: string): { transmit: number; place: number } {
  let transmit = 0
  let place = 0
  // APC opener \x1b_G ... terminator \x1b\\.
  const re = /\x1b_G([^\x1b]*)\x1b\\/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stream)) !== null) {
    const params = m[1] ?? ""
    // The first action param is what matters for tx-vs-place classification.
    const a = /(?:^|,)a=([TtpdD])/.exec(params)?.[1]
    if (a === "T" || a === "t") transmit++
    else if (a === "p") place++
    // 'd' = delete actions: not counted as either; permitted between moves.
  }
  return { transmit, place }
}

/** Drive a position change via state — useEffect bumps the offset N times. */
function MovingImage({ moves }: { moves: number }): React.ReactElement {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= moves) return
    const t = setTimeout(() => setStep((s) => s + 1), 20)
    return () => clearTimeout(t)
  }, [step, moves])
  return (
    <Box flexDirection="column">
      {/* Spacer above the image: each step shifts the image down by one row.
        * That changes useScreenRect() and triggers Image's re-emit. */}
      {Array.from({ length: step }, (_, i) => (
        <Box key={i} height={1} width={20} />
      ))}
      <Image src={TINY_PNG} width={10} height={4} protocol="kitty" />
    </Box>
  )
}

describe("Image: scrolling/moving does not re-transmit the PNG", () => {
  test("re-positioning emits one transmission and N placements", async () => {
    using term = createTermless({ cols: 40, rows: 24 })

    const writes: string[] = []
    const internal = getInternalStreams(term).stdout as unknown as {
      write: (s: string | Uint8Array) => boolean
    }
    const orig = internal.write.bind(internal)
    internal.write = (s: string | Uint8Array) => {
      writes.push(typeof s === "string" ? s : Buffer.from(s).toString("utf8"))
      return orig(s)
    }

    const handle = await run(<MovingImage moves={3} />, term)
    // Wait for all 3 setTimeout-driven re-positions to fire + commit.
    await settle(200)

    const all = writes.join("")
    const counts = countActions(all)

    expect(counts.transmit, "PNG should be transmitted exactly once").toBe(1)
    // Initial place + 3 re-places = 4 placements minimum. Allow more
    // (commit/effect cycles can re-fire) but never zero.
    expect(counts.place, "image should be re-placed without re-transmission").toBeGreaterThanOrEqual(2)

    handle.unmount()
  })
})
