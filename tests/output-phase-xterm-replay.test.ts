/**
 * Regression test: replay captured ANSI through xterm.js and compare
 * with fresh render. This catches output-phase bugs that the software VT
 * (replayAnsiWithStyles) misses.
 */
import { describe, test, expect } from "vitest"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import { readFileSync, existsSync } from "fs"

const COLS = 220
const ROWS = 40

describe("output-phase xterm.js replay", () => {
  test("cumulative incremental ANSI matches fresh render in xterm.js", () => {
    const rawPath = "/tmp/silvery-raw.ansi"
    const freshPath = "/tmp/silvery-raw-fresh-8.ansi"

    if (!existsSync(rawPath) || !existsSync(freshPath)) {
      return // Skip: run with SILVERY_CAPTURE_RAW=1 first to capture ANSI files
    }

    const cumulativeAnsi = readFileSync(rawPath, "utf-8")
    const freshAnsi = readFileSync(freshPath, "utf-8")

    // Replay cumulative (initial + all incremental diffs) through xterm.js
    const termIncr = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
    termIncr.feed(cumulativeAnsi)

    // Replay fresh render through xterm.js
    const termFresh = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
    termFresh.feed(freshAnsi)

    // Compare cell by cell
    const mismatches: string[] = []

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const incr = termIncr.getCell(y, x)
        const fresh = termFresh.getCell(y, x)
        if (!incr || !fresh) continue

        if (incr.char !== fresh.char) {
          if (mismatches.length < 30) {
            mismatches.push(`(${x},${y}): incr='${incr.char}' fresh='${fresh.char}'`)
          }
        }
      }
    }

    if (mismatches.length > 0) {
      // Show row context for first mismatch
      const firstY = parseInt(mismatches[0]!.match(/,(\d+)/)![1]!)
      const context: string[] = []
      for (let y = Math.max(0, firstY - 1); y <= Math.min(ROWS - 1, firstY + 2); y++) {
        let incrRow = ""
        let freshRow = ""
        for (let x = 0; x < COLS; x++) {
          incrRow += termIncr.getCell(y, x)?.char || " "
          freshRow += termFresh.getCell(y, x)?.char || " "
        }
        context.push(`incr  row ${y}: ${incrRow.trimEnd()}`)
        context.push(`fresh row ${y}: ${freshRow.trimEnd()}`)
      }

      expect.fail(
        `${mismatches.length}+ cell mismatches between cumulative incremental and fresh render:\n` +
          mismatches.slice(0, 10).join("\n") +
          `\n\nRow context:\n${context.join("\n")}`,
      )
    }

    termIncr.close()
    termFresh.close()
  })

  test("analyze flag emoji cursor drift", () => {
    const rawPath = "/tmp/silvery-raw.ansi"
    const freshPath = "/tmp/silvery-raw-fresh-8.ansi"

    if (!existsSync(rawPath) || !existsSync(freshPath)) {
      return
    }

    const cumulativeAnsi = readFileSync(rawPath, "utf-8")
    const freshAnsi = readFileSync(freshPath, "utf-8")

    const termIncr = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
    termIncr.feed(cumulativeAnsi)
    const termFresh = createTerminal({ backend: createXtermBackend(), cols: COLS, rows: ROWS })
    termFresh.feed(freshAnsi)

    // Dump cells around the 🇨🇦 flag on row 0 (cols 40-70)
    console.log("Row 0 cells around the flag emoji (cols 40-70):")
    for (let x = 40; x < 70; x++) {
      const ic = termIncr.getCell(0, x)
      const fc = termFresh.getCell(0, x)
      const match = ic?.char === fc?.char ? " " : "!"
      console.log(
        `  col ${x.toString().padStart(3)}: incr='${(ic?.char ?? " ").padEnd(4)}' fresh='${(fc?.char ?? " ").padEnd(4)}' ${match}`,
      )
    }

    // Count mismatches per row for rows 0-9
    for (let y = 0; y < 10; y++) {
      let firstMismatch = -1
      let count = 0
      for (let x = 0; x < COLS; x++) {
        const ic = termIncr.getCell(y, x)
        const fc = termFresh.getCell(y, x)
        if (ic?.char !== fc?.char) {
          count++
          if (firstMismatch === -1) firstMismatch = x
        }
      }
      if (count > 0) {
        console.log(`Row ${y}: ${count} mismatches, first at col ${firstMismatch}`)
      }
    }

    termIncr.close()
    termFresh.close()
  })
})
