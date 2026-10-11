/**
 * Pre-enrollment security audit (hh 28598 slice f F13): a mouse report
 * with a huge or non-finite row must not drive a per-row selection loop.
 *
 * parseInt on SGR coordinates is unbounded. With no selection scope,
 * clampToScope returns them unclamped; composeSelectionCells and
 * extractText then loop `for (row = start; row <= end; row++)`. A
 * 50-million row costs seconds; a 400-digit row parses to Infinity and
 * never ends.
 *
 * @failure A mouse report with a huge or non-finite row hangs the selection loop
 * @level l2
 * @consumer @silvery/ag-term parseMouseSequence (hh 28598 F13)
 * @testonly none
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"
import { parseMouseSequence } from "../../packages/ag-term/src/mouse"
import { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import { composeSelectionCells } from "../../packages/ag-term/src/selection-renderer"
import { extractText } from "../../packages/headless/src/selection"

const ESC = "\x1b"
const tick = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms))

describe("parseMouseSequence rejects non-finite coordinates", () => {
  test("a 400-digit row does not parse to Infinity", () => {
    const seq = `${ESC}[<4;2;${"9".repeat(400)}M`
    const parsed = parseMouseSequence(seq)
    expect(parsed === null || Number.isFinite(parsed.y)).toBe(true)
    if (parsed) expect(parsed.y).toBeLessThan(1_000_000)
  })

  test("a 50-million row is finite and not fifty million", () => {
    const parsed = parseMouseSequence(`${ESC}[<4;2;50000000M`)
    expect(parsed).not.toBeNull()
    expect(Number.isFinite(parsed!.y)).toBe(true)
    expect(parsed!.y).toBeLessThan(1_000_000)
  })
})

describe("selection loops stay inside the buffer", () => {
  test("composeSelectionCells on a 50-million end row finishes cheaply", () => {
    const buf = new TerminalBuffer(40, 6)
    buf.setCell(0, 0, { char: "A", fg: null, bg: null, selectable: true })
    const t0 = performance.now()
    const changes = composeSelectionCells(buf, {
      anchor: { col: 0, row: 0 },
      head: { col: 0, row: 50_000_000 },
    })
    expect(performance.now() - t0).toBeLessThan(50)
    expect(changes.every((c) => c.row >= 0 && c.row < buf.height)).toBe(true)
  })

  test("extractText on a 50-million end row finishes cheaply", () => {
    const buf = new TerminalBuffer(40, 6)
    buf.setCell(0, 0, { char: "A", fg: null, bg: null, selectable: true })
    const t0 = performance.now()
    const text = extractText(
      buf,
      { anchor: { col: 0, row: 0 }, head: { col: 0, row: 50_000_000 } },
      { respectSelectableFlag: false },
    )
    expect(performance.now() - t0).toBeLessThan(50)
    expect(typeof text).toBe("string")
  })

  test("composeSelectionCells on a zero-size buffer returns empty", () => {
    const emptyHeight = new TerminalBuffer(40, 0)
    const emptyWidth = new TerminalBuffer(0, 6)
    const range = { anchor: { col: 0, row: 0 }, head: { col: 0, row: 0 } }
    expect(composeSelectionCells(emptyHeight, range)).toEqual([])
    expect(composeSelectionCells(emptyWidth, range)).toEqual([])
    expect(extractText(emptyHeight, range, { respectSelectableFlag: false })).toBe("")
    expect(extractText(emptyWidth, range, { respectSelectableFlag: false })).toBe("")
  })
})

describe("mouse reports with very large coordinates", () => {
  test("row 50,000,000 on a 6-row screen is clamped or cheap", async () => {
    const term = createTermless({ cols: 40, rows: 6 })
    const handle = await run(<Text>probe</Text>, term, { mouse: true })
    try {
      const send = (s: string) =>
        (term as unknown as { sendInput: (s: string) => void }).sendInput(s)
      const t0 = performance.now()
      send(`${ESC}[<4;2;1M`)
      await tick()
      send(`${ESC}[<36;2;50000000M`)
      await tick()
      send(`${ESC}[<4;2;50000000m`)
      await tick()
      expect(performance.now() - t0).toBeLessThan(1_000)
    } finally {
      handle.unmount()
      term[Symbol.dispose]()
    }
  }, 30_000)
})
