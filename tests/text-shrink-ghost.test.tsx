/**
 * Regression: Ghost characters when Text content shrinks inside a Box with backgroundColor.
 *
 * Bug: km-tui.breadcrumb-ghost — When text content changes to something shorter,
 * the ANSI diff output may miss the cells where old text was, leaving ghost characters
 * on the real terminal.
 */
import { describe, expect, test } from "vitest"
import { Box, Text } from "../src/index.js"
import { createRenderer } from "inkx/testing"
import { outputPhase } from "../src/pipeline/index.js"
import { VirtualTerminal } from "../src/with-diagnostics.js"

describe("Text shrink: no ghost characters in Box with backgroundColor", () => {
  const render = createRenderer({ cols: 80, rows: 3 })

  test("shorter text clears trailing chars (buffer level)", () => {
    // Render with long text first
    const app = render(
      <Box width={80} backgroundColor="white" flexDirection="column">
        <Text wrap="truncate">Alpha Column Path Long Name</Text>
      </Box>,
    )

    expect(app.text).toContain("Alpha Column Path Long Name")

    // Rerender with shorter text
    app.rerender(
      <Box width={80} backgroundColor="white" flexDirection="column">
        <Text wrap="truncate">inbox</Text>
      </Box>,
    )

    const text = app.text
    expect(text).toContain("inbox")
    // No ghost chars from old text
    expect(text).not.toContain("Alpha")
    expect(text).not.toContain("Column")
    expect(text).not.toContain("Path")
  })

  test("ANSI replay: shorter text has no ghost chars from previous frame", () => {
    // Render initial long text
    const app = render(
      <Box width={80} backgroundColor="white" flexDirection="column">
        <Text wrap="truncate">Alpha Column Path Long Name</Text>
      </Box>,
    )

    // Capture the buffer before rerender
    const beforeBuffer = app.lastBuffer()!

    // Rerender with shorter text
    app.rerender(
      <Box width={80} backgroundColor="white" flexDirection="column">
        <Text wrap="truncate">inbox</Text>
      </Box>,
    )

    const afterBuffer = app.lastBuffer()!

    // Verify buffer is correct
    expect(app.text).toContain("inbox")
    expect(app.text).not.toContain("Alpha")

    // Now check ANSI replay: apply the diff to a VT initialized with the before state
    const ansiDiff = outputPhase(beforeBuffer, afterBuffer)
    const vt = new VirtualTerminal(afterBuffer.width, afterBuffer.height)
    vt.loadFromBuffer(beforeBuffer)
    vt.applyAnsi(ansiDiff)

    // Compare the VT result to the expected buffer
    const mismatches = vt.compareToBuffer(afterBuffer)
    if (mismatches.length > 0) {
      const details = mismatches
        .slice(0, 10)
        .map(
          (m: { x: number; y: number; expected: string; actual: string }) =>
            `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`,
        )
        .join("\n")
      throw new Error(`ANSI replay mismatch: ${mismatches.length} cells differ:\n${details}`)
    }
  })

  test("ANSI replay with styled text (bold/dim) shrinking", () => {
    // Simulates the breadcrumb: styled text via term.bold/dim (ANSI codes in string)
    const longText = " \x1b[2m / \x1b[22m\x1b[1mAlpha Column\x1b[22m"
    const shortText = " \x1b[2m / \x1b[22m\x1b[1minbox\x1b[22m"

    const app = render(
      <Box width={80} backgroundColor="white" flexDirection="column">
        <Text wrap="truncate">{longText}</Text>
      </Box>,
    )

    const beforeBuffer = app.lastBuffer()!

    app.rerender(
      <Box width={80} backgroundColor="white" flexDirection="column">
        <Text wrap="truncate">{shortText}</Text>
      </Box>,
    )

    const afterBuffer = app.lastBuffer()!

    // Buffer should be correct
    expect(app.text).toContain("inbox")
    expect(app.text).not.toContain("Alpha")

    // ANSI replay should match
    const ansiDiff = outputPhase(beforeBuffer, afterBuffer)
    const vt = new VirtualTerminal(afterBuffer.width, afterBuffer.height)
    vt.loadFromBuffer(beforeBuffer)
    vt.applyAnsi(ansiDiff)

    const mismatches = vt.compareToBuffer(afterBuffer)
    if (mismatches.length > 0) {
      const details = mismatches
        .slice(0, 10)
        .map(
          (m: { x: number; y: number; expected: string; actual: string }) =>
            `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`,
        )
        .join("\n")
      throw new Error(`ANSI replay mismatch: ${mismatches.length} cells differ:\n${details}`)
    }
  })
})
