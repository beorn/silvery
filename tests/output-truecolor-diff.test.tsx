/**
 * Test: diffBuffers must detect true color changes even when packed metadata matches.
 *
 * Bug: rowMetadataEquals + rowCharsEquals only compare the packed Uint32Array and
 * chars array. When two cells both have the true-color flag set but different
 * actual RGB values in the Maps, the row pre-check says "equal" and the row is
 * skipped entirely — causing garbled output.
 */
import { describe, test, expect } from "vitest"
import { outputPhase } from "../src/pipeline/output-phase.js"
import { createRenderer } from "../tests/setup.js"
import React, { useState } from "react"
import { Box, Text } from "../src/index.js"

/**
 * Replay ANSI output to extract character + style at each position.
 * We only need to verify that the correct characters appear at the right positions.
 */
function replayAnsiChars(width: number, height: number, ansi: string): string[][] {
  const screen: string[][] = Array.from({ length: height }, () => Array(width).fill(" "))
  let cx = 0
  let cy = 0
  let i = 0

  while (i < ansi.length) {
    if (ansi[i] === "\x1b") {
      if (ansi[i + 1] === "[") {
        i += 2
        let params = ""
        while (
          i < ansi.length &&
          ((ansi[i]! >= "0" && ansi[i]! <= "9") || ansi[i] === ";" || ansi[i] === "?" || ansi[i] === ":")
        ) {
          params += ansi[i]
          i++
        }
        const cmd = ansi[i]
        i++
        if (cmd === "H") {
          if (params === "") {
            cx = 0
            cy = 0
          } else {
            const parts = params.split(";")
            cy = Math.max(0, (parseInt(parts[0]!) || 1) - 1)
            cx = Math.max(0, (parseInt(parts[1]!) || 1) - 1)
          }
        } else if (cmd === "K") {
          const n = parseInt(params) || 0
          if (n === 0) {
            for (let x = cx; x < width; x++) screen[cy]![x] = " "
          } else if (n === 1) {
            for (let x = 0; x <= cx; x++) screen[cy]![x] = " "
          } else if (n === 2) {
            for (let x = 0; x < width; x++) screen[cy]![x] = " "
          }
        } else if (cmd === "A") {
          cy = Math.max(0, cy - (parseInt(params) || 1))
        } else if (cmd === "B") {
          cy = Math.min(height - 1, cy + (parseInt(params) || 1))
        } else if (cmd === "C") {
          cx = Math.min(width - 1, cx + (parseInt(params) || 1))
        } else if (cmd === "D") {
          cx = Math.max(0, cx - (parseInt(params) || 1))
        } else if (cmd === "G") {
          cx = Math.max(0, (parseInt(params) || 1) - 1)
        } else if (cmd === "J") {
          if (params === "2") {
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) screen[y]![x] = " "
          }
        }
        // Skip SGR (m), DEC modes (h/l), etc.
      } else if (ansi[i + 1] === "]") {
        i += 2
        while (i < ansi.length) {
          if (ansi[i] === "\x1b" && ansi[i + 1] === "\\") {
            i += 2
            break
          }
          if (ansi[i] === "\x07") {
            i++
            break
          }
          i++
        }
      } else {
        i += 2
      }
    } else if (ansi[i] === "\r") {
      cx = 0
      i++
    } else if (ansi[i] === "\n") {
      cy = Math.min(height - 1, cy + 1)
      i++
    } else {
      if (cy < height && cx < width) {
        screen[cy]![cx] = ansi[i]!
        cx++
      }
      i++
    }
  }
  return screen
}

/**
 * Extract SGR background colors from ANSI output.
 * Returns a grid of bg color strings (e.g., "48;2;51;51;51" or "49" or "").
 */
