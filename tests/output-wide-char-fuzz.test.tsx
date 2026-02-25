/**
 * Fuzz tests for wide character handling in the output phase.
 *
 * These tests catch:
 * - Cursor drift from missing/corrupted continuation cells
 * - Wide→narrow and narrow→wide transition bugs in diffBuffers
 * - Container boundary interactions where buffer.fill() overwrites continuation
 * - Accumulated drift across multiple incremental renders
 *
 * All verification uses replayAnsiWithStyles (the same virtual terminal used
 * by INKX_STRICT_OUTPUT) which correctly handles wide char cursor advancement.
 */
import { describe, test, expect } from "vitest"
import { TerminalBuffer } from "../src/buffer.js"
import { outputPhase } from "../src/pipeline/output-phase.js"
import { replayAnsiWithStyles } from "../src/pipeline/output-phase.js"
import { createRenderer } from "../tests/setup.js"
import React, { useState } from "react"
import { Box, Text, useInput } from "../src/index.js"

// Deterministic PRNG for reproducible fuzz seeds
function createRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/** Compare two virtual terminal screens character-by-character. */
function assertScreensMatch(
  incr: ReturnType<typeof replayAnsiWithStyles>,
  fresh: ReturnType<typeof replayAnsiWithStyles>,
  width: number,
  height: number,
  context: string,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ic = incr[y]![x]!
      const fc = fresh[y]![x]!
      if (ic.char !== fc.char) {
        // Build a row visualization for debugging
        const incrRow = incr[y]!.map((c) => c.char).join("")
        const freshRow = fresh[y]!.map((c) => c.char).join("")
        expect.fail(
          `${context}: char mismatch at (${x},${y}): ` +
            `incr='${ic.char}' fresh='${fc.char}'\n` +
            `  incr row:  "${incrRow}"\n` +
            `  fresh row: "${freshRow}"`,
        )
      }
    }
  }
}

// ============================================================================
// Low-level: corrupted continuation cells (defense-in-depth tests)
// ============================================================================

