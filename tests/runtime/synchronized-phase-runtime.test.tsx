/**
 * Real-runtime contract for the shared animation clock.
 *
 * @failure useSynchronizedPhase advances under createRenderer tests but stays
 *   visually frozen when mounted through production run().
 * @level l2 — real runtime + xterm-backed Termless terminal.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless, recordFrames } from "@silvery/test"
import { GlimmerText, Text, useSynchronizedPhase } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

function PhaseProbe(): React.ReactElement {
  const phase = useSynchronizedPhase({
    active: true,
    periodMs: 120,
    steps: 4,
    reducedMotion: false,
  })
  return <Text>{`phase ${phase}`}</Text>
}

describe("useSynchronizedPhase runtime integration", () => {
  test("re-renders across phase boundaries without parent updates", async () => {
    using term = createTermless({ cols: 20, rows: 3 })
    const handle = await run(<PhaseProbe />, term)
    const recording = recordFrames(term)

    try {
      await new Promise((resolve) => setTimeout(resolve, 150))

      const phases = new Set(
        recording.frames.flatMap((frame) => {
          const match = /phase (\d+)/u.exec(frame.text)
          return match?.[1] === undefined ? [] : [match[1]]
        }),
      )
      expect(phases.size, `recorded phases: ${JSON.stringify([...phases])}`).toBeGreaterThan(1)
    } finally {
      recording.stop()
      handle.unmount()
    }
  })

  test.each(["truecolor", "mono"] as const)(
    "GlimmerText repaints nested glyph styles as the phase advances in %s",
    async (colorLevel) => {
      using term = createTermless({ cols: 20, rows: 3, caps: { colorLevel } })
      const recording = recordFrames(term)
      const handle = await run(
        <GlimmerText active color="$fg-muted" glimmerColor="$fg" period={480}>
          glimmer
        </GlimmerText>,
        term,
      )

      try {
        await new Promise((resolve) => setTimeout(resolve, 150))

        const foregrounds = Array.from({ length: "glimmer".length }, () => new Set<string>())
        const dimStates = Array.from({ length: "glimmer".length }, () => new Set<boolean | null>())
        for (const frame of recording.frames) {
          const row = frame.lines.findIndex((line) => line.includes("glimmer"))
          if (row < 0) continue
          const start = frame.lines[row]!.indexOf("glimmer")
          for (let index = 0; index < "glimmer".length; index++) {
            const fg = frame.cell(start + index, row).fg
            foregrounds[index]!.add(fg === null ? "none" : `${fg.r},${fg.g},${fg.b}`)
            dimStates[index]!.add(frame.cell(start + index, row).dim)
          }
        }

        const observed = colorLevel === "mono" ? dimStates : foregrounds
        const maxDistinct = Math.max(...observed.map((states) => states.size))
        expect(
          maxDistinct,
          `resolved glimmer styles: ${JSON.stringify(observed.map((states) => [...states]))}`,
        ).toBeGreaterThanOrEqual(2)
      } finally {
        recording.stop()
        handle.unmount()
      }
    },
  )
})
