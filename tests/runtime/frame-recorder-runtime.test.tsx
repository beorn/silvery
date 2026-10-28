/**
 * Frame-recorder runtime contract.
 *
 * @failure recordFrames(createTermless()) records zero frames because the
 *   live run() path writes through emulator.feed instead of Term.paint.
 * @level l2 — real runtime + xterm-backed Termless terminal.
 */

import { createTerm } from "@silvery/ag-term"
import { createXtermBackend } from "@termless/xtermjs"
import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { createTermless, recordFrames } from "@silvery/test"
import { Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

describe("recordFrames runtime integration", () => {
  test("records a mounted runtime update written through the emulator", async () => {
    let update: ((value: number) => void) | undefined
    function Counter(): React.ReactElement {
      const [value, setValue] = useState(0)
      update = setValue
      return <Text color={value === 1 ? "#ff0000" : "#00ff00"}>{`frame ${value}`}</Text>
    }

    using term = createTermless({ cols: 20, rows: 3 })
    const handle = await run(<Counter />, term)
    const recording = recordFrames(term)

    try {
      update?.(1)
      await new Promise((resolve) => setTimeout(resolve, 50))

      const first = recording.frames.find((frame) => frame.containsText("frame 1"))
      expect(first?.cell(0, 0).fg).toEqual({ r: 255, g: 0, b: 0 })

      update?.(2)
      await new Promise((resolve) => setTimeout(resolve, 50))

      const second = recording.frames.find((frame) => frame.containsText("frame 2"))
      expect(second?.cell(0, 0).fg).toEqual({ r: 0, g: 255, b: 0 })
      expect(first?.cell(0, 0).fg).toEqual({ r: 255, g: 0, b: 0 })
    } finally {
      recording.stop()
      handle.unmount()
    }
  })
})

// Exercise the recorder contract independently of a producer's published version.
// Real VT100/VT220 unavailable-style readback is covered in Termless's backend tests.
test("recorder boundary preserves unavailable styles through serialization and comparison", () => {
  const backend = createXtermBackend()
  let reportsStyles = false
  const nullableBackend = {
    ...backend,
    getCell(row: number, col: number) {
      return {
        ...backend.getCell(row, col),
        dim: reportsStyles ? false : null,
        italic: reportsStyles ? false : null,
        strikethrough: reportsStyles ? false : null,
      }
    },
  }
  using term = createTerm(nullableBackend, { cols: 2, rows: 1 })
  const recording = recordFrames(term)
  try {
    term.write("X")
    const frame = recording.frames[0]!
    const cell = JSON.parse(JSON.stringify(frame.cell(0, 0))) as ReturnType<typeof frame.cell>
    expect(cell).toMatchObject({ dim: null, italic: null, strikethrough: null })
    expect(cell.dim).not.toBe(false)
    reportsStyles = true
    term.write("\rX")
    expect(frame.cell(0, 0)).toEqual(cell)
    expect(recording.diff(0, 1)).toMatchObject([
      { col: 0, row: 0, from: { dim: null }, to: { dim: false } },
      { col: 1, row: 0, from: { dim: null }, to: { dim: false } },
    ])
    expect(recording.frames[1]!.cell(0, 0)).toMatchObject({
      dim: false,
      italic: false,
      strikethrough: false,
    })
  } finally {
    recording.stop()
  }
})