function replayAnsiBg(width: number, height: number, ansi: string): string[][] {
  const screen: string[][] = Array.from({ length: height }, () => Array(width).fill(""))
  let cx = 0
  let cy = 0
  let currentBg = ""
  let i = 0

  while (i < ansi.length) {
    if (ansi[i] === "\x1b") {
      if (ansi[i + 1] === "[") {
        i += 2
        let params = ""
        while (
          i < ansi.length &&
          ((ansi[i]! >= "0" && ansi[i]! <= "9") || ansi[i] === ";" || ansi[i] === "?" || ansi[i] === ":")
        ) {
          params += ansi[i]
          i++
        }
        const cmd = ansi[i]
        i++
        if (cmd === "m") {
          // Parse SGR codes
          if (params === "0" || params === "") {
            currentBg = ""
          } else {
            const codes = params.split(";")
            for (let ci = 0; ci < codes.length; ci++) {
              const code = codes[ci]!
              if (code === "0") currentBg = ""
              else if (code === "49") currentBg = ""
              else if (code === "48") {
                // 48;2;r;g;b or 48;5;n
                if (codes[ci + 1] === "2") {
                  currentBg = `48;2;${codes[ci + 2]};${codes[ci + 3]};${codes[ci + 4]}`
                  ci += 4
                } else if (codes[ci + 1] === "5") {
                  currentBg = `48;5;${codes[ci + 2]}`
                  ci += 2
                }
              }
            }
          }
        } else if (cmd === "H") {
          if (params === "") {
            cx = 0
            cy = 0
          } else {
            const parts = params.split(";")
            cy = Math.max(0, (parseInt(parts[0]!) || 1) - 1)
            cx = Math.max(0, (parseInt(parts[1]!) || 1) - 1)
          }
        } else if (cmd === "K") {
          // EL clears with current bg
        } else if (cmd === "A") {
          cy = Math.max(0, cy - (parseInt(params) || 1))
        } else if (cmd === "B") {
          cy = Math.min(height - 1, cy + (parseInt(params) || 1))
        } else if (cmd === "C") {
          cx = Math.min(width - 1, cx + (parseInt(params) || 1))
        } else if (cmd === "D") {
          cx = Math.max(0, cx - (parseInt(params) || 1))
        } else if (cmd === "G") {
          cx = Math.max(0, (parseInt(params) || 1) - 1)
        } else if (cmd === "J") {
          if (params === "2") {
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) screen[y]![x] = ""
          }
        }
      } else if (ansi[i + 1] === "]") {
        i += 2
        while (i < ansi.length) {
          if (ansi[i] === "\x1b" && ansi[i + 1] === "\\") {
            i += 2
            break
          }
          if (ansi[i] === "\x07") {
            i++
            break
          }
          i++
        }
      } else {
        i += 2
      }
    } else if (ansi[i] === "\r") {
      cx = 0
      i++
    } else if (ansi[i] === "\n") {
      cy = Math.min(height - 1, cy + 1)
      i++
    } else {
      if (cy < height && cx < width) {
        screen[cy]![cx] = currentBg
        cx++
      }
      i++
    }
  }
  return screen
}