describe("Wide char with missing continuation (defense-in-depth)", () => {
  test("bufferToAnsi handles wide char without continuation at x+1", () => {
    // Simulate the bug: wide char at col 0, but col 1 has continuation=false
    // (as if buffer.fill() overwrote it). bufferToAnsi should still produce
    // correct output by skipping col 1 unconditionally after a wide char.
    const buffer = new TerminalBuffer(10, 1)
    buffer.setCell(0, 0, { char: "廈", wide: true })
    // Deliberately NOT setting continuation at col 1 — simulating the bug
    buffer.setCell(1, 0, { char: " " }) // no continuation flag
    buffer.setCell(2, 0, { char: "A" })
    buffer.setCell(3, 0, { char: "B" })

    const ansi = outputPhase(null, buffer)
    const screen = replayAnsiWithStyles(10, 1, ansi)

    // '廈' at col 0, continuation at col 1, 'A' at col 2, 'B' at col 3
    expect(screen[0]![0]!.char).toBe("廈")
    expect(screen[0]![2]!.char).toBe("A")
    expect(screen[0]![3]!.char).toBe("B")
  })

  test("bufferToAnsi: multiple wide chars with missing continuations", () => {
    const buffer = new TerminalBuffer(20, 1)
    // Three CJK chars, none with continuation set (worst case)
    buffer.setCell(0, 0, { char: "廈", wide: true })
    buffer.setCell(1, 0, { char: " " }) // missing continuation
    buffer.setCell(2, 0, { char: "門", wide: true })
    buffer.setCell(3, 0, { char: " " }) // missing continuation
    buffer.setCell(4, 0, { char: "市", wide: true })
    buffer.setCell(5, 0, { char: " " }) // missing continuation
    buffer.setCell(6, 0, { char: "X" })
    buffer.setCell(7, 0, { char: "Y" })

    const ansi = outputPhase(null, buffer)
    const screen = replayAnsiWithStyles(20, 1, ansi)

    // Without the fix, 'X' would appear at col 9 (drifted by 3)
    // With the fix, 'X' at col 6 and 'Y' at col 7
    expect(screen[0]![6]!.char).toBe("X")
    expect(screen[0]![7]!.char).toBe("Y")
  })

  test("bufferToAnsi: wide char at end of row without continuation", () => {
    const buffer = new TerminalBuffer(6, 1)
    buffer.setCell(0, 0, { char: "A" })
    buffer.setCell(1, 0, { char: "B" })
    buffer.setCell(2, 0, { char: "C" })
    buffer.setCell(3, 0, { char: "D" })
    buffer.setCell(4, 0, { char: "廈", wide: true })
    // col 5 is the last column — no continuation set
    buffer.setCell(5, 0, { char: " " })

    const ansi = outputPhase(null, buffer)
    const screen = replayAnsiWithStyles(6, 1, ansi)

    // Wide char at col 4 should be rendered, no drift on 'A'-'D'
    expect(screen[0]![0]!.char).toBe("A")
    expect(screen[0]![1]!.char).toBe("B")
    expect(screen[0]![2]!.char).toBe("C")
    expect(screen[0]![3]!.char).toBe("D")
    expect(screen[0]![4]!.char).toBe("廈")
  })

  test("diffBuffers: wide→narrow transition emits continuation position", () => {
    // Prev: wide char at col 0 with proper continuation
    const prev = new TerminalBuffer(10, 1)
    prev.setCell(0, 0, { char: "廈", wide: true })
    prev.setCell(1, 0, { char: "", continuation: true })
    prev.setCell(2, 0, { char: "X" })

    // Next: narrow chars replace the wide char
    const next = new TerminalBuffer(10, 1)
    next.setCell(0, 0, { char: "a" })
    next.setCell(1, 0, { char: "b" })
    next.setCell(2, 0, { char: "X" }) // unchanged

    // Fresh prev → incremental diff → verify against fresh next
    const freshPrev = outputPhase(null, prev)
    const incrAnsi = outputPhase(prev, next)
    const screenIncr = replayAnsiWithStyles(10, 1, freshPrev + incrAnsi)
    const screenFresh = replayAnsiWithStyles(10, 1, outputPhase(null, next))

    assertScreensMatch(screenIncr, screenFresh, 10, 1, "wide→narrow transition")
  })

  test("diffBuffers: narrow→wide transition", () => {
    const prev = new TerminalBuffer(10, 1)
    prev.setCell(0, 0, { char: "a" })
    prev.setCell(1, 0, { char: "b" })
    prev.setCell(2, 0, { char: "X" })

    const next = new TerminalBuffer(10, 1)
    next.setCell(0, 0, { char: "廈", wide: true })
    next.setCell(1, 0, { char: "", continuation: true })
    next.setCell(2, 0, { char: "X" }) // unchanged

    const freshPrev = outputPhase(null, prev)
    const incrAnsi = outputPhase(prev, next)
    const screenIncr = replayAnsiWithStyles(10, 1, freshPrev + incrAnsi)
    const screenFresh = replayAnsiWithStyles(10, 1, outputPhase(null, next))

    assertScreensMatch(screenIncr, screenFresh, 10, 1, "narrow→wide transition")
  })

  test("diffBuffers: wide char replaced by different wide char", () => {
    const prev = new TerminalBuffer(10, 1)
    prev.setCell(0, 0, { char: "廈", wide: true })
    prev.setCell(1, 0, { char: "", continuation: true })
    prev.setCell(2, 0, { char: "Z" })

    const next = new TerminalBuffer(10, 1)
    next.setCell(0, 0, { char: "門", wide: true })
    next.setCell(1, 0, { char: "", continuation: true })
    next.setCell(2, 0, { char: "Z" }) // unchanged

    const freshPrev = outputPhase(null, prev)
    const incrAnsi = outputPhase(prev, next)
    const screenIncr = replayAnsiWithStyles(10, 1, freshPrev + incrAnsi)
    const screenFresh = replayAnsiWithStyles(10, 1, outputPhase(null, next))

    assertScreensMatch(screenIncr, screenFresh, 10, 1, "wide→wide transition")
  })
})

