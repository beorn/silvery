/**
 * Test: Card shrinking inside scroll container preserves border integrity.
 *
 * Bug km-tui.fold-border-blank: When cards shrink inside overflow="scroll"
 * containers (e.g., outline depth decrease), the bottom border's horizontal
 * dashes can be overwritten with spaces, leaving only corner chars: ╰   ╯
 *
 * Tests both buffer correctness AND ANSI diff replay to catch output-phase
 * bugs where the buffer is correct but the terminal output isn't.
 */
import { describe, expect, test } from "vitest"
import { createRenderer } from "inkx/testing"
import { VirtualTerminal } from "../src/index.js"
import { outputPhase } from "../src/pipeline.js"
import React from "react"

const { Box, Text } = await import("../src/index.js")

/** Verify that every bottom border has continuous horizontal dashes */
function checkBorderIntegrity(text: string, label: string) {
  const rows = text.split("\n")
  const topBorders = rows.filter((r) => r.includes("\u256d") && r.includes("\u256e"))
  const bottomBorders = rows.filter((r) => r.includes("\u2570") && r.includes("\u256f"))
  expect(
    bottomBorders.length,
    `${label}: bottom borders (${bottomBorders.length}) should match top borders (${topBorders.length})`,
  ).toBe(topBorders.length)

  // Check that each bottom border has continuous horizontal dashes
  for (const row of bottomBorders) {
    const leftIdx = row.indexOf("\u2570")
    const rightIdx = row.lastIndexOf("\u256f")
    if (leftIdx >= 0 && rightIdx > leftIdx + 1) {
      const between = row.slice(leftIdx + 1, rightIdx)
      for (let i = 0; i < between.length; i++) {
        expect(
          between[i],
          `${label}: bottom border at col ${leftIdx + 1 + i} should be \u2500 but got "${between[i]}"`,
        ).toBe("\u2500")
      }
    }
  }
}

/** Convert VirtualTerminal grid to text string (row per line) */
function vtermToText(vterm: VirtualTerminal): string {
  const lines: string[] = []
  for (let y = 0; y < vterm.height; y++) {
    let line = ""
    for (let x = 0; x < vterm.width; x++) {
      line += vterm.getChar(x, y)
    }
    lines.push(line)
  }
  return lines.join("\n")
}

/**
 * Verify ANSI diff replay correctness.
 * Renders the initial state fully, then applies the diff to simulate
 * what a real terminal would see.
 */
function verifyDiffReplay(
  prevBuffer: ReturnType<ReturnType<typeof createRenderer>["lastBuffer"]>,
  nextBuffer: ReturnType<ReturnType<typeof createRenderer>["lastBuffer"]>,
  label: string,
) {
  if (!prevBuffer || !nextBuffer) throw new Error("No buffer")

  // Render initial state to a virtual terminal
  const vterm = new VirtualTerminal(prevBuffer.width, prevBuffer.height)
  const fullAnsi = outputPhase(null, prevBuffer)
  vterm.applyAnsi(fullAnsi)

  // Apply the incremental diff
  const diffAnsi = outputPhase(prevBuffer, nextBuffer)
  vterm.applyAnsi(diffAnsi)

  // Compare virtual terminal content with expected buffer
  const mismatches = vterm.compareToBuffer(nextBuffer)
  if (mismatches.length > 0) {
    const details = mismatches
      .slice(0, 20)
      .map((m) => `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`)
      .join("\n")
    throw new Error(`${label}: ANSI diff replay mismatch: ${mismatches.length} cells differ:\n${details}`)
  }
}