describe("diffBuffers true color handling", () => {
  test("detects true color background changes between renders", () => {
    const cols = 40
    const rows = 5
    const render = createRenderer({ cols, rows })

    // Component with true color backgrounds that change
    function ColorBox({ bg }: { bg: string }) {
      return (
        <Box width={40} height={5}>
          <Box backgroundColor={bg} width={20} height={3}>
            <Text>Hello World</Text>
          </Box>
        </Box>
      )
    }

    // First render with one true color bg
    const app = render(<ColorBox bg="#333333" />)
    const buf1 = app.lastBuffer()!

    // Change to a different true color bg
    app.rerender(<ColorBox bg="#666666" />)
    const buf2 = app.lastBuffer()!

    // Get incremental ANSI output
    const incrAnsi = outputPhase(buf1, buf2, "fullscreen")

    // Get fresh ANSI output
    const freshAnsi = outputPhase(null, buf2, "fullscreen")

    // Both should be equivalent when replayed
    const prevAnsi = outputPhase(null, buf1, "fullscreen")
    const screenIncr = replayAnsiChars(cols, rows, prevAnsi + incrAnsi)
    const screenFresh = replayAnsiChars(cols, rows, freshAnsi)

    // Characters should match
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (screenIncr[y]![x] !== screenFresh[y]![x]) {
          expect.fail(`Character mismatch at (${x},${y}): incr='${screenIncr[y]![x]}' fresh='${screenFresh[y]![x]}'`)
        }
      }
    }

    // The incremental output should NOT be empty — colors changed
    expect(incrAnsi.length).toBeGreaterThan(0)
  })

  test("detects true color fg changes between renders", () => {
    const cols = 40
    const rows = 3
    const render = createRenderer({ cols, rows })

    function ColorText({ color }: { color: string }) {
      return (
        <Box width={40} height={3}>
          <Text color={color}>Colored text here</Text>
        </Box>
      )
    }

    const app = render(<ColorText color="#ff0000" />)
    const buf1 = app.lastBuffer()!

    app.rerender(<ColorText color="#00ff00" />)
    const buf2 = app.lastBuffer()!

    const incrAnsi = outputPhase(buf1, buf2, "fullscreen")

    // The incremental output must not be empty
    expect(incrAnsi.length).toBeGreaterThan(0)

    // Verify the ANSI output contains the new color
    expect(incrAnsi).toContain("38;2;0;255;0")
  })

  test("detects true color bg changes when only RGB differs (same packed metadata)", () => {
    const cols = 30
    const rows = 3
    const render = createRenderer({ cols, rows })

    // Two boxes with true color bg — packed metadata identical (both have true color flag)
    function TwoColorBox({ bg1, bg2 }: { bg1: string; bg2: string }) {
      return (
        <Box flexDirection="row" width={30} height={3}>
          <Box backgroundColor={bg1} width={15} height={3}>
            <Text>Left</Text>
          </Box>
          <Box backgroundColor={bg2} width={15} height={3}>
            <Text>Right</Text>
          </Box>
        </Box>
      )
    }

    // Both start with one set of true colors
    const app = render(<TwoColorBox bg1="#111111" bg2="#222222" />)
    const buf1 = app.lastBuffer()!

    // Swap the colors — chars stay the same, packed metadata stays the same
    // (both boxes still have true color bg flag), only the RGB values change
    app.rerender(<TwoColorBox bg1="#222222" bg2="#111111" />)
    const buf2 = app.lastBuffer()!

    // This MUST produce diff output — the colors changed!
    const incrAnsi = outputPhase(buf1, buf2, "fullscreen")
    expect(incrAnsi.length).toBeGreaterThan(0)

    // Verify incremental matches fresh
    const freshAnsi = outputPhase(null, buf2, "fullscreen")
    const prevAnsi = outputPhase(null, buf1, "fullscreen")
    const screenIncr = replayAnsiBg(cols, rows, prevAnsi + incrAnsi)
    const screenFresh = replayAnsiBg(cols, rows, freshAnsi)

    // Background colors should match between incremental and fresh
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (screenIncr[y]![x] !== screenFresh[y]![x]) {
          expect.fail(`Background mismatch at (${x},${y}): incr='${screenIncr[y]![x]}' fresh='${screenFresh[y]![x]}'`)
        }
      }
    }
  })

  test("accumulating incremental output matches fresh over multiple true color changes", () => {
    const cols = 30
    const rows = 3
    const render = createRenderer({ cols, rows })

    const colors = ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"]

    function StyledBox({ colorIdx }: { colorIdx: number }) {
      return (
        <Box width={30} height={3}>
          <Box backgroundColor={colors[colorIdx % colors.length]} width={20} height={3}>
            <Text color={colors[(colorIdx + 3) % colors.length]}>Content</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<StyledBox colorIdx={0} />)
    let prevBuf = app.lastBuffer()!
    let accumulatedAnsi = outputPhase(null, prevBuf, "fullscreen")

    for (let i = 1; i < 8; i++) {
      app.rerender(<StyledBox colorIdx={i} />)
      const newBuf = app.lastBuffer()!

      const incrAnsi = outputPhase(prevBuf, newBuf, "fullscreen")
      accumulatedAnsi += incrAnsi
      prevBuf = newBuf

      // Verify accumulated result matches fresh render
      const freshAnsi = outputPhase(null, newBuf, "fullscreen")
      const screenIncr = replayAnsiChars(cols, rows, accumulatedAnsi)
      const screenFresh = replayAnsiChars(cols, rows, freshAnsi)

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (screenIncr[y]![x] !== screenFresh[y]![x]) {
            expect.fail(
              `Mismatch at (${x},${y}) after step ${i}: incr='${screenIncr[y]![x]}' fresh='${screenFresh[y]![x]}'`,
            )
          }
        }
      }
    }
  })
})
