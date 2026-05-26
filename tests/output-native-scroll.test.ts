import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../packages/ag-term/src/buffer.ts"
import { outputPhase } from "../packages/ag-term/src/pipeline/output-phase.ts"
import { replayAnsiWithStyles } from "../packages/ag-term/src/pipeline/output-verify.ts"

function writeRow(buffer: TerminalBuffer, y: number, text: string): void {
  for (let x = 0; x < buffer.width; x++) {
    buffer.setCell(x, y, { char: text[x] ?? " " })
  }
}

function fillRows(buffer: TerminalBuffer, prefix: string): void {
  for (let y = 0; y < buffer.height; y++) {
    const row = Array.from({ length: buffer.width }, (_, x) =>
      String.fromCharCode(65 + ((prefix.length * 11 + y * 7 + x) % 26)),
    ).join("")
    writeRow(buffer, y, row)
  }
}

function expectReplayMatches(buffer: TerminalBuffer, ansi: string): void {
  const replay = replayAnsiWithStyles(buffer.width, buffer.height, ansi)
  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      if (buffer.isCellContinuation(x, y)) continue
      expect(replay[y]?.[x]?.char ?? " ", `cell ${x},${y}`).toBe(buffer.getCellChar(x, y))
    }
  }
}

describe("output native scroll optimization", () => {
  test("uses a terminal scroll operation for dense vertical shifts", () => {
    const prev = new TerminalBuffer(80, 30)
    fillRows(prev, "prev")

    const next = prev.clone()
    next.scrollRegion(0, 4, 80, 20, 5)
    for (let y = 19; y < 24; y++) {
      writeRow(
        next,
        y,
        Array.from({ length: next.width }, (_, x) =>
          String.fromCharCode(97 + ((y * 13 + x * 3) % 26)),
        ).join(""),
      )
    }

    const fullPrev = outputPhase(null, prev, "fullscreen")
    const patch = outputPhase(prev, next, "fullscreen")

    expect(patch).toContain("\x1b[5S")
    expect(patch).toContain("\x1b[5;24r")
    expect(Buffer.byteLength(patch)).toBeLessThan(2500)
    expectReplayMatches(next, fullPrev + patch)
  })
})