// ============================================================================
// Container boundary simulation
// ============================================================================

describe("Container boundary: fill overwrites continuation", () => {
  test("buffer.fill() overwrites continuation, bufferToAnsi still correct", () => {
    // Simulate: render CJK text, then adjacent container does fill()
    const buffer = new TerminalBuffer(20, 1)

    // Render "廈門" starting at col 0 (properly: wide+continuation pairs)
    buffer.setCell(0, 0, { char: "廈", wide: true })
    buffer.setCell(1, 0, { char: "", continuation: true })
    buffer.setCell(2, 0, { char: "門", wide: true })
    buffer.setCell(3, 0, { char: "", continuation: true })

    // Adjacent container at col 4-9 does a fill (e.g., clearNodeRegion)
    // This fill accidentally reaches back to col 3, overwriting continuation
    buffer.fill(3, 0, 7, 1, { char: " ", bg: null })

    // Now col 3 has continuation=false (overwritten by fill)
    // bufferToAnsi should still handle this via unconditional x++ after wide

    const ansi = outputPhase(null, buffer)
    const screen = replayAnsiWithStyles(20, 1, ansi)

    // '廈' at col 0 should be there
    expect(screen[0]![0]!.char).toBe("廈")
    // '門' at col 2 should be there (its continuation at 3 was overwritten
    // but bufferToAnsi skips col 3 unconditionally)
    expect(screen[0]![2]!.char).toBe("門")
  })

  test("incremental diff after fill overwrites continuation", () => {
    // Frame 1: proper CJK text with correct continuation
    const prev = new TerminalBuffer(20, 1)
    prev.setCell(0, 0, { char: "廈", wide: true })
    prev.setCell(1, 0, { char: "", continuation: true })
    prev.setCell(2, 0, { char: "門", wide: true })
    prev.setCell(3, 0, { char: "", continuation: true })
    for (let x = 4; x < 20; x++) prev.setCell(x, 0, { char: " " })

    // Frame 2: same CJK text, but adjacent container fill overwrote col 3
    const next = new TerminalBuffer(20, 1)
    next.setCell(0, 0, { char: "廈", wide: true })
    next.setCell(1, 0, { char: "", continuation: true })
    next.setCell(2, 0, { char: "門", wide: true })
    // Col 3: fill overwrote continuation
    next.setCell(3, 0, { char: " " }) // continuation=false!
    // Rest: adjacent container content
    next.setCell(4, 0, { char: "H" })
    next.setCell(5, 0, { char: "i" })
    for (let x = 6; x < 20; x++) next.setCell(x, 0, { char: " " })

    const freshPrev = outputPhase(null, prev)
    const incrAnsi = outputPhase(prev, next)
    const screenIncr = replayAnsiWithStyles(20, 1, freshPrev + incrAnsi)
    const screenFresh = replayAnsiWithStyles(20, 1, outputPhase(null, next))

    assertScreensMatch(screenIncr, screenFresh, 20, 1, "fill overwrites continuation")
  })
})

// ============================================================================
// Fuzz: random wide/narrow character mutations
// ============================================================================

// Character pools for fuzz testing
const CJK_CHARS = "廈門市報表清理項目名稱計劃備份任務日常子數據"
const HIRAGANA = "あいうえおかきくけこさしすせそたちつてと"
const KATAKANA = "アイウエオカキクケコサシスセソタチツテト"
const HANGUL = "가나다라마바사아자차카타파하"
const LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const EMOJI_WIDE = ["🌍", "🎉", "🎈", "🎊", "🌸", "🚀", "💡", "🔥", "⭐", "🎯"]

