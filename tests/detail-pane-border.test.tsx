/**
 * Regression test: bordered Box with backgroundColor should maintain
 * border fg color AND bg color after children render.
 *
 * The DetailPane in km-tui uses:
 *   <Box borderStyle="single" borderColor="white" backgroundColor="black" paddingX={1}>
 *     ...children...
 *   </Box>
 *
 * Bug: Some right border vertical segments render as black (fg lost)
 * instead of white. Root cause: renderBorder set bg=null (transparent)
 * on border cells while the box's bg fill set bg=0 (explicit black).
 * This bg=null vs bg=0 discrepancy caused ANSI output differences:
 * bg=null emits no background SGR, bg=0 emits explicit \x1b[48;5;0m.
 *
 * Fix: renderBorder now sets bg from the box's backgroundColor, ensuring
 * border cells have consistent bg with the rest of the box.
 */

import { describe, expect, test } from "vitest"
import React from "react"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "inkx/testing"
import { createMutableCell } from "../src/buffer.js"

/** Check all border cells in a bordered box have correct char, fg, and bg */
function checkBorder(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  boxWidth: number,
  boxHeight: number,
  boxX = 0,
  boxY = 0,
  opts: { expectBg?: number | null; expectFg?: number | null } = {},
) {
  const buffer = app.lastBuffer()!
  const cell = createMutableCell()
  const rightBorderX = boxX + boxWidth - 1
  const leftBorderX = boxX
  const expectedFg = opts.expectFg ?? 7
  const expectedBg = opts.expectBg ?? null
  const failures: string[] = []

  // Check right border (side cells, rows between top and bottom border)
  for (let row = boxY + 1; row < boxY + boxHeight - 1; row++) {
    buffer.readCellInto(rightBorderX, row, cell)
    if (cell.char !== "│") {
      failures.push(`right row ${row}: char='${cell.char}' expected='│'`)
    }
    if (cell.fg !== expectedFg) {
      failures.push(`right row ${row}: fg=${JSON.stringify(cell.fg)} expected=${expectedFg}`)
    }
    if (cell.bg !== expectedBg) {
      failures.push(`right row ${row}: bg=${JSON.stringify(cell.bg)} expected=${JSON.stringify(expectedBg)}`)
    }
  }

  // Check left border
  for (let row = boxY + 1; row < boxY + boxHeight - 1; row++) {
    buffer.readCellInto(leftBorderX, row, cell)
    if (cell.char !== "│") {
      failures.push(`left row ${row}: char='${cell.char}' expected='│'`)
    }
    if (cell.fg !== expectedFg) {
      failures.push(`left row ${row}: fg=${JSON.stringify(cell.fg)} expected=${expectedFg}`)
    }
    if (cell.bg !== expectedBg) {
      failures.push(`left row ${row}: bg=${JSON.stringify(cell.bg)} expected=${JSON.stringify(expectedBg)}`)
    }
  }

  if (failures.length > 0) {
    const context: string[] = []
    for (let row = boxY; row < boxY + boxHeight; row++) {
      buffer.readCellInto(rightBorderX - 1, row, cell)
      const leftChar = cell.char
      const leftBg = cell.bg
      buffer.readCellInto(rightBorderX, row, cell)
      context.push(
        `row ${row}: [...|${leftChar} bg=${JSON.stringify(leftBg)}] [${cell.char} fg=${JSON.stringify(cell.fg)} bg=${JSON.stringify(cell.bg)}]`,
      )
    }
    throw new Error(`Border check failed:\n${failures.join("\n")}\n\nRight border context:\n${context.join("\n")}`)
  }
}

describe("detail pane border color", () => {
  test("border cells have correct fg AND bg after initial render", () => {
    const render = createRenderer({ cols: 40, rows: 15 })

    const app = render(
      <Box
        flexDirection="column"
        width={30}
        height={12}
        borderStyle="single"
        borderColor="white"
        backgroundColor="black"
        paddingX={1}
      >
        <Box width={22}>
          <Text bold wrap="wrap">
            Task Title Here
          </Text>
        </Box>
        <Box>
          <Text dimColor>{"─".repeat(20)}</Text>
        </Box>
        <Box flexDirection="row">
          <Text dimColor>Status </Text>
          <Text color="green">Active</Text>
        </Box>
        <Box flexGrow={1} />
        <Box justifyContent="space-between" width={22}>
          <Text dimColor>h/Esc:close</Text>
          <Text dimColor>oi abc</Text>
        </Box>
      </Box>,
    )

    // Border cells should have bg=0 (black, matching the box's backgroundColor)
    checkBorder(app, 30, 12, 0, 0, { expectFg: 7, expectBg: 0 })
  })

  test("border bg matches box backgroundColor after rerender", () => {
    const render = createRenderer({ cols: 40, rows: 15 })

    function App({ text }: { text: string }) {
      return (
        <Box
          flexDirection="column"
          width={30}
          height={12}
          borderStyle="single"
          borderColor="white"
          backgroundColor="black"
          paddingX={1}
        >
          <Box width={22}>
            <Text bold wrap="wrap">
              {text}
            </Text>
          </Box>
          <Box>
            <Text dimColor>{"─".repeat(20)}</Text>
          </Box>
          <Box flexGrow={1} />
          <Box justifyContent="space-between" width={22}>
            <Text dimColor>h/Esc:close</Text>
            <Text dimColor>oi abc</Text>
          </Box>
        </Box>
      )
    }

    const app = render(<App text="Short title" />)
    app.rerender(<App text="A much longer title that will wrap across lines" />)

    checkBorder(app, 30, 12, 0, 0, { expectFg: 7, expectBg: 0 })
  })

  test("border cells without backgroundColor have bg=null", () => {
    const render = createRenderer({ cols: 30, rows: 8 })

    // No backgroundColor — border cells should have bg=null (transparent)
    const app = render(
      <Box flexDirection="column" width={20} height={5} borderStyle="single" borderColor="white">
        <Text>Content</Text>
      </Box>,
    )

    checkBorder(app, 20, 5, 0, 0, { expectFg: 7, expectBg: null })
  })

  test("border bg=0 survives subtreeDirty-only incremental renders", () => {
    const render = createRenderer({ cols: 40, rows: 10 })

    function App({ count }: { count: number }) {
      return (
        <Box
          flexDirection="column"
          width={20}
          height={5}
          borderStyle="single"
          borderColor="white"
          backgroundColor="black"
          paddingX={1}
        >
          <Text>Count: {count}</Text>
          <Box flexGrow={1} />
          <Text dimColor>Footer</Text>
        </Box>
      )
    }

    const app = render(<App count={0} />)
    for (let i = 1; i <= 5; i++) {
      app.rerender(<App count={i} />)
      checkBorder(app, 20, 5, 0, 0, { expectFg: 7, expectBg: 0 })
    }
  })

  test("border bg with cyan backgroundColor", () => {
    const render = createRenderer({ cols: 30, rows: 8 })

    const app = render(
      <Box flexDirection="column" width={20} height={5} borderStyle="single" borderColor="white" backgroundColor="cyan">
        <Text>Content</Text>
      </Box>,
    )

    // Border cells should have bg=6 (cyan, matching the box's backgroundColor)
    checkBorder(app, 20, 5, 0, 0, { expectFg: 7, expectBg: 6 })
  })
})
