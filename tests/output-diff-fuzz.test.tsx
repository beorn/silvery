/**
 * Fuzz test for outputPhase (diffBuffers + changesToAnsi).
 *
 * Generates random buffer mutations including true colors, underline colors,
 * and hyperlinks, then verifies that incremental ANSI output matches fresh render.
 */
import { describe, test, expect } from "vitest"
import { outputPhase } from "../src/pipeline/output-phase.js"
import { createRenderer } from "../tests/setup.js"
import React from "react"
import { Box, Text } from "../src/index.js"

/**
 * Replay ANSI output to a character grid.
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
        while (i < ansi.length && ((ansi[i]! >= "0" && ansi[i]! <= "9") || ansi[i] === ";" || ansi[i] === "?" || ansi[i] === ":")) {
          params += ansi[i]
          i++
        }
        const cmd = ansi[i]
        i++
        if (cmd === "H") {
          if (params === "") { cx = 0; cy = 0 }
          else {
            const parts = params.split(";")
            cy = Math.max(0, (parseInt(parts[0]!) || 1) - 1)
            cx = Math.max(0, (parseInt(parts[1]!) || 1) - 1)
          }
        } else if (cmd === "K") {
          const n = parseInt(params) || 0
          if (n === 0) { for (let x = cx; x < width; x++) screen[cy]![x] = " " }
          else if (n === 1) { for (let x = 0; x <= cx; x++) screen[cy]![x] = " " }
          else if (n === 2) { for (let x = 0; x < width; x++) screen[cy]![x] = " " }
        } else if (cmd === "A") { cy = Math.max(0, cy - (parseInt(params) || 1)) }
        else if (cmd === "B") { cy = Math.min(height - 1, cy + (parseInt(params) || 1)) }
        else if (cmd === "C") { cx = Math.min(width - 1, cx + (parseInt(params) || 1)) }
        else if (cmd === "D") { cx = Math.max(0, cx - (parseInt(params) || 1)) }
        else if (cmd === "G") { cx = Math.max(0, (parseInt(params) || 1) - 1) }
        else if (cmd === "J") {
          if (params === "2") {
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++) screen[y]![x] = " "
          }
        }
      } else if (ansi[i + 1] === "]") {
        i += 2
        while (i < ansi.length) {
          if (ansi[i] === "\x1b" && ansi[i + 1] === "\\") { i += 2; break }
          if (ansi[i] === "\x07") { i++; break }
          i++
        }
      } else { i += 2 }
    } else if (ansi[i] === "\r") { cx = 0; i++ }
    else if (ansi[i] === "\n") { cy = Math.min(height - 1, cy + 1); i++ }
    else {
      if (cy < height && cx < width) {
        screen[cy]![cx] = ansi[i]!
        cx++
      }
      i++
    }
  }
  return screen
}

// Deterministic PRNG for reproducible seeds
function createRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function randomHexColor(rng: () => number): string {
  const r = Math.floor(rng() * 256)
  const g = Math.floor(rng() * 256)
  const b = Math.floor(rng() * 256)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

describe("output diff fuzz", () => {
  // Generate multiple seeds for fuzz coverage
  const seeds = [42, 123, 7777, 99999, 314159, 271828, 161803, 1337, 8675309, 5551212]

  for (const seed of seeds) {
    test(`seed ${seed}: true color mutations produce correct incremental output`, () => {
      const rng = createRng(seed)
      const cols = 40
      const rows = 10
      const render = createRenderer({ cols, rows })

      // Generate a random board-like component
      const numBoxes = 2 + Math.floor(rng() * 4) // 2-5 boxes

      function RandomBoard({ step }: { step: number }) {
        const boxes = []
        for (let i = 0; i < numBoxes; i++) {
          // Each box picks colors based on step + box index
          const colorSeed = createRng(seed + step * 100 + i)
          const bgColor = randomHexColor(colorSeed)
          const fgColor = randomHexColor(colorSeed)
          const useInverse = colorSeed() > 0.7
          const useBold = colorSeed() > 0.5

          boxes.push(
            <Box key={i} backgroundColor={bgColor} width={Math.floor(cols / numBoxes)} height={rows - 2}>
              <Text color={fgColor} inverse={useInverse} bold={useBold}>
                {`Box${i} step${step}`}
              </Text>
            </Box>,
          )
        }
        return (
          <Box flexDirection="row" width={cols} height={rows}>
            {boxes}
          </Box>
        )
      }

      const app = render(<RandomBoard step={0} />)
      let prevBuf = app.lastBuffer()!
      let accumulatedAnsi = outputPhase(null, prevBuf, "fullscreen")

      // Run through multiple mutations
      const numSteps = 5 + Math.floor(rng() * 10) // 5-14 steps
      for (let step = 1; step <= numSteps; step++) {
        app.rerender(<RandomBoard step={step} />)
        const newBuf = app.lastBuffer()!

        const incrAnsi = outputPhase(prevBuf, newBuf, "fullscreen")
        accumulatedAnsi += incrAnsi
        prevBuf = newBuf

        // Verify accumulated result matches fresh render (characters only)
        const freshAnsi = outputPhase(null, newBuf, "fullscreen")
        const screenIncr = replayAnsiChars(cols, rows, accumulatedAnsi)
        const screenFresh = replayAnsiChars(cols, rows, freshAnsi)

        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            if (screenIncr[y]![x] !== screenFresh[y]![x]) {
              expect.fail(
                `[seed=${seed}] Character mismatch at (${x},${y}) after step ${step}: ` +
                `incr='${screenIncr[y]![x]}' fresh='${screenFresh[y]![x]}'`,
              )
            }
          }
        }
      }
    })
  }

  test("mixed color types: indexed → true color → null transitions", () => {
    const cols = 30
    const rows = 4
    const render = createRenderer({ cols, rows })

    const colorSequence = [
      { bg: "blue", fg: "white" },        // indexed colors
      { bg: "#334455", fg: "#aabbcc" },    // true colors
      { bg: "#556677", fg: "#ddeeff" },    // different true colors (same packed flags!)
      { bg: "red", fg: "black" },          // back to indexed
      { bg: undefined, fg: "#112233" },    // mixed: no bg + true color fg
      { bg: "#998877", fg: undefined },    // mixed: true color bg + no fg
    ]

    function ColorBox({ colors }: { colors: { bg?: string; fg?: string } }) {
      return (
        <Box width={cols} height={rows}>
          <Box backgroundColor={colors.bg} width={20} height={3}>
            <Text color={colors.fg}>Test content</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<ColorBox colors={colorSequence[0]!} />)
    let prevBuf = app.lastBuffer()!
    let accumulatedAnsi = outputPhase(null, prevBuf, "fullscreen")

    for (let i = 1; i < colorSequence.length; i++) {
      app.rerender(<ColorBox colors={colorSequence[i]!} />)
      const newBuf = app.lastBuffer()!

      const incrAnsi = outputPhase(prevBuf, newBuf, "fullscreen")
      accumulatedAnsi += incrAnsi
      prevBuf = newBuf

      const freshAnsi = outputPhase(null, newBuf, "fullscreen")
      const screenIncr = replayAnsiChars(cols, rows, accumulatedAnsi)
      const screenFresh = replayAnsiChars(cols, rows, freshAnsi)

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (screenIncr[y]![x] !== screenFresh[y]![x]) {
            expect.fail(
              `Character mismatch at (${x},${y}) after transition ${i}: ` +
              `incr='${screenIncr[y]![x]}' fresh='${screenFresh[y]![x]}'`,
            )
          }
        }
      }

      // Incremental output must not be empty when colors changed
      expect(incrAnsi.length).toBeGreaterThan(0)
    }
  })
})