/** Pick a random character from the pool — wide or narrow. */
function randomChar(rng: () => number, wideChance: number): { char: string; wide: boolean } {
  if (rng() < wideChance) {
    // Wide character
    const pool = rng() < 0.5 ? CJK_CHARS : rng() < 0.5 ? HANGUL : rng() < 0.5 ? HIRAGANA : KATAKANA
    const idx = Math.floor(rng() * pool.length)
    return { char: pool[idx]!, wide: true }
  }
  // Narrow character
  const idx = Math.floor(rng() * LATIN.length)
  return { char: LATIN[idx]!, wide: false }
}

/** Fill a buffer row with random wide/narrow chars, respecting column widths. */
function fillRowRandom(buffer: TerminalBuffer, y: number, rng: () => number, wideChance: number): void {
  let x = 0
  while (x < buffer.width) {
    const { char, wide } = randomChar(rng, wideChance)
    if (wide && x + 1 < buffer.width) {
      buffer.setCell(x, y, { char, wide: true })
      buffer.setCell(x + 1, y, { char: "", continuation: true })
      x += 2
    } else {
      // When a wide char doesn't fit (last column), use a narrow Latin char
      // instead. A CJK char with wide=false is inconsistent — the terminal
      // still renders it as 2 columns, causing cursor drift.
      const narrowChar = wide
        ? LATIN[Math.floor(rng() * LATIN.length)]!
        : char
      buffer.setCell(x, y, { char: narrowChar, wide: false })
      x++
    }
  }
}

describe("Wide char fuzz: random mutations with virtual terminal replay", () => {
  const seeds = [42, 123, 7777, 99999, 314159, 271828, 161803, 1337, 8675309, 5551212]

  for (const seed of seeds) {
    test(`seed ${seed}: random wide/narrow transitions`, () => {
      const rng = createRng(seed)
      const cols = 30 + Math.floor(rng() * 30) // 30-59 columns
      const rows = 3 + Math.floor(rng() * 5) // 3-7 rows
      const steps = 5 + Math.floor(rng() * 10) // 5-14 mutation steps

      // Create initial buffer with ~30% wide chars
      const buf1 = new TerminalBuffer(cols, rows)
      for (let y = 0; y < rows; y++) {
        fillRowRandom(buf1, y, rng, 0.3)
      }

      let prevBuf = buf1
      let accumulatedAnsi = outputPhase(null, prevBuf)

      for (let step = 0; step < steps; step++) {
        // Create next buffer with different wide/narrow mix
        const nextBuf = new TerminalBuffer(cols, rows)
        const wideChance = rng() * 0.6 // 0-60% wide chars per step
        for (let y = 0; y < rows; y++) {
          if (rng() < 0.3) {
            // 30% chance: keep row unchanged (tests skip optimization)
            for (let x = 0; x < cols; x++) {
              const cell = prevBuf.getCell(x, y)
              nextBuf.setCell(x, y, cell)
            }
          } else {
            fillRowRandom(nextBuf, y, rng, wideChance)
          }
        }

        // Apply incremental diff
        const incrAnsi = outputPhase(prevBuf, nextBuf)
        accumulatedAnsi += incrAnsi

        // Verify: accumulated incremental matches fresh render
        const freshAnsi = outputPhase(null, nextBuf)
        const screenIncr = replayAnsiWithStyles(cols, rows, accumulatedAnsi)
        const screenFresh = replayAnsiWithStyles(cols, rows, freshAnsi)

        assertScreensMatch(screenIncr, screenFresh, cols, rows, `seed=${seed} step=${step}`)

        prevBuf = nextBuf
      }
    })
  }
})