describe("scroll container card shrink border integrity", () => {
  function ScrollColumn({ showChildren }: { showChildren: boolean }) {
    return (
      <Box flexDirection="column" width={40} maxHeight={25} overflow="hidden">
        <Box height={1} flexShrink={0}>
          <Text> Column Header</Text>
        </Box>
        <Box flexDirection="column" height={22} overflow="scroll">
          {/* Card A: has children that can be hidden */}
          <Box
            flexDirection="column"
            flexShrink={0}
            width={38}
            borderStyle="round"
            borderColor="yellow"
            paddingRight={1}
          >
            <Text>Card A Title</Text>
            {showChildren && (
              <>
                <Text> child-1</Text>
                <Text> child-2</Text>
                <Text> child-3</Text>
              </>
            )}
          </Box>
          {/* Card B: static card below */}
          <Box
            flexDirection="column"
            flexShrink={0}
            width={38}
            borderStyle="round"
            borderColor="blackBright"
            paddingRight={1}
          >
            <Text>Card B Title</Text>
          </Box>
          {/* Card C: another static card */}
          <Box
            flexDirection="column"
            flexShrink={0}
            width={38}
            borderStyle="round"
            borderColor="blackBright"
            paddingRight={1}
          >
            <Text>Card C Title</Text>
          </Box>
        </Box>
      </Box>
    )
  }

  test("buffer content correct after card shrinks", () => {
    const render = createRenderer({ incremental: true, cols: 50, rows: 25 })
    const app = render(<ScrollColumn showChildren={true} />)

    expect(app.text).toContain("child-1")
    checkBorderIntegrity(app.text, "before shrink")

    app.rerender(<ScrollColumn showChildren={false} />)

    expect(app.text).not.toContain("child-1")
    checkBorderIntegrity(app.text, "after shrink (buffer)")
  })

  test("ANSI diff replay correct after card shrinks", () => {
    const render = createRenderer({ incremental: true, cols: 50, rows: 25 })
    const app = render(<ScrollColumn showChildren={true} />)
    expect(app.text).toContain("child-1")

    const prevBuffer = app.lastBuffer()!.clone()

    app.rerender(<ScrollColumn showChildren={false} />)
    expect(app.text).not.toContain("child-1")

    verifyDiffReplay(prevBuffer, app.lastBuffer(), "after shrink")
  })

  test("ANSI diff produces correct terminal borders after shrink", () => {
    const render = createRenderer({ incremental: true, cols: 50, rows: 25 })
    const app = render(<ScrollColumn showChildren={true} />)

    const prevBuffer = app.lastBuffer()!.clone()
    app.rerender(<ScrollColumn showChildren={false} />)
    const nextBuffer = app.lastBuffer()!

    // Build terminal state via full render + diff
    const vterm = new VirtualTerminal(prevBuffer.width, prevBuffer.height)
    vterm.applyAnsi(outputPhase(null, prevBuffer))
    vterm.applyAnsi(outputPhase(prevBuffer, nextBuffer))

    // Check border integrity on what the terminal actually shows
    const terminalText = vtermToText(vterm)
    checkBorderIntegrity(terminalText, "terminal after diff")
  })

  function MultiCard({ depth }: { depth: number }) {
    return (
      <Box flexDirection="column" width={40} maxHeight={30} overflow="hidden">
        <Box height={1} flexShrink={0}>
          <Text> Column</Text>
        </Box>
        <Box flexDirection="column" height={27} overflow="scroll">
          {["CardA", "CardB", "CardC"].map((name, i) => (
            <Box
              key={name}
              flexDirection="column"
              flexShrink={0}
              width={38}
              borderStyle="round"
              borderColor={i === 0 ? "yellow" : "blackBright"}
              paddingRight={1}
            >
              <Text>{name}</Text>
              {depth >= 1 && <Text> level-1-child</Text>}
              {depth >= 2 && <Text> level-2-child</Text>}
            </Box>
          ))}
        </Box>
      </Box>
    )
  }

  test("multiple cards shrinking with ANSI diff replay", () => {
    const render = createRenderer({ incremental: true, cols: 50, rows: 30 })
    const app = render(<MultiCard depth={2} />)

    checkBorderIntegrity(app.text, "depth=2")

    // Decrease 2 -> 1
    let prevBuf = app.lastBuffer()!.clone()
    app.rerender(<MultiCard depth={1} />)
    checkBorderIntegrity(app.text, "depth=1 buffer")
    verifyDiffReplay(prevBuf, app.lastBuffer(), "depth=1")

    // Decrease 1 -> 0
    prevBuf = app.lastBuffer()!.clone()
    app.rerender(<MultiCard depth={0} />)
    checkBorderIntegrity(app.text, "depth=0 buffer")
    verifyDiffReplay(prevBuf, app.lastBuffer(), "depth=0")

    // Increase 0 -> 2
    prevBuf = app.lastBuffer()!.clone()
    app.rerender(<MultiCard depth={2} />)
    checkBorderIntegrity(app.text, "depth=2 restored buffer")
    verifyDiffReplay(prevBuf, app.lastBuffer(), "depth=2 restored")
  })

  test("step-by-step depth decrease terminal border check", () => {
    const render = createRenderer({ incremental: true, cols: 50, rows: 30 })
    const app = render(<MultiCard depth={2} />)

    for (let d = 1; d >= 0; d--) {
      const prevBuf = app.lastBuffer()!.clone()
      app.rerender(<MultiCard depth={d} />)

      checkBorderIntegrity(app.text, `depth=${d} buffer`)

      const vterm = new VirtualTerminal(prevBuf.width, prevBuf.height)
      vterm.applyAnsi(outputPhase(null, prevBuf))
      vterm.applyAnsi(outputPhase(prevBuf, app.lastBuffer()!))
      checkBorderIntegrity(vtermToText(vterm), `depth=${d} terminal`)
    }
  })
})