describe("Wide char fuzz: container boundary simulation", () => {
  const seeds = [42, 789, 55555, 271828, 999]

  for (const seed of seeds) {
    test(`seed ${seed}: adjacent containers with fill()`, () => {
      const rng = createRng(seed)
      const cols = 40
      const rows = 5
      const steps = 8

      // Two "containers": left (cols 0-19) and right (cols 20-39)
      const leftWidth = 20
      const rightWidth = 20

      function createFrame(): TerminalBuffer {
        const buf = new TerminalBuffer(cols, rows)

        for (let y = 0; y < rows; y++) {
          // Fill left container with CJK text (high wide chance)
          let x = 0
          while (x < leftWidth) {
            const { char, wide } = randomChar(rng, 0.5)
            if (wide && x + 1 < leftWidth) {
              buf.setCell(x, y, { char, wide: true })
              buf.setCell(x + 1, y, { char: "", continuation: true })
              x += 2
            } else {
              // If a wide char doesn't fit (only 1 col left), use a narrow
              // Latin char instead. Storing a CJK char with wide=false would
              // create an inconsistent buffer (terminal renders it as 2 cols).
              const narrowChar = wide
                ? LATIN[Math.floor(rng() * LATIN.length)]!
                : char
              buf.setCell(x, y, { char: narrowChar, wide: false })
              x++
            }
          }

          // Right container does a fill — this can overwrite the last
          // continuation cell of the left container if a wide char ends
          // at the boundary (col 18-19)
          const fillBg = rng() < 0.5 ? "red" : null
          buf.fill(leftWidth, y, rightWidth, 1, { char: " ", bg: fillBg })

          // Then fill right container with Latin text
          x = leftWidth
          while (x < cols) {
            const idx = Math.floor(rng() * LATIN.length)
            buf.setCell(x, y, { char: LATIN[idx]!, wide: false })
            x++
          }
        }

        return buf
      }

      let prevBuf = createFrame()
      let accumulatedAnsi = outputPhase(null, prevBuf)

      for (let step = 0; step < steps; step++) {
        const nextBuf = createFrame()

        const incrAnsi = outputPhase(prevBuf, nextBuf)
        accumulatedAnsi += incrAnsi

        const freshAnsi = outputPhase(null, nextBuf)
        const screenIncr = replayAnsiWithStyles(cols, rows, accumulatedAnsi)
        const screenFresh = replayAnsiWithStyles(cols, rows, freshAnsi)

        assertScreensMatch(screenIncr, screenFresh, cols, rows, `seed=${seed} step=${step}`)

        prevBuf = nextBuf
      }
    })
  }
})

// ============================================================================
// Component-level fuzz: React components with CJK text and rerenders
// ============================================================================

describe("Component-level: CJK text with incremental rendering", () => {
  test("kanban board with CJK column headers and navigation", async () => {
    const render = createRenderer({ cols: 80, rows: 15 })

    const headers = ["待處理", "進行中", "已完成", "Column 4"]
    const cards = [
      ["廈門大廈報表", "數據備份計劃", "日常任務清理"],
      ["東京タワー展望", "大阪城見学", "Kyoto visit"],
      ["서울특별시", "부산광역시", "제주도여행"],
      ["Task A", "Task B", "Task C"],
    ]

    function Board({ cursor }: { cursor: number }) {
      return (
        <Box flexDirection="row" width={80}>
          {headers.map((header, i) => (
            <Box key={i} width={20} flexDirection="column">
              <Text bold>{header}</Text>
              {cards[i]!.map((card, j) => (
                <Box
                  key={j}
                  backgroundColor={cursor === i * 3 + j ? "cyan" : undefined}
                  width={18}
                >
                  <Text>{card}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<Board cursor={0} />)
    expect(app.text).toContain("待處理")
    expect(app.text).toContain("廈門大廈報表")

    // Navigate cursor through all cards (12 positions)
    for (let i = 1; i < 12; i++) {
      app.rerender(<Board cursor={i} />)
      // Each rerender triggers an incremental diff — INKX_STRICT_OUTPUT
      // verifies the ANSI output matches fresh render
      expect(app.text).toContain(headers[Math.floor(i / 3)]!)
    }
  })

  test("toggling between CJK and Latin text in adjacent containers", async () => {
    const render = createRenderer({ cols: 60, rows: 5 })

    function App({ lang }: { lang: number }) {
      const texts = [
        "項目名稱：廈門大廈報表清理",
        "プロジェクト：東京タワー",
        "프로젝트：서울특별시 개발",
        "Project: Hello World Test",
      ]
      return (
        <Box flexDirection="row" width={60}>
          <Box width={30}>
            <Text>{texts[lang % texts.length]}</Text>
          </Box>
          <Box width={30} borderStyle="single">
            <Text>Status: {lang}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App lang={0} />)
    // Cycle through all languages multiple times
    for (let i = 1; i <= 12; i++) {
      app.rerender(<App lang={i} />)
    }
    // If cursor drift occurred, INKX_STRICT_OUTPUT would have thrown
    expect(app.text).toContain("Status: 12")
  })

  test("CJK text with background color changes", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })

    const colors = ["red", "blue", "green", "yellow", "cyan", "magenta"]

    function App({ step }: { step: number }) {
      return (
        <Box flexDirection="row" width={40}>
          <Box width={20} backgroundColor={colors[step % colors.length]}>
            <Text>廈門市報表清理</Text>
          </Box>
          <Box width={20} backgroundColor={colors[(step + 1) % colors.length]}>
            <Text>right side</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App step={0} />)
    for (let i = 1; i <= 10; i++) {
      app.rerender(<App step={i} />)
    }
    expect(app.text).toContain("廈門市")
    expect(app.text).toContain("right side")
  })

  test("CJK text appearing and disappearing", async () => {
    const render = createRenderer({ cols: 50, rows: 5 })

    function App({ showCJK }: { showCJK: boolean }) {
      return (
        <Box flexDirection="row" width={50}>
          <Box width={25}>
            <Text>{showCJK ? "廈門大廈報表清理任務" : "plain text here no wide"}</Text>
          </Box>
          <Box width={25}>
            <Text>fixed right content</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App showCJK={true} />)

    // Toggle CJK on/off rapidly — each toggle is a wide↔narrow transition
    for (let i = 0; i < 10; i++) {
      app.rerender(<App showCJK={i % 2 === 0} />)
    }
    expect(app.text).toContain("fixed right content")
  })

  test("emoji and CJK mixed with scrolling content", async () => {
    const render = createRenderer({ cols: 60, rows: 10 })

    function App({ offset }: { offset: number }) {
      const items = [
        "🌍 廈門大廈",
        "🎉 東京タワー",
        "🚀 서울특별시",
        "💡 Project Alpha",
        "🔥 Beta Release",
        "⭐ Gamma Test",
        "🎯 Delta Plan",
        "🌸 Epsilon",
      ]

      return (
        <Box flexDirection="column" width={60}>
          {items.slice(offset, offset + 5).map((item, i) => (
            <Box key={i} flexDirection="row">
              <Box width={30}>
                <Text>{item}</Text>
              </Box>
              <Box width={30}>
                <Text>Row {offset + i}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<App offset={0} />)
    // Scroll through the list
    for (let i = 1; i <= 3; i++) {
      app.rerender(<App offset={i} />)
    }
    // Scroll back
    for (let i = 2; i >= 0; i--) {
      app.rerender(<App offset={i} />)
    }
    expect(app.text).toContain("廈門大廈")
  })

  test("three-column layout with CJK, emoji, and borders", async () => {
    const render = createRenderer({ cols: 90, rows: 8 })

    function App({ active }: { active: number }) {
      const cols = [
        { header: "待處理", items: ["報表清理", "數據備份"] },
        { header: "🚀 Active", items: ["東京タワー", "서울 trip"] },
        { header: "完成", items: ["已完成任務", "Done task"] },
      ]

      return (
        <Box flexDirection="row" width={90}>
          {cols.map((col, i) => (
            <Box
              key={i}
              width={30}
              flexDirection="column"
              borderStyle={i === active ? "double" : "single"}
            >
              <Text bold>{col.header}</Text>
              {col.items.map((item, j) => (
                <Text key={j}>
                  {i === active && j === 0 ? "> " : "  "}
                  {item}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<App active={0} />)
    // Move active column through all three
    for (let i = 0; i < 6; i++) {
      app.rerender(<App active={i % 3} />)
    }
    expect(app.text).toContain("待處理")
    expect(app.text).toContain("完成")
  })
})

// ============================================================================
// Edge cases: wide chars at exact column boundaries
// ============================================================================

describe("Wide char boundary edge cases", () => {
  test("wide char exactly at container boundary (last 2 cols)", () => {
    const render = createRenderer({ cols: 40, rows: 3 })

    // Left container width=20, CJK text fills to cols 18-19 (last 2 cols)
    // '項目名稱：廈門大廈報' = 10 CJK chars = 20 display cols
    const app = render(
      <Box flexDirection="row" width={40}>
        <Box width={20}>
          <Text>項目名稱廈門大廈報表</Text>
        </Box>
        <Box width={20}>
          <Text>right side content</Text>
        </Box>
      </Box>,
    )

    expect(app.text).toContain("right side content")
  })

  test("wide char would overflow container (truncated at boundary)", () => {
    const render = createRenderer({ cols: 40, rows: 3 })

    // 11 CJK chars = 22 display cols, but container is only 20 wide
    // Last char should be truncated or not rendered
    const app = render(
      <Box flexDirection="row" width={40}>
        <Box width={20}>
          <Text>項目名稱廈門大廈報表清</Text>
        </Box>
        <Box width={20}>
          <Text>right side</Text>
        </Box>
      </Box>,
    )

    // Right side should still be at the correct position
    expect(app.text).toContain("right side")
  })

  test("interleaved wide and narrow at column boundary", async () => {
    const render = createRenderer({ cols: 40, rows: 3 })

    function App({ step }: { step: number }) {
      // Alternate between text that ends with wide char at boundary
      // and text that ends with narrow char
      const texts = [
        "ABCDEFGH項目名稱廈門", // 8 narrow + 6 wide = 8+12 = 20 cols
        "ABCDEFGHIJKLMNOPQRST", // 20 narrow = 20 cols
        "項目名稱廈門大廈報表", // 10 wide = 20 cols
        "ABCDEFGHIJKLMNOPQRSt", // 20 narrow
      ]
      return (
        <Box flexDirection="row" width={40}>
          <Box width={20}>
            <Text>{texts[step % texts.length]}</Text>
          </Box>
          <Box width={20}>
            <Text>right side {step}</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App step={0} />)
    for (let i = 1; i <= 8; i++) {
      app.rerender(<App step={i} />)
    }
    expect(app.text).toContain("right side 8")
  })

  test("single wide char surrounded by narrow in multi-row layout", async () => {
    const render = createRenderer({ cols: 40, rows: 8 })

    function App({ cursor }: { cursor: number }) {
      const rows = [
        "Hello 廈 World",
        "Test 門 Data",
        "foo bar baz qux",
        "x 報 y 表 z",
      ]
      return (
        <Box flexDirection="column" width={40}>
          {rows.map((row, i) => (
            <Box key={i} backgroundColor={cursor === i ? "blue" : undefined}>
              <Text>{row}</Text>
            </Box>
          ))}
        </Box>
      )
    }

    const app = render(<App cursor={0} />)
    for (let i = 0; i < 8; i++) {
      app.rerender(<App cursor={i % 4} />)
    }
    expect(app.text).toContain("Hello")
  })
})
